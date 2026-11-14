/**
 * MISSIONS — PIÈCES (spec économie, 3 nov.). Logique pure partagée serveur / démo / interface.
 *
 *  - Missions du JOUR (src/core/missions.ts) : elles gardent leurs boosters ET rapportent en plus ~40 pièces chacune
 *    (décision de Tom : « boosters + pièces »). Les pièces se calculent à partir de la mission, rien de plus à stocker.
 *  - Missions de la SEMAINE (ici) : 3 par joueur et par semaine (lundi → dimanche, heure de Paris), ~200 pièces chacune.
 *    Tirage déterministe (joueur + semaine) : rien n'est écrit tant qu'on ne progresse pas.
 */
import { fe } from './errors';
import { t } from './i18n';
import { missionDay, type Mission } from './missions';

/** Pièces d'une mission du jour, en plus de ses boosters : 40 / 50 / 60 selon sa difficulté. */
export const dailyMissionCoins = (m: Pick<Mission, 'reward'>) => 30 + 10 * Math.max(1, m.reward);

export type WeeklyKind = 'open' | 'epic' | 'newCards' | 'contract' | 'trade' | 'game' | 'burn' | 'win';

export interface WeeklyMission {
  id: string;
  kind: WeeklyKind;
  target: number;
  progress: number;
  /** pièces */
  reward: number;
  claimed: boolean;
}

export interface WeeklyState {
  /** lundi de la semaine (« 2026-11-02 ») */
  week: string;
  list: WeeklyMission[];
}

/** Ce qui fait avancer les missions de la semaine. */
export type WeeklyEvent =
  | { type: 'pack'; cards: Array<{ rarity: string; isNew: boolean }> }
  | { type: 'contract' }
  | { type: 'trade' }
  | { type: 'game'; won: boolean }
  | { type: 'burn'; count: number };

const TIER: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };

/** Lundi (heure de Paris) de la semaine d'un instant. */
export function missionWeek(now: number): string {
  const day = missionDay(now);
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // lundi = 0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

/** Prochain lundi 0 h (heure de Paris), à la minute près. */
export function nextWeekReset(now: number): number {
  const w = missionWeek(now);
  let lo = now;
  let hi = now + 8 * 24 * 3600_000;
  while (hi - lo > 30_000) {
    const mid = (lo + hi) / 2;
    if (missionWeek(mid) === w) lo = mid;
    else hi = mid;
  }
  return hi;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rand(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [sorte, objectifs possibles, poids] — récompense de 150 à 250 pièces selon l'objectif tiré */
const POOL: Array<[WeeklyKind, number[], number]> = [
  ['open', [25, 35, 50], 3],
  ['epic', [5, 8, 12], 2],
  ['newCards', [30, 50, 80], 2.5],
  ['contract', [2, 3, 5], 1.5],
  ['trade', [1, 2, 3], 1.2],
  ['game', [2, 4, 6], 2],
  ['win', [1, 2, 3], 1],
  ['burn', [20, 40, 80], 1.5],
];

/** Les 3 missions de la semaine d'un joueur (toujours les mêmes pour ce joueur cette semaine-là). */
export function weeklyMissions(userKey: string, week: string): WeeklyState {
  const r = rand(`${userKey}|w|${week}`);
  const used = new Set<WeeklyKind>();
  const list: WeeklyMission[] = [];
  for (let i = 0; i < 3; i++) {
    const pool = POOL.filter(([k]) => !used.has(k) && !(k === 'win' && used.has('game')) && !(k === 'game' && used.has('win')));
    const total = pool.reduce((a, [, , w]) => a + w, 0);
    let x = r() * total;
    let pick = pool[pool.length - 1];
    for (const p of pool) if ((x -= p[2]) <= 0) {
      pick = p;
      break;
    }
    used.add(pick[0]);
    const lvl = Math.floor(r() * pick[1].length);
    list.push({ id: `${week}-w${i}`, kind: pick[0], target: pick[1][lvl], progress: 0, reward: 150 + 50 * lvl, claimed: false });
  }
  return { week, list };
}

export function currentWeekly(saved: WeeklyState | null | undefined, userKey: string, now: number): WeeklyState {
  const week = missionWeek(now);
  return saved && saved.week === week ? saved : weeklyMissions(userKey, week);
}

export function applyWeeklyEvent(s: WeeklyState, ev: WeeklyEvent): { state: WeeklyState; changed: boolean } {
  let changed = false;
  const list = s.list.map((m) => {
    if (m.claimed || m.progress >= m.target) return m;
    let add = 0;
    if (ev.type === 'pack') {
      if (m.kind === 'open') add = 1;
      else if (m.kind === 'epic') add = ev.cards.filter((c) => TIER[c.rarity] >= 3).length;
      else if (m.kind === 'newCards') add = ev.cards.filter((c) => c.isNew).length;
    } else if (ev.type === 'contract' && m.kind === 'contract') add = 1;
    else if (ev.type === 'trade' && m.kind === 'trade') add = 1;
    else if (ev.type === 'game') add = m.kind === 'game' ? 1 : m.kind === 'win' && ev.won ? 1 : 0;
    else if (ev.type === 'burn' && m.kind === 'burn') add = ev.count;
    if (!add) return m;
    changed = true;
    return { ...m, progress: Math.min(m.target, m.progress + add) };
  });
  return { state: { ...s, list }, changed };
}

export function claimWeekly(s: WeeklyState, id: string): { state: WeeklyState; reward: number } | string {
  const m = s.list.find((x) => x.id === id);
  if (!m) return fe('weekly.1');
  if (m.claimed) return fe('weekly.2');
  if (m.progress < m.target) return fe('weekly.3');
  return { state: { ...s, list: s.list.map((x) => (x.id === id ? { ...x, claimed: true } : x)) }, reward: m.reward };
}

export function weeklyLabel(m: WeeklyMission): string {
  const n = m.target;
  switch (m.kind) {
    case 'open':
      return t('wk.open', { n });
    case 'epic':
      return t('wk.epic', { n });
    case 'newCards':
      return t('ms.newCards', { n });
    case 'contract':
      return t('wk.contract', { n });
    case 'trade':
      return t('wk.trade', { n });
    case 'game':
      return t('wk.game', { n });
    case 'win':
      return t('wk.win', { n });
    case 'burn':
      return t('wk.burn', { n });
  }
}

export const weeklyReady = (s: WeeklyState | null | undefined) => (s ? s.list.filter((m) => !m.claimed && m.progress >= m.target).length : 0);

export const cleanWeekly = (s: WeeklyState): WeeklyState => ({
  week: s.week,
  list: s.list.map((m) => ({ id: m.id, kind: m.kind, target: m.target, progress: m.progress, reward: m.reward, claimed: m.claimed })),
});
