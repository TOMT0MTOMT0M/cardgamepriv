/**
 * COMBAT — « Ring » : vrai ring en perspective (cordes rouge / blanc / bleu, piquets), cloche, la poursuite cherche puis
 * se fige au centre ; le speaker tape l'annonce en grand ; la carte descend dans la lumière, au centre du ring — gong.
 */
import { t } from '../../../core/i18n';
import { displayCase } from '../../../core/fonts';
import type { SceneCtx } from '../kit';

export default function ring(k: SceneCtx) {
  const { tl, u, el, sfx, actor, w, h, card } = k;
  el('div', '', 'position:absolute;inset:0;background:#040404;');
  el('div', '', 'position:absolute;inset:0;background:radial-gradient(ellipse 80% 30% at 50% 74%,rgba(255,255,255,.06),transparent 70%);');
  const yb = h * 0.96, yf = h * 0.6;
  const X = (x: number, y: number) => w / 2 + x * (w * 0.3 + (w * 0.26 * (y - yf)) / (yb - yf));
  const rope = (i: number, col: string) => {
    const dy = u * (4 + i * 3.4);
    return `<path d="M ${X(-1, yb)} ${yb - dy * 1.4} L ${X(-1, yf)} ${yf - dy} L ${X(1, yf)} ${yf - dy} L ${X(1, yb)} ${yb - dy * 1.4}" fill="none" stroke="${col}" stroke-width="${u * 0.8}" opacity=".9"/>`;
  };
  k.svg(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">
    <polygon points="${X(-1, yf)},${yf} ${X(1, yf)},${yf} ${X(1, yb)},${yb} ${X(-1, yb)},${yb}" fill="#161616" stroke="#2a2a2a"/>
    ${[0, 1, 2].map((i) => rope(i, ['#b02430', '#e8e8e8', '#2a4fb0'][i])).join('')}
    ${[-1, 1].map((s) => `<rect x="${X(s, yf) - u}" y="${yf - u * 14}" width="${u * 2}" height="${u * 14}" fill="${s < 0 ? '#b02430' : '#2a4fb0'}"/><rect x="${X(s, yb) - u * 1.3}" y="${yb - u * 16}" width="${u * 2.6}" height="${u * 16}" fill="${s < 0 ? '#2a4fb0' : '#b02430'}"/>`).join('')}
  </svg>`);
  const spot = el('div', '', `position:absolute;left:50%;top:-${h * 0.1}px;width:${w * 0.9}px;height:${h * 0.86}px;margin-left:-${w * 0.45}px;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.18));clip-path:polygon(46% 0,54% 0,78% 100%,22% 100%);transform-origin:50% 0;opacity:0;`);
  const pool = el('div', '', `position:absolute;left:50%;top:${h * 0.76}px;width:${w * 0.6}px;height:${h * 0.1}px;border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.5),transparent 70%);opacity:0;`);
  k.pin(pool);
  // (10/11) casse mixte : les capitales R de Bold Frame se lisent « A » (« SUA LE AING »)
  const corner = card.subId === 'catch' ? t('myth.ring') : k.rand() < 0.5 ? t('myth.red') : t('myth.blue');
  const lines = [corner, displayCase(t('myth.six'))];
  const lineEls = lines.map((t, i) => el('div', '', `position:absolute;left:0;right:0;top:${h * (0.12 + i * 0.1)}px;text-align:center;white-space:nowrap;font:${i ? 800 : 700} ${Math.min(u * (i ? 9 : 6.5), (w * 0.92) / (t.length * 0.62))}px var(${i ? '--display' : '--title'});letter-spacing:${i ? '0' : '.04em'};color:#fff;`));
  lineEls.forEach((e, i) => ((e.textContent = lines[i]), k.fit(e, 0.9)));
  [0.05, 0.3, 0.55].forEach((t, i) => k.at(t, () => sfx.bell(1150, 0.2 - i * 0.02, 1.2)));
  k.at(0.05, () => k.haptic([20, 230, 20, 230, 20]));
  tl.to(spot, { opacity: 1, duration: 0.2 }, 0.3);
  tl.fromTo(spot, { rotation: 28 }, { rotation: -22, duration: 0.6, ease: 'sine.inOut' }, 0.3);
  tl.to(spot, { rotation: 0, duration: 0.5, ease: 'power3.out' }, 0.9);
  tl.to(pool, { opacity: 1, duration: 0.3 }, 1.1);
  k.at(1.1, () => sfx.flood(0.2));
  lineEls.forEach((e, i) => {
    const txt = lines[i];
    e.textContent = '';
    const at = 0.7 + i * 0.6;
    tl.to({ n: 0 }, { n: txt.length, duration: i ? 0.35 : 0.5, ease: 'none', onUpdate() { e.textContent = txt.slice(0, Math.round((this.targets()[0] as { n: number }).n)); } }, at);
    k.at(at, () => sfx.roll(i ? 0.35 : 0.5, 0.05));
  });
  tl.fromTo(lineEls[1], { scale: 1.3 }, { scale: 1, duration: 0.3, ease: 'power3.out' }, 1.3);
  k.at(1.65, () => sfx.crowd(1.2, 0.16));
  // la carte descend dans la lumière, au centre du ring
  const a = actor();
  tl.set(a, { opacity: 1, y: -h * 0.7, scale: 0.9 }, 1.7);
  tl.to(a, { y: 0, scale: 1, duration: 0.5, ease: 'power3.in' }, 1.75);
  k.at(2.25, () => {
    sfx.gong(0.22);
    sfx.hit(0.5, 50);
    k.haptic([40, 20, 40]);
  });
  k.shake(2.25, u * 1.2, 0.35);
  tl.to(lineEls, { opacity: 0, y: -u * 4, duration: 0.3, ease: 'power2.in' }, 2.3);
  tl.to({}, { duration: 0.01 }, 2.8);
}
