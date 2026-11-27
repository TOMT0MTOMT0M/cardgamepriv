/**
 * Format des enregistrements de déchirure (`public/bake/tear-N.tear`, écrits par scripts/bake-tear/bake.mts, lus par
 * core/tearBake.ts). Pur : aucun DOM, aucun three.js.
 *
 * Fichier (gzip) : « TEAR » · u32 longueur de l'en-tête · en-tête JSON · bourrage à 4 octets · positions de repos
 * (float32 × 3 × verts) · images : int16, pour chaque image 3 plans (x de tous les sommets, puis y, puis z), chaque
 * valeur = (position − repos) / q (qStrip pour la bande) MOINS celle de l'image précédente (la première : moins zéro).
 * Images : `nTear` pour la déchirure (progression 0..1, pas régulier), puis `nExit` pour la sortie (temps, `exitFps`).
 *
 * (27/11, Retroussé) Même format pour `public/bake/retrousse-N.tear` (scripts/bake-tear/retrousse.mts) : nappes `body`
 * seules (aucune bande), `qStrip = q`. Les champs facultatifs de fin d'en-tête ne sont écrits que par le Retroussé ;
 * absents, le fichier est une déchirure (les fichiers `tear-*` restent lisibles tels quels).
 */
export const TEAR_BAKE_FORMAT = 2;
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
export type TearBakeScenario = 'tear' | 'retrousse';
/**
 * Rupture enregistrée (Retroussé) : `lock` = premier paquet de la soudure du haut (le verrou), `top` = paquets
 * suivants, `side` = un cran d'une soudure latérale, `land` = FIN DU LÂCHER (sortie) : les pinces ont fini de lâcher,
 * à durée fixe (`t` = 0,15 s, GRIPREL de la cuisson). Ce n'est PAS une chute : la cuisson n'a pas de gravité en sortie
 * (elle déroulait le pli), `f` y mesure le pic de vitesse du revers pendant le lâcher. `p` : progression de la phase
 * pilotée ; `t` : secondes de la sortie. `x` : −1 gauche, 0 centre, +1 droite. `y` : y de repos de la rupture.
 * `f` : intensité 0..1 (relative : écart avant / dos des liens rompus, rapporté au plus grand du même type).
 */
export interface TearBakeEvent {
  k: 'lock' | 'top' | 'side' | 'land';
  p?: number;
  t?: number;
  x: -1 | 0 | 1;
  y: number;
  f: number;
}
/**
 * Charnière du Retroussé : y de départ `y0`, y final `yE`, fin de la rupture du haut `pTop`, rayon du pli `r`, et y de
 * la charnière à chaque image de la phase pilotée (`yF.length === nTear`) — sert à interpoler dans le repère de la
 * charnière (core/bakeInterp.ts).
 */
export interface TearBakeFold {
  y0: number;
  yE: number;
  pTop: number;
  r: number;
  yF: number[];
}
export interface TearBakeHeader {
  format: number;
  seed: number;
  index: number;
  /** pas de quantification du corps */
  q: number;
  /** pas de quantification de la bande arrachée (elle vole loin : plage plus grande) */
  qStrip: number;
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
  /** absent = 'tear' */
  scenario?: TearBakeScenario;
  events?: TearBakeEvent[];
  fold?: TearBakeFold;
}

export interface TearBake {
  header: TearBakeHeader;
  rest: Float32Array;
  /** images : (position − repos) / q, absolues, [image][sommet × 3] */
  frames: Int16Array;
}

/** Décode un fichier décompressé (null si ce n'est pas un enregistrement de ce format). */
export function decode(buf: Uint8Array): TearBake | null {
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'TEAR') return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const hl = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + hl))) as TearBakeHeader;
  if (header.format !== TEAR_BAKE_FORMAT) return null;
  let o = 8 + hl;
  o += (4 - (o % 4)) % 4;
  const n = header.verts;
  // copie alignée (le tampon décompressé peut ne pas l'être)
  const rest = new Float32Array(buf.slice(o, o + n * 12).buffer);
  o += n * 12;
  const F = header.nTear + header.nExit;
  const deltas = new Int16Array(buf.slice(o, o + F * n * 6).buffer);
  // écarts → valeurs absolues, et plans x / y / z → entrelacés
  const frames = new Int16Array(F * n * 3);
  const acc = new Int32Array(n * 3);
  for (let f = 0; f < F; f++) {
    const src = f * n * 3;
    for (let a = 0; a < 3; a++)
      for (let v = 0; v < n; v++) {
        const k = v * 3 + a;
        acc[k] += deltas[src + a * n + v];
        frames[src + k] = acc[k];
      }
  }
  return { header, rest, frames };
}
