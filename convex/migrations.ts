import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { catalogCard } from './cardsCatalog';
import type { RarityId } from './cardsCatalog';
import { PURGED_CARD_IDS } from './purgedCards';
import { isBigPull } from './feed';
import { dropInv, invRev } from './invRev';
import { ensurePresence } from './presence';

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

const truth = (cardId: string, r: RarityId): RarityId => catalogCard(cardId)?.baseRarity ?? r;

export const resyncRarities = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), fixed: v.optional(v.number()) },
  handler: async (ctx, { cursor, fixed = 0 }) => {
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
      await ctx.scheduler.runAfter(0, internal.migrations.resyncRarities, { cursor: page.continueCursor, fixed });
      return { done: false, fixed };
    }
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

export const resyncRaritiesOpen = internalMutation({
  args: {},
  handler: async (ctx) => {
    let trades = 0, listings = 0, offers = 0, market = 0;
    for (const tr of await ctx.db.query('trades').collect()) {
      if (tr.status !== 'pending' && tr.status !== 'countered') continue;
      if (!needsFix(tr.offered) && !needsFix(tr.requested)) continue;
      await ctx.db.patch(tr._id, { offered: fixItems(tr.offered), requested: fixItems(tr.requested) });
      trades++;
    }
    for (const l of await ctx.db.query('listings').withIndex('by_status_expires', (q) => q.eq('status', 'open')).collect()) {
      if (!needsFix(l.items) && !needsFix(l.wanted)) continue;
      await ctx.db.patch(l._id, { items: fixItems(l.items), ...(l.wanted ? { wanted: dedupe(l.wanted.map((c) => ({ cardId: c.cardId, rarity: truth(c.cardId, c.rarity) }))) } : {}) });
      listings++;
    }
    for (const o of await ctx.db.query('listingOffers').collect()) {
      if (o.status !== 'pending' && o.status !== 'countered') continue;
      if (!needsFix(o.offered) && !needsFix(o.counter?.give) && !needsFix(o.counter?.want)) continue;
      await ctx.db.patch(o._id, {
        offered: fixItems(o.offered),
        ...(o.counter ? { counter: { ...o.counter, give: fixItems(o.counter.give), want: fixItems(o.counter.want) } } : {}),
      });
      offers++;
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
  args: { cursor: v.optional(v.union(v.string(), v.null())), removed: v.optional(v.number()) },
  handler: async (ctx, { cursor, removed = 0 }) => {
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
      await ctx.scheduler.runAfter(0, internal.migrations.purgeCards, { cursor: page.continueCursor, removed });
      return { done: false, removed };
    }
    await ctx.scheduler.runAfter(0, internal.migrations.purgeCardsDeals, {});
    return { done: true, removed };
  },
});

/** 2e temps de la purge : échanges, annonces et offres encore ouverts qui contiennent une carte supprimée. */
export const purgeCardsDeals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let trades = 0, listings = 0, offers = 0;
    for (const t of await ctx.db.query('trades').collect()) {
      if (t.status !== 'pending' || !(t.offered.some(purged) || t.requested.some(purged))) continue;
      await ctx.db.patch(t._id, { status: 'cancelled', resolvedAt: now });
      trades++;
    }
    for (const l of await ctx.db.query('listings').collect()) {
      if (l.status !== 'open' || !(l.items.some(purged) || l.wanted?.some(purged))) continue;
      const items = l.items.filter((c) => !purged(c));
      await ctx.db.patch(l._id, items.length ? { items, wanted: l.wanted?.filter((c) => !purged(c)) } : { status: 'cancelled', resolvedAt: now });
      listings++;
    }
    for (const o of await ctx.db.query('listingOffers').collect()) {
      if (o.status !== 'pending' && o.status !== 'countered') continue;
      if (!(o.offered.some(purged) || o.counter?.give.some(purged) || o.counter?.want.some(purged))) continue;
      await ctx.db.patch(o._id, { status: 'withdrawn' });
      offers++;
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
