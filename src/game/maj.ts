import { BUILD_ID } from '../core/canal';
import { SITE_ROOT } from '../core/siteRoot';
import { h } from './ui';

/**
 * MISE À JOUR DISPONIBLE (V2, 07/11). Un patch sort pendant qu'un joueur a le jeu ouvert : son onglet garde l'ancien
 * code, qui doit continuer de marcher (les fonctions Convex restent compatibles). On relit /version.json de temps en
 * temps (toutes les 3 min, et au retour sur l'onglet) ; dès que l'identifiant de build n'est plus le nôtre, une pastille
 * « Mise à jour disponible · Recharger » apparaît — le joueur recharge quand il veut (jamais au milieu d'une ouverture).
 * Si un morceau du jeu chargé à la demande (import()) n'existe plus sur le site, Vite lève `vite:preloadError` :
 * on recharge une fois tout de suite (le nouveau site est là), au lieu d'une page cassée.
 */
const EVERY = 3 * 60_000;
const KEY = 'bebou.maj-reload';

export function watchUpdates() {
  if (import.meta.env.DEV) return;
  let pill: HTMLElement | null = null;
  let newId = '';

  const show = (id: string) => {
    newId = id;
    if (pill) return;
    pill = h('div', 'maj-pill');
    pill.setAttribute('role', 'status');
    pill.innerHTML = `<span>Mise à jour disponible</span><button type="button">Recharger</button>`;
    pill.querySelector('button')!.addEventListener('click', () => location.reload());
    document.body.append(pill);
    requestAnimationFrame(() => pill?.classList.add('on'));
  };

  const check = async () => {
    if (document.visibilityState === 'hidden' || !navigator.onLine) return;
    try {
      const r = await fetch(`${SITE_ROOT}version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()) as { id?: string };
      if (v.id && v.id !== BUILD_ID) show(v.id);
    } catch {
      /* réseau : on réessaiera */
    }
  };

  window.setInterval(check, EVERY);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.setTimeout(check, 30_000);

  window.addEventListener('vite:preloadError', (e) => {
    // un seul rechargement automatique par build (sinon boucle si le site est vraiment cassé)
    let done = '';
    try {
      done = sessionStorage.getItem(KEY) ?? '';
      sessionStorage.setItem(KEY, BUILD_ID);
    } catch {
      /* stockage indisponible */
    }
    if (done === BUILD_ID) return;
    e.preventDefault();
    location.reload();
  });

  return { pending: () => newId };
}
