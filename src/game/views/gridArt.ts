/**
 * DESSINS « COURANT » de l'accueil des jeux (V2, 08/11 : « les formes créées par une sorte de courant électrique un
 * peu épais et visqueux, aligné sur la grille du fond, optimisé PC et mobile »).
 *
 * Chaque dessin est un petit circuit tracé SUR les points de la trame de fond (pas de 22 px, `.games::before`) :
 * uniquement des segments qui vont d'un point à un autre (horizontaux, verticaux, diagonales à 45°). Un courant épais
 * part de l'entrée du circuit et dessine les formes en avançant ; sa tête est une goutte qui « colle » aux angles
 * (filtre gluant, ordinateur seulement), il laisse derrière lui la piste fine, chaque sommet s'allume en soudure au
 * passage. Ensuite, de temps en temps, une impulsion repasse sur une piste ; au survol, tout le circuit s'emballe.
 *
 * Coût : 3 petits SVG (≈ 200 px), animations WAAPI de `stroke-dashoffset` / `opacity` / `transform` seulement, pas de
 * boucle infinie : les impulsions sont planifiées une à une et s'arrêtent dès que la carte sort de l'écran, que
 * l'onglet est caché ou que la page est quittée. Téléphone : pas de filtre, impulsions plus rares. Mouvement réduit /
 * « Effets réduits » : le circuit est dessiné d'emblée, immobile.
 */
import { reducedMotion } from '../../core/motion';

export type ArtKind = 'duel' | 'royale' | 'roulette';

/** pas de la trame (style.css : `.games::before`, 22 px) ; les points sont au CENTRE de chaque case */
const G = 22;
const DOT = G / 2;
/** marge autour du circuit (épaisseur de la lueur) */
const PAD = 14;

type Pt = [number, number];
interface Circuit {
  w: number;
  h: number;
  /** pistes en unités de grille ; `at` = départ (s) relatif au début du dessin */
  paths: Array<{ pts: Pt[]; at: number }>;
}

const rect = (x0: number, y0: number, x1: number, y1: number, from: 'tl' | 'bl' | 'l' = 'tl'): Pt[] =>
  from === 'bl'
    ? [[x0, y1], [x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    : [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

/** circuits dessinés sur la grille (unités = cases de 22 px) */
const CIRCUITS: Record<ArtKind, Circuit> = {
  // deux cartes face à face, reliées par un pont ; le courant entre par le bas à gauche et ressort à droite
  duel: {
    w: 9,
    h: 7,
    paths: [
      { pts: [[0, 6], [1, 6], [1, 5]], at: 0 },
      { pts: rect(1, 1, 4, 5, 'bl'), at: 0.12 },
      { pts: [[4, 3], [5, 3]], at: 0.62 },
      { pts: [[5, 3], [5, 2], [8, 2], [8, 6], [5, 6], [5, 3]], at: 0.7 },
      { pts: [[8, 4], [9, 4]], at: 1.25 },
      { pts: [[2, 2], [3, 2]], at: 0.5 },
      { pts: [[6, 5], [7, 5]], at: 1.1 },
    ],
  },
  // une table centrale, huit places autour, reliées en étoile
  royale: {
    w: 9,
    h: 9,
    paths: [
      { pts: [[3, 3], [6, 3], [6, 6], [3, 6], [3, 3]], at: 0 },
      ...([
        [[4, 3], [4, 1]], [[6, 3], [7, 2]], [[6, 4], [8, 4]], [[6, 6], [7, 7]],
        [[5, 6], [5, 8]], [[3, 6], [2, 7]], [[3, 5], [1, 5]], [[3, 3], [2, 2]],
      ] as Pt[][]).map((pts, i) => ({ pts, at: 0.5 + i * 0.06 })),
      ...([
        rect(4, 0, 5, 1), rect(7, 1, 8, 2), rect(8, 4, 9, 5), rect(7, 7, 8, 8),
        rect(4, 8, 5, 9), rect(1, 7, 2, 8), rect(0, 4, 1, 5), rect(1, 1, 2, 2),
      ]).map((pts, i) => ({ pts, at: 0.78 + i * 0.06 })),
    ],
  },
  // roue octogonale (le cercle mis au pas de la grille), rayons, moyeu
  roulette: {
    w: 9,
    h: 9,
    paths: [
      { pts: [[3, 0], [6, 0], [9, 3], [9, 6], [6, 9], [3, 9], [0, 6], [0, 3], [3, 0]], at: 0 },
      { pts: [[4, 2], [5, 2], [7, 4], [7, 5], [5, 7], [4, 7], [2, 5], [2, 4], [4, 2]], at: 0.55 },
      ...([
        [[4, 0], [4, 2]], [[5, 0], [5, 2]], [[9, 4], [7, 4]], [[9, 5], [7, 5]],
        [[5, 9], [5, 7]], [[4, 9], [4, 7]], [[0, 5], [2, 5]], [[0, 4], [2, 4]],
      ] as Pt[][]).map((pts, i) => ({ pts, at: 0.9 + i * 0.05 })),
      { pts: [[4, 4], [5, 4], [5, 5], [4, 5], [4, 4]], at: 1.35 },
    ],
  },
};

const NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
};
const len = (pts: Pt[]) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) * G, 0);

/** vitesse du courant (px/s) : lente, comme un fluide épais */
const SPEED = 210;
const PULSE_SPEED = 300;
/** longueur de la « coulée » épaisse derrière la tête */
const WET = 46;
let uid = 0;

/**
 * Monte le dessin animé de `kind` dans `host` (coin haut-droit de la carte `card`, dans le défilement `scroller` qui
 * porte la trame). Renvoie le démontage.
 */
export function mountGridArt(host: HTMLElement, card: HTMLElement, scroller: HTMLElement, kind: ArtKind): () => void {
  const c = CIRCUITS[kind];
  const W = c.w * G + PAD * 2;
  const H = c.h * G + PAD * 2;
  const fine = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = reducedMotion();
  const id = `gm-goo-${++uid}`;

  const svg = svgEl('svg', { viewBox: `${-PAD} ${-PAD} ${W} ${H}`, width: W, height: H, fill: 'none', 'aria-hidden': 'true', class: 'gm-art' });
  // filtre « gluant » : flou + seuil d'opacité → les gouttes fusionnent aux angles (ordinateur seulement)
  if (fine) {
    const f = svgEl('filter', { id, x: '-20%', y: '-20%', width: '140%', height: '140%' });
    f.append(svgEl('feGaussianBlur', { stdDeviation: 2.4 }), svgEl('feColorMatrix', { values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7' }));
    const defs = svgEl('defs', {});
    defs.append(f);
    svg.append(defs);
  }
  const gGroove = svgEl('g', { class: 'groove' });
  const gTrace = svgEl('g', { class: 'trace' });
  const gGlow = svgEl('g', { class: 'glow' });
  const gWet = svgEl('g', fine ? { class: 'wet', filter: `url(#${id})` } : { class: 'wet' });
  const gNodes = svgEl('g', { class: 'nodes' });
  svg.append(gGroove, gTrace, gGlow, gWet, gNodes);

  interface Wire { L: number; trace: SVGPathElement; glow: SVGPathElement; wet: SVGPathElement; head: SVGPathElement; nodes: Array<{ el: SVGCircleElement; at: number }>; at: number; busy: boolean }
  const wires: Wire[] = c.paths.map((p) => {
    const d = `M${p.pts.map(([x, y]) => `${x * G} ${y * G}`).join(' L')}`;
    const L = len(p.pts);
    const mk = (g: SVGGElement, a: Record<string, string | number>) => {
      const e = svgEl('path', { d, ...a });
      g.append(e);
      return e;
    };
    mk(gGroove, {});
    const trace = mk(gTrace, { 'stroke-dasharray': `${L} ${L + 1}`, 'stroke-dashoffset': still ? 0 : L });
    const gap = L + WET * 2 + 10;
    const glow = mk(gGlow, { 'stroke-dasharray': `${WET} ${gap}`, 'stroke-dashoffset': WET, opacity: 0 });
    const wet = mk(gWet, { 'stroke-dasharray': `${WET} ${gap}`, 'stroke-dashoffset': WET, opacity: 0 });
    const head = mk(gWet, { class: 'head', 'stroke-dasharray': `0.01 ${gap}`, 'stroke-dashoffset': 0, opacity: 0 });
    // soudures : un point à chaque sommet (sans doublon de départ / d'arrivée d'un rectangle fermé)
    let acc = 0;
    const nodes = p.pts.map((pt, i) => {
      if (i) acc += Math.hypot(pt[0] - p.pts[i - 1][0], pt[1] - p.pts[i - 1][1]) * G;
      const el = svgEl('circle', { cx: pt[0] * G, cy: pt[1] * G, r: 2.6, class: still ? 'on' : '' });
      gNodes.append(el);
      return { el, at: L ? acc / L : 0 };
    });
    return { L, trace, glow, wet, head, nodes, at: p.at, busy: false };
  });
  host.append(svg);

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

  // ── un passage de courant sur une piste : tête + coulée épaisse + lueur, puis la goutte se résorbe
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
    const dur = Math.max(160, (w.L / speed) * 1000);
    const tail = (WET / speed) * 1000;
    // (« backwards » seulement : un passage terminé ne reste pas accroché à l'élément — les attributs, eux, valent
    // « éteint » — sinon les animations s'empileraient à chaque impulsion)
    const o = { delay, duration: dur + tail, easing: 'linear', fill: 'backwards' as FillMode };
    // la tête parcourt 0 → L, la coulée suit (offset = WET − d), puis s'écoule hors de la piste
    const end = w.L + WET;
    const k = dur / (dur + tail);
    run(w.head, [{ strokeDashoffset: 0, opacity: 1 }, { strokeDashoffset: -w.L, opacity: 1, offset: k }, { strokeDashoffset: -w.L, opacity: 0 }], o);
    run(w.wet, [{ strokeDashoffset: WET, opacity: 1 }, { strokeDashoffset: WET - end, opacity: 1 }], o);
    // lueur électrique : un léger scintillement (pas un néon fixe)
    const g = run(w.glow, [{ strokeDashoffset: WET, opacity: 0.16 }, { opacity: 0.3, offset: 0.2 }, { opacity: 0.12, offset: 0.35 }, { opacity: 0.34, offset: 0.55 }, { opacity: 0.18, offset: 0.8 }, { strokeDashoffset: WET - end, opacity: 0 }], o);
    const free = () => (w.busy = false);
    g.addEventListener('finish', free);
    g.addEventListener('cancel', free);
    if (draw) {
      // la piste reste tracée : l'attribut prend sa valeur finale, l'animation (en attente) montre le début
      w.trace.setAttribute('stroke-dashoffset', '0');
      run(w.trace, [{ strokeDashoffset: w.L }, { strokeDashoffset: 0 }], { delay, duration: dur, easing: 'linear', fill: 'backwards' });
    }
    // soudures : elles s'allument quand la tête passe
    for (const n of w.nodes) {
      if (draw) n.el.classList.add('on');
      run(n.el, draw ? [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(2)', opacity: 1, offset: 0.35 }, { transform: 'scale(1)', opacity: 1 }] : [{ transform: 'scale(1)' }, { transform: 'scale(1.8)', offset: 0.3 }, { transform: 'scale(1)' }], {
        delay: delay + n.at * dur,
        duration: 420,
        easing: 'cubic-bezier(0.34, 1.45, 0.5, 1)',
        fill: draw ? 'backwards' : 'none',
      });
    }
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
    const total = Math.max(...wires.map((w) => w.at * 1000 + (w.L / SPEED) * 1000));
    timer = window.setTimeout(schedule, t0 + total + 900);
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!visible || document.hidden || !host.isConnected) return;
    const free = wires.filter((w) => !w.busy);
    if (free.length) flow(free[Math.floor(Math.random() * free.length)], 0, hover ? PULSE_SPEED * 1.6 : PULSE_SPEED, false);
    timer = window.setTimeout(schedule, hover ? 260 + Math.random() * 260 : (fine ? 2200 : 3400) + Math.random() * 2600);
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
    wires.forEach((w, i) => flow(w, i * 40, PULSE_SPEED * 1.6, false));
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
