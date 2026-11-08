/**
 * ACTEURS & ACTRICES — « Tapis rouge » : un tapis en perspective entre deux cordons, une rafale de flashs de
 * photographes (déclencheurs), puis une étoile gravée au sol s'illumine (six étoiles à la place du nom) — dernier
 * crépitement plein écran, la carte.
 */
import type { SceneCtx } from '../kit';

export default function tapisRouge(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 45% at 50% 32%,#221a1c,#050405 70%);');
  const hz = h * 0.4; // horizon
  const vx = w / 2;
  // tapis + cordons en perspective (SVG plein écran)
  const posts = (side: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const z = 1 - i / 6; // 1 = près
      const y = hz + (h - hz) * Math.pow(z, 1.6);
      const x = vx + side * (w * 0.08 + w * 0.42 * Math.pow(z, 1.6));
      const ph = u * 16 * Math.pow(z, 1.6) + u;
      return { x, y, ph, r: Math.max(1.2, u * 1.4 * Math.pow(z, 1.6)) };
    });
  const L = posts(-1);
  const R = posts(1);
  const rope = (P: typeof L) => `M ${P.map((p) => `${p.x.toFixed(1)} ${(p.y - p.ph * 0.8).toFixed(1)}`).join(' L ')}`;
  const svg = k.svg(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">
    <defs>
      <linearGradient id="cp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a070b"/><stop offset="1" stop-color="#7a1422"/></linearGradient>
      <linearGradient id="rbw" x1="0" x2="1"><stop offset="0" stop-color="#ff6b9a"/><stop offset=".25" stop-color="#ffd36b"/><stop offset=".5" stop-color="#6bffb8"/><stop offset=".75" stop-color="#6bc8ff"/><stop offset="1" stop-color="#c86bff"/></linearGradient>
    </defs>
    <polygon points="${vx - w * 0.05},${hz} ${vx + w * 0.05},${hz} ${vx + w * 0.38},${h} ${vx - w * 0.38},${h}" fill="url(#cp)"/>
    <path d="${rope(L)}" fill="none" stroke="#5a1018" stroke-width="${u * 0.8}"/>
    <path d="${rope(R)}" fill="none" stroke="#5a1018" stroke-width="${u * 0.8}"/>
    ${[...L, ...R].map((p) => `<line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${p.y - p.ph}" stroke="#c9a64a" stroke-width="${p.r}"/><circle cx="${p.x}" cy="${p.y - p.ph}" r="${p.r * 1.3}" fill="#e8c86a"/>`).join('')}
    <g class="star" transform="translate(${vx} ${h * 0.74}) scale(1 0.34)" opacity="0">
      <polygon points="${Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? u * 9 : u * 22; const a = -Math.PI / 2 + (i * Math.PI) / 5; return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`; }).join(' ')}" fill="rgba(255,255,255,.08)" stroke="url(#rbw)" stroke-width="${u * 0.7}"/>
    </g>
  </svg>`);
  const star = svg.querySelector('.star')!;
  const starTxt = pin(el('div', 'mp-mono', `position:absolute;left:50%;top:${h * 0.74}px;font-size:${u * 2.6}px;letter-spacing:.3em;color:#fff;opacity:0;text-shadow:0 0 12px #fff;`));
  starTxt.textContent = '★★★★★★';
  // flashs des photographes (des deux côtés, à hauteur d'homme)
  const flashes: HTMLElement[] = [];
  for (let i = 0; i < 14; i++) {
    const left = i % 2 === 0;
    const s = u * (24 + k.rand() * 26);
    const f = pin(el('div', '', `position:absolute;left:${left ? 2 + k.rand() * 22 : 76 + k.rand() * 22}%;top:${hz + k.rand() * h * 0.3}px;width:${s}px;height:${s}px;opacity:0;`));
    f.innerHTML = `<div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,#fff 0 4%,rgba(255,255,255,.85) 7%,rgba(220,235,255,.25) 26%,transparent 60%)"></div><div style="position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:linear-gradient(90deg,transparent,#fff,transparent)"></div><div style="position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:linear-gradient(180deg,transparent,#fff,transparent)"></div>`;
    flashes.push(f);
  }
  const glare = el('div', '', 'position:absolute;inset:0;background:#fff;opacity:0;');
  tl.fromTo(svg, { opacity: 0, scale: 1.08, transformOrigin: '50% 40%' }, { opacity: 1, scale: 1, duration: 2.4, ease: 'power1.out' }, 0);
  flashes.forEach((f, i) => {
    const at = 0.25 + i * 0.09 + (i % 3) * 0.03;
    tl.fromTo(f, { opacity: 1, scale: 0.5 }, { opacity: 0, scale: 1.15, duration: 0.24, ease: 'power2.out', immediateRender: false }, at);
    tl.fromTo(glare, { opacity: 0.14 }, { opacity: 0, duration: 0.12, immediateRender: false }, at);
    k.at(at, () => sfx.shutter(0.12 + (i % 3) * 0.03));
  });
  // l'étoile s'allume
  tl.to([star, starTxt], { opacity: 1, duration: 0.4, ease: 'power2.out' }, 1.65);
  k.at(1.65, () => {
    sfx.note(7, 0.12, 1);
    sfx.note(11, 0.08, 1, 0.08);
    k.haptic(16);
  });
  // le dernier crépitement, plein écran
  for (let i = 0; i < 4; i++) {
    tl.fromTo(glare, { opacity: 0.5 + i * 0.12 }, { opacity: 0, duration: 0.08, immediateRender: false }, 2.15 + i * 0.07);
    k.at(2.15 + i * 0.07, () => sfx.shutter(0.18));
  }
  tl.to({}, { duration: 0.01 }, 2.5);
}
