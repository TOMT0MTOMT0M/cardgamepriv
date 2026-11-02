import { v, ConvexError } from 'convex/values';
import { internalAction, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { getUserByToken, requireUser } from './auth';
import { RARITY_LABEL, RARITY_TIER, packKindValidator, rarityValidator, type RarityId } from './cardsCatalog';
import { isValidPackRequest, rollPack, type PackRequest } from '../src/core/packRoll';
import { artPath, bebouOddsLabel, catalogEntry, hasArt, subthemeById, themeById, BEBOU_PACK } from '../src/core/sets/themes';
import { applyRegen, fmtCountdown } from '../src/core/packRegen';
import { bumpMissions } from './missions';
import { pityAfter, pityForces } from '../src/core/pity';

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
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return null;

    return await ctx.db
      .query('packOpens')
      .withIndex('by_user_status', (q) => q.eq('userId', user._id).eq('status', 'sealed'))
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
export const preparePack = mutation({
  args: {
    sessionToken: v.string(),
    /** 'theme' = booster d'un des 4 thèmes (themeId : gaming | pop | sport | monde) · 'bebou' = bébou pack. Absent = bébou pack. */
    packKind: v.optional(packKindValidator),
    themeId: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, packKind, themeId }) => {
    const user = await requireUser(ctx, sessionToken);

    const existingSealed = await ctx.db
      .query('packOpens')
      .withIndex('by_user_status', (q) => q.eq('userId', user._id).eq('status', 'sealed'))
      .first();

    if (existingSealed) {
      return existingSealed;
    }

    // anciens identifiants (« pokemon ») ramenés à leur thème (« gaming »)
    const req: PackRequest = { kind: packKind ?? 'bebou', themeId: packKind === 'theme' ? themeById(themeId ?? '')?.id ?? themeId : undefined };
    // pity : 200 boosters secs → celui-ci contient une Mythique (src/core/pity.ts)
    const pity = user.pityCount ?? 0;
    req.forceMythic = pityForces(pity);
    if (!isValidPackRequest(req)) {
      throw new ConvexError('Ce booster n’existe pas.');
    }

    // recharge accumulée depuis la dernière fois (1 booster / 5 min, 15 max), puis on dépense
    const now = Date.now();
    const regen = applyRegen(user.packBalance, user.packRegenAt ?? user.lastSeenAt, now);
    if (regen.balance <= 0) {
      throw new ConvexError(`Plus de boosters ! Le prochain arrive dans ${fmtCountdown((regen.nextAt ?? now) - now)}.`);
    }

    await ctx.db.patch(user._id, {
      packBalance: regen.balance - 1,
      packRegenAt: regen.regenAt,
      lastSeenAt: now,
      statusText: `Ouvre un ${req.kind === 'bebou' ? BEBOU_PACK.booster : `booster ${themeById(req.themeId!)!.booster}`}…`,
    });

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
    for (const { card, rarity } of rollPack(req, secureRandomFloat)) {
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
    });

    return (await ctx.db.get(packId))!;
  },
});

/**
 * Step 2:
 * Called when the 3D reveal sequence finishes on the client.
 * - Marks the pack as "revealed"
 * - Adds all 5 cards to the player's inventory (019-binder)
 * - Broadcasts Rare/Epic/Legendary/Mythic pulls to the live activityFeed (and Discord webhook)
 */
export const revealPack = mutation({
  args: {
    sessionToken: v.string(),
    packId: v.id('packOpens'),
  },
  handler: async (ctx, { sessionToken, packId }) => {
    const user = await requireUser(ctx, sessionToken);
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
      statusText: 'Contemple son tirage',
    });

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
        });

        // Discord : uniquement avant-dernier tier (Mythique 6★) et dernier tier (Secrète Bébou ✷)
        if (tier >= RARITY_TIER.mythic) {
          await ctx.scheduler.runAfter(0, internal.packs.notifyDiscordPull, {
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            cardId: c.cardId,
            cardName: c.cardName,
            rarity: c.rarity,
            mintNumber: c.mintNumber,
            isNew: c.isNew,
          });
        }
      }
    }

    // missions du jour (ouvrir, raretés, nouvelles cartes, doublons…)
    await bumpMissions(ctx, user, {
      type: 'pack',
      packKey: pack.packKind === 'theme' && pack.themeId ? pack.themeId : 'bebou',
      cards: pack.cards.map((c) => ({ cardId: c.cardId, rarity: c.rarity, isNew: c.isNew })),
    });

    return (await ctx.db.get(pack._id))!;
  },
});

const PUBLIC_SITE_URL = 'https://main.cardgamepriv.pages.dev';

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
