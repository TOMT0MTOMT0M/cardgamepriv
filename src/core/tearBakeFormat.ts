/**
 * Format des enregistrements de déchirure (`public/bake/tear-N.tear`, écrits par scripts/bake-tear/bake.mts, lus par
 * core/tearBake.ts). Pur : aucun DOM, aucun three.js.
 *
 * Fichier (gzip) : « TEAR » · u32 longueur de l'en-tête · en-tête JSON · bourrage à 4 octets · positions de repos
 * (float32 × 3 × verts) · images : int16, pour chaque image 3 plans (x de tous les sommets, puis y, puis z), chaque
 * valeur = (position − repos) / q MOINS celle de l'image précédente (la première : moins zéro).
 * Images : `nTear` pour la déchirure (progression 0..1, pas régulier), puis `nExit` pour la sortie (temps, `exitFps`).
 */
export const TEAR_BAKE_FORMAT = 1;
export interface TearBakeSheet {
  part: 'body' | 'strip';
  /** +1 face avant, −1 dos */
  side: 1 | -1;
  /** rangées (la grille a `nx` colonnes) */
  ny: number;
  /** y de repos de chaque rangée */
  ys: number[];
  /** premier sommet de la nappe */
  base: number;
}
export interface TearBakeHeader {
  format: number;
  seed: number;
  index: number;
  q: number;
  nx: number;
  sheets: TearBakeSheet[];
  verts: number;
  nTear: number;
  nExit: number;
  exitFps: number;
  /** temps de sortie (s) après lequel la bande arrachée n'est plus montrée */
  stripHide: number;
  tearV: number;
  delta: number;
}
