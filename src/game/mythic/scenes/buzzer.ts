/**
 * SPORTS COLLECTIFS — « Au buzzer » : les dernières secondes au tableau LED (00:03… 00:00), la sirène ; la carte part
 * du bas en cloche comme un ballon, suspendue en l'air au moment du buzzer (ralenti), et retombe pile au centre.
 * Variante par sport : parquet (basket), gazon (rugby, foot US), glace (hockey).
 */
import type { SceneCtx } from '../kit';

export default function buzzer(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h, card } = k;
  const sub = card.subId;
  const ground = /hockey|glace/.test(sub) ? 'linear-gradient(180deg,#6f8491,#34424c)' : /rugby|americain|football/.test(sub) ? 'repeating-linear-gradient(90deg,#1c3322 0 10%,#16291b 10% 20%)' : `repeating-linear-gradient(90deg,#2a2016 0 ${u * 6}px,#34281c ${u * 6}px ${u * 12}px)`;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 35%,#15171c,#040405 75%);');
  el('div', '', `position:absolute;left:-10%;right:-10%;top:64%;bottom:0;background:${ground};transform:perspective(${u * 40}px) rotateX(55deg);transform-origin:50% 0;opacity:.85;`);
  const board = el('div', '', `position:absolute;left:50%;top:${h * 0.13}px;font:700 ${u * 16}px/1 var(--mono);color:${accent};letter-spacing:.06em;font-variant-numeric:tabular-nums;text-shadow:0 0 ${u * 3}px ${accent};opacity:0;`);
  k.pin(board, -50, 0);
  board.textContent = '00:03';
  // matrice de LED : sur le tableau seulement (avant : sur tout l'écran — le sol devenait un nuage de points)
  el('div', '', `position:absolute;left:0;right:0;top:0;height:${h * 0.13 + u * 22}px;background:repeating-linear-gradient(0deg,rgba(0,0,0,.5) 0 2px,transparent 2px 4px),repeating-linear-gradient(90deg,rgba(0,0,0,.5) 0 2px,transparent 2px 4px);pointer-events:none;mix-blend-mode:multiply;`);
  tl.to(board, { opacity: 1, duration: 0.3 }, 0);
  ['00:03', '00:02', '00:01'].forEach((s, i) =>
    tl.call(() => {
      board.textContent = s;
      sfx.beep(880, 0.1, 0.1);
      k.haptic(8);
    }, [], 0.3 + i * 0.4),
  );
  tl.call(() => {
    board.textContent = '00:00';
    board.style.color = '#ff4d40';
    board.style.textShadow = `0 0 ${u * 4}px #ff4d40`;
    sfx.buzzer(0.9, 0.18);
    k.haptic([80]);
  }, [], 1.5);
  tl.to(board, { opacity: 0.3, duration: 0.08, repeat: 7, yoyo: true }, 1.5);
  // la carte : tir en cloche, suspendue au buzzer, retombe au centre
  const a = actor();
  const st = { p: 0 };
  const P0 = { x: -w * 0.34, y: h * 0.5 }, top = -h * 0.36;
  tl.set(a, { opacity: 1, x: P0.x, y: P0.y, scale: 0.7 }, 0.95);
  tl.to(st, { p: 0.5, duration: 0.55, ease: 'power2.out', onUpdate: upd }, 1.0);
  tl.to(st, { p: 0.5, duration: 0.3 }, 1.55); // suspendue
  tl.to(st, { p: 1, duration: 0.5, ease: 'power2.in', onUpdate: upd }, 1.85);
  function upd() {
    const p = st.p;
    k.gsap.set(a, { x: P0.x * (1 - p), y: (1 - p) * (1 - p) * P0.y + 2 * (1 - p) * p * top, rotation: 360 * p - 360, scale: 0.7 + 0.3 * p });
  }
  k.at(1.0, () => sfx.whoosh(0.6, 0.18));
  k.at(2.35, () => {
    sfx.hit(0.6, 55);
    sfx.bounce(0.3);
    k.haptic([30, 30]);
  });
  k.shake(2.35, u * 1.4, 0.3);
  tl.to(a, { rotation: 0, scale: 1, x: 0, y: 0, duration: 0.01 }, 2.35);
  tl.to(board, { opacity: 0, duration: 0.3 }, 2.4);
  k.glint(2.4, 0.45);
  tl.to({}, { duration: 0.01 }, 2.95);
}
