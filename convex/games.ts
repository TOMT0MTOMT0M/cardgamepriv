import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserByToken, requireUser } from './auth';
import { RARITY_TIER, type RarityId } from './cardsCatalog';
import { packChoiceValidator, stakeValidator } from './schema';
import { addCoins, bumpWeekly, checkStake, giveCards, mint, patchEcon, recordFlow, secureRandom, takeCards } from './econLib';
import { bumpMissions } from './missions';
import { applyRegen, fmtCountdown } from '../src/core/packRegen';
import { isValidPackRequest, rollPack, type PackRequest } from '../src/core/packRoll';
import { pityAfter, pityForces } from '../src/core/pity';
import { themeById } from '../src/core/sets/themes';
import { cardsValue, fmtCoins, rollPackCoins, stakeValue } from '../src/core/economy';
import {
  DUEL_MAX_PACKS,
  ROYALE_MAX,
  ROYALE_MIN,
  betProblem,
  drawNumber,
  duelProblem,
  duelWinner,
  houseCard,
  nextRouletteDraw,
  packChoiceLabel,
  rouletteDrawDay,
  royaleResult,
  validPackChoice,
  type GameCard,
  type PackChoice,
  type Stake,
} from '../src/core/games';

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
  return applyRegen(u.packBalance, u.packRegenAt ?? u.lastSeenAt, now);
}

async function debitPacks(ctx: MutationCtx, userId: Id<'users'>, n: number) {
  const u = (await ctx.db.get(userId))!;
  const now = Date.now();
  const regen = packsNow(u, now);
  if (regen.balance < n) {
    throw new ConvexError(`${u.displayName} n’a que ${regen.balance} booster${regen.balance > 1 ? 's' : ''} (il en faut ${n})${regen.nextAt ? ` — le prochain arrive dans ${fmtCountdown(regen.nextAt - now)}` : ''}.`);
  }
  await ctx.db.patch(userId, { packBalance: regen.balance - n, packRegenAt: regen.regenAt, lastSeenAt: now });
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
  if (!isValidPackRequest(req)) throw new ConvexError('Ce booster n’existe pas.');
  const cards: GameCard[] = [];
  for (const { card, rarity } of rollPack(req, secureRandom)) {
    cards.push({ cardId: card.id, cardName: card.name, rarity: rarity as RarityId, mintNumber: await mint(ctx, card.id, rarity as RarityId), foilSeed: Math.floor(secureRandom() * 900000) + 100000 });
  }
  await ctx.db.patch(userId, { pityCount: pityAfter(pity, cards.map((c) => c.rarity)), totalPacksOpened: u.totalPacksOpened + 1 });
  const coins = rollPackCoins(choice.kind, secureRandom);
  await addCoins(ctx, userId, coins, 'pack', `Ouverture — ${packChoiceLabel(choice)} (jeu)`, { earned: true });
  return cards;
}

/** Les belles cartes tirées en jeu passent aussi dans le fil (6★ et secrètes). */
async function announcePulls(ctx: MutationCtx, opener: Doc<'users'>, cards: GameCard[], where: string) {
  const now = Date.now();
  for (const c of cards) {
    if (RARITY_TIER[c.rarity] < RARITY_TIER.mythic) continue;
    await ctx.db.insert('activityFeed', {
      userId: opener._id,
      displayName: opener.displayName,
      avatarUrl: opener.avatarUrl,
      kind: c.rarity === 'secret' ? 'secret_pull' : 'mythic_pull',
      cardId: c.cardId,
      cardName: c.cardName,
      rarity: c.rarity,
      mintNumber: c.mintNumber,
      message: `${opener.displayName} a tiré ${c.cardName} [${c.rarity === 'secret' ? 'Secrète' : 'Mythique'} #${c.mintNumber}] dans ${where} !`,
      createdAt: now,
    });
  }
}

async function feedGame(ctx: MutationCtx, u: Doc<'users'>, message: string) {
  await ctx.db.insert('activityFeed', { userId: u._id, displayName: u.displayName, avatarUrl: u.avatarUrl, kind: 'game', message, createdAt: Date.now() });
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
    if (problem && !problem.startsWith('En attente')) throw new ConvexError(problem);
    if (invitedId === u._id) throw new ConvexError('Tu ne peux pas te défier toi-même.');
    if (invitedId && !(await ctx.db.get(invitedId))) throw new ConvexError('Joueur introuvable.');
    await checkStake(ctx, u, stake);
    if (packsNow(u, Date.now()).balance < packs.length) throw new ConvexError(`Tu n’as pas ${packs.length} boosters en réserve.`);
    const open = await ctx.db.query('duels').withIndex('by_creator', (q) => q.eq('creatorId', u._id)).filter((q) => q.eq(q.field('status'), 'open')).collect();
    if (open.length >= 3) throw new ConvexError('3 duels ouverts au maximum : annule-en un.');
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
  if (!d || d.status !== 'open') throw new ConvexError('Ce duel n’est plus ouvert.');
  return d;
}

/** Rejoindre (ou modifier sa mise) : chaque changement remet les deux validations à zéro. */
export const setDuelSide = mutation({
  args: { sessionToken: v.string(), duelId: v.id('duels'), packs: vPacks, stake: stakeValidator },
  handler: async (ctx, { sessionToken, duelId, packs, stake }) => {
    const u = await requireUser(ctx, sessionToken);
    const d = await openDuel(ctx, duelId);
    if (!packs.length || packs.length > DUEL_MAX_PACKS || !packs.every(validPackChoice)) throw new ConvexError(`Mise de 1 à ${DUEL_MAX_PACKS} boosters.`);
    await checkStake(ctx, u, stake);
    if (packsNow(u, Date.now()).balance < packs.length) throw new ConvexError(`Tu n’as pas ${packs.length} boosters en réserve.`);
    const sides = d.sides.map((s) => ({ ...s, ready: false }));
    const i = sides.findIndex((s) => s.userId === u._id);
    if (i >= 0) sides[i] = sideOf(u, packs, stake);
    else {
      if (sides.length >= 2) throw new ConvexError('Ce duel a déjà un adversaire.');
      if (d.invitedId && d.invitedId !== u._id) throw new ConvexError('Ce duel est réservé à un autre joueur.');
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
    if (i < 0) throw new ConvexError('Tu ne participes pas à ce duel.');
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
  if (users.some((x) => !x)) throw new ConvexError('Joueur introuvable.');
  const [a, b] = users as Doc<'users'>[];
  // 1. tout est encore là ? (boosters, pièces, cartes libres)
  for (const [k, s] of d.sides.entries()) await checkStake(ctx, users[k]!, stakeOf(s));
  // 2. verrouillage : on débite tout d'un coup
  const escrow: Array<{ coins: number; cards: Array<{ cardId: string; rarity: RarityId; count: number; mintNumber: number }> }> = [];
  for (const [k, s] of d.sides.entries()) {
    await debitPacks(ctx, s.userId, s.packs.length);
    if (s.stake.coins) await addCoins(ctx, s.userId, -s.stake.coins, 'duel', `Side pot — Pack Battle contre ${d.sides[1 - k].name}`);
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
      if (escrow[k].coins) await addCoins(ctx, s.userId, escrow[k].coins, 'duel', 'Side pot rendu (égalité parfaite)');
    }
  } else {
    const w = d.sides[winner];
    const l = d.sides[1 - winner];
    await giveCards(ctx, w.userId, [...packs.flat(2), ...escrow[0].cards, ...escrow[1].cards]);
    const coins = escrow[0].coins + escrow[1].coins;
    if (coins) await addCoins(ctx, w.userId, coins, 'duel', `Side pot gagné — Pack Battle contre ${l.name}`, { earned: true });
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
    await announcePulls(ctx, u, packs[k].flat(), 'un Pack Battle');
    await ctx.db.patch(s.userId, { lastSeenAt: now, statusText: won ? 'Vient de gagner un Pack Battle' : winner === null ? 'Égalité parfaite en Pack Battle' : 'Vient de perdre un Pack Battle' });
  }
  const n = d.sides[0].packs.length;
  await feedGame(
    ctx,
    winner === null ? a : winner === 0 ? a : b,
    winner === null
      ? `Pack Battle ${a.displayName} contre ${b.displayName} : égalité parfaite (${stars[0]}★ partout), chacun repart avec ses cartes !`
      : `${(winner === 0 ? a : b).displayName} remporte un Pack Battle contre ${(winner === 0 ? b : a).displayName} : ${stars[winner]}★ contre ${stars[1 - winner]}★ (${n} booster${n > 1 ? 's' : ''} chacun) et repart avec ${n * 10} cartes !`,
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
  args: { sessionToken: v.string(), pack: packChoiceValidator },
  handler: async (ctx, { sessionToken, pack }) => {
    const u = await requireUser(ctx, sessionToken);
    if (!validPackChoice(pack)) throw new ConvexError('Booster inconnu.');
    if (packsNow(u, Date.now()).balance < 1) throw new ConvexError('Il te faut un booster en réserve.');
    const open = await ctx.db.query('royales').withIndex('by_status', (q) => q.eq('status', 'open')).collect();
    if (open.some((r) => r.players.some((p) => p.userId === u._id))) throw new ConvexError('Tu es déjà dans une Battle Royale en attente.');
    return await ctx.db.insert('royales', {
      creatorId: u._id,
      status: 'open',
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
    if (!r || r.status !== 'open') throw new ConvexError('Cette Battle Royale n’est plus ouverte.');
    if (!validPackChoice(pack)) throw new ConvexError('Booster inconnu.');
    if (packsNow(u, Date.now()).balance < 1) throw new ConvexError('Il te faut un booster en réserve.');
    const players = r.players.filter((p) => p.userId !== u._id);
    if (players.length >= ROYALE_MAX) throw new ConvexError(`Complet (${ROYALE_MAX} joueurs).`);
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
    if (!r || r.status !== 'open') throw new ConvexError('Cette Battle Royale n’est plus ouverte.');
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
    if (!r || r.status !== 'open') throw new ConvexError('Cette Battle Royale n’est plus ouverte.');
    if (r.creatorId !== u._id) throw new ConvexError('Seul le créateur lance la partie.');
    if (r.players.length < ROYALE_MIN) throw new ConvexError(`Il faut au moins ${ROYALE_MIN} joueurs.`);
    await resolveRoyale(ctx, r);
  },
});

async function resolveRoyale(ctx: MutationCtx, r: Doc<'royales'>) {
  for (const p of r.players) await debitPacks(ctx, p.userId, 1);
  const packs: GameCard[][] = [];
  for (const p of r.players) packs.push(await openGamePack(ctx, p.userId, p.pack));
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
    await bumpMissions(ctx, u, { type: 'pack', packKey: p.pack.kind === 'theme' && p.pack.themeId ? p.pack.themeId : 'bebou', cards: res.awarded[i].map((c) => ({ cardId: c.cardId, rarity: c.rarity, isNew: false })) });
    await announcePulls(ctx, u, packs[i], 'une Battle Royale');
    await ctx.db.patch(p.userId, { lastSeenAt: now, statusText: won ? 'Vient de gagner une Battle Royale' : 'Sort d’une Battle Royale' });
  }
  const best = Math.max(...res.stars);
  const names = res.winners.map((i) => r.players[i].name);
  const winnerDoc = (await ctx.db.get(r.players[res.winners[0]].userId))!;
  await feedGame(
    ctx,
    winnerDoc,
    names.length === 1
      ? `${names[0]} remporte la Battle Royale à ${r.players.length} joueurs (${best}★) et rafle ${packs.flat().length} cartes !`
      : `Battle Royale à ${r.players.length} : ex æquo à ${best}★ entre ${names.join(' et ')}, le pot est partagé au hasard !`,
  );
  await ctx.db.patch(r._id, { status: 'done', result: { packs, stars: res.stars, winners: res.winners, awarded: res.awarded }, resolvedAt: now });
}

// ═════════════════════════════════════════════ ROULETTE À CARTES

/** Instant du tirage d'un jour (21 h, heure de Paris). */
function drawInstant(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return nextRouletteDraw(Date.UTC(y, m - 1, d, 10));
}

async function openRound(ctx: QueryCtx) {
  return await ctx.db.query('rouletteRounds').withIndex('by_status', (q) => q.eq('status', 'open')).first();
}

/** Nouveau tirage, avec la carte offerte du jour (et le report du pot précédent s'il n'est pas tombé). */
async function newRound(ctx: MutationCtx, carriedCoins: number, carriedCards: Doc<'rouletteRounds'>['carriedCards'], now: number) {
  const c = houseCard(secureRandom);
  const rarity = c.rarity as RarityId;
  const card = { cardId: c.id, cardName: c.name, rarity, mintNumber: await mint(ctx, c.id, rarity), foilSeed: Math.floor(secureRandom() * 900000) + 100000 };
  const id = await ctx.db.insert('rouletteRounds', { day: rouletteDrawDay(now), status: 'open', carriedCoins, carriedCards, houseCards: [card], bets: [] });
  return (await ctx.db.get(id))!;
}

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
    if (now >= drawInstant(r.day)) throw new ConvexError('Le tirage est en cours : réessaie dans une minute.');
    const taken = new Set(r.bets.filter((b) => b.userId !== u._id).flatMap((b) => b.numbers));
    const mine = r.bets.find((b) => b.userId === u._id);
    const problem = betProblem(numbers, stake, new Set([...taken, ...(mine?.numbers ?? [])]), mine?.numbers.length ?? 0);
    if (problem) throw new ConvexError(problem);
    if (stake.coins) await addCoins(ctx, u._id, -stake.coins, 'roulette', `Roulette — ${numbers.length} numéro${numbers.length > 1 ? 's' : ''}`);
    const cards = await takeCards(ctx, u._id, stake.cards);
    const bets = r.bets.filter((b) => b.userId !== u._id);
    const merged = mine
      ? { ...mine, numbers: [...mine.numbers, ...numbers].sort((x, y) => x - y), coins: mine.coins + stake.coins, cards: [...mine.cards, ...cards] }
      : { userId: u._id, name: u.displayName, ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}), numbers: [...numbers].sort((x, y) => x - y), coins: stake.coins, cards, createdAt: now };
    bets.push(merged);
    await ctx.db.patch(r._id, { bets });
    if (!mine) {
      await patchEcon(ctx, u._id, (e) => ({ ...e, gamesPlayed: e.gamesPlayed + 1 }));
      await bumpWeekly(ctx, u._id, { type: 'game', won: false });
    }
    await ctx.db.patch(u._id, { lastSeenAt: now, statusText: 'A misé à la roulette' });
    return { numbers: merged.numbers };
  },
});

/** Tirage quotidien (crons.ts, toutes les 10 minutes : tire dès que 21 h est passé). */
export const rouletteTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const r = await openRound(ctx);
    if (!r) {
      await newRound(ctx, 0, [], now);
      return;
    }
    if (now < drawInstant(r.day)) return;
    await drawRound(ctx, r, now);
  },
});

/** Admin / tests : force le tirage en cours. */
export const forceDraw = internalMutation({
  args: { number: v.optional(v.number()) },
  handler: async (ctx, { number }) => {
    const r = await openRound(ctx);
    if (!r) return null;
    return await drawRound(ctx, r, Date.now(), number);
  },
});

async function drawRound(ctx: MutationCtx, r: Doc<'rouletteRounds'>, now: number, forced?: number) {
  const number = forced ?? drawNumber(secureRandom);
  const pot = potOf(r);
  const bet = r.bets.find((b) => b.numbers.includes(number));
  if (bet) {
    await giveCards(ctx, bet.userId, pot.cards);
    if (pot.coins) await addCoins(ctx, bet.userId, pot.coins, 'roulette', `Roulette — pot du ${r.day} (n° ${number})`, { earned: true });
    await patchEcon(ctx, bet.userId, (e) => ({ ...e, rouletteWins: e.rouletteWins + 1 }));
    for (const b of r.bets) if (b.userId !== bet.userId) await recordFlow(ctx, b.userId, bet.userId, b.coins + cardsValue(b.cards), 'roulette');
    const w = await ctx.db.get(bet.userId);
    if (w) await feedGame(ctx, w, `🎡 Le ${number} sort à la roulette : ${w.displayName} remporte tout le pot — ${fmtCoins(pot.coins)} pièces et ${pot.cards.reduce((a, c) => a + c.count, 0)} cartes (${fmtCoins(pot.value)} de valeur) !`);
  }
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
    const u = await getUserByToken(ctx, sessionToken);
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
    const u = await getUserByToken(ctx, sessionToken);
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
    const u = await getUserByToken(ctx, sessionToken);
    const r = await openRound(ctx);
    const past = await ctx.db.query('rouletteRounds').withIndex('by_status', (q) => q.eq('status', 'drawn')).order('desc').take(10);
    const now = Date.now();
    return {
      round: r ? { ...r, pot: potOf(r), drawAt: drawInstant(r.day) } : null,
      nextDrawAt: r ? drawInstant(r.day) : nextRouletteDraw(now),
      me: u?._id ?? null,
      past: past.map((p) => ({ _id: p._id, day: p.day, result: p.result, drawnAt: p.drawnAt, bets: p.bets.map((b) => ({ userId: b.userId, name: b.name, numbers: b.numbers })) })),
    };
  },
});
