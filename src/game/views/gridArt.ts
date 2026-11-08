/**
 * DESSINS « COURANT » de l'accueil des jeux (V2, 08/11).
 *  1re version : « des formes créées par une sorte de courant électrique épais et visqueux, aligné sur la grille du
 *  fond » ; 2e (même jour) : « plus fluide, moins géométrique, plus fondu, presque organique ».
 *
 * Chaque dessin est un circuit ANCRÉ sur les points de la trame de fond (pas de 22 px, `.games::before`) : les pistes
 * partent et arrivent sur des points de la grille, mais leurs angles sont arrondis en grandes courbes (un petit carré
 * devient un cercle, l'octogone de la roulette devient une roue). Le courant est une goutte d'encre lumineuse :
 * une tête ronde, une coulée qui s'effile en trois épaisseurs (fusionnées par un filtre « gluant » sur ordinateur) et
 * une lueur floue ; il avance comme un fluide épais (départ lent, poussée, puis il s'étire et s'écoule) et laisse
 * derrière lui la piste fine. Aux extrémités, des gouttes gonflent puis se posent.
 * Ensuite une impulsion repasse de temps en temps ; au survol, le circuit s'emballe.
 *
 * Coût : 3 petits SVG (≈ 230 px), animations WAAPI de `stroke-dashoffset` / `opacity` / `transform` seulement, pas de
 * boucle infinie (impulsions planifiées une à une, remplissage « backwards » : rien ne s'accumule), arrêt hors écran
 * et onglet caché. Téléphone : pas de filtre (lueur en trait large et pâle), impulsions plus rares. Mouvement réduit /
 * « Effets réduits » : le circuit est dessiné d'emblée, immobile.
 */
import { reducedMotion } from '../../core/motion';

export type ArtKind = 'duel' | 'royale' | 'roulette';

/** pas de la trame (style.css : `.games::before`, 22 px) ; les points sont au CENTRE de chaque case */
const G = 22;
const DOT = G / 2;
/** marge autour du circuit (épaisseur de la lueur floue) */
const PAD = 18;
/** rayon des courbes aux angles (borné à la moitié des segments : un carré d'une case devient un cercle) */
const ROUND = G * 0.95;

type Pt = [number, number];
interface Circuit {
  w: number;
  h: number;
  /** pistes en unités de grille ; `at` = départ (s) relatif au début du dessin */
  paths: Array<{ pts: Pt[]; at: number }>;
}

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

/** circuits ancrés sur la grille (unités = cases de 22 px) */
const CIRCUITS: Record<ArtKind, Circuit> = {
  // deux cartes face à face, reliées par un pont ; le courant entre par le bas à gauche et ressort à droite
  duel: {
    w: 9,
    h: 7,
    paths: [
      { pts: [[0, 6], [1, 6], [1, 4]], at: 0 },
      { pts: [[1, 4], [1, 1], [4, 1], [4, 5], [1, 5], [1, 4]], at: 0.25 },
      { pts: [[4, 3], [5, 3]], at: 0.95 },
      { pts: [[5, 3], [5, 2], [8, 2], [8, 6], [5, 6], [5, 3]], at: 1.05 },
      { pts: [[8, 4], [9, 4]], at: 1.85 },
      { pts: [[2, 2], [3, 2]], at: 0.7 },
      { pts: [[6, 5], [7, 5]], at: 1.6 },
    ],
  },
  // une table centrale, huit places autour (des gouttes au bout des rayons enroulés)
  royale: {
    w: 9,
    h: 9,
    paths: [
      { pts: rect(3, 3, 6, 6), at: 0 },
      ...([
        // rayons qui s'enroulent dans le même sens (turbine) : chaque coude devient une courbe
        [[4, 3], [4, 1], [5, 0]], [[6, 3], [7, 2], [8, 2]], [[6, 4], [8, 4], [9, 5]], [[6, 6], [7, 7], [7, 8]],
        [[5, 6], [5, 8], [4, 9]], [[3, 6], [2, 7], [1, 7]], [[3, 5], [1, 5], [0, 4]], [[3, 3], [2, 2], [2, 1]],
      ] as Pt[][]).map((pts, i) => ({ pts, at: 0.7 + i * 0.07 })),
    ],
  },
  // roue (octogone arrondi), couronne intérieure, rayons, moyeu
  roulette: {
    w: 9,
    h: 9,
    paths: [
      { pts: [[3, 0], [6, 0], [9, 3], [9, 6], [6, 9], [3, 9], [0, 6], [0, 3], [3, 0]], at: 0 },
      { pts: [[4, 2], [5, 2], [7, 4], [7, 5], [5, 7], [4, 7], [2, 5], [2, 4], [4, 2]], at: 0.8 },
      ...([
        [[4, 0], [4, 2]], [[5, 0], [5, 2]], [[9, 4], [7, 4]], [[9, 5], [7, 5]],
        [[5, 9], [5, 7]], [[4, 9], [4, 7]], [[0, 5], [2, 5]], [[0, 4], [2, 4]],
      ] as Pt[][]).map((pts, i) => ({ pts, at: 1.3 + i * 0.06 })),
      { pts: rect(4, 4, 5, 5), at: 1.85 },
    ],
  },
};

/**
 * Tracé lissé : chaque angle devient une courbe (quadratique, de rayon ROUND borné à la moitié des segments voisins).
 * Piste ouverte : les extrémités restent EXACTEMENT sur les points de la grille. Piste fermée : boucle sans angle.
 */
function smooth(pts: Pt[]): { d: string; closed: boolean; ends: Pt[] } {
  const P = pts.map(([x, y]) => [x * G, y * G] as Pt);
  const closed = P.length > 2 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1];
  const V = closed ? P.slice(0, -1) : P;
  const n = V.length;
  const f = (v: number) => Math.round(v * 100) / 100;
  const toward = (a: Pt, b: Pt, k: number): Pt => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [a[0] + (dx / l) * k, a[1] + (dy / l) * k];
  };
  const seg = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const corner = (prev: Pt, c: Pt, next: Pt) => {
    const r = Math.min(ROUND, seg(prev, c) / 2, seg(c, next) / 2);
    const a = toward(c, prev, r);
    const b = toward(c, next, r);
    return ` L${f(a[0])} ${f(a[1])} Q${f(c[0])} ${f(c[1])} ${f(b[0])} ${f(b[1])}`;
  };
  let d: string;
  if (closed) {
    const m: Pt = [(V[0][0] + V[1][0]) / 2, (V[0][1] + V[1][1]) / 2];
    d = `M${f(m[0])} ${f(m[1])}`;
    for (let i = 1; i <= n; i++) d += corner(V[i - 1], V[i % n], V[(i + 1) % n]);
    d += ` L${f(m[0])} ${f(m[1])}`;
  } else {
    d = `M${V[0][0]} ${V[0][1]}`;
    for (let i = 1; i < n - 1; i++) d += corner(V[i - 1], V[i], V[i + 1]);
    d += ` L${V[n - 1][0]} ${V[n - 1][1]}`;
  }
  return { d, closed, ends: closed ? [] : [pts[0], pts[pts.length - 1]] };
}

const NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
};

/** vitesse moyenne du courant (px/s) : lente, comme un fluide épais */
const SPEED = 165;
const PULSE_SPEED = 230;
/** coulée effilée : longueur de chaque épaisseur (la plus fine est la plus longue) */
const TAPER = [
  { cls: 'tail', len: 96 },
  { cls: 'mid', len: 44 },
  { cls: 'core', len: 16 },
];
const TAIL = TAPER[0].len;
const GLOW = 64;
/** fluide épais : départ lent, poussée, puis la goutte s'étire et s'écoule */
const OOZE_P = [0.55, 0.08, 0.3, 1] as const;
const OOZE = `cubic-bezier(${OOZE_P.join(', ')})`;
/** instant (0–1) où la courbe OOZE atteint l'avancée `p` (pour allumer la goutte d'arrivée pile au passage) */
const oozeAt = (p: number) => {
  const [x1, y1, x2, y2] = OOZE_P;
  const bz = (t: number, a: number, b: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (bz(m, y1, y2) < p) lo = m;
    else hi = m;
  }
  return bz((lo + hi) / 2, x1, x2);
};
let uid = 0;

/**
 * Monte le dessin animé de `kind` dans `host` (dans la carte `card`, dans le défilement `scroller` qui porte la
 * trame). Renvoie le démontage.
 */
export function mountGridArt(host: HTMLElement, card: HTMLElement, scroller: HTMLElement, kind: ArtKind): () => void {
  const c = CIRCUITS[kind];
  const W = c.w * G + PAD * 2;
  const H = c.h * G + PAD * 2;
  const fine = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = reducedMotion();
  const id = `gm-art-${++uid}`;

  const svg = svgEl('svg', { viewBox: `${-PAD} ${-PAD} ${W} ${H}`, width: W, height: H, fill: 'none', 'aria-hidden': 'true', class: 'gm-art' });
  if (fine) {
    // « gluant » : flou + seuil d'opacité → les épaisseurs de la coulée et les gouttes fusionnent en une seule matière
    const goo = svgEl('filter', { id: `${id}-goo`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
    goo.append(svgEl('feGaussianBlur', { stdDeviation: 3.2 }), svgEl('feColorMatrix', { values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8' }));
    // lueur fondue autour de la goutte
    const soft = svgEl('filter', { id: `${id}-soft`, x: '-40%', y: '-40%', width: '180%', height: '180%' });
    soft.append(svgEl('feGaussianBlur', { stdDeviation: 6 }));
    const defs = svgEl('defs', {});
    defs.append(goo, soft);
    svg.append(defs);
  }
  const gGroove = svgEl('g', { class: 'groove' });
  const gTrace = svgEl('g', { class: 'trace' });
  const gGlow = svgEl('g', fine ? { class: 'glow soft', filter: `url(#${id}-soft)` } : { class: 'glow' });
  const gWet = svgEl('g', fine ? { class: 'wet', filter: `url(#${id}-goo)` } : { class: 'wet' });
  svg.append(gGroove, gTrace, gGlow, gWet);

  interface Wire { L: number; trace: SVGPathElement; glow: SVGPathElement; layers: Array<{ el: SVGPathElement; len: number }>; head: SVGPathElement; drops: SVGCircleElement[]; at: number; busy: boolean }
  const built = c.paths.map((p) => {
    const sm = smooth(p.pts);
    const mk = (g: SVGGElement, a: Record<string, string | number> = {}) => {
      const e = svgEl('path', { d: sm.d, ...a });
      g.append(e);
      return e;
    };
    mk(gGroove, { class: 'halo' });
    mk(gGroove);
    return {
      p,
      trace: mk(gTrace),
      glow: mk(gGlow),
      layers: TAPER.map((t) => ({ el: mk(gWet, { class: t.cls }), len: t.len })),
      head: mk(gWet, { class: 'head' }),
      // gouttes aux extrémités (dans le groupe gluant : la coulée qui arrive s'y fond)
      drops: sm.ends.map(([x, y]) => {
        const el = svgEl('circle', { cx: x * G, cy: y * G, r: fine ? 4.6 : 3.4, class: still ? 'drop on' : 'drop' });
        gWet.append(el);
        return el;
      }),
    };
  });
  host.append(svg);
  // longueurs réelles des courbes (mesurées une fois l'élément dans la page)
  const wires: Wire[] = built.map((b) => {
    const L = b.trace.getTotalLength();
    const span = L + TAIL;
    const gap = span * 2 + 20;
    // trace : un seul tiret de longueur « span » dont l'avant suit la tête → la piste apparaît derrière la goutte
    b.trace.setAttribute('stroke-dasharray', `${span} ${gap}`);
    b.trace.setAttribute('stroke-dashoffset', String(still ? 0 : span));
    b.glow.setAttribute('stroke-dasharray', `${GLOW} ${gap}`);
    // (au repos, chaque tiret est rangé bien AVANT le début de la piste : aucune pointe ronde ne dépasse)
    b.glow.setAttribute('stroke-dashoffset', String(GLOW + 40));
    b.glow.setAttribute('opacity', '0');
    for (const l of b.layers) {
      l.el.setAttribute('stroke-dasharray', `${l.len} ${gap}`);
      l.el.setAttribute('stroke-dashoffset', String(l.len + 40));
    }
    b.head.setAttribute('stroke-dasharray', `0.01 ${gap}`);
    b.head.setAttribute('stroke-dashoffset', '60');
    return { L, trace: b.trace, glow: b.glow, layers: b.layers, head: b.head, drops: b.drops, at: b.p.at, busy: false };
  });

  // ── aligner les sommets sur les points de la trame (positions de mise en page, sans les transformations)
  const place = () => {
    let x = 0;
    let y = 0;
    for (let e: HTMLElement | null = card; e && e !== scroller; e = e.offsetParent as HTMLElement | null) {
      x += e.offsetLeft;
      y += e.offsetTop;
    }
    x += card.clientLeft;
    y += card.clientTop;
    // ordinateur (3 colonnes) : le circuit occupe une « platine » en haut de la carte, le texte est dessous ;
    // téléphone (1 colonne) : un fragment du circuit dépasse du coin haut-droit, en retrait derrière le titre
    const plate = typeof matchMedia === 'function' && matchMedia('(min-width: 861px)').matches;
    const wantX = plate ? card.clientWidth - c.w * G - 26 : card.clientWidth - c.w * G * 0.6;
    const wantY = plate ? 22 + ((9 - c.h) * G) / 2 : -c.h * G * 0.22;
    const snap = (v: number) => DOT + G * Math.round((v - DOT) / G);
    host.style.transform = `translate(${snap(x + wantX) - x - PAD}px, ${snap(y + wantY) - y - PAD}px)`;
    host.style.width = `${W}px`;
    host.style.height = `${H}px`;
  };
  place();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
  ro?.observe(card);

  if (still) return () => ro?.disconnect();

  // ── un passage de courant : l'avant de chaque couche est en d (0 → L + TAIL, courbe « fluide épais ») ; pour un
  // tiret de longueur ℓ, offset = ℓ − d. Tout ce qui dépasse la fin de la piste n'est simplement pas dessiné.
  const anims = new Set<Animation>();
  const run = (el: Element, kf: Keyframe[], o: KeyframeAnimationOptions) => {
    const a = el.animate(kf, o);
    anims.add(a);
    const off = () => anims.delete(a);
    a.addEventListener('finish', off);
    a.addEventListener('cancel', off);
    return a;
  };
  const flow = (w: Wire, delay: number, speed: number, draw: boolean) => {
    if (w.busy && !draw) return;
    w.busy = true;
    const span = w.L + TAIL;
    const duration = Math.max(420, (span / speed) * 1000);
    // (« backwards » seulement : un passage terminé ne reste pas accroché à l'élément, les attributs valent « éteint »)
    const o: KeyframeAnimationOptions = { delay, duration, easing: OOZE, fill: 'backwards' };
    const along = (el: SVGPathElement, l: number, extra: Keyframe[] = []) =>
      run(el, [{ strokeDashoffset: l, offset: 0 }, ...extra, { strokeDashoffset: l - span, offset: 1 }], o);
    for (const l of w.layers) along(l.el, l.len);
    // la tête « respire » (elle gonfle et dégonfle en avançant) ; elle disparaît en fin de piste
    along(w.head, 0.01, [{ strokeWidth: 12, offset: 0.25 }, { strokeWidth: 9, offset: 0.5 }, { strokeWidth: 11.5, offset: 0.7 }]);
    const g = along(w.glow, GLOW, [{ opacity: 0.55, offset: 0.08 }, { opacity: 0.35, offset: 0.5 }, { opacity: 0.6, offset: 0.75 }, { opacity: 0, offset: 0.98 }]);
    const free = () => (w.busy = false);
    g.addEventListener('finish', free);
    g.addEventListener('cancel', free);
    if (draw) {
      // la piste reste : l'attribut prend sa valeur finale, l'animation (en attente) montre le début
      w.trace.setAttribute('stroke-dashoffset', '0');
      along(w.trace, span);
    }
    // gouttes aux extrémités : celle du départ gonfle tout de suite, celle de l'arrivée quand la tête l'atteint
    const arrive = oozeAt(w.L / span) * duration;
    w.drops.forEach((el, i) => {
      if (draw) el.classList.add('on');
      run(el, [{ transform: 'scale(0.2)', opacity: draw ? 0 : 1 }, { transform: 'scale(2.3)', opacity: 1, offset: 0.35 }, { transform: 'scale(0.9)', offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], {
        delay: delay + (i ? arrive - 120 : 40),
        duration: 900,
        easing: 'cubic-bezier(0.34, 1.3, 0.5, 1)',
        fill: draw ? 'backwards' : 'none',
      });
    });
  };

  // ── dessin initial (quand la carte devient visible), puis impulsions planifiées une à une
  let drawn = false;
  let visible = false;
  let hover = false;
  let timer = 0;
  const drawAll = () => {
    drawn = true;
    const t0 = 180 + Number(card.dataset.artDelay || 0);
    wires.forEach((w) => flow(w, t0 + w.at * 1000, SPEED, true));
    const total = Math.max(...wires.map((w) => w.at * 1000 + ((w.L + TAIL) / SPEED) * 1000));
    timer = window.setTimeout(schedule, t0 + total + 900);
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!visible || document.hidden || !host.isConnected) return;
    const free = wires.filter((w) => !w.busy);
    if (free.length) flow(free[Math.floor(Math.random() * free.length)], 0, hover ? PULSE_SPEED * 1.6 : PULSE_SPEED, false);
    timer = window.setTimeout(schedule, hover ? 320 + Math.random() * 320 : (fine ? 2400 : 3600) + Math.random() * 2600);
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
  // survol : surtension — toutes les pistes repartent en cascade, puis les impulsions s'enchaînent
  const enter = () => {
    hover = true;
    if (!drawn) return;
    wires.forEach((w, i) => flow(w, i * 55, PULSE_SPEED * 1.5, false));
    timer = window.setTimeout(schedule, 400);
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
    anims.forEach((a) => a.cancel());
  };
}
