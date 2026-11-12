import { payReferrer } from './referrals';
import { v, ConvexError } from 'convex/values';
import { internalAction, mutation, query, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { scheduleReserveFull } from './push';
import { RARITY_LABEL, RARITY_TIER, packKindValidator, rarityValidator, type RarityId } from './cardsCatalog';
import { isValidPackRequest, rollPackEx, type PackRequest } from '../src/core/packRoll';
import { artPath, bebouOddsLabel, catalogEntry, hasArt, subthemeById, themeById, BEBOU_PACK } from '../src/core/sets/themes';
import { applyRegen, fmtCountdown } from '../src/core/packRegen';
import { bumpMissions } from './missions';
import { pityAfter, pityForces } from '../src/core/pity';
import { rollPackCoins } from '../src/core/economy';
import { addCoins, bumpWeekly } from './econLib';
import { queueDropShot } from './dropShots';
import { liveEventOrThrow } from './events';
import { bumpChallenges } from './challenges';
import { invRev } from './invRev';
import { syncPresence } from './presence';

function secureRandomFloat(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / (0xffffffff + 1);
}

function secureRandomSeed(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return (arr[0] % 900000) + 100000;
}

/**
 * Returns the player's currently staged ("sealed") pack if one is already prepared.
 */
export const getSealedPack = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const userId = await getUserIdByToken(ctx, sessionToken);
    if (!userId) return null;

    return await ctx.db
      .query('packOpens')
      .withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'sealed'))
      .first();
  },
});

/**
 * Step 1 (0ms GPU Latency Pattern):
 * Called as soon as a booster enters the 3D stage (BEFORE the tear gesture).
 * - If the player already has an unrevealed "sealed" pack, returns it immediately (anti-reroll).
 * - Otherwise deducts 1 pack from packBalance, rolls 5 cards server-side with crypto RNG,
 *   assigns sequential mint numbers (#1, #2...), computes maxRarity for 003-rarity-leak,
 *   and returns the sealed pack to the client so all 3D shaders run with 0 network wait.
 */
/**
 * Prépare (scelle) UN booster pour `user` — cœur de `preparePack` et de `preparePacks`. Débite la réserve, tire les cartes,
 * attribue les n° d'impression, avance le pity. `allowExisting` : rend le booster déjà scellé s'il y en a un (anti-reroll).
 */
async function prepareOne(ctx: MutationCtx, user: Doc<'users'>, packKind: 'theme' | 'bebou' | undefined, themeId: string | undefined, allowExisting = true, eventId?: Id<'packEvents'>) {

  const existingSealed = await ctx.db
    .query('packOpens')
    .withIndex('by_user_status', (q) => q.eq('userId', user._id).eq('status', 'sealed'))
    .first();

  if (allowExisting && existingSealed) {
    return existingSealed;
  }

  // (11/11) booster du moment : seulement pendant l'événement, pool relu en base (convex/events.ts, src/core/events.ts)
  const ev = eventId ? await liveEventOrThrow(ctx, eventId) : null;
  // anciens identifiants (« pokemon ») ramenés à leur thème (« gaming »)
  const req: PackRequest = ev
    ? { kind: 'theme', event: { id: ev._id, subthemes: ev.subthemes, cards: ev.cards } }
    : { kind: packKind ?? 'bebou', themeId: packKind === 'theme' ? themeById(themeId ?? '')?.id ?? themeId : undefined };
  // pity : 200 boosters secs → celui-ci contient une Mythique (src/core/pity.ts)
  const pity = user.pityCount ?? 0;
  req.forceMythic = pityForces(pity);
  if (!isValidPackRequest(req)) {
    throw new ConvexError('Ce booster n’existe pas.');
  }

  // recharge accumulée depuis la dernière fois (1 booster / 5 min, 15 max), puis on dépense
  const now = Date.now();
  const regen = applyRegen(user.packBalance, user.packRegenAt ?? user.lastSeenAt, now, user.regenBoostUntil);
  if (regen.balance <= 0) {
    throw new ConvexError(`Plus de boosters ! Le prochain arrive dans ${fmtCountdown((regen.nextAt ?? now) - now)}.`);
  }

  await ctx.db.patch(user._id, {
    packBalance: regen.balance - 1,
    packRegenAt: regen.regenAt,
    lastSeenAt: now,
    statusText: `Ouvre un ${ev ? `booster ${ev.name}` : req.kind === 'bebou' ? BEBOU_PACK.booster : `booster ${themeById(req.themeId!)!.booster}`}…`,
  });
  await syncPresence(ctx, user._id);
  await scheduleReserveFull(ctx, user._id);

  const rolledCards: Array<{
    cardId: string;
    cardName: string;
    rarity: RarityId;
    foilSeed: number;
    mintNumber: number;
    isNew: boolean;
    themeId: string;
    subthemeId: string;
  }> = [];

  let maxRarity: RarityId = 'common';
  const seenInThisPack = new Set<string>();

  // tirage partagé avec le client (étoiles, pool du booster, 0,1 % de Bébou par bébou pack)
  const rolled = rollPackEx(req, secureRandomFloat);
  for (const { card, rarity } of rolled.slots) {
    if (RARITY_TIER[rarity] > RARITY_TIER[maxRarity]) {
      maxRarity = rarity;
    }

    // Allocate global sequential serial number (#1, #2, #3...)
    const mintDoc = await ctx.db
      .query('cardMints')
      .withIndex('by_card_rarity', (q) => q.eq('cardId', card.id).eq('rarity', rarity))
      .unique();

    const mintNumber = (mintDoc?.lastMintNumber ?? 0) + 1;
    if (mintDoc) {
      await ctx.db.patch(mintDoc._id, { lastMintNumber: mintNumber });
    } else {
      await ctx.db.insert('cardMints', {
        cardId: card.id,
        rarity,
        lastMintNumber: mintNumber,
      });
    }

    // Check if player already owns this (cardId, rarity)
    const existingInv = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) =>
        q.eq('userId', user._id).eq('cardId', card.id).eq('rarity', rarity),
      )
      .unique();

    const key = `${card.id}:${rarity}`;
    const isNew = !existingInv && !seenInThisPack.has(key);
    seenInThisPack.add(key);

    rolledCards.push({
      cardId: card.id,
      cardName: card.name,
      rarity,
      foilSeed: secureRandomSeed(),
      mintNumber,
      isNew,
      themeId: card.themeId,
      subthemeId: card.subthemeId,
    });
  }

  await ctx.db.patch(user._id, { pityCount: pityAfter(pity, rolledCards.map((c) => c.rarity)) });

  const packId = await ctx.db.insert('packOpens', {
    userId: user._id,
    status: 'sealed',
    maxRarity,
    cards: rolledCards,
    createdAt: now,
    packKind: req.kind,
    themeId: req.themeId,
    // pièces d'ouverture (spec économie) : tirées ici avec le booster, créditées au dévoilement
    coins: rollPackCoins(req.kind, secureRandomFloat),
    ...(rolled.god ? { god: true } : {}),
    ...(ev ? { eventId: ev._id, eventName: ev.name } : {}),
  });

  return (await ctx.db.get(packId))!;
}

export const preparePack = mutation({
  args: {
    sessionToken: v.string(),
    /** 'theme' = booster d'un des 4 thèmes (themeId : gaming | pop | sport | monde) · 'bebou' = bébou pack. Absent = bébou pack. */
    packKind: v.optional(packKindValidator),
    themeId: v.optional(v.string()),
    /** (11/11) booster du moment : l'événement en cours (src/core/events.ts) — packKind / themeId ignorés */
    eventId: v.optional(v.id('packEvents')),
  },
  handler: async (ctx, { sessionToken, packKind, themeId, eventId }) => {
    const user = await requireUser(ctx, sessionToken);
    return await prepareOne(ctx, user, packKind, themeId, true, eventId);
  },
});

/**
 * Step 2:
 * Called when the 3D reveal sequence finishes on the client.
 * - Marks the pack as "revealed"
 * - Adds all 5 cards to the player's inventory (019-binder)
 * - Broadcasts Rare/Epic/Legendary/Mythic pulls to the live activityFeed (and Discord webhook)
 */
/**
 * Crédite UN booster scellé de `user` (cœur de `revealPack` et de `revealPacks`) : inventaire, fil en direct, Discord,
 * pièces, missions. Idempotent : un booster déjà révélé est simplement renvoyé.
 */
async function revealOne(ctx: MutationCtx, user: Doc<'users'>, packId: Id<'packOpens'>) {
  const pack = await ctx.db.get(packId);

  if (!pack || pack.userId !== user._id) {
    throw new ConvexError('Booster introuvable.');
  }
  if (pack.status === 'revealed') {
    return pack;
  }

  const now = Date.now();
  await ctx.db.patch(pack._id, {
    status: 'revealed',
    revealedAt: now,
  });

  await ctx.db.patch(user._id, {
    totalPacksOpened: user.totalPacksOpened + 1,
    lastSeenAt: now,
    statusText: pack.god ? 'Vient d’ouvrir un GOD PACK' : 'Contemple son tirage',
  });
  await syncPresence(ctx, user._id);
  if (pack.god)
    await ctx.db.insert('activityFeed', {
      userId: user._id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      kind: 'pull',
      message: `✦ ${user.displayName} a ouvert un GOD PACK ! (1 booster sur 1 000)`,
      createdAt: now,
    });
  // parrainage (retours live 02, §10) : au 10e booster du filleul, 10 boosters pour son parrain
  await payReferrer(ctx, user._id);

  for (const c of pack.cards) {
    const existing = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) =>
        q.eq('userId', user._id).eq('cardId', c.cardId).eq('rarity', c.rarity),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
        bestMintNumber: Math.min(existing.bestMintNumber, c.mintNumber),
        lastPulledAt: now,
        rev: invRev(),
      });
    } else {
      await ctx.db.insert('inventory', {
        userId: user._id,
        cardId: c.cardId,
        rarity: c.rarity,
        count: 1,
        bestMintNumber: c.mintNumber,
        foilSeed: c.foilSeed,
        firstPulledAt: now,
        lastPulledAt: now,
        rev: invRev(),
      });
    }

    // Fil en direct : épique et mieux, ou n°1 d'une rare et mieux (pas tous les n°1 : au début, chaque carte en a un)
    const tier = RARITY_TIER[c.rarity];
    if (tier >= RARITY_TIER.epic || (c.mintNumber === 1 && tier >= RARITY_TIER.rare)) {
      const label = RARITY_LABEL[c.rarity];
      const kind = c.rarity === 'secret' ? 'secret_pull' : c.rarity === 'mythic' ? 'mythic_pull' : 'pull';
      const msg =
        c.rarity === 'secret'
          ? `✷ ${user.displayName} a tiré une CARTE SECRÈTE : ${c.cardName} ! (${bebouOddsLabel().replace(/^1 /, '1 chance ')})`
          : `${user.displayName} a obtenu ${c.cardName} [${label} #${c.mintNumber}] !`;

      await ctx.db.insert('activityFeed', {
        userId: user._id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        kind,
        cardId: c.cardId,
        cardName: c.cardName,
        rarity: c.rarity,
        mintNumber: c.mintNumber,
        message: msg,
        createdAt: now,
        ...(tier >= RARITY_TIER.legendary ? { big: true } : {}),
      });

      // Discord : uniquement avant-dernier tier (Mythique 6★) et dernier tier (Secrète Bébou ✷)
      if (tier >= RARITY_TIER.mythic) {
        // (V2, 08/11) la carte elle-même, de face, avec le nom du joueur au-dessus : le jeu envoie l'image (dropShots.ts)
        await queueDropShot(ctx, user, c);
      }
    }
  }

  // pièces d'ouverture + missions de la semaine (src/core/economy.ts, src/core/weekly.ts)
  if (pack.coins) await addCoins(ctx, user._id, pack.coins, 'pack', `Ouverture — ${pack.eventName ? `Booster ${pack.eventName}` : pack.packKind === 'theme' && pack.themeId ? themeById(pack.themeId)?.label ?? 'booster' : BEBOU_PACK.label}`, { earned: true });
  await bumpWeekly(ctx, user._id, { type: 'pack', cards: pack.cards.map((c) => ({ rarity: c.rarity, isNew: c.isNew })) });

  // missions du jour (ouvrir, raretés, nouvelles cartes, doublons…)
  await bumpMissions(ctx, user, {
    type: 'pack',
    // (booster du moment : clé à part, il ne compte pas pour « ouvre un Bebou Pack »)
    packKey: pack.eventId ? 'event' : pack.packKind === 'theme' && pack.themeId ? pack.themeId : 'bebou',
    cards: pack.cards.map((c) => ({ cardId: c.cardId, rarity: c.rarity, isNew: c.isNew })),
  });
  // défis entre amis en cours (convex/challenges.ts) : seulement les boosters scellés après le départ du défi
  await bumpChallenges(ctx, user._id, pack.createdAt, pack.cards.map((c) => ({ rarity: c.rarity, isNew: c.isNew })));

  return (await ctx.db.get(pack._id))!;
}

export const revealPack = mutation({
  args: {
    sessionToken: v.string(),
    packId: v.id('packOpens'),
  },
  handler: async (ctx, { sessionToken, packId }) => {
    const user = await requireUser(ctx, sessionToken);
    return await revealOne(ctx, user, packId);
  },
});

/**
 * OUVERTURE EN SÉRIE INSTANTANÉE (retours de Tom, 4 nov. : « quand j'ouvre plusieurs boosters d'un coup ou que je passe
 * tout, il y a un temps d'attente »). Avant : chaque booster de la série = 2 allers-retours réseau (préparer puis
 * créditer), à la suite, et les cartes du booster suivant n'étaient connues qu'à la fin du précédent.
 * `preparePacks` scelle toute la série d'un coup (les boosters déjà scellés d'abord, dans l'ordre — anti-reroll) : le
 * client connaît tout de suite les cartes de chaque booster et prépare le suivant pendant qu'on regarde le courant.
 * Chacun n'est toujours CRÉDITÉ (fil, Discord, inventaire) qu'une fois montré ; « Tout passer » les crédite tous en un
 * seul appel (`revealPacks`). Réserve insuffisante : on scelle ce qu'on peut (au moins 1, sinon l'erreur habituelle).
 */
export const preparePacks = mutation({
  args: {
    sessionToken: v.string(),
    packKind: v.optional(packKindValidator),
    themeId: v.optional(v.string()),
    eventId: v.optional(v.id('packEvents')),
    count: v.number(),
  },
  handler: async (ctx, { sessionToken, packKind, themeId, eventId, count }) => {
    let user = await requireUser(ctx, sessionToken);
    const n = Math.max(1, Math.min(10, Math.floor(count)));
    const out = (await ctx.db.query('packOpens').withIndex('by_user_status', (q) => q.eq('userId', user._id).eq('status', 'sealed')).take(n)) as Doc<'packOpens'>[];
    while (out.length < n) {
      try {
        out.push(await prepareOne(ctx, user, packKind, themeId, false, eventId));
      } catch (e) {
        if (!out.length) throw e;
        break; // réserve épuisée en cours de série : on garde ce qui est scellé
      }
      user = (await ctx.db.get(user._id))!;
    }
    return out;
  },
});

/** Crédite plusieurs boosters scellés en un seul appel (« Tout passer »). Renvoie les ids crédités. */
export const revealPacks = mutation({
  args: { sessionToken: v.string(), packIds: v.array(v.id('packOpens')) },
  handler: async (ctx, { sessionToken, packIds }) => {
    let user = await requireUser(ctx, sessionToken);
    const done: string[] = [];
    for (const id of packIds.slice(0, 12)) {
      const p = await revealOne(ctx, user, id);
      done.push(p._id);
      user = (await ctx.db.get(user._id))!;
    }
    return done;
  },
});

// (07/11) même adresse que le bot (discordBot.ts) : « main. » était un ancien déploiement figé (illustrations récentes absentes)
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL ?? 'https://cardgamepriv.pages.dev').trim().replace(/\/+$/, '');

/** Ancien format (fiche embed) : remplacé par dropShots.ts le 08/11, gardé pour les envois déjà programmés. */
export const notifyDiscordPull = internalAction({
  args: {
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    cardId: v.string(),
    cardName: v.string(),
    rarity: rarityValidator,
    mintNumber: v.number(),
    isNew: v.optional(v.boolean()),
  },
  handler: async (_ctx, { displayName, avatarUrl, cardId, cardName, rarity, mintNumber, isNew }) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const entry = catalogEntry(cardId);
    const theme = entry ? themeById(entry.themeId) : undefined;
    const subtheme = entry ? subthemeById(entry.subthemeId) : undefined;
    // (carte Jeux vidéo sans illustration : pas de vignette dans le message Discord)
    const imageUrl = entry && hasArt(entry) ? `${PUBLIC_SITE_URL}/${artPath(entry)}` : undefined;
    const isSecret = rarity === 'secret';
    const isMerveille = isSecret && entry?.subthemeId === 'merveilles';

    const embed = {
      color: isSecret ? (isMerveille ? 0xf5a623 : 0xe8927c) : 0xf1ece2,
      author: {
        name: displayName,
        ...(avatarUrl ? { icon_url: avatarUrl } : {}),
      },
      title: isSecret
        ? (isMerveille ? `✷ MERVEILLE DU MONDE — ${cardName}` : `✷ CARTE SECRÈTE — ${cardName}`)
        : `✺ TIRAGE MYTHIQUE (6★) — ${cardName}`,
      description: isSecret
        ? (isMerveille
            ? `**${displayName}** vient de découvrir la Merveille du Monde secrète **${cardName}** (3D Diorama) !`
            : `**${displayName}** vient de tirer la carte secrète **${cardName}** — *un de nous* (${bebouOddsLabel().replace(/^1 /, '1 chance ')}) !`)
        : `**${displayName}** vient de faire tomber **${cardName}** en **Mythique (★★★★★★)** !`,
      fields: [
        {
          name: 'Série (Mint)',
          value: `**#${mintNumber}**`,
          inline: true,
        },
        {
          name: 'Rareté',
          value: isSecret ? (isMerveille ? '✷ Secrète (Merveille du Monde)' : '✷ Secrète (Les Bébous)') : `✺ ${RARITY_LABEL[rarity]} (6★)`,
          inline: true,
        },
        ...(theme && entry
          ? [
              {
                name: 'Collection',
                value: `${subtheme && subtheme.id !== theme.id ? `${subtheme.label} · ${theme.label}` : theme.label} · #${String(entry.num).padStart(3, '0')}${isNew ? ' (✨ Nouvelle !)' : ''}`,
                inline: true,
              },
            ]
          : []),
      ],
      ...(imageUrl ? { thumbnail: { url: imageUrl } } : {}),
      timestamp: new Date().toISOString(),
    };

    const payload = {
      username: 'Bébou Drop Bot 🃏',
      content: isSecret
        ? `✷✷✷ **ALERTE CARTE SECRÈTE !** **${displayName}** a tiré **${cardName}** (#${mintNumber}) !`
        : `✺ **DROP MYTHIQUE 6★ !** **${displayName}** a tiré **${cardName}** (#${mintNumber}) !`,
      embeds: [embed],
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn('[discord-webhook] failed:', e);
    }
  },
});
