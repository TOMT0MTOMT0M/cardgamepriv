/**
 * (V3, lot 11) Contrôle de la bille de la roulette (src/game/views/rouletteBall.ts), hors navigateur :
 *   npx esbuild scripts/test-roulette.mts --bundle --platform=node --format=esm --outfile=.cache/test-roulette.mjs --log-level=warning && node .cache/test-roulette.mjs
 * Pour chaque numéro (roues de 24, 36 et 37 cases), plusieurs états de départ, chaque cadence d'écran (60/90/120/144 Hz,
 * avec gigue) et des onglets mis en arrière-plan pendant le tirage, on rejoue la boucle d'images avec des temps
 * synthétiques. Exigé : écart final = 0 (bille au centre exact de l'alvéole du numéro), position continue (aucun saut),
 * bille toujours dans son alvéole après la capture, 1 à 3 chocs sur les losanges, chaque son prévu joué une fois.
 */
import { BALL_R, planSpin, poseAt, restFor, restPose, soundsBetween, ballVelAt, type BallPlan } from '../src/game/views/rouletteBall';

let fails = 0;
const fail = (m: string) => {
  if (fails++ < 20) console.error('ÉCHEC', m);
};
const mod = (a: number, m: number) => ((a % m) + m) % m;
const angDiff = (a: number, b: number) => mod(a - b + 180, 360) - 180;

/** boucle d'images : instants (ms depuis t0) donnés par `clock`, k absolu, comme rouletteWheel.ts */
function run(plan: BallPlan, T: number, clock: (i: number) => number) {
  let kPrev = 0;
  const sounds: string[] = [];
  let pose = poseAt(plan, 0);
  for (let i = 0; i < 100000; i++) {
    const t = clock(i);
    const k = Math.min(1, Math.max(0, t / T));
    pose = poseAt(plan, k);
    for (const s of soundsBetween(plan, kPrev, k, T)) sounds.push(s.kind);
    kPrev = k;
    if (k >= 1) return { pose, sounds, frames: i + 1 };
  }
  throw new Error('boucle sans fin');
}

const rng = (() => {
  let s = 12345;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
})();

const HZ = [60, 90, 120, 144];
const stats = { spins: 0, hits: [0, 0, 0, 0], maxJump: 0, maxRattle: 0, kdMin: 1, kdMax: 0, v0: [Infinity, 0], vd: [Infinity, 0] };

for (const n of [24, 36, 37]) {
  const step = 360 / n;
  for (let num = 1; num <= n; num++) {
    // états de départ : roue neuve (bille sur la piste), repos après un tirage précédent (bille dans l'alvéole)
    const starts: Array<{ w0: number; b0: number; r0: number }> = [{ w0: 0, b0: 0, r0: BALL_R.track }];
    for (let j = 0; j < 3; j++) {
      const prev = 1 + Math.floor(rng() * n);
      const r = restPose(n, prev, 360 * Math.floor(rng() * 9));
      starts.push({ w0: r.wheel, b0: mod(r.ball, 360), r0: r.r });
    }
    for (const st of starts) {
      for (const T of [5600, 5200]) {
        const plan = planSpin(n, num, st.w0, st.b0, st.r0);
        stats.spins++;
        stats.hits[plan.impacts.length]++;
        stats.kdMin = Math.min(stats.kdMin, plan.kd);
        stats.kdMax = Math.max(stats.kdMax, plan.kd);
        const v0 = Math.abs(plan.ang[0].m0), vd = Math.abs(plan.ang[0].m1);
        stats.v0 = [Math.min(stats.v0[0], v0), Math.max(stats.v0[1], v0)];
        stats.vd = [Math.min(stats.vd[0], vd), Math.max(stats.vd[1], vd)];
        if (plan.impacts.length < 1 || plan.impacts.length > 3) fail(`n=${n} num=${num} chocs=${plan.impacts.length}`);
        if (!(plan.kd > 0.35)) fail(`n=${n} num=${num} décrochage trop tôt kd=${plan.kd}`);
        if (!(v0 > vd * 2)) fail(`n=${n} num=${num} orbite qui ne ralentit pas v0=${v0} vd=${vd}`);
        // départ : là où était la bille (à 360° près)
        const p0 = poseAt(plan, 0);
        if (Math.abs(angDiff(p0.ball, st.b0)) > 1e-6 || Math.abs(p0.wheel - st.w0) > 1e-9 || Math.abs(p0.r - st.r0) > 1e-9) fail(`n=${n} num=${num} départ décalé`);
        // continuité : pas de 1 ms, aucun saut de position (vitesse max ≈ 1,6°/ms)
        let prev = p0;
        for (let t = 1; t <= T; t++) {
          const k = t / T;
          const p = poseAt(plan, k);
          const jb = Math.abs(p.ball - prev.ball), jr = Math.abs(p.r - prev.r), jw = Math.abs(p.wheel - prev.wheel);
          stats.maxJump = Math.max(stats.maxJump, jb);
          if (jb > 2.5 || jr > 0.5 || jw > 1.5) fail(`n=${n} num=${num} saut à k=${k.toFixed(4)} bille=${jb.toFixed(3)}° r=${jr.toFixed(3)} roue=${jw.toFixed(3)}°`);
          if (p.r < 62 + 4.2 - 1e-9 || p.r > 106 - 4.2 + 1e-9) fail(`n=${n} num=${num} bille hors de la roue r=${p.r}`);
          if (p.phase === 3) {
            // dans l'alvéole : jamais plus loin du centre que la demi-alvéole moins la bille
            const rel = angDiff(p.ball - p.wheel, (num - 1) * step);
            stats.maxRattle = Math.max(stats.maxRattle, Math.abs(rel));
            const room = ((step / 2) * Math.PI * p.r) / 180 - 4.2;
            if ((Math.abs(rel) * Math.PI * p.r) / 180 > room + 1e-9) fail(`n=${n} num=${num} bille sort de l'alvéole rel=${rel}`);
          }
          // la bille ne repart jamais en arrière avant d'être attrapée par le cylindre
          if (p.phase < 2 && ballVelAt(plan, k) > 0) fail(`n=${n} num=${num} bille à rebours k=${k}`);
          prev = p;
        }
        // chaque cadence (avec gigue d'horloge), puis onglet en arrière-plan
        const clocks: Array<[string, (i: number) => number]> = HZ.map((hz) => [`${hz} Hz`, (i: number) => (i * 1000) / hz + (i ? (rng() - 0.5) * 2 : 0)] as [string, (i: number) => number]);
        clocks.push(['arrière-plan 1,2 s → fin', (i) => (i < 72 ? (i * 1000) / 60 : T + 800)]);
        clocks.push(['arrière-plan 2,5 → 4,4 s', (i) => (i < 150 ? (i * 1000) / 60 : 4400 + (i - 150) * (1000 / 120))]);
        clocks.push(['image tardive (rAF < t0)', (i) => (i === 0 ? -3 : (i * 1000) / 144)]);
        for (const [name, clock] of clocks) {
          const { pose, sounds } = run(plan, T, clock);
          const rest = restFor(n, num);
          const ecartRoue = mod(pose.wheel - rest, 360);
          // bille exactement sous le repère (0°) et roue exactement sur `restFor` : le centre de l'alvéole du numéro
          // est sous le repère, donc sous la bille (vérifié aussi dans le repère du cylindre, au flottant près si 360/n
          // n'est pas entier)
          const ecartAbs = mod(pose.ball, 360);
          const ecartBille = angDiff(pose.ball - pose.wheel, (num - 1) * step);
          if (ecartRoue !== 0 || ecartAbs !== 0 || Math.abs(ecartBille) > (Number.isInteger(step) ? 0 : 1e-9) || pose.r !== BALL_R.pocket) fail(`n=${n} num=${num} ${name} T=${T} écart roue=${ecartRoue} bille=${ecartBille} abs=${ecartAbs} r=${pose.r}`);
          if (name.endsWith('Hz')) {
            const want = plan.events.map((e) => e.kind).join(',');
            const got = sounds.filter((s) => s !== 'track' && !(s === 'fret' && false)).filter((s) => s === 'deflector' || s === 'pocket').join(',');
            const wantHits = plan.events.filter((e) => e.kind !== 'fret').map((e) => e.kind).join(',');
            if (got !== wantHits) fail(`n=${n} num=${num} ${name} sons ${got} ≠ ${wantHits} (${want})`);
            if (!sounds.includes('track')) fail(`n=${n} num=${num} ${name} pas de cliquetis de piste`);
          } else if (name.startsWith('arrière-plan 1,2')) {
            // revenu après la fin : aucun son rejoué en rafale
            if (sounds.some((s) => s !== 'track')) fail(`n=${n} num=${num} ${name} sons rejoués en rafale`);
          }
        }
      }
    }
  }
}
console.log(`${stats.spins} tirages × ${HZ.length} cadences + 3 horloges dégradées · chocs 1/2/3 : ${stats.hits.slice(1).join('/')} · décrochage k=${stats.kdMin.toFixed(3)}..${stats.kdMax.toFixed(3)} · lancer ${Math.round(stats.v0[0])}..${Math.round(stats.v0[1])}°/k → décroche à ${Math.round(stats.vd[0])}..${Math.round(stats.vd[1])}°/k · pas max ${stats.maxJump.toFixed(3)}°/ms · va-et-vient max ${stats.maxRattle.toFixed(2)}°`);
if (fails) {
  console.error(`${fails} échec(s)`);
  process.exit(1);
}
console.log('OK : écart final = 0 pour chaque numéro, chaque cadence, onglet en arrière-plan compris');
