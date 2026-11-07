import { v, ConvexError } from 'convex/values';
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, TableNames } from './_generated/dataModel';
import { internal } from './_generated/api';
import { BOOST_MS } from '../src/core/packRegen';

/**
 * OUVERTURE OFFICIELLE (07/11) — date d'ouverture + remise à zéro de la saison de test.
 *
 *  - `launch:setLaunch` pose l'heure d'ouverture : avant, le site affiche le compte à rebours à tout le monde sauf aux
 *    comptes équipe (admin / modérateur : Tom et Hugo) et AUCUN compte ne peut être créé (Discord ou pseudo).
 *      npx convex run launch:setLaunch '{"at":"2026-11-07T21:00:00+01:00"}'
 *      npx convex run launch:setLaunch '{"at":null}'          (plus de compte à rebours : ouvert)
 *  - `launch:resetAll` vide le jeu : comptes des joueurs supprimés (ils recréent un compte), collections, numéros
 *    d'impression, succès, stats, échanges, jeux, fil… Les comptes gardés (Tom et Hugo par défaut) NE SONT PAS supprimés :
 *    même identifiant, mêmes droits admin / modérateur, mais remis à neuf (15 boosters + recharge ×2 24 h, 0 carte, 0 pièce).
 *    Sans `confirm` : simulation (rien n'est touché, on voit qui est gardé et ce qui partira).
 *      npx convex run launch:resetAll
 *      npx convex run launch:resetAll '{"confirm":"RESET"}'
 *      npx convex run launch:resetReport                    (avancement / bilan)
 *  - GARDÉ : les suggestions (la file de Tom et Hugo) et les retours du labo.
 */

/** (ouverture 07/11) tout le monde arrive avec la réserve pleine (15) et 24 h de recharge ×2 */
export const STARTER_PACKS = 15;
const KEY = 'launch';
const BATCH = 400;

/** Vidées entièrement, dans cet ordre (numéros d'impression avant la roulette : le cron rouvre une manche à neuf). */
const WIPE: TableNames[] = [
  'cardMints',
  'packOpens',
  'inventory',
  'binders',
  'trades',
  'listingOffers',
  'listings',
  'duels',
  'royales',
  'rouletteRounds',
  'coinTx',
  'valueFlows',
  'abuseReviews',
  'friendships',
  'referralClicks',
  'activityFeed',
  'profileMedia',
];

async function config(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query('appConfig')
    .withIndex('by_key', (q) => q.eq('key', KEY))
    .unique();
}

/** Instant d'ouverture (null = ouvert / pas de compte à rebours). */
export async function launchAt(ctx: QueryCtx | MutationCtx): Promise<number | null> {
  return (await config(ctx))?.launchAt ?? null;
}

/** Équipe = admin ou modérateur (Tom, Hugo) : passe le compte à rebours. */
export const isStaff = (u: Pick<Doc<'users'>, 'isAdmin' | 'isModerator'> | null | undefined) => !!(u?.isAdmin || u?.isModerator);

/** Création de compte refusée tant que ce n'est pas ouvert. */
export async function assertOpen(ctx: MutationCtx) {
  const at = await launchAt(ctx);
  if (at && Date.now() < at) {
    const t = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(at);
    throw new ConvexError(`Le club ouvre ${t.replace(':', ' h ')} : reviens à ce moment-là pour créer ton compte.`);
  }
}

/** Pour le site (aussi sans être connecté) : compte à rebours, remise à zéro (nettoyage du stockage local). */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const c = await config(ctx);
    return {
      launchAt: c?.launchAt ?? null,
      resetAt: c?.resetAt ?? null,
      /** inscription par pseudo protégée par un code du club (variable CLUB_CODE) */
      clubCode: !!(process.env.CLUB_CODE ?? '').trim(),
    };
  },
});

export const setLaunch = internalMutation({
  args: { at: v.union(v.string(), v.number(), v.null()) },
  handler: async (ctx, { at }) => {
    const ms = at === null ? null : typeof at === 'number' ? at : Date.parse(at);
    if (ms !== null && !Number.isFinite(ms)) throw new ConvexError(`Date illisible : « ${at} » (ex. 2026-11-07T21:00:00+01:00)`);
    const c = await config(ctx);
    if (c) await ctx.db.patch(c._id, { launchAt: ms ?? undefined });
    else await ctx.db.insert('appConfig', { key: KEY, launchAt: ms ?? undefined });
    if (ms === null) return 'Compte à rebours retiré : le club est ouvert.';
    const t = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' }).format(ms);
    return `Ouverture : ${t} (heure de Paris) — dans ${Math.round((ms - Date.now()) / 60000)} min.`;
  },
});

/** Comptes gardés : par nom (comme les autres commandes admin), un seul joueur par nom, et forcément de l'équipe. */
async function resolveKeep(ctx: MutationCtx, names: string[]) {
  const users = await ctx.db.query('users').collect();
  const keep: Doc<'users'>[] = [];
  for (const n of names) {
    const q = n.trim().toLowerCase();
    const exact = users.filter((u) => u.username.toLowerCase() === q || u.displayName.toLowerCase() === q);
    const found = exact.length ? exact : users.filter((u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q));
    if (found.length !== 1)
      throw new ConvexError(`${found.length ? 'Plusieurs' : 'Aucun'} joueur(s) pour « ${n} » — rien n'a été touché. Joueurs : ${users.map((u) => `${u.displayName} (@${u.username})`).join(', ')}`);
    if (!isStaff(found[0])) throw new ConvexError(`« ${found[0].displayName} » n'est ni admin ni modérateur — rien n'a été touché (lance d'abord admin:setModerators).`);
    keep.push(found[0]);
  }
  return { users, keep };
}

export const resetAll = internalMutation({
  args: { confirm: v.optional(v.string()), keep: v.optional(v.array(v.string())) },
  handler: async (ctx, { confirm, keep: names }) => {
    const { users, keep } = await resolveKeep(ctx, names ?? ['tom', 'hugo']);
    const keepIds = new Set(keep.map((u) => u._id));
    const gone = users.filter((u) => !keepIds.has(u._id));
    const plan = {
      gardes: keep.map((u) => `${u.displayName} (@${u.username})${u.isAdmin ? ' · admin' : ''}${u.isModerator ? ' · modérateur' : ''} — remis à neuf`),
      supprimes: gone.map((u) => `${u.displayName} (@${u.username})`),
      tables: WIPE,
    };
    if (confirm !== 'RESET') return { simulation: true, ...plan, pourLancer: `npx convex run launch:resetAll '{"confirm":"RESET"}'` };
    const c = await config(ctx);
    const startedAt = Date.now();
    const report = { startedAt, done: false, counts: {} as Record<string, number> };
    if (c) await ctx.db.patch(c._id, { lastReset: report });
    else await ctx.db.insert('appConfig', { key: KEY, lastReset: report });
    await ctx.scheduler.runAfter(0, internal.launch.resetStep, { keep: [...keepIds], stage: 0, counts: {}, startedAt });
    return { lance: true, ...plan, suivi: 'npx convex run launch:resetReport' };
  },
});

export const resetStep = internalMutation({
  args: {
    keep: v.array(v.id('users')),
    stage: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    counts: v.record(v.string(), v.number()),
    startedAt: v.number(),
  },
  handler: async (ctx, a) => {
    const counts = { ...a.counts };
    const keep = new Set<string>(a.keep);
    const next = (stage: number, cursor?: string | null) =>
      ctx.scheduler.runAfter(0, internal.launch.resetStep, { keep: a.keep, stage, cursor: cursor ?? null, counts, startedAt: a.startedAt });

    // 1. tables vidées entièrement
    if (a.stage < WIPE.length) {
      const table = WIPE[a.stage];
      const rows = await ctx.db.query(table).take(BATCH);
      for (const row of rows) {
        if (table === 'profileMedia') await ctx.storage.delete((row as Doc<'profileMedia'>).storageId).catch(() => undefined);
        await ctx.db.delete(row._id);
      }
      counts[table] = (counts[table] ?? 0) + rows.length;
      await saveReport(ctx, { startedAt: a.startedAt, done: false, counts });
      await next(rows.length === BATCH ? a.stage : a.stage + 1);
      return;
    }
    // 2. sessions : on garde celles des comptes gardés (Tom et Hugo restent connectés)
    if (a.stage === WIPE.length) {
      const page = await ctx.db.query('sessions').paginate({ cursor: a.cursor ?? null, numItems: BATCH });
      let n = 0;
      for (const s of page.page) if (!keep.has(s.userId)) (await ctx.db.delete(s._id), n++);
      counts.sessions = (counts.sessions ?? 0) + n;
      await saveReport(ctx, { startedAt: a.startedAt, done: false, counts });
      await next(page.isDone ? a.stage + 1 : a.stage, page.isDone ? null : page.continueCursor);
      return;
    }
    // 3. joueurs : supprimés, sauf les comptes gardés, remis à neuf (identité et droits conservés)
    const now = Date.now();
    let removed = 0;
    const boostFrom = Math.max(now, (await launchAt(ctx)) ?? 0);
    for (const u of await ctx.db.query('users').collect()) {
      if (!keep.has(u._id)) {
        await ctx.db.delete(u._id);
        removed++;
        continue;
      }
      await ctx.db.replace(u._id, {
        discordId: u.discordId,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        ...(u.isAdmin ? { isAdmin: true } : {}),
        ...(u.isModerator ? { isModerator: true } : {}),
        ...(u.refCode ? { refCode: u.refCode } : {}),
        ...(u.devices ? { devices: u.devices } : {}),
        ...(u.pwHash ? { pwHash: u.pwHash } : {}),
        welcomeDmAt: u.welcomeDmAt ?? now, // (déjà dans le club : pas de message de bienvenue)
        packBalance: STARTER_PACKS,
        lastDailyClaimAt: 0,
        packRegenAt: now,
        // boost ×2 de 24 h à partir de l'ouverture (ou de maintenant si elle est déjà passée), comme les nouveaux joueurs
        regenBoostUntil: boostFrom + BOOST_MS,
        totalPacksOpened: 0,
        lastSeenAt: now,
        statusText: 'Nouvelle saison',
      });
    }
    counts.users = removed;
    // les suggestions des joueurs supprimés restent (auteur affiché « ? ») : c'est la file de travail de l'équipe
    const c = await config(ctx);
    if (c) await ctx.db.patch(c._id, { resetAt: now, lastReset: { startedAt: a.startedAt, done: true, finishedAt: now, counts } });
    console.log('[launch] remise à zéro terminée', JSON.stringify(counts));
  },
});

async function saveReport(ctx: MutationCtx, r: { startedAt: number; done: boolean; counts: Record<string, number> }) {
  const c = await config(ctx);
  if (c) await ctx.db.patch(c._id, { lastReset: r });
}

export const resetReport = internalQuery({
  args: {},
  handler: async (ctx) => {
    const c = await config(ctx);
    const players = await ctx.db.query('users').collect();
    return {
      ouverture: c?.launchAt ? new Date(c.launchAt).toISOString() : null,
      remiseAZero: c?.lastReset ?? null,
      comptes: players.map((u) => `${u.displayName} (@${u.username}) · ${u.packBalance} boosters · ${u.totalPacksOpened} ouverts`),
    };
  },
});

