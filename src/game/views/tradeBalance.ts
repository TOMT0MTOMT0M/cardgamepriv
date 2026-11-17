import { t as tr } from '../../core/i18n';
import { Spring } from '../../core/ease';
import { SPRING } from '../../core/motion';

/**
 * (V3, lot 09 + moment signature S5) FLÉAU D'ÉQUITÉ du composeur d'échange — remplace la mini-jauge recréée par
 * `gauge.outerHTML = …` à chaque carte. Une balance d'horloger en acier noir et blanc, PERSISTANTE (créée une fois) :
 *  - à gauche le plateau « tu donnes », à droite « tu reçois » ; chaque carte posée y fait une petite plaque (pleine à
 *    partir de 4★) ;
 *  - le fléau penche du côté le plus lourd (valeur des cartes, même barème que l'anti-abus), sur [-24°, +24°], piloté
 *    par un ressort amorti (SPRING.carte) : une carte qui arrive donne une impulsion, le fléau oscille puis se pose ;
 *  - quand l'échange est équilibré (même seuil que « Échange équilibré. »), le fléau se cale dans le cran zéro de
 *    l'aiguille, le cran s'allume en blanc et un fin clic de centrage sonne, une fois ;
 *  - deux instances pilotées par le même ressort : la grande dans le volet ouvert, une petite dans la barre du volet
 *    (téléphone, volet replié), pour voir le fléau bouger sans ouvrir le volet.
 * Rien ne tourne au repos : la boucle d'images s'arrête dès que le fléau est posé.
 */
export type BalSide = 'give' | 'get';
export interface BalState {
  /** valeur de chaque côté (core/economy cardsValue) */
  vg: number;
  vr: number;
  /** paliers (0 = 1★ … 5 = 6★) des cartes de chaque côté, un par exemplaire */
  give: number[];
  get: number[];
  /** équilibré au sens du composeur (fairness « ok ») avec des cartes des deux côtés */
  balanced: boolean;
}
export interface TradeBalance {
  /** la grande balance (volet) */
  el: HTMLElement;
  /** la petite (barre du volet) */
  mini: HTMLElement;
  /** nouvel état ; `kick` : une carte vient de tomber sur ce plateau (impulsion selon son palier) */
  set(s: BalState, kick?: { side: BalSide; tier: number }): void;
  /** le plateau visible d'un côté (grande balance si elle est affichée, sinon la petite), cible des cartes qui volent */
  pan(side: BalSide): Element | null;
  /** texte sous la balance (« tu donnes 4★ (≈ 400) contre 2★ (≈ 15) ») */
  text(html: string): void;
}

/** course de l'aiguille (degrés) */
const MAX = 24;
/** le fléau démultiplie : il penche deux fois moins que l'aiguille (12° au plus — les plateaux restent dans le cadre) */
const BEAM_K = 0.5;
/** bras du fléau, pivot (unités du viewBox) */
const ARM = 92;
const PX = 120;
const PY = 34;
/** hauteur des plateaux sous le bout du fléau */
const DROP = 30;
/** débattement vertical d'un bout du fléau à pleine inclinaison */
const SWING = Math.ceil(ARM * Math.sin((MAX * BEAM_K * Math.PI) / 180));

function svgOf(compact: boolean): string {
  // cadran : graduations tous les 6° sur [-24°, +24°], le cran zéro plus long
  const ticks = compact
    ? ''
    : Array.from({ length: 9 }, (_, i) => {
        const a = ((i - 4) * 6 * Math.PI) / 180;
        const r0 = i === 4 ? 21 : 24, r1 = 28;
        const p = (r: number) => `${(PX + r * Math.sin(a)).toFixed(2)} ${(PY - r * Math.cos(a)).toFixed(2)}`;
        return `<path class="bal-tick${i === 4 ? ' z' : ''}" d="M${p(r0)} L${p(r1)}"/>`;
      }).join('');
  const pan = (side: BalSide) => {
    const x = side === 'give' ? PX - ARM : PX + ARM;
    return `<g class="bal-pan bal-${side}" data-x="${x}"><path class="bal-hang" d="M${x} ${PY} L${x - 24} ${PY + DROP} M${x} ${PY} L${x + 24} ${PY + DROP}"/><g class="bal-load"></g><path class="bal-plate" d="M${x - 28} ${PY + DROP} L${x + 28} ${PY + DROP}"/></g>`;
  };
  const ly = PY + DROP + SWING + 13;
  const labels = compact ? '' : `<text class="bal-lbl" x="${PX - ARM}" y="${ly}">${tr('tr.bal.give')}</text><text class="bal-lbl" x="${PX + ARM}" y="${ly}">${tr('tr.bal.get')}</text>`;
  const vb = compact ? `${PX - ARM - 30} ${PY - SWING - 4} ${2 * ARM + 60} ${DROP + 2 * SWING + 8}` : `0 0 240 ${ly + 4}`;
  return `<svg viewBox="${vb}" aria-hidden="true" focusable="false">
    ${compact ? '' : `<g class="bal-dial">${ticks}<path class="bal-notch" d="M${PX - 3.4} ${PY - 33} L${PX + 3.4} ${PY - 33} L${PX} ${PY - 28.5} Z"/></g><path class="bal-needle" d="M${PX} ${PY} L${PX} ${PY - 25}"/>`}
    <path class="bal-post" d="M${PX} ${PY} L${PX} ${PY + DROP + SWING}${compact ? '' : ` M${PX - 16} ${PY + DROP + SWING} L${PX + 16} ${PY + DROP + SWING}`}"/>
    <path class="bal-beam" d="M${PX - ARM - 2} ${PY} L${PX + ARM + 2} ${PY}"/>
    ${pan('give')}${pan('get')}
    <circle class="bal-pivot" cx="${PX}" cy="${PY}" r="${compact ? 4 : 3.2}"/>
    ${labels}
  </svg>`;
}

interface Parts {
  root: HTMLElement;
  beam: SVGElement;
  needle: SVGElement | null;
  notch: SVGElement | null;
  pans: Record<BalSide, SVGGElement>;
  loads: Record<BalSide, SVGGElement>;
}
function parts(root: HTMLElement): Parts {
  const q = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  return {
    root,
    beam: q('.bal-beam'),
    needle: root.querySelector('.bal-needle'),
    notch: root.querySelector('.bal-notch'),
    pans: { give: q('.bal-give'), get: q('.bal-get') },
    loads: { give: q('.bal-give .bal-load'), get: q('.bal-get .bal-load') },
  };
}

/** plaques des cartes posées sur un plateau : 6 par rangée, 2 rangées au plus (12 cartes, plafond du composeur) */
function loadSvg(x: number, tiers: number[]): string {
  const W = 6.4, H = 8.6, G = 1.4;
  let out = '';
  tiers.slice(0, 12).forEach((tier, i) => {
    const row = Math.floor(i / 6), col = i % 6;
    const inRow = Math.min(6, tiers.length - row * 6);
    const x0 = x - (inRow * W + (inRow - 1) * G) / 2 + col * (W + G);
    const y0 = PY + DROP - 1.2 - (row + 1) * (H + 1);
    out += `<rect class="bal-card${tier >= 3 ? ' full' : ''}" x="${x0.toFixed(2)}" y="${y0.toFixed(2)}" width="${W}" height="${H}" rx="0.8"/>`;
  });
  return out;
}

export function createTradeBalance(sfx: { tick(pitch?: number, vol?: number, pan?: number): void }): TradeBalance {
  const el = document.createElement('div');
  el.className = 'tr-bal';
  el.innerHTML = `${svgOf(false)}<div class="gauge-txt"></div>`;
  const mini = document.createElement('span');
  mini.className = 'tb-bal';
  mini.innerHTML = svgOf(true);
  const all = [parts(el), parts(mini)];
  const txt = el.querySelector<HTMLElement>('.gauge-txt')!;

  const spring = new Spring(0, SPRING.carte.stiffness, SPRING.carte.damping);
  let raf = 0;
  let last = 0;
  /** le prochain passage dans le cran zéro (équilibre retrouvé) fera le clic */
  let armed = false;
  /** le fléau a quitté le cran depuis (sinon pas de clic : il n'y « revient » pas) */
  let away = false;
  let balanced = false;
  let loadSig = '';
  let txtH = '';

  function draw(a: number) {
    const b = a * BEAM_K;
    const rad = (b * Math.PI) / 180;
    const dx = ARM * Math.cos(rad) - ARM, dy = ARM * Math.sin(rad);
    const rot = `rotate(${b.toFixed(3)} ${PX} ${PY})`;
    for (const p of all) {
      p.beam.setAttribute('transform', rot);
      p.needle?.setAttribute('transform', `rotate(${a.toFixed(3)} ${PX} ${PY})`);
      // plateaux : suspendus, ils restent horizontaux et suivent le bout du fléau
      p.pans.give.setAttribute('transform', `translate(${(-dx).toFixed(3)} ${(-dy).toFixed(3)})`);
      p.pans.get.setAttribute('transform', `translate(${dx.toFixed(3)} ${dy.toFixed(3)})`);
    }
  }
  function frame(now: number) {
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const a = spring.update(dt);
    if (Math.abs(a) > MAX + 6) {
      // (butée : le fléau ne passe pas au-delà de ses arrêts)
      spring.value = Math.sign(a) * (MAX + 6);
      spring.velocity *= -0.3;
    }
    // clic de centrage : le fléau entre dans le cran zéro alors que l'échange vient de s'équilibrer
    if (Math.abs(spring.value) >= 0.5) away = true;
    else if (armed && away && balanced) {
      armed = away = false;
      sfx.tick(1.7, 0.14, 0);
    }
    draw(spring.value);
    if (Math.abs(spring.velocity) < 0.02 && Math.abs(spring.value - spring.target) < 0.01) {
      spring.set(spring.target);
      draw(spring.value);
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  return {
    el,
    mini,
    set(s, kick) {
      const tot = s.vg + s.vr;
      const target = s.balanced || !tot ? 0 : ((s.vr - s.vg) / tot) * MAX;
      // un déséquilibre (ou une carte posée) réarme le clic ; vider la proposition le désarme (pas de clic à l'envoi)
      armed = (s.give.length > 0 || s.get.length > 0) && (!s.balanced || !!kick || Math.abs(spring.value) >= 0.5);
      balanced = s.balanced;
      for (const p of all) p.notch?.classList.toggle('on', s.balanced);
      el.classList.toggle('is-empty', !s.give.length && !s.get.length);
      const sig = `${s.give.join(',')}|${s.get.join(',')}`;
      if (sig !== loadSig) {
        loadSig = sig;
        for (const p of all) {
          if (p.root === mini) continue; // (la petite balance n'a pas de plaques : trop petites pour se lire)
          p.loads.give.innerHTML = loadSvg(PX - ARM, s.give);
          p.loads.get.innerHTML = loadSvg(PX + ARM, s.get);
        }
      }
      spring.target = target;
      // une carte qui tombe : le plateau s'enfonce d'un coup (plus fort pour une grosse étoile) puis le fléau oscille
      if (kick) spring.impulse((kick.side === 'give' ? -1 : 1) * (36 + kick.tier * 14));
      if (spring.value !== target || spring.velocity) wake();
    },
    pan(side) {
      const big = all[0].pans[side];
      if (el.getClientRects().length && el.offsetParent !== null) return big.querySelector('.bal-plate');
      if (mini.getClientRects().length) return all[1].pans[side].querySelector('.bal-plate');
      return null;
    },
    text(html) {
      if (html === txtH) return;
      txtH = html;
      txt.innerHTML = html;
    },
  };
}
