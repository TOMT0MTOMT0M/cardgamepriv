/**
 * CONTRÔLE d'une cuisson Retroussé (27/11) — sur les images ENCODÉES, relues par core/bakeInterp.ts (le code du jeu), y
 * compris entre deux images (f + 0,25 / 0,5 / 0,75). Code de sortie ≠ 0 si un contrôle échoue.
 *
 *   npx esbuild scripts/bake-tear/check.mts --bundle --platform=node --format=esm --outfile=.cache/bake-check.mjs \
 *     && node .cache/bake-check.mjs [fichiers.tear…] [--stats=.cache/bake-retrousse] [--verbose]
 *   (défaut : public/bake/retrousse-0.tear et retrousse-1.tear ; mesures de la simulation : stats-N.json écrits par la
 *   cuisson)
 *
 * Contrôles : étirement ≤ 1 % (≤ 2 % à ±0,5 image d'une rupture ; la part des instants concernés est donnée) · aucun
 * sommet plafonné à VMAX · écart des pinces ≤ 3 mm · aucun sommet du revers sous sa face à plus de 0,5 mm · aucune
 * inversion avant / dos · aucun sommet dans la pile à plus de 0,3 mm · |dièdre| ≤ 0,35 rad par arête hors du pli
 * COURANT (charnière courante, ou finale pendant la sortie, de yF − r à yF + πr + r en y de repos — lecture à valider
 * par Tom : la lettre des décisions dit « hors du pli final », cette mesure-là est donnée à titre d'information) · sur
 * la FACE (sous le pli courant), écart de dièdre à l'image 0 ≤ 0,35 rad · mesures de la simulation = ce fichier ·
 * aucune valeur écrêtée · fichier ≤ 2,0 Mo · les 3 tear-*.tear se décodent.
 * Mesures (sans seuil) : frémissement de normale de la face avant (zone jamais pliée) comparé à tear-0, courbure
 * résiduelle du revers (colonne 32), étendue en y du revers à p = 1, écart interpolation charnière / linéaire.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decode, type TearBake, type TearBakeHeader } from '../../src/core/tearBakeFormat';
import { bakeFrame, foldAt } from '../../src/core/bakeInterp';
import { FILM_GAP, retrousseCardY, stackHeight } from './retrousse.mts';
import { PACK_STACK, PACK_SIDE_SEAM, PACK } from '../../src/core/packCrease';

const argv = process.argv.slice(2);
const opt = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const VERBOSE = argv.includes('--verbose');
const files = argv.filter((a) => !a.startsWith('--'));
if (!files.length) files.push('public/bake/retrousse-0.tear', 'public/bake/retrousse-1.tear');
const STATS = opt('stats') ?? '.cache/bake-retrousse';

const load = (f: string): TearBake => {
  let buf = new Uint8Array(readFileSync(f));
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = new Uint8Array(gunzipSync(buf));
  const b = decode(buf);
  if (!b) throw new Error(`${f} : pas un enregistrement lisible`);
  return b;
};

/** arêtes des triangles (même triangulation que la cuisson) et arêtes intérieures (dièdres), par nappe */
function topology(h: TearBakeHeader) {
  const E: number[] = [], B: number[] = [];
  const nx = h.nx;
  for (const s of h.sheets) {
    const edges = new Map<number, number[]>();
    for (let j = 0; j < s.ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = s.base + j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        for (const t of [[a, b, d], [a, d, c]])
          for (let e = 0; e < 3; e++) {
            const p = t[e], q = t[(e + 1) % 3], o = t[(e + 2) % 3];
            const key = Math.min(p, q) * h.verts + Math.max(p, q);
            const X = edges.get(key);
            if (X) X.push(o);
            else edges.set(key, [Math.min(p, q), Math.max(p, q), o]);
          }
      }
    for (const X of edges.values()) {
      E.push(X[0], X[1]);
      if (X.length === 4) B.push(X[2], X[3], X[0], X[1]);
    }
  }
  return { E: Int32Array.from(E), B: Int32Array.from(B) };
}

function dihedral(P: Float32Array, i1: number, i2: number, i3: number, i4: number): number {
  const o1 = i1 * 3, o2 = i2 * 3, o3 = i3 * 3, o4 = i4 * 3;
  const ex = P[o4] - P[o3], ey = P[o4 + 1] - P[o3 + 1], ez = P[o4 + 2] - P[o3 + 2];
  const el = Math.hypot(ex, ey, ez);
  const a1x = P[o1] - P[o3], a1y = P[o1 + 1] - P[o3 + 1], a1z = P[o1 + 2] - P[o3 + 2];
  const b1x = P[o1] - P[o4], b1y = P[o1 + 1] - P[o4 + 1], b1z = P[o1 + 2] - P[o4 + 2];
  const a2x = P[o2] - P[o4], a2y = P[o2 + 1] - P[o4 + 1], a2z = P[o2 + 2] - P[o4 + 2];
  const b2x = P[o2] - P[o3], b2y = P[o2 + 1] - P[o3 + 1], b2z = P[o2 + 2] - P[o3 + 2];
  const n1x = a1y * b1z - a1z * b1y, n1y = a1z * b1x - a1x * b1z, n1z = a1x * b1y - a1y * b1x;
  const n2x = a2y * b2z - a2z * b2y, n2y = a2z * b2x - a2x * b2z, n2z = a2x * b2y - a2y * b2x;
  const l1 = Math.hypot(n1x, n1y, n1z), l2 = Math.hypot(n2x, n2y, n2z);
  if (l1 < 1e-12 || l2 < 1e-12 || el < 1e-9) return 0;
  const cx = n1y * n2z - n1z * n2y, cy = n1z * n2x - n1x * n2z, cz = n1x * n2y - n1y * n2x;
  return Math.atan2((cx * ex + cy * ey + cz * ez) / el / (l1 * l2), (n1x * n2x + n1y * n2y + n1z * n2z) / (l1 * l2));
}

/** normales de la nappe s (différences centrées sur la grille, comme le lecteur) */
function sheetNormals(h: TearBakeHeader, si: number, P: Float32Array, N: Float32Array) {
  const s = h.sheets[si], nx = h.nx;
  for (let j = 0; j < s.ny; j++) {
    const j0 = Math.max(0, j - 1), j1 = Math.min(s.ny - 1, j + 1);
    for (let i = 0; i < nx; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1);
      const a = (s.base + j * nx + i1) * 3, b = (s.base + j * nx + i0) * 3, c = (s.base + j1 * nx + i) * 3, d = (s.base + j0 * nx + i) * 3;
      const ux = P[a] - P[b], uy = P[a + 1] - P[b + 1], uz = P[a + 2] - P[b + 2];
      const vx = P[c] - P[d], vy = P[c + 1] - P[d + 1], vz = P[c + 2] - P[d + 2];
      let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
      const l = Math.hypot(x, y, z) || 1;
      const o = (s.base + j * nx + i) * 3;
      N[o] = x / l, N[o + 1] = y / l, N[o + 2] = z / l;
    }
  }
}

/**
 * frémissement : angle de normale d'un pas de progression au suivant, face avant, y ∈ [ya, yb], |x| < xm. Le pas est le
 * MÊME pour tous les fichiers (p = 1/48, celui des 49 images de la déchirure) : le Retroussé (97 images) est lu une
 * image sur deux.
 */
const JIT_STEP = 1 / 48;
const BRK_WIN = 0.5;
/** `uncovered` : seulement les sommets que le revers ne couvre pas aux deux pas (y de repos sous son bord, 2·yF − y0) */
function jitter(b: TearBake, ya: number, yb: number, xm: number, pMax = 1, uncovered = false) {
  const h = b.header, si = h.sheets.findIndex((s) => s.part === 'body' && s.side > 0), s = h.sheets[si];
  const P = new Float32Array(h.verts * 3), N0 = new Float32Array(h.verts * 3), N1 = new Float32Array(h.verts * 3);
  const ids: number[] = [];
  for (let j = 0; j < s.ny; j++) for (let i = 0; i < h.nx; i++) {
    const k = s.base + j * h.nx + i;
    if (s.ys[j] >= ya && s.ys[j] <= yb && Math.abs(b.rest[k * 3]) < xm) ids.push(k);
  }
  const all: number[] = [];
  let worst = 0, at = '';
  for (let st = 0; st <= Math.round(pMax / JIT_STEP); st++) {
    bakeFrame(b, Math.min(h.nTear - 1, st * JIT_STEP * (h.nTear - 1)), P, 'linear');
    sheetNormals(h, si, P, N1);
    // bord du revers au second pas (le plus bas des deux : le revers descend), 2 mm de marge
    const tip = uncovered && h.fold ? 2 * foldAt(h, Math.min(h.nTear - 1, st * JIT_STEP * (h.nTear - 1))) - h.fold.y0 - 0.02 : Infinity;
    if (st > 0)
      for (const k of ids) {
        if (b.rest[k * 3 + 1] > tip) continue;
        const a = Math.acos(Math.min(1, N0[k * 3] * N1[k * 3] + N0[k * 3 + 1] * N1[k * 3 + 1] + N0[k * 3 + 2] * N1[k * 3 + 2]));
        all.push(a);
        if (a > worst) (worst = a), (at = `p ${(st * JIT_STEP).toFixed(3)} (${(k - s.base) % h.nx},${Math.floor((k - s.base) / h.nx)})`);
      }
    N0.set(N1);
  }
  all.sort((a, c) => a - c);
  const mean = all.reduce((a, c) => a + c, 0) / Math.max(1, all.length);
  return { n: ids.length, mean, p99: all[Math.floor(all.length * 0.99)] ?? 0, max: all[all.length - 1] ?? 0, at };
}

let failed = 0;
const line = (ok: boolean | null, name: string, val: string, lim = '') => {
  if (ok === false) failed++;
  console.log(`${ok === null ? '  ·  ' : ok ? '  ok ' : 'ÉCHEC'}  ${name.padEnd(44)} ${val}${lim ? `   (seuil ${lim})` : ''}`);
};

// ── les 3 déchirures se décodent toujours
const tears: TearBake[] = [];
for (let i = 0; i < 3; i++) {
  try {
    const b = load(`public/bake/tear-${i}.tear`);
    const ok = b.header.scenario === undefined && b.frames.length === (b.header.nTear + b.header.nExit) * b.header.verts * 3;
    tears.push(b);
    line(ok, `tear-${i}.tear se décode`, `${b.header.verts} sommets × ${b.header.nTear + b.header.nExit} images`);
  } catch (e) {
    line(false, `tear-${i}.tear se décode`, String(e));
  }
}
const tearJit = tears[0] ? jitter(tears[0], -0.58, -0.48, 0.38) : null;
// face VISIBLE (ni pliée ni recouverte par le revers) : y ∈ [−0,30 ; 0] pendant p ≤ 0,5
const tearJit2 = tears[0] ? jitter(tears[0], -0.3, 0, 0.38, 0.5) : null;
const tearJit4 = tears[0] ? jitter(tears[0], -0.58, 0.3, 0.44) : null;
// référence : étirement de la déchirure en ligne (corps seul, hors des 2 rangées de la ligne de déchirure), images enregistrées
if (tears[0]) {
  const b = tears[0], h = b.header, { E } = topology(h);
  const P = new Float32Array(h.verts * 3);
  const body = h.sheets.filter((s) => s.part === 'body');
  const inBody = (k: number) => body.some((s) => k >= s.base && k < s.base + (s.ny - 2) * h.nx);
  let worst = 0, sum = 0, cnt = 0;
  const per: number[] = [];
  for (let f = 0; f < h.nTear + h.nExit; f++) {
    bakeFrame(b, f, P);
    let m = 0;
    for (let e = 0; e < E.length; e += 2) {
      const a = E[e], c = E[e + 1];
      if (!inBody(a) || !inBody(c)) continue;
      const L0 = Math.hypot(b.rest[a * 3] - b.rest[c * 3], b.rest[a * 3 + 1] - b.rest[c * 3 + 1], b.rest[a * 3 + 2] - b.rest[c * 3 + 2]);
      const s2 = Math.abs(Math.hypot(P[a * 3] - P[c * 3], P[a * 3 + 1] - P[c * 3 + 1], P[a * 3 + 2] - P[c * 3 + 2]) / L0 - 1);
      m = Math.max(m, s2), (sum += s2), cnt++;
    }
    per.push(m), (worst = Math.max(worst, m));
  }
  per.sort((a, c) => a - c);
  line(null, 'référence tear-0 : étirement du corps', `max ${(worst * 100).toFixed(2)} %  médiane des max par image ${(per[per.length >> 1] * 100).toFixed(2)} %  moyenne ${((sum / cnt) * 100).toFixed(3)} %`);
}

for (const file of files) {
  console.log(`\n── ${file}`);
  if (!existsSync(file)) {
    line(false, 'fichier présent', 'absent');
    continue;
  }
  const size = statSync(file).size;
  const b = load(file);
  const h = b.header;
  const fold = h.fold!;
  if (h.scenario !== 'retrousse' || !fold) {
    line(false, 'scénario retrousse', String(h.scenario));
    continue;
  }
  const stats = existsSync(`${STATS}/stats-${h.index}.json`) ? JSON.parse(readFileSync(`${STATS}/stats-${h.index}.json`, 'utf8')) : null;
  line(size <= 2.0e6, 'taille', `${(size / 1e6).toFixed(3)} Mo`, '≤ 2,0 Mo');
  let clamped = 0;
  for (let i = 0; i < b.frames.length; i++) if (b.frames[i] === 32767 || b.frames[i] === -32767) clamped++;
  line(clamped === 0, 'valeurs écrêtées', String(clamped), '0');
  if (stats) {
    // les mesures doivent venir de la cuisson de CE fichier (un réglage lancé sans STATSDIR les écraserait)
    line(stats.bytes === size, 'mesures de la simulation = ce fichier', `${stats.bytes} / ${size} octets`, 'égalité');
    line(stats.caps === 0, 'sommets plafonnés à VMAX (simulation)', String(stats.caps), '0');
    line(stats.gripMaxMm <= 3, 'écart des pinces (simulation)', `${stats.gripMaxMm.toFixed(2)} mm`, '≤ 3 mm');
  } else line(false, `mesures de la simulation (${STATS}/stats-${h.index}.json)`, 'absentes');

  const { E, B } = topology(h);
  const n = h.verts, nx = h.nx, F = h.nTear + h.nExit;
  const L0 = new Float32Array(E.length / 2);
  for (let e = 0; e < L0.length; e++) {
    const a = E[e * 2] * 3, c = E[e * 2 + 1] * 3;
    L0[e] = Math.hypot(b.rest[a] - b.rest[c], b.rest[a + 1] - b.rest[c + 1], b.rest[a + 2] - b.rest[c + 2]);
  }
  const P = new Float32Array(n * 3), PL = new Float32Array(n * 3);
  bakeFrame(b, 0, P);
  const th0 = new Float32Array(B.length / 4);
  for (let c = 0; c < th0.length; c++) th0[c] = dihedral(P, B[c * 4], B[c * 4 + 1], B[c * 4 + 2], B[c * 4 + 3]);
  const front = h.sheets.find((s) => s.side > 0)!, back = h.sheets.find((s) => s.side < 0)!;
  const ys = front.ys, ny = front.ny, dy = (ys[ny - 1] - ys[0]) / (ny - 1);
  const brkP = (h.events ?? []).filter((e) => e.p !== undefined).map((e) => e.p!);
  // fenêtre « à une rupture » : ±BRK_WIN image autour de chaque rupture (0,5 : la relecture trouvait ±1 trop large)
  const nearBreak = (f: number) => f < h.nTear && brkP.some((p) => Math.abs(p * (h.nTear - 1) - f) <= BRK_WIN);
  let nBrk = 0, nAll = 0;
  const SEAM_X = PACK.w / 2 - PACK_SIDE_SEAM, SEAM_Y = PACK.h / 2 - PACK.crimp;
  const wr = { st: [0, ''], stB: [0, ''], flap: [0, ''], inv: [0, ''], stack: [0, ''], dh: [0, ''], dD: [0, ''], dhF: [0, ''], dhL: [0, ''], dDf: [0, ''], dev: [0, ''] } as Record<string, [number, string]>;
  const bump = (k: string, v: number, where: string) => {
    if (v > wr[k][0]) wr[k] = [v, where];
  };
  const tagOf = (k: number) => {
    const s = h.sheets.find((q) => k >= q.base && k < q.base + q.ny * nx)!;
    return `${s.side > 0 ? 'av' : 'dos'}(${(k - s.base) % nx},${Math.floor((k - s.base) / nx)})`;
  };
  const perImg: number[] = [];
  for (let f = 0; f < F; f++)
    for (const sub of f < F - 1 ? [0, 0.25, 0.5, 0.75] : [0]) {
      const fr = f + sub;
      bakeFrame(b, fr, P);
      const at = `image ${fr.toFixed(2)}`;
      const exit = fr > h.nTear - 1;
      const yF = exit ? fold.yE : foldAt(h, fr);
      const cyc = exit ? retrousseCardY((fr - h.nTear) / h.exitFps) : PACK_STACK.cy;
      // étirement
      let st = 0, sk = 0;
      for (let e = 0; e < L0.length; e++) {
        const a = E[e * 2] * 3, c = E[e * 2 + 1] * 3;
        const s2 = Math.abs(Math.hypot(P[a] - P[c], P[a + 1] - P[c + 1], P[a + 2] - P[c + 2]) / L0[e] - 1);
        if (s2 > st) (st = s2), (sk = E[e * 2]);
      }
      if (sub === 0) perImg.push(st);
      nAll++;
      if (nearBreak(fr)) bump('stB', st, `${at} ${tagOf(sk)}`), nBrk++;
      else bump('st', st, `${at} ${tagOf(sk)}`);
      // dièdres
      for (let c = 0; c < th0.length; c++) {
        const i3 = B[c * 4 + 2], i4 = B[c * 4 + 3];
        const y = (b.rest[i3 * 3 + 1] + b.rest[i4 * 3 + 1]) / 2;
        const th = dihedral(P, B[c * 4], B[c * 4 + 1], i3, i4);
        // le pli lui-même (charnière courante, ou finale pendant la sortie : yF − r … yF + πr + r en y de repos) est
        // exclu du contrôle ; son maximum est donné à titre d'information (attendu : pas / r ≈ 0,2 rad par arête)
        let d = th - th0[c];
        if (d > Math.PI) d -= 2 * Math.PI;
        else if (d < -Math.PI) d += 2 * Math.PI;
        // lettre des décisions (« hors du pli FINAL ») : seul le pli final est exclu, pendant toute la cuisson
        if (!(y > fold.yE - fold.r && y < fold.yE + Math.PI * fold.r + fold.r)) bump('dhL', Math.abs(th), `${at} ${tagOf(i3)}`);
        // la FACE (sous le pli courant, jamais retournée) : écart à l'image 0
        if (y <= yF - fold.r) bump('dDf', Math.abs(d), `${at} ${tagOf(i3)}`);
        if (y > yF - fold.r && y < yF + Math.PI * fold.r + fold.r) {
          bump('dhF', Math.abs(th), `${at} ${tagOf(i3)}`);
          continue;
        }
        bump('dh', Math.abs(th), `${at} ${tagOf(i3)}`);
        bump('dD', Math.abs(d), `${at} ${tagOf(i3)}`);
      }
      // avant / dos, pile, revers sous sa face
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const kf = front.base + j * nx + i, kb = back.base + j * nx + i;
          const xr = b.rest[kf * 3], yr = ys[j];
          const fused = Math.abs(xr) >= SEAM_X - 1e-6 || Math.abs(yr) >= SEAM_Y - 1e-6;
          // (soudure encore intacte : sous la charnière, ou cran du haut avant sa rupture)
          if (!fused || (yr > yF && !(yr > 0 && !exit && fr / (h.nTear - 1) < fold.pTop + 0.01))) bump('inv', P[kb * 3 + 2] - P[kf * 3 + 2] - 2 * h.q, `${at} (${i},${j})`);
          for (const s of [front, back]) {
            const side = s.side, k = s.base + j * nx + i, o = k * 3;
            if (yr < yF - fold.r) {
              const hz = stackHeight(cyc, P[o], P[o + 1], side);
              if (!Number.isNaN(hz)) bump('stack', side * (hz - P[o + 2]), `${at} ${tagOf(k)}`);
            }
            if (yr > yF + (fold.r * Math.PI) / 2) {
              const yc = P[o + 1];
              if (yc >= yF - dy) continue;
              const t = (yc - ys[0]) / dy, jj = Math.floor(t);
              if (jj < 0 || jj + 1 >= ny || ys[jj + 1] >= yF) continue;
              const u = t - jj;
              const zf = P[(s.base + jj * nx + i) * 3 + 2] * (1 - u) + P[(s.base + (jj + 1) * nx + i) * 3 + 2] * u;
              bump('flap', side * (zf - P[o + 2]), `${at} ${tagOf(k)}`);
            }
          }
        }
      // écart charnière / linéaire (information)
      if (sub > 0 && !exit) {
        bakeFrame(b, fr, PL, 'linear');
        for (let k = 0; k < n; k++) bump('dev', Math.hypot(P[k * 3] - PL[k * 3], P[k * 3 + 1] - PL[k * 3 + 1], P[k * 3 + 2] - PL[k * 3 + 2]), `${at} ${tagOf(k)}`);
      }
    }
  const mm = (v: number) => `${(v * 100).toFixed(3)} mm`;
  line(wr.st[0] <= 0.01, 'étirement en régime', `${(wr.st[0] * 100).toFixed(2)} % @ ${wr.st[1]}`, '≤ 1 %');
  line(wr.stB[0] <= 0.02, `étirement à une rupture (±${BRK_WIN} image)`, `${(wr.stB[0] * 100).toFixed(2)} % @ ${wr.stB[1]}  (${nBrk}/${nAll} instants, ${((100 * nBrk) / nAll).toFixed(0)} %)`, '≤ 2 %');
  line(wr.flap[0] <= 0.005, 'revers sous sa face', `${mm(Math.max(0, wr.flap[0]))} @ ${wr.flap[1]}`, '≤ 0,5 mm');
  line(wr.inv[0] <= 0, 'inversion avant / dos (au-delà de 2 q)', `${mm(Math.max(0, wr.inv[0]))} @ ${wr.inv[1]}`, '0');
  line(wr.stack[0] <= 0.003, 'film dans la pile', `${mm(Math.max(0, wr.stack[0]))} @ ${wr.stack[1]}`, '≤ 0,3 mm');
  line(wr.dh[0] <= 0.35, '|dièdre| par arête (hors du pli courant)', `${wr.dh[0].toFixed(3)} rad @ ${wr.dh[1]}`, '≤ 0,35 rad');
  line(wr.dDf[0] <= 0.35, 'face : écart de dièdre à l\'image 0', `${wr.dDf[0].toFixed(3)} rad @ ${wr.dDf[1]}`, '≤ 0,35 rad');
  line(null, '  … |dièdre| hors du pli FINAL seulement', `${wr.dhL[0].toFixed(3)} rad @ ${wr.dhL[1]} (lettre des décisions : le pli courant y compte)`);
  line(null, '  … dans le pli courant (exclu)', `${wr.dhF[0].toFixed(3)} rad @ ${wr.dhF[1]} (pas / r = ${(dy / fold.r).toFixed(3)})`);
  line(null, '  … écart à l\'image 0 hors du pli (revers compris)', `${wr.dD[0].toFixed(3)} rad @ ${wr.dD[1]} (le revers retourné inverse les petits plis du repos)`);
  // mesures
  const st0 = perImg[0];
  const simSt = stats ? Math.max(...stats.diags.map((d: { st: number }) => d.st)) : NaN;
  line(null, 'étirement à l\'image 0 / simulation (non quantifiée)', `${(st0 * 100).toFixed(2)} % (repos posé + quantification q = ${h.q}) / max ${(simSt * 100).toFixed(2)} % aux images enregistrées`);
  perImg.sort((a, c) => a - c);
  line(null, 'étirement : médiane des max par image', `${(perImg[perImg.length >> 1] * 100).toFixed(2)} %  (≤ 1 % : ${perImg.filter((x) => x <= 0.01).length}/${perImg.length} images)`);
  line(null, 'interpolation charnière − linéaire (max)', `${mm(wr.dev[0])} @ ${wr.dev[1]}`);
  const jit = jitter(b, -0.58, -0.48, 0.38);
  line(null, 'frémissement face avant y∈[−0,58 ; −0,48]', `moy ${(jit.mean * 1000).toFixed(2)} mrad  p99 ${(jit.p99 * 1000).toFixed(2)}  max ${(jit.max * 1000).toFixed(2)} @ ${jit.at} (${jit.n} sommets, pas p = 1/${Math.round(1 / JIT_STEP)} pour les deux)`);
  if (tearJit) line(null, '  … même zone, tear-0', `moy ${(tearJit.mean * 1000).toFixed(2)} mrad  p99 ${(tearJit.p99 * 1000).toFixed(2)}  max ${(tearJit.max * 1000).toFixed(2)}`);
  const jit2 = jitter(b, -0.3, 0, 0.38, 0.5);
  line(null, 'frémissement face visible y∈[−0,30 ; 0], p≤0,5', `moy ${(jit2.mean * 1000).toFixed(2)} mrad  p99 ${(jit2.p99 * 1000).toFixed(2)}  max ${(jit2.max * 1000).toFixed(2)} @ ${jit2.at}`);
  if (tearJit2) line(null, '  … même zone, tear-0', `moy ${(tearJit2.mean * 1000).toFixed(2)} mrad  p99 ${(tearJit2.p99 * 1000).toFixed(2)}  max ${(tearJit2.max * 1000).toFixed(2)}`);
  const jit3 = jitter(b, -0.3, 0, 0.38, 1, true);
  line(null, '  … même zone, non couverte par le revers, p≤1', `moy ${(jit3.mean * 1000).toFixed(2)} mrad  p99 ${(jit3.p99 * 1000).toFixed(2)}  max ${(jit3.max * 1000).toFixed(2)} @ ${jit3.at}`);
  const jit4 = jitter(b, -0.58, 0.3, 0.44, 1, true);
  line(null, 'frémissement face y∈[−0,58 ; 0,30] non couverte', `moy ${(jit4.mean * 1000).toFixed(2)} mrad  p99 ${(jit4.p99 * 1000).toFixed(2)}  max ${(jit4.max * 1000).toFixed(2)} @ ${jit4.at}`);
  if (tearJit4) line(null, '  … même zone, tear-0 (p≤1)', `moy ${(tearJit4.mean * 1000).toFixed(2)} mrad  p99 ${(tearJit4.p99 * 1000).toFixed(2)}  max ${(tearJit4.max * 1000).toFixed(2)} @ ${tearJit4.at}`);
  bakeFrame(b, h.nTear - 1, P);
  let y0 = Infinity, y1 = -Infinity;
  for (const s of [front, back]) for (let j = 0; j < ny; j++) if (ys[j] > fold.yE + fold.r) for (let i = 0; i < nx; i++) {
    const y = P[(s.base + j * nx + i) * 3 + 1];
    y0 = Math.min(y0, y), y1 = Math.max(y1, y);
  }
  line(null, 'revers à p = 1 : étendue en y', `${y0.toFixed(3)} … ${y1.toFixed(3)} (bas du sachet −${(PACK.h / 2).toFixed(4)})`);
  if (stats) line(null, 'courbure résiduelle du revers (col. 32, fin)', `avant ${stats.curl[0]} rad / dos ${stats.curl[1]} rad`);
  const ev = h.events ?? [];
  line(null, 'événements', `${ev.length} : ${['lock', 'top', 'side', 'land'].map((k) => `${k} ${ev.filter((e) => e.k === k).length}`).join(', ')}`);
  if (VERBOSE) for (const e of ev) console.log('       ', JSON.stringify(e));
}
console.log(failed ? `\n${failed} contrôle(s) en échec` : '\ntous les contrôles passent');
process.exit(failed ? 1 : 0);
