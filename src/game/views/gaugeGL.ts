/**
 * (14/11) JAUGE D'ÉTOILES, version shader — le fluide bioluminescent des parties (Pack Battle, Battle Royale) rendu en
 * TSL (three.js WebGPU, repli WebGL2 automatique). Optimisé pour ne rien coûter :
 *  - UN seul moteur de rendu, UN seul petit canevas caché (640 × 60 px par jauge, 8 jauges au plus), UN seul appel de
 *    dessin par image : chaque jauge est une bande du même quad, ses réglages dans un tableau d'uniformes ;
 *  - chaque jauge à l'écran n'est qu'un <canvas> 2D qui recopie sa bande (drawImage) : pas de contexte 3D par jauge ;
 *  - 60 images/s pendant qu'un niveau bouge, 30 au repos ; rien quand l'onglet est caché ; tout est libéré dès que la
 *    partie quitte l'écran. Module chargé à la demande (gameFx.ts) ; s'il échoue, la jauge CSS reste.
 * Le fluide : front qui ondule et ballotte quand le niveau monte (ressort), courants internes (bruit domaine-déformé),
 * lueur dont l'intensité respire, plancton qui scintille, liseré clair à la surface et halo qui déborde un peu.
 */
import { Mesh, MeshBasicNodeMaterial, OrthographicCamera, PlaneGeometry, Scene, Vector4, WebGPURenderer } from 'three/webgpu';
import { Fn, abs, clamp, exp, float, floor, fract, hash, int, length, max, mix, mx_noise_float, pow, sin, smoothstep, step, uniform, uniformArray, uv, vec2, vec3, vec4 } from 'three/tsl';

const MAX = 8;
const W = 640;
const H = 60;

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
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;
let mesh: Mesh | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const fluid = Fn(() => {
  const p: N = uv();
  const row: N = floor(float(1).sub(p.y).mul(MAX));
  const y: N = fract(float(1).sub(p.y).mul(MAX));
  const x: N = p.x;
  const g: N = uData.element(int(row));
  const level: N = g.x;
  const slosh: N = g.y;
  const energy: N = g.z;
  const seed: N = g.w;
  const t: N = uTime;
  const q: N = vec2(x.mul(W / H), y);

  // front : deux ondes + un bruit lent ; le ballottement (niveau qui bouge) les amplifie
  const wave: N = sin(y.mul(5.2).add(t.mul(1.6)).add(seed))
    .mul(0.007)
    .add(sin(y.mul(11.0).sub(t.mul(2.3)).add(seed.mul(2.1))).mul(0.0035))
    .add(mx_noise_float(vec3(y.mul(2.4), t.mul(0.45), seed)).mul(0.012));
  const front: N = level.add(wave.mul(slosh.mul(7).add(1))).sub(0.004);
  const d: N = front.sub(x); // > 0 : dans le fluide
  const inside: N = smoothstep(0.0, 0.0035, d).mul(step(0.002, level));

  // courants internes : bruit déformé par un autre bruit, qui dérive vers le front
  const n1: N = mx_noise_float(vec3(q.x.mul(0.55).sub(t.mul(0.12)), q.y.mul(1.7), t.mul(0.16).add(seed)));
  const n2: N = mx_noise_float(vec3(q.x.mul(1.5).sub(t.mul(0.26)).add(n1.mul(0.9)), q.y.mul(3.1).add(n1.mul(0.6)), seed.add(t.mul(0.3))));
  const veins: N = pow(clamp(n2.mul(0.5).add(0.5), 0, 1), 2.6);
  // la lueur respire (deux rythmes + le bruit lent) : jamais deux fois pareil
  const breath: N = sin(t.mul(0.83).add(seed.mul(3))).mul(0.16).add(sin(t.mul(0.37).add(seed)).mul(0.12)).add(n1.mul(0.22)).add(0.86);

  const deep: N = vec3(0.012, 0.085, 0.16);
  const mid: N = vec3(0.07, 0.5, 0.86);
  const light: N = vec3(0.56, 0.93, 1.0);
  // plus clair près du front (là où ça vit), plus profond vers l'origine
  const depth: N = clamp(d.mul(2.6), 0, 1);
  let col: N = mix(mid, deep, depth.mul(0.82));
  col = col.add(light.mul(veins).mul(breath).mul(0.55));
  // ménisque : bords haut et bas un peu plus sombres (volume)
  col = col.mul(mix(0.62, 1.0, smoothstep(0.0, 0.3, y).mul(float(1).sub(smoothstep(0.7, 1.0, y)))));

  // plancton : points qui scintillent en dérivant
  const pq: N = vec2(q.x.mul(3.2).sub(t.mul(0.22)), q.y.mul(3.2).add(sin(t.mul(0.4).add(q.x)).mul(0.15)));
  const cell: N = floor(pq);
  const h1: N = hash(cell.x.add(cell.y.mul(57.0)).add(seed.mul(13.0)));
  const off: N = vec2(hash(cell.x.mul(3.1).add(cell.y.mul(17.0))), hash(cell.x.mul(7.7).add(cell.y.mul(5.3)))).mul(0.6).add(0.2);
  const spark: N = smoothstep(0.16, 0.0, length(fract(pq).sub(off)))
    .mul(step(0.8, h1))
    .mul(sin(t.mul(2.2).add(h1.mul(40))).mul(0.5).add(0.5));
  col = col.add(light.mul(spark).mul(0.9));

  // surface : liseré très clair, puis halo qui déborde hors du fluide
  const edge: N = exp(abs(d).mul(-150)).mul(breath);
  const halo: N = exp(max(d.negate(), 0).mul(-34)).mul(step(d, 0)).mul(0.42).mul(breath).mul(step(0.002, level));
  col = col.add(vec3(0.85, 0.98, 1.0).mul(edge).mul(0.9));

  // fin de partie : gagnant plus vif, perdant éteint et désaturé
  const lum: N = col.dot(vec3(0.3, 0.55, 0.15));
  col = mix(vec3(lum), col, clamp(energy, 0.25, 1)).mul(mix(0.35, 1.0, clamp(energy, 0, 1))).mul(max(energy, 1).mul(0.5).add(0.5));
  const a: N = clamp(inside.mul(0.96).add(halo), 0, 1);
  const outCol: N = mix(light.mul(halo).mul(energy.min(1)), col, inside);
  return vec4(outCol.mul(a.max(inside)), a); // (prémultiplié)
});

async function start(): Promise<boolean> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H * MAX;
    // (repli WebGL2 imposé : le même shader TSL, mais sans ouvrir un second appareil WebGPU à côté de celui du jeu, et un
    // canevas WebGL se recopie en 2D partout de façon fiable)
    const r = new WebGPURenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power', forceWebGL: true } as never);
    await r.init();
    r.setPixelRatio(1);
    r.setSize(W, H * MAX, false);
    r.setClearColor(0x000000, 0);
    if (!mesh) {
      const mat = new MeshBasicNodeMaterial({ transparent: true });
      mat.colorNode = fluid();
      mat.premultipliedAlpha = true;
      mesh = new Mesh(new PlaneGeometry(2, 2), mat);
      scene.add(mesh);
    }
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
