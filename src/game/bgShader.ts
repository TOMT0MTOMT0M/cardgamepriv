/**
 * FONDS ANIMÉS DU PROFIL (14/11, refonte de la personnalisation) — un shader LÉGER pour les quatre fonds qui bougent :
 * Braise, Orage, Nébuleuse, Synthwave. Le fond en CSS (src/core/cosmetics.ts) reste dessous : c'est lui qu'on voit dans
 * les tuiles, dans les listes, et partout où le shader ne tourne pas.
 *
 * Règles de coût (aucun serveur, tout dans le navigateur) :
 *  - WebGL nu (pas de three.js, pas de bibliothèque) : un triangle plein écran et un fragment shader ;
 *  - UN SEUL canevas par hôte, en DEMI-résolution, 30 images/s sur téléphone ;
 *  - en PAUSE hors écran (IntersectionObserver) et quand l'onglet est caché ;
 *  - MESURE : si la page passe sous 50 images/s pendant les deux premières secondes, le canevas est retiré pour la
 *    session — il reste le fond CSS fixe (« un effet qui fait chuter la fluidité est simplifié »).
 */
import { AMBIANCE } from '../core/motion';

const NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
`;
const HEAD = `precision mediump float; uniform vec2 u_res; uniform float u_time; uniform vec3 u_col;${NOISE}`;
/** un fragment shader par fond : `uv` va de 0 (bas) à 1 (haut) */
const FRAG: Record<string, string> = {
  braise: `${HEAD}
void main(){ vec2 uv = gl_FragCoord.xy / u_res; float t = u_time;
  float n = fbm(vec2(uv.x * 3.0, uv.y * 2.2 - t * 0.22));
  float glow = (1.0 - smoothstep(0.0, 0.8, uv.y)) * (0.5 + 0.5 * n);
  vec3 col = mix(vec3(0.04, 0.015, 0.01), vec3(1.0, 0.42, 0.1), glow * glow * 0.85);
  col += vec3(1.0, 0.7, 0.25) * pow(glow, 5.0) * 0.45;
  for (int k = 0; k < 2; k++) { float L = 1.0 + float(k) * 0.7;
    vec2 g = vec2(uv.x * 16.0 * L, uv.y * 9.0 * L - t * (0.32 + 0.14 * L)); vec2 id = floor(g); vec2 f = fract(g) - 0.5; float h = hash(id + float(k) * 13.0);
    vec2 o = vec2(sin(t * 1.3 + h * 6.28) * 0.22, 0.0) + (vec2(hash(id + 1.7), hash(id + 3.1)) - 0.5) * 0.5;
    col += vec3(1.0, 0.62, 0.22) * step(0.84, h) * (1.0 - smoothstep(0.0, 0.085, length(f - o))) * (1.0 - smoothstep(0.15, 1.0, uv.y)); }
  gl_FragColor = vec4(col, 1.0); }`,
  orage: `${HEAD}
void main(){ vec2 uv = gl_FragCoord.xy / u_res; float t = u_time;
  float c = fbm(vec2(uv.x * 2.4 + t * 0.035, uv.y * 3.0 + t * 0.02));
  vec3 col = mix(vec3(0.03, 0.04, 0.055), vec3(0.3, 0.36, 0.44), smoothstep(0.35, 0.95, c) * smoothstep(0.15, 1.0, uv.y));
  vec2 r = vec2(uv.x * 70.0 + uv.y * 16.0, uv.y * 5.0 + t * 2.6); float rn = hash(vec2(floor(r.x), 3.0));
  col += vec3(0.55, 0.65, 0.75) * smoothstep(0.93, 1.0, fract(r.y + rn * 7.0)) * step(0.72, rn) * 0.1;
  float ft = fract(t / 7.0); float fl = exp(-ft * 16.0) * (0.6 + 0.4 * sin(ft * 110.0));
  col += vec3(0.55, 0.65, 0.8) * fl * 0.3 * smoothstep(0.3, 1.0, uv.y) * c;
  col = mix(col, col * (0.6 + u_col), 0.1);
  gl_FragColor = vec4(col, 1.0); }`,
  nebuleuse: `${HEAD}
void main(){ vec2 uv = gl_FragCoord.xy / u_res; float t = u_time; vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 2.2;
  vec2 q = vec2(fbm(p + t * 0.03), fbm(p + vec2(5.2, 1.3) - t * 0.02)); float n = fbm(p + 2.0 * q);
  vec3 col = vec3(0.02, 0.016, 0.045);
  col += u_col * 0.6 * smoothstep(0.4, 0.95, n) * q.x;
  col += vec3(0.36, 0.23, 0.82) * 0.5 * smoothstep(0.4, 0.9, fbm(p * 1.3 + q.yx * 1.7 + 3.0));
  col += vec3(0.12, 0.71, 0.79) * 0.3 * smoothstep(0.5, 1.0, q.y * n * 1.9);
  vec2 sg = p * 26.0; vec2 id = floor(sg); vec2 f = fract(sg) - 0.5; float h = hash(id);
  col += vec3(1.0) * step(0.93, h) * (1.0 - smoothstep(0.0, 0.11, length(f - (vec2(hash(id + 2.0), hash(id + 5.0)) - 0.5) * 0.7))) * (0.55 + 0.45 * sin(t * (1.0 + h * 3.0) + h * 40.0));
  gl_FragColor = vec4(col, 1.0); }`,
  // (grille : épaisseur des lignes constante À L'ÉCRAN, ≈ 1,5 px, quelle que soit la profondeur — `wx`, `wy`)
  synth: `${HEAD}
void main(){ vec2 uv = gl_FragCoord.xy / u_res; float t = u_time; float hz = 0.42; vec3 col;
  if (uv.y > hz) { float sy = (uv.y - hz) / (1.0 - hz); col = mix(vec3(0.2, 0.05, 0.3), vec3(0.05, 0.02, 0.1), sy);
    vec2 sc = vec2((uv.x - 0.5) * u_res.x / u_res.y, uv.y - hz - 0.2); float d = length(sc);
    float bands = step(0.0, sin(sc.y * 95.0 - t * 1.4) + sc.y * 9.0 + 0.55);
    vec3 sunc = mix(vec3(1.0, 0.48, 0.72), vec3(1.0, 0.83, 0.42), smoothstep(-0.15, 0.15, sc.y));
    col = mix(col, sunc, (1.0 - smoothstep(0.164, 0.17, d)) * bands);
  } else { float z = hz - uv.y; float pz = 0.12 / (z + 0.02); float px = (uv.x - 0.5) * pz * 3.0;
    float gy = fract(pz * 1.2 + t * 0.5); float gx = fract(px);
    float wx = min(0.5, 1.5 * pz * 3.0 / u_res.x); float wy = min(0.5, 1.5 * 0.144 / ((z + 0.02) * (z + 0.02)) / u_res.y);
    float line = min(1.0, (1.0 - smoothstep(0.0, wx, min(gx, 1.0 - gx))) + (1.0 - smoothstep(0.0, wy, min(gy, 1.0 - gy))));
    col = vec3(0.05, 0.02, 0.09) + u_col * line * (0.15 + 0.85 * smoothstep(0.0, 0.18, z)) * 0.8; }
  col += u_col * 0.6 * (1.0 - smoothstep(0.0, 0.012, abs(uv.y - hz)));
  gl_FragColor = vec4(col, 1.0); }`,
};
/** les fonds qui ont un shader (les autres sont fixes, en CSS) */
export const hasBgShader = (id: string) => id in FRAG;

const OFF_KEY = 'bebou.bgshader.off';
const off = () => {
  try {
    return sessionStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
};
const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * Pose le shader du fond `id` dans `host` (un calque en `position: absolute`, qui porte déjà le fond CSS) et rend la
 * fonction qui l'arrête et libère le contexte. Rien si le fond n'a pas de shader, si WebGL manque, ou si la mesure de
 * cette session l'a écarté.
 */
export function mountBgShader(host: HTMLElement, id: string, colorHex: string): () => void {
  let stop = startBgShader(host, id, colorHex);
  if (stop || !hasBgShader(id) || off()) return stop ?? (() => {});
  // contexte WebGL refusé au premier essai (le navigateur en libérait un autre) : UNE seconde tentative, un peu plus tard
  let cancelled = false;
  const t = window.setTimeout(() => {
    if (!cancelled) stop = startBgShader(host, id, colorHex, true);
  }, AMBIANCE.souffle / 3);
  return () => {
    cancelled = true;
    clearTimeout(t);
    stop?.();
  };
}
function startBgShader(host: HTMLElement, id: string, colorHex: string, retry = false): (() => void) | null {
  const none = null;
  if (!hasBgShader(id) || off()) return none;
  const cv = document.createElement('canvas');
  cv.className = 'bg-gl';
  cv.setAttribute('aria-hidden', 'true');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) {
    if (retry) console.warn('[fond] WebGL indisponible : fond fixe', id);
    return none;
  }
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
    console.warn('[fond] shader refusé', id, gl.getShaderInfoLog(s));
    return null;
  };
  const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }');
  const fs = sh(gl.FRAGMENT_SHADER, FRAG[id]);
  const prog = gl.createProgram()!;
  if (!vs || !fs) return none;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[fond] programme refusé', id, gl.getProgramInfoLog(prog));
    return none;
  }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'u_res'), uTime = gl.getUniformLocation(prog, 'u_time'), uCol = gl.getUniformLocation(prog, 'u_col');
  gl.uniform3fv(uCol, hexRgb(colorHex));
  host.prepend(cv);

  const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  /** écart minimal entre deux images dessinées : 30 images/s sur téléphone, toutes sur ordinateur */
  const every = phone ? 1000 / 30 - 2 : 0;
  let raf = 0, visible = true, dead = false, last = 0, drawn = 0;
  // mesure : cadence de la page pendant ≈ 2 s (les premières images, qui compilent le shader, ne comptent pas)
  let probe = 0, probeFrom = 0, probeFrames = 0;
  const size = () => {
    const w = Math.max(2, Math.round(host.clientWidth / 2)), h = Math.max(2, Math.round(host.clientHeight / 2));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(uRes, cv.width, cv.height);
  };
  const stop = () => {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    io?.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cv.remove();
  };
  const frame = (now: number) => {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (probe < 2) {
      // (0 = attente, 1 = mesure, 2 = fini)
      if (probe === 0 && drawn > 12) ((probe = 1), (probeFrom = now), (probeFrames = 0));
      else if (probe === 1) {
        probeFrames++;
        if (now - probeFrom >= AMBIANCE.particule * 0.8) {
          probe = 2;
          if ((probeFrames * 1000) / (now - probeFrom) < 50) {
            try {
              sessionStorage.setItem(OFF_KEY, '1');
            } catch {
              /* stockage bloqué */
            }
            return stop();
          }
        }
      }
    }
    if (now - last < every) return;
    last = now;
    drawn++;
    size();
    gl.uniform1f(uTime, now / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const run = () => {
    cancelAnimationFrame(raf);
    if (!dead && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const onVis = () => {
    // une pause fausserait la mesure : elle repart de zéro
    if (probe === 1) probe = 0;
    run();
  };
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => ((visible = es.some((e) => e.isIntersecting)), onVis())) : null;
  io?.observe(host);
  document.addEventListener('visibilitychange', onVis);
  run();
  return stop;
}
