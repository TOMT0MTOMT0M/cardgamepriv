/**
 * NOURRITURE — deux variantes, la carte au bout :
 *  - snacks, marques, boissons : un DISTRIBUTEUR noir et net (vitrine, spirales, bac lumineux) ; le code se tape, la
 *    spirale tourne : c'est la carte qui bascule et tombe dans le bac, puis vient au centre ;
 *  - plats : une CLOCHE d'argent sur une assiette dans la pénombre ; on la soulève : la carte est dessous, dans la
 *    vapeur (légère : coût maîtrisé).
 */
import type { SceneCtx } from '../kit';

export default function nourriture(k: SceneCtx) {
  if (/snack|monster|red-bull|fast/.test(k.card.subId)) vending(k);
  else cloche(k);
}

function vending(k: SceneCtx) {
  const { tl, u, el, sfx, actor, cw, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 40%,#131418,#040405 75%);');
  const mw = Math.min(w * 0.86, u * 86), mh = Math.min(h * 0.82, mw * 1.7);
  const m = el('div', '', `position:absolute;left:50%;top:${(h - mh) / 2}px;width:${mw}px;height:${mh}px;border-radius:${u * 1.4}px;background:linear-gradient(180deg,#1b1c21,#0f1013);box-shadow:0 40px 90px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.06);`);
  k.pin(m, -50, 0);
  const glass = el('div', '', `position:absolute;left:5%;top:4%;width:70%;height:66%;border-radius:${u}px;background:#07080b;overflow:hidden;box-shadow:inset 0 0 ${u * 4}px rgba(255,196,107,.12);`, m);
  const cols = 3, rows = 4;
  const spirals: HTMLElement[] = [];
  const cells: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cx = ((c + 0.5) / cols) * 100, cy = ((r + 0.42) / rows) * 100;
      cells.push({ x: cx, y: cy });
      if (!(r === 1 && c === 1)) {
        const it = el('div', '', `position:absolute;left:${cx}%;top:${cy}%;width:${mw * 0.13}px;height:${mw * 0.17}px;border-radius:${u * 0.6}px;background:linear-gradient(170deg,#2a2b30,#121216);box-shadow:inset 0 1px 0 rgba(255,255,255,.1);`, glass);
        k.pin(it);
        el('div', '', `position:absolute;left:18%;right:18%;top:30%;height:${u * 0.6}px;background:rgba(255,255,255,.12);`, it);
      }
      const sp = el('div', '', `position:absolute;left:${cx}%;top:${cy + 11}%;width:${mw * 0.18}px;height:${u * 1.4}px;background:repeating-linear-gradient(90deg,#9aa0a8 0 2px,transparent 2px ${u * 1.4}px);`, glass);
      k.pin(sp);
      spirals.push(sp);
      el('div', '', `position:absolute;left:0;right:0;top:${((r + 1) / rows) * 100 - 1}%;height:2px;background:#24262c;`, glass);
    }
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.07) 0 20%,transparent 30%);pointer-events:none;', glass);
  const pad = el('div', '', `position:absolute;right:5%;top:12%;width:16%;height:30%;display:grid;grid-template-columns:repeat(3,1fr);gap:${u * 0.6}px;`, m);
  for (let i = 0; i < 9; i++) el('div', '', `border-radius:${u * 0.4}px;background:#25272d;`, pad);
  const screen = el('div', 'mp-label', `position:absolute;right:5%;top:5%;width:16%;height:5%;color:${accent};font-size:${u * 2.2}px;display:grid;place-items:center;letter-spacing:.1em;`, m);
  screen.textContent = '— —';
  const tray = el('div', '', `position:absolute;left:8%;right:28%;bottom:6%;height:16%;border-radius:${u}px;background:#000;box-shadow:inset 0 0 ${u * 3}px rgba(255,196,107,0);`, m);
  const a = actor();
  const ti = 4;
  const slotX = ((cells[ti].x / 100) * (mw * 0.7) + mw * 0.05) - mw / 2;
  const slotY = ((cells[ti].y / 100) * (mh * 0.66) + mh * 0.04) - h / 2 + (h - mh) / 2;
  tl.set(a, { opacity: 1, scale: 0.3, x: slotX, y: slotY }, 0);
  tl.fromTo(m, { opacity: 0, y: u * 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0);
  ['B', 'B4', '★6'].forEach((s, i) => tl.call(() => { screen.textContent = s; sfx.beep(1100 + i * 150, 0.08, 0.06); }, [], 0.4 + i * 0.16));
  tl.to(spirals[ti], { backgroundPositionX: `${u * 5.6}px`, duration: 0.7, ease: 'none' }, 0.9);
  k.at(0.9, () => sfx.hiss({ dur: 0.7, vol: 0.08, f: 200, type: 'lowpass', chop: 18 }));
  tl.to(a, { y: `+=${u * 1.5}`, rotation: 18, duration: 0.25, ease: 'power2.in' }, 1.45);
  tl.to(a, { y: slotY + mh * 0.62, rotation: 72, duration: 0.42, ease: 'power3.in' }, 1.7);
  k.at(2.12, () => {
    sfx.clank(0.28, 260);
    sfx.hit(0.4, 60);
    k.haptic(26);
  });
  k.shake(2.12, u * 1.2, 0.25);
  tl.to(tray, { boxShadow: `inset 0 0 ${u * 4}px rgba(255,196,107,.6)`, duration: 0.2 }, 2.12);
  // on la prend dans le bac : elle vient au centre
  tl.to(a, { x: 0, y: 0, rotation: 0, scale: 1, duration: 0.6, ease: 'power3.inOut' }, 2.4);
  tl.to(m, { opacity: 0.25, filter: 'blur(2px)', duration: 0.5 }, 2.5);
  k.at(2.4, () => sfx.whoosh(0.4, 0.14));
  k.at(3.0, () => sfx.hit(0.3, 60));
  tl.to({}, { duration: 0.01 }, 3.15);
  void cw;
}

function cloche(k: SceneCtx) {
  const { tl, u, el, sfx, actor, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 55%,#1a1714,#050403 75%);');
  el('div', '', `position:absolute;left:-10%;right:-10%;top:58%;bottom:0;background:linear-gradient(180deg,#141210,#0a0908);transform:perspective(${u * 50}px) rotateX(50deg);transform-origin:50% 0;`);
  const D = Math.min(w * 0.82, u * 82);
  const plate = el('div', '', `position:absolute;left:50%;top:${h * 0.62}px;width:${D}px;height:${D * 0.32}px;border-radius:50%;background:radial-gradient(ellipse,#f6f3ee 0 55%,#cfcac1 70%,#eeebe4 72%);box-shadow:0 ${u * 2}px ${u * 4}px rgba(0,0,0,.5);`);
  k.pin(plate);
  const glow = el('div', '', `position:absolute;left:50%;top:${h * 0.56}px;width:${D * 0.8}px;height:${D * 0.5}px;border-radius:50%;background:radial-gradient(ellipse,rgba(255,236,190,.9),transparent 70%);opacity:0;`);
  k.pin(glow);
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.55, y: h * 0.62 - h / 2 - u * 8, rotationX: 55 }, 0);
  const dome = el('div', '', `position:absolute;left:50%;top:${h * 0.62}px;width:${D * 0.82}px;height:${D * 0.5}px;border-radius:50% 50% 6% 6% / 100% 100% 6% 6%;background:radial-gradient(ellipse at 35% 25%,#ffffff,#c9ccd2 25%,#7d828b 60%,#3c4048);box-shadow:0 ${u * 2}px ${u * 6}px rgba(0,0,0,.5);z-index:2;`);
  k.pin(dome, -50, -100);
  const knob = el('div', '', `position:absolute;left:50%;top:0;width:${u * 6}px;height:${u * 3.4}px;border-radius:50% 50% 30% 30%;background:linear-gradient(180deg,#e6e8ec,#7d828b);`, dome);
  k.pin(knob, -50, -80);
  // vapeur (8 bouffées, légère)
  const puffs = Array.from({ length: 8 }, () => {
    const p = el('div', '', `position:absolute;left:${50 + (k.rand() - 0.5) * 20}%;top:${h * 0.58}px;width:${u * 14}px;height:${u * 14}px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.18),transparent 70%);opacity:0;filter:blur(${u * 0.5}px);`);
    k.pin(p);
    return p;
  });
  tl.fromTo(dome, { opacity: 0, y: -u * 6 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }, 0);
  k.at(0.4, () => sfx.bell(1900, 0.1, 1.2));
  tl.to(dome, { y: -u * 0.8, duration: 0.08, yoyo: true, repeat: 3 }, 0.8);
  k.at(0.8, () => sfx.tick(0.4, 0.14));
  tl.to(dome, { y: -h * 0.32, rotation: -14, duration: 0.7, ease: 'power3.inOut' }, 1.1);
  tl.to(dome, { opacity: 0, duration: 0.3 }, 1.6);
  tl.to(glow, { opacity: 1, duration: 0.4 }, 1.15);
  puffs.forEach((p, i) => tl.fromTo(p, { opacity: 0.9, y: 0, scale: 0.6 }, { opacity: 0, y: -h * 0.3, scale: 1.8, duration: 1.3, ease: 'power1.out', immediateRender: false }, 1.15 + i * 0.1));
  k.at(1.15, () => {
    sfx.sizzle(1.3, 0.12);
    sfx.whoosh(0.5, 0.14);
  });
  // la carte était dessous : elle se redresse et vient au centre
  tl.to(a, { scale: 1, y: 0, rotationX: 0, duration: 0.6, ease: 'power3.inOut' }, 1.9);
  tl.to([plate, glow], { opacity: 0.3, duration: 0.5 }, 2.0);
  k.at(2.5, () => sfx.hit(0.35, 60));
  tl.to({}, { duration: 0.01 }, 2.75);
}
