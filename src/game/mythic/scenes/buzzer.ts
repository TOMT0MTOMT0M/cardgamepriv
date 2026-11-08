/**
 * SPORTS COLLECTIFS — « Buzzer » : tableau d'affichage à LED (3, 2, 1), la sirène ; le ballon de la discipline (rond,
 * ovale…) part en cloche et la lumière éclate à l'impact — la carte.
 */
import type { SceneCtx } from '../kit';

export default function buzzer(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h, card } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 35%,#15171c,#040405 75%);');
  // parquet / terrain en bas
  el('div', '', `position:absolute;left:-10%;right:-10%;top:66%;bottom:0;background:repeating-linear-gradient(90deg,#16120d 0 ${u * 6}px,#1b1611 ${u * 6}px ${u * 12}px);transform:perspective(${u * 40}px) rotateX(55deg);transform-origin:50% 0;opacity:.9;`);
  // tableau
  const bw = Math.min(w * 0.86, u * 90);
  const board = el('div', '', `position:absolute;left:50%;top:${h * 0.16}px;width:${bw}px;height:${bw * 0.42}px;border-radius:${u * 1.4}px;background:#07080a;box-shadow:0 0 0 ${u * 0.8}px #23262c,0 20px 50px rgba(0,0,0,.8);`);
  pin(board, -50, 0);
  const cv = document.createElement('canvas');
  const CW = 64, CH = 20;
  cv.width = CW;
  cv.height = CH;
  cv.style.cssText = 'position:absolute;inset:8% 6%;width:88%;height:84%;image-rendering:pixelated;';
  board.append(cv);
  const g = cv.getContext('2d')!;
  const red = el('div', '', `position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 ${u * 10}px rgba(255,60,50,.0);`, board);
  let txt = '00:03';
  let col = '#ffb347';
  const draw = () => {
    g.fillStyle = '#07080a';
    g.fillRect(0, 0, CW, CH);
    g.fillStyle = col;
    g.font = 'bold 16px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, CW / 2, CH / 2 + 1);
    // grille de LED : on éteint une colonne / ligne sur deux
    g.fillStyle = 'rgba(7,8,10,.55)';
    for (let x = 1; x < CW; x += 2) g.fillRect(x, 0, 1, CH);
    for (let y = 1; y < CH; y += 2) g.fillRect(0, y, CW, 1);
  };
  draw();
  tl.fromTo(board, { opacity: 0, y: -u * 6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0);
  ['00:03', '00:02', '00:01'].forEach((s, i) => {
    tl.call(() => {
      txt = s;
      draw();
      sfx.beep(880, 0.1, 0.1);
      k.haptic(8);
    }, [], 0.3 + i * 0.4);
  });
  tl.call(() => {
    txt = '00:00';
    col = '#ff4d40';
    draw();
    sfx.buzzer(0.9, 0.18);
    k.haptic([80]);
  }, [], 1.5);
  tl.to(red, { boxShadow: `0 0 ${u * 14}px rgba(255,60,50,.8)`, duration: 0.1, repeat: 5, yoyo: true }, 1.5);
  // le ballon de la discipline
  const sub = card.subId;
  const oval = /rugby|americain/.test(sub);
  const bs = u * 14;
  const ball = el('div', '', `position:absolute;left:0;top:0;width:${oval ? bs * 1.45 : bs}px;height:${bs}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fafafa,#bdbdbd 60%,#7a7a7a);box-shadow:0 10px 30px rgba(0,0,0,.6);overflow:hidden;`);
  // coutures
  if (/basket/.test(sub)) el('div', '', 'position:absolute;inset:0;border-radius:50%;background:linear-gradient(90deg,transparent 48%,#333 48% 52%,transparent 52%),linear-gradient(0deg,transparent 48%,#333 48% 52%,transparent 52%);', ball);
  else if (oval) el('div', '', 'position:absolute;left:30%;right:30%;top:46%;height:8%;background:repeating-linear-gradient(90deg,#333 0 2px,transparent 2px 6px);', ball);
  else el('div', '', 'position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 50%,#333 0 14%,transparent 15%),radial-gradient(circle at 15% 25%,#333 0 9%,transparent 10%),radial-gradient(circle at 85% 30%,#333 0 9%,transparent 10%),radial-gradient(circle at 30% 85%,#333 0 9%,transparent 10%);opacity:.75;', ball);
  pin(ball);
  // trajectoire en cloche (parabole) vers le centre
  const P0 = { x: -bs, y: h * 0.82 };
  const P1 = { x: w / 2, y: h * 0.58 };
  const top = h * 0.12;
  const st = { p: 0 };
  tl.set(ball, { x: P0.x, y: P0.y }, 0);
  tl.to(st, {
    p: 1,
    duration: 0.75,
    ease: 'none',
    onUpdate: () => {
      const p = st.p;
      const x = P0.x + (P1.x - P0.x) * p;
      const y = (1 - p) * (1 - p) * P0.y + 2 * (1 - p) * p * top + p * p * P1.y;
      k.gsap.set(ball, { x, y, rotation: p * 540, scale: 1 - p * 0.25 });
    },
  }, 1.62);
  k.at(1.62, () => sfx.whoosh(0.6, 0.18));
  k.at(2.37, () => {
    sfx.hit(0.6, 55);
    k.haptic([30, 30]);
  });
  k.shake(2.37, u * 1.4, 0.3);
  k.flash(2.37, 0.9, 0.3);
  tl.to({}, { duration: 0.01 }, 2.55);
}
