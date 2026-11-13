import '../core/i18n/fr/game.v2gate'; // (textes de ce module, version anglaise)
import { t } from '../core/i18n';
import type { GameBackend } from './backend';
import { h } from './ui';
import { CANAL, BUILD_ID } from '../core/canal';

/**
 * LIEN ADMIN V2 (07/11) — https://v2.cardgamepriv.pages.dev : le jeu y tourne sur le serveur Convex de STAGING
 * (copie des données, jamais la base des joueurs). Réservé à l'équipe : sans compte admin / modérateur (Tom, Hugo),
 * un écran « Réservé à l'équipe » couvre tout, avec le bouton de connexion. Même écran que le compte à rebours (.lc).
 * Côté serveur, rien à protéger : ce déploiement ne contient que des données de test. (13/11) Les testeurs invités
 * (`V2_TESTERS` sur le staging) passent aussi, sans les droits de l'équipe.
 */
export function createV2Gate(backend: GameBackend) {
  if (CANAL !== 'v2') return;
  let el: HTMLElement | null = null;

  // (13/11) + les testeurs invités (variable V2_TESTERS du staging, convex/users.ts)
  const blocked = () => backend.state.mode === 'online' && backend.state.ready && !backend.state.user?.staff && !backend.state.user?.tester;

  function mount() {
    el = h('div', 'lc lc-v2');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'lc-k');
    el.innerHTML = `<i class="lc-scan" aria-hidden="true"></i>
      <div class="lc-in">
        <div class="lc-logo" aria-hidden="true">${t('boot.logo')}</div>
        <p class="lc-k" id="lc-k">V2 — test</p>
        <p class="lc-v2-t">${t('v2gate.title')}</p>
        <p class="lc-when">${t('v2gate.body')}<br>${t('v2gate.real')} <a href="https://cardgamepriv.pages.dev/jeu/">cardgamepriv.pages.dev</a>.</p>
        <button class="lc-v2-login" type="button">${t('v2gate.login')}</button>
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
