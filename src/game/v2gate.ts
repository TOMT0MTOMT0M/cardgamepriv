import type { GameBackend } from './backend';
import { h } from './ui';
import { CANAL, BUILD_ID } from '../core/canal';

/**
 * LIEN ADMIN V2 (07/11) — https://v2.cardgamepriv.pages.dev : le jeu y tourne sur le serveur Convex de STAGING
 * (copie des données, jamais la base des joueurs). Réservé à l'équipe : sans compte admin / modérateur (Tom, Hugo),
 * un écran « Réservé à l'équipe » couvre tout, avec le bouton de connexion. Même écran que le compte à rebours (.lc).
 * Côté serveur, rien à protéger : ce déploiement ne contient que des données de test.
 */
export function createV2Gate(backend: GameBackend) {
  if (CANAL !== 'v2') return;
  let el: HTMLElement | null = null;

  const blocked = () => backend.state.mode === 'online' && backend.state.ready && !backend.state.user?.staff;

  function mount() {
    el = h('div', 'lc lc-v2');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'lc-k');
    el.innerHTML = `<i class="lc-scan" aria-hidden="true"></i>
      <div class="lc-in">
        <div class="lc-logo" aria-hidden="true">BÉBOU</div>
        <p class="lc-k" id="lc-k">V2 — test</p>
        <p class="lc-v2-t">Réservé à l’équipe</p>
        <p class="lc-when">Ce lien est la version de test : connecte-toi avec un compte de l’équipe.<br>Le jeu, c’est <a href="https://cardgamepriv.pages.dev/jeu/">cardgamepriv.pages.dev</a>.</p>
        <button class="lc-v2-login" type="button">Connexion équipe</button>
        <small class="lc-v2-build">build ${BUILD_ID}</small>
      </div>`;
    el.querySelector('.lc-v2-login')!.addEventListener('click', () => backend.login());
    document.body.append(el);
    const app = document.getElementById('app');
    if (app) app.inert = true;
    requestAnimationFrame(() => el?.classList.add('on'));
  }

  function unmount() {
    if (!el) return;
    el.remove();
    el = null;
    const app = document.getElementById('app');
    if (app) app.inert = false;
  }

  backend.onChange(() => {
    if (blocked()) {
      if (!el) mount();
    } else unmount();
  });
}
