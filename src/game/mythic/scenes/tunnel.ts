/**
 * FOOTBALL — « Tunnel » : sortie du tunnel (béton qui défile, bouche de lumière, pas, clameur) ; dehors, la carte est
 * DÉJÀ sur la pelouse, de dos, petite au rond central ; les projecteurs du stade s'allument un par un et à chaque coup
 * elle grandit d'un cran vers nous — au centre.
 */
import { span, easeIn, type SceneCtx } from '../kit';

export default function tunnel(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:#030303;');
  const out = el('div', '', 'position:absolute;inset:0;opacity:0;');
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#07080b 0%,#111519 44%,#0b140d 52%,#07100a);', out);
  el('div', '', `position:absolute;left:-20%;right:-20%;top:52%;bottom:0;background:repeating-linear-gradient(90deg,#17261a 0 8%,#132015 8% 16%);transform:perspective(${u * 50}px) rotateX(58deg);transform-origin:50% 0;`, out);
  el('div', '', `position:absolute;left:0;right:0;top:28%;height:24%;background:radial-gradient(circle,rgba(255,255,255,.16) 1px,transparent 1.5px) 0 0/${u * 1.5}px ${u * 1.3}px,linear-gradient(180deg,#0d0f13,#171a20);`, out);
  const lamps: HTMLElement[] = [];
  for (let i = 0; i < 4; i++) {
    const L = el('div', '', `position:absolute;left:${[12, 36, 64, 88][i]}%;top:${9 + (i % 2) * 3}%;width:${u * 12}px;height:${u * 5}px;margin-left:-${u * 6}px;border-radius:${u * 0.8}px;background:#1a1a1a;`, out);
    el('div', '', `position:absolute;left:50%;top:100%;width:2px;height:${h * 0.2}px;background:#141414;`, L);
    lamps.push(L);
  }
  const glow = el('div', '', 'position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 60% 40% at 50% 20%,rgba(255,255,255,.3),transparent 70%);', out);
  const cv = k.canvas();
  const N = 14;
  cv.loop((t) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    const p = span(t, 0, 1.5);
    if (p >= 1) return;
    const cx = w / 2, cy = h * 0.47;
    const ex = 0.12 + easeIn(p) * 1.25;
    const ew = w * 0.32 * ex, eh = h * 0.26 * ex;
    const quad = (pts: number[][], col: string) => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) c.lineTo(q[0], q[1]);
      c.fill();
    };
    const L = cx - ew, Rr = cx + ew, T = cy - eh, B = cy + eh;
    quad([[0, 0], [w, 0], [Rr, T], [L, T]], '#0c0c0d');
    quad([[0, h], [w, h], [Rr, B], [L, B]], '#141413');
    quad([[0, 0], [L, T], [L, B], [0, h]], '#0f0f10');
    quad([[w, 0], [Rr, T], [Rr, B], [w, h]], '#0f0f10');
    const z0 = easeIn(p) * 9 + p * 2;
    for (let i = 0; i < N; i++) {
      const zz = i + 1 - (z0 % 1);
      const f = 1 / (1 + zz * 0.55);
      const k1 = (f - 1 / (1 + N * 0.55)) / (1 - 1 / (1 + N * 0.55));
      const fx = L + (0 - L) * k1, fy = T + (0 - T) * k1;
      c.strokeStyle = `rgba(255,255,255,${0.08 + 0.12 * (1 - k1) * p})`;
      c.lineWidth = 1 + k1 * 6;
      c.strokeRect(fx, fy, w - 2 * fx, B + (h - B) * k1 - fy);
    }
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(ew, eh) * 1.6);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(225,238,255,.95)');
    g.addColorStop(1, 'rgba(225,238,255,0)');
    c.fillStyle = g;
    c.fillRect(cx - ew * 1.6, cy - eh * 1.6, ew * 3.2, eh * 3.2);
    c.fillStyle = '#eef5ff';
    c.fillRect(L, T, ew * 2, eh * 2);
  });
  k.at(0.05, () => sfx.crowd(2.8, 0.18));
  k.at(0.2, () => sfx.rumble(1.4, 0.12));
  for (let i = 0; i < 4; i++) k.at(0.3 + i * 0.28, () => sfx.bounce(0.1));
  tl.to(out, { opacity: 1, duration: 0.25 }, 1.4);
  k.flash(1.45, 0.8, 0.5);
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.18, y: h * 0.1 }, 1.45);
  lamps.forEach((L, i) => {
    const at = 1.75 + i * 0.22;
    tl.set(L, { background: '#fff', boxShadow: `0 0 ${u * 6}px #fff, 0 0 ${u * 20}px rgba(255,255,255,.7)` }, at);
    tl.to(glow, { opacity: (i + 1) / 4, duration: 0.1 }, at);
    tl.to(a, { scale: 0.18 + ((i + 1) / 4) * 0.82, y: h * 0.1 * (1 - (i + 1) / 4), duration: 0.18, ease: 'power3.out' }, at);
    k.at(at, () => {
      sfx.flood(0.2);
      k.haptic(12);
    });
  });
  k.label(k.card.sub.toUpperCase(), '50%', `${h * 0.9}px`, '').style.cssText += `transform:translateX(-50%);color:${accent};font-size:${u * 2.6}px;`;
  tl.to({}, { duration: 0.01 }, 2.95);
}
