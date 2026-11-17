import { h } from '../ui';
import { reducedMotion } from '../../core/motion';
import { BALL_R, DEFLECTOR_AT, DEFLECTOR_GAP, DEFLECTORS, planSpin, poseAt, restPose, soundsBetween, type BallPose, type BallSound } from './rouletteBall';

/**
 * (13/11, retours Hugo « la roulette, faudrait la modéliser ») LA ROUE : un vrai cylindre de roulette en SVG, les
 * N numéros en secteurs alternés noir / gris (la couleur reste pour l'information : le numéro sorti s'allume), une bille
 * sur la piste. `spinTo` lance la roue dans un sens, la bille dans l'autre ; elle ralentit sur une courbe continue et
 * s'arrête EXACTEMENT sous le repère, sur le numéro sorti. Utilisée par la page Roulette et par le rejeu du dernier
 * tirage à la connexion (rouletteReplay.ts).
 * (V3, lot 11) La bille vit une vraie trajectoire (rouletteBall.ts) : orbite sur la piste, décrochage, 1 à 3 chocs sur
 * les losanges déflecteurs, chute et capture amortie au CENTRE de l'alvéole du numéro. Tout se calcule sur le temps
 * absolu depuis le lancer : même image à 60 ou 144 Hz, aucune dérive si l'onglet passe en arrière-plan.
 */
export type { BallSound } from './rouletteBall';
export interface RouletteWheel {
  el: HTMLElement;
  /**
   * fait tourner jusqu'au numéro (1..n) ; `onTick` à chaque case franchie par la bille (son, vibration) ; `onSound` :
   * les bruits de la bille (cliquetis de la piste, choc sur un losange, pose dans l'alvéole, frette), avec panoramique
   */
  spinTo(number: number, ms?: number, onTick?: () => void, onSound?: (s: BallSound) => void): Promise<void>;
  /** pose la roue sur un numéro, sans animation (dernier tirage déjà vu) */
  show(number: number | null): void;
}

export function createRouletteWheel(n: number): RouletteWheel {
  const el = h('div', 'rw');
  const R = 100, rIn = 62, rNum = 82;
  const step = 360 / n;
  const pt = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  };
  let sectors = '';
  for (let i = 0; i < n; i++) {
    const a0 = i * step - step / 2, a1 = a0 + step;
    sectors += `<path class="rw-s${i % 2 ? ' alt' : ''}" data-i="${i}" d="M${pt(rIn, a0)} L${pt(R - 6, a0)} A${R - 6},${R - 6} 0 0 1 ${pt(R - 6, a1)} L${pt(rIn, a1)} A${rIn},${rIn} 0 0 0 ${pt(rIn, a0)} Z"/>`;
    const [x, y] = pt(rNum, i * step).split(',');
    sectors += `<text class="rw-t" data-i="${i}" x="${x}" y="${y}" transform="rotate(${(i * step).toFixed(2)} ${x} ${y})">${i + 1}</text>`;
  }
  el.innerHTML = `<svg viewBox="-110 -110 220 220" aria-hidden="true">
      <circle class="rw-rim" r="${R + 6}"/><circle class="rw-track" r="${R}"/>
      <g class="rw-rot">${sectors}<circle class="rw-hub" r="${rIn - 2}"/><circle class="rw-hub2" r="${rIn - 24}"/>${Array.from({ length: 8 }, (_, k) => `<line class="rw-spoke" x1="0" y1="0" x2="${pt(rIn - 26, k * 45).split(',')[0]}" y2="${pt(rIn - 26, k * 45).split(',')[1]}"/>`).join('')}</g>
      ${Array.from({ length: DEFLECTORS }, (_, k) => `<path class="rw-dfl" transform="rotate(${DEFLECTOR_AT + k * DEFLECTOR_GAP})" d="M0,${-BALL_R.deflector - 1.6} L1.3,${-BALL_R.deflector} L0,${-BALL_R.deflector + 1.6} L-1.3,${-BALL_R.deflector} Z"/>`).join('')}
      <g class="rw-ballg"><circle class="rw-ball" cx="0" cy="0" r="4.2"/></g>
      <path class="rw-ptr" d="M-6,-${R + 13} L6,-${R + 13} L0,-${R + 3} Z"/>
    </svg><div class="rw-out" aria-live="polite"></div>`;
  const rot = el.querySelector<SVGGElement>('.rw-rot')!;
  const ballG = el.querySelector<SVGGElement>('.rw-ballg')!;
  const out = el.querySelector<HTMLElement>('.rw-out')!;
  /** pose courante (roue, bille : angle monde et rayon) ; au départ, la bille attend sur la piste en haut */
  let pose: BallPose = { wheel: 0, ball: 0, r: BALL_R.track, phase: 0 };
  let busy = false;
  // une seule écriture d'attribut par élément et par image (transform), rien d'autre ne bouge dans le SVG
  const set = () => {
    rot.setAttribute('transform', `rotate(${pose.wheel.toFixed(2)})`);
    ballG.setAttribute('transform', `rotate(${pose.ball.toFixed(2)}) translate(0 ${(-pose.r).toFixed(2)})`);
  };
  const light = (i: number | null) => el.querySelectorAll<SVGElement>('[data-i]').forEach((s) => s.classList.toggle('win', i !== null && Number(s.dataset.i) === i));
  set();
  return {
    el,
    show(num) {
      light(num ? num - 1 : null);
      // bille posée au centre de l'alvéole du numéro (même pose que la fin d'un tirage)
      if (num) pose = restPose(n, num, pose.wheel);
      ballG.style.opacity = num ? '1' : '0';
      out.textContent = num ? String(num) : '';
      set();
    },
    async spinTo(num, ms = 5600, onTick, onSound) {
      if (busy) return;
      busy = true;
      light(null);
      out.textContent = '';
      ballG.style.opacity = '1';
      const T = reducedMotion() ? 0 : ms;
      // trajectoire entière calculée au lancer, à rebours depuis l'alvéole du numéro (rouletteBall.ts) : la roue fait
      // ≥ 3 tours, la bille ≈ 5 en sens inverse, et finit au centre exact de l'alvéole, sous le repère
      const plan = planSpin(n, num, pose.wheel, ((pose.ball % 360) + 360) % 360, pose.r);
      let lastCell = -1;
      await new Promise<void>((done) => {
        const t0 = performance.now();
        let kPrev = 0;
        const frame = (t: number) => {
          if (!el.isConnected && T) return done();
          // temps ABSOLU depuis le lancer (pas d'accumulation de dt) ; rAF peut dater l'image d'avant t0
          const k = T ? Math.min(1, Math.max(0, (t - t0) / T)) : 1;
          pose = poseAt(plan, k);
          set();
          if (pose.phase < 3) {
            const cell = ((Math.round((pose.ball - pose.wheel) / step) % n) + n) % n;
            if (cell !== lastCell) {
              if (lastCell >= 0) onTick?.();
              lastCell = cell;
            }
          }
          if (onSound && T) for (const s of soundsBetween(plan, kPrev, k, T)) onSound(s);
          kPrev = k;
          if (k < 1) requestAnimationFrame(frame);
          else done();
        };
        requestAnimationFrame(frame);
      });
      // pose de repos exacte (aussi si la vue a été quittée en cours de route)
      pose = plan.rest;
      set();
      light(num - 1);
      out.textContent = String(num);
      busy = false;
    },
  };
}
