/**
 * SONS DES OUVERTURES À GAGNER (V3, 27/11) — un livre de recettes cuit à la demande, la première fois qu'une de ces
 * ouvertures se prépare (scenes/opening.ts → `sfx.loadBook('ouvertures')`) : rien pour qui joue la Déchirure.
 * Même direction que la banque principale (bank.ts) : des matières, feutré, tout près, rien d'utile au-dessus de
 * ~6 kHz. Tant qu'un son n'est pas cuit, le moteur rejoue celui de la Déchirure (repli de `peel` / `seal`, audio.ts).
 *
 * RETROUSSÉ : le film ne se déchire pas, il se DÉCOLLE. Deux matières :
 *  - `peel` (texture en boucle) : la soudure qu'on décolle le long du pli roulé — crépitement collant en bouffées
 *    (fibres de la soudure qui lâchent) sur un frottement de film plus sourd que l'alu froissé de la Déchirure ;
 *  - `seal` (ponctuel) : une soudure qui cède d'un coup — deux ou trois crépitements serrés et la membrane du film
 *    qui claque, avec le petit coup grave du bord du sachet. Hauteur réglée à la lecture (force du cran).
 */
import { type Rng, SR, between, decay, hp1, loopable, lp1, lp2, mix, modal, normalize, pink, room, smp, svf, white, zeros } from './dsp';
import { type Recipe, finish, grainEnv, unit } from './bank';

/** TEXTURE en boucle — soudure qu'on décolle : crépitement collant en bouffées sur un frottement de film sourd. */
function peel(r: Rng) {
  const dur = 2.4, n = smp(dur);
  // bouffées : le crépitement suit le décollement, par à-coups (6 à 10 par seconde), jamais régulier
  const puffs = grainEnv(n, 9, 14, r);
  const L = new Float32Array(n), R = new Float32Array(n);
  const count = Math.round(520 * dur);
  for (let g = 0; g < count; g++) {
    const t0 = r() * (dur - 0.01);
    const k = puffs[Math.min(n - 1, Math.round(t0 * SR))];
    // tirage contre l'enveloppe des bouffées : les grains se serrent dans les à-coups
    if (r() * 2.6 > k) continue;
    const b = white(smp(0.006), r);
    svf(b, between(r, 1700, 4600), between(r, 3, 8), 'bp');
    decay(b, between(r, 0.0012, 0.004), 0.0002);
    const a = Math.pow(r(), 2.4) + 0.04, p = r();
    mix(L, b, a * Math.cos((p * Math.PI) / 2), t0);
    mix(R, b, a * Math.sin((p * Math.PI) / 2), t0);
  }
  return normalize([L, R].map((x) => {
    // frottement du film le long du pli : bruit rose resserré, plus grave que l'alu, qui suit les mêmes bouffées
    const bed = svf(pink(n, r), between(r, 640, 760), 0.8, 'bp');
    const m = grainEnv(n, 60, 30, r);
    for (let i = 0; i < n; i++) bed[i] *= (0.25 + 0.75 * m[i]) * (0.55 + 0.45 * Math.min(2, puffs[i]));
    mix(x, unit(bed), 0.22);
    return loopable(lp2(hp1(x, 220), 6000), 0.35);
  }));
}

/** soudure qui cède : crépitements serrés, membrane du film qui claque, petit coup grave du bord du sachet. */
function seal(r: Rng) {
  const x = zeros(0.2);
  const grains = 2 + Math.floor(r() * 3);
  let at = 0;
  for (let g = 0; g < grains; g++) {
    const b = white(smp(0.012), r);
    svf(b, between(r, 1400, 3600), between(r, 2.5, 5), 'bp');
    decay(b, between(r, 0.003, 0.008), 0.0003);
    mix(x, unit(b), (1 - g / (grains + 1)) * between(r, 0.55, 0.9), at);
    at += between(r, 0.003, 0.009);
  }
  const f0 = between(r, 390, 470);
  modal(x, [
    { f: f0, t60: between(r, 0.035, 0.05), a: 0.8 },
    { f: f0 * between(r, 2.25, 2.45), t60: 0.026, a: 0.45 },
    { f: f0 * between(r, 3.8, 4.2), t60: 0.014, a: 0.18 },
    { f: between(r, 150, 175), t60: 0.05, a: 0.45 },
  ], 0.001, 0.0008);
  lp1(x, 4800);
  hp1(x, 80);
  return finish(room(x, { t60: 0.09, mixK: 0.12 }, r));
}

/**
 * (27/11) DÉCHIRURE GLACÉE : la glace qui se fend sous le doigt — un « tac » sec et cristallin (partiels inharmoniques
 * aigus, très courts) suivi d'un court crépitement de fissure qui court, et le corps sourd du bloc.
 */
function iceCrack(r: Rng) {
  const x = zeros(0.32);
  const f0 = between(r, 1700, 2300);
  modal(x, [
    { f: f0, t60: 0.05, a: 0.7 },
    { f: f0 * between(r, 1.41, 1.53), t60: 0.035, a: 0.5 },
    { f: f0 * between(r, 2.6, 2.9), t60: 0.02, a: 0.3 },
    { f: between(r, 220, 280), t60: 0.06, a: 0.5 },
  ], 0, 0.0004);
  // la fissure qui court : grains serrés qui s'espacent
  let at = 0.004;
  for (let g = 0; g < 14; g++) {
    const b = white(smp(0.006), r);
    svf(b, between(r, 2200, 5000), between(r, 4, 9), 'bp');
    decay(b, between(r, 0.001, 0.003), 0.0002);
    mix(x, unit(b), (1 - g / 15) * between(r, 0.25, 0.6), at);
    at += between(r, 0.003, 0.012) * (1 + g * 0.15);
  }
  lp1(x, 6500);
  hp1(x, 90);
  return finish(room(x, { t60: 0.18, mixK: 0.16 }, r));
}
/** le bloc et le sachet gelé éclatent : coup sourd, puis une pluie d'éclats qui tintent en retombant (≈ 1 s) */
function iceShatter(r: Rng) {
  const dur = 1.1, x = zeros(dur);
  modal(x, [{ f: between(r, 95, 115), t60: 0.18, a: 0.9 }, { f: between(r, 240, 280), t60: 0.1, a: 0.5 }], 0, 0.002);
  mix(x, unit(decay(lp2(white(smp(0.12), r), 2200), 0.07, 0.001)), 0.7);
  for (let g = 0; g < 70; g++) {
    // tintements : petits éclats de glace (aigus, inharmoniques, très courts), de plus en plus rares
    const t = Math.pow(r(), 1.8) * (dur - 0.08);
    const b = zeros(0.06);
    const f = between(r, 2400, 6000);
    modal(b, [{ f, t60: between(r, 0.02, 0.05), a: 1 }, { f: f * between(r, 1.3, 1.7), t60: 0.02, a: 0.4 }], 0, 0.0003);
    mix(x, unit(b), between(r, 0.08, 0.35) * (1 - t / dur), t);
  }
  lp1(x, 7000);
  hp1(x, 60);
  return finish(room(x, { t60: 0.3, mixK: 0.2 }, r));
}

/** Les recettes du livre `ouvertures` (books.ts), dans l'ordre de cuisson. */
export const OPEN_RECIPES: Record<string, Recipe> = {
  seal: { n: 6, make: seal },
  peel: { n: 1, make: peel },
  iceCrack: { n: 4, make: iceCrack },
  iceShatter: { n: 2, make: iceShatter },
};
/** les textures en boucle du livre (test : `npm run test:sound`) */
export const OPEN_LOOPS = ['peel'];
