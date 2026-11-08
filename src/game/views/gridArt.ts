/**
 * DESSINS « COURANT » de l'accueil des jeux (V2, 08/11).
 *  1re version : « des formes créées par une sorte de courant électrique épais et visqueux, aligné sur la grille du
 *  fond » ; 2e : « plus fluide, moins géométrique, plus fondu, presque organique » ; 3e : « pas assez descriptif, les
 *  anciennes illustrations étaient meilleures, mais avec cet effet ».
 *
 * Donc : les dessins d'origine (deux cartes inclinées et « VS », huit cartes en anneau autour d'une table, roue à
 * 36 crans avec sa bille), tracés par le courant. Le dessin reste posé sur la trame (son coin est recalé sur un point
 * de la grille), mais ses formes sont libres.
 *
 * Le courant est une goutte d'encre lumineuse : une tête ronde, une coulée qui s'effile en trois épaisseurs
 * (fusionnées par un filtre « gluant » sur ordinateur) et une lueur floue. Il avance LENTEMENT et avec FRICTION
 * (4e retour : « trop rapide, pas assez vivant, élastique ») : par à-coups, il colle, se décolle, glisse un peu trop
 * loin et revient ; la traîne le suit avec retard comme un élastique ; il laisse derrière lui la piste fine. Des gouttes se posent aux
 * points clés (moyeu, bille). Ensuite une impulsion repasse de temps en temps (la bille fait un tour de roue) ; au
 * survol, le dessin s'emballe.
 *
 * Coût : 3 petits SVG (≈ 236 px), animations WAAPI de `stroke-dashoffset` / `opacity` / `transform` / `stroke-width`
 * seulement, pas de boucle infinie (impulsions planifiées une à une, remplissage « backwards » : rien ne s'accumule),
 * arrêt hors écran et onglet caché. Téléphone : pas de filtres, impulsions plus rares. Mouvement réduit / « Effets
 * réduits » : le dessin est tracé d'emblée, immobile.
 */
import { reducedMotion } from '../../core/motion';

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

/**
 * vitesse moyenne du courant (px/s), arrêts compris : lente, comme un fluide épais qui frotte sur sa piste
 * (retour 08/11 : « trop rapide, pas assez vivant, organique, élastique, comme s'il y avait plus de friction »)
 */
const SPEED = 105;
const PULSE_SPEED = 140;
/** coulée effilée : longueur de chaque épaisseur (la plus fine est la plus longue) */
const TAPER = [
  { cls: 'tail', len: 96 },
  { cls: 'mid', len: 44 },
  { cls: 'core', len: 16 },
];
const TAIL = TAPER[0].len;
const GLOW = 64;
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
 * Monte le dessin animé de `kind` dans `host` (dans la carte `card`, dans le défilement `scroller` qui porte la
 * trame). Renvoie le démontage.
 */
export function mountGridArt(host: HTMLElement, card: HTMLElement, scroller: HTMLElement, kind: ArtKind): () => void {
  const c = DRAWINGS[kind];
  const W = c.w + PAD * 2;
  const H = c.h + PAD * 2;
  const fine = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const still = reducedMotion();
  const id = `gm-art-${++uid}`;

  const svg = svgEl('svg', { viewBox: `${-PAD} ${-PAD} ${W} ${H}`, width: W, height: H, fill: 'none', 'aria-hidden': 'true', class: 'gm-art' });
  const defs = svgEl('defs', {});
  svg.append(defs);
  if (fine) {
    // « gluant » : flou + seuil d'opacité → les épaisseurs de la coulée et les gouttes fusionnent en une seule matière
    const goo = svgEl('filter', { id: `${id}-goo`, x: '-30%', y: '-30%', width: '160%', height: '160%' });
    goo.append(svgEl('feGaussianBlur', { stdDeviation: 3.2 }), svgEl('feColorMatrix', { values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8' }));
    // lueur fondue autour de la goutte
    const soft = svgEl('filter', { id: `${id}-soft`, x: '-40%', y: '-40%', width: '180%', height: '180%' });
    soft.append(svgEl('feGaussianBlur', { stdDeviation: 6 }));
    defs.append(goo, soft);
  }
  const gGroove = svgEl('g', { class: 'groove' });
  const gTrace = svgEl('g', { class: 'trace' });
  const gGlow = svgEl('g', fine ? { class: 'glow soft', filter: `url(#${id}-soft)` } : { class: 'glow' });
  const gWet = svgEl('g', fine ? { class: 'wet', filter: `url(#${id}-goo)` } : { class: 'wet' });
  svg.append(gGroove, gTrace, gGlow, gWet);

  /**
   * Chaque tracé n'a qu'UNE géométrie (un chemin source dans <defs>) ; toutes ses couches (sillon, piste, lueur,
   * coulée, tête) sont des <use> qui la reprennent. Quand le fluide est déformé (curseur, plus bas), on ne réécrit
   * donc qu'un seul `d` par tracé et par image.
   */
  interface Wire { quick: number; L: number; trace: SVGUseElement | null; glow: SVGUseElement; layers: Array<{ el: SVGUseElement; len: number }>; head: SVGUseElement; dots: Array<{ el: SVGCircleElement; f: number }>; at: number; busy: boolean }
  const built = c.strokes.map((st, k) => {
    // deux géométries : le DESSIN (sillon + piste, toujours fixe) et le FLUIDE (coulée, lueur, tête), seul déformé par
    // le curseur (08/11 : « ça déforme tout alors qu'on devait contrôler uniquement le fluide vivant »)
    const src = svgEl('path', { id: `${id}-s${k}`, d: st.d });
    const fluid = svgEl('path', { id: `${id}-f${k}`, d: st.d });
    defs.append(src, fluid);
    // masque : tout visible sauf la forme qui passe devant
    let mask: string | undefined;
    if (st.hide) {
      const m = svgEl('mask', { id: `${id}-m${k}`, maskUnits: 'userSpaceOnUse', x: -200, y: -200, width: 600, height: 600 });
      m.append(svgEl('rect', { x: -200, y: -200, width: 600, height: 600, fill: '#fff' }), svgEl('path', { d: st.hide.d, transform: st.hide.transform, fill: '#000' }));
      defs.append(m);
      mask = `url(#${id}-m${k})`;
    }
    const mk = (g: SVGGElement, a: Record<string, string | number | undefined> = {}, geo: 's' | 'f' = 's') => {
      const e = svgEl('use', { href: `#${id}-${geo}${k}`, transform: st.transform, mask, ...a });
      g.append(e);
      return e;
    };
    if (!st.ghost) {
      mk(gGroove, { class: 'halo' });
      mk(gGroove, { class: 'line' });
    }
    return {
      st,
      src,
      fluid,
      trace: st.ghost ? null : mk(gTrace, { class: st.dim ? 'dim' : 'line' }),
      glow: mk(gGlow, { class: 'line' }, 'f'),
      layers: TAPER.filter((t) => !st.ghost || t.cls !== 'tail').map((t) => ({ el: mk(gWet, { class: t.cls }, 'f'), len: t.len })),
      head: mk(gWet, { class: st.ghost ? 'head ball' : 'head' }, 'f'),
      // gouttes (dans le groupe gluant : la coulée qui arrive s'y fond)
      dots: (st.dots ?? []).map(([x, y, f, r]) => {
        const el = svgEl('circle', { cx: x, cy: y, r: r ?? 3.4, transform: st.transform, class: still ? 'drop on' : 'drop' });
        gWet.append(el);
        return { el, f };
      }),
    };
  });
  // l'aura du curseur (un halo très pâle), sous la coulée
  const aura = svgEl('circle', { class: 'aura', cx: -999, cy: -999, r: 1 });
  gGroove.before(aura);
  host.append(svg);
  // longueurs réelles (mesurées une fois l'élément dans la page)
  const wires: Wire[] = built.map((b) => {
    const L = b.src.getTotalLength();
    const span = L + TAIL;
    // (marge : le fluide déformé par le curseur est un peu plus long que la piste au repos)
    const gap = span * 3 + 40;
    // trace : un seul tiret dont l'avant suit la tête → la piste apparaît derrière la goutte
    b.trace?.setAttribute('stroke-dasharray', `${span * 1.4} ${gap}`);
    b.trace?.setAttribute('stroke-dashoffset', String(still ? 0 : span * 1.4));
    // (au repos, chaque tiret est rangé bien AVANT le début de la piste : aucune pointe ronde ne dépasse)
    b.glow.setAttribute('stroke-dasharray', `${GLOW} ${gap}`);
    b.glow.setAttribute('stroke-dashoffset', String(GLOW + 40));
    b.glow.setAttribute('opacity', '0');
    for (const l of b.layers) {
      l.el.setAttribute('stroke-dasharray', `${l.len} ${gap}`);
      l.el.setAttribute('stroke-dashoffset', String(l.len + 40));
    }
    b.head.setAttribute('stroke-dasharray', `0.01 ${gap}`);
    b.head.setAttribute('stroke-dashoffset', '60');
    return { quick: b.st.quick ?? 1, L, trace: b.trace, glow: b.glow, layers: b.layers, head: b.head, dots: b.dots, at: b.st.at, busy: false };
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
  /**
   * Un passage. ÉLASTIQUE : chaque épaisseur suit la même progression à friction, mais avec un RETARD croissant (la
   * tête part la première, la traîne la rattrape) ; quand la tête se décolle, la coulée s'étire, quand elle colle, la
   * traîne la rejoint et la goutte se ramasse. La tête gonfle quand elle est freinée et s'affine quand elle glisse.
   * Keyframes échantillonnées (linéaires entre elles), remplissage « backwards » : rien ne reste accroché.
   */
  const SAMPLES = 44;
  const flow = (w: Wire, delay: number, speed: number, draw: boolean) => {
    if (w.busy && !draw) return;
    w.busy = true;
    const curve = frictionCurve(w.L, rng(Math.floor(Math.random() * 1e9) + 1));
    const span = w.L + TAIL;
    const duration = Math.max(900, (span / (speed * w.quick)) * 1000);
    const o: KeyframeAnimationOptions = { delay, duration, easing: 'linear', fill: 'backwards' };
    /** avant de la couche (px) à l'instant t, avec un retard `lag` (part de la durée) ; elle finit d'exister à `end` */
    const front = (t: number, lag: number, end: number) => curve(Math.min(1, Math.max(0, (t - lag) / (1 - lag)))) * end;
    const sample = (len: number, lag: number, end: number, extra?: (t: number) => Keyframe) =>
      Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const t = i / SAMPLES;
        // (opacité 0 au tout début : pendant l'attente d'un départ décalé, aucune goutte ne patiente au point de départ)
        return { offset: t, strokeDashoffset: len - front(t, lag, end), opacity: Math.min(1, t / (0.03 + lag)), ...(extra?.(t) ?? {}) } as Keyframe;
      });
    // vitesse instantanée de la tête (normalisée) → épaisseur : freinée = gonflée, lancée = étirée
    const speedAt = (t: number) => Math.abs(curve(Math.min(1, t + 0.012)) - curve(Math.max(0, t - 0.012))) / 0.024;
    const LAG: Record<string, number> = { core: 0.025, mid: 0.06, tail: 0.11 };
    for (const l of w.layers) run(l.el, sample(l.len, LAG[l.el.getAttribute('class') ?? 'core'] ?? 0.04, w.L + l.len), o);
    run(w.head, sample(0.01, 0, w.L + 30, (t) => ({ strokeWidth: Math.max(7, Math.min(14, 13.5 - speedAt(t) * 2.4)) })), o);
    const g = run(w.glow, sample(GLOW, 0.015, w.L + GLOW, (t) => ({ opacity: t > 0.97 ? 0 : Math.min(1, t / 0.05) * (0.3 + 0.3 * Math.min(1, speedAt(t) / 2)) })), o);
    const free = () => (w.busy = false);
    g.addEventListener('finish', free);
    g.addEventListener('cancel', free);
    if (draw && w.trace) {
      // la piste reste : l'attribut prend sa valeur finale ; elle se dépose sous la goutte (même retard que le cœur)
      w.trace.setAttribute('stroke-dashoffset', '0');
      run(w.trace, sample(span * 1.4, 0.025, w.L + TAIL, () => ({ opacity: 1 })), o);
    }
    // gouttes : elles gonflent quand la tête passe sur elles, puis se posent
    for (const dt of w.dots) {
      if (draw) dt.el.classList.add('on');
      let tHit = 1;
      for (let i = 0; i <= 200; i++) {
        if (curve(i / 200) * (w.L + 30) >= dt.f * w.L) {
          tHit = i / 200;
          break;
        }
      }
      run(dt.el, [{ transform: 'scale(0.2)', opacity: draw ? 0 : 1 }, { transform: 'scale(2.2)', opacity: 1, offset: 0.3 }, { transform: 'scale(0.82)', offset: 0.55 }, { transform: 'scale(1.08)', offset: 0.75 }, { transform: 'scale(1)', opacity: 1 }], {
        delay: delay + Math.max(0, tHit * duration - 120),
        duration: 1300,
        easing: 'cubic-bezier(0.34, 1.3, 0.5, 1)',
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
    // (départs étalés : le dessin se construit lentement, pièce par pièce)
    wires.forEach((w) => flow(w, t0 + w.at * 1600, SPEED, true));
    const total = Math.max(...wires.map((w) => w.at * 1600 + ((w.L + TAIL) / (SPEED * w.quick)) * 1000));
    timer = window.setTimeout(schedule, t0 + total + 900);
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!visible || document.hidden || !host.isConnected) return;
    const free = wires.filter((w) => !w.busy);
    if (free.length) flow(free[Math.floor(Math.random() * free.length)], 0, hover ? PULSE_SPEED * 1.4 : PULSE_SPEED, false);
    timer = window.setTimeout(schedule, hover ? 700 + Math.random() * 500 : (fine ? 3200 : 4600) + Math.random() * 3000);
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
    wires.forEach((w, i) => flow(w, i * 140, PULSE_SPEED * 1.4, false));
    timer = window.setTimeout(schedule, 400);
  };
  const leaveH = () => {
    hover = false;
  };
  if (fine) {
    card.addEventListener('pointerenter', enter);
    card.addEventListener('pointerleave', leaveH);
  }
  // ═══ FLUIDE MAGNÉTIQUE : l'aura du curseur repousse le liquide (V2, 08/11 : « comme un fluide magnétique repoussé
  // par l'aura du curseur, avec de la vélocité en fonction de la vitesse du curseur »).
  // Seul le FLUIDE bouge : le dessin (sillon, piste) reste à sa place ; la coulée qui le parcourt est écartée de la
  // piste par l'aura, puis y revient. Sa géométrie devient une chaîne de points (un tous les ~4 px) sur ressorts :
  //  - répulsion : dans l'aura (rayon ~62 px, qui grandit quand le curseur va vite), le liquide est poussé hors du
  //    curseur, d'autant plus fort que le curseur est rapide ;
  //  - sillage : il est aussi entraîné dans le sens du mouvement du curseur ;
  //  - tension de surface : chaque point tire ses voisins (la déformation reste une courbe, jamais une pointe) ;
  //  - ressort amorti (ζ ≈ 0,53) : il revient à sa place en ondulant, comme un liquide épais.
  // La boucle ne tourne que pendant l'interaction et le retour au calme, puis la géométrie d'origine est remise.
  const K = 64; // raideur du ressort de rappel
  const DAMP = 8.5; // amortissement (ζ ≈ 0,53 : il ondule deux ou trois fois puis se pose)
  const TENSION = 380; // tension de surface (entre voisins)
  const PUSH = 1500; // répulsion maximale (px/s²) — ≈ 23 px d'écart au cœur de l'aura, curseur immobile
  const DRAG = 5.5; // entraînement par la vitesse du curseur
  const MAXOFF = 30;
  interface Chain { rx: Float32Array; ry: Float32Array; ox: Float32Array; oy: Float32Array; vx: Float32Array; vy: Float32Array; n: number }
  interface Body { src: SVGPathElement; d0: string; chains: Chain[]; cos: number; sin: number; cx: number; cy: number; wire: number }
  let bodies: Body[] | null = null;
  const buildBodies = (): Body[] =>
    built.map((b, wi) => {
      const m = /rotate\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+))?\s*\)/.exec(b.st.transform ?? '');
      const ang = m ? (Number(m[1]) * Math.PI) / 180 : 0;
      // un sous-chemin par « M » (les 36 crans sont 36 petits sous-chemins : on ne les relie pas entre eux)
      const chains = b.st.d.split(/(?=M)/).filter((x) => x.trim()).map((sub) => {
        const tmp = svgEl('path', { d: sub });
        defs.append(tmp);
        const L = tmp.getTotalLength();
        const n = Math.max(2, Math.round(L / 4) + 1);
        const rx = new Float32Array(n);
        const ry = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const pt = tmp.getPointAtLength((L * i) / (n - 1));
          rx[i] = pt.x;
          ry[i] = pt.y;
        }
        tmp.remove();
        return { rx, ry, ox: new Float32Array(n), oy: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), n };
      });
      return { src: b.fluid, d0: b.st.d, chains, cos: Math.cos(ang), sin: Math.sin(ang), cx: m?.[2] ? Number(m[2]) : 0, cy: m?.[3] ? Number(m[3]) : 0, wire: wi };
    });

  // curseur dans le repère du dessin, vitesse lissée, intensité de l'aura (0 → 1 quand il est là, retombe en partant)
  let mx = -9999;
  let my = -9999;
  let cvx = 0;
  let cvy = 0;
  let lastT = 0;
  let inside = false;
  let field = 0;
  let raf = 0;
  let lastFrame = 0;
  let lastStir = 0;
  /** dernier instant où le curseur était là (garde-fou : 5 s après son départ, la boucle s'arrête quoi qu'il arrive) */
  let lastSeen = 0;
  const toSvg = (e: PointerEvent) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return pt;
  };
  const onMove = (e: PointerEvent) => {
    const pt = toSvg(e);
    if (!pt) return;
    const t = performance.now();
    if (lastT && t - lastT < 200) {
      const dt = Math.max(8, t - lastT) / 1000;
      // vitesse lissée (un capteur nerveux ferait trembler le liquide)
      cvx = cvx * 0.55 + ((pt.x - mx) / dt) * 0.45;
      cvy = cvy * 0.55 + ((pt.y - my) / dt) * 0.45;
    } else {
      cvx = 0;
      cvy = 0;
    }
    mx = pt.x;
    my = pt.y;
    lastT = t;
    lastSeen = t;
    inside = true;
    wake();
  };
  const onOut = () => {
    inside = false;
    lastT = 0;
  };
  // (au doigt, le liquide se calme dès qu'on lève le doigt)
  const onUp = (e: PointerEvent) => e.pointerType !== 'mouse' && onOut();
  const wake = () => {
    if (raf || still) return;
    bodies ??= buildBodies();
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const tick = (now: number) => {
    raf = 0;
    if (!host.isConnected || !bodies) return;
    let dt = Math.min(1 / 30, (now - lastFrame) / 1000);
    lastFrame = now;
    field += ((inside ? 1 : 0) - field) * Math.min(1, dt * (inside ? 7 : 3.5));
    if (!inside) {
      cvx *= 0.9;
      cvy *= 0.9;
    }
    const spd = Math.hypot(cvx, cvy);
    const A = 62 + Math.min(70, spd * 0.06);
    const A2 = A * A;
    const boost = field * (1 + Math.min(2.2, spd / 520));
    aura.setAttribute('cx', mx.toFixed(1));
    aura.setAttribute('cy', my.toFixed(1));
    aura.setAttribute('r', (A * (0.6 + 0.4 * field)).toFixed(1));
    aura.style.opacity = String(field * (0.35 + Math.min(0.65, spd / 1400)));
    let energy = 0;
    let nearest = -1;
    let nearD = Infinity;
    // (pas de temps découpé si l'image a été longue : la tension de surface reste stable)
    const sub = dt > 1 / 50 ? 2 : 1;
    dt /= sub;
    for (const b of bodies) {
      const { cos, sin, cx, cy } = b;
      let moved = false;
      for (const ch of b.chains) {
        const { rx, ry, ox, oy, vx, vy, n } = ch;
        for (let s = 0; s < sub; s++) {
          for (let i = 0; i < n; i++) {
            const lx = rx[i] + ox[i];
            const ly = ry[i] + oy[i];
            // repère local (tracé tourné) → repère du dessin
            const wx = cx + (lx - cx) * cos - (ly - cy) * sin;
            const wy = cy + (lx - cx) * sin + (ly - cy) * cos;
            const dx = wx - mx;
            const dy = wy - my;
            const d2 = dx * dx + dy * dy;
            let fx = 0;
            let fy = 0;
            if (boost > 0.002 && d2 < A2) {
              const d = Math.sqrt(d2) + 0.001;
              if (d < nearD) {
                nearD = d;
                nearest = b.wire;
              }
              const q = 1 - d / A;
              const q2 = q * q;
              const f = PUSH * q2 * boost;
              fx = (dx / d) * f + cvx * q2 * DRAG * field;
              fy = (dy / d) * f + cvy * q2 * DRAG * field;
            }
            // force (repère du dessin) → repère local du tracé
            const lfx = fx * cos + fy * sin;
            const lfy = -fx * sin + fy * cos;
            const pi = i > 0 ? i - 1 : i;
            const ni = i < n - 1 ? i + 1 : i;
            const ax = -K * ox[i] - DAMP * vx[i] + TENSION * (ox[pi] + ox[ni] - 2 * ox[i]) + lfx;
            const ay = -K * oy[i] - DAMP * vy[i] + TENSION * (oy[pi] + oy[ni] - 2 * oy[i]) + lfy;
            vx[i] += ax * dt;
            vy[i] += ay * dt;
            ox[i] = Math.max(-MAXOFF, Math.min(MAXOFF, ox[i] + vx[i] * dt));
            oy[i] = Math.max(-MAXOFF, Math.min(MAXOFF, oy[i] + vy[i] * dt));
          }
        }
        for (let i = 0; i < n; i++) {
          const e = Math.abs(ox[i]) + Math.abs(oy[i]) + (Math.abs(vx[i]) + Math.abs(vy[i])) * 0.02;
          if (e > energy) energy = e;
          if (e > 0.05) moved = true;
        }
      }
      // une seule géométrie à réécrire par tracé (toutes ses couches sont des <use>)
      if (moved) {
        let d = '';
        for (const ch of b.chains) {
          for (let i = 0; i < ch.n; i++) d += `${i ? 'L' : 'M'}${(ch.rx[i] + ch.ox[i]).toFixed(1)} ${(ch.ry[i] + ch.oy[i]).toFixed(1)}`;
        }
        b.src.setAttribute('d', d);
      } else if (b.src.getAttribute('d') !== b.d0) b.src.setAttribute('d', b.d0);
    }
    // le curseur qui bouge près d'une piste y appelle du fluide (une coulée part sur la piste la plus proche) : c'est
    // lui qu'on pousse et qu'on entraîne ensuite — plus le geste est vif, plus il en vient
    if (nearest >= 0 && spd > 90 && now - lastStir > (spd > 700 ? 450 : 900) && drawn) {
      lastStir = now;
      flow(wires[nearest], 0, PULSE_SPEED * 1.8, false);
    }
    if (inside || ((field > 0.01 || energy > 0.12) && now - lastSeen < 5000)) raf = requestAnimationFrame(tick);
    else {
      // retour au calme : géométrie d'origine exacte
      for (const b of bodies) {
        b.src.setAttribute('d', b.d0);
        for (const ch of b.chains) [ch.ox, ch.oy, ch.vx, ch.vy].forEach((a) => a.fill(0));
      }
      aura.style.opacity = '0';
    }
  };
  if (!still) {
    card.addEventListener('pointermove', onMove);
    card.addEventListener('pointerdown', onMove);
    card.addEventListener('pointerleave', onOut);
    card.addEventListener('pointercancel', onOut);
    card.addEventListener('pointerup', onUp);
  }

  return () => {
    clearTimeout(timer);
    io?.disconnect();
    ro?.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    card.removeEventListener('pointerenter', enter);
    card.removeEventListener('pointerleave', leaveH);
    card.removeEventListener('pointermove', onMove);
    card.removeEventListener('pointerdown', onMove);
    card.removeEventListener('pointerleave', onOut);
    card.removeEventListener('pointercancel', onOut);
    card.removeEventListener('pointerup', onUp);
    cancelAnimationFrame(raf);
    anims.forEach((a) => a.cancel());
  };
}
