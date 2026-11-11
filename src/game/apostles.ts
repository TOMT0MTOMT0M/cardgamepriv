/**
 * APÔTRES (Éclipse Berserk, 11/11) : silhouettes de créatures démoniaques GÉNÉRIQUES, inventées pour le jeu — aucune
 * ne reprend un personnage de la série. Elles se tiennent sur la crête de l'horizon, à contre-jour du ciel cramoisi,
 * dans l'ambiance de l'ouverture (scenes/opening.ts : bande cuite une fois dans une petite texture, lue par le shader
 * du ciel, reflet dans le lac compris) et dans la scène 6★ de la visionneuse (mythic/scenes/eclipse.ts : même dessin).
 *
 * Six archétypes : le voûté (bête courbée, échine hérissée), l'échassier (haut, jambes à genoux inversés), le ramé
 * (torse massif, bois asymétriques), l'arachnéen (corps porté par six pattes), le dressé (anneaux au sol, long cou à
 * crête) et la masse (amas d'où sortent des tentacules). Noir sur noir : pas d'yeux, pas de détail, rien que la forme.
 */
export type ApostleKind = 'voute' | 'echassier' | 'rame' | 'arachneen' | 'dresse' | 'masse';

/**
 * Place de chaque silhouette : `x` en hauteurs d'écran depuis le centre (un téléphone en portrait voit ±0,23, un écran
 * large ±0,9), `h` : hauteur en hauteurs d'écran, `f` : tournée vers la gauche (-1) ou la droite (1).
 * Le centre reste dégagé (le soleil noir et la carte) ; au plus près, trois ou quatre figures visibles sur téléphone.
 */
export const APOSTLES: Array<{ k: ApostleKind; x: number; h: number; f: 1 | -1 }> = [
  { k: 'masse', x: -0.86, h: 0.05, f: 1 },
  { k: 'echassier', x: -0.62, h: 0.07, f: 1 },
  { k: 'arachneen', x: -0.42, h: 0.04, f: 1 },
  { k: 'rame', x: -0.19, h: 0.055, f: 1 },
  { k: 'voute', x: 0.13, h: 0.036, f: -1 },
  { k: 'echassier', x: 0.215, h: 0.05, f: -1 },
  { k: 'dresse', x: 0.38, h: 0.06, f: -1 },
  { k: 'voute', x: 0.57, h: 0.04, f: 1 },
  { k: 'masse', x: 0.78, h: 0.055, f: -1 },
];

type C = CanvasRenderingContext2D;

/** membre effilé de A à B (largeurs wa → wb), bouts arrondis */
function limb(c: C, ax: number, ay: number, bx: number, by: number, wa: number, wb: number) {
  const dx = bx - ax, dy = by - ay;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  c.beginPath();
  c.moveTo(ax + nx * wa, ay + ny * wa);
  c.lineTo(bx + nx * wb, by + ny * wb);
  c.lineTo(bx - nx * wb, by - ny * wb);
  c.lineTo(ax - nx * wa, ay - ny * wa);
  c.closePath();
  c.fill();
  c.beginPath();
  c.arc(ax, ay, wa, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(bx, by, wb, 0, Math.PI * 2);
  c.fill();
}
/** membre articulé : A → genou → B */
function leg(c: C, pts: number[], w: number[]) {
  for (let i = 0; i + 3 < pts.length; i += 2) limb(c, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], w[i / 2], w[i / 2 + 1]);
}
function blob(c: C, x: number, y: number, rx: number, ry: number, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
}
function spike(c: C, x: number, y: number, ang: number, len: number, w: number) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  c.beginPath();
  c.moveTo(x - sa * w, y + ca * w);
  c.lineTo(x + ca * len, y + sa * len);
  c.lineTo(x + sa * w, y - ca * w);
  c.closePath();
  c.fill();
}

/** Repère : pieds en (0, 0), hauteur 1 vers le haut (y négatif), regard vers +x. */
const SHAPES: Record<ApostleKind, (c: C) => void> = {
  voute(c) {
    blob(c, -0.05, -0.55, 0.62, 0.3, -0.18);
    blob(c, 0.62, -0.38, 0.13, 0.1, 0.3);
    spike(c, 0.7, -0.33, 0.5, 0.22, 0.04); // mâchoire
    leg(c, [0.38, -0.5, 0.62, -0.28, 0.74, 0], [0.09, 0.06, 0.04]); // bras longs jusqu'au sol
    leg(c, [0.2, -0.48, 0.3, -0.22, 0.44, 0], [0.07, 0.05, 0.035]);
    leg(c, [-0.45, -0.45, -0.7, -0.22, -0.55, 0], [0.12, 0.07, 0.045]);
    for (let i = 0; i < 6; i++) spike(c, -0.52 + i * 0.2, -0.78 + Math.abs(i - 2.5) * 0.04, -1.75 + i * 0.12, 0.2 - Math.abs(i - 2.5) * 0.03, 0.05);
  },
  echassier(c) {
    leg(c, [0, -0.56, -0.12, -0.3, 0.02, 0], [0.05, 0.03, 0.025]);
    leg(c, [0.04, -0.56, 0.16, -0.28, 0.06, 0], [0.05, 0.03, 0.025]);
    blob(c, 0.02, -0.7, 0.09, 0.17, 0.1);
    blob(c, 0.12, -0.93, 0.15, 0.045, -0.35); // tête allongée
    leg(c, [0.04, -0.8, 0.24, -0.66, 0.3, -0.42], [0.03, 0.022, 0.016]);
    for (let i = 0; i < 3; i++) spike(c, 0.3, -0.42, 1.2 + i * 0.35, 0.1, 0.012);
    leg(c, [-0.02, -0.8, -0.14, -0.62, -0.12, -0.45], [0.03, 0.02, 0.014]);
  },
  rame(c) {
    leg(c, [-0.1, -0.35, -0.16, -0.18, -0.12, 0], [0.09, 0.07, 0.06]);
    leg(c, [0.1, -0.35, 0.16, -0.18, 0.13, 0], [0.09, 0.07, 0.06]);
    blob(c, 0, -0.52, 0.3, 0.27);
    blob(c, 0.03, -0.8, 0.09, 0.09);
    leg(c, [-0.25, -0.62, -0.36, -0.4, -0.34, -0.2], [0.07, 0.05, 0.04]);
    leg(c, [0.25, -0.62, 0.38, -0.42, 0.42, -0.25], [0.07, 0.05, 0.04]);
    // bois asymétriques : trois andouillers d'un côté, deux de l'autre
    leg(c, [-0.02, -0.86, -0.2, -1.02, -0.38, -1.05], [0.03, 0.022, 0.012]);
    spike(c, -0.2, -1.02, -1.9, 0.16, 0.018);
    spike(c, -0.3, -1.04, -2.3, 0.12, 0.014);
    leg(c, [0.08, -0.86, 0.22, -0.98, 0.3, -1.12], [0.03, 0.02, 0.012]);
    spike(c, 0.22, -0.98, -0.4, 0.13, 0.016);
  },
  arachneen(c) {
    blob(c, 0, -0.62, 0.24, 0.15, -0.1);
    blob(c, 0.27, -0.68, 0.09, 0.07);
    const knees = [0.7, 0.42, 0.16];
    for (let i = 0; i < 3; i++) {
      leg(c, [0.05 + i * 0.03, -0.62, knees[i], -0.95 + i * 0.06, 0.55 + i * 0.25, 0], [0.04, 0.025, 0.012]);
      leg(c, [-0.05 - i * 0.03, -0.62, -knees[i], -0.95 + i * 0.06, -0.55 - i * 0.25, 0], [0.04, 0.025, 0.012]);
    }
  },
  dresse(c) {
    blob(c, 0, -0.08, 0.42, 0.09);
    blob(c, -0.08, -0.17, 0.3, 0.08);
    // cou dressé, fait de segments qui s'affinent
    const P = [0.12, -0.18, 0.2, -0.42, 0.1, -0.66, -0.04, -0.84, 0.02, -0.98];
    leg(c, P, [0.11, 0.09, 0.07, 0.055, 0.05]);
    blob(c, 0.1, -1.0, 0.13, 0.055, 0.2);
    spike(c, 0.16, -0.98, 0.35, 0.14, 0.03); // museau
    const back = [0.13, 0.09, 0.03, -0.05, -0.08]; // dos du cou (côté opposé au regard)
    for (let i = 0; i < 5; i++) spike(c, back[i], -0.5 - i * 0.11, Math.PI + 0.35, 0.14 - i * 0.012, 0.03); // crête dorsale
  },
  masse(c) {
    blob(c, 0, -0.3, 0.42, 0.3);
    blob(c, -0.2, -0.22, 0.3, 0.22);
    blob(c, 0.22, -0.2, 0.28, 0.2);
    const T = [
      [-0.3, -0.45, -0.55, -0.75, -0.5, -1.0],
      [-0.1, -0.55, -0.2, -0.85, -0.05, -1.1],
      [0.08, -0.55, 0.2, -0.8, 0.12, -0.98],
      [0.25, -0.45, 0.5, -0.65, 0.62, -0.86],
      [0.35, -0.3, 0.62, -0.38, 0.75, -0.55],
    ];
    for (const t of T) leg(c, t, [0.05, 0.03, 0.01]);
  },
};

/** Dessine une silhouette : pieds en (x, y) (pixels), hauteur `h` (pixels), tournée selon `f`. Remplissage : couleur courante. */
export function drawApostle(c: C, k: ApostleKind, x: number, y: number, h: number, f: 1 | -1 = 1) {
  c.save();
  c.translate(x, y);
  c.scale(h * f, h);
  SHAPES[k](c); // chaque pièce est remplie à part : les recouvrements s'additionnent (pas de trou de sens de tracé)
  c.restore();
}

/**
 * Bande des apôtres pour le shader du ciel : `span` hauteurs d'écran de large, centrée ; `band` hauteurs d'écran de
 * haut ; pieds sur la ligne du bas. Alpha = silhouette. `pxPerH` : pixels par hauteur d'écran.
 */
export function apostleStrip(span: number, band: number, pxPerH: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = Math.round(span * pxPerH);
  cv.height = Math.round(band * pxPerH);
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff';
  // les pieds dépassent un peu sous la ligne du bas : ils s'enfoncent dans la crête au lieu d'y flotter
  const base = cv.height - 1;
  for (const a of APOSTLES) drawApostle(c, a.k, (a.x / span + 0.5) * cv.width, base + a.h * pxPerH * 0.06, a.h * pxPerH, a.f);
  return cv;
}
