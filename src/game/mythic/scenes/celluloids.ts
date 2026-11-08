/**
 * DESSINS ANIMÉS — « Celluloïds » : une table lumineuse ; des feuilles transparentes se posent une à une (le décor, le
 * crayonné bleu d'un personnage abstrait qui s'anime image par image, l'encrage noir), les cases d'une bande de
 * pellicule défilent en haut… et la dernière feuille, c'est la carte, qui vient se poser au centre.
 */
import type { SceneCtx } from '../kit';

export default function celluloids(k: SceneCtx) {
  const { tl, u, el, sfx, actor, cw, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 50% 55%,#2a2a26,#0a0a09 75%);');
  // table lumineuse
  const tw = Math.min(w * 0.92, u * 96);
  const th = tw * 1.05;
  const table = el('div', '', `position:absolute;left:50%;top:52%;width:${tw}px;height:${th}px;border-radius:${u * 1.2}px;background:radial-gradient(ellipse at 50% 45%,#fdfcf7,#e9e6dc 70%,#cfcbbf);box-shadow:0 0 ${u * 12}px rgba(255,250,230,.25),0 40px 90px rgba(0,0,0,.85);`);
  k.pin(table);
  // trous de perforation
  for (const y of [4, 96]) for (let i = 0; i < 3; i++) el('div', '', `position:absolute;left:${18 + i * 32}%;top:${y}%;width:${u * 3}px;height:${u * 1.4}px;margin:-${u * 0.7}px 0 0 -${u * 1.5}px;border-radius:${u}px;background:#1a1a18;`, table);
  const sheet = (css = '') => {
    const s = el('div', '', `position:absolute;inset:${u * 1.5}px;border-radius:${u * 0.6}px;background:rgba(255,255,255,.08);box-shadow:0 2px 0 rgba(0,0,0,.08),inset 0 0 0 1px rgba(0,0,0,.08);opacity:0;${css}`, table);
    return s;
  };
  // 1. décor (collines abstraites, crayon gris)
  const bg = sheet();
  bg.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none"><path d="M0 70 Q25 50 50 66 T100 60 L100 100 L0 100 Z" fill="none" stroke="#8a8a84" stroke-width=".8" stroke-dasharray="2 1.5"/><circle cx="78" cy="24" r="9" fill="none" stroke="#8a8a84" stroke-width=".8" stroke-dasharray="2 1.5"/></svg>`;
  // 2. crayonné bleu : un bonhomme-bâton abstrait animé image par image (6 poses)
  const pencil = sheet();
  const poses = [
    'M50 42 l0 18 M50 48 l-10 8 M50 48 l10 -8 M50 60 l-8 14 M50 60 l8 14',
    'M50 42 l0 18 M50 48 l-11 5 M50 48 l11 -5 M50 60 l-9 12 M50 60 l9 12',
    'M50 41 l0 18 M50 47 l-12 2 M50 47 l12 -2 M50 59 l-10 10 M50 59 l10 10',
    'M50 42 l0 18 M50 48 l-11 5 M50 48 l11 -5 M50 60 l-9 12 M50 60 l9 12',
    'M50 43 l0 18 M50 49 l-9 9 M50 49 l9 -9 M50 61 l-7 13 M50 61 l7 13',
    'M50 42 l0 18 M50 48 l-10 8 M50 48 l10 -8 M50 60 l-8 14 M50 60 l8 14',
  ];
  pencil.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="35" r="6" fill="none" stroke="#3c7bd9" stroke-width="1.2"/><path class="pose" d="${poses[0]}" fill="none" stroke="#3c7bd9" stroke-width="1.2" stroke-linecap="round"/><path d="M44 30 q6 -8 12 0" fill="none" stroke="#3c7bd9" stroke-width=".6" opacity=".5"/></svg>`;
  const pose = pencil.querySelector('.pose')!;
  // 3. encrage noir
  const ink = sheet();
  ink.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%"><circle cx="50" cy="35" r="6" fill="none" stroke="#111" stroke-width="2"/><path class="pose" d="${poses[0]}" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>`;
  const inkPose = ink.querySelector('.pose')!;
  // bande de pellicule en haut (cases qui défilent)
  const strip = el('div', '', `position:absolute;left:0;right:0;top:${u * 3}px;height:${u * 9}px;display:flex;gap:${u * 1.2}px;padding:0 ${u * 2}px;opacity:.35;`);
  for (let i = 0; i < 14; i++) el('div', '', `flex:0 0 ${u * 11}px;border:1px solid #fff;border-radius:2px;background:rgba(255,255,255,.04);`, strip);
  k.label('12 IMAGES / S', '50%', `${u * 14}px`).style.transform = 'translateX(-50%)';
  tl.fromTo(table, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }, 0);
  k.at(0.1, () => sfx.hiss({ dur: 0.3, vol: 0.06, type: 'highpass', f: 3000 }));
  [bg, pencil, ink].forEach((s, i) => {
    const at = 0.45 + i * 0.4;
    tl.fromTo(s, { opacity: 0, y: -u * 8, rotation: (k.rand() - 0.5) * 4 }, { opacity: 1, y: 0, rotation: (i - 1) * 0.6, duration: 0.3, ease: 'power3.out' }, at);
    k.at(at + 0.25, () => {
      sfx.tick(0.3, 0.16);
      k.haptic(6);
    });
  });
  // image par image
  tl.to(strip, { x: -u * 12.2 * 6, duration: 1.5, ease: 'steps(6)' }, 1.2);
  k.loop((t) => {
    if (t < 1.2 || t > 2.7) return;
    const f = Math.floor((t - 1.2) * 12) % poses.length;
    pose.setAttribute('d', poses[f]);
    inkPose.setAttribute('d', poses[f]);
  });
  for (let i = 0; i < 6; i++) k.at(1.25 + i * 0.25, () => sfx.tick(0.5, 0.1));
  // la dernière feuille : la carte
  const a = actor();
  tl.set(a, { opacity: 1, y: -h * 0.6, rotation: -6, scale: 1.05 }, 2.3);
  tl.to(a, { y: 0, rotation: 0, scale: 1, duration: 0.5, ease: 'power3.out' }, 2.35);
  k.at(2.35, () => sfx.whoosh(0.4, 0.14, false));
  k.at(2.8, () => {
    sfx.hit(0.3, 70);
    sfx.note(9, 0.1, 0.8);
    k.haptic(14);
  });
  tl.to(table, { filter: 'brightness(.5)', duration: 0.4 }, 2.5);
  tl.to({}, { duration: 0.01 }, 3.0);
  void cw;
  void accent;
}
