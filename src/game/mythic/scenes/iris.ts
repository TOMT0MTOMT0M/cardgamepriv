/**
 * DESSINS ANIMÉS — « Iris » : le rond noir s'ouvre sur un soleil de rayons, une carte face cachée tombe et rebondit
 * (écrasement / étirement, « boing » original), des étincelles ; l'iris se referme sur elle — la carte.
 */
import type { SceneCtx } from '../kit';

export default function iris(k: SceneCtx) {
  const { tl, u, el, sfx, pin } = k;
  const R = Math.hypot(k.w, k.h) / 2;
  const world = el('div', '', 'position:absolute;inset:0;clip-path:circle(0px at 50% 50%);background:#f2ede3;');
  const rays = pin(el('div', '', `position:absolute;left:50%;top:55%;width:${R * 3}px;height:${R * 3}px;border-radius:50%;background:repeating-conic-gradient(#e6dfd1 0 7.5deg,#f2ede3 7.5deg 15deg);`, world));
  el('div', '', `position:absolute;inset:0;background:radial-gradient(circle at 50% 55%,transparent 20%,rgba(242,237,227,.9) 80%);`, world);
  const floorY = k.h * 0.68;
  el('div', '', `position:absolute;left:0;right:0;top:${floorY}px;bottom:0;background:#e2d9c8;border-top:${u * 0.6}px solid #1a1a1a;`, world);
  const shadow = pin(el('div', '', `position:absolute;left:50%;top:${floorY}px;width:${u * 30}px;height:${u * 4}px;border-radius:50%;background:rgba(0,0,0,.25);`, world));
  const cw = u * 30;
  const card = el('div', '', `position:absolute;left:50%;top:${floorY}px;width:${cw}px;height:${cw * 1.4}px;border-radius:${u * 2}px;background:#161616;border:${u * 0.7}px solid #111;box-shadow:inset 0 0 0 ${u * 0.8}px #f2ede3,inset 0 0 0 ${u * 1.6}px #161616;`, world);
  pin(card, -50, -100);
  k.gsap.set(card, { transformOrigin: '50% 100%' });
  el('div', 'mp-rainbow', `position:absolute;left:0;right:0;top:40%;text-align:center;font:800 ${u * 8}px var(--display);`, card).textContent = '★';
  // l'iris s'ouvre
  const ir = { r: 0 };
  tl.to(ir, { r: R * 1.05, duration: 0.5, ease: 'back.out(1.4)', onUpdate: () => (world.style.clipPath = `circle(${ir.r}px at 50% 50%)`) }, 0.05);
  k.at(0.05, () => sfx.whoosh(0.35, 0.18));
  tl.to(rays, { rotation: 40, duration: 2.6, ease: 'none' }, 0);
  // la carte tombe et rebondit (3 fois)
  const H = k.h * 0.75;
  tl.set(card, { y: -H, scaleX: 0.9, scaleY: 1.12 }, 0);
  tl.set(shadow, { scale: 0.3, opacity: 0.3 }, 0);
  const bounces: Array<[number, number, number]> = [[0.45, 0.35, H], [0.92, 0.3, H * 0.35], [1.32, 0.22, H * 0.12]];
  bounces.forEach(([at, d, h], i) => {
    if (i > 0) tl.to(card, { y: -h, scaleX: 0.95, scaleY: 1.06, duration: d / 2, ease: 'power2.out' }, at - d / 2);
    tl.to(card, { y: 0, scaleX: 0.92, scaleY: 1.1, duration: d / 2, ease: 'power2.in' }, i === 0 ? at - 0.05 : at);
    const hit = i === 0 ? at - 0.05 + d / 2 : at + d / 2;
    tl.to(card, { scaleX: 1.25 - i * 0.07, scaleY: 0.72 + i * 0.08, duration: 0.06, ease: 'power2.out' }, hit);
    tl.to(card, { scaleX: 1, scaleY: 1, duration: 0.25, ease: 'elastic.out(1.2,0.4)' }, hit + 0.06);
    tl.to(shadow, { scale: 1.1 - i * 0.05, opacity: 1, duration: 0.06 }, hit);
    k.at(hit, () => {
      sfx.boing(0.18 - i * 0.04);
      sfx.bounce(0.2 - i * 0.05);
      k.haptic(14 - i * 4);
    });
  });
  // étincelles
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const s = pin(el('div', '', `position:absolute;left:${k.w / 2 + Math.cos(a) * u * 26}px;top:${floorY - cw * 0.7 + Math.sin(a) * u * 26}px;font:800 ${u * (4 + (i % 3) * 2)}px var(--title);color:#1a1a1a;`, world));
    s.textContent = '✦';
    tl.fromTo(s, { scale: 0, rotation: -40 }, { scale: 1, rotation: 0, duration: 0.25, ease: 'back.out(3)' }, 1.6 + i * 0.03);
    tl.to(s, { scale: 0, duration: 0.2 }, 1.95 + i * 0.02);
  }
  k.at(1.6, () => sfx.note(9, 0.1, 0.6));
  k.at(1.68, () => sfx.note(12, 0.1, 0.6));
  // l'iris se referme sur la carte, puis s'ouvre en blanc
  const cardMidY = floorY - cw * 0.7;
  tl.to(ir, { r: cw * 0.85, duration: 0.35, ease: 'power3.in', onUpdate: () => (world.style.clipPath = `circle(${ir.r}px at 50% ${cardMidY}px)`) }, 2.0);
  k.at(2.33, () => sfx.hit(0.4, 70));
  tl.to(card, { scale: 1.15, duration: 0.15, ease: 'power2.out' }, 2.33);
  tl.to({}, { duration: 0.01 }, 2.55);
}
