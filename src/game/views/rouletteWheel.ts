import { h } from '../ui';
import { reducedMotion } from '../../core/motion';

/**
 * (13/11, retours Hugo « la roulette, faudrait la modéliser ») LA ROUE : un vrai cylindre de roulette en SVG, les
 * N numéros en secteurs alternés noir / gris (la couleur reste pour l'information : le numéro sorti s'allume), une bille
 * sur la piste. `spinTo` lance la roue dans un sens, la bille dans l'autre ; elle ralentit sur une courbe continue et
 * s'arrête EXACTEMENT sous le repère, sur le numéro sorti. Utilisée par la page Roulette et par le rejeu du dernier
 * tirage à la connexion (rouletteReplay.ts).
 */
export interface RouletteWheel {
  el: HTMLElement;
  /** fait tourner jusqu'au numéro (1..n) ; `onTick` à chaque case franchie par la bille (son, vibration) */
  spinTo(number: number, ms?: number, onTick?: () => void): Promise<void>;
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
      <g class="rw-ballg"><circle class="rw-ball" cx="0" cy="${-(R - 2.5)}" r="4.2"/></g>
      <path class="rw-ptr" d="M-6,-${R + 13} L6,-${R + 13} L0,-${R + 3} Z"/>
    </svg><div class="rw-out" aria-live="polite"></div>`;
  const rot = el.querySelector<SVGGElement>('.rw-rot')!;
  const ballG = el.querySelector<SVGGElement>('.rw-ballg')!;
  const out = el.querySelector<HTMLElement>('.rw-out')!;
  let wheelA = 0;
  let ballA = 0;
  let busy = false;
  const set = () => {
    rot.setAttribute('transform', `rotate(${wheelA.toFixed(2)})`);
    ballG.setAttribute('transform', `rotate(${ballA.toFixed(2)})`);
  };
  const light = (i: number | null) => el.querySelectorAll<SVGElement>('[data-i]').forEach((s) => s.classList.toggle('win', i !== null && Number(s.dataset.i) === i));
  /** angle de la roue qui met le numéro `num` sous le repère (en haut) */
  const restFor = (num: number) => -((num - 1) * step);
  set();
  return {
    el,
    show(num) {
      light(num ? num - 1 : null);
      if (num) wheelA = restFor(num);
      ballA = 0;
      ballG.style.opacity = num ? '1' : '0';
      out.textContent = num ? String(num) : '';
      set();
    },
    async spinTo(num, ms = 5600, onTick) {
      if (busy) return;
      busy = true;
      light(null);
      out.textContent = '';
      ballG.style.opacity = '1';
      const T = reducedMotion() ? 0 : ms;
      // départ : là où elle est ; arrivée : le numéro sous le repère après ≥ 3 tours de roue, la bille tournant en sens
      // inverse et finissant en haut (0°) après ≥ 5 tours
      const w0 = wheelA, b0 = ((ballA % 360) + 360) % 360;
      const target = restFor(num);
      const w1 = w0 + 360 * 3 + ((((target - w0) % 360) + 360) % 360);
      const b1 = -360 * 5 - b0;
      let lastCell = -1;
      await new Promise<void>((done) => {
        const t0 = performance.now();
        const frame = (t: number) => {
          if (!el.isConnected && T) return done();
          const k = T ? Math.min(1, (t - t0) / T) : 1;
          const e = 1 - Math.pow(1 - k, 3.2);
          wheelA = w0 + (w1 - w0) * e;
          // la bille ralentit plus vite que la roue puis se laisse emporter : elle « tombe » dans la case
          const eb = 1 - Math.pow(1 - k, 2.4);
          ballA = b0 + b1 * eb;
          set();
          const rel = ((((ballA - wheelA) % 360) + 360) % 360);
          const cell = Math.round(rel / step) % n;
          if (cell !== lastCell) {
            if (lastCell >= 0) onTick?.();
            lastCell = cell;
          }
          if (k < 1) requestAnimationFrame(frame);
          else done();
        };
        requestAnimationFrame(frame);
      });
      wheelA = target + Math.round((wheelA - target) / 360) * 360;
      ballA = 0;
      set();
      light(num - 1);
      out.textContent = String(num);
      busy = false;
    },
  };
}
