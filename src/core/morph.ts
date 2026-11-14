/**
 * MORPH — ce qui change de taille ou de place bouge au lieu de sauter (V2, 08/11 : « ajoute des animations pour les
 * éléments qui se resize, panneau qui apparaît ou autre »).
 *
 *  - `morph(el)` : la HAUTEUR d'un bloc suit son contenu en douceur. Un ResizeObserver repère le nouveau gabarit
 *    (après la mise en page, avant l'affichage) et anime de l'ancienne hauteur vers la nouvelle : un panneau qui se
 *    redessine (mise de la roulette, portefeuille qui déplie l'historique, verdict qui arrive…) se déplie / se replie,
 *    et tout ce qui est en dessous glisse avec lui.
 *  - `installMorph()` : branche `morph` automatiquement sur tout ce qui correspond à `MORPH_SEL` (et `[data-morph]`),
 *    même ajouté plus tard.
 *  - `flip(items, mutate)` : réordonnancement animé (First-Last-Invert-Play) — classement en direct de la Battle Royale.
 *  - `leave(el)` : joue l'animation de sortie (classe `is-leaving`) avant de retirer un calque.
 *  - `rollNumber(el, from, to, fmt)` : compteur qui roule (solde, pot, totaux d'étoiles).
 *
 * Jetons : src/core/motion.ts (durées mobile ≈ +20 %, courbes M3). Mouvement réduit : tout est instantané.
 */
import { EASING, reducedMotion } from './motion';
import { clamp, easeOutExpo } from './ease';

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const CLIP = typeof CSS !== 'undefined' && CSS.supports?.('overflow', 'clip') ? 'clip' : 'hidden';

/** Blocs qui se déplient tout seuls (hors [data-morph]) : panneaux de l'en-tête, panneaux et salles de l'espace Jeux, contrats. */
export const MORPH_SEL = '[data-morph], .missions-pop, .status-pop, .gm-panel, .gm-ed-host, .gm-verdict, .gm-room, .ct-sheet';
/** Blocs qui APPARAISSENT (vide → contenu) : ils se déplient depuis 0 au lieu de surgir. */
const REVEAL_SEL = '[data-morph="reveal"], .gm-ed-host, .gm-verdict';

interface MorphState {
  h: number | null;
  anim: Animation | null;
}
const states = new WeakMap<Element, MorphState>();

/** Durée d'un dépliage selon l'amplitude : 220 ms pour quelques pixels → 520 ms pour un grand panneau. */
const morphDur = (dh: number) => Math.round(clamp(200 + Math.abs(dh) * 0.55, 220, 520) * (coarse() ? 1.12 : 1));

function hiddenNow(el: HTMLElement): boolean {
  if (document.hidden) return true;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return true;
  const r = el.getBoundingClientRect();
  return r.bottom < -40 || r.top > innerHeight + 40;
}

function play(el: HTMLElement, st: MorphState, from: number, to: number) {
  const ov = el.style.overflow;
  const needClip = getComputedStyle(el).overflowY === 'visible';
  if (needClip) el.style.overflow = CLIP;
  const duration = morphDur(to - from);
  const a = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing: to > from ? EASING.entree : EASING.standard });
  // apparition depuis rien : le contenu monte en fondu pendant que le bloc se déplie
  if (from < 1) el.animate([{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], { duration: duration * 0.9, delay: duration * 0.12, easing: EASING.standard, fill: 'backwards' });
  st.anim = a;
  const done = () => {
    if (st.anim !== a) return;
    st.anim = null;
    if (needClip) el.style.overflow = ov;
    if (!el.isConnected) return;
    // le contenu a pu changer PENDANT l'animation : on rattrape la vraie hauteur
    const real = el.getBoundingClientRect().height;
    const last = st.h ?? real;
    st.h = real;
    if (Math.abs(real - last) > 2 && !reducedMotion() && !hiddenNow(el)) play(el, st, last, real);
  };
  a.addEventListener('finish', done);
  a.addEventListener('cancel', done);
}

let ro: ResizeObserver | null = null;
const getRO = () =>
  (ro ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const el = e.target as HTMLElement;
      const st = states.get(el);
      if (!st || st.anim) continue; // (pendant l'animation, les tailles lues sont celles de l'animation)
      const nh = e.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
      const from = st.h;
      st.h = nh;
      // première mesure, apparition depuis 0 (page qui s'affiche), petit écart, mouvement réduit : on enregistre seulement
      if (from === null || nh < 1 || Math.abs(nh - from) < 3 || reducedMotion()) continue;
      if (from < 1 && !el.matches(REVEAL_SEL)) continue;
      if (hiddenNow(el)) continue;
      play(el, st, from, nh);
    }
  }));

/** La hauteur de `el` suit désormais son contenu en douceur. Renvoie le débranchement. */
export function morph(el: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined' || states.has(el)) return () => {};
  states.set(el, { h: null, anim: null });
  getRO().observe(el);
  return () => unmorph(el);
}
function unmorph(el: Element) {
  if (!states.has(el)) return;
  states.get(el)?.anim?.cancel();
  states.delete(el);
  ro?.unobserve(el);
}

/** Branche `morph` sur tout `MORPH_SEL`, présent et à venir (un seul MutationObserver pour toute l'appli). */
export function installMorph(root: HTMLElement = document.body): void {
  if (typeof MutationObserver === 'undefined') return;
  const scan = (n: Node, on: boolean) => {
    if (!(n instanceof HTMLElement) || n.classList.contains('tile')) return;
    const f = on ? (e: HTMLElement) => void morph(e) : (e: Element) => (!e.isConnected ? unmorph(e) : undefined);
    if (n.matches(MORPH_SEL)) f(n);
    if (n.firstElementChild) n.querySelectorAll<HTMLElement>(MORPH_SEL).forEach(f);
    if (on) {
      if (n.matches('.seg')) segIndicator(n);
      if (n.firstElementChild) n.querySelectorAll<HTMLElement>('.seg').forEach(segIndicator);
    }
  };
  scan(root, true);
  new MutationObserver((list) => {
    for (const m of list) {
      m.addedNodes.forEach((n) => scan(n, true));
      m.removedNodes.forEach((n) => scan(n, false));
    }
  }).observe(root, { childList: true, subtree: true });
}

/**
 * Réordonnancement animé : mesure `items`, applique `mutate` (ordre, classes…), puis chaque élément glisse de son
 * ancienne place à la nouvelle.
 */
export function flip(items: HTMLElement[], mutate: () => void, o: { duration?: number; easing?: string } = {}): void {
  if (reducedMotion()) return mutate();
  const first = new Map(items.map((e) => [e, e.getBoundingClientRect()]));
  mutate();
  for (const e of items) {
    const a = first.get(e)!;
    const b = e.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    e.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: o.duration ?? (coarse() ? 520 : 440), easing: o.easing ?? EASING.entree });
  }
}

/** Joue la sortie de `el` (classe `is-leaving` → animation CSS) puis résout ; `ms` = filet de sécurité. */
export function leave(el: HTMLElement, ms = 320): Promise<void> {
  if (reducedMotion() || !el.isConnected) return Promise.resolve();
  return new Promise((res) => {
    let t = 0;
    const end = (e?: Event) => {
      if (e && e.target !== el) return;
      clearTimeout(t);
      el.removeEventListener('animationend', end);
      res();
    };
    el.addEventListener('animationend', end);
    t = window.setTimeout(end, ms + 80);
    el.classList.add('is-leaving');
  });
}

const rolls = new WeakMap<Element, number>();
/** Compteur qui roule de `from` à `to` (easeOutExpo) ; un nouvel appel reprend là où le précédent en était. */
export function rollNumber(el: HTMLElement, from: number, to: number, fmt: (n: number) => string = (n) => String(Math.round(n)), ms = 700): void {
  cancelAnimationFrame(rolls.get(el) ?? 0);
  if (from === to || reducedMotion()) return void (el.textContent = fmt(to));
  const t0 = performance.now();
  const step = (t: number) => {
    const k = easeOutExpo(clamp((t - t0) / ms));
    el.textContent = fmt(from + (to - from) * k);
    if (k < 1) rolls.set(el, requestAnimationFrame(step));
  };
  rolls.set(el, requestAnimationFrame(step));
}

/**
 * Contrôles segmentés (`.seg`, partout dans l'appli) : la pastille de l'onglet actif GLISSE d'un onglet à l'autre (et
 * s'étire à sa largeur) au lieu de sauter. Une pastille `i.seg-ind` est posée derrière les boutons ; elle suit le bouton
 * `.on` (ou `aria-checked="true"`). Un contrôle refait à neuf (innerHTML) avec le même `data-seg-key` repart de la place
 * de l'ancien : l'onglet glisse même quand la page redessine tout l'en-tête.
 */
type Box = { x: number; y: number; w: number; h: number };
const segDone = new WeakSet<HTMLElement>();
const segLast = new Map<string, Box>();
function segIndicator(seg: HTMLElement) {
  if (segDone.has(seg)) return;
  segDone.add(seg);
  let ind: HTMLElement | null = null;
  let last: Box | null = seg.dataset.segKey ? segLast.get(seg.dataset.segKey) ?? null : null;
  const place = (animate: boolean) => {
    if (!seg.isConnected) return;
    if (!ind || ind.parentElement !== seg) {
      ind = document.createElement('i');
      ind.className = 'seg-ind';
      ind.setAttribute('aria-hidden', 'true');
      seg.prepend(ind);
      seg.classList.add('has-ind');
    }
    const on = seg.querySelector<HTMLElement>(':scope > button.on, :scope > button[aria-checked="true"], :scope > a.on');
    if (!on || !on.offsetWidth) return void (ind.style.opacity = '0');
    const b: Box = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const s = ind.style;
    // la pastille prend le fond que l'onglet actif aurait eu (blanc plein ici, voile gris là) : on le lit une fois,
    // sans la règle qui le rend transparent
    seg.classList.add('ind-measure');
    const cs = getComputedStyle(on);
    const bg = cs.backgroundColor;
    const bgi = cs.backgroundImage;
    seg.classList.remove('ind-measure');
    const clear = (bgi === 'none' || !bgi) && /^rgba\(0, 0, 0, 0\)$|^transparent$/.test(bg);
    s.background = clear ? '' : `${bgi !== 'none' ? `${bgi}, ` : ''}${bg}`;
    s.opacity = '1';
    s.width = `${b.w}px`;
    s.height = `${b.h}px`;
    s.transform = `translate(${b.x}px, ${b.y}px)`;
    if (animate && last && (Math.abs(last.x - b.x) > 1 || Math.abs(last.w - b.w) > 1) && !reducedMotion()) {
      ind.animate(
        [
          { transform: `translate(${last.x}px, ${last.y}px)`, width: `${last.w}px`, height: `${last.h}px` },
          { transform: s.transform, width: s.width, height: s.height },
        ],
        { duration: coarse() ? 420 : 360, easing: EASING.entree },
      );
    }
    last = b;
    if (seg.dataset.segKey) segLast.set(seg.dataset.segKey, b);
  };
  place(true);
  new MutationObserver((ms) => {
    // (nos propres changements — pastille ajoutée, classes posées sur le contrôle lui-même — ne relancent rien)
    if (ms.every((m) => (m.type === 'attributes' && m.target === seg) || (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every((x) => x === ind)))) return;
    place(true);
  }).observe(seg, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-checked'] });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => place(false)).observe(seg);
}
