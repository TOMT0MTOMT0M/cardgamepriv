import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { catalogCard, rarityValidator } from './cardsCatalog';

/**
 * CLASSEURS PERSO (retours du 3 nov.) : nommés librement (« Rois »), une carte peut être dans plusieurs classeurs,
 * couverture choisie, ordre manuel, 1 classeur épinglé affiché sur le profil (visible des potes).
 */
export const BINDER_MAX = 30;
export const BINDER_CARDS_MAX = 500;
/** classeurs épinglés sur le profil, au plus (sondage 11/11 : « afficher 2/3 classeurs ») */
export const BINDER_PINS_MAX = 3;
const cardValidator = v.object({ cardId: v.string(), rarity: rarityValidator });

const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 32);

export const mine = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const userId = await getUserIdByToken(ctx, sessionToken);
    if (!userId) return [];
    const list = await ctx.db.query('binders').withIndex('by_user', (q) => q.eq('userId', userId)).collect();
    return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt - b.createdAt);
  },
});

/** Classeurs épinglés d'un joueur (profil public), du plus ancien au plus récent, BINDER_PINS_MAX au plus. */
export async function pinnedOf(ctx: { db: QueryCtx['db'] }, userId: Id<'users'>): Promise<Doc<'binders'>[]> {
  const list = await ctx.db.query('binders').withIndex('by_user', (q) => q.eq('userId', userId)).collect();
  return list
    .filter((b) => b.pinned)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, BINDER_PINS_MAX);
}

async function own(ctx: MutationCtx, sessionToken: string, binderId: Id<'binders'>) {
  const user = await requireUser(ctx, sessionToken);
  const b = await ctx.db.get(binderId);
  if (!b || b.userId !== user._id) throw new ConvexError('Classeur introuvable.');
  return { user, b };
}

async function checkOwned(ctx: MutationCtx, userId: Id<'users'>, cards: Array<{ cardId: string; rarity: Doc<'inventory'>['rarity'] }>) {
  for (const c of cards) {
    if (!catalogCard(c.cardId)) throw new ConvexError('Carte inconnue.');
    const inv = await ctx.db
      .query('inventory')
      .withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', c.cardId).eq('rarity', c.rarity))
      .unique();
    if (!inv || inv.count < 1) throw new ConvexError(`Tu n’as pas ${catalogCard(c.cardId)?.name ?? 'cette carte'}.`);
  }
}

export const create = mutation({
  args: { sessionToken: v.string(), name: v.string(), cards: v.optional(v.array(cardValidator)) },
  handler: async (ctx, { sessionToken, name, cards }) => {
    const user = await requireUser(ctx, sessionToken);
    const n = cleanName(name);
    if (!n) throw new ConvexError('Donne un nom à ton classeur.');
    const count = (await ctx.db.query('binders').withIndex('by_user', (q) => q.eq('userId', user._id)).collect()).length;
    if (count >= BINDER_MAX) throw new ConvexError(`${BINDER_MAX} classeurs au maximum.`);
    const list = cards ?? [];
    await checkOwned(ctx, user._id, list);
    const now = Date.now();
    return await ctx.db.insert('binders', { userId: user._id, name: n, cards: list, pinned: false, createdAt: now, updatedAt: now });
  },
});

export const rename = mutation({
  args: { sessionToken: v.string(), binderId: v.id('binders'), name: v.string() },
  handler: async (ctx, { sessionToken, binderId, name }) => {
    const { b } = await own(ctx, sessionToken, binderId);
    const n = cleanName(name);
    if (!n) throw new ConvexError('Donne un nom à ton classeur.');
    await ctx.db.patch(b._id, { name: n, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), binderId: v.id('binders') },
  handler: async (ctx, { sessionToken, binderId }) => {
    const { b } = await own(ctx, sessionToken, binderId);
    await ctx.db.delete(b._id);
  },
});

/** Remplace le contenu (ajout, retrait, réordonnancement manuel). */
export const setCards = mutation({
  args: { sessionToken: v.string(), binderId: v.id('binders'), cards: v.array(cardValidator) },
  handler: async (ctx, { sessionToken, binderId, cards }) => {
    const { user, b } = await own(ctx, sessionToken, binderId);
    // une carte au plus une fois par classeur
    const seen = new Set<string>();
    const list = cards.filter((c) => {
      const k = `${c.cardId}:${c.rarity}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (list.length > BINDER_CARDS_MAX) throw new ConvexError(`${BINDER_CARDS_MAX} cartes au maximum par classeur.`);
    await checkOwned(ctx, user._id, list);
    const cover = b.coverCardId && list.some((c) => c.cardId === b.coverCardId) ? b.coverCardId : undefined;
    await ctx.db.patch(b._id, { cards: list, coverCardId: cover, updatedAt: Date.now() });
  },
});

/** Ajoute (ou retire si déjà dedans) une carte : le « + Classeur » de la carte focus. */
export const toggleCard = mutation({
  args: { sessionToken: v.string(), binderId: v.id('binders'), card: cardValidator },
  handler: async (ctx, { sessionToken, binderId, card }) => {
    const { user, b } = await own(ctx, sessionToken, binderId);
    const k = `${card.cardId}:${card.rarity}`;
    const has = b.cards.some((c) => `${c.cardId}:${c.rarity}` === k);
    const list = has ? b.cards.filter((c) => `${c.cardId}:${c.rarity}` !== k) : [...b.cards, card];
    if (!has) {
      if (list.length > BINDER_CARDS_MAX) throw new ConvexError(`${BINDER_CARDS_MAX} cartes au maximum par classeur.`);
      await checkOwned(ctx, user._id, [card]);
    }
    const cover = b.coverCardId && list.some((c) => c.cardId === b.coverCardId) ? b.coverCardId : undefined;
    await ctx.db.patch(b._id, { cards: list, coverCardId: cover, updatedAt: Date.now() });
    return { added: !has };
  },
});

export const setCover = mutation({
  args: { sessionToken: v.string(), binderId: v.id('binders'), cardId: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, binderId, cardId }) => {
    const { b } = await own(ctx, sessionToken, binderId);
    if (cardId && !b.cards.some((c) => c.cardId === cardId)) throw new ConvexError('La couverture doit être une carte du classeur.');
    await ctx.db.patch(b._id, { coverCardId: cardId, updatedAt: Date.now() });
  },
});

/** Épingle ce classeur sur le profil (BINDER_PINS_MAX au plus, les autres restent épinglés) ; `on: false` le désépingle. */
export const pin = mutation({
  args: { sessionToken: v.string(), binderId: v.id('binders'), on: v.boolean() },
  handler: async (ctx, { sessionToken, binderId, on }) => {
    const { user, b } = await own(ctx, sessionToken, binderId);
    const list = await ctx.db.query('binders').withIndex('by_user', (q) => q.eq('userId', user._id)).collect();
    if (on && !b.pinned && list.filter((x) => x.pinned).length >= BINDER_PINS_MAX) throw new ConvexError(`${BINDER_PINS_MAX} classeurs au plus sur ton profil : retires-en un d’abord.`);
    await ctx.db.patch(b._id, { pinned: on, updatedAt: Date.now() });
  },
});
