import { DirectionalLight, Group, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, Raycaster, Vector2, Vector3, type Object3D } from 'three/webgpu';
import { abs, color, float, length, max, min, mx_noise_float, positionWorld, smoothstep, uniform, uv, vec2, vec4 } from 'three/tsl';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage, createStandardCard } from '../../core/stage';
import { ensureFonts, generateBackArt, generateCardArt } from '../../core/art';
import { CARDS, cardForRarity } from '../../core/cardData';
import { rarity, type RarityId } from '../../core/rarity';
import { createHoloMaterial } from '../../core/holo';
import { createCardMesh, CARD } from '../../core/cardModel';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { EASE, Spring, clamp } from '../../core/ease';
import type { N } from '../../core/tsl';

type Mode = 'hand' | 'drag' | 'flight' | 'table' | 'inspect';
const KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz', 's'] as const;
type Pose = Record<(typeof KEYS)[number], number>;

interface HCard {
  rig: Group;
  mesh: Mesh;
  rar: RarityId;
  mode: Mode;
  sp: Record<(typeof KEYS)[number], Spring>;
  pose: Pose; // pilotée par GSAP en vol
  slot: number;
  glow: { value: number };
  shadow: Mesh;
  sh: { op: { value: number }; soft: { value: number } };
  /** distribution : pas encore arrivée / encore face cachée */
  wait: boolean;
  down: boolean;
}

const HAND_Z = -1.6;
const DRAG_Z = -1.42;
const TABLE = { y: 0.16, z: -2.5, rx: -0.95 };
const N_T = new Vector3(0, Math.sin(-TABLE.rx), Math.cos(TABLE.rx)); // normale de la table
const UP_T = new Vector3(0, Math.cos(TABLE.rx), Math.sin(TABLE.rx)); // "nord" dans le plan de la table
const T0 = new Vector3(0, TABLE.y, TABLE.z);

/**
 * 027 — Main de cartes.
 * Pas d'effet spectaculaire : la sensation. Une main de sept cartes en éventail, survol qui soulève et écarte les voisines,
 * prise en main avec inclinaison selon la vitesse, réordonnancement, jeu sur la table avec impact, inspection.
 * Ce que je cherche : que tenir les cartes soit agréable avant même de jouer.
 */
export default function create(): Experiment {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  const cards: HCard[] = [];
  let hand: HCard[] = [];
  const table: Array<HCard | null> = [null, null, null, null, null];
  let hovered: HCard | null = null;
  let drag: HCard | null = null;
  let pressed: { c: HCard | null; x: number; y: number; t: number } | null = null;
  let insertAt = -1;
  const ptr = new Vector2();
  const ptrW = new Vector3();
  const vel = new Vector3();
  const prevW = new Vector3();
  const ray = new Raycaster();
  const shake = { a: 0 };
  const ringU = { p: uniform(1), col: uniform(color('#e9dcc2').value) };
  const slotU = { op: uniform(0), x: uniform(0) };
  let slotMesh: Mesh;
  let ringMesh: Mesh;
  const params = { stiffness: 190, tilt: 1 };
  let halfH = 0.58, halfW = 0.87;

  const pointOn = (z: number) => new Vector3(ptr.x * halfW * (-z / -HAND_Z), ptr.y * halfH * (-z / -HAND_Z), z);
  const slotPos = (k: number) => {
    const sp = Math.min(0.55, (halfW * (-TABLE.z / -HAND_Z) * 1.5) / 5);
    return T0.clone().addScaledVector(new Vector3(1, 0, 0), (k - 2) * sp).addScaledVector(UP_T, 0.04);
  };

  function setTargets(c: HCard, p: Partial<Pose>) {
    for (const k of KEYS) if (p[k] !== undefined) c.sp[k].target = p[k]!;
  }

  /** Disposition de la main (avec un trou à `insertAt` pendant un glisser dans la zone de main). */
  function layout() {
    const list: Array<HCard | null> = hand.slice();
    if (drag && insertAt >= 0) list.splice(insertAt, 0, null);
    const n = list.length;
    const spacing = Math.min(0.3, (halfW * 1.7) / Math.max(n, 1));
    const hi = hovered && hovered.mode === 'hand' ? list.indexOf(hovered) : -1;
    list.forEach((c, i) => {
      if (!c || c.wait) return;
      const u = i - (n - 1) / 2;
      let x = u * spacing;
      if (hi >= 0 && i !== hi) x += Math.sign(i - hi) * 0.07 / Math.abs(i - hi);
      const lift = i === hi;
      setTargets(c, {
        x,
        y: -halfH + 0.17 - u * u * 0.011 + (lift ? 0.2 : 0),
        z: HAND_Z + i * 0.012 + (lift ? 0.14 : 0),
        rx: lift ? -0.05 : 0.04,
        ry: c.down ? Math.PI : 0,
        rz: lift ? 0 : -u * 0.075,
        s: lift ? 0.95 : 0.72,
      });
    });
  }

  function pick(list: HCard[]): HCard | null {
    ray.setFromCamera(ptr, stage.camera);
    const hits = ray.intersectObjects(list.map((c) => c.mesh), false);
    if (!hits.length) return null;
    const o: Object3D = hits[0].object;
    return list.find((c) => c.mesh === o) ?? null;
  }

  function syncPoseFromSprings(c: HCard) {
    for (const k of KEYS) c.pose[k] = c.sp[k].value;
  }
  function syncSpringsFromPose(c: HCard) {
    for (const k of KEYS) c.sp[k].set(c.pose[k]);
  }

  /** Emplacement libre, du centre vers les bords. */
  const freeSlot = () => [2, 1, 3, 0, 4].find((k) => table[k] === null) ?? -1;

  function play(c: HCard) {
    const k = freeSlot();
    if (k < 0) return backToHand(c, hand.length);
    table[k] = c;
    c.slot = k;
    c.mode = 'flight';
    syncPoseFromSprings(c);
    const P = slotPos(k).addScaledVector(N_T, 0.006);
    const hover = P.clone().addScaledVector(N_T, 0.22);
    const T = rarity(c.rar).tier;
    const tl = gsap.timeline({ onComplete: () => ((c.mode = 'table'), syncSpringsFromPose(c)) });
    tl.to(c.pose, { y: c.pose.y + 0.06, s: c.pose.s * 1.05, duration: 0.1, ease: EASE.heave })
      .to(c.pose, { x: hover.x, y: hover.y, z: hover.z, rx: TABLE.rx, ry: 0, rz: (Math.random() - 0.5) * 0.06, s: 1, duration: 0.34, ease: EASE.glide })
      .to(c.pose, { x: P.x, y: P.y, z: P.z, duration: 0.11 + T * 0.03, ease: 'power3.in' })
      .call(() => impact(c, P))
      .to(c.pose, { s: 1.0, duration: 0.01 });
    ctx.sfx.whoosh(0.25, 0.1);
  }

  function impact(c: HCard, P: Vector3) {
    const T = rarity(c.rar).tier;
    ctx.sfx.thump(0.3 + T * 0.08, 50 - T * 3);
    if (T >= 2) ctx.sfx.chime(T, 0.08 + T * 0.025);
    shake.a = 0.006 + T * 0.004;
    gsap.to(shake, { a: 0, duration: 0.4 + T * 0.08, ease: EASE.glide });
    ringMesh.position.copy(P).addScaledVector(N_T, 0.002);
    ringU.col.value.set(T >= 2 ? rarity(c.rar).accentHex : '#e9dcc2');
    gsap.fromTo(ringU.p, { value: 0 }, { value: 1, duration: 0.6 + T * 0.08, ease: EASE.glide });
    gsap.fromTo(c.glow, { value: 0.25 + T * 0.3 }, { value: T * 0.04, duration: 1.2, ease: EASE.glide });
  }

  function backToHand(c: HCard, at: number) {
    if (c.slot >= 0) table[c.slot] = null;
    c.slot = -1;
    c.mode = 'hand';
    hand.splice(clamp(at, 0, hand.length), 0, c);
    ctx.sfx.whoosh(0.2, 0.06, false);
  }

  function inspect(c: HCard) {
    c.mode = 'inspect';
    hand = hand.filter((h) => h !== c);
    setTargets(c, { x: 0, y: 0.02, z: -1.45, rx: 0, ry: 0, rz: 0, s: 1 });
    ctx.sfx.tick(1.1, 0.12);
  }

  function onDown(e: PointerEvent) {
    updatePtr(e);
    const ins = cards.find((c) => c.mode === 'inspect');
    if (ins) {
      pressed = { c: null, x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
    const c = pick(hand) ?? pick(cards.filter((k) => k.mode === 'table'));
    pressed = { c, x: e.clientX, y: e.clientY, t: performance.now() };
  }

  function onMove(e: PointerEvent) {
    updatePtr(e);
    if (pressed?.c && !drag && pressed.c.mode === 'hand' && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 7) {
      drag = pressed.c;
      drag.mode = 'drag';
      hand = hand.filter((h) => h !== drag);
      prevW.copy(pointOn(DRAG_Z));
      ctx.sfx.tick(0.9, 0.08);
    }
  }

  function onUp(e: PointerEvent) {
    updatePtr(e);
    const ins = cards.find((c) => c.mode === 'inspect');
    const tap = pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 7 && performance.now() - pressed.t < 500;
    if (drag) {
      const d = drag;
      drag = null;
      if (ptr.y > -0.38) play(d);
      else backToHand(d, insertAt < 0 ? hand.length : insertAt);
      insertAt = -1;
    } else if (ins && tap) {
      backToHand(ins, Math.floor(hand.length / 2));
    } else if (tap && pressed?.c) {
      if (pressed.c.mode === 'hand') inspect(pressed.c);
      else if (pressed.c.mode === 'table') {
        syncSpringsFromPose(pressed.c);
        backToHand(pressed.c, hand.length);
      }
    }
    pressed = null;
  }

  function updatePtr(e: PointerEvent) {
    const r = ctx.canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  }

  function deal() {
    gsap.killTweensOf(cards.map((c) => c.pose));
    gsap.killTweensOf(deal);
    table.fill(null);
    hand = cards.slice();
    hand.forEach((c, i) => {
      c.mode = 'hand';
      c.slot = -1;
      c.sp.x.set((i - 3) * 0.05);
      c.sp.y.set(-halfH - 0.7);
      c.sp.z.set(HAND_Z);
      c.sp.rz.set(0.3);
      c.sp.s.set(0.72);
      c.sp.rx.set(0);
      c.sp.ry.set(Math.PI);
      // distribution en cascade : chaque carte arrive face cachée, puis se retourne
      c.wait = true;
      c.down = true;
      gsap.delayedCall(0.15 + i * 0.09, () => {
        c.wait = false;
        ctx.sfx.tick(0.8 + i * 0.05, 0.06);
      });
      gsap.delayedCall(0.75 + i * 0.07, () => (c.down = false));
    });
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      c.input.spinEnabled = false;
      stage = createStage(c, { bg: ['#1f2b27', '#0a0f0d'], env: 'studio', envIntensity: 0.6, fov: 40 });
      stage.camera.position.set(0, 0, 0);
      stage.camera.lookAt(0, 0, -1);
      const key = new DirectionalLight(0xfff1e2, 1.6);
      key.position.set(-1.2, 2.2, 1.5);
      stage.scene.add(key);

      // tapis de jeu (feutre)
      const fm = new MeshStandardNodeMaterial();
      const fib = mx_noise_float(positionWorld.mul(240)).mul(0.5).add(mx_noise_float(positionWorld.mul(30)).mul(0.5));
      fm.colorNode = vec4(color('#22362f').mul(fib.mul(0.12).add(0.94)), 1);
      fm.roughnessNode = float(0.95);
      const felt = new Mesh(new PlaneGeometry(9, 6), fm);
      felt.position.copy(T0).addScaledVector(UP_T, 1.2);
      felt.rotation.x = TABLE.rx;
      stage.scene.add(felt);

      // cartes : 6 de remplissage + celle de la rareté choisie au milieu
      await ensureFonts();
      const back = c.bag.add(generateBackArt(undefined, 0.5));
      const rids: RarityId[] = ['common', 'uncommon', 'common', c.rarity, 'common', 'uncommon', 'common'];
      for (let i = 0; i < 7; i++) {
        const rid = rids[i];
        const special = i === 3;
        const cd = special ? cardForRarity(rid) : CARDS[(i * 5 + 2) % CARDS.length];
        const art = c.bag.add(generateCardArt(cd, rid, { scale: special ? 0.8 : 0.5 }));
        const glow = uniform(0);
        let mesh: Mesh;
        const T = rarity(rid).tier;
        if (special && T >= 2) {
          const holo = createHoloMaterial(art, T);
          holo.material.emissiveNode = (holo.material.emissiveNode as N).add(color(rarity(rid).accentHex).mul(holo.foil.mul(0.8).add(0.05)).mul(glow));
          mesh = createCardMesh(holo.material, createBackMaterial(back), createEdgeMaterial());
        } else {
          const sc = createStandardCard(art, back);
          sc.front.emissiveNode = (sc.front.emissiveNode as N).add(color(rarity(rid).accentHex).mul(sc.layers.masks.r.mul(0.6)).mul(glow));
          mesh = sc.mesh;
        }
        const rig = new Group();
        rig.add(mesh);
        stage.scene.add(rig);
        // ombre de contact (SDF de rectangle arrondi, flou selon la hauteur)
        const op = uniform(0), soft = uniform(0.02);
        const sm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
        const q = uv().sub(0.5).mul(vec2(CARD.w * 1.5, CARD.h * 1.5));
        const b = vec2(CARD.w / 2 - CARD.r, CARD.h / 2 - CARD.r);
        const dq = abs(q).sub(b);
        const sd = length(max(dq, 0)).add(min(max(dq.x, dq.y), 0)).sub(CARD.r);
        sm.colorNode = vec4(0.01, 0.015, 0.012, 1);
        sm.opacityNode = smoothstep(soft, soft.negate().mul(0.5), sd).mul(op);
        const shadow = new Mesh(new PlaneGeometry(CARD.w * 1.5, CARD.h * 1.5), sm);
        shadow.rotation.x = TABLE.rx;
        shadow.renderOrder = 1;
        stage.scene.add(shadow);
        const sp = Object.fromEntries(KEYS.map((k) => [k, new Spring(0, params.stiffness, k === 's' ? 22 : 19)])) as HCard['sp'];
        cards.push({ rig, mesh, rar: rid, mode: 'hand', sp, pose: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 }, slot: -1, glow, shadow, sh: { op, soft }, wait: false, down: false });
      }

      // emplacement libre (contour) + anneau de poussière à l'impact
      const outline = (w: number, h: number, wid: number) => {
        const q = uv().sub(0.5).mul(vec2(w, h));
        const b = vec2(CARD.w / 2 - CARD.r, CARD.h / 2 - CARD.r);
        const dq = abs(q).sub(b);
        const sd = length(max(dq, 0)).add(min(max(dq.x, dq.y), 0)).sub(CARD.r);
        return float(1).sub(smoothstep(wid, wid * 2, abs(sd)));
      };
      const slm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
      slm.colorNode = vec4(color('#e9dcc2'), 1);
      slm.opacityNode = outline(CARD.w * 1.2, CARD.h * 1.2, 0.003).mul(slotU.op).mul(0.5);
      slotMesh = new Mesh(new PlaneGeometry(CARD.w * 1.2, CARD.h * 1.2), slm);
      slotMesh.rotation.x = TABLE.rx;
      stage.scene.add(slotMesh);
      const rm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
      const rr = length(uv().sub(0.5).mul(2));
      const ringR = ringU.p.mul(0.85).add(0.45);
      rm.colorNode = vec4(ringU.col, 1);
      rm.opacityNode = smoothstep(0.1, 0.0, abs(rr.sub(ringR))).mul(float(1).sub(ringU.p)).mul(0.35).mul(mx_noise_float(uv().mul(40)).mul(0.5).add(0.6));
      ringMesh = new Mesh(new PlaneGeometry(1.3, 1.3), rm);
      ringMesh.rotation.x = TABLE.rx;
      stage.scene.add(ringMesh);

      place(c.width, c.height);
      c.bag.on(c.canvas, 'pointerdown', onDown);
      c.bag.on(c.canvas, 'pointermove', onMove);
      c.bag.on(c.canvas, 'pointerup', onUp);
      c.bag.on(c.canvas, 'pointercancel', onUp);
      c.bag.fn(() => gsap.killTweensOf([shake, ringU.p, ...cards.map((k) => k.pose), ...cards.map((k) => k.glow)]));
      c.gui.add(params, 'stiffness', 60, 400, 1).name('raideur des ressorts').onChange((v: number) => cards.forEach((k) => KEYS.forEach((key) => (k.sp[key].stiffness = v))));
      c.gui.add(params, 'tilt', 0, 2, 0.01).name('inclinaison à la vitesse');
      await stage.compile();
      deal();
    },
    replay() {
      deal();
    },
    update(dt, t) {
      // pointeur → monde ; vitesse lissée pour l'inclinaison
      ptrW.copy(pointOn(DRAG_Z));
      if (dt > 0) vel.lerp(ptrW.clone().sub(prevW).divideScalar(dt), 1 - Math.exp(-18 * dt));
      prevW.copy(ptrW);
      if (!drag && !pressed) hovered = pick(hand);
      else if (drag) hovered = null;
      insertAt = drag && ptr.y < -0.5 ? clamp(Math.round(ptr.x * halfW / Math.min(0.3, (halfW * 1.7) / (hand.length + 1)) + hand.length / 2), 0, hand.length) : -1;
      layout();
      if (drag) {
        const k = params.tilt;
        setTargets(drag, {
          x: ptrW.x,
          y: ptrW.y,
          z: DRAG_Z,
          rz: clamp(-vel.x * 0.09 * k, -0.45, 0.45),
          ry: clamp(vel.x * 0.12 * k, -0.5, 0.5),
          rx: clamp(-vel.y * 0.14 * k, -0.5, 0.5),
          s: 0.82,
        });
      }
      const ins = cards.find((c) => c.mode === 'inspect');
      if (ins) {
        const p = ctx.input.pose(0.4);
        setTargets(ins, { rx: p.x, ry: p.y });
      }
      // emplacement visé
      const free = freeSlot();
      const aim = drag && ptr.y > -0.38 && free >= 0;
      slotU.op.value += ((aim ? 1 : 0) - slotU.op.value) * Math.min(1, dt * 10);
      if (free >= 0) slotMesh.position.copy(slotPos(free)).addScaledVector(N_T, 0.001);

      for (const c of cards) {
        let p: Pose;
        if (c.mode === 'flight') p = c.pose;
        else if (c.mode === 'table') p = c.pose;
        else {
          for (const k of KEYS) c.sp[k].update(dt);
          p = { x: c.sp.x.value, y: c.sp.y.value, z: c.sp.z.value, rx: c.sp.rx.value, ry: c.sp.ry.value, rz: c.sp.rz.value, s: c.sp.s.value };
          if (c.mode === 'hand') p.y += Math.sin(t * 1.4 + c.sp.x.value * 4) * 0.003;
        }
        c.rig.position.set(p.x, p.y, p.z);
        c.rig.rotation.set(p.rx, p.ry, p.rz);
        c.rig.scale.setScalar(p.s);
        // ombre : seulement au-dessus de la table, plus grande et plus douce quand la carte monte
        const over = c.mode === 'flight' || c.mode === 'table';
        const h = over ? Math.max(0, c.rig.position.clone().sub(T0).dot(N_T)) : 1;
        c.shadow.position.copy(c.rig.position).addScaledVector(N_T, -h + 0.001);
        c.shadow.scale.setScalar(1 + h * 0.6);
        c.sh.soft.value = 0.008 + h * 0.18;
        c.sh.op.value = over ? 0.6 * Math.max(0, 1 - h / 0.5) : 0;
      }
      stage.camera.position.set(Math.sin(t * 61) * shake.a, Math.cos(t * 53) * shake.a, 0);
      ctx.renderer.render(stage.scene, stage.camera);
    },
    resize(w, h) {
      place(w, h);
    },
    dispose() {},
  };

  function place(w: number, h: number) {
    const cam = stage.camera;
    cam.aspect = w / h;
    cam.fov = w / h < 1 ? 52 : 40;
    cam.updateProjectionMatrix();
    halfH = -HAND_Z * Math.tan(((cam.fov * Math.PI) / 180) / 2);
    halfW = halfH * cam.aspect;
  }
}
