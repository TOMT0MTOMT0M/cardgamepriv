/**
 * MUSIQUE — « Vinyle » : la pochette noire glisse, le disque en sort et tourne, le bras se pose, le diamant crépite ;
 * des barres de visualiseur pulsent autour du disque, puis le label grandit jusqu'à la carte (l'extrait de 30 s part
 * avec la carte, comme avant).
 */
import type { SceneCtx } from '../kit';

export default function vinyle(k: SceneCtx) {
  const { tl, u, el, sfx, pin } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 50%,#17151a,#030303 75%);');
  const D = Math.min(k.w * 0.74, u * 78);
  // barres du visualiseur (autour du disque)
  const vis = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${D * 1.5}px;height:${D * 1.5}px;`));
  const NB = 64;
  const bars: HTMLElement[] = [];
  for (let i = 0; i < NB; i++) {
    const b = el('div', '', `position:absolute;left:50%;top:50%;width:${Math.max(2, u * 0.7)}px;height:${D * 0.12}px;margin-left:-1px;border-radius:2px;background:hsl(${(i / NB) * 360},90%,72%);transform-origin:50% 0;transform:rotate(${(i / NB) * 360 + 180}deg) translateY(${D * 0.53}px) scaleY(0);opacity:.85;`, vis);
    bars.push(b);
  }
  // disque
  const disc = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${D}px;height:${D}px;border-radius:50%;background:repeating-radial-gradient(circle,#0d0d0f 0 ${u * 0.35}px,#1a1a1e ${u * 0.35}px ${u * 0.5}px);box-shadow:0 20px 60px rgba(0,0,0,.9);`));
  el('div', '', 'position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 30deg,transparent 0 8%,rgba(255,255,255,.14) 12%,transparent 18% 50%,rgba(255,255,255,.1) 62%,transparent 68%);', disc);
  const label = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${D * 0.34}px;height:${D * 0.34}px;border-radius:50%;background:conic-gradient(#ff6b9a,#ffd36b,#6bffb8,#6bc8ff,#c86bff,#ff6b9a);`, disc));
  el('div', '', `position:absolute;inset:${D * 0.155}px;border-radius:50%;background:#050505;`, label);
  // pochette
  const sleeve = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${D * 1.04}px;height:${D * 1.04}px;background:linear-gradient(145deg,#1c1c20,#08080a);box-shadow:0 30px 70px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.08);`));
  el('div', '', `position:absolute;left:50%;top:50%;width:${D * 0.5}px;height:${D * 0.5}px;margin:-${D * 0.25}px 0 0 -${D * 0.25}px;border-radius:50%;border:1px solid rgba(255,255,255,.18);`, sleeve);
  el('div', 'mp-mono mp-rainbow', `position:absolute;left:0;right:0;bottom:8%;text-align:center;font-size:${u * 2}px;letter-spacing:.4em;`, sleeve).textContent = '★★★★★★';
  // bras de lecture
  const arm = k.svg(`<svg viewBox="0 0 60 220" width="${D * 0.26}" height="${D * 0.95}" style="position:absolute;left:calc(50% + ${D * 0.44}px);top:calc(50% - ${D * 0.62}px);overflow:visible">
    <circle cx="30" cy="22" r="20" fill="#26262b" stroke="#4a4a52" stroke-width="2"/><circle cx="30" cy="22" r="7" fill="#9a9aa2"/>
    <path d="M30 22 L30 168 Q30 186 14 196" fill="none" stroke="#c8c8ce" stroke-width="5" stroke-linecap="round"/>
    <rect x="2" y="190" width="22" height="16" rx="3" fill="#2d2d33" transform="rotate(28 13 198)"/>
  </svg>`);
  k.gsap.set(arm, { transformOrigin: '50% 10%', rotation: -32 });

  tl.fromTo(sleeve, { x: -k.w, rotation: -8 }, { x: 0, rotation: 0, duration: 0.45, ease: 'power3.out' }, 0);
  tl.set(disc, { x: 0 }, 0);
  tl.fromTo(disc, { opacity: 0 }, { opacity: 1, duration: 0.01 }, 0.45);
  k.at(0.05, () => sfx.whoosh(0.45, 0.2));
  // le disque sort de la pochette (vers la droite), la pochette s'en va, le disque revient au centre
  tl.to(disc, { x: D * 0.55, duration: 0.45, ease: 'power2.inOut' }, 0.5);
  tl.to(sleeve, { x: -k.w * 0.9, rotation: -10, duration: 0.5, ease: 'power3.in' }, 0.8);
  tl.to(disc, { x: 0, duration: 0.35, ease: 'power3.out' }, 1.0);
  tl.to(disc, { rotation: 360 * 2.2, duration: 2.3, ease: 'power1.in' }, 0.5);
  k.at(0.55, () => sfx.whoosh(0.35, 0.12, false));
  tl.fromTo(arm, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 1.05);
  tl.to(arm, { rotation: 0, duration: 0.4, ease: 'power2.inOut' }, 1.2);
  k.at(1.62, () => {
    sfx.tick(0.4, 0.25);
    sfx.crackle(1.2, 0.14);
    k.haptic(10);
  });
  // le visualiseur suit un « son » (battements + bruit, même rythme que le crépitement)
  k.loop((t) => {
    if (t < 1.65) return;
    const on = Math.min(1, (t - 1.65) / 0.2);
    for (let i = 0; i < NB; i++) {
      const beat = Math.pow(Math.max(0, Math.sin(t * 13 + (i % 8) * 0.4)), 4);
      const v = on * (0.15 + 0.75 * beat * (0.5 + 0.5 * Math.sin(i * 0.9 + t * 7)) + 0.1 * Math.random());
      bars[i].style.transform = `rotate(${(i / NB) * 360 + 180}deg) translateY(${D * 0.53}px) scaleY(${v.toFixed(3)})`;
    }
  });
  // le label grandit jusqu'à remplir l'écran
  tl.to(arm, { opacity: 0, duration: 0.2 }, 2.15);
  tl.to(vis, { scale: 1.6, opacity: 0, duration: 0.4, ease: 'power3.in' }, 2.15);
  tl.to(disc, { scale: 5, duration: 0.45, ease: 'power3.in' }, 2.2);
  k.at(2.3, () => sfx.hit(0.5, 60));
  tl.to({}, { duration: 0.01 }, 2.7);
}
