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
 * Le courant est une goutte d'encre lumineuse : une tête ronde qui « respire », une coulée qui s'effile en trois
 * épaisseurs (fusionnées par un filtre « gluant » sur ordinateur) et une lueur floue ; il avance comme un fluide épais
 * (départ lent, poussée, puis il s'étire et s'écoule) et laisse derrière lui la piste fine. Des gouttes se posent aux
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
        quick: 2.6,
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

/** vitesse moyenne du courant (px/s) : lente, comme un fluide épais */
const SPEED = 230;
const PULSE_SPEED = 300;
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
/** instant (0–1) où la courbe OOZE atteint l'avancée `p` (pour poser une goutte pile au passage) */
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
  const flow = (w: Wire, delay: number, speed: number, draw: boolean) => {
    if (w.busy && !draw) return;
    w.busy = true;
    const span = w.L + TAIL;
    const duration = Math.max(420, (span / (speed * w.quick)) * 1000);
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
    if (draw && w.trace) {
      // la piste reste : l'attribut prend sa valeur finale, l'animation (en attente) montre le début
      w.trace.setAttribute('stroke-dashoffset', '0');
      along(w.trace, span);
    }
    // gouttes : elles gonflent quand la tête passe sur elles, puis se posent
    for (const dt of w.dots) {
      if (draw) dt.el.classList.add('on');
      run(dt.el, [{ transform: 'scale(0.2)', opacity: draw ? 0 : 1 }, { transform: 'scale(2.1)', opacity: 1, offset: 0.35 }, { transform: 'scale(0.9)', offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], {
        delay: delay + Math.max(0, oozeAt((dt.f * w.L) / span) * duration - 100),
        duration: 900,
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
    wires.forEach((w) => flow(w, t0 + w.at * 1000, SPEED, true));
    const total = Math.max(...wires.map((w) => w.at * 1000 + ((w.L + TAIL) / (SPEED * w.quick)) * 1000));
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
