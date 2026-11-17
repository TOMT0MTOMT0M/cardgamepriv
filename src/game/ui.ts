import { errText } from '../core/errors';
import { fmtNum, lang, t as tr, type MsgKey } from '../core/i18n';
import { rarity, type RarityId } from '../core/rarity';
import { siteUrl } from '../core/siteRoot';
import { artPath, catalogEntry, hasArt, isWonderId, subthemeById, thumbPath, wonderCapturePath, type CatalogEntry } from '../core/sets/themes';
import { jvThumbSvg } from '../core/art/jvTitle';
import { observeRealCard } from './cardImages';
import { haptics } from '../core/haptics';
import { DUR, EASING, SPRING } from '../core/motion';
import { Spring } from '../core/ease';
import { morphSwap, stopSwap } from '../core/morph';
import type { GameBackend } from './backend';
import { canReplayMythic, replayMythic } from './mythic';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/**
 * (version anglaise) Éléments durables (créés une fois, jamais refaits) : `data-t="clé"` (texte), `data-t-title`,
 * `data-t-aria` — `relabel()` les remet dans la nouvelle langue au changement (main.ts, onLang).
 */
export function relabel(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-t]').forEach((e) => {
    // (le texte seulement : une pastille <b> dans le bouton reste)
    const v = tr(e.dataset.t as MsgKey);
    if (v === e.dataset.t) return; // (v2.0.1) pas une clé connue : on ne remplace jamais un texte par sa clé brute
    const tn = [...e.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
    if (tn) tn.textContent = v;
    else if (!e.children.length) e.textContent = v;
  });
  root.querySelectorAll<HTMLElement>('[data-t-title]').forEach((e) => (e.title = tr(e.dataset.tTitle as MsgKey)));
  root.querySelectorAll<HTMLElement>('[data-t-aria]').forEach((e) => e.setAttribute('aria-label', tr(e.dataset.tAria as MsgKey)));
}

/** ★★★☆☆☆ (la secrète : le sceau ✷). */
export function starsHtml(r: RarityId): string {
  const rr = rarity(r);
  if (rr.secret) return `<span class="stars secret">${tr('rarity.secretStamp')}</span>`;
  const n = rr.rank + 1;
  return `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(6 - n)}</i></span>`;
}

/** 2020 → « 2 020 » (espace insécable : l'espace fine n'existe pas dans la police des titres). */
// (version anglaise) en français, inchangé (« 12 345 », espace insécable) ; en anglais « 12,345 »
export const fmtN = (n: number) => (lang() === 'fr' ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') : fmtNum(Math.round(n)));
/** Nombre à une décimale au plus, dans la langue (« 12,5 » / « 12.5 »). */
export const fmtDec = (n: number) => (lang() === 'fr' ? String(n).replace('.', ',') : String(n));

/** Pourcentage à la française : « 9,3 % », « 42 % » (une décimale sous 10 %). */
// (version anglaise) « 2,5 % » / « 2.5% »
export const fmtPct = (p: number) => (lang() === 'fr' ? `${p > 0 && p < 10 ? p.toFixed(1).replace('.', ',') : Math.floor(p)}\u00a0%` : `${p > 0 && p < 10 ? p.toFixed(1) : Math.floor(p)}%`);

/** Recherche sans accents ni majuscules : « pokemon » trouve « Pokémon », « hericendre » trouve « Héricendre ». */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Typographie française : espace insécable avant ! ? : ; » et après « (« Encore un ! » ne se coupe jamais avant le
 * point d'exclamation). Pour du texte seulement, pas pour du HTML avec attributs.
 */
export const fr = (s: string) => s.replace(/ ([!?:;»])/g, ' $1').replace(/« /g, '« ');

/** « 1 doublon », « 2 doublons » */
/**
 * « 3 boosters » : nombre + mot accordé. (version anglaise) Le mot français sert de clé : `plural.<mot>` (fr.ts / en.ts)
 * donne les deux formes dans la langue active ; un mot sans clé reste en français.
 */
export const plural = (n: number, one: string, many = `${one}s`) => {
  const k = `plural.${one}` as MsgKey;
  if (lang() !== 'fr' && tr(k) !== k) return tr(k, { n: fmtN(n) });
  return `${fmtN(n)} ${n > 1 ? many : one}`;
};

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
export const thumbUrl = (e: CatalogEntry) =>
  isWonderId(e.id) ? siteUrl(wonderCapturePath(e.id)) : hasArt(e) ? siteUrl(thumbPath(e)) : jvThumbSvg(e.name, subthemeById(e.subthemeId)?.label ?? '');
export const artUrl = (e: CatalogEntry) => siteUrl(artPath(e));

/**
 * (V2 fluidité, lot 2) la miniature d'une tuile n'apparaît jamais d'un coup : fondu à son arrivée (style.css,
 * `.tile .art img.in`). Une miniature déjà vue dans la session est posée directement (pas de fondu rejoué à chaque page).
 */
const thumbSeen = new Set<string>();
if (typeof document !== 'undefined') {
  document.addEventListener(
    'load',
    (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLImageElement) || !t.parentElement?.classList.contains('art')) return;
      thumbSeen.add(t.getAttribute('src') ?? '');
      t.classList.add('in');
    },
    true,
  );
}

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
  // (07/11) plus de numéro de catalogue sur les tuiles (16 795… : du bruit) ; carte pas encore trouvée = sa propre
  // illustration floutée et assombrie, avec un cadenas (avant : aplat noir à 35 % → un carré gris vide)
  // une carte Bébou non possédée ne se montre pas (thème secret)
  const hideArt = !owned && rr.secret;
  t.innerHTML = `
    <div class="art">${hideArt || !e ? '<span class="q">?</span>' : `<img${thumbSeen.has(thumbUrl(e)) ? ' class="in"' : ''} loading="lazy" decoding="async" alt="" src="${thumbUrl(e)}">${owned ? '' : `<span class="lock"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span>`}`}</div>
    <div class="meta">${starsHtml(r)}</div>
    <div class="name">${hideArt ? '???' : esc(e?.name ?? cardId)}</div>
    ${o.count && o.count > 1 ? `<span class="count">×${o.count}</span>` : ''}
    ${o.label ? `<span class="badge">${esc(o.label)}</span>` : ''}`;
  // (le `load` d'une image pas encore dans la page n'atteint pas l'écouteur du document : on écoute aussi ici)
  const im = t.querySelector<HTMLImageElement>('.art img');
  if (im && !im.classList.contains('in')) {
    if (im.complete && im.naturalWidth) im.classList.add('in');
    else im.addEventListener('load', () => (thumbSeen.add(im.getAttribute('src') ?? ''), im.classList.add('in')), { once: true });
  }
  if (!owned) t.title = hideArt ? tr('card.secret') : tr('card.notFound', { name: e?.name ?? cardId });
  if (owned && e) {
    t.title = `${e.name} · ${rr.label}${o.fresh ? tr('card.newSince') : ''}`;
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
const lessMotion = matchMedia('not all');
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
export const CLOSE_X = () => `<button class="icon pop-x" aria-label="${tr('common.close')}">✕</button>`;
const openPanels = new Map<() => void, { pop: HTMLElement; opener: HTMLElement | null }>();
/** Panneaux de l'en-tête qui se transforment l'un en l'autre (V3, lot 05 : morph.ts `morphSwap`). */
const SWAP_SEL = '.missions-pop, .status-pop';
export function panelShown(pop: HTMLElement, close: () => void) {
  const closeOthers = () => {
    for (const c of [...openPanels.keys()]) if (c !== close) c();
  };
  // (V3, lot 05) on passe directement d'une pilule à l'autre (Missions → Solde → Série) : une seule boîte glisse et se
  // redimensionne (au lieu de fermer l'un et d'ouvrir l'autre) ; le voile, déjà là, ne refait pas son fondu
  const prev = pop.matches(SWAP_SEL) ? [...openPanels.entries()].find(([c, o]) => c !== close && o.pop !== pop && o.pop.matches(SWAP_SEL)) : undefined;
  if (prev) {
    morphSwap(prev[1].pop, pop, closeOthers);
    document.querySelectorAll<HTMLElement>('.um-veil.on').forEach((v) => v.getAnimations().forEach((x) => x.finish()));
  } else closeOthers();
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
  stopSwap(pop); // (fermé pendant qu'il se transformait : tout reprend sa place, sa fermeture normale joue)
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
  if (b.state.mode === 'online' && !b.state.ready) return '<div class="muted login-wait">' + tr('net.connecting') + '</div>';
  return `<div class="muted">${esc(text)}</div>${b.state.mode === 'online' ? '<button class="btn-primary login-cta">' + tr('auth.login') + '</button>' : ''}`;
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
          toast(tr('net.pending'), 'info');
        };
        btn.addEventListener('click', swallow, true);
        toast(tr('net.noAnswer'), 'err');
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

// ───────────────────────────── TOASTS
/**
 * (V3, lot 13) Toasts EMPILÉS : jusqu'à 3 cartes visibles l'une sous l'autre (la plus ancienne en haut, elle part la
 * première). Quand l'une disparaît, les autres glissent à leur nouvelle place (FLIP : on mesure avant, on laisse la
 * mise en page se refaire, puis on joue le déplacement inverse — durées et courbes de motion.ts). Une carte se ferme
 * aussi d'un glissement du doigt (de côté ou vers le haut) : au-delà d'un seuil de distance ou, plus court mais lancé,
 * d'une vitesse, elle part dans le sens du geste ; sinon elle revient par un ressort (SPRING.carte). Un appui court
 * la ferme comme avant. Les lecteurs d'écran passent par deux zones fixes (état / alerte) : les cartes sont muettes.
 */
type ToastKind = 'ok' | 'err' | 'info';
type Toast = { msg: string; kind: ToastKind };
interface ToastItem extends Toast {
  el: HTMLElement;
  at: number;
  timer: number;
  /** pendant un glissement ou un retour : le minuteur est suspendu */
  busy: boolean;
  gone: boolean;
}
/** cartes visibles (haut → bas) */
const toasts: ToastItem[] = [];
/** en attente : une place se libère, la suivante entre */
const toastQ: Toast[] = [];
const TOAST_VISIBLE = 3;
const TOAST_QUEUE = 4;
let toastBox: HTMLElement | null = null;
const toastSr: Partial<Record<'status' | 'alert', HTMLElement>> = {};
/** affichage 4 à 6 s selon la longueur (réf. motion : toasts) */
const toastLife = (msg: string) => Math.min(6000, 4000 + msg.length * 25);
/** son des toasts (branché par main.ts : information = une note douce, erreur = deux notes descendantes, jamais de buzzer) */
export let toastSound: ((kind: ToastKind) => void) | null = null;
export function setToastSound(f: typeof toastSound) {
  toastSound = f;
}
function toastRoot() {
  if (toastBox) return toastBox;
  toastBox = h('div', 'toasts');
  for (const k of ['status', 'alert'] as const) {
    const sr = (toastSr[k] = h('div', 'sr-only'));
    sr.setAttribute('role', k);
    if (k === 'status') sr.setAttribute('aria-live', 'polite');
    toastBox.append(sr);
  }
  document.body.append(toastBox);
  return toastBox;
}
/** FLIP : les cartes restantes glissent de leur ancienne place à la nouvelle */
function toastFlip(first: Map<HTMLElement, number>) {
  for (const [el, top] of first) {
    const dy = top - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: DUR.emphatique(), easing: EASING.standard });
  }
}
const toastTops = () => new Map(toasts.map((t) => [t.el, t.el.getBoundingClientRect().top] as const));
function toastArm(t: ToastItem, ms: number) {
  clearTimeout(t.timer);
  t.timer = window.setTimeout(() => hideToast(t), ms);
}
/** la carte quitte la pile ; `leave` joue sa sortie (par défaut : fondu + remontée), les autres se recalent en FLIP */
function hideToast(t: ToastItem, leave?: (el: HTMLElement) => Animation | null) {
  if (t.gone) return;
  t.gone = true;
  clearTimeout(t.timer);
  const first = toastTops();
  const i = toasts.indexOf(t);
  if (i >= 0) toasts.splice(i, 1);
  const el = t.el;
  // sortie de la mise en page tout de suite (les autres remontent), la carte finit son effet sur place
  el.style.top = `${el.offsetTop}px`;
  el.style.left = `${el.offsetLeft}px`;
  el.style.width = `${el.offsetWidth}px`;
  el.classList.add('out');
  el.classList.remove('on');
  toastFlip(first);
  const a = leave?.(el) ?? null;
  const done = () => el.remove();
  if (a) a.finished.then(done, done);
  else window.setTimeout(done, DUR.emphatique() + 60);
  // une place s'est libérée
  const nx = toastQ.shift();
  if (nx) showToast(nx);
}
function showToast(m: Toast) {
  const box = toastRoot();
  const el = h('div', `toast ${m.kind}`);
  el.setAttribute('aria-hidden', 'true');
  el.textContent = m.msg;
  const t: ToastItem = { ...m, el, at: performance.now(), timer: 0, busy: false, gone: false };
  toasts.push(t);
  box.append(el);
  void el.offsetWidth; // l'état de départ est posé : la transition d'entrée part de là
  el.classList.add('on');
  toastSound?.(m.kind);
  // lecteurs d'écran : on vide puis on remplit (même texte répété = relu)
  const sr = toastSr[m.kind === 'err' ? 'alert' : 'status']!;
  sr.textContent = '';
  window.setTimeout(() => (sr.textContent = m.msg), 30);
  toastArm(t, toastLife(m.msg));
  el.addEventListener('click', () => {
    if (!dragMoved) hideToast(t);
  });
  toastGesture(t);
}

// glissement du doigt
let dragMoved = false;
/** distance (px) et vitesse projetée au-delà desquelles un glissement ferme la carte */
const SWIPE_DIST = 80;
const SWIPE_UP = 48;
/** la vitesse (px/ms) est projetée sur ce temps : un geste court mais lancé ferme aussi */
const SWIPE_FLING_MS = 100;
function toastGesture(t: ToastItem) {
  const el = t.el;
  let id = -1;
  let x0 = 0;
  let y0 = 0;
  let dx = 0;
  let dy = 0;
  const pts: Array<{ x: number; y: number; t: number }> = [];
  let spring: { x: Spring; y: Spring; raf: number } | null = null;
  const view = () => {
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / (el.offsetWidth * 1.4)));
  };
  const stopSpring = () => {
    if (spring) cancelAnimationFrame(spring.raf);
    spring = null;
  };
  const velocity = () => {
    // sur les ~80 dernières ms
    const last = pts[pts.length - 1];
    const ref = pts.find((p) => last.t - p.t <= 80) ?? pts[0];
    const dt = Math.max(1, last.t - ref.t);
    return { vx: (last.x - ref.x) / dt, vy: (last.y - ref.y) / dt };
  };
  el.addEventListener('pointerdown', (e) => {
    if (t.gone || id !== -1 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stopSpring();
    id = e.pointerId;
    x0 = e.clientX - dx;
    y0 = e.clientY - dy;
    pts.length = 0;
    pts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    dragMoved = false;
    t.busy = true;
    clearTimeout(t.timer);
    el.classList.add('drag');
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    pts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (pts.length > 12) pts.shift();
    dx = e.clientX - x0;
    dy = e.clientY - y0;
    if (dy > 0) dy *= 0.2; // vers le bas : ça résiste
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragMoved = true;
    if (dragMoved) view();
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    if (!dragMoved) {
      el.classList.remove('drag');
      t.busy = false;
      toastArm(t, Math.max(1600, toastLife(t.msg) / 2)); // un appui court : le clic ferme
      window.setTimeout(() => (dragMoved = false), 0);
      return;
    }
    window.setTimeout(() => (dragMoved = false), 0); // (le clic qui suit un glissement ne ferme pas)
    const { vx, vy } = e.type === 'pointercancel' ? { vx: 0, vy: 0 } : velocity();
    const projX = dx + vx * SWIPE_FLING_MS;
    const projY = dy + vy * SWIPE_FLING_MS;
    const sideways = Math.abs(dx) > 12 && Math.abs(projX) >= SWIPE_DIST;
    const up = dy < -8 && projY <= -SWIPE_UP;
    if (e.type !== 'pointercancel' && (sideways || up)) {
      el.classList.remove('drag');
      haptics.pulse(6);
      const fx = sideways ? Math.sign(projX) * (innerWidth + el.offsetWidth) : dx;
      const fy = sideways ? dy : -(el.offsetHeight + 80);
      hideToast(t, (n) => {
        n.style.transform = '';
        n.style.opacity = '';
        return n.animate(
          [{ transform: `translate(${dx}px, ${dy}px)`, opacity: Math.max(0.25, 1 - Math.abs(dx) / (n.offsetWidth * 1.4)) }, { transform: `translate(${fx}px, ${fy}px)`, opacity: 0 }],
          { duration: DUR.standard(), easing: EASING.sortie, fill: 'forwards' },
        );
      });
      return;
    }
    // trop court : retour élastique (ressort de la carte, avec l'élan du doigt)
    const sx = new Spring(dx, SPRING.carte.stiffness, SPRING.carte.damping);
    const sy = new Spring(dy, SPRING.carte.stiffness, SPRING.carte.damping);
    sx.target = sy.target = 0;
    sx.impulse(vx * 1000);
    sy.impulse(vy * 1000);
    spring = { x: sx, y: sy, raf: 0 };
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      dx = sx.update(dt);
      dy = sy.update(dt);
      if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4 && Math.abs(sx.velocity) < 8 && Math.abs(sy.velocity) < 8) {
        dx = dy = 0;
        el.style.transform = '';
        el.style.opacity = '';
        el.classList.remove('drag'); // (`drag` coupe les transitions CSS tant que le doigt ou le ressort pilote la carte)
        spring = null;
        t.busy = false;
        if (!t.gone) toastArm(t, Math.max(1600, toastLife(t.msg) / 2));
        return;
      }
      view();
      spring!.raf = requestAnimationFrame(step);
    };
    spring.raf = requestAnimationFrame(step);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

export function toast(msg: string, kind: ToastKind = 'info') {
  msg = fr(msg);
  // le même message est déjà affiché : petite secousse, et il reste un peu plus
  const same = toasts.find((t) => t.msg === msg && !t.gone);
  if (same) {
    same.el.classList.remove('nudge');
    void same.el.offsetWidth;
    same.el.classList.add('nudge');
    if (!same.busy) toastArm(same, toastLife(msg));
    return;
  }
  if (toastQ.some((t) => t.msg === msg)) return;
  if (toasts.length < TOAST_VISIBLE) {
    showToast({ msg, kind });
    return;
  }
  // la pile est pleine : le message attend (une erreur passe devant), la plus ancienne carte se ferme après ~1,6 s de lecture
  if (kind === 'err') toastQ.unshift({ msg, kind });
  else toastQ.push({ msg, kind });
  if (toastQ.length > TOAST_QUEUE) toastQ.splice(TOAST_QUEUE); // pas d'accumulation : on garde les plus importants
  const old = toasts.find((t) => !t.busy);
  if (old) toastArm(old, Math.max(0, (old.kind === 'err' ? 800 : 1600) - (performance.now() - old.at)));
}

/**
 * Message d'erreur lisible. Les erreurs voulues du serveur (ConvexError) passent telles quelles ; une erreur technique
 * brute (« [CONVEX M(packs:preparePack)] [Request ID: …] Server Error ») devient une phrase, la cause va en console.
 */
export const errMsg = (e: unknown) => {
  const m = String((e as { data?: string; message?: string })?.data ?? (e as Error)?.message ?? String(e));
  // (version anglaise, lot 4) erreurs à code : le repère ⟦code⟧ est retiré, et traduit en anglais (core/errors.ts)
  if (/ConvexError:/.test(m)) return errText(m.replace(/^[\s\S]*ConvexError:\s*/, '').replace(/\s*⟧[\s\S]*$/, '⟧').replace(/\s*at [^⟦]*$/, '').trim());
  if (/\[CONVEX |\[Request ID|Server Error|Uncaught \w*Error/.test(m)) {
    console.warn(e);
    return tr('net.refused');
  }
  if (/Failed to fetch|NetworkError|WebSocket/i.test(m)) return tr('net.unreachable');
  return errText(m.replace(/^Uncaught Error:\s*/, ''));
};

/** « 12 min », « 3 h 05 », « 5 j 11 h » (au-delà de 48 h : personne ne lit « 131 h 48 »). */
export function fmtDelay(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60000));
  if (m >= 2880) return `${Math.floor(m / 1440)} j ${Math.floor((m % 1440) / 60)} h`;
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

// ───────────────────────────────────────────── « Image à revoir » (07/11)
/**
 * Bouton de signalement d'une image buguée ou absente, dans TOUTES les visionneuses (collection, profil, échanges,
 * contrats, zoom de l'ouverture) : un tap = une suggestion « design » sur la carte, pour la file de Tom et Hugo.
 * Déjà signalée sur cet appareil (localStorage) → bouton « Image signalée ✓ », pas de doublon.
 */
const IMG_REPORTED_KEY = 'bebou.imgReported';
const imgReported = new Set<string>();
try {
  for (const id of JSON.parse(localStorage.getItem(IMG_REPORTED_KEY) ?? '[]') as string[]) imgReported.add(id);
} catch {
  /* stockage indisponible */
}
export function imageReportButton(backend: GameBackend, cardId: string, page: string): HTMLElement {
  const b = reportButton(backend, cardId, page);
  // (08/11) 6★ avec une scène de famille : « Rejouer » juste à côté, dans toutes les visionneuses
  if (!canReplayMythic(cardId)) return b;
  const wrap = h('span', 'va-pair');
  wrap.style.display = 'contents';
  const r = h('button', 'va va-replay');
  r.title = tr('card.replay');
  r.innerHTML = `▶ <span>${tr('card.replayShort')}</span>`;
  r.addEventListener('click', (ev) => {
    ev.stopPropagation();
    haptics.pulse(8);
    replayMythic(cardId);
  });
  wrap.append(r, b);
  return wrap;
}
function reportButton(backend: GameBackend, cardId: string, page: string): HTMLElement {
  const done = imgReported.has(cardId);
  const b = h('button', `va va-img${done ? ' on' : ''}`);
  b.title = done ? tr('img.alreadyReported') : tr('img.reportTitle');
  b.setAttribute('aria-pressed', String(done));
  b.innerHTML = `🖼 <span>${done ? tr('img.reported') : tr('img.report')}</span>`;
  b.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (imgReported.has(cardId)) return toast(tr('img.alreadyToast'), 'info');
    haptics.pulse(8);
    try {
      await backend.submitSuggestion({ kind: 'design', cardId, text: tr('img.reportLabel', { name: catalogEntry(cardId)?.name ?? cardId }), page }, null);
      imgReported.add(cardId);
      try {
        localStorage.setItem(IMG_REPORTED_KEY, JSON.stringify([...imgReported]));
      } catch {
        /* stockage indisponible */
      }
      toast(tr('img.reportedToast'), 'ok');
      b.classList.add('on');
      b.setAttribute('aria-pressed', 'true');
      b.title = tr('img.alreadyReported');
      b.querySelector('span')!.textContent = tr('img.reported');
    } catch (err) {
      toast(errMsg(err), 'err');
    }
  });
  return b;
}
