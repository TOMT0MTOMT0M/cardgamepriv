import { rarity, type RarityId } from '../core/rarity';
import { siteUrl } from '../core/siteRoot';
import { artPath, catalogEntry, hasArt, subthemeById, thumbPath, type CatalogEntry } from '../core/sets/themes';
import { jvThumbSvg } from '../core/art/jvTitle';
import { observeRealCard } from './cardImages';

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
    if (rr.tier >= 4) t.style.setProperty('--sd', `${(Math.random() * 7).toFixed(2)}s`); // éclats désynchronisés
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
 * Couche plein écran (visionneuse d'une carte) : le geste ou le bouton « retour » du téléphone la ferme, au lieu de
 * quitter la page. `pushLayer` à l'ouverture, `popLayer` quand on ferme soi-même (✕, Échap).
 */
let layerClose: (() => void) | null = null;
export function pushLayer(close: () => void) {
  if (layerClose) return void (layerClose = close); // déjà une entrée d'historique : on la réutilise
  layerClose = close;
  history.pushState({ bebouLayer: true }, '');
}
export function popLayer() {
  if (!layerClose) return;
  layerClose = null;
  // seulement si on est encore sur l'entrée de la couche (pas après un changement de page)
  if ((history.state as { bebouLayer?: boolean } | null)?.bebouLayer) history.back();
}
window.addEventListener('popstate', () => {
  const c = layerClose;
  layerClose = null;
  c?.();
});

/**
 * Bouton qui attend le serveur : une petite roue n'apparaît que si l'attente dépasse ~¼ s (pas de clignotement quand
 * la réponse est immédiate, mais jamais l'impression que le clic n'a rien fait sur un réseau lent).
 */
export async function busyButton<T>(btn: HTMLElement, p: Promise<T>): Promise<T> {
  const t = setTimeout(() => btn.classList.add('loading'), 240);
  try {
    return await p;
  } finally {
    clearTimeout(t);
    btn.classList.remove('loading');
  }
}

let toastTimer = 0;
/** Petit message en haut de l'écran ; reste plus longtemps s'il est long, se ferme d'un toucher. */
export function toast(msg: string, kind: 'ok' | 'err' | 'info' = 'info') {
  let el = document.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = h('div', 'toast');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.addEventListener('click', () => el!.classList.remove('on'));
    document.body.append(el);
  }
  msg = fr(msg);
  const again = el.classList.contains('on') && el.textContent === msg;
  el.className = `toast ${kind} on${again ? ' nudge' : ''}`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('on'), Math.min(6500, 2400 + msg.length * 40));
}

export const errMsg = (e: unknown) => {
  const m = (e as { data?: string; message?: string })?.data ?? (e as Error)?.message ?? String(e);
  return String(m).replace(/^.*ConvexError:\s*/, '').replace(/^Uncaught Error:\s*/, '');
};

export function fmtDelay(ms: number): string {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}
