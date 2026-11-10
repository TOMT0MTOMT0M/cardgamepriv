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
/** (v1.0.12) mise à jour forcée déjà tentée pour ce build (sessionStorage : un essai par build et par 10 min, pas de boucle) */
const FORCE_KEY = 'bebou.maj-force';

/**
 * (v1.0.12) MISE À JOUR FORCÉE. Un patch marqué obligatoire (`force` dans /version.json, vrai par défaut) est sorti :
 * dès que le jeu est rouvert ou revient au premier plan (le cas de l'appli posée sur l'écran d'accueil, restée des jours en
 * arrière-plan), il se met à jour seul — jamais pendant une ouverture de booster (on attend la fin).
 * `hardUpdate()` (aussi derrière « Réparer et mettre à jour » du menu du profil) :
 *  - vide les caches du jeu (cartes déjà peintes, plis, nom moulé) ; GARDE les illustrations (adresses versionnées,
 *    toujours justes), le jeu installé par le service worker en V2 (fichiers à empreinte : un patch ne reprend que ce qui
 *    change, la page elle-même passe toujours par le réseau d'abord) et tout le stockage local : connexion, réglages,
 *    son, visite guidée, pastilles lues ;
 *  - demande au service worker (s'il y en a un) de se mettre à jour ;
 *  - recharge la page sous une adresse neuve (`?maj=…`) : le téléphone ne peut pas resservir l'ancienne page.
 */
let busy: () => boolean = () => false;
/** branché par main.ts : une ouverture de booster est en cours → la mise à jour forcée attend */
export const setUpdateBusy = (fn: () => boolean) => (busy = fn);

export async function hardUpdate(target = '') {
  const veil = h('div', 'maj-veil');
  veil.setAttribute('role', 'status');
  veil.innerHTML = '<span>Mise à jour…</span>';
  document.body.append(veil);
  requestAnimationFrame(() => veil.classList.add('on'));
  const step = async () => {
    try {
      if ('caches' in window) for (const k of await caches.keys()) if (/^bebou-/.test(k) && !/^bebou-(art|garde|app)-/.test(k)) await caches.delete(k);
    } catch {
      /* stockage refusé : on recharge quand même */
    }
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg) await Promise.race([reg.update(), new Promise((r) => setTimeout(r, 2500))]);
    } catch {
      /* pas de service worker */
    }
  };
  // au plus 4 s de ménage : la page se recharge quoi qu'il arrive
  await Promise.race([step(), new Promise((r) => setTimeout(r, 4000))]);
  const u = new URL(location.href);
  u.searchParams.set('maj', target || String(Date.now()));
  location.replace(u.href);
}

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
    pill.querySelector('button')!.addEventListener('click', () => void hardUpdate(newId));
    document.body.append(pill);
    requestAnimationFrame(() => pill?.classList.add('on'));
  };

  // l'adresse de la mise à jour forcée (`?maj=…`) n'a plus de raison d'être une fois la nouvelle page chargée
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('maj')) {
      u.searchParams.delete('maj');
      history.replaceState(history.state, '', u.href);
    }
  } catch {
    /* rien */
  }

  /** forcée : une fois par build visé et par 10 min (si le site n'est pas encore à jour partout, pas de boucle) */
  const tryForce = (id: string): boolean => {
    let last: { id?: string; at?: number } = {};
    try {
      last = JSON.parse(sessionStorage.getItem(FORCE_KEY) ?? '{}');
    } catch {
      /* rien */
    }
    if (last.id === id && Date.now() - (last.at ?? 0) < 10 * 60_000) return false;
    try {
      sessionStorage.setItem(FORCE_KEY, JSON.stringify({ id, at: Date.now() }));
    } catch {
      /* stockage indisponible : un seul essai dans cette page */
    }
    const go = () => (busy() ? setTimeout(go, 1500) : void hardUpdate(id));
    go();
    return true;
  };

  const check = async () => {
    if (document.visibilityState === 'hidden' || !navigator.onLine) return;
    try {
      const r = await fetch(`${SITE_ROOT}version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()) as { id?: string; force?: boolean };
      if (!v.id || v.id === BUILD_ID) return;
      if (v.force && tryForce(v.id)) return;
      show(v.id);
    } catch {
      /* réseau : on réessaiera */
    }
  };

  window.setInterval(check, EVERY);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  // (v1.0.12) tout de suite au démarrage aussi (2 s) : une appli rouverte depuis l'écran d'accueil se met à jour avant
  // qu'on ait touché à quoi que ce soit
  window.setTimeout(check, 2_000);

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
