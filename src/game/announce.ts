import type { GameBackend } from './backend';
import { ANNOUNCE_ID } from './updates.data';

/**
 * ANNONCE D'UN PATCH (08/11) : à la prochaine visite après la mise en ligne, le jeu ouvre UNE fois la page des mises à
 * jour (#/maj), où le patch est détaillé. Une fois par appareil (localStorage) et par annonce (`ANNOUNCE_ID` dans
 * updates.data.ts). Pas pour un compte tout neuf (la visite guidée passe d'abord, et tout est nouveau pour lui), ni en
 * démo. Jamais au milieu d'une ouverture, de la connexion ou de la visite guidée : on attend que ce soit calme.
 * `?annonce` pour la revoir (test).
 */
const KEY = 'bebou.annonce-vue';

export function armAnnounce(backend: GameBackend) {
  const forced = new URLSearchParams(location.search).has('annonce');
  let seen = '';
  try {
    seen = localStorage.getItem(KEY) ?? '';
  } catch {
    return; // stockage indisponible : on ne saurait pas s'arrêter, on ne montre rien
  }
  if (seen === ANNOUNCE_ID && !forced) return;
  let done = false;
  let timer = 0;
  let off: (() => void) | null = null;
  const finish = () => {
    done = true;
    off?.();
    clearTimeout(timer);
    try {
      localStorage.setItem(KEY, ANNOUNCE_ID);
    } catch {
      /* tant pis */
    }
  };
  const check = () => {
    if (done) return;
    const s = backend.state;
    if (!forced && s.mode !== 'online') return;
    if (!s.user) return; // pas encore connecté : on attend
    // compte tout neuf : la visite guidée d'abord, l'annonce ne le concerne pas
    if (!forced && (!s.user.guideSeen || document.querySelector('.gd'))) return finish();
    // connexion, ouverture d'un booster : on réessaie un peu plus tard
    if (document.querySelector('.lc, .lg-veil') || document.body.classList.contains('opening')) {
      clearTimeout(timer);
      timer = window.setTimeout(check, 1500);
      return;
    }
    finish();
    if (location.hash.replace(/^#\/?/, '') !== 'maj') location.hash = '#/maj';
  };
  off = backend.onChange(check);
  check(); // tout de suite : avant que la visite guidée ne marque le compte « déjà guidé »
}
