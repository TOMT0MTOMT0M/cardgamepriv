import { liveRegen, type GameBackend } from './backend';
import { UPDATES } from './updates.data';

/**
 * PASTILLES AJOUTÉES (V2, docs/IDEES-V2.md §1 bis « bulles à ajouter ») — des points dorés `.nb-dot`, animés par
 * game/bubble.ts comme toutes les autres pastilles (grandit, éclate en bulle de savon quand elle disparaît).
 *
 *  - BOUTIQUE : réserve de boosters pleine (la recharge est à l'arrêt) — sauf quand on est déjà à la boutique ;
 *  - JEUX : un défi Pack Battle reçu, une partie jouée (duel, Battle Royale) ou un tirage de roulette où on avait misé,
 *    depuis la dernière visite de l'espace Jeux (`gamesNoticeAt` du joueur, écrit par le serveur avec ce qui touche déjà
 *    le joueur : aucune requête en plus) ;
 *  - AMIS : un filleul vient de s'inscrire, ou un parrainage vient d'être payé (`referralNoticeAt`), depuis la dernière
 *    visite de la page Amis ;
 *  - MISES À JOUR : une entrée du journal pas encore lue (lien de l'en-tête sur ordinateur, du menu du profil sur
 *    téléphone ; compte aussi dans la pastille de l'avatar).
 *
 * Les dernières visites sont gardées sur l'appareil (localStorage, par compte). Un compte qui n'a encore rien de noté
 * part de « maintenant » pour Jeux et Amis (pas de vieille pastille au premier lancement de la V2) ; le journal, lui,
 * s'affiche comme non lu une fois.
 */
const K = (what: string, uid: string) => `bebou.seen.${what}.${uid}`;
const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible : la pastille revient au prochain lancement, sans gravité */
  }
};
/** dernière entrée du journal des mises à jour */
export const latestUpdate = (): string => {
  const e = UPDATES[0]?.entries[0];
  return e ? `${e.date}|${e.title}` : '';
};

export function installNavDots(backend: GameBackend, top: HTMLElement, me: HTMLElement, opts: { route: () => string; onChange: () => void }) {
  const dot = (host: Element | null, title: string): HTMLElement | null => {
    if (!host) return null;
    let d = host.querySelector<HTMLElement>(':scope > .nb-dot');
    if (!d) {
      d = document.createElement('i');
      d.className = 'nb-dot';
      d.hidden = true;
      d.setAttribute('aria-hidden', 'true');
      host.append(d);
    }
    d.title = title;
    return d;
  };
  let majUnread = false;
  /** horodatage « vu » d'un onglet ; absent : maintenant (rien d'ancien n'est signalé) */
  const seenAt = (what: string, uid: string) => {
    const v = Number(get(K(what, uid)));
    if (v > 0) return v;
    const now = Date.now();
    set(K(what, uid), String(now));
    return now;
  };
  const show = (d: HTMLElement | null, on: boolean) => {
    if (d && d.hidden === on) d.hidden = !on;
  };

  function sync() {
    const u = backend.state.user;
    const route = opts.route();
    // visites : la page ouverte efface sa pastille
    if (u) {
      if (route === 'jeux') set(K('jeux', u.id), String(Date.now()));
      if (route === 'amis') set(K('amis', u.id), String(Date.now()));
    }
    if (route === 'maj') set(K('maj', 'all'), latestUpdate());

    const full = !!u && liveRegen(u).nextAt === null;
    show(dot(top.querySelector('nav a[data-r=""]'), 'Réserve de boosters pleine : la recharge est à l’arrêt'), full && route !== '');

    const games = !!u && (u.gamesNoticeAt ?? 0) > seenAt('jeux', u.id) && route !== 'jeux';
    show(dot(top.querySelector('nav a[data-r="jeux"]'), 'Du nouveau dans l’espace Jeux (défi, partie, roulette)'), games);

    const ref = !!u && (u.referralNoticeAt ?? 0) > seenAt('amis', u.id) && route !== 'amis';
    show(dot(top.querySelector('nav a[data-r="amis"]'), 'Parrainage : un filleul est arrivé ou t’a rapporté des boosters'), ref);

    const unread = !!u && latestUpdate() !== '' && get(K('maj', 'all')) !== latestUpdate() && route !== 'maj';
    show(dot(top.querySelector('.nav-extra a[data-r="maj"]'), 'Nouvelle mise à jour à lire'), unread);
    show(dot(me.querySelector('.mm-link[data-r="maj"]'), 'Nouvelle mise à jour à lire'), unread);
    if (unread !== majUnread) {
      majUnread = unread;
      opts.onChange();
    }
  }
  backend.onChange(sync);
  // la réserve se remplit toute seule : un coup d'œil toutes les 5 s suffit (rien d'écrit si rien ne change)
  setInterval(() => document.hidden || sync(), 5000);
  sync();
  return {
    sync,
    /** pour la pastille de l'avatar (téléphone) : le lien Mises à jour est dans son menu */
    majUnread: () => majUnread,
  };
}
