/**
 * ANIMAUX — « Piège photo » : le viseur d'une caméra de terrain (REC, horodatage), vision nocturne verte qui grésille,
 * des traces de pas qui traversent l'image (des bulles qui montent pour la vie marine), l'ambiance sonore du milieu
 * (savane, forêt, océan, nuit) ; déclenchement : la nuit passe en couleur — la carte.
 */
import type { SceneCtx } from '../kit';

export default function piegePhoto(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h, card } = k;
  const sub = card.subId;
  const marine = sub === 'vie-marine';
  const amb = marine ? 'ocean' : sub === 'oiseaux' ? 'foret' : sub === 'mammiferes' ? 'savane' : 'nuit';
  const scene = el('div', '', `position:absolute;inset:0;background:${marine ? 'linear-gradient(180deg,#0d3b2a,#06180f)' : 'radial-gradient(ellipse 90% 70% at 50% 60%,#1f4a2a,#06140a 75%)'};`);
  // végétation / roches en silhouettes
  if (!marine) for (let i = 0; i < 9; i++) el('div', '', `position:absolute;left:${k.rand() * 100}%;bottom:${-u * 4}px;width:${u * (14 + k.rand() * 20)}px;height:${u * (18 + k.rand() * 26)}px;margin-left:-${u * 10}px;border-radius:50% 50% 0 0;background:#04100700;box-shadow:inset 0 0 0 999px rgba(3,12,6,.85);`, scene);
  // grain de la vision nocturne
  const cv = k.canvas();
  const gw = 120, gh = Math.round((120 * h) / w);
  const off = document.createElement('canvas');
  off.width = gw;
  off.height = gh;
  const og = off.getContext('2d')!;
  const img = og.createImageData(gw, gh);
  cv.loop((t) => {
    if (t > 1.95) return cv.c.clearRect(0, 0, w, h);
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
  const nv = el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(120,255,140,.08),rgba(0,20,0,.75) 85%);');
  // traces (ou bulles)
  const marks: HTMLElement[] = [];
  for (let i = 0; i < 8; i++) {
    const x = marine ? 20 + k.rand() * 60 : 8 + i * 12;
    const y = marine ? 90 : 66 + (i % 2) * 6 - i * 1.5;
    const m = pin(el('div', '', `position:absolute;left:${x}%;top:${y}%;font-size:${u * (marine ? 3 + k.rand() * 3 : 5)}px;color:rgba(200,255,200,.85);opacity:0;`));
    m.textContent = marine ? '○' : '🐾';
    if (!marine) m.style.filter = 'grayscale(1) brightness(2.4)';
    marks.push(m);
  }
  // le viseur
  const hud = el('div', 'mp-mono', `position:absolute;inset:${u * 5}px;font-size:${u * 3}px;color:#d8ffd8;`);
  for (const [a, b] of [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']])
    el('div', '', `position:absolute;${a}:0;${b}:0;width:${u * 8}px;height:${u * 8}px;border-${a}:2px solid #d8ffd8;border-${b}:2px solid #d8ffd8;`, hud);
  const rec = el('div', '', `position:absolute;left:${u * 3}px;top:${u * 3}px;display:flex;align-items:center;gap:${u}px;`, hud);
  rec.innerHTML = `<i style="width:${u * 2}px;height:${u * 2}px;border-radius:50%;background:#ff3b30;display:inline-block"></i>REC`;
  const stamp = el('div', '', `position:absolute;right:${u * 3}px;bottom:${u * 3}px;font-variant-numeric:tabular-nums;`, hud);
  el('div', '', `position:absolute;right:${u * 3}px;top:${u * 3}px;`, hud).textContent = marine ? '−12 m' : 'IR ●';
  const cross = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${u * 10}px;height:${u * 10}px;border:1px solid rgba(216,255,216,.6);border-radius:50%;`, hud));
  const hh = 2 + Math.floor(k.rand() * 3);
  const mm = Math.floor(k.rand() * 60);
  k.loop((t) => {
    const s = Math.floor(t * 10);
    stamp.textContent = `0${hh}:${String(mm).padStart(2, '0')}:${String(14 + Math.floor(t)).padStart(2, '0')}.${s % 10}`;
    (rec.firstElementChild as HTMLElement).style.opacity = Math.floor(t * 2.5) % 2 ? '0.2' : '1';
  });
  k.at(0.02, () => sfx.ambience(amb, 2.6, 0.14));
  tl.fromTo(hud, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out' }, 0);
  marks.forEach((m, i) => {
    const at = 0.35 + i * 0.15;
    if (marine) tl.fromTo(m, { opacity: 0.9, y: 0 }, { opacity: 0, y: -h * 0.7, duration: 1.4, ease: 'power1.in', immediateRender: false }, at);
    else {
      tl.fromTo(m, { opacity: 0, scale: 1.4, rotation: 80 + (i % 2) * 20 }, { opacity: 1, scale: 1, rotation: 90 + (i % 2) * 14, duration: 0.15, immediateRender: false }, at);
      tl.to(m, { opacity: 0.2, duration: 0.6 }, at + 0.3);
      k.at(at, () => sfx.bounce(0.05));
    }
  });
  // mise au point, puis déclenchement : la nuit passe en couleur
  tl.to(cross, { scale: 0.6, duration: 0.25, ease: 'power2.inOut', yoyo: true, repeat: 1 }, 1.5);
  k.at(1.55, () => sfx.tick(1.2, 0.2));
  k.at(1.95, () => {
    sfx.shutter(0.24);
    k.haptic(20);
  });
  k.flash(1.95, 1, 0.5);
  tl.set(nv, { opacity: 0 }, 1.95);
  tl.set(scene, { filter: 'saturate(1.6) brightness(1.5)' }, 1.95);
  tl.to(hud, { scale: 0.85, opacity: 0.7, duration: 0.5, ease: 'power3.out' }, 1.95);
  tl.to({}, { duration: 0.01 }, 2.5);
}
