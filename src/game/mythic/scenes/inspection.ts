/**
 * VALORANT — « Inspection » : la carte elle-même est inspectée comme une arme (tournée en main, reflet qui glisse,
 * bruit sec du métal), avec une variante par classe : couteau = « shing » et coupe de l'écran ; armes = cliquetis de
 * recharge ; agents = balayage de scan. Elle finit au centre.
 */
import type { SceneCtx } from '../kit';

export default function inspection(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  const cls = /couteau/.test(k.card.subId) ? 'knife' : /agent/.test(k.card.subId) ? 'agent' : 'gun';
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 60% 45% at 50% 50%,#17191f,#050608 75%);');
  const c = actor();
  const glint = c.querySelector('i') as HTMLElement;
  k.label(cls === 'knife' ? 'INSPECTION · LAME' : cls === 'agent' ? 'SCAN · AGENT' : 'INSPECTION · ARME', '50%', `${h * 0.14}px`).style.transform = 'translateX(-50%)';
  tl.set(c, { opacity: 1, x: w * 0.6, y: h * 0.1, rotation: 30, scale: 0.9 }, 0);
  tl.to(c, { x: 0, y: 0, rotation: -10, scale: 1, duration: 0.5, ease: 'power3.out' }, 0.05);
  k.at(0.05, () => sfx.whoosh(0.4, 0.2));
  // inspection : on la tourne en main (scaleX ≈ rotation sur l'axe), on la retourne, elle revient
  tl.to(c, { scaleX: -1, rotation: 8, duration: 0.5, ease: 'power2.inOut' }, 0.6);
  tl.to(c, { scaleX: 1, rotation: -4, duration: 0.55, ease: 'power3.inOut' }, 1.15);
  k.at(0.62, () => sfx.tick(0.6, 0.2));
  k.at(1.18, () => sfx.tick(0.7, 0.2));
  tl.fromTo(glint, { x: '-120%' }, { x: '120%', duration: 0.5, ease: 'power2.inOut', immediateRender: false }, 0.5);
  tl.fromTo(glint, { x: '-120%' }, { x: '120%', duration: 0.45, ease: 'power2.inOut', immediateRender: false }, 1.4);
  if (cls === 'knife') {
    k.at(1.45, () => sfx.shing(0.2));
    const cut = el('div', '', `position:absolute;left:50%;top:50%;width:${Math.hypot(w, h) * 1.1}px;height:2px;background:#fff;box-shadow:0 0 ${u * 3}px #fff,0 0 ${u * 8}px ${accent};`);
    k.pin(cut);
    tl.set(cut, { rotation: -32, scaleX: 0 }, 0);
    tl.to(cut, { scaleX: 1, duration: 0.1, ease: 'power4.out' }, 2.0);
    k.at(2.0, () => {
      sfx.slash(0.3);
      k.haptic([25, 20, 25]);
    });
    k.shake(2.0, u, 0.25);
    tl.to(cut, { opacity: 0, duration: 0.3 }, 2.15);
  } else if (cls === 'gun') {
    for (let i = 0; i < 3; i++) k.at(1.95 + i * 0.12, () => sfx.clank(0.16, 900 + i * 200));
    tl.to(c, { x: -u * 2, duration: 0.06, yoyo: true, repeat: 5, ease: 'none' }, 1.95);
  } else {
    const scan = el('div', '', `position:absolute;left:0;right:0;top:0;height:2px;background:${accent};box-shadow:0 0 ${u * 2}px ${accent};opacity:0;`);
    tl.fromTo(scan, { y: h * 0.2, opacity: 1 }, { y: h * 0.8, duration: 0.5, ease: 'none', immediateRender: false }, 1.9);
    tl.to(scan, { opacity: 0, duration: 0.1 }, 2.4);
    k.at(1.9, () => sfx.hiss({ dur: 0.5, vol: 0.1, f: 1200, f2: 3200, q: 4 }));
  }
  tl.to(c, { rotation: 0, scale: 1, duration: 0.5, ease: 'power3.inOut' }, 2.2);
  k.at(2.5, () => sfx.hit(0.4, 60));
  tl.to({}, { duration: 0.01 }, 2.8);
}
