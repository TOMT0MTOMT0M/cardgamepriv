/**
 * OLYMPIQUES & ATHLÉTISME — « Photo-finish » : l'image d'arrivée s'IMPRIME de gauche à droite par une ligne de
 * balayage (fond noir, couloirs, silhouettes étirées en traînées claires), le chrono court et se fige en couleur ; la
 * carte franchit la ligne en tête — étirée par le balayage puis nette — et monte au centre.
 */
import { span, type SceneCtx } from '../kit';

export default function photoFinish(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:#050505;');
  const cv = k.canvas();
  const lanes = 6, top = h * 0.24, bot = h * 0.7, lh = (bot - top) / lanes;
  const runners = Array.from({ length: lanes }, (_, i) => ({ x: 0.18 + k.rand() * 0.45, len: 0.08 + k.rand() * 0.07, lane: i }));
  const win = Math.floor(lanes / 2);
  runners[win].x = 0.86;
  cv.loop((t) => {
    const c = cv.c;
    const p = span(t, 0.05, 1.55);
    const sx = p * w;
    c.clearRect(0, 0, w, h);
    c.save();
    c.beginPath();
    c.rect(0, 0, sx, h);
    c.clip();
    for (let i = 0; i <= lanes; i++) {
      c.fillStyle = 'rgba(255,255,255,.18)';
      c.fillRect(0, top + i * lh - 1, w, 2);
    }
    // traînées étirées (tout ce qui bouge devient une bande horizontale)
    for (const r of runners) {
      if (r.lane === win) continue;
      const x0 = (1 - r.x - r.len) * w;
      const y0 = top + r.lane * lh + lh * 0.2;
      const g = c.createLinearGradient(x0, 0, x0 + r.len * w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,.55)');
      c.fillStyle = g;
      c.fillRect(x0, y0, r.len * w, lh * 0.6);
    }
    c.restore();
    if (p < 1) {
      c.fillStyle = accent;
      c.fillRect(sx - 1, top - u * 4, 2, bot - top + u * 8);
    }
    // ligne d'arrivée (damier vertical) à droite
    for (let y = top; y < bot; y += u * 1.2) c.fillStyle = Math.floor(y / (u * 1.2)) % 2 ? '#fff' : '#333', c.fillRect(w * 0.92, y, u * 1.2, u * 1.2);
  });
  const time = el('div', '', `position:absolute;left:50%;top:${h * 0.09}px;font:700 ${u * 9}px/1 var(--mono);color:#fff;letter-spacing:.02em;font-variant-numeric:tabular-nums;`);
  k.pin(time, -50, 0);
  const ch = { t: 0 };
  const final = 9.5 + k.rand() * 0.6;
  tl.to(ch, { t: final, duration: 1.55, ease: 'power1.out', onUpdate: () => (time.textContent = ch.t.toFixed(2)) }, 0.05);
  k.at(0.05, () => sfx.roll(1.5, 0.07));
  // la carte dans le couloir du vainqueur, étirée par le balayage puis nette
  const a = actor();
  const ly = top + win * lh + lh / 2 - h / 2;
  const lx = (1 - runners[win].x) * w + u * 6 - w / 2;
  tl.set(a, { opacity: 1, scale: 0.42, scaleX: 2.6, x: lx, y: ly, filter: 'blur(2px) brightness(1.4)' }, 1.2);
  tl.to(a, { scaleX: 0.42, filter: 'blur(0px) brightness(1)', duration: 0.4, ease: 'power3.out' }, 1.25);
  k.at(1.6, () => {
    sfx.beep(1760, 0.12, 0.25);
    k.haptic(14);
  });
  tl.to(time, { color: accent, scale: 1.15, duration: 0.15, yoyo: true, repeat: 1 }, 1.6);
  k.label('1ER · RECORD', '50%', `${h * 0.78}px`).style.cssText += `transform:translateX(-50%);color:${accent};opacity:0;`;
  const lab = k.root.lastElementChild as HTMLElement;
  tl.to(lab, { opacity: 1, duration: 0.3 }, 1.75);
  tl.to(a, { scale: 1, scaleX: 1, x: 0, y: 0, duration: 0.6, ease: 'power3.inOut' }, 1.9);
  k.at(1.9, () => {
    sfx.note(7, 0.12, 0.6);
    sfx.note(9, 0.12, 0.6, 0.1);
    sfx.note(12, 0.14, 1, 0.2);
  });
  tl.to([cv.c.canvas, lab, time], { opacity: 0.3, duration: 0.4 }, 2.2);
  tl.to({}, { duration: 0.01 }, 2.75);
}
