/**
 * PRÉCISION & STRATÉGIE — le ralenti du geste, une variante par discipline, la carte à la fin du geste :
 *  - échecs : échiquier en perspective, un roi DESSINÉ (silhouette) vacille et tombe — « ÉCHEC ET MAT », la carte se
 *    dresse à sa place ;
 *  - golf : la carte roule (de chant) au ralenti vers le trou, s'arrête au bord… et tombe ;
 *  - fléchettes, billard, pétanque… : cercles concentriques, la carte file au centre et se plante.
 */
import { lang } from '../../../core/i18n';
import type { SceneCtx } from '../kit';

export default function precision(k: SceneCtx) {
  if (k.card.subId === 'echecs') return chess(k);
  if (k.card.subId === 'golf') return golf(k);
  return target(k);
}

function chess(k: SceneCtx) {
  const { tl, u, el, sfx, actor, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 55%,#1a1816,#050504 75%);');
  const S = Math.min(w * 1.1, u * 110);
  // (10/11) l'échiquier couvre toute la largeur, y compris sur un écran large (il s'arrêtait aux 5/6 de l'écran) :
  // on ajoute des motifs entiers de chaque côté, les cases du centre ne bougent pas
  const BW = S * (1 + 2 * Math.ceil(Math.max(0, w * 1.5 - S) / (2 * S)));
  const board = el('div', '', `position:absolute;left:50%;top:${h * 0.5}px;width:${BW}px;height:${S}px;background:repeating-conic-gradient(#d9d2c3 0 25%,#1c1917 0 50%) 0 0/${S / 4}px ${S / 4}px;transform-origin:50% 0;`);
  k.gsap.set(board, { xPercent: -50, transformPerspective: u * 70, rotationX: 62 });
  const king = k.svg(`<svg viewBox="0 0 60 120" width="${u * 22}" height="${u * 44}" style="position:absolute;left:50%;top:${h * 0.66}px;overflow:visible"><g fill="#f4f1ea" stroke="#111" stroke-width="2" stroke-linejoin="round"><path d="M26 4h8v8h8v8h-8v8h-8v-8h-8v-8h8z"/><path d="M14 36q16-10 32 0l-4 12h-24z"/><path d="M18 48h24l6 44h-36z"/><path d="M10 92h40l4 14q-24 6-48 0z"/></g></svg>`);
  k.gsap.set(king, { xPercent: -50, yPercent: -100, transformOrigin: '50% 100%' });
  const txt = k.word(lang() === 'fr' ? 'ÉCHEC ET MAT' : 'CHECKMATE', h * 0.16, u * 10); // i18n-ok
  txt.style.opacity = '0';
  tl.fromTo(board, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0);
  tl.fromTo(king, { opacity: 0, y: -u * 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0.15);
  k.at(0.48, () => sfx.clank(0.16, 500));
  tl.to(king, { rotation: 6, duration: 0.18, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.7);
  [0.7, 1.05].forEach((t) => k.at(t, () => sfx.tick(0.5, 0.15)));
  tl.to(king, { rotation: 92, duration: 0.4, ease: 'power3.in' }, 1.45);
  k.at(1.85, () => {
    sfx.clank(0.3, 380);
    sfx.hit(0.45, 60);
    k.haptic([30, 30]);
  });
  k.shake(1.85, u * 1.2, 0.3);
  tl.fromTo(txt, { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'power4.out' }, 1.9);
  // la carte se dresse à la place du roi
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.6, y: h * 0.16, rotationX: 90, transformOrigin: '50% 100%' }, 2.2);
  tl.to(a, { rotationX: 0, scale: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 2.22);
  tl.to(king, { opacity: 0, duration: 0.3 }, 2.2);
  k.at(2.22, () => sfx.whoosh(0.4, 0.14, true, 'power3.out'));
  k.at(2.75, () => sfx.hit(0.35, 60));
  tl.to({}, { duration: 0.01 }, 2.95);
}

function golf(k: SceneCtx) {
  const { tl, el, sfx, actor, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 60%,#1d3322,#07100a 75%);');
  const R = Math.min(w, h) * 0.3;
  const hole = el('div', '', `position:absolute;left:50%;top:50%;width:${R * 0.45}px;height:${R * 0.2}px;border-radius:50%;background:#050a06;box-shadow:inset 0 3px 6px #000,0 0 0 2px #2b5a33;`);
  k.pin(hole);
  const flag = el('div', '', `position:absolute;left:50%;bottom:50%;width:2px;height:${R * 1.1}px;background:#ddd;`);
  el('div', '', `position:absolute;left:2px;top:0;width:${R * 0.4}px;height:${R * 0.24}px;background:${accent};clip-path:polygon(0 0,100% 50%,0 100%);`, flag);
  // la carte roule de chant (vue de dessus légèrement penchée : elle est écrasée en largeur)
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.5, scaleX: 0.1, x: -w * 0.42, y: h * 0.32, rotation: 0 }, 0);
  tl.to(a, { x: -R * 0.3, y: R * 0.14, rotation: 720, duration: 1.5, ease: 'power2.out' }, 0.2);
  k.at(0.2, () => sfx.hiss({ dur: 1.4, vol: 0.06, type: 'lowpass', f: 600 }));
  // s'arrête au bord… suspense… et bascule
  tl.to(a, { x: -R * 0.08, rotation: 760, duration: 0.5, ease: 'power1.out' }, 1.7);
  tl.to(a, { x: 0, y: 0, scaleX: 1, scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.6)' }, 2.3);
  k.at(2.3, () => {
    sfx.clank(0.18, 900);
    sfx.note(9, 0.1, 0.8, 0.1);
    k.haptic(16);
  });
  tl.to([hole, flag], { opacity: 0, duration: 0.3 }, 2.3);
  tl.to({}, { duration: 0.01 }, 2.9);
}

function target(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 50%,#17181c,#040405 75%);');
  const R = Math.min(w, h) * 0.36;
  const tgt = el('div', '', `position:absolute;left:50%;top:50%;width:${R * 2}px;height:${R * 2}px;border-radius:50%;background:repeating-radial-gradient(circle,#e9e6df 0 ${R * 0.1}px,#151515 ${R * 0.1}px ${R * 0.2}px);box-shadow:0 20px 60px rgba(0,0,0,.8);`);
  k.pin(tgt);
  const a = actor();
  tl.fromTo(tgt, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }, 0);
  tl.set(a, { opacity: 1, scale: 3.4, y: h * 0.5, rotation: 30 }, 0.2);
  tl.to(a, { scale: 1, y: 0, rotation: 0, duration: 1.5, ease: 'power1.in' }, 0.25);
  k.at(0.25, () => sfx.whoosh(1.4, 0.14, true, 'power1.in'));
  k.at(1.75, () => {
    sfx.clank(0.24, /billard/.test(k.card.subId) ? 1600 : 700);
    sfx.hit(0.45, 70);
    k.haptic(20);
  });
  const ring = el('div', '', `position:absolute;left:50%;top:50%;width:${R * 0.3}px;height:${R * 0.3}px;border-radius:50%;border:2px solid ${accent};opacity:0;`);
  k.pin(ring);
  tl.fromTo(ring, { scale: 0.5, opacity: 1 }, { scale: 9, opacity: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, 1.75);
  k.shake(1.75, u, 0.25);
  tl.to(tgt, { opacity: 0.25, scale: 1.1, duration: 0.5 }, 2.0);
  tl.to({}, { duration: 0.01 }, 2.6);
}
