import './style.css';
import { applyFontVars } from '../core/fonts';
import { createShell, soundOn, soundVolume, type Shell } from './shell';
import { createOpeningScene } from './scenes/opening';
import type { ViewerScene } from './scenes/viewer';
import { withWildEncounter } from './wildEncounter';
import { withMusicPreview } from './musicPreview';
import { withDuelSummon } from './duelEncounter';
import { installDiag } from './diag';
import { createShopView } from './views/shop';
import { createMissions, MISSION_ICON } from './views/missions';
import { createStatus, PITY_ICON, STREAK_ICON } from './views/status';
import { PITY_LIMIT } from '../core/pity';
import { COIN_ICON, createWallet } from './views/wallet';
import { fmtCoins } from '../core/economy';
import { collectionSig, liveRegen, type GameBackend } from './backend';
import { boardAttention } from './backend';
import { PACK_CAP, PACK_REGEN_MS, fmtCountdown } from '../core/packRegen';
import { closeLayers, closePanels, esc, h, loadSeen, navigate, panelHidden, panelShown, setToastSound, syncPanelTriggers, toast } from './ui';
import { preloadOwned } from './preload';
import { bindHapticGestures, haptics } from '../core/haptics';
bindHapticGestures();
import { fxReduced, setFxReduced } from '../core/fxPref';

// polices du jeu (retours 05/11) : une seule source, src/core/fonts.ts
applyFontVars();
import { bindMotionVars } from '../core/motion';
bindMotionVars();

/**
 * LE JEU (page /jeu/) : boutique + ouverture 3D, collection, échanges.
 * Serveur : Convex + Discord si `VITE_CONVEX_URL` est configuré, sinon (ou avec `?demo`) mode démo hors-ligne.
 *
 * Chargement (audit PERF2-05) : le premier téléchargement ne contient que la boutique (vitrine 3D, ouverture, fiche,
 * en-tête). Le backend utilisé (en ligne OU démo, jamais les deux), la visionneuse et les autres pages (collection,
 * échanges, contrats, profil, jeux, classement, succès) arrivent par `import()` : le backend et la visionneuse pendant
 * l'écran de chargement, les pages à leur première visite (préchargées en tâche de fond une fois la boutique affichée).
 */
const params = new URLSearchParams(location.search);
/** Serveur configuré (même test que core/net/client.ts) — sans charger le client réseau, inutile en démo. */
const ONLINE = !!(import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim() && !params.has('demo');
/** Serveur injoignable (bandeau) : branché quand le backend en ligne est chargé. */
let serverDown = () => false;
// (lancé tout de suite : le téléchargement se fait pendant le démarrage de la 3D, plus bas)
const backendP: Promise<GameBackend> = ONLINE
  ? import('./onlineBackend').then((m) => ((serverDown = m.serverDown), m.createOnlineBackend()))
  : import('./localBackend').then((m) => m.createLocalBackend());

const app = document.getElementById('app')!;
const glHost = h('div', 'gl-host');
const sceneOverlays = h('div', 'scene-overlays');
const top = h('header', 'topbar');
const viewHost = h('main', 'views');
// l'écran de chargement est déjà dans la page (jeu/index.html) : on le reprend tel quel, sans le recréer
const loader =
  app.querySelector<HTMLElement>('.loader') ??
  h('div', 'loader', '<div class="l-logo">BÉBOU</div><div class="l-bar"><i></i></div><div class="l-txt">préparation des effets…</div><div class="l-tip"></div>');
// chargement un peu long (téléphone modeste, première visite) : une astuce s'affiche, puis une autre
const TIPS = [
  'Astuce : maintiens, glisse ou touche le booster : chaque pochette s’ouvre à sa façon.',
  'Une carte secrète se cache peut-être dans le Bebou Pack…',
  'Tes doublons valent de l’or : brûle-les en contrat ou échange-les.',
  'Un nouveau booster toutes les 5 minutes, jusqu’à 15 en réserve.',
  'Touche une carte de ta collection pour la voir en grand et la faire tourner.',
  'La lumière qui fuit de l’emballage annonce la meilleure carte du paquet.',
];
{
  const tip = loader.querySelector<HTMLElement>('.l-tip')!;
  let i = Math.floor(Math.random() * TIPS.length);
  const next = () => {
    if (!loader.isConnected || loader.classList.contains('done')) return;
    tip.classList.remove('on');
    setTimeout(() => {
      tip.textContent = TIPS[i++ % TIPS.length];
      tip.classList.add('on');
    }, 250);
    setTimeout(next, 4200);
  };
  setTimeout(next, 600); // la 1re astuce tôt : on voit tout de suite que ça avance
}
// (l'écran de chargement reste en place et au-dessus : déplacé, son reflet animé repartirait de zéro)
// l'en-tête AVANT la page dans le DOM : au clavier (Tab) et au lecteur d'écran, la navigation vient d'abord ;
// à l'écran rien ne change (en-tête fixe, z-index 20 au-dessus des vues, z-index 10)
if (loader.parentElement === app) app.prepend(glHost, sceneOverlays, top, viewHost);
else app.append(glHost, sceneOverlays, top, viewHost, loader);
viewHost.id = 'contenu';
viewHost.tabIndex = -1;

// la 3D démarre (adaptateur WebGPU, appareil…) pendant que le backend se télécharge ; `boot()` l'attend
const shellP = createShell(glHost, sceneOverlays);
shellP.catch(() => undefined); // (l'échec est traité par boot())
const backend: GameBackend = await backendP.catch((e: unknown) => {
  showFailure(e);
  throw e;
});

/**
 * PARRAINAGE (retours live 02, §10) : arrivée par un lien `?ref=CODE` → le clic est compté (une fois par appareil),
 * le code est gardé jusqu'à la connexion ; une fois connecté (compte neuf), on devient filleul : 10 boosters offerts.
 */
const REF_KEY = 'bebou.ref';
{
  const url = new URL(location.href);
  const code = (url.searchParams.get('ref') ?? '').toLowerCase();
  if (/^[a-z0-9]{6,12}$/.test(code)) {
    try {
      localStorage.setItem(REF_KEY, code);
    } catch {
      /* stockage indisponible : le clic compte quand même */
    }
    void backend.referralClick(code).catch(() => {});
    url.searchParams.delete('ref');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
}
let refBusy = false;
backend.onChange((st) => {
  if (refBusy || !st.user) return;
  let code: string | null = null;
  try {
    code = localStorage.getItem(REF_KEY);
  } catch {
    return;
  }
  if (!code) return;
  refBusy = true;
  void backend
    .referralClaim(code)
    .then((r) => {
      try {
        localStorage.removeItem(REF_KEY);
      } catch {
        /* rien */
      }
      if (r.status === 'ok') toast(`Bienvenue ! ${r.referrer ?? 'Ton parrain'} t’a invité : +${r.packs ?? 10} boosters offerts 🎁`, 'ok');
    })
    .catch(() => {})
    .finally(() => (refBusy = false));
});

top.innerHTML = `
  <button class="skip">Aller au contenu</button>
  <a class="logo" href="#/">BÉBOU<span>cartes</span></a>
  <nav aria-label="Pages du jeu">
    <a href="#/" data-r="">Boutique</a>
    <a href="#/collection" data-r="collection">Collection</a>
    <a href="#/contrats" data-r="contrats">Contrats</a>
    <a href="#/echanges" data-r="echanges">Échanges<b class="badge" hidden></b></a>    <a href="#/jeux" data-r="jeux">Jeux</a>
    <a href="#/classement" data-r="classement">Classement</a>
    <a href="#/succes" data-r="succes">Succès<b class="badge ach-badge" hidden></b></a>
    <a href="#/amis" data-r="amis">Amis<b class="badge am-badge" hidden></b></a>
    <a href="#/suggestions" data-r="suggestions">Suggestions<b class="badge sg-badge" hidden></b></a>
    <a href="#/maj" data-r="maj">Mises à jour</a>
    <a href="#/tuto" data-r="tuto">Tutoriel</a>
    <i class="nav-pill" aria-hidden="true"></i>
    <button class="nav-more" tabindex="-1" aria-hidden="true">›</button>
  </nav>
  <div class="me"></div>`;
// lien d'évitement (visible seulement au clavier) : saute l'en-tête
top.querySelector('.skip')!.addEventListener('click', () => viewHost.focus());
const meEl = top.querySelector<HTMLElement>('.me')!;
const tradeBadge = top.querySelector<HTMLElement>('.badge')!;
// cartes obtenues depuis la dernière visite de la collection : pastille dorée sur l'onglet
const freshBadge = h('b', 'badge fresh-badge');
freshBadge.hidden = true;
freshBadge.title = 'Nouvelles cartes depuis ta dernière visite';
top.querySelector('nav a[data-r="collection"]')!.append(freshBadge);

// l'indicateur d'onglet glisse d'une page à l'autre (au lieu de sauter)
const navEl = top.querySelector<HTMLElement>('nav')!;
const pill = top.querySelector<HTMLElement>('.nav-pill')!;
function placePill(animate = true) {
  const a = navEl.querySelector<HTMLElement>('a.on');
  if (!a) return void pill.classList.remove('on'); // profil : aucun onglet
  if (!animate) pill.style.transition = 'none';
  pill.style.width = `${a.offsetWidth}px`;
  pill.style.transform = `translateX(${a.offsetLeft}px)`;
  pill.classList.add('on');
  if (!animate) {
    void pill.offsetWidth;
    pill.style.transition = '';
  }
}
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * Nav qui défile (téléphone, 7 onglets) : un vrai indicateur « › » à droite tant qu'il reste des onglets cachés (il
 * fait défiler d'un toucher), un fondu à gauche quand on a défilé ; l'onglet actif est ramené au milieu.
 */
const navMore = navEl.querySelector<HTMLElement>('.nav-more')!;
function syncNavMore() {
  // (l'indicateur occupe lui-même de la place à la fin : on le retire du calcul)
  const extra = navEl.classList.contains('of') ? navMore.offsetWidth : 0;
  const of = navEl.scrollWidth - extra - navEl.clientWidth > 2;
  const max = navEl.scrollWidth - navEl.clientWidth;
  navEl.classList.toggle('of', of);
  navEl.classList.toggle('more-r', of && navEl.scrollLeft < max - 2);
  navEl.classList.toggle('more-l', of && navEl.scrollLeft > 2);
}
navEl.addEventListener('scroll', syncNavMore, { passive: true });
navMore.addEventListener('click', (e) => {
  e.preventDefault();
  navEl.scrollBy({ left: navEl.clientWidth * 0.6, behavior: lessMotion.matches ? 'auto' : 'smooth' });
});
function showActiveTab(smooth: boolean) {
  const a = navEl.querySelector<HTMLElement>('a.on');
  if (!a || navEl.scrollWidth <= navEl.clientWidth) return;
  navEl.scrollTo({ left: Math.max(0, a.offsetLeft - (navEl.clientWidth - a.offsetWidth) / 2), behavior: smooth && !lessMotion.matches ? 'smooth' : 'auto' });
}

/**
 * Hauteur de l'en-tête au téléphone : elle n'est plus figée (3 rangées de cibles de 40 px, la largeur décide) ; on la
 * mesure et on la publie dans --top, que lisent tous les panneaux et vues. Mesure dans une image d'animation (pas dans
 * le rappel de l'observateur : plus de boucle « ResizeObserver loop », UX1-25) et écriture seulement si elle change ;
 * l'en-tête du téléphone ne dépend pas de --top, donc pas de rebond.
 */
const phoneTop = matchMedia('(max-width: 600px)');
const safeProbe = h('div', 'safe-probe');
document.body.append(safeProbe);
let topPx = -1;
function measureTop() {
  if (!phoneTop.matches) {
    if (topPx !== -1) document.documentElement.style.removeProperty('--top');
    topPx = -1;
    return;
  }
  const v = Math.round(top.offsetHeight - safeProbe.offsetHeight);
  if (v > 20 && v !== topPx) {
    topPx = v;
    document.documentElement.style.setProperty('--top', `${v}px`);
  }
}
let roRaf = 0;
// largeur des onglets : change avec la police (chargée après coup), une pastille, la taille de l'écran
const ro = new ResizeObserver(() => {
  roRaf ||= requestAnimationFrame(() => {
    roRaf = 0;
    measureTop();
    placePill(false);
    syncNavMore();
  });
});
ro.observe(top);
ro.observe(navEl);
void document.fonts?.ready.then(() => (placePill(false), measureTop(), syncNavMore()));

let freshSig = '';
function updateFresh(force = false) {
  const sig = collectionSig(backend.state);
  if (!force && sig === freshSig) return;
  freshSig = sig;
  const seen = loadSeen();
  let n = 0;
  if (seen && currentRoute !== 'collection') for (const id of new Set(backend.state.collection.map((c) => c.cardId))) if (!seen.has(id)) n++;
  const was = freshBadge.hidden ? 0 : Number(freshBadge.dataset.n);
  freshBadge.hidden = n === 0;
  freshBadge.dataset.n = String(n);
  freshBadge.textContent = n > 99 ? '99+' : String(n);
  if (n !== was) placePill(false);
}

/**
 * Icônes de l'en-tête dessinées (et non des émojis, qui changent d'allure d'un téléphone à l'autre) : un haut-parleur
 * dont les ondes laissent place à une croix quand on coupe le son, et un petit booster pour la réserve.
 */
const SND_ICON = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.4h3.3L12 5.6v12.8l-4.7-3.8H4z" fill="currentColor" fill-opacity=".16"/><path class="w1" d="M15.4 9.3a3.9 3.9 0 0 1 0 5.4"/><path class="w2" d="M18 6.8a7.4 7.4 0 0 1 0 10.4"/><path class="x" d="M16 9.6l4.8 4.8M20.8 9.6 16 14.4"/></svg>`;
const PACK_ICON = `<svg class="p-ico" viewBox="0 0 16 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M3 4h10v12H3z" fill="currentColor" fill-opacity=".16" stroke-width="1.2"/><path d="M3 4l1.25-2L5.5 4l1.25-2L8 4l1.25-2L10.5 4l1.25-2L13 4M3 16l1.25 2 1.25-2 1.25 2L8 16l1.25 2 1.25-2 1.25 2L13 16" stroke-width="1.05"/><circle cx="8" cy="10" r="2.1" fill="currentColor" stroke="none"/></svg>`;

let meSig = '';
let lastIncoming = -1;
let lastBoard = -1;
let lastAuthError: string | null = null;
/** panneau du volume ouvert (survit au rafraîchissement de l'en-tête) ; c'est un panneau comme les autres (ui.ts) */
let volOpen = false;
const closeVol = () => setVolOpen(false);
function setVolOpen(on: boolean) {
  if (on === volOpen) return;
  volOpen = on;
  const w = meEl.querySelector<HTMLElement>('.snd-wrap');
  w?.classList.toggle('open', on);
  w?.querySelector('.snd')?.setAttribute('aria-expanded', String(on));
  const pop = w?.querySelector<HTMLElement>('.vol-pop');
  if (on && pop) panelShown(pop, closeVol);
  else if (!on) panelHidden(pop ?? h('span'), closeVol);
  if (pop) pop.inert = !on;
}
/** solde de l'en-tête : court au-delà de 10 000 (« 12,3 k »), le portefeuille garde le nombre complet */
const fmtCoinsShort = (n: number) => {
  if (n < 10_000) return fmtCoins(n);
  const [v, u] = n < 1e6 ? [n / 1e3, 'k'] : [n / 1e6, 'M'];
  return `${(Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, '').replace('.', ',')}\u00a0${u}`;
};
/**
 * Interrupteur « Vibrations » dans le panneau du son (audit UX2-14) : seulement au doigt (sur ordinateur, rien ne vibre),
 * branché sur `haptics.enabled` (core/haptics.ts, mémorisé `bebou.haptics`) — indépendant du son.
 */
const HAPTIC_UI = matchMedia('(pointer: coarse)').matches;
const HAP_NOTE = haptics.support === 'ios' ? ' · iPhone : au toucher seulement' : haptics.support === 'none' ? ' · indisponibles ici' : '';
const hapBtn = () => `<button class="vol-hap" role="switch" aria-checked="${haptics.enabled}" title="Toucher pour tester${haptics.support === 'ios' ? ' (iPhone : le navigateur ne vibre que pendant un toucher, jamais pendant une animation)' : ''}">Vibrations<small>${HAP_NOTE}</small><i aria-hidden="true">${haptics.enabled ? 'oui' : 'non'}</i></button>`;
/** Interrupteur « Effets réduits » (retours live 02 §7, core/fxPref.ts) : holo / reflets / halos des cartes encore plus discrets, partout (PC et téléphone). */
const fxBtn = () => `<button class="vol-hap vol-fx" role="switch" aria-checked="${fxReduced()}" title="Holo, reflets et halos des cartes plus discrets">Effets réduits<i aria-hidden="true">${fxReduced() ? 'oui' : 'non'}</i></button>`;
const DEMO_TXT = 'Mode démo : pas de serveur, ta collection est stockée dans ce navigateur et les amis sont des robots.';
// clic n'importe où ailleurs, ou Échap : le panneau du volume se ferme
document.addEventListener('click', () => volOpen && setVolOpen(false));
window.addEventListener('keydown', (e) => e.key === 'Escape' && volOpen && setVolOpen(false));
/**
 * MENU DU PROFIL (téléphone, ≤ 600 px — retours de Tom du 4 nov.) : l'en-tête tient sur UNE ligne (réserve, pièces,
 * pity, avatar) ; missions, connexion et son passent dans un menu qui s'ouvre en touchant l'avatar. Les vrais boutons
 * sont déplacés dans le menu (mêmes écouteurs, mêmes pastilles) ; une pastille sur l'avatar signale qu'il y a
 * quelque chose à réclamer dedans.
 */
const phoneHead = matchMedia('(max-width: 600px)');
let menuOpen = false;
const closeMenu = () => setMenuOpen(false);
function setMenuOpen(on: boolean) {
  const menu = meEl.querySelector<HTMLElement>('.me-menu');
  if (on && !phoneHead.matches) on = false;
  if (on === menuOpen && (!menu || menu.classList.contains('on') === on)) return;
  menuOpen = on;
  meEl.querySelector('.user')?.setAttribute('aria-expanded', String(on));
  if (!menu) return;
  menu.classList.toggle('on', on);
  const vol = menu.querySelector<HTMLElement>('.vol-pop');
  if (on) {
    panelShown(menu, closeMenu);
    if (vol) vol.inert = false; // (le réglage du son est affiché directement dans le menu)
  } else {
    panelHidden(menu, closeMenu);
    if (vol) vol.inert = !volOpen;
  }
}
/** Place missions, connexion et son dans le menu (téléphone) ou les remet dans l'en-tête (ordinateur). */
function layoutMenu() {
  const menu = meEl.querySelector<HTMLElement>('.me-menu');
  if (!menu) return;
  const st = meEl.querySelector<HTMLElement>('.me-st')!;
  const id = meEl.querySelector<HTMLElement>('.me-id')!;
  const items = ['.msn-btn', '.st-btn', '.snd-wrap', '.demo'].map((q) => meEl.querySelector<HTMLElement>(q)).filter((x): x is HTMLElement => !!x);
  if (phoneHead.matches) {
    for (const x of items) menu.append(x);
    // « Relancer le jeu » toujours en dernier (l'appli installée n'a pas de bouton recharger)
    const rl = menu.querySelector('.mm-reload');
    if (rl) menu.append(rl);
  } else {
    const pity = st.querySelector('.pt-cnt');
    // (seulement ce qui est dans le menu ; ordre d'origine : missions, série · démo, son, avatar)
    for (const x of items) {
      if (x.parentElement !== menu) continue;
      if (x.matches('.msn-btn, .st-btn')) st.insertBefore(x, pity);
      else id.insertBefore(x, x.matches('.demo') ? (id.querySelector('.snd-wrap') ?? id.querySelector('.user')) : id.querySelector('.user'));
    }
    if (menuOpen) setMenuOpen(false);
  }
  // en-tête refait pendant que le menu était ouvert : il le reste
  if (menuOpen && phoneHead.matches) {
    menu.classList.add('on');
    menu.inert = false;
    const vol = menu.querySelector<HTMLElement>('.vol-pop');
    if (vol) vol.inert = false;
    meEl.querySelector('.user')?.setAttribute('aria-expanded', 'true');
  }
  syncMenuDot();
}
/** Pastille de l'avatar (téléphone) : missions à réclamer, série ou cadeau du jour. */
function syncMenuDot() {
  const d = meEl.querySelector<HTMLElement>('.u-dot');
  if (!d) return;
  const n = (missions?.ready() ?? 0) + (status ? Number(status.streak().claimable || status.streak().calendar) : 0);
  d.hidden = !phoneHead.matches || n === 0;
}
phoneHead.addEventListener('change', () => layoutMenu());
document.addEventListener('click', (e) => {
  if (!menuOpen) return;
  const t = e.target as Node;
  if (!meEl.querySelector('.me-menu')?.contains(t) && !meEl.querySelector('.user')?.contains(t)) setMenuOpen(false);
});
function renderMe() {
  const s = backend.state;
  const u = s.user;
  // l'en-tête n'est refait que si ce qu'il affiche change (pas à chaque présence d'ami ou ligne du fil)
  // erreur de connexion (code Discord traduit, session expirée) : un message visible aussi sur téléphone
  if (s.authError && s.authError !== lastAuthError) toast(s.authError, 'err');
  lastAuthError = s.authError;
  const sig = JSON.stringify([s.mode, s.ready, u?.id, u?.name, u?.avatarUrl, u?.packStored, u?.packRegenAt, s.trades.incoming.length, boardAttention(s)]);
  if (sig === meSig) return;
  meSig = sig;
  // démo : un petit « démo » reste visible au téléphone ; le toucher explique (le `title` n'existe pas au doigt)
  const demo = s.mode === 'demo' ? `<button class="demo" title="${DEMO_TXT}" aria-label="${DEMO_TXT}"><span class="d-l">démo hors-ligne</span><span class="d-s">démo</span></button>` : '';
  // son (correctif retours live n°1) : l'icône ouvre / ferme le panneau du volume (curseur + couper / activer) ; un clic
  // ailleurs ou Échap le ferme aussi. Plus d'ouverture au survol : c'est ce qui l'empêchait de se refermer.
  const snd = `<span class="snd-wrap${volOpen ? ' open' : ''}"><button class="icon snd${soundOn() ? '' : ' off'}" title="Son et volume" aria-label="Son et volume" aria-controls="pop-vol" aria-expanded="${volOpen}">${SND_ICON}</button><span class="vol-pop" id="pop-vol" role="dialog" aria-label="Volume"${volOpen ? '' : ' inert'}><button class="vol-mute" aria-pressed="${!soundOn()}">${soundOn() ? 'Couper' : 'Activer'}</button><input class="vol" type="range" min="0" max="100" step="5" value="${Math.round(soundVolume() * 100)}" aria-label="Volume"><b class="vol-n">${Math.round(soundVolume() * 100)}</b>${HAPTIC_UI ? hapBtn() : ''}${fxBtn()}</span></span>`;
  // deux groupes : l'état du joueur (réserve, pièces, missions, série, pity) et l'identité (démo, son, profil). Sur
  // ordinateur ils se suivent sur une ligne ; au téléphone (`.me { display: contents }`) l'identité monte à côté du logo
  // et l'état prend toute la 2e rangée (style.css, lot A)
  if (!u) {
    // en ligne, tant que le serveur n'a pas répondu : « connexion… » (pas « Connexion Discord » à un joueur connecté)
    const login = s.mode !== 'online' ? '' : s.ready ? `<button class="btn-primary login">Connexion Discord</button>` : `<span class="conn" role="status">connexion…</span>`;
    meEl.innerHTML = `<div class="me-st"></div><div class="me-id">${demo}${snd}${login}</div>`;
  } else {
    const ava = u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : `<span class="ava">${esc(u.name.slice(0, 1))}</span>`;
    meEl.innerHTML = `<div class="me-st"><a class="packs" href="#/" title="1 booster toutes les ${PACK_REGEN_MS / 60000} minutes, jusqu'à ${PACK_CAP} en réserve · ouvrir à la boutique">${PACK_ICON}<span class="p-txt"><span class="p-n"><b></b>/${PACK_CAP}</span><span class="p-next"></span></span><i class="p-bar"><i></i></i></a><button class="coin-btn" title="Portefeuille : pièces, primes, mouvements" aria-label="Portefeuille" aria-controls="pop-wallet" aria-expanded="false">${COIN_ICON}<b>${fmtCoinsShort(backend.eco.snapshot?.coins ?? 0)}</b><i class="w-dot" hidden></i></button><button class="icon msn-btn" title="Missions du jour" aria-label="Missions du jour" aria-controls="pop-missions" aria-expanded="false">${MISSION_ICON}<b class="msn-n" hidden></b><span class="mm-l">Missions</span></button><button class="icon st-btn" title="Connexion : série et calendrier" aria-label="Connexion : série et calendrier" aria-controls="pop-status" data-which="streak" aria-expanded="false">${STREAK_ICON}<b class="st-n" aria-hidden="true"></b><span class="mm-l">Connexion</span></button><span class="pt-cnt" role="status">${PITY_ICON}<b class="pt-n"></b></span></div><div class="me-id">${demo}${snd}<button class="user${currentRoute === 'profil' ? ' on' : ''}" title="Mon profil · ${esc(u.name)}" aria-label="Mon profil" aria-controls="pop-me" aria-expanded="false">${ava}<i class="u-dot" hidden></i></button><div class="me-menu" id="pop-me" role="dialog" aria-label="Menu du profil" inert><a class="mm-prof" href="#/profil">${ava}<span><b>${esc(u.name)}</b><em>Voir mon profil</em></span></a><button class="icon mm-reload" title="Recharger le jeu (si l’affichage 3D ne revient pas)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="mm-l">Relancer le jeu</span></button></div></div>`;
    tickPacks();
  }
  meEl.querySelector('.login')?.addEventListener('click', () => backend.login());
  meEl.querySelector('.demo')?.addEventListener('click', () => toast(DEMO_TXT, 'info'));
  const sndWrap = meEl.querySelector<HTMLElement>('.snd-wrap');
  const sndBtn = meEl.querySelector<HTMLElement>('.snd');
  sndBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setVolOpen(!volOpen);
  });
  const setSoundOn = (on: boolean) => {
    (shell as Shell & { setSound(on: boolean): void }).setSound(on);
    sndBtn?.classList.toggle('off', !on); // les ondes s'effacent, la croix apparaît (et l'inverse)
    const m = meEl.querySelector<HTMLButtonElement>('.vol-mute');
    if (m) {
      m.textContent = on ? 'Couper' : 'Activer';
      m.setAttribute('aria-pressed', String(!on));
    }
  };
  meEl.querySelector('.vol-mute')?.addEventListener('click', () => setSoundOn(!soundOn()));
  meEl.querySelector('.vol-hap')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLElement;
    haptics.enabled = !haptics.enabled;
    b.setAttribute('aria-checked', String(haptics.enabled));
    b.querySelector('i')!.textContent = haptics.enabled ? 'oui' : 'non';
    haptics.pulse([40, 60, 40]); // (allumées : on les sent tout de suite ; coupées : rien)
    if (haptics.enabled && haptics.why) toast(`Vibrations : ${haptics.why}.`, 'info');
  });
  meEl.querySelector('.vol-fx')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLElement;
    setFxReduced(!fxReduced()); // → matériaux holo (uniforms) + classe fx-reduced du <body> (vignettes)
    b.setAttribute('aria-checked', String(fxReduced()));
    b.querySelector('i')!.textContent = fxReduced() ? 'oui' : 'non';
  });
  const vol = meEl.querySelector<HTMLInputElement>('.vol');
  vol?.style.setProperty('--v', vol.value);
  vol?.addEventListener('input', () => {
    vol.style.setProperty('--v', vol.value);
    const v = Number(vol.value) / 100;
    (shell as Shell & { setVolume(v: number): void }).setVolume(v);
    meEl.querySelector('.vol-n')!.textContent = String(Math.round(v * 100));
    // volume remonté alors que le son était coupé : on le remet
    if (v > 0 && !soundOn()) setSoundOn(true);
  });
  sndWrap?.addEventListener('click', (e) => e.stopPropagation());
  vol?.addEventListener('change', () => shell?.sfx.tick(1.2, 0.08));
  // téléphone : l'avatar ouvre un menu (profil, missions, connexion, son) ; ordinateur : il mène au profil, comme avant
  meEl.querySelector('.user')?.addEventListener('click', (e) => {
    if (!phoneHead.matches) return navigate('#/profil');
    e.stopPropagation();
    setMenuOpen(!menuOpen);
  });
  meEl.querySelector('.mm-prof')?.addEventListener('click', () => setMenuOpen(false));
  meEl.querySelector('.mm-reload')?.addEventListener('click', () => location.reload());
  layoutMenu();
  meEl.querySelector('.msn-btn')?.addEventListener('click', () => missions?.toggle());
  meEl.querySelector('.coin-btn')?.addEventListener('click', () => wallet?.toggle());
  meEl.querySelector('.st-btn')?.addEventListener('click', () => status?.toggle('streak'));
  syncMissionBadge();
  syncStatus();
  syncCoins();
  syncFriendLink();
  syncPanelTriggers();
  // + le tableau d'offres (lot T) : offres reçues sur mes annonces, contre-offres reçues sur mes offres
  const nb = boardAttention(s);
  const n = s.trades.incoming.length + nb;
  if (lastBoard >= 0 && nb > lastBoard && currentRoute !== 'echanges') toast('Du nouveau sur le tableau d’offres (offre ou contre-offre) → Échanges', 'info');
  lastBoard = nb;
  const badgeChanged = tradeBadge.hidden !== (n === 0) || tradeBadge.textContent !== String(n);
  tradeBadge.hidden = n === 0;
  tradeBadge.textContent = String(n);
  if (badgeChanged) placePill(false);
  // un ami vient de proposer un échange (et on n'est pas déjà sur la page des échanges) : petit message
  if (lastIncoming >= 0 && n - nb > lastIncoming && currentRoute !== 'echanges') {
    const t = s.trades.incoming[s.trades.incoming.length - 1];
    toast(`${t?.fromName ?? 'Un ami'} te propose un échange → Échanges`, 'info');
  }
  lastIncoming = n - nb;
}
/** Missions du jour (panneau sous la cible de l'en-tête) ; créées une fois la 3D prête (sons). */
let missions: ReturnType<typeof createMissions> | null = null;
function syncMissionBadge() {
  const b = meEl.querySelector<HTMLElement>('.msn-n');
  if (!b) return;
  const n = missions?.ready() ?? 0;
  b.hidden = n === 0;
  b.textContent = String(n);
  const btn = meEl.querySelector<HTMLElement>('.msn-btn');
  btn?.classList.toggle('ready', n > 0);
  btn?.setAttribute('aria-label', n ? `Missions : ${n} à réclamer` : 'Missions du jour');
  syncMenuDot();
}
backend.onChange(syncMissionBadge);
/**
 * AMIS : onglet de la navigation (récap retours live 02, §10 : « nouvel onglet AMIS » — liste d'amis + parrainage),
 * pastille du nombre de demandes reçues ; petit message quand une
 * demande arrive ou qu'un joueur accepte la mienne (sauf si on est déjà sur la page Amis).
 */
function syncFriendLink() {
  // (retours live 02, §10) AMIS est désormais un ONGLET de la navigation (amis + parrainage) : la pastille y est
  const a = top.querySelector<HTMLElement>('nav a[data-r="amis"]');
  const so = backend.state.social;
  if (!a) return;
  const n = so.ready ? so.incoming.length : 0;
  const b = a.querySelector<HTMLElement>('.am-badge')!;
  if (b.hidden !== (n === 0)) b.hidden = n === 0;
  if (b.textContent !== String(n)) b.textContent = String(n);
  const label = n ? `Amis : ${n} demande${n > 1 ? 's' : ''} d’ami reçue${n > 1 ? 's' : ''}` : 'Amis';
  if (a.getAttribute('aria-label') !== label) (a.setAttribute('aria-label', label), (a.title = label));
  a.classList.toggle('ready', n > 0);
  placePill(false);
}
let friendSeen: { inc: Set<string>; out: Map<string, string>; friends: Set<string> } | null = null;
backend.onChange((st) => {
  const so = st.social;
  if (!so.ready) return;
  syncFriendLink();
  const prev = friendSeen;
  friendSeen = { inc: new Set(so.incoming.map((r) => r.id)), out: new Map(so.outgoing.map((r) => [r.userId, r.name])), friends: new Set(so.friends.map((f) => f.userId)) };
  if (!prev || currentRoute === 'amis') return;
  const fresh = so.incoming.find((r) => !prev.inc.has(r.id));
  if (fresh) toast(`${fresh.name} te demande en ami → Amis`, 'info');
  for (const [userId, name] of prev.out) if (friendSeen.friends.has(userId) && !prev.friends.has(userId)) toast(`${name} a accepté ta demande d’ami !`, 'ok');
});
/** pastille sur l'onglet SUCCÈS : succès atteints à encaisser */
const achBadge = top.querySelector<HTMLElement>('.ach-badge')!;
backend.eco.onChange((snap) => {
  const n = snap?.achievements.claimable.length ?? 0;
  const was = achBadge.hidden ? 0 : Number(achBadge.textContent);
  achBadge.hidden = n === 0;
  achBadge.textContent = String(n);
  if (n !== was) placePill(false);
});
backend.eco.onChange(() => syncMissionBadge());
/** (retours 06/11) modérateurs (Hugo, Tom) : pastille des nouvelles suggestions sur l'onglet */
const sgBadge = top.querySelector<HTMLElement>('.sg-badge');
backend.eco.onChange((snap) => {
  if (!sgBadge) return;
  const n = snap?.isModerator || snap?.isAdmin ? snap.suggestionsNew ?? 0 : 0;
  const was = sgBadge.hidden ? 0 : Number(sgBadge.textContent);
  sgBadge.hidden = n === 0;
  sgBadge.textContent = String(n);
  if (n !== was) placePill(false);
});
/** Portefeuille (pièces) : solde dans l'en-tête, « +N » qui s'envole à chaque gain, pastille s'il y a quelque chose à prendre. */
let wallet: ReturnType<typeof createWallet> | null = null;
let lastCoins = -1;
function syncCoins() {
  const b = meEl.querySelector<HTMLElement>('.coin-btn');
  const snap = backend.eco.snapshot;
  if (!b || !snap) return;
  setText(b.querySelector('b')!, fmtCoinsShort(snap.coins));
  const ready = wallet?.ready() ?? 0;
  b.querySelector<HTMLElement>('.w-dot')!.hidden = ready === 0;
  b.title = ready ? 'Portefeuille : quelque chose à prendre (calendrier, primes, succès) !' : 'Portefeuille : pièces, calendrier, primes';
  b.setAttribute('aria-label', `Portefeuille : ${fmtCoins(snap.coins)} pièces${ready ? ', quelque chose à prendre' : ''}`);
  // (animations réduites : le solde change, sans « +N » qui s'envole)
  if (lastCoins >= 0 && snap.coins !== lastCoins && document.visibilityState === 'visible' && !lessMotion.matches) {
    const d = snap.coins - lastCoins;
    const r = b.getBoundingClientRect();
    const fly = h('div', `coin-fly${d < 0 ? ' neg' : ''}`, `${d > 0 ? '+' : '−'}${fmtCoins(Math.abs(d))}`);
    fly.style.left = `${r.left + r.width / 2 - 20}px`;
    fly.style.top = `${r.bottom + 4}px`;
    document.body.append(fly);
    setTimeout(() => fly.remove(), 1400);
    b.classList.remove('bump');
    void b.offsetWidth;
    b.classList.add('bump');
    // gain : tics de pièces dont la hauteur monte dans la gamme (3 à 8 selon le montant), puis un « ting » final
    if (d > 0 && shell) {
      const n = Math.min(8, 3 + Math.floor(Math.log10(Math.max(1, d))));
      for (let i = 0; i < n; i++) setTimeout(() => shell.sfx.coin(i, 0.07), i * 55);
      setTimeout(() => shell.sfx.note(10, 0.08, 0.5), n * 55 + 60);
    }
  }
  lastCoins = snap.coins;
}
backend.eco.onChange(syncCoins);
/** Série de connexion + pity (status.ts) ; créés une fois la 3D prête (sons). */
let status: ReturnType<typeof createStatus> | null = null;
function syncStatus() {
  const st = meEl.querySelector<HTMLElement>('.st-btn');
  const pt = meEl.querySelector<HTMLElement>('.pt-cnt');
  if (!st || !pt || !status) return;
  const sk = status.streak();
  st.querySelector('.st-n')!.textContent = `${sk.day}/7`;
  // flamme = panneau CONNEXION (retours live 02, §11) : elle bat s'il y a la série OU le cadeau du calendrier à prendre
  const ready = sk.claimable || sk.calendar;
  st.classList.toggle('ready', ready);
  st.title = sk.claimable ? 'Série de 7 jours : récompense à réclamer !' : sk.calendar ? 'Connexion : cadeau du jour à prendre !' : `Connexion · série jour ${sk.day}/7 · calendrier`;
  st.setAttribute('aria-label', st.title);
  syncMenuDot();
  // pity (retours live 02, §11) : compteur « X/200 » toujours visible, sans clic
  const n = status.pityCount();
  const left = status.pityLeft();
  pt.querySelector('.pt-n')!.textContent = `${n}/${PITY_LIMIT}`;
  pt.classList.toggle('near', left <= 20 && left > 0);
  pt.classList.toggle('ready', left === 0);
  pt.title = left === 0 ? 'Pity 6★ : ton prochain booster contient un 6★ sûr !' : `Pity 6★ : ${n} booster${n > 1 ? 's' : ''} sans 6★ · au ${PITY_LIMIT}e, un 6★ garanti (remis à zéro au premier 6★)`;
  pt.setAttribute('aria-label', pt.title);
}
backend.eco.onChange(syncStatus);
backend.onChange(syncStatus);
/** N'écrit dans le DOM que si le texte change (le compteur tourne chaque seconde). */
const setText = (e: Element, t: string) => {
  if (e.textContent !== t) e.textContent = t;
};
/** Réserve de boosters + compte à rebours du prochain (1 / 5 min, 15 max), mis à jour chaque seconde sans tout redessiner. */
let lastBalance = -1;
function tickPacks() {
  const u = backend.state.user;
  const el = meEl.querySelector<HTMLElement>('.packs');
  if (!u || !el) return;
  const now = Date.now();
  const r = liveRegen(u, now);
  setText(el.querySelector('b')!, String(r.balance));
  // au-dessus du plafond (cadeau, ancien solde) : « 40 » tout court, pas « 40/15 »
  el.classList.toggle('over', r.balance > PACK_CAP);
  el.classList.toggle('full', r.nextAt === null);
  // (retours live 02, lot G) état « régénération en cours » distinct de « réserve pleine » (pilule violet/bleu, CSS)
  el.classList.toggle('regen', r.nextAt !== null);
  el.classList.toggle('empty', r.balance <= 0);
  setText(el.querySelector<HTMLElement>('.p-next')!, r.nextAt === null ? 'réserve pleine' : `+1 dans ${fmtCountdown(r.nextAt - now)}`);
  const fill = el.querySelector<HTMLElement>('.p-bar > i')!;
  const gained = lastBalance >= 0 && r.balance > lastBalance;
  // un booster vient d'arriver (ou l'en-tête vient d'être refait) : la barre se place d'un coup, sans animation
  const snap = gained || !fill.style.transform;
  if (snap) fill.style.transition = 'none';
  // échelle plutôt que largeur : animation composée, pas de recalcul de mise en page chaque seconde
  fill.style.transform = `scaleX(${r.nextAt === null ? 1 : Math.min(1, (now - r.regenAt) / PACK_REGEN_MS).toFixed(4)})`;
  if (snap) {
    void fill.offsetWidth;
    fill.style.transition = '';
  }
  if (gained) {
    el.classList.remove('gain');
    void el.offsetWidth;
    el.classList.add('gain'); // petit pop quand un booster arrive
    // on attendait (réserve vide) : on le dit, même depuis une autre page
    if (lastBalance === 0 && document.visibilityState === 'visible') toast('Un booster vient d’arriver : il t’attend à la boutique !', 'ok');
  }
  if (r.balance !== lastBalance) {
    lastBalance = r.balance;
    updateTitle();
    // la boutique (bouton « Ouvrir », réserve) se met à jour quand un booster arrive
    window.dispatchEvent(new CustomEvent('bebou:packs', { detail: r.balance }));
  }
}
// onglet caché (PERF2-16) : plus de compteur ni de barre à mettre à jour, seulement le titre de l'onglet (« (3) Bébou »
// reste visible dans la barre des onglets) ; au retour, tout se remet à l'heure tout de suite
setInterval(() => (document.hidden ? updateTitle() : tickPacks()), 1000);
document.addEventListener('visibilitychange', () => document.hidden || tickPacks());

let shell: Shell;

// plus de réseau (métro, avion…) : un bandeau discret le dit, au lieu d'erreurs incompréhensibles ; même bandeau
// quand le réseau marche mais que le serveur ne répond pas (panne, déploiement en cours) : « serveur injoignable »
const offlinePill = h('div', 'offline-pill', 'Pas de réseau · on reprend dès que ça revient');
offlinePill.setAttribute('role', 'status');
document.body.append(offlinePill);
let wasDown = false;
const syncOnline = () => {
  const off = !navigator.onLine;
  const down = !off && backend.state.mode === 'online' && serverDown();
  const txt = off ? 'Pas de réseau · on reprend dès que ça revient' : 'Serveur injoignable · on réessaie…';
  if ((off || down) && offlinePill.textContent !== txt) offlinePill.textContent = txt;
  document.body.classList.toggle('offline', off);
  document.body.classList.toggle('server-down', down);
  offlinePill.setAttribute('aria-hidden', String(!off && !down));
  if (wasDown && !down && !off) toast('Serveur retrouvé', 'ok');
  wasDown = down;
};
window.addEventListener('online', () => (syncOnline(), toast('Réseau retrouvé', 'ok')));
window.addEventListener('offline', syncOnline);
backend.onChange(syncOnline);

let currentRoute = '';
/** Titre de l'onglet : la page, précédée du nombre de boosters prêts (« (3) Bébou — boutique »). */
function updateTitle() {
  const u = backend.state.user;
  const n = u ? liveRegen(u).balance : 0;
  const t = `${n > 0 ? `(${n}) ` : ''}${TITLES[currentRoute] ?? TITLES['']}`;
  if (document.title !== t) document.title = t;
}
/** Titre de l'onglet du navigateur selon la page. */
const TITLES: Record<string, string> = {
  '': 'Bébou — boutique',
  collection: 'Bébou — collection',
  contrats: 'Bébou — contrats',
  echanges: 'Bébou — échanges',
  amis: 'Bébou — amis',
  profil: 'Bébou — profil',
  jeux: 'Bébou — jeux',
  classement: 'Bébou — classement',
  succes: 'Bébou — succès',
  suggestions: 'Bébou — suggestions',
  maj: 'Bébou — mises à jour',
  tuto: 'Bébou — tutoriel',
};

/** Page du jeu : son élément et ses entrées / sorties (route()). */
interface View {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}
/**
 * Pages chargées à leur première visite (PERF2-05) : hors du premier téléchargement, préchargées en tâche de fond une
 * fois la boutique affichée (`prefetchPages`). Missions, portefeuille et série / pity restent dans le premier
 * téléchargement : leurs pastilles vivent dans l'en-tête.
 */
const PAGE_MODULES = {
  collection: () => import('./views/collection'),
  echanges: () => import('./views/trades'),
  amis: () => import('./views/friends'),
  contrats: () => import('./views/contracts'),
  profil: () => import('./views/profile'),
  jeux: () => import('./views/games'),
  classement: () => import('./views/ranking'),
  succes: () => import('./views/succes'),
  suggestions: () => import('./views/suggestions'),
  maj: () => import('./views/infos'),
  tuto: () => import('./views/infos'),
};
type PageKey = keyof typeof PAGE_MODULES;
const isPage = (k: string): k is PageKey => k in PAGE_MODULES;
/** Précharge (sans les créer) les modules des pages, un par un quand le navigateur est libre ; rien en économie de données. */
function prefetchPages() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /2g/.test(conn?.effectiveType ?? '')) return;
  const queue = Object.values(PAGE_MODULES);
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 300));
  const next = () => {
    const load = queue.shift();
    if (load) idle(() => void load().then(next, () => undefined)); // (échec réseau : on arrête, la page réessaiera à la visite)
  };
  next();
}

async function boot() {
  const bar = loader.querySelector<HTMLElement>('.l-bar i')!;
  // étapes longues (démarrage de la 3D, compilation des shaders) : la barre ne reste pas figée, un reflet la parcourt
  const step = (pct: number, txt: string, busy = false) => {
    // barre animée en continu par jeu/index.html (__bootBar) : on ne lui donne que les vraies étapes
    const fake = (window as unknown as { __bootBar?: { step(p: number): void } }).__bootBar;
    if (fake) fake.step(pct);
    else bar.style.width = `${pct}%`;
    bar.parentElement!.classList.toggle('busy', busy);
    loader.querySelector<HTMLElement>('.l-txt')!.textContent = txt;
  };
  step(15, 'démarrage de la 3D…', true);
  // visionneuse (collection, gros tirages, fiche…) : son module se télécharge pendant le démarrage de la 3D
  const viewerMod = import('./scenes/viewer');
  viewerMod.catch(() => undefined); // (échec : getViewer() réessaie)
  shell = await shellP;
  installDiag(shell); // (diagnostic à distance des scènes 6★ sur téléphone, voir diag.ts)
  setToastSound((kind) => (kind === 'err' ? shell.sfx.decline(0.07) : kind === 'ok' ? shell.sfx.note(5, 0.05, 0.4) : shell.sfx.note(2, 0.04, 0.35)));
  step(35, 'impression des boosters…', true);
  // scène d'ouverture = vitrine de la boutique : montée (et ses shaders compilés pour toutes les raretés) avant tout
  const opening = await shell.mount('opening', createOpeningScene());
  step(85, 'mise en place…');

  let viewerP: Promise<ViewerScene> | null = null;
  let viewerModP: Promise<typeof import('./scenes/viewer')> | null = viewerMod;
  const getViewer = (): Promise<ViewerScene> => {
    if (!viewerP) {
      const mod = viewerModP ?? import('./scenes/viewer');
      viewerModP = null;
      // Pokémon 6★ : la visionneuse (collection, gros tirages, échanges…) rejoue la rencontre sauvage (wildEncounter.ts) ;
      // Yu-Gi-Oh 6★ : l'invocation (duelEncounter.ts)
      viewerP = mod.then((m) => shell.mount('viewer', m.createViewerScene())).then((v) => withMusicPreview(shell, withDuelSummon(shell, withWildEncounter(shell, v))));
      viewerP.catch(() => (viewerP = null)); // (échec : nouvel essai au prochain appel, si le navigateur ne garde pas l'échec)
    }
    return viewerP;
  };

  const shop = createShopView(backend, shell, opening, (r) => (location.hash = `#/${r}`), getViewer);
  missions = createMissions(backend, shell);
  wallet = createWallet(backend, shell);
  status = createStatus(backend, shell);
  syncMissionBadge();
  syncStatus();
  const makePage: { [K in PageKey]: (m: Awaited<ReturnType<(typeof PAGE_MODULES)[K]>>) => View } = {
    collection: (m) => m.createCollectionView(backend, shell, getViewer),
    echanges: (m) => m.createTradesView(backend, shell, getViewer),
    amis: (m) => m.createFriendsView(backend, shell),
    contrats: (m) => m.createContractsView(backend, shell, getViewer),
    profil: (m) =>
      m.createProfileView(backend, shell, getViewer, () => {
        void backend.logout().then(() => (location.hash = '#/'));
      }),
    jeux: (m) => m.createGamesView(backend, shell),
    classement: (m) => m.createRankingView(backend, shell),
    succes: (m) => m.createSuccesView(backend, shell),
    suggestions: (m) => m.createSuggestionsView(backend, shell),
    maj: (m) => m.createUpdatesView(shell),
    tuto: (m) => m.createTutorialView(shell),
  };
  const views: Record<string, View> = { '': shop };
  const pending = new Map<PageKey, Promise<View>>();
  /** La page `key`, créée à sa première visite (son module téléchargé si besoin). */
  const loadPage = (key: PageKey): Promise<View> => {
    let p = pending.get(key);
    if (!p) {
      p = PAGE_MODULES[key]().then((m) => (views[key] = (makePage[key] as (m: unknown) => View)(m)));
      p.catch(() => pending.delete(key)); // (nouvel essai à la prochaine visite, si le navigateur ne garde pas l'échec)
      pending.set(key, p);
    }
    return p;
  };
  /** Page en cours de chargement (première visite, réseau lent) ou en échec : un petit état au lieu d'un écran vide. */
  const waitEl = h('section', 'view view-wait');
  // (pas de « Réessayer » : le navigateur garde en mémoire l'échec d'un module pour la session — seul recharger marche)
  waitEl.addEventListener('click', (e) => (e.target as Element).closest('.vw-reload') && location.reload());
  const failMsg = () =>
    navigator.onLine ? 'Cette page n’a pas pu se charger (réseau coupé un instant, ou nouvelle version du jeu en ligne) : recharge la page.' : 'Pas de réseau : cette page n’a pas pu se charger. Recharge dès que le réseau revient.';
  let current = '';
  let routeGen = 0;

  function route() {
    const [r = '', sub] = location.hash.replace(/^#\/?/, '').split('/');
    // anciennes adresses de l'espace Jeux (retours live 02, lot P) : la forge est dans la collection, les succès et les
    // primes de complétion dans la page Succès
    const moved = r === 'jeux' ? ({ forge: '#/collection/forge', primes: '#/succes/primes', succes: '#/succes' } as Record<string, string>)[sub ?? ''] : undefined;
    if (moved) return void location.replace(moved);
    const key = r in views || isPage(r) ? r : '';
    if (shop.busy() && key !== '') {
      // pas de fuite au milieu d'une ouverture : le pack est déjà tiré, on le finit
      history.replaceState(null, '', '#/');
      toast('Termine d’abord ton booster !', 'info');
      return;
    }
    const changed = current !== key;
    const gen = ++routeGen;
    // changement de page : aucun panneau de l'en-tête ni aucune couche ne reste ouvert par-dessus la nouvelle page
    // (avant que la page quittée ne ferme ses propres visionneuses)
    if (changed) {
      closePanels();
      setVolOpen(false);
      closeLayers();
    }
    if (views[current] && changed) views[current].leave();
    if (changed && shell) shell.sfx.tick(1.15, 0.025); // changement de page : un tic à peine audible
    current = key;
    document.body.dataset.route = key || 'shop';
    currentRoute = key;
    updateTitle();
    top.querySelectorAll<HTMLElement>('nav a').forEach((a) => {
      a.classList.toggle('on', a.dataset.r === key);
      if (a.dataset.r === key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    placePill(changed);
    // nav qui défile (téléphone, 7 onglets) : l'onglet actif est ramené au milieu
    showActiveTab(changed);
    syncNavMore();
    meEl.querySelector('.user')?.classList.toggle('on', key === 'profil');
    const show = (v: View, fade: boolean) => {
      viewHost.replaceChildren(v.el);
      // la page arrive en fondu (pas de saut sec d'un écran à l'autre)
      if (fade) {
        v.el.classList.remove('view-in');
        void v.el.offsetWidth;
        v.el.classList.add('view-in');
      }
      v.enter(sub);
      updateFresh(true); // on vient (peut-être) de quitter la collection : ce qu'on y a vu est vu
    };
    const ready = views[key];
    if (ready) return show(ready, changed);
    // première visite de cette page : son module arrive (souvent déjà préchargé : quelques ms)
    if (!isPage(key)) return;
    shell.show(null); // page 100 % DOM : la vitrine ne tourne pas dessous (comme chaque page à son entrée)
    shell.setDimmed(true);
    waitEl.innerHTML = '<div class="vw-box" role="status"><i class="vw-spin" aria-hidden="true"></i><span>chargement…</span></div>';
    waitEl.classList.remove('failed');
    viewHost.replaceChildren(waitEl);
    loadPage(key).then(
      (v) => gen === routeGen && show(v, true),
      (e: unknown) => {
        console.error(e);
        if (gen !== routeGen) return;
        // réseau coupé, ou nouvelle version du jeu en ligne (les anciens fichiers n'existent plus) : recharger règle tout
        waitEl.classList.add('failed');
        waitEl.innerHTML = `<div class="vw-box" role="alert"><span class="vw-msg">${failMsg()}</span><span class="vw-acts"><button class="btn-primary vw-reload">Recharger</button></span></div>`;
      },
    );
  }
  window.addEventListener('hashchange', route);
  // réseau revenu pendant qu'une page affichait l'échec : le message le dit
  window.addEventListener('online', () => {
    const m = waitEl.querySelector('.vw-msg');
    if (m) m.textContent = failMsg();
  });
  backend.onChange(renderMe);
  backend.onChange(() => updateFresh());
  route();
  // (visionneuse : PAS montée sous l'écran de chargement — sa compilation ne vise plus la vraie cible de la passe
  // (post.ts, TARGET_PRECOMPILE coupé) : l'attendre ici allongerait le chargement pour rien. Son module est déjà
  // téléchargé (début de boot) ; elle est montée 1,5 s après l'affichage de la boutique, comme avant.)
  step(100, 'c’est prêt');
  // démo : on le dit une fois (collection locale, amis robots)
  if (backend.state.mode === 'demo') {
    try {
      if (!localStorage.getItem('bebou.demoVu')) {
        localStorage.setItem('bebou.demoVu', '1');
        setTimeout(() => toast(DEMO_TXT, 'info'), 900);
      }
    } catch {
      /* stockage indisponible : tant pis */
    }
  }
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 700);

  // en tâche de fond : miniatures de la collection, puis les modules des autres pages (navigation instantanée)
  setTimeout(() => {
    void getViewer();
    preloadOwned(backend.state.collection.map((c) => c.cardId));
  }, 1500);
  setTimeout(prefetchPages, 3000);

  // crochet de test (Playwright)
  (window as unknown as { __jeu: unknown }).__jeu = {
    get ready() {
      return true;
    },
    backend,
    shell,
    opening,
    tap: () => (shell.input as unknown as { taps: Set<(x: number, y: number, e: unknown) => void> }).taps.forEach((f) => f(0, 0, {})),
  };
}

boot().catch(showFailure);

/** Le jeu ne démarre pas : message lisible + de quoi réessayer (sur l'écran de chargement). */
function showFailure(e: unknown) {
  console.error(e);
  // message lisible (la cause technique reste dessous, en petit, pour nous aider à comprendre) + de quoi réessayer :
  // recharger, ou forcer l'ancien moteur 3D (WebGL, `?backend=webgl`, lu par core/renderer.ts)
  loader.classList.add('failed');
  const gl = new URLSearchParams(location.search);
  gl.set('backend', 'webgl');
  const glHref = `${location.pathname}?${gl}${location.hash}`;
  const onGl = params.get('backend') === 'webgl';
  // un fichier du jeu qui n'arrive pas (réseau coupé, nouvelle version en ligne) n'est pas un souci de 3D
  const net = /dynamically imported module|importing a module script failed|error loading dynamically|failed to fetch|preload/i.test(String(e));
  const msg = net
    ? 'Le jeu n’a pas pu finir de se télécharger.<br>Vérifie ta connexion, puis recharge la page.'
    : 'Ton navigateur n’arrive pas à démarrer la 3D.<br>Essaie Chrome, Edge ou Safari à jour, puis recharge la page.';
  loader.querySelector<HTMLElement>('.l-txt')!.innerHTML = `${msg}<span class="l-acts"><button class="btn-primary l-reload">Recharger</button>${onGl || net ? '' : `<a class="btn-ghost l-gl" href="${esc(glHref)}">Forcer WebGL</a>`}</span><small>${esc(String(e)).slice(0, 220)}</small>`;
  loader.querySelector('.l-reload')?.addEventListener('click', () => location.reload());
  // (le lien change la recherche de l'URL : c'est un vrai rechargement, pas une page du jeu)
  loader.querySelector('.l-gl')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    location.href = glHref;
  });
}
