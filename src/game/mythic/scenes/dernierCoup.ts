/**
 * ESPORT — « Le dernier coup » : un fil d'actions de match en texte libre (sans cadre) défile de plus en plus vite,
 * l'image se FIGE (écran gelé, glitch), silence… « VICTOIRE » ; la carte sort de l'écran gelé, au centre.
 */
import { displayCase } from '../../../core/fonts';
import type { SceneCtx } from '../kit';

const FEED = ['ENGAGEMENT', 'DOUBLE', 'CLUTCH', 'ACE', 'OBJECTIF', 'TRIPLE', 'RETOUR', 'DERNIER ROUND', 'OVERTIME', 'MATCH POINT', '1 CONTRE 3', 'DERNIER COUP'];

export default function dernierCoup(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 40%,#0e1016,#030305 75%);');
  k.label(k.card.sub.toUpperCase(), '50%', `${u * 7}px`).style.cssText += `transform:translateX(-50%);color:${accent};`;
  const feed = el('div', '', `position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:${u * 2}px;`);
  // (10/11) le fil tient toujours dans l'écran (ordinateur : 12 lignes dépassaient en haut et en bas)
  const fs = Math.min(u, (h * 0.78) / 108);
  feed.style.gap = `${fs * 2}px`;
  const items = FEED.map((t, i) => {
    const e = el('div', '', `font:800 ${fs * (5 + (i % 3) * 2)}px/1 var(--title);color:${i === FEED.length - 1 ? accent : '#fff'};opacity:0;white-space:nowrap;`, feed);
    e.textContent = displayCase(t); // (11/11) casse de phrase : Bold Frame ne se lit pas en capitales (R → A)
    return e;
  });
  items.forEach((e, i) => {
    const at = 0.1 + Math.pow(i / items.length, 1.7) * 1.6;
    tl.fromTo(e, { opacity: 0, y: u * 6, scale: 1.2 }, { opacity: 1, y: 0, scale: 1, duration: 0.18, ease: 'power3.out' }, at);
    if (i < items.length - 1) tl.to(e, { opacity: 0.08, duration: 0.25 }, at + 0.25);
    k.at(at, () => {
      sfx.tick(0.8 + i * 0.06, 0.12);
      if (i % 3 === 2) sfx.hit(0.2, 80);
    });
  });
  k.at(0.9, () => sfx.riser(1.0, 0.12));
  // l'image se fige : glitch, silence
  const freeze = el('div', '', `position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 ${u * 3}px,rgba(255,255,255,.05) ${u * 3}px ${u * 3.4}px);opacity:0;mix-blend-mode:screen;`);
  tl.set(freeze, { opacity: 1 }, 1.9);
  for (let i = 0; i < 6; i++) tl.set(feed, { x: (k.rand() - 0.5) * u * 6, skewX: (k.rand() - 0.5) * 12 }, 1.9 + i * 0.04);
  tl.set(feed, { x: 0, skewX: 0 }, 2.15);
  k.at(1.9, () => sfx.staticNoise(0.25, 0.14));
  const vict = k.word('VICTOIRE', h * 0.18, u * 15);
  tl.fromTo(vict, { opacity: 0, scale: 1.5, filter: 'blur(8px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.25, ease: 'power4.out' }, 2.3);
  k.at(2.3, () => {
    sfx.hit(0.6, 50);
    sfx.chip(0.06);
    k.haptic([30, 20, 30]);
  });
  // la carte sort de l'écran gelé
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.3, filter: 'brightness(3) contrast(0)' }, 2.3);
  tl.to(a, { scale: 1, filter: 'brightness(1) contrast(1)', duration: 0.5, ease: 'power3.out' }, 2.32);
  tl.to([feed, freeze], { opacity: 0, duration: 0.3 }, 2.35);
  k.glint(2.75, 0.45);
  tl.to({}, { duration: 0.01 }, 3.15);
  void w;
}
