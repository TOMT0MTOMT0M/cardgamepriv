/**
 * ACTEURS & ACTRICES — « Tapis rouge » : vue à la première personne, on AVANCE sur le tapis entre les cordons (tout
 * défile vers nous), rafale de flashs des deux côtés, puis la carte apparaît au bout du tapis, de loin, et vient à nous ;
 * les flashs crépitent dessus.
 */
import { span, easeIn, type SceneCtx } from '../kit';

export default function tapisRouge(k: SceneCtx) {
  const { tl, u, el, sfx, actor, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 45% at 50% 32%,#1a1416,#050405 70%);');
  const hz = h * 0.42, vx = w / 2;
  const cv = k.canvas();
  cv.loop((t) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    const adv = t * 0.9 + easeIn(span(t, 1.6, 2.6)) * 3;
    // tapis
    const g = c.createLinearGradient(0, hz, 0, h);
    g.addColorStop(0, '#2a070b');
    g.addColorStop(1, '#8a1a28');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(vx - w * 0.04, hz);
    c.lineTo(vx + w * 0.04, hz);
    c.lineTo(vx + w * 0.42, h);
    c.lineTo(vx - w * 0.42, h);
    c.fill();
    // poteaux + cordons des deux côtés, qui défilent vers nous
    for (const side of [-1, 1]) {
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i < 9; i++) {
        const z = ((i - adv) % 9 + 9) % 9; // 0 = loin
        const zz = 1 - z / 9; // 1 = près
        const p = Math.pow(zz, 1.7);
        const y = hz + (h - hz) * p;
        const x = vx + side * (w * 0.06 + w * 0.44 * p);
        const ph = u * 15 * p + u * 0.6;
        pts.push([x, y, ph]);
        c.fillStyle = '#c9a64a';
        c.fillRect(x - p * u * 0.7, y - ph, Math.max(1.2, p * u * 1.4), ph);
        c.beginPath();
        c.arc(x, y - ph, Math.max(1.4, p * u * 1.6), 0, Math.PI * 2);
        c.fillStyle = '#e8c86a';
        c.fill();
      }
      pts.sort((a, b) => a[1] - b[1]);
      c.strokeStyle = '#6a1420';
      c.lineWidth = u * 0.7;
      c.beginPath();
      pts.forEach(([x, y, ph], i) => (i ? c.lineTo(x, y - ph * 0.8) : c.moveTo(x, y - ph * 0.8)));
      c.stroke();
    }
  });
  const flashes: HTMLElement[] = [];
  for (let i = 0; i < 16; i++) {
    const left = i % 2 === 0;
    const s = u * (22 + k.rand() * 26);
    const f = el('div', '', `position:absolute;left:${left ? 2 + k.rand() * 22 : 76 + k.rand() * 22}%;top:${hz + k.rand() * h * 0.3}px;width:${s}px;height:${s}px;opacity:0;`);
    k.pin(f);
    f.innerHTML = `<div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,#fff 0 4%,rgba(255,255,255,.85) 7%,rgba(220,235,255,.25) 26%,transparent 60%)"></div><div style="position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:linear-gradient(90deg,transparent,#fff,transparent)"></div><div style="position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:linear-gradient(180deg,transparent,#fff,transparent)"></div>`;
    flashes.push(f);
  }
  const glare = el('div', '', 'position:absolute;inset:0;background:#fff;opacity:0;');
  k.at(0.1, () => sfx.crowd(2.2, 0.1));
  flashes.forEach((f, i) => {
    const at = 0.2 + i * 0.1 + (i % 3) * 0.03;
    tl.fromTo(f, { opacity: 1, scale: 0.5 }, { opacity: 0, scale: 1.15, duration: 0.24, ease: 'power2.out', immediateRender: false }, at);
    tl.fromTo(glare, { opacity: 0.12 }, { opacity: 0, duration: 0.12, immediateRender: false }, at);
    k.at(at, () => sfx.shutter(0.12 + (i % 3) * 0.03));
  });
  // la carte apparaît au bout du tapis et vient à nous
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.08, y: hz - h / 2 + u * 2 }, 1.5);
  tl.to(a, { scale: 1, y: 0, duration: 1.1, ease: 'power3.in' }, 1.55);
  k.at(1.55, () => sfx.riser(1.1, 0.1));
  for (let i = 0; i < 5; i++) {
    tl.fromTo(glare, { opacity: 0.45 + i * 0.1 }, { opacity: 0, duration: 0.08, immediateRender: false }, 2.65 + i * 0.07);
    k.at(2.65 + i * 0.07, () => sfx.shutter(0.18));
  }
  k.at(2.65, () => k.haptic([20, 30, 20, 30, 20]));
  tl.to({}, { duration: 0.01 }, 3.05);
}
