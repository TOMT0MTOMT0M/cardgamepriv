/**
 * ESPORT — « Arène » : un mur de LED géant s'allume, compte à rebours 3-2-1, la foule, « GG » qui claque en glitch,
 * et le bandeau du commentateur qui défile — la carte. (Aucune interface de jeu reprise.)
 */
import type { SceneCtx } from '../kit';

const CASTER = ['QUELLE ACTION !', 'C’EST INCROYABLE', 'IL L’A FAIT', 'LA SALLE EST DEBOUT'];

export default function arene(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:#030306;');
  // mur de LED (grille de points), qui pulse
  const wall = el('div', '', `position:absolute;left:0;right:0;top:8%;height:58%;background:radial-gradient(circle,rgba(107,200,255,.55) ${u * 0.28}px,transparent ${u * 0.36}px) 0 0/${u * 1.6}px ${u * 1.6}px;opacity:0;`);
  const tint = el('div', '', 'position:absolute;left:0;right:0;top:8%;height:58%;background:linear-gradient(180deg,rgba(200,107,255,.25),rgba(107,200,255,.1));mix-blend-mode:normal;opacity:0;');
  // foule (silhouettes)
  el('div', '', `position:absolute;left:-5%;right:-5%;bottom:0;height:30%;background:radial-gradient(circle at 50% 100%,#000 ${u * 4}px,transparent ${u * 4.2}px) 0 100%/${u * 7}px ${u * 9}px repeat-x,radial-gradient(circle at 50% 100%,#08080c ${u * 4.5}px,transparent ${u * 4.7}px) ${u * 3.5}px 70%/${u * 7}px ${u * 9}px repeat-x;`);
  const num = pin(el('div', '', `position:absolute;left:50%;top:37%;font:800 ${u * 40}px/1 var(--display);color:#fff;text-shadow:0 0 ${u * 4}px #6bc8ff;`));
  const gg = pin(el('div', '', `position:absolute;left:50%;top:37%;font:800 ${u * 46}px/1 var(--display);color:#fff;opacity:0;text-shadow:${u * 0.8}px 0 #ff2bd6,-${u * 0.8}px 0 #2bf0ff;`));
  gg.textContent = 'GG';
  const band = el('div', '', `position:absolute;left:0;right:0;top:70%;height:${u * 8}px;background:#fff;color:#000;overflow:hidden;opacity:0;display:flex;align-items:center;`);
  const crawl = el('div', '', `white-space:nowrap;font:800 ${u * 4.4}px var(--title);letter-spacing:.06em;padding-left:100%;`, band);
  crawl.textContent = Array.from({ length: 3 }, (_, i) => CASTER[(Math.floor(k.rand() * 4) + i) % 4]).join('   ●   ');
  tl.to([wall, tint], { opacity: 1, duration: 0.3, stagger: 0.05 }, 0);
  k.at(0.05, () => sfx.crowd(2.4, 0.14));
  k.loop((t) => {
    wall.style.filter = `brightness(${0.75 + 0.25 * Math.sin(t * 9)})`;
  });
  ['3', '2', '1'].forEach((n, i) => {
    const at = 0.25 + i * 0.42;
    tl.call(() => {
      num.textContent = n;
      sfx.beep(660 + i * 110, 0.12, 0.14);
      k.haptic(10);
    }, [], at);
    tl.fromTo(num, { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: 'power4.out', immediateRender: false }, at);
    tl.to(num, { opacity: 0, scale: 0.8, duration: 0.15 }, at + 0.3);
  });
  // GG en glitch
  tl.set(gg, { opacity: 1 }, 1.55);
  for (let i = 0; i < 6; i++) tl.set(gg, { x: (k.rand() - 0.5) * u * 4, skewX: (k.rand() - 0.5) * 20 }, 1.55 + i * 0.04);
  tl.set(gg, { x: 0, skewX: 0 }, 1.8);
  tl.fromTo(gg, { scale: 1.5 }, { scale: 1, duration: 0.3, ease: 'power4.out', immediateRender: false }, 1.55);
  k.at(1.55, () => {
    sfx.hit(0.55, 55);
    sfx.chip(0.06);
    k.haptic([30, 20, 30]);
  });
  k.flash(1.55, 0.6, 0.3);
  tl.to(band, { opacity: 1, duration: 0.15 }, 1.7);
  tl.to(crawl, { x: -w * 1.4, duration: 1.2, ease: 'none' }, 1.7);
  tl.to(gg, { scale: 4, opacity: 0, duration: 0.35, ease: 'power3.in' }, 2.25);
  tl.to({}, { duration: 0.01 }, 2.6);
  void h;
}
