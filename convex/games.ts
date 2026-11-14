import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { notify } from './push';
import { RARITY_TIER, type RarityId } from './cardsCatalog';
import { packChoiceValidator, stakeValidator } from './schema';
import { addCoins, bumpWeekly, checkStake, giveCards, mint, patchEcon, recordFlow, secureRandom, takeCards } from './econLib';
import { bumpMissions } from './missions';
import { applyRegen, fmtCountdown } from '../src/core/packRegen';
import { isValidPackRequest, rollPack, type PackRequest } from '../src/core/packRoll';
import { pityAfter, pityForces } from '../src/core/pity';
import { themeById } from '../src/core/sets/themes';
import { cardsValue, rollPackCoins, stakeValue } from '../src/core/economy';
import {
  DUEL_MAX_PACKS,
  ROYALE_MAX,
  ROYALE_MAX_PACKS,
  ROYALE_MIN,
  royalePackCount,
  betProblem,
  drawNumber,
  duelProblem,
  duelWinner,
  houseCard,
  nextRouletteDraw,
  packChoiceLabel,
  packRef,
  rouletteSlot,
  royaleResult,
  validPackChoice,
  type GameCard,
  type PackChoice,
  type Stake,
} from '../src/core/games';
import { syncPresence } from './presence';
import { fm, feedMsg, type Msg } from '../src/core/msgs';

/**
 * ESPACE JEUX (V1) : 1v1 Pack Battle · Pack Battle Royale · Roulette à cartes. Règles : src/core/games.ts.
 * Tout se tranche côté serveur, en une mutation, au verrouillage : une déconnexion ou un rage quit n'y change rien.
 * Les jeux ne vendent jamais de cartes contre des pièces : ils redistribuent ce que les joueurs misent et tirent.
 */

type PackDoc = { kind: 'theme' | 'bebou'; themeId?: string };
type Side = Doc<'duels'>['sides'][number];

const cleanPack = (p: PackChoice): PackDoc => (p.kind === 'theme' ? { kind: 'theme', themeId: p.themeId } : { kind: 'bebou' });
const cleanStake = (s: Stake) => ({ coins: Math.round(s.coins), cards: s.cards.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count })) });

/** Boosters disponibles maintenant (réserve + recharge). */
function packsNow(u: Doc<'users'>, now: number) {
  return applyRegen(u.packBalance, u.packRegenAt ?? u.lastSeenAt, now, u.regenBoostUntil);
}

async function debitPacks(ctx: MutationCtx, userId: Id<'users'>, n: number) {
  const u = (await ctx.db.get(userId))!;
  const now = Date.now();
  const regen = packsNow(u, now);
  if (regen.balance < n) {
    throw new ConvexError(fe('games.2', { p0: u.displayName, p1: regen.balance, p2: regen.balance > 1 ? 's' : '', p3: n, p4: regen.nextAt ? ` — le prochain arrive dans ${fmtCountdown(regen.nextAt - now)}` : '' })); // i18n-ok (complément français ; l'anglais s'en passe)
  }
  await ctx.db.patch(userId, { packBalance: regen.balance - n, packRegenAt: regen.regenAt, lastSeenAt: now });
  await syncPresence(ctx, userId);
}

/**
 * Ouvre un booster pour un joueur, dans un jeu : même tirage qu'à la boutique (pity compris), n° d'impression réels,
 * pièces d'ouverture créditées au joueur qui l'ouvre. Les cartes ne sont PAS encore ajoutées à un inventaire : elles
 * vont au gagnant.
 */
async function openGamePack(ctx: MutationCtx, userId: Id<'users'>, choice: PackChoice): Promise<GameCard[]> {
  const u = (await ctx.db.get(userId))!;
  const req: PackRequest = { kind: choice.kind, themeId: choice.kind === 'theme' ? themeById(choice.themeId ?? '')?.id : undefined };
  const pity = u.pityCount ?? 0;
  req.forceMythic = pityForces(pity);
  if (!isValidPackRequest(req)) throw new ConvexError(fe('games.3'));
  const cards: GameCard[] = [];
  for (const { card, rarity } of rollPack(req, secureRandom)) {
    cards.push({ cardId: card.id, cardName: card.name, rarity: rarity as RarityId, mintNumber: await mint(ctx, card.id, rarity as RarityId), foilSeed: Math.floor(secureRandom() * 900000) + 100000 });
  }
  await ctx.db.patch(userId, { pityCount: pityAfter(pity, cards.map((c) => c.rarity)), totalPacksOpened: u.totalPacksOpened + 1 });
  const coins = rollPackCoins(choice.kind, secureRandom);
  await addCoins(ctx, userId, coins, 'pack', fm('c.openGame', { pack: packChoiceLabel(choice), ...packRef(choice) }), { earned: true });
  return cards;
}

/** Les belles cartes tirées en jeu passent aussi dans le fil (6★ et secrètes). */
async function announcePulls(ctx: MutationCtx, opener: Doc<'users'>, cards: GameCard[], where: 'f.pullBattle' | 'f.pullRoyale') {
  const now = Date.now();
  for (const c of cards) {
    if (RARITY_TIER[c.rarity] < RARITY_TIER.mythic) continue;
    await ctx.db.insert('activityFeed', {
      userId: opener._id,
      displayName: opener.displayName,
      avatarUrl: opener.avatarUrl,
      kind: c.rarity === 'secret' ? 'secret_pull' : 'mythic_pull',
      big: true, // (« Gros tirages » : index by_big, convex/feed.ts)
      cardId: c.cardId,
      cardName: c.cardName,
      rarity: c.rarity,
      mintNumber: c.mintNumber,
      ...feedMsg(fm(where, { name: opener.displayName, card: c.cardName, cardId: c.cardId, rarity: c.rarity === 'secret' ? 'Secrète' : 'Mythique', rarityId: c.rarity, mint: c.mintNumber })), // i18n-ok
      createdAt: now,
    });
  }
}

async function feedGame(ctx: MutationCtx, u: Doc<'users'>, m: Msg) {
  await ctx.db.insert('activityFeed', { userId: u._id, displayName: u.displayName, avatarUrl: u.avatarUrl, kind: 'game', ...feedMsg(m), createdAt: Date.now() });
}

const sideOf = (u: Doc<'users'>, packs: PackChoice[], stake: Stake): Side => ({
  userId: u._id,
  name: u.displayName,
  ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}),
  packs: packs.map(cleanPack),
  stake: cleanStake(stake),
  ready: false,
});

const stakeOf = (s: Side): Stake => ({ coins: s.stake.coins, cards: s.stake.cards });
const vPacks = v.array(packChoiceValidator);

// ═════════════════════════════════════════════ 1v1 PACK BATTLE

export const createDuel = mutation({
  args: { sessionToken: v.string(), packs: vPacks, stake: stakeValidator, invitedId: v.optional(v.id('users')) },
  handler: async (ctx, { sessionToken, packs, stake, invitedId }) => {
    const u = await requireUser(ctx, sessionToken);
    const problem = duelProblem({ packs, stake }, null);
    if (problem && !problem.startsWith('En attente')) throw new ConvexError(problem); // i18n-ok (test du texte, pas un affichage)
    if (invitedId === u._id) throw new ConvexError(fe('games.5'));
    if (invitedId && !(await ctx.db.get(invitedId))) throw new ConvexError(fe('games.6'));
    await checkStake(ctx, u, stake);
    if (packsNow(u, Date.now()).balance < packs.length) throw new ConvexError(fe('games.7', { p0: packs.length }));
    const open = await ctx.db.query('duels').withIndex('by_creator', (q) => q.eq('creatorId', u._id)).filter((q) => q.eq(q.field('status'), 'open')).collect();
    if (open.length >= 3) throw new ConvexError(fe('games.8'));
    if (invitedId) {
      await notify(ctx, invitedId, { kind: 'game', title: fm('n.battleInvite', { name: u.displayName }), body: fm('n.battleInviteBody'), url: '#/jeux' });
      await ctx.db.patch(invitedId, { gamesNoticeAt: Date.now() }); // pastille de l'onglet Jeux
    }
    return await ctx.db.insert('duels', {
      creatorId: u._id,
      ...(invitedId ? { invitedId } : {}),
      status: 'open',
      sides: [sideOf(u, packs, stake)],
      createdAt: Date.now(),
    });
  },
});

async function openDuel(ctx: QueryCtx, id: Id<'duels'>) {
  const d = await ctx.db.get(id);
  if (!d || d.status !== 'open') throw new ConvexError(fe('games.9'));
  return d;
}

/** empreinte d'une mise (sorte des boosters, pièces, cartes), indépendante de la forme des objets */
const sideKey = (packs: PackChoice[], stake: Stake) =>
  [
    packs.map((p) => (p.kind === 'theme' ? `t:${p.themeId}` : 'b')).join(','),
    Math.round(stake.coins),
    stake.cards.map((c) => `${c.cardId}:${c.rarity}:${c.count}`).sort().join(','),
  ].join('|');

/** Rejoindre (ou modifier sa mise) : chaque changement remet les deux validations à zéro. */
export const setDuelSide = mutation({
  args: { sessionToken: v.string(), duelId: v.id('duels'), packs: vPacks, stake: stakeValidator },
  handler: async (ctx, { sessionToken, duelId, packs, stake }) => {
    const u = await requireUser(ctx, sessionToken);
    const d = await openDuel(ctx, duelId);
    // mise identique à celle enregistrée : rien ne change, les validations (la sienne et celle d'en face) restent
    const had = d.sides.find((s) => s.userId === u._id);
    if (had && sideKey(had.packs, stakeOf(had)) === sideKey(packs, stake)) return;
    if (!packs.length || packs.length > DUEL_MAX_PACKS || !packs.every(validPackChoice)) throw new ConvexError(fe('games.10', { p0: DUEL_MAX_PACKS }));
    await checkStake(ctx, u, stake);
    if (packsNow(u, Date.now()).balance < packs.length) throw new ConvexError(fe('games.11', { p0: packs.length }));
    const sides = d.sides.map((s) => ({ ...s, ready: false }));
    const i = sides.findIndex((s) => s.userId === u._id);
    if (i >= 0) sides[i] = sideOf(u, packs, stake);
    else {
      if (sides.length >= 2) throw new ConvexError(fe('games.12'));
      if (d.invitedId && d.invitedId !== u._id) throw new ConvexError(fe('games.13'));
      sides.push(sideOf(u, packs, stake));
    }
    await ctx.db.patch(duelId, { sides });
  },
});

/** L'adversaire quitte (le duel redevient ouvert) ; le créateur annule. Impossible une fois verrouillé. */
export const leaveDuel = mutation({
  args: { sessionToken: v.string(), duelId: v.id('duels') },
  handler: async (ctx, { sessionToken, duelId }) => {
    const u = await requireUser(ctx, sessionToken);
    const d = await openDuel(ctx, duelId);
    if (d.creatorId === u._id) await ctx.db.patch(duelId, { status: 'cancelled', resolvedAt: Date.now() });
    else await ctx.db.patch(duelId, { sides: d.sides.filter((s) => s.userId !== u._id).map((s) => ({ ...s, ready: false })) });
  },
});

/** Valider la composition du pot. Quand les deux ont validé : verrouillage ferme, ouverture, résultat. */
export const readyDuel = mutation({
  args: { sessionToken: v.string(), duelId: v.id('duels') },
  handler: async (ctx, { sessionToken, duelId }) => {
    const u = await requireUser(ctx, sessionToken);
    const d = await openDuel(ctx, duelId);
    const i = d.sides.findIndex((s) => s.userId === u._id);
    if (i < 0) throw new ConvexError(fe('games.14'));
    const problem = duelProblem({ packs: d.sides[0].packs, stake: stakeOf(d.sides[0]) }, d.sides[1] ? { packs: d.sides[1].packs, stake: stakeOf(d.sides[1]) } : null);
    if (problem) throw new ConvexError(problem);
    const sides = d.sides.map((s, k) => (k === i ? { ...s, ready: true } : s));
    if (!sides.every((s) => s.ready) || sides.length < 2) {
      await ctx.db.patch(duelId, { sides });
      return { locked: false };
    }
    await resolveDuel(ctx, { ...d, sides });
    return { locked: true };
  },
});

async function resolveDuel(ctx: MutationCtx, d: Doc<'duels'>) {
  const users = await Promise.all(d.sides.map((s) => ctx.db.get(s.userId)));
  if (users.some((x) => !x)) throw new ConvexError(fe('games.15'));
  const [a, b] = users as Doc<'users'>[];
  // 1. tout est encore là ? (boosters, pièces, cartes libres)
  for (const [k, s] of d.sides.entries()) await checkStake(ctx, users[k]!, stakeOf(s));
  // 2. verrouillage : on débite tout d'un coup
  const escrow: Array<{ coins: number; cards: Array<{ cardId: string; rarity: RarityId; count: number; mintNumber: number }> }> = [];
  for (const [k, s] of d.sides.entries()) {
    await debitPacks(ctx, s.userId, s.packs.length);
    if (s.stake.coins) await addCoins(ctx, s.userId, -s.stake.coins, 'duel', fm('c.sidePot', { name: d.sides[1 - k].name }));
    escrow.push({ coins: s.stake.coins, cards: await takeCards(ctx, s.userId, s.stake.cards) });
  }
  // 3. ouverture simultanée
  const packs: GameCard[][][] = [];
  for (const s of d.sides) {
    const mine: GameCard[][] = [];
    for (const p of s.packs) mine.push(await openGamePack(ctx, s.userId, p));
    packs.push(mine);
  }
  const { stars, winner } = duelWinner(packs);
  const now = Date.now();
  // 4. le gagnant remporte TOUT ; égalité parfaite = PUSH, chacun récupère ses cartes et sa mise
  if (winner === null) {
    for (const [k, s] of d.sides.entries()) {
      await giveCards(ctx, s.userId, [...packs[k].flat(), ...escrow[k].cards]);
      if (escrow[k].coins) await addCoins(ctx, s.userId, escrow[k].coins, 'duel', fm('c.sidePotBack'));
    }
  } else {
    const w = d.sides[winner];
    const l = d.sides[1 - winner];
    await giveCards(ctx, w.userId, [...packs.flat(2), ...escrow[0].cards, ...escrow[1].cards]);
    const coins = escrow[0].coins + escrow[1].coins;
    if (coins) await addCoins(ctx, w.userId, coins, 'duel', fm('c.sidePotWon', { name: l.name }), { earned: true });
    const lost = cardsValue(packs[1 - winner].flat().map((c) => ({ rarity: c.rarity, count: 1 }))) + stakeValue({ coins: escrow[1 - winner].coins, cards: escrow[1 - winner].cards });
    await recordFlow(ctx, l.userId, w.userId, lost, 'duel');
  }
  // 5. compteurs, missions, fil
  for (const [k, s] of d.sides.entries()) {
    const won = winner === k;
    await patchEcon(ctx, s.userId, (e) => ({ ...e, gamesPlayed: e.gamesPlayed + 1, gamesWon: e.gamesWon + (won ? 1 : 0) }));
    await bumpWeekly(ctx, s.userId, { type: 'game', won });
    const keep = winner === null || won;
    const u = (await ctx.db.get(s.userId))!;
    for (const [j, p] of s.packs.entries())
      await bumpMissions(ctx, u, { type: 'pack', packKey: p.kind === 'theme' && p.themeId ? p.themeId : 'bebou', cards: keep ? packs[k][j].map((c) => ({ cardId: c.cardId, rarity: c.rarity, isNew: false })) : [] });
    await announcePulls(ctx, u, packs[k].flat(), 'f.pullBattle');
    await ctx.db.patch(s.userId, { lastSeenAt: now, gamesNoticeAt: now, statusText: won ? 'Vient de gagner un Pack Battle' : winner === null ? 'Égalité parfaite en Pack Battle' : 'Vient de perdre un Pack Battle' });
    await syncPresence(ctx, s.userId);
  }
  const n = d.sides[0].packs.length;
  await feedGame(
    ctx,
    winner === null ? a : winner === 0 ? a : b,
    winner === null
      ? fm('f.battleTie', { name: a.displayName, other: b.displayName, stars: stars[0] })
      : fm('f.battleWin', { name: (winner === 0 ? a : b).displayName, other: (winner === 0 ? b : a).displayName, stars: stars[winner], stars2: stars[1 - winner], n, cards: n * 10 }),
  );
  await ctx.db.patch(d._id, {
    status: 'done',
    sides: d.sides,
    result: { packs, stars, ...(winner === null ? {} : { winner }) },
    resolvedAt: now,
  });
}

// ═════════════════════════════════════════════ PACK BATTLE ROYALE

export const createRoyale = mutation({
  args: { sessionToken: v.string(), pack: packChoiceValidator, packCount: v.optional(v.number()) },
  handler: async (ctx, { sessionToken, pack, packCount: asked }) => {
    const u = await requireUser(ctx, sessionToken);
    if (!validPackChoice(pack)) throw new ConvexError(fe('games.42'));
    if (asked !== undefined && (!Number.isInteger(asked) || asked < 1 || asked > ROYALE_MAX_PACKS)) throw new ConvexError(fe('games.16', { p0: ROYALE_MAX_PACKS }));
    const n = royalePackCount({ packCount: asked });
    if (packsNow(u, Date.now()).balance < n) throw new ConvexError(n > 1 ? fe('games.17', { p0: n }) : fe('games.18'));
    const open = await ctx.db.query('royales').withIndex('by_status', (q) => q.eq('status', 'open')).collect();
    if (open.some((r) => r.players.some((p) => p.userId === u._id))) throw new ConvexError(fe('games.19'));
    return await ctx.db.insert('royales', {
      creatorId: u._id,
      status: 'open',
      ...(n > 1 ? { packCount: n } : {}),
      players: [{ userId: u._id, name: u.displayName, ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}), pack: cleanPack(pack) }],
      createdAt: Date.now(),
    });
  },
});

export const joinRoyale = mutation({
  args: { sessionToken: v.string(), royaleId: v.id('royales'), pack: packChoiceValidator },
  handler: async (ctx, { sessionToken, royaleId, pack }) => {
    const u = await requireUser(ctx, sessionToken);
    const r = await ctx.db.get(royaleId);
    if (!r || r.status !== 'open') throw new ConvexError(fe('games.20'));
    if (!validPackChoice(pack)) throw new ConvexError(fe('games.43'));
    const n = royalePackCount(r);
    if (packsNow(u, Date.now()).balance < n) throw new ConvexError(n > 1 ? fe('games.21', { p0: n }) : fe('games.22'));
    const players = r.players.filter((p) => p.userId !== u._id);
    if (players.length >= ROYALE_MAX) throw new ConvexError(fe('games.23', { p0: ROYALE_MAX }));
    players.push({ userId: u._id, name: u.displayName, ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}), pack: cleanPack(pack) });
    // on garde l'ordre d'arrivée (le créateur d'abord) ; changer de booster ne fait pas perdre sa place
    const order = r.players.map((p) => p.userId);
    players.sort((x, y) => (order.indexOf(x.userId) + 1 || 99) - (order.indexOf(y.userId) + 1 || 99));
    await ctx.db.patch(royaleId, { players });
    if (players.length >= ROYALE_MAX) await resolveRoyale(ctx, { ...r, players });
  },
});

export const leaveRoyale = mutation({
  args: { sessionToken: v.string(), royaleId: v.id('royales') },
  handler: async (ctx, { sessionToken, royaleId }) => {
    const u = await requireUser(ctx, sessionToken);
    const r = await ctx.db.get(royaleId);
    if (!r || r.status !== 'open') throw new ConvexError(fe('games.24'));
    if (r.creatorId === u._id) await ctx.db.patch(royaleId, { status: 'cancelled', resolvedAt: Date.now() });
    else await ctx.db.patch(royaleId, { players: r.players.filter((p) => p.userId !== u._id) });
  },
});

/** Le créateur lance (3 joueurs minimum) : verrouillage ferme, ouverture simultanée pour tous. */
export const startRoyale = mutation({
  args: { sessionToken: v.string(), royaleId: v.id('royales') },
  handler: async (ctx, { sessionToken, royaleId }) => {
    const u = await requireUser(ctx, sessionToken);
    const r = await ctx.db.get(royaleId);
    if (!r || r.status !== 'open') throw new ConvexError(fe('games.25'));
    if (r.creatorId !== u._id) throw new ConvexError(fe('games.26'));
    if (r.players.length < ROYALE_MIN) throw new ConvexError(fe('games.27', { p0: ROYALE_MIN }));
    await resolveRoyale(ctx, r);
  },
});

async function resolveRoyale(ctx: MutationCtx, r: Doc<'royales'>) {
  const n = royalePackCount(r);
  for (const p of r.players) await debitPacks(ctx, p.userId, n);
  // chaque joueur ouvre ses n boosters ; ses cartes (n × 5) forment une seule rangée, le total d'étoiles départage
  const byPack: GameCard[][][] = [];
  for (const p of r.players) {
    const mine: GameCard[][] = [];
    for (let k = 0; k < n; k++) mine.push(await openGamePack(ctx, p.userId, p.pack));
    byPack.push(mine);
  }
  const packs: GameCard[][] = byPack.map((m) => m.flat());
  const res = royaleResult(packs, secureRandom);
  const now = Date.now();
  for (const [i, p] of r.players.entries()) if (res.awarded[i].length) await giveCards(ctx, p.userId, res.awarded[i]);
  if (res.winners.length === 1) {
    const w = r.players[res.winners[0]];
    for (const [i, p] of r.players.entries()) if (i !== res.winners[0]) await recordFlow(ctx, p.userId, w.userId, cardsValue(packs[i].map((c) => ({ rarity: c.rarity, count: 1 }))), 'royale');
  }
  for (const [i, p] of r.players.entries()) {
    const won = res.winners.includes(i);
    await patchEcon(ctx, p.userId, (e) => ({ ...e, gamesPlayed: e.gamesPlayed + 1, gamesWon: e.gamesWon + (won ? 1 : 0) }));
    await bumpWeekly(ctx, p.userId, { type: 'game', won });
    const u = (await ctx.db.get(p.userId))!;
    // missions : un « booster ouvert » par booster misé (les cartes gardées comptent une fois, sur le premier)
    for (let k = 0; k < n; k++)
      await bumpMissions(ctx, u, { type: 'pack', packKey: p.pack.kind === 'theme' && p.pack.themeId ? p.pack.themeId : 'bebou', cards: k === 0 ? res.awarded[i].map((c) => ({ cardId: c.cardId, rarity: c.rarity, isNew: false })) : [] });
    await announcePulls(ctx, u, packs[i], 'f.pullRoyale');
    await ctx.db.patch(p.userId, { lastSeenAt: now, gamesNoticeAt: now, statusText: won ? 'Vient de gagner une Battle Royale' : 'Sort d’une Battle Royale' });
    await syncPresence(ctx, p.userId);
  }
  const best = Math.max(...res.stars);
  const names = res.winners.map((i) => r.players[i].name);
  const winnerDoc = (await ctx.db.get(r.players[res.winners[0]].userId))!;
  await feedGame(
    ctx,
    winnerDoc,
    names.length === 1
      ? fm(n > 1 ? 'f.royaleWinN' : 'f.royaleWin', { name: names[0], players: r.players.length, n, best, cards: packs.flat().length })
      : fm(n > 1 ? 'f.royaleTieN' : 'f.royaleTie', { players: r.players.length, n, best, names }),
  );
  await ctx.db.patch(r._id, { status: 'done', result: { packs, stars: res.stars, winners: res.winners, awarded: res.awarded }, resolvedAt: now });
}

// ═════════════════════════════════════════════ ROULETTE À CARTES

/** Instant du tirage d'une manche (10 h / 20 h ; ancien format sans `drawAt` : 21 h du jour indiqué). */
function drawInstant(r: Doc<'rouletteRounds'>) {
  if (r.drawAt) return r.drawAt;
  const [y, m, d] = r.day.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 20); // 21 h à Paris (heure d'hiver) : seulement pour l'ancienne manche à rembourser
}

async function openRound(ctx: QueryCtx) {
  return await ctx.db.query('rouletteRounds').withIndex('by_status', (q) => q.eq('status', 'open')).first();
}

/** Nouveau tirage, avec la carte offerte du jour (et le report du pot précédent s'il n'est pas tombé). */
async function newRound(ctx: MutationCtx, carriedCoins: number, carriedCards: Doc<'rouletteRounds'>['carriedCards'], now: number) {
  const c = houseCard(secureRandom);
  const rarity = c.rarity as RarityId;
  const card = { cardId: c.id, cardName: c.name, rarity, mintNumber: await mint(ctx, c.id, rarity), foilSeed: Math.floor(secureRandom() * 900000) + 100000 };
  const drawAt = nextRouletteDraw(now);
  const id = await ctx.db.insert('rouletteRounds', { day: rouletteSlot(drawAt), drawAt, status: 'open', carriedCoins, carriedCards, houseCards: [card], bets: [] });
  return (await ctx.db.get(id))!;
}

/**
 * POT DE BASE (ouverture 07/11) : le site garnit la roue en cours — `coins` pièces + une carte 6★ offerte, en plus de la
 * carte du site habituelle. Posé à la fin de la remise à zéro (convex/launch.ts) ; à la main :
 *   npx convex run games:seedRouletteCmd '{"coins":3000}'
 */
export const ROULETTE_SEED_COINS = 3000;
export async function seedRoulette(ctx: MutationCtx, coins: number) {
  const r = await ensureRound(ctx);
  let c = houseCard(secureRandom);
  for (let i = 0; i < 400 && c.rarity !== 'mythic'; i++) c = houseCard(secureRandom);
  const rarity = c.rarity as RarityId;
  const card = { cardId: c.id, cardName: c.name, rarity, mintNumber: await mint(ctx, c.id, rarity), foilSeed: Math.floor(secureRandom() * 900000) + 100000 };
  await ctx.db.patch(r._id, { carriedCoins: r.carriedCoins + coins, houseCards: [...r.houseCards, card] });
  return { tirage: r.day, pieces: r.carriedCoins + coins, cartes: [...r.houseCards, card].map((h) => `${h.cardName} (${h.rarity})`) };
}
export const seedRouletteCmd = internalMutation({
  args: { coins: v.optional(v.number()) },
  handler: async (ctx, { coins }) => await seedRoulette(ctx, Math.max(0, Math.floor(coins ?? ROULETTE_SEED_COINS))),
});

async function ensureRound(ctx: MutationCtx) {
  return (await openRound(ctx)) ?? (await newRound(ctx, 0, [], Date.now()));
}

/** Pot d'un tirage : pièces et cartes (report + mises + carte du site). */
function potOf(r: Doc<'rouletteRounds'>) {
  const coins = r.carriedCoins + r.bets.reduce((a, b) => a + b.coins, 0);
  const cards = [
    ...r.carriedCards,
    ...r.bets.flatMap((b) => b.cards),
    ...r.houseCards.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: 1, mintNumber: c.mintNumber })),
  ];
  return { coins, cards, value: coins + cardsValue(cards) };
}

export const placeBet = mutation({
  args: { sessionToken: v.string(), numbers: v.array(v.number()), stake: stakeValidator },
  handler: async (ctx, { sessionToken, numbers, stake }) => {
    const u = await requireUser(ctx, sessionToken);
    const r = await ensureRound(ctx);
    const now = Date.now();
    if (!r.drawAt) throw new ConvexError(fe('games.28'));
    if (now >= drawInstant(r)) throw new ConvexError(fe('games.29'));
    const taken = new Set(r.bets.flatMap((b) => b.numbers));
    const mine = r.bets.find((b) => b.userId === u._id);
    const problem = betProblem(numbers, stake, taken, mine ? 1 : 0);
    if (problem) throw new ConvexError(problem);
    if (stake.coins) await addCoins(ctx, u._id, -stake.coins, 'roulette', fm('c.roulette', { n: numbers.length }));
    const cards = await takeCards(ctx, u._id, stake.cards);
    const merged = { userId: u._id, name: u.displayName, ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}), numbers: [...numbers].sort((x, y) => x - y), coins: stake.coins, cards, createdAt: now };
    await ctx.db.patch(r._id, { bets: [...r.bets, merged] });
    await patchEcon(ctx, u._id, (e) => ({ ...e, gamesPlayed: e.gamesPlayed + 1 }));
    await bumpWeekly(ctx, u._id, { type: 'game', won: false });
    await ctx.db.patch(u._id, { lastSeenAt: now, statusText: 'A misé à la roulette' });
    await syncPresence(ctx, u._id);
    return { numbers: merged.numbers };
  },
});

/** Tirages (crons.ts, toutes les 5 minutes : tire dès que 10 h / 20 h est passé). */
export const rouletteTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const r = await openRound(ctx);
    if (!r) {
      await newRound(ctx, 0, [], now);
      return;
    }
    // ancienne manche (100 numéros, 21 h) : mises remboursées, le pot (report + carte offerte) passe à la nouvelle roue
    if (!r.drawAt) {
      await retireLegacyRound(ctx, r, now);
      return;
    }
    if (now < drawInstant(r)) return;
    await drawRound(ctx, r, now);
  },
});

/** Passage aux nouvelles règles (retours live 02) : chaque joueur récupère sa mise, le pot accumulé est conservé. */
async function retireLegacyRound(ctx: MutationCtx, r: Doc<'rouletteRounds'>, now: number) {
  for (const b of r.bets) {
    if (b.coins) await addCoins(ctx, b.userId, b.coins, 'roulette', fm('c.rouletteRefund'));
    if (b.cards.length) await giveCards(ctx, b.userId, b.cards);
  }
  const house = r.houseCards.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: 1, mintNumber: c.mintNumber }));
  await ctx.db.patch(r._id, { status: 'drawn', drawnAt: now, result: { number: 0, potValue: 0 } });
  await newRound(ctx, r.carriedCoins, [...r.carriedCards, ...house], now);
}

/** Admin / tests : force le tirage en cours. */
export const forceDraw = internalMutation({
  args: { number: v.optional(v.number()) },
  handler: async (ctx, { number }) => {
    const r = await openRound(ctx);
    if (!r) return null;
    if (!r.drawAt) return await retireLegacyRound(ctx, r, Date.now());
    return await drawRound(ctx, r, Date.now(), number);
  },
});

async function drawRound(ctx: MutationCtx, r: Doc<'rouletteRounds'>, now: number, forced?: number) {
  const number = forced ?? drawNumber(secureRandom);
  const pot = potOf(r);
  const bet = r.bets.find((b) => b.numbers.includes(number));
  if (bet) {
    await giveCards(ctx, bet.userId, pot.cards);
    if (pot.coins) await addCoins(ctx, bet.userId, pot.coins, 'roulette', fm('c.roulettePot', { day: r.day, number }), { earned: true });
    await patchEcon(ctx, bet.userId, (e) => ({ ...e, rouletteWins: e.rouletteWins + 1 }));
    await notify(ctx, bet.userId, { kind: 'game', title: fm('n.rouletteWon'), body: fm('n.rouletteWonBody', { number }), url: '#/jeux' });
    for (const b of r.bets) if (b.userId !== bet.userId) await recordFlow(ctx, b.userId, bet.userId, b.coins + cardsValue(b.cards), 'roulette');
    const w = await ctx.db.get(bet.userId);
    if (w) await feedGame(ctx, w, fm('f.roulette', { number, name: w.displayName, coins: pot.coins, cards: pot.cards.reduce((a, c) => a + c.count, 0), value: pot.value }));
  }
  // pastille de l'onglet Jeux chez chaque joueur qui avait misé (le résultat est à voir)
  for (const id of new Set(r.bets.map((b) => b.userId))) await ctx.db.patch(id, { gamesNoticeAt: now });
  await ctx.db.patch(r._id, {
    status: 'drawn',
    drawnAt: now,
    result: { number, potValue: pot.value, ...(bet ? { winnerId: bet.userId, winnerName: bet.name } : {}) },
  });
  // le pot non tombé passe au tirage suivant (cartes et pièces), avec une nouvelle carte offerte
  await newRound(ctx, bet ? 0 : pot.coins, bet ? [] : pot.cards, now + 60_000);
  return { number, winner: bet?.name ?? null };
}

// ═════════════════════════════════════════════ lectures (salon, parties, historique)

/** Salon : duels ouverts (à tous, à moi, ou les miens), Battle Royales en attente. */
export const lobby = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (audit 12/11, S04) id seul : la requête ne lit plus le document joueur, donc ne repart plus à chacune de ses écritures
    const uId = await getUserIdByToken(ctx, sessionToken);
    const u = uId ? { _id: uId } : null;
    if (!u) return null;
    const duels = (await ctx.db.query('duels').withIndex('by_status', (q) => q.eq('status', 'open')).order('desc').take(60)).filter(
      (d) => !d.invitedId || d.invitedId === u._id || d.creatorId === u._id || d.sides.some((s) => s.userId === u._id),
    );
    const royales = await ctx.db.query('royales').withIndex('by_status', (q) => q.eq('status', 'open')).order('desc').take(30);
    return { duels, royales, me: u._id };
  },
});

/** Une partie (pour la regarder se jouer, même terminée). */
export const duel = query({
  args: { duelId: v.id('duels') },
  handler: async (ctx, { duelId }) => await ctx.db.get(duelId),
});

export const royale = query({
  args: { royaleId: v.id('royales') },
  handler: async (ctx, { royaleId }) => await ctx.db.get(royaleId),
});

/** Mes parties terminées (duels + royales), les plus récentes d'abord. */
export const history = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (audit 12/11, S04) id seul : la requête ne lit plus le document joueur, donc ne repart plus à chacune de ses écritures
    const uId = await getUserIdByToken(ctx, sessionToken);
    const u = uId ? { _id: uId } : null;
    if (!u) return { duels: [], royales: [] };
    const duels = (await ctx.db.query('duels').withIndex('by_status', (q) => q.eq('status', 'done')).order('desc').take(200)).filter((d) => d.sides.some((s) => s.userId === u._id)).slice(0, 25);
    const royales = (await ctx.db.query('royales').withIndex('by_status', (q) => q.eq('status', 'done')).order('desc').take(200)).filter((r) => r.players.some((p) => p.userId === u._id)).slice(0, 25);
    return { duels, royales };
  },
});

/** Roulette : tirage en cours (numéros pris, pot, ma mise), prochain tirage, derniers tirages. */
export const roulette = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (audit 12/11, S04) id seul : la requête ne lit plus le document joueur, donc ne repart plus à chacune de ses écritures
    const uId = await getUserIdByToken(ctx, sessionToken);
    const u = uId ? { _id: uId } : null;
    const r = await openRound(ctx);
    const past = await ctx.db.query('rouletteRounds').withIndex('by_status', (q) => q.eq('status', 'drawn')).order('desc').take(10);
    const now = Date.now();
    return {
      round: r ? { ...r, pot: potOf(r), drawAt: drawInstant(r) } : null,
      nextDrawAt: r ? drawInstant(r) : nextRouletteDraw(now),
      me: u?._id ?? null,
      past: past.filter((p) => p.result?.number).map((p) => ({ _id: p._id, day: p.day, result: p.result, drawnAt: p.drawnAt, bets: p.bets.map((b) => ({ userId: b.userId, name: b.name, numbers: b.numbers })) })),
    };
  },
});
