/**
 * GLISSE & MONTAGNE — « Chrono » : air glacé, neige qui file ; les temps intermédiaires tombent un à un, le chrono
 * court… et s'arrête : vert, « MEILLEUR TEMPS » — la carte.
 */
import type { SceneCtx } from '../kit';

export default function chrono(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#0d1620,#1b2a3a 55%,#d8e2ea 56%,#9fb1c0);');
  // pente (diagonale) + neige qui file
  el('div', '', `position:absolute;left:-20%;right:-20%;top:56%;height:2px;background:rgba(255,255,255,.6);transform:rotate(-8deg);`);
  const cv = k.canvas();
  const flakes = Array.from({ length: k.mobile ? 90 : 180 }, () => ({ x: k.rand() * w, y: k.rand() * h, s: 0.5 + k.rand() * 2, v: 0.6 + k.rand() }));
  cv.loop((t, dt) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.8)';
    for (const f of flakes) {
      f.x -= dt * w * 0.9 * f.v;
      f.y += dt * h * 0.12 * f.v;
      if (f.x < -10) {
        f.x += w + 20;
        f.y = k.rand() * h;
      }
      c.fillRect(f.x, f.y, f.s * 4, f.s * 0.7);
    }
  });
  const panel = el('div', '', `position:absolute;left:50%;top:${h * 0.14}px;width:${Math.min(w * 0.86, u * 88)}px;padding:${u * 3}px ${u * 4}px;border-radius:${u * 1.6}px;background:rgba(5,10,16,.72);backdrop-filter:blur(6px);font-family:var(--mono);color:#fff;`);
  pin(panel, -50, 0);
  const splits = ['INTER 1', 'INTER 2', 'INTER 3'].map((lab) => {
    const r = el('div', '', `display:flex;justify-content:space-between;font-size:${u * 3.6}px;letter-spacing:.12em;padding:${u * 0.8}px 0;opacity:0;`, panel);
    r.innerHTML = `<span style="opacity:.6">${lab}</span><b style="font-variant-numeric:tabular-nums">−0.${String(Math.floor(k.rand() * 90 + 10))}</b>`;
    (r.querySelector('b') as HTMLElement).style.color = '#6bffb8';
    return r;
  });
  const big = el('div', '', `font:700 ${u * 13}px/1.1 var(--mono);text-align:center;font-variant-numeric:tabular-nums;margin-top:${u * 2}px;`, panel);
  const best = el('div', '', `text-align:center;font:800 ${u * 4.6}px var(--title);letter-spacing:.2em;color:#6bffb8;opacity:0;margin-top:${u}px;`, panel);
  best.textContent = 'MEILLEUR TEMPS';
  tl.fromTo(panel, { opacity: 0, y: -u * 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0);
  k.at(0.05, () => sfx.ambience('glace', 2.4, 0.12));
  k.at(0.1, () => sfx.whoosh(0.6, 0.2, false));
  const T = { s: 0 };
  const final = 60 + 40 + k.rand() * 15;
  tl.to(T, {
    s: final,
    duration: 1.75,
    ease: 'none',
    onUpdate: () => {
      const m = Math.floor(T.s / 60);
      const s = T.s - m * 60;
      big.textContent = `${m}:${s.toFixed(2).padStart(5, '0')}`;
    },
  }, 0.1);
  splits.forEach((r, i) => {
    const at = 0.45 + i * 0.4;
    tl.fromTo(r, { opacity: 0, x: -u * 6 }, { opacity: 1, x: 0, duration: 0.2, ease: 'power3.out' }, at);
    k.at(at, () => sfx.beep(1320, 0.08, 0.08));
  });
  tl.call(() => {
    big.style.color = '#6bffb8';
    sfx.beep(1760, 0.12, 0.3);
    sfx.note(12, 0.12, 0.9);
    k.haptic([20, 40, 20]);
  }, [], 1.85);
  tl.fromTo(big, { scale: 1.12 }, { scale: 1, duration: 0.35, ease: 'power3.out', immediateRender: false }, 1.85);
  tl.to(best, { opacity: 1, duration: 0.2 }, 1.9);
  tl.fromTo(best, { letterSpacing: '0.6em' }, { letterSpacing: '0.2em', duration: 0.4, ease: 'power3.out', immediateRender: false }, 1.9);
  tl.to({}, { duration: 0.01 }, 2.5);
}
