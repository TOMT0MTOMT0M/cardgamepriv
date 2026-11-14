/**
 * Repères communs au moteur (audio.ts) et à l'atelier de cuisson (bank.ts) — fichier minuscule, pour que le moteur
 * n'embarque pas les recettes (elles ne vivent que dans le Worker).
 */
/** degrés de la gamme cuits pour `note` (les autres sont relus à vitesse légèrement modifiée : un degré d'écart au plus) */
export const NOTE_BASES = [-5, -3, -1, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
/** fondamentales cuites des carillons (sol4, sol5) et tailles (S : 1–2★ · M : 3–4★ · L : 5–6★) */
export const CHIME_BASES = [392, 784];
export const CHIME_SIZES = ['S', 'M', 'L'] as const;
/** fondamentale cuite de la pièce (sol5) */
export const COIN_HZ = 784;
