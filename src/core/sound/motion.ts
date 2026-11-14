/**
 * SON ↔ MOUVEMENT. Un souffle ne doit pas « accompagner » une animation, il doit en être le bruit : son énergie suit
 * la VITESSE de la courbe d'animation (la dérivée de l'ease), pas le temps qui passe.
 *  - sortie franche (ease-out, EASE.glide) : l'objet part vite → le souffle est fort tout de suite puis s'éteint ;
 *  - départ retenu (ease-in, EASE.heave) : le souffle enfle et se coupe net à l'arrivée (c'est là que tombe l'impact) ;
 *  - aller-retour (in-out) : cloche centrée ; ressort (EASE.settle / snap) : un second petit froissement au rebond.
 * Aucune API du navigateur ici (testable hors ligne).
 */
export type Ease = (t: number) => number;

/** profil par défaut (aucune courbe fournie) : sortie douce, sommet vers 30 % de la durée */
const DEFAULT: Ease = (p) => 1 - Math.pow(1 - p, 2.4);

/**
 * `n` valeurs 0..1 : la vitesse normalisée de la courbe `ease` (valeur absolue : un recul ou un rebond s'entend aussi),
 * légèrement lissée. Premier et dernier points à 0 (fondus : jamais de clic).
 */
export function velocityCurve(ease: Ease | undefined, n = 33): Float32Array {
  const e = ease ?? DEFAULT;
  const v = new Float32Array(n);
  const h = 0.5 / (n - 1);
  let max = 1e-6;
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const a = Math.max(0, p - h), b = Math.min(1, p + h);
    v[i] = Math.abs((e(b) - e(a)) / (b - a));
    if (!Number.isFinite(v[i])) v[i] = 0;
    max = Math.max(max, v[i]);
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (v[Math.max(0, i - 1)] + 2 * v[i] + v[Math.min(n - 1, i + 1)]) / (4 * max);
  out[0] = 0;
  out[n - 1] = 0;
  return out;
}

/** instant (0..1) où la vitesse est maximale : là où le souffle culmine */
export function peakAt(v: Float32Array): number {
  let k = 0;
  for (let i = 1; i < v.length; i++) if (v[i] > v[k]) k = i;
  return k / (v.length - 1);
}
