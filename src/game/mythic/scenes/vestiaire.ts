/**
 * COULISSES & LÉGENDES — « Vestiaire » : rangée de casiers d'acier dans la pénombre, la caméra s'approche du casier du
 * milieu (plaque ★★★★★★), le cadenas claque, la porte s'ouvre et la lumière coule : la carte est dedans, elle sort
 * vers nous. Arbitres : coup de sifflet.
 */
import type { SceneCtx } from '../kit';

export default function vestiaire(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h, card } = k;
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#0a0b0d,#131417 70%,#09090a);');
  el('div', '', `position:absolute;left:0;right:0;bottom:0;height:16%;background:repeating-linear-gradient(90deg,#121212 0 ${u * 8}px,#0e0e0e ${u * 8}px ${u * 8.4}px);`);
  const lw = Math.min(w * 0.28, u * 26), lh = h * 0.62;
  const row = el('div', '', `position:absolute;left:50%;top:${h * 0.15}px;display:flex;gap:${u * 0.8}px;`);
  k.pin(row, -50, 0);
  let door!: HTMLElement;
  let light!: HTMLElement;
  for (let i = 0; i < 5; i++) {
    const cell = el('div', '', `position:relative;width:${lw}px;height:${lh}px;perspective:${u * 80}px;background:#000;`, row);
    if (i === 2) light = el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#fff,#dfe8f0 30%,#7a8590 70%,#2a2e33);opacity:0;', cell);
    const d = el('div', '', `position:absolute;inset:0;transform-origin:0 50%;background:repeating-linear-gradient(90deg,#2a2d32 0 1px,#34373d 1px 3px),linear-gradient(90deg,#272a30,#3a3e45 45%,#262a2f);background-blend-mode:overlay;border:1px solid #474c55;box-shadow:inset 0 0 ${u * 2}px rgba(0,0,0,.6);`, cell);
    for (let j = 0; j < 6; j++) el('div', '', `position:absolute;left:25%;right:25%;top:${8 + j * 3.2}%;height:${u * 0.7}px;border-radius:${u}px;background:#111317;`, d);
    el('div', '', `position:absolute;right:12%;top:52%;width:${u * 1.4}px;height:${u * 6}px;border-radius:${u}px;background:#8d939b;`, d);
    // plaque gravée
    const plate = el('div', 'mp-label', `position:absolute;left:14%;right:14%;top:36%;text-align:center;font-size:${u * 2}px;letter-spacing:.2em;padding:${u * 0.8}px 0;background:#1a1c20;box-shadow:inset 0 1px 0 rgba(255,255,255,.1);color:${i === 2 ? accent : 'rgba(255,255,255,.3)'};`, d);
    plate.textContent = i === 2 ? '★★★★★★' : String(11 + i * 7);
    if (i === 2) door = d;
  }
  const lock = el('div', '', `position:absolute;right:9%;top:62%;width:${u * 4}px;height:${u * 5}px;border-radius:${u * 0.8}px;background:linear-gradient(180deg,#c7a24a,#7d6326);`, door);
  const shackle = el('div', '', `position:absolute;left:18%;right:18%;top:-${u * 3}px;height:${u * 4}px;border:${u * 0.7}px solid #bbb;border-bottom:0;border-radius:${u * 2}px ${u * 2}px 0 0;`, lock);
  const beam = el('div', '', `position:absolute;left:50%;top:${h * 0.15}px;width:${lw * 1.4}px;height:${lh}px;margin-left:-${lw * 0.7}px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent);opacity:0;transform-origin:0 50%;`);
  tl.fromTo(row, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, 0);
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
  tl.to(door, { rotationY: -112, duration: 0.6, ease: 'power3.inOut' }, 1.55);
  tl.to(light, { opacity: 1, duration: 0.4 }, 1.6);
  tl.fromTo(beam, { opacity: 0, scaleX: 0.2 }, { opacity: 1, scaleX: 2.2, duration: 0.6, ease: 'power2.out', immediateRender: false }, 1.7);
  k.at(1.6, () => sfx.clank(0.16, 300));
  // la carte est dans le casier : elle sort vers nous
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.42, y: u * 4 }, 1.9);
  tl.to(a, { scale: 1, y: 0, duration: 0.6, ease: 'power3.inOut' }, 2.0);
  tl.to([row, beam], { opacity: 0.3, filter: 'blur(2px)', duration: 0.5 }, 2.2);
  k.at(2.0, () => sfx.whoosh(0.4, 0.2));
  k.at(2.6, () => sfx.hit(0.35, 60));
  tl.to({}, { duration: 0.01 }, 2.85);
}
