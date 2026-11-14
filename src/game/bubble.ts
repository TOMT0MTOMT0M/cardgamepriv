/**
 * BULLES DE NOTIFICATION ANIMÉES (V2, docs/IDEES-V2.md §1 bis) — un seul composant pour TOUTES les pastilles du jeu
 * (Échanges, Succès, Amis, Suggestions, Missions, Portefeuille, Profil, nouvelles cartes, onglets des échanges…).
 *
 * Rien à changer dans les pages : un observateur regarde les pastilles (sélecteur ci-dessous) et réagit à ce qu'elles
 * font déjà — `hidden` retiré → la bulle GRANDIT (échelle 0 → 1,1 → 1, écrasement cartoon, 420 ms) ; le nombre change →
 * petit « bump » et le chiffre roule ; `hidden` posé ou pastille retirée → elle ÉCLATE comme une bulle de savon
 * (gonfle 1 → 1,25 avec un reflet, pop, 6–8 gouttelettes en étoile + un anneau, dans sa couleur, ≈ 350 ms).
 * Plusieurs bulles en même temps : décalage de 60 ms. « Effets réduits » / mouvement réduit : simple fondu.
 * Tout en Web Animations API (pas de reflow) ; l'éclatement se joue sur un calque fixe au-dessus de tout, à la dernière
 * position connue de la pastille (mesurée à chaque apparition / changement).
 */
import { reducedMotion } from '../core/motion';

// (audit 12/11, décision 1 de Tom / E2-03) les étiquettes des tuiles de cartes (`.tile .badge` : ×N, NEW…) ne sont plus
// des bulles : une grille de 50 doublons faisait éclater 50 bulles (et leurs sons) au moindre re-rendu. Menus inchangés.
const SELECTOR = '.badge:not(.tile .badge), .msn-n, .w-dot, .u-dot, .fr-n, .pf-new-dot, .fresh-badge, .nb-dot';
const EASE_OUT_BACK = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

interface Info {
  rect: DOMRect;
  color: string;
  text: string;
  visible: boolean;
}
const info = new WeakMap<Element, Info>();
let popAt = 0;
/** son « pop » (branché par main.ts sur les effets du jeu) */
export let bubbleSound: (() => void) | null = null;
export const setBubbleSound = (f: (() => void) | null) => (bubbleSound = f);

const reduced = () => reducedMotion();
const isVisible = (el: Element) => !(el as HTMLElement).hidden && el.isConnected && (el as HTMLElement).offsetParent !== null;

function measure(el: Element): Info {
  const cs = getComputedStyle(el);
  const i: Info = { rect: el.getBoundingClientRect(), color: cs.backgroundColor, text: el.textContent ?? '', visible: true };
  info.set(el, i);
  return i;
}

/** la bulle grandit sur place */
function appear(el: HTMLElement) {
  const was = info.get(el);
  const i = measure(el);
  if (was?.visible && was.text === i.text) return; // déjà visible : rien
  if (reduced()) return void el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
  el.style.transformOrigin = '50% 50%';
  el.animate(
    [
      { transform: 'scale(0)', opacity: 0, offset: 0 },
      { transform: 'scale(0.6)', opacity: 1, offset: 0.28 },
      { transform: 'scale(1.1, 0.92)', offset: 0.6 },
      { transform: 'scale(0.96, 1.04)', offset: 0.8 },
      { transform: 'scale(1)', offset: 1 },
    ],
    { duration: 420, easing: EASE_OUT_BACK, fill: 'none' },
  );
}

/** le nombre change : petit bump, le chiffre roule vers le haut */
function bump(el: HTMLElement) {
  const was = info.get(el);
  const i = measure(el);
  if (!was || was.text === i.text) return;
  if (reduced()) return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.45 }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
  // le chiffre roule : un clone du texte précédent monte et s'efface, le nouveau arrive d'en bas
  const r = i.rect;
  const roll = document.createElement('span');
  roll.textContent = was.text;
  roll.setAttribute('aria-hidden', 'true');
  roll.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;display:grid;place-items:center;border-radius:999px;background:${i.color};color:#000;font:inherit;font-size:${getComputedStyle(el).fontSize};z-index:9999;pointer-events:none;`;
  document.body.append(roll);
  roll.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-60%)', opacity: 0 }], { duration: 180, easing: 'ease-in' }).onfinish = () => roll.remove();
  el.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 180, easing: 'ease-out' });
}

/** la bulle éclate (sur un calque fixe, à sa dernière position) */
function pop(el: Element) {
  const i = info.get(el);
  if (!i || !i.visible) return;
  i.visible = false;
  const r = i.rect;
  if (!r.width) return;
  const now = performance.now();
  const delay = Math.max(0, popAt - now);
  popAt = Math.max(now, popAt) + 60;
  const ghost = document.createElement('span');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:999px;background:${i.color};z-index:9999;pointer-events:none;will-change:transform,opacity;`;
  document.body.append(ghost);
  if (reduced()) {
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, delay, fill: 'forwards' }).onfinish = () => ghost.remove();
    return;
  }
  // reflet qui traverse pendant le gonflement
  const shine = document.createElement('i');
  shine.style.cssText = 'position:absolute;inset:0;border-radius:inherit;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.85) 50%,transparent 65%);';
  ghost.append(shine);
  shine.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }], { duration: 90, delay, fill: 'forwards' });
  const swell = ghost.animate(
    [
      { transform: 'scale(1)', opacity: 1, offset: 0 },
      { transform: 'scale(1.25)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1.35)', opacity: 0, offset: 1 },
    ],
    { duration: 150, delay, easing: 'ease-out', fill: 'forwards' },
  );
  swell.onfinish = () => ghost.remove();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  window.setTimeout(() => {
    bubbleSound?.();
    // anneau fin qui s'élargit
    const ring = document.createElement('span');
    ring.style.cssText = `position:fixed;left:${cx - r.height / 2}px;top:${cy - r.height / 2}px;width:${r.height}px;height:${r.height}px;border-radius:50%;border:1.5px solid ${i.color};z-index:9999;pointer-events:none;`;
    document.body.append(ring);
    ring.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(2.2)', opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).onfinish = () => ring.remove();
    // gouttelettes en étoile
    const n = 6 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = 10 + Math.random() * 6;
      const s = 2 + Math.random() * 2.5;
      const drop = document.createElement('span');
      drop.style.cssText = `position:fixed;left:${cx - s / 2}px;top:${cy - s / 2}px;width:${s}px;height:${s}px;border-radius:50%;background:${i.color};z-index:9999;pointer-events:none;`;
      document.body.append(drop);
      drop.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 3}px) scale(0.4)`, opacity: 0 },
        ],
        { duration: 240 + Math.random() * 60, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
      ).onfinish = () => drop.remove();
    }
  }, delay + 90);
}

let started = false;
/** Branche l'observateur une fois (main.ts, dès que l'en-tête existe). */
export function watchBubbles(root: HTMLElement = document.body): void {
  if (started) return;
  started = true;
  // état initial : ce qui est déjà visible est mesuré (pas d'animation)
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => isVisible(el) && measure(el));
  const seen = new Set<Element>();
  const mo = new MutationObserver((muts) => {
    seen.clear();
    for (const m of muts) {
      if (m.type === 'attributes') {
        const el = m.target as HTMLElement;
        if (!el.matches(SELECTOR) || seen.has(el)) continue;
        seen.add(el);
        if (el.hidden) pop(el);
        else requestAnimationFrame(() => isVisible(el) && appear(el));
      } else if (m.type === 'characterData') {
        const el = (m.target.parentElement as HTMLElement | null)?.closest<HTMLElement>(SELECTOR);
        if (el && !seen.has(el) && isVisible(el)) (seen.add(el), bump(el));
      } else {
        for (const n of m.removedNodes) if (n instanceof Element) (n.matches(SELECTOR) ? [n] : [...n.querySelectorAll(SELECTOR)]).forEach(pop);
        for (const n of m.addedNodes)
          if (n instanceof Element) (n.matches(SELECTOR) ? [n as HTMLElement] : [...n.querySelectorAll<HTMLElement>(SELECTOR)]).forEach((el) => requestAnimationFrame(() => isVisible(el) && appear(el)));
        // texte remplacé d'un bloc (textContent =) : noeud texte ajouté
        const el = (m.target as Element).closest?.<HTMLElement>(SELECTOR);
        if (el && !seen.has(el) && isVisible(el) && [...m.addedNodes].some((x) => x.nodeType === Node.TEXT_NODE)) (seen.add(el), bump(el));
      }
    }
  });
  mo.observe(root, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
  // la position d'une pastille change avec la fenêtre : on remesure celles qui sont visibles
  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = window.setTimeout(() => root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => isVisible(el) && info.has(el) && measure(el)), 150);
  });
}
