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

  interface Wire { quick: number; L: number; trace: SVGPathElement | null; glow: SVGPathElement; layers: Array<{ el: SVGPathElement; len: number }>; head: SVGPathElement; dots: Array<{ el: SVGCircleElement; f: number }>; at: number; busy: boolean }
  const built = c.strokes.map((st, k) => {
    // masque : tout visible sauf la forme qui passe devant
    let mask: string | undefined;
    if (st.hide) {
      const m = svgEl('mask', { id: `${id}-m${k}`, maskUnits: 'userSpaceOnUse', x: -200, y: -200, width: 600, height: 600 });
      m.append(svgEl('rect', { x: -200, y: -200, width: 600, height: 600, fill: '#fff' }), svgEl('path', { d: st.hide.d, transform: st.hide.transform, fill: '#000' }));
      defs.append(m);
      mask = `url(#${id}-m${k})`;
    }
    const mk = (g: SVGGElement, a: Record<string, string | number | undefined> = {}) => {
      const e = svgEl('path', { d: st.d, transform: st.transform, mask, ...a });
      g.append(e);
      return e;
    };
    if (!st.ghost) {
      mk(gGroove, { class: 'halo' });
      mk(gGroove);
    }
    return {
      st,
      trace: st.ghost ? null : mk(gTrace, { class: st.dim ? 'dim' : undefined }),
      glow: mk(gGlow),
      layers: TAPER.filter((t) => !st.ghost || t.cls !== 'tail').map((t) => ({ el: mk(gWet, { class: t.cls }), len: t.len })),
      head: mk(gWet, { class: st.ghost ? 'head ball' : 'head' }),
      // gouttes (dans le groupe gluant : la coulée qui arrive s'y fond)
      dots: (st.dots ?? []).map(([x, y, f, r]) => {
        const el = svgEl('circle', { cx: x, cy: y, r: r ?? 3.4, transform: st.transform, class: still ? 'drop on' : 'drop' });
        gWet.append(el);
        return { el, f };
      }),
    };
  });
  host.append(svg);
  // longueurs réelles (mesurées une fois l'élément dans la page)
  const wires: Wire[] = built.map((b) => {
    const L = b.head.getTotalLength();
    const span = L + TAIL;
    const gap = span * 2 + 20;
    // trace : un seul tiret de longueur « span » dont l'avant suit la tête → la piste apparaît derrière la goutte
    b.trace?.setAttribute('stroke-dasharray', `${span} ${gap}`);
    b.trace?.setAttribute('stroke-dashoffset', String(still ? 0 : span));
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
    const sample = (len: number, lag: number, end: number, extra?: (t: number, i: number) => Keyframe) =>
      Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const t = i / SAMPLES;
        // (opacité 0 au tout début : pendant l'attente d'un départ décalé, aucune goutte ne patiente au point de départ)
        return { offset: t, strokeDashoffset: len - front(t, lag, end), opacity: Math.min(1, t / (0.03 + lag)), ...(extra?.(t, i) ?? {}) } as Keyframe;
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
      run(w.trace, sample(span, 0.025, w.L + TAIL, () => ({ opacity: 1 })), o);
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
