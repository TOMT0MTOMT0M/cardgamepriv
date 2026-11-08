/**
 * FILMS — « Salle de cinéma » : la salle s'éteint, le faisceau du projecteur (poussière), l'amorce 3-2-1 (la seule du
 * jeu) ; au « 1 », l'écran projette la carte face cachée en noir et blanc 4:3 scintillant — elle descend de l'écran vers
 * le spectateur, en couleur, au centre.
 */
import type { SceneCtx } from '../kit';

export default function cinema(k: SceneCtx) {
  const { tl, u, el, sfx, actor, w, h } = k;
  const room = el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#1a1512,#0c0908 60%,#040302);');
  const lights = el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 40% 25% at 15% 30%,rgba(255,200,140,.3),transparent),radial-gradient(ellipse 40% 25% at 85% 30%,rgba(255,200,140,.3),transparent);');
  const sw = Math.min(w * 0.92, u * 120);
  const sh = sw * 0.5;
  const scrTop = h * 0.13;
  const screen = el('div', '', `position:absolute;left:50%;top:${scrTop}px;width:${sw}px;height:${sh}px;background:#17140f;box-shadow:0 0 0 ${u}px #080605;overflow:hidden;`);
  k.pin(screen, -50, 0);
  const cv = k.canvas();
  const motes = Array.from({ length: k.mobile ? 70 : 140 }, () => ({ x: k.rand(), y: k.rand(), v: 0.02 + k.rand() * 0.05, s: 0.5 + k.rand() * 1.5 }));
  const px = w / 2, py = h * 0.97;
  let beam = 0;
  cv.loop((t, dt) => {
    const c = cv.c;
    c.clearRect(0, 0, w, h);
    if (beam <= 0) return;
    const flick = 0.85 + 0.15 * Math.sin(t * 60) * Math.sin(t * 23);
    const g = c.createLinearGradient(px, py, px, scrTop + sh / 2);
    g.addColorStop(0, `rgba(255,250,235,${0.5 * beam * flick})`);
    g.addColorStop(1, `rgba(255,250,235,${0.05 * beam})`);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(px - u, py);
    c.lineTo(w / 2 - sw / 2, scrTop + sh);
    c.lineTo(w / 2 + sw / 2, scrTop + sh);
    c.lineTo(px + u, py);
    c.fill();
    c.fillStyle = `rgba(255,255,255,${0.7 * beam})`;
    for (const m of motes) {
      m.y -= m.v * dt;
      if (m.y < 0) m.y += 1;
      const yy = scrTop + sh + (py - scrTop - sh) * m.y;
      const half = (sw / 2) * (1 - m.y) + u * m.y;
      c.fillRect(px + (m.x * 2 - 1) * half, yy, m.s, m.s);
    }
  });
  // fauteuils : dossiers arrondis en silhouettes, trois rangées
  for (let r = 0; r < 3; r++) {
    const row = el('div', '', `position:absolute;left:-5%;right:-5%;bottom:${-u * 4 + r * u * 8}px;height:${u * 13}px;display:flex;justify-content:center;gap:${u * 1.4}px;z-index:2;`);
    const n = Math.ceil(w / (u * 10)) + 2;
    for (let i = 0; i < n; i++) el('div', '', `flex:0 0 ${u * 9}px;height:100%;border-radius:${u * 3.5}px ${u * 3.5}px ${u}px ${u}px;background:${['#040302', '#090605', '#0f0a08'][r]};box-shadow:inset 0 ${u}px ${u * 2}px rgba(255,255,255,.04);`, row);
  }
  const lead = el('div', '', 'position:absolute;inset:0;opacity:0;background:#cfc7b8;', screen);
  const R = sh * 0.42;
  const sweep = el('div', '', `position:absolute;left:50%;top:50%;width:${R * 2}px;height:${R * 2}px;border-radius:50%;background:conic-gradient(rgba(0,0,0,.35) 0deg,transparent 0deg);`, lead);
  k.pin(sweep);
  k.pin(el('div', '', `position:absolute;left:50%;top:50%;width:${R * 2}px;height:${R * 2}px;border-radius:50%;border:${u * 0.6}px solid #222;box-shadow:0 0 0 ${u * 1.8}px #cfc7b8,0 0 0 ${u * 2.3}px #222;`, lead));
  el('div', '', 'position:absolute;left:50%;top:0;bottom:0;width:2px;background:#222;', lead);
  el('div', '', 'position:absolute;top:50%;left:0;right:0;height:2px;background:#222;', lead);
  const num = el('div', '', `position:absolute;left:50%;top:50%;font:800 ${sh * 0.6}px/1 var(--title);color:#151515;`, lead);
  k.pin(num);
  // projection de la carte (noir et blanc, scintillant)
  const film = el('div', '', 'position:absolute;inset:0;background:#d8d2c4;opacity:0;', screen);
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse,transparent 55%,rgba(0,0,0,.6));pointer-events:none;', screen);
  const a = actor();
  tl.fromTo(room, { filter: 'brightness(1.4)' }, { filter: 'brightness(.25)', duration: 0.6, ease: 'power2.in' }, 0);
  tl.to(lights, { opacity: 0, duration: 0.5, ease: 'power2.in' }, 0.05);
  k.at(0.5, () => {
    sfx.flood(0.18);
    sfx.projector(2.4, 0.08);
  });
  tl.to({ v: 0 }, { v: 1, duration: 0.2, onUpdate() { beam = (this.targets()[0] as { v: number }).v; } }, 0.5);
  tl.set(lead, { opacity: 1 }, 0.6);
  ['3', '2', '1'].forEach((n, i) => {
    const at = 0.7 + i * 0.4;
    tl.call(() => {
      num.textContent = n;
      sfx.beep(1000, 0.08, 0.08);
    }, [], at);
    tl.fromTo(sweep, { background: 'conic-gradient(rgba(0,0,0,.35) 0deg,transparent 0deg)' }, { background: 'conic-gradient(rgba(0,0,0,.35) 360deg,transparent 360deg)', duration: 0.38, ease: 'none', immediateRender: false }, at);
  });
  k.loop((t) => {
    if (t > 0.6 && t < 2.6) {
      lead.style.opacity = t < 1.9 ? String(0.82 + Math.random() * 0.18) : '0';
      film.style.opacity = t >= 1.9 ? String(0.75 + Math.random() * 0.25) : '0';
    }
  });
  // l'écran projette la carte, qui descend vers nous
  const sy = scrTop + sh / 2 - h / 2;
  tl.set(a, { opacity: 1, scale: 0.42, y: sy, filter: 'grayscale(1) contrast(1.3) brightness(1.1)' }, 1.9);
  k.at(1.9, () => sfx.note(7, 0.1, 0.9));
  tl.to(a, { scale: 1, y: 0, filter: 'grayscale(0) contrast(1) brightness(1)', duration: 0.7, ease: 'power3.inOut' }, 2.1);
  tl.to([screen, cv.c.canvas], { opacity: 0.25, duration: 0.5 }, 2.3);
  k.at(2.1, () => sfx.whoosh(0.6, 0.18));
  k.at(2.8, () => sfx.hit(0.4, 60));
  tl.to({}, { duration: 0.01 }, 3.0);
}
