/**
 * FILMS — « Salle de cinéma » : la salle s'éteint, le faisceau du projecteur s'allume (poussière dans la lumière),
 * amorce de pellicule 3-2-1 sans logo sur l'écran, puis l'écran blanc et la caméra qui y entre — la carte.
 */
import type { SceneCtx } from '../kit';

export default function cinema(k: SceneCtx) {
  const { tl, u, el, sfx, pin } = k;
  const room = el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#2a1d14,#120c08 60%,#050302);');
  const lights = el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 40% 25% at 15% 30%,rgba(255,190,120,.35),transparent),radial-gradient(ellipse 40% 25% at 85% 30%,rgba(255,190,120,.35),transparent);');
  const sw = Math.min(k.w * 0.92, u * 120);
  const sh = sw * 0.5;
  const scrTop = k.h * 0.14;
  const screen = el('div', '', `position:absolute;left:50%;top:${scrTop}px;width:${sw}px;height:${sh}px;background:#1d1a17;box-shadow:0 0 0 ${u}px #0a0806;overflow:hidden;`);
  pin(screen, -50, 0);
  // faisceau (canvas : cône + poussière)
  const cv = k.canvas();
  const motes = Array.from({ length: k.mobile ? 70 : 140 }, () => ({ x: k.rand(), y: k.rand(), v: 0.02 + k.rand() * 0.05, s: 0.5 + k.rand() * 1.5 }));
  const px = k.w / 2;
  const py = k.h * 0.96;
  let beam = 0;
  cv.loop((t, dt) => {
    const c = cv.c;
    c.clearRect(0, 0, cv.w, cv.h);
    if (beam <= 0) return;
    const flick = 0.85 + 0.15 * Math.sin(t * 60) * Math.sin(t * 23);
    const g = c.createLinearGradient(px, py, px, scrTop + sh / 2);
    g.addColorStop(0, `rgba(255,250,235,${0.55 * beam * flick})`);
    g.addColorStop(1, `rgba(255,250,235,${0.06 * beam})`);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(px - u, py);
    c.lineTo(k.w / 2 - sw / 2, scrTop + sh);
    c.lineTo(k.w / 2 + sw / 2, scrTop + sh);
    c.lineTo(px + u, py);
    c.fill();
    c.fillStyle = `rgba(255,255,255,${0.7 * beam})`;
    for (const m of motes) {
      m.y -= m.v * dt;
      if (m.y < 0) m.y += 1;
      const yy = scrTop + sh + (py - scrTop - sh) * m.y;
      const half = (sw / 2) * (1 - m.y) + u * m.y;
      const xx = px + (m.x * 2 - 1) * half;
      c.fillRect(xx, yy, m.s, m.s);
    }
  });
  // rangées de fauteuils
  for (let r = 0; r < 3; r++) {
    const row = el('div', '', `position:absolute;left:-5%;right:-5%;bottom:${-u * 3 + r * u * 9}px;height:${u * 14}px;display:flex;justify-content:center;gap:${u * 1.2}px;z-index:2;`);
    const n = Math.ceil(k.w / (u * 11)) + 2;
    for (let i = 0; i < n; i++) el('div', '', `flex:0 0 ${u * 10}px;height:100%;border-radius:${u * 4}px ${u * 4}px 0 0;background:${['#050302', '#0a0705', '#100b08'][r]};`, row);
  }
  // amorce 3-2-1 sur l'écran
  const lead = el('div', '', 'position:absolute;inset:0;opacity:0;background:#cfc7b8;', screen);
  const R = sh * 0.42;
  const sweep = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${R * 2}px;height:${R * 2}px;border-radius:50%;background:conic-gradient(rgba(0,0,0,.35) 0deg,transparent 0deg);`, lead));
  pin(el('div', '', `position:absolute;left:50%;top:50%;width:${R * 2}px;height:${R * 2}px;border-radius:50%;border:${u * 0.6}px solid #222;box-shadow:0 0 0 ${u * 1.8}px #cfc7b8,0 0 0 ${u * 2.3}px #222;`, lead));
  el('div', '', 'position:absolute;left:50%;top:0;bottom:0;width:2px;background:#222;', lead);
  el('div', '', 'position:absolute;top:50%;left:0;right:0;height:2px;background:#222;', lead);
  const num = pin(el('div', '', `position:absolute;left:50%;top:50%;font:800 ${sh * 0.6}px/1 var(--title);color:#151515;`, lead));
  const white = el('div', '', 'position:absolute;inset:0;background:#fff;opacity:0;', screen);
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse,transparent 55%,rgba(0,0,0,.6));pointer-events:none;', screen);

  tl.fromTo(room, { filter: 'brightness(1.4)' }, { filter: 'brightness(.25)', duration: 0.6, ease: 'power2.in' }, 0);
  tl.to(lights, { opacity: 0, duration: 0.5, ease: 'power2.in' }, 0.05);
  k.at(0.5, () => {
    sfx.flood(0.18);
    sfx.projector(2, 0.08);
  });
  tl.to({ v: 0 }, { v: 1, duration: 0.2, onUpdate() { beam = (this.targets()[0] as { v: number }).v; } }, 0.5);
  tl.set(lead, { opacity: 1 }, 0.6);
  ['3', '2', '1'].forEach((n, i) => {
    const at = 0.7 + i * 0.42;
    tl.call(() => {
      num.textContent = n;
      sfx.beep(1000, 0.08, 0.08);
    }, [], at);
    tl.fromTo(sweep, { background: 'conic-gradient(rgba(0,0,0,.35) 0deg,transparent 0deg)' }, { background: 'conic-gradient(rgba(0,0,0,.35) 360deg,transparent 360deg)', duration: 0.4, ease: 'none', immediateRender: false }, at);
  });
  // scintillement de la pellicule
  k.loop((t) => {
    if (t > 0.6 && t < 2) lead.style.opacity = String(0.82 + Math.random() * 0.18);
  });
  tl.to(white, { opacity: 1, duration: 0.12 }, 1.98);
  k.at(1.98, () => sfx.hit(0.45, 60));
  tl.to(screen, { scale: 2.6, y: k.h * 0.28, duration: 0.45, ease: 'power3.in' }, 2.1);
  tl.to({}, { duration: 0.01 }, 2.6);
}
