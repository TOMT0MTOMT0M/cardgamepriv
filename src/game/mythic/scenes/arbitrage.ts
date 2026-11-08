/**
 * RAQUETTES — « Arbitrage vidéo » : le terrain en perspective, la trajectoire de la balle au ralenti (pointillés),
 * l'impact s'écrase tout près de la ligne… « IN » — la carte. (Aucune interface reprise : tracé et marque originaux.)
 */
import type { SceneCtx } from '../kit';

export default function arbitrage(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#05070a,#0b1016 45%,#0e1a22 46%,#0a1218);');
  const hz = h * 0.42;
  const X = (x: number, y: number) => w / 2 + x * (w * 0.2 + (w * 0.3 * (y - hz)) / (h - hz));
  // lignes du court (vues de derrière)
  const yb = h * 0.95;
  const yf = hz + (h - hz) * 0.02;
  const ynet = hz + (h - hz) * 0.16;
  const ysvc = hz + (h - hz) * 0.42;
  const ysvf = hz + (h - hz) * 0.06;
  const impact = { x: X(0.72, ysvc + (yb - ysvc) * 0.55), y: ysvc + (yb - ysvc) * 0.55 };
  const svg = k.svg(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">
    <g stroke="rgba(255,255,255,.85)" stroke-width="${u * 0.45}" fill="none">
      <path d="M ${X(-1, yb)} ${yb} L ${X(-1, yf)} ${yf} L ${X(1, yf)} ${yf} L ${X(1, yb)} ${yb}"/>
      <path d="M ${X(-0.75, yb)} ${yb} L ${X(-0.75, yf)} ${yf} M ${X(0.75, yb)} ${yb} L ${X(0.75, yf)} ${yf}"/>
      <path d="M ${X(-0.75, ysvc)} ${ysvc} L ${X(0.75, ysvc)} ${ysvc} M ${w / 2} ${ysvc} L ${w / 2} ${ysvf} M ${X(-0.75, ysvf)} ${ysvf} L ${X(0.75, ysvf)} ${ysvf}"/>
    </g>
    <rect x="${X(-1.12, ynet)}" y="${ynet - u * 6}" width="${X(1.12, ynet) - X(-1.12, ynet)}" height="${u * 6}" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.55)" stroke-width="${u * 0.3}"/>
    <path class="traj" d="M ${X(-0.4, yf)} ${yf - u * 8} Q ${w * 0.6} ${hz - u * 18} ${impact.x} ${impact.y}" stroke="#d9ff3a" stroke-width="${u * 0.5}" stroke-dasharray="${u * 0.6} ${u * 1.4}" fill="none" stroke-linecap="round"/>
  </svg>`);
  const traj = svg.querySelector('.traj') as SVGPathElement;
  const len = traj.getTotalLength();
  traj.style.display = 'none';
  // la trajectoire : des points qui apparaissent derrière la balle
  const NS = 'http://www.w3.org/2000/svg';
  const dots = Array.from({ length: 34 }, (_, i) => {
    const pt = traj.getPointAtLength((i / 33) * len);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(pt.x));
    c.setAttribute('cy', String(pt.y));
    c.setAttribute('r', String(u * (0.25 + (i / 33) * 0.35)));
    c.setAttribute('fill', '#d9ff3a');
    c.style.opacity = '0';
    svg.append(c);
    return c;
  });
  const ball = pin(el('div', '', `position:absolute;left:0;top:0;width:${u * 3.4}px;height:${u * 3.4}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f4ffb0,#c8e82a 60%,#8aa015);box-shadow:0 0 ${u * 2}px rgba(217,255,58,.6);`));
  const mark = pin(el('div', '', `position:absolute;left:${impact.x}px;top:${impact.y}px;width:${u * 9}px;height:${u * 3}px;border-radius:50%;border:2px solid #d9ff3a;background:rgba(217,255,58,.25);opacity:0;`));
  const st = { p: 0 };
  tl.fromTo(svg, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0);
  tl.to(st, {
    p: 1,
    duration: 1.3,
    ease: 'power1.in',
    onUpdate: () => {
      const pt = traj.getPointAtLength(st.p * len);
      k.gsap.set(ball, { x: pt.x, y: pt.y, scale: 0.6 + st.p * 0.7 });
      dots.forEach((d, i) => (d.style.opacity = i / 33 <= st.p ? '0.8' : '0'));
    },
  }, 0.2);
  k.at(0.2, () => sfx.whoosh(1.2, 0.12));
  k.at(1.5, () => {
    sfx.bounce(0.3);
    k.haptic(16);
  });
  tl.fromTo(mark, { opacity: 1, scaleX: 0.4, scaleY: 0.4 }, { scaleX: 1, scaleY: 1, duration: 0.3, ease: 'power3.out', immediateRender: false }, 1.5);
  tl.to(ball, { y: `-=${u * 12}`, x: `+=${u * 8}`, opacity: 0, duration: 0.4, ease: 'power2.out' }, 1.5);
  // zoom sur l'impact, puis le verdict
  tl.to(svg, { scale: 1.5, transformOrigin: `${impact.x}px ${impact.y}px`, duration: 0.5, ease: 'power2.inOut' }, 1.55);
  tl.to(mark, { scale: 1.5, duration: 0.5, ease: 'power2.inOut' }, 1.55);
  const verdict = pin(el('div', '', `position:absolute;left:50%;top:${h * 0.24}px;font:800 ${u * 26}px/1 var(--display);color:#fff;letter-spacing:.04em;`));
  verdict.textContent = 'IN';
  tl.fromTo(verdict, { opacity: 0, scale: 2 }, { opacity: 1, scale: 1, duration: 0.2, ease: 'power4.out' }, 2.0);
  k.at(2.0, () => {
    sfx.beep(1320, 0.12, 0.14);
    sfx.beep(1760, 0.12, 0.2);
    sfx.hit(0.4, 70);
  });
  tl.to({}, { duration: 0.01 }, 2.5);
}
