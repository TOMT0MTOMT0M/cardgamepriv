/**
 * SÉRIES TV — « Télé cathodique » : une vieille télé s'allume (la ligne blanche qui s'ouvre), zapping dans la neige
 * (« CH 03 », « CH 04 »…), le signal accroche : l'écran devient blanc et la caméra entre dedans — la carte.
 */
import type { SceneCtx } from '../kit';

export default function tele(k: SceneCtx) {
  const { tl, u, el, sfx, pin } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 50%,#16130f,#040303 75%);');
  const W = Math.min(k.w * 0.9, u * 96);
  const H = W * 0.78;
  const set = pin(el('div', '', `position:absolute;left:50%;top:48%;width:${W}px;height:${H}px;border-radius:${u * 5}px;background:linear-gradient(170deg,#3a3329,#1b1712);box-shadow:inset 0 2px 0 rgba(255,255,255,.08),0 30px 70px rgba(0,0,0,.9);`));
  // pieds + boutons
  for (const x of [18, 82]) el('div', '', `position:absolute;left:${x}%;bottom:-${u * 4}px;width:${u * 2}px;height:${u * 4}px;background:#14110d;transform:skewX(${x < 50 ? 12 : -12}deg);`, set);
  const scr = el('div', '', `position:absolute;left:5%;top:7%;width:72%;height:86%;border-radius:${u * 4}px / ${u * 5}px;background:#0d100f;overflow:hidden;box-shadow:inset 0 0 ${u * 5}px #000;`, set);
  for (let i = 0; i < 2; i++) el('div', '', `position:absolute;left:84%;top:${14 + i * 18}%;width:${u * 6}px;height:${u * 6}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#5a5045,#1d1915);box-shadow:0 2px 4px #000;`, set);
  for (let i = 0; i < 5; i++) el('div', '', `position:absolute;left:83%;width:11%;top:${58 + i * 6}%;height:2px;background:#0f0c09;`, set);
  // neige
  const sw = 160, sh = 120;
  const cv = document.createElement('canvas');
  cv.width = sw;
  cv.height = sh;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;image-rendering:pixelated;';
  scr.append(cv);
  const g = cv.getContext('2d')!;
  const img = g.createImageData(sw, sh);
  const bars = el('div', '', 'position:absolute;inset:0;opacity:0;background:linear-gradient(90deg,#c0c0c0 0 14%,#c0c000 14% 28%,#00c0c0 28% 42%,#00c000 42% 57%,#c000c0 57% 71%,#c00000 71% 85%,#0000c0 85%);', scr);
  const osd = el('div', 'mp-mono', `position:absolute;right:7%;top:7%;font-size:${u * 4}px;color:#7dff8a;text-shadow:0 0 8px #7dff8a;opacity:0;letter-spacing:.1em;`, scr);
  const line = el('div', '', 'position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:#fff;box-shadow:0 0 16px #fff;transform:scaleX(0);', scr);
  const glow = el('div', '', 'position:absolute;inset:0;background:radial-gradient(circle,#fff,#e8f4ff 60%,#bcd 100%);opacity:0;', scr);
  el('div', '', 'position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.3) 0 1px,transparent 1px 3px),radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.1),transparent 50%);pointer-events:none;', scr);
  k.loop((t) => {
    if (t < 0.55 || t > 1.85) return;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // bande de roulement
    const y = ((t * 90) % sh) | 0;
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, y, sw, 10);
  });
  tl.fromTo(set, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' }, 0);
  k.at(0.3, () => sfx.tvOn());
  tl.to(line, { scaleX: 1, duration: 0.1, ease: 'power2.out' }, 0.3);
  tl.to(line, { scaleY: 90, opacity: 0, duration: 0.2, ease: 'power2.in' }, 0.42);
  tl.set(cv, { opacity: 1 }, 0.55);
  k.at(0.55, () => sfx.staticNoise(1.3, 0.12));
  const start = 1 + Math.floor(k.rand() * 8);
  for (let i = 0; i < 4; i++) {
    const at = 0.62 + i * 0.28;
    tl.call(() => {
      osd.textContent = `CH ${String(start + i).padStart(2, '0')}`;
      sfx.tick(0.5, 0.22);
      k.haptic(6);
    }, [], at);
    tl.set(osd, { opacity: 1 }, at);
    if (i === 1 || i === 3) tl.fromTo(bars, { opacity: 0.9 }, { opacity: 0, duration: 0.12, immediateRender: false }, at + 0.02);
  }
  // le signal accroche
  tl.to(cv, { opacity: 0, duration: 0.25 }, 1.8);
  tl.to(osd, { opacity: 0, duration: 0.2 }, 1.8);
  tl.to(glow, { opacity: 1, duration: 0.25, ease: 'power2.out' }, 1.82);
  k.at(1.85, () => {
    sfx.note(7, 0.12, 0.8);
    sfx.hit(0.4, 70);
  });
  tl.to(set, { scale: 3.2, y: -H * 0.05, x: W * 0.32, duration: 0.45, ease: 'power3.in' }, 2.0);
  tl.to({}, { duration: 0.01 }, 2.5);
}
