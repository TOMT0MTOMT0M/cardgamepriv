/**
 * VOITURES — « Bâche » : un garage dans le noir, une forme sous une bâche ; les projecteurs claquent un par un, la bâche
 * glisse : dessous, la silhouette en traits de lumière (citadine, sportive ou supercar selon la famille) — et la carte,
 * posée sur le capot, qui s'avance vers nous ; moteur, appel de phares.
 */
import type { SceneCtx } from '../kit';

const SHAPES: Record<string, string> = {
  city: 'M14 82 L18 60 Q24 44 60 40 L110 36 Q140 18 190 18 Q232 18 250 40 L272 48 Q290 54 292 68 L294 82 Z',
  sport: 'M10 82 L14 66 Q20 58 52 54 L96 48 Q128 22 168 20 Q206 20 236 42 L270 50 Q290 54 292 66 L294 82 Z',
  super: 'M6 82 L10 70 Q16 62 60 58 L110 50 Q140 24 180 22 Q220 22 246 44 L280 54 Q296 58 296 70 L296 82 Z',
};

export default function bache(k: SceneCtx) {
  const { tl, u, el, sfx, actor, w, h, card } = k;
  const shape = /super|hyper/.test(card.subId) ? 'super' : /francaises|iconiques/.test(card.subId) ? 'city' : 'sport';
  el('div', '', 'position:absolute;inset:0;background:#030303;');
  const floor = el('div', '', 'position:absolute;left:-10%;right:-10%;top:60%;bottom:0;background:linear-gradient(180deg,#111,#060606);opacity:.3;');
  const cones: HTMLElement[] = [];
  for (let i = 0; i < 3; i++) cones.push(el('div', '', `position:absolute;left:${[22, 50, 78][i]}%;top:0;width:${w * 0.7}px;height:${h * 0.74}px;margin-left:-${w * 0.35}px;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.02));clip-path:polygon(47% 0,53% 0,100% 100%,0 100%);opacity:0;`));
  const CW = Math.min(w * 0.92, u * 100), CH = CW * 0.36, top = h * 0.6 - CH;
  const car = k.svg(`<svg viewBox="0 0 300 108" width="${CW}" height="${CH}" style="position:absolute;left:50%;top:${top}px;overflow:visible;opacity:0">
    <defs><linearGradient id="cl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></linearGradient></defs>
    <path d="${SHAPES[shape]}" fill="#0b0b0c" stroke="url(#cl)" stroke-width="1.6"/>
    <circle cx="74" cy="84" r="20" fill="#050505" stroke="#aaa" stroke-width="2"/><circle cx="74" cy="84" r="9" fill="none" stroke="#555"/>
    <circle cx="236" cy="84" r="20" fill="#050505" stroke="#aaa" stroke-width="2"/><circle cx="236" cy="84" r="9" fill="none" stroke="#555"/>
    <path class="lamp" d="M282 58 L294 62" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".25"/></svg>`);
  k.pin(car, -50, 0);
  const lamp = car.querySelector('.lamp')!;
  const beam = el('div', '', `position:absolute;left:calc(50% + ${CW * 0.47}px);top:${top + CH * 0.55}px;width:${w * 0.8}px;height:${CH * 0.9}px;margin-top:-${CH * 0.45}px;background:linear-gradient(90deg,rgba(255,255,255,.75),transparent);clip-path:polygon(0 45%,100% 0,100% 100%,0 55%);opacity:0;`);
  const tarp = k.svg(`<svg viewBox="0 0 300 120" width="${CW * 1.06}" height="${CH * 1.25}" style="position:absolute;left:50%;top:${top - CH * 0.16}px;overflow:visible" preserveAspectRatio="none">
    <defs><linearGradient id="tp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3e3f44"/><stop offset=".5" stop-color="#232428"/><stop offset="1" stop-color="#34353a"/></linearGradient></defs>
    <path d="M2 116 Q4 72 40 62 Q90 50 110 34 Q150 6 190 10 Q232 16 262 42 Q296 58 298 116 Q240 104 150 112 Q60 104 2 116 Z" fill="url(#tp)"/>
    <path d="M60 64 Q90 80 84 112 M150 18 Q150 60 140 110 M230 34 Q214 70 226 108" stroke="rgba(0,0,0,.4)" stroke-width="3" fill="none"/>
    <path d="M40 62 Q90 50 110 34 Q150 6 190 10 Q232 16 262 42" stroke="rgba(255,255,255,.12)" stroke-width="2" fill="none"/></svg>`);
  k.pin(tarp, -50, 0);
  tl.set(tarp, { filter: 'brightness(.15)' }, 0);
  cones.forEach((c, i) => {
    const at = 0.2 + i * 0.32;
    tl.to(c, { opacity: 1, duration: 0.05 }, at);
    tl.to(tarp, { filter: `brightness(${0.4 + i * 0.3})`, duration: 0.05 }, at);
    tl.to(floor, { opacity: 0.4 + i * 0.25, duration: 0.05 }, at);
    k.at(at, () => {
      sfx.flood(0.22);
      k.haptic(12);
    });
  });
  tl.set(car, { opacity: 1 }, 1.25);
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.36, y: top + CH * 0.1 - h / 2, rotationX: 50 }, 1.25);
  tl.to(tarp, { x: -CW * 1.2, skewX: 18, opacity: 0, duration: 0.6, ease: 'power3.in' }, 1.25);
  k.at(1.25, () => sfx.whoosh(0.6, 0.22, false));
  k.at(1.7, () => {
    sfx.engine(1.0, 0.24, 60, 210);
    k.haptic([40, 30, 60]);
  });
  k.shake(1.7, u * 0.8, 0.6);
  for (let i = 0; i < 2; i++) {
    tl.set([lamp, beam], { opacity: 1 }, 1.9 + i * 0.18);
    tl.set([lamp, beam], { opacity: i ? 1 : 0.2 }, 1.98 + i * 0.18);
  }
  k.at(1.9, () => sfx.tick(0.3, 0.1));
  // la carte s'avance du capot vers nous
  tl.to(a, { scale: 1, y: 0, rotationX: 0, duration: 0.6, ease: 'power3.inOut' }, 2.3);
  tl.to([car, beam], { opacity: 0.25, duration: 0.5 }, 2.45);
  k.at(2.85, () => sfx.hit(0.35, 60));
  tl.to({}, { duration: 0.01 }, 3.0);
}
