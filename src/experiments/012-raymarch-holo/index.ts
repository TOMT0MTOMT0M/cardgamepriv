import { Color, DirectionalLight, MeshPhysicalNodeMaterial, type Mesh } from 'three/webgpu';
import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  cameraPosition,
  clamp,
  cos,
  dot,
  exp,
  float,
  fract,
  length,
  max,
  min,
  mix,
  modelWorldMatrixInverse,
  normalize,
  positionLocal,
  screenCoordinate,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  int,
  pow,
} from 'three/tsl';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, applyPose } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { createBackMaterial, createEdgeMaterial, windowSDF, WINDOW_UV } from '../../core/cardMaterial';
import { createCardMesh, CARD } from '../../core/cardModel';
import { rot2, thinFilm, type N } from '../../core/tsl';

/**
 * 012 — Hologramme raymarché.
 * Le volume derrière la fenêtre contient une SDF animée (gyroscope d'anneaux + gemme qui se déforme),
 * raymarchée en TSL (`Loop` + `Break`) depuis la surface de la carte dans l'espace objet → vraie profondeur au tilt.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let card: Mesh;
  const params = { speed: 1, scan: 1, glow: 1 };
  const U = { speed: uniform(1), scan: uniform(1), glow: uniform(1), tint: uniform(new Color('#ffffff')), tier: uniform(0), t: uniform(0) };

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      U.tint.value.set(rar.tier === 0 ? '#d8d4cc' : rar.accentHex);
      U.tier.value = rar.tier;
      stage = createStage(c, { bg: ['#1c1b1a', '#080808'], env: 'night', envIntensity: 0.9, fill: 0.7 });
      const key = new DirectionalLight(0xffffff, 0.9);
      key.position.set(-1, 2, 3);
      stage.scene.add(key);
      const { art, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);

      const T = rar.tier;
      const STEPS = c.quality === 'mobile' ? 44 : 72;
      const center = vec3(0, (WINDOW_UV.cy - 0.5) * CARD.h, -0.13);
      const tt = U.t;

      // ── SDF (espace objet de la carte)
      const sdTorus = (p: N, R: number, r: number): N => length(vec2(length(p.xz).sub(R), p.y)).sub(r);
      const smin = (a: N, b: N, k: number): N => {
        const h = clamp(float(0.5).add(b.sub(a).mul(0.5 / k)), 0, 1);
        return mix(b, a, h).sub(h.mul(h.oneMinus()).mul(k));
      };
      const sdf = Fn(([p0]: [N]) => {
        const p = p0.sub(center).toVar();
        // gemme : octaèdre adouci qui respire, fusionné à une sphère
        const q = vec3(rot2(p.xz, tt.mul(0.7)), p.y).xzy.toVar();
        const oct = dot(abs(q), vec3(1)).sub(0.065).mul(0.57735);
        const sph = length(q).sub(sin(tt.mul(1.3)).mul(0.008).add(0.05));
        let d: N = T >= 3 ? smin(oct, sph, 0.03) : length(q).sub(0.045);
        // anneaux du gyroscope (un par tier, jusqu'à 3), chacun sur son axe
        const ringN = Math.min(3, 1 + Math.floor(T / 1.5));
        for (let i = 0; i < ringN; i++) {
          let r: N = p;
          const a = tt.mul(0.6 + i * 0.37).add(i * 1.7);
          if (i === 0) r = vec3(r.x, rot2(r.yz, a));
          if (i === 1) r = vec3(rot2(r.xy, a), r.z).xzy;
          if (i === 2) r = vec3(rot2(r.xy, a), r.z);
          d = min(d, sdTorus(r, 0.11 + i * 0.022, 0.006 - i * 0.0008));
        }
        // lunes en orbite (légendaire+)
        if (T >= 4) {
          for (let k = 0; k < 3; k++) {
            const a = tt.mul(0.9 + k * 0.2).add((k * Math.PI * 2) / 3);
            const mp = vec3(cos(a).mul(0.165), sin(a.mul(1.3)).mul(0.03), sin(a).mul(0.165));
            d = min(d, length(p.sub(mp)).sub(0.012));
          }
        }
        return d;
      });

      // ── raymarching
      const camObj = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
      const holo = Fn(() => {
        const ro = positionLocal;
        const rd = normalize(ro.sub(camObj));
        const t = float(0.0).toVar();
        const glow = float(0.0).toVar();
        const hit = float(0.0).toVar();
        Loop({ start: int(0), end: int(STEPS), type: 'int', condition: '<' }, () => {
          const p = ro.add(rd.mul(t));
          const d = sdf(p);
          glow.addAssign(exp(d.mul(-90)).mul(0.035));
          If(d.lessThan(0.0006), () => {
            hit.assign(1);
            Break();
          });
          t.addAssign(max(d.mul(0.85), 0.0015));
          If(t.greaterThan(0.45), () => {
            Break();
          });
        });
        const p = ro.add(rd.mul(t));
        const e = 0.0008;
        const n = normalize(
          vec3(1, -1, -1).mul(sdf(p.add(vec3(e, -e, -e))))
            .add(vec3(-1, -1, 1).mul(sdf(p.add(vec3(-e, -e, e)))))
            .add(vec3(-1, 1, -1).mul(sdf(p.add(vec3(-e, e, -e)))))
            .add(vec3(1, 1, 1).mul(sdf(p.add(vec3(e, e, e))))),
        );
        const fres = pow(float(1).sub(abs(dot(n, rd))), 2.5);
        const rim = T === 5 ? thinFilm(fres.mul(700).add(250), abs(dot(n, rd)), 1.4, 1) : vec3(U.tint as unknown as N);
        const lambert = max(dot(n, normalize(vec3(-0.4, 0.8, 0.5))), 0).mul(0.6).add(0.25);
        const surf = vec3(U.tint as unknown as N).mul(lambert).mul(0.6).add(rim.mul(fres).mul(1.6));
        // artefacts de projection : lignes de balayage, scintillement, bande qui défile
        const scan = sin(screenCoordinate.y.mul(1.6)).mul(0.5).add(0.5).mul(0.25).mul(U.scan).oneMinus();
        const band = smoothstep(0.0, 0.02, abs(fract(p.y.mul(4).sub(tt.mul(0.35))).sub(0.5))).mul(0.4).add(0.6);
        const flick = sin(tt.mul(47)).mul(sin(tt.mul(13.7))).mul(0.06).add(0.97);
        const col = surf.mul(hit).add(vec3(U.tint as unknown as N).mul(glow).mul(U.glow)).mul(scan).mul(band).mul(flick);
        return vec4(col, hit.max(glow.clamp(0, 1)));
      })();

      // ── cadre + fenêtre-projecteur
      const fr = texture(art.frame);
      const win = fr.a.oneMinus();
      const bg = texture(art.bg);
      const sd = windowSDF(uv());
      const inner = mix(float(0.25), float(1), smoothstep(0.0, 0.035, sd.negate()));
      // émetteur au bas de la fenêtre
      const wy = uv().y.sub(WINDOW_UV.cy - WINDOW_UV.hy);
      const emitter = exp(abs(wy).mul(-140)).mul(smoothstep(WINDOW_UV.hx, WINDOW_UV.hx * 0.6, abs(uv().x.sub(0.5)))).mul(0.8);
      const m = new MeshPhysicalNodeMaterial();
      m.colorNode = mix(bg.rgb.mul(0.12), fr.rgb, fr.a);
      m.emissiveNode = holo.rgb.add(vec3(U.tint as unknown as N).mul(emitter)).mul(win).mul(inner);
      m.roughnessNode = mix(float(0.55), float(0.08), win);
      m.clearcoatNode = win.mul(0.8);
      m.clearcoatRoughnessNode = float(0.05);
      card = createCardMesh(m, createBackMaterial(back), createEdgeMaterial());
      stage.scene.add(card);
      await stage.compile();

      c.gui.add(params, 'speed', 0, 3, 0.01).name('vitesse');
      c.gui.add(params, 'scan', 0, 2, 0.01).name('lignes de balayage').onChange((v: number) => (U.scan.value = v));
      c.gui.add(params, 'glow', 0, 3, 0.01).name('halo volumique').onChange((v: number) => (U.glow.value = v));
    },
    update(dt, t) {
      U.t.value += dt * params.speed;
      applyPose(card, ctx, 0.45);
      const idle = ctx.input.inside || ctx.input.gyroEnabled ? 0 : 1;
      card.rotation.y += Math.sin(t * 0.45) * 0.22 * idle;
      card.rotation.x += Math.sin(t * 0.31) * 0.08 * idle;
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {},
  };
}
