import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { CATALOG_CARDS, catalogCard } from './cardsCatalog';
import type { RarityId } from './cardsCatalog';
import { PURGED_CARD_IDS } from './purgedCards';
import { isBigPull } from './feed';
import { dropInv, invRev } from './invRev';
import { ensurePresence } from './presence';
import { markWishesReady, syncWishes } from './wishes';
import { parseMsg } from '../src/core/msgs';

/**
 * RARETÉS — une seule source de vérité : le catalogue (src/core/sets/*).
 *
 * Retours live 02, bug 2 : quand un patch de données change l'étoile d'une carte (ex. Red Bull 4★ → 6★, patch World V7),
 * les lignes d'inventaire déjà tirées gardaient l'ancienne rareté → la Collection (qui lit le catalogue) et la Vitrine
 * (qui lisait l'inventaire) ne disaient plus la même chose. Cette migration réaligne tout sur le catalogue :
 * inventaire (lignes fusionnées si la bonne rareté existe déjà), vitrines, classeurs, cartes de pochette.
 * Idempotente : la relancer ne change rien. Lancée à chaque mise en ligne (mettre-en-ligne-prod.cmd / deployer.cmd).
 *
 *   npx convex run migrations:resyncRarities
 */
const BATCH = 200;

/**
 * (audit 12/11, A8-08) TAMPON « DÉJÀ APPLIQUÉ ». resyncRarities et purgeCards relisaient TOUTE la table `inventory` à
 * chaque mise en ligne (≈ 26 Mo chacune à 80 000 lignes), même quand rien n'avait changé. Elles sont sautées quand :
 *  - leur entrée n'a pas changé depuis le dernier passage complet (signature des étoiles du catalogue / de la liste
 *    des cartes supprimées) ;
 *  - ET les boosters encore scellés au début de ce passage étaient tous à jour (`clean`). Un booster scellé garde les
 *    étoiles et les cartes du jour de son tirage et les verse à l'inventaire à son ouverture : c'est le seul chemin
 *    par lequel une ligne périmée peut arriver après un passage complet, et c'est pour lui que ces migrations étaient
 *    relancées. Les boosters tirés ensuite le sont avec le catalogue en place.
 *  - ET deux passages complets de suite ont déjà eu lieu avec cette même entrée : le premier corrige l'inventaire, le
 *    second rattrape ce qui était en jeu au moment du changement et n'est revenu qu'après (mises d'un duel, d'une
 *    battle royale ou de la roulette rendues avec l'étoile d'avant, vente du marché d'une carte supprimée, échange
 *    accepté pendant le passage) ;
 *  - ET le dernier passage complet a moins de 7 jours (filet).
 * `force: true` : passage complet quoi qu'il arrive.
 */
const fnv = (parts: Iterable<string>): string => {
  let h = 0x811c9dc5;
  let n = 0;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 0x01000193) >>> 0;
    h = Math.imul(h ^ 0x7c, 0x01000193) >>> 0;
    n++;
  }
  return `${n}-${h.toString(36)}`;
};
let raritySig: string | null = null;
const rarityStamp = () => (raritySig ??= fnv(CATALOG_CARDS.map((c) => `${c.id}:${c.baseRarity}`)));
let purgeSig: string | null = null;
const purgeStamp = () => (purgeSig ??= fnv(PURGED_CARD_IDS));
export async function stampFresh(ctx: MutationCtx, key: string, sig: string): Promise<boolean> {
  const st = await ctx.db.query('migStamps').withIndex('by_key', (q) => q.eq('key', key)).unique();
  return !!st && st.sig === sig && st.clean && (st.runs ?? 1) >= STAMP_RUNS && Date.now() - st.at < STAMP_MAX_AGE_MS;
}
const STAMP_RUNS = 2;
const STAMP_MAX_AGE_MS = 7 * 24 * 3600_000;
/** Les boosters encore scellés (un par joueur au plus, en pratique) sont-ils tous conformes à `ok` ? */
async function sealedAll(ctx: MutationCtx, ok: (c: { cardId: string; rarity: RarityId }) => boolean): Promise<boolean> {
  const sealed = await ctx.db.query('packOpens').withIndex('by_status', (q) => q.eq('status', 'sealed')).take(301);
  return sealed.length <= 300 && sealed.every((p) => p.cards.every((c) => ok(c)));
}
async function stampSet(ctx: MutationCtx, key: string, sig: string, at: number, clean: boolean) {
  const st = await ctx.db.query('migStamps').withIndex('by_key', (q) => q.eq('key', key)).unique();
  // passages complets de suite avec la même entrée (repart de 1 quand elle change)
  const runs = st && st.sig === sig ? (st.runs ?? 1) + 1 : 1;
  if (st) await ctx.db.patch(st._id, { sig, at, clean, runs });
  else await ctx.db.insert('migStamps', { key, sig, at, clean, runs });
}

const truth = (cardId: string, r: RarityId): RarityId => catalogCard(cardId)?.baseRarity ?? r;

export const resyncRarities = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), fixed: v.optional(v.number()), startedAt: v.optional(v.number()), clean: v.optional(v.boolean()), force: v.optional(v.boolean()) },
  handler: async (ctx, { cursor, fixed = 0, startedAt, clean, force }) => {
    // (A8-08) premier appel : rien à faire si le catalogue n'a pas changé et qu'aucun vieux booster scellé ne traîne
    if (cursor == null && !force && (await stampFresh(ctx, 'resyncRarities', rarityStamp()))) return { done: true, fixed: 0, skipped: true };
    const began = startedAt ?? Date.now();
    const wasClean = clean ?? (await sealedAll(ctx, (c) => truth(c.cardId, c.rarity) === c.rarity));
    const page = await ctx.db.query('inventory').paginate({ cursor: cursor ?? null, numItems: BATCH });
    const users = new Set<Doc<'users'>['_id']>();
    for (const row of page.page) {
      const want = truth(row.cardId, row.rarity);
      if (want === row.rarity) continue;
      fixed++;
      users.add(row.userId);
      const twin = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) => q.eq('userId', row.userId).eq('cardId', row.cardId).eq('rarity', want))
        .unique();
      if (twin) {
        await ctx.db.patch(twin._id, {
          count: twin.count + row.count,
          bestMintNumber: Math.min(twin.bestMintNumber, row.bestMintNumber),
          firstPulledAt: Math.min(twin.firstPulledAt, row.firstPulledAt),
          lastPulledAt: Math.max(twin.lastPulledAt, row.lastPulledAt),
          rev: invRev(),
        });
        await dropInv(ctx, row);
      } else {
        // (11/11) collection par différence : une étoile changée doit arriver chez le joueur (rev), sinon sa copie garde l'ancienne
        await ctx.db.patch(row._id, { rarity: want, rev: invRev() });
      }
    }
    // vitrines et classeurs des joueurs touchés
    for (const uid of users) {
      const u = await ctx.db.get(uid);
      if (u?.showcase?.some((c) => truth(c.cardId, c.rarity) !== c.rarity)) {
        await ctx.db.patch(uid, { showcase: dedupe(u.showcase.map((c) => ({ cardId: c.cardId, rarity: truth(c.cardId, c.rarity) }))) });
      }
      const binders = await ctx.db.query('binders').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
      for (const b of binders) {
        if (!b.cards.some((c) => truth(c.cardId, c.rarity) !== c.rarity)) continue;
        await ctx.db.patch(b._id, { cards: dedupe(b.cards.map((c) => ({ cardId: c.cardId, rarity: truth(c.cardId, c.rarity) }))) });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.resyncRarities, { cursor: page.continueCursor, fixed, startedAt: began, clean: wasClean });
      return { done: false, fixed };
    }
    await stampSet(ctx, 'resyncRarities', rarityStamp(), began, wasClean);
    return { done: true, fixed };
  },
});

/**
 * (11/11, nouveau tri Monde + Sport) Complément de resyncRarities : ce qui est EN COURS et cite une carte avec sa rareté
 * — échanges en attente (ou contre-proposés), annonces ouvertes du tableau d'offres, offres sur annonce en cours (et leur
 * contre-offre), ventes ouvertes du marché. Sans lui, une carte passée de 3★ à 5★ restait citée en 3★ : l'échange ou
 * l'offre ne trouvait plus l'exemplaire à l'inventaire (réaligné, lui) et échouait. Mêmes lignes fusionnées (une carte
 * citée deux fois après coup → quantités additionnées). Idempotente ; à lancer APRÈS resyncRarities (mêmes lanceurs).
 *
 *   npx convex run migrations:resyncRaritiesOpen
 */
type Item = { cardId: string; rarity: RarityId; count: number };
const fixItems = (list: Item[]): Item[] => {
  const by = new Map<string, Item>();
  for (const it of list) {
    const r = truth(it.cardId, it.rarity);
    const k = `${it.cardId}:${r}`;
    const prev = by.get(k);
    if (prev) prev.count += it.count;
    else by.set(k, { ...it, rarity: r });
  }
  return [...by.values()];
};
const needsFix = (list: Array<{ cardId: string; rarity: RarityId }> | undefined) => !!list?.some((c) => truth(c.cardId, c.rarity) !== c.rarity);

/**
 * (audit 12/11, S12 / A8-09) Les tables `trades` et `listingOffers` ne sont jamais purgées : les lire en entier dans
 * une seule mutation finirait par dépasser la limite de lecture de Convex, et la mise en ligne s'arrêterait serveur
 * déployé, site non. Elles sont lues par PAGES de PAGE lignes, UNE lecture paginée par mutation (règle de Convex) :
 * la première page d'échanges dans l'appel du lanceur, la suite programmée à la chaîne (`part` + `cursor`), table
 * après table. Les compteurs rendus sont ceux de l'appel.
 */
const PAGE = 400;
const part = v.optional(v.union(v.literal('trades'), v.literal('listings'), v.literal('offers')));
type Part = 'trades' | 'listings' | 'offers';

export const resyncRaritiesOpen = internalMutation({
  args: { part, cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, a) => {
    let trades = 0, listings = 0, offers = 0, market = 0;
    /** page suivante de la même table, sinon première page de la table d'après */
    const next = async (p: Part, page: { isDone: boolean; continueCursor: string }, then?: Part) => {
      if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.resyncRaritiesOpen, { part: p, cursor: page.continueCursor });
      else if (then) await ctx.scheduler.runAfter(0, internal.migrations.resyncRaritiesOpen, { part: then, cursor: null });
    };
    if (!a.part || a.part === 'trades') {
      const page = await ctx.db.query('trades').paginate({ cursor: a.part ? (a.cursor ?? null) : null, numItems: PAGE });
      for (const tr of page.page) {
        if (tr.status !== 'pending' && tr.status !== 'countered') continue;
        if (!needsFix(tr.offered) && !needsFix(tr.requested)) continue;
        await ctx.db.patch(tr._id, { offered: fixItems(tr.offered), requested: fixItems(tr.requested) });
        trades++;
      }
      await next('trades', page, 'offers');
    }
    if (a.part === 'offers') {
      const page = await ctx.db.query('listingOffers').paginate({ cursor: a.cursor ?? null, numItems: PAGE });
      for (const o of page.page) {
        if (o.status !== 'pending' && o.status !== 'countered') continue;
        if (!needsFix(o.offered) && !needsFix(o.counter?.give) && !needsFix(o.counter?.want)) continue;
        await ctx.db.patch(o._id, {
          offered: fixItems(o.offered),
          ...(o.counter ? { counter: { ...o.counter, give: fixItems(o.counter.give), want: fixItems(o.counter.want) } } : {}),
        });
        offers++;
      }
      await next('offers', page);
    }
    if (a.part) return { trades, listings, offers, market };
    for (const l of await ctx.db.query('listings').withIndex('by_status_expires', (q) => q.eq('status', 'open')).collect()) {
      if (!needsFix(l.items) && !needsFix(l.wanted)) continue;
      await ctx.db.patch(l._id, { items: fixItems(l.items), ...(l.wanted ? { wanted: dedupe(l.wanted.map((c) => ({ cardId: c.cardId, rarity: truth(c.cardId, c.rarity) }))) } : {}) });
      listings++;
    }
    for (const m of await ctx.db.query('market').withIndex('by_status_created', (q) => q.eq('status', 'open')).collect()) {
      const r = truth(m.cardId, m.rarity);
      if (r === m.rarity) continue;
      await ctx.db.patch(m._id, { rarity: r });
      market++;
    }
    return { trades, listings, offers, market };
  },
});

function dedupe<T extends { cardId: string; rarity: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = `${c.cardId}:${c.rarity}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * PURGE DU 04/11/2026 — les cartes 1★ à 3★ restées sans illustration (2 084, convex/purgedCards.ts) n'existent plus :
 * retirées du catalogue, et ici de tout ce que les joueurs possèdent ou proposent. Assumé : ceux qui en avaient les
 * perdent. Inventaire (lignes supprimées), vitrines, classeurs (et leur couverture), échanges en attente (annulés),
 * annonces ouvertes (cartes retirées ; annulées si vides), offres en cours (retirées).
 * Idempotente (relancée à chaque mise en ligne : rattrape un booster scellé avant la purge et ouvert après).
 *
 *   npx convex run migrations:purgeCards
 */
const PURGED = new Set(PURGED_CARD_IDS);
const purged = (c: { cardId: string }) => PURGED.has(c.cardId);

export const purgeCards = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), removed: v.optional(v.number()), startedAt: v.optional(v.number()), clean: v.optional(v.boolean()), force: v.optional(v.boolean()) },
  handler: async (ctx, { cursor, removed = 0, startedAt, clean, force }) => {
    // (A8-08) même tampon : liste des cartes supprimées inchangée et aucun booster scellé d'avant le dernier passage
    if (cursor == null && !force && (await stampFresh(ctx, 'purgeCards', purgeStamp()))) return { done: true, removed: 0, skipped: true };
    const began = startedAt ?? Date.now();
    const wasClean = clean ?? (await sealedAll(ctx, (c) => !PURGED.has(c.cardId)));
    const page = await ctx.db.query('inventory').paginate({ cursor: cursor ?? null, numItems: BATCH });
    const users = new Set<Doc<'users'>['_id']>();
    for (const row of page.page) {
      if (!PURGED.has(row.cardId)) continue;
      removed++;
      users.add(row.userId);
      await dropInv(ctx, row);
    }
    for (const uid of users) {
      const u = await ctx.db.get(uid);
      if (u?.showcase?.some(purged)) await ctx.db.patch(uid, { showcase: u.showcase.filter((c) => !purged(c)) });
      const binders = await ctx.db.query('binders').withIndex('by_user', (q) => q.eq('userId', uid)).collect();
      for (const b of binders) {
        const cover = b.coverCardId && PURGED.has(b.coverCardId);
        if (!cover && !b.cards.some(purged)) continue;
        await ctx.db.patch(b._id, { cards: b.cards.filter((c) => !purged(c)), ...(cover ? { coverCardId: undefined } : {}) });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.purgeCards, { cursor: page.continueCursor, removed, startedAt: began, clean: wasClean });
      return { done: false, removed };
    }
    await stampSet(ctx, 'purgeCards', purgeStamp(), began, wasClean);
    await ctx.scheduler.runAfter(0, internal.migrations.purgeCardsDeals, {});
    return { done: true, removed };
  },
});

/** 2e temps de la purge : échanges, annonces et offres encore ouverts qui contiennent une carte supprimée. */
export const purgeCardsDeals = internalMutation({
  // (audit 12/11, S12 / A8-09) par pages, comme resyncRaritiesOpen : ces tables ne sont jamais purgées
  args: { part, cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, a) => {
    const now = Date.now();
    let trades = 0, listings = 0, offers = 0;
    const cur = a.part ?? 'trades'; // une seule table (une seule lecture paginée) par appel : échanges, annonces, offres
    const start = { cursor: a.part ? (a.cursor ?? null) : null, numItems: PAGE };
    const next = async (p: Part, page: { isDone: boolean; continueCursor: string }, then?: Part) => {
      if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.purgeCardsDeals, { part: p, cursor: page.continueCursor });
      else if (then) await ctx.scheduler.runAfter(0, internal.migrations.purgeCardsDeals, { part: then, cursor: null });
    };
    if (cur === 'trades') {
      const page = await ctx.db.query('trades').paginate(start);
      for (const t of page.page) {
        if (t.status !== 'pending' || !(t.offered.some(purged) || t.requested.some(purged))) continue;
        await ctx.db.patch(t._id, { status: 'cancelled', resolvedAt: now });
        trades++;
      }
      await next('trades', page, 'listings');
    }
    if (cur === 'listings') {
      const page = await ctx.db.query('listings').paginate(start);
      for (const l of page.page) {
        if (l.status !== 'open' || !(l.items.some(purged) || l.wanted?.some(purged))) continue;
        const items = l.items.filter((c) => !purged(c));
        await ctx.db.patch(l._id, items.length ? { items, wanted: l.wanted?.filter((c) => !purged(c)) } : { status: 'cancelled', resolvedAt: now });
        listings++;
      }
      await next('listings', page, 'offers');
    }
    if (cur === 'offers') {
      const page = await ctx.db.query('listingOffers').paginate(start);
      for (const o of page.page) {
        if (o.status !== 'pending' && o.status !== 'countered') continue;
        if (!(o.offered.some(purged) || o.counter?.give.some(purged) || o.counter?.want.some(purged))) continue;
        await ctx.db.patch(o._id, { status: 'withdrawn' });
        offers++;
      }
      await next('offers', page);
    }
    return { trades, listings, offers };
  },
});

/**
 * (V2 fluidité, lot 4) marque `big` sur les « gros tirages » déjà dans le fil (Légendaire, Mythique, Secrète), pour
 * que `feed.bigPulls` les lise par l'index `by_big`. Idempotent : ne touche que les lignes pas encore marquées ; les
 * nouvelles sont marquées à l'insertion (packs.ts). On remonte les 4 000 dernières entrées : bien plus que les 40
 * que la page affiche.
 */
export const markBigPulls = internalMutation({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db.query('activityFeed').withIndex('by_createdAt').order('desc').take(4000);
    let marked = 0;
    for (const f of recent) {
      if (f.big || !isBigPull(f)) continue;
      await ctx.db.patch(f._id, { big: true });
      marked++;
    }
    return { scanned: recent.length, marked };
  },
});

/**
 * (audit perf 12/11, décision 8) PRÉSENCE : une carte publique par joueur (convex/presence.ts). Crée d'un coup les
 * lignes manquantes — tant que la table est vide, le serveur lit et écrit `users` comme avant. Idempotente.
 *
 *   npx convex run migrations:backfillPresence
 */
export const backfillPresence = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0;
    const users = await ctx.db.query('users').collect();
    for (const u of users) if (await ensurePresence(ctx, u)) created++;
    return { users: users.length, created };
  },
});

/**
 * (audit perf 12/11, décision 10) ENVIES PAR CARTE : remplit la table `wishes` (index inversé de `users.wishlist`,
 * convex/wishes.ts) par lots de 10 joueurs, puis pose le témoin « wishesReady » — sans lui les lectures font comme
 * avant. Idempotente : la relancer réaligne les lignes sur les listes.
 *
 *   npx convex run migrations:backfillWishes
 */
export const backfillWishes = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), written: v.optional(v.number()) },
  handler: async (ctx, { cursor, written = 0 }): Promise<{ done: boolean; written: number }> => {
    const page = await ctx.db.query('users').paginate({ cursor: cursor ?? null, numItems: 10 });
    for (const u of page.page) written += await syncWishes(ctx, u._id, u.wishlist ?? []);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillWishes, { cursor: page.continueCursor, written });
      return { done: false, written };
    }
    await markWishesReady(ctx);
    return { done: true, written };
  },
});

/**
 * (version anglaise, lot 4) ANCIENS MESSAGES : les lignes du fil (`activityFeed.message`) et du journal des pièces
 * (`coinTx.label`) écrites avant le lot 4 n'ont que le texte français. On retrouve leur code et leurs paramètres à
 * partir des modèles (src/core/i18n/msgFr.ts) pour que le jeu les affiche en anglais ; une ligne non reconnue reste en
 * français. Idempotente : seules les lignes sans code sont lues, par lots de 200.
 *
 *   npx convex run migrations:i18nMessages
 */
export const i18nMessages = internalMutation({
  args: {
    part: v.optional(v.union(v.literal('feed'), v.literal('coins'))),
    cursor: v.optional(v.union(v.string(), v.null())),
    done: v.optional(v.number()),
    left: v.optional(v.number()),
  },
  handler: async (ctx, { part = 'feed', cursor, done = 0, left = 0 }): Promise<{ part: string; done: number; left: number; finished: boolean }> => {
    const PAGE = 200;
    let isDone: boolean, next: string;
    if (part === 'feed') {
      const page = await ctx.db.query('activityFeed').paginate({ cursor: cursor ?? null, numItems: PAGE });
      for (const r of page.page) {
        if (r.msgKey) continue;
        const m = parseMsg(r.message, 'f.');
        if (!m) { left++; continue; }
        await ctx.db.patch(r._id, { msgKey: m.key, msgParams: m.params });
        done++;
      }
      ({ isDone, continueCursor: next } = page);
    } else {
      const page = await ctx.db.query('coinTx').paginate({ cursor: cursor ?? null, numItems: PAGE });
      for (const r of page.page) {
        if (r.labelKey) continue;
        const m = parseMsg(r.label, 'c.');
        if (!m) { left++; continue; }
        await ctx.db.patch(r._id, { labelKey: m.key, labelParams: m.params });
        done++;
      }
      ({ isDone, continueCursor: next } = page);
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.i18nMessages, { part, cursor: next, done, left });
      return { part, done, left, finished: false };
    }
    if (part === 'feed') {
      await ctx.scheduler.runAfter(0, internal.migrations.i18nMessages, { part: 'coins', cursor: null, done, left });
      return { part, done, left, finished: false };
    }
    console.log(`[migrations] i18nMessages : ${done} lignes codées, ${left} restées en français`);
    return { part, done, left, finished: true };
  },
});
