/**
 * SKINS CS — « Caisse » : présentation propre au jeu (VERTICALE, pleine largeur : rien du vrai jeu). Des vraies cartes CS
 * plus basses défilent de bas en haut en pile, ralentissent, FAUX ARRÊT sur la voisine, puis le dernier cran tombe sur
 * la carte face cachée à tranche arc-en-ciel — au centre.
 */
import { catalogEntry, subthemeById, thumbPath, THEMES, type CatalogEntry } from '../../../core/sets/themes';
import { siteUrl } from '../../../core/siteRoot';
import { rarity } from '../../../core/rarity';
import { BASE_H, BASE_W } from '../../../core/art/subjects';
import { seeded, type MythicCard, type SceneCtx } from '../kit';

const N = 30;
const TARGET = 26;

/** les cartes CS de la bande, les mêmes à chaque fois pour une carte donnée (et connues AVANT la scène : préchargement) */
function picks(cardId: string): Array<CatalogEntry | undefined> {
  const rand = seeded(`${cardId}/caisse`);
  const gaming = THEMES.find((t) => t.id === 'gaming');
  const pool = (gaming?.cards ?? []).filter((c) => subthemeById(c.subthemeId)?.group?.id === 'cs' && c.rarity !== 'mythic' && c.file);
  const same = pool.filter((c) => c.subthemeId === catalogEntry(cardId)?.subthemeId);
  return Array.from({ length: N }, () => {
    const from = same.length > 8 && rand() < 0.5 ? same : pool;
    return from[Math.floor(rand() * from.length)];
  });
}

/**
 * (10/11) Appelé pendant que le joueur ouvre le booster (index.ts prepareMythic) : les miniatures des dernières cases
 * — celles qu'on a le temps de voir quand la bande ralentit — sont déjà là quand la scène démarre (avant : cases vides
 * sur un téléphone qui ne les avait pas en cache).
 */
export function preload(card: MythicCard): void {
  picks(card.id).forEach((e, i) => {
    if (!e || i < TARGET - 10 || i === TARGET) return;
    const im = new Image();
    im.decoding = 'async';
    im.src = siteUrl(thumbPath(e));
  });
}

export default function caisse(k: SceneCtx) {
  const { tl, u, el, sfx, actor, cw, accent, w, h } = k;
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#07070a,#111116 50%,#07070a);');
  const rows = picks(k.card.id);
  const TH = cw * 0.62;
  const GAP = u * 1.6;
  const step = TH + GAP;
  const band = el('div', '', `position:absolute;left:50%;top:0;width:${cw * 1.9}px;display:flex;flex-direction:column;gap:${GAP}px;will-change:transform;`);
  k.pin(band, -50, 0);
  for (let i = 0; i < N; i++) {
    const row = el('div', '', `position:relative;height:${TH}px;border-radius:${u}px;background:linear-gradient(90deg,#17181d,#0e0e12);overflow:hidden;display:flex;align-items:center;gap:${u * 2}px;padding:0 ${u * 2}px;`, band);
    // (13/11, retours Hugo) la case de la carte est une case comme les autres, marquée MYTHIQUE : la vraie carte (la
    // doublure) se pose à la place de la miniature
    const e = i === TARGET ? undefined : rows[i];
    const rr = rarity(i === TARGET ? 'mythic' : e?.rarity ?? 'common');
    el('div', '', `position:absolute;left:0;top:0;bottom:0;width:${u * 0.8}px;background:${rr.hex};box-shadow:0 0 ${u * 2}px ${rr.hex};`, row);
    if (i === TARGET) el('div', '', `height:82%;aspect-ratio:1;flex:none;`, row);
    else if (e) {
      const img = el('img', '', `height:82%;aspect-ratio:1;object-fit:contain;filter:drop-shadow(0 4px 8px #000);`, row);
      img.decoding = 'async';
      img.onerror = () => img.remove();
      img.src = siteUrl(thumbPath(e));
      img.alt = '';
    }
    const t = el('div', 'mp-label', `position:static;font-size:${u * 1.8}px;color:${rr.hex};opacity:.8;`, row);
    t.textContent = rr.label;
  }
  // repère : deux traits fins de part et d'autre du centre
  for (const s of [-1, 1]) el('div', '', `position:absolute;left:${w / 2 + s * cw * 1.02}px;top:${h / 2 - TH * 0.5}px;width:2px;height:${TH}px;margin-left:-1px;background:${accent};box-shadow:0 0 8px ${accent};z-index:2;`);
  el('div', '', 'position:absolute;inset:0;background:linear-gradient(180deg,#000 0%,transparent 28%,transparent 72%,#000 100%);z-index:1;pointer-events:none;');
  const y0 = h / 2 - TH / 2 + step * 3;
  const yEnd = h / 2 - TH / 2 - TARGET * step;
  tl.set(band, { y: y0 }, 0);
  tl.fromTo(band, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0);
  // défilement, ralentissement, faux arrêt sur la voisine (un cran trop tôt), puis le dernier cran
  tl.to(band, { y: yEnd + step * 0.92, duration: 1.9, ease: 'power4.out' }, 0.05);
  tl.to(band, { y: yEnd + step * 0.82, duration: 0.3, ease: 'power2.inOut' }, 2.0);
  tl.to(band, { y: yEnd, duration: 0.28, ease: 'back.out(1.6)' }, 2.4);
  let lastIdx = -1;
  k.loop(() => {
    const y = Number(k.gsap.getProperty(band, 'y'));
    const idx = Math.floor((h / 2 - y) / step);
    if (lastIdx >= 0 && idx !== lastIdx) {
      sfx.tick(1 + Math.min(1, idx / N) * 0.4, 0.16);
      k.haptic(4);
    }
    lastIdx = idx;
  });
  // la carte voyage avec la bande, dans sa case (à la place de la miniature), puis vient au centre
  const c = actor();
  const sIn = (TH * 0.86) / ((cw * BASE_H) / BASE_W);
  const xIn = -cw * 0.95 + u * 2 + TH * 0.41;
  tl.set(c, { opacity: 1, scale: sIn, x: xIn }, 0);
  k.loop((t) => {
    if (t > 2.7) return;
    const y = Number(k.gsap.getProperty(band, 'y')) + TARGET * step + TH / 2 - h / 2;
    k.gsap.set(c, { y });
  });
  k.at(2.42, () => {
    sfx.hit(0.5, 60);
    sfx.note(7, 0.12, 0.8);
    k.haptic([20, 30]);
  });
  tl.to(band, { opacity: 0, duration: 0.3 }, 2.7);
  tl.to(c, { x: 0, y: 0, scale: 1, duration: 0.5, ease: 'power3.inOut' }, 2.72);
  k.glint(3.1, 0.45);
  tl.to({}, { duration: 0.01 }, 3.6);
}
