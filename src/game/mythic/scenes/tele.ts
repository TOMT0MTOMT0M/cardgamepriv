/**
 * SÉRIES TV — « Télé cathodique » : un poste noir dans le noir, sa ligne blanche qui s'ouvre, zapping dans la neige
 * (CH 03, CH 04…), puis le signal accroche : à l'écran, la carte face cachée, en noir et blanc tremblé — elle sort du
 * poste et passe en couleur au centre.
 */
import type { SceneCtx } from '../kit';

export default function tele(k: SceneCtx) {
  const { tl, u, el, sfx, actor, cw, accent, w } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 50%,#121214,#040404 75%);');
  const W = Math.min(w * 0.9, u * 96);
  const H = W * 0.78;
  const set = el('div', '', `position:absolute;left:50%;top:50%;width:${W}px;height:${H}px;border-radius:${u * 3}px;background:linear-gradient(170deg,#1b1b1e,#0a0a0b);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 40px 90px rgba(0,0,0,.9);`);
  k.pin(set);
  const scr = el('div', '', `position:absolute;left:5%;top:7%;width:72%;height:86%;border-radius:${u * 4}px / ${u * 5}px;background:#050706;overflow:hidden;box-shadow:inset 0 0 ${u * 5}px #000;`, set);
  for (let i = 0; i < 2; i++) el('div', '', `position:absolute;left:84%;top:${14 + i * 18}%;width:${u * 6}px;height:${u * 6}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#2e2e32,#111);box-shadow:0 2px 4px #000;`, set);
  for (let i = 0; i < 5; i++) el('div', '', `position:absolute;left:83%;width:11%;top:${58 + i * 6}%;height:2px;background:#000;`, set);
  const sw = 160, sh = 120;
  const cv = document.createElement('canvas');
  cv.width = sw;
  cv.height = sh;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;image-rendering:pixelated;';
  scr.append(cv);
  const g = cv.getContext('2d')!;
  const img = g.createImageData(sw, sh);
  const bars = el('div', '', 'position:absolute;inset:0;opacity:0;background:linear-gradient(90deg,#ddd 0 14%,#999 14% 28%,#777 28% 42%,#555 42% 57%,#333 57% 71%,#222 71% 85%,#111 85%);', scr);
  const osd = k.label('CH 01', '0', '0');
  osd.style.cssText += `position:absolute;right:7%;top:7%;left:auto;font-size:${u * 3.4}px;color:${accent};text-shadow:0 0 8px ${accent};opacity:0;`;
  scr.append(osd);
  const line = el('div', '', 'position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:#fff;box-shadow:0 0 16px #fff;transform:scaleX(0);', scr);
  // la carte « à l'écran » : copie noir et blanc dans le poste, puis la vraie carte sort
  const a = actor();
  const ghost = el('div', '', `position:absolute;left:50%;top:50%;width:${cw * 0.5}px;aspect-ratio:63/88;border-radius:4%;background:#cfcfcf;box-shadow:0 0 0 2px #fff;opacity:0;filter:contrast(1.4);`, scr);
  k.pin(ghost);
  el('div', '', 'position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.35) 0 1px,transparent 1px 3px),radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.1),transparent 50%);pointer-events:none;', scr);
  k.loop((t) => {
    if (t < 0.55 || t > 1.9) return;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, ((t * 90) % sh) | 0, sw, 10);
    if (t > 1.7) ghost.style.transform = `translate(calc(-50% + ${(Math.random() - 0.5) * 6}px), -50%) scaleX(${1 + (Math.random() - 0.5) * 0.06})`;
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
  // le signal accroche : la carte apparaît à l'écran, tremblée, puis sort du poste
  tl.set(ghost, { opacity: 1 }, 1.7);
  tl.set(cv, { opacity: 0.35 }, 1.7);
  k.at(1.7, () => sfx.note(7, 0.1, 0.8));
  tl.set(cv, { opacity: 0 }, 1.9);
  tl.set(osd, { opacity: 0 }, 1.9);
  tl.set(ghost, { opacity: 0 }, 2.0);
  const sr = { x: (W * 0.05 + W * 0.36) - W / 2, y: 0 };
  tl.set(a, { opacity: 1, scale: 0.5, x: sr.x, y: sr.y, filter: 'grayscale(1) contrast(1.4)' }, 2.0);
  tl.to(a, { scale: 1, x: 0, y: 0, filter: 'grayscale(0) contrast(1)', duration: 0.6, ease: 'power3.inOut' }, 2.02);
  tl.to(set, { scale: 0.9, opacity: 0, duration: 0.5, ease: 'power2.in' }, 2.1);
  k.at(2.0, () => {
    sfx.whoosh(0.5, 0.2);
    k.haptic(16);
  });
  k.at(2.62, () => sfx.hit(0.4, 60));
  tl.to({}, { duration: 0.01 }, 2.85);
}
