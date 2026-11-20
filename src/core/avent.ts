/**
 * CALENDRIER DE L'AVENT (20/11, onglet Événement) — 24 cases, du 1er au 24 décembre (heure de Paris).
 * Logique pure, partagée par le serveur (convex/avent.ts), le mode démo et l'interface (views/evenement.ts).
 *
 * Règles :
 *  - la case N s'ouvre à partir du N décembre ; une case manquée se RATTRAPE jusqu'au 31 décembre inclus (personne ne
 *    perd un cadeau pour un jour d'absence) ; chaque case ne s'ouvre qu'une fois ;
 *  - chaque case donne des pièces ou des boosters (`ADVENT_REWARDS`) ; la case 24 donne un GOD PACK (un booster dont
 *    toutes les cartes sont 4★ ou mieux — src/core/packRoll.ts) : le prochain booster ouvert, n'importe lequel ;
 *  - les cosmétiques de Noël se gagnent au NOMBRE de cases ouvertes (`ADVENT_STEPS` : succès `noel26-…` de
 *    src/core/economy.ts → badge, titre, cadre, titre — src/core/cosmetics.ts), et restent pour toujours ;
 *  - l'équipe (admins) et la démo peuvent simuler un jour (`debugDay`) et refermer leurs cases pour tout tester.
 * Une nouvelle édition = changer `ADVENT_YEAR` (les cases sont rangées par année : rien à migrer).
 */
import { fe } from './errors';
import { missionDay } from './missions';

export const ADVENT_YEAR = 2026;
export const ADVENT_DAYS = 24;
/** dernier jour de décembre où l'on peut encore ouvrir (rattrapage) */
export const ADVENT_LAST_DAY = 31;

export interface AdventReward {
  coins?: number;
  packs?: number;
  /** un god pack (le prochain booster ouvert) — donné avec le booster qui le porte */
  god?: true;
}

/** Les 24 cadeaux (index 0 = 1er décembre). Total : 5 250 pièces, 35 boosters, 1 god pack. */
export const ADVENT_REWARDS: readonly AdventReward[] = [
  { coins: 150 }, { packs: 1 }, { coins: 200 }, { packs: 2 }, { coins: 250 }, { packs: 3 },
  { coins: 300 }, { packs: 2 }, { coins: 300 }, { packs: 3 }, { coins: 350 }, { packs: 3 },
  { coins: 400 }, { packs: 3 }, { coins: 450 }, { packs: 4 }, { coins: 500 }, { packs: 4 },
  { coins: 600 }, { packs: 5 }, { coins: 750 }, { packs: 5 }, { coins: 1000 }, { god: true },
];
/** Cases ouvertes de l'édition en cours, lues sur le joueur (`users.advent`, rangé par année). */
export const adventOpened = (u: { advent?: Record<string, number[]> }): number[] => u.advent?.[String(ADVENT_YEAR)] ?? [];

export const adventReward = (day: number): AdventReward => ADVENT_REWARDS[day - 1] ?? {};

/** Paliers des cosmétiques de Noël : nombre de cases ouvertes (cibles des succès `noel26-…`). */
export const ADVENT_STEPS = [4, 12, 18, 24] as const;

/**
 * Ordre des cases sur le calendrier (mélangé, comme un vrai) : `ADVENT_LAYOUT[i]` = le jour affiché à la place i.
 * La case 24 est à part (grande, en bas) : elle n'est pas dans la grille des 23 autres.
 */
export const ADVENT_LAYOUT: readonly number[] = [7, 19, 2, 14, 22, 10, 4, 16, 23, 1, 12, 20, 9, 17, 5, 21, 13, 3, 18, 8, 15, 6, 11];

/**
 * Où en est le calendrier à l'instant `now` (heure de Paris) : 0 = pas encore décembre de l'édition ; 1..31 = le jour
 * de décembre ; 32 = l'édition est finie.
 */
export function adventDay(now: number, year = ADVENT_YEAR): number {
  const [y, m, d] = missionDay(now).split('-').map(Number);
  if (y < year || (y === year && m < 12)) return 0;
  if (y > year) return ADVENT_LAST_DAY + 1;
  return d;
}

export type AdventPhase = 'before' | 'live' | 'over';
export const adventPhase = (today: number): AdventPhase => (today <= 0 ? 'before' : today <= ADVENT_LAST_DAY ? 'live' : 'over');

/** 1er décembre de l'édition, 0 h à Paris (toujours l'heure d'hiver : UTC+1). */
export const adventStartAt = (year = ADVENT_YEAR) => Date.UTC(year, 10, 30, 23);
/** Fin du rattrapage : 1er janvier, 0 h à Paris. */
export const adventEndAt = (year = ADVENT_YEAR) => Date.UTC(year, 11, 31, 23);

/**
 * État d'une case : `opened` déjà ouverte · `today` c'est le jour · `late` jour passé, à rattraper · `locked` pas
 * encore · `closed` l'édition est finie sans qu'elle ait été ouverte.
 */
export type DoorState = 'opened' | 'today' | 'late' | 'locked' | 'closed';
export function doorState(day: number, today: number, opened: readonly number[]): DoorState {
  if (opened.includes(day)) return 'opened';
  const phase = adventPhase(today);
  if (phase === 'over') return 'closed';
  if (phase === 'before' || day > today) return 'locked';
  return day === today ? 'today' : 'late';
}
export const doorOpenable = (s: DoorState) => s === 'today' || s === 'late';

/** Cases que le joueur peut ouvrir maintenant (pastille de l'onglet). */
export function adventWaiting(today: number, opened: readonly number[]): number[] {
  const out: number[] = [];
  for (let d = 1; d <= ADVENT_DAYS; d++) if (doorOpenable(doorState(d, today, opened))) out.push(d);
  return out;
}

/** Message d'erreur si la case ne peut pas s'ouvrir (null : elle peut). */
export function adventProblem(day: number, today: number, opened: readonly number[]): string | null {
  if (!Number.isInteger(day) || day < 1 || day > ADVENT_DAYS) return fe('avent.1');
  const s = doorState(day, today, opened);
  if (s === 'opened') return fe('avent.2', { p0: day });
  if (s === 'closed') return fe('avent.3');
  if (s === 'locked') return adventPhase(today) === 'before' ? fe('avent.4') : fe('avent.5', { p0: day });
  return null;
}

/** Jour simulé par l'équipe (mode test) : 1..31, sinon refusé. */
export const validDebugDay = (d: unknown): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= ADVENT_LAST_DAY + 1;

/** Prochain palier de cosmétique à atteindre (null : tous atteints). */
export const nextAdventStep = (openedCount: number): number | null => ADVENT_STEPS.find((s) => s > openedCount) ?? null;
