/**
 * JEUX VIDÉO — « Cartouche » : une console rétro sans marque, la cartouche (étiquette arc-en-ciel) s'enfonce, la télé
 * cathodique s'allume en pixels (« PRESS START », l'année), petit jingle 8 bits original ; un pixel s'étire jusqu'à
 * remplir l'écran — la carte.
 */
import type { SceneCtx } from '../kit';

export default function cartouche(k: SceneCtx) {
  const { tl, u, el, sfx, card, pin } = k;
  el('div', '', `position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 50% 38%, #1a1c22, #050506 70%);`);
  const tvW = Math.min(k.w * 0.82, u * 92);
  const tvTop = k.h * 0.4 - tvW * 0.37 - u * 6;
  const tv = el('div', 'mp-abs', `left:50%;top:${tvTop}px;width:${tvW}px;height:${tvW * 0.74}px;border-radius:${u * 4}px;background:linear-gradient(180deg,#2b2b30,#141417);box-shadow:inset 0 2px 0 rgba(255,255,255,.08),0 30px 60px -20px #000;padding:${u * 3.4}px;`);
  const scr = el('div', '', `position:relative;width:100%;height:100%;border-radius:${u * 3}px / ${u * 4}px;background:#0b0f0d;overflow:hidden;box-shadow:inset 0 0 ${u * 6}px #000;`, tv);
  // image de l'écran : un petit canvas agrandi en « pixels »
  const PW = 96, PH = 72;
  const pc = document.createElement('canvas');
  pc.width = PW;
  pc.height = PH;
  pc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;opacity:0;';
  scr.append(pc);
  const g = pc.getContext('2d')!;
  const line = el('div', '', 'position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:#fff;box-shadow:0 0 18px #fff;transform:scaleX(0);', scr);
  el('div', '', 'position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.35) 0 1px,transparent 1px 3px);pointer-events:none;', scr);
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%,rgba(255,255,255,.12),transparent 45%);pointer-events:none;', scr);
  // console
  const cw = tvW * 0.72;
  const conTop = tvTop + tvW * 0.74 + u * 16;
  const con = el('div', 'mp-abs', `left:50%;top:${conTop}px;width:${cw}px;height:${cw * 0.3}px;border-radius:${u * 1.6}px ${u * 1.6}px ${u * 3}px ${u * 3}px;background:linear-gradient(180deg,#3a3a40,#1c1c20);box-shadow:inset 0 2px 0 rgba(255,255,255,.1),0 20px 40px -12px #000;`);
  el('div', '', `position:absolute;left:22%;right:22%;top:${u * 1.2}px;height:${u * 2}px;border-radius:${u}px;background:#050506;box-shadow:inset 0 2px 4px #000;`, con);
  const led = el('div', '', `position:absolute;right:8%;bottom:28%;width:${u * 1.4}px;height:${u * 1.4}px;border-radius:50%;background:#3a1010;`, con);
  for (let i = 0; i < 6; i++) el('div', '', `position:absolute;left:${8 + i * 3}%;bottom:30%;width:1.6%;height:30%;border-radius:2px;background:#111;`, con);
  // cartouche
  const cart = el('div', 'mp-abs', `left:50%;width:${cw * 0.5}px;height:${cw * 0.42}px;top:${conTop - cw * 0.38}px;border-radius:${u}px ${u}px ${u * 0.4}px ${u * 0.4}px;background:linear-gradient(180deg,#4a4a52,#2a2a30);box-shadow:inset 0 1px 0 rgba(255,255,255,.18);`);
  el('div', '', `position:absolute;left:12%;right:12%;top:14%;bottom:30%;border-radius:${u * 0.6}px;background:linear-gradient(115deg,#ff6b9a,#ffd36b,#6bffb8,#6bc8ff,#c86bff);opacity:.9;`, cart);
  el('div', 'mp-mono', `position:absolute;left:0;right:0;bottom:8%;text-align:center;font-size:${u * 1.6}px;color:rgba(255,255,255,.5);`, cart).textContent = '★★★★★★';

  con.style.zIndex = '2';
  pin(tv, -50, 0);
  pin(con, -50, 0);
  pin(cart, -50, 0);
  tl.fromTo([tv, con], { opacity: 0, y: u * 4 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out', stagger: 0.06 }, 0);
  tl.fromTo(cart, { y: -k.h * 0.5, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: 'power3.in' }, 0.15);
  tl.to(cart, { y: cw * 0.2, duration: 0.1, ease: 'power2.out' }, 0.57);
  k.at(0.58, () => {
    sfx.slot();
    k.haptic(18);
  });
  k.shake(0.58, u * 0.8, 0.2);
  tl.set(led, { background: '#ff3b30', boxShadow: '0 0 12px #ff3b30' }, 0.75);
  // la télé s'allume
  k.at(0.8, () => sfx.tvOn());
  tl.to(line, { scaleX: 1, duration: 0.12, ease: 'power2.out' }, 0.8);
  tl.to(line, { scaleY: 120, opacity: 0, duration: 0.22, ease: 'power2.in' }, 0.93);
  tl.set(pc, { opacity: 1 }, 1.0);
  const year = card.year ? String(card.year) : '★★★★★★';
  let blink = true;
  const draw = (t: number) => {
    g.fillStyle = '#081009';
    g.fillRect(0, 0, PW, PH);
    // horizon de pixels qui défile (sol en damier)
    for (let y = 0; y < 18; y++)
      for (let x = 0; x < PW; x += 6) {
        const off = Math.floor((t * 40) % 12);
        if (((x + off + y * 3) / 6) % 2 < 1) g.fillStyle = '#123018';
        else g.fillStyle = '#0c200f';
        g.fillRect(x, PH - 18 + y, 6, 1);
      }
    g.fillStyle = '#e8ffe8';
    g.font = 'bold 9px monospace';
    g.textAlign = 'center';
    g.fillText(year, PW / 2, 26);
    if (blink) {
      g.font = '7px monospace';
      g.fillText('PRESS START', PW / 2, 44);
    }
  };
  k.loop((t) => {
    if (t < 1 || t > 2.2) return;
    blink = Math.floor(t * 5) % 2 === 0;
    draw(t);
  });
  k.at(1.12, () => sfx.chip());
  // un pixel s'étire jusqu'à remplir l'écran, puis la pièce
  const px = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${tvW / PW}px;height:${tvW / PW}px;background:#fff;box-shadow:0 0 20px #fff;`, scr));
  tl.set(px, { scale: 0 }, 0);
  tl.to(px, { scale: 1, duration: 0.05 }, 1.95);
  tl.to(px, { scaleX: PW * 1.1, scaleY: 1, duration: 0.18, ease: 'power3.in' }, 2.0);
  tl.to(px, { scaleY: PH * 1.1, duration: 0.18, ease: 'power3.in' }, 2.18);
  tl.to([tv, con, cart], { scale: 2.6, opacity: 0, duration: 0.3, ease: 'power3.in', transformOrigin: '50% 30%' }, 2.3);
  k.at(2.2, () => sfx.whoosh(0.35, 0.22));
  tl.to({}, { duration: 0.01 }, 2.6);
}
