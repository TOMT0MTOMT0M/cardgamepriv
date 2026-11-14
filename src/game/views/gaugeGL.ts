/**
 * (14/11) JAUGE D'ÉTOILES, version shader — le fluide bioluminescent des parties (Pack Battle, Battle Royale) rendu en
 * TSL (three.js WebGPU, repli WebGL2 automatique). Optimisé pour ne rien coûter :
 *  - UN seul moteur de rendu, UN seul petit canevas caché (640 × 60 px par jauge, 8 jauges au plus), UN seul appel de
 *    dessin par image : chaque jauge est une bande du même quad, ses réglages dans un tableau d'uniformes ;
 *  - chaque jauge à l'écran n'est qu'un <canvas> 2D qui recopie sa bande (drawImage) : pas de contexte 3D par jauge ;
 *  - 60 images/s pendant qu'un niveau bouge, 30 au repos ; rien quand l'onglet est caché ; tout est libéré dès que la
 *    partie quitte l'écran. Module chargé à la demande (gameFx.ts) ; s'il échoue, la jauge CSS reste.
 * Le rendu : un NUAGE de particules bleu clair qui respire (pas de l'eau) — brume déformée par du bruit, front diffus,
 * trois nappes de points nets qui filent vers le front et s'en échappent, lueur qui gonfle quand le niveau monte.
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

  // (14/11, retour de Tom : « on dirait de l'eau » → nuage de particules qui respire, plus futuriste)
  // respiration : deux rythmes lents ; elle gonfle le nuage, sa lumière et le front
  const breath: N = sin(t.mul(0.9).add(seed.mul(3))).mul(0.5).add(0.5);
  const breath2: N = sin(t.mul(0.41).add(seed)).mul(0.5).add(0.5);
  const pulse: N = breath.mul(0.28).add(breath2.mul(0.14)).add(0.74);

  // nuage : bruit déformé par un autre bruit, qui dérive lentement vers le front ; pas de surface nette
  const zoom: N = breath.mul(0.06).add(0.97);
  const n1: N = mx_noise_float(vec3(q.x.mul(0.5).mul(zoom).sub(t.mul(0.1)), q.y.mul(1.5).mul(zoom), t.mul(0.14).add(seed)));
  const n2: N = mx_noise_float(vec3(q.x.mul(1.3).sub(t.mul(0.2)).add(n1.mul(1.1)), q.y.mul(2.8).add(n1.mul(0.7)), seed.add(t.mul(0.22))));
  const n3: N = mx_noise_float(vec3(q.x.mul(3.4).sub(t.mul(0.34)).add(n2.mul(0.8)), q.y.mul(5.5), seed.mul(1.7).add(t.mul(0.3))));
  const cloud: N = clamp(n1.mul(0.55).add(n2.mul(0.4)).add(n3.mul(0.18)).add(0.6), 0, 1);

  // front diffus : large fondu, rongé par le nuage ; le ballottement l'étire quand le niveau monte
  const front: N = level.add(n1.mul(0.035)).add(n2.mul(0.02)).add(breath.mul(0.006));
  const d: N = front.sub(x); // > 0 : dans le nuage
  const soft: N = slosh.mul(0.1).add(0.075);
  const fill: N = smoothstep(soft.negate().mul(0.35), soft, d).mul(step(0.002, level));
  // masse centrée sur l'axe de la jauge (s'effiloche vers le haut et le bas)
  const band: N = sin(y.mul(3.14159)).pow(0.7);
  const density: N = pow(cloud, 1.25).mul(0.82).add(0.2).mul(fill).mul(band).mul(pulse);

  const deep: N = vec3(0.05, 0.16, 0.42);
  const mid: N = vec3(0.16, 0.62, 1.0);
  const light: N = vec3(0.5, 0.88, 1.0);
  let col: N = mix(deep, mid, cloud).mul(density).mul(1.7);
  // cœurs lumineux là où le nuage est dense
  col = col.add(light.mul(pow(clamp(density.mul(1.25), 0, 1), 3.0)).mul(0.5));

  // particules : trois nappes (parallaxe) de points nets qui filent vers le front, plus denses près de lui, et
  // quelques-unes qui s'échappent en avant
  const ahead: N = smoothstep(0.1, -0.02, d.negate()).mul(step(0.002, level)); // jusqu'à 10 % devant le front
  const near: N = exp(abs(d).mul(-9)).mul(0.5).add(0.5);
  const layer = (sc: number, sp: number, r: number, thr: number, salt: number): N => {
    const pq: N = vec2(q.x.mul(sc).sub(t.mul(sp)), q.y.mul(sc).add(sin(t.mul(0.3 + salt * 0.07).add(q.x.mul(1.3))).mul(0.18)));
    const c: N = floor(pq);
    const h1: N = hash(c.x.add(c.y.mul(57.0)).add(seed.mul(13.0)).add(salt * 91.7));
    const off: N = vec2(hash(c.x.mul(3.1).add(c.y.mul(17.0)).add(salt)), hash(c.x.mul(7.7).add(c.y.mul(5.3)).add(salt * 3.3))).mul(0.6).add(0.2);
    const tw: N = sin(t.mul(1.6 + salt * 0.5).add(h1.mul(40))).mul(0.5).add(0.5);
    return smoothstep(r, r * 0.25, length(fract(pq).sub(off))).mul(step(thr, h1)).mul(tw.mul(0.75).add(0.25));
  };
  const dots: N = layer(3.6, 0.16, 0.15, 0.5, 1).mul(0.8).add(layer(6.5, 0.3, 0.13, 0.45, 2)).add(layer(10.5, 0.5, 0.12, 0.5, 3).mul(1.2));
  const parts: N = dots.mul(ahead).mul(near).mul(band.mul(0.6).add(0.4)).mul(pulse.add(0.5)).mul(1.5);
  col = col.add(light.mul(parts));

  // lueur du front (pas un trait : un voile), plus forte quand le niveau bouge
  const veil: N = exp(abs(d).mul(-26)).mul(band).mul(pulse).mul(slosh.mul(1.6).add(0.32)).mul(step(0.002, level));
  col = col.add(mid.mul(veil));

  // fin de partie : gagnant plus vif, perdant éteint et désaturé
  const lum: N = col.dot(vec3(0.3, 0.55, 0.15));
  col = mix(vec3(lum), col, clamp(energy, 0.25, 1)).mul(mix(0.3, 1.0, clamp(energy, 0, 1))).mul(max(energy, 1).mul(0.5).add(0.5));
  const a: N = clamp(density.mul(1.05).add(parts).add(veil.mul(0.6)), 0, 1).mul(clamp(energy.mul(2), 0.5, 1));
  return vec4(col.min(vec3(1.0)).mul(a.mul(0.35).add(0.65)), a); // (prémultiplié, additif doux)
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
