/**
 * VOITURES — « Bâche » : garage dans le noir, une forme sous une bâche ; les projecteurs claquent un par un, la bâche
 * glisse, la silhouette apparaît en traits de lumière, le moteur rugit, appel de phares — la carte.
 */
import type { SceneCtx } from '../kit';

export default function bache(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:#030303;');
  const floor = el('div', '', `position:absolute;left:-10%;right:-10%;top:60%;bottom:0;background:linear-gradient(180deg,#121212,#070707);opacity:.3;`);
  const cones: HTMLElement[] = [];
  for (let i = 0; i < 3; i++) {
    const x = [22, 50, 78][i];
    cones.push(el('div', '', `position:absolute;left:${x}%;top:0;width:${w * 0.7}px;height:${h * 0.74}px;margin-left:-${w * 0.35}px;background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.03));clip-path:polygon(47% 0,53% 0,100% 100%,0 100%);opacity:0;`));
  }
  const CW = Math.min(w * 0.92, u * 100);
  const CH = CW * 0.36;
  const top = h * 0.6 - CH;
  // silhouette en traits (profil générique de sportive)
  const car = k.svg(`<svg viewBox="0 0 300 108" width="${CW}" height="${CH}" style="position:absolute;left:50%;top:${top}px;overflow:visible">
    <defs><linearGradient id="cl" x1="0" x2="1"><stop offset="0" stop-color="#ff6b9a"/><stop offset=".3" stop-color="#ffd36b"/><stop offset=".6" stop-color="#6bc8ff"/><stop offset="1" stop-color="#c86bff"/></linearGradient></defs>
    <path class="body" d="M10 82 L14 66 Q20 58 52 54 L96 48 Q128 22 168 20 Q206 20 236 42 L270 50 Q290 54 292 66 L294 82 Z" fill="#0d0d0e" stroke="url(#cl)" stroke-width="2"/>
    <path d="M110 46 Q132 28 166 26 Q196 26 220 44 Z" fill="#141518" stroke="rgba(255,255,255,.35)"/>
    <circle cx="74" cy="84" r="20" fill="#050505" stroke="#bbb" stroke-width="2"/><circle cx="74" cy="84" r="9" fill="none" stroke="#666"/>
    <circle cx="236" cy="84" r="20" fill="#050505" stroke="#bbb" stroke-width="2"/><circle cx="236" cy="84" r="9" fill="none" stroke="#666"/>
    <path class="lamp" d="M282 58 L294 62" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".3"/>
  </svg>`);
  pin(car, -50, 0);
  const lamp = car.querySelector('.lamp')!;
  const beam = el('div', '', `position:absolute;left:calc(50% + ${CW * 0.47}px);top:${top + CH * 0.55}px;width:${w * 0.8}px;height:${CH * 0.9}px;margin-top:-${CH * 0.45}px;background:linear-gradient(90deg,rgba(255,255,255,.75),transparent);clip-path:polygon(0 45%,100% 0,100% 100%,0 55%);opacity:0;`);
  // la bâche
  const tarp = k.svg(`<svg viewBox="0 0 300 120" width="${CW * 1.06}" height="${CH * 1.2}" style="position:absolute;left:50%;top:${top - CH * 0.12}px;overflow:visible" preserveAspectRatio="none">
    <defs><linearGradient id="tp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a4b50"/><stop offset=".5" stop-color="#2a2b2f"/><stop offset="1" stop-color="#3c3d42"/></linearGradient></defs>
    <path d="M2 116 Q4 72 40 62 Q90 50 110 34 Q150 6 190 10 Q232 16 262 42 Q296 58 298 116 Q240 104 150 112 Q60 104 2 116 Z" fill="url(#tp)"/>
    <path d="M60 64 Q90 80 84 112 M150 18 Q150 60 140 110 M230 34 Q214 70 226 108" stroke="rgba(0,0,0,.35)" stroke-width="3" fill="none"/>
  </svg>`);
  pin(tarp, -50, 0);
  tl.fromTo([car, tarp], { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0);
  tl.set(car, { opacity: 0 }, 0);
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
  // la bâche glisse vers l'arrière
  tl.set(car, { opacity: 1 }, 1.25);
  tl.to(tarp, { x: -CW * 1.2, skewX: 18, opacity: 0, duration: 0.6, ease: 'power3.in' }, 1.25);
  k.at(1.25, () => sfx.whoosh(0.6, 0.22, false));
  tl.fromTo(car, { filter: 'brightness(.6)' }, { filter: 'brightness(1.3)', duration: 0.5, immediateRender: false }, 1.4);
  k.at(1.7, () => {
    sfx.engine(1.0, 0.24, 60, 210);
    k.haptic([40, 30, 60]);
  });
  k.shake(1.7, u * 0.8, 0.6);
  // appel de phares
  for (let i = 0; i < 2; i++) {
    tl.set([lamp, beam], { opacity: 1 }, 2.05 + i * 0.18);
    tl.set([lamp, beam], { opacity: i ? 1 : 0.2 }, 2.13 + i * 0.18);
  }
  tl.to(beam, { scaleX: 1.6, transformOrigin: '0 50%', duration: 0.25 }, 2.3);
  tl.to({}, { duration: 0.01 }, 2.6);
}
