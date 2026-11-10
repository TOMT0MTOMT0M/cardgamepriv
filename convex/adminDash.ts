import { v, ConvexError } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { getUserByToken } from './auth';
import { catalogCard, rarityValidator, RARITY_LABEL, type RarityId } from './cardsCatalog';
import { addCoins, takeCards } from './econLib';
import { give } from './admin';
import { addPacks } from './referrals';
import { applyRegen } from '../src/core/packRegen';
import { SURVEY_ID } from '../src/core/survey';

/**
 * DASHBOARD ADMIN (V2, 10/11) — page /admin/ (src/admin/), réservée à l'équipe : Tom et Hugo (users.isAdmin ou
 * users.isModerator, posés par admin:setModerators à chaque mise en ligne).
 *  - lecture : vue d'ensemble, joueurs, fiche d'un joueur, cartes à corriger, journal ;
 *  - actions : les commandes admin qui ne tournaient qu'en ligne de commande (npx convex run admin:…), rendues
 *    appelables depuis le dashboard ; chacune est vérifiée côté serveur (équipe) et écrite dans `adminLog`.
 * Les fonctions internes d'origine (admin.ts, launch.ts, push.ts, referrals.ts, pwAuth.ts) restent inchangées et
 * servent toujours aux lanceurs. Coût : rien en temps réel — le dashboard lit à la demande (bouton « Actualiser »).
 */

const ONLINE_MS = 5 * 60_000;
const DAY = 86_400_000;

/**
 * Notifications push : arrivées avec la V2 (convex/push.ts). Appelées PAR LEUR NOM pour que ce fichier soit identique sur
 * master (prod V1, sans notifications) et sur v2 : sur une version sans push, l'appel échoue et l'action le dit.
 */
const PUSH_ANNOUNCE = makeFunctionReference<'mutation', { title: string; body: string; url?: string }, { players: number; devices: number }>('push:announce');
async function pushPlayers(ctx: QueryCtx): Promise<number | null> {
  try {
    const db = ctx.db as unknown as { query(t: string): { collect(): Promise<Array<{ userId: string }>> } };
    return new Set((await db.query('pushSubs').collect()).map((s) => s.userId)).size;
  } catch {
    return null;
  }
}
async function tryAnnounce(ctx: MutationCtx, title: string, body: string): Promise<{ players: number; devices: number } | null> {
  try {
    return await ctx.runMutation(PUSH_ANNOUNCE, { title, body });
  } catch {
    return null;
  }
}

const isStaff = (u: Pick<Doc<'users'>, 'isAdmin' | 'isModerator'>) => !!(u.isAdmin || u.isModerator);

async function requireStaff(ctx: QueryCtx | MutationCtx, sessionToken: string) {
  const me = await getUserByToken(ctx, sessionToken);
  if (!me) throw new ConvexError('Non connecté : connecte-toi dans le jeu, puis reviens ici.');
  if (!isStaff(me)) throw new ConvexError('Réservé à l’équipe (Tom et Hugo).');
  return me;
}

async function log(ctx: MutationCtx, me: Doc<'users'>, action: string, detail: string, target?: string) {
  await ctx.db.insert('adminLog', { byUserId: me._id, byName: me.displayName, action, detail: detail.slice(0, 600), ...(target ? { target } : {}), at: Date.now() });
}

async function player(ctx: QueryCtx | MutationCtx, id: Id<'users'>) {
  const u = await ctx.db.get(id);
  if (!u) throw new ConvexError('Joueur introuvable.');
  return u;
}

const packsNow = (u: Doc<'users'>, now: number) => applyRegen(u.packBalance, u.packRegenAt ?? u.lastSeenAt, now, u.regenBoostUntil).balance;

/** Qui suis-je ? null = pas connecté ou pas de l'équipe (la page affiche alors l'écran « accès refusé »). */
export const whoami = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const me = await getUserByToken(ctx, sessionToken);
    if (!me) return { ok: false as const, reason: 'login' as const };
    if (!isStaff(me)) return { ok: false as const, reason: 'staff' as const, name: me.displayName };
    return { ok: true as const, name: me.displayName, avatarUrl: me.avatarUrl, isAdmin: !!me.isAdmin };
  },
});

/** Accueil : les chiffres du club, ce qui attend l'équipe, les derniers événements. */
export const overview = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireStaff(ctx, sessionToken);
    const now = Date.now();
    const users = await ctx.db.query('users').collect();
    const live = users.filter((u) => !u.bannedAt);
    const suggNew = await ctx.db.query('suggestions').withIndex('by_status', (q) => q.eq('status', 'nouvelle')).take(500);
    const suggSeen = await ctx.db.query('suggestions').withIndex('by_status', (q) => q.eq('status', 'vue')).take(500);
    const suggOk = await ctx.db.query('suggestions').withIndex('by_status', (q) => q.eq('status', 'acceptee')).take(500);
    const newByKind = { bug: 0, design: 0, ajout: 0, autre: 0 };
    for (const s of suggNew) newByKind[s.kind]++;
    const fixes = await ctx.db.query('cardFixes').withIndex('by_status', (q) => q.eq('status', 'afaire')).take(500);
    const launch = await ctx.db.query('appConfig').withIndex('by_key', (q) => q.eq('key', 'launch')).unique();
    const survey = await ctx.db.query('surveyAnswers').withIndex('by_survey', (q) => q.eq('surveyId', SURVEY_ID)).take(1000);
    const feed = await ctx.db.query('activityFeed').withIndex('by_createdAt').order('desc').take(15);
    return {
      players: live.length,
      banned: users.length - live.length,
      online: live.filter((u) => now - u.lastSeenAt < ONLINE_MS).length,
      active24h: live.filter((u) => now - u.lastSeenAt < DAY).length,
      active7d: live.filter((u) => now - u.lastSeenAt < 7 * DAY).length,
      new7d: live.filter((u) => now - u._creationTime < 7 * DAY).length,
      packsOpened: live.reduce((a, u) => a + u.totalPacksOpened, 0),
      packsWaiting: live.reduce((a, u) => a + packsNow(u, now), 0),
      coins: live.reduce((a, u) => a + (u.coins ?? 0), 0),
      pushPlayers: await pushPlayers(ctx),
      suggestions: { nouvelle: suggNew.length, vue: suggSeen.length, acceptee: suggOk.length, newByKind },
      fixesTodo: fixes.length,
      surveyId: SURVEY_ID,
      surveyAnswers: survey.length,
      launchAt: launch?.launchAt ?? null,
      activity: feed.map((f) => ({ at: f.createdAt, who: f.displayName, kind: f.kind, message: f.message, rarity: f.rarity })),
    };
  },
});

/** Tous les joueurs (bannis compris), les plus récemment vus d'abord. */
export const players = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireStaff(ctx, sessionToken);
    const now = Date.now();
    const users = await ctx.db.query('users').collect();
    const name = new Map(users.map((u) => [u._id as string, u.displayName]));
    return users
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((u) => ({
        id: u._id as string,
        name: u.displayName,
        username: u.username,
        avatarUrl: u.avatarUrl,
        createdAt: u._creationTime,
        lastSeenAt: u.lastSeenAt,
        status: u.statusText,
        packs: packsNow(u, now),
        opened: u.totalPacksOpened,
        coins: u.coins ?? 0,
        streak: u.streak?.count ?? 0,
        staff: isStaff(u),
        pw: u.discordId.startsWith('pw:'),
        bannedAt: u.bannedAt,
        banReason: u.banReason,
        referredBy: u.referredBy ? name.get(u.referredBy as string) : undefined,
        devices: u.devices?.length ?? 0,
      }));
  },
});

/** Fiche d'un joueur : collection par rareté, derniers boosters, dernières pièces, filleuls. */
export const playerDetail = query({
  args: { sessionToken: v.string(), id: v.id('users') },
  handler: async (ctx, { sessionToken, id }) => {
    await requireStaff(ctx, sessionToken);
    const u = await player(ctx, id);
    const inv = await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', id)).collect();
    const byRarity: Record<string, number> = {};
    let copies = 0;
    for (const r of inv) {
      byRarity[r.rarity] = (byRarity[r.rarity] ?? 0) + 1;
      copies += r.count;
    }
    const packs = await ctx.db.query('packOpens').withIndex('by_userId', (q) => q.eq('userId', id)).order('desc').take(10);
    const coins = await ctx.db.query('coinTx').withIndex('by_user', (q) => q.eq('userId', id)).order('desc').take(12);
    const kids = await ctx.db.query('users').withIndex('by_referredBy', (q) => q.eq('referredBy', id)).collect();
    const sessions = await ctx.db.query('sessions').withIndex('by_userId', (q) => q.eq('userId', id)).collect();
    const sugg = await ctx.db.query('suggestions').withIndex('by_user', (q) => q.eq('userId', id)).collect();
    const pending =
      (await ctx.db.query('trades').withIndex('by_fromUser_status', (q) => q.eq('fromUserId', id).eq('status', 'pending')).collect()).length +
      (await ctx.db.query('trades').withIndex('by_toUser_status', (q) => q.eq('toUserId', id).eq('status', 'pending')).collect()).length;
    const notes = await ctx.db.query('playerNotes').withIndex('by_user', (q) => q.eq('userId', id)).order('desc').take(30);
    return {
      pendingTrades: pending,
      notes: notes.map((n) => ({ id: n._id as string, text: n.text, by: n.byName, at: n.at })),
      distinct: inv.length,
      copies,
      byRarity,
      packs: packs.map((p) => ({ at: p.revealedAt ?? p.createdAt, status: p.status, best: p.maxRarity, kind: p.packKind ?? 'bebou', theme: p.themeId, cards: p.cards.map((c) => c.cardName).slice(0, 5) })),
      coinTx: coins.map((c) => ({ at: c.createdAt, amount: c.amount, label: c.label })),
      referrals: kids.map((k) => ({ name: k.displayName, paid: !!k.referralPaid, opened: k.totalPacksOpened })),
      sessions: sessions.filter((s) => s.expiresAt > Date.now()).length,
      suggestions: sugg.length,
      guideSeen: !!u.guideSeenAt,
      boostLeft: Math.max(0, (u.regenBoostUntil ?? 0) - Date.now()),
    };
  },
});

// ─────────────────────────────── actions sur un joueur ───────────────────────────────

export const givePacks = mutation({
  args: { sessionToken: v.string(), id: v.id('users'), n: v.number() },
  handler: async (ctx, { sessionToken, id, n }) => {
    const me = await requireStaff(ctx, sessionToken);
    const k = Math.floor(n);
    if (!(k >= 1 && k <= 200)) throw new ConvexError('Entre 1 et 200 boosters.');
    const u = await player(ctx, id);
    await addPacks(ctx, id, k);
    const after = packsNow((await ctx.db.get(id))!, Date.now());
    await log(ctx, me, 'boosters', `+${k} boosters (réserve : ${after})`, u.displayName);
    return `+${k} boosters pour ${u.displayName} (réserve : ${after}).`;
  },
});

export const giveCoins = mutation({
  args: { sessionToken: v.string(), id: v.id('users'), amount: v.number(), label: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, id, amount, label }) => {
    const me = await requireStaff(ctx, sessionToken);
    const k = Math.trunc(amount);
    if (!k || Math.abs(k) > 100_000) throw new ConvexError('Un montant entre -100 000 et 100 000 (pas 0).');
    const u = await player(ctx, id);
    if (k < 0 && (u.coins ?? 0) + k < 0) throw new ConvexError(`${u.displayName} n’a que ${u.coins ?? 0} pièces.`);
    const total = await addCoins(ctx, id, k, 'admin', label?.trim().slice(0, 80) || 'Ajustement de l’équipe');
    await log(ctx, me, 'pieces', `${k > 0 ? '+' : ''}${k} pièces (total : ${total})`, u.displayName);
    return `${k > 0 ? '+' : ''}${k} pièces pour ${u.displayName} (total : ${total}).`;
  },
});

export const giveCard = mutation({
  args: { sessionToken: v.string(), id: v.id('users'), cardId: v.string(), rarity: v.optional(rarityValidator), count: v.optional(v.number()) },
  handler: async (ctx, { sessionToken, id, cardId, rarity, count }) => {
    const me = await requireStaff(ctx, sessionToken);
    const c = catalogCard(cardId);
    if (!c) throw new ConvexError('Carte inconnue.');
    const n = Math.floor(count ?? 1);
    if (!(n >= 1 && n <= 20)) throw new ConvexError('Entre 1 et 20 exemplaires.');
    const r: RarityId = rarity ?? c.baseRarity;
    const u = await player(ctx, id);
    await give(ctx, id, c.id, r, n);
    await log(ctx, me, 'carte', `${n} × ${c.name} (${RARITY_LABEL[r]})`, u.displayName);
    return `${n} × ${c.name} (${RARITY_LABEL[r]}) pour ${u.displayName}.`;
  },
});

export const resetGuide = mutation({
  args: { sessionToken: v.string(), id: v.id('users') },
  handler: async (ctx, { sessionToken, id }) => {
    const me = await requireStaff(ctx, sessionToken);
    const u = await player(ctx, id);
    await ctx.db.patch(id, { guideSeenAt: undefined });
    await log(ctx, me, 'visite', 'visite guidée relancée', u.displayName);
    return `${u.displayName} : la visite guidée se relancera à sa prochaine visite.`;
  },
});

export const ban = mutation({
  args: { sessionToken: v.string(), id: v.id('users'), reason: v.string() },
  handler: async (ctx, { sessionToken, id, reason }): Promise<string> => {
    const me = await requireStaff(ctx, sessionToken);
    const u = await player(ctx, id);
    if (u._id === me._id) throw new ConvexError('Tu ne peux pas te bannir toi-même.');
    const why = reason.trim().slice(0, 120) || 'banni';
    const r: { sessions: number; echanges: number } = await ctx.runMutation(internal.admin.ban, { name: u.username, reason: why });
    await log(ctx, me, 'ban', `banni : ${why}`, u.displayName);
    return `${u.displayName} banni (${r.sessions} session(s) fermée(s), ${r.echanges} échange(s) annulé(s)).`;
  },
});

export const unban = mutation({
  args: { sessionToken: v.string(), id: v.id('users') },
  handler: async (ctx, { sessionToken, id }) => {
    const me = await requireStaff(ctx, sessionToken);
    const u = await player(ctx, id);
    if (!u.bannedAt) return `${u.displayName} n’est pas banni.`;
    await ctx.db.patch(id, { bannedAt: undefined, banReason: undefined });
    await log(ctx, me, 'unban', 'rétabli', u.displayName);
    return `${u.displayName} rétabli : il peut se reconnecter.`;
  },
});

/** Parrainage perdu : même règle que lanceurs/parrainage-manuel.cmd (referrals:linkManual). */
export const linkReferral = mutation({
  args: { sessionToken: v.string(), referrer: v.string(), child: v.string() },
  handler: async (ctx, { sessionToken, referrer, child }): Promise<string> => {
    const me = await requireStaff(ctx, sessionToken);
    const r: string = await ctx.runMutation(internal.referrals.linkManual, { referrer, child });
    await log(ctx, me, 'parrainage', r, child);
    return r;
  },
});

// ─────────────────────────────── outils du club ───────────────────────────────

/** Compte à rebours / verrou du club (launch:setLaunch). `at` null = ouvert. */
export const setLaunch = mutation({
  args: { sessionToken: v.string(), at: v.union(v.number(), v.null()) },
  handler: async (ctx, { sessionToken, at }): Promise<string> => {
    const me = await requireStaff(ctx, sessionToken);
    if (at !== null && at <= Date.now()) throw new ConvexError('Choisis une heure dans le futur.');
    const r: string = await ctx.runMutation(internal.launch.setLaunch, { at });
    await log(ctx, me, 'verrou', r);
    return r;
  },
});

/** Notification à tout le monde (push:announce). */
export const announce = mutation({
  args: { sessionToken: v.string(), title: v.string(), body: v.string() },
  handler: async (ctx, { sessionToken, title, body }): Promise<string> => {
    const me = await requireStaff(ctx, sessionToken);
    const t = title.trim().slice(0, 60);
    const b = body.trim().slice(0, 180);
    if (!t || !b) throw new ConvexError('Un titre et un message.');
    const r = await tryAnnounce(ctx, t, b);
    if (!r) throw new ConvexError('Les notifications ne sont pas encore en ligne sur cette version du jeu.');
    await log(ctx, me, 'annonce', `« ${t} » — ${b} (${r.players} joueurs, ${r.devices} appareils)`);
    return `Annonce envoyée à ${r.players} joueur(s) (${r.devices} appareil(s)).`;
  },
});

/** Pour les actions (Node / réseau) : l'équipe seulement, et le journal. */
export const staffOf = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const me = await requireStaff(ctx, sessionToken);
    return { id: me._id, name: me.displayName };
  },
});
export const logAction = internalMutation({
  args: { byUserId: v.id('users'), byName: v.string(), action: v.string(), detail: v.string(), target: v.optional(v.string()) },
  handler: async (ctx, a) => void (await ctx.db.insert('adminLog', { ...a, detail: a.detail.slice(0, 600), at: Date.now() })),
});

/** Mot de passe oublié d'un compte pseudo (pwAuth:setPassword) : ses sessions sont fermées. */
export const setPassword = action({
  args: { sessionToken: v.string(), id: v.id('users'), password: v.string() },
  handler: async (ctx, { sessionToken, id, password }): Promise<string> => {
    const me = await ctx.runQuery(internal.adminDash.staffOf, { sessionToken });
    const u = await ctx.runQuery(internal.adminDash.pwTarget, { id });
    const r: string = await ctx.runAction(internal.pwAuth.setPassword, { name: u.username, password });
    await ctx.runMutation(internal.adminDash.logAction, { byUserId: me.id, byName: me.name, action: 'mot de passe', detail: 'nouveau mot de passe posé', target: u.name });
    return r;
  },
});
export const pwTarget = internalQuery({
  args: { id: v.id('users') },
  handler: async (ctx, { id }) => {
    const u = await player(ctx, id);
    if (!u.discordId.startsWith('pw:')) throw new ConvexError(`${u.displayName} se connecte avec Discord : pas de mot de passe à changer.`);
    return { username: u.username, name: u.displayName };
  },
});

/** Recalcule tout le classement tout de suite (sinon le cron le fait toutes les 5 min). */
export const refreshRanks = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }): Promise<string> => {
    const me = await ctx.runQuery(internal.adminDash.staffOf, { sessionToken });
    const r = await ctx.runAction(internal.profiles.refreshRanks, { all: true });
    const msg = `Classement recalculé : ${r.saved} ligne(s), ${r.dropped} retirée(s).`;
    await ctx.runMutation(internal.adminDash.logAction, { byUserId: me.id, byName: me.name, action: 'classement', detail: msg });
    return msg;
  },
});

/** Rôle Discord « Card » à tous les joueurs Discord présents sur le serveur des Bébous. */
export const discordRoleAll = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }): Promise<string> => {
    const me = await ctx.runQuery(internal.adminDash.staffOf, { sessionToken });
    const r = (await ctx.runAction(internal.discordRoles.grantCardRoleAll, {})) as Record<string, unknown>;
    const msg = 'erreur' in r ? `Discord : ${String(r.erreur)}` : `Rôle « Card » : ${r.joueurs} joueur(s) · ajoutés ${r.ajoutes} · absents du serveur ${r.absents}${String(r.refuses).startsWith('0') ? '' : ` · refusés ${r.refuses}`}`;
    await ctx.runMutation(internal.adminDash.logAction, { byUserId: me.id, byName: me.name, action: 'discord', detail: msg });
    return msg;
  },
});

// ─────────────────────────────── cartes à corriger ───────────────────────────────

export const fixes = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireStaff(ctx, sessionToken);
    const todo = await ctx.db.query('cardFixes').withIndex('by_status', (q) => q.eq('status', 'afaire')).order('desc').take(300);
    const done = await ctx.db.query('cardFixes').withIndex('by_status', (q) => q.eq('status', 'fait')).order('desc').take(60);
    return [...todo, ...done].map((f) => {
      const c = catalogCard(f.cardId);
      return { id: f._id as string, cardId: f.cardId, name: c?.name ?? f.cardId, rarity: c?.baseRarity, subthemeId: c?.subthemeId, note: f.note, imageUrl: f.imageUrl, status: f.status, by: f.byName, fromPlayer: !!f.suggestionId, updatedAt: f.updatedAt };
    });
  },
});

export const addFix = mutation({
  args: { sessionToken: v.string(), cardId: v.string(), note: v.string(), imageUrl: v.optional(v.string()), suggestionId: v.optional(v.id('suggestions')) },
  handler: async (ctx, a) => {
    const me = await requireStaff(ctx, a.sessionToken);
    const c = catalogCard(a.cardId);
    if (!c) throw new ConvexError('Carte inconnue.');
    const img = a.imageUrl?.trim().slice(0, 1000) || undefined;
    if (img && !/^https?:\/\/\S+$/i.test(img)) throw new ConvexError('Le lien de l’image doit commencer par http:// ou https://.');
    const now = Date.now();
    const open = (await ctx.db.query('cardFixes').withIndex('by_card', (q) => q.eq('cardId', c.id)).collect()).find((f) => f.status === 'afaire');
    const note = a.note.trim().slice(0, 500);
    if (open) {
      // déjà dans la liste : on complète la ligne existante plutôt que d'en créer une deuxième
      await ctx.db.patch(open._id, { note: [open.note, note].filter(Boolean).join(' · ').slice(0, 800), ...(img ? { imageUrl: img } : {}), updatedAt: now });
    } else {
      await ctx.db.insert('cardFixes', { cardId: c.id, note, ...(img ? { imageUrl: img } : {}), status: 'afaire', ...(a.suggestionId ? { suggestionId: a.suggestionId } : {}), byName: me.displayName, createdAt: now, updatedAt: now });
    }
    if (a.suggestionId) {
      const s = await ctx.db.get(a.suggestionId);
      if (s && s.status === 'nouvelle') await ctx.db.patch(s._id, { status: 'acceptee', updatedAt: now });
    }
    await log(ctx, me, 'carte à corriger', `${c.name}${note ? ` — ${note}` : ''}`);
    return open ? `${c.name} était déjà dans la liste : note ajoutée.` : `${c.name} ajoutée aux cartes à corriger.`;
  },
});

export const setFix = mutation({
  args: { sessionToken: v.string(), id: v.id('cardFixes'), status: v.optional(v.union(v.literal('afaire'), v.literal('fait'))), note: v.optional(v.string()), remove: v.optional(v.boolean()) },
  handler: async (ctx, { sessionToken, id, status, note, remove }) => {
    const me = await requireStaff(ctx, sessionToken);
    const f = await ctx.db.get(id);
    if (!f) throw new ConvexError('Ligne introuvable.');
    const name = catalogCard(f.cardId)?.name ?? f.cardId;
    if (remove) {
      await ctx.db.delete(id);
      await log(ctx, me, 'carte à corriger', `${name} retirée de la liste`);
      return;
    }
    await ctx.db.patch(id, { ...(status ? { status } : {}), ...(note !== undefined ? { note: note.trim().slice(0, 800) } : {}), updatedAt: Date.now() });
    if (status) await log(ctx, me, 'carte à corriger', `${name} : ${status === 'fait' ? 'corrigée' : 'à refaire'}`);
  },
});

/** Journal du dashboard : les 150 dernières actions. */
export const journal = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireStaff(ctx, sessionToken);
    const rows = await ctx.db.query('adminLog').withIndex('by_at').order('desc').take(150);
    return rows.map((r) => ({ at: r.at, by: r.byName, action: r.action, target: r.target, detail: r.detail }));
  },
});

// ─────────────────────────────── (10/11, amélioration) actions en plus ───────────────────────────────

/** Toutes les cartes d'un joueur (pour retirer une carte en trop après un bug). */
export const playerCards = query({
  args: { sessionToken: v.string(), id: v.id('users') },
  handler: async (ctx, { sessionToken, id }) => {
    await requireStaff(ctx, sessionToken);
    const inv = await ctx.db.query('inventory').withIndex('by_user', (q) => q.eq('userId', id)).collect();
    return inv.map((r) => ({ cardId: r.cardId, rarity: r.rarity, count: r.count, mint: r.bestMintNumber }));
  },
});

/** Retire des exemplaires (doublon après un bug, carte donnée par erreur). Refusé si la carte est engagée dans un échange. */
export const takeCard = mutation({
  args: { sessionToken: v.string(), id: v.id('users'), cardId: v.string(), rarity: rarityValidator, count: v.number(), reason: v.string() },
  handler: async (ctx, { sessionToken, id, cardId, rarity, count, reason }) => {
    const me = await requireStaff(ctx, sessionToken);
    const u = await player(ctx, id);
    const n = Math.floor(count);
    if (!(n >= 1 && n <= 50)) throw new ConvexError('Entre 1 et 50 exemplaires.');
    const why = reason.trim().slice(0, 120);
    if (!why) throw new ConvexError('Écris la raison (elle reste dans le journal).');
    try {
      await takeCards(ctx, id, [{ cardId, rarity, count: n }]);
    } catch (e) {
      throw new ConvexError(String((e as { data?: unknown }).data ?? (e as Error).message).replace(/^Tu n’as/, `${u.displayName} n’a`));
    }
    const name = catalogCard(cardId)?.name ?? cardId;
    await log(ctx, me, 'carte retirée', `−${n} × ${name} (${RARITY_LABEL[rarity]}) : ${why}`, u.displayName);
    return `−${n} × ${name} (${RARITY_LABEL[rarity]}) retiré à ${u.displayName}.`;
  },
});

/** Ferme toutes ses sessions (jeu bloqué, compte partagé…) : il se reconnecte, rien n'est perdu. */
export const logout = mutation({
  args: { sessionToken: v.string(), id: v.id('users') },
  handler: async (ctx, { sessionToken, id }) => {
    const me = await requireStaff(ctx, sessionToken);
    const u = await player(ctx, id);
    if (u._id === me._id) throw new ConvexError('Pas toi : tu fermerais ta propre session ici.');
    const rows = await ctx.db.query('sessions').withIndex('by_userId', (q) => q.eq('userId', id)).collect();
    for (const r of rows) await ctx.db.delete(r._id);
    await log(ctx, me, 'déconnexion', `${rows.length} session(s) fermée(s)`, u.displayName);
    return `${u.displayName} déconnecté (${rows.length} session(s)). Il se reconnecte normalement.`;
  },
});

/** Annule ses échanges en attente (échange bloqué) : les cartes redeviennent libres des deux côtés. */
export const cancelTrades = mutation({
  args: { sessionToken: v.string(), id: v.id('users') },
  handler: async (ctx, { sessionToken, id }) => {
    const me = await requireStaff(ctx, sessionToken);
    const u = await player(ctx, id);
    const now = Date.now();
    const rows = [
      ...(await ctx.db.query('trades').withIndex('by_fromUser_status', (q) => q.eq('fromUserId', id).eq('status', 'pending')).collect()),
      ...(await ctx.db.query('trades').withIndex('by_toUser_status', (q) => q.eq('toUserId', id).eq('status', 'pending')).collect()),
    ];
    for (const t of rows) await ctx.db.patch(t._id, { status: 'cancelled', resolvedAt: now });
    await log(ctx, me, 'échanges', `${rows.length} échange(s) en attente annulé(s)`, u.displayName);
    return `${rows.length} échange(s) en attente annulé(s) pour ${u.displayName}.`;
  },
});

/** Note interne sur un joueur (ex. « a payé l'abonnement le 10/11 ») — jamais visible du joueur. */
export const addNote = mutation({
  args: { sessionToken: v.string(), id: v.id('users'), text: v.string() },
  handler: async (ctx, { sessionToken, id, text }) => {
    const me = await requireStaff(ctx, sessionToken);
    const u = await player(ctx, id);
    const t = text.trim().slice(0, 500);
    if (!t) throw new ConvexError('Note vide.');
    await ctx.db.insert('playerNotes', { userId: id, text: t, byName: me.displayName, at: Date.now() });
    await log(ctx, me, 'note', t, u.displayName);
    return 'Note ajoutée.';
  },
});
export const removeNote = mutation({
  args: { sessionToken: v.string(), noteId: v.id('playerNotes') },
  handler: async (ctx, { sessionToken, noteId }) => {
    await requireStaff(ctx, sessionToken);
    if (await ctx.db.get(noteId)) await ctx.db.delete(noteId);
  },
});

/** Cadeau à tout le monde (compensation après un bug, fête…) : boosters et / ou pièces à chaque joueur non banni. */
export const giftAll = mutation({
  args: { sessionToken: v.string(), packs: v.optional(v.number()), coins: v.optional(v.number()), label: v.string(), activeDays: v.optional(v.number()), notify: v.optional(v.boolean()) },
  handler: async (ctx, a): Promise<string> => {
    const me = await requireStaff(ctx, a.sessionToken);
    const packs = Math.floor(a.packs ?? 0);
    const coins = Math.floor(a.coins ?? 0);
    if (packs < 0 || packs > 50 || coins < 0 || coins > 20_000) throw new ConvexError('Au plus 50 boosters et 20 000 pièces par joueur.');
    if (!packs && !coins) throw new ConvexError('Mets au moins des boosters ou des pièces.');
    const label = a.label.trim().slice(0, 80) || 'Cadeau de l’équipe';
    const now = Date.now();
    const since = a.activeDays ? now - a.activeDays * DAY : 0;
    const users = (await ctx.db.query('users').collect()).filter((u) => !u.bannedAt && u.lastSeenAt >= since);
    for (const u of users) {
      if (packs) await addPacks(ctx, u._id, packs);
      if (coins) await addCoins(ctx, u._id, coins, 'admin', label);
    }
    const what = [packs && `${packs} booster${packs > 1 ? 's' : ''}`, coins && `${num(coins)} pièces`].filter(Boolean).join(' + ');
    let notified = '';
    if (a.notify) {
      const r = await tryAnnounce(ctx, 'Cadeau de l’équipe 🎁', `${what} pour toi : ${label}`);
      notified = r ? ` · notification à ${r.players} joueur(s)` : ' · (notifications pas disponibles sur cette version)';
    }
    await log(ctx, me, 'cadeau à tous', `${what} à ${users.length} joueur(s)${a.activeDays ? ` actifs ${a.activeDays} j` : ''} — ${label}${notified}`);
    return `${what} donnés à ${users.length} joueur(s)${notified}.`;
  },
});
const num = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

/** Qui possède cette carte ? (toutes raretés) */
export const cardOwners = query({
  args: { sessionToken: v.string(), cardId: v.string() },
  handler: async (ctx, { sessionToken, cardId }) => {
    await requireStaff(ctx, sessionToken);
    const rows = await ctx.db.query('inventory').withIndex('by_card_rarity', (q) => q.eq('cardId', cardId)).take(500);
    const names = new Map<string, string>();
    for (const r of rows) if (!names.has(r.userId)) names.set(r.userId, (await ctx.db.get(r.userId))?.displayName ?? '?');
    return rows.map((r) => ({ name: names.get(r.userId)!, rarity: r.rarity, count: r.count, mint: r.bestMintNumber })).sort((x, y) => y.count - x.count);
  },
});

/** Roulette en panne : forcer le tirage en cours, ou remettre un pot de base. */
export const rouletteDraw = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }): Promise<string> => {
    const me = await requireStaff(ctx, sessionToken);
    const r: unknown = await ctx.runMutation(internal.games.forceDraw, {});
    const msg = r ? `Tirage forcé : ${JSON.stringify(r).slice(0, 220)}` : 'Aucun tirage en cours.';
    await log(ctx, me, 'roulette', msg);
    return msg;
  },
});
export const rouletteSeed = mutation({
  args: { sessionToken: v.string(), coins: v.number() },
  handler: async (ctx, { sessionToken, coins }): Promise<string> => {
    const me = await requireStaff(ctx, sessionToken);
    const c = Math.floor(coins);
    if (!(c >= 0 && c <= 50_000)) throw new ConvexError('Entre 0 et 50 000 pièces.');
    const r: unknown = await ctx.runMutation(internal.games.seedRouletteCmd, { coins: c });
    const msg = `Pot de roulette : ${JSON.stringify(r).slice(0, 220)}`;
    await log(ctx, me, 'roulette', msg);
    return msg;
  },
});
