/**
 * SPORTS MÉCANIQUES — « Feux de départ » : la carte est sur la grille, de loin (petite, en bas du portique) ; cinq feux
 * rouges s'allument un par un, un vrai silence… puis tout s'éteint d'un coup : moteur, traînées, la carte fonce vers
 * nous et se cale au centre.
 */
import { span, easeIn, type SceneCtx } from '../kit';

export default function feux(k: SceneCtx) {
  const { tl, u, el, sfx, actor, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 50% at 50% 40%,#111216,#030304 75%);');
  // asphalte en perspective
  el('div', '', `position:absolute;left:-20%;right:-20%;top:56%;bottom:0;background:linear-gradient(90deg,transparent 48.5%,#fff 48.5%,#fff 51.5%,transparent 51.5%) 0 0/30% 100%,#0c0c0e;opacity:.5;transform:perspective(${u * 40}px) rotateX(60deg);transform-origin:50% 0;`);
  const cv = k.canvas();
  const streaks = Array.from({ length: k.mobile ? 60 : 120 }, () => ({ y: k.rand(), x: k.rand(), l: 0.1 + k.rand() * 0.4, v: 1 + k.rand() * 2 }));
  cv.loop((t, dt) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    const p = easeIn(span(t, 2.05, 2.5)) * Math.max(0, 1 - span(t, 2.7, 3.1));
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
  const gw = Math.min(w * 0.9, u * 94);
  const gantry = el('div', '', `position:absolute;left:50%;top:${h * 0.2}px;width:${gw}px;display:flex;justify-content:space-between;`);
  k.pin(gantry, -50, 0);
  el('div', '', `position:absolute;left:-6%;right:-6%;top:-${u * 3}px;height:${u * 1.4}px;background:#2a2a2e;`, gantry);
  const lights: HTMLElement[][] = [];
  for (let i = 0; i < 5; i++) {
    const col = el('div', '', `display:flex;flex-direction:column;gap:${u * 1.2}px;padding:${u * 1.2}px;border-radius:${u * 0.8}px;background:#0b0b0d;box-shadow:0 10px 30px rgba(0,0,0,.6);`, gantry);
    const pair: HTMLElement[] = [];
    for (let j = 0; j < 2; j++) pair.push(el('div', '', `width:${gw * 0.1}px;height:${gw * 0.1}px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#2a1010,#120606);box-shadow:inset 0 2px 4px #000;`, col));
    lights.push(pair);
  }
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.22, y: h * 0.18, rotationX: 30 }, 0);
  tl.fromTo(gantry, { opacity: 0, y: -u * 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0);
  k.at(0.1, () => sfx.engine(1.8, 0.07, 40, 50));
  lights.forEach((pair, i) => {
    const at = 0.4 + i * 0.3;
    tl.set(pair, { background: 'radial-gradient(circle at 40% 35%,#ff9a8a,#ff1a0a 50%,#8a0600)', boxShadow: `0 0 ${u * 5}px #ff2a1a, 0 0 ${u * 12}px rgba(255,40,20,.5)` }, at);
    k.at(at, () => {
      sfx.light(0.13);
      k.haptic(10);
    });
  });
  // le silence (0,4 s), puis tout s'éteint
  tl.set(lights.flat(), { background: 'radial-gradient(circle at 40% 35%,#2a1010,#120606)', boxShadow: 'inset 0 2px 4px #000' }, 2.05);
  k.at(2.05, () => {
    sfx.engine(1.0, 0.28, 70, 260);
    k.haptic([60, 20, 80]);
  });
  k.shake(2.05, u * 1.6, 0.5);
  tl.to(a, { scale: 1, y: 0, rotationX: 0, duration: 0.55, ease: 'power4.in' }, 2.05);
  tl.to(gantry, { y: -h * 0.5, scale: 0.6, opacity: 0, duration: 0.5, ease: 'power3.in' }, 2.1);
  k.at(2.6, () => sfx.hit(0.5, 50));
  tl.to({}, { duration: 0.01 }, 2.9);
}
