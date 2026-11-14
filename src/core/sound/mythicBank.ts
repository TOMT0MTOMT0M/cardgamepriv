/**
 * BANQUE DES SCÈNES 6★ (son V2, 11/11) — les ~30 bruitages des scènes de famille (game/mythic/sounds.ts : cloche du
 * ring, sifflet, moteur, foule, déclencheur, gong…) FABRIQUÉS comme le reste du jeu (sound/bank.ts) : matières,
 * attaques arrondies, aigus feutrés, énergie dans la bande d'un haut-parleur de téléphone. Avant : des oscillateurs
 * bruts (scies, carrés, bruit blanc) seulement passés dans le filtre de sortie.
 *
 * Cuite À LA DEMANDE (première 6★ de la session, dans le Worker) : rien au démarrage, rien pour qui n'en tire pas.
 * Tout est MONO (placé et réverbéré à la lecture par la chaîne du jeu) : ~2 Mo, un son à la fois.
 * Les textures (`…` dans LOOPS) bouclent sans couture : la scène les joue à la durée qu'elle veut.
 */
import { type Rng, SR, between, decay, drive, fade, glide, hp1, loopable, lp1, lp2, mix, modal, normalize, pink, scale, smp, svf, white, zeros } from './dsp';
import { type Recipe, finish, grainEnv, unit } from './bank';
import { scaleHz } from './scale';

const TAU = Math.PI * 2;
/** degré de la gamme des 6★ (la majeur pentatonique : sol pentatonique +2 demi-tons, charte sonore) */
const la = (d: number) => scaleHz(d, 2);

/** sinus de fréquence variable (Hz par échantillon, fonction de l'avancement 0..1) */
function osc(n: number, f: (p: number) => number, shape: (ph: number) => number = Math.sin): Float32Array {
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (TAU * f(i / n)) / SR;
    x[i] = shape(ph);
  }
  return x;
}
/** enveloppe : attaque `a` s, tenue jusqu'à `hold` (0..1 de la durée), chute en cosinus jusqu'à la fin */
function ahr(x: Float32Array, a: number, hold: number): Float32Array {
  const n = x.length, na = Math.max(1, smp(a)), nh = Math.max(na, Math.round(n * hold));
  for (let i = 0; i < n; i++) {
    const k = i < na ? 0.5 - 0.5 * Math.cos((Math.PI * i) / na) : i < nh ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (i - nh)) / Math.max(1, n - nh));
    x[i] *= k;
  }
  return x;
}
/** petit coup de bruit filtré (attaque d'un objet frappé), mélangé à `at` */
function knock(dst: Float32Array, r: Rng, hz: number, len: number, k: number, at = 0) {
  mix(dst, unit(decay(lp2(white(smp(len * 3), r), hz), len, 0.0006)), k, at);
}
/** square « adouci » : harmoniques impaires 1, 3, 5 (rien au-dessus de ~2 kHz pour un la4) */
const softSquare = (ph: number) => Math.sin(ph) + 0.22 * Math.sin(3 * ph) + 0.07 * Math.sin(5 * ph);
/** boucle : `n` échantillons qui se referment sans couture (fondu de 0,25 s), crête −6 dBFS */
const loop = (x: Float32Array, xf = 0.25) => normalize([loopable(x, xf)]);

/** cloche de ring / de service (fondamentale cuite 1150 Hz, hauteur réglée à la lecture) : bol frappé au maillet feutré */
function bell(r: Rng) {
  const f = 1150, x = zeros(1.45);
  const P = [[1, 1, 1.15], [2.76, 0.42, 0.7], [5.4, 0.16, 0.45], [8.93, 0.06, 0.25]];
  modal(x, P.flatMap(([k, a, t]) => [{ f: f * k, t60: t, a }, { f: f * k + between(r, 0.8, 1.8), t60: t, a: a * 0.45 }]), 0, 0.0025);
  knock(x, r, 2600, 0.006, 0.12);
  lp1(x, 4800);
  return finish([x]);
}
/** sifflet d'arbitre : sifflement à bille (roulement rapide) + souffle, coupé à la lecture */
function whistle(r: Rng) {
  const n = smp(0.9);
  const x = osc(n, (p) => 2500 + 110 * Math.sin(TAU * 34 * p * 0.9 + 1), Math.sin);
  const am = osc(n, () => 34);
  for (let i = 0; i < n; i++) x[i] *= 0.7 + 0.3 * am[i];
  const br = svf(pink(n, r), 2600, 2.2, 'bp');
  mix(x, unit(br), 0.35);
  lp1(x, 4200);
  return finish([ahr(x, 0.025, 0.86)]);
}
/** sirène de fin de temps : corne feutrée (harmoniques impaires d'un si♭2, rien de criard) */
function buzzer(r: Rng) {
  const n = smp(1.0);
  const x = osc(n, () => 233, (ph) => softSquare(ph) + 0.35 * Math.sin(2 * ph + 0.4));
  drive(x, 1.6);
  mix(x, unit(svf(pink(n, r), 520, 1.2, 'bp')), 0.12);
  lp2(x, 1700);
  return finish([ahr(x, 0.012, 0.86)]);
}
/** moteur qui monte en régime (55 → 190 Hz à la vitesse 1 ; hauteur de départ réglée à la lecture) */
function engine(r: Rng) {
  const n = smp(ENGINE_S);
  const f = (p: number) => 55 * Math.pow(190 / 55, Math.pow(p, 0.8));
  // explosions : dent de scie (avant filtre), adoucie, saturée — la « fondamentale manquante » des petits HP
  const x = osc(n, f, (ph) => ((ph / TAU) % 1) * 2 - 1);
  lp2(x, 1100);
  drive(x, 2.4);
  const rough = lp1(white(n, r), 24);
  for (let i = 0; i < n; i++) x[i] *= 0.8 + 0.6 * rough[i];
  mix(x, unit(lp2(pink(n, r), 700)), 0.25);
  hp1(x, 45);
  return finish([ahr(x, 0.08, 0.55)]);
}
/** clameur de stade : souffle de foule + quelques voix (formants), qui enfle */
function crowd(r: Rng) {
  const dur = 1.8, n = smp(dur);
  const x = svf(pink(n, r), 950, 0.55, 'bp');
  const m = grainEnv(n, 18, 6, r);
  for (let i = 0; i < n; i++) x[i] *= 0.6 + 0.4 * m[i];
  for (let v = 0; v < 28; v++) {
    const len = between(r, 0.12, 0.35);
    const b = svf(white(smp(len), r), between(r, 450, 1300), between(r, 3, 6), 'bp');
    mix(x, unit(ahr(b, 0.03, 0.4)), between(r, 0.15, 0.45), between(r, 0.1, dur - len));
  }
  lp1(x, 3400);
  hp1(x, 120);
  return finish([ahr(x, dur * 0.42, 0.62)]);
}
/** déclencheur d'appareil photo : deux claquements mécaniques (rideau), feutrés */
function shutter(r: Rng) {
  const x = zeros(0.26);
  modal(x, [{ f: between(r, 2200, 2500), t60: 0.02, a: 1 }, { f: 3800, t60: 0.014, a: 0.5 }, { f: 900, t60: 0.03, a: 0.5 }], 0, 0.0005);
  knock(x, r, 4000, 0.004, 0.4);
  modal(x, [{ f: between(r, 1700, 1900), t60: 0.025, a: 0.8 }, { f: 3100, t60: 0.016, a: 0.4 }, { f: 700, t60: 0.04, a: 0.5 }], 0.052, 0.0006);
  knock(x, r, 3000, 0.005, 0.3, 0.052);
  lp1(x, 5200);
  return finish([x]);
}
/** crépitement de vinyle (texture) : poussières clairsemées sur un souffle très bas */
function crackle(r: Rng) {
  const n = smp(1.45), x = scale(lp1(hp1(white(n, r), 2500), 6000), 0.04);
  for (let g = 0; g < 38; g++) {
    const b = svf(white(smp(0.012), r), between(r, 1800, 3400), 0.9, 'bp');
    mix(x, unit(decay(b, between(r, 0.001, 0.004), 0.0002)), Math.pow(r(), 2) * 0.9 + 0.1, r() * 1.4);
  }
  return loop(lp1(x, 6000));
}
/** neige de télé (texture) : souffle large mais feutré (rien d'agressif au-dessus de 5 kHz) */
function snow(r: Rng) {
  const n = smp(1.05);
  const x = lp2(hp1(white(n, r), 1100), 5200);
  const m = grainEnv(n, 300, 120, r);
  for (let i = 0; i < n; i++) x[i] *= 0.75 + 0.25 * m[i];
  return loop(x);
}
/** télé cathodique qui s'allume : « tchk » sourd du relais + chant aigu très bas + bouffée de neige */
function tvOn(r: Rng) {
  const n = smp(1.1);
  const x = decay(glide(n, 182, 70, 0.04), 0.3, 0.003);
  drive(x, 2);
  knock(x, r, 1800, 0.01, 0.5);
  mix(x, scale(ahr(osc(n, () => 7600), 0.15, 0.6), 0.03));
  mix(x, unit(fade(lp2(hp1(white(smp(0.18), r), 1500), 4500), 0.01, 0.12)), 0.18, 0.02);
  lp1(x, 6000);
  hp1(x, 40);
  return finish([x]);
}
/** petit jingle 8 bits ORIGINAL (carré adouci, la majeur pentatonique) */
function chip(r: Rng) {
  const x = zeros(0.95);
  const put = (f: number, at: number, len: number, k: number) => {
    const b = ahr(osc(smp(len), () => f, softSquare), 0.004, 0.6);
    mix(x, b, k, at);
  };
  [0, 2, 4, 5, 7, 9].forEach((d, i) => put(la(d + 5), i * 0.075, 0.09, 1));
  put(la(12), 0.48, 0.36, 1);
  put(la(7), 0.48, 0.36, 0.6);
  knock(x, r, 3000, 0.003, 0.05);
  lp1(x, 4200);
  return finish([x]);
}
/** cartouche enfoncée : clic de plastique + coup sourd */
function slot(r: Rng) {
  const x = zeros(0.3);
  modal(x, [{ f: between(r, 1700, 1900), t60: 0.03, a: 0.7 }, { f: 2900, t60: 0.02, a: 0.4 }, { f: 4100, t60: 0.012, a: 0.2 }], 0, 0.0006);
  mix(x, decay(glide(smp(0.2), 180, 90, 0.04), 0.12, 0.003), 0.9, 0.02);
  lp1(x, 4500);
  return finish([x]);
}
/** projecteur de cinéma (texture) : 24 claquements par seconde, réguliers, et le ronron du moteur */
function projector(r: Rng) {
  // 1 s + 0,1 s de recouvrement : les claquements du recouvrement tombent pile sur ceux du début (boucle régulière)
  const n = smp(1.1), x = scale(osc(n, () => 50, (ph) => Math.sin(ph) + 0.4 * Math.sin(2 * ph)), 0.12);
  for (let k = 0; k < 26; k++) {
    const b = zeros(0.03);
    modal(b, [{ f: between(r, 1300, 1500), t60: 0.012, a: 1 }, { f: between(r, 2200, 2500), t60: 0.008, a: 0.5 }], 0, 0.0004);
    mix(x, b, between(r, 0.6, 1), k / 24 + between(r, 0, 0.003));
  }
  return loop(lp1(x, 3400), 0.1);
}
/** ressort de dessin animé (« boing ») : lame qui glisse vers l'aigu en vibrant */
function boing(r: Rng) {
  const n = smp(0.6);
  const x = osc(n, (p) => 520 + (180 - 520) * Math.exp(-p * 0.6 / 0.12) + 40 * Math.sin(TAU * 16 * p * 0.6), (ph) => Math.sin(ph) + 0.12 * Math.sin(3 * ph));
  decay(x, 0.5, 0.003);
  knock(x, r, 1500, 0.004, 0.08);
  lp1(x, 3500);
  return finish([x]);
}
/** vibreur de téléphone : bourdon râpeux à 120 Hz, son posé sur une table */
function buzz(r: Rng) {
  const n = smp(0.8);
  const x = osc(n, () => 120, (ph) => Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.3 * Math.sin(3 * ph) + 0.2 * Math.sin(4 * ph));
  const rattle = osc(n, () => 30);
  for (let i = 0; i < n; i++) x[i] *= 0.65 + 0.35 * rattle[i];
  mix(x, unit(svf(white(n, r), 320, 2, 'bp')), 0.15);
  lp2(x, 520);
  return finish([ahr(x, 0.02, 0.9)]);
}
/** grésillement d'un plat chaud (texture) : pluie de micro-crépitements */
function sizzle(r: Rng) {
  const n = smp(1.45), x = scale(lp1(hp1(pink(n, r), 3000), 7000), 0.25);
  for (let g = 0; g < 380; g++) {
    const b = svf(white(smp(0.006), r), between(r, 3800, 6800), 3, 'bp');
    mix(x, decay(b, between(r, 0.0008, 0.003), 0.0001), Math.pow(r(), 2.5), r() * 1.44);
  }
  return loop(lp1(x, 7000));
}
/** claquement métallique (casier, distributeur) : tôle frappée, partiels inharmoniques courts — 420 Hz à la vitesse 1 */
function clank(r: Rng) {
  const x = zeros(0.55), f = 420 * between(r, 0.97, 1.03);
  modal(x, [[1, 1, 0.34], [2.32, 0.7, 0.2], [3.91, 0.45, 0.12], [5.37, 0.25, 0.08], [6.8, 0.12, 0.05]].map(([k, a, t]) => ({ f: f * k * between(r, 0.99, 1.01), t60: t, a })), 0, 0.0007);
  knock(x, r, 2600, 0.008, 0.35);
  lp1(x, 4600);
  hp1(x, 90);
  return finish([x]);
}
/** projecteur de stade : gros interrupteur qui claque + bourdon électrique qui s'éteint */
function flood(r: Rng) {
  const n = smp(1.0), x = zeros(1.0);
  modal(x, [{ f: between(r, 130, 150), t60: 0.09, a: 1 }, { f: 380, t60: 0.05, a: 0.6 }, { f: 920, t60: 0.03, a: 0.4 }], 0, 0.0008);
  knock(x, r, 2000, 0.012, 0.6);
  const hum = osc(n, () => 100, (ph) => Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph));
  mix(x, decay(lp1(hum, 420), 0.8, 0.02, 0.02), 0.18);
  hp1(x, 50);
  return finish([x]);
}
/** lame : « shing » métallique (frottement qui monte + anneau), aigus feutrés */
function shing(r: Rng) {
  const x = zeros(1.0);
  const sw = svf(white(smp(0.45), r), (p) => 4200 * Math.pow(1.65, p), 10, 'bp');
  mix(x, unit(ahr(sw, 0.02, 0.3)), 0.8);
  modal(x, [{ f: 3300, t60: 0.9, a: 0.35 }, { f: 3301.2, t60: 0.9, a: 0.2 }, { f: 4950, t60: 0.6, a: 0.16 }, { f: 6610, t60: 0.35, a: 0.06 }], 0.05, 0.004);
  lp1(x, 6500);
  return finish([x]);
}
/** bip électronique (chrono, feux) : sinus rond + un peu de troisième harmonique — 1320 Hz à la vitesse 1 */
function beep() {
  const x = osc(smp(0.16), () => 1320, (ph) => Math.sin(ph) + 0.18 * Math.sin(3 * ph));
  lp1(x, 4200);
  return finish([ahr(x, 0.003, 0.78)]);
}
/** balle qui rebondit : caoutchouc creux (hauteur qui tombe) + claquement court */
function bounce(r: Rng) {
  const n = smp(0.26);
  const x = decay(glide(n, between(r, 150, 175), 60, 0.035), 0.13, 0.002);
  knock(x, r, 1300, 0.006, 0.4);
  modal(x, [{ f: between(r, 320, 380), t60: 0.04, a: 0.3 }], 0, 0.001);
  drive(x, 1.4);
  lp1(x, 3000);
  hp1(x, 40);
  return finish([x]);
}
/** gong : bronze frappé à la mailloche, partiels qui battent et s'épanouissent */
function gong(r: Rng) {
  const x = zeros(2.2), f = 110;
  const P = [[1, 1, 1.9, 0.004], [1.48, 0.62, 1.6, 0.01], [2.1, 0.42, 1.3, 0.03], [2.9, 0.22, 1.1, 0.05], [3.62, 0.12, 0.8, 0.06], [4.41, 0.07, 0.6, 0.07]];
  for (const [k, a, t, atk] of P) modal(x, [{ f: f * k, t60: t, a }, { f: f * k + between(r, 0.5, 1.1), t60: t, a: a * 0.6 }], 0, atk);
  knock(x, r, 1400, 0.02, 0.25);
  lp1(x, 3800);
  hp1(x, 45);
  return finish([x]);
}
/** gazouillis d'oiseau : deux petites glissades, lointaines */
function chirp(r: Rng) {
  const f = between(r, 2600, 4200), x = zeros(0.25);
  const g1 = osc(smp(0.08), (p) => f * Math.pow(between(r, 1.2, 1.6), p));
  mix(x, ahr(g1, 0.006, 0.3), 1);
  const g2 = osc(smp(0.1), (p) => f * 1.1 * Math.pow(0.73, p));
  mix(x, ahr(g2, 0.006, 0.3), 0.85, 0.11);
  lp1(x, 6000);
  return finish([x]);
}
/**
 * grillons (texture) : stridulations de trois coups très brefs (4,3 kHz), deux par 0,44 s comme l'ancienne nuit ; 0,88 s
 * + recouvrement, pour une boucle régulière
 */
function crickets(r: Rng) {
  const x = zeros(0.88 + 0.1), f = between(r, 4100, 4500);
  for (const t0 of [0, 0.26, 0.44, 0.7, 0.88])
    for (let k = 0; k < 3; k++) mix(x, ahr(osc(smp(0.014), () => f * between(r, 0.99, 1.01)), 0.003, 0.4), (1 - k * 0.15) * between(r, 0.8, 1), t0 + k * 0.026);
  return loop(lp1(x, 6000), 0.1);
}
/** compteur qui défile (texture) : 40 crans par seconde, réguliers */
function roll(r: Rng) {
  const n = smp(1.06), x = new Float32Array(n);
  for (let k = 0; k < 42; k++) {
    const b = zeros(0.02);
    modal(b, [{ f: between(r, 3000, 3400), t60: 0.006, a: 1 }, { f: 1600, t60: 0.008, a: 0.5 }], 0, 0.0003);
    mix(x, b, between(r, 0.7, 1), k / 40);
  }
  return loop(lp1(x, 5200), 0.06);
}
/** déchirure d'air (lame, coupe nette) : souffle qui plonge de l'aigu vers le grave */
function slash(r: Rng) {
  const x = svf(white(smp(0.32), r), (p) => 5200 * Math.pow(900 / 5200, Math.pow(p, 0.7)), 1.5, 'bp');
  ahr(x, 0.006, 0.15);
  lp1(x, 6000);
  return finish([x]);
}
/** grondement sourd (texture) : très grave + sa couche d'harmoniques 150–400 Hz (téléphone) */
function rumble(r: Rng) {
  const n = smp(1.6);
  const x = lp2(pink(n, r), 110);
  const h = lp2(hp1(drive(unit(x.slice()), 4), 150), 400);
  mix(scale(unit(x), 0.8), unit(h), 0.45);
  const m = lp1(white(n, r), 3);
  for (let i = 0; i < n; i++) x[i] *= 0.8 + 0.4 * m[i];
  return loop(x, 0.3);
}
/**
 * MONTÉE (riser) : nappe tonale qui glisse d'un la3 vers un la5 en enflant (départ retenu : ease-in), sur SWELL_S. Lue avec
 * un décalage pour une montée plus courte (elle finit toujours au sommet), plus lentement pour une plus longue.
 */
export const SWELL_S = 1.6;
/** durée cuite du moteur (55 → 190 Hz) */
export const ENGINE_S = 1.4;
function swell(r: Rng) {
  const n = smp(SWELL_S);
  const x = osc(n, (p) => 220 * Math.pow(4, Math.pow(p, 1.6)), (ph) => Math.sin(ph) + 0.25 * Math.sin(2 * ph + 0.3));
  for (let i = 0; i < n; i++) x[i] *= Math.pow(i / n, 2.4);
  mix(x, unit(svf(pink(n, r), (p) => 400 * Math.pow(8, p), 1.4, 'bp')), 0.5);
  for (let i = 0; i < n; i++) x[i] *= i < n - 200 ? 1 : (n - i) / 200;
  lp1(x, 3000);
  return normalize([x]);
}

/** les recettes des scènes 6★ (identifiants `m…` : jamais en collision avec la banque principale) */
export const MYTHIC_RECIPES: Record<string, Recipe> = {
  mBell: { n: 1, make: bell },
  mBeep: { n: 1, make: beep },
  mClank: { n: 2, make: clank },
  mBounce: { n: 2, make: bounce },
  mShutter: { n: 2, make: shutter },
  mSlot: { n: 1, make: slot },
  mSlash: { n: 1, make: slash },
  mChirp: { n: 2, make: chirp },
  mCrickets: { n: 1, make: crickets },
  mFlood: { n: 1, make: flood },
  mWhistle: { n: 1, make: whistle },
  mBuzzer: { n: 1, make: buzzer },
  mBoing: { n: 1, make: boing },
  mBuzz: { n: 1, make: buzz },
  mTvOn: { n: 1, make: tvOn },
  mChip: { n: 1, make: chip },
  mShing: { n: 1, make: shing },
  mEngine: { n: 1, make: engine },
  mCrowd: { n: 1, make: crowd },
  mGong: { n: 1, make: gong },
  mSwell: { n: 1, make: swell },
  mCrackle: { n: 1, make: crackle },
  mSnow: { n: 1, make: snow },
  mProjector: { n: 1, make: projector },
  mSizzle: { n: 1, make: sizzle },
  mRoll: { n: 1, make: roll },
  mRumble: { n: 1, make: rumble },
};
/** textures qui bouclent (jouées à la durée voulue, départ au hasard) ; mSwell : se lit d'une traite, finit au sommet */
export const MYTHIC_LOOPS = ['mCrickets', 'mCrackle', 'mSnow', 'mProjector', 'mSizzle', 'mRoll', 'mRumble'];
