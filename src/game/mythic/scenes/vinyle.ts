/**
 * MUSIQUE — « Vinyle » : LA CARTE EST LA POCHETTE. Elle glisse en entrée, le disque en sort et tourne, le bras se pose,
 * le diamant crépite ; des barres de visualiseur pulsent en anneau. Le disque rentre dans la pochette qui se recentre.
 */
import type { SceneCtx } from '../kit';

export default function vinyle(k: SceneCtx) {
  const { tl, u, el, sfx, actor, cw, accent, w } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 50%,#17151a,#030303 75%);');
  const D = cw * 1.25;
  const vis = el('div', '', `position:absolute;left:50%;top:50%;width:${D * 1.5}px;height:${D * 1.5}px;`);
  k.pin(vis);
  const NB = 56;
  const bars: HTMLElement[] = [];
  for (let i = 0; i < NB; i++) bars.push(el('div', '', `position:absolute;left:50%;top:50%;width:${Math.max(2, u * 0.6)}px;height:${D * 0.14}px;margin-left:-1px;border-radius:2px;background:${i % 7 === 0 ? accent : '#fff'};opacity:.8;transform-origin:50% 0;transform:rotate(${(i / NB) * 360 + 180}deg) translateY(${D * 0.54}px) scaleY(0);`, vis));
  const disc = el('div', '', `position:absolute;left:50%;top:50%;width:${D}px;height:${D}px;border-radius:50%;background:repeating-radial-gradient(circle,#0b0b0d 0 ${u * 0.3}px,#19191d ${u * 0.3}px ${u * 0.45}px);box-shadow:0 20px 60px rgba(0,0,0,.9);opacity:0;`);
  k.pin(disc);
  el('div', '', 'position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 30deg,transparent 0 8%,rgba(255,255,255,.14) 12%,transparent 18% 50%,rgba(255,255,255,.1) 62%,transparent 68%);', disc);
  const label = el('div', '', `position:absolute;left:50%;top:50%;width:${D * 0.32}px;height:${D * 0.32}px;border-radius:50%;background:conic-gradient(#ff6b9a,#ffd36b,#6bffb8,#6bc8ff,#c86bff,#ff6b9a);`, disc);
  k.pin(label);
  el('div', '', `position:absolute;inset:${D * 0.145}px;border-radius:50%;background:#050505;`, label);
  const a = actor();
  a.style.zIndex = '2';
  const arm = k.svg(`<svg viewBox="0 0 60 220" width="${D * 0.26}" height="${D * 0.95}" style="position:absolute;left:calc(50% + ${D * 0.46}px);top:calc(50% - ${D * 0.62}px);overflow:visible;opacity:0">
    <circle cx="30" cy="22" r="20" fill="#26262b" stroke="#4a4a52" stroke-width="2"/><circle cx="30" cy="22" r="7" fill="#9a9aa2"/>
    <path d="M30 22 L30 168 Q30 186 14 196" fill="none" stroke="#c8c8ce" stroke-width="5" stroke-linecap="round"/>
    <rect x="2" y="190" width="22" height="16" rx="3" fill="#2d2d33" transform="rotate(28 13 198)"/></svg>`);
  k.gsap.set(arm, { transformOrigin: '50% 10%', rotation: -32 });
  // la pochette (= la carte) arrive, le disque en sort
  tl.set(a, { opacity: 1, x: -w, rotation: -8 }, 0);
  tl.to(a, { x: 0, rotation: 0, duration: 0.45, ease: 'power3.out' }, 0);
  k.at(0.02, () => sfx.whoosh(0.45, 0.2));
  tl.set(disc, { opacity: 1 }, 0.5);
  tl.to(disc, { x: D * 0.5, duration: 0.45, ease: 'power2.inOut' }, 0.5);
  tl.to(a, { x: -w * 0.42, scale: 0.7, rotation: -6, duration: 0.5, ease: 'power3.inOut' }, 0.85);
  tl.to(disc, { x: 0, duration: 0.35, ease: 'power3.out' }, 1.0);
  tl.to(disc, { rotation: 360 * 2.4, duration: 2.4, ease: 'power1.in' }, 0.5);
  k.at(0.55, () => sfx.whoosh(0.35, 0.12, false));
  tl.to(arm, { opacity: 1, duration: 0.25 }, 1.05);
  tl.to(arm, { rotation: 0, duration: 0.4, ease: 'power2.inOut' }, 1.2);
  k.at(1.62, () => {
    sfx.tick(0.4, 0.25);
    sfx.crackle(1.2, 0.14);
    k.haptic(10);
  });
  k.loop((t) => {
    if (t < 1.65 || t > 2.6) return;
    const on = Math.min(1, (t - 1.65) / 0.2) * (t > 2.3 ? Math.max(0, 1 - (t - 2.3) / 0.3) : 1);
    for (let i = 0; i < NB; i++) {
      const beat = Math.pow(Math.max(0, Math.sin(t * 13 + (i % 8) * 0.4)), 4);
      const v = on * (0.15 + 0.75 * beat * (0.5 + 0.5 * Math.sin(i * 0.9 + t * 7)) + 0.1 * Math.random());
      bars[i].style.transform = `rotate(${(i / NB) * 360 + 180}deg) translateY(${D * 0.54}px) scaleY(${v.toFixed(3)})`;
    }
  });
  // le bras se relève, le disque rentre dans la pochette qui revient au centre
  tl.to(arm, { rotation: -32, opacity: 0, duration: 0.3 }, 2.35);
  tl.to(a, { x: 0, scale: 1, rotation: 0, duration: 0.55, ease: 'power3.inOut' }, 2.4);
  tl.to(disc, { x: 0, scale: 0.9, opacity: 0, duration: 0.5, ease: 'power3.in' }, 2.45);
  k.at(2.4, () => sfx.whoosh(0.4, 0.14, false));
  k.at(2.9, () => sfx.hit(0.35, 60));
  tl.to({}, { duration: 0.01 }, 3.05);
}
