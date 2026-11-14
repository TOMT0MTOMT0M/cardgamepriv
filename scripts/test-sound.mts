/**
 * Test de la banque de sons (chantier son V2) — `npm run test:sound`. Hors navigateur : cuit toute la banque comme le
 * Worker et vérifie ce qui casserait le jeu sans bruit… ou avec trop : valeurs non finies, crête, durées, boucles qui
 * claquent, sons attendus par le moteur absents, courbes son ↔ mouvement.
 */
import { renderBank, SOUND_IDS } from '../src/core/sound/bank';
import { BOOKS } from '../src/core/sound/books';
import { MYTHIC_LOOPS } from '../src/core/sound/mythicBank';
import { PAD_LOOP_S } from '../src/core/sound/padBank';
import { CHIME_BASES, CHIME_SIZES, NOTE_BASES } from '../src/core/sound/ids';
import { peakAt, velocityCurve } from '../src/core/sound/motion';
import { EASE } from '../src/core/ease';

let failed = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failed++;
    console.error('✗', msg);
  }
};
const t0 = performance.now();
const bank = renderBank();
const ms = performance.now() - t0;
// (11/11) banques cuites à la demande : scènes 6★ (première 6★ de la session), nappe des menus (si allumée)
const t1 = performance.now();
const mythic = renderBank(undefined, BOOKS.mythic);
const msMythic = performance.now() - t1;
const t2 = performance.now();
const pad = renderBank(undefined, BOOKS.pad);
const msPad = performance.now() - t2;
const LOOPS = new Set(['foil', 'paper', 'air', ...MYTHIC_LOOPS, 'pad']);
const sizeOf = (b: Record<string, { ch: Float32Array[] }[]>) => Object.values(b).flat().reduce((s, c) => s + c.ch.reduce((t, x) => t + x.byteLength, 0), 0);
let bytes = 0;
for (const [id, clips] of Object.entries({ ...bank, ...mythic, ...pad })) {
  check(clips.length > 0, `${id} : aucune variante`);
  clips.forEach((c, i) => {
    let pk = 0;
    let finite = true;
    for (const x of c.ch) {
      bytes += x.byteLength;
      for (let k = 0; k < x.length; k++) {
        if (!Number.isFinite(x[k])) finite = false;
        pk = Math.max(pk, Math.abs(x[k]));
      }
    }
    const dur = c.ch[0].length / c.sr;
    check(finite, `${id}#${i} : valeur non finie`);
    check(pk > 0.3 && pk <= 0.502, `${id}#${i} : crête ${pk.toFixed(3)} (attendu ≈ 0,5 = −6 dBFS)`);
    check(c.ch.every((x) => x.length === c.ch[0].length), `${id}#${i} : canaux de longueurs différentes`);
    const loop = LOOPS.has(id);
    check(id === 'pad' ? Math.abs(dur - PAD_LOOP_S) < 0.01 : loop ? dur > 0.75 && dur < 3 : dur > 0.03 && dur < 3.2, `${id}#${i} : durée ${dur.toFixed(2)} s`);
    // un son ponctuel finit en silence ; une texture boucle sans saut
    for (const x of c.ch) {
      if (loop) {
        // le raccord ne doit pas sauter plus qu'un pas ordinaire de la texture (un bruit large saute beaucoup d'un échantillon à l'autre)
        let step = 0;
        for (let k = 1; k < x.length; k++) step += Math.abs(x[k] - x[k - 1]);
        step /= x.length - 1;
        const jump = Math.abs(x[0] - x[x.length - 1]);
        check(jump < (id === 'pad' ? 0.02 : Math.max(0.12, 4 * step)), `${id}#${i} : la boucle claque (${jump.toFixed(3)}, pas moyen ${step.toFixed(3)})`);
      }
      else if (id === 'mSwell') check(Math.abs(x[x.length - 1]) < 0.01, `${id}#${i} : fin qui claque`);
      else check(Math.abs(x[x.length - 1]) < 0.01 && Math.abs(x[0]) < 0.05, `${id}#${i} : début ou fin qui claque`);
    }
  });
}
// tout ce que le moteur (audio.ts) demande existe
const needed = ['tap', 'tick', 'press', 'pop', 'land', 'thud', 'boom', 'coin', 'crack', 'foil', 'paper', 'air', ...NOTE_BASES.map((d) => `note${d}`), ...CHIME_SIZES.flatMap((s) => CHIME_BASES.map((b) => `chime${s}${b}`))];
for (const id of needed) check(SOUND_IDS.includes(id), `son attendu par le moteur absent de la banque : ${id}`);
const mb = (b: number) => (b / 1048576).toFixed(2);
check(sizeOf(bank) < 8 * 1048576, `banque trop lourde : ${mb(sizeOf(bank))} Mo`);
check(sizeOf(mythic) < 3 * 1048576, `banque des scènes 6★ trop lourde : ${mb(sizeOf(mythic))} Mo`);
check(sizeOf(pad) < 1048576, `nappe trop lourde : ${mb(sizeOf(pad))} Mo`);
// tout ce que les scènes 6★ demandent existe (game/mythic/sounds.ts)
for (const id of ['mBell', 'mWhistle', 'mBuzzer', 'mEngine', 'mCrowd', 'mShutter', 'mCrackle', 'mSnow', 'mTvOn', 'mChip', 'mSlot', 'mProjector', 'mBoing', 'mBuzz', 'mSizzle', 'mClank', 'mFlood', 'mShing', 'mBeep', 'mBounce', 'mGong', 'mChirp', 'mCrickets', 'mRoll', 'mSlash', 'mRumble', 'mSwell'])
  check(id in mythic, `son attendu par les scènes 6★ absent : ${id}`);
// son ↔ mouvement : le souffle culmine là où la courbe va le plus vite
check(peakAt(velocityCurve(EASE.glide)) < 0.2, 'EASE.glide : le souffle doit culminer au départ');
check(peakAt(velocityCurve(EASE.heave)) > 0.7, 'EASE.heave : le souffle doit culminer à l’arrivée');
const mid = peakAt(velocityCurve(EASE.breathe));
check(mid > 0.35 && mid < 0.65, 'EASE.breathe : le souffle doit culminer au milieu');
for (const e of Object.values(EASE)) {
  const v = velocityCurve(e);
  check(v[0] === 0 && v[v.length - 1] === 0 && v.every((x) => x >= 0 && x <= 1.0001), 'courbe de vitesse hors bornes');
}
console.log(`${failed ? 'ÉCHEC' : 'OK'} — principale : ${Object.keys(bank).length} sons, ${mb(sizeOf(bank))} Mo, cuisson ${ms.toFixed(0)} ms · scènes 6★ : ${Object.keys(mythic).length} sons, ${mb(sizeOf(mythic))} Mo, ${msMythic.toFixed(0)} ms · nappe : ${mb(sizeOf(pad))} Mo, ${msPad.toFixed(0)} ms`);
process.exit(failed ? 1 : 0);
