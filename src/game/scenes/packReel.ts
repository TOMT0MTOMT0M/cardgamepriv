import { Group, Raycaster, Vector2, type PerspectiveCamera, type Scene } from 'three/webgpu';
import type { LabContext } from '../../core/Experiment';
import { PACK } from '../../core/pack';
import { haptics } from '../../core/haptics';
import { cameraScale, type Wheel3D, type WheelItem3D } from './packWheel3d';

/**
 * ROUE VERTICALE DES BOOSTERS (ordinateur, croquis de Tom du 07/11) : les pochettes de la boutique sont posées sur un
 * tambour horizontal (comme un rouleau de machine à sous) — celle du milieu est le GRAND booster de la vitrine (plein
 * détail, c'est lui qu'on ouvre), celles du dessus et du dessous sont les mini-boosters 3D de la roue téléphone
 * (packWheel3d.ts), dans la même scène et la même lumière. (07/11) Plus de chevrons : un clic sur une pochette voisine
 * la fait venir au milieu, la molette tourne d'un cran ; et on peut ATTRAPER la roue à la
 * souris (glisser vers le haut ou le bas) — un clic maintenu sans bouger n'ouvre rien, seul un vrai clic sur la
 * pochette du milieu ouvre le booster (c'est le `tap` de input.ts : moins de 8 px et moins de 600 ms).
 * Géométrie (vue de côté de Tom, 07/11) : un tambour COMPLET, les pochettes réparties sur tout le tour (5 → 72°),
 * rayon ≈ 1,1 hauteur de pochette ; celles de derrière sont cachées.
 * Physique (Tom, 07/11) : « assez smooth » — la roue est LIBRE : lancée, elle flotte (frottement léger) et traverse les
 * crans magnétiques presque sans résistance ; lente, les crans la retiennent et elle se pose (amortissement qui monte
 * quand elle ralentit). Attrapée, elle suit la souris 1:1 avec des crans à peine sentis. Un clic maintenu sans bouger
 * « prend » le booster (il recule un peu, `holdK`) et n'ouvre rien. Chevrons, molette, menu : ressort précis vers le cran.
 * Quand la roue s'arrête sur une autre pochette, `onCommit(key)` : la boutique change le grand booster (sans
 * animation : il a physiquement tourné) et la mini-pochette de cette clé se cache, celle de l'ancienne réapparaît.
 */
export interface ReelHooks {
  /** clé du grand booster affiché (celui qui est caché dans la roue) */
  bigKey(): string;
  /** la roue a trouvé son cran sur une autre pochette */
  onCommit(key: string): void;
  /** roue verrouillée (booster déjà tiré, fiche ouverte…) : ni glisser ni flèches */
  locked(): boolean;
}

const TAU = Math.PI * 2;
/** crans à peine sentis sous la souris (shop.ts en a 0,3 : trop « cranté » pour Tom) */
const STICK = 0.12;
/** roue libre : frottement quand elle file (float) et quand elle se pose (s'ajoute en dessous de V0 crans/s) */
const FRICTION_FREE = 1.0;
const FRICTION_SETTLE = 9;
const V0 = 1.2;
/** aimant des crans : accélération = −MAG · sin(2π·frac) — presque rien à grande vitesse, retient à petite vitesse */
const MAG = 6;
const VMAX = 9;
const feel = (x: number) => x - (STICK / TAU) * Math.sin(TAU * x);
const unfeel = (y: number) => {
  let x = y;
  for (let i = 0; i < 4; i++) x -= (feel(x) - y) / (1 - STICK * Math.cos(TAU * x));
  return x;
};

export function createReel(ctx: LabContext, scene: Scene, camera: PerspectiveCamera, wheel3d: Wheel3D, hooks: ReelHooks) {
  let keys: string[] = [];
  /** position continue de la roue, en pochettes (entier = une pochette pile au milieu) ; vitesse en pochettes/s */
  let pos = 0;
  let vel = 0;
  let target: number | null = null;
  let omega = 11;
  const ZETA = 0.74;
  let detent = 0;
  let committed: number | null = null;
  let lastClick = 0;
  let enabled = false;
  let shown = false;
  /** pose du grand booster, en unités de scène (centre du tambour à y = cy, scale = S) */
  const layout = { cy: 0, S: 0.72 };
  const N = () => keys.length;
  const near = (d: number) => d - N() * Math.round(d / N());
  const mod = (x: number) => ((x % N()) + N()) % N();
  const indexOf = (k: string) => Math.max(0, keys.indexOf(k));

  // (07/11, retours de Tom : « enlève les flèches, c'est horrible ») plus de chevrons. Le guidage est dans le geste :
  // tant que la roue n'a jamais été tournée, elle « respire » d'un quart de cran de temps en temps (on voit qu'elle
  // tourne et qu'il y a d'autres boosters derrière), les pochettes voisines s'éclairent au survol et la souris devient
  // une main (« attrape-moi »). Une fois la roue tournée une première fois, plus aucune respiration.
  const group = new Group();
  group.visible = false;
  scene.add(group);
  /** clic maintenu sans bouger : 0 → 1 (le booster recule un peu) */
  let holdK = 0;
  /** respiration d'invitation : décalage visuel (en crans) ajouté à `pos` pour l'affichage seulement */
  let nudgeOff = 0;
  let nudgeT = -1;
  let nudgeDir: 1 | -1 = 1;
  let nudges = 0;
  let lastAct = performance.now();
  const NUDGE_LS = 'bebou.roueVue';
  let learned = (() => {
    try {
      return localStorage.getItem(NUDGE_LS) === '1';
    } catch {
      return false;
    }
  })();
  /** l'utilisateur a fait tourner la roue lui-même : il a compris, on ne le guide plus */
  const learnt = () => {
    lastAct = performance.now();
    if (learned) return;
    learned = true;
    try {
      localStorage.setItem(NUDGE_LS, '1');
    } catch {
      /* ignore */
    }
  };
  const ray = new Raycaster();
  const ndc = new Vector2();
  let hoverKey: string | null = null;

  // ── tambour : d = distance signée au milieu (en crans) ; STEP = tout le tour / nombre de pochettes
  const stepAngle = () => TAU / Math.max(3, N());
  const radius = () => {
    const h = PACK.h * layout.S;
    // ≈ 1,1 h, et jamais moins que ce qu'il faut pour que deux pochettes voisines ne se touchent pas (corde ≥ 1,12 h)
    return Math.max(1.1 * h, (0.56 * h) / Math.sin(stepAngle() / 2));
  };
  function poseAt(d: number) {
    const R = radius();
    const th = d * stepAngle();
    return { y: layout.cy + Math.sin(th) * R, z: (Math.cos(th) - 1) * R, rotX: -th };
  }

  // ── physique (shop.ts)
  function springTo(t: number, w?: number) {
    free = false;
    target = t;
    committed = null;
    const D = t - pos;
    omega = w ?? (Math.abs(D) > 0.02 && vel * D > 0 ? Math.max(6.5, Math.min(15, (2 * ZETA * vel) / D)) : 12);
  }
  function commit(t: number) {
    committed = t;
    const k = keys[mod(Math.round(t))];
    if (k && k !== hooks.bigKey()) hooks.onCommit(k);
  }
  /** roue libre (lâchée après un glisser) : true tant qu'elle bouge */
  let free = false;
  function step(dt: number) {
    if (drag) return;
    let n = Math.ceil(dt / (1 / 240));
    const hh = dt / n;
    if (target !== null) {
      // ressort précis vers un cran (chevron, molette, menu)
      const k = omega * omega;
      const c = 2 * ZETA * omega;
      while (n--) {
        const acc = -k * (pos - target) - c * vel;
        vel += acc * hh;
        pos += vel * hh;
      }
      if (committed !== target && Math.abs(pos - target) < 0.14 && Math.abs(vel) < 4) commit(target);
      if (Math.abs(pos - target) < 0.0015 && Math.abs(vel) < 0.02) {
        pos = mod(target);
        detent = Math.round(pos);
        vel = 0;
        target = null;
        commit(pos);
      }
      return;
    }
    if (!free) return;
    // roue libre : frottement léger + aimant des crans ; le frottement monte quand elle ralentit (elle se pose)
    while (n--) {
      const sp = Math.abs(vel);
      const fr = FRICTION_FREE + FRICTION_SETTLE * Math.max(0, 1 - sp / V0);
      const frac = pos - Math.round(pos);
      const acc = -MAG * Math.sin(TAU * frac) - fr * vel;
      vel += acc * hh;
      pos += vel * hh;
    }
    const nearest = Math.round(pos);
    if (committed !== nearest && Math.abs(vel) < 1.2 && Math.abs(pos - nearest) < 0.3) commit(nearest);
    if (Math.abs(pos - nearest) < 0.0015 && Math.abs(vel) < 0.02) {
      pos = mod(nearest);
      detent = Math.round(pos);
      vel = 0;
      free = false;
      commit(pos);
    }
  }

  // ── la souris : glisser verticalement = tourner (un clic sans bouger ne fait rien ici : c'est le `tap` d'input.ts)
  let drag: { id: number; y0: number; x0: number; raw0: number; moved: boolean; samples: Array<[number, number]> } | null = null;
  const gapPx = () => {
    const { k } = cameraScale(camera, ctx.height);
    // px de souris pour un cran : l'arc du tambour entre deux pochettes, vu de face (≈ la hauteur d'une pochette)
    return Math.max(40, Math.min(1, stepAngle()) * radius() * k);
  };
  const down = (e: PointerEvent) => {
    if (!shown || drag || e.button !== 0 || hooks.locked() || N() < 2) return;
    target = null;
    free = false;
    vel = 0;
    drag = { id: e.pointerId, y0: e.clientY, x0: e.clientX, raw0: unfeel(pos), moved: false, samples: [[performance.now(), pos]] };
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dy, e.clientX - drag.x0) > 6) {
      drag.moved = true;
      learnt();
    }
    if (!drag.moved) return;
    const raw = drag.raw0 + dy / gapPx();
    pos = feel(raw);
    const now = performance.now();
    drag.samples.push([now, raw]);
    while (drag.samples.length > 2 && now - drag.samples[0][0] > 90) drag.samples.shift();
    const [t0, p0] = drag.samples[0];
    vel = now - t0 > 8 ? ((raw - p0) / (now - t0)) * 1000 : vel;
  };
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    const lastS = d.samples[d.samples.length - 1];
    if (performance.now() - lastS[0] > 100) vel = 0;
    if (!d.moved) {
      // clic sans bouger : rien (un clic sur la pochette du milieu, c'est le `tap` d'input.ts qui ouvre)
      vel = 0;
      if (Math.abs(pos - Math.round(pos)) > 0.001) springTo(Math.round(pos), 10);
      return;
    }
    // lâchée : roue libre avec l'élan de la main (bornée), elle flotte et les crans la retiennent quand elle ralentit
    vel = Math.max(-VMAX, Math.min(VMAX, vel));
    committed = null;
    free = true;
  };
  // molette : un cran par geste
  let wheelAcc = 0;
  let wheelT = 0;
  const onWheel = (e: WheelEvent) => {
    if (!shown || hooks.locked() || N() < 2) return;
    e.preventDefault();
    wheelAcc += e.deltaY;
    clearTimeout(wheelT);
    wheelT = window.setTimeout(() => (wheelAcc = 0), 160);
    if (Math.abs(wheelAcc) < 40) return;
    const s = Math.sign(wheelAcc);
    wheelAcc = 0;
    learnt();
    // molette vers le bas = le contenu monte : la pochette du dessous vient au milieu
    springTo(Math.round((target ?? pos) - s), 11);
  };
  const cv = ctx.canvas;
  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', onWheel, { passive: false });

  const items: WheelItem3D[] = [];
  const tmpV = new Vector2();

  const api = {
    setKeys(ks: string[]) {
      keys = ks.slice();
      pos = indexOf(hooks.bigKey());
      detent = Math.round(pos);
    },
    /** mise en page (ordinateur, vitrine) : centre du tambour et échelle des pochettes */
    setLayout(cy: number, S: number) {
      layout.cy = cy;
      layout.S = S;
    },
    set enabled(v: boolean) {
      enabled = v;
      if (!v) api.hide();
    },
    get enabled() {
      return enabled;
    },
    get active() {
      return shown;
    },
    get moving() {
      return !!drag || target !== null || free;
    },
    /** clic maintenu (0..1) : le grand booster recule un peu, « pris en main » */
    get holdK() {
      return holdK;
    },
    /** profondeur du tambour (2 × rayon) : ce qu'il faut reculer pour passer derrière toutes les pochettes */
    get depth() {
      return 2 * radius();
    },
    get cursor() {
      return drag?.moved ? 'grabbing' : hoverKey ? 'grab' : '';
    },
    /** la boutique demande une pochette (menu de droite, clavier) : la roue y va par le plus court chemin */
    spinTo(k: string): boolean {
      if (!shown || N() < 2) return false;
      const i = keys.indexOf(k);
      if (i < 0) return false;
      const base = target ?? pos;
      const t = Math.round(base + near(i - base));
      if (Math.abs(t - pos) < 0.001 && target === null) return true;
      springTo(t, 11);
      return true;
    },
    /** au repos : la pochette du grand booster au milieu, sans animation (arrivée sur la boutique, redimensionnement) */
    snap() {
      if (drag || target !== null || free) return;
      pos = indexOf(hooks.bigKey());
      detent = Math.round(pos);
    },
    /** pose du grand booster (celui de `bigKey`) sur le tambour */
    bigPose() {
      return poseAt(near(indexOf(hooks.bigKey()) - pos - nudgeOff));
    },
    /** un clic (tap) : sur un chevron ou une mini-pochette → la roue tourne ; true = c'était pour nous */
    tap(x: number, y: number): boolean {
      if (!shown || hooks.locked()) return false;
      ndc.set(x, y);
      ray.setFromCamera(ndc, camera);
      const k = wheel3d.pick(ray);
      if (k && k !== hooks.bigKey()) {
        learnt();
        haptics.pulse(4);
        api.spinTo(k);
        return true;
      }
      return false;
    },
    hide() {
      if (shown) {
        shown = false;
        group.visible = false;
        wheel3d.hide();
        drag = null;
        target = null;
        free = false;
        vel = 0;
      }
    },
    /** une fois par image, en vitrine ordinateur */
    update(dt: number, t: number) {
      if (!enabled || N() < 2) return void api.hide();
      shown = true;
      group.visible = true;
      // le grand booster a changé sans nous (arrivée sur la boutique, booster déjà tiré posé par la boutique…) : la roue
      // se cale dessus sans animation
      const big0 = hooks.bigKey();
      if (!drag && target === null && !free && mod(Math.round(pos)) !== indexOf(big0)) api.snap();
      step(dt);
      // respiration d'invitation (tant que la roue n'a jamais été tournée) : un quart de cran dans un sens puis retour,
      // en douceur (sin², dérivée nulle aux deux bouts), après 3,5 s sans toucher la roue, une fois toutes les 8 s,
      // 4 fois au plus par visite, jamais pendant qu'elle bouge ou qu'elle est verrouillée
      {
        const now = performance.now();
        const calm = !drag && target === null && !free && !hooks.locked() && document.visibilityState === 'visible';
        if (nudgeT < 0 && calm && !learned && nudges < 4 && now - lastAct > 3500) {
          nudgeT = 0;
          nudgeDir = nudges % 2 ? -1 : 1;
          nudges++;
        }
        if (nudgeT >= 0) {
          nudgeT += dt / 1.35;
          if (!calm || nudgeT >= 1) {
            nudgeT = -1;
            nudgeOff = 0;
            lastAct = now + 4500; // prochaine respiration ≈ 8 s plus tard
          } else {
            const w = Math.sin(Math.PI * nudgeT);
            nudgeOff = 0.22 * nudgeDir * w * w;
          }
        }
      }
      holdK += (((drag && !drag.moved) ? 1 : 0) - holdK) * (1 - Math.exp(-dt * 12));
      const { k } = cameraScale(camera, ctx.height);
      const big = hooks.bigKey();
      const sp = Math.min(Math.abs(vel), 30);
      items.length = 0;
      for (let i = 0; i < N(); i++) {
        const d = near(i - pos - nudgeOff);
        const a = Math.abs(d);
        const p = poseAt(d);
        // celles de derrière (au-delà du quart de tour) sont cachées
        const hidden = keys[i] === big || a * stepAngle() > Math.PI * 0.62;
        items.push({
          key: keys[i],
          x: 0,
          y: -p.y * k,
          z: p.z * k,
          rotY: 0,
          rotX: p.rotX,
          rotZ: 0,
          size: PACK.w * layout.S * k,
          // pochettes voisines un peu dans l'ombre (le grand booster reste le sujet)
          // (survolée : elle s'éclaire, « je suis attrapable »)
          dim: hidden ? 1 : Math.min(0.5, 0.05 + a * 0.1) * (keys[i] === hoverKey ? 0.25 : 1),
          glow: 0,
          accent: '',
        });
      }
      wheel3d.set(items, k);
      // crans : clic + petit tic (hauteur selon la vitesse), comme la roue téléphone
      const r = Math.round(pos);
      if (r !== detent) {
        const moved = r - detent;
        detent = r;
        const now = performance.now();
        if (Math.abs(moved) <= 2 && now - lastClick > 38) {
          lastClick = now;
          haptics.pulse(sp > 12 ? 3 : 5);
          ctx.sfx.tick(1.45 + Math.min(sp, 24) * 0.03, 0.022 + Math.min(sp, 24) * 0.0008);
        }
      }
      // chevrons : dans les espaces entre la pochette du milieu et ses voisines, posés sur le tambour (même angle de
      // vue que les pochettes) ; ils s'effacent pendant que la roue tourne (les espaces bougent, pas eux)
      const still = !drag && target === null && !free;
      const moving = drag?.moved || (!still && sp > 0.5);
      const prevHover = hoverKey;
      hoverKey = null;
      const inp = ctx.input;
      if (still && inp.inside && !inp.down && !hooks.locked()) {
        ndc.set(inp.ndcX, inp.ndcY);
        if (ndc.x !== tmpV.x || ndc.y !== tmpV.y) {
          tmpV.copy(ndc);
          ray.setFromCamera(ndc, camera);
          const kk = wheel3d.pick(ray);
          hoverKey = kk && kk !== big ? kk : null;
        }
        else hoverKey = prevHover; // (souris immobile : même survol qu'à l'image d'avant)
      } else tmpV.set(9, 9);
      void moving;
    },
    dispose() {
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      cv.removeEventListener('wheel', onWheel);
      scene.remove(group);
    },
  };
  return api;
}

export type Reel = ReturnType<typeof createReel>;
