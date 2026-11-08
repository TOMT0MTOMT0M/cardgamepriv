/**
 * VALORANT — « Inspection » : une lame d'acier (silhouette générique, pas d'arme du jeu) tourne devant la caméra comme
 * une inspection, un reflet glisse sur le métal, « shing » ; puis une coupe nette fend l'écran en deux — la carte.
 */
import type { SceneCtx } from '../kit';

export default function inspection(k: SceneCtx) {
  const { tl, u, el, sfx, pin } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 60% 45% at 50% 50%,#1a1d24,#050608 75%);');
  // deux moitiés de l'écran (pour la coupe finale)
  const halfA = el('div', '', 'position:absolute;inset:0;clip-path:polygon(0 0,100% 0,100% 38%,0 62%);');
  const halfB = el('div', '', 'position:absolute;inset:0;clip-path:polygon(0 62%,100% 38%,100% 100%,0 100%);');
  const L = Math.min(k.w * 0.86, u * 95);
  const blade = (host: HTMLElement) =>
    pin(k.svg(`<svg viewBox="0 0 400 90" width="${L}" height="${L * 0.225}" style="position:absolute;left:50%;top:50%;overflow:visible">
      <defs>
        <linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".45" stop-color="#8c939c"/><stop offset=".55" stop-color="#3b4048"/><stop offset="1" stop-color="#c9ced4"/></linearGradient>
        <linearGradient id="sh" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <clipPath id="bl"><path d="M150 30 L360 34 Q392 38 398 46 Q388 54 356 58 L150 62 Z"/></clipPath>
      </defs>
      <path d="M150 30 L360 34 Q392 38 398 46 Q388 54 356 58 L150 62 Z" fill="url(#st)"/>
      <path d="M150 46 L392 46" stroke="#fff" stroke-opacity=".5" stroke-width=".8"/>
      <rect class="gl" x="-80" y="20" width="70" height="50" fill="url(#sh)" clip-path="url(#bl)" transform="skewX(-20)"/>
      <rect x="132" y="20" width="18" height="52" rx="3" fill="#2a2d33" stroke="#555b63"/>
      <path d="M8 38 Q20 32 132 34 L132 58 Q20 60 8 54 Q2 46 8 38 Z" fill="#15171b" stroke="#3d424a"/>
      ${Array.from({ length: 6 }, (_, i) => `<line x1="${30 + i * 16}" y1="36" x2="${26 + i * 16}" y2="56" stroke="#30343b" stroke-width="3"/>`).join('')}
      <circle cx="16" cy="46" r="4" fill="none" stroke="#6bc8ff" stroke-width="1.5"/>
    </svg>`, '', host));
  const bA = blade(halfA);
  const bB = blade(halfB);
  const both = [bA, bB];
  const glints = [bA, bB].map((b) => b.querySelector('.gl')!);
  tl.fromTo(both, { opacity: 0, scale: 0.7, rotation: -35 }, { opacity: 1, scale: 1, rotation: -12, duration: 0.45, ease: 'power3.out' }, 0);
  k.at(0.05, () => sfx.whoosh(0.4, 0.2));
  // inspection : la lame pivote (écrasée en largeur = rotation sur son axe), se retourne, revient
  tl.to(both, { scaleY: -1, duration: 0.5, ease: 'power2.inOut' }, 0.5);
  tl.to(both, { rotation: 8, scaleX: 0.85, duration: 0.5, ease: 'power2.inOut' }, 0.5);
  tl.to(both, { scaleY: 1, rotation: -4, scaleX: 1.08, duration: 0.55, ease: 'power3.inOut' }, 1.05);
  k.at(0.55, () => sfx.tick(0.6, 0.2));
  k.at(1.08, () => sfx.tick(0.7, 0.2));
  tl.fromTo(glints, { x: -80 }, { x: 520, duration: 0.5, ease: 'power2.inOut' }, 0.35);
  tl.fromTo(glints, { x: -80 }, { x: 520, duration: 0.45, ease: 'power2.inOut', immediateRender: false }, 1.35);
  k.at(1.4, () => sfx.shing(0.2));
  // la coupe
  const cut = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${Math.hypot(k.w, k.h) * 1.1}px;height:2px;background:#fff;box-shadow:0 0 ${u * 3}px #fff,0 0 ${u * 8}px #6bc8ff;`));
  tl.set(cut, { rotation: (-Math.atan2(k.h * 0.24, k.w) * 180) / Math.PI, scaleX: 0 }, 0);
  tl.to(both, { scale: 0.92, duration: 0.25, ease: 'power2.in' }, 1.7);
  tl.to(cut, { scaleX: 1, duration: 0.12, ease: 'power4.out' }, 1.95);
  k.at(1.95, () => {
    sfx.slash(0.3);
    k.haptic([25, 20, 25]);
  });
  tl.to(cut, { opacity: 0, duration: 0.3 }, 2.1);
  tl.to(halfA, { x: -u * 8, y: -u * 10, opacity: 0, duration: 0.45, ease: 'power3.in' }, 2.08);
  tl.to(halfB, { x: u * 8, y: u * 10, opacity: 0, duration: 0.45, ease: 'power3.in' }, 2.08);
  tl.to({}, { duration: 0.01 }, 2.5);
}
