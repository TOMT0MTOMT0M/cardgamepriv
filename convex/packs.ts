import { fe } from '../src/core/errors';
import { packCapOf } from '../src/core/abo';
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
import { pushBigPull } from './feed';
import { pityAfter, pityForces } from '../src/core/pity';
import { EVENT_PACK_PRICE, rollPackCoins } from '../src/core/economy';
import { addCoins, addForgeCoins, bumpWeekly } from './econLib';
import { queueDropShot } from './dropShots';
import { liveEventOrThrow } from './events';
import { eventCapOf, eventRegen, fmtLeft } from '../src/core/events';
import { bumpChallenges } from './challenges';
import { invRev } from './invRev';
import { syncPresence } from './presence';
import { patchLive } from './liveUser';
import { fm, feedMsg } from '../src/core/msgs';

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

/** Sorte d'un booster : `b` (Bebou Pack), `t:<thème>`, `e:<événement>` — un booster scellé d'avance PAR sorte. */
type PackSort = { packKind?: 'theme' | 'bebou'; themeId?: string; eventId?: Id<'packEvents'> };
const sortKey = (p: PackSort) => (p.eventId ? `e:${p.eventId}` : (p.packKind ?? 'bebou') === 'theme' ? `t:${p.themeId ?? ''}` : 'b');
/** boosters scellés du joueur (en pratique 0 à 3 : un d'avance par sorte ouverte, plus un éventuel booster abandonné) */
const sealedOf = (ctx: MutationCtx, userId: Id<'users'>) =>
  ctx.db.query('packOpens').withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'sealed')).take(12);

/** (V3, packs événement) réserve d'événement du joueur pour `ev`, recharge comprise (src/core/events.ts) */
const evReserve = (user: Doc<'users'>, ev: Doc<'packEvents'>, now: number) =>
  eventRegen(user.ev, { id: ev._id, startAt: ev.startAt, endAt: ev.endAt }, now, eventCapOf(user, now));
/** réserve normale, recharge comprise ; `free` = ce qui n'est pas déjà réservé par un booster scellé d'avance */
function normalReserve(user: Doc<'users'>, now: number) {
  const r = applyRegen(user.packBalance, user.packRegenAt ?? user.lastSeenAt, now, user.regenBoostUntil, packCapOf(user, now));
  return { ...r, free: r.balance - Math.max(0, user.packAhead ?? 0) };
}

/**
 * Returns the player's currently staged ("sealed") pack if one is already prepared.
 * (V3) Gardé pour les vieux onglets ; le nouveau client lit `sealedMine` une fois au démarrage (pas d'abonnement).
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
 * (V3, piste Convex 9) Boosters scellés du joueur (abandonnés et scellés d'avance), lus UNE fois au démarrage du client
 * (`client.query`, pas d'abonnement : `getSealedPack` se relançait deux fois par booster).
 */
export const sealedMine = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const userId = await getUserIdByToken(ctx, sessionToken);
    if (!userId) return [];
    return await ctx.db.query('packOpens').withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'sealed')).take(12);
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
/** (version anglaise, lot 4) nom anglais de l'événement, pour le journal des pièces dans la langue du joueur */
async function eventEn(ctx: MutationCtx, id: Id<'packEvents'> | undefined): Promise<Record<string, string>> {
  const e = id ? await ctx.db.get(id) : null;
  return e?.nameEn ? { eventEn: e.nameEn } : {};
}

/**
 * (26/11, coût) `user` = copie du joueur tenue à jour (convex/liveUser.ts) : écrite par `patchLive`, jamais relue.
 * `tail` : présence et rappel « réserve pleine » tout de suite ; une série (`preparePacks`) les pose une fois à la fin
 * (même résultat : seul le dernier état compte).
 */
/**
 * (V3) `lookup` : chercher d'abord un booster déjà scellé (preparePack) — une série le fait une fois avant sa boucle, un
 * scellé d'avance s'en passe. `ahead` : (piste Convex 9) booster scellé d'avance par `openPack` — RÉSERVÉ (compté dans
 * `packAhead` / `ev.ahead`), débité seulement à son ouverture (revealOne), sans statut « Ouvre un… » ; il garde le pity
 * affiché d'avant lui (`pityHold`).
 */
type PrepOpts = { lookup?: boolean; tail?: boolean; ahead?: boolean };
async function prepareOne(ctx: MutationCtx, user: Doc<'users'>, packKind: 'theme' | 'bebou' | undefined, themeId: string | undefined, eventId: Id<'packEvents'> | undefined, opts: PrepOpts = {}): Promise<Doc<'packOpens'>> {
  const { lookup = true, tail = true, ahead = false } = opts;
  const want = sortKey(eventId ? { eventId } : { packKind: packKind ?? 'bebou', themeId: packKind === 'theme' ? themeById(themeId ?? '')?.id ?? themeId : undefined });

  // (V3, piste 9) un booster scellé d'avance PAR SORTE : celui de la sorte demandée d'abord ; puis un booster abandonné
  // en cours d'ouverture (n'importe quelle sorte, rouvert d'abord comme avant — anti-reroll), ou d'avance d'un
  // événement fini (« un booster tiré pendant l'événement reste ouvrable après la fin »)
  const sealed = lookup ? await sealedOf(ctx, user._id) : [];
  const same = sealed.find((p) => sortKey(p) === want);
  if (same) return same;
  for (const p of sealed) {
    if (!p.ahead) return p;
    if (p.eventId) {
      const e = await ctx.db.get(p.eventId);
      if (!e || Date.now() >= e.endAt) return p;
    }
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
  // (20/11) god pack offert en attente (case 24 de l'Avent, convex/avent.ts) : ce booster en est un — (26/11, coût)
  // lu sur la copie tenue à jour (convex/liveUser.ts) : dans une série, `user` suit déjà chaque booster
  const godLeft = user.godPacks ?? 0;
  if (godLeft > 0) req.forceGod = true;
  if (!isValidPackRequest(req)) {
    throw new ConvexError(fe('packs.1'));
  }

  // recharge accumulée depuis la dernière fois (1 booster / 5 min, 15 max), puis on dépense — (V3) un booster
  // d'événement dépense SA réserve (1 / h, 3 max, 5 pour un abonné), plus la réserve normale
  const now = Date.now();
  let reserve: Partial<Doc<'users'>>;
  if (ev) {
    const r = evReserve(user, ev, now);
    if (r.balance - r.ahead <= 0) throw new ConvexError(r.nextAt ? fe('packs.4', { p0: ev.name, p1: fmtLeft(r.nextAt - now) }) : fe('packs.5', { p0: ev.name }));
    reserve = { ev: { id: ev._id, n: ahead ? r.balance : r.balance - 1, at: r.regenAt, ahead: r.ahead + (ahead ? 1 : 0) } };
  } else {
    const r = normalReserve(user, now);
    if (r.free <= 0) {
      // tout ce qui reste est déjà scellé d'avance (une autre sorte) : c'est lui qui s'ouvre
      const other = sealed.find((p) => p.ahead && !p.eventId);
      if (other) return other;
      throw new ConvexError(fe('packs.2', { p0: fmtCountdown((r.nextAt ?? now) - now) }));
    }
    reserve = ahead ? { packAhead: Math.max(0, user.packAhead ?? 0) + 1 } : { packBalance: r.balance - 1, packRegenAt: r.regenAt };
  }

  await patchLive(ctx, user, {
    ...reserve,
    lastSeenAt: now,
    ...(godLeft > 0 ? { godPacks: godLeft - 1 } : {}),
    ...(ahead ? {} : { statusText: `Ouvre un ${ev ? `booster ${ev.name}` : req.kind === 'bebou' ? BEBOU_PACK.booster : `booster ${themeById(req.themeId!)!.booster}`}…` }),
  });
  if (tail) await prepareTail(ctx, user);

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

  const pityNext = pityAfter(pity, rolledCards.map((c) => c.rarity));
  // (piste 9) d'avance : le compteur affiché reste celui d'avant ce booster jusqu'à son ouverture (users.ts, meView)
  await patchLive(ctx, user, { pityCount: pityNext, ...(ahead ? { pityHold: { raw: pityNext, shown: user.pityHold?.raw === pity ? user.pityHold.shown : pity } } : {}) });

  const doc = {
    userId: user._id,
    status: 'sealed' as const,
    maxRarity,
    cards: rolledCards,
    createdAt: now,
    packKind: req.kind,
    themeId: req.themeId,
    // pièces d'ouverture (spec économie) : tirées ici avec le booster, créditées au dévoilement
    coins: rollPackCoins(req.kind, secureRandomFloat),
    ...(rolled.god ? { god: true } : {}),
    ...(ev ? { eventId: ev._id, eventName: ev.name } : {}),
    ...(ahead ? { ahead: true } : {}),
  };
  const packId = await ctx.db.insert('packOpens', doc);

  // (V3, coût) le booster tel qu'écrit, sans le relire
  return { _id: packId, _creationTime: now, ...doc };
}

/** présence (statut « Ouvre un booster… » vu des autres) et rappel « réserve pleine », sur la copie à jour du joueur */
async function prepareTail(ctx: MutationCtx, user: Doc<'users'>) {
  await syncPresence(ctx, user._id, 0, user);
  await scheduleReserveFull(ctx, user._id, user);
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
    const user = { ...(await requireUser(ctx, sessionToken)) };
    return await prepareOne(ctx, user, packKind, themeId, eventId);
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
/**
 * (26/11, coût) `user` = copie du joueur tenue à jour (convex/liveUser.ts), jamais relue ; `tail` : présence tout de
 * suite (une série la pose une fois à la fin). `credited` : ce booster vient d'être crédité (pas déjà révélé).
 */
async function revealOne(ctx: MutationCtx, user: Doc<'users'>, packId: Id<'packOpens'>, tail = true): Promise<{ pack: Doc<'packOpens'>; credited: boolean; debited: boolean }> {
  const pack = await ctx.db.get(packId);

  if (!pack || pack.userId !== user._id) {
    throw new ConvexError(fe('packs.3'));
  }
  if (pack.status === 'revealed') {
    return { pack, credited: false, debited: false };
  }

  const now = Date.now();
  const revealed = { status: 'revealed', revealedAt: now } as const;
  await ctx.db.patch(pack._id, revealed);

  // (V3, piste Convex 9) booster scellé d'avance : il était réservé, il est débité maintenant (recharge appliquée
  // d'abord, comme au scellage d'un booster ordinaire) ; le pity affiché le rattrape
  let debited = false;
  if (pack.ahead) {
    if (pack.eventId) {
      const st = user.ev;
      if (st && st.id === pack.eventId) {
        const e = await ctx.db.get(pack.eventId);
        const r = e ? evReserve(user, e, now) : { balance: st.n, regenAt: st.at, ahead: st.ahead ?? 0 };
        await patchLive(ctx, user, { ev: { id: st.id, n: Math.max(0, r.balance - 1), at: r.regenAt, ahead: Math.max(0, r.ahead - 1) } });
      }
    } else {
      const r = normalReserve(user, now);
      await patchLive(ctx, user, { packBalance: Math.max(0, r.balance - 1), packRegenAt: r.regenAt, packAhead: Math.max(0, (user.packAhead ?? 0) - 1) });
      debited = true;
    }
    if (user.pityHold) await patchLive(ctx, user, { pityHold: undefined });
  }

  await patchLive(ctx, user, {
    totalPacksOpened: user.totalPacksOpened + 1,
    lastSeenAt: now,
    // (V3, coût Convex, piste 10) plus de « Contemple son tirage » : le statut reste « Ouvre un … », et une série de
    // boosters n'écrit plus la présence à chaque booster (convex/presence.ts)
    ...(pack.god ? { statusText: 'Vient d’ouvrir un GOD PACK' } : {}),
  });
  if (tail) await syncPresence(ctx, user._id, 0, user);
  if (tail && debited) await scheduleReserveFull(ctx, user._id, user);
  if (pack.god)
    await ctx.db.insert('activityFeed', {
      userId: user._id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      kind: 'pull',
      ...feedMsg(fm('f.god', { name: user.displayName })),
      createdAt: now,
    });
  // parrainage (retours live 02, §10) : au 10e booster du filleul, 10 boosters pour son parrain
  await payReferrer(ctx, user._id, user);

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
          ? fm('f.secret', { name: user.displayName, card: c.cardName, cardId: c.cardId, odds: bebouOddsLabel().replace(/^1 sur /, '') })
          : fm('f.pull', { name: user.displayName, card: c.cardName, cardId: c.cardId, rarity: label, rarityId: c.rarity, mint: c.mintNumber });

      const feedId = await ctx.db.insert('activityFeed', {
        userId: user._id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        kind,
        cardId: c.cardId,
        cardName: c.cardName,
        rarity: c.rarity,
        mintNumber: c.mintNumber,
        ...feedMsg(msg),
        createdAt: now,
        ...(tier >= RARITY_TIER.legendary ? { big: true } : {}),
      });
      if (tier >= RARITY_TIER.legendary) await pushBigPull(ctx, feedId);

      // Discord : uniquement avant-dernier tier (Mythique 6★) et dernier tier (Secrète Bébou ✷)
      if (tier >= RARITY_TIER.mythic) {
        // (V2, 08/11) la carte elle-même, de face, avec le nom du joueur au-dessus : le jeu envoie l'image (dropShots.ts)
        await queueDropShot(ctx, user, c);
      }
    }
  }

  // pièces d'ouverture + missions de la semaine (src/core/economy.ts, src/core/weekly.ts) ; (v2.1.39) comptées avec la
  // Forge dans le rendement dégressif du jour à partir du 01/12
  if (pack.coins) await addForgeCoins(ctx, user._id, pack.coins, 'pack', pack.eventName ? fm('c.openEvent', { event: pack.eventName, ...(await eventEn(ctx, pack.eventId)) }) : pack.packKind === 'theme' && pack.themeId ? fm('c.openTheme', { theme: themeById(pack.themeId)?.label ?? 'booster', themeId: pack.themeId }) : fm('c.openTheme', { theme: BEBOU_PACK.label }), { live: user });
  await bumpWeekly(ctx, user._id, { type: 'pack', cards: pack.cards.map((c) => ({ rarity: c.rarity, isNew: c.isNew })) }, user);

  // missions du jour (ouvrir, raretés, nouvelles cartes, doublons…)
  await bumpMissions(ctx, user, {
    type: 'pack',
    // (booster du moment : clé à part, il ne compte pas pour « ouvre un Bebou Pack »)
    packKey: pack.eventId ? 'event' : pack.packKind === 'theme' && pack.themeId ? pack.themeId : 'bebou',
    cards: pack.cards.map((c) => ({ cardId: c.cardId, rarity: c.rarity, isNew: c.isNew })),
  }, true);
  // défis entre amis en cours (convex/challenges.ts) : seulement les boosters scellés après le départ du défi — (V3) un
  // booster scellé d'avance compte à son ouverture (sinon le 1er booster après un défi accepté ne compterait pas)
  await bumpChallenges(ctx, user._id, pack.ahead ? now : pack.createdAt, pack.cards.map((c) => ({ rarity: c.rarity, isNew: c.isNew })));

  // (26/11, coût) le booster tel qu'écrit, sans le relire
  return { pack: { ...pack, ...revealed }, credited: true, debited };
}

/**
 * (V3, piste Convex 9) Scelle d'avance le booster suivant de la même sorte que `pack` (qui vient d'être crédité) : le
 * prochain « Ouvrir » de cette sorte n'appelle plus `preparePack`. Rien si une série de cette sorte attend encore (ses
 * boosters sont déjà scellés), si la réserve est vide ou l'événement fini. Un booster d'avance déjà là (autre onglet)
 * est rendu tel quel.
 */
async function sealAhead(ctx: MutationCtx, user: Doc<'users'>, pack: Doc<'packOpens'>): Promise<Doc<'packOpens'> | null> {
  const key = sortKey(pack);
  const same = (await sealedOf(ctx, user._id)).filter((p) => sortKey(p) === key);
  if (same.some((p) => !p.ahead)) return null;
  if (same.length) return same[0];
  try {
    return await prepareOne(ctx, user, pack.packKind ?? 'bebou', pack.themeId, pack.eventId, { lookup: false, tail: false, ahead: true });
  } catch (e) {
    if (e instanceof ConvexError) return null;
    throw e;
  }
}

export const revealPack = mutation({
  args: {
    sessionToken: v.string(),
    packId: v.id('packOpens'),
  },
  handler: async (ctx, { sessionToken, packId }) => {
    const user = { ...(await requireUser(ctx, sessionToken)) };
    return (await revealOne(ctx, user, packId)).pack;
  },
});

/**
 * (V3, piste Convex 9) UN BOOSTER = UNE MUTATION. Crédite le booster montré (comme `revealPack`) ET, dans la même
 * mutation, scelle d'avance le suivant de la même sorte (`next` : faux pendant une série dont d'autres boosters
 * attendent). Le joueur est lu et écrit une fois, `session:get` relancé une fois, au lieu de deux (preparePack puis
 * revealPack). `revealPack` / `preparePack` restent pour les vieux onglets.
 */
export const openPack = mutation({
  args: { sessionToken: v.string(), packId: v.id('packOpens'), next: v.optional(v.boolean()) },
  handler: async (ctx, { sessionToken, packId, next }) => {
    const user = { ...(await requireUser(ctx, sessionToken)) };
    const { pack, credited, debited } = await revealOne(ctx, user, packId, false);
    const ahead = credited && next !== false ? await sealAhead(ctx, user, pack) : null;
    if (credited) await syncPresence(ctx, user._id, 0, user);
    if (debited) await scheduleReserveFull(ctx, user._id, user);
    return { pack, next: ahead };
  },
});

/** (V3, packs événement) Acheter un booster d'événement (10 × le prix d'un booster) : il rejoint la réserve de l'événement. */
export const buyEventPack = mutation({
  args: { sessionToken: v.string(), eventId: v.id('packEvents') },
  handler: async (ctx, { sessionToken, eventId }) => {
    const user = { ...(await requireUser(ctx, sessionToken)) };
    const ev = await liveEventOrThrow(ctx, eventId);
    const now = Date.now();
    await addCoins(ctx, user._id, -EVENT_PACK_PRICE, 'shop', fm('c.shop', { n: 1 }), { live: user });
    const r = evReserve(user, ev, now);
    await patchLive(ctx, user, { ev: { id: ev._id, n: r.balance + 1, at: r.regenAt, ahead: r.ahead } });
    return { packs: r.balance + 1 };
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
    // (26/11, coût) joueur lu une fois (avant : relu à chaque booster, et 3 fois dans chacun) ; présence et rappel
    // « réserve pleine » posés une fois à la fin de la série
    const user = { ...(await requireUser(ctx, sessionToken)) };
    const n = Math.max(1, Math.min(10, Math.floor(count)));
    // (V3, piste 9) déjà scellés : ceux de la sorte demandée (dont celui d'avance), puis un booster abandonné ; les
    // boosters d'avance des AUTRES sortes restent pour leur sorte
    const want = sortKey(eventId ? { eventId } : { packKind: packKind ?? 'bebou', themeId: packKind === 'theme' ? themeById(themeId ?? '')?.id ?? themeId : undefined });
    const all = await sealedOf(ctx, user._id);
    const out = [...all.filter((p) => sortKey(p) === want), ...all.filter((p) => sortKey(p) !== want && !p.ahead)].slice(0, n);
    let sealed = 0;
    while (out.length < n) {
      try {
        out.push(await prepareOne(ctx, user, packKind, themeId, eventId, { lookup: false, tail: false }));
        sealed++;
      } catch (e) {
        if (!out.length) throw e;
        break; // réserve épuisée en cours de série : on garde ce qui est scellé
      }
    }
    if (sealed) await prepareTail(ctx, user);
    return out;
  },
});

/** Crédite plusieurs boosters scellés en un seul appel (« Tout passer »). Renvoie les ids crédités. */
export const revealPacks = mutation({
  args: { sessionToken: v.string(), packIds: v.array(v.id('packOpens')) },
  handler: async (ctx, { sessionToken, packIds }) => {
    // (26/11, coût) joueur lu une fois (avant : relu à chaque booster, et 6 fois dans chacun) ; présence une fois à la fin
    const user = { ...(await requireUser(ctx, sessionToken)) };
    const done: string[] = [];
    let credited = false;
    let debited = false;
    for (const id of packIds.slice(0, 12)) {
      const p = await revealOne(ctx, user, id, false);
      done.push(p.pack._id);
      credited ||= p.credited;
      debited ||= p.debited;
    }
    if (credited) await syncPresence(ctx, user._id, 0, user);
    if (debited) await scheduleReserveFull(ctx, user._id, user);
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
