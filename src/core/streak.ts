import { missionDay } from './missions';

/**
 * SÉRIE DE CONNEXION — logique partagée serveur (convex/users.ts), mode démo et interface.
 *
 * Chaque jour (heure de Paris) où le joueur ouvre le jeu, la série avance d'un cran ; un jour sauté la remet à 1.
 * Tous les 7 jours, une récompense en boosters est à réclamer (icône de statut de l'accueil). Le compteur ne
 * s'arrête pas à 7 : le jour 8 est le jour 1 d'un nouveau cycle (« 3/7 »), la série totale reste visible sur le profil.
 */
export const STREAK_CYCLE = 7;
/** Boosters offerts à chaque semaine (cycle de 7 jours) de connexion d'affilée — au-dessus du plafond de réserve.
 * (retours live 04) 10 boosters, au lieu de 5. */
export const STREAK_REWARD = 10;

export interface StreakState {
  /** jours d'affilée (≥ 1 dès la première visite) */
  count: number;
  /** dernier jour compté (« 2026-11-03 ») */
  day: string;
  /** valeur de `count` à laquelle la dernière récompense a été réclamée (0 : jamais) */
  rewardedAt: number;
}

const dayAfter = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** Visite d'aujourd'hui : avance la série (ou la relance). Renvoie `null` si rien ne change. */
export function touchStreak(s: StreakState | undefined, now: number): StreakState | null {
  const today = missionDay(now);
  if (s && s.day === today) return null;
  if (s && dayAfter(s.day) === today) return { count: s.count + 1, day: today, rewardedAt: s.rewardedAt };
  return { count: 1, day: today, rewardedAt: 0 };
}

/** Jour affiché dans le cycle : 1..7. */
export const streakDay = (s: StreakState | undefined): number => (s ? ((s.count - 1) % STREAK_CYCLE) + 1 : 0);

/** Récompense du cycle à réclamer (jour 7 atteint et pas encore réclamé pour ce cycle). */
export const streakClaimable = (s: StreakState | undefined): boolean =>
  !!s && s.count > 0 && s.count % STREAK_CYCLE === 0 && s.rewardedAt !== s.count;

/** État après réclamation (ou message d'erreur). */
export function claimStreak(s: StreakState | undefined): StreakState | string {
  if (!streakClaimable(s)) return 'Rien à réclamer pour le moment : reviens chaque jour jusqu’au 7e.';
  return { ...s!, rewardedAt: s!.count };
}
