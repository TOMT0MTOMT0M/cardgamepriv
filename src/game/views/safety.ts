import type { GameState } from '../backend';

/**
 * Garde-fous partagés par les écrans qui BRÛLENT, MISENT ou ÉCHANGENT des cartes (contrats, échanges, espace Jeux) —
 * audit du 3 nov. (UX4-01, UX4-02/03/05, UX4-06).
 */

/** Actions en cours, par clé (« forge », « bet », « duel-ready »…) : un écran redessiné pendant l'attente le sait aussi. */
const pending = new Set<string>();
export const isPending = (key: string) => pending.has(key);

/**
 * Anti double-toucher : tant que l'action lancée par ce bouton n'a pas répondu, le bouton est désactivé et tout nouveau
 * clic (même sur un bouton redessiné entre-temps, s'il porte la même clé) est ignoré. `keepOnSuccess` : le bouton reste
 * désactivé après un succès (l'écran va se redessiner).
 */
export async function guarded(key: string, btn: HTMLElement | null, run: () => Promise<void>, o: { keepOnSuccess?: boolean } = {}): Promise<void> {
  if (pending.has(key)) return;
  pending.add(key);
  const b = btn as HTMLButtonElement | null;
  if (b) b.disabled = true;
  let ok = false;
  try {
    await run();
    ok = true;
  } finally {
    pending.delete(key);
    if (b && !(ok && o.keepOnSuccess)) b.disabled = false;
  }
}

/** Armements par clé (`confirmTap(…, key)`) : survivent au redessin du bouton (abonnement temps réel, 08/11). */
const armedKeys = new Map<string, number>();
/**
 * Second toucher : le 1er toucher arme le bouton (libellé « Confirmer ? … ») pendant `ms`, le 2nd lance l'action.
 * Un double-toucher trop rapide (< 0,3 s) ne vaut pas confirmation. Renvoie vrai quand l'action peut partir.
 * `key` (conseillé dès que l'écran se redessine tout seul) : un bouton redessiné entre les deux touchers garde
 * l'armement — sinon le 2nd toucher retombait sur un bouton neuf et ré-armait sans fin (« il ne se passe rien »).
 * Pas de confirm() natif (bloquant, illisible au téléphone).
 */
export function confirmTap(btn: HTMLElement, label: string, ms = 3000, key?: string): boolean {
  const at = Number(btn.dataset.armedAt || 0) || (key ? (armedKeys.get(key) ?? 0) : 0);
  if (at && Date.now() - at < ms + 500) {
    if (Date.now() - at < 300) return false; // double-toucher : on reste armé
    disarm(btn);
    if (key) armedKeys.delete(key);
    return true;
  }
  const now = Date.now();
  const stamp = String(now);
  if (key) armedKeys.set(key, now);
  btn.dataset.armedAt = stamp;
  btn.dataset.label = btn.innerHTML;
  btn.classList.add('armed');
  btn.textContent = label;
  btn.setAttribute('aria-live', 'polite');
  window.setTimeout(() => {
    if (key && armedKeys.get(key) === now) armedKeys.delete(key);
    if (btn.dataset.armedAt === stamp) disarm(btn);
  }, ms);
  return false;
}
function disarm(btn: HTMLElement) {
  if (!btn.dataset.armedAt) return;
  delete btn.dataset.armedAt;
  btn.classList.remove('armed');
  if (btn.dataset.label != null) btn.innerHTML = btn.dataset.label;
  delete btn.dataset.label;
}

/**
 * Pourquoi une carte est protégée du remplissage automatique (contrats) et des sélections rapides (forge) : envie,
 * classeur, pochette — vide si rien. Elle reste brûlable à la main.
 */
export function protection(st: Pick<GameState, 'wishlist' | 'binders' | 'covers'>, cardId: string): string[] {
  const out: string[] = [];
  if (st.wishlist.includes(cardId)) out.push('envie');
  if (st.binders.some((b) => b.cards.some((c) => c.cardId === cardId))) out.push('classeur');
  if (Object.values(st.covers).includes(cardId) || st.binders.some((b) => b.coverCardId === cardId)) out.push('pochette');
  return out;
}
/** Icônes des protections (toutes, dans l'ordre) : ♥ envie · ▤ classeur · ⌂ pochette. */
export const protectIcons = (p: string[]) => p.map((x) => (x === 'envie' ? '♥' : x === 'classeur' ? '▤' : '⌂')).join('');
/** Légende d'une ligne, lisible au doigt (les `title` ne s'affichent qu'au survol). */
export const PROTECT_LEGEND = '♥ envie · ▤ classeur · ⌂ pochette : gardées hors des sélections automatiques (brûlables à la main) · 🔒 engagée dans un échange en attente';
