import {
  AdditiveBlending,
  AnimationMixer,
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  RenderTarget,
  CircleGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteNodeMaterial,
  TextureLoader,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from 'three/webgpu';
import {
  abs,
  atan,
  clamp,
  color,
  cos,
  exp,
  float,
  floor,
  fract,
  hash,
  instanceIndex,
  length,
  luminance,
  max,
  min,
  mix,
  normalView,
  positionLocal,
  positionViewDirection,
  positionWorld,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { cardArtFor } from '../../core/art';
import type { CardData } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { createPipeline } from '../../core/post';
import { createHoloMaterial } from '../../core/holo';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { createCardMesh, CARD } from '../../core/cardModel';
import { EASE, Spring } from '../../core/ease';
import type { N } from '../../core/tsl';
import { mobileArtScale } from '../../core/renderer';
import { haptics } from '../../core/haptics';
import { fxReduced } from '../../core/fxPref';
import { siteUrl } from '../../core/siteRoot';
import type { DuelMonster } from './duelMonsters';
// Fraunces ne sert qu'au nom du monstre de cette scène (audit 06/11) : chargée ici, pas au premier écran
import '@fontsource-variable/fraunces/opsz.css';
import { createAutoPose, createRig, dragonPose, isWingedRig, type AutoPose, type Rig } from './duelRig';

/**
 * Invocation — la cinématique des 6★ Yu-Gi-Oh (pack Pop Culture), jouée à la place de la séquence mythique habituelle.
 *
 * 1. MÉTAMORPHOSE : la carte (face cachée, comme dans la pile) voit son dos brûler en diagonale et devenir un dos de
 *    « carte de duel » (dessin original : nuit, bronze, six étoiles en couronne — pas le dos officiel).
 * 2. DESCENTE : la carte bascule et se pose sur un terrain de duel qui s'allume en onde ; la caméra plonge à hauteur de
 *    genou, l'angle s'ouvre (POV), pendant « l'heure du duel » (fichier sfx/duel.mp3 s'il existe, sinon motif original).
 * 3. RETOURNEMENT sur le terrain, puis faisceau de projection.
 * 4. HOLOGRAMME : le monstre s'élève depuis la carte — bleu, lignes de balayage, scintillement, glitchs — et pousse
 *    son cri (synthétisé, ou sfx/<carte>.mp3).
 * 5. MATÉRIALISATION : la texture gagne le corps du BAS VERS LE HAUT derrière une ligne de lumière qui crépite.
 * 6. Admiration (nom, sous-titre), puis flash de sortie : l'ouverture reprend, la carte en plein écran.
 *
 * Monstre : illustration de la carte détourée + carte de relief (2.5D, maillage déplacé : parallaxe, volume, souffle),
 * ou modèle 3D animé `models/<carte>.glb` s'il a été déposé (voir duelMonsters.ts). Un toucher : la matérialisation se
 * termine tout de suite ; un second : on rend la main. « Effets réduits » : ni secousse, ni glitch, flashs adoucis.
 */
export interface DuelSummonOptions {
  card: CardData;
  monster: DuelMonster;
  /** appelé à la fin (flash de sortie au maximum) : le jeu ré-affiche l'ouverture */
  onDone: () => void;
}

const HOLO = '#5fd6ff';
const HOLO_DEEP = '#1b6dff';
const BRONZE = '#b8874a';
const NIGHT = '#0a1020';

const FX_DIR = 'fx/yugioh/';

/** Le fichier existe-t-il vraiment ? (le serveur de dev et le site renvoient la page HTML pour une adresse inconnue) */
async function exists(url: string, type: RegExp): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok && type.test(r.headers.get('content-type') ?? '');
  } catch {
    return false;
  }
}

function loadTex(url: string, srgb: boolean): Promise<Texture> {
  return new TextureLoader().loadAsync(url).then((t) => {
    if (srgb) t.colorSpace = SRGBColorSpace;
    t.anisotropy = matchMedia('(pointer: coarse)').matches ? 1 : 4;
    return t;
  });
}

export default function createDuelSummon(opts: DuelSummonOptions): Experiment & { suspend(): void } {
  const M = opts.monster;
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  let key: DirectionalLight;
  const tiltRig = new Group();
  const cardRig = new Group();
  const monsterRig = new Group();
  let tl: gsap.core.Timeline | null = null;
  let mixer: AnimationMixer | null = null;
  let glbClips: { summon?: () => void } = {};
  let music: { fade(s?: number): void } | null = null;
  let cryBuf: AudioBuffer | null = null;
  let duelBuf: AudioBuffer | null = null;
  let textEl: HTMLDivElement;
  let hintEl: HTMLDivElement;
  let skipEl: HTMLButtonElement;
  let bloomRef: N;
  let calm = false;
  let ended = false;
  let revealed = false;
  let started = false;
  let D0 = 3;
  let aspect = 1;
  /** taille de l'hologramme (le modèle 3D, s'il y en a un, est mis à cette hauteur) */
  const tall = M.tall;
  /** hauteur RÉELLE du monstre posé (le modèle 3D est mis à l'échelle sur sa silhouette, ailes comprises) */
  let H = tall;
  let wide = tall;
  /** squelette de dragon ailé animé à la main (modèles sans animation) */
  let rig: Rig | null = null;
  /** autres squelettes sans animation : pose et vie automatiques (bras baissés, cou dressé, ailes, queue…) */
  let auto: AutoPose | null = null;
  const shake = new Spring(0, 240, 9);
  const camPos = new Vector3();
  const camLook = new Vector3();
  const proj = new Vector3();
  const Y0 = 0.95; // hauteur de la carte au départ (la caméra la cadre de face, comme la pile de l'ouverture)
  /** place de la carte posée sur le terrain (un peu vers la caméra : le monstre se dresse juste derrière) */
  const LAND = new Vector3(0, 0.004, 0.32);

  const S = {
    trans: 0, tilt: 0, drop: 0, cam: 0, low: 0, flip: Math.PI, lift: 0, hover: 1,
    field: 0, wave: 0, beam: 0, rise: 0, tex: 0, glow: 0, glitch: 0, flash: 0, ca: 0, push: 0, orbit: 0, motes: 0, ground: 0, rear: 0.15, wing: -0.9, mouth: 0, life: 0,
  };
  const U = {
    trans: uniform(0), field: uniform(0), wave: uniform(0), beam: uniform(0), rise: uniform(0), tex: uniform(0),
    glow: uniform(0), ground: uniform(0), glitch: uniform(0), flash: uniform(0), ca: uniform(0), motes: uniform(0),
    accent: uniform(new Color(M.accent)), center: uniform(new Vector2(0.5, 0.5)),
  };

  // ───────────────────────────────────────────── carte : face du jeu, dos qui se métamorphose
  async function buildCard() {
    const mobile = ctx.quality === 'mobile';
    const own = { add: <T extends { dispose(): void }>(o: T) => ctx.bag.add(o) };
    const { art, back } = await cardArtFor(opts.card, 'mythic', own, mobile ? { scale: mobileArtScale(ctx.width, ctx.height, 0.7), noFlat: true, release: true } : undefined);
    const holo = createHoloMaterial(art, rarity('mythic').tier, { lite: mobile });
    holo.uniforms.strength.value = 0.85;
    const backMat = createBackMaterial(back);
    const q = uv().sub(0.5).mul(vec2(CARD.w, CARD.h)); // mm/100, centré
    // dos de duel (original) : nuit profonde, cadre de bronze, rosace guillochée, couronne de six étoiles, gemme
    const r = length(q);
    const th = atan(q.y, q.x.add(1e-5)); // (jamais atan(0, 0) : indéfini sur certains GPU)
    const aq = abs(q);
    const frameD = min(float(CARD.w / 2).sub(aq.x), float(CARD.h / 2).sub(aq.y)); // distance au bord
    const frame = smoothstep(0.046, 0.04, frameD).mul(smoothstep(0.004, 0.008, frameD));
    const fline = smoothstep(0.0025, 0.0, abs(frameD.sub(0.056)));
    const rings = smoothstep(0.0022, 0.0, abs(r.sub(0.215))).add(smoothstep(0.0018, 0.0, abs(r.sub(0.235))));
    const rose = smoothstep(0.003, 0.0, abs(r.sub(sin(th.mul(12)).mul(0.018).add(0.15))))
      .add(smoothstep(0.002, 0.0, abs(r.sub(cos(th.mul(18)).mul(0.012).add(0.118)))))
      .mul(0.8);
    // six étoiles (losanges à 4 branches) en couronne
    const seg = floor(th.div(Math.PI / 3).add(0.5));
    const a6 = seg.mul(Math.PI / 3);
    const sp = q.sub(vec2(cos(a6), sin(a6)).mul(0.225));
    const star = smoothstep(0.19, 0.17, abs(sp.x).sqrt().add(abs(sp.y).sqrt())); // astroïde : étoile à 4 branches
    const gem = smoothstep(0.072, 0.064, abs(q.x).mul(1.45).add(abs(q.y)));
    const gemEdge = smoothstep(0.0035, 0.0, abs(abs(q.x).mul(1.45).add(abs(q.y)).sub(0.068)));
    const guil = sin(q.x.mul(260).add(sin(q.y.mul(90)).mul(2))).mul(0.5).add(0.5).mul(0.06).mul(smoothstep(0.03, 0.06, frameD));
    const bronze = clamp(frame.add(fline).add(rings).add(rose).add(star).add(gemEdge), 0, 1);
    const night = mix(color(NIGHT), color('#16264a'), smoothstep(0.42, 0.0, r)).add(guil);
    const gemCol = mix(color('#0d3c78'), color(HOLO), smoothstep(0.07, 0.0, abs(q.x).mul(1.45).add(abs(q.y))));
    let duel: N = mix(night, color(BRONZE), bronze);
    duel = mix(duel, gemCol, gem.mul(gemEdge.oneMinus()));
    let metal: N = bronze.mul(0.9);
    let rough: N = mix(float(0.55), float(0.28), bronze);
    let glowN: N = color(HOLO).mul(gem.mul(0.6).add(star.mul(0.5)).mul(sin(time.mul(3)).mul(0.25).add(0.75)));
    // dos choisi par Tom (fx/yugioh/back.webp) : il remplace le dessin procédural ; les volutes chaudes luisent et
    // l'éclat file vers le centre du tourbillon
    const backTex = await loadTex(siteUrl(`${FX_DIR}back.webp`), true).catch(() => null);
    if (backTex) {
      ctx.bag.add(backTex);
      const bt = texture(backTex, uv());
      const bl = luminance(bt.rgb);
      const rim = smoothstep(0.03, 0.012, frameD);
      const flow = sin(r.mul(48).add(th.mul(2)).sub(time.mul(3.2))).mul(0.5).add(0.5);
      duel = bt.rgb;
      metal = rim.mul(0.35).add(smoothstep(0.35, 0.8, bl).mul(0.5));
      rough = mix(float(0.6), float(0.3), smoothstep(0.3, 0.8, bl));
      glowN = bt.rgb.mul(smoothstep(0.32, 0.85, bl).mul(flow.mul(0.9).add(0.25)).mul(rim.oneMinus()).mul(1.3));
    }
    // métamorphose : un front de braise monte en diagonale (bruit), le dos du jeu brûle et laisse le dos de duel
    const n = hash(floor(q.mul(140)).dot(vec2(1, 157))).mul(0.06);
    const front = uv().y.mul(0.8).add(uv().x.mul(0.2)).add(n);
    const T = U.trans.mul(1.25).sub(0.1);
    const done = smoothstep(T, T.sub(0.04), front);
    const edge = smoothstep(0.05, 0.0, abs(front.sub(T))).mul(step(0.001, U.trans)).mul(step(U.trans, 0.999));
    backMat.colorNode = mix(backMat.colorNode as N, duel, done);
    backMat.metalnessNode = mix(backMat.metalnessNode as N, metal, done);
    backMat.roughnessNode = mix(float(0.5), rough, done);
    backMat.emissiveNode = color('#ff9a3c').mul(edge.mul(3))
      .add(color(HOLO).mul(clamp(edge, 0, 1).pow(4).mul(4)))
      .add(glowN.mul(done));
    const edgeMat = createEdgeMaterial('#d8b27a', '#2a1c10');
    const card = createCardMesh(holo.material, backMat, edgeMat);
    ctx.bag.add(holo.material);
    ctx.bag.add(backMat);
    ctx.bag.add(edgeMat);
    cardRig.add(card);
    tiltRig.add(cardRig);
  }

  // ───────────────────────────────────────────── terrain de duel (procédural)
  function buildField() {
    const geo = ctx.bag.add(new CircleGeometry(7, 96));
    const m = new MeshStandardNodeMaterial();
    const p = positionWorld.xz.sub(vec2(LAND.x, LAND.z));
    const r = length(p);
    const th = atan(p.y, p.x.add(1e-5));
    const line = (d: N, w: number) => smoothstep(w, 0.0, abs(d));
    // anneaux, graduations, hexagones, zone de carte
    const ringA = line(r.sub(0.78), 0.006).add(line(r.sub(0.82), 0.003));
    const ticks = line(r.sub(1.12), 0.035).mul(step(0.62, fract(th.mul(36 / (2 * Math.PI)))));
    const ringB = line(r.sub(1.95), 0.005).add(line(r.sub(2.02), 0.0025)).add(line(r.sub(3.3), 0.004));
    const hx = p.mul(2.6);
    const hq = vec2(hx.x.add(hx.y.mul(0.57735)), hx.y.mul(1.1547));
    const hf = fract(hq).sub(0.5);
    const hex = smoothstep(0.47, 0.5, max(abs(hf.x), abs(hf.y))).mul(0.25).mul(smoothstep(3.2, 0.9, r));
    const zone = (() => {
      const z = abs(p).sub(vec2(CARD.w * 0.62, CARD.h * 0.62));
      const d = length(max(z, 0)).add(min(max(z.x, z.y), 0));
      return line(d, 0.004).add(line(d.sub(0.03), 0.0025).mul(0.6));
    })();
    const lines = ringA.add(ticks.mul(0.7)).add(ringB.mul(0.75)).add(hex).add(zone.mul(1.3));
    const fade = smoothstep(5.8, 1.6, r);
    // onde d'allumage (pose de la carte) : un anneau qui file vers l'extérieur et laisse le terrain allumé derrière lui
    const W = U.wave.mul(5.5);
    const crest = exp(abs(r.sub(W)).div(0.09).negate()).mul(U.wave.oneMinus().mul(1.4).add(0.2)).mul(step(0.001, U.wave));
    const lit = smoothstep(W.add(0.05), W.sub(0.25), r).mul(U.field);
    const tint = mix(color(HOLO), U.accent as unknown as N, 0.25);
    m.colorNode = mix(color('#06080e'), color('#0c1424'), smoothstep(3.5, 0.0, r));
    m.roughnessNode = float(0.38);
    m.metalnessNode = float(0.6);
    m.emissiveNode = tint
      .mul(lines.mul(lit).mul(0.9).add(crest.mul(lines.mul(2).add(0.06))))
      .mul(fade)
      // flaque de lumière sous l'hologramme
      .add((U.accent as unknown as N).mul(exp(r.mul(-2.2)).mul(U.glow.mul(0.22).add(U.beam.mul(0.35)))));
    // le terrain apparaît avec la descente et se fond dans le fond au loin (jamais d'horizon dur)
    m.transparent = true;
    m.opacityNode = smoothstep(6.8, 2.0, r).mul(U.ground);
    const mesh = new Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    ctx.bag.add(m);
    stage.scene.add(mesh);
  }

  // ───────────────────────────────────────────── faisceau de projection + poussière qui monte + étincelles
  function buildFx() {
    const mobile = ctx.quality === 'mobile';
    const beamGeo = ctx.bag.add(new CylinderGeometry(Math.min(wide, H * 1.3) * 0.5, CARD.w * 0.55, H * 1.08, mobile ? 36 : 64, 1, true));
    beamGeo.translate(0, (H * 1.08) / 2, 0);
    const bm = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    const v = uv();
    const streak = hash(floor(v.x.mul(90))).mul(0.7).add(0.3);
    const flow = sin(v.y.mul(18).sub(time.mul(5)).add(hash(floor(v.x.mul(90))).mul(40))).mul(0.5).add(0.5);
    const a = clamp(v.y.oneMinus(), 0, 1).pow(1.6).mul(streak).mul(flow.mul(0.6).add(0.4)).mul(U.beam).mul(0.32);
    bm.colorNode = vec3(0);
    (bm as unknown as { emissiveNode: N }).emissiveNode = mix(color(HOLO), U.accent as unknown as N, 0.3).mul(a.mul(1.5));
    bm.opacityNode = a;
    const beam = new Mesh(beamGeo, bm);
    beam.position.set(LAND.x, 0.005, LAND.z);
    beam.frustumCulled = false;
    ctx.bag.add(bm);
    stage.scene.add(beam);

    const i = instanceIndex;
    const h1 = hash(i), h2 = hash(i.add(11)), h3 = hash(i.add(23)), h4 = hash(i.add(37));
    // poussière lumineuse : monte lentement du terrain autour de la carte
    const mm = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    const ang = h1.mul(6.2832);
    const rad = max(h2, 0).sqrt().mul(2.8).add(0.15);
    const life = fract(h3.add(time.mul(h4.mul(0.1).add(0.04))));
    mm.positionNode = vec3(cos(ang).mul(rad).add(LAND.x), life.mul(2.8), sin(ang).mul(rad).add(LAND.z).sub(0.2));
    const disc = smoothstep(0.5, 0.0, length(uv().sub(0.5)));
    const mc = mix(color(HOLO), U.accent as unknown as N, h4);
    mm.colorNode = vec4(mc.mul(1.4), disc.mul(sin(life.mul(Math.PI))).mul(U.motes).mul(0.8));
    mm.scaleNode = h2.mul(0.012).add(0.005);
    const motes = new Sprite(mm);
    motes.count = mobile ? 300 : 1300;
    motes.frustumCulled = false;
    ctx.bag.add(mm);
    stage.scene.add(motes);

    // étincelles sur la ligne de matérialisation (repère du monstre)
    const sm = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    const k = fract(h3.add(time.mul(h4.mul(1.4).add(0.8))));
    const yLine = U.tex.mul(H);
    sm.positionNode = vec3(h1.sub(0.5).mul(wide * 0.78).add(h4.sub(0.5).mul(k).mul(0.12)), yLine.add(k.mul(k).mul(-0.18)).add(k.mul(0.05)), h2.mul(0.22).add(0.02));
    const on = smoothstep(0.0, 0.03, U.tex).mul(smoothstep(1.0, 0.94, U.tex));
    sm.colorNode = vec4(mix(color('#ffffff'), U.accent as unknown as N, h2).mul(2.2), disc.mul(k.oneMinus()).mul(on));
    sm.scaleNode = h2.mul(0.01).add(0.004).mul(k.oneMinus().mul(0.6).add(0.4));
    const sparks = new Sprite(sm);
    sparks.count = mobile ? 160 : 700;
    sparks.frustumCulled = false;
    ctx.bag.add(sm);
    monsterRig.add(sparks);
  }

  // ───────────────────────────────────────────── le monstre
  /** Masques communs (montée de l'hologramme, matérialisation bas → haut) pour une hauteur normalisée `y` (0 = sol). */
  function phaseMasks(y: N) {
    const vis = smoothstep(U.rise.mul(1.08), U.rise.mul(1.08).sub(0.07), y);
    const rv = smoothstep(U.tex.mul(1.04), U.tex.mul(1.04).sub(0.025), y);
    const band = exp(abs(y.sub(U.tex.mul(1.04))).div(0.008).negate()).mul(step(0.001, U.tex)).mul(step(U.tex, 0.995));
    // balayage : lignes fines qui défilent vers le haut + scintillement (glitchs en salves)
    // (ÉCRAN NOIR sur téléphone, 4 nov.) pow(x, y) d'un x NÉGATIF = NaN en GLSL / WGSL ; un sinus de GPU mobile peut sortir
    // un rien de [−1, 1] → une valeur NaN dans l'émissif, que le bloom étale sur TOUT l'écran en une image. Bases bornées.
    const scan = clamp(sin(y.mul(H * 90).sub(time.mul(9))).mul(0.5).add(0.5), 0, 1).pow(2.5);
    const burst = step(0.86, hash(floor(time.mul(13)))).mul(U.glitch);
    const flicker = float(0.88).add(sin(time.mul(57)).mul(0.06)).sub(burst.mul(0.45));
    return { vis, rv, band, scan, flicker, burst };
  }

  /** Hologramme 2.5D : l'illustration détourée sur un maillage déplacé par sa carte de relief. */
  async function buildHolo2D() {
    const mobile = ctx.quality === 'mobile';
    const [col, z] = await Promise.all([
      loadTex(siteUrl(`${FX_DIR}${M.file}.webp`), true),
      loadTex(siteUrl(`${FX_DIR}${M.file}-z.webp`), false),
    ]);
    ctx.bag.add(col);
    ctx.bag.add(z);
    const img = col.image as { width: number; height: number };
    const ar = img.width / img.height;
    wide = tall * ar;
    const sx = mobile ? 72 : 128;
    const geo = ctx.bag.add(new PlaneGeometry(wide, tall, Math.round(sx * Math.min(1, ar)), Math.round(sx / Math.max(1, ar))));
    geo.translate(0, tall / 2, 0);
    const m = new MeshStandardNodeMaterial({ transparent: true, side: DoubleSide });
    const v = uv();
    const relief = M.bust ? 0.14 : 0.26;
    const zz = texture(z, v).r;
    // souffle : léger gonflement + balancement des bords (ailes, cape), d'autant plus marqué loin du centre
    const sway = sin(time.mul(1.7).add(v.y.mul(3.2))).mul(abs(v.x.sub(0.5)).mul(2)).mul(tall * 0.012);
    const breath = sin(time.mul(1.6)).mul(0.5).add(0.5);
    const { vis, rv, band, scan, flicker, burst } = phaseMasks(v.y);
    // glitch : tranches horizontales décalées
    const slice = floor(v.y.mul(40));
    const jit = hash(slice.add(floor(time.mul(24)).mul(17))).sub(0.5).mul(burst).mul(step(0.6, hash(slice.add(3)))).mul(tall * 0.05);
    m.positionNode = positionLocal.add(vec3(jit.add(sway.mul(0.4)), breath.mul(tall * 0.006).mul(v.y), zz.mul(tall * relief).add(zz.mul(breath).mul(tall * 0.01)).add(sway)));
    const s = texture(col, v);
    // détourage : bords fondus (et, pour un buste, bas et côtés de l'image qui s'effacent dans la projection)
    let a: N = s.a;
    if (M.bust) a = a.mul(smoothstep(0.0, 0.22, v.y)).mul(smoothstep(0.0, 0.1, v.x)).mul(smoothstep(1.0, 0.9, v.x));
    else a = a.mul(smoothstep(0.0, 0.04, v.y));
    const d = 1.5 / 512;
    const ea = abs(texture(col, v.add(vec2(d, 0))).a.sub(texture(col, v.sub(vec2(d, 0))).a))
      .add(abs(texture(col, v.add(vec2(0, d))).a.sub(texture(col, v.sub(vec2(0, d))).a)));
    const lum = luminance(s.rgb);
    const holoCol = mix(color(HOLO_DEEP), color(HOLO), lum).mul(lum.mul(1.3).add(0.25)).mul(scan.mul(0.55).add(0.6)).add(color('#d8f6ff').mul(ea.mul(1.6)));
    const holoA = a.mul(scan.mul(0.35).add(0.45)).mul(flicker).add(ea.mul(0.5));
    m.colorNode = s.rgb.mul(rv);
    m.roughnessNode = float(0.62);
    m.metalnessNode = float(0.12);
    m.emissiveNode = holoCol.mul(rv.oneMinus()).mul(vis).mul(U.glow)
      .add((U.accent as unknown as N).mul(band.mul(a.add(0.15)).mul(4)))
      .add(s.rgb.mul(rv).mul(0.16));
    m.opacityNode = clamp(mix(holoA.mul(U.glow), a, rv), 0, 1).mul(vis);
    m.alphaTest = 0.004;
    ctx.bag.add(m);
    const mesh = new Mesh(geo, m);
    mesh.frustumCulled = false;
    monsterRig.add(mesh);
  }

  /** Modèle 3D animé (facultatif, déposé par le joueur) : mis à la hauteur, posé derrière la carte, matériaux hologramme. */
  async function buildGlb(url: string): Promise<boolean> {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(url);
      const model = new Group();
      model.add(gltf.scene as unknown as Object3D);
      let tris = 0;
      model.traverse((o) => {
        const g = (o as Mesh).isMesh ? (o as Mesh).geometry : null;
        if (g) tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      });
      console.info(`[duel] modèle 3D ${M.file}.glb : ${Math.round(tris)} triangles, ${gltf.animations.length} animation(s)`);
      // squelette de dragon ailé sans animation (modèle extrait d'un jeu) : animé à la main, tourné vers la caméra,
      // et mesuré dans sa pose finale (cou dressé, ailes levées)
      const r = createRig(model);
      if (isWingedRig(r) && !gltf.animations.length) {
        rig = r;
        const head = r.rest('HEAD'), waist = r.rest('WAIST') ?? r.rest('SPINE1');
        if (head && waist && head.z < waist.z) (gltf.scene as unknown as Object3D).rotation.y = Math.PI;
        r.apply(dragonPose({ t: 0, rear: 1, wing: 0.6, flap: 0, mouth: 0, life: 0 }));
      } else if (!gltf.animations.length) {
        auto = createAutoPose(model, M.pose);
        auto?.apply({ t: 0, rise: 1, mouth: 0, life: 0 });
        if (auto) console.info(`[duel] ${M.file} : animation automatique (${auto.kind})`);
      }
      model.updateMatrixWorld(true);
      const box = new Box3().setFromObject(model, true);
      const h = Math.max(1e-3, box.max.y - box.min.y);
      const w = Math.max(1e-3, box.max.x - box.min.x);
      // à l'échelle sur la silhouette : la hauteur prévue, sans dépasser 1,8 × cette hauteur en envergure
      const k = Math.min(tall / h, (tall * 1.8) / w);
      model.scale.setScalar(k);
      // centré sur ses appuis (pieds) plutôt que sur la boîte : un bâton, une aile ou une queue ne décalent pas le modèle
      // hors de la carte ; serpent : centre de la boîte
      const foot = auto && auto.kind !== 'serpent' ? auto.anchor() : null;
      const cx = foot ? foot.x : (box.min.x + box.max.x) / 2;
      const cz = foot ? foot.z : (box.min.z + box.max.z) / 2;
      model.position.set(-cx * k, -box.min.y * k, -cz * k);
      H = h * k;
      wide = w * k;
      const y = positionWorld.y.div(H);
      // matériaux du modèle → hologramme puis matière (couleur, texture, émissif, métal/rugosité d'origine gardés) ;
      // un matériau partagé par plusieurs pièces n'est converti qu'une fois
      type GlbMat = Material & {
        map?: Texture | null; color?: Color; emissive?: Color; emissiveIntensity?: number; emissiveMap?: Texture | null; metalness?: number; roughness?: number;
        vertexColors?: boolean; normalMap?: Texture | null; normalScale?: Vector2; roughnessMap?: Texture | null; metalnessMap?: Texture | null; aoMap?: Texture | null; aoMapIntensity?: number;
      };
      const done = new Map<Material, MeshStandardNodeMaterial>();
      const convert = (om: GlbMat) => {
        const hit = done.get(om);
        if (hit) return hit;
        const m = new MeshStandardNodeMaterial({ transparent: true, side: DoubleSide });
        // relief et matière d'origine : carte de normales, rugosité / métal / occlusion (ORM)
        if (om.normalMap) {
          m.normalMap = om.normalMap;
          if (om.normalScale) m.normalScale.copy(om.normalScale);
        }
        if (om.aoMap) {
          m.aoMap = om.aoMap;
          m.aoMapIntensity = om.aoMapIntensity ?? 1;
        }
        // découpe (alphaMode MASK : membranes des ailes…) : appliquée à la main, l'hologramme étant translucide
        const cut: N = om.alphaTest > 0 && om.map ? step(om.alphaTest, texture(om.map, uv()).a) : float(1);
        let base: N = om.map ? texture(om.map, uv()).rgb.mul(color(om.color ?? new Color(1, 1, 1))) : color(om.color ?? new Color(0.8, 0.8, 0.8));
        if (om.vertexColors) base = base.mul(vertexColor());
        const emis0: N = om.emissive && (om.emissive.r + om.emissive.g + om.emissive.b > 0)
          ? (om.emissiveMap ? texture(om.emissiveMap, uv()).rgb : vec3(1)).mul(color(om.emissive)).mul(om.emissiveIntensity ?? 1)
          : vec3(0);
        const { vis, rv, band, scan, flicker } = phaseMasks(y);
        const fres = clamp(float(1).sub(abs(normalView.normalize().dot(positionViewDirection.normalize()))), 0, 1).pow(2);
        const lum = luminance(base);
        const holoCol = mix(color(HOLO_DEEP), color(HOLO), lum).mul(lum.add(0.3)).mul(scan.mul(0.5).add(0.6)).add(color('#d8f6ff').mul(fres.mul(1.4)));
        m.colorNode = base.mul(rv);
        if (om.roughnessMap) {
          m.roughnessMap = om.roughnessMap;
          m.roughness = om.roughness ?? 1;
        } else m.roughnessNode = float(om.roughness ?? 0.6);
        if (om.metalnessMap) {
          m.metalnessMap = om.metalnessMap;
          m.metalness = om.metalness ?? 1;
        } else m.metalnessNode = float(om.metalness ?? 0.1);
        m.emissiveNode = holoCol.mul(rv.oneMinus()).mul(vis).mul(U.glow)
          .add((U.accent as unknown as N).mul(band.mul(3)))
          .add(base.mul(rv).mul(0.12))
          .add(emis0.mul(rv).mul(1.6))
          // une fois matérialisé, un liseré de lumière (couleur de la carte) garde l'aura de l'invocation
          .add((U.accent as unknown as N).mul(fres.mul(rv).mul(0.22)));
        m.opacityNode = clamp(mix(scan.mul(0.3).add(0.4).add(fres.mul(0.4)).mul(flicker).mul(U.glow), float(1), rv), 0, 1).mul(vis).mul(cut);
        m.alphaTest = 0.01;
        ctx.bag.add(m);
        done.set(om, m);
        return m;
      };
      model.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        // pièces à masquer (Blue-Eyes : les globes oculaires, qui ressortaient de la gueule une fois le cou dressé)
        const mn = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name ?? '';
        if (M.hide?.test(mn) || M.hide?.test(mesh.name)) mesh.visible = false;
        const old = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as GlbMat[];
        const mats = old.map(convert);
        mesh.material = mats.length === 1 ? mats[0] : mats;
      });
      // textures du modèle : libérées avec la scène
      const texs = new Set<Texture>();
      for (const om of done.keys()) for (const v of Object.values(om)) if (v && (v as Texture).isTexture) texs.add(v as Texture);
      texs.forEach((t2) => ctx.bag.add(t2));
      ctx.bag.scene(model);
      monsterRig.add(model);
      if (gltf.animations.length) {
        const mx = (mixer = new AnimationMixer(model));
        const find = (re: RegExp) => gltf.animations.find((c) => re.test(c.name));
        const idle = find(/idle/i) ?? gltf.animations[0];
        const summon = find(/summon|spawn|appear/i);
        const loopIdle = () => mx.clipAction(idle).setLoop(LoopRepeat, Infinity).reset().fadeIn(0.35).play();
        if (summon && summon !== idle) {
          glbClips.summon = () => {
            const a = mx.clipAction(summon).setLoop(LoopOnce, 1);
            a.clampWhenFinished = true;
            a.reset().play();
            window.setTimeout(() => {
              a.fadeOut(0.35);
              loopIdle();
            }, Math.max(200, summon.duration * 1000 - 350));
          };
        } else glbClips.summon = loopIdle;
      }
      return true;
    } catch (e) {
      console.warn('[duel] modèle 3D illisible, hologramme 2.5D à la place', e);
      return false;
    }
  }

  // ───────────────────────────────────────────── texte
  function showTitle() {
    const name = M.fr ?? opts.card.name; // nom français de la carte (retour de Tom)
    let i = 0;
    const letters = name.toUpperCase().split(' ').map((w) => `<b>${[...w].map((ch) => `<span style="transition-delay:${(0.25 + i++ * 0.035).toFixed(3)}s">${ch.replace(/[&<>"]/g, '')}</span>`).join('')}</b>`).join(' ');
    textEl.innerHTML = `<div class="dz-kicker">invocation · 6★ mythique</div><div class="dz-name">${letters}</div><div class="dz-sub">${(opts.card.uniName ?? 'Yu-Gi-Oh').replace(/[&<>"]/g, '')}</div>`;
    void textEl.offsetWidth;
    textEl.classList.add('on');
  }

  // ───────────────────────────────────────────── séquence
  function play() {
    if (started) return;
    started = true;
    const sfx = ctx.sfx;
    const k = calm ? 0.4 : 1; // intensité des à-coups (effets réduits)
    const t = (tl = gsap.timeline());
    // 1. métamorphose du dos
    t.call(() => {
      sfx.whoosh(0.7, 0.12, true);
      sfx.shimmer(5, 1.4, 0.07);
      haptics.pulse(15);
    }, [], 0.05);
    t.to(S, { trans: 1, duration: 0.9, ease: 'power2.inOut' }, 0.05);
    // 2. descente : la carte bascule et se pose, la caméra plonge (POV), « l'heure du duel »
    t.call(() => {
      if (duelBuf) music = sfx.playSample(duelBuf, 0.95);
      else sfx.duelSting(0.5);
      sfx.event(9);
    }, [], 0.85);
    t.to(S, { hover: 0, duration: 0.4, ease: 'power2.in' }, 0.9);
    t.to(S, { tilt: 1, drop: 1, duration: 1.45, ease: EASE.breathe }, 1.0);
    t.to(S, { cam: 1, duration: 1.8, ease: 'power2.inOut' }, 0.95);
    t.to(S, { field: 0.18, motes: 0.4, duration: 1.2 }, 1.2);
    const land = 2.45;
    t.call(() => {
      sfx.thump(0.55, 44);
      sfx.crack(0.18);
      shake.impulse(7 * k);
      haptics.pulse([25, 30, 45]);
    }, [], land);
    t.fromTo(S, { wave: 0 }, { wave: 1, duration: 1.9, ease: 'power2.out', immediateRender: false }, land);
    t.to(S, { field: 1, motes: 1, duration: 0.6 }, land);
    t.to(S, { flash: 0.1 * k, duration: 0.04 }, land).to(S, { flash: 0, duration: 0.5 }, land + 0.04);
    // 3. retournement sur le terrain, puis le faisceau
    const flipAt = land + 0.45;
    t.to(S, { flip: 0, duration: 0.6, ease: EASE.settle, onStart: () => sfx.whoosh(0.35, 0.16) }, flipAt);
    t.to(S, { lift: 0.36, duration: 0.3, ease: 'power2.out' }, flipAt).to(S, { lift: 0, duration: 0.3, ease: 'power2.in' }, flipAt + 0.3);
    t.call(() => {
      sfx.tick(0.8, 0.2);
      sfx.chime(5, 0.12);
    }, [], flipAt + 0.58);
    const beamAt = flipAt + 0.7;
    t.call(() => sfx.holoHum(3.2, 0.16), [], beamAt);
    t.to(S, { beam: 1, duration: 0.45, ease: 'power2.out' }, beamAt);
    // 4. l'hologramme s'élève, scintille, crie
    t.set(S, { glitch: calm ? 0 : 1 }, beamAt);
    t.to(S, { glow: 1, duration: 0.3 }, beamAt + 0.1);
    t.to(S, { rise: 1, duration: 1.6, ease: 'power2.out' }, beamAt + 0.15);
    t.call(() => glbClips.summon?.(), [], beamAt + 0.15);
    // dragon animé à la main : il se déplie en montant (cou qui se dresse, ailes qui s'ouvrent), puis respire
    t.to(S, { rear: 1, duration: 1.7, ease: 'power2.out' }, beamAt + 0.2);
    t.to(S, { wing: 0.95, duration: 1.5, ease: 'back.out(1.4)' }, beamAt + 0.25);
    t.to(S, { life: 1, duration: 2, ease: 'power1.inOut' }, beamAt + 0.4);
    t.to(S, { low: 1, duration: 2.1, ease: 'power2.inOut' }, beamAt - 0.15);
    t.to(S, { push: 1, duration: 4.5, ease: 'power1.inOut' }, beamAt);
    const cryAt = beamAt + 0.95;
    t.call(() => {
      if (cryBuf) {
        const h = sfx.playSample(cryBuf, 0.9, 0.3);
        if (cryBuf.duration > 5) window.setTimeout(() => h?.fade(0.8), 4200);
      }
      else sfx.creature(M.cry, 0.55);
      shake.impulse(11 * k);
      haptics.pulse([40, 40, 80]);
    }, [], cryAt);
    t.to(S, { ca: 0.6 * k, duration: 0.05 }, cryAt).to(S, { ca: 0, duration: 0.9, ease: EASE.glide }, cryAt + 0.05);
    t.to(S, { mouth: 1, duration: 0.16, ease: 'power2.out' }, cryAt).to(S, { mouth: 0.1, duration: 1.3, ease: 'power2.inOut' }, cryAt + 1.0);
    t.to(S, { wing: 0.6, duration: 2.2, ease: 'power1.inOut' }, cryAt + 0.6);
    // 5. matérialisation, du bas vers le haut
    const texAt = beamAt + 2.05;
    t.set(S, { glitch: 0 }, texAt - 0.2);
    t.call(() => sfx.scanSweep(1.9, 0.13), [], texAt);
    t.to(S, { tex: 1, duration: 1.9, ease: 'power1.inOut' }, texAt);
    t.to(S, { beam: 0.12, duration: 1.9, ease: 'power1.in' }, texAt);
    // 6. admiration
    const shownAt = texAt + 1.9;
    t.call(() => {
      revealed = true;
      sfx.chime(5, 0.16);
      sfx.choir(3.5, 0.08);
      haptics.pulse(30);
      showTitle();
      hintEl.classList.add('on');
    }, [], shownAt);
    t.to(S, { flash: 0.1 * k, duration: 0.05 }, shownAt).to(S, { flash: 0, duration: 0.6, ease: EASE.glide }, shownAt + 0.05);
    // (retour de Tom) l'invocation ne se termine JAMAIS toute seule : le joueur part quand il veut (toucher, Passer, Échap)
  }

  /** Premier toucher : saute directement à la créature matérialisée. Second : fin. */
  function onTap() {
    if (!started || ended) return;
    if (!revealed && tl) {
      // la matérialisation se termine tout de suite (la musique continue)
      tl.seek(tl.duration(), true);
      Object.assign(S, { rear: 1, wing: 0.6, mouth: 0.1, life: 1 });
      Object.assign(S, { tilt: 1, drop: 1, cam: 1, low: 1, flip: 0, lift: 0, hover: 0, field: 1, wave: 1, rise: 1, tex: 1, glow: 1, beam: 0.12, glitch: 0, motes: 1, trans: 1, push: 1 });
      revealed = true;
      glbClips.summon?.();
      glbClips.summon = undefined;
      ctx.sfx.chime(5, 0.14);
      showTitle();
      hintEl.classList.add('on');
      return;
    }
    end();
  }

  function end() {
    if (ended) return;
    ended = true;
    tl?.kill();
    hintEl.classList.remove('on');
    skipEl.hidden = true;
    music?.fade(1.4);
    ctx.sfx.whoosh(0.4, 0.12, true);
    gsap.to(S, {
      flash: calm ? 0.6 : 1,
      duration: 0.24,
      ease: 'power2.in',
      onComplete: () => {
        textEl.classList.remove('on');
        opts.onDone();
      },
    });
  }

  return {
    // (V2 fluidité, 11/11) un changement de définition 3D attend la fin de l'invocation (shell : moment calme), comme à
    // l'ouverture et dans la visionneuse — avant, il réallouait les cibles de rendu en pleine scène (à-coup + saut de netteté)
    pacing: () => (tl?.isActive() ? 'busy' : 'rest'),
    async setup(c) {
      ctx = c;
      calm = fxReduced();
      stage = createStage(c, { bg: ['#0b1222', '#020305'], env: 'studio', envIntensity: 0.35, fill: 0.62 });
      D0 = stage.camera.position.z;
      aspect = c.width / c.height;
      key = new DirectionalLight(0xdfeaff, 1.4);
      key.position.set(-1.2, 3, 3.5);
      stage.scene.add(key, tiltRig, monsterRig);
      monsterRig.position.set(LAND.x, 0, LAND.z - 0.12);

      // texte + indication + bouton « passer » (HTML au-dessus du canvas)
      const style = document.createElement('style');
      style.textContent = `
        .overlay > .dz-title { pointer-events: none; position: absolute; left: 0; right: 0; bottom: max(9%, 64px); text-align: center; padding: 0 16px; }
        @media (min-aspect-ratio: 1/1) { .overlay > .dz-title { left: 6vw; right: auto; max-width: 42vw; bottom: 14%; text-align: left; padding: 0; } }
        .dz-title .dz-kicker { font: 600 12px var(--mono, "Inter", sans-serif); letter-spacing: .14em; text-transform: uppercase; color: ${HOLO}; opacity: 0; transform: translateY(6px); transition: opacity .6s, transform .8s cubic-bezier(.16,1,.3,1); }
        .dz-title .dz-name { margin-top: 10px; font-family: "Fraunces Variable", Georgia, serif; font-weight: 600; font-size: clamp(22px, 5.4vw, 52px); line-height: 1.05; letter-spacing: .06em; color: #f4fbff; text-shadow: 0 0 28px ${M.accent}, 0 0 2px #fff; }
        .dz-title .dz-name b { font-weight: inherit; white-space: nowrap; }
        .dz-title .dz-name span { display: inline-block; opacity: 0; transform: translateY(14px) scale(.96); filter: blur(8px); transition: opacity .5s, transform .9s cubic-bezier(.16,1,.3,1), filter .7s; }
        .dz-title .dz-sub { margin-top: 10px; font: 500 12px var(--mono, "Inter", sans-serif); letter-spacing: .12em; text-transform: uppercase; color: #cfe6ff; opacity: 0; transition: opacity 1s 1s; }
        .dz-title.on .dz-kicker { opacity: .85; transform: none; }
        .dz-title.on .dz-name span { opacity: 1; transform: none; filter: none; }
        .dz-title.on .dz-sub { opacity: .6; }
        .overlay > .dz-hint { pointer-events: none; position: absolute; left: 0; right: 0; bottom: max(3.5%, 22px); text-align: center; font: 500 12px var(--mono, "Inter", sans-serif); letter-spacing: .12em; text-transform: uppercase; color: #cfe6ff; opacity: 0; transition: opacity .8s 1.2s; }
        .overlay > .dz-hint.on { opacity: .55; }
        .overlay > .dz-skip { position: absolute; top: max(12px, env(safe-area-inset-top)); right: 12px; min-width: 44px; min-height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid rgba(160,220,255,.25); background: rgba(6,12,24,.45); color: #cfe6ff; font: 600 12px var(--mono, "Inter", sans-serif); letter-spacing: .1em; text-transform: uppercase; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); cursor: pointer; }
        .overlay > .dz-skip:focus-visible { outline: 2px solid ${HOLO}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .dz-title .dz-name span { transition: opacity .4s; transform: none; filter: none; } }`;
      textEl = document.createElement('div');
      textEl.className = 'dz-title';
      textEl.setAttribute('aria-live', 'polite');
      hintEl = document.createElement('div');
      hintEl.className = 'dz-hint';
      hintEl.textContent = matchMedia('(pointer: coarse)').matches ? 'touche pour continuer' : 'clique pour continuer';
      skipEl = document.createElement('button');
      skipEl.className = 'dz-skip';
      skipEl.type = 'button';
      skipEl.textContent = 'Passer';
      skipEl.addEventListener('click', (e) => {
        e.stopPropagation();
        end();
      });
      c.overlay.append(style, textEl, hintEl, skipEl);

      // monstre : modèle 3D déposé à la main s'il existe, sinon hologramme 2.5D ; sons facultatifs en parallèle
      const glbUrl = siteUrl(`${FX_DIR}models/${M.file}.glb`);
      const [hasGlb] = await Promise.all([
        exists(glbUrl, /model\/gltf|octet-stream/),
        ctx.sfx.loadSample(siteUrl(`${FX_DIR}sfx/duel.mp3`)).then((b) => (duelBuf = b)),
        // un cri, pas une musique : au-delà de 12 s, le fichier n'est pas un cri → cri synthétisé (sinon il est joué,
        // et coupé en fondu après ~4,5 s s'il est long)
        ctx.sfx.loadSample(siteUrl(`${FX_DIR}sfx/${M.file}.mp3`)).then((b) => (cryBuf = b && b.duration <= 12 ? b : null)),
      ]);
      if (!(hasGlb && (await buildGlb(glbUrl)))) await buildHolo2D();
      await buildCard();
      buildField();
      buildFx();

      // post : bloom sur l'émissif, aberration chromatique (cri), flash, vignette
      post = createPipeline(c, stage.scene, stage.camera, { emissive: true });
      const bl = post.own(bloom(post.emissive!, 0.55, 0.45, 0.0)) as unknown as N;
      bloomRef = bl;
      const off = screenUV.sub(U.center);
      const ab = U.ca.mul(0.012).mul(off.length().add(0.2));
      const col0 = vec3(post.color.sample(screenUV.add(off.mul(ab))).r, post.color.sample(screenUV).g, post.color.sample(screenUV.sub(off.mul(ab))).b);
      let col: N = col0.add(bl.rgb);
      const asp = screenSize.x.div(screenSize.y);
      const vig = smoothstep(1.25, 0.35, screenUV.sub(0.5).mul(vec2(asp, 1)).length().mul(1.25));
      col = col.mul(mix(float(0.62), float(1), vig));
      col = mix(col, vec3(0.86, 0.95, 1), U.flash);
      post.output = vec4(col, 1);
      await stage.compile();
      await post.compile();
      /*
       * (téléphone, retour de Tom 4 nov. : « écran noir au début de l'animation ») la compilation ci-dessus ne prépare que
       * les variantes « canvas » ; les vrais pipelines (passe MRT émissif + MSAA, squelettes, sprites) se créaient à la 1re
       * image affichée — plusieurs secondes de noir sur un GPU mobile. Une image « à blanc », rendue hors écran pendant la
       * préparation (l'ouverture du booster, le voile de la visionneuse), les crée ici, invisible.
       */
      const warm = new RenderTarget(4, 4);
      const prevRT = c.renderer.getRenderTarget();
      try {
        stage.scene.updateMatrixWorld();
        c.renderer.setRenderTarget(warm);
        post.render();
      } catch (e) {
        console.warn('[duel] image de préchauffage', e);
      } finally {
        c.renderer.setRenderTarget(prevRT);
        warm.dispose();
      }
      c.bag.fn(c.input.onTap(onTap));
      // captures (scripts Playwright) : état de la séquence
      if (import.meta.env.DEV) (window as unknown as { __duel: unknown }).__duel = { S, time: () => (tl ? tl.time() : -1), ended: () => ended, seek: (x: number) => (tl?.seek(x), tl?.pause()), resume: () => tl?.resume() };
      c.bag.fn(() => {
        tl?.kill();
        mixer?.stopAllAction();
      });
    },
    /** Le jeu affiche la scène : la séquence démarre. */
    replay() {
      play();
    },
    update(dt, t) {
      shake.update(dt);
      mixer?.update(dt);
      S.ground = Math.min(1, S.cam * 1.6);
      if (rig) rig.apply(dragonPose({ t, rear: S.rear, wing: S.wing, flap: Math.sin(t * 1.8) * 0.08 * S.life * (calm ? 0.4 : 1), mouth: S.mouth, life: S.life }));
      else if (auto) auto.apply({ t, rise: Math.min(1, Math.max(0, (S.rear - 0.15) / 0.85)), mouth: S.mouth, life: S.life * (calm ? 0.4 : 1) });
      for (const k of Object.keys(U) as Array<keyof typeof U>) {
        if (k === 'accent' || k === 'center') continue;
        (U[k] as { value: number }).value = S[k as keyof typeof S] as number;
      }
      (bloomRef as unknown as { strength: { value: number } }).strength.value = 0.4 + S.beam * 0.2 + S.flash * 0.6 + S.glow * (1 - S.tex) * 0.22;
      key.intensity = 0.5 + S.tex * 1.3 + S.flash;
      // (un modèle 3D métallique vit de ses reflets : environnement plus présent une fois matérialisé)
      stage.scene.environmentIntensity = 0.25 + S.tex * (rig || auto ? 0.85 : 0.35);

      // carte : survol au départ → bascule → posée (arc) → retournement (soulevée à mi-course)
      const a = S.drop;
      const hov = Math.sin(t * 1.3) * 0.012 * S.hover;
      tiltRig.position.set(
        LAND.x * a,
        Y0 + (LAND.y - Y0) * a + Math.sin(Math.PI * a) * 0.12 + hov + S.lift,
        LAND.z * a,
      );
      tiltRig.rotation.set(-Math.PI / 2 * S.tilt, 0, Math.sin(t * 0.9) * 0.02 * S.hover);
      cardRig.rotation.set(0, S.flip, 0);

      // caméra, trois temps : de face (cadrage de la pile) → au-dessus du terrain (la carte se pose, se retourne) →
      // à hauteur de genou, angle ouvert, le monstre cadré (paysage : décalé à droite, le titre à gauche ; portrait :
      // plus loin et plus haut, le titre dessous)
      const portrait = aspect < 1;
      const fov1 = portrait ? 50 : 40;
      const fovEnd = portrait ? 62 : 50;
      const tanH = Math.tan((fovEnd * Math.PI) / 360);
      // (téléphone : un dragon aux ailes déployées est plus large que haut — on accepte de rogner le bout des ailes)
      const fw = portrait ? Math.min(wide, H * 1.25) : wide;
      // modèle 3D : vu d'en bas, sa tête dépasse vite du cadre (perspective) → un peu plus de recul et de marge en haut
      const m3 = auto?.kind === 'serpent' ? 1.35 : rig || auto?.kind === 'dragon' ? 1.16 : auto ? 1.22 : 1;
      const fitDist = m3 * Math.max((H * (portrait ? 0.7 : 0.6)) / tanH, (fw * (portrait ? 0.46 : 0.62)) / (tanH * aspect));
      const sm = (x: number) => x * x * (3 - 2 * x);
      const e1 = sm(S.cam);
      const e2 = sm(S.low);
      const off = (portrait ? 0 : Math.min(wide, H * 1.4) * 0.3) * e2 * (0.35 + 0.65 * S.tex);
      const orbit = Math.sin(t * 0.22) * 0.14 * e2 * (calm ? 0.4 : 1);
      const pose = ctx.input.pose(0.08);
      const R = fitDist * (1 - S.push * 0.08);
      const d1 = portrait ? 2.1 : 1.6;
      // temps 1 → 2
      camPos.set(0, Y0 + (0.78 - Y0) * e1 + Math.sin(Math.PI * S.cam) * 0.15, D0 + (LAND.z + d1 - D0) * e1);
      camLook.set(0, Y0 + (0.02 - Y0) * e1, LAND.z * e1 - 0.15 * e1);
      // temps 2 → 3
      // (retour de Tom) vue PAR-DESSUS : même inclinaison que l'ancienne contre-plongée, inversée — la caméra est aussi
      // haut au-dessus du point visé qu'elle était en dessous (le terrain se voit, le monstre domine toujours le cadre)
      const lookY = H * (portrait ? 0.42 : 0.5) * (rig || auto ? 1.1 : 1) * (0.8 + 0.2 * S.rise);
      const lowY = 0.3 + S.push * 0.04;
      camPos.lerp(proj.set(-off + Math.sin(orbit + pose.y) * R, 2 * lookY - lowY + pose.x * 0.2, LAND.z + Math.cos(orbit + pose.y) * R), e2);
      camLook.lerp(proj.set(-off, lookY, LAND.z - 0.12), e2);
      const fov = 30 + (fov1 - 30) * e1;
      const sx = shake.value * 0.0035;
      stage.camera.position.set(camPos.x + sx, camPos.y + shake.value * 0.002, camPos.z);
      stage.camera.lookAt(camLook);
      stage.camera.fov = fov + (fovEnd - fov) * e2;
      stage.camera.updateProjectionMatrix();

      stage.scene.updateMatrixWorld();
      proj.set(0, H * 0.55 * S.rise, 0).applyMatrix4(monsterRig.matrixWorld).project(stage.camera);
      U.center.value.set(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
      post.render();
    },
    resize(w, h) {
      stage.fit(w, h);
      D0 = stage.camera.position.z;
      aspect = w / h;
    },
    suspend() {
      post?.releaseTargets();
    },
    dispose() {
      tl?.kill();
      music?.fade(0.3);
    },
  };
}
