/**
 * Préférence « Effets réduits » (retours live 02, §7) : holo, reflets et halos des cartes encore plus discrets, partout
 * (vignettes 2D, visionneuse 3D, ouverture). Mémorisée dans le navigateur ; sans choix explicite, elle suit le réglage
 * « réduire les animations » de l'appareil (`prefers-reduced-motion`).
 *
 * Zéro three.js ici : les matériaux s'y abonnent via `onFxReducedChange` (core/holo.ts → `setHoloReduced`), les
 * vignettes lisent la classe `fx-reduced` posée sur <body> (style.css).
 */
const KEY = 'bebou.fxReduced';
const EVENT = 'bebou:fx-reduced';

function stored(): '1' | '0' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === '1' || v === '0' ? v : null;
  } catch {
    return null; // navigation privée, stockage bloqué…
  }
}

/** repli quand localStorage est inaccessible : le choix tient jusqu'au rechargement */
let session: boolean | null = null;

const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Vrai si les effets réduits sont actifs (choix du joueur, sinon réglage « réduire les animations » de l'appareil). */
export function fxReduced(): boolean {
  if (session !== null) return session;
  const v = stored();
  if (v) return v === '1';
  return !!motionQuery?.matches;
}

/** Vrai si le joueur a fait un choix explicite (sinon on suit l'appareil). */
export function fxReducedIsExplicit(): boolean {
  return session !== null || stored() !== null;
}

/** Mémorise le choix du joueur et prévient les abonnés (matériaux, classe du <body>). */
export function setFxReduced(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* pas de stockage : le choix vaut pour cette session seulement */
    session = on;
  }
  emit();
}

const current = () => fxReduced();

const listeners = new Set<(on: boolean) => void>();
function emit() {
  const on = current();
  applyBodyClass(on);
  listeners.forEach((f) => f(on));
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

/** S'abonne aux changements ; `f` est appelé tout de suite avec la valeur actuelle. Renvoie la désinscription. */
export function onFxReducedChange(f: (on: boolean) => void): () => void {
  listeners.add(f);
  f(current());
  return () => listeners.delete(f);
}

function applyBodyClass(on: boolean) {
  if (typeof document === 'undefined') return;
  const set = () => document.body?.classList.toggle('fx-reduced', on);
  if (document.body) set();
  else document.addEventListener('DOMContentLoaded', set, { once: true });
}

let bound = false;
/**
 * Jeu : pose la classe `fx-reduced` sur <body> et la tient à jour (choix du joueur, changement du réglage de
 * l'appareil, autre onglet). Idempotent.
 */
export function bindFxReduced(): void {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  applyBodyClass(current());
  motionQuery?.addEventListener?.('change', () => {
    if (!fxReducedIsExplicit()) emit();
  });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) emit();
  });
}
