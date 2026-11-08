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

/**
 * (ouverture 07/11) BOOST DE RECHARGE ×2 : jusqu'à `boostUntil`, un booster arrive deux fois plus vite (2 min 30).
 * On raisonne en « temps effectif » : une milliseconde passée pendant le boost compte double. Sans boost (0 / absent),
 * le calcul est exactement l'ancien.
 */
export const BOOST_MS = 24 * 3600 * 1000;
/** temps effectif écoulé de `from` à `to` (le boost compte double) */
const effSpan = (from: number, to: number, boostUntil: number) => to - from + Math.max(0, Math.min(to, boostUntil) - from);
/** instant réel où `eff` ms de temps effectif sont écoulées depuis `from` */
const realAt = (from: number, eff: number, boostUntil: number) => {
  const boosted = Math.max(0, boostUntil - from);
  return eff <= 2 * boosted ? from + eff / 2 : from + boosted + (eff - 2 * boosted);
};

export function applyRegen(balance: number, regenAt: number, now: number, boostUntil = 0): RegenState {
  if (balance >= PACK_CAP) return { balance, regenAt: now, nextAt: null };
  const gained = Math.max(0, Math.floor(effSpan(regenAt, now, boostUntil) / PACK_REGEN_MS));
  const b = Math.min(PACK_CAP, balance + gained);
  if (b >= PACK_CAP) return { balance: b, regenAt: now, nextAt: null };
  const at = realAt(regenAt, gained * PACK_REGEN_MS, boostUntil);
  return { balance: b, regenAt: at, nextAt: realAt(at, PACK_REGEN_MS, boostUntil) };
}

/** Instant réel où la réserve sera PLEINE (null : déjà pleine) — notifications push « réserve pleine ». */
export function fullAt(balance: number, regenAt: number, now: number, boostUntil = 0): number | null {
  const r = applyRegen(balance, regenAt, now, boostUntil);
  if (r.balance >= PACK_CAP) return null;
  return realAt(r.regenAt, (PACK_CAP - r.balance) * PACK_REGEN_MS, boostUntil);
}

/** Boost encore actif à `now` (pour l'affichage). */
export const boostLeft = (boostUntil: number | undefined, now = Date.now()) => Math.max(0, (boostUntil ?? 0) - now);

/** « 3:07 » */
export const fmtCountdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
