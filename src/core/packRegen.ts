/**
 * Recharge des boosters — logique pure, AUCUN import : partagée par le serveur Convex (convex/users.ts, packs.ts),
 * le mode démo et l'en-tête du jeu (compte à rebours).
 *
 * Règle du groupe (2 nov.) : **1 booster toutes les 5 minutes, jusqu'à 15 en réserve**. Remplace le « +2 toutes les 12 h ».
 * Calcul paresseux : on stocke la réserve et l'instant de départ du prochain booster (`regenAt`) ; la recharge
 * accumulée est appliquée au moment où on la lit ou la dépense. Réserve pleine : le minuteur est à l'arrêt et repart
 * quand on ouvre un booster. Une réserve au-dessus de 15 (cadeau, ancien solde) est gardée, sans recharge.
 */
export const PACK_REGEN_MS = 5 * 60 * 1000;
export const PACK_CAP = 15;

export interface RegenState {
  /** boosters disponibles maintenant */
  balance: number;
  /** départ du booster en cours de recharge (à stocker) */
  regenAt: number;
  /** instant où le prochain booster arrive (null : réserve pleine) */
  nextAt: number | null;
}

export function applyRegen(balance: number, regenAt: number, now: number): RegenState {
  if (balance >= PACK_CAP) return { balance, regenAt: now, nextAt: null };
  const gained = Math.max(0, Math.floor((now - regenAt) / PACK_REGEN_MS));
  const b = Math.min(PACK_CAP, balance + gained);
  if (b >= PACK_CAP) return { balance: b, regenAt: now, nextAt: null };
  const at = regenAt + gained * PACK_REGEN_MS;
  return { balance: b, regenAt: at, nextAt: at + PACK_REGEN_MS };
}

/** « 3:07 » */
export const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
