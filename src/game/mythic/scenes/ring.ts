/**
 * COMBAT — « Ring » : la cloche, trois cordes, la poursuite de lumière qui cherche puis se fige au centre ; l'annonce
 * du speaker s'écrit en grand (« DANS LE COIN… ») — le coup de gong, la carte.
 */
import type { SceneCtx } from '../kit';

export default function ring(k: SceneCtx) {
  const { tl, u, el, sfx, pin, w, h, card } = k;
  el('div', '', 'position:absolute;inset:0;background:#040404;');
  // brume
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 30% at 50% 72%,rgba(255,255,255,.06),transparent 70%);');
  // tapis du ring (trapèze) + cordes
  k.svg(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">
    <polygon points="${w * 0.12},${h * 0.6} ${w * 0.88},${h * 0.6} ${w * 1.05},${h * 0.95} ${-w * 0.05},${h * 0.95}" fill="#141414" stroke="#2a2a2a"/>
    ${[0, 1, 2].map((i) => `<path d="M ${-w * 0.05} ${h * (0.86 - i * 0.07)} L ${w * 1.05} ${h * (0.86 - i * 0.07)}" stroke="${['#b02430', '#e8e8e8', '#2a4fb0'][i]}" stroke-width="${u * 0.9}" opacity=".85"/>`).join('')}
    <rect x="${w * 0.02}" y="${h * 0.6}" width="${u * 2.4}" height="${h * 0.36}" fill="#b02430"/>
    <rect x="${w * 0.98 - u * 2.4}" y="${h * 0.6}" width="${u * 2.4}" height="${h * 0.36}" fill="#2a4fb0"/>
  </svg>`);
  // poursuite (cône de lumière)
  const spot = el('div', '', `position:absolute;left:50%;top:-${h * 0.1}px;width:${w * 0.9}px;height:${h * 0.82}px;margin-left:-${w * 0.45}px;background:linear-gradient(180deg,rgba(255,255,255,.0),rgba(255,255,255,.16));clip-path:polygon(46% 0,54% 0,78% 100%,22% 100%);transform-origin:50% 0;opacity:0;`);
  const pool = pin(el('div', '', `position:absolute;left:50%;top:${h * 0.72}px;width:${w * 0.6}px;height:${h * 0.1}px;border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.5),transparent 70%);opacity:0;`));
  // annonce du speaker (sans nom de carte)
  const corner = card.subId === 'catch' ? 'SUR LE RING…' : k.rand() < 0.5 ? 'DANS LE COIN ROUGE…' : 'DANS LE COIN BLEU…';
  const lines = [corner, 'LA SIX ÉTOILES !'];
  const lineEls = lines.map((t, i) =>
    el('div', '', `position:absolute;left:0;right:0;top:${h * (0.2 + i * 0.1)}px;text-align:center;white-space:nowrap;font:${i ? 800 : 700} ${Math.min(u * (i ? 9 : 6.5), (w * 0.92) / (t.length * 0.62))}px var(${i ? '--display' : '--title'});letter-spacing:.04em;color:#fff;`),
  );
  tl.call(() => sfx.bell(1150, 0.2, 1.2), [], 0.05);
  tl.call(() => sfx.bell(1150, 0.18, 1.2), [], 0.3);
  tl.call(() => sfx.bell(1150, 0.16, 1.2), [], 0.55);
  k.at(0.05, () => k.haptic([20, 230, 20, 230, 20]));
  // la poursuite cherche, puis se fige au centre
  tl.to(spot, { opacity: 1, duration: 0.2 }, 0.3);
  tl.fromTo(spot, { rotation: 28 }, { rotation: -22, duration: 0.6, ease: 'sine.inOut' }, 0.3);
  tl.to(spot, { rotation: 0, duration: 0.5, ease: 'power3.out' }, 0.9);
  tl.to(pool, { opacity: 1, duration: 0.3 }, 1.1);
  k.at(1.1, () => sfx.flood(0.2));
  // le speaker
  lineEls.forEach((e, i) => {
    const txt = lines[i];
    e.textContent = '';
    const at = 0.7 + i * 0.6;
    tl.to({ n: 0 }, {
      n: txt.length,
      duration: i ? 0.35 : 0.5,
      ease: 'none',
      onUpdate() {
        const n = Math.round((this.targets()[0] as { n: number }).n);
        e.textContent = txt.slice(0, n);
      },
    }, at);
    k.at(at, () => sfx.roll(i ? 0.35 : 0.5, 0.05));
  });
  tl.fromTo(lineEls[1], { scale: 1.3 }, { scale: 1, duration: 0.3, ease: 'power3.out' }, 1.3);
  k.at(1.65, () => sfx.crowd(1, 0.16));
  // le gong
  k.at(2.0, () => {
    sfx.gong(0.22);
    k.haptic([40, 20, 40]);
  });
  k.shake(2.0, u * 1.2, 0.35);
  tl.to(lineEls, { opacity: 0, y: -u * 4, duration: 0.3, ease: 'power2.in' }, 2.0);
  tl.to(pool, { scale: 3, opacity: 0.9, duration: 0.4, ease: 'power3.in' }, 2.05);
  tl.to({}, { duration: 0.01 }, 2.5);
}
