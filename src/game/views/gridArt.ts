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
   * Le TRACÉ INITIAL (une fois, quand la carte devient visible) : animations écrites d'avance. Ensuite, le fluide
   * est simulé (plus bas) pour que le curseur puisse le pousser. ÉLASTIQUE : chaque épaisseur suit la même progression à friction, mais avec un RETARD croissant (la
   * tête part la première, la traîne la rattrape) ; quand la tête se décolle, la coulée s'étire, quand elle colle, la
   * traîne la rejoint et la goutte se ramasse. La tête gonfle quand elle est freinée et s'affine quand elle glisse.
   * Keyframes échantillonnées (linéaires entre elles), remplissage « backwards » : rien ne reste accroché.
   */
  const SAMPLES = 44;
  const drawFlow = (w: Wire, delay: number, speed: number) => {
    const draw = true;
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
    wires.forEach((w) => drawFlow(w, t0 + w.at * 1600, SPEED));
    const total = Math.max(...wires.map((w) => w.at * 1600 + Math.max(900, ((w.L + TAIL) / (SPEED * w.quick)) * 1000)));
    // fin du tracé : les pistes passent au fluide simulé (les couches reçoivent leurs valeurs « au repos » en style)
    timer = window.setTimeout(() => {
      for (const w of wires) {
        hideWire(w);
        w.busy = false;
      }
      ready = true;
      schedule();
    }, t0 + total + 400);
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!visible || document.hidden || !host.isConnected || !ready) return;
    const free = wires.filter((w) => !w.busy);
    if (free.length) pulse(free[Math.floor(Math.random() * free.length)], hover ? PULSE_SPEED * 1.4 : PULSE_SPEED);
    timer = window.setTimeout(schedule, hover ? 900 + Math.random() * 600 : (fine ? 3200 : 4600) + Math.random() * 3000);
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
  // survol : surtension — les pistes repartent en cascade, puis les impulsions s'enchaînent
  const surge: number[] = [];
  const enter = () => {
    hover = true;
    if (!ready) return;
    wires.forEach((w, i) => surge.push(window.setTimeout(() => pulse(w, PULSE_SPEED * 1.4), i * 140)));
    timer = window.setTimeout(schedule, 600);
  };
  const leaveH = () => {
    hover = false;
  };
  if (fine) {
    card.addEventListener('pointerenter', enter);
    card.addEventListener('pointerleave', leaveH);
  }

  // ═══ FERROFLUIDE SUR RAILS (V2, 08/11). Retours de Tom : « comme un fluide magnétique repoussé par l'aura du
  // curseur, avec de la vélocité selon la vitesse du curseur », puis « le ferrofluide ne PEUT PAS quitter son chemin
  // (les lignes des illustrations), il est fixé sur ces lignes ; on peut le faire se déplacer SUR celles-ci, mais en
  // aucun cas il ne doit pouvoir les quitter ».
  // Donc le fluide n'a qu'UN degré de liberté : sa position s le long de la piste (en px). Le dessin ne bouge jamais.
  //  - le curseur le repousse LE LONG de la piste : la répulsion de l'aura est projetée sur la tangente (il fuit le
  //    curseur en glissant sur son rail), et il est entraîné par la composante du geste parallèle à la piste ;
  //  - inertie + friction : frottement visqueux, et une friction statique (immobile, il ne repart que si la poussée
  //    dépasse un seuil : il « colle », puis se décolle) ;
  //  - élastique : la coulée suit la tête par trois « suiveurs » à retards différents (cœur, milieu, traîne) — lancée,
  //    elle s'étire ; freinée, elle se ramasse en goutte ; la tête gonfle quand elle est arrêtée ;
  //  - une impulsion (ambiante ou au survol) est une goutte tirée par un « guide » qui suit la courbe à friction
  //    (`frictionCurve`) par un ressort : si le curseur la retient, le ressort se tend et elle repart d'un coup ;
  //  - le curseur qui bouge près d'une piste y fait naître une goutte à l'endroit le plus proche (fluide « appelé »),
  //    qu'on peut ensuite pousser ; elle se résorbe quand elle ne bouge plus.
  // Une seule boucle rAF par dessin, active seulement tant qu'une goutte vit ou que le curseur est là.
  const FOLLOW = [0.2, 0.09, 0.045]; // retards des suiveurs (s) : traîne, milieu, cœur (ordre de TAPER)
  const FOLLOW_GLOW = 0.07;
  const MINLEN = [3, 5, 6]; // longueur minimale de chaque épaisseur (goutte au repos)
  const PUSH = 1500; // poussée maximale de l'aura le long de la piste (px/s²)
  const DRAG = 3.2; // entraînement par la composante du geste le long de la piste
  const VISC = 2.6; // frottement visqueux (1/s)
  const STATIC = 160; // friction statique : poussée minimale pour décoller une goutte arrêtée (px/s²)
  const GUIDE_K = 38; // ressort du guide (impulsions)
  const GUIDE_C = 8.5;
  interface Blob { w: Wire; s: number; v: number; fol: number[]; fg: number; t: number; T: number; curve: ((t: number) => number) | null; idle: number; age: number; fade: number; prev: number }
  const blobs = new Set<Blob>();
  let ready = false;

  // échantillons de chaque piste (repère local) : point le plus proche du curseur, tangente
  const samples = wires.map((w, wi) => {
    const st = c.strokes[wi];
    const m = /rotate\(\s*(-?[\d.]+)(?:[ ,]+(-?[\d.]+)[ ,]+(-?[\d.]+))?\s*\)/.exec(st.transform ?? '');
    const ang = m ? (Number(m[1]) * Math.PI) / 180 : 0;
    const src = built[wi].src;
    const n = Math.max(2, Math.round(w.L / 4) + 1);
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pt = src.getPointAtLength((w.L * i) / (n - 1));
      xs[i] = pt.x;
      ys[i] = pt.y;
    }
    return { xs, ys, n, cos: Math.cos(ang), sin: Math.sin(ang), cx: m?.[2] ? Number(m[2]) : 0, cy: m?.[3] ? Number(m[3]) : 0 };
  });
  /** point (repère du dessin) et tangente unitaire à l'abscisse s de la piste wi */
  const at = (wi: number, s: number) => {
    const sm = samples[wi];
    const L = wires[wi].L;
    const u = Math.max(0, Math.min(1, s / L)) * (sm.n - 1);
    const i = Math.min(sm.n - 2, Math.floor(u));
    const f = u - i;
    const lx = sm.xs[i] + (sm.xs[i + 1] - sm.xs[i]) * f;
    const ly = sm.ys[i] + (sm.ys[i + 1] - sm.ys[i]) * f;
    let tx = sm.xs[i + 1] - sm.xs[i];
    let ty = sm.ys[i + 1] - sm.ys[i];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const { cos, sin, cx, cy } = sm;
    return {
      x: cx + (lx - cx) * cos - (ly - cy) * sin,
      y: cy + (lx - cx) * sin + (ly - cy) * cos,
      tx: tx * cos - ty * sin,
      ty: tx * sin + ty * cos,
    };
  };
  /** abscisse de la piste wi la plus proche du point (x, y) du dessin, et la distance */
  const nearestOn = (wi: number, x: number, y: number) => {
    const sm = samples[wi];
    const { cos, sin, cx, cy } = sm;
    // point du dessin → repère local de la piste
    const lx = cx + (x - cx) * cos + (y - cy) * sin;
    const ly = cy - (x - cx) * sin + (y - cy) * cos;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < sm.n; i++) {
      const d = (sm.xs[i] - lx) ** 2 + (sm.ys[i] - ly) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { s: (best / (sm.n - 1)) * wires[wi].L, d: Math.sqrt(bd) };
  };

  const css = (el: SVGElement, k: string, v: string) => el.style.setProperty(k, v);
  /** remet une piste au repos (toutes les couches invisibles, par le style : il prime sur les attributs) */
  const hideWire = (w: Wire) => {
    for (const l of w.layers) css(l.el, 'opacity', '0');
    css(w.head, 'opacity', '0');
    css(w.glow, 'opacity', '0');
  };
  /** dessine la goutte : chaque couche est le segment [suiveur, tête] de la piste (au moins MINLEN de long) */
  const render = (b: Blob) => {
    const w = b.w;
    const gap = (w.L + TAIL) * 3 + 40;
    const op = Math.min(1, b.age / 0.12) * (1 - b.fade);
    const sp = Math.abs(b.v);
    w.layers.forEach((l, j) => {
      const a0 = Math.min(b.s, b.fol[j]);
      const len = Math.max(MINLEN[j], Math.abs(b.s - b.fol[j]));
      // (la goutte est centrée sur la tête quand elle est ramassée)
      const start = len === MINLEN[j] ? b.s - len / 2 : a0;
      css(l.el, 'stroke-dasharray', `${len.toFixed(1)} ${gap}`);
      css(l.el, 'stroke-dashoffset', (-start).toFixed(1));
      css(l.el, 'opacity', op.toFixed(3));
    });
    css(w.head, 'stroke-dasharray', `0.01 ${gap}`);
    css(w.head, 'stroke-dashoffset', (-b.s).toFixed(1));
    css(w.head, 'opacity', op.toFixed(3));
    // la tête gonfle à l'arrêt, s'affine lancée
    css(w.head, 'stroke-width', Math.max(7, Math.min(13.5, 13.5 - Math.min(2.7, sp / 110) * 2.4)).toFixed(2));
    const g0 = Math.min(b.s, b.fg);
    const gl = Math.max(26, Math.abs(b.s - b.fg));
    css(w.glow, 'stroke-dasharray', `${gl.toFixed(1)} ${gap}`);
    css(w.glow, 'stroke-dashoffset', (-(gl === 26 ? b.s - 13 : g0)).toFixed(1));
    css(w.glow, 'opacity', (op * (0.28 + 0.32 * Math.min(1, sp / 220))).toFixed(3));
  };
  const spawn = (w: Wire, s: number, v: number, curve: Blob['curve'], T: number) => {
    if (w.busy || !ready) return null;
    w.busy = true;
    const b: Blob = { w, s, v, fol: [s, s, s], fg: s, t: 0, T, curve, idle: 0, age: 0, fade: 0, prev: s };
    blobs.add(b);
    wake();
    return b;
  };
  /** impulsion : une goutte tirée par son guide d'un bout à l'autre de la piste */
  const pulse = (w: Wire, speed: number) =>
    spawn(w, 0, 0, frictionCurve(w.L, rng(Math.floor(Math.random() * 1e9) + 1)), Math.max(0.9, (w.L + TAIL) / (speed * w.quick)));
  const popDot = (el: SVGCircleElement) =>
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.9)', offset: 0.3 }, { transform: 'scale(0.86)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 900, easing: 'cubic-bezier(0.34, 1.3, 0.5, 1)' });

  // curseur dans le repère du dessin, vitesse lissée, intensité de l'aura
  let mx = -9999;
  let my = -9999;
  let cvx = 0;
  let cvy = 0;
  let lastT = 0;
  let inside = false;
  let field = 0;
  let raf = 0;
  let lastFrame = 0;
  let lastCall = 0;
  const toSvg = (e: PointerEvent) => {
    const ctm = svg.getScreenCTM();
    return ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()) : null;
  };
  const onMove = (e: PointerEvent) => {
    const pt = toSvg(e);
    if (!pt) return;
    const t = performance.now();
    if (lastT && t - lastT < 200) {
      const dt = Math.max(8, t - lastT) / 1000;
      cvx = cvx * 0.55 + ((pt.x - mx) / dt) * 0.45;
      cvy = cvy * 0.55 + ((pt.y - my) / dt) * 0.45;
    } else {
      cvx = 0;
      cvy = 0;
    }
    mx = pt.x;
    my = pt.y;
    lastT = t;
    inside = true;
    wake();
  };
  const onOut = () => {
    inside = false;
    lastT = 0;
  };
  // (au doigt, le fluide se calme dès qu'on lève le doigt)
  const onUp = (e: PointerEvent) => e.pointerType !== 'mouse' && onOut();
  const wake = () => {
    if (raf) return;
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const tick = (now: number) => {
    raf = 0;
    if (!host.isConnected) return;
    const dt = Math.min(1 / 30, (now - lastFrame) / 1000);
    lastFrame = now;
    field += ((inside ? 1 : 0) - field) * Math.min(1, dt * (inside ? 7 : 3.5));
    if (!inside) {
      cvx *= 0.9;
      cvy *= 0.9;
    }
    const spd = Math.hypot(cvx, cvy);
    const A = 62 + Math.min(70, spd * 0.06);
    const boost = field * (1 + Math.min(2.2, spd / 520));
    aura.setAttribute('cx', mx.toFixed(1));
    aura.setAttribute('cy', my.toFixed(1));
    aura.setAttribute('r', (A * (0.6 + 0.4 * field)).toFixed(1));
    aura.style.opacity = String(field * (0.35 + Math.min(0.65, spd / 1400)));

    // le curseur qui bouge près d'une piste libre y fait naître une goutte, au point le plus proche
    if (ready && inside && spd > 90 && now - lastCall > (spd > 700 ? 380 : 750)) {
      let bw = -1;
      let bs = 0;
      let bd = A * 0.8;
      wires.forEach((w, wi) => {
        if (w.busy) return;
        const r = nearestOn(wi, mx, my);
        if (r.d < bd) {
          bd = r.d;
          bw = wi;
          bs = r.s;
        }
      });
      if (bw >= 0) {
        lastCall = now;
        const p = at(bw, bs);
        // elle naît déjà poussée dans le sens du geste (le long de la piste)
        spawn(wires[bw], bs, (cvx * p.tx + cvy * p.ty) * 0.5, null, 0);
      }
    }

    for (const b of blobs) {
      const w = b.w;
      b.age += dt;
      b.t += dt;
      // force du curseur, projetée sur la piste
      let f = 0;
      if (boost > 0.002) {
        const p = at(wires.indexOf(w), b.s);
        const dx = p.x - mx;
        const dy = p.y - my;
        const d = Math.hypot(dx, dy) + 0.001;
        if (d < A) {
          const q = 1 - d / A;
          const q2 = q * q;
          f += ((dx / d) * p.tx + (dy / d) * p.ty) * PUSH * q2 * boost; // répulsion, le long du rail
          f += (cvx * p.tx + cvy * p.ty) * q2 * DRAG * field; // sillage du geste, le long du rail
        }
      }
      if (b.curve) {
        // impulsion : ressort vers le guide (qui suit la courbe à friction), puis il s'écoule au bout
        const g = b.curve(Math.min(1, b.t / b.T)) * (w.L + 30);
        f += GUIDE_K * (g - b.s) - GUIDE_C * b.v;
      } else {
        // goutte appelée : frottement visqueux + friction statique
        f -= VISC * b.v;
        if (Math.abs(b.v) < 6 && Math.abs(f) < STATIC) {
          b.v = 0;
          f = 0;
        }
      }
      b.v += f * dt;
      b.s += b.v * dt;
      // rail : jamais hors de la piste (une goutte appelée bute aux extrémités et rebondit à peine)
      const max = b.curve ? w.L + TAIL : w.L;
      if (b.s < 0) {
        b.s = 0;
        b.v = Math.abs(b.v) * 0.25;
      } else if (b.s > max) {
        b.s = max;
        b.v = -Math.abs(b.v) * 0.25;
      }
      // suiveurs élastiques (cœur, milieu, traîne, lueur)
      b.fol.forEach((x, j) => (b.fol[j] = x + (b.s - x) * (1 - Math.exp(-dt / FOLLOW[j]))));
      b.fg += (b.s - b.fg) * (1 - Math.exp(-dt / FOLLOW_GLOW));
      // gouttes posées sur la piste : elles gonflent au passage
      for (const dd of w.dots) {
        const at0 = dd.f * w.L;
        if ((b.prev < at0 && b.s >= at0) || (b.prev > at0 && b.s <= at0)) popDot(dd.el);
      }
      b.prev = b.s;
      // fin de vie : impulsion arrivée au bout (et écoulée), goutte appelée immobile depuis un moment
      if (b.curve) {
        if (b.t > b.T && b.s >= w.L + TAIL * 0.8) b.fade += dt * 4;
      } else {
        b.idle = Math.abs(b.v) < 8 ? b.idle + dt : 0;
        if (b.idle > 1.4 || b.age > 9) b.fade += dt * 2.5;
      }
      if (b.fade >= 1) {
        blobs.delete(b);
        hideWire(w);
        w.busy = false;
        continue;
      }
      render(b);
    }
    if (blobs.size || inside || field > 0.01) raf = requestAnimationFrame(tick);
    else aura.style.opacity = '0';
  };
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerdown', onMove);
  card.addEventListener('pointerleave', onOut);
  card.addEventListener('pointercancel', onOut);
  card.addEventListener('pointerup', onUp);

  return () => {
    clearTimeout(timer);
    surge.forEach((t) => clearTimeout(t));
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
