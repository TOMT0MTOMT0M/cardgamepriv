/**
 * COULISSES & LÉGENDES — « Vestiaire » : une rangée de casiers métalliques dans la pénombre ; le cadenas du casier
 * du milieu claque, la porte s'ouvre sur la lumière (arbitres : coup de sifflet) — la carte.
 */
import type { SceneCtx } from '../kit';

export default function vestiaire(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h, card } = k;
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#0b0c0e,#15171a 70%,#0a0a0b);');
  el('div', '', `position:absolute;left:0;right:0;bottom:0;height:16%;background:repeating-linear-gradient(90deg,#141414 0 ${u * 8}px,#101010 ${u * 8}px ${u * 8.4}px);`);
  const lw = Math.min(w * 0.28, u * 26);
  const lh = h * 0.62;
  const row = pin(el('div', '', `position:absolute;left:50%;top:${h * 0.15}px;display:flex;gap:${u * 0.8}px;`), -50, 0);
  const n = 5;
  const doors: HTMLElement[] = [];
  let mid: HTMLElement | null = null;
  for (let i = 0; i < n; i++) {
    const cell = el('div', '', `position:relative;width:${lw}px;height:${lh}px;perspective:${u * 80}px;background:#000;`, row);
    if (i === 2) {
      // derrière la porte : la lumière
      el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#fff,#dfe8f0 30%,#7a8590 70%,#2a2e33);', cell);
      mid = cell;
    }
    const d = el('div', '', `position:absolute;inset:0;transform-origin:0 50%;background:linear-gradient(90deg,#2b2f35,#3c4148 45%,#2a2d32);border:1px solid #4a4f57;box-shadow:inset 0 0 ${u * 2}px rgba(0,0,0,.6);`, cell);
    for (let j = 0; j < 6; j++) el('div', '', `position:absolute;left:25%;right:25%;top:${8 + j * 3.2}%;height:${u * 0.7}px;border-radius:${u}px;background:#14161a;`, d);
    el('div', '', `position:absolute;right:12%;top:52%;width:${u * 1.4}px;height:${u * 6}px;border-radius:${u}px;background:#8d939b;`, d);
    if (i === 2) el('div', 'mp-mono mp-rainbow', `position:absolute;left:0;right:0;top:36%;text-align:center;font-size:${u * 2.4}px;letter-spacing:.2em;`, d).textContent = '★★★★★★';
    doors.push(d);
  }
  const door = doors[2];
  const lock = el('div', '', `position:absolute;right:9%;top:62%;width:${u * 4}px;height:${u * 5}px;border-radius:${u * 0.8}px;background:linear-gradient(180deg,#c7a24a,#7d6326);`, door);
  const shackle = el('div', '', `position:absolute;left:18%;right:18%;top:-${u * 3}px;height:${u * 4}px;border:${u * 0.7}px solid #bbb;border-bottom:0;border-radius:${u * 2}px ${u * 2}px 0 0;`, lock);
  tl.fromTo(row, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, 0);
  // la caméra s'approche du casier du milieu
  tl.to(row, { scale: 1.25, y: -h * 0.02, duration: 1.4, ease: 'power1.inOut' }, 0.3);
  tl.to(lock, { rotation: -8, duration: 0.06, yoyo: true, repeat: 3 }, 0.9);
  k.at(0.9, () => sfx.tick(0.4, 0.2));
  tl.to(shackle, { y: -u * 2, duration: 0.1, ease: 'power2.out' }, 1.2);
  k.at(1.2, () => {
    sfx.clank(0.22, 600);
    k.haptic(18);
  });
  tl.to(lock, { y: h * 0.4, rotation: 40, opacity: 0, duration: 0.5, ease: 'power2.in' }, 1.35);
  if (card.subId === 'arbitres-officiels') k.at(1.5, () => sfx.whistle(0.7, 0.16));
  // la porte s'ouvre
  tl.to(door, { rotationY: -112, duration: 0.6, ease: 'power3.inOut' }, 1.55);
  k.at(1.6, () => sfx.clank(0.16, 300));
  if (mid) tl.to(row, { scale: 3.2, duration: 0.5, ease: 'power3.in', transformOrigin: '50% 45%' }, 2.0);
  k.at(2.1, () => sfx.whoosh(0.4, 0.2));
  tl.to({}, { duration: 0.01 }, 2.55);
}
