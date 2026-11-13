import { preloadNoise } from '../core/tsl';
import './style.css';
import './panneaux.css';
import './usinage.css';
import { applyFontVars } from '../core/fonts';
import { createShell, soundOn, soundVolume, type Shell } from './shell';
import { createOpeningScene } from './scenes/opening';
import type { ViewerScene } from './scenes/viewer';
import { withWildEncounter } from './wildEncounter';
import { withMusicPreview } from './musicPreview';
import { withDuelSummon } from './duelEncounter';
import { enableMythicReplay } from './mythic';
import { withMythicPrelude } from './mythicEncounter';
import { installDiag, reportLoad } from './diag';
import { perfMark } from '../core/perfLog';
import { createShopView } from './views/shop';
import { createMissions, MISSION_ICON } from './views/missions';
import { createStatus, PITY_ICON, STREAK_ICON } from './views/status';
import { PITY_LIMIT } from '../core/pity';
import { COIN_ICON, createWallet } from './views/wallet';
import { fmtCoins } from '../core/economy';
import { collectionSig, liveRegen, type GameBackend } from './backend';
import { boardAttention } from './backend';
import { PACK_CAP, PACK_REGEN_MS, boostLeft, fmtCountdown } from '../core/packRegen';
import { initLang, lang, onLang, setLang, t as tr } from './lang';
import type { MsgKey } from '../core/i18n';
import { closeLayers, closePanels, esc, h, loadSeen, navigate, panelHidden, panelShown, setToastSound, syncPanelTriggers, toast } from './ui';
import { preloadOwned } from './preload';
import { bindHapticGestures, haptics } from '../core/haptics';
bindHapticGestures();
import { Sfx } from '../core/audio';
import { padOn, setPadOn, setSilentOn, silentOn } from '../core/soundPrefs';
import { installCatalog } from '../core/sets/themes';
import { CANAL, mountCanalBadge } from '../core/canal';
import { hardUpdate, setUpdateBusy, watchUpdates } from './maj';
import { installNavDots } from './navDots';

// polices du jeu (retours 05/11) : une seule source, src/core/fonts.ts
applyFontVars();
// (version anglaise) langue du jeu : en anglais, le dictionnaire arrive pendant le chargement du reste (rien en français)
const langP = initLang();
import { bindMotionVars } from '../core/motion';
bindMotionVars();
import { installMorph } from '../core/morph';
installMorph();

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
// Catalogue complet (37 088 cartes, ~700 Ko compressés) hors du premier téléchargement : il arrive pendant le
// démarrage de la 3D et il est installé avant le backend — tout ce qui lit le catalogue vient après (themesCore.ts)
const catalogP = import('../core/sets/catalogBig').then(installCatalog);
// (lancé tout de suite : le téléchargement se fait pendant le démarrage de la 3D, plus bas)
const backendP: Promise<GameBackend> = ONLINE
  ? catalogP.then(() => import('./onlineBackend')).then((m) => ((serverDown = m.serverDown), m.createOnlineBackend()))
  : catalogP.then(() => import('./localBackend')).then((m) => m.createLocalBackend());

const app = document.getElementById('app')!;
const glHost = h('div', 'gl-host');
const sceneOverlays = h('div', 'scene-overlays');
const top = h('header', 'topbar');
const viewHost = h('main', 'views');
// l'écran de chargement est déjà dans la page (jeu/index.html) : on le reprend tel quel, sans le recréer
const loader =
  app.querySelector<HTMLElement>('.loader') ??
  h('div', 'loader', '<div class="l-logo">' + tr('boot.logo') + '</div><div class="l-bar"><i></i></div><div class="l-txt">' + tr('boot.fx') + '</div><div class="l-tip"></div>');
// chargement un peu long (téléphone modeste, première visite) : une astuce s'affiche, puis une autre
const TIPS = () => [
  tr('boot.tip1'),
  tr('boot.tip2'),
  tr('boot.tip3'),
  tr('boot.tip4'),
  tr('boot.tip5'),
  tr('boot.tip6'),
];
{
  const tip = loader.querySelector<HTMLElement>('.l-tip')!;
  let i = Math.floor(Math.random() * TIPS().length);
  const next = () => {
    if (!loader.isConnected || loader.classList.contains('done')) return;
    tip.classList.remove('on');
    setTimeout(() => {
      tip.textContent = TIPS()[i++ % TIPS().length]; // (fonction : l'astuce suit la langue, arrivée pendant le chargement)
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
void preloadNoise(); // (audit 12/11, S06 / E2-01) bruit des matériaux calculé dans un worker pendant le démarrage de la 3D
shellP.catch(() => undefined); // (l'échec est traité par boot())
// (audit 12/11, S06 / E2-02) la vitrine se monte SANS attendre le catalogue ni le backend : son montage (visuel du
// sachet, matériaux, pipelines) ne lit rien du catalogue — les 5 sachets sont « simples », sans le texte qui en dépend —
// et il attendait pour rien la fin du téléchargement et de l'analyse du catalogue (boot() démarrait 2,4 à 4 s après le
// lancement sur le téléphone de Tom, la 3D déjà prête). `boot()` attend les deux.
const openingP = shellP.then((s) => (installDiag(s), s.mount('opening', createOpeningScene())));
openingP.catch(() => undefined); // (l'échec est traité par boot())
void shellP.then(enableMythicReplay, () => undefined); // (08/11) « Rejouer » des 6★ dans les visionneuses
import { syncPush } from './notif';
import { setBubbleSound, watchBubbles } from './bubble';
// (V2) toutes les pastilles grandissent et éclatent en bulle de savon (bubble.ts) — rien à changer dans les pages
watchBubbles();
await langP;
const backend: GameBackend = await backendP.catch((e: unknown) => {
  showFailure(e);
  throw e;
});
// (V2) notifications push : si cet appareil est abonné, on resynchronise l'abonnement (clés, compte)
if (backend.state.mode === 'online') backend.onChange((st) => void (st.ready && st.user && syncPushOnce()));
let pushSynced = false;
function syncPushOnce() {
  if (pushSynced) return;
  pushSynced = true;
  void syncPush(backend);
}
// (ouverture 07/11) compte à rebours jusqu'à l'ouverture officielle (convex/launch.ts) — par-dessus le chargement
if (backend.state.mode === 'online') void import('./views/launch').then((m) => m.createLaunchGate(backend));
// (V2) lien admin : badge « V2 — test » + jeu réservé à l'équipe ; prod : rien (src/core/canal.ts)
mountCanalBadge();
if (CANAL === 'v2') void import('./v2gate').then((m) => m.createV2Gate(backend));
// (V2) pastille « mise à jour disponible » quand un patch sort pendant que le jeu est ouvert (src/game/maj.ts)
watchUpdates();

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
      if (r.status === 'ok') toast(tr('ref.welcome', { name: r.referrer ?? tr('ref.yourSponsor'), n: r.packs ?? 10 }), 'ok');
      // (07/11) un lien refusé ne disparaît plus en silence (sauf « déjà parrainé », sans intérêt à l'arrivée)
      else if (r.status === 'tooLate') toast(tr('ref.tooLate'), 'info');
      else if (r.status === 'invalid') toast(tr('ref.invalid'), 'err');
    })
    .catch(() => {})
    .finally(() => (refBusy = false));
});

top.innerHTML = `
  <button class="skip">${tr('nav.skip')}</button>
  <a class="logo" href="#/">${tr('boot.logo')}<span>cartes</span></a>
  <nav aria-label="${tr('nav.aria')}">
    <a href="#/" data-r="">${tr('nav.shop')}</a>
    <a href="#/collection" data-r="collection">Collection</a>
    <a href="#/echanges" data-r="echanges">${tr('nav.trades')}<b class="badge" hidden></b></a>
    <a href="#/jeux" data-r="jeux">${tr('nav.games')}</a>
    <a href="#/classement" data-r="classement">${tr('nav.ranking')}</a>
    <a href="#/succes" data-r="succes">${tr('nav.achievements')}<b class="badge ach-badge" hidden></b></a>
    <a href="#/amis" data-r="amis">${tr('nav.friends')}<b class="badge am-badge" hidden></b></a>
    <i class="nav-pill" aria-hidden="true"></i>
    <button class="nav-more" tabindex="-1" aria-hidden="true">›</button>
  </nav>
  <div class="nav-extra" role="group" aria-label="${tr('nav.extraAria')}">
    <a href="#/maj" data-r="maj" title="${tr('nav.updates')}" aria-label="${tr('nav.updates')}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></a>
    <a href="#/tuto" data-r="tuto" title="${tr('nav.tutorial')}" aria-label="${tr('nav.tutorial')}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4M12 16.8v.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></a>
    <a href="#/suggestions" data-r="suggestions" title="Suggestions" aria-label="Suggestions"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><b class="badge sg-badge" hidden></b></a>
  </div>
  <div class="me"></div>`;
// (retours live 6, C8) navigation à 7 onglets : Boutique · Collection · Échanges · Jeux · Classement · Succès · Amis.
// Les CONTRATS sont dans la Collection (à côté de la Forge, #/collection/contrats) ; Mises à jour, Tutoriel et
// Suggestions passent dans un petit groupe à part (ordinateur) et dans le menu du profil (téléphone).
// lien d'évitement (visible seulement au clavier) : saute l'en-tête
top.querySelector('.skip')!.addEventListener('click', () => viewHost.focus());
const meEl = top.querySelector<HTMLElement>('.me')!;
const tradeBadge = top.querySelector<HTMLElement>('.badge')!;
// cartes obtenues depuis la dernière visite de la collection : pastille dorée sur l'onglet
const freshBadge = h('b', 'badge fresh-badge');
freshBadge.hidden = true;
freshBadge.title = tr('nav.freshCards');
top.querySelector('nav a[data-r="collection"]')!.append(freshBadge);

/** (version anglaise) libellés de l'en-tête refaits en place (les pastilles et écouteurs restent) au changement de langue */
function relabelTop() {
  const NAV: Record<string, MsgKey> = { '': 'nav.shop', echanges: 'nav.trades', jeux: 'nav.games', classement: 'nav.ranking', succes: 'nav.achievements', amis: 'nav.friends' };
  top.querySelectorAll<HTMLElement>('nav a[data-r]').forEach((a) => {
    const k = NAV[a.dataset.r ?? ''];
    if (k && a.firstChild?.nodeType === Node.TEXT_NODE) a.firstChild.textContent = tr(k);
  });
  top.querySelector('.skip')!.textContent = tr('nav.skip');
  navEl.setAttribute('aria-label', tr('nav.aria'));
  top.querySelector('.nav-extra')?.setAttribute('aria-label', tr('nav.extraAria'));
  for (const [r, k] of [['maj', 'nav.updates'], ['tuto', 'nav.tutorial']] as const) {
    const a = top.querySelector<HTMLElement>(`.nav-extra a[data-r="${r}"]`);
    a?.setAttribute('title', tr(k));
    a?.setAttribute('aria-label', tr(k));
  }
  freshBadge.title = tr('nav.freshCards');
  placePill(false);
  syncNavMore();
}
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
/**
 * (version anglaise) Changer de langue depuis la pastille : tout de suite, sauf pendant une ouverture (le booster est
 * dessiné dans la langue de départ) — alors à la fin. Le rendu est refait par l'abonné `onLang` (plus bas, après les pages).
 */
let langBusy: () => boolean = () => false;
let langWait = 0;
function switchLang(to: 'fr' | 'en') {
  window.clearInterval(langWait);
  langWait = 0;
  if (langBusy()) {
    toast(tr('lang.later'), 'info');
    langWait = window.setInterval(() => {
      if (langBusy()) return;
      window.clearInterval(langWait);
      langWait = 0;
      void setLang(to).then((ok) => ok || toast(tr('lang.failed'), 'err'));
    }, 400);
    return;
  }
  void setLang(to).then((ok) => ok || toast(tr('lang.failed'), 'err'));
}
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
const HAP_NOTE = () => haptics.support === 'ios' ? tr('vol.hapIos') : haptics.support === 'none' ? tr('vol.hapNone') : '';
const hapBtn = () => `<button class="vol-hap" role="switch" aria-checked="${haptics.enabled}" title="${tr('vol.hapTitle', { ios: haptics.support === 'ios' ? tr('vol.hapIosNote') : '' })}">${tr('vol.haptics')}<small>${HAP_NOTE()}</small><i aria-hidden="true">${haptics.enabled ? tr('common.yes') : tr('common.no')}</i></button>`;
/** (son V2, 11/11) « Nappe des menus » : un accord feutré, très discret, sous les pages — désactivé par défaut. */
const padBtn = () => `<button class="vol-hap vol-pad" role="switch" aria-checked="${padOn()}" title="${tr('vol.padTitle')}">${tr('vol.pad')}<i aria-hidden="true">${padOn() ? tr('common.yes') : tr('common.no')}</i></button>`;
/** (son V2, 11/11) « Son même en mode silencieux (iPhone) » : seulement là où le navigateur le permet (Safari 17+). */
const silentBtn = () => (Sfx.silentSupported() ? `<button class="vol-hap vol-ios" role="switch" aria-checked="${silentOn()}" title="${tr('vol.silentTitle')}">${tr('vol.silent')}<small> · iPhone</small><i aria-hidden="true">${silentOn() ? tr('common.yes') : tr('common.no')}</i></button>` : '');
const DEMO_TXT = () => tr('demo.txt');
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
  const items = ['.msn-btn', '.st-btn', '.lang-sw', '.snd-wrap', '.demo'].map((q) => meEl.querySelector<HTMLElement>(q)).filter((x): x is HTMLElement => !!x);
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
      else id.insertBefore(x, x.matches('.demo') ? (id.querySelector('.lang-sw') ?? id.querySelector('.snd-wrap') ?? id.querySelector('.user')) : id.querySelector('.user'));
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
  const n = (missions?.ready() ?? 0) + (status ? Number(status.streak().claimable || status.streak().calendar) : 0) + Number(navDots?.majUnread() ?? false);
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
  const demo = s.mode === 'demo' ? `<button class="demo" title="${DEMO_TXT()}" aria-label="${DEMO_TXT()}"><span class="d-l">${tr('demo.offline')}</span><span class="d-s">${tr('demo.short')}</span></button>` : '';
  // son (correctif retours live n°1) : l'icône ouvre / ferme le panneau du volume (curseur + couper / activer) ; un clic
  // ailleurs ou Échap le ferme aussi. Plus d'ouverture au survol : c'est ce qui l'empêchait de se refermer.
  const snd = `<span class="snd-wrap${volOpen ? ' open' : ''}"><button class="icon snd${soundOn() ? '' : ' off'}" title="${tr('vol.title')}" aria-label="${tr('vol.title')}" aria-controls="pop-vol" aria-expanded="${volOpen}">${SND_ICON}</button><span class="vol-pop" id="pop-vol" role="dialog" aria-label="Volume"${volOpen ? '' : ' inert'}><button class="vol-mute" aria-pressed="${!soundOn()}">${soundOn() ? tr('vol.mute') : tr('vol.unmute')}</button><input class="vol" type="range" min="0" max="100" step="5" value="${Math.round(soundVolume() * 100)}" aria-label="Volume"><b class="vol-n">${Math.round(soundVolume() * 100)}</b>${HAPTIC_UI ? hapBtn() : ''}${padBtn()}${silentBtn()}</span></span>`;
  // (version anglaise) langue : pastille FR | EN collée au son, même taille ; la langue active en blanc (usinage.css)
  const ls = `<button class="icon lang-sw" title="${tr('lang.title')}" aria-label="${tr('lang.aria')}"><span class="ls-p" aria-hidden="true"><b${lang() === 'fr' ? ' class="on"' : ''}>FR</b><i>|</i><b${lang() === 'en' ? ' class="on"' : ''}>EN</b></span><span class="mm-l">${tr('lang.label')}</span></button>`;
  // deux groupes : l'état du joueur (réserve, pièces, missions, série, pity) et l'identité (démo, son, profil). Sur
  // ordinateur ils se suivent sur une ligne ; au téléphone (`.me { display: contents }`) l'identité monte à côté du logo
  // et l'état prend toute la 2e rangée (style.css, lot A)
  if (!u) {
    // en ligne, tant que le serveur n'a pas répondu : « connexion… » (pas « Connexion Discord » à un joueur connecté)
    const login = s.mode !== 'online' ? '' : s.ready ? `<button class="btn-primary login">${tr('auth.login')}</button>` : `<span class="conn" role="status">${tr('hdr.connecting')}</span>`;
    meEl.innerHTML = `<div class="me-st"></div><div class="me-id">${demo}${ls}${snd}${login}</div>`;
  } else {
    const ava = u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : `<span class="ava">${esc(u.name.slice(0, 1))}</span>`;
    meEl.innerHTML = `<div class="me-st"><span class="packs-w"><a class="packs" href="#/" title="${tr('hdr.packsTitle', { min: PACK_REGEN_MS / 60000, cap: PACK_CAP })}">${PACK_ICON}<span class="p-txt"><span class="p-n"><b></b>/${PACK_CAP}</span><span class="p-next"></span></span><i class="p-bar"><i></i></i></a><span class="p-boost" hidden></span></span><button class="coin-btn" title="${tr('hdr.walletTitle')}" aria-label="${tr('hdr.wallet')}" aria-controls="pop-wallet" aria-expanded="false">${COIN_ICON}<b>${fmtCoinsShort(backend.eco.snapshot?.coins ?? 0)}</b><i class="w-dot" hidden></i></button><button class="icon msn-btn" title="${tr('hdr.missions')}" aria-label="${tr('hdr.missions')}" aria-controls="pop-missions" aria-expanded="false">${MISSION_ICON}<b class="msn-n" hidden></b><span class="mm-l">Missions</span></button><button class="icon st-btn" title="${tr('hdr.streakTitle')}" aria-label="${tr('hdr.streakTitle')}" aria-controls="pop-status" data-which="streak" aria-expanded="false">${STREAK_ICON}<b class="st-n" aria-hidden="true"></b><span class="mm-l">${tr('hdr.streak')}</span></button><span class="pt-cnt" role="status">${PITY_ICON}<b class="pt-n"></b></span></div><div class="me-id">${demo}${ls}${snd}<button class="user${currentRoute === 'profil' ? ' on' : ''}" title="${tr('hdr.profileTitle', { name: esc(u.name) })}" aria-label="${tr('hdr.profile')}" aria-controls="pop-me" aria-expanded="false">${ava}<i class="u-dot" hidden></i></button><div class="me-menu" id="pop-me" role="dialog" aria-label="${tr('hdr.profileMenu')}" inert><a class="mm-prof" href="#/profil">${ava}<span><b>${esc(u.name)}</b><em>${tr('hdr.seeProfile')}</em></span></a><button class="icon mm-reload" title="${tr('hdr.repairTitle')}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="mm-l">${tr('hdr.repair')}</span></button><a class="icon mm-link" href="#/maj" data-r="maj"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span class="mm-l">${tr('nav.updates')}</span></a><a class="icon mm-link" href="#/tuto" data-r="tuto"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.4M12 16.8v.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span class="mm-l">${tr('nav.tutorial')}</span></a><a class="icon mm-link" href="#/suggestions" data-r="suggestions"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span class="mm-l">Suggestions</span><b class="badge mm-sg" hidden></b></a></div></div>`;
    tickPacks();
    navDots?.sync(); // (le menu du profil vient d'être refait : sa pastille « Mises à jour » aussi)
  }
  meEl.querySelector('.login')?.addEventListener('click', () => backend.login());
  meEl.querySelector('.demo')?.addEventListener('click', () => toast(DEMO_TXT(), 'info'));
  meEl.querySelector('.lang-sw')?.addEventListener('click', () => switchLang(lang() === 'fr' ? 'en' : 'fr'));
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
      m.textContent = on ? tr('vol.mute') : tr('vol.unmute');
      m.setAttribute('aria-pressed', String(!on));
    }
  };
  meEl.querySelector('.vol-mute')?.addEventListener('click', () => setSoundOn(!soundOn()));
  // (11/11) le sélecteur visait le premier `.vol-hap` : sans vibrations (ordinateur), c'était « Effets réduits »
  meEl.querySelector('.vol-hap:not(.vol-pad):not(.vol-ios)')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLElement;
    haptics.enabled = !haptics.enabled;
    b.setAttribute('aria-checked', String(haptics.enabled));
    b.querySelector('i')!.textContent = haptics.enabled ? tr('common.yes') : tr('common.no');
    haptics.pulse([40, 60, 40]); // (allumées : on les sent tout de suite ; coupées : rien)
    if (haptics.enabled && haptics.why) toast(`Vibrations : ${haptics.why}.`, 'info');
  });
  const toggle = (sel: string, read: () => boolean, write: (on: boolean) => void, apply: (on: boolean) => void) =>
    meEl.querySelector(sel)?.addEventListener('click', (e) => {
      const b = e.currentTarget as HTMLElement;
      write(!read());
      b.setAttribute('aria-checked', String(read()));
      b.querySelector('i')!.textContent = read() ? tr('common.yes') : tr('common.no');
      apply(read());
    });
  toggle('.vol-pad', padOn, setPadOn, (on) => shell?.sfx.setPad(on));
  toggle('.vol-ios', silentOn, setSilentOn, (on) => shell?.sfx.setPlayThroughSilent(on));
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
  meEl.querySelector('.mm-reload')?.addEventListener('click', () => void hardUpdate());
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
  if (lastBoard >= 0 && nb > lastBoard && currentRoute !== 'echanges') toast(tr('hdr.boardNews'), 'info');
  lastBoard = nb;
  const badgeChanged = tradeBadge.hidden !== (n === 0) || tradeBadge.textContent !== String(n);
  tradeBadge.hidden = n === 0;
  tradeBadge.textContent = String(n);
  if (badgeChanged) placePill(false);
  // un ami vient de proposer un échange (et on n'est pas déjà sur la page des échanges) : petit message
  if (lastIncoming >= 0 && n - nb > lastIncoming && currentRoute !== 'echanges') {
    const t = s.trades.incoming[s.trades.incoming.length - 1];
    toast(tr('hdr.tradeOffer', { name: t?.fromName ?? tr('hdr.aFriend') }), 'info');
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
  btn?.setAttribute('aria-label', n ? tr('hdr.missionsReady', { n }) : tr('hdr.missions'));
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
  const label = n ? tr('hdr.friendReqs', { n }) : tr('nav.friends.aria');
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
  if (fresh) toast(tr('hdr.friendAsks', { name: fresh.name }), 'info');
  for (const [userId, name] of prev.out) if (friendSeen.friends.has(userId) && !prev.friends.has(userId)) toast(tr('hdr.friendAccepted', { name }), 'ok');
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
  const mm = meEl.querySelector<HTMLElement>('.mm-sg');
  if (mm) (mm.hidden = n === 0), (mm.textContent = String(n));
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
  b.title = ready ? tr('hdr.walletReady') : tr('hdr.walletIdle');
  b.setAttribute('aria-label', tr('hdr.walletCoins', { coins: fmtCoins(snap.coins), ready: ready ? tr('hdr.walletSomething') : '' }));
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
      // (son V2) la rafale est programmée d'un coup sur l'horloge audio : régulière à l'échantillon près
      for (let i = 0; i < n; i++) shell.sfx.coin(i, 0.07, i * 0.055);
      shell.sfx.note(10, 0.08, 0.5, n * 0.055 + 0.06);
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
  st.title = sk.claimable ? tr('hdr.streak7') : sk.calendar ? tr('hdr.dailyGift') : tr('hdr.streakDay', { day: sk.day });
  st.setAttribute('aria-label', st.title);
  syncMenuDot();
  // pity (retours live 02, §11) : compteur « X/200 » toujours visible, sans clic
  // (retours Hugo 10/11, anti-spoil) le serveur remet le compteur à zéro dès le TIRAGE : pendant l'ouverture (et tant
  // qu'un booster tiré attend d'être ouvert) le compteur reste figé, il ne bouge qu'une fois le booster fini
  if (document.body.classList.contains('opening') || backend.state.sealed) {
    if (pt.querySelector('.pt-n')!.textContent) return;
  }
  const n = status.pityCount();
  const left = status.pityLeft();
  pt.querySelector('.pt-n')!.textContent = `${n}/${PITY_LIMIT}`;
  pt.classList.toggle('near', left <= 20 && left > 0);
  pt.classList.toggle('ready', left === 0);
  pt.title = left === 0 ? tr('hdr.pityNext') : tr('hdr.pity', { n, limit: PITY_LIMIT });
  pt.setAttribute('aria-label', pt.title);
}
backend.eco.onChange(syncStatus);
backend.onChange(syncStatus);
// fin de l'ouverture (la classe « opening » du body tombe) : la pity se met enfin à jour
{
  let wasOpening = false;
  new MutationObserver(() => {
    const on = document.body.classList.contains('opening');
    if (on !== wasOpening && !(wasOpening = on)) syncStatus();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
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
  setText(el.querySelector<HTMLElement>('.p-next')!, r.nextAt === null ? tr('hdr.full') : tr('hdr.nextIn', { time: fmtCountdown(r.nextAt - now) }));
  const fill = el.querySelector<HTMLElement>('.p-bar > i')!;
  const gained = lastBalance >= 0 && r.balance > lastBalance;
  // un booster vient d'arriver (ou l'en-tête vient d'être refait) : la barre se place d'un coup, sans animation
  const snap = gained || !fill.style.transform;
  if (snap) fill.style.transition = 'none';
  // échelle plutôt que largeur : animation composée, pas de recalcul de mise en page chaque seconde
  fill.style.transform = `scaleX(${r.nextAt === null ? 1 : Math.min(1, (now - r.regenAt) / Math.max(1, r.nextAt - r.regenAt)).toFixed(4)})`;
  // (ouverture 07/11) bulle « ×2 » au-dessus de la réserve tant que la recharge accélérée dure (24 h après l'arrivée)
  const boost = meEl.querySelector<HTMLElement>('.p-boost');
  if (boost) {
    const left = boostLeft(u.boostUntil, now);
    if (boost.hidden !== (left <= 0)) boost.hidden = left <= 0;
    if (left > 0) {
      const m = Math.ceil(left / 60000);
      setText(boost, `×2 · ${m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`}`);
      boost.title = tr('hdr.boost', { left: m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min` });
    }
  }
  if (snap) {
    void fill.offsetWidth;
    fill.style.transition = '';
  }
  if (gained) {
    el.classList.remove('gain');
    void el.offsetWidth;
    el.classList.add('gain'); // petit pop quand un booster arrive
    // on attendait (réserve vide) : on le dit, même depuis une autre page
    if (lastBalance === 0 && document.visibilityState === 'visible') toast(tr('hdr.packArrived'), 'ok');
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
const offlinePill = h('div', 'offline-pill', tr('net.offline'));
offlinePill.setAttribute('role', 'status');
document.body.append(offlinePill);
let wasDown = false;
const syncOnline = () => {
  const off = !navigator.onLine;
  const down = !off && backend.state.mode === 'online' && serverDown();
  const txt = off ? tr('net.offline') : tr('net.serverDown');
  if ((off || down) && offlinePill.textContent !== txt) offlinePill.textContent = txt;
  document.body.classList.toggle('offline', off);
  document.body.classList.toggle('server-down', down);
  offlinePill.setAttribute('aria-hidden', String(!off && !down));
  if (wasDown && !down && !off) toast(tr('net.serverBack'), 'ok');
  wasDown = down;
};
window.addEventListener('online', () => (syncOnline(), toast(tr('net.back'), 'ok')));
window.addEventListener('offline', syncOnline);
backend.onChange(syncOnline);

let currentRoute = '';
/** (V2) pastilles ajoutées : réserve pleine, Jeux, parrainage, mises à jour (game/navDots.ts) */
let navDots: ReturnType<typeof installNavDots> | null = null;
queueMicrotask(() => (navDots = installNavDots(backend, top, meEl, { route: () => currentRoute, onChange: () => syncMenuDot() })));
/** Titre de l'onglet : la page, précédée du nombre de boosters prêts (« (3) Bébou — boutique »). */
function updateTitle() {
  const u = backend.state.user;
  const n = u ? liveRegen(u).balance : 0;
  const title = `${n > 0 ? `(${n}) ` : ''}${pageTitle(currentRoute)}`;
  if (document.title !== title) document.title = title;
}
/** Titre de l'onglet du navigateur selon la page (fr.ts / en.ts : `title.*`). */
const TITLE_PAGES = new Set(['collection', 'contrats', 'echanges', 'amis', 'profil', 'jeux', 'classement', 'succes', 'suggestions', 'maj', 'tuto']);
const pageTitle = (r: string) => tr((TITLE_PAGES.has(r) ? `title.${r}` : 'title.shop') as MsgKey);

/** Page du jeu : son élément et ses entrées / sorties (route()). */
interface View {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}
/**
 * (V2 fluidité, lot « nav ») CHANGEMENT DE PAGE DOM ↔ DOM par View Transitions — ACTIF par défaut depuis le 11/11 (validé par Tom ;
 * `?vt=0` dans l'adresse le coupe). Fondu enchaîné sobre : l'ancienne page s'efface pendant que la nouvelle apparaît, mêmes jeton
 * de durée (emphatique) et même courbe (entrée) que `view-in`, sans le petit déplacement (bloc « VIEW TRANSITIONS » en
 * fin de style.css). Jamais quand la boutique / la 3D est d'un côté (capture du canvas WebGPU) ni en « Effets réduits ».
 * Coupe-circuit : une erreur, ou une mise à jour qui tarde (> 600 ms) ou une transition qui s'éternise (> durée + 800 ms)
 * la coupe pour le reste de la session — le changement de page se fait alors comme avant.
 */
const VT_FLAG = (() => {
  try {
    return new URLSearchParams(location.search).get('vt') !== '0';
  } catch {
    return true;
  }
})();
let vtDead = false;
/** Fait `apply` (le vrai changement de page) sous transition ; `canVT()` d'abord (sinon `apply` direct, avec `view-in`). */
const canVT = () => VT_FLAG && !vtDead && !document.hidden && typeof document.startViewTransition === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
function swapPage(apply: () => void): void {
  const root = document.documentElement;
  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true;
    apply();
  };
  const trip = (why: unknown) => {
    if (!vtDead) console.warn('[jeu] View Transitions coupées pour la session :', why);
    vtDead = true;
  };
  try {
    root.classList.add('vt-pages');
    const t = document.startViewTransition(run);
    // mise à jour qui n'arrive pas (fil principal pris) : on change de page quand même, et on coupe
    const late = window.setTimeout(() => (trip('mise à jour tardive'), run()), 600);
    // transition qui s'éternise : on la saute
    const stuck = window.setTimeout(() => (trip('transition trop longue'), t.skipTransition()), 800 + parseFloat(getComputedStyle(root).getPropertyValue('--dur-emphatique') || '400'));
    t.updateCallbackDone.then(() => clearTimeout(late), (e: unknown) => (clearTimeout(late), console.error(e), trip(e)));
    t.ready.catch(() => undefined); // (transition sautée : normal)
    void t.finished.catch(() => undefined).then(() => (clearTimeout(late), clearTimeout(stuck), root.classList.remove('vt-pages')));
  } catch (e) {
    trip(e);
    root.classList.remove('vt-pages');
    run();
  }
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
// (V2 fluidité, lot 2) dès que le doigt se pose sur un lien du menu, le module de la page part : il est là au lâcher,
// même dans les premières secondes (avant le préchargement de fond)
document.addEventListener(
  'pointerdown',
  (e) => {
    const r = (e.target as Element | null)?.closest?.('a[data-r]')?.getAttribute('data-r');
    if (r && r in PAGE_MODULES) void PAGE_MODULES[r as keyof typeof PAGE_MODULES]().catch(() => undefined);
  },
  { passive: true, capture: true },
);

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
    perfMark(`étape ${pct} %`); // (07/11) jalons du démarrage dans le rapport de chargement (game/diag.ts)
    // barre animée en continu par jeu/index.html (__bootBar) : on ne lui donne que les vraies étapes
    const fake = (window as unknown as { __bootBar?: { step(p: number): void } }).__bootBar;
    if (fake) fake.step(pct);
    else bar.style.width = `${pct}%`;
    bar.parentElement!.classList.toggle('busy', busy);
    loader.querySelector<HTMLElement>('.l-txt')!.textContent = txt;
  };
  step(15, tr('boot.start3d'), true);
  // visionneuse (collection, gros tirages, fiche…) : son module se télécharge pendant le démarrage de la 3D
  const viewerMod = import('./scenes/viewer');
  viewerMod.catch(() => undefined); // (échec : getViewer() réessaie)
  shell = await shellP;
  setBubbleSound(() => shell.sfx.ui('pop'));
  setToastSound((kind) => (kind === 'err' ? shell.sfx.decline(0.07) : kind === 'ok' ? shell.sfx.note(5, 0.05, 0.4) : shell.sfx.note(2, 0.04, 0.35)));
  step(35, tr('boot.printing'), true);
  // scène d'ouverture = vitrine de la boutique : montée (et ses shaders compilés pour toutes les raretés) avant tout
  const opening = await openingP;
  step(85, tr('boot.setup'));

  let viewerP: Promise<ViewerScene> | null = null;
  let viewerModP: Promise<typeof import('./scenes/viewer')> | null = viewerMod;
  const getViewer = (): Promise<ViewerScene> => {
    if (!viewerP) {
      const mod = viewerModP ?? import('./scenes/viewer');
      viewerModP = null;
      // Pokémon 6★ : la visionneuse (collection, gros tirages, échanges…) rejoue la rencontre sauvage (wildEncounter.ts) ;
      // Yu-Gi-Oh 6★ : l'invocation (duelEncounter.ts)
      // (10/11) les autres 6★ : la scène de leur famille (mythicEncounter.ts), et le bouton « Rejouer » (ui.ts)
      viewerP = mod.then((m) => shell.mount('viewer', m.createViewerScene())).then((v) => withMythicPrelude(shell, withMusicPreview(shell, withDuelSummon(shell, withWildEncounter(shell, v)))));
      viewerP.catch(() => (viewerP = null)); // (échec : nouvel essai au prochain appel, si le navigateur ne garde pas l'échec)
    }
    return viewerP;
  };

  const shop = createShopView(backend, shell, opening, (r) => (location.hash = `#/${r}`), getViewer);
  setUpdateBusy(() => shop.busy()); // (v1.0.12) la mise à jour forcée attend la fin d'une ouverture
  langBusy = () => shop.busy(); // (version anglaise) et le changement de langue aussi
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
    navigator.onLine ? tr('page.failed') : tr('page.offline');
  let current = '';
  let routeGen = 0;

  /**
   * (V2, 10/11) CHAT : lanceur en bas à droite, sur toutes les pages (chat.ts) — hors du premier téléchargement,
   * monté une fois la boutique affichée. `#/chat/<conversation>` (notification touchée) ouvre le panneau sur la bonne
   * conversation sans changer de page.
   */
  let chatP: Promise<import('./chat').ChatWidget | null> | null = null;
  const getChat = () =>
    (chatP ??= import('./chat').then((m) =>
      m.createChat(backend, { sound: (k) => (k === 'in' ? shell.sfx.note(4, 0.04, 0.3) : k === 'out' ? shell.sfx.tick(1.45, 0.045) : shell.sfx.tick(1.1, 0.035)) }),
    ));
  let routed = false;

  /**
   * (V2 fluidité, lot « nav ») DÉFILEMENT RESTAURÉ AU RETOUR (bouton / geste « retour » ou « avancer » du navigateur) :
   * chaque entrée d'historique de page reçoit un repère (`bebouPg`, ajouté à `history.state` par ÉTALEMENT : la pile
   * des couches de ui.ts y garde `bebouLayer`). Une entrée qui porte déjà un repère à l'arrivée = traversée de
   * l'historique ; un clic dans le menu crée une entrée neuve, sans repère : remise à zéro comme avant.
   * On garde le `scrollTop` de la page quittée, par entrée ; les vues, elles, restent détachées (leurs
   * `el.isConnected` pilotent le travail de fond : elles ne peuvent pas rester dans le DOM).
   */
  const scrollMemo = new Map<string, number>();
  let navStamp = '';
  let stampSeq = 0;
  const restoreScroll = (el: HTMLElement, top: number, gen: number) => {
    let tries = 0;
    let cancelled = false;
    const stop = () => (cancelled = true);
    el.addEventListener('wheel', stop, { once: true, passive: true });
    el.addEventListener('touchstart', stop, { once: true, passive: true });
    el.addEventListener('keydown', stop, { once: true });
    const step = () => {
      if (cancelled || gen !== routeGen || !el.isConnected) return;
      el.scrollTop = top;
      // contenu encore trop court (rendu / images en route) : on réessaie quelques images
      if (el.scrollTop < top - 2 && el.scrollHeight - el.clientHeight < top && ++tries < 12) requestAnimationFrame(step);
    };
    step();
  };

  function route() {
    let [r = '', sub] = location.hash.replace(/^#\/?/, '').split('/') as [string?, string?];
    if (r === 'chat') {
      const conv = sub;
      history.replaceState(history.state, '', current ? `#/${current}` : '#/');
      void getChat().then((c) => c?.open(conv), () => undefined);
      if (routed) return;
      r = '';
      sub = undefined;
    }
    routed = true;
    // anciennes adresses de l'espace Jeux (retours live 02, lot P) : la forge est dans la collection, les succès et les
    // primes de complétion dans la page Succès
    const moved = r === 'jeux' ? ({ forge: '#/collection/forge', primes: '#/succes/primes', succes: '#/succes' } as Record<string, string>)[sub ?? ''] : r === 'contrats' ? '#/collection/contrats' : undefined;
    if (moved) return void location.replace(moved);
    // (retours live 6, C8) #/collection/contrats = la page des contrats, dans la Collection
    const page = r === 'collection' && sub === 'contrats' ? 'contrats' : r;
    const key = page in views || isPage(page) ? page : '';
    if (shop.busy() && key !== '') {
      // pas de fuite au milieu d'une ouverture : le pack est déjà tiré, on le finit
      history.replaceState(history.state, '', '#/');
      toast(tr('shop.finishFirst'), 'info');
      return;
    }
    const changed = current !== key;
    const from = current;
    // traversée de l'historique ? (entrée déjà repérée, et pas celle qu'on quitte) → le défilement mémorisé sera rendu
    const arrived = (history.state as { bebouPg?: string } | null)?.bebouPg;
    const wantTop = arrived && arrived !== navStamp ? scrollMemo.get(arrived) : undefined;
    const leaving = views[current];
    if (navStamp && leaving?.el.isConnected) {
      scrollMemo.set(navStamp, leaving.el.scrollTop);
      if (scrollMemo.size > 60) scrollMemo.delete(scrollMemo.keys().next().value!);
    }
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
    if (changed) haptics.pulse(6); // (audit 06/11) et une vibration très courte sous le doigt, comme les apps natives
    current = key;
    if (arrived) navStamp = arrived;
    else {
      navStamp = `${Date.now().toString(36)}.${++stampSeq}`;
      try {
        history.replaceState({ ...(history.state as object | null), bebouPg: navStamp }, '');
      } catch {
        /* historique refusé : pas de repère, pas de restauration */
      }
    }
    // (V2 fluidité, lot 5) la liste du club n'est suivie en temps réel que sur les pages qui l'affichent
    backend.watchMembers?.(key === 'jeux' || key === 'echanges' || key === 'amis' || key === 'profil' || key === 'classement');
    document.body.dataset.route = key || 'shop';
    currentRoute = key;
    updateTitle();
    navDots?.sync();
    // (C8) les Contrats vivent dans la Collection : c'est son onglet qui reste allumé
    const navKey = key === 'contrats' ? 'collection' : key;
    top.querySelectorAll<HTMLElement>('nav a, .nav-extra a').forEach((a) => {
      a.classList.toggle('on', a.dataset.r === navKey);
      if (a.dataset.r === navKey) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    meEl.querySelectorAll<HTMLElement>('.mm-link').forEach((a) => a.classList.toggle('on', a.dataset.r === key));
    placePill(changed);
    // nav qui défile (téléphone, 7 onglets) : l'onglet actif est ramené au milieu
    showActiveTab(changed);
    syncNavMore();
    meEl.querySelector('.user')?.classList.toggle('on', key === 'profil');
    const show = (v: View, fade: boolean, vtWanted = false) => {
      const vt = vtWanted && canVT();
      const apply = () => {
        if (vt && gen !== routeGen) return; // (sous transition la mise à jour arrive une image plus tard : une autre page a pris la main)
        viewHost.replaceChildren(v.el);
        // la page arrive en fondu (pas de saut sec d'un écran à l'autre) — sous View Transitions, c'est elle qui fond
        // (audit 12/11, S10 / E2-07) la page est remplie AVANT le recalcul qui relance le fondu : une mise en page au
        // lieu de deux (avant : recalcul forcé sur la page vide, puis de nouveau une fois remplie)
        if (fade && !vt) v.el.classList.remove('view-in');
        v.enter(sub);
        if (fade && !vt) {
          void v.el.offsetWidth;
          v.el.classList.add('view-in');
        } else if (vt) v.el.classList.remove('view-in'); // (la classe ne doit pas doubler le fondu de la transition)
        // retour arrière / avant du navigateur : la page retrouve son défilement (après `enter`, qui le remet à zéro)
        if (wantTop) restoreScroll(v.el, wantTop, gen);
        updateFresh(true); // on vient (peut-être) de quitter la collection : ce qu'on y a vu est vu
      };
      if (vt) swapPage(apply);
      else apply();
    };
    const ready = views[key];
    // fondu enchaîné (essai `?vt=1`) : seulement entre deux pages 100 % DOM, jamais depuis / vers la boutique (3D)
    if (ready) return show(ready, changed, changed && from !== '' && key !== '' && !!views[from]);
    // première visite de cette page : son module arrive (souvent déjà préchargé : quelques ms)
    if (!isPage(key)) return;
    shell.show(null); // page 100 % DOM : la vitrine ne tourne pas dessous (comme chaque page à son entrée)
    shell.setDimmed(true);
    waitEl.innerHTML = '<div class="vw-box" role="status"><i class="vw-spin" aria-hidden="true"></i><span>' + tr('common.loading') + '</span></div>';
    waitEl.classList.remove('failed');
    viewHost.replaceChildren(waitEl);
    loadPage(key).then(
      (v) => gen === routeGen && show(v, true),
      (e: unknown) => {
        console.error(e);
        if (gen !== routeGen) return;
        // réseau coupé, ou nouvelle version du jeu en ligne (les anciens fichiers n'existent plus) : recharger règle tout
        waitEl.classList.add('failed');
        waitEl.innerHTML = `<div class="vw-box" role="alert"><span class="vw-msg">${failMsg()}</span><span class="vw-acts"><button class="btn-primary vw-reload">${tr('common.reload')}</button></span></div>`;
      },
    );
  }
  window.addEventListener('hashchange', route);
  /**
   * (version anglaise) nouvelle langue : en-tête, titre de l'onglet et pages refaits sans recharger. Les pages DOM déjà
   * créées sont oubliées (recréées à leur prochaine visite, dans la nouvelle langue) ; celle affichée est recréée tout de
   * suite. La boutique (3D) garde son instance.
   */
  onLang(() => {
    relabelTop();
    meSig = '';
    renderMe();
    updateTitle();
    for (const k of Object.keys(views)) {
      if (k === '') continue;
      if (k === current) views[k]!.leave();
      delete views[k];
      pending.delete(k as PageKey);
    }
    if (current !== '') route();
  });
  // réseau revenu pendant qu'une page affichait l'échec : le message le dit
  window.addEventListener('online', () => {
    const m = waitEl.querySelector('.vw-msg');
    if (m) m.textContent = failMsg();
  });
  backend.onChange(renderMe);
  backend.onChange(() => updateFresh());
  route();
  // (visionneuse : PAS montée sous l'écran de chargement : l'attendre ici allongerait le chargement. Son module est
  // déjà téléchargé (début de boot) ; elle est montée 1,5 s après l'affichage de la boutique, et compile alors ses
  // pipelines dans la vraie passe (post.ts, `compile({ real: true })`).)
  step(100, tr('boot.ready'));
  // démo : on le dit une fois (collection locale, amis robots)
  if (backend.state.mode === 'demo') {
    try {
      if (!localStorage.getItem('bebou.demoVu')) {
        localStorage.setItem('bebou.demoVu', '1');
        setTimeout(() => toast(DEMO_TXT(), 'info'), 900);
      }
    } catch {
      /* stockage indisponible : tant pis */
    }
  }
  loader.classList.add('done');
  perfMark('boutique');
  reportLoad(shell);
  setTimeout(() => loader.remove(), 700);
  // (ouverture 07/11) visite guidée automatique : une seule fois par compte (`?guide` pour la revoir)
  // (v1.0.10) sondage « prochaines mises à jour » : à la connexion, puis toutes les heures tant qu'il n'est pas rempli
  void import('./survey').then((m) => m.armSurvey(backend));
  // (patch 08/11) annonce du patch : la page des mises à jour s'ouvre une fois, à la prochaine visite (announce.ts)
  void import('./announce').then((m) => m.armAnnounce(backend));
  // (13/11) + le tour des nouveautés V2 pour les joueurs d'avant la V2 (une fois, d'office)
  void import('./views/guide').then((m) => (m.armGuide(backend), m.armV2Tour(backend)));

  // en tâche de fond : miniatures de la collection, puis les modules des autres pages (navigation instantanée)
  setTimeout(() => {
    preloadOwned(backend.state.collection.map((c) => c.cardId));
    // (audit 12/11, S06 / E2-06) la visionneuse (module + scène + compilation de ses shaders) se monte quand la
    // boutique est au calme et le navigateur inoccupé — plus à heure fixe, où elle tombait sur le 1er booster ouvert.
    // Une carte touchée avant la monte tout de suite (getViewer est appelé à la demande).
    const mountViewer = (tries = 0) => {
      if (shop.busy() && tries < 40) return void setTimeout(() => mountViewer(tries + 1), 750);
      if ('requestIdleCallback' in window) requestIdleCallback(() => void getViewer(), { timeout: 4000 });
      else void getViewer();
    };
    mountViewer();
  }, 1500);
  setTimeout(prefetchPages, 3000);
  setTimeout(() => void getChat().catch(() => (chatP = null)), 900);
  // (V2 fluidité) le jeu s'installe sur l'appareil en tâche de fond (bundle.ts) : démarrages suivants sans réseau
  setTimeout(() => void import('./bundle').then((m) => m.installBundle(() => shop.busy())), 4500);
  // (V2) puis, en fond, les miniatures des cartes possédées (game/offline.ts) — une fois la collection arrivée
  const artSoon = (tries = 0) =>
    setTimeout(() => (backend.state.collection.length ? void import('./offline').then((m) => m.prefetchCollectionArt(backend, () => shop.busy())) : tries < 6 && artSoon(tries + 1)), 20000);
  artSoon();

  // crochet de test (Playwright)
  (window as unknown as { __jeu: unknown }).__jeu = {
    get ready() {
      return true;
    },
    backend,
    shell,
    opening,
    /** test : montrer une carte dans la visionneuse (comme un clic en Collection) */
    view: async (cardId: string, rarityId: Parameters<ViewerScene['show']>[1]) => {
      const v = await getViewer();
      shell.show('viewer');
      await v.show(cardId, rarityId, { quiet: true });
    },
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
    ? '' + tr('boot.dlFailed') + '<br>' + tr('boot.checkNet') + ''
    : '' + tr('boot.no3d') + '<br>' + tr('boot.tryBrowser') + '';
  loader.querySelector<HTMLElement>('.l-txt')!.innerHTML = `${msg}<span class="l-acts"><button class="btn-primary l-reload">${tr('common.reload')}</button>${onGl || net ? '' : `<a class="btn-ghost l-gl" href="${esc(glHref)}">Forcer WebGL</a>`}</span><small>${esc(String(e)).slice(0, 220)}</small>`;
  loader.querySelector('.l-reload')?.addEventListener('click', () => location.reload());
  // (le lien change la recherche de l'URL : c'est un vrai rechargement, pas une page du jeu)
  loader.querySelector('.l-gl')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    location.href = glHref;
  });
}
