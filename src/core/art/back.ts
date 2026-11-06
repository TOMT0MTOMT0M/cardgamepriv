import { type Ctx, alpha, applyGrain, radial, roundRect } from './canvas';
import { BASE_H, BASE_W } from './subjects';
import { FONT_MONO, FONT_TITLE } from './frame';

const TAU = Math.PI * 2;

export interface BackStyle {
  ground: string;
  line: string;
  accent: string;
  /** mention du bas (défaut « B É B O U ») — le jeu y met le thème de la carte */
  label?: string;
}

export const DEFAULT_BACK: BackStyle = { ground: '#17130f', line: '#c9a86a', accent: '#efe3c4' };
/**
 * (retours 06/11) DOS ALUMINIUM : brossé, premium, « no brand ». `ground` = teinte de l'alliage (le thème ne fait
 * qu'une nuance : gris neutre, légèrement violacé pour Gaming…), `line` = nuance des arêtes de gravure.
 */
export const ALU_BACK: BackStyle = { ground: '#c3c6cc', line: '#f6f7f9', accent: '#2a2c30' };

/** Rosace guillochée (hypotrochoïde) — motif de dos façon billet. */
function guilloche(g: Ctx, cx: number, cy: number, R: number, r: number, d: number, turns: number, steps = 2400) {
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * TAU * turns;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    if (i === 0) g.moveTo(cx + x, cy + y);
    else g.lineTo(cx + x, cy + y);
  }
}

/**
 * (07/11) Marque du dos : `fraisage` = une seule empreinte d'usinage au centre (lamage circulaire tourné : stries
 * concentriques, reflet qui tourne avec la lumière), sans lettre ni logo ; `aucune` = plaque nue (filets du bord seuls).
 */
export const BACK_MARK: 'fraisage' | 'aucune' = 'fraisage';
/** rayon du lamage (coordonnées de la carte, 768 × 1072) */
export const BACK_SPOT_R = 112;

/**
 * DOS ACIER BROSSÉ — (07/11) « no brand » strict : plus AUCUNE écriture (thème, millésime, « BÉBOU · CARTES »), plus de
 * vis dans les coins, plus de monogramme « B » (il faisait autocollant). Restent : la plaque brossée VERTICALEMENT, son
 * chanfrein, les deux filets gravés qui suivent le bord, et (BACK_MARK) un lamage usiné au centre — l'objet dit
 * « usiné », pas « imprimé ». Masques : R = gravure (creux, mat), G = relief, B = lamage (le matériau y fait tourner
 * l'anisotropie : stries concentriques au lieu des stries verticales).
 */
export function paintBack(back: Ctx, masks: Ctx, style: BackStyle = ALU_BACK) {
  const cx = BASE_W / 2, cy = BASE_H / 2;
  const px = back.getTransform().a || 1;
  // ── plaque : teinte de l'alliage + reflet large (le vrai reflet vient du matériau ; ici une base douce)
  back.fillStyle = style.ground;
  back.fillRect(0, 0, BASE_W, BASE_H);
  back.fillStyle = (() => {
    const g = back.createLinearGradient(0, 0, BASE_W, BASE_H);
    g.addColorStop(0, alpha('#ffffff', 0.16));
    g.addColorStop(0.38, alpha('#ffffff', 0));
    g.addColorStop(0.62, alpha('#000000', 0.1));
    g.addColorStop(1, alpha('#ffffff', 0.08));
    return g;
  })();
  back.fillRect(0, 0, BASE_W, BASE_H);
  // ── brossage VERTICAL : stries fines le long de la hauteur, intensité et longueur aléatoires (déterministes)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x < BASE_W; x += 1) {
    const v = rnd();
    const a = v > 0.5 ? (v - 0.5) * 0.26 : 0;
    const d = v < 0.5 ? (0.5 - v) * 0.28 : 0;
    if (a) { back.fillStyle = alpha('#ffffff', a); back.fillRect(x, 0, 1, BASE_H); }
    if (d) { back.fillStyle = alpha('#000000', d); back.fillRect(x, 0, 1, BASE_H); }
    if (rnd() < 0.05) { const y0 = rnd() * BASE_H, h = 80 + rnd() * 420; back.fillStyle = alpha(rnd() < 0.5 ? '#fff' : '#000', 0.2); back.fillRect(x, y0, 1, h); }
  }
  for (let k = 0; k < 9; k++) {
    const x0 = rnd() * BASE_W, w = 40 + rnd() * 120;
    back.fillStyle = alpha(rnd() < 0.5 ? '#fff' : '#000', 0.04 + rnd() * 0.05);
    back.fillRect(x0, 0, w, BASE_H);
  }
  // bords de la plaque : léger chanfrein clair
  back.strokeStyle = alpha('#ffffff', 0.35);
  back.lineWidth = 2;
  roundRect(back, 3, 3, BASE_W - 6, BASE_H - 6, 30);
  back.stroke();

  masks.fillStyle = '#000';
  masks.fillRect(0, 0, BASE_W, BASE_H);

  // ── gravure CNC : une forme = fond sombre mat, ombre en haut-gauche, arête lumineuse en bas-droite
  const engrave = (draw: (g: Ctx) => void, depth = 1) => {
    back.save();
    back.translate(-1.2 * depth, -1.2 * depth);
    back.fillStyle = back.strokeStyle = alpha('#000000', 0.55);
    draw(back);
    back.restore();
    back.save();
    back.translate(1.1 * depth, 1.1 * depth);
    back.fillStyle = back.strokeStyle = alpha(style.line, 0.9);
    draw(back);
    back.restore();
    back.save();
    back.fillStyle = back.strokeStyle = mixHex(style.ground, '#000000', 0.42);
    draw(back);
    back.restore();
    masks.save();
    masks.globalCompositeOperation = 'lighter';
    masks.fillStyle = masks.strokeStyle = 'rgb(255,0,0)';
    draw(masks);
    masks.filter = `blur(${0.8 * px}px)`;
    masks.fillStyle = masks.strokeStyle = 'rgb(0,255,0)';
    draw(masks);
    masks.restore();
  };
  // filet gravé qui suit le bord, et un second plus fin
  engrave((g) => { g.lineWidth = 3; roundRect(g, 30, 30, BASE_W - 60, BASE_H - 60, 24); g.stroke(); }, 0.8);
  engrave((g) => { g.lineWidth = 1.2; roundRect(g, 42, 42, BASE_W - 84, BASE_H - 84, 18); g.stroke(); }, 0.5);

  if (BACK_MARK === 'fraisage') {
    const R = BACK_SPOT_R;
    // ── lamage : face usinée au tour, plus claire et plus fine que la plaque brossée (le brossage s'arrête net au bord)
    back.save();
    back.beginPath();
    back.arc(cx, cy, R, 0, TAU);
    back.clip();
    back.fillStyle = mixHex(style.ground, '#ffffff', 0.12);
    back.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // stries de tournage : anneaux très fins, d'intensité irrégulière (pas d'outil), un peu plus marqués vers le bord
    let sd = 11;
    const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    back.lineWidth = 0.9;
    for (let r = 3; r < R; r += 1.6) {
      const v = rn();
      const k = 0.35 + 0.65 * (r / R);
      back.strokeStyle = v > 0.5 ? alpha('#ffffff', (v - 0.5) * 0.22 * k) : alpha('#000000', (0.5 - v) * 0.2 * k);
      back.beginPath();
      back.arc(cx, cy, r, 0, TAU);
      back.stroke();
    }
    // point de centrage (le centre de la passe d'outil)
    back.fillStyle = alpha('#000000', 0.35);
    back.beginPath();
    back.arc(cx, cy, 1.6, 0, TAU);
    back.fill();
    back.restore();
    // paroi du lamage (en creux) : ombre en haut-gauche, arête vive en bas-droite, comme les gravures
    engrave((g) => { g.lineWidth = 2.4; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke(); }, 0.9);
    // masques : B = lamage (anisotropie concentrique), G = stries très fines en relief (elles accrochent la lumière)
    masks.save();
    masks.globalCompositeOperation = 'lighter';
    masks.fillStyle = 'rgb(0,0,255)';
    masks.beginPath();
    masks.arc(cx, cy, R - 1.5, 0, TAU);
    masks.fill();
    masks.lineWidth = 0.8;
    for (let r = 6; r < R - 3; r += 3.2) {
      masks.strokeStyle = `rgba(0,${18 + Math.round(10 * Math.sin(r * 0.7))},0,1)`;
      masks.beginPath();
      masks.arc(cx, cy, r, 0, TAU);
      masks.stroke();
    }
    masks.restore();
  }
  applyGrain(back, BASE_W, BASE_H, 0.05, 4, 50);
}

/** mélange de deux couleurs #rrggbb (k = part de la 2e) */
function mixHex(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** Ancien dos « papier et or » (rosace guillochée) : gardé pour le labo. */
export function paintPaperBack(back: Ctx, masks: Ctx, style: BackStyle = DEFAULT_BACK) {

  const cx = BASE_W / 2, cy = BASE_H / 2;
  back.fillStyle = style.ground;
  back.fillRect(0, 0, BASE_W, BASE_H);
  back.fillStyle = radial(back, cx, cy, 10, 620, [[0, alpha(style.line, 0.14)], [1, alpha(style.ground, 0)]]);
  back.fillRect(0, 0, BASE_W, BASE_H);
  // trame diagonale fine
  back.save();
  back.strokeStyle = alpha(style.line, 0.07);
  back.lineWidth = 1;
  for (let i = -BASE_H; i < BASE_W + BASE_H; i += 9) {
    back.beginPath();
    back.moveTo(i, 0);
    back.lineTo(i - BASE_H, BASE_H);
    back.stroke();
    back.beginPath();
    back.moveTo(i - BASE_H, 0);
    back.lineTo(i, BASE_H);
    back.stroke();
  }
  back.restore();

  masks.fillStyle = '#000';
  masks.fillRect(0, 0, BASE_W, BASE_H);

  const lines = (g: Ctx, lw: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = 2.2 * lw;
    roundRect(g, 34, 34, BASE_W - 68, BASE_H - 68, 22);
    g.stroke();
    g.lineWidth = 0.8 * lw;
    roundRect(g, 46, 46, BASE_W - 92, BASE_H - 92, 16);
    g.stroke();
    g.lineWidth = 0.7 * lw;
    guilloche(g, cx, cy, 250, 37, 96, 37);
    g.stroke();
    g.lineWidth = 0.6 * lw;
    guilloche(g, cx, cy, 170, 21, 52, 21);
    g.stroke();
    g.lineWidth = 1.4 * lw;
    g.beginPath();
    g.arc(cx, cy, 300, 0, TAU);
    g.stroke();
    g.lineWidth = 0.6 * lw;
    g.beginPath();
    g.arc(cx, cy, 312, 0, TAU);
    g.stroke();
    // frises haut / bas
    for (const yy of [92, BASE_H - 92]) {
      g.beginPath();
      for (let x = 70; x <= BASE_W - 70; x += 2) {
        const y = yy + Math.sin(x * 0.12) * 6 * Math.sin(x * 0.012);
        if (x === 70) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  };
  back.save();
  back.shadowColor = alpha(style.line, 0.4);
  back.shadowBlur = 3;
  lines(back, 1, alpha(style.line, 0.85));
  back.restore();

  // cœur : médaillon rond + « B »
  const core = (g: Ctx, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(cx, cy, 78, 0, TAU);
    g.fill();
  };
  core(back, style.line);
  back.strokeStyle = alpha(style.ground, 0.75);
  back.lineWidth = 2.5;
  back.beginPath();
  back.arc(cx, cy, 66, 0, TAU);
  back.stroke();
  back.fillStyle = style.ground;
  back.font = `700 92px ${FONT_TITLE}`;
  back.textAlign = 'center';
  back.textBaseline = 'middle';
  back.fillText('B', cx + 2, cy + 6);
  back.font = `500 16px ${FONT_MONO}`;
  back.fillStyle = alpha(style.accent, 0.75);
  back.fillText(style.label ?? 'B É B O U', cx, BASE_H - 60);
  back.fillText('· MMXXVI ·', cx, 62);
  back.textAlign = 'left';
  back.textBaseline = 'alphabetic';
  applyGrain(back, BASE_W, BASE_H, 0.1, 5, 60);

  masks.save();
  masks.globalCompositeOperation = 'lighter';
  lines(masks, 1.6, 'rgb(255,0,0)');
  masks.filter = 'blur(1px)';
  lines(masks, 1.4, 'rgb(0,255,0)');
  core(masks, 'rgb(255,255,0)');
  masks.filter = 'blur(6px)';
  core(masks, 'rgb(0,0,255)');
  masks.restore();
}
