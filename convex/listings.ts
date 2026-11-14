import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { catalogCard, rarityValidator, type RarityId } from './cardsCatalog';
import { bumpMissions } from './missions';
import { bumpWeekly, recordFlow } from './econLib';
import { lockedCards } from './trades';
import { cardsValue } from '../src/core/economy';
import { dropInv, invRev } from './invRev';
import { fm, feedMsg } from '../src/core/msgs';

/**
 * TABLEAU D'OFFRES (retours live 02, point 4) — ouvert à TOUS les joueurs (pas seulement aux amis).
 *  - Annonce : 1 à 12 cartes proposées (VERROUILLÉES tant qu'elle est ouverte : ni contrat, ni forge, ni mise, ni autre
 *    échange / annonce / offre — via `lockedCards`, trades.ts) + cartes recherchées (indicatives) + petit mot ;
 *    expire après 24 ou 48 h (choix à la création).
 *  - Offre : un autre joueur propose ses cartes (verrouillées elles aussi tant que l'offre est en cours) contre toutes
 *    les cartes de l'annonce. Une offre en cours par joueur et par annonce (une nouvelle remplace l'ancienne).
 *  - L'auteur accepte (échange atomique, l'annonce se ferme, les autres offres sont closes), refuse, ou répond par une
 *    CONTRE-OFFRE (une partie des cartes de l'annonce contre ce qu'il veut chez l'offrant) que l'offrant accepte ou refuse.
 *  - Anti-abus : un échange conclu est enregistré dans `trades` (historique + alertes « échanges déséquilibrés »)
 *    et dans les flux de valeur (`recordFlow`), comme un échange direct.
 */

export const LISTING_HOURS = [24, 48] as const;
export const MAX_OPEN_LISTINGS = 5;
export const MAX_ACTIVE_OFFERS = 10;
const MAX_ITEMS = 12;
const MAX_WANTED = 12;
const HOUR = 3600_000;

const itemValidator = v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number() });
type Item = { cardId: string; rarity: RarityId; count: number };
const key = (it: { cardId: string; rarity: string }) => `${it.cardId}:${it.rarity}`;
const nameOf = (id: string) => catalogCard(id)?.name ?? id;
const isLive = (l: Doc<'listings'> | null, now = Date.now()): l is Doc<'listings'> => !!l && l.status === 'open' && l.expiresAt > now;
const ACTIVE = ['pending', 'countered'] as const;

function checkItems(items: Item[], what: string, allowEmpty = false) {
  if (!allowEmpty && !items.length) throw new ConvexError(fe('listings.1', { p0: what }));
  if (items.length > MAX_ITEMS) throw new ConvexError(fe('listings.2', { p0: MAX_ITEMS, p1: what }));
  const seen = new Set<string>();
  for (const it of items) {
    if (!Number.isInteger(it.count) || it.count < 1 || it.count > 99) throw new ConvexError(fe('listings.3'));
    if (!catalogCard(it.cardId)) throw new ConvexError(fe('listings.4', { p0: it.cardId }));
    if (seen.has(key(it))) throw new ConvexError(fe('listings.5'));
    seen.add(key(it));
  }
}

async function ownedCount(ctx: QueryCtx, userId: Id<'users'>, it: { cardId: string; rarity: RarityId }) {
  const row = await ctx.db
    .query('inventory')
    .withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', it.cardId).eq('rarity', it.rarity))
    .unique();
  return row?.count ?? 0;
}

/** Les cartes sont possédées ET libres (pas déjà engagées ailleurs). `exceptOffer` : l'offre qu'on remplace / conclut. */
async function checkFree(ctx: QueryCtx, userId: Id<'users'>, items: Item[], who: string | null, exceptOffer?: Id<'listingOffers'>) {
  const locked = await lockedCards(ctx, userId, undefined, exceptOffer);
  for (const it of items) {
    const have = await ownedCount(ctx, userId, it);
    if (have < it.count) throw new ConvexError(who ? fe('listings.6', { p0: who, p1: nameOf(it.cardId) }) : fe('listings.7', { p0: nameOf(it.cardId) }));
    if (have - (locked.get(key(it)) ?? 0) < it.count)
      throw new ConvexError(who ? fe('listings.8', { p0: nameOf(it.cardId), p1: who }) : fe('listings.9', { p0: nameOf(it.cardId) }));
  }
}

/** Déplace des cartes d'un inventaire à l'autre (n° d'impression et brillance suivent la carte). */
async function moveCards(ctx: MutationCtx, from: Doc<'users'>, to: Doc<'users'>, items: Item[], now: number) {
  for (const it of items) {
    const src = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) => q.eq('userId', from._id).eq('cardId', it.cardId).eq('rarity', it.rarity))
      .unique();
    if (!src || src.count < it.count) throw new ConvexError(fe('listings.10', { p0: from.displayName, p1: nameOf(it.cardId) }));
    if (src.count === it.count) await dropInv(ctx, src);
    else await ctx.db.patch(src._id, { count: src.count - it.count, rev: invRev() });
    const dst = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) => q.eq('userId', to._id).eq('cardId', it.cardId).eq('rarity', it.rarity))
      .unique();
    if (dst) await ctx.db.patch(dst._id, { count: dst.count + it.count, lastPulledAt: now, rev: invRev() });
    else
      await ctx.db.insert('inventory', {
        userId: to._id,
        cardId: it.cardId,
        rarity: it.rarity,
        count: it.count,
        bestMintNumber: src.bestMintNumber,
        foilSeed: src.foilSeed,
        firstPulledAt: now,
        lastPulledAt: now,
        rev: invRev(),
      });
  }
}

/** Ferme les offres encore en cours d'une annonce (conclue avec un autre, retirée, expirée). */
async function closeOffers(ctx: MutationCtx, listingId: Id<'listings'>, now: number, keep?: Id<'listingOffers'>) {
  for (const st of ACTIVE) {
    const list = await ctx.db.query('listingOffers').withIndex('by_listing', (q) => q.eq('listingId', listingId).eq('status', st)).collect();
    for (const o of list) if (o._id !== keep) await ctx.db.patch(o._id, { status: 'closed', resolvedAt: now });
  }
}

/** Annonce encore ouverte ? (heure passée : refusée ; la tâche planifiée la fermera, une erreur annulerait l'écriture) */
async function liveListing(ctx: MutationCtx, id: Id<'listings'>): Promise<Doc<'listings'>> {
  const l = await ctx.db.get(id);
  const now = Date.now();
  if (l && l.status === 'open' && l.expiresAt <= now) throw new ConvexError(fe('listings.11'));
  if (!isLive(l, now)) throw new ConvexError(fe('listings.12'));
  return l;
}

/**
 * L'échange lui-même (tout ou rien : une erreur annule la mutation entière). L'auteur donne `give`, l'offrant `want`.
 * Vérifs : l'auteur a toujours les cartes (elles sont verrouillées par l'annonce) ; l'offrant les a et elles sont libres
 * (hors cette offre-ci, dont le verrou tombe avec la conclusion).
 */
async function conclude(ctx: MutationCtx, listing: Doc<'listings'>, offer: Doc<'listingOffers'>, give: Item[], want: Item[]) {
  const author = await ctx.db.get(listing.userId);
  const offerer = await ctx.db.get(offer.fromUserId);
  if (!author || !offerer) throw new ConvexError(fe('listings.13'));
  for (const it of give) if ((await ownedCount(ctx, author._id, it)) < it.count) throw new ConvexError(fe('listings.14', { p0: author.displayName, p1: nameOf(it.cardId) }));
  await checkFree(ctx, offerer._id, want, offerer.displayName, offer._id);
  const now = Date.now();
  await moveCards(ctx, author, offerer, give, now);
  await moveCards(ctx, offerer, author, want, now);
  await ctx.db.patch(offer._id, { status: 'accepted', resolvedAt: now });
  await ctx.db.patch(listing._id, { status: 'closed', resolvedAt: now, acceptedOfferId: offer._id });
  await closeOffers(ctx, listing._id, now, offer._id);
  // trace dans `trades` : historique des deux joueurs + alertes anti-abus « échanges déséquilibrés » (abuse.ts)
  await ctx.db.insert('trades', {
    fromUserId: author._id,
    toUserId: offerer._id,
    offered: give,
    requested: want,
    status: 'accepted',
    createdAt: offer.createdAt,
    resolvedAt: now,
    note: 'Tableau d’offres',
    listingId: listing._id,
  });
  await ctx.db.patch(author._id, { totalTrades: (author.totalTrades ?? 0) + 1 });
  await ctx.db.patch(offerer._id, { totalTrades: (offerer.totalTrades ?? 0) + 1 });
  await bumpMissions(ctx, author, { type: 'trade' });
  await bumpMissions(ctx, offerer, { type: 'trade' });
  await bumpWeekly(ctx, author._id, { type: 'trade' });
  await bumpWeekly(ctx, offerer._id, { type: 'trade' });
  // anti-abus : mêmes garde-fous qu'un échange direct (alertes admin, jamais de blocage)
  await recordFlow(ctx, author._id, offerer._id, cardsValue(give), 'listing');
  await recordFlow(ctx, offerer._id, author._id, cardsValue(want), 'listing');
  await ctx.db.insert('activityFeed', {
    userId: author._id,
    displayName: author.displayName,
    avatarUrl: author.avatarUrl,
    kind: 'trade',
    ...feedMsg(fm('f.listing', { name: author.displayName, other: offerer.displayName })),
    createdAt: now,
  });
  return { status: 'accepted' as const };
}

const offerView = async (ctx: QueryCtx, o: Doc<'listingOffers'>) => ({ ...o, fromName: (await ctx.db.get(o.fromUserId))?.displayName ?? '?' });

// ─────────────────────────────────────────── lectures

/** Le tableau : toutes les annonces ouvertes et pas expirées, les plus récentes d'abord (moi : mon offre en cours). */
export const open = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (audit 12/11, S04) id seul : la requête ne lit plus le document joueur, donc ne repart plus à chacune de ses écritures
    const meId = await getUserIdByToken(ctx, sessionToken);
    const me = meId ? { _id: meId } : null;
    const now = Date.now();
    const rows = await ctx.db
      .query('listings')
      .withIndex('by_status_expires', (q) => q.eq('status', 'open').gt('expiresAt', now))
      .take(200);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(
      rows.map(async (l) => {
        const author = await ctx.db.get(l.userId);
        let offerCount = 0;
        let myOffer: Doc<'listingOffers'> | null = null;
        for (const st of ACTIVE) {
          const list = await ctx.db.query('listingOffers').withIndex('by_listing', (q) => q.eq('listingId', l._id).eq('status', st)).collect();
          offerCount += list.length;
          if (me) myOffer ??= list.find((o) => o.fromUserId === me._id) ?? null;
        }
        return { ...l, userName: author?.displayName ?? '?', avatarUrl: author?.avatarUrl, offerCount, myOffer };
      }),
    );
  },
});

/**
 * Mes annonces (ouvertes, avec leurs offres en cours ; terminées depuis moins de 48 h) et mes offres (en cours ;
 * terminées depuis moins de 48 h). Abonnement permanent du client : verrouillage local, pastille, notifications.
 */
export const mine = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (audit 12/11, S04 / E1-04) id seul, et le document joueur (nom, avatar) n'est lu que s'il y a une annonce ou une
    // offre à nommer : sans rien en cours (le cas courant), la requête ne repart plus à chaque écriture du joueur
    const meId = await getUserIdByToken(ctx, sessionToken);
    if (!meId) return { listings: [], offers: [] };
    const idOnly = { _id: meId, displayName: '?', avatarUrl: undefined as string | undefined };
    let me = idOnly;
    const now = Date.now();
    const recent = now - 48 * HOUR;
    const ls: Doc<'listings'>[] = await ctx.db.query('listings').withIndex('by_user_status', (q) => q.eq('userId', me._id).eq('status', 'open')).collect();
    for (const st of ['closed', 'cancelled', 'expired'] as const)
      ls.push(...(await ctx.db.query('listings').withIndex('by_user_status', (q) => q.eq('userId', me._id).eq('status', st)).order('desc').take(5)).filter((l) => (l.resolvedAt ?? l.expiresAt) >= recent));
    const os: Doc<'listingOffers'>[] = [];
    for (const st of ACTIVE) os.push(...(await ctx.db.query('listingOffers').withIndex('by_from_status', (q) => q.eq('fromUserId', meId).eq('status', st)).collect()));
    for (const st of ['accepted', 'declined', 'withdrawn', 'closed'] as const)
      os.push(...(await ctx.db.query('listingOffers').withIndex('by_from_status', (q) => q.eq('fromUserId', meId).eq('status', st)).order('desc').take(6)).filter((o) => (o.resolvedAt ?? o.createdAt) >= recent));
    if (ls.length || os.length) {
      const doc = await ctx.db.get(meId);
      if (!doc) return { listings: [], offers: [] };
      me = { _id: meId, displayName: doc.displayName, avatarUrl: doc.avatarUrl };
    }
    const listings = await Promise.all(
      ls.map(async (l) => {
        const offers: Doc<'listingOffers'>[] = [];
        for (const st of l.status === 'open' ? ACTIVE : (['accepted'] as const))
          offers.push(...(await ctx.db.query('listingOffers').withIndex('by_listing', (q) => q.eq('listingId', l._id).eq('status', st)).collect()));
        offers.sort((a, b) => a.createdAt - b.createdAt);
        return { ...l, userName: me.displayName, avatarUrl: me.avatarUrl, offers: await Promise.all(offers.map((o) => offerView(ctx, o))) };
      }),
    );
    listings.sort((a, b) => b.createdAt - a.createdAt);
    const offers = await Promise.all(
      os.map(async (o) => {
        const l = await ctx.db.get(o.listingId);
        const author = l ? await ctx.db.get(l.userId) : null;
        return { ...o, fromName: me.displayName, listing: l ? { ...l, userName: author?.displayName ?? '?', avatarUrl: author?.avatarUrl } : null };
      }),
    );
    offers.sort((a, b) => (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt));
    return { listings, offers };
  },
});

// ─────────────────────────────────────────── annonces

export const create = mutation({
  args: {
    sessionToken: v.string(),
    items: v.array(itemValidator),
    wanted: v.optional(v.array(v.object({ cardId: v.string(), rarity: rarityValidator }))),
    note: v.optional(v.string()),
    hours: v.number(),
  },
  handler: async (ctx, { sessionToken, items, wanted, note, hours }) => {
    const me = await requireUser(ctx, sessionToken);
    if (!(LISTING_HOURS as readonly number[]).includes(hours)) throw new ConvexError(fe('listings.15'));
    checkItems(items, 'proposées');
    const w = wanted ?? [];
    if (w.length > MAX_WANTED) throw new ConvexError(fe('listings.16', { p0: MAX_WANTED }));
    const seen = new Set<string>();
    for (const it of w) {
      if (!catalogCard(it.cardId)) throw new ConvexError(fe('listings.17', { p0: it.cardId }));
      if (seen.has(key(it))) throw new ConvexError(fe('listings.18'));
      seen.add(key(it));
    }
    const now = Date.now();
    const open = (await ctx.db.query('listings').withIndex('by_user_status', (q) => q.eq('userId', me._id).eq('status', 'open')).collect()).filter((l) => l.expiresAt > now);
    if (open.length >= MAX_OPEN_LISTINGS) throw new ConvexError(fe('listings.19', { p0: MAX_OPEN_LISTINGS }));
    await checkFree(ctx, me._id, items, null);
    return await ctx.db.insert('listings', {
      userId: me._id,
      items,
      ...(w.length ? { wanted: w } : {}),
      note: note?.trim().slice(0, 140) || undefined,
      status: 'open',
      createdAt: now,
      expiresAt: now + hours * HOUR,
    });
  },
});

/** L'auteur retire son annonce : ses cartes sont libérées, les offres en cours sont closes. */
export const cancel = mutation({
  args: { sessionToken: v.string(), listingId: v.id('listings') },
  handler: async (ctx, { sessionToken, listingId }) => {
    const me = await requireUser(ctx, sessionToken);
    const l = await ctx.db.get(listingId);
    if (!l || l.status !== 'open') throw new ConvexError(fe('listings.20'));
    if (l.userId !== me._id) throw new ConvexError(fe('listings.21'));
    const now = Date.now();
    await ctx.db.patch(l._id, { status: 'cancelled', resolvedAt: now });
    await closeOffers(ctx, l._id, now);
    return { status: 'cancelled' as const };
  },
});

// ─────────────────────────────────────────── offres

/** Faire (ou refaire) une offre sur l'annonce d'un autre joueur. */
export const offer = mutation({
  args: { sessionToken: v.string(), listingId: v.id('listings'), offered: v.array(itemValidator), note: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, listingId, offered, note }) => {
    const me = await requireUser(ctx, sessionToken);
    const l = await liveListing(ctx, listingId);
    if (l.userId === me._id) throw new ConvexError(fe('listings.22'));
    checkItems(offered, 'offertes');
    // mon offre précédente sur cette annonce est remplacée (son verrou ne compte pas)
    let previous: Doc<'listingOffers'> | null = null;
    let active = 0;
    for (const st of ACTIVE) {
      const list = await ctx.db.query('listingOffers').withIndex('by_from_status', (q) => q.eq('fromUserId', me._id).eq('status', st)).collect();
      for (const o of list) {
        if (o.listingId === l._id) previous = o;
        else if (isLive(await ctx.db.get(o.listingId))) active++;
      }
    }
    if (active >= MAX_ACTIVE_OFFERS) throw new ConvexError(fe('listings.23', { p0: MAX_ACTIVE_OFFERS }));
    await checkFree(ctx, me._id, offered, null, previous?._id);
    const now = Date.now();
    if (previous) await ctx.db.patch(previous._id, { status: 'withdrawn', resolvedAt: now });
    return await ctx.db.insert('listingOffers', {
      listingId: l._id,
      listingUserId: l.userId,
      fromUserId: me._id,
      offered,
      note: note?.trim().slice(0, 140) || undefined,
      status: 'pending',
      createdAt: now,
    });
  },
});

/** L'offrant retire son offre (ou refuse la contre-offre reçue). */
export const withdrawOffer = mutation({
  args: { sessionToken: v.string(), offerId: v.id('listingOffers') },
  handler: async (ctx, { sessionToken, offerId }) => {
    const me = await requireUser(ctx, sessionToken);
    const o = await ctx.db.get(offerId);
    if (!o || !(ACTIVE as readonly string[]).includes(o.status)) throw new ConvexError(fe('listings.24'));
    if (o.fromUserId !== me._id) throw new ConvexError(fe('listings.25'));
    await ctx.db.patch(o._id, { status: 'withdrawn', resolvedAt: Date.now() });
    return { status: 'withdrawn' as const };
  },
});

async function authorOffer(ctx: MutationCtx, sessionToken: string, offerId: Id<'listingOffers'>, statuses: readonly string[]) {
  const me = await requireUser(ctx, sessionToken);
  const o = await ctx.db.get(offerId);
  if (!o || !statuses.includes(o.status)) throw new ConvexError(fe('listings.26'));
  if (o.listingUserId !== me._id) throw new ConvexError(fe('listings.27'));
  const l = await liveListing(ctx, o.listingId);
  return { me, o, l };
}

/** L'auteur accepte une offre : échange atomique de toutes les cartes de l'annonce contre celles de l'offre. */
export const accept = mutation({
  args: { sessionToken: v.string(), offerId: v.id('listingOffers') },
  handler: async (ctx, { sessionToken, offerId }) => {
    const { o, l } = await authorOffer(ctx, sessionToken, offerId, ['pending']);
    return await conclude(ctx, l, o, l.items, o.offered);
  },
});

export const decline = mutation({
  args: { sessionToken: v.string(), offerId: v.id('listingOffers') },
  handler: async (ctx, { sessionToken, offerId }) => {
    const { o } = await authorOffer(ctx, sessionToken, offerId, ACTIVE);
    await ctx.db.patch(o._id, { status: 'declined', resolvedAt: Date.now() });
    return { status: 'declined' as const };
  },
});

/**
 * Contre-offre de l'auteur : `give` = ce qu'il donne (une partie des cartes de l'annonce), `want` = ce qu'il demande à
 * l'offrant (n'importe lesquelles de ses cartes ; rien = cadeau). L'offrant l'accepte (`respondCounter`) ou la refuse.
 */
export const counter = mutation({
  args: { sessionToken: v.string(), offerId: v.id('listingOffers'), give: v.array(itemValidator), want: v.array(itemValidator), note: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, offerId, give, want, note }) => {
    const { o, l } = await authorOffer(ctx, sessionToken, offerId, ACTIVE);
    checkItems(give, 'données');
    checkItems(want, 'demandées', true);
    for (const it of give) {
      const inListing = l.items.find((x) => key(x) === key(it));
      if (!inListing || inListing.count < it.count) throw new ConvexError(fe('listings.28', { p0: nameOf(it.cardId) }));
    }
    const from = await ctx.db.get(o.fromUserId);
    for (const it of want) if ((await ownedCount(ctx, o.fromUserId, it)) < it.count) throw new ConvexError(fe('listings.30', { p0: from?.displayName ?? 'Ce joueur', p1: nameOf(it.cardId) }));
    await ctx.db.patch(o._id, { status: 'countered', counter: { give, want, note: note?.trim().slice(0, 140) || undefined, at: Date.now() } });
    return { status: 'countered' as const };
  },
});

/** L'offrant répond à la contre-offre : accepter = l'échange se fait aux conditions de la contre-offre. */
export const respondCounter = mutation({
  args: { sessionToken: v.string(), offerId: v.id('listingOffers'), accept: v.boolean() },
  handler: async (ctx, { sessionToken, offerId, accept }) => {
    const me = await requireUser(ctx, sessionToken);
    const o = await ctx.db.get(offerId);
    if (!o || o.status !== 'countered' || !o.counter) throw new ConvexError(fe('listings.31'));
    if (o.fromUserId !== me._id) throw new ConvexError(fe('listings.32'));
    if (!accept) {
      await ctx.db.patch(o._id, { status: 'withdrawn', resolvedAt: Date.now() });
      return { status: 'withdrawn' as const };
    }
    const l = await liveListing(ctx, o.listingId);
    return await conclude(ctx, l, o, o.counter.give, o.counter.want);
  },
});

/** Tâche planifiée (crons.ts) : ferme les annonces dont l'heure est passée (et leurs offres). */
export const expireTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query('listings')
      .withIndex('by_status_expires', (q) => q.eq('status', 'open').lte('expiresAt', now))
      .take(100);
    for (const l of due) {
      await ctx.db.patch(l._id, { status: 'expired', resolvedAt: now });
      await closeOffers(ctx, l._id, now);
    }
    return due.length;
  },
});
