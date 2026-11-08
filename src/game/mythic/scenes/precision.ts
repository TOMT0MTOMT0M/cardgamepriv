/**
 * PRÉCISION & STRATÉGIE — « Ralenti du geste », une petite variante par discipline sur le même modèle :
 *  - échecs : un échiquier, le roi vacille et tombe — « ÉCHEC ET MAT » ;
 *  - golf : la balle roule au ralenti et tombe dans le trou ;
 *  - fléchettes, billard, pétanque… : un projectile file au centre de la cible (cercles concentriques).
 */
import type { SceneCtx } from '../kit';

export default function precision(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h, card } = k;
  const sub = card.subId;
  if (sub === 'echecs') return chess(k);
  el('div', '', `position:absolute;inset:0;background:${sub === 'golf' ? 'radial-gradient(ellipse 80% 60% at 50% 60%,#1d3322,#07100a 75%)' : 'radial-gradient(ellipse 70% 60% at 50% 50%,#17181c,#040405 75%)'};`);
  const golf = sub === 'golf';
  const R = Math.min(w, h) * 0.34;
  // cible / trou (ellipse vue de 3/4)
  const tgt = pin(el('div', '', `position:absolute;left:50%;top:44%;width:${R * 2}px;height:${R * 2 * (golf ? 0.45 : 1)}px;border-radius:50%;`));
  if (golf) {
    tgt.style.background = 'radial-gradient(ellipse,#0a1a0d 0 18%,#2b5a33 19% 22%,transparent 23%)';
    const flag = el('div', '', `position:absolute;left:50%;bottom:50%;width:2px;height:${R * 1.1}px;background:#ddd;`, tgt);
    el('div', '', `position:absolute;left:2px;top:0;width:${R * 0.4}px;height:${R * 0.24}px;background:linear-gradient(90deg,#ff6b9a,#ffd36b,#6bffb8,#6bc8ff,#c86bff);clip-path:polygon(0 0,100% 50%,0 100%);`, flag);
  } else {
    tgt.style.background = `repeating-radial-gradient(circle,#e9e6df 0 ${R * 0.1}px,#151515 ${R * 0.1}px ${R * 0.2}px)`;
    tgt.style.boxShadow = '0 20px 60px rgba(0,0,0,.8)';
    pin(el('div', '', `position:absolute;left:50%;top:50%;width:${R * 0.14}px;height:${R * 0.14}px;border-radius:50%;background:conic-gradient(#ff6b9a,#ffd36b,#6bffb8,#6bc8ff,#c86bff,#ff6b9a);`, tgt));
  }
  // le projectile
  const ps = u * (golf ? 4 : 3);
  const pr = pin(el('div', '', `position:absolute;left:0;top:0;width:${ps}px;height:${ps}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#c9c9c9 60%,#777);box-shadow:0 0 ${u * 2}px rgba(255,255,255,.5);`));
  const target = { x: w / 2, y: h * 0.44 };
  const from = golf ? { x: w * 0.15, y: h * 0.86 } : { x: w * 0.5, y: h * 1.05 };
  tl.fromTo(tgt, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }, 0);
  tl.set(pr, { x: from.x, y: from.y, scale: golf ? 1 : 3 }, 0);
  // ralenti : approche lente puis le dernier centimètre
  tl.to(pr, { x: target.x + (golf ? -R * 0.06 : 0), y: target.y + (golf ? R * 0.04 : 0), scale: 1, duration: 1.45, ease: golf ? 'power2.out' : 'power1.in' }, 0.25);
  k.at(0.25, () => (golf ? sfx.hiss({ dur: 1.4, vol: 0.06, type: 'lowpass', f: 600 }) : sfx.whoosh(1.3, 0.14)));
  if (golf) {
    tl.to(pr, { x: target.x, y: target.y, duration: 0.3, ease: 'power1.in' }, 1.7);
    tl.to(pr, { scale: 0, duration: 0.12, ease: 'power2.in' }, 2.0);
    k.at(2.02, () => {
      sfx.clank(0.18, 900);
      sfx.note(9, 0.1, 0.8, 0.1);
    });
  } else {
    k.at(1.7, () => {
      sfx.clank(0.24, sub.includes('billard') ? 1600 : 700);
      sfx.hit(0.4, 70);
      k.haptic(20);
    });
    // onde de choc
    const ring = pin(el('div', '', `position:absolute;left:${target.x}px;top:${target.y}px;width:${R * 0.2}px;height:${R * 0.2}px;border-radius:50%;border:2px solid #fff;opacity:0;`));
    tl.fromTo(ring, { scale: 0.5, opacity: 1 }, { scale: 9, opacity: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, 1.7);
    k.shake(1.7, u, 0.25);
  }
  tl.to(tgt, { scale: 1.6, duration: 0.5, ease: 'power3.in' }, 2.05);
  tl.to({}, { duration: 0.01 }, 2.5);
}

function chess(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 55%,#1c1a17,#050504 75%);');
  const S = Math.min(w * 1.1, u * 110);
  const board = el('div', '', `position:absolute;left:50%;top:${h * 0.52}px;width:${S}px;height:${S}px;background:repeating-conic-gradient(#d9d2c3 0 25%,#2a2622 0 50%) 0 0/${S / 4}px ${S / 4}px;transform-origin:50% 0;`);
  k.gsap.set(board, { xPercent: -50, transformPerspective: u * 70, rotationX: 62 });
  const king = pin(el('div', '', `position:absolute;left:50%;top:${h * 0.66}px;font:${u * 48}px/1 "Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif;color:#f4f1ea;text-shadow:0 ${u}px ${u * 3}px rgba(0,0,0,.8);`), -50, -100);
  king.textContent = '♚';
  const txt = pin(el('div', '', `position:absolute;left:50%;top:${h * 0.16}px;font:800 ${Math.min(u * 10, w / 9)}px var(--display);color:#fff;white-space:nowrap;opacity:0;`), -50, 0);
  txt.textContent = 'ÉCHEC ET MAT';
  tl.fromTo(board, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0);
  tl.fromTo(king, { opacity: 0, y: -u * 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0.15);
  k.at(0.48, () => sfx.clank(0.16, 500));
  k.gsap.set(king, { transformOrigin: '50% 100%' });
  // il vacille…
  tl.to(king, { rotation: 6, duration: 0.18, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.7);
  k.at(0.7, () => sfx.tick(0.5, 0.15));
  k.at(1.05, () => sfx.tick(0.5, 0.15));
  // … et tombe
  tl.to(king, { rotation: 88, duration: 0.4, ease: 'power3.in' }, 1.45);
  k.at(1.85, () => {
    sfx.clank(0.3, 380);
    sfx.hit(0.45, 60);
    k.haptic([30, 30]);
  });
  k.shake(1.85, u * 1.2, 0.3);
  tl.fromTo(txt, { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'power4.out' }, 1.9);
  tl.to({}, { duration: 0.01 }, 2.5);
}
