/**
 * LEAGUE OF LEGENDS — « Splash » : la caméra plonge en profondeur dans un tunnel de lumière dorée (particules qui
 * filent), des anneaux gravés tournent en sens contraires puis se referment sur le centre — l'explosion de lumière
 * laisse la place à la carte. (Aucune interface ni symbole du jeu : anneaux et graduations originaux.)
 */
import { span, easeIn, type SceneCtx } from '../kit';

export default function splash(k: SceneCtx) {
  const { tl, u, el, sfx, pin } = k;
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,#1a1408 0%,#060503 60%,#000 100%);');
  const cv = k.canvas();
  const N = k.mobile ? 260 : 520;
  const P = Array.from({ length: N }, () => ({ a: k.rand() * Math.PI * 2, r: 0.15 + k.rand() * 1.2, z: k.rand(), s: 0.4 + k.rand() * 1.4, gold: k.rand() < 0.7 }));
  const cx = cv.w / 2;
  const cy = cv.h / 2;
  const R = Math.hypot(cx, cy);
  cv.loop((t, dt) => {
    const c = cv.c;
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(0, 0, cv.w, cv.h);
    // vitesse : lente, puis l'accélération du plongeon, puis l'aspiration finale
    const v = 0.25 + easeIn(span(t, 0.2, 1.8)) * 2.6 - span(t, 2.0, 2.3) * 2.2;
    c.globalCompositeOperation = 'lighter';
    for (const p of P) {
      p.z -= dt * v * p.s * 0.5;
      if (p.z <= 0.02) p.z += 1;
      if (p.z > 1) p.z -= 1;
      const k1 = 1 / p.z;
      const k0 = 1 / Math.min(1, p.z + 0.02 + v * 0.03);
      const x1 = cx + Math.cos(p.a) * p.r * R * 0.12 * k1;
      const y1 = cy + Math.sin(p.a) * p.r * R * 0.12 * k1;
      const x0 = cx + Math.cos(p.a) * p.r * R * 0.12 * k0;
      const y0 = cy + Math.sin(p.a) * p.r * R * 0.12 * k0;
      const al = Math.min(1, (1 - p.z) * 1.4);
      c.strokeStyle = p.gold ? `rgba(255,${190 + Math.round(40 * p.s)},120,${al})` : `rgba(220,240,255,${al * 0.8})`;
      c.lineWidth = Math.max(0.6, 2.4 * (1 - p.z));
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  });
  // anneaux gravés (graduations) qui tournent en sens contraires
  const ring = (r: number, ticks: number, dash: string, w: number, op: number) => {
    const d = r * 2;
    const s = pin(k.svg(`<svg viewBox="-100 -100 200 200" width="${d}" height="${d}" style="position:absolute;left:50%;top:50%;overflow:visible">
      <circle r="96" fill="none" stroke="#f0c878" stroke-width="${w}" stroke-dasharray="${dash}" opacity="${op}"/>
      ${Array.from({ length: ticks }, (_, i) => `<line x1="0" y1="-${88}" x2="0" y2="-${i % 4 ? 84 : 78}" stroke="#f0c878" stroke-width="${i % 4 ? 0.8 : 1.6}" opacity="${op}" transform="rotate(${(i * 360) / ticks})"/>`).join('')}
    </svg>`));
    return s;
  };
  const r1 = ring(u * 40, 48, '2 3', 1.2, 0.9);
  const r2 = ring(u * 30, 24, '40 8', 2, 0.7);
  const r3 = ring(u * 20, 12, '1 0', 0.8, 0.8);
  const core = pin(el('div', '', `position:absolute;left:50%;top:50%;width:${u * 6}px;height:${u * 6}px;border-radius:50%;background:radial-gradient(circle,#fff,#ffd47a 40%,transparent 70%);`));
  tl.fromTo([r1, r2, r3], { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: 0.08 }, 0.1);
  tl.to(r1, { rotation: 140, duration: 2.2, ease: 'power1.inOut' }, 0);
  tl.to(r2, { rotation: -220, duration: 2.2, ease: 'power1.inOut' }, 0);
  tl.to(r3, { rotation: 300, duration: 2.2, ease: 'power1.inOut' }, 0);
  tl.fromTo(core, { scale: 0.5, opacity: 0.4 }, { scale: 2.4, opacity: 1, duration: 1.8, ease: 'power2.in' }, 0.2);
  k.at(0.15, () => sfx.riser(1.8, 0.16));
  k.at(0.3, () => sfx.rumble(1.8, 0.16));
  // les anneaux se referment sur le centre, puis la lumière explose
  tl.to([r1, r2, r3], { scale: 0.05, opacity: 0, duration: 0.3, ease: 'power3.in', stagger: 0.04 }, 1.95);
  tl.to(core, { scale: 60, duration: 0.35, ease: 'power3.in' }, 2.15);
  k.at(2.25, () => {
    sfx.hit(0.6, 50);
    sfx.note(9, 0.12, 1.2);
    k.haptic([20, 30, 40]);
  });
  tl.to({}, { duration: 0.01 }, 2.5);
}
