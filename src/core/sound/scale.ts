/**
 * La gamme du jeu (charte sonore du 04/11) : SOL MAJEUR PENTATONIQUE (sol la si ré mi). Tout ce qui est musical s'y
 * cale ; seule la 6★ module (+2 demi-tons, la majeur). Module à part : lu par le moteur ET par l'atelier de cuisson.
 */
/** en demi-tons depuis G4 (392 Hz) : sol la si ré mi */
export const PENTA = [0, 2, 4, 7, 9];
export const G4 = 392;
/** fréquence du `deg`-ième degré de la gamme (0 = sol4), transposée de `semis` demi-tons */
export const scaleHz = (deg: number, semis = 0) => G4 * Math.pow(2, (PENTA[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5) + semis) / 12);
/** cale une fréquence sur le degré de la gamme le plus proche (le carillon historique à 392 Hz reste sol4) */
export function quantize(hz: number, semis = 0): number {
  let best = hz, dist = Infinity;
  for (let deg = -10; deg < 20; deg++) {
    const f = scaleHz(deg, semis);
    const d = Math.abs(Math.log2(f / hz));
    if (d < dist) (dist = d), (best = f);
  }
  return best;
}
