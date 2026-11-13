/**
 * DESSINS « FERROFLUIDE » de l'accueil des jeux (V2, 08/11) — refonte complète.
 *
 * Retours de Tom, dans l'ordre : courant épais et visqueux → plus organique → les illustrations d'origine mais avec
 * cet effet → plus lent, avec friction, élastique → fluide magnétique repoussé par l'aura du curseur → « le
 * ferrofluide ne PEUT PAS quitter son chemin, on peut seulement le déplacer SUR les lignes » → « extrêmement laggy,
 * même sur PC : refonte complète, même idée, optimisée, bien plus raffinée et subtile ».
 *
 * Architecture (la version précédente animait des filtres SVG — flou « gluant » + lueur — à chaque image) :
 *  - le DESSIN est un SVG fixe (sillon + piste) : il ne bouge jamais et n'est jamais repeint, sauf pendant le
 *    tracé initial (un seul `stroke-dashoffset` par piste) ;
 *  - le FLUIDE vit dans un petit <canvas> 2D posé dessus : aucun filtre, quelques traits par image, et la boucle
 *    ne tourne que tant qu'une goutte vit ou que le curseur est là (au repos : zéro image calculée) ;
 *  - géométrie pré-échantillonnée (un point tous les 2 px, avec tangente et normale) : rien n'est mesuré par image.
 *
 * Le fluide :
 *  - une PERLE sur son rail : sa seule liberté est sa position s le long de la piste. Inertie, frottement visqueux,
 *    friction statique (elle colle puis se décolle), traîne élastique qui s'effile (lancée elle s'étire, arrêtée elle
 *    se ramasse et gonfle) ;
 *  - l'aura du curseur la repousse LE LONG du rail et le geste l'entraîne (composante parallèle à la piste) ;
 *  - le champ HÉRISSE les lignes : près du curseur, de fines épines se dressent perpendiculairement à la piste,
 *    côté opposé au curseur (instabilité de Rosensweig des vrais ferrofluides), puis retombent — elles restent
 *    plantées sur la ligne, rien ne la quitte ;
 *  - le courant ambiant (et le tracé initial) est une perle tirée par un guide à ressort qui suit la courbe à
 *    friction : retenue par le curseur, elle se tend et repart d'un coup ;
 *  - le curseur qui bouge près d'une piste y fait naître une perle au point le plus proche.
 * Mouvement réduit / « Effets réduits » : dessin tracé, immobile, sans canvas.
 */
import { reducedMotion } from '../../core/motion';
import { pathLength, samplePath } from './pathSample';

export type ArtKind = 'duel' | 'royale' | 'roulette';

/** pas de la trame (style.css : `.games::before`, 22 px) ; les points sont au CENTRE de chaque case */
const G = 22;
const DOT = G / 2;
/** marge autour du dessin (épaisseur de la lueur floue) */
const PAD = 18;

interface Stroke {
  d: string;
  /** départ (s) relatif au début du dessin */
  at: number;
  transform?: string;
  /** détail secondaire (piste plus pâle) */
  dim?: boolean;
  /** piste invisible : seul le courant y passe (la bille sur sa gorge) */
  ghost?: boolean;
  /** gouttes posées sur la piste : [x, y, fraction du parcours où elles gonflent, rayon] */
  dots?: Array<[number, number, number, number?]>;
  /** vitesse × (les 36 crans de la roue : un balayage rapide plutôt qu'une coulée qui s'étale d'un cran à l'autre) */
  quick?: number;
  /** forme qui masque ce tracé (dans le repère du tracé) : la carte de devant cache celle de derrière */
  hide?: { d: string; transform?: string };
}
interface Drawing {
  w: number;
  h: number;
  strokes: Stroke[];
}

/** rectangle à coins arrondis, parcouru depuis le milieu du haut, sens horaire */
const rrect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + w / 2} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
/** cercle parcouru depuis le haut, sens horaire */
const circle = (cx: number, cy: number, r: number) => `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx} ${cy + r} A${r} ${r} 0 1 1 ${cx} ${cy - r}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** les trois dessins, repère 200 × 200 (celui des illustrations d'origine) */
const DRAWINGS: Record<ArtKind, Drawing> = {
  // deux cartes inclinées face à face, « VS » écrit sur celle de devant
  duel: {
    w: 200,
    h: 200,
    strokes: [
      { d: rrect(46, 46, 70, 98, 8), transform: 'rotate(-14 100 100)', at: 0, hide: { d: rrect(86, 54, 70, 98, 8), transform: 'rotate(27 100 100)' } },
      { d: rrect(52, 52, 58, 86, 5), transform: 'rotate(-14 100 100)', at: 0.45, dim: true, hide: { d: rrect(86, 54, 70, 98, 8), transform: 'rotate(27 100 100)' } },
      { d: rrect(86, 54, 70, 98, 8), transform: 'rotate(13 100 100)', at: 0.7 },
      { d: rrect(92, 60, 58, 86, 5), transform: 'rotate(13 100 100)', at: 1.1, dim: true },
      { d: 'M108.5 101.5 L113.5 115 L118.5 101.5', transform: 'rotate(13 100 100)', at: 1.45 },
      { d: 'M133 104 C131.5 101.4 124.5 101.2 124.5 105.2 C124.5 109.2 133 107.9 133 112 C133 116.2 126 116.3 124 113.4', transform: 'rotate(13 100 100)', at: 1.65 },
    ],
  },
  // huit cartes en anneau autour de la table, une goutte au centre
  royale: {
    w: 200,
    h: 200,
    strokes: [
      { d: circle(100, 100, 34), at: 0, dim: true, dots: [[100, 100, 0.05, 4.8]] },
      ...Array.from({ length: 8 }, (_, i) => ({ d: rrect(90, 22, 20, 28, 3), transform: `rotate(${i * 45} 100 100)`, at: 0.45 + i * 0.09 })),
    ],
  },
  // roue : jante, piste, 36 crans, moyeu ; la bille court dans sa gorge
  roulette: {
    w: 200,
    h: 200,
    strokes: [
      { d: circle(100, 100, 84), at: 0 },
      { d: circle(100, 100, 62), at: 0.45, dim: true },
      {
        d: Array.from({ length: 36 }, (_, i) => {
          const a = (i * 10 * Math.PI) / 180;
          const p = (r: number) => `${r2(100 + Math.sin(a) * r)} ${r2(100 - Math.cos(a) * r)}`;
          return `M${p(82)} L${p(i % 2 ? 70 : 62)}`;
        }).join(' '),
        at: 0.8,
        quick: 1.7,
      },
      { d: circle(100, 100, 26), at: 1.3, dim: true },
      { d: circle(100, 100, 53), at: 1.6, ghost: true, dots: [[100, 47, 1, 5]] },
    ],
  },
};

const NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined>) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined) e.setAttribute(k, String(attrs[k]));
  return e;
};

/** vitesse moyenne du courant (px/s), arrêts compris : lente, un fluide épais qui frotte sur sa piste */
const SPEED = 105;
const PULSE_SPEED = 140;
/** marge (px) au-delà du bout de la piste pour que la coulée en sorte entièrement */
const TAIL = 70;

/**
 * FRICTION : la progression (0 → 1) d'un passage, en à-coups. Le fluide colle, la pression monte, il se décolle et
 * glisse avec un petit dépassement élastique (il va un peu trop loin puis revient), puis recolle. Le nombre d'à-coups
 * suit la longueur de la piste ; chaque passage tire ses propres longueurs et durées (jamais deux fois le même).
 */
function frictionCurve(L: number, rnd: () => number): (t: number) => number {
  const n = Math.max(2, Math.min(14, Math.round(L / 58)));
  const dist = Array.from({ length: n }, () => 0.6 + rnd() * 0.8);
  const time = Array.from({ length: n }, (_, i) => (i === 0 ? 1.5 : 0.8 + rnd() * 0.6));
  const dSum = dist.reduce((a, b) => a + b, 0);
  const tSum = time.reduce((a, b) => a + b, 0);
  const steps: Array<{ t0: number; t1: number; p0: number; p1: number; stick: number }> = [];
  let tc = 0;
  let pc = 0;
  for (let i = 0; i < n; i++) {
    const dt = time[i] / tSum;
    const dp = dist[i] / dSum;
    steps.push({ t0: tc, t1: tc + dt, p0: pc, p1: pc + dp, stick: i === n - 1 ? 0.08 : 0.22 + rnd() * 0.18 });
    tc += dt;
    pc += dp;
  }
  // glisse : départ doux, dépassement de ~6 % puis retour (ressort amorti)
  const slip = (u: number) => {
    const k = 1.55;
    const v = u - 1;
    return 1 + v * v * ((k + 1) * v + k);
  };
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const st = steps.find((x) => t < x.t1) ?? steps[steps.length - 1];
    const u = (t - st.t0) / (st.t1 - st.t0);
    // une part du temps de chaque à-coup est collée (le fluide « hésite », il ne bouge presque pas)
    const m = u < st.stick ? (u / st.stick) * 0.02 : 0.02 + 0.98 * slip((u - st.stick) / (1 - st.stick));
    return st.p0 + (st.p1 - st.p0) * m;
  };
}
/** petit générateur pseudo-aléatoire (graine par passage) */
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

let uid = 0;

/**
 * CURSEUR PARTAGÉ : toute la page Jeux est le champ magnétique. Un seul jeu d'écouteurs pour tous les dessins
 * (posé au premier dessin monté, retiré au dernier démonté) ; chaque dessin convertit la position dans son repère.
 */
const P = { x: 0, y: 0, vx: 0, vy: 0, on: false, t: 0 };
const wakers = new Set<() => void>();
const ptrMove = (e: PointerEvent) => {
  const t = performance.now();
  if (P.on && t - P.t < 200) {
    const dt = Math.max(8, t - P.t) / 1000;
    P.vx = P.vx * 0.55 + ((e.clientX - P.x) / dt) * 0.45;
    P.vy = P.vy * 0.55 + ((e.clientY - P.y) / dt) * 0.45;
  } else {
    P.vx = 0;
    P.vy = 0;
  }
  P.x = e.clientX;
  P.y = e.clientY;
  P.t = t;
  P.on = true;
  for (const w of wakers) w();
};
const ptrOff = () => {
  if (!P.on) return;
  P.on = false;
  for (const w of wakers) w();
};
// (au doigt, le champ se coupe dès qu'on lève le doigt ; à la souris, quand elle sort de la fenêtre)
const ptrUp = (e: PointerEvent) => e.pointerType !== 'mouse' && ptrOff();
const ptrOut = (e: PointerEvent) => !e.relatedTarget && ptrOff();
const listenPointer = (w: () => void) => {
  if (!wakers.size) {
    window.addEventListener('pointermove', ptrMove, { passive: true });
    window.addEventListener('pointerdown', ptrMove, { passive: true });
    window.addEventListener('pointerup', ptrUp, { passive: true });
    window.addEventListener('pointercancel', ptrOff, { passive: true });
    document.addEventListener('pointerout', ptrOut, { passive: true });
    window.addEventListener('blur', ptrOff);
  }
  wakers.add(w);
  return () => {
    wakers.delete(w);
    if (wakers.size) return;
    window.removeEventListener('pointermove', ptrMove);
    window.removeEventListener('pointerdown', ptrMove);
    window.removeEventListener('pointerup', ptrUp);
    window.removeEventListener('pointercancel', ptrOff);
    document.removeEventListener('pointerout', ptrOut);
    window.removeEventListener('blur', ptrOff);
    P.on = false;
  };
};

const rotM = (t?: string) => {
  const m = /rotate\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+))?\s*\)/.exec(t ?? '');
  if (!m) return new DOMMatrix();
  const cx = Number(m[2] ?? 0);
  const cy = Number(m[3] ?? 0);
  return new DOMMatrix().translate(cx, cy).rotate(Number(m[1])).translate(-cx, -cy);
};

interface Rail {
  L: number;
  /** points (repère du dessin), tangentes et normales, un tous les ~2 px */
  x: Float32Array;
  y: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  n: number;
  /** 1 là où la piste saute (un « M » : les crans de la roulette ne sont pas reliés) */
  gap: Uint8Array;
  /** piste fermée (cercle, carte) : le fluide en fait le tour sans buter sur le point de départ */
  closed: boolean;
  /** 1 là où la piste est cachée par la forme de devant (carte de derrière du duel) */
  hid: Uint8Array | null;
  /** distance au curseur (point le plus proche), mise à jour par intervalles */
  dist: number;
  /** boîte englobante (pour ignorer les pistes loin du curseur) */
  box: [number, number, number, number];
  trace: SVGPathElement | null;
  dots: Array<{ el: SVGCircleElement; f: number }>;
  /** zone où la perle est cachée par une autre forme (carte de devant) */
  hide: Path2D | null;
  quick: number;
  at: number;
  ghost: boolean;
  busy: boolean;
}

/**
 * Monte le dessin de `kind` dans `host` (dans la carte `card`, dans le défilement `scroller` qui porte la trame).
 * Renvoie le démontage.
 */
export function mountGridArt(host: HTMLElement, card: HTMLElement, scroller: HTMLElement, kind: ArtKind): () => void {
  const c = DRAWINGS[kind];
  const W = c.w + PAD * 2;
  const H = c.h + PAD * 2;
  const fine = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = reducedMotion();
  const id = `gm-art-${++uid}`;

  // ── le dessin : SVG fixe
  const svg = svgEl('svg', { viewBox: `${-PAD} ${-PAD} ${W} ${H}`, width: W, height: H, fill: 'none', 'aria-hidden': 'true', class: 'gm-art' });
  const defs = svgEl('defs', {});
  const gGroove = svgEl('g', { class: 'groove' });
  const gTrace = svgEl('g', { class: 'trace' });
  const gDots = svgEl('g', { class: 'dots' });
  svg.append(defs, gGroove, gTrace, gDots);
  const parts = c.strokes.map((st, k) => {
    let mask: string | undefined;
    if (st.hide) {
      const m = svgEl('mask', { id: `${id}-m${k}`, maskUnits: 'userSpaceOnUse', x: -200, y: -200, width: 600, height: 600 });
      m.append(svgEl('rect', { x: -200, y: -200, width: 600, height: 600, fill: '#fff' }), svgEl('path', { d: st.hide.d, transform: st.hide.transform, fill: '#000' }));
      defs.append(m);
      mask = `url(#${id}-m${k})`;
    }
    const mk = (g: SVGGElement, cls: string) => {
      const e = svgEl('path', { d: st.d, transform: st.transform, mask, class: cls });
      g.append(e);
      return e;
    };
    if (!st.ghost) {
      mk(gGroove, 'halo');
      mk(gGroove, 'line');
    }
    const trace = st.ghost ? null : mk(gTrace, st.dim ? 'dim' : 'line');
    const dots = (st.dots ?? []).map(([x, y, f, r]) => {
      const el = svgEl('circle', { cx: x, cy: y, r: (r ?? 3.4) * 0.75, transform: st.transform, class: still ? 'drop on' : 'drop' });
      gDots.append(el);
      return { el, f };
    });
    return { st, trace, dots };
  });
  host.append(svg);

  // ── géométrie : chaque piste échantillonnée une fois (repère du dessin, transformations comprises)
  // (V2 fluidité, 11/11) sans le DOM (pathSample.ts) : getPointAtLength coûtait ~1 s à l'entrée de la page sur téléphone
  const rails: Rail[] = parts.map(({ st, trace, dots }) => {
    const L = pathLength(st.d);
    const M = rotM(st.transform);
    const n = Math.max(2, Math.round(L / 2) + 1);
    const smp = samplePath(st.d, n);
    const x = new Float32Array(n);
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      x[i] = M.a * smp.x[i] + M.c * smp.y[i] + M.e;
      y[i] = M.b * smp.x[i] + M.d * smp.y[i] + M.f;
    }
    const tx = new Float32Array(n);
    const ty = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const l = Math.hypot(dx, dy) || 1;
      tx[i] = dx / l;
      ty[i] = dy / l;
    }
    const gap = new Uint8Array(n);
    for (let i = 1; i < n; i++) gap[i] = Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]) > 3.5 ? 1 : 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, x[i]); y0 = Math.min(y0, y[i]); x1 = Math.max(x1, x[i]); y1 = Math.max(y1, y[i]);
    }
    let hide: Path2D | null = null;
    if (st.hide && typeof Path2D !== 'undefined') {
      // tout le dessin SAUF la forme de devant (repère du dessin : transformation du tracé ∘ celle du masque)
      hide = new Path2D();
      hide.rect(-PAD, -PAD, W, H);
      hide.addPath(new Path2D(st.hide.d), M.multiply(rotM(st.hide.transform)));
    }
    let hid: Uint8Array | null = null;
    const probe = hide ? document.createElement('canvas').getContext('2d') : null;
    if (hide && probe) {
      hid = new Uint8Array(n);
      for (let i = 0; i < n; i++) hid[i] = probe.isPointInPath(hide, x[i], y[i], 'evenodd') ? 0 : 1;
    }
    if (trace) {
      trace.setAttribute('stroke-dasharray', `${L + 2} ${L + 2}`);
      trace.setAttribute('stroke-dashoffset', String(still ? 0 : L + 2));
    }
    const closed = !gap.some((g) => g) && Math.hypot(x[0] - x[n - 1], y[0] - y[n - 1]) < 1;
    return { L, x, y, tx, ty, n, gap, closed, hid, dist: Infinity, box: [x0, y0, x1, y1], trace, dots, hide, quick: st.quick ?? 1, at: st.at, ghost: !!st.ghost, busy: false };
  });

  // ── aligner le dessin sur les points de la trame (positions de mise en page, sans les transformations)
  const place = () => {
    let x = 0;
    let y = 0;
    for (let e: HTMLElement | null = card; e && e !== scroller; e = e.offsetParent as HTMLElement | null) {
      x += e.offsetLeft;
      y += e.offsetTop;
    }
    x += card.clientLeft;
    y += card.clientTop;
    // ordinateur (3 colonnes) : le dessin occupe une « platine » en haut de la carte, le texte est dessous ;
    // téléphone (1 colonne) : un fragment du dessin dépasse du coin haut-droit, en retrait derrière le titre
    const plate = typeof matchMedia === 'function' && matchMedia('(min-width: 861px)').matches;
    const wantX = plate ? card.clientWidth - c.w - 24 : card.clientWidth - c.w * 0.62;
    const wantY = plate ? 18 : -c.h * 0.2;
    const snap = (v: number) => DOT + G * Math.round((v - DOT) / G);
    host.style.transform = `translate(${snap(x + wantX) - x - PAD}px, ${snap(y + wantY) - y - PAD}px)`;
    host.style.width = `${W}px`;
    host.style.height = `${H}px`;
  };
  place();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
  ro?.observe(card);

  if (still) return () => ro?.disconnect();

  // ── le fluide : canvas 2D posé sur le dessin
  const cv = document.createElement('canvas');
  cv.className = 'gm-art-fx';
  cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = `${W}px`;
  cv.style.height = `${H}px`;
  host.append(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return () => ro?.disconnect();

  /** échantillon le plus proche de l'abscisse s */
  const idx = (r: Rail, s: number) => Math.max(0, Math.min(r.n - 1, Math.round((s / r.L) * (r.n - 1))));
  /** abscisse ramenée sur la piste (une piste fermée boucle) */
  const wrap = (r: Rail, s: number) => (r.closed ? ((s % r.L) + r.L) % r.L : s);

  // ── physique
  const PUSH = 1300; // poussée maximale de l'aura le long du rail (px/s²)
  const DRAG = 3; // entraînement par la composante du geste le long du rail
  const VISC = 2.8; // frottement visqueux (1/s)
  const RES_MAX = rails.filter((r) => !r.ghost).length > 3 ? 2 : 1;
  const ATTR = 560; // attraction maximale (px/s²), atteinte à REACH px au-delà de l'aura : plus loin = plus fort, plafonné
  const REACH = 380;
  const STATIC = 150; // friction statique : poussée minimale pour décoller une perle arrêtée
  const GUIDE_K = 36; // ressort du guide (courant ambiant, tracé)
  const GUIDE_C = 8.5;
  /**
   * Une COULÉE : un filet de liquide visqueux posé sur le rail, entre sa queue et sa tête (abscisses tail → s).
   * Tout est tiré au hasard à sa naissance : longueur au repos, épaisseur, retard de la queue, ondulations du filet.
   */
  interface Bead {
    r: Rail; s: number; v: number; tail: number; dir: number;
    len: number; wid: number; lag: number; lam: [number, number]; ph: [number, number]; drift: number;
    t: number; T: number; delay: number; curve: ((t: number) => number) | null; idle: number; age: number; fade: number; prev: number; reveal: boolean; front: number;
    /** coulée « résidente » : elle vit tant que le curseur est sur la page, attirée par lui */
    res: boolean;
  }
  const beads = new Set<Bead>();
  let ready = false;

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const spawn = (r: Rail, s: number, v: number, curve: Bead['curve'], T: number, o: { delay?: number; reveal?: boolean; len?: number; res?: boolean } = {}) => {
    if (r.busy) return null;
    r.busy = true;
    const len = o.len ?? rand(28, 62);
    const b: Bead = {
      r, s, v, tail: s, dir: v < 0 ? -1 : 1,
      len, wid: (r.ghost ? 1.35 : 1) * rand(1.7, 2.9), lag: rand(0.22, 0.5),
      lam: [rand(13, 24), rand(5.5, 9)], ph: [rand(0, 6.28), rand(0, 6.28)], drift: rand(-1.2, 1.2),
      t: 0, T, delay: o.delay ?? 0, curve, idle: 0, age: 0, fade: 0, prev: s, reveal: !!o.reveal, front: 0, res: !!o.res,
    };
    beads.add(b);
    wake();
    return b;
  };
  const pulse = (r: Rail, speed: number, o: { delay?: number; reveal?: boolean } = {}) => {
    // longueur au hasard, bornée par la piste (un cran de la roulette ne porte qu'un court filet)
    const len = Math.min(r.L * (r.ghost ? 0.14 : 0.75), rand(40, 120));
    const sp = speed * rand(0.8, 1.2);
    return spawn(r, 0, 0, frictionCurve(r.L, rng(Math.floor(Math.random() * 1e9) + 1)), Math.max(0.9, (r.L + TAIL) / (sp * r.quick)), { ...o, len });
  };
  const popDot = (el: SVGCircleElement) => {
    el.classList.add('on');
    el.classList.remove('pop');
    void el.getBoundingClientRect();
    el.classList.add('pop');
  };

  // ── curseur (repère du dessin, recalculé à chaque image depuis le curseur partagé), intensité du champ
  let mx = -9999;
  let my = -9999;
  let cvx = 0;
  let cvy = 0;
  let inside = false;
  let field = 0;
  let raf = 0;
  let lastFrame = 0;
  let lastCall = 0;
  let lastRes = 0;
  let lastScan = 0;
  let clock = 0;
  const wake = () => {
    if (!host.isConnected) return unlisten();
    if (raf) return;
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const unlisten: () => void = listenPointer(() => wake());

  /**
   * Dessine une coulée : un ruban plein qui suit exactement la piste, épaisseur variable — fin à la queue, plein à la
   * tête (bout arrondi), et des renflements irréguliers qui glissent lentement le long du filet (le liquide visqueux
   * qui perle). Volume conservé : étirée elle s'amincit, ramassée elle s'épaissit. Une lueur large et très pâle dessous.
   */
  const LX = new Float32Array(512);
  const LY = new Float32Array(512);
  const RX = new Float32Array(512);
  const RY = new Float32Array(512);
  const BRK = new Uint8Array(512);
  const coulee = (b: Bead, op: number) => {
    const r = b.r;
    const ds = r.L / (r.n - 1);
    const real = Math.abs(b.s - b.tail) + 0.001;
    const vol = Math.max(0.6, Math.min(1.45, Math.sqrt(b.len / Math.max(6, real))));
    const W0 = b.wid * vol * (1 - 0.35 * b.fade);
    const n = Math.min(511, Math.ceil(real / ds));
    let headIn = false;
    if (n >= 2) {
      let ip = -1;
      for (let k = 0; k <= n; k++) {
        // u : 0 à la queue → 1 à la tête (sur toute la coulée, même si une partie est hors de la piste)
        const u = k / n;
        const sAbs = b.tail + (b.s - b.tail) * u;
        const w = wrap(r, sAbs);
        const out = w < 0 || w > r.L;
        const i = idx(r, w);
        // coupure : hors de la piste, ou la piste saute entre deux points (crans de la roulette)
        BRK[k] = out || k === 0 || ip < 0 ? 1 : 0;
        if (!BRK[k] && i !== ip) {
          const d = Math.abs(i - ip);
          if (d === 1) BRK[k] = r.gap[Math.max(i, ip)];
          else if (!(r.closed && d === r.n - 1)) BRK[k] = Math.hypot(r.x[i] - r.x[ip], r.y[i] - r.y[ip]) > 3.5 ? 1 : 0;
        }
        ip = out ? -1 : i;
        if (out) continue;
        if (k === n) headIn = true;
        const env = Math.pow(u, 0.9) * (0.35 + 0.65 * Math.min(1, u * 1.6));
        const wob = 1 + 0.32 * Math.sin((sAbs / b.lam[0]) * 6.283 - b.ph[0] - clock * b.drift) + 0.14 * Math.sin((sAbs / b.lam[1]) * 6.283 + b.ph[1] + clock * 1.7);
        const hw = Math.max(0.25, W0 * env * wob) * 0.5;
        const nx = -r.ty[i] * hw;
        const ny = r.tx[i] * hw;
        LX[k] = r.x[i] + nx;
        LY[k] = r.y[i] + ny;
        RX[k] = r.x[i] - nx;
        RY[k] = r.y[i] - ny;
      }
      // un ruban par tronçon continu
      const ribbon = () => {
        ctx.beginPath();
        let a = -1;
        for (let k = 0; k <= n + 1; k++) {
          const cut = k > n || BRK[k];
          if (cut && a >= 0 && k - 1 - a >= 1) {
            const z = k - 1;
            ctx.moveTo(LX[a], LY[a]);
            for (let j = a + 1; j <= z; j++) ctx.lineTo(LX[j], LY[j]);
            for (let j = z; j >= a; j--) ctx.lineTo(RX[j], RY[j]);
            ctx.closePath();
          }
          if (cut) {
            const w = k <= n ? wrap(r, b.tail + (b.s - b.tail) * (k / n)) : -1;
            a = k <= n && w >= 0 && w <= r.L ? k : -1;
          }
        }
      };
      // lueur : le même ruban, contour large et très pâle
      ribbon();
      ctx.lineWidth = 5 + W0;
      ctx.strokeStyle = `rgba(255,255,255,${(op * 0.06).toFixed(3)})`;
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${(op * 0.92).toFixed(3)})`;
      ctx.fill();
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.stroke();
    }
    // bout arrondi de la tête (tant qu'elle est sur la piste)
    if (n < 2 ? wrap(r, b.s) >= 0 && wrap(r, b.s) <= r.L : headIn) {
      const k = Math.max(0, n);
      const ih = idx(r, wrap(r, b.s));
      const hx = n >= 2 ? (LX[k] + RX[k]) / 2 : r.x[ih];
      const hy = n >= 2 ? (LY[k] + RY[k]) / 2 : r.y[ih];
      const hr = n >= 2 ? Math.hypot(LX[k] - RX[k], LY[k] - RY[k]) / 2 : W0 * 0.45 * Math.min(1, b.age / 0.3);
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(0.4, hr), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${(op * 0.92).toFixed(3)})`;
      ctx.fill();
    }
  };

  /** épines du champ sur la piste r : la ligne se hérisse près du curseur, côté opposé, sans jamais la quitter */
  const spines = (r: Rail, A: number, spd: number) => {
    const A2 = A * A;
    const k = field * (4.5 + Math.min(4, spd / 260));
    for (let i = 0; i < r.n; i += 3) {
      const dx = r.x[i] - mx;
      const dy = r.y[i] - my;
      const d2 = dx * dx + dy * dy;
      if (d2 > A2) continue;
      const q = 1 - Math.sqrt(d2) / A;
      // normale orientée à l'opposé du curseur ; longueur selon le champ, frémissement léger
      let nx = -r.ty[i];
      let ny = r.tx[i];
      if (nx * dx + ny * dy < 0) {
        nx = -nx;
        ny = -ny;
      }
      const len = k * q * q * (0.82 + 0.18 * Math.sin(clock * 11 + i * 0.7));
      if (len < 0.4) continue;
      ctx.moveTo(r.x[i], r.y[i]);
      ctx.lineTo(r.x[i] + nx * len, r.y[i] + ny * len);
    }
  };

  const tick = (now: number) => {
    raf = 0;
    if (!host.isConnected) return;
    const dt = Math.min(1 / 30, (now - lastFrame) / 1000);
    lastFrame = now;
    clock += dt;
    inside = P.on;
    if (inside) {
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = new DOMPoint(P.x, P.y).matrixTransform(ctm.inverse());
        mx = pt.x;
        my = pt.y;
      }
      // vitesse du geste (décroît quand le curseur s'arrête)
      const still = (now - P.t) / 1000;
      const k = still > 0.06 ? Math.exp(-(still - 0.06) * 10) : 1;
      cvx = P.vx * k;
      cvy = P.vy * k;
    } else {
      // (audit 12/11, S17 / A9-15) extinction au temps : même durée à 60, 120 ou 144 Hz
      const fade = Math.pow(0.88, dt * 60);
      cvx *= fade;
      cvy *= fade;
    }
    field += ((inside ? 1 : 0) - field) * Math.min(1, dt * (inside ? 6 : 3));
    const spd = Math.hypot(cvx, cvy);
    const A = 54 + Math.min(46, spd * 0.045);
    const boost = field * (1 + Math.min(1.8, spd / 600));

    // le curseur sur la page : une ou deux coulées résidentes naissent sur les pistes les plus proches de lui (à un
    // endroit au hasard de la piste) et se laissent attirer
    if (ready && visible && inside && field > 0.5 && now - lastScan > 450) {
      lastScan = now;
      // distance de chaque piste au curseur (point le plus proche)
      let bestAll = Infinity;
      for (const r of rails) {
        let d = Infinity;
        if (!r.ghost) for (let i = 0; i < r.n; i += 4) d = Math.min(d, (r.x[i] - mx) ** 2 + (r.y[i] - my) ** 2);
        r.dist = Math.sqrt(d);
        bestAll = Math.min(bestAll, r.dist);
      }
      // une coulée posée sur une piste nettement plus loin que la meilleure se retire (elle renaîtra plus près)
      let res = 0;
      for (const b of beads) {
        if (!b.res) continue;
        if (b.idle > 0.9 && b.r.dist > bestAll + 40) b.res = false;
        else res++;
      }
      if (res < RES_MAX && now - lastRes > 1100) {
        let best: Rail | null = null;
        let bd = Infinity;
        for (const r of rails) {
          if (r.busy || r.ghost) continue;
          const d = r.dist * rand(0.85, 1.2);
          if (d < bd) {
            bd = d;
            best = r;
          }
        }
        if (best) {
          lastRes = now;
          spawn(best, rand(0.1, 0.9) * best.L, 0, null, 0, { res: true, len: Math.min(best.L * 0.6, rand(36, 92)) });
        }
      }
    }

    // le curseur qui bouge près d'une piste libre y fait naître une coulée, au point le plus proche
    if (ready && inside && spd > 90 && now - lastCall > (spd > 700 ? 420 : 800)) {
      let br: Rail | null = null;
      let bi = 0;
      let bd = A * 0.7;
      for (const r of rails) {
        if (r.busy || mx < r.box[0] - bd || mx > r.box[2] + bd || my < r.box[1] - bd || my > r.box[3] + bd) continue;
        for (let i = 0; i < r.n; i += 2) {
          const d = Math.hypot(r.x[i] - mx, r.y[i] - my);
          if (d < bd) {
            bd = d;
            br = r;
            bi = i;
          }
        }
      }
      if (br) {
        lastCall = now;
        spawn(br, (bi / (br.n - 1)) * br.L, (cvx * br.tx[bi] + cvy * br.ty[bi]) * 0.45, null, 0);
      }
    }

    // ── perles
    for (const b of beads) {
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      const r = b.r;
      b.age += dt;
      b.t += dt;
      let f = 0;
      if (boost > 0.002) {
        const i = idx(r, b.curve ? Math.min(b.s, r.L) : wrap(r, b.s));
        const dx = r.x[i] - mx;
        const dy = r.y[i] - my;
        const d = Math.hypot(dx, dy) + 0.001;
        const along = (dx / d) * r.tx[i] + (dy / d) * r.ty[i]; // > 0 : s'éloigner du curseur = avancer sur le rail
        if (d < A) {
          // aimant contre aimant : dans l'aura le fluide est repoussé
          const q = 1 - d / A;
          const q2 = q * q;
          f += along * PUSH * q2 * boost;
          f += (cvx * r.tx[i] + cvy * r.ty[i]) * q2 * DRAG * field; // sillage du geste, le long du rail
        } else {
          // au-delà il est attiré, d'autant plus fort qu'il est loin (plafonné) ; les coulées du courant
          // ambiant, tenues par leur guide, ne font que s'infléchir
          f -= along * ATTR * Math.min(1, (d - A) / REACH) * field * (b.curve ? 0.45 : 1);
        }
        // une coulée attirée sous la carte de devant en ressort par le bord le plus proche (elle resterait invisible)
        if (r.hid && r.hid[i] && !b.curve) {
          let a = i;
          let e = i;
          while (a > 0 && r.hid[a]) a--;
          while (e < r.n - 1 && r.hid[e]) e++;
          const toA = r.hid[a] ? Infinity : i - a;
          const toE = r.hid[e] ? Infinity : e - i;
          if (toA !== Infinity || toE !== Infinity) f += (toE < toA ? 1 : -1) * ATTR * 0.9;
        }
      }
      if (b.curve) {
        const g = b.curve(Math.min(1, b.t / b.T)) * (r.L + b.len + 8);
        f += GUIDE_K * (g - b.s) - GUIDE_C * b.v;
      } else {
        f -= VISC * b.v;
        if (Math.abs(b.v) < 6 && Math.abs(f) < STATIC) {
          b.v = 0;
          f = 0;
        }
      }
      b.v += f * dt;
      b.s += b.v * dt;
      // le rail : jamais hors de la piste (une perle appelée bute aux extrémités)
      const max = b.curve ? r.L + b.len + 8 : r.L;
      if (!b.curve && r.closed) {
        // piste fermée : on en fait le tour (queue et tête décalées ensemble)
        const sh = b.s >= r.L ? -r.L : b.s < 0 ? r.L : 0;
        b.s += sh;
        b.tail += sh;
        b.prev += sh;
      } else if (b.s < 0) {
        b.s = 0;
        b.v = Math.abs(b.v) * 0.2;
      } else if (b.s > max) {
        b.s = max;
        b.v = -Math.abs(b.v) * 0.2;
      }
      // la queue suit la tête avec retard, vers sa longueur au repos : lancée la coulée s'étire, freinée elle se
      // ramasse ; elle se retourne (lentement) quand on la repousse dans l'autre sens
      if (Math.abs(b.v) > 25) b.dir += (Math.sign(b.v) - b.dir) * Math.min(1, dt * 2.2);
      const want = b.s - b.len * b.dir;
      b.tail += (want - b.tail) * (1 - Math.exp(-dt / b.lag));
      // tracé initial : la piste se dépose sous la tête (jamais elle ne recule)
      if (b.reveal && r.trace) {
        b.front = Math.max(b.front, Math.min(r.L + 2, b.s));
        r.trace.style.strokeDashoffset = String(r.L + 2 - b.front);
      }
      for (const dd of r.dots) {
        const a0 = dd.f * r.L;
        if ((b.prev < a0 && b.s >= a0) || (b.prev > a0 && b.s <= a0) || (b.prev === 0 && a0 === 0 && b.age < dt * 2)) popDot(dd.el);
      }
      b.prev = b.s;
      if (b.curve) {
        if (b.t > b.T && Math.min(b.s, b.tail) >= r.L - 1) b.fade = 1;
        else if (b.t > b.T + 1.5) b.fade += dt * 3;
      } else {
        b.idle = Math.abs(b.v) < 8 ? b.idle + dt : 0;
        if (!(b.res && inside) && (b.idle > 1.3 || (!b.res && b.age > 9))) b.fade += dt * 2.5;
      }
      if (b.fade >= 1) {
        if (b.reveal && r.trace) r.trace.style.strokeDashoffset = '0';
        beads.delete(b);
        r.busy = false;
      }
    }

    // ── rendu (canvas effacé puis redessiné : quelques traits)
    ctx.setTransform(dpr, 0, 0, dpr, PAD * dpr, PAD * dpr);
    ctx.clearRect(-PAD, -PAD, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // épines du champ (instabilité de Rosensweig)
    if (field > 0.02) {
      ctx.strokeStyle = `rgba(255,255,255,${(0.5 * field).toFixed(3)})`;
      ctx.lineWidth = 0.7;
      // un seul trait pour toutes les pistes libres ; les pistes en partie cachées (carte de derrière) à part, découpées
      let open = false;
      for (const r of rails) {
        if (r.ghost || mx < r.box[0] - A || mx > r.box[2] + A || my < r.box[1] - A || my > r.box[3] + A) continue;
        if (r.hide) continue;
        if (!open) {
          ctx.beginPath();
          open = true;
        }
        spines(r, A, spd);
      }
      if (open) ctx.stroke();
      for (const r of rails) {
        if (!r.hide || r.ghost || mx < r.box[0] - A || mx > r.box[2] + A || my < r.box[1] - A || my > r.box[3] + A) continue;
        ctx.save();
        ctx.clip(r.hide, 'evenodd');
        ctx.beginPath();
        spines(r, A, spd);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const b of beads) {
      if (b.delay > 0) continue;
      const r = b.r;
      const op = Math.min(1, b.age / 0.15) * (1 - b.fade);
      if (op <= 0.01) continue;
      if (r.hide) {
        ctx.save();
        ctx.clip(r.hide, 'evenodd');
      }
      coulee(b, op);
      if (r.hide) ctx.restore();
    }

    // au repos complet (curseur immobile, plus rien ne bouge) la boucle s'endort ; le prochain geste la réveille
    let moving = field > 0.01 && field < 0.99;
    for (const b of beads) if (b.curve || b.delay > 0 || b.fade > 0 || Math.abs(b.v) > 2 || Math.abs(b.s - b.dir * b.len - b.tail) > 0.5) moving = true;
    const calm = inside && now - P.t > 2500 && !moving;
    if (!calm && (beads.size || inside || field > 0.01)) raf = requestAnimationFrame(tick);
    else if (!beads.size && !inside) ctx.clearRect(-PAD, -PAD, W, H);
  };

  // ── tracé initial (quand la carte devient visible), puis courant ambiant planifié
  let drawn = false;
  let visible = false;
  let hover = false;
  let timer = 0;
  const drawAll = () => {
    drawn = true;
    const t0 = 0.18 + Number(card.dataset.artDelay || 0) / 1000;
    // (départs étalés : le dessin se construit lentement, pièce par pièce ; la piste se dépose sous la perle)
    for (const r of rails) pulse(r, SPEED, { delay: t0 + r.at * 1.6, reveal: true });
    const total = Math.max(...rails.map((r) => r.at * 1.6 + Math.max(0.9, (r.L + TAIL) / (SPEED * r.quick)))) + t0;
    timer = window.setTimeout(() => {
      ready = true;
      schedule();
    }, (total + 0.6) * 1000);
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!visible || document.hidden || !host.isConnected || !ready) return;
    const free = rails.filter((r) => !r.busy);
    // (curseur sur la page : ce sont les coulées attirées qui vivent, pas le courant ambiant)
    if (free.length && !P.on) pulse(free[Math.floor(Math.random() * free.length)], hover ? PULSE_SPEED * 1.3 : PULSE_SPEED);
    timer = window.setTimeout(schedule, hover ? 1100 + Math.random() * 700 : (fine ? 3600 : 5000) + Math.random() * 3000);
  };
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible && !drawn) drawAll();
        else if (visible && drawn) schedule();
      }, { threshold: 0.2 })
    : null;
  if (io) io.observe(card);
  else {
    visible = true;
    drawAll();
  }
  const onVis = () => !document.hidden && drawn && schedule();
  document.addEventListener('visibilitychange', onVis);
  const enter = () => {
    hover = true;
    if (ready) timer = window.setTimeout(schedule, 300);
  };
  const leaveH = () => {
    hover = false;
  };
  if (fine) {
    card.addEventListener('pointerenter', enter);
    card.addEventListener('pointerleave', leaveH);
  }

  return () => {
    clearTimeout(timer);
    io?.disconnect();
    ro?.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    card.removeEventListener('pointerenter', enter);
    card.removeEventListener('pointerleave', leaveH);
    unlisten();
    cancelAnimationFrame(raf);
  };
}
