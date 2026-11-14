/**
 * LIEUX & PAYS — « Globe » : un globe en points (terres stylisées, méridiens) tourne vite puis freine, la caméra plonge
 * sur un point ; une épingle se plante, les coordonnées s'écrivent ; la carte sort de l'épingle, comme une carte postale
 * tamponnée ★★★★★★, au centre.
 */
import { span, easeOut, type SceneCtx } from '../kit';

export default function globe(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(circle at 50% 46%,#0f131a,#020203 70%);');
  const cv = k.canvas();
  const pts: Array<[number, number, number]> = [];
  const blobs = Array.from({ length: 9 }, () => [k.rand() * 2 - 1, k.rand() * 2 - 1, k.rand() * 2 - 1, 0.35 + k.rand() * 0.35] as const);
  const step = k.mobile ? 4.5 : 3.2;
  for (let lat = -80; lat <= 80; lat += step) {
    const n = Math.max(1, Math.round((360 / step) * Math.cos((lat * Math.PI) / 180)));
    for (let i = 0; i < n; i++) {
      const lon = (i / n) * Math.PI * 2, la = (lat * Math.PI) / 180;
      const x = Math.cos(la) * Math.cos(lon), y = Math.sin(la), z = Math.cos(la) * Math.sin(lon);
      if (blobs.some(([bx, by, bz, r]) => Math.hypot(x - bx / Math.hypot(bx, by, bz), y - by / Math.hypot(bx, by, bz), z - bz / Math.hypot(bx, by, bz)) < r)) pts.push([x, y, z]);
    }
  }
  const cx = w / 2, cy = h * 0.46, R0 = Math.min(w, h) * 0.36;
  const spin0 = k.rand() * Math.PI * 2;
  cv.loop((t) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    const sp = easeOut(span(t, 0, 1.6));
    const rot = spin0 + sp * Math.PI * 3.2;
    const tilt = 0.35;
    const zoom = 1 + Math.pow(span(t, 1.5, 2.2), 2) * 1.6;
    const R = R0 * zoom;
    const fade = 1 - span(t, 2.2, 2.7) * 0.75;
    c.globalAlpha = fade;
    c.fillStyle = '#0a0d12';
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.22)';
    c.lineWidth = 1;
    c.stroke();
    const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
    c.fillStyle = 'rgba(255,255,255,.12)';
    for (let m = 0; m < 12; m++) {
      const lon = (m / 12) * Math.PI * 2;
      for (let la = -1.4; la <= 1.4; la += 0.07) {
        const x = Math.cos(la) * Math.cos(lon), y = Math.sin(la), z = Math.cos(la) * Math.sin(lon);
        const x1 = x * cr - z * sr, z1 = x * sr + z * cr;
        const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        if (z2 > 0) c.fillRect(cx + x1 * R, cy - y2 * R, 1, 1);
      }
    }
    for (const [x, y, z] of pts) {
      const x1 = x * cr - z * sr, z1 = x * sr + z * cr;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      if (z2 <= 0) continue;
      const s = (1.2 + z2 * 1.6) * Math.min(2, zoom);
      c.fillStyle = `rgba(255,255,255,${0.35 + z2 * 0.6})`;
      c.fillRect(cx + x1 * R - s / 2, cy - y2 * R - s / 2, s, s);
    }
    c.globalAlpha = 1;
  });
  k.at(0.05, () => sfx.rumble(1.6, 0.12));
  k.at(0.1, () => sfx.whoosh(1.2, 0.14));
  const pinEl = el('div', '', `position:absolute;left:50%;top:${cy}px;width:${u * 7}px;height:${u * 10.5}px;opacity:0;`);
  k.pin(pinEl, -50, -100);
  pinEl.innerHTML = `<svg viewBox="0 0 40 60" width="100%" height="100%"><path d="M20 58 C 20 40, 2 30, 2 18 A 18 18 0 1 1 38 18 C 38 30, 20 40, 20 58 Z" fill="${accent}"/><circle cx="20" cy="18" r="7" fill="#000"/></svg>`;
  tl.fromTo(pinEl, { opacity: 0, y: -h * 0.3 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.in', immediateRender: false }, 1.6);
  k.at(1.9, () => {
    sfx.stamp(0.32);
    k.haptic(22);
  });
  const lat = (k.rand() * 140 - 70).toFixed(2), lon = (k.rand() * 360 - 180).toFixed(2);
  const coord = k.label(`${Math.abs(+lat)}° ${+lat >= 0 ? 'N' : 'S'} · ${Math.abs(+lon)}° ${+lon >= 0 ? 'E' : 'O'}`, '50%', `${cy + u * 4}px`);
  coord.style.cssText += `transform:translateX(-50%);font-size:${u * 2.6}px;opacity:0;color:${accent};`;
  tl.to(coord, { opacity: 1, duration: 0.3 }, 1.95);
  // la carte sort de l'épingle (carte postale), tampon ★★★★★★
  const a = actor();
  const stampEl = el('div', 'mp-label', `position:absolute;left:50%;top:${h * 0.5 + u * 16}px;padding:${u}px ${u * 2}px;border:${u * 0.5}px solid rgba(255,80,90,.85);border-radius:${u * 6}px;color:rgba(255,80,90,.9);font-size:${u * 3}px;letter-spacing:.2em;opacity:0;z-index:3;`);
  k.pin(stampEl);
  stampEl.textContent = '★★★★★★';
  tl.set(a, { opacity: 1, scale: 0.12, y: cy - h / 2 - u * 4, rotation: 10 }, 2.1);
  tl.to(a, { scale: 1, y: 0, rotation: 0, duration: 0.6, ease: 'power3.inOut' }, 2.12);
  tl.to([pinEl, coord], { opacity: 0, duration: 0.3 }, 2.3);
  tl.fromTo(stampEl, { opacity: 0, scale: 1.8, rotation: -12 }, { opacity: 1, scale: 1, rotation: -12, duration: 0.12, ease: 'power4.in', immediateRender: false }, 2.8);
  k.at(2.92, () => {
    sfx.stamp(0.36);
    k.haptic(16);
  });
  k.shake(2.92, u, 0.2);
  tl.to(stampEl, { opacity: 0, duration: 0.2 }, 3.2);
  tl.to({}, { duration: 0.01 }, 3.35);
}
