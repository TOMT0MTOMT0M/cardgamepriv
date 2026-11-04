import {
  Color, DirectionalLight, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh,
  MeshBasicNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, PointLight, RenderTarget, SphereGeometry, Vector3, type Material,
} from 'three/webgpu';
import { color, float, hash, instanceIndex, instancedBufferAttribute, mix, mx_noise_float, positionLocal, positionWorld, sin, smoothstep, time, uniform, vec3, vec4 } from 'three/tsl';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { ensureCardImages } from '../../core/art';
import { cardById, type CardData } from '../../core/cardData';
import { siteUrl } from '../../core/siteRoot';
import { gbcTransition } from '../../game/scenes/gbcTransition';
import { createPipeline } from '../../core/post';
import { EASE, rng } from '../../core/ease';
import { createCardMesh, CARD } from '../../core/cardModel';
import { mobileArtScale } from '../../core/renderer';
import { haptics } from '../../core/haptics';
import { fxReduced } from '../../core/fxPref';
import type { N } from '../../core/tsl';
import type { PokemonType } from '../../core/sets/pokemonTypes';
import { buildEdge, buildFace, gameCardArtAsync, themedBacks } from '../../game/scenes/cardFace';

/**
 * 041 — RENCONTRE SAUVAGE (Pokémon 6★ uniquement, demande de Tom du 4 nov.).
 * La transition de combat Game Boy Color (calque DOM, game/scenes/gbcTransition.ts) ouvre la séquence et la musique
 * « Combat contre un Pokémon sauvage » (Rouge / Bleu, fournie par Tom) tourne en boucle jusqu'à ce que le joueur
 * continue. La scène reprend le 026 (lucioles de Kuramoto : chaque particule clignote à son rythme, puis tout l'essaim
 * se synchronise ; à l'unisson, l'éclair collectif retourne la carte) — mais le DÉCOR dépend du type du Pokémon :
 * prairie de nuit et lucioles pour la plante (le 026 d'origine), braises qui montent sur une coulée de lave pour le feu,
 * bulles sur un lac miroir pour l'eau, étincelles et éclairs d'orage pour l'électrik, feux follets pour le spectre…
 * Retournement par la charnière droite (comme l'ouverture). À la révélation, la boîte de dialogue de la console :
 * « Un MEWTWO sauvage apparaît ! ».
 */
interface TypeScene {
  /** fond (haut, bas) */
  bg: [string, string];
  /** sol (couleur, rugosité, métal) */
  ground: string;
  rough: number;
  metal: number;
  /** herbe : deux teintes (bas, haut) ou null (pas d'herbe) ; `tall` : roseaux */
  grass: [string, string] | null;
  tall?: number;
  /** veines lumineuses dans le sol (lave, cristaux…) */
  veins?: string;
  /** particules : couleur, poussée verticale (+ monte / − tombe), tourbillon (×), agitation */
  fly: string;
  rise: number;
  swirl: number;
  jitter: number;
  /** lune / lumière d'ambiance */
  moon: string;
  moonI: number;
  /** éclairs d'orage */
  storm?: boolean;
  /** brouillard bas (voile coloré additif au ras du sol) */
  mist?: string;
}

const SCENES: Record<PokemonType, TypeScene> = {
  plante: { bg: ['#0b0e12', '#020304'], ground: '#151b12', rough: 0.95, metal: 0, grass: ['#17240f', '#2b3a18'], fly: '#d6ef77', rise: 0, swirl: 1, jitter: 0, moon: '#8ea4c8', moonI: 0.3 },
  insecte: { bg: ['#0c120a', '#030502'], ground: '#141c0f', rough: 0.95, metal: 0, grass: ['#1d2c0e', '#3d5214'], fly: '#b8ff6b', rise: 0, swirl: 1.4, jitter: 0.6, moon: '#a8c88e', moonI: 0.28 },
  feu: { bg: ['#1a0805', '#050101'], ground: '#140806', rough: 0.85, metal: 0, grass: null, veins: '#ff5a1a', fly: '#ff8a3a', rise: 0.35, swirl: 0.8, jitter: 0.3, moon: '#ff9a6a', moonI: 0.22, mist: '#ff4a10' },
  eau: { bg: ['#06101c', '#010308'], ground: '#06121e', rough: 0.06, metal: 0.7, grass: ['#0c2228', '#1d4a4e'], tall: 2.6, fly: '#7fd8ff', rise: 0.22, swirl: 0.7, jitter: 0, moon: '#9cc8ff', moonI: 0.42 },
  electrik: { bg: ['#0c0e1a', '#020206'], ground: '#121320', rough: 0.7, metal: 0.2, grass: ['#16192a', '#2a2e44'], fly: '#ffe14a', rise: 0, swirl: 1.2, jitter: 2.4, moon: '#b8c4ff', moonI: 0.2, storm: true },
  psy: { bg: ['#1a0c1c', '#050208'], ground: '#170c18', rough: 0.6, metal: 0.1, grass: null, veins: '#ff7ad9', fly: '#ff8ae0', rise: 0.05, swirl: 3.2, jitter: 0, moon: '#e0a8ff', moonI: 0.3, mist: '#c04aff' },
  spectre: { bg: ['#120a1c', '#030106'], ground: '#110b16', rough: 0.95, metal: 0, grass: ['#1a1420', '#3a2e44'], fly: '#a07aff', rise: 0.08, swirl: 0.6, jitter: 0, moon: '#a090d0', moonI: 0.16, mist: '#6a3aff' },
  tenebres: { bg: ['#0a0608', '#000000'], ground: '#0b0809', rough: 0.95, metal: 0, grass: ['#120c0e', '#24181c'], fly: '#ff3a4a', rise: 0, swirl: 0.5, jitter: 0, moon: '#806070', moonI: 0.1 },
  dragon: { bg: ['#0a0c22', '#020208'], ground: '#0d0f22', rough: 0.7, metal: 0.2, grass: null, veins: '#6a7aff', fly: '#7a8aff', rise: 0.1, swirl: 3.8, jitter: 0, moon: '#9ca8ff', moonI: 0.3 },
  fee: { bg: ['#1c0e18', '#060205'], ground: '#1a1016', rough: 0.9, metal: 0, grass: ['#2a1624', '#5a2e4c'], fly: '#ffb3e6', rise: -0.18, swirl: 1.2, jitter: 0, moon: '#ffc8ec', moonI: 0.34 },
  combat: { bg: ['#1c1008', '#050302'], ground: '#1a120c', rough: 0.9, metal: 0, grass: ['#2a1c10', '#4e3a20'], fly: '#ffb26b', rise: 0.12, swirl: 1, jitter: 0.8, moon: '#ffc08a', moonI: 0.3 },
  acier: { bg: ['#0e1116', '#020304'], ground: '#1a1e24', rough: 0.3, metal: 0.9, grass: null, veins: '#9fd0ff', fly: '#dfe8ff', rise: 0, swirl: 1, jitter: 1.6, moon: '#c8d4e8', moonI: 0.4 },
  normal: { bg: ['#16120a', '#040302'], ground: '#1a1610', rough: 0.95, metal: 0, grass: ['#2a2412', '#4e4422'], fly: '#fff3c4', rise: 0, swirl: 1, jitter: 0, moon: '#ffe8b8', moonI: 0.34 },
  poison: { bg: ['#120a18', '#030205'], ground: '#140c16', rough: 0.4, metal: 0.1, grass: ['#1c1424', '#3a2448'], fly: '#c86bff', rise: 0.25, swirl: 0.8, jitter: 0.2, moon: '#b48ad8', moonI: 0.2, mist: '#7a2aff' },
  roche: { bg: ['#14100c', '#040302'], ground: '#1e1812', rough: 1, metal: 0, grass: null, veins: '#ffd0e8', fly: '#e0b27a', rise: 0.04, swirl: 0.9, jitter: 0.3, moon: '#d8c0a0', moonI: 0.3 },
  sol: { bg: ['#16100a', '#050302'], ground: '#22180e', rough: 1, metal: 0, grass: null, fly: '#e0b27a', rise: 0.04, swirl: 1.6, jitter: 0.4, moon: '#e0c49a', moonI: 0.3, mist: '#a06a30' },
  vol: { bg: ['#0c1424', '#03060c'], ground: '#121a26', rough: 0.95, metal: 0, grass: ['#16202e', '#2c3c52'], fly: '#ffffff', rise: -0.12, swirl: 2, jitter: 0, moon: '#c8dcff', moonI: 0.42 },
  glace: { bg: ['#0a1420', '#02060a'], ground: '#a8c4d8', rough: 0.25, metal: 0.3, grass: null, fly: '#d8f4ff', rise: -0.22, swirl: 0.8, jitter: 0, moon: '#c8ecff', moonI: 0.36 },
};

/** libellés de la boîte de dialogue */
const TYPE_LABEL: Record<PokemonType, string> = {
  plante: 'PLANTE', insecte: 'INSECTE', feu: 'FEU', eau: 'EAU', electrik: 'ÉLECTRIK', psy: 'PSY', spectre: 'SPECTRE',
  tenebres: 'TÉNÈBRES', dragon: 'DRAGON', fee: 'FÉE', combat: 'COMBAT', acier: 'ACIER', normal: 'NORMAL', poison: 'POISON',
  roche: 'ROCHE', sol: 'SOL', vol: 'VOL', glace: 'GLACE',
};

export interface WildOptions {
  card: CardData;
  type: PokemonType;
  /** carte révélée et dialogue affiché : le jeu montre « Continuer » (la musique continue jusque-là) */
  onRevealed?: () => void;
}

const TWO_PI = Math.PI * 2;
/** boîte de dialogue façon Game Boy Color (injectée : valable dans le jeu comme dans le labo) */
const GBC_CSS = `
.gbc-box { position: absolute; left: 50%; bottom: calc(108px + env(safe-area-inset-bottom)); width: min(560px, calc(100vw - 24px)); box-sizing: border-box; transform: translate(-50%, 14px); padding: 14px 18px 12px; background: #f8f8f0; color: #181818; border: 4px solid #181818; box-shadow: inset 0 0 0 3px #f8f8f0, inset 0 0 0 6px #5878a8, 0 10px 40px -10px rgba(0,0,0,.9); border-radius: 6px; font: 700 clamp(15px, 4.2vw, 20px)/1.35 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .02em; opacity: 0; transition: opacity .15s steps(3), transform .2s steps(4); pointer-events: none; z-index: 2; }
.gbc-box.on { opacity: 1; transform: translate(-50%, 0); }
.gbc-t { min-height: 2.7em; }
.gbc-t::after { content: '▼'; display: inline-block; margin-left: 8px; font-size: .7em; animation: gbc-blink .8s steps(1) infinite; }
.gbc-s { margin-top: 4px; font: 600 11px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .12em; color: #5878a8; min-height: 1.2em; }
@keyframes gbc-blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .gbc-t::after { animation: none; } }`;
/** couplage de Kuramoto d'une 6★ (026 : critique ≈ 1) — l'essaim se synchronise vite et franchement */
const K_MYTHIC = 8;

interface Fly {
  p: Vector3;
  v: Vector3;
  phi: number;
  w: number;
  seed: [number, number, number, number];
  /** téléphone : une luciole sur 4 seulement porte une vraie lumière (voir setup) */
  light: PointLight | null;
  b: number;
}

/** scène montée à l'avance (pendant l'ouverture du booster) ; `activate()` la rend prête à s'afficher */
export interface WildExperiment extends Experiment {
  /** passe le moteur en éclairage Forward+ et compile la scène (à faire écran noir : ça change l'éclairage global) */
  activate(): Promise<void>;
}

export default function create(o?: WildOptions): WildExperiment {
  // labo (sans options) : Mewtwo, type choisi par ?type=feu|eau|… (le jeu passe la vraie carte et son type)
  const lab = !o;
  const qType = (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('type') : null) as PokemonType | null;
  const opts: WildOptions = o ?? { card: cardById('pkm-mewtwo'), type: qType && qType in SCENES ? qType : 'psy' };
  const T = SCENES[opts.type] ?? SCENES.plante;
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  let bloomNode: ReturnType<typeof bloom>;
  let moon: DirectionalLight;
  const flies: Fly[] = [];
  let bodies: InstancedMesh;
  let colAttr: InstancedBufferAttribute;
  const cardRig = new Group();
  /** lumière douce venue du spectateur, allumée à la révélation : le Pokémon reste lisible dans les décors de nuit
   *  (directionnelle : hors du Forward+, elle ne prend aucune place dans les grappes de lumières des particules) */
  const cardLight = new DirectionalLight(0xfff4e8, 0);
  const lit = { k: 0 };
  /** centre de la carte : sa base reste à 8 cm au-dessus du sol (-0,5) même inclinée et soulevée par la charnière */
  const C = new Vector3(0, 0.03, 0);
  const st = { K: 0, gather: 0, burst: 0, flip: Math.PI, hue: 0, spread: 0, fade: 0 };
  let tl: gsap.core.Timeline | null = null;
  let rtl: gsap.core.Timeline | null = null;
  let running = false;
  let active = false;
  let transitioning = false;
  let dialogDone = false;
  let activating: Promise<void> | null = null;
  /** éclairage Forward+ de la scène (le shell remet l'éclairage par défaut à chaque changement de scène : voir update) */
  let clustered: ClusteredLighting | null = null;
  let lightGain = 1;
  let startedAt = 0;
  let revealed = false;
  let elapsed = 0;
  let lastPsi = 0;
  let stormAt = 2;
  let storm = 0;
  const baseCol = new Color(T.fly);
  const tmpC = new Color();
  const m4 = new Matrix4();
  const glowU = uniform(0);
  const veinU = uniform(0);
  /** fondu d'entrée (sortie du noir de la transition) */
  const fadeU = uniform(0);
  let face: ReturnType<typeof buildFace> | null = null;
  let box: HTMLDivElement;
  const ownedMats: Material[] = [];

  function start() {
    tl?.kill();
    rtl?.kill();
    running = true;
    startedAt = performance.now();
    revealed = false;
    elapsed = 0;
    box.classList.remove('on');
    dialogDone = false;
    Object.assign(st, { K: 0, gather: 0, burst: 0, flip: Math.PI, hue: 0, spread: 0, fade: 0 });
    lit.k = 0;
    if (face) face.lit.value = 0;
    const r = rng(17);
    for (const f of flies) {
      const a = r() * TWO_PI, rad = 1.6 + r() * 1.2;
      f.p.set(Math.cos(a) * rad, -0.3 + r() * 0.8, Math.sin(a) * rad * 0.7 - 0.4);
      f.v.set(0, 0, 0);
      f.phi = r() * TWO_PI;
    }
    tl = gsap.timeline();
    // l'écran sort du noir de la transition, puis l'essaim approche et se met d'accord
    tl.to(st, { fade: 1, duration: 0.6, ease: EASE.glide }, 0)
      .to(veinU, { value: 1, duration: 2.4, ease: EASE.breathe }, 0.2)
      .to(st, { gather: 1, duration: 2.4, ease: EASE.breathe }, 0.3)
      .to(st, { K: K_MYTHIC, duration: 2.8, ease: EASE.heave }, 0.5);
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    const sfx = ctx.sfx;
    const r = (rtl = gsap.timeline());
    r.to(st, { gather: 1.35, duration: 0.55, ease: EASE.heave })
      .call(() => {
        sfx.thump(0.75);
        sfx.crack(0.3);
        sfx.chime(5, 0.16);
        sfx.prismatic(0.07);
        haptics.pulse([40, 80, 40, 80, 120]);
      })
      .to(st, { burst: 1, duration: 0.08 })
      .to(st, { flip: 0, duration: 1.1, ease: EASE.settle }, '<')
      .to(st, { burst: 0, duration: 1.6, ease: EASE.glide })
      .to(st, { gather: 0.75, spread: 1, duration: 2.2, ease: EASE.glide }, '<')
      .to(st, { hue: 1, duration: 1.4, ease: EASE.breathe }, '<')
      .to(lit, { k: 1, duration: 1.2, ease: EASE.glide }, 0.7);
    // étoiles une à une (6 carillons ascendants), puis la boîte de dialogue
    for (let k = 0; k < 6; k++) r.call(() => {
      if (face) face.lit.value = k + 1;
      sfx.note(5 + k, 0.08, 0.9);
    }, [], 1.1 + k * 0.16);
    r.call(() => dialog(), [], 1.95);
  }

  /** boîte de dialogue de la console, texte tapé lettre par lettre (avec le petit bip) */
  function dialog() {
    const txt = box.querySelector<HTMLElement>('.gbc-t')!;
    const full = `Un ${opts.card.name.toUpperCase()} sauvage apparaît !`;
    txt.textContent = '';
    box.classList.add('on');
    let i = 0;
    const tick = () => {
      if (!running) return;
      i++;
      txt.textContent = full.slice(0, i);
      if (i % 2 === 0) ctx.sfx.tick(1.8, 0.03);
      if (i < full.length) window.setTimeout(tick, 28);
      else {
        box.querySelector<HTMLElement>('.gbc-s')!.textContent = `Type ${TYPE_LABEL[opts.type] ?? ''} · ★★★★★★ MYTHIQUE`;
        dialogDone = true;
        opts.onRevealed?.();
      }
    };
    window.setTimeout(tick, 120);
  }

  const this_: WildExperiment = {
    async setup(c) {
      ctx = c;
      const mobile = c.quality === 'mobile';
      stage = createStage(c, { bg: T.bg, env: 'night', envIntensity: 0.12, fov: 32 });
      moon = new DirectionalLight(new Color(T.moon), T.moonI);
      moon.position.set(1.2, 1.6, 1.4);
      stage.scene.add(moon);

      // ── la carte : la vraie carte du jeu (gabarit pleine illustration, holo, dos du thème, tranche arc-en-ciel)
      await ensureCardImages([opts.card]);
      const art = await gameCardArtAsync(opts.card, 'mythic', mobile ? mobileArtScale(c.width, c.height, 0.7) : 0.85);
      c.bag.add(art);
      face = buildFace(art, 5, false);
      face.holo.uniforms.strength.value = 0.75;
      const backs = themedBacks(c.bag, mobile ? 0.7 : 0.6);
      const { edge, rim } = buildEdge('rainbow');
      rim.value = 0.6;
      ownedMats.push(face.holo.material, edge);
      const front = face.holo.material as MeshStandardNodeMaterial;
      // lueur de l'éclair : seulement sur le cadre / le foil (masque r), jamais sur toute l'illustration
      front.emissiveNode = (front.emissiveNode as N).add(color(T.fly).mul(face.holo.layers.masks.r.mul(0.8)).mul(glowU));
      const mesh = createCardMesh(face.holo.material, backs.forCard(opts.card.id), edge);
      cardRig.add(mesh);
      cardRig.position.copy(C);
      stage.scene.add(cardRig);
      cardLight.position.set(0.4, 0.6, 3);
      cardLight.target = cardRig;
      stage.scene.add(cardLight);

      // ── sol (+ veines lumineuses pour la lave, les cristaux, les runes…)
      const gm = new MeshStandardNodeMaterial();
      const nz = mx_noise_float(positionWorld.xz.mul(6)) as N;
      gm.colorNode = vec4(color(T.ground).mul(nz.mul(0.25).add(0.85)), 1);
      gm.roughnessNode = float(T.rough);
      gm.metalnessNode = float(T.metal);
      if (T.veins) {
        const v = mx_noise_float(positionWorld.xz.mul(2.2).add(vec3(0, 0, time.mul(0.05)).xz)) as N;
        const line = smoothstep(0.035, 0.0, v.abs()) as N;
        gm.emissiveNode = color(T.veins).mul(line.mul(veinU).mul(0.45).mul(sin(time.mul(1.3).add(positionWorld.x.mul(2))).mul(0.3).add(0.9)));
      }
      const ground = new Mesh(new PlaneGeometry(14, 14).rotateX(-Math.PI / 2), gm);
      ground.position.y = -0.5;
      stage.scene.add(ground);
      // brume colorée au ras du sol
      if (T.mist) {
        const mm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
        const m = mx_noise_float(positionWorld.xz.mul(1.4).add(vec3(time.mul(0.08), 0, 0).xz)) as N;
        mm.colorNode = vec4(color(T.mist), m.mul(0.5).add(0.5).mul(0.07));
        const mist = new Mesh(new PlaneGeometry(14, 14).rotateX(-Math.PI / 2), mm);
        mist.position.y = -0.42;
        stage.scene.add(mist);
      }

      // ── herbe / roseaux (instanciés, balancement TSL)
      if (T.grass) {
        const tall = T.tall ?? 1;
        const bladeG = new PlaneGeometry(0.014, 0.16 * tall, 1, 4).translate(0, 0.08 * tall, 0);
        const bm = new MeshStandardNodeMaterial({ side: DoubleSide });
        const h = hash(instanceIndex);
        const sway = sin(time.mul(1.1).add(h.mul(6.28)).add(positionWorld.x.mul(1.5))).mul(0.18).mul(positionLocal.y.mul(positionLocal.y).mul(36 / (tall * tall)));
        bm.positionNode = positionLocal.add(vec3(sway.mul(0.12), 0, sway.mul(0.05)));
        bm.colorNode = vec4(mix(color(T.grass[0]), color(T.grass[1]), h), 1);
        bm.roughnessNode = float(0.75);
        const nBlades = Math.round((mobile ? 380 : 2200) * (tall > 1 ? 0.45 : 1));
        const grass = new InstancedMesh(bladeG, bm, nBlades);
        const gr = rng(3);
        for (let i = 0; i < nBlades; i++) {
          let x = 0, z = 0;
          do {
            const a = gr() * TWO_PI, rad = 0.25 + Math.sqrt(gr()) * 2.6;
            x = Math.cos(a) * rad;
            z = Math.sin(a) * rad * 0.8 - 0.4;
          } while (Math.abs(x) < 0.42 && z > -0.12 && z < 1.2);
          const s = 0.5 + gr() * 1.2;
          m4.makeRotationY(gr() * Math.PI).scale(new Vector3(1, s, 1)).setPosition(x, -0.5, z);
          grass.setMatrixAt(i, m4);
        }
        stage.scene.add(grass);
      }

      // ── particules : corps instanciés (HDR → bloom) + une PointLight chacune
      const n = mobile ? 240 : 480;
      const body = new SphereGeometry(0.0045, mobile ? 6 : 8, mobile ? 4 : 6);
      colAttr = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
      colAttr.setUsage(DynamicDrawUsage);
      const fm = new MeshBasicNodeMaterial();
      fm.colorNode = vec4(instancedBufferAttribute(colAttr) as N, 1);
      bodies = new InstancedMesh(body, fm, n);
      bodies.instanceMatrix.setUsage(DynamicDrawUsage);
      bodies.frustumCulled = false;
      stage.scene.add(bodies);
      const r = rng(11);
      // (perf téléphone) les PointLights = le premier poste de la scène : une luciole sur 30 porte une vraie lumière (8,
      // éclairage classique, sans Forward+), plus forte d'autant ; les corps lumineux (bloom) restent tous là
      lightGain = mobile ? 7 : 1;
      for (let i = 0; i < n; i++) {
        const light = !mobile || i % 30 === 0 ? new PointLight(baseCol, 0, mobile ? 1.1 : 0.65, 2) : null;
        if (light) stage.scene.add(light);
        flies.push({ p: new Vector3(), v: new Vector3(), phi: r() * TWO_PI, w: TWO_PI * (0.85 + r() * 0.3), seed: [r() * 10, r() * 10, r() * 10, 0.6 + r() * 0.8], light, b: 0 });
      }

      // ── boîte de dialogue (calque de la scène)
      if (!document.getElementById('gbc-box-css')) {
        const css = document.createElement('style');
        css.id = 'gbc-box-css';
        css.textContent = GBC_CSS;
        document.head.append(css);
      }
      box = document.createElement('div');
      box.className = 'gbc-box';
      box.innerHTML = '<div class="gbc-t"></div><div class="gbc-s"></div>';
      c.overlay.append(box);

      post = createPipeline(c, stage.scene, stage.camera);
      bloomNode = post.own(bloom(post.color, 0.5, 0.5, 0.85));
      post.output = (post.color as N).add(bloomNode).mul(fadeU);
      place(c.width, c.height);
      // toucher pendant la synchronisation : l'essaim s'accorde plus vite (jamais pour sauter la révélation)
      // toucher : jamais avant que la scène soit sortie du noir ni pendant la transition (sinon il « déclenche » des
      // choses invisibles) ; pendant la synchronisation, il accélère l'accord de l'essaim
      c.bag.fn(c.input.onTap(() => {
        if (!active || transitioning) return;
        if (running && !revealed && st.fade > 0.9) st.K = Math.max(st.K, K_MYTHIC) * 1.3;
        else if (lab && revealed && dialogDone) this_.replay?.();
      }));
      if (lab) c.bag.fn(() => ctx.sfx.stopMusic(0.3));
      if (lab) {
        await this_.activate();
        this_.replay?.();
      }
      c.bag.fn(() => (tl?.kill(), rtl?.kill(), (running = false)));
    },
    activate() {
      if (activating) return activating;
      activating = (async () => {
        // vraies lumières par particule (Forward+) — rendu au système d'éclairage d'avant au démontage.
        // (téléphone, retour de Tom 4 nov. : « gros ralentissements ») PAS de Forward+ : son calcul par tuiles coûte plus
        // que tout le reste de la scène sur un GPU mobile ; 8 lumières classiques suffisent (voir setup)
        if (ctx.quality !== 'mobile') {
          const prevLighting = ctx.renderer.lighting;
          const lighting = (clustered = new ClusteredLighting(1024, 32, 24, 64));
          ctx.renderer.lighting = lighting;
          ctx.bag.fn(() => {
            ctx.renderer.lighting = prevLighting;
            lighting.dispose();
          });
        }
        await stage.compile();
        // image « à blanc » hors écran : les vrais pipelines (passe + bloom) sont créés pendant le noir de la transition,
        // pas à la 1re image visible (à-coup de plusieurs secondes sur téléphone)
        const warm = new RenderTarget(4, 4);
        const prevRT = ctx.renderer.getRenderTarget();
        try {
          stage.scene.updateMatrixWorld();
          ctx.renderer.setRenderTarget(warm);
          post.render();
        } catch (e) {
          console.warn('[wild] image de préchauffage', e);
        } finally {
          ctx.renderer.setRenderTarget(prevRT);
          warm.dispose();
        }
        active = true;
      })();
      return activating;
    },
    replay() {
      if (!lab) return start();
      if (transitioning) return; // labo : jamais deux transitions l'une sur l'autre
      // labo : la séquence complète à chaque toucher — transition GBC, musique en boucle, puis la scène
      transitioning = true;
      const tr = gbcTransition();
      void ctx.sfx.playMusic(siteUrl('audio/pokemon-wild-battle.mp3'), { loopStart: 20, loopEnd: 51.3475, vol: 0.55, fade: 0.04 });
      running = false;
      st.fade = 0;
      void tr.covered.then(() => (start(), tr.reveal().then(() => (transitioning = false))));
    },
    update(dtFrame, t) {
      if (!active) return;
      // CRASH du 4 nov. : shell.show() remet l'éclairage par défaut (applyRendererDefaults) → les ~480 PointLights
      // passaient dans un seul shader « forward » (compilation géante → navigateur figé / GPU perdu, écran noir).
      // On réimpose le Forward+ avant chaque rendu (simple comparaison, les pipelines compilés avec lui restent valides).
      if (clustered && ctx.renderer.lighting !== clustered) ctx.renderer.lighting = clustered;
      if (!running) {
        post.render();
        return;
      }
      const total = Math.min(dtFrame, 0.3);
      const steps = Math.max(1, Math.ceil(total / (1 / 40)));
      for (let k = 0; k < steps; k++) step(total / steps, t - total + ((k + 1) * total) / steps, k === steps - 1);
      // orage (électrik) : éclairs de fond irréguliers
      if (T.storm) {
        stormAt -= dtFrame;
        if (stormAt <= 0) {
          storm = 1;
          stormAt = 1.2 + Math.random() * 2.6;
          if (!fxReduced()) ctx.sfx.rumble(0.8, 0.12);
        }
        storm = Math.max(0, storm - dtFrame * (storm > 0.6 ? 9 : 3));
        moon.intensity = T.moonI + (fxReduced() ? 0 : storm * 2.4);
      }
      // carte : retournement par la CHARNIÈRE DROITE (le bord droit reste posé, le bord gauche passe devant)
      const p = ctx.input.pose(0.12);
      const phi = Math.PI - st.flip;
      const w = CARD.w;
      const u = Math.min(1, Math.max(0, (phi / Math.PI - 0.5) * 2));
      const settle = u * u * (3 - 2 * u);
      const dx = (w / 2) * (1 - Math.cos(phi)) - w * settle;
      const lift = Math.abs(Math.sin(phi)) * (w / 2 + 0.008);
      cardRig.position.set(C.x + dx, C.y, C.z + lift);
      cardRig.rotation.set(p.x, -st.flip + p.y, 0);
      bloomNode.strength.value = 0.45 + st.burst * 1.1;
      glowU.value = st.burst * 0.9 + (revealed ? 0.05 : 0);
      if (face) face.flash.value = st.burst;
      fadeU.value = st.fade;
      cardLight.intensity = lit.k * 0.9;
      post.render();
    },
    resize(w, h) {
      place(w, h);
    },
    dispose() {
      running = false;
      ownedMats.forEach((m) => m.dispose());
    },
  };
  return this_;

  function step(dt: number, t: number, last: boolean) {
    elapsed += dt;
    let sx = 0, sy = 0;
    for (const f of flies) {
      sx += Math.cos(f.phi);
      sy += Math.sin(f.phi);
    }
    const R = Math.hypot(sx, sy) / flies.length;
    const psi = Math.atan2(sy, sx);
    for (const f of flies) f.phi = (((f.phi + (f.w + st.K * R * Math.sin(psi - f.phi)) * dt) % TWO_PI) + TWO_PI) % TWO_PI;
    if (lastPsi < 0 && psi >= 0 && R > 0.45 && !revealed) ctx.sfx.tick(0.6 + R * 0.6, 0.03 + R * 0.06);
    lastPsi = psi;
    if (!revealed && st.K > K_MYTHIC * 0.85 && R > 0.9) reveal();
    // garde-fou en temps RÉEL (un téléphone lent simule moins vite) : la révélation ne dépasse jamais ~9 s
    if (!revealed && performance.now() - startedAt > 6500) reveal();

    const rT = 0.95 - 0.45 * Math.min(1, st.gather) * (0.4 + 0.6 * R) + st.spread * 0.35 - (st.gather > 1 ? (st.gather - 1) * 0.6 : 0);
    const free = 1 - Math.min(1, st.gather) * 0.75;
    const d = new Vector3();
    flies.forEach((f, i) => {
      const [a, b, c2, sp] = f.seed;
      f.v.x += Math.sin(t * 0.7 * sp + a) * 0.5 * dt;
      f.v.y += Math.sin(t * 0.9 * sp + b) * 0.3 * dt + T.rise * free * dt;
      f.v.z += Math.sin(t * 0.6 * sp + c2) * 0.5 * dt;
      if (T.jitter > 0) {
        f.v.x += (Math.random() - 0.5) * T.jitter * dt * 4;
        f.v.y += (Math.random() - 0.5) * T.jitter * dt * 4;
        f.v.z += (Math.random() - 0.5) * T.jitter * dt * 4;
      }
      d.copy(f.p).sub(C);
      const L = d.length() || 1;
      const pull = (rT - L) * (0.6 + st.gather * 1.4);
      f.v.addScaledVector(d, (pull / L) * dt);
      const sw = 0.12 * T.swirl * (1 + st.burst * 6);
      f.v.x += (-d.z / L) * sw * dt;
      f.v.z += (d.x / L) * sw * dt;
      if (f.p.y < -0.44) f.v.y += (-0.44 - f.p.y) * 6 * dt;
      // braises / bulles qui montent, pétales / neige qui tombent : elles se renouvellent hors du champ
      if (T.rise > 0 && f.p.y > 1.5) f.p.y = -0.44;
      if (T.rise < 0 && f.p.y < -0.43 && st.gather < 0.5) f.p.y = 1.4;
      if (Math.abs(f.p.z) < 0.07 && Math.abs(f.p.x) < 0.36 && Math.abs(f.p.y - C.y) < 0.48) f.v.z += Math.sign(f.p.z || 1) * 1.5 * dt;
      f.v.multiplyScalar(Math.exp(-1.4 * dt));
      f.p.addScaledVector(f.v, dt);
      let ph = f.phi;
      if (ph > Math.PI) ph -= TWO_PI;
      const flash = Math.exp(-((ph / 0.32) ** 2));
      f.b = 0.03 + flash * (1 + st.burst * 2.5);
      // après la révélation : la couleur du type part en vague spectrale (mythique) autour de l'essaim
      tmpC.copy(baseCol);
      if (st.hue > 0) tmpC.offsetHSL(((Math.atan2(d.z, d.x) / TWO_PI + t * 0.08) % 1) * st.hue, 0, 0);
      if (f.light) {
        f.light.color.copy(tmpC);
        f.light.intensity = f.b * 0.24 * lightGain;
        f.light.position.copy(f.p);
      }
      colAttr.setXYZ(i, tmpC.r * f.b * 6, tmpC.g * f.b * 6, tmpC.b * f.b * 6);
      m4.makeTranslation(f.p.x, f.p.y, f.p.z);
      bodies.setMatrixAt(i, m4);
    });
    if (last) {
      colAttr.needsUpdate = true;
      bodies.instanceMatrix.needsUpdate = true;
    }
  }

  function place(w: number, h: number) {
    const a = w / h;
    const k = Math.max(1, 1.05 / a);
    const c = stage.camera;
    c.aspect = a;
    c.position.set(0, 0.18 * k, 2.75 * k);
    c.lookAt(0, -0.06, 0);
    c.updateProjectionMatrix();
  }
}

