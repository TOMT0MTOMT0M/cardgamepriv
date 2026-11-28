import { internalMutation } from './_generated/server';
import { notify } from './push';
import { fm, type Msg } from '../src/core/msgs';
import { missionDay, parisHour } from '../src/core/parisTime';
import { missionsReady, type MissionsState } from '../src/core/missions';
import { missionWeek, weeklyReady, type WeeklyState } from '../src/core/weekly';
import { calendarDay, calendarReward } from '../src/core/economy';

/**
 * (V3, lot notifications) RAPPELS PUSH DU JOUR : « série en danger » et « missions / cadeau du jour » (tâche horaire,
 * crons.ts). Avant : `push:remindTick` dans push.ts.
 *
 * (audit perf V3 n°10) Ici et plus dans push.ts : compter les missions et le cadeau du calendrier passe par
 * src/core/missions.ts, weekly.ts et economy.ts, qui importent le catalogue de cartes. Dans push.ts, ces imports le
 * faisaient charger à chaque exécution du module (`push:status`, `markOk` après chaque envoi…) ET à tous les modules qui
 * importent `notify` (amis, parrainage, abonnement…) : ≈ 0,15-0,2 s chacune sur le staging. Même code qu'avant.
 */

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
