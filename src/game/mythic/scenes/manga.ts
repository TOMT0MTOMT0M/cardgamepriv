/**
 * MANGAS & ANIME — « Case de manga » : une planche noir et blanc se pose, ses cases s'encrent une à une ; dans la case
 * du milieu, les lignes de vitesse s'emballent, une onomatopée géante claque (« ドン ! », « ゴゴゴ »…), puis la case se
 * fend et la carte jaillit. (Yu-Gi-Oh garde son invocation.)
 */
import { span, type SceneCtx } from '../kit';

const ONO = ['ドン', 'ゴゴゴ', 'ザン', 'バン', 'ドドド', 'ズバッ'];

export default function manga(k: SceneCtx) {
  const { tl, u, el, sfx, pin } = k;
  el('div', '', 'position:absolute;inset:0;background:#0b0b0b;');
  const pw = Math.min(k.w * 0.9, k.h * 0.62);
  const ph = pw * 1.42;
  const page = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${pw}px;height:${ph}px;background:#f3f0e8;box-shadow:0 30px 80px rgba(0,0,0,.8);overflow:hidden;`));
  const B = u * 0.9;
  const pad = pw * 0.05;
  // cases (en fraction de la planche) : [x, y, w, h]
  const cells: Array<[number, number, number, number]> = [
    [0, 0, 0.58, 0.26],
    [0.6, 0, 0.4, 0.26],
    [0, 0.28, 1, 0.42],
    [0, 0.72, 0.38, 0.28],
    [0.4, 0.72, 0.6, 0.28],
  ];
  const iw = pw - pad * 2;
  const ih = ph - pad * 2;
  const els = cells.map(([x, y, w, h], i) => {
    const c = el('div', '', `position:absolute;left:${pad + x * iw}px;top:${pad + y * ih}px;width:${w * iw}px;height:${h * ih}px;border:${B}px solid #111;background:#fbfaf6;overflow:hidden;`, page);
    // trame (points) dans les petites cases
    if (i !== 2) el('div', '', `position:absolute;inset:0;background:radial-gradient(circle,#111 ${0.9 + (i % 2) * 0.5}px,transparent ${1.4 + (i % 2) * 0.5}px) 0 0/${6 + i}px ${6 + i}px;opacity:${0.25 + i * 0.08};`, c);
    if (i === 0) el('div', '', 'position:absolute;left:10%;right:30%;bottom:18%;height:22%;background:#111;border-radius:50% 50% 0 0;', c);
    if (i === 1) el('div', '', 'position:absolute;right:12%;top:18%;width:44%;height:44%;border:3px solid #111;border-radius:50%;background:#fff;', c);
    if (i === 3) for (let j = 0; j < 7; j++) el('div', '', `position:absolute;left:${j * 15}%;top:0;bottom:0;width:2px;background:#111;transform:skewX(-18deg);opacity:.6;`, c);
    if (i === 4) el('div', '', 'position:absolute;inset:18% 8%;background:linear-gradient(160deg,transparent 40%,#111 41%,#111 46%,transparent 47%);', c);
    return c;
  });
  const mid = els[2];
  // lignes de vitesse (canvas dans la case du milieu)
  const mw = cells[2][2] * iw - B * 2;
  const mh = cells[2][3] * ih - B * 2;
  const cv = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = mw * dpr;
  cv.height = mh * dpr;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  mid.append(cv);
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  const lines = Array.from({ length: 90 }, () => ({ a: k.rand() * Math.PI * 2, w: 0.004 + k.rand() * 0.02, r0: 0.18 + k.rand() * 0.25 }));
  k.loop((t) => {
    const p = span(t, 0.75, 1.6);
    c.clearRect(0, 0, mw, mh);
    if (p <= 0) return;
    c.fillStyle = '#111';
    const cx = mw / 2;
    const cy = mh / 2;
    const R = Math.hypot(cx, cy) * 1.2;
    const jit = Math.floor(t * 24);
    for (let i = 0; i < lines.length * p; i++) {
      const l = lines[i];
      const a = l.a + ((jit * 7 + i) % 5) * 0.002;
      const r0 = R * (l.r0 - p * 0.08);
      c.beginPath();
      c.moveTo(cx + Math.cos(a - l.w) * R, cy + Math.sin(a - l.w) * R);
      c.lineTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a + l.w) * R, cy + Math.sin(a + l.w) * R);
      c.fill();
    }
  });
  const ono = ONO[Math.floor(k.rand() * ONO.length)];
  const ot = el('div', '', `position:absolute;left:50%;top:50%;font:900 ${mh * 0.62}px/1 "Hiragino Sans","Yu Gothic","Noto Sans JP",system-ui,sans-serif;color:#fff;-webkit-text-stroke:${u * 0.9}px #111;paint-order:stroke;white-space:nowrap;letter-spacing:-.04em;`, mid);
  ot.textContent = ono + '！';
  pin(ot);
  // la planche arrive, les cases s'encrent une à une
  tl.fromTo(page, { y: k.h * 0.6, rotation: 4, opacity: 0 }, { y: 0, rotation: -1.5, opacity: 1, duration: 0.45, ease: 'power3.out' }, 0);
  k.at(0.05, () => sfx.whoosh(0.4, 0.2));
  els.forEach((e, i) => {
    const at = 0.3 + (i === 2 ? 0.25 : i * 0.09);
    tl.fromTo(e, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.18, ease: 'power2.out' }, at);
    k.at(at, () => sfx.tick(0.5 + i * 0.1, 0.18));
  });
  k.at(0.8, () => sfx.riser(0.8, 0.14));
  tl.fromTo(ot, { scale: 2.6, opacity: 0, rotation: -14 }, { scale: 1, opacity: 1, rotation: -6, duration: 0.18, ease: 'power4.out' }, 1.3);
  k.at(1.3, () => {
    sfx.hit(0.6, 55);
    k.haptic([30, 20, 30]);
  });
  k.shake(1.3, u * 1.4, 0.3);
  tl.to(page, { scale: 1.06, duration: 0.6, ease: 'none' }, 1.3);
  // la case se fend : deux moitiés qui s'écartent, la lumière passe
  const crack = el('div', '', 'position:absolute;inset:0;background:#fff;clip-path:polygon(48% 0,52% 0,47% 40%,55% 55%,49% 100%,45% 100%,51% 56%,43% 41%);transform:scaleX(0);', mid);
  tl.to(crack, { scaleX: 1, duration: 0.14, ease: 'power3.out' }, 1.95);
  k.at(1.95, () => sfx.slash(0.3));
  tl.to(crack, { scaleX: 40, duration: 0.3, ease: 'power3.in' }, 2.12);
  tl.to(page, { scale: 2.2, duration: 0.35, ease: 'power3.in' }, 2.12);
  tl.to({}, { duration: 0.01 }, 2.5);
}
