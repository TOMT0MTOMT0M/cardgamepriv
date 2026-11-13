import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserByToken, requireUser } from './auth';
import { catalogCard, rarityValidator, type RarityId } from './cardsCatalog';
import { concludeTrade, lockedCards } from './trades';
import { notify } from './push';
import { bumpMissions } from './missions';
import {
  DEAL_ALTS,
  DEAL_LACK_CHECKS,
  DEALS_MAX,
  DEALS_OWNERS_TRY,
  DEALS_WISH_SCAN,
  PICK_MAX,
  PROTECT_MAX,
  THEY_WANT_MAX,
  proposable,
  rankGives,
  SOLD_AVG_N,
  soldStats,
  type CardPanel,
  type Deal,
  type DealCard,
  type ForYou,
  type PickOption,
  type TheyWant,
} from '../src/core/deals';
import { seenAtAll, seenAtOf } from './presence';
import { wishersOf, wishesReady } from './wishes';

/**
 * REFONTE DES ÉCHANGES (11/11) — règles : src/core/deals.ts.
 *  - `cardPanel` : sous une carte, qui l'a (doublon ou non, en ligne), qui la vend et à quel prix, qui la veut.
 *  - `forYou` : RECOUPEMENT À LA DEMANDE (pas d'abonnement) — mes envies × les doublons proposables de tous les joueurs,
 *    même étoile → des échanges prêts, contrepartie choisie automatiquement ; + « ils cherchent tes doublons ».
 *  - `quick` : « Demander » en un toucher (1 contre 1, même étoile ; le côté manquant est choisi par le serveur).
 *  - `swapGive` (demandeur) / `pickOptions` + `acceptPick` (destinataire : « Choisir autre chose ») / `setProtect`.
 * Coût : lectures par index seulement, jamais d'inventaire complet d'un autre joueur sauf au toucher (`quick` sans
 * `get`, `pickOptions`) ; chaque requête renvoie `reads` (documents lus) — mesuré dans convex/deals.test.ts.
 */

/** même fenêtre « en ligne » que la liste des joueurs (users.ts) */
const ONLINE_MS = 6 * 60 * 1000;
const key = (c: { cardId: string; rarity: string }) => `${c.cardId}:${c.rarity}`;
const guardOf = (u: Doc<'users'>) => ({ protected: u.tradeProtected, wishlist: u.wishlist });
const cardName = (id: string) => catalogCard(id)?.name ?? id;
const starOf = (r: RarityId) => (r === 'secret' ? 'Bébou' : `${['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(r) + 1}★`);

/**
 * Compteur de documents lus (mesure du coût) : enveloppe `ctx.db` — get / unique / first comptent 1, collect / take
 * comptent les lignes rendues. Lecture seule : seulement pour les requêtes.
 */
function counting<C extends QueryCtx>(ctx: C): { ctx: C; reads: () => number } {
  let n = 0;
  type Any = Record<string | symbol, unknown>;
  const wrap = (q: object): object =>
    new Proxy(q, {
      get(t: Any, p) {
        const f = t[p];
        if (typeof f !== 'function') return f;
        return (...a: unknown[]) => {
          const r = (f as (...x: unknown[]) => unknown).apply(t, a);
          if (p === 'collect' || p === 'take') return (r as Promise<unknown[]>).then((x) => ((n += x.length), x));
          if (p === 'unique' || p === 'first') return (r as Promise<unknown>).then((x) => ((n += x ? 1 : 0), x));
          return r && typeof r === 'object' && typeof (r as Any).then !== 'function' ? wrap(r) : r;
        };
      },
    });
  const db = new Proxy(ctx.db as unknown as Any, {
    get(t, p) {
      const f = t[p];
      if (p === 'get') return (...a: unknown[]) => (f as (...x: unknown[]) => Promise<unknown>).apply(t, a).then((x) => ((n += x ? 1 : 0), x));
      if (p === 'query') return (...a: unknown[]) => wrap((f as (...x: unknown[]) => object).apply(t, a));
      return typeof f === 'function' ? (f as (...x: unknown[]) => unknown).bind(t) : f;
    },
  });
  return { ctx: { ...ctx, db } as unknown as C, reads: () => n };
}

async function invRow(ctx: QueryCtx, userId: Id<'users'>, c: DealCard) {
  return await ctx.db
    .query('inventory')
    .withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', c.cardId).eq('rarity', c.rarity))
    .unique();
}

/** Mes doublons proposables d'une étoile (inventaire complet : seulement le mien, ou au toucher). */
async function proposableOf(ctx: QueryCtx, u: Doc<'users'>, rarity?: RarityId, except?: Id<'trades'>): Promise<DealCard[]> {
  // (audit 12/11, A7-21) une étoile demandée : seules les lignes de cette étoile sont lues (avant : tout l'inventaire
  // du joueur à chaque toucher, jusqu'à 1,2 Mo chez un grand collectionneur)
  const inv = rarity
    ? await ctx.db.query('inventory').withIndex('by_user_rarity', (q) => q.eq('userId', u._id).eq('rarity', rarity)).collect()
    : await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', u._id)).collect();
  const locked = await lockedCards(ctx, u._id, except);
  const g = guardOf(u);
  return inv
    .filter((r) => (!rarity || r.rarity === rarity) && catalogCard(r.cardId) && proposable(r, locked.get(key(r)) ?? 0, g) > 0)
    .sort((a, b) => b.count - a.count || a.cardId.localeCompare(b.cardId))
    .map((r) => ({ cardId: r.cardId, rarity: r.rarity }));
}

// ─────────────────────────────── les autres joueurs, lus à la demande
/**
 * (audit 12/11, décision 10) Accès aux AUTRES joueurs pour une requête. Index des envies prêt (convex/wishes.ts) :
 * chaque joueur n'est lu que s'il sert (propriétaire, vendeur, demandeur), une fois, avec sa carte de présence pour
 * « en ligne ». Sinon (avant la migration) : tous les joueurs relus d'un coup, comme avant.
 */
type Person = { u: Doc<'users'>; online: boolean };
async function peopleOf(ctx: QueryCtx, lazy: boolean, now: number): Promise<{ get: (id: Id<'users'>) => Promise<Person | null>; all: () => Promise<Person[]> }> {
  const cache = new Map<string, Person | null>();
  if (!lazy) {
    const seen = await seenAtAll(ctx);
    for (const u of await ctx.db.query('users').collect()) cache.set(u._id, u.bannedAt ? null : { u, online: now - seen(u) < ONLINE_MS });
    return { get: async (id) => cache.get(id) ?? null, all: async () => [...cache.values()].filter((p): p is Person => !!p) };
  }
  const get = async (id: Id<'users'>) => {
    let p = cache.get(id);
    if (p === undefined) {
      const u = await ctx.db.get(id);
      p = !u || u.bannedAt ? null : { u, online: now - (await seenAtOf(ctx, u)) < ONLINE_MS };
      cache.set(id, p);
    }
    return p;
  };
  return { get, all: async () => [...cache.values()].filter((p): p is Person => !!p) };
}

// ─────────────────────────────── « Chez les joueurs » (fiche d'une carte)
export const cardPanel = query({
  args: { sessionToken: v.optional(v.string()), cardId: v.string() },
  handler: async (raw, { sessionToken, cardId }): Promise<CardPanel> => {
    const { ctx, reads } = counting(raw);
    const me = await getUserByToken(ctx, sessionToken);
    if (!catalogCard(cardId)) return { owners: [], sellers: [], wanters: [], protected: false, reads: reads() };
    const now = Date.now();
    const lazy = await wishesReady(ctx);
    const people = await peopleOf(ctx, lazy, now);
    const rows = await ctx.db.query('inventory').withIndex('by_card_rarity', (q) => q.eq('cardId', cardId)).collect();
    const owners: CardPanel['owners'] = [];
    for (const r of rows) {
      const p = await people.get(r.userId);
      if (!p || r.count < 1 || p.u._id === me?._id) continue;
      owners.push({ userId: p.u._id, name: p.u.displayName, avatarUrl: p.u.avatarUrl, online: p.online, count: r.count, dup: proposable(r, 0, guardOf(p.u)) > 0 });
    }
    owners.sort((a, b) => Number(b.dup) - Number(a.dup) || Number(b.online) - Number(a.online) || b.count - a.count || a.name.localeCompare(b.name));
    // marché : les annonces ouvertes de cette carte (index by_card_status ; avant : les 300 dernières annonces, filtrées)
    const open = lazy
      ? await ctx.db.query('market').withIndex('by_card_status', (q) => q.eq('cardId', cardId).eq('status', 'open')).order('desc').collect()
      : (await ctx.db.query('market').withIndex('by_status_created', (q) => q.eq('status', 'open')).order('desc').take(300)).filter((m) => m.cardId === cardId);
    const sellers: CardPanel['sellers'] = [];
    for (const m of open) {
      const p = await people.get(m.sellerId);
      if (p) sellers.push({ id: m._id as string, sellerId: m.sellerId as string, name: p.u.displayName, price: m.price, mintNumber: m.mintNumber });
    }
    sellers.sort((a, b) => a.price - b.price);
    // (13/11) prix de référence : moyenne des dernières ventes de la carte (≤ SOLD_AVG_N lectures, même index)
    const soldRows = await ctx.db.query('market').withIndex('by_card_status', (q) => q.eq('cardId', cardId).eq('status', 'sold')).order('desc').take(SOLD_AVG_N);
    const sold = soldStats(soldRows.map((m) => m.price));
    // qui la veut : par l'index des envies (avant : la liste d'envies de tous les joueurs)
    const wishers: Person[] = [];
    if (lazy) for (const id of await wishersOf(ctx, cardId)) {
      const p = await people.get(id);
      if (p && (p.u.wishlist ?? []).includes(cardId)) wishers.push(p);
    }
    else wishers.push(...(await people.all()).filter((p) => (p.u.wishlist ?? []).includes(cardId)));
    const wanters = wishers
      .filter((p) => p.u._id !== me?._id)
      .map((p) => ({ userId: p.u._id as string, name: p.u.displayName, avatarUrl: p.u.avatarUrl, online: p.online }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    return { owners, sellers, wanters, protected: !!me?.tradeProtected?.includes(cardId), ...(sold ? { sold } : {}), reads: reads() };
  },
});

// ─────────────────────────────── « Pour toi » : le recoupement
/** doublons envoyés par le client : au plus tant de lignes (les plus fournies d'abord) */
const GIVE_MAX = 600;
/** « ils cherchent tes doublons » : au plus tant de mes cartes proposables confrontées à l'index des envies */
const THEY_WANT_SCAN = 300;

export const forYou = query({
  /**
   * (audit 12/11, décision 10 / A7-02) `give` (client V2) : mes lignes en double, que le client connaît déjà — le
   * serveur ne relit plus toute ma collection (≈ 4 700 lignes) à chaque ouverture de la vue. Rien n'est cru sur parole :
   * ce ne sont que des suggestions, `quick` / `propose` revérifient l'inventaire réel. Sans `give` (client V1) : comme avant.
   */
  args: { sessionToken: v.optional(v.string()), give: v.optional(v.array(v.object({ cardId: v.string(), rarity: rarityValidator, count: v.number() }))) },
  handler: async (raw, { sessionToken, give }): Promise<ForYou> => {
    const { ctx, reads } = counting(raw);
    const now = Date.now();
    const me = await getUserByToken(ctx, sessionToken);
    if (!me) return { deals: [], theyWant: [], reads: reads(), at: now };
    const lazy = await wishesReady(ctx);
    const people = await peopleOf(ctx, lazy, now);
    const other = async (id: Id<'users'>) => (id === me._id ? null : await people.get(id));
    const myRows: Array<{ cardId: string; rarity: RarityId; count: number }> = give
      ? give.slice(0, GIVE_MAX).filter((r) => Number.isFinite(r.count) && r.count > 1)
      : await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', me._id)).collect();
    const mine = new Map(myRows.map((r) => [key(r), r]));
    /** ai-je déjà cette carte ? (avec `give`, seules mes lignes en double sont connues : le reste se lit par l'index) */
    const iHave = async (c: DealCard) => (mine.get(key(c))?.count ?? (give ? ((await invRow(ctx, me._id, c))?.count ?? 0) : 0)) > 0;
    const myLocked = await lockedCards(ctx, me._id);
    const g = guardOf(me);
    const gives = new Map<RarityId, DealCard[]>();
    /** mes cartes proposables, les plus fournies d'abord (une ligne par carte et rareté, même si `give` en répète) */
    const myProp = new Map<string, DealCard>();
    for (const r of [...(give ? mine.values() : myRows)].sort((a, b) => b.count - a.count)) {
      if (!catalogCard(r.cardId) || proposable(r, myLocked.get(key(r)) ?? 0, g) <= 0) continue;
      if (!gives.has(r.rarity)) gives.set(r.rarity, []);
      gives.get(r.rarity)!.push({ cardId: r.cardId, rarity: r.rarity });
      if (!give) continue;
      myProp.set(r.cardId, { cardId: r.cardId, rarity: r.rarity });
    }
    // déjà demandé (en attente) : pas proposé une seconde fois
    const asked = new Set<string>();
    for (const t of await ctx.db.query('trades').withIndex('by_fromUser_status', (q) => q.eq('fromUserId', me._id).eq('status', 'pending')).collect())
      for (const it of t.requested) asked.add(`${t.toUserId}|${it.cardId}`);
    const lockCache = new Map<string, Map<string, number>>();
    const lockOf = async (id: Id<'users'>) => {
      let l = lockCache.get(id);
      if (!l) lockCache.set(id, (l = await lockedCards(ctx, id)));
      return l;
    };
    const hasCache = new Map<string, boolean>();
    const has = async (id: Id<'users'>, c: DealCard) => {
      const k = `${id}|${key(c)}`;
      let x = hasCache.get(k);
      if (x === undefined) hasCache.set(k, (x = ((await invRow(ctx, id, c))?.count ?? 0) > 0));
      return x;
    };

    const deals: Deal[] = [];
    const wishes: string[] = [];
    for (const id of me.wishlist ?? []) {
      if (wishes.length >= DEALS_WISH_SCAN) break;
      const c = catalogCard(id);
      if (c && c.baseRarity !== 'secret' && gives.get(c.baseRarity)?.length && !(await iHave({ cardId: id, rarity: c.baseRarity }))) wishes.push(id);
    }
    for (const cardId of wishes) {
      if (deals.length >= DEALS_MAX) break;
      const rows = await ctx.db.query('inventory').withIndex('by_card_rarity', (q) => q.eq('cardId', cardId)).collect();
      const cands: Array<{ u: Doc<'users'>; online: boolean; r: Doc<'inventory'> }> = [];
      for (const r of rows) {
        const p = await other(r.userId);
        if (!p || asked.has(`${p.u._id}|${cardId}`) || proposable(r, 0, guardOf(p.u)) <= 0) continue;
        cands.push({ ...p, r });
      }
      cands.sort((a, b) => Number(b.online) - Number(a.online) || b.r.count - a.r.count);
      for (const { u, online, r } of cands.slice(0, DEALS_OWNERS_TRY)) {
        if (proposable(r, (await lockOf(u._id)).get(key(r)) ?? 0, guardOf(u)) <= 0) continue;
        const theirWish = new Set(u.wishlist ?? []);
        const ok: DealCard[] = [];
        for (const c of rankGives(gives.get(r.rarity) ?? [], theirWish).slice(0, DEAL_LACK_CHECKS)) {
          if (!(await has(u._id, c))) ok.push(c);
          if (ok.length > DEAL_ALTS) break;
        }
        if (!ok.length) continue;
        deals.push({ userId: u._id, name: u.displayName, avatarUrl: u.avatarUrl, online, get: { cardId, rarity: r.rarity }, give: ok[0], alts: ok.slice(1).map((c) => c.cardId), theyWish: theirWish.has(ok[0].cardId) });
        break;
      }
    }

    // ils cherchent mes doublons (et ne les ont pas) : à moi de proposer, le serveur choisira sa contrepartie
    const theyWant: TheyWant[] = [];
    // (sans `give` : même construction qu'avant, étoile par étoile — une carte possédée à deux raretés garde la dernière)
    if (!give) for (const l of gives.values()) for (const c of l) myProp.set(c.cardId, c);
    // joueurs en ligne d'abord, puis du plus ancien au plus récent ; pour chacun, dans l'ordre de sa liste d'envies
    const pairs: Array<{ p: Person; id: string }> = [];
    if (lazy) {
      for (const id of [...myProp.keys()].slice(0, THEY_WANT_SCAN))
        for (const uid of await wishersOf(ctx, id)) {
          const p = await other(uid);
          if (p && (p.u.wishlist ?? []).includes(id)) pairs.push({ p, id });
        }
    } else for (const p of await people.all()) if (p.u._id !== me._id) for (const id of p.u.wishlist ?? []) if (myProp.has(id)) pairs.push({ p, id });
    pairs.sort((a, b) => Number(b.p.online) - Number(a.p.online) || a.p.u._creationTime - b.p.u._creationTime || (a.p.u.wishlist ?? []).indexOf(a.id) - (b.p.u.wishlist ?? []).indexOf(b.id));
    for (const { p, id } of pairs) {
      if (theyWant.length >= THEY_WANT_MAX) break;
      const c = myProp.get(id)!;
      if (deals.some((d) => d.userId === p.u._id && d.give.cardId === id) || (await has(p.u._id, c))) continue;
      theyWant.push({ userId: p.u._id, name: p.u.displayName, avatarUrl: p.u.avatarUrl, online: p.online, card: c });
    }
    return { deals, theyWant, reads: reads(), at: now };
  },
});

// ─────────────────────────────── « Demander » en un toucher
const dealCard = v.object({ cardId: v.string(), rarity: rarityValidator });

/** Choisit, chez `owner`, la contrepartie pour `other` : une carte proposable de l'étoile, qui lui manque, ses envies d'abord. */
async function autoPick(ctx: QueryCtx, owner: Doc<'users'>, other: Doc<'users'>, rarity: RarityId, avoid?: string): Promise<DealCard | null> {
  const cands = rankGives((await proposableOf(ctx, owner, rarity)).filter((c) => c.cardId !== avoid), new Set(other.wishlist ?? []));
  for (const c of cands.slice(0, DEAL_LACK_CHECKS * 2)) if (!((await invRow(ctx, other._id, c))?.count)) return c;
  return null;
}

export const quick = mutation({
  args: { sessionToken: v.string(), toUserId: v.id('users'), get: v.optional(dealCard), give: v.optional(dealCard) },
  handler: async (ctx, { sessionToken, toUserId, get, give }) => {
    const me = await requireUser(ctx, sessionToken);
    if (me._id === toUserId) throw new ConvexError('Impossible d’échanger avec soi-même.');
    const other = await ctx.db.get(toUserId);
    if (!other || other.bannedAt) throw new ConvexError('Joueur introuvable.');
    if (!get && !give) throw new ConvexError('Échange vide.');
    for (const c of [get, give]) {
      if (!c) continue;
      const cat = catalogCard(c.cardId);
      if (!cat || cat.baseRarity !== c.rarity) throw new ConvexError('Carte inconnue.');
      if (c.rarity === 'secret') throw new ConvexError('Les cartes Bébou ne s’échangent pas en un toucher : compose l’échange toi-même.');
    }
    if (get && give && get.rarity !== give.rarity) throw new ConvexError('Échange en un toucher : deux cartes de même étoile.');
    const rarity = (get ?? give)!.rarity;
    if (!give) {
      give = (await autoPick(ctx, me, other, rarity, get!.cardId)) ?? undefined;
      if (!give) throw new ConvexError(`Tu n’as pas de doublon ${starOf(rarity)} libre qui manque à ${other.displayName} : compose l’échange toi-même.`);
    }
    if (!get) {
      get = (await autoPick(ctx, other, me, rarity, give.cardId)) ?? undefined;
      if (!get) throw new ConvexError(`${other.displayName} n’a pas de doublon ${starOf(rarity)} libre qui te manque.`);
    }
    // ce que je donne : à moi, libre (pas engagé ailleurs) ; ce que je demande : chez lui
    const mineRow = await invRow(ctx, me._id, give);
    const busy = (await lockedCards(ctx, me._id)).get(key(give)) ?? 0;
    if (!mineRow || mineRow.count - busy < 1) throw new ConvexError(`${cardName(give.cardId)} n’est plus libre chez toi.`);
    if (!((await invRow(ctx, other._id, get))?.count)) throw new ConvexError(`${other.displayName} n’a pas (ou plus) ${cardName(get.cardId)}.`);
    const pending = await ctx.db.query('trades').withIndex('by_fromUser_status', (q) => q.eq('fromUserId', me._id).eq('status', 'pending')).collect();
    if (pending.some((t) => t.toUserId === other._id && t.requested.some((it) => it.cardId === get!.cardId))) throw new ConvexError(`Tu as déjà demandé ${cardName(get.cardId)} à ${other.displayName}.`);
    const id = await ctx.db.insert('trades', {
      fromUserId: me._id,
      toUserId: other._id,
      offered: [{ ...give, count: 1 }],
      requested: [{ ...get, count: 1 }],
      status: 'pending',
      quick: true,
      createdAt: Date.now(),
    });
    await bumpMissions(ctx, me, { type: 'trade' });
    await notify(ctx, other._id, { kind: 'trade', title: `${me.displayName} te demande ${cardName(get.cardId)}`, body: `Contre ${cardName(give.cardId)} (${starOf(rarity)}). Accepter, choisir autre chose ou refuser : dans Échanges.`, url: '#/echanges' });
    return { id: id as string, give, get };
  },
});

/** Quick trade en attente, côté demandeur ou destinataire. */
async function quickTrade(ctx: MutationCtx | QueryCtx, tradeId: Id<'trades'>) {
  const t = await ctx.db.get(tradeId);
  if (!t || t.status !== 'pending') throw new ConvexError('Échange introuvable ou déjà traité.');
  if (!t.quick || t.offered.length !== 1 || t.requested.length !== 1) throw new ConvexError('Cet échange se modifie dans le composeur.');
  return t;
}

/** Le demandeur change ce qu'il donne (même étoile, une carte libre à lui) tant que l'autre n'a pas répondu. */
export const swapGive = mutation({
  args: { sessionToken: v.string(), tradeId: v.id('trades'), cardId: v.string() },
  handler: async (ctx, { sessionToken, tradeId, cardId }) => {
    const me = await requireUser(ctx, sessionToken);
    const t = await quickTrade(ctx, tradeId);
    if (t.fromUserId !== me._id) throw new ConvexError('Seul le demandeur peut changer sa contrepartie.');
    const r = t.offered[0].rarity;
    if (catalogCard(cardId)?.baseRarity !== r) throw new ConvexError(`Il faut une carte ${starOf(r)}.`);
    const c = { cardId, rarity: r };
    const row = await invRow(ctx, me._id, c);
    const busy = (await lockedCards(ctx, me._id, t._id)).get(key(c)) ?? 0;
    if (!row || row.count - busy < 1) throw new ConvexError(`${cardName(cardId)} n’est pas libre chez toi.`);
    await ctx.db.patch(t._id, { offered: [{ ...c, count: 1 }] });
  },
});

/** « Choisir autre chose » : les doublons proposables du demandeur, même étoile (ceux qui me manquent d'abord). */
export const pickOptions = query({
  args: { sessionToken: v.optional(v.string()), tradeId: v.id('trades') },
  handler: async (raw, { sessionToken, tradeId }): Promise<{ options: PickOption[]; reads: number }> => {
    const { ctx, reads } = counting(raw);
    const me = await getUserByToken(ctx, sessionToken);
    const t = await ctx.db.get(tradeId);
    if (!me || !t || t.status !== 'pending' || !t.quick || t.toUserId !== me._id) return { options: [], reads: reads() };
    const from = await ctx.db.get(t.fromUserId);
    if (!from) return { options: [], reads: reads() };
    const cands = rankGives(await proposableOf(ctx, from, t.offered[0].rarity, t._id), new Set(me.wishlist ?? [])).slice(0, PICK_MAX);
    const options: PickOption[] = [];
    for (const c of cands) options.push({ ...c, lacking: !((await invRow(ctx, me._id, c))?.count) });
    options.sort((a, b) => Number(b.lacking) - Number(a.lacking));
    return { options, reads: reads() };
  },
});

/** Le destinataire choisit une autre carte parmi les doublons proposables du demandeur, et l'échange est conclu. */
export const acceptPick = mutation({
  args: { sessionToken: v.string(), tradeId: v.id('trades'), cardId: v.string() },
  handler: async (ctx, { sessionToken, tradeId, cardId }) => {
    const me = await requireUser(ctx, sessionToken);
    const t = await quickTrade(ctx, tradeId);
    if (t.toUserId !== me._id) throw new ConvexError('Seul le destinataire peut répondre à cet échange.');
    const from = await ctx.db.get(t.fromUserId);
    if (!from) throw new ConvexError('Joueur introuvable.');
    const before = t.offered[0];
    const c = { cardId, rarity: before.rarity };
    if (catalogCard(cardId)?.baseRarity !== c.rarity) throw new ConvexError(`Il faut une carte ${starOf(c.rarity)}.`);
    if (cardId !== before.cardId) {
      // seulement un doublon PROPOSABLE du demandeur (il a dit oui d'avance à ceux-là, pas aux cartes qu'il garde)
      const row = await invRow(ctx, from._id, c);
      const locked = (await lockedCards(ctx, from._id, t._id)).get(key(c)) ?? 0;
      if (!row || proposable(row, locked, guardOf(from)) < 1) throw new ConvexError(`${from.displayName} garde ${cardName(cardId)} : choisis-en une autre.`);
    }
    const trade = { ...t, offered: [{ ...c, count: 1 }] };
    await ctx.db.patch(t._id, { offered: trade.offered });
    await concludeTrade(ctx, trade, me);
    const changed = cardId !== before.cardId;
    await notify(ctx, from._id, { kind: 'trade', title: `${me.displayName} a accepté ton échange !`, body: changed ? `Il a choisi ${cardName(cardId)} au lieu de ${cardName(before.cardId)}.` : 'Les cartes sont dans ta collection.', url: '#/echanges' });
    return { status: 'accepted' as const, changed };
  },
});

// ─────────────────────────────── protéger / proposer
export const setProtect = mutation({
  args: { sessionToken: v.string(), cardId: v.string(), on: v.boolean() },
  handler: async (ctx, { sessionToken, cardId, on }) => {
    const me = await requireUser(ctx, sessionToken);
    if (!catalogCard(cardId)) throw new ConvexError('Carte inconnue.');
    const list = (me.tradeProtected ?? []).filter((id) => id !== cardId);
    if (on) list.push(cardId);
    if (list.length > PROTECT_MAX) throw new ConvexError(`${PROTECT_MAX} cartes protégées au maximum.`);
    await ctx.db.patch(me._id, { tradeProtected: list });
    return list;
  },
});
