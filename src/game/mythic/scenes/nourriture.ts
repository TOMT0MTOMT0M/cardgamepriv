/**
 * NOURRITURE — deux variantes :
 *  - snacks, marques, boissons : un distributeur automatique, la spirale tourne, l'objet tombe dans le bac ;
 *  - plats : une cloche de restaurant se soulève dans la vapeur, avec un grésillement.
 */
import type { SceneCtx } from '../kit';

export default function nourriture(k: SceneCtx) {
  const snack = /snack|monster|red-bull|fast/.test(k.card.subId);
  if (snack) vending(k);
  else cloche(k);
}

function vending(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 40%,#16181d,#040405 75%);');
  const mw = Math.min(w * 0.84, u * 84);
  const mh = Math.min(h * 0.8, mw * 1.7);
  const m = el('div', '', `position:absolute;left:50%;top:${(h - mh) / 2}px;width:${mw}px;height:${mh}px;border-radius:${u * 1.6}px;background:linear-gradient(180deg,#24262c,#17181c);box-shadow:0 30px 70px rgba(0,0,0,.9);`);
  pin(m, -50, 0);
  const glass = el('div', '', `position:absolute;left:5%;top:4%;width:70%;height:66%;border-radius:${u}px;background:#0b0d10;overflow:hidden;box-shadow:inset 0 0 ${u * 4}px rgba(107,200,255,.25);`, m);
  const cols = 3, rows = 4;
  const items: HTMLElement[] = [];
  const spirals: HTMLElement[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cx = ((c + 0.5) / cols) * 100;
      const cy = ((r + 0.42) / rows) * 100;
      const it = pin(el('div', '', `position:absolute;left:${cx}%;top:${cy}%;width:${mw * 0.13}px;height:${mw * 0.17}px;border-radius:${u * 0.8}px;background:linear-gradient(160deg,hsl(${(r * 3 + c) * 33},12%,${46 + ((r + c) % 3) * 10}%),#1a1a1a);`, glass));
      items.push(it);
      const sp = pin(el('div', '', `position:absolute;left:${cx}%;top:${cy + 11}%;width:${mw * 0.18}px;height:${u * 1.6}px;background:repeating-linear-gradient(90deg,#9aa0a8 0 2px,transparent 2px ${u * 1.4}px);`, glass));
      spirals.push(sp);
      el('div', '', `position:absolute;left:0;right:0;top:${((r + 1) / rows) * 100 - 1}%;height:2px;background:#2b2e34;`, glass);
    }
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.08) 0 20%,transparent 30%);', glass);
  // pavé + bac
  const pad = el('div', '', `position:absolute;right:5%;top:12%;width:16%;height:30%;display:grid;grid-template-columns:repeat(3,1fr);gap:${u * 0.6}px;`, m);
  for (let i = 0; i < 9; i++) el('div', '', `border-radius:${u * 0.4}px;background:#2f3239;`, pad);
  const screen = el('div', 'mp-mono', `position:absolute;right:5%;top:5%;width:16%;height:5%;border-radius:${u * 0.4}px;background:#06120a;color:#6bffb8;font-size:${u * 2}px;display:grid;place-items:center;`, m);
  screen.textContent = '— —';
  const tray = el('div', '', `position:absolute;left:8%;right:28%;bottom:6%;height:16%;border-radius:${u}px;background:#050506;overflow:hidden;`, m);
  const flap = el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#2a2c31,#1d1f23);transform-origin:50% 0;', tray);
  const target = items[4 + Math.floor(k.rand() * 2)];
  const ti = items.indexOf(target);
  tl.fromTo(m, { opacity: 0, y: u * 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0);
  // le code est tapé
  ['B', 'B4', '★6'].forEach((s, i) => {
    tl.call(() => {
      screen.textContent = s;
      sfx.beep(1100 + i * 150, 0.08, 0.06);
    }, [], 0.4 + i * 0.16);
  });
  // la spirale tourne : l'objet avance et bascule
  tl.to(spirals[ti], { backgroundPositionX: `${u * 5.6}px`, duration: 0.7, ease: 'none' }, 0.9);
  k.at(0.9, () => sfx.hiss({ dur: 0.7, vol: 0.08, f: 200, type: 'lowpass', chop: 18 }));
  tl.to(target, { y: `+=${u * 1.5}`, rotation: 18, duration: 0.25, ease: 'power2.in' }, 1.45);
  tl.to(target, { y: `+=${mh * 0.75}`, rotation: 70, duration: 0.42, ease: 'power3.in' }, 1.7);
  k.at(2.12, () => {
    sfx.clank(0.28, 260);
    sfx.hit(0.4, 60);
    k.haptic(26);
  });
  k.shake(2.12, u * 1.2, 0.25);
  tl.to(flap, { rotationX: 60, duration: 0.15, yoyo: true, repeat: 1 }, 2.12);
  tl.to(m, { scale: 2.4, y: -mh * 0.3, duration: 0.4, ease: 'power3.in' }, 2.25);
  tl.to({}, { duration: 0.01 }, 2.7);
}

function cloche(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 55%,#1d1915,#050403 75%);');
  // nappe + assiette
  el('div', '', `position:absolute;left:-10%;right:-10%;top:58%;bottom:0;background:linear-gradient(180deg,#e9e3d6,#bdb5a5);transform:perspective(${u * 50}px) rotateX(50deg);transform-origin:50% 0;`);
  const D = Math.min(w * 0.82, u * 82);
  pin(el('div', '', `position:absolute;left:50%;top:${h * 0.62}px;width:${D}px;height:${D * 0.32}px;border-radius:50%;background:radial-gradient(ellipse,#fbfaf7 0 55%,#d9d4cb 70%,#f4f1ea 72%);box-shadow:0 ${u * 2}px ${u * 4}px rgba(0,0,0,.4);`));
  const glow = pin(el('div', '', `position:absolute;left:50%;top:${h * 0.56}px;width:${D * 0.8}px;height:${D * 0.5}px;border-radius:50%;background:radial-gradient(ellipse,rgba(255,236,190,.9),transparent 70%);opacity:0;`));
  // cloche (dôme argenté)
  const dome = el('div', '', `position:absolute;left:50%;top:${h * 0.62}px;width:${D * 0.82}px;height:${D * 0.5}px;border-radius:50% 50% 6% 6% / 100% 100% 6% 6%;background:radial-gradient(ellipse at 35% 25%,#ffffff,#c9ccd2 25%,#7d828b 60%,#3c4048);box-shadow:0 ${u * 2}px ${u * 6}px rgba(0,0,0,.5);`);
  pin(dome, -50, -100);
  pin(el('div', '', `position:absolute;left:50%;top:0;width:${u * 6}px;height:${u * 3.4}px;border-radius:50% 50% 30% 30%;background:linear-gradient(180deg,#e6e8ec,#7d828b);`, dome), -50, -80);
  // vapeur
  const cv = k.canvas();
  const puffs = Array.from({ length: 26 }, () => ({ x: (k.rand() - 0.5) * D * 0.6, y: 0, r: u * (4 + k.rand() * 6), v: 0.5 + k.rand(), d: k.rand() * 0.5 }));
  cv.loop((t) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    const p = t - 1.15;
    if (p <= 0) return;
    for (const s of puffs) {
      const q = p - s.d;
      if (q <= 0) continue;
      const y = h * 0.6 - q * h * 0.22 * s.v;
      const a = Math.max(0, 0.22 - q * 0.12);
      const g = c.createRadialGradient(w / 2 + s.x + Math.sin(q * 3 + s.r) * u * 3, y, 0, w / 2 + s.x, y, s.r * (1 + q));
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, y - s.r * 3, w, s.r * 6);
    }
  });
  tl.fromTo(dome, { opacity: 0, y: -u * 6 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }, 0);
  k.at(0.4, () => sfx.bell(1900, 0.1, 1.2));
  tl.to(dome, { y: -u * 0.8, duration: 0.08, yoyo: true, repeat: 3 }, 0.8);
  k.at(0.8, () => sfx.tick(0.4, 0.14));
  // elle se soulève
  tl.to(dome, { y: -h * 0.3, rotation: -14, duration: 0.7, ease: 'power3.inOut' }, 1.1);
  tl.to(dome, { opacity: 0, duration: 0.3 }, 1.6);
  tl.to(glow, { opacity: 1, duration: 0.4 }, 1.15);
  k.at(1.15, () => {
    sfx.sizzle(1.3, 0.12);
    sfx.whoosh(0.5, 0.14);
  });
  tl.to(glow, { scale: 3, duration: 0.5, ease: 'power3.in' }, 2.0);
  tl.to({}, { duration: 0.01 }, 2.55);
}
