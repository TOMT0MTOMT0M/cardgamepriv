import { fe } from '../src/core/errors';
import { packCapOf } from '../src/core/abo';
import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireUser } from './auth';
import { patchLive } from './liveUser';
import { fullAt } from '../src/core/packRegen';
import { fm, type Msg } from '../src/core/msgs';
import { msgIn, userLang } from './i18nServer';
import { msgParamsValidator } from './schema';
import { missionDay, missionsReady, type MissionsState } from '../src/core/missions';
import { missionWeek, weeklyReady, type WeeklyState } from '../src/core/weekly';
import { calendarDay, calendarReward } from '../src/core/economy';
import { parisHour } from '../src/core/games';

/**
 * NOTIFICATIONS PUSH (V2, docs/IDEES-V2.md §1) — côté base. L'envoi réel (Web Push, bibliothèque `web-push`,
 * runtime Node) est dans pushSend.ts. Ici : abonnements, préférences, file d'envoi avec garde-fous, et la
 * programmation de « réserve pleine ».
 *
 * Types (`kind`) : reserve · trade · friend · referral · game · streak · news · chat (convex/chat.ts) · roulette · daily
 * (V3 : streak = série en danger, daily = missions / cadeau du jour — remindTick plus bas). Le joueur coche ce qu'il veut (users.notifPrefs ;
 * absent = tout). Garde-fous : rien entre 23 h et 8 h (heure de Paris) sauf `trade` / `friend` / `game` reportés à 8 h ;
 * un même type regroupé : au plus une notification par type et par joueur toutes les 2 minutes (la dernière gagne).
 */
export const KINDS = ['reserve', 'trade', 'friend', 'referral', 'game', 'streak', 'news', 'chat', 'roulette', 'daily'] as const;
/** (13/11, retours Hugo) types À LA DEMANDE : envoyés seulement si le joueur les a cochés (absent ≠ tout) */
// (v2.0.7, décision de Tom) plus aucun type « à cocher » : tout est actif par défaut, le joueur décoche ce qu'il ne veut pas
export const OPT_IN: readonly Kind[] = [];
/**
 * (V3, notifications) types arrivés après les réglages de la V2 : « série en danger » (`streak`, déjà dans la liste mais
 * jamais envoyé ni affiché) et « missions / cadeau du jour » (`daily`). Actifs aussi pour qui a déjà réglé ses
 * notifications, tant qu'il n'a pas enregistré ses réglages depuis la V3 (marque `PREFS_V3` posée par `setPrefs`).
 */
export const NEW_KINDS: readonly Kind[] = ['streak', 'daily'];
export const PREFS_V3 = '~v3';
/** préférences effectives : celles du joueur, ou tout sauf les types à la demande */
export const prefsOf = (u: { notifPrefs?: string[] }): string[] => {
  const p = u.notifPrefs;
  if (!p) return KINDS.filter((k) => !OPT_IN.includes(k));
  if (p.includes(PREFS_V3)) return p.filter((k) => k !== PREFS_V3);
  return [...new Set([...p, ...NEW_KINDS])];
};
export type Kind = (typeof KINDS)[number];
const kindValidator = v.union(...KINDS.map((k) => v.literal(k)));

export interface Payload {
  kind: Kind;
  /** (version anglaise, lot 4) texte fixe, ou message codé (src/core/msgs.ts) rendu dans la langue du joueur */
  title: string | Msg;
  body: string | Msg;
  /** page à ouvrir (hash) : #/echanges, #/amis, #/ … */
  url: string;
  /** même tag = la nouvelle remplace l'ancienne dans le centre de notifications */
  tag?: string;
}

// heure de Paris (0..23) : src/core/games.ts. (V3, lot notifications) avant, ici : `Number()` du texte français « 22 h »
// = NaN, donc la nuit n'était jamais reconnue (rien reporté à 8 h) ; vu par les tests de convex/pushRappels.test.ts
/** prochain 8 h (Paris) après `t` */
function next8h(t: number): number {
  // on avance par pas d'un quart d'heure jusqu'à 8 h : simple et juste avec l'heure d'été
  let x = t;
  for (let i = 0; i < 24 * 4 && parisHour(x) !== 8; i++) x += 15 * 60 * 1000;
  return x - (x % (15 * 60 * 1000));
}
const NIGHT = (h: number) => h >= 23 || h < 8;
/** entre 23 h et 8 h (heure de Paris) ? */
export const isNightParis = (t: number) => NIGHT(parisHour(t));

/** Clé publique VAPID (posée par lanceurs\activer-notifications.cmd) : le client en a besoin pour s'abonner. */
export const vapidPublicKey = query({
  args: {},
  handler: async () => process.env.VAPID_PUBLIC_KEY ?? null,
});

export const status = query({
  args: { sessionToken: v.string(), endpoint: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, endpoint }) => {
    const user = await requireUser(ctx, sessionToken);
    const subs = await ctx.db.query('pushSubs').withIndex('by_user', (q) => q.eq('userId', user._id)).collect();
    return {
      configured: !!process.env.VAPID_PUBLIC_KEY,
      devices: subs.length,
      thisDevice: !!endpoint && subs.some((s) => s.endpoint === endpoint),
      prefs: prefsOf(user),
    };
  },
});

export const subscribe = mutation({
  args: { sessionToken: v.string(), endpoint: v.string(), keys: v.object({ p256dh: v.string(), auth: v.string() }), ua: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, endpoint, keys, ua }) => {
    const user = await requireUser(ctx, sessionToken);
    if (!process.env.VAPID_PUBLIC_KEY) throw new ConvexError(fe('push.1'));
    const old = await ctx.db.query('pushSubs').withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint)).unique();
    if (old) await ctx.db.patch(old._id, { userId: user._id, keys, ua: ua?.slice(0, 160), failures: 0 });
    else await ctx.db.insert('pushSubs', { userId: user._id, endpoint, keys, ua: ua?.slice(0, 160), createdAt: Date.now(), failures: 0 });
    await scheduleReserveFull(ctx, user._id);
    return { ok: true };
  },
});

export const unsubscribe = mutation({
  args: { sessionToken: v.string(), endpoint: v.string() },
  handler: async (ctx, { sessionToken, endpoint }) => {
    const user = await requireUser(ctx, sessionToken);
    const old = await ctx.db.query('pushSubs').withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint)).unique();
    if (old && old.userId === user._id) await ctx.db.delete(old._id);
    return { ok: true };
  },
});

export const setPrefs = mutation({
  // (V3) `full` : la liste vient des réglages V3 (qui montrent tous les types) → elle fait foi pour les nouveaux types aussi
  args: { sessionToken: v.string(), prefs: v.array(kindValidator), full: v.optional(v.boolean()) },
  handler: async (ctx, { sessionToken, prefs, full }) => {
    const user = await requireUser(ctx, sessionToken);
    await ctx.db.patch(user._id, { notifPrefs: [...new Set(prefs), ...(full ? [PREFS_V3] : [])] });
    return { ok: true };
  },
});

/** Un appareil a renvoyé 404 / 410 (abonnement expiré) ou 3 échecs : on l'oublie. */
export const dropSub = internalMutation({
  args: { endpoint: v.string(), hard: v.boolean() },
  handler: async (ctx, { endpoint, hard }) => {
    const s = await ctx.db.query('pushSubs').withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint)).unique();
    if (!s) return;
    const failures = (s.failures ?? 0) + 1;
    if (hard || failures >= 3) await ctx.db.delete(s._id);
    else await ctx.db.patch(s._id, { failures });
  },
});
export const markOk = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const s = await ctx.db.query('pushSubs').withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint)).unique();
    if (s) await ctx.db.patch(s._id, { failures: 0, lastOkAt: Date.now() });
  },
});

/**
 * ENVOYER à un joueur (depuis les mutations du jeu). Respecte ses préférences, la nuit et le regroupement, puis
 * programme l'action Node. Ne lève jamais : une notification ne doit pas faire échouer un échange.
 */
export async function notify(
  ctx: MutationCtx,
  userId: Id<'users'>,
  p: Payload,
  /**
   * `once` (V3) : clé « une fois par jour » — rien si un push de même clé est déjà parti aujourd'hui (jour de Paris) pour
   * ce joueur (table `pushDaily`). Point d'entrée commun pour les autres lots (ex. `once: \`wish-${cardId}\``).
   * `user` : le document joueur déjà lu par l'appelant (pas relu).
   */
  opts: { at?: number; once?: string; user?: Doc<'users'> } = {},
): Promise<boolean> {
  try {
    if (!process.env.VAPID_PUBLIC_KEY) return false;
    const user = opts.user ?? (await ctx.db.get(userId));
    if (!user) return false;
    if (!prefsOf(user).includes(p.kind)) return false;
    const subs = await ctx.db.query('pushSubs').withIndex('by_user', (q) => q.eq('userId', userId)).collect();
    if (!subs.length) return false;
    let at = opts.at ?? Date.now();
    // la nuit : rien d'urgent, on reporte à 8 h (sauf `news` / `reserve` / rappels du jour, abandonnés : ce sera dépassé)
    if (NIGHT(parisHour(at))) {
      if (p.kind === 'news' || p.kind === 'reserve' || p.kind === 'streak' || p.kind === 'daily') return false;
      at = next8h(at);
    }
    if (opts.once) {
      const day = missionDay(at);
      const key = opts.once;
      if (await ctx.db.query('pushDaily').withIndex('by_user_key_day', (q) => q.eq('userId', userId).eq('key', key).eq('day', day)).first()) return false;
      await ctx.db.insert('pushDaily', { userId, key, day });
    }
    // regroupement : un même tag remplace la notification précédente ; on retarde de 90 s pour laisser les rafales se calmer
    const delay = Math.max(0, at - Date.now()) + (opts.at ? 0 : 90_000);
    await ctx.scheduler.runAfter(delay, internal.pushSend.send, {
      subs: subs.map((s) => ({ endpoint: s.endpoint, keys: s.keys })),
      payload: { ...p, title: msgIn(userLang(user), p.title), body: msgIn(userLang(user), p.body), tag: p.tag ?? `${p.kind}` },
    });
    return true;
  } catch (e) {
    console.warn('[push] notify', e);
    return false;
  }
}

// ═════════════════════════════════════════════ (V3) rappels du jour : série en danger, missions / cadeau du jour

/** « série en danger » : 20 h (Paris) */
export const STREAK_HOUR = 20;
/** « missions / cadeau du jour » : de 9 h à 21 h (Paris), jamais entre 22 h et 9 h */
export const DAILY_FROM = 9;
export const DAILY_TO = 21;
const HOUR = 3600_000;
/** joueur parti depuis au moins 1 h (sinon il est encore dans le jeu et voit déjà ses pastilles) */
const AWAY_MS = HOUR;

/** Ce que la tâche horaire fait à l'instant `now` (heure de Paris, été comme hiver). */
export function remindSlots(now: number) {
  const h = parisHour(now);
  return { h, streak: h === STREAK_HOUR, daily: h >= DAILY_FROM && h <= DAILY_TO, purge: h === DAILY_FROM };
}

/**
 * Tâche horaire (crons.ts). Coût : ne lit que les joueurs repérés par l'index `lastSeenAt` dans une fenêtre étroite
 * (jamais les inventaires) :
 *  - 20 h : vus hier mais pas aujourd'hui, série ≥ 2 jours → « ta série s'arrête à minuit » (type `streak`) ;
 *  - 9 h → 21 h : partis dans l'heure précédente (à 9 h : depuis 20 h la veille), passés aujourd'hui, avec des missions
 *    terminées non récupérées ou le cadeau du calendrier pas pris → un rappel (type `daily`).
 * Au plus 1 push par type et par jour (`once`). Un joueur qui n'est pas passé aujourd'hui ne reçoit que la série en danger.
 */
export const remindTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const out = { read: 0, streak: 0, daily: 0, purged: 0 };
    if (!process.env.VAPID_PUBLIC_KEY) return out;
    const slot = remindSlots(now);
    const base = now - (now % HOUR); // début de l'heure (Paris est à une heure pleine d'UTC)
    const today = missionDay(now);
    if (slot.streak) {
      const yesterday = missionDay(base - 24 * HOUR);
      const seen = await ctx.db.query('users').withIndex('by_lastSeenAt', (q) => q.gte('lastSeenAt', base - 48 * HOUR).lt('lastSeenAt', base - 18 * HOUR)).take(500);
      out.read += seen.length;
      for (const u of seen) {
        const s = u.streak;
        if (u.bannedAt || !s || s.day !== yesterday || s.count < 2) continue;
        const day = calendarDay(s.count + 1);
        if (await notify(ctx, u._id, { kind: 'streak', title: fm('n.streakRisk', { n: s.count }), body: fm('n.streakRiskBody', { day }), url: '#/', tag: 'streak' }, { at: now, once: 'streak', user: u })) out.streak++;
      }
    }
    if (slot.daily) {
      const from = slot.h === DAILY_FROM ? base - 13 * HOUR : base - 2 * HOUR;
      const left = await ctx.db.query('users').withIndex('by_lastSeenAt', (q) => q.gte('lastSeenAt', from).lt('lastSeenAt', base - AWAY_MS)).take(500);
      out.read += left.length;
      const week = missionWeek(now);
      for (const u of left) {
        if (u.bannedAt || u.streak?.day !== today) continue;
        const n = (u.missions?.day === today ? missionsReady(u.missions as MissionsState) : 0) + (u.weekly?.week === week ? weeklyReady(u.weekly as WeeklyState) : 0);
        const gift = u.econ?.calendarDay !== today;
        if (!n && !gift) continue;
        let title: Msg, body: Msg;
        if (n) {
          title = fm('n.dailyMissions', { n });
          body = fm(gift ? 'n.dailyMissionsGiftBody' : 'n.dailyMissionsBody');
        } else {
          const day = calendarDay(u.streak.count);
          const r = calendarReward(day, now);
          title = fm('n.dailyGift');
          body = r.packs ? fm('n.dailyGiftBodyPacks', { day, coins: r.coins, packs: r.packs }) : fm('n.dailyGiftBody', { day, coins: r.coins });
        }
        if (await notify(ctx, u._id, { kind: 'daily', title, body, url: '#/', tag: 'daily' }, { at: now, once: 'daily', user: u })) out.daily++;
      }
    }
    // ménage : lignes « déjà envoyé » de plus de 2 jours
    if (slot.purge) {
      const old = await ctx.db.query('pushDaily').withIndex('by_day', (q) => q.lt('day', missionDay(base - 48 * HOUR))).take(400);
      for (const d of old) await ctx.db.delete(d._id);
      out.purged = old.length;
    }
    return out;
  },
});

/**
 * « Réserve pleine » : calcule l'instant exact où la réserve atteindra 15/15 et programme la notification à ce
 * moment-là ; annule la précédente. À rappeler à chaque ouverture / gain de boosters / boost.
 */
export async function scheduleReserveFull(ctx: MutationCtx, userId: Id<'users'>, live?: Doc<'users'>): Promise<void> {
  try {
    // (26/11, coût) `live` : le joueur déjà lu et tenu à jour par la mutation (convex/liveUser.ts), pas relu
    const u = live ?? (await ctx.db.get(userId));
    if (!u) return;
    const put = (f: Partial<Doc<'users'>>) => (live ? patchLive(ctx, live, f) : ctx.db.patch(userId, f));
    // l'instant visé, ou `null` s'il n'y a rien à programmer
    let at: number | null = null;
    if (process.env.VAPID_PUBLIC_KEY && !(u.notifPrefs && !u.notifPrefs.includes('reserve')) && (await ctx.db.query('pushSubs').withIndex('by_user', (q) => q.eq('userId', userId)).first()))
      at = fullAt(u.packBalance, u.packRegenAt ?? u.lastSeenAt, Date.now(), u.regenBoostUntil, packCapOf(u, Date.now()));
    const regenAt = u.packRegenAt ?? u.lastSeenAt;
    const key = at === null ? undefined : `${at}:${u.packBalance}:${regenAt}`;
    // (audit 12/11, S11 / E1-07) le même job attend déjà (même instant, même réserve) : AUCUNE écriture. Avant : annulé
    // puis reprogrammé à l'identique, soit 2 écritures du document joueur à chaque chargement de l'appli (push.subscribe),
    // qui relançaient ses requêtes et celles de ses amis.
    if (key && u.notifFullJob && u.notifFullKey === key && (await ctx.db.system.get(u.notifFullJob))?.state.kind === 'pending') return;
    if (u.notifFullJob) await ctx.scheduler.cancel(u.notifFullJob).catch(() => undefined);
    if (at === null) {
      if (u.notifFullJob || u.notifFullKey) await put({ notifFullJob: undefined, notifFullKey: undefined });
      return;
    }
    const job = await ctx.scheduler.runAt(at + 1000, internal.push.reserveFull, { userId, balance: u.packBalance, regenAt });
    await put({ notifFullJob: job, notifFullKey: key });
  } catch (e) {
    console.warn('[push] réserve', e);
  }
}

/** le moment est venu : si rien n'a bougé entre-temps (sinon un autre job a été programmé), on envoie */
export const reserveFull = internalMutation({
  args: { userId: v.id('users'), balance: v.number(), regenAt: v.number() },
  handler: async (ctx, { userId, balance, regenAt }) => {
    const u = await ctx.db.get(userId);
    if (!u || u.packBalance !== balance || (u.packRegenAt ?? u.lastSeenAt) !== regenAt) return;
    await ctx.db.patch(userId, { notifFullJob: undefined, notifFullKey: undefined });
    await notify(ctx, userId, { kind: 'reserve', title: fm('n.reserveFull'), body: fm('n.reserveFullBody'), url: '#/' }, { at: Date.now() });
  },
});

/** Annonce de l'équipe à tout le monde (lanceur : `npx convex run push:announce '{"title":…,"body":…}'`). */
export const announce = internalMutation({
  args: {
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    /** (version anglaise, lot 4) annonce automatique (booster du moment) : messages codés, rendus dans la langue de chacun */
    titleMsg: v.optional(v.object({ key: v.string(), params: v.optional(msgParamsValidator) })),
    bodyMsg: v.optional(v.object({ key: v.string(), params: v.optional(msgParamsValidator) })),
  },
  handler: async (ctx, { title: t0, body: b0, url, titleMsg, bodyMsg }) => {
    const title = titleMsg ? ({ text: t0, ...titleMsg } as Msg) : t0;
    const body = bodyMsg ? ({ text: b0, ...bodyMsg } as Msg) : b0;
    const subs = await ctx.db.query('pushSubs').collect();
    const byUser = new Map<string, Doc<'pushSubs'>[]>();
    for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);
    let n = 0;
    for (const [userId] of byUser) {
      await notify(ctx, userId as Id<'users'>, { kind: 'news', title, body, url: url ?? '#/maj', tag: `news-${Date.now()}` }, { at: Date.now() });
      n++;
    }
    return { players: n, devices: subs.length };
  },
});

/** Test depuis le jeu (bouton « M'envoyer un test ») */
export const sendTest = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await requireUser(ctx, sessionToken);
    const subs = await ctx.db.query('pushSubs').withIndex('by_user', (q) => q.eq('userId', user._id)).collect();
    if (!subs.length) throw new ConvexError(fe('push.2'));
    await ctx.scheduler.runAfter(0, internal.pushSend.send, {
      subs: subs.map((s) => ({ endpoint: s.endpoint, keys: s.keys })),
      payload: { kind: 'news', title: 'Bébou : ça marche !', body: 'Tu recevras ici les échanges, les amis, la réserve pleine…', url: '#/profil', tag: 'test' },
    });
    return { devices: subs.length };
  },
});
