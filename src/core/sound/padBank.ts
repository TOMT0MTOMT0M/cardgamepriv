/**
 * NAPPE DES MENUS (son V2, 11/11, réglage « Nappe des menus », désactivé par défaut) : un accord feutré de la gamme du
 * jeu (sol pentatonique) qui respire très lentement, sous les pages. Cuite à la demande (seulement si le joueur
 * l'allume), mono, 6 s qui bouclent SANS couture : chaque fréquence et chaque respiration fait un nombre entier de
 * cycles sur la boucle — aucun fondu, aucun « pompage » audible au raccord. ~0,75 Mo.
 */
import { type Rng, SR, loopable, lp2, normalize, pink } from './dsp';
import type { Recipe } from './bank';
import { scaleHz } from './scale';

const TAU = Math.PI * 2;
export const PAD_LOOP_S = 6;

function pad(r: Rng) {
  const L = PAD_LOOP_S, n = Math.round(L * SR);
  const x = new Float32Array(n);
  // sol2 · ré3 · sol3 · la3 · ré4 · mi4 — calés pour boucler (résolution 1/6 Hz : écart < 0,1 Hz)
  const degs: Array<[number, number]> = [[-10, 0.5], [-7, 0.7], [-5, 0.9], [-4, 0.55], [-2, 0.5], [-1, 0.35]];
  for (const [d, a] of degs) {
    const f = Math.round(scaleHz(d) * L) / L;
    const ph0 = r() * TAU;
    // chaque voix respire à son rythme (1, 2 ou 3 cycles par boucle), sans jamais s'éteindre
    const k = 1 + Math.floor(r() * 3), bph = r() * TAU;
    const det = Math.round((f + 0.5) * L) / L; // voix jumelle légèrement désaccordée (battement lent, entier aussi)
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const breath = 0.62 + 0.38 * Math.sin((TAU * k * i) / n + bph);
      x[i] += a * breath * (Math.sin(TAU * f * t + ph0) + 0.35 * Math.sin(TAU * det * t + ph0 * 1.7) + 0.08 * Math.sin(TAU * 2 * f * t));
    }
  }
  // souffle de feutre dessous (bruit rose très sombre, filtré AVANT d'être refermé en boucle), qui respire aussi
  const xf = 0.8;
  const air = loopable(lp2(pink(n + Math.round(xf * SR), r), 520), xf);
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(air[i]));
  for (let i = 0; i < n; i++) x[i] += (air[i] / Math.max(1e-9, pk)) * 0.15 * (0.7 + 0.3 * Math.sin((TAU * 2 * i) / n));
  return normalize([x]);
}

export const PAD_RECIPES: Record<string, Recipe> = { pad: { n: 1, make: pad } };
