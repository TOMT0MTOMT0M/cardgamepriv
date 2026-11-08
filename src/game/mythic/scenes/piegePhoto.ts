/**
 * ANIMAUX — « Piège photo » : viseur d'une caméra de terrain (REC, horodatage, IR), vision nocturne verte qui grésille,
 * ambiance du milieu ; dans le noir, DEUX YEUX s'allument, clignent, s'approchent… déclenchement : la nuit passe en
 * couleur, et ce qui était là, c'est la carte. (Vie marine : les yeux dans le bleu, bulles.)
 */
import type { SceneCtx } from '../kit';

export default function piegePhoto(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h, card } = k;
  const sub = card.subId;
  const marine = sub === 'vie-marine';
  const amb = marine ? 'ocean' : sub === 'oiseaux' ? 'foret' : sub === 'mammiferes' ? 'savane' : 'nuit';
  const scene = el('div', '', `position:absolute;inset:0;background:${marine ? 'linear-gradient(180deg,#0b3a3a,#04140f)' : 'radial-gradient(ellipse 90% 70% at 50% 60%,#1c4a28,#05120a 75%)'};`);
  if (!marine) for (let i = 0; i < 9; i++) el('div', '', `position:absolute;left:${k.rand() * 100}%;bottom:${-u * 4}px;width:${u * (14 + k.rand() * 20)}px;height:${u * (18 + k.rand() * 26)}px;margin-left:-${u * 10}px;border-radius:50% 50% 0 0;background:rgba(3,12,6,.85);`, scene);
  const cv = k.canvas();
  const gw = 120, gh = Math.round((120 * h) / w);
  const off = document.createElement('canvas');
  off.width = gw;
  off.height = gh;
  const og = off.getContext('2d')!;
  const img = og.createImageData(gw, gh);
  cv.loop((t) => {
    if (t > 2.1) return cv.c.clearRect(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 90;
      d[i] = v * 0.4;
      d[i + 1] = v;
      d[i + 2] = v * 0.4;
      d[i + 3] = 70;
    }
    og.putImageData(img, 0, 0);
    cv.c.clearRect(0, 0, w, h);
    cv.c.imageSmoothingEnabled = false;
    cv.c.drawImage(off, 0, 0, w, h);
  });
  const nv = el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(120,255,140,.08),rgba(0,20,0,.78) 85%);');
  // les yeux
  const eyes = el('div', '', `position:absolute;left:50%;top:54%;display:flex;gap:${u * 7}px;opacity:0;`);
  k.pin(eyes);
  const eye = () => el('div', '', `width:${u * 4}px;height:${u * 2.6}px;border-radius:50%;background:radial-gradient(ellipse,#fff 0 20%,${accent} 55%,transparent 72%);box-shadow:0 0 ${u * 3}px ${accent};transform-origin:50% 50%;`, eyes);
  const e1 = eye(), e2 = eye();
  const hud = el('div', 'mp-mono', `position:absolute;inset:${u * 5}px;font-size:${u * 3}px;color:#d8ffd8;`);
  for (const [a2, b] of [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']]) el('div', '', `position:absolute;${a2}:0;${b}:0;width:${u * 8}px;height:${u * 8}px;border-${a2}:2px solid #d8ffd8;border-${b}:2px solid #d8ffd8;`, hud);
  const rec = el('div', '', `position:absolute;left:${u * 3}px;top:${u * 3}px;display:flex;align-items:center;gap:${u}px;`, hud);
  rec.innerHTML = `<i style="width:${u * 2}px;height:${u * 2}px;border-radius:50%;background:#ff3b30;display:inline-block"></i>REC`;
  const stamp = el('div', '', `position:absolute;right:${u * 3}px;bottom:${u * 3}px;font-variant-numeric:tabular-nums;`, hud);
  el('div', '', `position:absolute;right:${u * 3}px;top:${u * 3}px;`, hud).textContent = marine ? '−12 M' : 'IR';
  const cross = el('div', '', `position:absolute;left:50%;top:50%;width:${u * 12}px;height:${u * 12}px;border:1px solid rgba(216,255,216,.55);border-radius:50%;`, hud);
  k.pin(cross);
  const hh = 2 + Math.floor(k.rand() * 3), mm = Math.floor(k.rand() * 60);
  k.loop((t) => {
    stamp.textContent = `0${hh}:${String(mm).padStart(2, '0')}:${String(14 + Math.floor(t)).padStart(2, '0')}.${Math.floor(t * 10) % 10}`;
    (rec.firstElementChild as HTMLElement).style.opacity = Math.floor(t * 2.5) % 2 ? '0.2' : '1';
  });
  k.at(0.02, () => sfx.ambience(amb, 2.6, 0.14));
  tl.fromTo(hud, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out' }, 0);
  // les yeux s'allument, clignent, s'approchent
  tl.set(eyes, { opacity: 1, scale: 0.5, x: u * 12, y: u * 4 }, 0.6);
  k.at(0.6, () => sfx.tone({ f: 60, dur: 0.6, vol: 0.08, type: 'sine', lp: 200 }));
  tl.to([e1, e2], { scaleY: 0.05, duration: 0.07, yoyo: true, repeat: 1 }, 1.0);
  tl.to([e1, e2], { scaleY: 0.05, duration: 0.07, yoyo: true, repeat: 1 }, 1.18);
  tl.to(eyes, { scale: 1.2, x: 0, y: 0, duration: 0.9, ease: 'power2.in' }, 1.1);
  k.at(1.1, () => sfx.riser(0.9, 0.08));
  if (marine) for (let i = 0; i < 6; i++) {
    const b = el('div', '', `position:absolute;left:${35 + k.rand() * 30}%;top:90%;width:${u * (2 + k.rand() * 3)}px;height:${u * (2 + k.rand() * 3)}px;border-radius:50%;border:1px solid rgba(200,255,240,.7);opacity:0;`);
    tl.fromTo(b, { opacity: 0.9, y: 0 }, { opacity: 0, y: -h * 0.7, duration: 1.4, ease: 'power1.in', immediateRender: false }, 0.4 + i * 0.2);
  }
  // mise au point, déclenchement : la nuit passe en couleur, la carte est là
  tl.to(cross, { scale: 0.6, duration: 0.25, ease: 'power2.inOut', yoyo: true, repeat: 1 }, 1.5);
  k.at(1.55, () => sfx.tick(1.2, 0.2));
  k.at(2.0, () => {
    sfx.shutter(0.24);
    k.haptic(20);
  });
  k.flash(2.0, 1, 0.5);
  tl.set(nv, { opacity: 0 }, 2.0);
  tl.set(eyes, { opacity: 0 }, 2.0);
  tl.set(scene, { filter: 'saturate(1.4) brightness(1.3)' }, 2.0);
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.9, y: u * 3 }, 2.0);
  tl.to(a, { scale: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 2.05);
  tl.to(hud, { scale: 0.88, opacity: 0.6, duration: 0.5, ease: 'power3.out' }, 2.0);
  k.at(2.4, () => sfx.hit(0.35, 60));
  tl.to({}, { duration: 0.01 }, 2.75);
}
