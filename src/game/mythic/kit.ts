/**
 * Boîte à outils des SCÈNES 6★ (une par famille, game/mythic/scenes/*.ts). Une scène reçoit un `SceneCtx` et remplit
 * sa timeline gsap (`ctx.tl`, qui part de 0) : éléments DOM / SVG, un canvas 2D si besoin, des sons synthétisés. Elle
 * se termine sur son « climax » : le moteur (runtime.ts) enchaîne alors le flash blanc et rend la main à la carte.
 *
 * Règles (doc « animations 6★ par famille », 07/11) :
 *  - la carte reste nette : le spectacle se joue AUTOUR — rien ne déforme ni n'anime l'illustration ;
 *  - anti-spoil : aucune illustration ni le nom de la carte avant son retournement (seulement les indices) ;
 *  - aucune musique, aucun logo, aucune interface reprise d'un jeu, d'un film ou d'une marque ;
 *  - 2 à 3 s en version complète ; la version courte est la même timeline accélérée (×2,2).
 */
import type gsap from 'gsap';
import type { SoundKit } from './sounds';

export interface MythicCard {
  id: string;
  /** thème (gaming, pop, sport, monde) */
  theme: string;
  /** groupe (« jeux-video », « foot »…) ou sous-thème sans groupe (« ardeche ») */
  family: string;
  /** sous-thème (id et libellé : « mammiferes » / « Mammifères ») */
  subId: string;
  sub: string;
  /** Jeux vidéo : année de sortie */
  year?: number;
  /** Monde : type (« Mammifère », « Capitale »…) */
  label?: string;
}

export interface SceneCanvas {
  c: CanvasRenderingContext2D;
  /** taille en pixels CSS (le contexte est déjà mis à l'échelle de la densité d'écran) */
  w: number;
  h: number;
  /** fonction appelée à chaque image tant que la scène vit ; `t` = temps de la timeline de la scène (s) */
  loop(fn: (t: number, dt: number) => void): void;
}

export interface SceneCtx {
  root: HTMLElement;
  w: number;
  h: number;
  /** 1 % du plus petit côté de l'écran (px) */
  u: number;
  card: MythicCard;
  short: boolean;
  /** téléphone : moins de particules */
  mobile: boolean;
  tl: gsap.core.Timeline;
  gsap: typeof gsap;
  sfx: SoundKit;
  /** hasard déterministe propre à la carte (même scène à chaque fois pour une carte donnée) */
  rand: () => number;
  el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, css?: string, parent?: HTMLElement): HTMLElementTagNameMap[K];
  /** élément SVG (balisage complet `<svg …>…</svg>`) */
  svg(markup: string, cls?: string, parent?: HTMLElement): SVGSVGElement;
  canvas(parent?: HTMLElement): SceneCanvas;
  /**
   * Centre un élément sur son point (left/top) via gsap (xPercent / yPercent) : ne JAMAIS écrire translate(-50%) en
   * CSS sur un élément animé par gsap — un tween de x / y l'écraserait.
   */
  pin<T extends Element>(e: T, xp?: number, yp?: number): T;
  /** appelé à chaque image tant que la scène vit ; `t` = temps de la timeline de la scène (s) */
  loop(fn: (t: number, dt: number) => void): void;
  /** flash blanc à `at` (s), intensité 0..1 */
  flash(at: number, k?: number, dur?: number): void;
  /** secousse de la scène à `at` */
  shake(at: number, px?: number, dur?: number): void;
  haptic(pattern: number | number[]): void;
  /** son à `at` (s) dans la timeline */
  at(t: number, fn: () => void): void;
  /**
   * LA CARTE, actrice de la scène : doublure 2D de la carte face cachée (dos acier brossé, « B » gravé, tranche
   * arc-en-ciel). Déjà centrée (pin) et cachée (opacity 0) ; la scène la fait entrer, la manipule, et la laisse AU
   * CENTRE à l'échelle 1 à la fin : le calque s'efface dessus et la vraie carte 3D prend le relais, sans flash.
   */
  actor(): HTMLElement;
  /** largeur de la carte (px) */
  cw: number;
  /** grand mot en Atsuka Montreal (--display) (titre de scène), centré ; `y` en px */
  word(txt: string, y: number, size?: number, cls?: string): HTMLElement;
  /** petite étiquette (Bold Frame, espacée, majuscules) */
  label(txt: string, x: string, y: string, cls?: string): HTMLElement;
  /** couleur d'accent de la famille (une seule par scène ; l'arc-en-ciel est réservé à la carte) */
  accent: string;
}

/** un accent par famille (DA : base noir/blanc, la couleur = l'information) */
export const ACCENTS: Record<string, string> = {
  'jeux-video': '#8fd3ff', lol: '#ffd36b', cs: '#ff8a4d', valorant: '#ff5c7a',
  anime: '#ffffff', musique: '#c86bff', series: '#9ad8ff', films: '#ffd9a8', dessins: '#ffe66b', stars: '#ffe4b5', youtubeurs: '#ff4d4d',
  foot: '#6bffb8', collectifs: '#ffb347', olympiques: '#ff6b6b', combat: '#ff3b30', raquettes: '#d9ff3a', glisse: '#bfe9ff', meca: '#ff2a1a', precision: '#8fe6c8', esport: '#6bc8ff', coulisses: '#c9a64a',
  animaux: '#7dff8a', lieux: '#6bc8ff', nourriture: '#ffc46b', voitures: '#ffffff', ardeche: '#6bc8ff',
};

export type SceneFn = (ctx: SceneCtx) => void | { dispose?(): void };

/** couleurs de l'arc-en-ciel des 6★ (mêmes que .mv-stars) */
export const RAINBOW = ['#ff6b9a', '#ffd36b', '#6bffb8', '#6bc8ff', '#c86bff'];
export const rainbowCss = (deg = 100) => `linear-gradient(${deg}deg, ${RAINBOW.join(', ')}, ${RAINBOW[0]})`;

/** hasard reproductible (mulberry32) à partir d'une chaîne */
export function seeded(key: string): () => number {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** 0..1 sur [a, b] */
export const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
