/**
 * SKINS CS — « Caisse » : une bande d'objets défile et freine sous un repère central (aucune interface du vrai jeu).
 * Les cases sont de VRAIES cartes CS du catalogue, de rareté plus basse (bande de couleur = code rareté) ; le
 * dernier cran tombe sur la case arc-en-ciel — la 6★.
 */
import { catalogEntry, subthemeById, THEMES } from '../../../core/sets/themes';
import { rarity } from '../../../core/rarity';
import { thumbUrl } from '../../ui';
import { RAINBOW, type SceneCtx } from '../kit';

export default function caisse(k: SceneCtx) {
  const { tl, u, el, sfx, pin } = k;
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#07080a,#121318 50%,#07080a);');
  // cartes CS plus basses (même sous-thème d'abord : couteaux avec couteaux)
  const gaming = THEMES.find((t) => t.id === 'gaming');
  const pool = (gaming?.cards ?? []).filter((c) => subthemeById(c.subthemeId)?.group?.id === 'cs' && c.rarity !== 'mythic' && c.file);
  const same = pool.filter((c) => c.subthemeId === catalogEntry(k.card.id)?.subthemeId);
  const pick = () => {
    const src = same.length > 8 && k.rand() < 0.5 ? same : pool;
    return src[Math.floor(k.rand() * src.length)];
  };
  const TW = Math.min(u * 30, 150);
  const GAP = u * 2;
  const N = 34;
  const TARGET = 29;
  const band = el('div', '', `position:absolute;left:0;top:50%;height:${TW * 1.1}px;display:flex;gap:${GAP}px;will-change:transform;`);
  pin(band, 0, -50);
  for (let i = 0; i < N; i++) {
    const tile = el('div', '', `position:relative;flex:0 0 ${TW}px;height:100%;border-radius:${u}px;background:linear-gradient(180deg,#1c1d22,#101115);overflow:hidden;`, band);
    if (i === TARGET) {
      tile.style.background = `conic-gradient(from 200deg, ${RAINBOW.join(',')}, ${RAINBOW[0]})`;
      el('div', '', `position:absolute;inset:2px;border-radius:${u - 1}px;background:radial-gradient(circle at 50% 40%,#2a2a32,#0c0c10);`, tile);
      el('div', 'mp-mono mp-rainbow', `position:absolute;left:0;right:0;top:44%;text-align:center;font-size:${u * 2.4}px;letter-spacing:.2em;`, tile).textContent = '★★★★★★';
      continue;
    }
    const e = pick();
    const rr = rarity(e?.rarity ?? 'common');
    if (e) {
      const img = el('img', '', 'position:absolute;inset:8% 6% 18%;width:88%;height:74%;object-fit:contain;filter:drop-shadow(0 4px 8px #000);', tile);
      img.decoding = 'async';
      img.src = thumbUrl(e);
      img.alt = '';
    }
    el('div', '', `position:absolute;left:0;right:0;bottom:0;height:${u * 1.2}px;background:${rr.hex};box-shadow:0 0 ${u * 3}px ${rr.hex};`, tile);
    el('div', '', `position:absolute;inset:0;background:linear-gradient(0deg,${rr.hex}33,transparent 40%);`, tile);
  }
  // repère central + voiles sur les bords
  el('div', '', `position:absolute;left:50%;top:calc(50% - ${TW * 0.7}px);width:2px;height:${TW * 1.4}px;margin-left:-1px;background:#fff;box-shadow:0 0 10px #fff;z-index:2;`);
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(90deg,#000 0%,transparent 22%,transparent 78%,#000 100%);z-index:1;pointer-events:none;');
  const step = TW + GAP;
  const x0 = k.w / 2 - TW / 2 + step * 2;
  // l'arrêt : un peu à côté du centre de la case (comme une vraie roue), puis le recalage
  const off = (k.rand() - 0.5) * TW * 0.6;
  const xEnd = k.w / 2 - TW / 2 - TARGET * step + off;
  tl.set(band, { x: x0 }, 0);
  tl.fromTo(band, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0);
  tl.to(band, { x: xEnd, duration: 2.0, ease: 'power4.out' }, 0.05);
  tl.to(band, { x: xEnd - off, duration: 0.25, ease: 'power2.inOut' }, 2.08);
  // tic à chaque case qui passe le repère
  let lastIdx = -1;
  k.loop(() => {
    const x = Number(k.gsap.getProperty(band, 'x'));
    const idx = Math.floor((k.w / 2 - x) / step);
    if (lastIdx >= 0 && idx !== lastIdx) {
      sfx.tick(1 + Math.min(1, idx / N) * 0.4, 0.16);
      k.haptic(4);
    }
    lastIdx = idx;
  });
  const win = band.children[TARGET] as HTMLElement;
  tl.to(win, { scale: 1.12, boxShadow: '0 0 60px rgba(255,255,255,.6)', duration: 0.3, ease: 'back.out(2)' }, 2.3);
  k.at(2.32, () => {
    sfx.hit(0.5, 60);
    sfx.note(7, 0.12, 0.8);
  });
  tl.to(win, { scale: 3, opacity: 0, duration: 0.25, ease: 'power3.in' }, 2.65);
  tl.to({}, { duration: 0.01 }, 2.9);
}
