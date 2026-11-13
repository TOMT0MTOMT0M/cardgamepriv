import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserByToken, getUserIdByToken, requireUser } from './auth';
import { notify } from './push';
import { catalogCard, rarityValidator, type RarityId } from './cardsCatalog';
import { bumpMissions } from './missions';
import { bumpWeekly, recordFlow } from './econLib';
import { cardsValue } from '../src/core/economy';
import { dropInv, invRev } from './invRev';
import { seenAtOf } from './presence';

const tradeItemValidator = v.object({
  cardId: v.string(),
  rarity: rarityValidator,
  count: v.number(),
});

const MAX_ITEMS_PER_SIDE = 12;

type TradeItem = { cardId: string; rarity: RarityId; count: number };

function checkItems(items: TradeItem[], side: string) {
  if (items.length > MAX_ITEMS_PER_SIDE) throw new ConvexError(fe('trades.1', { p0: MAX_ITEMS_PER_SIDE }));
  const seen = new Set<string>();
  for (const it of items) {
    if (!Number.isInteger(it.count) || it.count < 1 || it.count > 99) throw new ConvexError(fe('trades.2'));
    if (!catalogCard(it.cardId)) throw new ConvexError(fe('trades.3', { p0: side, p1: it.cardId }));
    const k = `${it.cardId}:${it.rarity}`;
    if (seen.has(k)) throw new ConvexError(fe('trades.4'));
    seen.add(k);
  }
}

async function ownedCount(ctx: QueryCtx, userId: Id<'users'>, it: TradeItem): Promise<number> {
  const inv = await ctx.db
    .query('inventory')
    .withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', it.cardId).eq('rarity', it.rarity))
    .unique();
  return inv?.count ?? 0;
}

const nameOf = async (ctx: QueryCtx, id: Id<'users'>) => (await ctx.db.get(id))?.displayName ?? '?';

/**
 * VERROUILLAGE (retours du 3 nov.) : une carte engagée dans une proposition EN ATTENTE (celles que j'offre) ne peut ni
 * être brûlée en contrat, ni être reproposée ailleurs tant que l'autre n'a pas répondu. cardId:rarity → exemplaires engagés.
 */
export async function lockedCards(ctx: QueryCtx, userId: Id<'users'>, except?: Id<'trades'>, exceptOffer?: Id<'listingOffers'>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const lock = (it: TradeItem) => out.set(`${it.cardId}:${it.rarity}`, (out.get(`${it.cardId}:${it.rarity}`) ?? 0) + it.count);
  const outgoing = await ctx.db.query('trades').withIndex('by_fromUser_status', (q) => q.eq('fromUserId', userId).eq('status', 'pending')).collect();
  for (const t of outgoing) {
    if (except && t._id === except) continue;
    t.offered.forEach(lock);
  }
  // TABLEAU D'OFFRES (retours live 02, convex/listings.ts) : cartes de mes annonces ouvertes et de mes offres en cours
  // (une annonce dont l'heure est passée ne verrouille plus rien, même avant que la tâche planifiée ne la ferme)
  const now = Date.now();
  const mine = await ctx.db.query('listings').withIndex('by_user_status', (q) => q.eq('userId', userId).eq('status', 'open')).collect();
  for (const l of mine) if (l.expiresAt > now) l.items.forEach(lock);
  for (const st of ['pending', 'countered'] as const) {
    const offers = await ctx.db.query('listingOffers').withIndex('by_from_status', (q) => q.eq('fromUserId', userId).eq('status', st)).collect();
    for (const o of offers) {
      if (exceptOffer && o._id === exceptOffer) continue;
      const l = await ctx.db.get(o.listingId);
      if (l && l.status === 'open' && l.expiresAt > now) o.offered.forEach(lock);
    }
  }
  return out;
}

/** Vérifie que `offered` est possédé ET libre (pas déjà engagé dans un autre échange en attente). */
async function checkOffered(ctx: QueryCtx, userId: Id<'users'>, offered: TradeItem[], except?: Id<'trades'>) {
  const locked = await lockedCards(ctx, userId, except);
  for (const item of offered) {
    const have = await ownedCount(ctx, userId, item);
    const name = catalogCard(item.cardId)?.name ?? item.cardId;
    if (have < item.count) throw new ConvexError(fe('trades.5', { p0: name }));
    const busy = locked.get(`${item.cardId}:${item.rarity}`) ?? 0;
    if (have - busy < item.count) throw new ConvexError(fe('trades.6', { p0: name }));
  }
}

const SETTLED = ['accepted', 'declined', 'cancelled', 'countered'] as const;

/** Historique : mes échanges terminés (acceptés, refusés, annulés, contre-proposés), les plus récents d'abord. */
export const history = query({
  args: { sessionToken: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { sessionToken, limit }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return [];
    const max = Math.min(limit ?? 30, 100);
    const all = [];
    for (const st of SETTLED) {
      all.push(...(await ctx.db.query('trades').withIndex('by_toUser_status', (q) => q.eq('toUserId', user._id).eq('status', st)).order('desc').take(max)));
      all.push(...(await ctx.db.query('trades').withIndex('by_fromUser_status', (q) => q.eq('fromUserId', user._id).eq('status', st)).order('desc').take(max)));
    }
    all.sort((a, b) => (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt));
    // (audit 12/11, S13 / A7-05) un nom par joueur et par appel (avant : 2 lectures par échange, dont une de moi à chaque fois)
    const names = new Map<string, Promise<string>>();
    const name = (id: Id<'users'>) => {
      let p = names.get(id);
      if (!p) names.set(id, (p = id === user._id ? Promise.resolve(user.displayName) : nameOf(ctx, id)));
      return p;
    };
    return Promise.all(all.slice(0, max).map(async (t) => ({ ...t, fromName: await name(t.fromUserId), toName: await name(t.toUserId) })));
  },
});

/** Envies d'un ami (badges « il la cherche » dans les échanges). */
export const wishlistOf = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => (await ctx.db.get(userId))?.wishlist ?? [],
});

export const myTrades = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const userId = await getUserIdByToken(ctx, sessionToken);
    if (!userId) return { incoming: [], outgoing: [] };

    const incoming = await ctx.db
      .query('trades')
      .withIndex('by_toUser_status', (q) => q.eq('toUserId', userId).eq('status', 'pending'))
      .collect();

    const outgoing = await ctx.db
      .query('trades')
      .withIndex('by_fromUser_status', (q) => q.eq('fromUserId', userId).eq('status', 'pending'))
      .collect();

    // noms affichés (le client n'a pas à recouper avec la liste d'amis)
    const withNames = async (list: typeof incoming) =>
      Promise.all(list.map(async (t) => ({ ...t, fromName: await nameOf(ctx, t.fromUserId), toName: await nameOf(ctx, t.toUserId) })));
    return { incoming: await withNames(incoming), outgoing: await withNames(outgoing) };
  },
});

/** (v1.0.9) même fenêtre « en ligne » que la liste des joueurs (users.ts) */
const OWNER_ONLINE_MS = 6 * 60 * 1000;

/**
 * « CHERCHER UN PROPRIÉTAIRE » (v1.0.9, retours 09/11) : qui possède cette carte — hors moi et comptes bannis — avec les
 * exemplaires LIBRES (pas engagés dans un échange en attente ou une annonce). Lecture seule, index existant
 * `by_card_rarity` (préfixe cardId) : aucun changement de schéma. Doublons d'abord, puis en ligne, puis exemplaires.
 */
export const owners = query({
  args: { sessionToken: v.optional(v.string()), cardId: v.string() },
  handler: async (ctx, { sessionToken, cardId }) => {
    if (!catalogCard(cardId)) return [];
    const me = await getUserIdByToken(ctx, sessionToken);
    const rows = await ctx.db
      .query('inventory')
      .withIndex('by_card_rarity', (q) => q.eq('cardId', cardId))
      .collect();
    const now = Date.now();
    const out: Array<{ userId: Id<'users'>; name: string; avatarUrl?: string; online: boolean; rarity: RarityId; count: number; free: number }> = [];
    for (const r of rows) {
      if (r.count < 1 || r.userId === me) continue;
      const u = await ctx.db.get(r.userId);
      if (!u || u.bannedAt) continue;
      const locked = (await lockedCards(ctx, r.userId)).get(`${r.cardId}:${r.rarity}`) ?? 0;
      out.push({ userId: u._id, name: u.displayName, avatarUrl: u.avatarUrl, online: now - (await seenAtOf(ctx, u)) < OWNER_ONLINE_MS, rarity: r.rarity, count: r.count, free: Math.max(0, r.count - locked) });
    }
    const rank = (o: (typeof out)[number]) => (o.free >= 2 ? 0 : o.free >= 1 ? 1 : 2);
    return out.sort((a, b) => rank(a) - rank(b) || Number(b.online) - Number(a.online) || b.count - a.count || a.name.localeCompare(b.name));
  },
});

export const propose = mutation({
  args: {
    sessionToken: v.string(),
    toUserId: v.id('users'),
    offered: v.array(tradeItemValidator),
    requested: v.array(tradeItemValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, toUserId, offered, requested, note }) => {
    const user = await requireUser(ctx, sessionToken);
    if (user._id === toUserId) {
      throw new ConvexError(fe('trades.7'));
    }
    const target = await ctx.db.get(toUserId);
    if (!target) throw new ConvexError(fe('trades.8'));
    if (!offered.length && !requested.length) throw new ConvexError(fe('trades.9'));
    checkItems(offered, 'proposée');
    checkItems(requested, 'demandée');

    await checkOffered(ctx, user._id, offered);
    for (const item of requested) {
      if ((await ownedCount(ctx, toUserId, item)) < item.count) {
        throw new ConvexError(fe('trades.10', { p0: target.displayName, p1: catalogCard(item.cardId)?.name ?? item.cardId }));
      }
    }

    await bumpMissions(ctx, user, { type: 'trade' });
    await notify(ctx, toUserId, { kind: 'trade', title: `${user.displayName} te propose un échange`, body: `${offered.length} carte(s) contre ${requested.length} : à voir dans Échanges.`, url: '#/echanges' });
    return await ctx.db.insert('trades', {
      fromUserId: user._id,
      toUserId,
      offered,
      requested,
      status: 'pending',
      createdAt: Date.now(),
      note: note?.slice(0, 140) || undefined,
    });
  },
});

export const respond = mutation({
  args: {
    sessionToken: v.string(),
    tradeId: v.id('trades'),
    accept: v.boolean(),
  },
  handler: async (ctx, { sessionToken, tradeId, accept }) => {
    const user = await requireUser(ctx, sessionToken);
    const trade = await ctx.db.get(tradeId);
    if (!trade || trade.status !== 'pending') {
      throw new ConvexError(fe('trades.11'));
    }
    if (trade.toUserId !== user._id) {
      throw new ConvexError(fe('trades.12'));
    }

    const now = Date.now();
    if (!accept) {
      await ctx.db.patch(trade._id, { status: 'declined', resolvedAt: now });
      await notify(ctx, trade.fromUserId, { kind: 'trade', title: `${user.displayName} a décliné ton échange`, body: 'Tu peux lui en proposer un autre.', url: '#/echanges' });
      return { status: 'declined' as const };
    }

    await notify(ctx, trade.fromUserId, { kind: 'trade', title: `${user.displayName} a accepté ton échange !`, body: 'Les cartes sont dans ta collection.', url: '#/echanges' });
    await concludeTrade(ctx, trade, user);
    return { status: 'accepted' as const };
  },
});

/**
 * CONTRE-PROPOSITION : le destinataire modifie l'échange reçu (retire / ajoute des cartes) et le renvoie. L'original
 * passe en `countered`, un nouvel échange part dans l'autre sens : `offered` = ce que je donne, `requested` = ce que je demande.
 */
export const counter = mutation({
  args: {
    sessionToken: v.string(),
    tradeId: v.id('trades'),
    offered: v.array(tradeItemValidator),
    requested: v.array(tradeItemValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { sessionToken, tradeId, offered, requested, note }) => {
    const user = await requireUser(ctx, sessionToken);
    const trade = await ctx.db.get(tradeId);
    if (!trade || trade.status !== 'pending') throw new ConvexError(fe('trades.13'));
    if (trade.toUserId !== user._id) throw new ConvexError(fe('trades.14'));
    if (!offered.length && !requested.length) throw new ConvexError(fe('trades.15'));
    await notify(ctx, trade.fromUserId, { kind: 'trade', title: `${user.displayName} te fait une contre-proposition`, body: 'À voir dans Échanges.', url: '#/echanges' });
    checkItems(offered, 'proposée');
    checkItems(requested, 'demandée');
    const other = await ctx.db.get(trade.fromUserId);
    if (!other) throw new ConvexError(fe('trades.16'));
    await checkOffered(ctx, user._id, offered);
    for (const item of requested) {
      if ((await ownedCount(ctx, other._id, item)) < item.count) throw new ConvexError(fe('trades.17', { p0: other.displayName, p1: catalogCard(item.cardId)?.name ?? item.cardId }));
    }
    const now = Date.now();
    const id = await ctx.db.insert('trades', {
      fromUserId: user._id,
      toUserId: other._id,
      offered,
      requested,
      status: 'pending',
      createdAt: now,
      note: note?.slice(0, 140) || undefined,
      counterOf: trade._id,
    });
    await ctx.db.patch(trade._id, { status: 'countered', resolvedAt: now, counteredBy: id });
    await bumpMissions(ctx, user, { type: 'trade' });
    return id;
  },
});

/** L'auteur d'une proposition peut l'annuler tant qu'elle n'est pas traitée. */
export const cancel = mutation({
  args: { sessionToken: v.string(), tradeId: v.id('trades') },
  handler: async (ctx, { sessionToken, tradeId }) => {
    const user = await requireUser(ctx, sessionToken);
    const trade = await ctx.db.get(tradeId);
    if (!trade || trade.status !== 'pending') throw new ConvexError(fe('trades.18'));
    if (trade.fromUserId !== user._id) throw new ConvexError(fe('trades.19'));
    await ctx.db.patch(trade._id, { status: 'cancelled', resolvedAt: Date.now() });
    return { status: 'cancelled' as const };
  },
});

/**
 * Conclut un échange en attente accepté par son destinataire `user` : vérifie, transfère les cartes dans les deux sens,
 * compteurs, missions, anti-abus, fil. Partagé par `respond` et l'acceptation « Choisir autre chose » (convex/deals.ts).
 */
export async function concludeTrade(ctx: MutationCtx, trade: Doc<'trades'>, user: Doc<'users'>) {
  const now = Date.now();
  const fromUser = await ctx.db.get(trade.fromUserId);
  if (!fromUser) throw new ConvexError(fe('trades.20'));
  // verrouillage (retours live 02) : je ne peux pas donner une carte engagée dans MON annonce ou MON offre en cours
  {
    const mineLocked = await lockedCards(ctx, user._id);
    for (const item of trade.requested) {
      const busy = mineLocked.get(`${item.cardId}:${item.rarity}`) ?? 0;
      if (busy && (await ownedCount(ctx, user._id, item)) - busy < item.count)
        throw new ConvexError(fe('trades.21', { p0: catalogCard(item.cardId)?.name ?? item.cardId }));
    }
  }

  // Verify and transfer offered cards (fromUser -> user)
  for (const item of trade.offered) {
    const src = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) =>
        q.eq('userId', fromUser._id).eq('cardId', item.cardId).eq('rarity', item.rarity),
      )
      .unique();
    if (!src || src.count < item.count) {
      throw new ConvexError(fe('trades.22', { p0: fromUser.displayName }));
    }
    if (src.count === item.count) {
      await dropInv(ctx, src);
    } else {
      await ctx.db.patch(src._id, { count: src.count - item.count, rev: invRev() });
    }

    const dst = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) =>
        q.eq('userId', user._id).eq('cardId', item.cardId).eq('rarity', item.rarity),
      )
      .unique();
    if (dst) {
      await ctx.db.patch(dst._id, { count: dst.count + item.count, lastPulledAt: now, rev: invRev() });
    } else {
      await ctx.db.insert('inventory', {
        userId: user._id,
        cardId: item.cardId,
        rarity: item.rarity,
        count: item.count,
        bestMintNumber: src.bestMintNumber,
        foilSeed: src.foilSeed,
        firstPulledAt: now,
        lastPulledAt: now,
        rev: invRev(),
      });
    }
  }

  // Verify and transfer requested cards (user -> fromUser)
  for (const item of trade.requested) {
    const src = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) =>
        q.eq('userId', user._id).eq('cardId', item.cardId).eq('rarity', item.rarity),
      )
      .unique();
    if (!src || src.count < item.count) {
      throw new ConvexError(fe('trades.23'));
    }
    if (src.count === item.count) {
      await dropInv(ctx, src);
    } else {
      await ctx.db.patch(src._id, { count: src.count - item.count, rev: invRev() });
    }

    const dst = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) =>
        q.eq('userId', fromUser._id).eq('cardId', item.cardId).eq('rarity', item.rarity),
      )
      .unique();
    if (dst) {
      await ctx.db.patch(dst._id, { count: dst.count + item.count, lastPulledAt: now, rev: invRev() });
    } else {
      await ctx.db.insert('inventory', {
        userId: fromUser._id,
        cardId: item.cardId,
        rarity: item.rarity,
        count: item.count,
        bestMintNumber: src.bestMintNumber,
        foilSeed: src.foilSeed,
        firstPulledAt: now,
        lastPulledAt: now,
        rev: invRev(),
      });
    }
  }

  await ctx.db.patch(trade._id, { status: 'accepted', resolvedAt: now });
  await ctx.db.patch(user._id, { totalTrades: (user.totalTrades ?? 0) + 1 });
  await ctx.db.patch(fromUser._id, { totalTrades: (fromUser.totalTrades ?? 0) + 1 });
  await bumpMissions(ctx, user, { type: 'trade' });
  await bumpWeekly(ctx, user._id, { type: 'trade' });
  await bumpWeekly(ctx, fromUser._id, { type: 'trade' });
  // anti-abus : valeur échangée dans chaque sens (alertes du panneau admin, jamais de blocage)
  await recordFlow(ctx, fromUser._id, user._id, cardsValue(trade.offered), 'trade');
  await recordFlow(ctx, user._id, fromUser._id, cardsValue(trade.requested), 'trade');
  await ctx.db.insert('activityFeed', {
    userId: user._id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    kind: 'trade',
    message: `${user.displayName} et ${fromUser.displayName} ont conclu un échange !`,
    createdAt: now,
  });

}
