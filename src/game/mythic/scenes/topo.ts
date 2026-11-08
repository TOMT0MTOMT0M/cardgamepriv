/**
 * ARDÈCHE — « Carte topo » : les courbes de niveau se dessinent (gorges, plateaux), la rivière suit son tracé en
 * méandres jusqu'au centre — le clin d'œil local, puis la carte.
 */
import type { SceneCtx } from '../kit';

export default function topo(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 70% at 50% 50%,#121614,#040504 80%);');
  // courbes de niveau : contours fermés déformés autour de quelques sommets
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
  // la rivière : méandres depuis le haut jusqu'au centre
  const river: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const q = i / 40;
    const y = -h * 0.05 + q * h * 0.55;
    const x = w / 2 + Math.sin(q * 9 + 1) * w * 0.18 * (1 - q * 0.9);
    river.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const svg = k.svg(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">
    <g class="iso" fill="none" stroke="rgba(230,240,225,.5)" stroke-width="1">${paths.map((d, i) => `<path d="${d}" stroke-width="${i % 6 === 5 ? 1.6 : 0.8}"/>`).join('')}</g>
    <path class="riv" d="M${river.join(' L')}" fill="none" stroke="#6bc8ff" stroke-width="${u * 0.9}" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px #6bc8ff)"/>
  </svg>`);
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
  // repère + coordonnées
  const mark = pin(el('div', '', `position:absolute;left:${w / 2}px;top:${h * 0.5}px;width:${u * 6}px;height:${u * 6}px;border-radius:50%;border:2px solid #fff;opacity:0;`));
  const lab = pin(el('div', 'mp-mono', `position:absolute;left:50%;top:${h * 0.5 + u * 6}px;font-size:${u * 2.8}px;color:#e6f0e1;letter-spacing:.3em;opacity:0;white-space:nowrap;`), -50, 0);
  lab.textContent = '44°24′ N · 4°24′ E';
  tl.fromTo(mark, { opacity: 0, scale: 3 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out', immediateRender: false }, 1.9);
  tl.to(lab, { opacity: 1, duration: 0.3 }, 1.95);
  k.at(1.9, () => {
    sfx.note(7, 0.1, 0.8);
    sfx.note(9, 0.08, 0.8, 0.1);
    k.haptic(14);
  });
  tl.to(svg, { scale: 2.2, transformOrigin: `${w / 2}px ${h * 0.5}px`, duration: 0.5, ease: 'power3.in' }, 2.2);
  tl.to({}, { duration: 0.01 }, 2.7);
}
