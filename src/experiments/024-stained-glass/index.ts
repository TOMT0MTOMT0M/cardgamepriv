import { DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu';
import {
  Fn, Loop, cameraPosition, color, dot, float, floor, fract, fwidth, length, max, min, mix, mx_noise_float, normalMap, normalWorld,
  positionWorld, select, smoothstep, texture, uniform, uv, vec2, vec3, vec4, luminance, pow, abs,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { cardArtFor, generateBackArt } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { CARD, createCardMesh } from '../../core/cardModel';
import { createEdgeMaterial, windowSDF } from '../../core/cardMaterial';
import { createPipeline } from '../../core/post';
import { EASE } from '../../core/ease';
import { encodeNormal, hashCell, normalFromHeight, rot2, thinFilm, type N } from '../../core/tsl';

/** Voronoï qui renvoie aussi le point de la cellule : vec4(f2 − f1, id, point.x, point.y). */
const cells = Fn(([p, jitter]: [N, N]) => {
  const ip = floor(p);
  const fp = fract(p);
  const f1 = float(8).toVar();
  const f2 = float(8).toVar();
  const id = float(0).toVar();
  const cp = vec2(0).toVar();
  Loop(
    { start: -1, end: 2, type: 'int', condition: '<' },
    { start: -1, end: 2, type: 'int', condition: '<' },
    ({ i, j }: { i: N; j: N }) => {
      const g = vec2(float(i), float(j));
      const c = ip.add(g);
      const o = vec2(hashCell(c, 1), hashCell(c, 2)).mul(jitter).add(float(0.5).mul(float(1).sub(jitter)));
      const d = length(g.add(o).sub(fp));
      const isNew = d.lessThan(f1);
      f2.assign(select(isNew, f1, min(f2, d)));
      id.assign(select(isNew, hashCell(c, 3), id));
      cp.assign(select(isNew, c.add(o), cp));
      f1.assign(min(f1, d));
    },
  );
  return vec4(f2.sub(f1), id, cp.x, cp.y);
});

/**
 * 024 — Vitrail.
 * La fenêtre d'illustration est un vitrail : l'image est découpée en verres (Voronoï), sertis de plomb,
 * la silhouette du sujet suit son propre réseau. Une lumière rasante passe derrière la carte et projette
 * ses couleurs sur la table (ombres colorées `castShadowNode` + `shadowMap.transmitted`).
 * Ce que je cherche : que la vraie présence de la carte soit la lumière qu'elle jette.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  let sun: DirectionalLight;
  let moon: DirectionalLight | null = null;
  const pivot = new Group();
  const target = new Vector3(0, -0.5, 0.42);
  const L = { i: 0, az: -0.7, el: 0.2 };
  const params = { drift: true, intensity: 1 };
  const U = { light: uniform(0), ldir: uniform(new Vector3(0, 0, 1)), cosL: uniform(0.7), bloom: uniform(0.2) };
  let tl: gsap.core.Timeline | null = null;
  let bloomNode: ReturnType<typeof bloom>;
  let tier = 0;
  let driftT = 0;

  function aimSun() {
    const d = new Vector3(Math.sin(L.az) * Math.cos(L.el), Math.sin(L.el), -Math.cos(L.az) * Math.cos(L.el));
    sun.position.copy(target).addScaledVector(d, 3);
    sun.target.position.copy(target);
    sun.intensity = L.i * 4.2 * params.intensity;
    U.ldir.value.copy(d).negate();
    U.light.value = L.i * params.intensity;
    U.cosL.value = Math.max(0.05, d.y);
    if (moon) {
      const m = new Vector3(Math.sin(-L.az * 1.4 + 0.5) * 0.8, 0.45, -0.6).normalize();
      moon.position.copy(target).addScaledVector(m, 3);
      moon.target.position.copy(target);
      moon.intensity = L.i * 1.6 * params.intensity;
    }
  }

  function play() {
    tl?.kill();
    Object.assign(L, { i: 0, az: -0.75, el: 0.18 });
    driftT = 0;
    const slow = 1 + tier * 0.18;
    tl = gsap.timeline();
    if (tier >= 2) {
      // anticipation : une éclaircie qui hésite (nuage), puis la vraie lumière
      tl.to(L, { i: 0.22, az: -0.6, duration: 0.7, ease: EASE.heave, onStart: () => ctx.sfx.whoosh(0.9, 0.06, true) }, 0.25)
        .to(L, { i: 0.07, duration: 0.45, ease: EASE.breathe })
        .call(() => ctx.sfx.riser(1.1 * slow, tier, 0.07));
    }
    const at = tl.duration() + 0.15;
    tl.to(L, { i: 1, duration: 1.5 * slow, ease: EASE.glide }, at)
      .to(L, { az: 0.12, el: 0.66, duration: 2.6 * slow, ease: EASE.breathe }, at)
      .to(U.bloom, { value: 0.2 + tier * 0.07, duration: 0.25 }, at + 0.55 * slow)
      .to(U.bloom, { value: 0.12 + tier * 0.03, duration: 1.6, ease: EASE.glide })
      .call(() => (ctx.sfx.chime(Math.max(1, tier), 0.08 + tier * 0.02, 330), tier >= 4 && ctx.sfx.shimmer(tier, 2.4, 0.06)), [], at + 0.5 * slow);
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      const rar = rarity(c.rarity);
      tier = rar.tier;
      stage = createStage(c, { bg: ['#1a1613', '#060505'], env: 'night', envIntensity: 0.18, fov: 32 });
      place(c.width, c.height);
      c.renderer.shadowMap.enabled = true;
      c.renderer.shadowMap.transmitted = true;

      const { art } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const back = c.bag.add(generateBackArt(undefined, 0.6));

      // ── vitrail ──
      const densBg = 9 + tier * 2.2; // cellules par unité (≈ 10 cm)
      const densSj = 20 + tier * 5;
      const leadW = 0.0016 + (tier >= 4 ? 0.0004 : 0); // demi-largeur du plomb (unités carte)
      const sat = 0.38 + tier * 0.13;
      const leadCol = tier >= 4 ? vec3(0.62, 0.44, 0.16) : vec3(0.035, 0.034, 0.033);

      const glass = (uvG: N, frameCol: N) => {
        const q = uvG.mul(vec2(CARD.w, CARD.h));
        const sd = windowSDF(uvG);
        const inWin = smoothstep(0.0006, -0.0006, sd);
        const sA = texture(art.subject, uvG).level(float(2)).a;
        const inSj = smoothstep(0.42, 0.58, sA);
        const cb = cells(q.mul(densBg), float(0.85)) as N;
        const cs = cells(q.mul(densSj), float(0.9)) as N;
        const uvOf = (cp: N, dens: number) => cp.div(dens).div(vec2(CARD.w, CARD.h));
        const colBg = texture(art.bg, uvOf(cb.zw, densBg)).level(float(3)).rgb;
        const colSj = texture(art.flat, uvOf(cs.zw, densSj)).level(float(2)).rgb;
        const id = mix(cb.y, cs.y, inSj);
        const e = mix(cb.x.div(densBg), cs.x.div(densSj), inSj); // distance au bord (approx.), unités carte
        // plombs : réseau Voronoï + contour du sujet + bord de fenêtre
        const aa = fwidth(e).add(0.0002);
        const leadCell = float(1).sub(smoothstep(float(leadW).sub(aa), float(leadW).add(aa), e));
        const leadSj = float(1).sub(smoothstep(0.07, 0.15, abs(sA.sub(0.5))));
        const leadBorder = float(1).sub(smoothstep(0.0022, 0.0034, abs(sd.add(0.0012))));
        const lead = max(max(leadCell.mul(inWin), leadSj.mul(inWin)), leadBorder);
        // couleur du verre : chroma normalisé (les gris deviennent du verre clair), densité variable, stries
        const raw = mix(colBg, colSj, inSj);
        const m = max(raw.r, max(raw.g, raw.b));
        const pure = pow(raw.div(max(m, 0.04)), vec3(1.35));
        let gcol: N = pow(mix(vec3(luminance(pure)), pure, sat), vec3(1.2)).mul(mix(float(0.45), float(0.9), id));
        const streak = mx_noise_float(vec3(rot2(q, id.mul(6.28)).mul(vec2(46, 5)), id.mul(17))).mul(0.22).add(1);
        gcol = gcol.mul(streak);
        if (tier >= 3) {
          // verre dichroïque : ~1 verre sur 5 change de couleur avec l'angle de la lumière
          const dich = smoothstep(0.78, 0.8, id);
          gcol = mix(gcol, thinFilm(float(520).add(id.mul(900)), U.cosL, 1.6, 0.9).mul(0.9), dich);
        }
        let T: N = gcol.mul(inWin).mul(float(1).sub(lead));
        if (tier >= 4) {
          // légendaire+ : quelques perles de verre ambre serties dans le cadre (le long du bord)
          const sdOut = sd.sub(0.012);
          const ring = float(1).sub(smoothstep(0.0028, 0.0036, abs(sdOut)));
          const along = fract(q.x.add(q.y).mul(38));
          const bead = ring.mul(smoothstep(0.32, 0.3, abs(along.sub(0.5))));
          T = T.add(vec3(1.0, 0.7, 0.32).mul(bead).mul(inWin.oneMinus()));
        }
        const glassMask = max(inWin.mul(float(1).sub(lead)), float(0));
        // lumière transmise vue de face : diffusion + rayon direct quand on regarde "dans" la lumière
        const Vw = cameraPosition.sub(positionWorld).normalize();
        const behind = smoothstep(-0.05, 0.25, dot(normalWorld, U.ldir));
        const direct = pow(max(dot(Vw, U.ldir), 0), 5).mul(1.6);
        const glow = T.mul(U.light).mul(behind).mul(direct.add(0.22));
        const mat = new MeshPhysicalNodeMaterial();
        const base = mix(frameCol, gcol.mul(0.06), glassMask);
        mat.colorNode = vec4(mix(base, leadCol, lead), 1);
        mat.metalnessNode = mix(float(0), float(tier >= 4 ? 1 : 0.55), lead);
        mat.roughnessNode = mix(mix(float(0.62), float(0.08), glassMask), float(tier >= 4 ? 0.3 : 0.5), lead);
        const seedy = (p: N) => mx_noise_float(vec3(p.mul(85), id.mul(9))).mul(0.6).add(mx_noise_float(vec3(p.mul(260), 3.1)).mul(0.15));
        const nG = normalFromHeight(seedy, q, 0.0012, mix(float(0), float(0.0028), glassMask));
        mat.normalNode = normalMap(encodeNormal(nG));
        mat.clearcoatNode = glassMask;
        mat.clearcoatRoughnessNode = float(0.05);
        mat.emissiveNode = glow;
        mat.castShadowNode = vec4(T, 1);
        return mat;
      };

      const front = glass(uv(), texture(art.frame, uv()).rgb);
      const backM = glass(vec2(uv().x.oneMinus(), uv().y), texture(back.color, uv()).rgb);
      const edge = createEdgeMaterial('#d8d2c4', '#141312');
      edge.colorNode = vec4(edge.colorNode as N, 1);
      edge.castShadowNode = vec4(0, 0, 0, 1);
      const card = createCardMesh(front, backM, edge);
      card.castShadow = true;
      card.receiveShadow = false;
      card.position.y = CARD.h / 2;
      pivot.add(card);
      pivot.position.set(0, -0.5 + 0.004, 0);
      stage.scene.add(pivot);

      // ── table (lin écru, fibres) ──
      const tm = new MeshStandardNodeMaterial();
      const tp = uv().mul(40);
      const fib = mx_noise_float(vec3(tp.x.mul(9), tp.y.mul(0.6), 0)).mul(0.5).add(mx_noise_float(vec3(tp.x.mul(0.6), tp.y.mul(9), 2)).mul(0.5));
      tm.colorNode = vec4(color('#8f8577').mul(fib.mul(0.08).add(0.92)), 1);
      tm.roughnessNode = float(0.88);
      const table = new Mesh(new PlaneGeometry(8, 8), tm);
      table.rotation.x = -Math.PI / 2;
      table.position.y = -0.5;
      table.receiveShadow = true;
      stage.scene.add(table);

      // ── lumières ──
      const mobile = c.quality === 'mobile';
      const mkSun = (col: number) => {
        const l = new DirectionalLight(col, 0);
        l.castShadow = true;
        l.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
        Object.assign(l.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 6 });
        l.shadow.bias = -0.0004;
        l.shadow.normalBias = 0.004;
        stage.scene.add(l, l.target);
        c.bag.fn(() => l.dispose());
        return l;
      };
      sun = mkSun(0xffeedd);
      if (tier >= 5) moon = mkSun(0xb9ccff);
      stage.scene.add(new HemisphereLight(0x7d8796, 0x1a120c, 0.06));
      const fill = new DirectionalLight(0xffe2c4, 0.28); // bougie côté spectateur : le cadre reste lisible
      fill.position.set(0.8, 0.6, 2.5);
      stage.scene.add(fill);

      post = createPipeline(c, stage.scene, stage.camera, { emissive: true });
      bloomNode = post.own(bloom(post.emissive!, 0.2, 0.35, 0.25));
      post.output = (post.color as N).add(bloomNode);
      c.bag.fn(() => tl?.kill());

      aimSun();
      await stage.compile();
      c.bag.fn(c.input.onTap(() => play()));
      c.gui.add(L, 'az', -1.2, 1.2, 0.01).name('azimut du soleil').listen();
      c.gui.add(L, 'el', 0.08, 1.2, 0.01).name('hauteur du soleil').listen();
      c.gui.add(params, 'intensity', 0.2, 2, 0.01).name('intensité');
      c.gui.add(params, 'drift').name('le soleil tourne');
      c.gui.add({ n: `${Math.round(densBg)} / ${Math.round(densSj)}` }, 'n').name('verres (fond / sujet)').disable();
      play();
    },
    replay() {
      play();
    },
    update(dt, t) {
      const p = ctx.input.pose(0.32);
      pivot.rotation.set(-0.16 + p.x * 0.7, p.y, 0);
      if (params.drift && tl && !tl.isActive()) {
        driftT += dt;
        L.az += Math.sin(driftT * 0.21) * dt * 0.05;
      }
      void t;
      aimSun();
      bloomNode.strength.value = U.bloom.value;
      post.render();
    },
    resize(w, h) {
      place(w, h);
    },
    dispose() {},
  };

  function place(w: number, h: number) {
    const cam = stage.camera;
    const a = w / h;
    const k = Math.max(1, 1.1 / a);
    cam.aspect = a;
    cam.position.set(0, 0.95 * k, 3.0 * k);
    cam.lookAt(0, -0.38, 0.5);
    cam.updateProjectionMatrix();
  }
}
