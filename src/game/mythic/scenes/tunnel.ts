/**
 * FOOTBALL — « Tunnel » : la sortie du tunnel vers la pelouse (les cadres de béton défilent, la lumière du stade au
 * bout), la clameur enfle ; dehors, les projecteurs s'allument un par un — la carte.
 */
import { span, easeIn, type SceneCtx } from '../kit';

export default function tunnel(k: SceneCtx) {
  const { tl, u, el, sfx, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:#030303;');
  // dehors : le stade (révélé à la sortie)
  const out = el('div', '', 'position:absolute;inset:0;opacity:0;');
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#0a0c10 0%,#141a20 40%,#0d0f0d 52%);', out);
  // pelouse : bandes de tonte en perspective
  const pitch = el('div', '', `position:absolute;left:-20%;right:-20%;top:52%;bottom:0;background:repeating-linear-gradient(90deg,#1b2a1d 0 8%,#172419 8% 16%);transform:perspective(${u * 50}px) rotateX(58deg);transform-origin:50% 0;`, out);
  void pitch;
  // tribunes (rangées de points = foule)
  el('div', '', `position:absolute;left:0;right:0;top:30%;height:22%;background:radial-gradient(circle,rgba(255,255,255,.18) 1px,transparent 1.5px) 0 0/${u * 1.6}px ${u * 1.4}px,linear-gradient(180deg,#0e1014,#191c22);`, out);
  const lamps: HTMLElement[] = [];
  for (let i = 0; i < 4; i++) {
    const x = [12, 36, 64, 88][i];
    const L = el('div', '', `position:absolute;left:${x}%;top:${10 + (i % 2) * 3}%;width:${u * 12}px;height:${u * 6}px;margin-left:-${u * 6}px;border-radius:${u}px;background:#222;box-shadow:none;`, out);
    el('div', '', `position:absolute;left:50%;top:100%;width:2px;height:${h * 0.2}px;background:#1a1a1a;`, L);
    lamps.push(L);
  }
  const glow = el('div', '', 'position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 60% 40% at 50% 20%,rgba(255,255,255,.35),transparent 70%);', out);
  // le tunnel (canvas) : cadres qui foncent vers la caméra
  const cv = k.canvas();
  const N = 14;
  cv.loop((t) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    const p = span(t, 0, 1.55);
    if (p >= 1) return;
    const cx = w / 2;
    const cy = h * 0.47;
    // la bouche de lumière grandit (on avance, de plus en plus vite)
    const ex = 0.12 + easeIn(p) * 1.25;
    const ew = w * 0.32 * ex;
    const eh = h * 0.26 * ex;
    // murs, sol, plafond : quatre trapèzes du bord de l'écran vers la sortie
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
    // nervures de béton qui foncent vers la caméra
    const z0 = easeIn(p) * 9 + p * 2;
    for (let i = 0; i < N; i++) {
      const zz = i + 1 - (z0 % 1);
      const f = 1 / (1 + zz * 0.55);
      const k1 = (f - 1 / (1 + N * 0.55)) / (1 - 1 / (1 + N * 0.55));
      const fx = L + (0 - L) * k1;
      const fy = T + (0 - T) * k1;
      const fw = w - 2 * fx;
      const fh = B + (h - B) * k1 - fy;
      c.strokeStyle = `rgba(255,255,255,${0.04 + 0.12 * (1 - k1) * p + 0.04})`;
      c.lineWidth = 1 + k1 * 6;
      c.strokeRect(fx, fy, fw, fh);
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
  k.at(0.05, () => sfx.crowd(2.6, 0.18));
  k.at(0.2, () => sfx.rumble(1.4, 0.12));
  // pas (4 battements)
  for (let i = 0; i < 4; i++) k.at(0.3 + i * 0.28, () => sfx.bounce(0.1));
  // dehors
  tl.to(out, { opacity: 1, duration: 0.25 }, 1.45);
  k.flash(1.5, 0.8, 0.5);
  lamps.forEach((L, i) => {
    const at = 1.75 + i * 0.16;
    tl.set(L, { background: '#fff', boxShadow: `0 0 ${u * 6}px #fff, 0 0 ${u * 20}px rgba(255,255,255,.7)` }, at);
    tl.to(glow, { opacity: (i + 1) / 4, duration: 0.1 }, at);
    k.at(at, () => {
      sfx.flood(0.2);
      k.haptic(12);
    });
  });
  tl.to(out, { scale: 1.08, duration: 1.2, ease: 'none' }, 1.45);
  tl.to({}, { duration: 0.01 }, 2.65);
}
