import { ConvexError } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { RarityId } from './cardsCatalog';
import { catalogCard } from './cardsCatalog';
import { cleanEcon, emptyEcon, type EconState } from '../src/core/economy';
import { applyWeeklyEvent, cleanWeekly, currentWeekly, type WeeklyEvent, type WeeklyState } from '../src/core/weekly';
import { lockedCards } from './trades';
import { dropInv, invRev } from './invRev';

/**
 * Briques serveur de l'économie (pièces, inventaire, journaux), partagées par convex/economy.ts et convex/games.ts.
 * Aucune fonction publique ici.
 */

export function secureRandom(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / (0xffffffff + 1);
}

export const econOf = (u: Doc<'users'>): EconState => ({ ...emptyEcon(), ...(u.econ ?? {}) });
export const coinsOf = (u: Doc<'users'>) => u.coins ?? 0;

/**
 * Ajoute (ou retire, montant négatif) des pièces, avec une ligne de journal. `earned` : compte dans les « pièces gagnées »
 * (succès Tirelire) — vrai pour les sources de pièces et les gains de jeu, faux pour les remboursements.
 * Relit le joueur : sûr après d'autres écritures dans la même mutation.
 */
export async function addCoins(ctx: MutationCtx, userId: Id<'users'>, amount: number, reason: string, label: string, opts: { earned?: boolean; econ?: Partial<EconState> } = {}) {
  const u = await ctx.db.get(userId);
  if (!u) throw new ConvexError('Joueur introuvable.');
  amount = Math.round(amount);
  const coins = coinsOf(u) + amount;
  if (coins < 0) throw new ConvexError(`Pas assez de pièces (il t’en manque ${-coins}).`);
  const econ = { ...econOf(u), ...(opts.econ ?? {}) };
  if (opts.earned && amount > 0) econ.earned += amount;
  await ctx.db.patch(userId, { coins, econ: cleanEcon(econ) });
  if (amount !== 0) await ctx.db.insert('coinTx', { userId, amount, reason, label, createdAt: Date.now() });
  return coins;
}

/** Modifie les compteurs de l'économie sans toucher aux pièces. */
export async function patchEcon(ctx: MutationCtx, userId: Id<'users'>, fn: (e: EconState) => EconState) {
  const u = await ctx.db.get(userId);
  if (!u) return;
  await ctx.db.patch(userId, { econ: cleanEcon(fn(econOf(u))) });
}

/** Missions de la semaine. */
export async function bumpWeekly(ctx: MutationCtx, userId: Id<'users'>, ev: WeeklyEvent) {
  const u = await ctx.db.get(userId);
  if (!u) return;
  const { state, changed } = applyWeeklyEvent(currentWeekly(u.weekly as WeeklyState | undefined, u._id, Date.now()), ev);
  if (changed) await ctx.db.patch(userId, { weekly: cleanWeekly(state) });
}

/** Exemplaires possédés d'une carte, et ceux qui sont libres (pas engagés dans un échange en attente). */
export async function freeCount(ctx: QueryCtx, userId: Id<'users'>, cardId: string, rarity: RarityId, locked?: Map<string, number>) {
  const inv = await ctx.db
    .query('inventory')
    .withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', cardId).eq('rarity', rarity))
    .unique();
  const busy = (locked ?? (await lockedCards(ctx, userId))).get(`${cardId}:${rarity}`) ?? 0;
  return { row: inv, have: inv?.count ?? 0, free: Math.max(0, (inv?.count ?? 0) - busy) };
}

/**
 * Retire des cartes misées de l'inventaire (side pot, roulette). Mise = cartes libres, le dernier exemplaire compris
 * (contrairement au brûlage : c'est un pari, la carte peut revenir). Renvoie le meilleur n° d'impression de chaque ligne.
 */
export async function takeCards(ctx: MutationCtx, userId: Id<'users'>, items: Array<{ cardId: string; rarity: RarityId; count: number }>) {
  const locked = await lockedCards(ctx, userId);
  const out: Array<{ cardId: string; rarity: RarityId; count: number; mintNumber: number }> = [];
  const seen = new Set<string>();
  for (const it of items) {
    const k = `${it.cardId}:${it.rarity}`;
    if (seen.has(k)) throw new ConvexError('Même carte en double dans la mise.');
    seen.add(k);
    if (!Number.isInteger(it.count) || it.count < 1) throw new ConvexError('Quantité invalide.');
    const name = catalogCard(it.cardId)?.name ?? it.cardId;
    const { row, have, free } = await freeCount(ctx, userId, it.cardId, it.rarity, locked);
    if (have < it.count) throw new ConvexError(`Tu n’as pas assez d’exemplaires de ${name}.`);
    if (free < it.count) throw new ConvexError(`${name} est engagée dans un échange en attente.`);
    if (row!.count === it.count) await dropInv(ctx, row!);
    else await ctx.db.patch(row!._id, { count: row!.count - it.count, rev: invRev() });
    out.push({ ...it, mintNumber: row!.bestMintNumber });
  }
  return out;
}

/** Vérifie qu'une mise est disponible, sans rien retirer (composition d'un duel avant verrouillage). */
export async function checkStake(ctx: QueryCtx, u: Doc<'users'>, stake: { coins: number; cards: Array<{ cardId: string; rarity: RarityId; count: number }> }) {
  if (!Number.isInteger(stake.coins) || stake.coins < 0) throw new ConvexError('Montant invalide.');
  if (stake.coins > coinsOf(u)) throw new ConvexError(`${u.displayName} n’a pas assez de pièces pour sa mise.`);
  if (stake.cards.length > 12) throw new ConvexError('12 cartes différentes au maximum dans un pot annexe.');
  const locked = await lockedCards(ctx, u._id);
  const seen = new Set<string>();
  for (const it of stake.cards) {
    const k = `${it.cardId}:${it.rarity}`;
    if (seen.has(k)) throw new ConvexError('Même carte en double dans la mise.');
    seen.add(k);
    if (!catalogCard(it.cardId)) throw new ConvexError('Carte inconnue.');
    if (!Number.isInteger(it.count) || it.count < 1) throw new ConvexError('Quantité invalide.');
    const { have, free } = await freeCount(ctx, u._id, it.cardId, it.rarity, locked);
    const name = catalogCard(it.cardId)?.name ?? it.cardId;
    if (have < it.count) throw new ConvexError(`${u.displayName} n’a pas assez d’exemplaires de ${name}.`);
    if (free < it.count) throw new ConvexError(`${name} est engagée dans un échange en attente.`);
  }
}

/** Ajoute des cartes à un inventaire (gain d'un jeu, remboursement). `isNew` : le joueur ne l'avait pas encore. */
export async function giveCards(ctx: MutationCtx, userId: Id<'users'>, cards: Array<{ cardId: string; rarity: RarityId; count?: number; mintNumber: number; foilSeed?: number }>) {
  const now = Date.now();
  const fresh: string[] = [];
  for (const c of cards) {
    const n = c.count ?? 1;
    const row = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', c.cardId).eq('rarity', c.rarity))
      .unique();
    if (row) await ctx.db.patch(row._id, { count: row.count + n, bestMintNumber: Math.min(row.bestMintNumber, c.mintNumber), lastPulledAt: now, rev: invRev() });
    else {
      fresh.push(`${c.cardId}:${c.rarity}`);
      await ctx.db.insert('inventory', {
        userId,
        cardId: c.cardId,
        rarity: c.rarity,
        count: n,
        bestMintNumber: c.mintNumber,
        foilSeed: c.foilSeed ?? Math.floor(secureRandom() * 900000) + 100000,
        firstPulledAt: now,
        lastPulledAt: now,
        rev: invRev(),
      });
    }
  }
  return fresh;
}

/** Nouveau n° d'impression d'une carte. */
export async function mint(ctx: MutationCtx, cardId: string, rarity: RarityId) {
  const doc = await ctx.db
    .query('cardMints')
    .withIndex('by_card_rarity', (q) => q.eq('cardId', cardId).eq('rarity', rarity))
    .unique();
  const n = (doc?.lastMintNumber ?? 0) + 1;
  if (doc) await ctx.db.patch(doc._id, { lastMintNumber: n });
  else await ctx.db.insert('cardMints', { cardId, rarity, lastMintNumber: n });
  return n;
}

/** Flux de valeur entre deux joueurs (anti-abus). */
export async function recordFlow(ctx: MutationCtx, from: Id<'users'>, to: Id<'users'>, value: number, source: string) {
  if (from === to || value <= 0) return;
  await ctx.db.insert('valueFlows', { fromUserId: from, toUserId: to, value: Math.round(value), source, createdAt: Date.now() });
}

/** Admin : pour le panneau d'alertes. */
export async function requireAdmin(u: Doc<'users'>) {
  if (!u.isAdmin) throw new ConvexError('Réservé aux admins.');
}
