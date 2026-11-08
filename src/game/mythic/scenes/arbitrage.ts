/**
 * RAQUETTES — « Arbitrage vidéo » : vue rapprochée de LA LIGNE (blanche, pleine largeur, sur terrain sombre) ; la balle
 * arrive au ralenti, l'impact s'écrase tout près de la ligne, zoom sur la marque… « IN ». La marque devient la carte.
 */
import type { SceneCtx } from '../kit';

export default function arbitrage(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  const ly = h * 0.62;
  el('div', '', `position:absolute;inset:0;background:linear-gradient(180deg,#0a0f14 0%,#0e1a20 ${ly - u * 2}px,#f4f4f4 ${ly - u * 2}px,#f4f4f4 ${ly + u * 2}px,#132026 ${ly + u * 2}px,#0b1418);`);
  // texture du court (grain fin) et ombre de la ligne
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,.08) 0.5px,transparent 1px) 0 0/5px 5px;pointer-events:none;', k.root);
  const ball = el('div', '', `position:absolute;left:50%;top:50%;width:${u * 7}px;height:${u * 7}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f4ffb0,${accent} 60%,#7a9015);box-shadow:0 0 ${u * 3}px rgba(217,255,58,.5),0 ${u * 2}px ${u * 3}px rgba(0,0,0,.6);opacity:0;`);
  k.pin(ball);
  const shadow = el('div', '', `position:absolute;left:50%;top:${ly}px;width:${u * 10}px;height:${u * 3}px;border-radius:50%;background:rgba(0,0,0,.5);opacity:0;`);
  k.pin(shadow);
  const mark = el('div', '', `position:absolute;left:50%;top:${ly + u * 0.5}px;width:${u * 12}px;height:${u * 4.5}px;border-radius:50%;border:2px solid ${accent};background:rgba(217,255,58,.25);opacity:0;`);
  k.pin(mark);
  // la balle arrive de loin (petite, en haut) au ralenti, rebondit juste à côté de la ligne
  tl.set(ball, { opacity: 1, scale: 0.15, x: w * 0.3, y: -h * 0.4 }, 0.1);
  tl.to(ball, { scale: 1, x: 0, y: ly - h / 2 - u * 3, duration: 1.4, ease: 'power1.in' }, 0.15);
  tl.fromTo(shadow, { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: 1.4, ease: 'power1.in', immediateRender: false }, 0.15);
  k.at(0.15, () => sfx.whoosh(1.3, 0.12));
  tl.to(ball, { scaleY: 0.55, scaleX: 1.3, duration: 0.08 }, 1.55);
  k.at(1.55, () => {
    sfx.bounce(0.3);
    k.haptic(16);
  });
  tl.fromTo(mark, { opacity: 1, scale: 0.3 }, { scale: 1, duration: 0.25, ease: 'power3.out', immediateRender: false }, 1.55);
  tl.to(ball, { scaleY: 1, scaleX: 1, y: -h * 0.5, x: u * 20, opacity: 0, duration: 0.5, ease: 'power2.out' }, 1.63);
  tl.to(shadow, { opacity: 0, duration: 0.2 }, 1.63);
  const verdict = k.word('IN', h * 0.3, u * 30);
  verdict.style.color = accent;
  tl.fromTo(verdict, { opacity: 0, scale: 2 }, { opacity: 1, scale: 1, duration: 0.2, ease: 'power4.out' }, 2.0);
  k.at(2.0, () => {
    sfx.beep(1320, 0.12, 0.14);
    sfx.beep(1760, 0.12, 0.2);
    sfx.hit(0.4, 70);
  });
  // la marque devient la carte
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.25, y: ly - h / 2, rotationX: 70 }, 2.2);
  tl.to(mark, { opacity: 0, duration: 0.2 }, 2.2);
  tl.to(a, { scale: 1, y: 0, rotationX: 0, duration: 0.55, ease: 'power3.inOut' }, 2.22);
  tl.to(verdict, { opacity: 0, y: -u * 6, duration: 0.3 }, 2.4);
  k.at(2.75, () => sfx.hit(0.35, 60));
  tl.to({}, { duration: 0.01 }, 2.9);
}
