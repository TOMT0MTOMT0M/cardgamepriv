/**
 * CALENDRIER DE L'AVENT (20/11, onglet Événement) — 24 cases, du 1er au 24 décembre (heure de Paris).
 * Logique pure, partagée par le serveur (convex/avent.ts), le mode démo et l'interface (views/evenement.ts).
 *
 * Règles :
 *  - la case N s'ouvre à partir du N décembre ; une case manquée se RATTRAPE jusqu'au 31 décembre inclus (personne ne
 *    perd un cadeau pour un jour d'absence) ; chaque case ne s'ouvre qu'une fois ;
 *  - chaque case donne des pièces, des boosters et/ou un COSMÉTIQUE de Noël (`ADVENT_REWARDS`, grille de Tom du 25/11 :
 *    docs/chantiers/avent-noel.md) ; la case 24 donne un GOD PACK (un booster dont toutes les cartes sont 4★ ou mieux,
 *    au moins une 5★ et une 6★ — src/core/packRoll.ts) : le prochain booster ouvert, n'importe lequel ;
 *  - (v2.1.13) un cosmétique est donné PAR SA CASE : ouvrir la case le débloque pour toujours (src/core/cosmetics.ts,
 *    champ `advent` : le jour de la case ; vérifié par les cases ouvertes rangées sur le joueur, rien d'autre à stocker) ;
 *  - l'équipe (admins) et la démo peuvent simuler un jour (`debugDay`) et refermer leurs cases pour tout tester.
 * Une nouvelle édition = changer `ADVENT_YEAR` (les cases sont rangées par année : rien à migrer).
 */
import { fe } from './errors';
import { missionDay } from './missions';

export const ADVENT_YEAR = 2026;
export const ADVENT_DAYS = 24;
/** dernier jour de décembre où l'on peut encore ouvrir (rattrapage) */
export const ADVENT_LAST_DAY = 31;

/** genres de cosmétiques donnés par une case (ids : src/core/cosmetics.ts, éléments marqués `advent: <jour>`) */
export type AdventCosKind = 'frame' | 'banner' | 'pfx' | 'opening';
export interface AdventReward {
  coins?: number;
  packs?: number;
  /** un god pack (le prochain booster ouvert) — donné avec le booster qui le porte */
  god?: true;
  /** cosmétique(s) de Noël débloqué(s) pour toujours par cette case */
  cos?: ReadonlyArray<{ kind: AdventCosKind; id: string }>;
}

const F = (id: string) => ({ cos: [{ kind: 'frame' as const, id }] });
const B = (id: string) => ({ cos: [{ kind: 'banner' as const, id }] });
const P = (id: string) => ({ cos: [{ kind: 'pfx' as const, id }] });
/**
 * Les 24 cadeaux (index 0 = 1er décembre) — grille de Tom (25/11). Total : 95 boosters (+ celui du god pack), 13 000 pièces,
 * 9 cosmétiques (3 cadres, 2 bannières, 2 animations de profil, 2 ouvertures), 1 god pack.
 */
export const ADVENT_REWARDS: readonly AdventReward[] = [
  { packs: 10 }, { coins: 1250 }, F('x-flocon'), { packs: 5 }, { coins: 1250 }, B('x-village'),
  { packs: 10 }, { coins: 1500 }, { packs: 5 }, P('neige'), { coins: 1500 }, { packs: 20 },
  F('x-sucre'), { packs: 5 }, { coins: 2000 }, { packs: 5 }, B('x-atelier'), { packs: 20 },
  { coins: 3000 }, { cos: [{ kind: 'opening', id: 'glace' }] }, { packs: 15, coins: 2500 }, P('aurore'),
  { cos: [{ kind: 'frame', id: 'x-bonnet' }, { kind: 'opening', id: 'etoile' }] }, { god: true },
];
/** Cases ouvertes de l'édition en cours, lues sur le joueur (`users.advent`, rangé par année). */
export const adventOpened = (u: { advent?: Record<string, number[]> }): number[] => u.advent?.[String(ADVENT_YEAR)] ?? [];

export const adventReward = (day: number): AdventReward => ADVENT_REWARDS[day - 1] ?? {};

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
