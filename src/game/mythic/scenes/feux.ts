/**
 * SPORTS MÉCANIQUES — « Feux de départ » : cinq feux rouges s'allument un par un… puis s'éteignent d'un coup ; le
 * moteur rugit, la piste file en traînées — la carte.
 */
import { span, easeIn, type SceneCtx } from '../kit';

export default function feux(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 50% at 50% 40%,#14161a,#030304 75%);');
  // traînées de vitesse (après le départ)
  const cv = k.canvas();
  const streaks = Array.from({ length: k.mobile ? 60 : 120 }, () => ({ y: k.rand(), x: k.rand(), l: 0.1 + k.rand() * 0.4, v: 1 + k.rand() * 2 }));
  cv.loop((t, dt) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    const p = easeIn(span(t, 1.95, 2.5));
    if (p <= 0) return;
    for (const s of streaks) {
      s.x -= dt * s.v * 3 * p;
      if (s.x < -s.l) s.x += 1 + s.l;
      const y = h * (0.5 + (s.y - 0.5) * 1.2);
      const gr = c.createLinearGradient(s.x * w, 0, (s.x + s.l) * w, 0);
      gr.addColorStop(0, `rgba(255,255,255,${0.7 * p})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      c.fillRect(s.x * w, y, s.l * w, Math.max(1, Math.abs(s.y - 0.5) * 6));
    }
  });
  // portique
  const gw = Math.min(w * 0.92, u * 96);
  const gantry = el('div', '', `position:absolute;left:50%;top:${h * 0.3}px;width:${gw}px;display:flex;justify-content:space-between;padding:${u * 2}px;border-radius:${u * 1.2}px;background:#0b0b0d;box-shadow:0 0 0 ${u * 0.5}px #222,0 20px 50px rgba(0,0,0,.8);`);
  pin(gantry, -50, 0);
  const lights: HTMLElement[][] = [];
  for (let i = 0; i < 5; i++) {
    const col = el('div', '', `display:flex;flex-direction:column;gap:${u * 1.4}px;padding:${u * 1.2}px;border-radius:${u}px;background:#151518;`, gantry);
    const pair: HTMLElement[] = [];
    for (let j = 0; j < 2; j++) pair.push(el('div', '', `width:${gw * 0.11}px;height:${gw * 0.11}px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#3a1414,#1a0808);`, col));
    lights.push(pair);
  }
  tl.fromTo(gantry, { opacity: 0, y: -u * 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0);
  k.at(0.1, () => sfx.engine(1.6, 0.08, 40, 52));
  lights.forEach((pair, i) => {
    const at = 0.4 + i * 0.3;
    tl.set(pair, { background: 'radial-gradient(circle at 40% 35%,#ff8a7a,#ff1a0a 55%,#a00800)', boxShadow: `0 0 ${u * 4}px #ff2a1a` }, at);
    k.at(at, () => {
      sfx.light(0.13);
      k.haptic(10);
    });
  });
  // silence… puis tout s'éteint
  tl.set(lights.flat(), { background: 'radial-gradient(circle at 40% 35%,#3a1414,#1a0808)', boxShadow: 'none' }, 1.95);
  k.at(1.95, () => {
    sfx.engine(0.9, 0.26, 70, 240);
    k.haptic([60, 20, 80]);
  });
  k.shake(1.95, u * 1.6, 0.5);
  tl.to(gantry, { y: -h * 0.6, scale: 0.8, duration: 0.5, ease: 'power3.in' }, 2.0);
  tl.to({}, { duration: 0.01 }, 2.55);
}
