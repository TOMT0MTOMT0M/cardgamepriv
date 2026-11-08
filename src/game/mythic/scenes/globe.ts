/**
 * LIEUX & PAYS — « Globe » : un globe noir et blanc en points (méridiens, terres stylisées) tourne vite puis freine et
 * plonge ; une épingle se plante, la carte postale est tamponnée (six étoiles) — la carte.
 */
import { span, easeOut, type SceneCtx } from '../kit';

export default function globe(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(circle at 50% 46%,#10141a,#020203 70%);');
  const cv = k.canvas();
  // points de « terres » : bruit de valeur sur la sphère (déterministe par carte)
  const pts: Array<[number, number, number]> = [];
  const blobs = Array.from({ length: 9 }, () => [k.rand() * 2 - 1, k.rand() * 2 - 1, k.rand() * 2 - 1, 0.35 + k.rand() * 0.35] as const);
  const step = k.mobile ? 4.5 : 3.2;
  for (let lat = -80; lat <= 80; lat += step) {
    const n = Math.max(1, Math.round((360 / step) * Math.cos((lat * Math.PI) / 180)));
    for (let i = 0; i < n; i++) {
      const lon = (i / n) * Math.PI * 2;
      const la = (lat * Math.PI) / 180;
      const x = Math.cos(la) * Math.cos(lon);
      const y = Math.sin(la);
      const z = Math.cos(la) * Math.sin(lon);
      let land = false;
      for (const [bx, by, bz, r] of blobs) {
        const d = Math.hypot(x - bx / Math.hypot(bx, by, bz), y - by / Math.hypot(bx, by, bz), z - bz / Math.hypot(bx, by, bz));
        if (d < r) land = true;
      }
      if (land) pts.push([x, y, z]);
    }
  }
  const cx = w / 2;
  const cy = h * 0.46;
  const R0 = Math.min(w, h) * 0.36;
  const spin0 = k.rand() * Math.PI * 2;
  cv.loop((t) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    // rotation : vite, puis freine ; zoom (plongée) à la fin
    const sp = easeOut(span(t, 0, 1.6));
    const rot = spin0 + sp * Math.PI * 3.2;
    const tilt = 0.35;
    const zoom = 1 + Math.pow(span(t, 1.5, 2.3), 2) * 2.6;
    const R = R0 * zoom;
    const yo = cy + (zoom - 1) * R0 * 0.25;
    // halo + bord
    c.fillStyle = '#0a0d12';
    c.beginPath();
    c.arc(cx, yo, R, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.25)';
    c.lineWidth = 1;
    c.stroke();
    const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
    // méridiens / parallèles (points fins)
    c.fillStyle = 'rgba(255,255,255,.12)';
    for (let m = 0; m < 12; m++) {
      const lon = (m / 12) * Math.PI * 2;
      for (let la = -1.4; la <= 1.4; la += 0.07) {
        const x = Math.cos(la) * Math.cos(lon), y = Math.sin(la), z = Math.cos(la) * Math.sin(lon);
        const x1 = x * cr - z * sr, z1 = x * sr + z * cr;
        const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        if (z2 > 0) c.fillRect(cx + x1 * R, yo - y2 * R, 1, 1);
      }
    }
    // terres
    for (const [x, y, z] of pts) {
      const x1 = x * cr - z * sr, z1 = x * sr + z * cr;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      if (z2 <= 0) continue;
      const s = (1.2 + z2 * 1.6) * Math.min(2.4, zoom);
      c.fillStyle = `rgba(255,255,255,${0.35 + z2 * 0.6})`;
      c.fillRect(cx + x1 * R - s / 2, yo - y2 * R - s / 2, s, s);
    }
  });
  k.at(0.05, () => sfx.rumble(1.6, 0.12));
  k.at(0.1, () => sfx.whoosh(1.2, 0.14));
  // épingle
  const pinEl = pin(el('div', '', `position:absolute;left:50%;top:${h * 0.46}px;width:${u * 8}px;height:${u * 12}px;opacity:0;`), -50, -100);
  pinEl.innerHTML = `<svg viewBox="0 0 40 60" width="100%" height="100%"><path d="M20 58 C 20 40, 2 30, 2 18 A 18 18 0 1 1 38 18 C 38 30, 20 40, 20 58 Z" fill="#fff"/><circle cx="20" cy="18" r="7" fill="#000"/></svg>`;
  tl.fromTo(pinEl, { opacity: 0, y: -h * 0.3 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.in', immediateRender: false }, 1.6);
  k.at(1.9, () => {
    sfx.stamp(0.32);
    k.haptic(22);
  });
  // carte postale tamponnée
  const pc = pin(el('div', '', `position:absolute;left:50%;top:${h * 0.5}px;width:${Math.min(w * 0.8, u * 80)}px;height:${Math.min(w * 0.8, u * 80) * 0.62}px;background:#efe9dc;box-shadow:0 30px 70px rgba(0,0,0,.8);opacity:0;`));
  el('div', '', 'position:absolute;left:52%;top:12%;bottom:12%;width:1px;background:#bbb;', pc);
  for (let i = 0; i < 4; i++) el('div', '', `position:absolute;left:58%;right:8%;top:${46 + i * 11}%;height:1px;background:#c9c2b4;`, pc);
  const stampEl = el('div', '', `position:absolute;right:7%;top:9%;width:22%;aspect-ratio:1;border:${u * 0.5}px dashed #aaa;display:grid;place-items:center;background:conic-gradient(#ff6b9a,#ffd36b,#6bffb8,#6bc8ff,#c86bff,#ff6b9a);`, pc);
  const ink = pin(el('div', 'mp-mono', `position:absolute;left:32%;top:46%;padding:${u}px ${u * 2}px;border:${u * 0.5}px solid rgba(160,30,40,.8);border-radius:${u * 6}px;color:rgba(160,30,40,.85);font-size:${u * 3}px;letter-spacing:.2em;transform:rotate(-12deg);opacity:0;`, pc));
  ink.textContent = '★★★★★★';
  void stampEl;
  tl.fromTo(pc, { opacity: 0, y: h * 0.4, rotation: 8 }, { opacity: 1, y: 0, rotation: -3, duration: 0.35, ease: 'power3.out', immediateRender: false }, 2.0);
  tl.fromTo(ink, { opacity: 0, scale: 1.8 }, { opacity: 1, scale: 1, duration: 0.12, ease: 'power4.in', immediateRender: false }, 2.3);
  k.at(2.42, () => sfx.stamp(0.36));
  k.shake(2.42, u, 0.2);
  tl.to({}, { duration: 0.01 }, 2.7);
}
