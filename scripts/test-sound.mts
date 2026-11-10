/**
 * Test de la banque de sons (chantier son V2) — `npm run test:sound`. Hors navigateur : cuit toute la banque comme le
 * Worker et vérifie ce qui casserait le jeu sans bruit… ou avec trop : valeurs non finies, crête, durées, boucles qui
 * claquent, sons attendus par le moteur absents, courbes son ↔ mouvement.
 */
import { renderBank, SOUND_IDS } from '../src/core/sound/bank';
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
let bytes = 0;
for (const [id, clips] of Object.entries(bank)) {
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
    const loop = id === 'foil' || id === 'paper' || id === 'air';
    check(loop ? dur > 1.5 && dur < 3 : dur > 0.03 && dur < 3.2, `${id}#${i} : durée ${dur.toFixed(2)} s`);
    // un son ponctuel finit en silence ; une texture boucle sans saut
    for (const x of c.ch) {
      if (loop) check(Math.abs(x[0] - x[x.length - 1]) < 0.12, `${id}#${i} : la boucle claque`);
      else check(Math.abs(x[x.length - 1]) < 0.01 && Math.abs(x[0]) < 0.05, `${id}#${i} : début ou fin qui claque`);
    }
  });
}
// tout ce que le moteur (audio.ts) demande existe
const needed = ['tap', 'tick', 'press', 'pop', 'land', 'thud', 'boom', 'coin', 'crack', 'foil', 'paper', 'air', ...NOTE_BASES.map((d) => `note${d}`), ...CHIME_SIZES.flatMap((s) => CHIME_BASES.map((b) => `chime${s}${b}`))];
for (const id of needed) check(SOUND_IDS.includes(id), `son attendu par le moteur absent de la banque : ${id}`);
check(bytes < 8 * 1048576, `banque trop lourde : ${(bytes / 1048576).toFixed(1)} Mo`);
// son ↔ mouvement : le souffle culmine là où la courbe va le plus vite
check(peakAt(velocityCurve(EASE.glide)) < 0.2, 'EASE.glide : le souffle doit culminer au départ');
check(peakAt(velocityCurve(EASE.heave)) > 0.7, 'EASE.heave : le souffle doit culminer à l’arrivée');
const mid = peakAt(velocityCurve(EASE.breathe));
check(mid > 0.35 && mid < 0.65, 'EASE.breathe : le souffle doit culminer au milieu');
for (const e of Object.values(EASE)) {
  const v = velocityCurve(e);
  check(v[0] === 0 && v[v.length - 1] === 0 && v.every((x) => x >= 0 && x <= 1.0001), 'courbe de vitesse hors bornes');
}
console.log(`${failed ? 'ÉCHEC' : 'OK'} — ${Object.keys(bank).length} sons, ${(bytes / 1048576).toFixed(2)} Mo, cuisson ${ms.toFixed(0)} ms`);
process.exit(failed ? 1 : 0);
