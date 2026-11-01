import {
  BufferAttribute, BufferGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Float32BufferAttribute, Group, Mesh,
  MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, PointLight, Quaternion, Vector3,
} from 'three/webgpu';
import {
  abs, attribute, color, float, fract, frontFacing, length, max, mix, mx_noise_float, normalMap, positionWorld, select,
  smoothstep, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import { cardForRarity } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { EASE, clamp } from '../../core/ease';
import { encodeNormal, hashCell, thinFilm, voronoi, type N } from '../../core/tsl';

const S = 0.98; // côté du fond (la carte 0.63 × 0.88 y tient)
const H = S * 0.52; // hauteur des rabats triangulaires
const NS = 26; // rangées le long du rabat
const NT = 15; // colonnes le long de la charnière
const UP = new Vector3(0, 1, 0);

interface Flap {
  name: string;
  mesh: Mesh;
  pos: Float32Array;
  hinge: Vector3;
  o: Vector3; // direction sortante (dans le plan de la table)
  e: Vector3; // le long de la charnière
  lb: number; // longueur de pli (rayon du pli replié = lb / π)
  s: { th: number; curl: number };
  prev: number;
  rows: Array<[number, number]>; // (sortant, haut) par rangée
}

/**
 * 025 — Origami.
 * Le booster est une enveloppe de papier pliée, scellée à la cire. Les rabats se déplient avec un vrai pli roulant
 * (le papier se courbe, il ne pivote pas), une pointe qui traîne quand ça va vite, et la mémoire du pli à la fin.
 * Indice de rareté : une lueur traverse le papier par en dessous, puis s'échappe à la première ouverture.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  const flaps: Flap[] = [];
  const seal: Mesh[] = [];
  const cardRig = new Group();
  let leak: PointLight;
  const U = { leak: uniform(0), glow: uniform(0) };
  const cam = { d: 0, y: 0 };
  const cardS = { y: 0.004, rx: -Math.PI / 2, sc: 1, z: 0 };
  const params = { auto: true };
  let tl: gsap.core.Timeline | null = null;
  let autoCall: gsap.core.Tween | null = null;
  let opened = false;
  let tier = 0;
  const q = new Quaternion();
  const tmp = new Vector3();

  /** Profil du rabat : angle cumulé le long de s (pli roulant + boucle de la pointe), intégré en (sortant, haut). */
  function profile(f: Flap) {
    const { th, curl } = f.s;
    let x = 0, y = 0;
    const ds = H / (NS - 1);
    f.rows[0] = [0, 0];
    for (let i = 1; i < NS; i++) {
      const sm = (i - 0.5) * ds;
      const a = th * Math.min(1, sm / f.lb) + curl * smoothstepJS(0.3 * H, H, sm);
      x += Math.cos(a) * ds;
      y += Math.sin(a) * ds;
      f.rows[i] = [x, y];
    }
  }

  function rebuild(f: Flap) {
    profile(f);
    const p = f.pos;
    let k = 0;
    for (let i = 0; i < NS; i++) {
      const s = i / (NS - 1);
      const half = (S / 2) * Math.max(0.025, 1 - s * 0.985);
      const [ox, oy] = f.rows[i];
      for (let j = 0; j < NT; j++) {
        const t = (j / (NT - 1) - 0.5) * 2 * half;
        p[k++] = f.hinge.x + f.e.x * t + f.o.x * ox;
        p[k++] = f.hinge.y + oy + 0.0006;
        p[k++] = f.hinge.z + f.e.z * t + f.o.z * ox;
      }
    }
    const g = f.mesh.geometry;
    (g.attributes.position as BufferAttribute).needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }

  /** Pose d'un objet collé au point matériel s du rabat (demi-sceau sur la pointe). */
  function rideApex(obj: Mesh, f: Flap, s: number, lift: number) {
    const steps = 40, ds = s / steps;
    let x = 0, y = 0, a = 0;
    for (let i = 0; i < steps; i++) {
      const sm = (i + 0.5) * ds;
      a = f.s.th * Math.min(1, sm / f.lb) + f.s.curl * smoothstepJS(0.3 * H, H, sm);
      x += Math.cos(a) * ds;
      y += Math.sin(a) * ds;
    }
    tmp.copy(f.hinge).addScaledVector(f.o, x);
    tmp.y += y;
    // normale extérieure (vers le haut quand le rabat est replié)
    const nOut = f.o.clone().multiplyScalar(Math.sin(a)).addScaledVector(UP, -Math.cos(a));
    obj.position.copy(tmp).addScaledVector(nOut, 0.0032 + lift).addScaledVector(f.e, 0.0015);
    q.setFromAxisAngle(f.e, a - Math.PI);
    obj.quaternion.copy(q);
  }

  function reset() {
    tl?.kill();
    autoCall?.kill();
    opened = false;
    flaps.forEach((f) => ((f.s.th = Math.PI), (f.s.curl = 0), (f.prev = Math.PI)));
    Object.assign(cardS, { y: 0.004, rx: -Math.PI / 2, sc: 1, z: 0 });
    Object.assign(cam, { d: 0, y: 0 });
    U.leak.value = tier >= 2 ? 0.12 + tier * 0.05 : 0;
    U.glow.value = 0;
    seal.forEach((m) => m.scale.setScalar(1));
    if (params.auto) autoCall = gsap.delayedCall(1.6, open);
  }

  function open() {
    if (opened) return;
    opened = true;
    autoCall?.kill();
    const [N, Sf, W, E] = ['N', 'S', 'W', 'E'].map((n) => flaps.find((f) => f.name === n)!);
    const stick = 0.12 + tier * 0.13;
    tl = gsap.timeline();
    // le sceau cède, la pointe se décolle et accroche
    tl.call(() => ctx.sfx.crack(0.25 + tier * 0.04), [], 0)
      .to(N.s, { th: Math.PI - 0.16, duration: 0.22, ease: EASE.heave }, 0)
      .to(N.s, { th: Math.PI - 0.1, duration: stick, ease: 'sine.inOut' })
      .to(U.leak, { value: tier >= 2 ? 0.6 + tier * 0.45 : 0.05, duration: stick + 0.2, ease: EASE.heave }, 0.1);
    if (tier >= 3) tl.call(() => ctx.sfx.riser(stick + 0.5, tier, 0.06), [], 0.1);
    const unfold = (f: Flap, at: number, dur: number) => {
      tl!.to(f.s, { th: 0.07, duration: dur, ease: EASE.glide, onStart: () => ctx.sfx.whoosh(0.35, 0.07, false) }, at)
        // mémoire du pli : le papier retombe puis se relève un peu
        .to(f.s, { th: 0.15, duration: 0.28, ease: 'sine.out' }, at + dur * 0.92)
        .to(f.s, { th: 0.09, duration: 0.6, ease: EASE.breathe }, at + dur * 0.92 + 0.28);
    };
    const t0 = tl.duration();
    unfold(N, t0, 0.95);
    unfold(Sf, t0 + 0.42, 0.75);
    unfold(W, t0 + 0.8, 0.7);
    unfold(E, t0 + 0.88, 0.7);
    tl.to(U.leak, { value: tier >= 2 ? 0.25 + tier * 0.1 : 0, duration: 1.4, ease: EASE.glide }, t0 + 0.5);
    tl.to(cam, { d: 1, y: 1, duration: 2.2, ease: EASE.breathe }, t0 + 0.1);
    // suspense puis la carte se lève vers nous
    const lift = t0 + 1.7 + rarity(ctx.rarity).suspense * 0.5;
    tl.to(cardS, { y: 0.24 + tier * 0.02, rx: -0.95, sc: 1.08, z: 0.18, duration: 1.1 + tier * 0.1, ease: EASE.settle }, lift)
      .call(() => (ctx.sfx.chime(Math.max(1, tier), 0.1 + tier * 0.03), tier >= 4 && ctx.sfx.shimmer(tier, 2, 0.07)), [], lift + 0.35)
      .to(U.glow, { value: 0.3 + tier * 0.25, duration: 0.12 }, lift + 0.35)
      .to(U.glow, { value: tier * 0.05, duration: 1.5, ease: EASE.glide });
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      tier = rarity(c.rarity).tier;
      const rar = rarity(c.rarity);
      stage = createStage(c, { bg: ['#2b2723', '#0d0c0b'], env: 'warm', envIntensity: 0.55, fov: 34 });
      const key = new DirectionalLight(0xfff0de, 2.1); // lumière rasante : le relief du papier et les plis se lisent
      key.position.set(-1.8, 1.1, 0.7);
      const fill = new DirectionalLight(0xc9d4e6, 0.35);
      fill.position.set(1.5, 2, 1.5);
      stage.scene.add(key, fill);

      // ── papier (une seule feuille : motif intérieur continu grâce aux coordonnées "dépliées") ──
      const sheet = attribute('sheet', 'vec2') as N;
      const pm = new MeshPhysicalNodeMaterial({ side: DoubleSide });
      const fib = mx_noise_float(vec3(sheet.mul(vec2(260, 30)), 1)).mul(0.5).add(mx_noise_float(vec3(sheet.mul(vec2(30, 260)), 4)).mul(0.5));
      const mott = mx_noise_float(vec3(sheet.mul(9), 2.5));
      // extérieur : kraft + cachet
      const kraft = color('#b79c78').mul(fib.mul(0.07).add(0.95)).mul(mott.mul(0.06).add(1));
      const stampC = sheet.sub(vec2(0.06, -S / 2 - H * 0.42));
      const rr = length(stampC);
      const ring = max(float(1).sub(smoothstep(0.0016, 0.0026, abs(rr.sub(0.052)))), float(1).sub(smoothstep(0.0012, 0.002, abs(rr.sub(0.043)))));
      const waves = float(1).sub(smoothstep(0.0012, 0.002, abs(fract(stampC.y.add(stampC.x.mul(40).sin().mul(0.004)).mul(36)).sub(0.5)).div(36)))
        .mul(smoothstep(0.06, 0.07, stampC.x.negate())).mul(smoothstep(0.16, 0.14, stampC.x.negate())).mul(smoothstep(0.035, 0.03, abs(stampC.y)));
      const ink = max(ring, waves).mul(smoothstep(-0.2, 0.3, mx_noise_float(vec3(sheet.mul(90), 7))));
      const outer = mix(kraft, color('#2a2420'), ink.mul(0.75));
      // intérieur : selon la rareté
      const rc = color(rar.hex), ra = color(rar.accentHex);
      const paperIn = color('#ece5d6').mul(fib.mul(0.05).add(0.96));
      const lat = abs(fract(sheet.x.add(sheet.y).mul(13)).sub(0.5)).add(abs(fract(sheet.x.sub(sheet.y).mul(13)).sub(0.5)));
      const latLine = float(1).sub(smoothstep(0.035, 0.05, abs(lat.sub(0.5))));
      let inner: N = paperIn;
      let innerMetal: N = float(0);
      let innerRough: N = float(0.75);
      if (tier === 1) inner = mix(paperIn, rc, float(1).sub(smoothstep(0.1, 0.18, abs(fract(sheet.x.add(sheet.y).mul(90)).sub(0.5)))).mul(0.25));
      if (tier === 2) inner = mix(mix(paperIn, rc, 0.12), rc, latLine.mul(0.8));
      if (tier === 3) {
        inner = mix(color(rar.deepHex), mix(rc, ra, 0.3), latLine);
        innerMetal = latLine.mul(0.9);
        innerRough = mix(float(0.7), float(0.25), latLine);
      }
      if (tier >= 4) {
        const vo = voronoi(sheet.mul(34), float(0.9)) as N;
        const flake = smoothstep(0.5, 0.56, vo.z).mul(smoothstep(0.02, 0.06, vo.y.sub(vo.x)));
        const gold = mix(color('#b8862f'), color('#f1d48a'), hashCell(vo.zz.mul(97), 2));
        const ground = tier >= 5 ? thinFilm(float(380).add(mott.mul(260)), float(0.7), 1.45, 0.8).mul(0.75) : color(rar.deepHex);
        inner = mix(ground, gold, flake);
        innerMetal = tier >= 5 ? float(0.85) : flake;
        innerRough = mix(float(tier >= 5 ? 0.3 : 0.8), float(0.22), flake);
      }
      // pli marqué (rangée 0 = charnière) : ligne un peu plus sombre des deux côtés
      const crease = float(1).sub(smoothstep(0.004, 0.012, attribute('fold', 'float') as N));
      // lueur qui traverse le papier par en dessous (seulement quand c'est fermé, au centre)
      const through = U.leak.mul(smoothstep(0.42, 0.0, length(positionWorld.xz))).mul(0.5);
      pm.colorNode = vec4(select(frontFacing, inner, outer).mul(float(1).sub(crease.mul(0.12))), 1);
      pm.metalnessNode = select(frontFacing, innerMetal, float(0));
      pm.roughnessNode = select(frontFacing, innerRough, float(0.82));
      pm.normalNode = normalMap(encodeNormal(vec3(fib.sub(0.5).mul(0.06), mott.mul(0.04), 1).normalize()));
      pm.emissiveNode = select(frontFacing, vec3(0), rc.mul(through));
      pm.sheenNode = vec3(0.1);
      c.bag.add(pm);

      // ── fond de l'enveloppe ──
      const baseG = new PlaneGeometry(S, S, 6, 6).rotateX(-Math.PI / 2);
      const bp = baseG.attributes.position as BufferAttribute;
      const bs = new Float32Array(bp.count * 2), bf = new Float32Array(bp.count);
      for (let i = 0; i < bp.count; i++) {
        bs[i * 2] = bp.getX(i);
        bs[i * 2 + 1] = bp.getZ(i);
        bf[i] = Math.min(S / 2 - Math.abs(bp.getX(i)), S / 2 - Math.abs(bp.getZ(i)));
      }
      baseG.setAttribute('sheet', new Float32BufferAttribute(bs, 2));
      baseG.setAttribute('fold', new Float32BufferAttribute(bf, 1));
      const base = new Mesh(baseG, pm);
      base.position.y = 0.0004;
      stage.scene.add(base);

      // ── rabats ──
      const defs: Array<[string, Vector3, number]> = [
        ['W', new Vector3(-1, 0, 0), 0.011],
        ['E', new Vector3(1, 0, 0), 0.0112],
        ['S', new Vector3(0, 0, 1), 0.0155],
        ['N', new Vector3(0, 0, -1), 0.02],
      ];
      for (const [name, o, h2] of defs) {
        const e = o.clone().cross(UP);
        const hinge = o.clone().multiplyScalar(S / 2);
        const g = new BufferGeometry();
        const pos = new Float32Array(NS * NT * 3);
        const sh = new Float32Array(NS * NT * 2), fo = new Float32Array(NS * NT), uvs = new Float32Array(NS * NT * 2);
        const idx: number[] = [];
        for (let i = 0; i < NS; i++) {
          const s = (i / (NS - 1)) * H;
          const half = (S / 2) * Math.max(0.025, 1 - (i / (NS - 1)) * 0.985);
          for (let j = 0; j < NT; j++) {
            const t = (j / (NT - 1) - 0.5) * 2 * half;
            const k = i * NT + j;
            sh[k * 2] = hinge.x + e.x * t + o.x * s;
            sh[k * 2 + 1] = hinge.z + e.z * t + o.z * s;
            fo[k] = s;
            uvs[k * 2] = j / (NT - 1);
            uvs[k * 2 + 1] = i / (NS - 1);
            if (i < NS - 1 && j < NT - 1) idx.push(k, k + 1, k + NT, k + 1, k + NT + 1, k + NT);
          }
        }
        g.setAttribute('position', new BufferAttribute(pos, 3));
        g.setAttribute('sheet', new Float32BufferAttribute(sh, 2));
        g.setAttribute('fold', new Float32BufferAttribute(fo, 1));
        g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
        g.setIndex(idx);
        const mesh = new Mesh(g, pm);
        mesh.frustumCulled = false;
        stage.scene.add(mesh);
        const f: Flap = { name, mesh, pos, hinge, o, e, lb: (Math.PI * h2) / 2, s: { th: Math.PI, curl: 0 }, prev: Math.PI, rows: [] };
        flaps.push(f);
        rebuild(f);
      }

      // ── sceau de cire (deux moitiés pré-rompues) ──
      const wax = new MeshPhysicalNodeMaterial();
      wax.colorNode = vec4(color('#5c1717').mul(mx_noise_float(positionWorld.mul(120)).mul(0.12).add(0.94)), 1);
      wax.roughnessNode = float(0.38);
      wax.clearcoatNode = float(0.5);
      c.bag.add(wax);
      for (let h = 0; h < 2; h++) {
        const m = new Mesh(new CylinderGeometry(0.052, 0.056, 0.006, 28, 1, false, h * Math.PI, Math.PI), wax);
        stage.scene.add(m);
        seal.push(m);
      }

      // ── carte ──
      const { art, back } = await cardArtFor(cardForRarity(c.rarity), c.rarity, c.bag);
      const card = createStandardCard(art, back);
      const tint = color(rar.accentHex);
      card.front.emissiveNode = (card.front.emissiveNode as N).add(tint.mul(card.layers.masks.r.mul(0.6).add(0.1)).mul(U.glow));
      cardRig.add(card.mesh);
      stage.scene.add(cardRig);

      // ── table + fuite de lumière ──
      const tm = new MeshStandardNodeMaterial({ color: 0x3a2f26, roughness: 0.9 });
      const table = new Mesh(new PlaneGeometry(9, 9).rotateX(-Math.PI / 2), tm);
      stage.scene.add(table);
      leak = new PointLight(rar.hex, 0, 1.4, 1.2);
      leak.position.set(0, 0.03, 0);
      stage.scene.add(leak);

      place(c.width, c.height);
      await stage.compile();
      c.bag.fn(() => (tl?.kill(), autoCall?.kill()));
      c.bag.fn(c.input.onTap(() => (opened ? (reset(), void 0) : open())));
      c.gui.add(params, 'auto').name('ouverture auto');
      c.gui.add({ open }, 'open').name('ouvrir');
      reset();
    },
    replay() {
      reset();
    },
    update(dt, t) {
      for (const f of flaps) {
        // la pointe traîne quand le rabat va vite (vitesse angulaire → boucle), retour amorti
        const v = (f.s.th - f.prev) / Math.max(dt, 1e-3);
        f.prev = f.s.th;
        const target = clamp(-v * 0.11, -0.7, 0.7) * Math.sin(Math.min(Math.PI, f.s.th) * 0.98 + 0.02);
        f.s.curl += (target - f.s.curl) * Math.min(1, dt * 14);
        rebuild(f);
      }
      const [N, Sf] = [flaps.find((f) => f.name === 'N')!, flaps.find((f) => f.name === 'S')!];
      // le centre de la feuille : s* ≈ S/2 + lb(1 − 2/π) (le pli roulant "consomme" un peu de papier)
      rideApex(seal[0], N, S / 2 + N.lb * (1 - 2 / Math.PI), 0);
      rideApex(seal[1], Sf, S / 2 + Sf.lb * (1 - 2 / Math.PI), 0.0045);
      leak.intensity = U.leak.value * 0.35;
      const p = ctx.input.pose(0.06);
      cardRig.position.set(0, cardS.y + Math.sin(t * 1.3) * 0.004 * (cardS.y > 0.05 ? 1 : 0), cardS.z);
      cardRig.rotation.set(cardS.rx + (cardS.y > 0.05 ? p.x * 2 : 0), cardS.y > 0.05 ? p.y * 2 : 0, 0);
      cardRig.scale.setScalar(cardS.sc);
      place(ctx.width, ctx.height);
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      place(w, h);
    },
    dispose() {},
  };

  function place(w: number, h: number) {
    const a = w / h;
    const k = Math.max(1, 1.05 / a);
    const c = stage.camera;
    c.aspect = a;
    const d = 1.38 + cam.d * 0.42;
    c.position.set(0, (1.45 + cam.y * 0.2) * d * k, 0.95 * d * k);
    c.lookAt(0, 0, 0.04);
    c.updateProjectionMatrix();
  }
}

function smoothstepJS(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

