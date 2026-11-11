/**
 * MANGAS & ANIME — « Case de manga » : planche noir et blanc, cases encrées de trames abstraites ; dans la grande case,
 * les lignes de vitesse s'emballent, l'onomatopée claque, la case se fend… et LA CARTE EN JAILLIT, en dépassant du
 * papier, jusqu'au centre. (Yu-Gi-Oh garde son invocation.)
 */
import { span, type SceneCtx } from '../kit';

const ONO = ['ドン', 'ゴゴゴ', 'ザン', 'バン', 'ドドド', 'ズバッ'];

export default function manga(k: SceneCtx) {
  const { tl, u, el, sfx, actor, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:#0a0a0a;');
  const pw = Math.min(w * 0.9, h * 0.6);
  const ph = pw * 1.42;
  const page = el('div', '', `position:absolute;left:50%;top:50%;width:${pw}px;height:${ph}px;background:#f4f1ea;box-shadow:0 40px 90px rgba(0,0,0,.85);`);
  k.pin(page);
  const B = u * 0.8;
  const pad = pw * 0.045;
  const iw = pw - pad * 2;
  const ih = ph - pad * 2;
  const cells: Array<[number, number, number, number]> = [[0, 0, 0.58, 0.24], [0.6, 0, 0.4, 0.24], [0, 0.26, 1, 0.46], [0, 0.74, 0.38, 0.26], [0.4, 0.74, 0.6, 0.26]];
  const tones = [
    (c: HTMLElement) => el('div', '', 'position:absolute;inset:0;background:radial-gradient(circle,#111 1px,transparent 1.6px) 0 0/6px 6px;opacity:.5;mask-image:linear-gradient(160deg,#000 30%,transparent 80%);-webkit-mask-image:linear-gradient(160deg,#000 30%,transparent 80%);', c),
    (c: HTMLElement) => el('div', '', 'position:absolute;inset:0;background:repeating-linear-gradient(45deg,#111 0 1px,transparent 1px 5px);opacity:.55;mask-image:radial-gradient(circle at 70% 30%,transparent 30%,#000 75%);-webkit-mask-image:radial-gradient(circle at 70% 30%,transparent 30%,#000 75%);', c),
    () => undefined,
    (c: HTMLElement) => el('div', '', 'position:absolute;inset:0;background:repeating-linear-gradient(-70deg,#111 0 2px,transparent 2px 7px);opacity:.7;', c),
    (c: HTMLElement) => el('div', '', 'position:absolute;inset:0;background:radial-gradient(circle,#111 1.4px,transparent 2px) 0 0/8px 8px,linear-gradient(180deg,transparent 50%,#111 50%);opacity:.6;', c),
  ];
  const els = cells.map(([x, y, cw2, ch], i) => {
    const c = el('div', '', `position:absolute;left:${pad + x * iw}px;top:${pad + y * ih}px;width:${cw2 * iw}px;height:${ch * ih}px;border:${B}px solid #111;background:#fbfaf6;overflow:hidden;`, page);
    tones[i](c);
    return c;
  });
  const mid = els[2];
  const mw = cells[2][2] * iw - B * 2;
  const mh = cells[2][3] * ih - B * 2;
  const cv = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = mw * dpr;
  cv.height = mh * dpr;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  mid.append(cv);
  const c2 = cv.getContext('2d')!;
  c2.scale(dpr, dpr);
  const lines = Array.from({ length: 110 }, () => ({ a: k.rand() * Math.PI * 2, w: 0.003 + k.rand() * 0.018, r0: 0.16 + k.rand() * 0.25 }));
  k.loop((t) => {
    const p = span(t, 0.7, 1.5);
    c2.clearRect(0, 0, mw, mh);
    if (p <= 0) return;
    c2.fillStyle = '#111';
    const cx = mw / 2, cy = mh / 2;
    const R = Math.hypot(cx, cy) * 1.2;
    const jit = Math.floor(t * 24);
    for (let i = 0; i < lines.length * p; i++) {
      const l = lines[i];
      const a = l.a + ((jit * 7 + i) % 5) * 0.002;
      const r0 = R * (l.r0 - p * 0.08);
      c2.beginPath();
      c2.moveTo(cx + Math.cos(a - l.w) * R, cy + Math.sin(a - l.w) * R);
      c2.lineTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c2.lineTo(cx + Math.cos(a + l.w) * R, cy + Math.sin(a + l.w) * R);
      c2.fill();
    }
  });
  const ono = ONO[Math.floor(k.rand() * ONO.length)];
  const ot = el('div', '', `position:absolute;left:50%;top:50%;font:900 ${mh * 0.6}px/1 "Hiragino Sans","Yu Gothic","Noto Sans JP",system-ui,sans-serif;color:#fff;-webkit-text-stroke:${u * 0.9}px #111;paint-order:stroke;white-space:nowrap;letter-spacing:-.04em;opacity:0;`, mid);
  ot.textContent = ono + '！';
  k.pin(ot);
  tl.fromTo(page, { y: h * 0.6, rotation: 4, opacity: 0 }, { y: 0, rotation: -1.5, opacity: 1, duration: 0.45, ease: 'power3.out' }, 0);
  k.at(0.05, () => sfx.whoosh(0.4, 0.2, true, 'power3.out'));
  els.forEach((e, i) => {
    const at = 0.3 + (i === 2 ? 0.25 : i * 0.08);
    tl.fromTo(e, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.18, ease: 'power2.out' }, at);
    k.at(at, () => sfx.tick(0.5 + i * 0.1, 0.18));
  });
  k.at(0.75, () => sfx.riser(0.8, 0.14));
  tl.fromTo(ot, { scale: 2.6, opacity: 0, rotation: -14 }, { scale: 1, opacity: 1, rotation: -6, duration: 0.18, ease: 'power4.out' }, 1.25);
  k.at(1.25, () => {
    sfx.hit(0.6, 55);
    k.haptic([30, 20, 30]);
  });
  k.shake(1.25, u * 1.4, 0.3);
  // la case se fend (éclair blanc), la carte jaillit
  const crack = el('div', '', 'position:absolute;inset:0;background:#fff;clip-path:polygon(48% 0,52% 0,47% 40%,55% 55%,49% 100%,45% 100%,51% 56%,43% 41%);transform:scaleX(0);', mid);
  tl.to(crack, { scaleX: 1, duration: 0.12, ease: 'power3.out' }, 1.85);
  tl.to(ot, { opacity: 0, duration: 0.15 }, 1.9);
  k.at(1.85, () => sfx.slash(0.3));
  const a = actor();
  const midRect = { x: pad + cells[2][0] * iw + mw / 2 - pw / 2, y: pad + cells[2][1] * ih + mh / 2 - ph / 2 };
  tl.set(a, { opacity: 1, scale: 0.2, x: midRect.x, y: midRect.y, rotation: -8 }, 1.95);
  tl.to(a, { scale: 1, x: 0, y: 0, rotation: 0, duration: 0.55, ease: 'back.out(1.4)' }, 1.98);
  tl.to(page, { scale: 1.12, opacity: 0.25, filter: 'blur(3px)', duration: 0.5, ease: 'power2.out' }, 2.0);
  k.at(2.0, () => {
    sfx.whoosh(0.4, 0.25, true, 'power2.out');
    k.haptic(20);
  });
  k.at(2.5, () => sfx.hit(0.4, 60));
  tl.to({}, { duration: 0.01 }, 2.8);
}
