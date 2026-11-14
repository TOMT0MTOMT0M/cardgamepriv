import { tData } from '../../i18n';
import { alpha, linear } from '../canvas';
import { setInfo } from '../../cardData';
import { type CardDesign, type DesignCtx, FONT_MONO, FONT_TITLE, H, TAU, W, eightStar, fitFont, grainAtop, spaced } from './common';
import { BEBOU_COLORS as C } from '../portraitSubject';

/**
 * Gabarit des cartes SECRÈTES « Les Bébous » : la photo occupe toute la carte, double filet or rose,
 * et à la place des étoiles le **sceau des huit** (étoile à 8 branches, une par membre du groupe).
 * En bas, le surnom en grand, puis « LES BÉBOUS · 03/08 ». Rien d'autre : nom + image + rareté.
 *
 * Masques : R = foil (filets, sceau, coins, surnom), G = relief, B = index d'« étoile » (le sceau = 1)
 * → les expériences qui allument les étoiles une à une allument le sceau.
 */
const SEAL_Y = 104, SEAL_R = 40;

function roundedFrame(g: CanvasRenderingContext2D, inset: number, r: number, W: number, H: number) {
  g.beginPath();
  g.roundRect(inset, inset, W - 2 * inset, H - 2 * inset, r);
}

function seal(g: CanvasRenderingContext2D, fill: string, ring: string, glow: boolean, SEAL: { x: number; y: number; r: number }) {
  g.save();
  if (glow) {
    g.shadowColor = alpha(C.light, 0.9);
    g.shadowBlur = 26;
  }
  g.strokeStyle = ring;
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(SEAL.x, SEAL.y, SEAL.r + 12, 0, TAU);
  g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  g.arc(SEAL.x, SEAL.y, SEAL.r + 18, 0, TAU);
  g.stroke();
  g.fillStyle = fill;
  g.beginPath();
  eightStar(g, SEAL.x, SEAL.y, SEAL.r, SEAL.r * 0.38);
  g.fill();
  g.restore();
}

/**
 * Le gabarit Bébou peint dans un rectangle W×H quelconque : la carte portrait (768×1072) ou, depuis le 11/11, la carte
 * HORIZONTALE (1072×768, KCDQ Teto) — mêmes éléments, mêmes marges, ancrés en haut (sceau) et en bas (surnom).
 */
export function paintBebouFrame(f: CanvasRenderingContext2D, m: CanvasRenderingContext2D, d: DesignCtx, W: number, H: number) {
  const SEAL = { x: W / 2, y: SEAL_Y, r: SEAL_R };
  const { card } = d;
  const { size } = setInfo(card);
  // voiles de lisibilité (haut pour le sceau, bas pour le surnom) — le reste du cadre est transparent
  f.fillStyle = linear(f, 0, 0, 0, 230, [[0, alpha(C.deep, 0.78)], [1, alpha(C.deep, 0)]]);
  f.fillRect(0, 0, W, 230);
  f.fillStyle = linear(f, 0, H - 372, 0, H, [[0, alpha(C.deep, 0)], [0.45, alpha(C.deep, 0.62)], [1, alpha(C.deep, 0.95)]]);
  f.fillRect(0, H - 372, W, 372);

  // double filet or rose + petites étoiles dans les coins
  f.strokeStyle = C.rose;
  f.lineWidth = 3;
  roundedFrame(f, 18, 26, W, H);
  f.stroke();
  f.strokeStyle = alpha(C.light, 0.7);
  f.lineWidth = 1;
  roundedFrame(f, 30, 18, W, H);
  f.stroke();
  const corners: Array<[number, number]> = [[52, 52], [W - 52, 52], [52, H - 52], [W - 52, H - 52]];
  f.fillStyle = C.rose;
  for (const [x, y] of corners) {
    f.beginPath();
    eightStar(f, x, y, 9, 3.4);
    f.fill();
  }

  // le sceau des huit (remplace les étoiles)
  seal(f, C.rose, C.light, true, SEAL);
  f.font = `600 30px ${FONT_MONO}`; // (audit 06/11) lisible sur téléphone
  f.fillStyle = alpha(C.cream, 0.9);
  if (!d.mini) spaced(f, tData('bb.secretCard', 'CARTE SECRÈTE'), W / 2, 198, 4, 'center'); // i18n-ok

  // filet + surnom + numéro
  f.strokeStyle = alpha(C.rose, 0.8);
  f.lineWidth = 1.5;
  f.beginPath();
  f.moveTo(150, H - 188);
  f.lineTo(W / 2 - 22, H - 188);
  f.moveTo(W / 2 + 22, H - 188);
  f.lineTo(W - 150, H - 188);
  f.stroke();
  f.fillStyle = C.rose;
  f.beginPath();
  eightStar(f, W / 2, H - 188, 11, 4);
  f.fill();
  const nameFont = `italic 500 {s}px ${FONT_TITLE}`;
  const ns = fitFont(f, card.name, nameFont, 76, W - 130, 30);
  f.save();
  f.textAlign = 'center';
  f.shadowColor = alpha(C.rose, 0.85);
  f.shadowBlur = 22;
  f.fillStyle = C.cream;
  f.fillText(card.name, W / 2, H - 100);
  f.restore();
  f.font = `500 30px ${FONT_MONO}`;
  f.fillStyle = alpha(C.light, 0.85);
  spaced(f, d.mini ? String(card.num).padStart(2, '0') : `${card.set === 'kcdq' ? 'KCDQ' : tData('bb.theBebous', 'LES BÉBOUS')} · ${String(card.num).padStart(2, '0')}/${String(size).padStart(2, '0')}`, W / 2, H - 50, 3, 'center'); // i18n-ok
  grainAtop(f, card.seed, 0.07, 24);

  // ── masques (composite 'lighter')
  m.strokeStyle = m.fillStyle = 'rgb(255,0,0)';
  m.lineWidth = 6;
  roundedFrame(m, 18, 26, W, H);
  m.stroke();
  m.lineWidth = 2;
  roundedFrame(m, 30, 18, W, H);
  m.stroke();
  for (const [x, y] of corners) {
    m.beginPath();
    eightStar(m, x, y, 10, 4);
    m.fill();
  }
  seal(m, 'rgb(255,0,0)', 'rgb(255,0,0)', false, SEAL);
  m.save();
  m.textAlign = 'center';
  m.font = nameFont.replace('{s}', String(ns));
  m.fillText(card.name, W / 2, H - 100);
  m.restore();
  // relief
  m.save();
  m.strokeStyle = m.fillStyle = 'rgb(0,220,0)';
  m.filter = 'blur(1.2px)';
  m.lineWidth = 3;
  roundedFrame(m, 18, 26, W, H);
  m.stroke();
  seal(m, 'rgb(0,220,0)', 'rgb(0,220,0)', false, SEAL);
  m.textAlign = 'center';
  m.font = nameFont.replace('{s}', String(ns));
  m.fillText(card.name, W / 2, H - 100);
  m.restore();
  // index d'allumage : le sceau compte comme l'étoile n°1
  m.fillStyle = 'rgb(0,0,32)';
  m.beginPath();
  m.arc(SEAL.x, SEAL.y, SEAL.r + 20, 0, TAU);
  m.fill();
}

export const bebou: CardDesign = {
  id: 'bebou',
  title: 'Bébou (secret)', // i18n-ok (labo)
  // pas de recadrage : le sujet portrait est déjà composé pour la carte entière
  art: { k: 1, to: [384, 379] },
  paint(f, m, d) {
    paintBebouFrame(f, m, d, W, H);
  },
};
