import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteNodeMaterial,
  type Texture,
} from 'three/webgpu';
import {
  Fn,
  If,
  cos,
  exp,
  float,
  floor,
  hash,
  hue,
  instanceIndex,
  instancedArray,
  instancedBufferAttribute,
  int,
  length,
  max,
  mix,
  mx_noise_vec3,
  normalize,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { CARD, createCardGeometry } from '../../core/cardModel';
import { createEdgeMaterial } from '../../core/cardMaterial';
import { rarity, type RarityId } from '../../core/rarity';
import { haptics } from '../../core/haptics';
import { EASE } from '../../core/ease';
import type { N } from '../../core/tsl';
import { themedBacks } from './cardFace';

/**
 * RECYCLAGE DES DOUBLONS (contrats) — scène 3D jouée à la signature d'un contrat.
 *
 *  1. pioche : les cartes brûlées quittent leurs cases du contrat (elles partent de leur position à l'écran) et
 *     s'entassent au centre en une pioche mal formée — décalées, de travers, quelques-unes qui débordent ;
 *  2. tension : la pile tremble, une lueur de la couleur de la rareté visée monte derrière ;
 *  3. dispersion (labo 015, sans reconstruction) : chaque carte devient une grille de particules GPU (une par
 *     « pixel » de la carte) qui se défont selon le style du tier brûlé — sable (communes), vent, explosion, vortex —
 *     de la carte du dessus vers celle du dessous, puis s'éteignent.
 *
 * Le jeu enchaîne ensuite sur la visionneuse (la nouvelle carte). Toucher l'écran accélère.
 */
export interface RecycleScene extends Experiment {
  /**
   * Joue la séquence. `cards` : un id par carte brûlée (doublons compris), `images` : image 2D de chaque id,
   * `from` : rang des cartes brûlées (style de dispersion), `to` : rang reçu (couleur de la lueur), `rects` : position
   * de chaque carte à l'écran au départ (cases du contrat, px CSS). Résolu quand les dernières particules s'éteignent.
   */
  play(o: { cards: string[]; images: Map<string, HTMLImageElement | null>; from: RarityId; to: RarityId; rects: DOMRect[] }): Promise<void>;
}

const MAX_CARDS = 50;

interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
}

export function createRecycleScene(): RecycleScene {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  const pile = new Group();
  let mesh: InstancedMesh;
  let cellAttr: InstancedBufferAttribute;
  let sprites: Sprite;
  let halo: Mesh;
  let initC: N, updC: N;
  let maxP = 80000;
  let atlasTex: Texture;
  const atlasNodes: Array<{ value: Texture }> = [];
  const dummy = new Object3D();
  let poses: Pose[] = [];
  let n = 0;
  let phase: 'idle' | 'pile' | 'tension' | 'burst' = 'idle';
  let tl: gsap.core.Timeline | null = null;
  let finish: (() => void) | null = null;
  let tier = 0;
  const haloS = { k: 0, flash: 0 };
  const shakeS = { k: 0 };

  const U = {
    dt: uniform(0.016),
    since: uniform(0),
    time: uniform(0),
    gw: uniform(32),
    gh: uniform(45),
    count: uniform(0),
    cards: uniform(1),
    cols: uniform(1),
    rows: uniform(1),
    tier: uniform(0),
    mat: uniform(new Matrix4()),
    haloColor: uniform(new Color('#ffffff')),
    halo: uniform(0),
  };
  /** par carte : [x, y, z, rz] puis [rx, ry, s, cellule de l'atlas] */
  let cardData: N;

  // ───────────────────────────────────────────── atlas des faces
  function buildAtlas(ids: string[], images: Map<string, HTMLImageElement | null>) {
    const cols = Math.ceil(Math.sqrt(ids.length * 0.75));
    const rows = Math.ceil(ids.length / cols);
    const cw = Math.min(276, Math.floor(2048 / cols)), ch = Math.round((cw * 386) / 276);
    const c = document.createElement('canvas');
    c.width = cols * cw;
    c.height = rows * ch;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    ids.forEach((id, i) => {
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      const im = images.get(id);
      if (im && im.naturalWidth) g.drawImage(im, x, y, cw, ch);
      else {
        // image pas prête : carte neutre (on ne bloque jamais la cérémonie pour une vignette)
        g.fillStyle = '#2a2320';
        g.fillRect(x, y, cw, ch);
        g.strokeStyle = 'rgba(255,236,214,0.35)';
        g.lineWidth = Math.max(2, cw * 0.02);
        g.strokeRect(x + cw * 0.06, y + cw * 0.06, cw * 0.88, ch - cw * 0.12);
      }
    });
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    atlasTex?.dispose();
    atlasTex = t;
    for (const nd of atlasNodes) nd.value = t;
    U.cols.value = cols;
    U.rows.value = rows;
  }
  /** UV dans l'atlas d'une cellule (index) et d'un point de la face (uv 0..1, v vers le haut). */
  const atlasUV = (cell: N, p: N) => {
    const col = cell.sub(floor(cell.div(U.cols)).mul(U.cols));
    const row = floor(cell.div(U.cols));
    return vec2(col.add(p.x).div(U.cols), float(1).sub(row.add(1).div(U.rows)).add(p.y.div(U.rows)));
  };

  // ───────────────────────────────────────────── pile
  function pileTarget(j: number, total: number): Pose {
    const r = () => Math.random() - 0.5;
    // pioche mal formée : un tas qui s'affaisse un peu vers un côté, cartes de travers, quelques-unes qui débordent
    const lean = (j / Math.max(1, total - 1)) * 0.05;
    const wild = Math.random() < 0.2 ? 2.6 : 1;
    return {
      x: r() * 0.09 * wild + lean,
      y: r() * 0.08 * wild - lean * 0.4,
      z: j * CARD.t * 1.35,
      rx: r() * 0.08,
      ry: r() * 0.08,
      rz: r() * 0.9 * (wild > 1 ? 1.4 : 1),
      s: 1,
    };
  }

  /** Point de départ d'une carte : sa case du contrat, ramenée dans le plan z = 0 de la scène. */
  function fromRect(rc: DOMRect | undefined, j: number): Pose {
    const cam = stage.camera;
    const w = ctx.width, hgt = ctx.height;
    const dist = cam.position.z;
    const worldPerPx = (2 * Math.tan((cam.fov * Math.PI) / 360) * dist) / hgt;
    if (!rc) return { x: (Math.random() - 0.5) * 2, y: -dist * 0.6, z: 0.2, rx: 0, ry: 0, rz: (Math.random() - 0.5) * 2, s: 0.4 };
    const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
    return {
      x: (cx - w / 2) * worldPerPx,
      y: -(cy - hgt / 2) * worldPerPx,
      z: 0.001 * j,
      rx: 0,
      ry: 0,
      rz: 0,
      s: Math.max(0.05, (rc.width * worldPerPx) / CARD.w),
    };
  }

  function writeInstances() {
    for (let j = 0; j < n; j++) {
      const p = poses[j];
      const sh = shakeS.k;
      dummy.position.set(p.x + Math.sin(U.time.value * 61 + j) * 0.004 * sh, p.y + Math.cos(U.time.value * 53 + j * 1.7) * 0.004 * sh, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz + Math.sin(U.time.value * 47 + j) * 0.01 * sh);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(j, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ───────────────────────────────────────────── séquence
  function burst() {
    if (phase === 'burst') return;
    tl?.kill();
    phase = 'burst';
    // les particules reprennent exactement la pose des cartes (grille de « pixels » de chaque face)
    const arr = (cardData.value as unknown as { array: Float32Array; needsUpdate: boolean });
    for (let j = 0; j < n; j++) {
      const p = poses[j];
      arr.array.set([p.x, p.y, p.z, p.rz, p.rx, p.ry, p.s, cellAttr.array[j]], j * 8);
    }
    arr.needsUpdate = true;
    pile.updateMatrixWorld();
    U.mat.value.copy(pile.matrixWorld);
    // budget de particules partagé entre les cartes : grille par carte d'autant plus fine qu'il y a peu de cartes
    const per = Math.max(240, Math.floor(maxP / n));
    const gw = Math.max(12, Math.floor(Math.sqrt((per * CARD.w) / CARD.h)));
    const gh = Math.max(16, Math.floor(per / gw));
    U.gw.value = gw;
    U.gh.value = gh;
    U.cards.value = n;
    U.count.value = n * gw * gh;
    U.since.value = 0;
    U.tier.value = tier;
    ctx.renderer.compute(initC);
    sprites.count = n * gw * gh;
    sprites.visible = true;
    mesh.visible = false;
    ctx.sfx.whoosh(0.6, 0.25, true);
    ctx.sfx.thump(0.35);
    if (tier >= 3) ctx.sfx.crack(0.25);
    haptics.pulse(tier >= 3 ? [40, 30, 70] : 30);
    tl = gsap.timeline();
    tl.to(haloS, { flash: 1, duration: 0.05 })
      .to(haloS, { flash: 0, k: 0, duration: 1.4, ease: EASE.glide })
      .to(shakeS, { k: 0, duration: 0.2 }, 0)
      // vie max d'une particule ≈ 2,1 s + décalage du dessus vers le dessous (0,35 s)
      .call(() => end(), [], 2.5 + tier * 0.08);
  }

  function end() {
    tl?.kill();
    tl = null;
    phase = 'idle';
    sprites.visible = false;
    mesh.visible = false;
    const f = finish;
    finish = null;
    f?.();
  }

  const api: RecycleScene = {
    play({ cards, images, from, to, rects }) {
      tl?.kill();
      finish?.();
      const list = cards.slice(0, MAX_CARDS);
      n = list.length;
      tier = rarity(from).tier;
      const ids = [...new Set(list)];
      buildAtlas(ids, images);
      list.forEach((id, j) => (cellAttr.array[j] = ids.indexOf(id)));
      cellAttr.needsUpdate = true;
      U.haloColor.value.set(rarity(to).hex);
      haloS.k = haloS.flash = 0;
      shakeS.k = 0;
      sprites.visible = false;
      mesh.visible = true;
      // ordre d'arrivée mélangé : la pioche se forme en vrac, pas case par case
      const order = list.map((_, j) => j).sort(() => Math.random() - 0.5);
      poses = list.map((_, j) => fromRect(rects[j], j));
      const targets = order.map((_, k) => pileTarget(k, n));
      writeInstances();
      phase = 'pile';
      return new Promise<void>((resolve) => {
        finish = resolve;
        tl = gsap.timeline();
        const stagger = Math.min(0.09, 1.25 / n);
        let lastTick = -1;
        order.forEach((j, k) => {
          const tg = targets[k];
          const p = poses[j];
          // la carte arrivée en k-ième se pose au k-ième étage : profondeur réécrite au départ de son vol
          const at = 0.15 + k * stagger;
          const lift = 0.35 + Math.random() * 0.25;
          tl!.to(p, { x: tg.x, y: tg.y, rx: tg.rx, ry: tg.ry, rz: tg.rz, s: 1, duration: 0.62, ease: 'power3.out' }, at);
          // petit arc vers la caméra puis retombée sur le tas
          tl!.to(p, { z: tg.z + lift, duration: 0.3, ease: 'power2.out' }, at);
          tl!.to(p, { z: tg.z, duration: 0.32, ease: 'power2.in' }, at + 0.3);
          tl!.call(() => {
            const now = performance.now();
            if (now - lastTick > 45) {
              lastTick = now;
              ctx.sfx.tick(0.9 + (k / n) * 0.7, 0.06);
              if (k % 3 === 0) haptics.pulse(6);
            }
          }, [], at + 0.6);
        });
        const landed = 0.15 + (n - 1) * stagger + 0.65;
        tl.call(() => {
          phase = 'tension';
          ctx.sfx.thump(0.25);
          ctx.sfx.rumble(0.9, 0.1);
        }, [], landed);
        // tension : la pile tremble, la lueur monte
        tl.to(shakeS, { k: 1, duration: 0.7, ease: 'power2.in' }, landed + 0.05);
        tl.to(haloS, { k: 1, duration: 0.75, ease: 'power2.in' }, landed);
        tl.call(() => burst(), [], landed + 0.8);
      });
    },

    async setup(c) {
      ctx = c;
      const mobile = c.quality === 'mobile';
      maxP = mobile ? 36000 : 80000;
      stage = createStage(c, { bg: ['#1f1a17', '#060505'], env: 'studio', envIntensity: 0.9, fill: 0.5, fillPortrait: 0.62 });
      const key = new DirectionalLight(0xfff2e6, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, pile);

      // lueur derrière la pile (couleur de la rareté reçue)
      const hm = c.bag.add(new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending }));
      const hd = length(uv().sub(0.5).mul(2));
      hm.colorNode = vec4((U.haloColor as unknown as N).mul(smoothstep(1, 0, hd).pow(2.2).mul(U.halo)), 1);
      halo = new Mesh(c.bag.add(new PlaneGeometry(3, 3)), hm);
      halo.position.z = -0.25;
      stage.scene.add(halo);

      // faces : une texture d'atlas (une cellule par carte différente), dos aux couleurs du jeu, tranche carton
      atlasTex = c.bag.add(new CanvasTexture(document.createElement('canvas')));
      const geo = c.bag.add(createCardGeometry());
      cellAttr = new InstancedBufferAttribute(new Float32Array(MAX_CARDS), 1);
      cellAttr.setUsage(DynamicDrawUsage);
      const face = c.bag.add(new MeshStandardNodeMaterial());
      const faceTex = texture(atlasTex, atlasUV(instancedBufferAttribute(cellAttr) as unknown as N, uv()));
      atlasNodes.push(faceTex as unknown as { value: Texture });
      face.colorNode = faceTex.rgb;
      face.roughnessNode = float(0.42);
      face.metalnessNode = float(0);
      const back = themedBacks(c.bag, mobile ? 0.4 : 0.5).fallback;
      const edge = c.bag.add(createEdgeMaterial());
      mesh = new InstancedMesh(geo, [face, back, edge], MAX_CARDS);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 1;
      pile.add(mesh);

      // ── particules (015) : positions / vitesses GPU, une grille par carte, budget partagé
      cardData = instancedArray(new Float32Array(MAX_CARDS * 8), 'vec4');
      const pos = instancedArray(maxP, 'vec4');
      const vel = instancedArray(maxP, 'vec4');
      /** carte, point de la grille et position d'origine d'une particule */
      const homeOf = (i: N) => {
        const fi: N = float(i);
        const per: N = U.gw.mul(U.gh);
        const j: N = floor(fi.div(per));
        const k: N = fi.sub(j.mul(per));
        const gy: N = floor(k.div(U.gw));
        const gx: N = k.sub(gy.mul(U.gw));
        const A = cardData.element(int(j).mul(2));
        const B = cardData.element(int(j).mul(2).add(1));
        const s = B.z;
        const loc = vec3(gx.add(0.5).div(U.gw).sub(0.5).mul(CARD.w).mul(s), gy.add(0.5).div(U.gh).sub(0.5).mul(CARD.h).mul(s), CARD.t * 0.6).toVar();
        // rotation Euler XYZ (comme three) : Rx · Ry · Rz
        const cz = cos(A.w), sz = sin(A.w), cy = cos(B.y), sy = sin(B.y), cx = cos(B.x), sx = sin(B.x);
        const p1 = vec3(loc.x.mul(cz).sub(loc.y.mul(sz)), loc.x.mul(sz).add(loc.y.mul(cz)), loc.z);
        const p2 = vec3(p1.x.mul(cy).add(p1.z.mul(sy)), p1.y, p1.z.mul(cy).sub(p1.x.mul(sy)));
        const p3 = vec3(p2.x, p2.y.mul(cx).sub(p2.z.mul(sx)), p2.y.mul(sx).add(p2.z.mul(cx)));
        const world = U.mat.mul(vec4(p3.add(A.xyz), 1)).xyz;
        return { world, uv: vec2(gx.add(0.5).div(U.gw), gy.add(0.5).div(U.gh)), j, cell: B.w };
      };

      initC = Fn(() => {
        If(float(instanceIndex).lessThan(U.count), () => {
          const h = homeOf(instanceIndex);
          pos.element(instanceIndex).assign(vec4(h.world, 0));
          vel.element(instanceIndex).assign(vec4(0));
        });
      })().compute(maxP);

      // dynamique de 015 (branche « dispersé ») : impulsion par tier, bruit curl, gravité / vent / orbite
      const tierArr = (vals: number[]) => {
        let out: N = float(vals[0]);
        for (let t = 1; t < vals.length; t++) out = mix(out, float(vals[t]), smoothstep(t - 0.5, t - 0.49, U.tier));
        return out;
      };
      const KICK = tierArr([0.25, 0.5, 0.7, 1.4, 1.8, 0.9]);
      const CURL = tierArr([0.3, 0.9, 1.4, 1.1, 0.9, 0.8]);
      const GRAV = tierArr([-1.6, 0.25, 0.05, -0.15, 0.1, 0]);
      const WIND = tierArr([0, 0.6, 0.9, 0, 0, 0]);
      const ORBIT = tierArr([0, 0, 0, 0, 0.6, 2.2]);
      const DAMP = tierArr([2.4, 1.0, 1.1, 1.3, 1.0, 0.8]);
      updC = Fn(() => {
        const i = instanceIndex;
        If(float(i).lessThan(U.count), () => {
          const P = pos.element(i);
          const V = vel.element(i);
          const h = homeOf(i);
          const p = P.xyz.toVar();
          const v = V.xyz.toVar();
          const r1 = hash(i), r2 = hash(i.add(7)), r3 = hash(i.add(13));
          const dt = U.dt;
          // de la carte du dessus vers celle du dessous (on découvre la pile en la défaisant)
          const delay = float(1).sub(h.j.add(1).div(U.cards)).mul(0.35).add(r1.mul(0.12));
          If(U.since.greaterThan(delay), () => {
            If(P.w.lessThan(0.5), () => {
              const out = normalize(p.sub(vec3(0, 0, -0.3)).add(vec3(r1.sub(0.5), r2.sub(0.5), r3).mul(0.4)));
              v.assign(out.mul(KICK.mul(0.6)).mul(r3.mul(0.6).add(0.4)).add(vec3(0, 0, r1.mul(0.3))));
            });
            const q = p.mul(2.2).add(vec3(0, 0, U.time.mul(0.2)));
            const curl = mx_noise_vec3(q).sub(mx_noise_vec3(q.add(17.3)));
            const acc = curl.mul(CURL).add(vec3(WIND, GRAV, 0)).add(vec3(p.y.negate(), p.x, 0).mul(ORBIT));
            v.assign(v.add(acc.mul(dt)).mul(exp(dt.mul(DAMP).negate())));
            p.addAssign(v.mul(dt));
            P.assign(vec4(p, 1));
            V.assign(vec4(v, 0));
          });
        });
      })().compute(maxP);

      // rendu : un sprite carré par « pixel », couleur de la face dans l'atlas ; il rétrécit puis s'éteint
      const mat = c.bag.add(new SpriteNodeMaterial({ transparent: false }));
      const h = homeOf(instanceIndex);
      const P = pos.element(instanceIndex);
      mat.positionNode = P.xyz;
      const away = smoothstep(0.002, 0.06, length(P.xyz.sub(h.world)));
      const pTex = texture(atlasTex, atlasUV(h.cell, h.uv));
      atlasNodes.push(pTex as unknown as { value: Texture });
      let col: N = pTex.rgb.mul(0.86);
      // légendaire / mythique brûlés (au cas où) : éclats et irisation de 015
      col = col.add(vec3(1.0, 0.85, 0.55).mul(away).mul(smoothstep(0.96, 1.0, hash(instanceIndex.add(99)))).mul(2).mul(smoothstep(3.5, 3.51, U.tier)));
      col = mix(col, hue(col.add(0.15), hash(instanceIndex).mul(6.28)), away.mul(0.7).mul(smoothstep(4.5, 4.51, U.tier)));
      // en fin de vie, la particule rougeoie de la couleur de la carte reçue, puis disparaît
      const delay = float(1).sub(h.j.add(1).div(U.cards)).mul(0.35).add(hash(instanceIndex).mul(0.12));
      const age = max(U.since.sub(delay), 0);
      const life = hash(instanceIndex.add(31)).mul(1.0).add(1.1);
      const fade = smoothstep(life, life.mul(0.45), age);
      col = mix(col, (U.haloColor as unknown as N).mul(1.4), smoothstep(life.mul(0.35), life.mul(0.85), age).mul(0.55));
      mat.colorNode = vec4(col, 1);
      mat.scaleNode = float(CARD.w * 1.18).div(U.gw).mul(mix(float(1), float(0.6), away)).mul(fade);
      const sq = max(uv().sub(0.5).abs().x, uv().sub(0.5).abs().y);
      mat.maskNode = sq.lessThan(mix(float(0.5), float(0.32), away)).and(fade.greaterThan(0.01));
      sprites = new Sprite(mat);
      sprites.count = 1;
      sprites.frustumCulled = false;
      sprites.visible = true;
      stage.scene.add(sprites);
      c.bag.fn(() => {
        for (const b of [pos, vel, cardData]) (b as unknown as { value: { dispose?: () => void } }).value.dispose?.();
        tl?.kill();
        atlasTex?.dispose();
      });

      // shaders et pipelines prêts avant la première signature
      writeInstances();
      mesh.count = 1;
      await stage.compile();
      c.renderer.compute(initC);
      c.renderer.compute(updC);
      sprites.visible = false;
      mesh.visible = false;

      // toucher : la pile se défait tout de suite ; pendant la dispersion, on passe à la suite
      c.bag.fn(
        c.input.onTap(() => {
          if (ctx.overlay.hidden) return;
          if (phase === 'pile' || phase === 'tension') {
            tl?.progress(1, true); // fin des vols (la pile se forme d'un coup), sans rejouer les sons, puis dispersion
            burst();
          } else if (phase === 'burst' && U.since.value > 0.7) end();
        }),
      );
    },

    update(dt, t) {
      ctx.input.spinEnabled = false;
      U.time.value = t;
      U.dt.value = Math.min(dt, 1 / 30);
      const tilt = { x: -ctx.input.tiltY * 0.14, y: ctx.input.tiltX * 0.14 };
      pile.rotation.set(tilt.x, tilt.y, 0);
      U.halo.value = haloS.k * (0.5 + Math.sin(t * 9) * 0.06 * shakeS.k) + haloS.flash * 1.4;
      if (phase === 'pile' || phase === 'tension') writeInstances();
      if (phase === 'burst') {
        U.since.value += U.dt.value;
        ctx.renderer.compute(updC);
      }
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    dispose() {
      tl?.kill();
      finish?.();
      finish = null;
    },
  };
  return api;
}
