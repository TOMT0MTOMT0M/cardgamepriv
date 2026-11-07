/**
 * CANAL DE BUILD (V2, 07/11).
 *   prod : branche master → https://cardgamepriv.pages.dev (les joueurs) — `vite build`
 *   v2   : branche v2 → https://v2.cardgamepriv.pages.dev (Tom et Hugo) — `vite build --mode v2`, serveur Convex de staging
 *          (.env.v2.local), bandeau « V2 — test », jeu réservé à l'équipe (src/game/v2gate.ts).
 * `BUILD_ID` est écrit par vite.config.ts dans le code ET dans /version.json : quand les deux diffèrent, un patch est sorti.
 */
declare const __BUILD_ID__: string;

export type Canal = 'prod' | 'v2';
export const CANAL: Canal = import.meta.env.MODE === 'v2' ? 'v2' : 'prod';
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** Petit badge fixe « V2 — test » (jeu et labo) : on ne confond jamais le lien admin avec la prod. */
export function mountCanalBadge() {
  if (CANAL !== 'v2' || document.querySelector('.canal-badge')) return;
  document.body.classList.add('canal-v2');
  const b = document.createElement('div');
  b.className = 'canal-badge';
  b.textContent = 'V2 — test';
  b.title = `build ${BUILD_ID}`;
  b.setAttribute('aria-hidden', 'true');
  document.body.append(b);
}
