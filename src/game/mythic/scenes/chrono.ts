/**
 * GLISSE & MONTAGNE — « Chrono » : la piste file (neige en traînées, portes de slalom rouges / bleues qui passent en
 * défilant), les chiffres LIBRES sur l'image (pas de panneau) : intermédiaires en vert, chrono qui court et se fige ;
 * la carte franchit la dernière porte et freine au centre dans un nuage de neige.
 */
import type { SceneCtx } from '../kit';

export default function chrono(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#0b131c,#1a2735 48%,#d5dee6 49%,#8e9fae);');
  const cv = k.canvas();
  const flakes = Array.from({ length: k.mobile ? 100 : 200 }, () => ({ x: k.rand() * w, y: k.rand() * h, s: 0.5 + k.rand() * 2, v: 0.6 + k.rand() }));
  const gates = Array.from({ length: 6 }, (_, i) => ({ z: i / 6, side: i % 2 ? 1 : -1 }));
  cv.loop((t, dt) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    const sp = t < 2 ? 1 : Math.max(0, 1 - (t - 2) / 0.5);
    c.fillStyle = 'rgba(255,255,255,.8)';
    for (const f of flakes) {
      f.x -= dt * w * 1.1 * f.v * sp;
      f.y += dt * h * 0.12 * f.v * sp;
      if (f.x < -10) {
        f.x += w + 20;
        f.y = k.rand() * h;
      }
      c.fillRect(f.x, f.y, f.s * (4 + 10 * sp), f.s * 0.7);
    }
    // portes de slalom (vers nous)
    for (const g of gates) {
      g.z = (g.z + dt * 0.5 * sp) % 1;
      const p = Math.pow(g.z, 2.2);
      const y = h * 0.49 + h * 0.5 * p;
      const x = w / 2 + g.side * (w * 0.08 + w * 0.5 * p);
      const gh = u * 2 + u * 28 * p;
      c.fillStyle = g.side < 0 ? '#d52b3a' : '#2b5fd5';
      c.fillRect(x - Math.max(1, u * 0.5 * p + 0.5), y - gh, Math.max(2, u * p + 1), gh);
      c.fillRect(x, y - gh, u * 10 * p + 2, u * 5 * p + 1);
    }
  });
  const splits = ['INTER 1', 'INTER 2', 'INTER 3'].map((lab, i) => {
    const r = el('div', '', `position:absolute;left:${u * 6}px;top:${u * (8 + i * 6)}px;display:flex;gap:${u * 3}px;font:600 ${u * 3}px var(--mono);letter-spacing:.14em;color:#fff;opacity:0;`);
    r.innerHTML = `<span style="opacity:.55">${lab}</span><b style="font-variant-numeric:tabular-nums;color:${accent}">−0.${String(Math.floor(k.rand() * 90 + 10))}</b>`;
    return r;
  });
  const big = el('div', '', `position:absolute;right:${u * 6}px;top:${u * 7}px;font:700 ${u * 11}px/1 var(--mono);color:#fff;font-variant-numeric:tabular-nums;text-shadow:0 2px 20px rgba(0,0,0,.6);`);
  const best = el('div', '', `position:absolute;left:0;right:0;top:${h * 0.78}px;text-align:center;font:800 ${u * 7}px var(--title);letter-spacing:.2em;color:#0b1c28;white-space:nowrap;opacity:0;`);
  best.textContent = 'Meilleur temps'; // (10/11) casse du jeu, encre sombre : le bleu glacier ne se lisait pas sur la neige
  k.at(0.05, () => sfx.ambience('glace', 2.4, 0.12));
  k.at(0.1, () => sfx.whoosh(0.6, 0.2, false));
  const T = { s: 0 };
  const final = 100 + k.rand() * 15;
  tl.to(T, { s: final, duration: 1.9, ease: 'none', onUpdate: () => { const m = Math.floor(T.s / 60); big.textContent = `${m}:${(T.s - m * 60).toFixed(2).padStart(5, '0')}`; } }, 0.1);
  splits.forEach((r, i) => {
    const at = 0.45 + i * 0.4;
    tl.fromTo(r, { opacity: 0, x: -u * 6 }, { opacity: 1, x: 0, duration: 0.2, ease: 'power3.out' }, at);
    k.at(at, () => sfx.beep(1320, 0.08, 0.08));
  });
  // la carte dévale vers nous et freine au centre
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.05, y: -u * 2, rotation: -25 }, 0.8);
  tl.to(a, { scale: 1, y: 0, rotation: 8, duration: 1.2, ease: 'power3.in' }, 0.85);
  tl.to(a, { rotation: 0, duration: 0.35, ease: 'back.out(2)' }, 2.05);
  tl.call(() => {
    big.style.color = accent;
    sfx.beep(1760, 0.12, 0.3);
    sfx.note(12, 0.12, 0.9);
    sfx.hiss({ dur: 0.5, vol: 0.18, type: 'lowpass', f: 1200 });
    k.haptic([20, 40, 20]);
  }, [], 2.0);
  tl.fromTo(big, { scale: 1.12 }, { scale: 1, duration: 0.35, ease: 'power3.out', immediateRender: false }, 2.0);
  tl.to(best, { opacity: 1, duration: 0.2 }, 2.05);
  tl.fromTo(best, { letterSpacing: '0.3em' }, { letterSpacing: '0.06em', duration: 0.4, ease: 'power3.out', immediateRender: false }, 2.05);
  tl.to({}, { duration: 0.01 }, 2.75);
}
