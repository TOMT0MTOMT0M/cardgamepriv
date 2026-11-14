/**
 * ARDÈCHE — « Carte topo » : les courbes de niveau se dessinent en blanc sur noir, la rivière suit son tracé en
 * méandres jusqu'au centre ; là, un repère et les coordonnées du Pont d'Arc ; la carte se dresse à l'endroit du repère.
 */
import type { SceneCtx } from '../kit';

export default function topo(k: SceneCtx) {
  const { tl, u, el, sfx, actor, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 70% at 50% 50%,#101412,#040504 80%);');
  const peaks = Array.from({ length: 4 }, () => ({ x: w * (0.15 + k.rand() * 0.7), y: h * (0.15 + k.rand() * 0.7), r: Math.min(w, h) * (0.18 + k.rand() * 0.16), ph: k.rand() * 6 }));
  const paths: string[] = [];
  for (const p of peaks)
    for (let l = 1; l <= 6; l++) {
      const r = (p.r * l) / 6;
      const pts: string[] = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const rr = r * (1 + 0.18 * Math.sin(a * 3 + p.ph + l * 0.4) + 0.08 * Math.sin(a * 7 + p.ph * 2));
        pts.push(`${(p.x + Math.cos(a) * rr).toFixed(1)},${(p.y + Math.sin(a) * rr * 0.85).toFixed(1)}`);
      }
      paths.push(`M${pts.join(' L')}Z`);
    }
  const river: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const q = i / 40;
    river.push(`${(w / 2 + Math.sin(q * 9 + 1) * w * 0.18 * (1 - q * 0.9)).toFixed(1)},${(-h * 0.05 + q * h * 0.55).toFixed(1)}`);
  }
  const svg = k.svg(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">
    <g class="iso" fill="none" stroke="rgba(230,240,225,.5)">${paths.map((d, i) => `<path d="${d}" stroke-width="${i % 6 === 5 ? 1.6 : 0.8}"/>`).join('')}</g>
    <path class="riv" d="M${river.join(' L')}" fill="none" stroke="${accent}" stroke-width="${u * 0.9}" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px ${accent})"/></svg>`);
  const isos = [...svg.querySelectorAll<SVGPathElement>('.iso path')];
  for (const p of isos) {
    const L = p.getTotalLength();
    p.style.strokeDasharray = `${L} ${L}`;
    p.style.strokeDashoffset = String(L);
  }
  const riv = svg.querySelector<SVGPathElement>('.riv')!;
  const RL = riv.getTotalLength();
  riv.style.strokeDasharray = `${RL} ${RL}`;
  riv.style.strokeDashoffset = String(RL);
  isos.forEach((p, i) => tl.to(p, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.inOut' }, 0.05 + (i % 6) * 0.08 + Math.floor(i / 6) * 0.1));
  k.at(0.1, () => sfx.ambience('foret', 2.4, 0.1));
  tl.to(riv, { strokeDashoffset: 0, duration: 1.1, ease: 'power1.inOut' }, 0.8);
  k.at(0.8, () => sfx.hiss({ dur: 1.2, vol: 0.06, f: 900, type: 'bandpass', q: 0.7, a: 0.4 }));
  const mark = el('div', '', `position:absolute;left:${w / 2}px;top:${h * 0.5}px;width:${u * 6}px;height:${u * 6}px;border-radius:50%;border:2px solid #fff;opacity:0;`);
  k.pin(mark);
  const lab = k.label('44°24′ N · 4°24′ E', '50%', `${h * 0.5 + u * 6}px`);
  lab.style.cssText += `transform:translateX(-50%);font-size:${u * 2.8}px;opacity:0;`;
  tl.fromTo(mark, { opacity: 0, scale: 3 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out', immediateRender: false }, 1.9);
  tl.to(lab, { opacity: 1, duration: 0.3 }, 1.95);
  k.at(1.9, () => {
    sfx.note(7, 0.1, 0.8);
    sfx.note(9, 0.08, 0.8, 0.1);
    k.haptic(14);
  });
  // la carte se dresse à l'endroit du repère
  const a = actor();
  tl.set(a, { opacity: 1, scale: 0.2, rotationX: 80 }, 2.2);
  tl.to(a, { scale: 1, rotationX: 0, duration: 0.6, ease: 'power3.out' }, 2.22);
  tl.to([mark, lab], { opacity: 0, duration: 0.25 }, 2.25);
  tl.to(svg, { opacity: 0.35, scale: 1.3, transformOrigin: '50% 50%', duration: 0.6, ease: 'power2.out' }, 2.25);
  k.at(2.22, () => sfx.whoosh(0.4, 0.14, true, 'power2.out'));
  k.at(2.75, () => sfx.hit(0.35, 60));
  tl.to({}, { duration: 0.01 }, 2.95);
}
