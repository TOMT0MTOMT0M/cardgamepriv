import { t } from '../core/i18n';
import '../core/i18n/fr/game.views.atelier'; // (textes de ce module, version anglaise)
import type { GameBackend } from './backend';
import { layerCount, navigate, toast } from './ui';

/**
 * PASSAGE D'OFFICE PAR « PERSONNALISER MON PROFIL » (15/11) : à la prochaine visite, chaque joueur est amené UNE fois sur
 * son profil, atelier ouvert. Une fois par COMPTE (`users.atelierSeenAt`, lu dans l'état du joueur : aucune requête de
 * plus), quel que soit l'appareil. Il peut refermer avec Annuler : on l'y amène, on ne l'y enferme pas.
 * Pas pour un compte tout neuf (le serveur le marque avec sa visite guidée), ni pendant la visite guidée ou le tour V2
 * (ce sera à la visite suivante), ni en démo. Jamais au milieu d'une connexion, d'une ouverture ou d'une fenêtre : on
 * attend que ce soit calme. `?atelier` pour le revoir (test).
 */
export const OPEN_COSM = 'bebou.openCosm';
export const OPEN_COSM_EVT = 'bebou:open-cosm';
/** le jeu vient de démarrer : l'annonce d'un patch et la page d'accueil passent d'abord */
const SETTLE_MS = 2500;
const RETRY_MS = 1500;

export function armAtelierOnce(backend: GameBackend) {
  const forced = new URLSearchParams(location.search).has('atelier');
  const armedAt = Date.now();
  let done = false;
  let timer = 0;
  let off: (() => void) | null = null;
  const stop = () => {
    done = true;
    off?.();
    clearTimeout(timer);
  };
  const later = (ms: number) => {
    clearTimeout(timer);
    timer = window.setTimeout(check, ms);
  };
  const check = () => {
    if (done) return;
    const s = backend.state;
    if (!forced && s.mode !== 'online') return;
    if (!s.user) return; // pas encore connecté : onChange nous rappellera
    if (!forced) {
      if (s.user.atelierSeen === true) return stop();
      if (s.user.atelierSeen !== false) return; // serveur d'avant ce patch : on ne sait pas, on ne force rien
      // visite guidée ou tour des nouveautés V2 à jouer : ils passent d'abord, l'atelier attendra la visite suivante
      if (!s.user.guideSeen || !s.user.v2TourSeen || document.querySelector('.gd')) return stop();
    }
    const settle = armedAt + (forced ? 600 : SETTLE_MS) - Date.now();
    if (settle > 0) return later(settle);
    // connexion, ouverture d'un booster, fenêtre ou visionneuse ouverte, onglet caché : un peu plus tard
    if (document.hidden || layerCount() > 0 || document.querySelector('.lc, .lg-veil, .ow-veil, .myth-pre') || /\b(opening|wild-on|duel-on)\b/.test(document.body.className)) return later(RETRY_MS);
    stop();
    if (!forced) void backend.markAtelierSeen?.();
    try {
      sessionStorage.setItem(OPEN_COSM, '1');
    } catch {
      return; // stockage bloqué : le profil ne saurait pas qu'il doit ouvrir l'atelier
    }
    toast(t('at.forced'), 'info');
    // déjà sur son propre profil : la page est chargée, on lui dit d'ouvrir ; sinon elle l'ouvrira en arrivant
    if (location.hash.replace(/^#\/?/, '') === 'profil') window.dispatchEvent(new Event(OPEN_COSM_EVT));
    else navigate('#/profil');
  };
  off = backend.onChange(check);
  check();
}
