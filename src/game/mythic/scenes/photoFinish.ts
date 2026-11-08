/**
 * OLYMPIQUES & ATHLÉTISME — « Photo-finish » : une ligne de balayage verticale « imprime » l'arrivée de gauche à
 * droite (couloirs, silhouettes étirées), le chrono s'arrête ; la 1re marche du podium monte — la carte.
 */
import { span, type SceneCtx } from '../kit';

export default function photoFinish(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:#e9e6df;');
  const cv = k.canvas();
  const lanes = 6;
  const top = h * 0.2;
  const bot = h * 0.68;
  const lh = (bot - top) / lanes;
  // « coureurs » : bandes étirées à des positions données, une par couloir
  const runners = Array.from({ length: lanes }, (_, i) => ({ x: 0.25 + k.rand() * 0.5, len: 0.06 + k.rand() * 0.05, lane: i }));
  runners[Math.floor(lanes / 2)].x = 0.82; // le vainqueur, en tête
  cv.loop((t) => {
    const c = cv.c;
    const p = span(t, 0.05, 1.6);
    const sx = p * w;
    c.clearRect(0, 0, w, h);
    c.save();
    c.beginPath();
    c.rect(0, 0, sx, h);
    c.clip();
    // couloirs
    for (let i = 0; i <= lanes; i++) {
      c.fillStyle = '#b8b2a6';
      c.fillRect(0, top + i * lh - 1, w, 2);
    }
    // grain horizontal (le photo-finish étire tout ce qui est immobile en bandes)
    for (let y = top; y < bot; y += 3) {
      c.fillStyle = `rgba(80,74,64,${0.03 + ((y * 13) % 7) * 0.006})`;
      c.fillRect(0, y, w, 1);
    }
    for (const r of runners) {
      const x0 = (1 - r.x - r.len) * w;
      const y0 = top + r.lane * lh + lh * 0.12;
      c.fillStyle = '#16140f';
      // silhouette étirée : tête, torse, jambes
      c.beginPath();
      c.ellipse(x0 + r.len * w * 0.85, y0 + lh * 0.18, lh * 0.12, lh * 0.14, 0, 0, Math.PI * 2);
      c.fill();
      c.fillRect(x0 + r.len * w * 0.3, y0 + lh * 0.32, r.len * w * 0.6, lh * 0.28);
      for (let j = 0; j < 4; j++) c.fillRect(x0 + j * r.len * w * 0.22, y0 + lh * 0.6, r.len * w * 0.09, lh * 0.28);
    }
    c.restore();
    // ligne de balayage
    if (p < 1) {
      c.fillStyle = '#d6201c';
      c.fillRect(sx - 1, top - u * 4, 2, bot - top + u * 8);
    }
  });
  const time = pin(el('div', '', `position:absolute;left:50%;top:${h * 0.08}px;font:700 ${u * 9}px/1 var(--mono);color:#16140f;letter-spacing:.02em;font-variant-numeric:tabular-nums;`), -50, 0);
  const ch = { t: 0 };
  const final = 9.5 + k.rand() * 0.6;
  tl.to(ch, { t: final, duration: 1.6, ease: 'power1.out', onUpdate: () => (time.textContent = ch.t.toFixed(2)) }, 0.05);
  k.at(0.05, () => sfx.roll(1.5, 0.07));
  k.at(1.65, () => {
    sfx.beep(1760, 0.12, 0.25);
    k.haptic(14);
  });
  tl.to(time, { color: '#d6201c', scale: 1.15, duration: 0.15, yoyo: true, repeat: 1 }, 1.65);
  // podium : la 1re marche monte avec la tranche arc-en-ciel
  const pw = Math.min(w * 0.7, u * 70);
  const pod = el('div', '', `position:absolute;left:50%;bottom:0;width:${pw}px;height:${h * 0.26}px;display:flex;align-items:flex-end;gap:${u}px;`);
  pin(pod, -50, 0);
  const steps: HTMLElement[] = [];
  for (const [n, hh] of [[2, 0.62], [1, 1], [3, 0.45]] as const) {
    const s = el('div', '', `flex:1;height:${hh * 100}%;background:#16140f;color:#e9e6df;display:flex;justify-content:center;padding-top:${u * 2}px;font:800 ${u * (n === 1 ? 10 : 6)}px var(--display);`, pod);
    s.textContent = String(n);
    if (n === 1) s.style.boxShadow = 'inset 0 4px 0 #ff6b9a, inset 0 8px 0 #ffd36b, inset 0 12px 0 #6bc8ff';
    steps.push(s);
  }
  tl.fromTo(pod, { y: h * 0.3 }, { y: 0, duration: 0.45, ease: 'power3.out' }, 1.75);
  tl.fromTo(steps[1], { scaleY: 0.6, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.4, ease: 'back.out(2)' }, 1.95);
  k.at(1.95, () => {
    sfx.note(7, 0.12, 0.6);
    sfx.note(9, 0.12, 0.6, 0.1);
    sfx.note(12, 0.14, 1, 0.2);
  });
  tl.to({}, { duration: 0.01 }, 2.6);
}
