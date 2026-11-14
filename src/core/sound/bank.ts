/**
 * LA BANQUE DE SONS (V2) — chaque son du jeu est FABRIQUÉ ici, une fois, au démarrage (Worker), puis simplement relu.
 * Aucun fichier à télécharger, aucun coût serveur ; à la lecture : 2 nœuds audio par son au lieu de 4 à 18.
 *
 * DIRECTION : satisfaisant, proche, FEUTRÉ (« ASMR »).
 *  - des MATIÈRES, pas des bips : carton épais, feutre, bois, alu froissé — synthèse modale (modes amortis) + grains ;
 *  - attaques ARRONDIES (0,5–3 ms) : jamais de clic sec ; rien d'utile au-dessus de ~6 kHz ;
 *  - l'énergie reste entre 400 Hz et 3 kHz : c'est ce qu'un haut-parleur de téléphone sait rendre (un son « étouffé »
 *    trop grave y disparaîtrait) ; les impacts gardent leur couche d'harmoniques 150–500 Hz ;
 *  - TOUT PRÈS : une petite pièce sombre cuite dans le son (0,1–0,5 s), pas de longue queue brillante ;
 *  - jamais deux fois le même : 3 à 6 variantes par son (matière légèrement différente), tirées sans répétition.
 *
 * Sons tonals (notes, carillons, pièces) : une seule version, jamais désaccordée (charte du 04/11), mono, réverbe du jeu.
 */
import { type Clip, type Rng, SR, between, decay, drive, glide, hp1, loopable, lp1, lp2, mix, modal, mulberry, normalize, pink, room, scale, smp, svf, trim, white, zeros, peak } from './dsp';
import { CHIME_BASES, CHIME_SIZES, COIN_HZ, NOTE_BASES } from './ids';
import { scaleHz } from './scale';

export const unit = (x: Float32Array) => {
  const p = peak([x]);
  return p > 0 ? scale(x, 1 / p) : x;
};
export const finish = (ch: Float32Array[], db = -6) => trim(normalize(ch, db));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/**
 * Enveloppe « à grain » : impulsions clairsemées (`density` par seconde) lissées à `smoothHz`, moyenne ≈ 1.
 * C'est le frottement irrégulier d'une matière (fibres du carton, plis de l'alu) — pas un souffle lisse.
 */
export function grainEnv(n: number, density: number, smoothHz: number, r: Rng): Float32Array {
  const m = new Float32Array(n);
  const p = density / SR;
  for (let i = 0; i < n; i++) if (r() < p) m[i] = r() * r();
  lp2(m, smoothHz);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += m[i];
  mean = Math.max(1e-9, mean / n);
  for (let i = 0; i < n; i++) m[i] /= mean;
  return m;
}

export type Recipe = { n: number; make: (r: Rng, i: number) => Float32Array[] };

/** « toc » feutré : un doigt sur une carte épaisse posée sur du feutre. Le son de base de toute l'interface. */
function tap(r: Rng) {
  const x = zeros(0.16);
  const f0 = between(r, 270, 320);
  modal(x, [
    { f: f0, t60: between(r, 0.05, 0.065), a: 0.75 },
    { f: f0 * between(r, 2.2, 2.42), t60: 0.042, a: between(r, 0.85, 1) },
    { f: f0 * between(r, 3.7, 4.1), t60: 0.026, a: between(r, 0.4, 0.55) },
  ], 0, 0.0009);
  mix(x, unit(decay(lp2(white(smp(0.03), r), 2400), 0.014, 0.0008)), between(r, 0.28, 0.4));
  lp1(x, 3600);
  hp1(x, 70);
  return finish(room(x, { t60: 0.1, mixK: 0.12 }, r));
}

/** « tic » feutré : plus petit, plus haut (survol, cran, étoile qui s'allume). */
function tick(r: Rng) {
  const x = zeros(0.1);
  const f0 = between(r, 640, 760);
  modal(x, [
    { f: f0, t60: 0.03, a: 1 },
    { f: f0 * between(r, 2.3, 2.6), t60: 0.016, a: 0.4 },
    { f: f0 * between(r, 3.9, 4.3), t60: 0.009, a: 0.15 },
  ], 0, 0.0005);
  mix(x, unit(decay(lp2(white(smp(0.012), r), 4000), 0.006, 0.0004)), between(r, 0.24, 0.34));
  lp1(x, 5200);
  hp1(x, 120);
  return finish(room(x, { t60: 0.07, mixK: 0.1 }, r));
}

/** « tok » profond : touche de clavier amortie (boutons principaux, validation). */
function press(r: Rng) {
  const x = zeros(0.2);
  const f0 = between(r, 195, 230);
  modal(x, [
    { f: f0, t60: 0.08, a: 0.8 },
    { f: f0 * between(r, 2.0, 2.2), t60: 0.055, a: 1 },
    { f: f0 * between(r, 3.2, 3.45), t60: 0.038, a: 0.75 },
    { f: f0 * between(r, 5.0, 5.4), t60: 0.022, a: 0.35 },
  ], 0, 0.001);
  mix(x, unit(decay(lp2(white(smp(0.04), r), 1800), 0.016, 0.001)), between(r, 0.25, 0.35));
  lp1(x, 3000);
  hp1(x, 60);
  return finish(room(x, { t60: 0.12, mixK: 0.13 }, r));
}

/** « pop » feutré : petite bulle (interrupteurs, pastilles, bulles de notification). */
function pop(r: Rng) {
  const n = smp(0.14);
  const f0 = between(r, 330, 400);
  const x = decay(glide(n, f0, f0 * between(r, 1.9, 2.3), 0.025), 0.07, 0.002);
  mix(x, unit(decay(lp2(white(smp(0.01), r), 2500), 0.004, 0.0005)), 0.1);
  lp1(x, 3200);
  hp1(x, 120);
  return finish(room(x, { t60: 0.09, mixK: 0.1 }, r));
}

/** « pat » : une carte qui se pose sur le tapis (petit rebond de tranche 30 ms après). */
function land(r: Rng) {
  const x = zeros(0.24);
  const f0 = between(r, 165, 195);
  modal(x, [
    { f: f0, t60: 0.07, a: 0.8 },
    { f: f0 * between(r, 1.7, 1.9), t60: 0.05, a: 0.9 },
    { f: f0 * between(r, 2.95, 3.25), t60: 0.034, a: 0.8 },
    { f: f0 * between(r, 4.4, 4.8), t60: 0.022, a: 0.5 },
  ], 0, 0.0012);
  mix(x, unit(decay(lp2(white(smp(0.07), r), 1500), 0.03, 0.002)), 0.7);
  mix(x, x.slice(0, smp(0.1)), 0.18, between(r, 0.026, 0.034));
  lp1(x, 2800);
  hp1(x, 50);
  return finish(room(x, { t60: 0.14, mixK: 0.15 }, r));
}

/** impact moyen (3★–4★) : sous-basse qui tombe + harmoniques saturées 160–520 Hz (téléphone) + coup feutré. */
function thud(r: Rng) {
  const n = smp(0.5);
  const sub = decay(glide(n, between(r, 90, 100), 52, 0.06), 0.32, 0.003);
  const harm = scale(lp2(hp1(hp1(drive(sub.slice(), 5), 220), 220), 700), 1.6);
  const x = mix(scale(sub, 0.8), harm);
  modal(x, [{ f: between(r, 235, 255), t60: 0.06, a: 0.6 }, { f: between(r, 420, 450), t60: 0.045, a: 0.55 }, { f: between(r, 690, 740), t60: 0.03, a: 0.35 }], 0, 0.001);
  mix(x, unit(decay(lp2(white(smp(0.08), r), 1500), 0.03, 0.002)), 0.4);
  lp1(x, 2500);
  hp1(x, 35);
  return finish(room(x, { t60: 0.25, mixK: 0.18, damp: 1800 }, r));
}

/** grand impact (5★–6★) : plus long, plus bas, avec une poussée d'air. */
function boom(r: Rng) {
  const n = smp(0.9);
  const sub = decay(glide(n, between(r, 104, 116), 42, 0.09), 0.6, 0.004);
  const harm = scale(lp2(hp1(hp1(drive(sub.slice(), 6), 200), 200), 650), 1.7);
  const x = mix(scale(sub, 0.8), harm);
  modal(x, [{ f: between(r, 205, 225), t60: 0.09, a: 0.6 }, { f: between(r, 370, 400), t60: 0.06, a: 0.55 }, { f: between(r, 610, 660), t60: 0.04, a: 0.35 }], 0, 0.0015);
  mix(x, unit(decay(lp2(white(smp(0.3), r), 900), 0.09, 0.006)), 0.45);
  lp1(x, 2200);
  hp1(x, 30);
  return finish(room(x, { t60: 0.5, mixK: 0.22, damp: 1500, size: 1.2 }, r));
}

/** craquement feutré (bois, glace) : quelques grains serrés + un coup grave. */
function crack(r: Rng) {
  const x = zeros(0.3);
  const grains = 5 + Math.floor(r() * 3);
  for (let g = 0; g < grains; g++) {
    const b = white(smp(0.07), r);
    svf(b, between(r, 700, 2800), 2.5, 'bp');
    decay(b, between(r, 0.008, 0.035), 0.0004);
    mix(x, unit(b), (1 - g / grains) * between(r, 0.6, 1), g === 0 ? 0 : between(r, 0.006, 0.07));
  }
  modal(x, [{ f: between(r, 160, 185), t60: 0.07, a: 0.6 }, { f: between(r, 290, 330), t60: 0.04, a: 0.35 }], 0, 0.001);
  lp1(x, 4500);
  hp1(x, 60);
  return finish(room(x, { t60: 0.22, mixK: 0.2 }, r));
}

/** note de la gamme : lame de bois / kalimba feutrée (fondamentale + deux partiels courts, léger battement). Mono. */
function note(deg: number, r: Rng) {
  const f = scaleHz(deg);
  const t60 = clamp(0.75 * Math.sqrt(440 / f), 0.35, 1.1);
  const x = zeros(t60 * 1.25);
  modal(x, [
    { f, t60, a: 1 },
    { f: f + 0.7, t60, a: 0.25 },
    { f: f * 2, t60: t60 / (f < 390 ? 1.6 : 3), a: f < 390 ? 0.55 : 0.1 },
    { f: f * 3, t60: t60 / (f < 390 ? 2.5 : 5), a: f < 390 ? 0.25 : 0.04 },
    { f: f * 5.4, t60: 0.06, a: 0.05 },
  ], 0, 0.002);
  mix(x, unit(decay(lp2(white(smp(0.02), r), Math.min(3500, f * 5)), 0.008, 0.0005)), 0.1);
  lp1(x, 4500);
  return finish([x]);
}

/** carillon de récompense : bol feutré (partiels proches de l'harmonique, chaque partiel bat lentement). Mono. */
function chime(size: number, base: number, r: Rng) {
  const ratios = [1, 2.0, 2.98, 4.2, 5.3], amps = [1, 0.5, 0.2, 0.1, 0.05];
  const count = [2, 3, 5][size], T = [1.1, 1.7, 2.4][size];
  const x = zeros(T * 1.2);
  const modes = [];
  for (let i = 0; i < count; i++) {
    const f = base * ratios[i], t60 = T / (1 + i * 0.8);
    modes.push({ f, t60, a: amps[i] }, { f: f + between(r, 0.4, 1.2), t60, a: amps[i] * 0.5 });
  }
  modal(x, modes, 0, 0.003);
  mix(x, unit(decay(lp2(white(smp(0.03), r), 3000), 0.01, 0.001)), 0.08);
  lp1(x, 5000);
  return finish([x]);
}

/** pièce : petit « ting » mat (une pièce dans une bourse en feutre). Mono, hauteur réglée à la lecture. */
function coin(r: Rng) {
  const x = zeros(0.22);
  modal(x, [
    { f: COIN_HZ, t60: 0.16, a: 1 },
    { f: COIN_HZ * between(r, 2.29, 2.35), t60: 0.09, a: 0.5 },
    { f: COIN_HZ * between(r, 3.81, 3.91), t60: 0.05, a: 0.22 },
  ], 0, 0.0006);
  mix(x, unit(decay(lp2(white(smp(0.01), r), 3000), 0.004, 0.0003)), 0.2);
  lp1(x, 5000);
  return finish([x]);
}

/** TEXTURE en boucle — alu du sachet qu'on froisse / déchire : pluie de grains résonants, large en stéréo. */
function foil(r: Rng) {
  const dur = 2.4, n = smp(dur);
  const L = new Float32Array(n), R = new Float32Array(n);
  const count = Math.round(110 * dur);
  for (let g = 0; g < count; g++) {
    const b = white(smp(0.03), r);
    svf(b, between(r, 1500, 5200), between(r, 2, 6), 'bp');
    decay(b, between(r, 0.004, 0.02), 0.0002);
    const a = Math.pow(r(), 3) + 0.05, p = r(), t0 = r() * (dur - 0.04);
    mix(L, b, a * Math.cos((p * Math.PI) / 2), t0);
    mix(R, b, a * Math.sin((p * Math.PI) / 2), t0);
  }
  return normalize([L, R].map((x) => {
    // lit de matière sous les grains : bruit rose resserré, qui « respire » irrégulièrement
    const bed = svf(pink(n, r), 950, 0.7, 'bp');
    const m = grainEnv(n, 45, 25, r);
    for (let i = 0; i < n; i++) bed[i] *= 0.35 + 0.65 * m[i];
    mix(x, unit(bed), 0.1);
    return loopable(lp2(hp1(x, 250), 7000), 0.35);
  }));
}

/** TEXTURE en boucle — frottement de papier / carton (cartes qui glissent) : bruit rose à grain fin. */
function paper(r: Rng) {
  const n = smp(2.3);
  return normalize([0, 1].map(() => {
    const x = svf(pink(n, r), 1100, 0.6, 'bp');
    const m = grainEnv(n, 900, 500, r);
    for (let i = 0; i < n; i++) x[i] *= 0.5 + 0.5 * m[i];
    return loopable(hp1(lp1(x, 4200), 150), 0.3);
  }));
}

/** TEXTURE en boucle — air doux (carte qui vole, montées) : bruit rose passé au feutre, sans grain. */
function air(r: Rng) {
  const n = smp(2.3);
  return normalize([0, 1].map(() => {
    const x = hp1(lp2(pink(n, r), 1800), 120);
    const m = unit(lp1(white(n, r), 6));
    for (let i = 0; i < n; i++) x[i] *= 0.85 + 0.15 * m[i];
    return loopable(x, 0.3);
  }));
}

/** Les recettes, dans l'ordre de cuisson : ce que l'interface joue en premier d'abord. */
export const RECIPES: Record<string, Recipe> = {
  tap: { n: 6, make: tap },
  tick: { n: 6, make: tick },
  press: { n: 4, make: press },
  pop: { n: 5, make: pop },
  land: { n: 5, make: land },
  paper: { n: 1, make: paper },
  air: { n: 1, make: air },
  foil: { n: 1, make: foil },
  coin: { n: 1, make: coin },
  thud: { n: 3, make: thud },
  boom: { n: 2, make: boom },
  crack: { n: 3, make: crack },
};
for (const d of NOTE_BASES) RECIPES[`note${d}`] = { n: 1, make: (r) => note(d, r) };
CHIME_SIZES.forEach((s, si) => CHIME_BASES.forEach((b) => (RECIPES[`chime${s}${b}`] = { n: 1, make: (r) => chime(si, b, r) })));

export const SOUND_IDS = Object.keys(RECIPES);

/** graine stable par son (le même son d'une session à l'autre, d'un appareil à l'autre) */
export function seedOf(id: string, i: number) {
  let h = 2166136261;
  for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619);
  return (h ^ (i * 0x9e3779b1)) >>> 0;
}

/** cuit toutes les variantes d'un son (`book` : un autre livre de recettes, ex. sound/mythicBank.ts) */
export function renderSound(id: string, book: Record<string, Recipe> = RECIPES): Clip[] {
  const rec = book[id];
  if (!rec) return [];
  const out: Clip[] = [];
  for (let i = 0; i < rec.n; i++) out.push({ sr: SR, ch: rec.make(mulberry(seedOf(id, i)), i) });
  return out;
}

/** cuit toute la banque ; `each` reçoit chaque son dès qu'il est prêt (les sons d'interface d'abord) */
export function renderBank(each?: (id: string, clips: Clip[]) => void, book: Record<string, Recipe> = RECIPES): Record<string, Clip[]> {
  const bank: Record<string, Clip[]> = {};
  for (const id of Object.keys(book)) {
    bank[id] = renderSound(id, book);
    each?.(id, bank[id]);
  }
  return bank;
}
