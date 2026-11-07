import { rarity, type RarityId } from '../core/rarity';
import { siteUrl } from '../core/siteRoot';
import { artPath, catalogEntry, hasArt, subthemeById, thumbPath, type CatalogEntry } from '../core/sets/themes';
import { jvThumbSvg } from '../core/art/jvTitle';
import { observeRealCard } from './cardImages';
import { haptics } from '../core/haptics';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** ★★★☆☆☆ (la secrète : le sceau ✷). */
export function starsHtml(r: RarityId): string {
  const rr = rarity(r);
  if (rr.secret) return `<span class="stars secret">✷ SECRÈTE</span>`;
  const n = rr.rank + 1;
  return `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(6 - n)}</i></span>`;
}

/** 2020 → « 2 020 » (espace insécable : l'espace fine n'existe pas dans la police des titres). */
export const fmtN = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

/** Pourcentage à la française : « 9,3 % », « 42 % » (une décimale sous 10 %). */
export const fmtPct = (p: number) => `${p > 0 && p < 10 ? p.toFixed(1).replace('.', ',') : Math.floor(p)}\u00a0%`;

/** Recherche sans accents ni majuscules : « pokemon » trouve « Pokémon », « hericendre » trouve « Héricendre ». */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Typographie française : espace insécable avant ! ? : ; » et après « (« Encore un ! » ne se coupe jamais avant le
 * point d'exclamation). Pour du texte seulement, pas pour du HTML avec attributs.
 */
export const fr = (s: string) => s.replace(/ ([!?:;»])/g, ' $1').replace(/« /g, '« ');

/** « 1 doublon », « 2 doublons » */
export const plural = (n: number, one: string, many = `${one}s`) => `${fmtN(n)} ${n > 1 ? many : one}`;

/** Cartes vues lors de la dernière visite de la collection (navigateur) : sert à repérer les nouvelles. */
export const SEEN_KEY = 'bebou.vues.v1';
export function loadSeen(): Set<string> | null {
  try {
    const v = localStorage.getItem(SEEN_KEY);
    return v ? new Set(JSON.parse(v) as string[]) : null;
  } catch {
    return null;
  }
}

/** Miniature : l'image WebP, ou (carte Jeux vidéo sans illustration) le monogramme de son design typographique. */
export const thumbUrl = (e: CatalogEntry) => (hasArt(e) ? siteUrl(thumbPath(e)) : jvThumbSvg(e.name, subthemeById(e.subthemeId)?.label ?? ''));
export const artUrl = (e: CatalogEntry) => siteUrl(artPath(e));

/**
 * Miniature de carte (grilles). Carte possédée : la VRAIE carte (même gabarit que la 3D), peinte quand elle arrive à
 * l'écran (cardImages.ts) ; en attendant, et pour les cartes manquantes, un aperçu illustration + étoiles.
 */
export function cardTile(cardId: string, r: RarityId, o: { count?: number; owned?: boolean; mini?: boolean; label?: string; fresh?: boolean } = {}): HTMLElement {
  const e = catalogEntry(cardId);
  const rr = rarity(r);
  const owned = o.owned ?? true;
  const t = h('div', `tile r-${r}${owned ? ' owned' : ' missing'}${o.mini ? ' mini' : ''}${o.fresh ? ' fresh' : ''}`);
  t.style.setProperty('--rc', rr.hex);
  t.style.setProperty('--ra', rr.accentHex);
  t.dataset.card = cardId;
  t.dataset.rarity = r;
  // une carte Bébou non possédée ne se montre pas (thème secret)
  const hideArt = !owned && rr.secret;
  t.innerHTML = `
    <div class="art">${hideArt || !e ? '<span class="q">?</span>' : `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(e)}">`}</div>
    <div class="meta"><span class="num">${e ? String(e.num).padStart(3, '0') : '—'}</span>${starsHtml(r)}</div>
    <div class="name">${hideArt ? '???' : esc(e?.name ?? cardId)}</div>
    ${o.count && o.count > 1 ? `<span class="count">×${o.count}</span>` : ''}
    ${o.label ? `<span class="badge">${esc(o.label)}</span>` : ''}`;
  if (!owned) t.title = hideArt ? 'Carte secrète' : `${e?.name ?? cardId} · pas encore trouvée`;
  if (owned && e) {
    t.title = `${e.name} · ${rr.label}${o.fresh ? ' · nouvelle depuis ta dernière visite' : ''}`;
    // au clavier : Tab pour aller de carte en carte, Entrée pour l'ouvrir en grand
    t.tabIndex = 0;
    t.setAttribute('role', 'button');
    t.dataset.real = `${cardId}|${r}`;
    observeRealCard(t);
  }
  return t;
}

// tuiles au clavier : Entrée (ou Espace) sur une carte = clic
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if ((e.key === 'Enter' || e.key === ' ') && t?.classList?.contains('tile') && t.getAttribute('role') === 'button') {
    e.preventDefault();
    t.click();
  }
});

/**
 * Souris : la carte survolée (toutes les grilles) s'incline vers le curseur, comme une vraie carte qu'on penche à la
 * lumière. Un seul écouteur pour toute la page, une écriture par image au plus ; rien au doigt, ni quand l'appareil
 * demande moins d'animations. Le CSS lit --tx / --ty (de -0,5 à 0,5).
 */
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
let tiltEl: HTMLElement | null = null;
let tiltRect: DOMRect | null = null;
let tiltRaf = 0;
let tiltX = 0;
let tiltY = 0;
function untilt() {
  tiltEl?.style.removeProperty('--tx');
  tiltEl?.style.removeProperty('--ty');
  tiltEl = null;
  tiltRect = null;
}
document.addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse' || !finePointer.matches || lessMotion.matches) return;
    const t = (e.target as Element | null)?.closest?.<HTMLElement>('.tile.owned') ?? null;
    if (t !== tiltEl) {
      untilt();
      tiltEl = t;
    }
    if (!t) return;
    // mesurée une fois à l'entrée (une carte déjà penchée mesurerait de travers)
    tiltRect ??= t.getBoundingClientRect();
    tiltX = Math.max(-0.5, Math.min(0.5, (e.clientX - tiltRect.left) / tiltRect.width - 0.5));
    tiltY = Math.max(-0.5, Math.min(0.5, (e.clientY - tiltRect.top) / tiltRect.height - 0.5));
    tiltRaf ||= requestAnimationFrame(() => {
      tiltRaf = 0;
      tiltEl?.style.setProperty('--tx', tiltX.toFixed(3));
      tiltEl?.style.setProperty('--ty', tiltY.toFixed(3));
    });
  },
  { passive: true },
);
// la grille défile sous la souris : la carte sera remesurée
document.addEventListener('scroll', () => (tiltRect = null), { capture: true, passive: true });

/**
 * COUCHES (visionneuse d'une carte, fiche d'un booster, panneaux de l'en-tête, sélecteur…) : le geste ou le bouton
 * « retour » du téléphone ferme la couche du dessus, au lieu de quitter la page. C'est une PILE : fiche → grille des
 * cartes → retour = grille fermée, retour = fiche fermée. `pushLayer` à l'ouverture, `popLayer` quand on ferme soi-même
 * (✕, Échap, clic à côté) — idéalement avec la même fonction, `popLayer(close)`, dès que deux couches s'empilent.
 *
 * Une entrée d'historique par couche ({ bebouLayer: profondeur }). Les retours en arrière qu'on lance nous-mêmes sont
 * faits UN PAR UN (deux `history.back()` dans la même tâche ne reculent que d'un cran sur certains navigateurs) ; une
 * couche ouverte pendant qu'un retour est en route attend son arrivée pour créer son entrée.
 */
type Layer = { close: () => void };
const layers: Layer[] = [];
/** profondeur de l'entrée d'historique courante (0 = page normale) */
const histDepth = () => {
  const s = (history.state as { bebouLayer?: number | boolean } | null)?.bebouLayer;
  return typeof s === 'number' ? s : s ? 1 : 0;
};
// page rechargée sur une entrée de couche : on l'oublie (reculer depuis là rechargerait l'ancienne page)
if (histDepth()) history.replaceState({ ...(history.state as object), bebouLayer: 0 }, '');
/** un `history.back()` lancé par nous, pas encore arrivé */
let travelling = false;
let travelTimer = 0;
/** couches du dessus dont l'entrée d'historique reste à créer (ouvertes pendant un retour en route) */
let pendingPush = 0;
/** couche en train de se fermer par « retour » ou `closeLayers` : son propre `popLayer()` ne fait rien */
let closing: Layer | null = null;
const whenSettled: Array<() => void> = [];

function travel() {
  travelling = true;
  clearTimeout(travelTimer);
  // filet : un retour qui n'arrive jamais ne bloque pas les couches suivantes
  travelTimer = window.setTimeout(() => {
    travelling = false;
    reconcile();
  }, 1000);
  history.back();
}
/** Met l'historique d'accord avec la pile : recule s'il y a trop d'entrées, crée celles qui manquent. */
function reconcile() {
  if (travelling) return;
  if (histDepth() > layers.length - pendingPush) return travel();
  for (; pendingPush > 0; pendingPush--) history.pushState({ bebouLayer: histDepth() + 1 }, '');
  for (const f of whenSettled.splice(0)) f();
}
function closeSilently(l: Layer) {
  const prev = closing;
  closing = l;
  try {
    l.close();
  } finally {
    closing = prev;
  }
}
export function pushLayer(close: () => void) {
  if (layers.some((l) => l.close === close)) return; // déjà ouverte
  layers.push({ close });
  haptics.pulse(6); // (audit 06/11) ouverture d'une fiche ou d'un panneau : retour tactile très court
  if (travelling) pendingPush++;
  else history.pushState({ bebouLayer: histDepth() + 1 }, '');
}
/** On ferme soi-même. Avec `close` : cette couche-là ; sans : celle du dessus (ancien comportement). */
export function popLayer(close?: () => void) {
  if (closing && (!close || close === closing.close)) return; // déjà dépilée (retour du téléphone)
  const i = close ? layers.findIndex((l) => l.close === close) : layers.length - 1;
  if (i < 0) return;
  if (i >= layers.length - pendingPush) pendingPush--; // son entrée n'existait pas encore
  layers.splice(i, 1);
  // ne recule que si on est encore sur les entrées des couches (pas après un changement de page)
  reconcile();
}
/** Ferme toutes les couches ouvertes (changement de page, lien touché dans une couche). */
export function closeLayers() {
  while (layers.length) closeSilently(layers.pop()!);
  pendingPush = 0;
  reconcile();
}
export const layerCount = () => layers.length;
/** Aller à une page : les couches ouvertes se ferment d'abord (historique propre : pas d'entrée fantôme). */
export function navigate(hash: string) {
  if (!layers.length && !travelling) return void (location.hash = hash);
  closeLayers();
  if (travelling) whenSettled.push(() => (location.hash = hash));
  else location.hash = hash;
}
window.addEventListener('popstate', () => {
  if (travelling) {
    // c'est notre propre retour qui arrive
    travelling = false;
    clearTimeout(travelTimer);
    return reconcile();
  }
  // « retour » du téléphone ou du navigateur : on ferme les couches au-dessus de l'entrée où l'on arrive
  const a = histDepth();
  pendingPush = 0;
  while (layers.length > a) closeSilently(layers.pop()!);
  // entrée d'une couche déjà fermée (fantôme) : on la saute
  reconcile();
});
// lien touché pendant qu'une couche est ouverte : on ferme d'abord, on navigue ensuite (UX1-18)
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!layers.length && !travelling) return;
  const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#"]');
  if (!a || a.target) return;
  e.preventDefault();
  navigate(a.getAttribute('href')!);
});

/**
 * PANNEAUX DE L'EN-TÊTE (missions, portefeuille, série / pity, volume) : un seul ouvert à la fois, « retour » les ferme
 * (couche), le focus entre dans le panneau à l'ouverture et revient au bouton qui l'a ouvert. Fermés, ils sont `inert`
 * (ni focus ni lecteur d'écran). Le déclencheur porte `aria-controls="<id du panneau>"` (et `data-which` si un même
 * panneau a plusieurs contenus) : son `aria-expanded` suit.
 */
/** bouton ✕ des panneaux de l'en-tête (missions, portefeuille, série / pity) */
export const CLOSE_X = '<button class="icon pop-x" aria-label="Fermer">✕</button>';
const openPanels = new Map<() => void, { pop: HTMLElement; opener: HTMLElement | null }>();
export function panelShown(pop: HTMLElement, close: () => void) {
  for (const c of [...openPanels.keys()]) if (c !== close) c();
  const f = document.activeElement as HTMLElement | null;
  // (même panneau rouvert par un autre bouton — série → pity — : le focus reviendra à ce dernier)
  const opener = f && f !== document.body && !pop.contains(f) ? f : (openPanels.get(close)?.opener ?? null);
  openPanels.set(close, { pop, opener });
  pop.inert = false;
  pushLayer(close);
  syncPanelTriggers();
  requestAnimationFrame(() => {
    if (openPanels.has(close) && !pop.contains(document.activeElement)) pop.querySelector<HTMLElement>('.pop-x, button, [href], input')?.focus({ preventScroll: true });
  });
}
export function panelHidden(pop: HTMLElement, close: () => void) {
  pop.inert = true;
  const o = openPanels.get(close);
  openPanels.delete(close);
  popLayer(close);
  syncPanelTriggers();
  if (!o) return;
  // le focus était dans le panneau (ou perdu) : il revient au bouton (refait entre-temps par l'en-tête ? on le retrouve)
  const a = document.activeElement;
  if (a && a !== document.body && !pop.contains(a)) return;
  const back = o.opener?.isConnected ? o.opener : pop.id ? document.querySelector<HTMLElement>(`[aria-controls="${pop.id}"]`) : null;
  back?.focus({ preventScroll: true });
}
/**
 * Message « pas connecté » (UX1-15) : en ligne, tant que le serveur n'a pas répondu, « Connexion au serveur… » (et non
 * « connecte-toi », qui fait croire qu'on a été déconnecté) ; ensuite, le texte + un vrai bouton (classe `login-cta`,
 * à brancher sur `backend.login()`). En démo : le texte seul.
 */
export function loginPrompt(b: { state: { mode: string; ready: boolean } }, text: string): string {
  if (b.state.mode === 'online' && !b.state.ready) return '<div class="muted login-wait">Connexion au serveur…</div>';
  return `<div class="muted">${esc(text)}</div>${b.state.mode === 'online' ? '<button class="btn-primary login-cta">Se connecter</button>' : ''}`;
}

/** Un panneau se redessine (données qui changent) : le focus clavier qui y était n'est pas perdu. */
export function keepFocus(root: HTMLElement, redraw: () => void) {
  const a = document.activeElement as HTMLElement | null;
  const cls = a && a !== root && root.contains(a) ? [...a.classList].map((c) => `.${CSS.escape(c)}`).join('') : null;
  redraw();
  if (cls !== null && !root.contains(document.activeElement)) (root.querySelector<HTMLElement>(cls || 'button') ?? root.querySelector<HTMLElement>('.pop-x'))?.focus({ preventScroll: true });
}
/** Ferme tous les panneaux de l'en-tête (changement de page). */
export const closePanels = () => [...openPanels.keys()].forEach((c) => c());
/** `aria-expanded` des boutons de l'en-tête (à rappeler quand l'en-tête est refait). */
export function syncPanelTriggers() {
  document.querySelectorAll<HTMLElement>('[aria-controls]').forEach((b) => {
    const pop = document.getElementById(b.getAttribute('aria-controls')!);
    if (!pop || !pop.matches('.missions-pop, .status-pop, .vol-pop')) return;
    // (le panneau du volume est refait avec l'en-tête : on le reconnaît à son id)
    const open = [...openPanels.values()].some((o) => o.pop === pop || o.pop.id === pop.id) &&(!b.dataset.which || b.dataset.which === pop.dataset.which);
    b.setAttribute('aria-expanded', String(open));
  });
}

/**
 * Bouton qui attend le serveur : une petite roue n'apparaît que si l'attente dépasse ~¼ s (pas de clignotement quand
 * la réponse est immédiate, mais jamais l'impression que le clic n'a rien fait sur un réseau lent).
 * Pendant l'attente le bouton est désactivé (`disabled` + `aria-busy`) : un double toucher ne relance pas la mutation
 * (audit UX4-01 : forge, roulette, duels, encaissements).
 *
 * Délai limite (`timeoutMs`, 15 s par défaut, 0 = aucun) : la roue s'arrête et un toast dit que le serveur ne répond pas.
 * La promesse d'origine n'est PAS rejetée : le client Convex garde la mutation en file et la rejouera à la reconnexion ;
 * rejeter ferait croire à un échec et inviterait à recliquer (= une 2e mutation en file, donc double brûlure / double
 * mise). Le bouton redevient touchable, mais tant que la 1re demande n'a pas abouti un toucher ne fait qu'afficher
 * « encore en route » (il ne relance rien). Quand la réponse arrive enfin, l'appelant continue normalement.
 */
export async function busyButton<T>(btn: HTMLElement, p: Promise<T>, o: { timeoutMs?: number } = {}): Promise<T> {
  // déjà en attente (appel imbriqué sur le même bouton) : on n'y touche pas
  if (btn.dataset.busy) return p;
  btn.dataset.busy = '1';
  const b = btn as HTMLButtonElement;
  const canDisable = 'disabled' in b;
  const was = canDisable ? b.disabled : false;
  if (canDisable) b.disabled = true;
  else btn.setAttribute('aria-disabled', 'true');
  btn.setAttribute('aria-busy', 'true');
  const t = setTimeout(() => btn.classList.add('loading'), 240);
  let swallow: ((e: Event) => void) | null = null;
  const limit = o.timeoutMs ?? 15000;
  const slow = limit
    ? setTimeout(() => {
        if (!btn.isConnected) return;
        btn.classList.remove('loading');
        btn.removeAttribute('aria-busy');
        if (canDisable) b.disabled = was;
        swallow = (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          toast('Ta demande est encore en route : elle partira dès que le serveur répond.', 'info');
        };
        btn.addEventListener('click', swallow, true);
        toast('Le serveur ne répond pas… Ta demande partira dès que la connexion revient : inutile de recliquer.', 'err');
      }, limit)
    : 0;
  try {
    return await p;
  } finally {
    clearTimeout(t);
    clearTimeout(slow);
    if (swallow) btn.removeEventListener('click', swallow, true);
    btn.classList.remove('loading');
    if (canDisable) b.disabled = was;
    else btn.removeAttribute('aria-disabled');
    btn.removeAttribute('aria-busy');
    delete btn.dataset.busy;
  }
}

/**
 * Petits messages en haut de l'écran, UN À LA FOIS dans une file (le suivant attend que le précédent ait été lu, au
 * lieu de l'écraser) ; reste plus longtemps s'il est long, se ferme d'un toucher. Les erreurs passent devant et sont
 * annoncées tout de suite (`role="alert"`), le reste poliment (`role="status"`).
 */
type Toast = { msg: string; kind: 'ok' | 'err' | 'info' };
const toastQ: Toast[] = [];
let toastCur: (Toast & { el: HTMLElement; at: number }) | null = null;
let toastTimer = 0;
const toastEls: Partial<Record<'status' | 'alert', HTMLElement>> = {};
/** affichage 4 à 6 s selon la longueur (réf. motion : toasts) */
const toastLife = (msg: string) => Math.min(6000, 4000 + msg.length * 25);
function toastEl(alert: boolean) {
  const k = alert ? 'alert' : 'status';
  let el = toastEls[k];
  if (!el) {
    el = toastEls[k] = h('div', 'toast');
    el.setAttribute('role', k);
    if (!alert) el.setAttribute('aria-live', 'polite');
    el.addEventListener('click', hideToast);
    document.body.append(el);
  }
  return el;
}
function hideToast() {
  if (!toastCur) return;
  clearTimeout(toastTimer);
  toastCur.el.classList.remove('on');
  toastCur = null;
  // le temps du fondu, puis le suivant
  toastTimer = window.setTimeout(nextToast, toastQ.length ? 260 : 0);
}
/** son des toasts (branché par main.ts : information = une note douce, erreur = deux notes descendantes, jamais de buzzer) */
export let toastSound: ((kind: 'ok' | 'err' | 'info') => void) | null = null;
export function setToastSound(f: typeof toastSound) {
  toastSound = f;
}
function nextToast() {
  const t = toastQ.shift();
  if (!t) return;
  const el = toastEl(t.kind === 'err');
  el.className = `toast ${t.kind} on`;
  toastSound?.(t.kind);
  el.textContent = t.msg;
  toastCur = { ...t, el, at: performance.now() };
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, toastLife(t.msg));
}
export function toast(msg: string, kind: 'ok' | 'err' | 'info' = 'info') {
  msg = fr(msg);
  // le même message est déjà affiché : petite secousse, et il reste un peu plus
  if (toastCur && toastCur.msg === msg) {
    const el = toastCur.el;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, toastLife(msg));
    return;
  }
  if (toastQ.some((t) => t.msg === msg)) return;
  // une erreur passe devant les messages en attente
  if (kind === 'err') toastQ.unshift({ msg, kind });
  else toastQ.push({ msg, kind });
  if (toastQ.length > 4) toastQ.splice(4); // pas d'accumulation : on garde les plus importants
  if (!toastCur) {
    if (!toastTimer || toastQ.length === 1) nextToast();
    return;
  }
  // un message attend : celui affiché se ferme plus tôt, mais après au moins ~1,6 s de lecture (une erreur : 0,8 s)
  const minRead = kind === 'err' ? 800 : 1600;
  const left = Math.max(0, minRead - (performance.now() - toastCur.at));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, left);
}

/**
 * Message d'erreur lisible. Les erreurs voulues du serveur (ConvexError) passent telles quelles ; une erreur technique
 * brute (« [CONVEX M(packs:preparePack)] [Request ID: …] Server Error ») devient une phrase, la cause va en console.
 */
export const errMsg = (e: unknown) => {
  const m = String((e as { data?: string; message?: string })?.data ?? (e as Error)?.message ?? String(e));
  if (/ConvexError:/.test(m)) return m.replace(/^[\s\S]*ConvexError:\s*/, '').replace(/\s*at [\s\S]*$/, '').trim();
  if (/\[CONVEX |\[Request ID|Server Error|Uncaught \w*Error/.test(m)) {
    console.warn(e);
    return 'Le serveur a refusé l’action, réessaie dans un instant.';
  }
  if (/Failed to fetch|NetworkError|WebSocket/i.test(m)) return 'Connexion au serveur impossible, réessaie dans un instant.';
  return m.replace(/^Uncaught Error:\s*/, '');
};

/** « 12 min », « 3 h 05 », « 5 j 11 h » (au-delà de 48 h : personne ne lit « 131 h 48 »). */
export function fmtDelay(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60000));
  if (m >= 2880) return `${Math.floor(m / 1440)} j ${Math.floor((m % 1440) / 60)} h`;
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}
