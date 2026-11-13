import { t } from './i18n';
import { BEBOU_PACK, THEMES, catalogEntry, inSubthemeScope, subthemeViews, themeOpen } from './sets/themes';

/**
 * MISSIONS DU JOUR — logique partagée par le serveur Convex (convex/missions.ts), le mode démo et l'interface.
 *
 * Chaque jour (minuit, heure de Paris), chaque joueur reçoit 3 missions tirées au hasard (des sortes différentes),
 * qui rapportent des boosters. Les 3 réclamées → bonus. Une fois par jour, on peut changer une mission pas encore
 * terminée. Les récompenses s'ajoutent à la réserve, même au-dessus du plafond de 15.
 *
 * Le tirage est déterministe (joueur + jour) : le serveur n'écrit rien tant qu'on ne progresse pas.
 */

export type MissionKind = 'open' | 'openPack' | 'rare' | 'epic' | 'legendary' | 'newCards' | 'subtheme' | 'dups' | 'contract' | 'trade';

export interface Mission {
  id: string;
  kind: MissionKind;
  /** paramètre : booster (bebou / id du thème) ou sous-thème visé */
  param?: string;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

export interface MissionsState {
  day: string;
  list: Mission[];
  rerolled: boolean;
  bonusClaimed: boolean;
}

/** Bonus quand les 3 missions du jour sont réclamées. */
export const MISSION_BONUS = 2;

/** Ce qui fait avancer les missions. */
export type MissionEvent =
  | { type: 'pack'; packKey: string; cards: Array<{ cardId: string; rarity: string; isNew: boolean }> }
  | { type: 'contract' }
  | { type: 'trade' };

const TIER: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };

/**
 * Formateur du jour de Paris, créé une seule fois (perf, PROFIL B5 : en créer un à chaque appel coûtait ~0,1 ms ×
 * des milliers d'appels — 920 ms par ouverture au téléphone ; `nextMissionReset` en fait une dizaine par appel).
 * Même sortie. Création impossible (pas d'Intl / de fuseaux) : l'erreur se reproduit à chaque appel → même repli qu'avant.
 */
let dayFmt: Intl.DateTimeFormat | undefined;

/** Jour « de Paris » : 2026-11-02. */
export function missionDay(now: number): string {
  try {
    dayFmt ??= new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
    return dayFmt.format(now);
  } catch {
    return new Date(now + 3600_000).toISOString().slice(0, 10);
  }
}

/** Prochain changement de jour (approximation à la minute près, suffisante pour un compte à rebours). */
export function nextMissionReset(now: number): number {
  const day = missionDay(now);
  let lo = now;
  let hi = now + 26 * 3600_000;
  while (hi - lo > 30_000) {
    const mid = (lo + hi) / 2;
    if (missionDay(mid) === day) lo = mid;
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

const packKeys = () => [{ key: 'bebou', label: BEBOU_PACK.label }, ...THEMES.filter(themeOpen).map((t) => ({ key: t.id, label: `${t.label} Pack` }))]; // i18n-ok
// les 177 familles « Jeux vidéo » comptent pour UN sous-thème (`group:jeux-video`) : sinon presque chaque mission
// tomberait sur une petite famille (« 4 cartes Ace Attorney ») quasi impossible à remplir
const liveSubthemes = () => THEMES.flatMap((t) => subthemeViews(t).filter((v) => v.cards.length).map((v) => ({ id: v.id, label: v.label })));

/** Une mission d'une sorte donnée (objectif et récompense tirés). */
function makeMission(kind: MissionKind, r: () => number, id: string): Mission {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const m = (target: number, reward: number, param?: string): Mission => ({ id, kind, target, reward, progress: 0, claimed: false, ...(param ? { param } : {}) });
  switch (kind) {
    case 'open': {
      const t = pick([2, 3, 4, 5]);
      return m(t, t >= 4 ? 2 : 1);
    }
    case 'openPack':
      return m(pick([1, 2, 3]), 1, pick(packKeys()).key);
    case 'rare':
      return m(pick([2, 3]), 1);
    case 'epic':
      return m(1, 2);
    case 'legendary':
      return m(1, 3);
    case 'newCards': {
      const t = pick([4, 6, 8]);
      return m(t, t >= 8 ? 2 : 1);
    }
    case 'subtheme':
      return m(pick([4, 6]), 1, pick(liveSubthemes()).id);
    case 'dups':
      return m(pick([3, 5]), 1);
    case 'contract':
      return m(1, 2);
    case 'trade':
      return m(1, 1);
  }
}

/** sortes possibles, avec leur poids (les plus difficiles sortent moins souvent) */
const POOL: Array<[MissionKind, number]> = [
  ['open', 3],
  ['openPack', 2],
  ['rare', 3],
  ['epic', 1.6],
  ['legendary', 0.6],
  ['newCards', 2.5],
  ['subtheme', 2],
  ['dups', 2],
  ['contract', 1.4],
  ['trade', 1.2],
];

function drawKind(r: () => number, exclude: Set<MissionKind>): MissionKind {
  const pool = POOL.filter(([k]) => !exclude.has(k) && !(k === 'rare' && exclude.has('epic')) && !(k === 'epic' && (exclude.has('rare') || exclude.has('legendary'))) && !(k === 'legendary' && exclude.has('epic')));
  const total = pool.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [k, w] of pool) if ((x -= w) <= 0) return k;
  return pool[pool.length - 1][0];
}

/** Les 3 missions du jour d'un joueur (toujours les mêmes pour ce joueur ce jour-là). */
export function dailyMissions(userKey: string, day: string): MissionsState {
  const r = rand(`${userKey}|${day}`);
  const used = new Set<MissionKind>();
  const list: Mission[] = [];
  for (let i = 0; i < 3; i++) {
    const k = drawKind(r, used);
    used.add(k);
    list.push(makeMission(k, r, `${day}-${i}`));
  }
  return { day, list, rerolled: false, bonusClaimed: false };
}

/** État du jour : celui enregistré s'il est d'aujourd'hui, sinon les nouvelles missions. */
export function currentMissions(saved: MissionsState | null | undefined, userKey: string, now: number): MissionsState {
  const day = missionDay(now);
  return saved && saved.day === day ? saved : dailyMissions(userKey, day);
}

/** Fait avancer les missions (renvoie un nouvel état, et si quelque chose a changé). */
export function applyMissionEvent(s: MissionsState, ev: MissionEvent): { state: MissionsState; changed: boolean } {
  let changed = false;
  const list = s.list.map((m) => {
    if (m.claimed || m.progress >= m.target) return m;
    let add = 0;
    if (ev.type === 'pack') {
      const cards = ev.cards;
      if (m.kind === 'open') add = 1;
      else if (m.kind === 'openPack') add = ev.packKey === m.param ? 1 : 0;
      else if (m.kind === 'rare') add = cards.filter((c) => TIER[c.rarity] >= 2).length;
      else if (m.kind === 'epic') add = cards.filter((c) => TIER[c.rarity] >= 3).length;
      else if (m.kind === 'legendary') add = cards.filter((c) => TIER[c.rarity] >= 4).length;
      else if (m.kind === 'newCards') add = cards.filter((c) => c.isNew).length;
      else if (m.kind === 'dups') add = cards.filter((c) => !c.isNew).length;
      else if (m.kind === 'subtheme') add = cards.filter((c) => { const st = catalogEntry(c.cardId)?.subthemeId; return !!st && !!m.param && inSubthemeScope(m.param, st); }).length;
    } else if (ev.type === 'contract' && m.kind === 'contract') add = 1;
    else if (ev.type === 'trade' && m.kind === 'trade') add = 1;
    if (!add) return m;
    changed = true;
    return { ...m, progress: Math.min(m.target, m.progress + add) };
  });
  return { state: { ...s, list }, changed };
}

/** Réclamer une mission terminée : renvoie l'état et le nombre de boosters gagnés (ou un message d'erreur). */
export function claimMission(s: MissionsState, id: string): { state: MissionsState; reward: number } | string {
  const m = s.list.find((x) => x.id === id);
  if (!m) return 'Mission introuvable (un nouveau jour a commencé ?).';
  if (m.claimed) return 'Déjà réclamée.';
  if (m.progress < m.target) return 'Mission pas encore terminée.';
  return { state: { ...s, list: s.list.map((x) => (x.id === id ? { ...x, claimed: true } : x)) }, reward: m.reward };
}

export function claimMissionBonus(s: MissionsState): { state: MissionsState; reward: number } | string {
  if (s.bonusClaimed) return 'Bonus déjà réclamé.';
  if (!s.list.every((m) => m.claimed)) return 'Réclame d’abord les 3 missions.';
  return { state: { ...s, bonusClaimed: true }, reward: MISSION_BONUS };
}

/** Changer une mission (1 fois par jour, pas une mission terminée). */
export function rerollMission(s: MissionsState, id: string, userKey: string): MissionsState | string {
  if (s.rerolled) return 'Tu as déjà changé une mission aujourd’hui.';
  const i = s.list.findIndex((x) => x.id === id);
  if (i < 0) return 'Mission introuvable.';
  if (s.list[i].claimed || s.list[i].progress >= s.list[i].target) return 'Cette mission est déjà terminée.';
  const r = rand(`${userKey}|${s.day}|reroll`);
  const used = new Set(s.list.map((m) => m.kind));
  const k = drawKind(r, used);
  const list = s.list.slice();
  list[i] = makeMission(k, r, `${s.day}-r${i}`);
  return { ...s, list, rerolled: true };
}

/** Texte d'une mission (« Ouvre 3 boosters »). */
export function missionLabel(m: Mission): string {
  const n = m.target;
  switch (m.kind) {
    case 'open':
      return t('ms.open', { n });
    case 'openPack':
      return t('ms.openPack', { n, pack: packKeys().find((p) => p.key === m.param)?.label ?? 'booster' }); // i18n-ok (« booster » pareil)
    case 'rare':
      return t('ms.rare', { n });
    case 'epic':
      return t('ms.epic');
    case 'legendary':
      return t('ms.legendary');
    case 'newCards':
      return t('ms.newCards', { n });
    case 'subtheme':
      return t('ms.subtheme', { n, sub: liveSubthemes().find((x) => x.id === m.param)?.label ?? '' }).trim();
    case 'dups':
      return t('ms.dups', { n });
    case 'contract':
      return t('ms.contract');
    case 'trade':
      return t('ms.trade');
  }
}

/** Missions terminées pas encore réclamées (pastille sur l'onglet). */
export const missionsReady = (s: MissionsState | null | undefined) =>
  s ? s.list.filter((m) => !m.claimed && m.progress >= m.target).length + (!s.bonusClaimed && s.list.every((m) => m.claimed) ? 1 : 0) : 0;

/** Pour stocker en base (Convex refuse les champs `undefined`). */
export const cleanMissions = (s: MissionsState): MissionsState => ({
  day: s.day,
  rerolled: s.rerolled,
  bonusClaimed: s.bonusClaimed,
  list: s.list.map((m) => ({ id: m.id, kind: m.kind, target: m.target, progress: m.progress, reward: m.reward, claimed: m.claimed, ...(m.param ? { param: m.param } : {}) })),
});
