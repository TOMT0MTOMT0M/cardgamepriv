/**
 * (14/11) JAUGE D'ÉTOILES en 3D — un vrai objet, comme les boosters (retour de Tom) : un tube de verre entre deux bagues
 * d'acier brossé, et dedans un nuage de particules en VOLUME (260 points par tube, qui orbitent autour de l'axe, passent
 * devant et derrière, dérivent vers le front et y renaissent) dans une brume qui respire. three.js + TSL.
 * Optimisé pour ne rien coûter :
 *  - UN seul moteur, UN seul petit canevas caché (640 × 80 px par jauge, 8 au plus), 4 appels de dessin par image pour
 *    TOUTES les jauges (maillages instanciés : particules, brume, verre, bagues) ; les particules sont placées et
 *    animées dans le vertex shader (aucun calcul JS par point) ; reflets du verre calculés depuis la normale (pas de
 *    carte d'environnement) ;
 *  - chaque jauge à l'écran n'est qu'un <canvas> 2D qui recopie sa bande ; 60 images/s quand un niveau bouge, 30 au
 *    repos ; rien quand l'onglet est caché ; tout est libéré dès que la partie quitte l'écran. Module chargé à la
 *    demande (gameFx.ts) ; s'il échoue, la jauge CSS reste.
 */
import { AdditiveBlending, CapsuleGeometry, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicNodeMaterial, OrthographicCamera, PlaneGeometry, Scene, Vector4, WebGPURenderer } from 'three/webgpu';
import { abs, clamp, float, floor, fract, hash, instanceIndex, int, length, max, mix, mx_noise_float, normalView, positionLocal, pow, sin, cos, smoothstep, sqrt, step, uniform, uniformArray, uv, varying, vec2, vec3, vec4 } from 'three/tsl';

const MAX = 8;
const W = 640;
const H = 80;
/** unités du monde : une jauge = une bande de hauteur 1 et de largeur A */
const A = W / H;
/** le tube : rayon, marge aux extrémités, longueur utile */
const R = 0.34;
const X0 = 0.62;
const LEN = A - 2 * X0;
/** particules par tube (vrais points en volume : ils tournent autour de l'axe, passent devant et derrière) */
const PER = 260;

export interface GaugeGL {
  set(level: number): void;
  end(win: boolean): void;
}
interface G {
  el: HTMLElement;
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  target: number;
  level: number;
  vel: number;
  slosh: number;
  energy: number;
  energyTo: number;
  seed: number;
}

let gauges: G[] = [];
let renderer: WebGPURenderer | null = null;
let starting: Promise<boolean> | null = null;
let raf = 0;
let last = 0;
let odd = false;
const data = Array.from({ length: MAX }, () => new Vector4(0, 0, 1, 0));
const uData = uniformArray(data);
const uTime = uniform(0);
const scene = new Scene();
// (vue de face, sans perspective : chaque tube remplit exactement sa bande ; le volume vient des normales et de la
// profondeur des particules)
const camera = new OrthographicCamera(0, A, 0, -MAX, 0.1, 20);
camera.position.z = 5;
let built = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const TAU = 6.28318;
const BLUE: N = vec3(0.16, 0.6, 1.0);
const ICE: N = vec3(0.62, 0.92, 1.0);

/** finit de régler la couleur selon la fin de partie (gagnant plus vif, perdant éteint et désaturé) */
const finish = (col: N, energy: N): N => {
  const lum: N = col.dot(vec3(0.3, 0.55, 0.15));
  return mix(vec3(lum), col, clamp(energy, 0.2, 1)).mul(mix(0.3, 1.0, clamp(energy, 0, 1))).mul(max(energy, 1).mul(0.45).add(0.55));
};

function build() {
  if (built) return;
  built = true;
  const ident = new Matrix4();
  const place = (m: InstancedMesh, f: (i: number, mat: Matrix4) => void) => {
    for (let i = 0; i < m.count; i++) (f(i, ident.identity()), m.setMatrixAt(i, ident));
    m.frustumCulled = false;
    scene.add(m);
  };
  const cy = (i: number) => -(i + 0.5);

  // ── 1. PARTICULES : PER points par tube, placés et animés dans le vertex shader (rien n'est calculé en JS) ──
  {
    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending });
    const idx: N = float(instanceIndex);
    const tube: N = floor(idx.div(PER));
    const g: N = uData.element(int(tube));
    const level: N = g.x;
    const slosh: N = g.y;
    const seed: N = g.w;
    const t: N = uTime;
    const h1: N = hash(idx.add(seed));
    const h2: N = hash(idx.mul(1.7).add(11.3));
    const h3: N = hash(idx.mul(2.3).add(27.1));
    const h4: N = hash(idx.mul(3.1).add(5.9));
    const breath: N = sin(t.mul(0.9).add(seed.mul(3))).mul(0.5).add(0.5);
    // le long du tube : chaque point dérive vers le front, s'y accumule, puis renaît à l'origine
    const u0: N = fract(h1.add(t.mul(h2.mul(0.045).add(0.018))));
    const along: N = float(1).sub(pow(float(1).sub(u0), 2.4)).mul(level.add(h3.mul(0.035).mul(slosh.mul(4).add(1))));
    // autour de l'axe : orbite lente, rayon qui respire (le nuage gonfle et se resserre)
    const ang: N = h3.mul(TAU).add(t.mul(h4.mul(1.1).add(0.25)).mul(h2.sub(0.5).sign()));
    const rad: N = sqrt(h2).mul(R * 0.86).mul(breath.mul(0.16).add(0.86));
    const z: N = cos(ang).mul(rad);
    const zn: N = z.div(R).mul(0.5).add(0.5); // 0 = au fond, 1 = devant
    const life: N = smoothstep(0.0, 0.07, u0).mul(float(1).sub(smoothstep(0.9, 1.0, u0))).mul(step(0.004, level));
    const tw: N = sin(t.mul(h4.mul(2.5).add(1.2)).add(h1.mul(40))).mul(0.3).add(0.7);
    const size: N = h4.mul(h4).mul(0.085).add(0.03).mul(zn.mul(0.5).add(0.6)).mul(life);
    mat.positionNode = vec3(along.mul(LEN).add(X0).add(positionLocal.x.mul(size)), tube.add(0.5).negate().add(sin(ang).mul(rad)).add(positionLocal.y.mul(size)), z);
    const vCol: N = varying(finish(mix(BLUE, ICE, h4).mul(zn.mul(0.75).add(0.25)).mul(tw).mul(life), g.z));
    const disc: N = smoothstep(0.5, 0.12, length(uv().sub(0.5)));
    mat.colorNode = vec4(vCol.mul(disc), disc);
    place(new InstancedMesh(new PlaneGeometry(1, 1), mat, MAX * PER), () => undefined);
  }

  // ── 2. BRUME : un plan dans chaque tube, épais au centre (profil de cylindre), rongé par du bruit ──
  {
    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending });
    const tube: N = varying(float(instanceIndex));
    const g: N = uData.element(int(tube));
    const t: N = uTime;
    const p: N = uv();
    const yy: N = p.y.mul(2).sub(1);
    const thick: N = sqrt(max(float(1).sub(yy.mul(yy)), 0));
    const q: N = vec2(p.x.mul(LEN), yy.mul(R));
    const breath: N = sin(t.mul(0.9).add(g.w.mul(3))).mul(0.5).add(0.5);
    const n1: N = mx_noise_float(vec3(q.x.mul(0.6).sub(t.mul(0.1)), q.y.mul(2.2), t.mul(0.14).add(g.w)));
    const n2: N = mx_noise_float(vec3(q.x.mul(1.5).sub(t.mul(0.22)).add(n1), q.y.mul(4.0).add(n1.mul(0.6)), g.w.add(t.mul(0.22))));
    const cloud: N = clamp(n1.mul(0.55).add(n2.mul(0.45)).add(0.55), 0, 1);
    const d: N = g.x.add(n1.mul(0.04)).sub(p.x);
    const fill: N = smoothstep(-0.03, g.y.mul(0.1).add(0.08), d).mul(step(0.004, g.x));
    const dens: N = pow(cloud, 1.4).mul(fill).mul(thick).mul(breath.mul(0.3).add(0.7));
    mat.colorNode = vec4(finish(mix(vec3(0.03, 0.12, 0.36), BLUE, cloud).mul(dens).mul(0.8), g.z), dens);
    place(new InstancedMesh(new PlaneGeometry(LEN + 2 * R, 2 * R).translate(X0 + LEN / 2, 0, 0), mat, MAX), (i, m) => m.makeTranslation(0, cy(i), 0));
    // (uv.x couvre LEN + 2R : le front à `level` reste juste à quelques pour cent près, la brume n'a pas de bord net)
  }

  // ── 3. VERRE : une capsule par tube ; reflets calculés depuis la normale (pas de carte d'environnement) ──
  {
    const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: AdditiveBlending });
    const n: N = normalView;
    const rim: N = pow(float(1).sub(abs(n.z)), 2.6).mul(0.42);
    // deux reflets de néons : un trait fin en haut, un plus large et pâle en bas
    const hi: N = smoothstep(0.52, 0.62, n.y).mul(float(1).sub(smoothstep(0.66, 0.78, n.y))).mul(0.5);
    const lo: N = smoothstep(-0.86, -0.7, n.y).mul(float(1).sub(smoothstep(-0.62, -0.4, n.y))).mul(0.1);
    const v: N = rim.add(hi).add(lo);
    mat.colorNode = vec4(vec3(0.82, 0.92, 1.0).mul(v), v);
    const geo = new CapsuleGeometry(R + 0.03, LEN, 10, 28).rotateZ(Math.PI / 2).translate(X0 + LEN / 2, 0, 0);
    place(new InstancedMesh(geo, mat, MAX), (i, m) => m.makeTranslation(0, cy(i), 0));
  }

  // ── 4. BAGUES usinées aux deux bouts (acier brossé : même pièce que le dos des cartes) ──
  {
    const mat = new MeshBasicNodeMaterial();
    const n: N = normalView;
    const brushed: N = hash(floor(positionLocal.y.mul(140))).mul(0.06);
    const shade: N = pow(max(n.y, 0), 2.0).mul(0.5).add(pow(max(n.y.negate(), 0), 3.0).mul(0.1)).add(0.1).add(brushed);
    mat.colorNode = vec4(vec3(0.92, 0.95, 1.0).mul(shade), 1);
    const geo = new CylinderGeometry(R + 0.07, R + 0.07, 0.16, 28, 1).rotateZ(Math.PI / 2);
    place(new InstancedMesh(geo, mat, MAX * 2), (i, m) => m.makeTranslation(i % 2 ? X0 + LEN + R * 0.55 : X0 - R * 0.55, cy(i >> 1), 0.5));
  }
}

async function start(): Promise<boolean> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H * MAX;
    // (repli WebGL2 imposé : le même shader TSL, mais sans ouvrir un second appareil WebGPU à côté de celui du jeu, et un
    // canevas WebGL se recopie en 2D partout de façon fiable)
    const r = new WebGPURenderer({ canvas, alpha: false, antialias: true, powerPreference: 'low-power', forceWebGL: true } as never);
    await r.init();
    r.setPixelRatio(1);
    r.setSize(W, H * MAX, false);
    r.setClearColor(0x030507, 1);
    build();
    renderer = r;
    return true;
  } catch (e) {
    console.warn('[jeux] jauge shader indisponible, jauge CSS gardée', e);
    return false;
  }
}

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
  for (const g of gauges) g.el.classList.remove('gl');
  gauges = [];
  renderer?.dispose();
  renderer = null;
  starting = null;
}

function frame(now: number) {
  raf = 0;
  gauges = gauges.filter((g) => g.el.isConnected);
  if (!gauges.length || !renderer) return stop();
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  let moving = false;
  gauges.forEach((g, i) => {
    // ressort amorti (ζ ≈ 0,45) : le niveau dépasse un peu, ballotte, se pose
    const acc = (g.target - g.level) * 70 - g.vel * 7.5;
    g.vel += acc * dt;
    g.level += g.vel * dt;
    g.slosh += (Math.min(1, Math.abs(g.vel) * 2.2) - g.slosh) * Math.min(1, dt * 5);
    g.energy += (g.energyTo - g.energy) * Math.min(1, dt * 2.2);
    if (Math.abs(g.vel) > 0.002 || Math.abs(g.target - g.level) > 0.001 || Math.abs(g.energyTo - g.energy) > 0.01) moving = true;
    data[i]!.set(Math.max(0, Math.min(1.02, g.level)), g.slosh, g.energy, g.seed);
  });
  for (let i = gauges.length; i < MAX; i++) data[i]!.set(0, 0, 0, 0);
  odd = !odd;
  // au repos : une image sur deux (le fluide vit toujours, à 30 images/s)
  if (moving || odd) {
    uTime.value = now / 1000;
    renderer.render(scene, camera);
    const src = renderer.domElement;
    gauges.forEach((g, i) => {
      const cw = g.cv.width;
      const ch = g.cv.height;
      g.ctx.clearRect(0, 0, cw, ch);
      g.ctx.drawImage(src, 0, i * H, W, H, 0, 0, cw, ch);
      g.el.classList.add('gl');
    });
  }
  raf = requestAnimationFrame(frame);
}

/** Branche une jauge (`.gm-gauge`) sur le shader ; null si plus de place ou moteur indisponible (la jauge CSS reste). */
export async function attachGauge(el: HTMLElement): Promise<GaugeGL | null> {
  if (gauges.length >= MAX) return null;
  if (!(await (starting ??= start()))) return null;
  if (!el.isConnected || gauges.length >= MAX) return null;
  const cv = document.createElement('canvas');
  cv.className = 'gm-gl';
  cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const r = el.getBoundingClientRect();
  cv.width = Math.max(64, Math.round((r.width || 320) * dpr));
  cv.height = Math.max(16, Math.round((r.height || 34) * dpr));
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  el.prepend(cv);
  const g: G = { el, cv, ctx, target: 0, level: 0, vel: 0, slosh: 0, energy: 1, energyTo: 1, seed: Math.random() * 50 };
  gauges.push(g);
  if (!raf) ((last = 0), (raf = requestAnimationFrame(frame)));
  return {
    set: (level) => (g.target = Math.max(0, Math.min(1, level))),
    end: (win) => (g.energyTo = win ? 1.7 : 0.18),
  };
}
