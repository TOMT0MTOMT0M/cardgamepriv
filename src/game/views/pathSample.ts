/**
 * (V2 fluidité, 11/11) Échantillonnage d'un tracé SVG SANS le DOM : `getPointAtLength` repart du début du tracé à chaque
 * appel (≈ 1 s de calcul à l'entrée de la page Jeux sur un téléphone moyen, pour les ~900 points des trois dessins).
 * Ici : le tracé est découpé une fois en petits segments (courbes et arcs subdivisés finement), puis rééchantillonné à
 * pas constant le long de sa longueur — mêmes points à une fraction de pixel près, en quelques dixièmes de ms.
 *
 * Commandes prises en charge : M L H V Q C A Z (absolues), celles des dessins de gridArt.ts. Comme en SVG, un « M » au
 * milieu du tracé ne compte pas dans la longueur : le point saute (gridArt y voit une coupure).
 */
const TAU = Math.PI * 2;

/** polyligne du tracé : coordonnées et longueur cumulée (un saut « M » n'ajoute rien) */
function polyline(d: string): { x: number[]; y: number[]; s: number[] } {
  const tok = d.match(/[MLHVQCAZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const X: number[] = [], Y: number[] = [], S: number[] = [];
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, len = 0;
  const num = () => Number(tok[i++]);
  const push = (x: number, y: number, jump = false) => {
    if (X.length && !jump) len += Math.hypot(x - X[X.length - 1], y - Y[Y.length - 1]);
    X.push(x);
    Y.push(y);
    S.push(len);
    cx = x;
    cy = y;
  };
  const curve = (f: (t: number) => [number, number], steps: number) => {
    for (let k = 1; k <= steps; k++) {
      const [x, y] = f(k / steps);
      push(x, y);
    }
  };
  while (i < tok.length) {
    if (/^[a-z]$/i.test(tok[i])) cmd = tok[i++].toUpperCase();
    switch (cmd) {
      case 'M': {
        const x = num(), y = num();
        push(x, y, true);
        sx = x;
        sy = y;
        cmd = 'L'; // des coordonnées qui suivent un M sont des L
        break;
      }
      case 'L':
        push(num(), num());
        break;
      case 'H':
        push(num(), cy);
        break;
      case 'V':
        push(cx, num());
        break;
      case 'Z':
        push(sx, sy);
        break;
      case 'Q': {
        const x0 = cx, y0 = cy, x1 = num(), y1 = num(), x2 = num(), y2 = num();
        curve((t) => {
          const u = 1 - t;
          return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2];
        }, 32);
        break;
      }
      case 'C': {
        const x0 = cx, y0 = cy, x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
        curve((t) => {
          const u = 1 - t;
          return [u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3];
        }, 48);
        break;
      }
      case 'A': {
        // paramétrage par les extrémités → centre (SVG 1.1, annexe F.6.5)
        let rx = Math.abs(num()), ry = Math.abs(num());
        const phi = (num() * Math.PI) / 180, large = num() !== 0, sweep = num() !== 0, x2 = num(), y2 = num();
        const x1 = cx, y1 = cy;
        if (!rx || !ry || (x1 === x2 && y1 === y2)) {
          push(x2, y2);
          break;
        }
        const cp = Math.cos(phi), sp = Math.sin(phi);
        const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
        const xp = cp * dx + sp * dy, yp = -sp * dx + cp * dy;
        const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
        if (lam > 1) (rx *= Math.sqrt(lam)), (ry *= Math.sqrt(lam));
        const num2 = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
        const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / (rx * rx * yp * yp + ry * ry * xp * xp)));
        const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
        const ccx = cp * cxp - sp * cyp + (x1 + x2) / 2, ccy = sp * cxp + cp * cyp + (y1 + y2) / 2;
        const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
        let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
        if (!sweep && dt > 0) dt -= TAU;
        else if (sweep && dt < 0) dt += TAU;
        const steps = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 90))); // un segment par 2°
        curve((t) => {
          const a = t1 + dt * t;
          const ex = rx * Math.cos(a), ey = ry * Math.sin(a);
          return [cp * ex - sp * ey + ccx, sp * ex + cp * ey + ccy];
        }, steps);
        break;
      }
      default:
        i++; // commande inconnue : on avance (aucun dessin du jeu n'en a)
    }
  }
  return { x: X, y: Y, s: S };
}

/** longueur du tracé (comme `getTotalLength`) et `n` points à pas constant le long de lui (comme `getPointAtLength`) */
export function samplePath(d: string, n: number): { L: number; x: Float64Array; y: Float64Array } {
  const p = polyline(d);
  const L = p.s.length ? p.s[p.s.length - 1] : 0;
  const x = new Float64Array(n), y = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (L * i) / Math.max(1, n - 1);
    // segment [j, j+1] qui contient s (le premier : un saut « M » a une longueur nulle, on reste avant lui)
    while (j < p.s.length - 2 && p.s[j + 1] < s) j++;
    if (j + 1 >= p.s.length) {
      x[i] = p.x[j] ?? 0;
      y[i] = p.y[j] ?? 0;
      continue;
    }
    const a = p.s[j], b = p.s[j + 1];
    const f = b > a ? Math.min(1, Math.max(0, (s - a) / (b - a))) : 1;
    x[i] = p.x[j] + (p.x[j + 1] - p.x[j]) * f;
    y[i] = p.y[j] + (p.y[j + 1] - p.y[j]) * f;
  }
  return { L, x, y };
}

/** longueur seule (version légère pour savoir combien de points demander) */
export const pathLength = (d: string) => {
  const s = polyline(d).s;
  return s.length ? s[s.length - 1] : 0;
};
