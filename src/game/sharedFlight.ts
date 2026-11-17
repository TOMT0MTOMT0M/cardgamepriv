import { DUR, EASING } from '../core/motion';
import type { ViewerScene } from './scenes/viewer';

/**
 * (V3, lot 02) CONTINUITÉ TUILE ↔ VISIONNEUSE 3D — la carte qu'on touche dans une grille (Collection, vitrine et
 * collection du Profil) se soulève jusqu'à la visionneuse, et y revient se poser à la fermeture.
 *
 *  - ALLER (`liftCard`) : l'image de la tuile (`img.real`, la vraie carte peinte) vole jusqu'à `viewer.restRect()` ;
 *    la carte 3D attend son arrivée (`viewer.show({ ghost })`) et apparaît dessous à l'identique, puis l'image s'efface
 *    (`Lift.settle`) ;
 *  - RETOUR (`returnCard`) : l'image repart de là où est la carte (3D posée : `viewer.cardRect()` ; encore en vol : de
 *    sa position À CET INSTANT — la course s'inverse sans saut) et se pose sur la tuile, cachée le temps du vol ; tuile
 *    disparue (filtre, page, carte voisine ailleurs) : elle file vers `fallback` (bouton Collection) en s'effaçant.
 *
 * Coût : un seul élément en vol, animé par le navigateur (transform / opacity : composité, hors du fil principal — la
 * visionneuse peint la carte pendant l'aller) ; une lecture de style au plus par retour en plein vol.
 */
type Box = { left: number; top: number; width: number; height: number };
type Ndc = { x0: number; y0: number; x1: number; y1: number };

interface Ghost {
  g: HTMLImageElement;
  /** boîte de départ de l'élément (left/top/width/height posés en style) : les transformées sont relatives à elle */
  base: Box;
  anim: Animation | null;
  /** tuile cachée pendant un retour (l'image volante la remplace) */
  hidden: HTMLElement | null;
  /** la carte 3D a pris le relais : l'image s'efface */
  fading: boolean;
}
let cur: Ghost | null = null;

/** NDC (−1..1, y vers le haut) → px CSS de la page (même calcul que riffle.ts `ndcToRect`) */
function ndcBox(r: Ndc, host: DOMRect): Box {
  return {
    left: host.left + ((r.x0 + 1) / 2) * host.width,
    top: host.top + ((1 - r.y1) / 2) * host.height,
    width: ((r.x1 - r.x0) / 2) * host.width,
    height: ((r.y1 - r.y0) / 2) * host.height,
  };
}
const toward = (from: Box, to: Box) =>
  `translate(${to.left - from.left}px,${to.top - from.top}px) scale(${to.width / from.width},${to.height / from.height})`;

function drop() {
  if (!cur) return;
  const c = cur;
  cur = null;
  c.anim?.cancel();
  c.g.remove();
  if (c.hidden) c.hidden.style.visibility = '';
}

/** Image de la vraie carte sur une tuile (peinte, décodée, portrait) ; null sinon (pas de vol : l'entrée habituelle). */
export function tileImage(tile: Element | null | undefined): string | null {
  const img = tile?.classList.contains('real-on') ? tile.querySelector<HTMLImageElement>('img.real') : null;
  // (carte horizontale : montrée couchée, entière, dans la tuile — la carte 3D, elle, se couche après son entrée)
  return img?.complete && img.naturalWidth && !img.classList.contains('land') ? img.currentSrc || img.src : null;
}

function spawn(src: string, at: Box): HTMLImageElement {
  const g = document.createElement('img');
  g.className = 'card-ghost';
  g.alt = '';
  g.src = src;
  g.style.cssText = `left:${at.left}px;top:${at.top}px;width:${at.width}px;height:${at.height}px`;
  document.body.append(g);
  return g;
}

export interface Lift {
  /** arrivée à la place de la carte 3D (à passer à `viewer.show(…, { ghost })`) ; résolue aussi si le vol est repris */
  landed: Promise<void>;
  /** la carte 3D est apparue dessous : l'image s'efface (sans effet si ce vol a été repris ou remplacé) */
  settle(): void;
}

/**
 * ALLER. undefined si la tuile n'a pas d'image à faire voler (la visionneuse fait alors son entrée habituelle).
 */
export function liftCard(tile: HTMLElement | null | undefined, viewer: ViewerScene, canvas: HTMLElement): Lift | undefined {
  drop();
  const src = tileImage(tile);
  const to = viewer.restRect();
  if (!tile || !src || !to) return undefined;
  const from = tile.getBoundingClientRect();
  const host = canvas.getBoundingClientRect();
  if (!from.width || !host.width) return undefined;
  const base = { left: from.left, top: from.top, width: from.width, height: from.height };
  const g = spawn(src, base);
  const anim = g.animate([{ transform: 'none' }, { transform: toward(base, ndcBox(to, host)) }], { duration: DUR.emphatique(), easing: EASING.entree, fill: 'forwards' });
  const mine: Ghost = (cur = { g, base, anim, hidden: null, fading: false });
  return {
    // (annulée = fermée en plein vol : la carte 3D n'apparaîtra pas, la promesse se résout quand même)
    landed: anim.finished.then(
      () => undefined,
      () => undefined,
    ),
    settle: () => {
      // (repris par un retour, ou remplacé par un autre vol : ce n'est plus le nôtre)
      if (cur === mine && mine.anim === anim) fade(mine);
    },
  };
}

function fade(c: Ghost) {
  if (c.fading) return;
  c.fading = true;
  const out = c.g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.rapide(), easing: 'linear', fill: 'forwards' });
  out.onfinish = () => cur === c && drop();
}

/**
 * RETOUR, à la fermeture de la visionneuse (appelé APRÈS que la grille est réaffichée et la tuile ramenée à l'écran).
 * `from` : `viewer.cardRect()` lu AVANT de quitter la visionneuse (sur téléphone, la quitter libère la carte) ; `tile` :
 * la place de la carte ; `fallback` : où filer si la tuile n'est plus là ; `src` : image de secours (tuile sans vraie
 * carte). Sans image ou sans carte de face à l'écran (et rien en vol) : rien, fermeture sèche comme avant.
 */
export function returnCard(o: { tile: HTMLElement | null | undefined; fallback?: HTMLElement | null; from: Ndc | null; canvas: HTMLElement; src?: string | null }): void {
  const tile = o.tile?.isConnected ? o.tile : null;
  let c = cur && !cur.fading ? cur : null;
  // toutes les lectures de géométrie d'abord, avant d'écrire dans la page : une seule mise en page (déjà faite par le
  // `scrollIntoView` de la fermeture), pas une de plus après l'ajout de l'image
  const t = tile?.getBoundingClientRect();
  const f = o.fallback?.getBoundingClientRect();
  const m = c ? getComputedStyle(c.g).transform : 'none';
  let from: Box;
  if (c) {
    // encore en vol (ou posée en attendant la carte 3D) : on repart de là où elle est, sans saut
    c.anim?.cancel();
    c.g.style.transform = m === 'none' ? '' : m;
    from = c.base;
  } else {
    const src = tileImage(tile) ?? o.src ?? null;
    const r = o.from;
    const host = o.canvas.getBoundingClientRect();
    drop();
    if (!src || !r || !host.width) return;
    from = ndcBox(r, host);
    if (!from.width || !from.height) return;
    c = { g: spawn(src, from), base: from, anim: null, hidden: null, fading: false };
  }
  cur = c;
  const g = c.g;
  // au-dessus des pages (.views, z 10 ; à l'aller, l'image passe SOUS la fiche de la visionneuse) ; vers le bouton de
  // l'en-tête : au-dessus de lui aussi (.topbar, z 20)
  g.style.zIndex = '15';
  const start = g.style.transform || 'none';
  const dur = DUR.emphatique() * 0.75; // (les sorties ≈ 0,75 × l'entrée, motion.ts)
  let anim: Animation;
  if (t && t.width && t.bottom > 0 && t.top < innerHeight) {
    // la tuile : l'image s'y pose et la remplace (cachée le temps du vol, sinon deux cartes)
    if (c.hidden && c.hidden !== tile) c.hidden.style.visibility = '';
    tile!.style.visibility = 'hidden';
    c.hidden = tile!;
    anim = g.animate([{ transform: start }, { transform: toward(c.base, t) }], { duration: dur, easing: EASING.standard, fill: 'forwards' });
  } else {
    // tuile disparue : vers le bouton (réduite à sa hauteur), en s'effaçant ; sans bouton : fondu sur place
    g.style.zIndex = '21';
    const end = f && f.width && f.height ? (() => {
      const k = f.height / c!.base.height;
      const w = c!.base.width * k;
      return toward(c!.base, { left: f.left + (f.width - w) / 2, top: f.top, width: w, height: f.height });
    })() : start;
    anim = g.animate(
      [
        { transform: start, opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.55 },
        { transform: end, opacity: 0, offset: 1 },
      ],
      { duration: dur, easing: EASING.standard, fill: 'forwards' },
    );
  }
  c.anim = anim;
  const mine = c;
  anim.onfinish = () => cur === mine && drop();
}

/** Fermeture sans retour (page quittée, autre vue) : plus rien en vol. */
export function dropFlight(): void {
  drop();
}
