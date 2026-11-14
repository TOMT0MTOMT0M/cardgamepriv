import { tData, t as tr } from '../../core/i18n';
import {
  AdditiveBlending,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  NormalBlending,
  Sprite,
  SpriteNodeMaterial,
  Vector2,
  Vector3,
  type Material,
} from 'three/webgpu';
import {
  abs,
  cos,
  color,
  exp,
  float,
  floor,
  hash,
  instanceIndex,
  length,
  luminance,
  max,
  mix,
  mx_fractal_noise_float,
  normalLocal,
  positionLocal,
  screenSize,
  screenUV,
  select,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  min,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { createPackGeometry, createPackMaterials, generatePackArt, PACK, PACK_STYLES } from '../../core/pack';
import { cardArtFor } from '../../core/art';
import { BEBOU_CARDS, cardForRarity, type CardData } from '../../core/cardData';
import { rarity, type Rarity, type RarityId } from '../../core/rarity';
import { createPipeline, anamorphicFlare } from '../../core/post';
import { createHoloMaterial } from '../../core/holo';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import { createCardMesh, CARD } from '../../core/cardModel';
import { EASE, Spring, springCurve } from '../../core/ease';
import { fbmTexel, rot2, voronoi, type N } from '../../core/tsl';
import { mobileArtScale } from '../../core/renderer';
import { haptics } from '../../core/haptics';
import { bebouOddsLabel } from '../../core/sets/themes';

/**
 * 039 — Carte secrète : « Un de nous ».
 *
 * La carte la plus rare du site (1 chance sur le nombre total de cartes), c'est un membre du groupe. Sa révélation est construite sur la
 * **fausse ouverture** : tout commence exactement comme une commune (même paquet, même combustion banale,
 * même retournement)… jusqu'à ce que le retournement se bloque, la carte sur la tranche. Coupure : le son
 * s'effondre, la lumière s'éteint, le monde perd ses couleurs — seule la tranche luit, or rose.
 * Silence. La carte se remet de dos ; un cœur bat, de plus en plus vite, et à chaque battement des fissures
 * de lumière gagnent le dos pendant qu'un halo de poussière se rassemble derrière. Souffle retenu… puis la
 * carte vrille (2 tours et demi), onde de choc, inversion, flash, confettis, chœur — et c'est un visage.
 * Le nom s'écrit, le foil s'éveille, le halo continue de tourner : la carte est à toi.
 */
const ROSE = '#e8927c';
const ROSE_LIGHT = '#ffd9c9';
const CREAM = '#fff4ec';
const GOLD = '#f2c46d';

type Mode = 'secret' | 'shell';
type Heart = 'doigt' | 'auto';

/** Écarts entre battements de la version automatique (ils accélèrent : le cœur s'emballe). */
const GAPS = [1.05, 0.9, 0.76, 0.62, 0.5, 0.4];
const BEATS = GAPS.length;
/** Au doigt : sans tap pendant ce délai, le cœur bat tout seul (la séquence ne reste jamais bloquée). */
const IDLE_BEAT = 1.7;
/** Au doigt : une fois le dos entièrement fendu, payoff automatique après ce délai sans tap. */
const IDLE_PAYOFF = 2.2;

/** Vibration : Android (navigator.vibrate) et iPhone (Taptic Engine, cf. core/haptics). */
function buzz(pattern: number | number[]) {
  haptics.pulse(pattern);
}

/** Options du jeu (page /jeu/) : la séquence secrète jouée pour la 5e carte d'un vrai bébou pack. */
export interface SecretOptions {
  /** le Bébou tiré (sinon : au hasard / paramètre du panneau) */
  card?: CardData;
  /** la carte est déjà face cachée au centre (pile du booster) : pas de paquet, on part du retournement */
  fromStack?: boolean;
  /** appelé quand la carte est révélée (le jeu affiche alors le récapitulatif) */
  onRevealed?: () => void;
  /** false : n'enchaîne pas tout seul après le setup (le jeu appelle `replay()` au bon moment) */
  autoStart?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export default function create(opts: SecretOptions = {}): Experiment {
  let ctx: LabContext;
  let shellRar: Rarity;
  let stage: ReturnType<typeof createStage>;
  let post: ReturnType<typeof createPipeline>;
  let key: DirectionalLight;
  const rig = new Group();
  const packRig = new Group();
  const cardRig = new Group();
  let card: Mesh | null = null;
  let tl: gsap.core.Timeline | null = null;
  let holoU: ReturnType<typeof createHoloMaterial>['uniforms'] | null = null;
  let bloomRef: N;
  let textRoot: HTMLDivElement;
  let camBase = 3;
  /** (11/11) la carte courante est horizontale (KCDQ Teto) : elle se couche après la vrille */
  let land = false;
  let current: CardData;
  let currentRarity: RarityId = 'secret';
  let ownedArt: Array<{ dispose(): void }> = [];
  let ownedMats: Material[] = [];
  let swapping: Promise<void> | null = null;
  let warm = 0;
  let haloRef: Sprite | null = null;
  const shake = new Spring(0, 240, 8);
  const shake2 = new Spring(0, 280, 9);

  const S0 = {
    burn: -0.25, flip: Math.PI, dark: 0, mono: 0, glitch: 0, rim: 0, trem: 0, crack: 0, pulse: 0, crackOn: 1,
    gather: 0, ring: 1, push: 0, bt: 0, flash: 0, flare: 0, ca: 0, shock: 0, invert: 0, holo: 0, lift: 0,
    /** (11/11) carte horizontale : quart de tour pour la coucher (0 → 1) et recul de la caméra (× distance) */
    lay: 0, back: 0,
  };
  const S = { ...S0 };
  const U = {
    burn: uniform(-0.25), dark: uniform(0), mono: uniform(0), glitch: uniform(0), rim: uniform(0), crack: uniform(0), pulse: uniform(0), crackOn: uniform(1),
    gather: uniform(0), ring: uniform(1), bt: uniform(0), flash: uniform(0), flare: uniform(0), ca: uniform(0), shock: uniform(0), invert: uniform(0),
    center: uniform(new Vector2(0.5, 0.5)), tint: uniform(new Color(ROSE)), tierTint: uniform(new Color('#ffffff')),
  };
  const proj = new Vector3();
  // `?speed=0.25` : ralentit toute la séquence (captures image par image, cf. scripts/verify.cjs)
  const qSpeed = Number(new URLSearchParams(location.search).get('speed'));
  const qBebou = Number(new URLSearchParams(location.search).get('bebou')); // `?bebou=3` : Bébou imposé
  // `?coeur=auto` : battements automatiques (comparaison, captures sans interaction)
  const qHeart: Heart = new URLSearchParams(location.search).get('coeur') === 'auto' ? 'auto' : 'doigt';
  const params = { scénario: 'secret' as Mode, bébou: BEBOU_CARDS[qBebou - 1]?.name ?? 'au hasard', vitesse: qSpeed > 0 ? qSpeed : 1, cœur: qHeart }; // i18n-ok (labo)

  // ── phase « cœur au doigt » : c'est le joueur qui fait battre le cœur, et qui décide du payoff
  const heart = { on: false, beats: 0, last: 0 };
  /** Animations hors de la timeline principale (battements au tap, relances automatiques) : tuées au reset. */
  let extras: gsap.core.Animation[] = [];
  let idle: gsap.core.Tween | null = null;
  let hintEl: HTMLDivElement;
  /** Faux pendant une séquence secrète tant que la carte n'est pas révélée : un tap ne la relance pas par erreur. */
  let revealed = true;

  // ─────────────────────────────────────────── texte (HTML au-dessus du canvas)
  function clearText() {
    textRoot.innerHTML = '';
    textRoot.classList.remove('on');
  }
  function showText(rr: Rarity) {
    const secret = !!rr.secret;
    const title = secret ? tData('bb.secretCard', 'CARTE SECRÈTE') : rr.label.toUpperCase(); // i18n-ok
    const letters = [...title].map((ch, i) => `<span style="transition-delay:${(i * 0.055).toFixed(3)}s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    textRoot.innerHTML = `
      <div class="b-title" style="color:${secret ? ROSE_LIGHT : rr.accentHex}">${letters}</div>
      <div class="b-name">${esc(current.name)}</div>
      ${secret ? `<div class="b-odds">1 chance ${bebouOddsLabel().replace(/^1 /, '')} · un de nous</div>` : ''}`;
    void textRoot.offsetWidth; // force le reflow → les transitions partent
    textRoot.classList.add('on');
  }

  // ─────────────────────────────────────────── carte (art + matériaux), échangeable sans recompiler la scène
  async function buildCard(cd: CardData, rid: RarityId) {
    const list: Array<{ dispose(): void }> = [];
    const mobile = ctx.quality === 'mobile';
    // téléphone : calques à la taille réelle de la carte à l'écran (comme l'ouverture) au lieu de 768×1072, sans aplat,
    // toiles vidées dès l'envoi au GPU (≈ −20 Mo GPU et −25 Mo de canvas au pic mémoire du jeu)
    const { art, back } = await cardArtFor(
      cd,
      rid,
      { add: <T extends { dispose(): void }>(o: T) => (list.push(o), o) },
      mobile ? { scale: mobileArtScale(ctx.width, ctx.height, 0.7), noFlat: true, release: true } : undefined,
    );
    const rr = rarity(rid);
    // photo d'un ami : le foil reste sur le cadre, le sceau et le surnom ; à peine un voile sur la photo
    const holo = createHoloMaterial(art, rr.tier, { ...(cd.photo ? { windowFoil: 0.1, subjectFoil: 0.15 } : {}), lite: mobile });
    const backMat = createBackMaterial(back);
    // fissures de lumière : arêtes de Voronoï (deux échelles) révélées depuis le centre, intensité = battement
    const p = uv().sub(0.5).mul(vec2(CARD.w, CARD.h));
    const v1 = voronoi(p.mul(26), float(0.95)) as N;
    const v2 = voronoi(p.mul(70).add(3.1), float(0.9)) as N;
    const l1 = smoothstep(0.075, 0.0, v1.y.sub(v1.x));
    const l2 = smoothstep(0.05, 0.0, v2.y.sub(v2.x)).mul(0.55);
    const dist = length(p.mul(vec2(1.15, 0.9))).add((mobile ? fbmTexel(p.mul(9), 3) : mx_fractal_noise_float(vec3(p.mul(9), 2.3), 3)).mul(0.07));
    const R = U.crack.mul(0.62);
    const front = smoothstep(R, R.sub(0.05), dist);
    const fine = smoothstep(R.sub(0.06), R.sub(0.14), dist);
    const lines = max(l1.mul(front), l2.mul(fine));
    const tint = U.tint as unknown as N;
    const heat = U.pulse.mul(2.6).add(0.35).mul(U.crackOn);
    backMat.colorNode = mix(backMat.colorNode as N, color('#1a0a0a'), lines.mul(0.75).mul(step(0.001, U.crack)));
    backMat.emissiveNode = tint
      .mul(lines.mul(heat))
      .add(color(CREAM).mul(lines.pow(3).mul(heat).mul(0.6)))
      .add(tint.mul(front.mul(U.pulse).mul(0.08).mul(U.crackOn)));
    const edgeMat = createEdgeMaterial();
    edgeMat.emissiveNode = tint.mul(U.rim.mul(sin(time.mul(5)).mul(0.25).add(1.6)));
    return { mats: [holo.material, backMat, edgeMat] as Material[], holoU: holo.uniforms, list, land: !!art.landscape };
  }

  async function setCard(cd: CardData, rid: RarityId) {
    const b = await buildCard(cd, rid);
    const oldArt = ownedArt, oldMats = ownedMats;
    ownedArt = b.list;
    ownedMats = b.mats;
    holoU = b.holoU;
    current = cd;
    currentRarity = rid;
    land = b.land;
    if (!card) {
      card = createCardMesh(b.mats[0], b.mats[1], b.mats[2]);
      cardRig.add(card);
    } else card.material = b.mats;
    oldMats.forEach((m) => m.dispose());
    oldArt.forEach((a) => a.dispose());
  }

  function pickCard(): { cd: CardData; rid: RarityId } {
    if (opts.card) return { cd: opts.card, rid: 'secret' };
    if (params.scénario === 'shell' && !shellRar.secret) return { cd: cardForRarity(shellRar.id), rid: shellRar.id };
    if (params.bébou !== 'au hasard') return { cd: BEBOU_CARDS.find((c) => c.name === params.bébou) ?? BEBOU_CARDS[0], rid: 'secret' }; // i18n-ok (labo)
    // au hasard, mais jamais deux fois de suite le même
    const pool = BEBOU_CARDS.filter((c) => c !== current);
    return { cd: pool[Math.floor(Math.random() * pool.length)], rid: 'secret' };
  }

  // ─────────────────────────────────────────── séquences
  function reset() {
    tl?.kill();
    extras.forEach((a) => a.kill());
    extras = [];
    idle?.kill();
    idle = null;
    heart.on = false;
    heart.beats = 0;
    hint(false);
    revealed = true;
    Object.assign(S, S0);
    packRig.visible = true;
    clearText();
  }

  function hint(on: boolean) {
    hintEl?.classList.toggle('on', on);
  }

  const now = () => performance.now() / 1000;

  /**
   * Un battement (n° i, 0..BEATS-1) posé dans `target` à l'instant `at` : son, vibration, secousse, fissures qui
   * gagnent le dos, caméra qui avance, halo qui se rassemble. `boost` (0..1) = le joueur tape vite → plus fort.
   */
  function addBeat(target: gsap.core.Timeline, at: number, i: number, boost = 0) {
    const sfx = ctx.sfx;
    const k = (i + 1) / BEATS;
    const gap = GAPS[i];
    target.call(() => {
      sfx.heartbeat(Math.min(0.85, 0.35 + k * 0.35 + boost * 0.12));
      shake.impulse(3 + k * 9 + boost * 4);
      shake2.impulse(-(2 + k * 6 + boost * 3));
      // « poum-poum » : deux impulsions calées sur les deux coups du son (0 et 0,17 s)
      buzz([Math.round(22 + k * 30), 140, Math.round(12 + k * 18)]);
    }, [], at);
    target
      .to(S, { pulse: 0.55 + k * 0.6 + boost * 0.15, crack: 0.12 + k * 0.78, duration: 0.06, ease: 'none' }, at)
      .to(S, { pulse: 0.06 + k * 0.12, duration: Math.min(0.45, gap * 0.8), ease: EASE.glide }, at + 0.06)
      .to(S, { push: k * 0.75, gather: 0.3 + k * 0.7, trem: 0.25 + k * 0.45, duration: gap * 0.9, ease: EASE.glide }, at);
  }

  /** Souffle retenu (le dos entier se fend) à partir de `t`, puis payoff. */
  function addPayoff(target: gsap.core.Timeline, t: number) {
    const sfx = ctx.sfx;
    target.call(() => {
      sfx.riser(1.0, 5, 0.22);
      buzz([18, 60, 18, 50, 18, 40, 18, 30, 18, 20, 18]); // le tremblement monte
    }, [], t);
    target.to(S, { crack: 1.05, pulse: 1.5, trem: 1, push: 1, duration: 0.95, ease: EASE.heave }, t);
    // payoff : vrille, onde de choc, inversion, flash, confettis, chœur
    const pay = t + 0.95;
    target.to(S, { flip: -4 * Math.PI, duration: 2.6, ease: 'expo.out' }, pay);
    target.call(() => {
      // secrète : pas d'impact brutal mais le motif « Bébou » (boîte à musique, do# lydien, jamais entendu ailleurs)
      sfx.event(6);
      sfx.thump(0.5, 50);
      sfx.crack(0.3);
      sfx.bebou(0.2);
      sfx.shimmer(5, 4.5, 0.08);
      sfx.choir(5.2, 0.1, 277.18);
      shake.impulse(40);
      shake2.impulse(-30);
      buzz([90, 50, 160, 70, 260]);
    }, [], pay);
    target
      .to(S, { flash: 1.2, flare: 1, ca: 1, crackOn: 0, pulse: 0, trem: 0, rim: 0, duration: 0.05, ease: 'none' }, pay)
      .fromTo(S, { shock: 0 }, { shock: 1, duration: 1.3, ease: 'power2.out', immediateRender: false }, pay)
      .to(S, { invert: 1, duration: 0.03 }, pay)
      .to(S, { invert: 0, duration: 0.22, ease: 'power2.out' }, pay + 0.08)
      .to(S, { ring: 1.45, duration: 0.35, ease: 'power3.out' }, pay)
      .to(S, { ring: 1, duration: 2.4, ease: EASE.settle }, pay + 0.35)
      .to(S, { bt: 7, duration: 7, ease: 'none' }, pay)
      .to(S, { flash: 0, flare: 0, ca: 0, mono: 0, duration: 1.6, ease: EASE.glide }, pay + 0.1)
      .to(S, { dark: 0.15, push: 0.15, duration: 2.6, ease: EASE.glide }, pay + 0.3)
      .to(S, { holo: 1, duration: 2.6, ease: EASE.glide }, pay + 0.6);
    if (land) {
      // (11/11) carte horizontale : la vrille finie, elle se couche d'un quart de tour, la caméra prend un peu de recul
      target
        .to(S, { lay: 1, duration: 0.95, ease: springCurve(0.62, 9), onStart: () => ctx.sfx.whoosh(0.3, 0.07) }, pay + 1.9)
        .to(S, { back: 0.16, duration: 0.5, ease: EASE.glide }, pay + 1.9)
        .to(S, { back: 0.1, duration: 1.0, ease: EASE.glide }, pay + 2.4);
    }
    target.call(() => showText(rarity('secret')), [], pay + 0.9);
    // le foil se rallume une seconde fois quand le nom finit de s'écrire
    target.call(() => sfx.shimmer(5, 2.2, 0.06), [], pay + 2.4);
    // à partir d'ici, un tap rejoue (avant, il serait avalé par la séquence)
    target.call(() => {
      revealed = true;
      opts.onRevealed?.();
    }, [], pay + 1.6);
  }

  // ── cœur au doigt
  function enterHeart() {
    heart.on = true;
    heart.beats = 0;
    heart.last = now();
    // l'indication n'apparaît que si le joueur ne comprend pas tout seul
    // (créée AVANT la relance auto : à très bas fps, les deux tombent dans la même image et l'ordre compte)
    extras.push(gsap.delayedCall(1.1 / params.vitesse, () => heart.on && heart.beats === 0 && hint(true)));
    armIdle(IDLE_BEAT);
  }

  function armIdle(delay: number) {
    idle?.kill();
    idle = gsap.delayedCall(delay / params.vitesse, () => beat(true));
  }

  /** Tap (ou relance automatique) pendant la phase du cœur. */
  function beat(auto: boolean) {
    if (!heart.on) return;
    hint(false);
    if (heart.beats >= BEATS) {
      // le dos est entièrement fendu : c'est ce tap qui libère la carte
      heart.on = false;
      idle?.kill();
      idle = null;
      tl = gsap.timeline();
      tl.timeScale(params.vitesse);
      addPayoff(tl, 0);
      return;
    }
    const t = now();
    const gap = t - heart.last;
    heart.last = t;
    // taper vite = cœur qui s'emballe : battement plus fort (0 au-delà de 0,6 s d'écart, 1 sous 0,25 s)
    const boost = auto ? 0 : Math.max(0, Math.min(1, (0.6 - gap) / 0.35));
    const bt = gsap.timeline();
    bt.timeScale(params.vitesse);
    addBeat(bt, 0, heart.beats, boost);
    extras.push(bt);
    heart.beats++;
    armIdle(heart.beats >= BEATS ? IDLE_PAYOFF : IDLE_BEAT);
  }

  function onTap() {
    if (heart.on) beat(false);
    else if (revealed && !opts.card) void play(true); // dans le jeu, c'est le récapitulatif qui prend la main
  }

  /** Ouverture ordinaire (toutes les raretés sauf secrète) : la même entrée en matière que la fausse ouverture. */
  function playNormal(rr: Rarity) {
    const sfx = ctx.sfx;
    const T = rr.tier;
    U.tierTint.value.set(T === 0 ? '#e8e2d6' : rr.accentHex);
    tl = gsap.timeline();
    tl.timeScale(params.vitesse);
    tl.to(S, { burn: 0.95, duration: 1.4, ease: 'power1.in', onStart: () => (sfx.rumble(1.2, 0.18), sfx.whoosh(1.0, 0.15, true)) }, 0.3);
    const pay = 2.1;
    tl.to(S, { flip: 0, duration: 0.55, ease: EASE.snap, onStart: () => sfx.whoosh(0.3, 0.25) }, pay - 0.2);
    tl.call(() => {
      sfx.thump(0.35 + T * 0.06);
      sfx.chime(T, 0.2);
      if (T >= 4) sfx.shimmer(T, 2.6, 0.1);
      shake.impulse(rr.shake * 30);
      showText(rr);
    }, [], pay);
    tl.to(S, { flash: 0.4 + T * 0.12, flare: T >= 3 ? 0.6 : 0, ca: T >= 2 ? 0.4 : 0, duration: 0.05 }, pay)
      .to(S, { flash: 0, flare: 0, ca: 0, duration: 1.2, ease: EASE.glide }, pay + 0.1)
      .to(S, { holo: 1, duration: 1.8, ease: EASE.glide }, pay + 0.2);
  }

  /** La séquence secrète complète (≈ 13 s). */
  function playSecret() {
    const sfx = ctx.sfx;
    U.tierTint.value.set('#e8e2d6'); // même braise banale qu'une commune : rien ne doit trahir la suite
    revealed = false;
    tl = gsap.timeline();
    tl.timeScale(params.vitesse);
    let t = 1.9;
    if (opts.fromStack) {
      // jeu : la carte attend déjà, face cachée, au centre (le paquet a été ouvert par la scène d'ouverture)
      S.burn = 0.95;
      t = 0.35;
    } else {
      // 1. ouverture banale
      tl.to(S, { burn: 0.95, duration: 1.4, ease: 'power1.in', onStart: () => (sfx.rumble(1.2, 0.18), sfx.whoosh(1.0, 0.15, true)) }, 0.3);
    }
    // 2. le retournement démarre normalement… et se bloque sur la tranche
    tl.to(S, { flip: Math.PI / 2 + 0.05, duration: 0.24, ease: 'power2.in', onStart: () => sfx.whoosh(0.3, 0.25) }, t);
    t += 0.24;
    tl.call(() => {
      sfx.tapeStop(0.35);
      sfx.crack(0.12);
      shake.impulse(9);
      buzz(40); // un seul coup sec : quelque chose cloche
    }, [], t);
    tl.fromTo(S, { glitch: 1 }, { glitch: 0, duration: 0.32, ease: 'power3.out', immediateRender: false }, t)
      .to(S, { dark: 1, mono: 1, duration: 0.07, ease: 'none' }, t)
      .to(S, { rim: 1, trem: 0.25, duration: 0.5, ease: EASE.glide }, t + 0.05);
    // 3. silence (la tranche respire), puis la carte se remet de dos
    t += 1.35;
    tl.to(S, { flip: Math.PI, duration: 1.3, ease: EASE.breathe }, t)
      .to(S, { rim: 0.35, gather: 0.3, duration: 1.3, ease: EASE.breathe }, t);
    t += 1.35;
    // 4. le cœur bat, de plus en plus vite : fissures, halo, caméra qui avance
    if (params.cœur === 'auto') {
      GAPS.forEach((gap, i) => {
        addBeat(tl!, t, i);
        t += gap;
      });
      // 5. souffle retenu, 6. payoff
      addPayoff(tl, t - 0.1);
    } else {
      // au doigt : chaque tap = un battement ; une fois le dos fendu, le tap suivant libère la carte
      tl.call(enterHeart, [], t);
    }
  }

  async function play(repick: boolean) {
    if (swapping) await swapping;
    reset();
    if (repick) {
      const { cd, rid } = pickCard();
      if (cd !== current || rid !== currentRarity) {
        swapping = setCard(cd, rid);
        await swapping;
        swapping = null;
      }
    }
    if (rarity(currentRarity).secret) playSecret();
    else playNormal(rarity(currentRarity));
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      shellRar = rarity(c.rarity);
      if (shellRar.secret) params.scénario = 'secret';
      stage = createStage(c, { bg: ['#1b1715', '#050404'], env: 'studio', envIntensity: 0.9, fill: 0.62, frameW: PACK.w, frameH: PACK.h });
      key = new DirectionalLight(0xfff2e6, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, rig);
      rig.add(packRig, cardRig);
      camBase = stage.camera.position.z;

      // ── texte
      textRoot = document.createElement('div');
      textRoot.className = 'bebou-text';
      textRoot.innerHTML = '';
      const style = document.createElement('style');
      style.textContent = `/* i18n-ok (CSS) */
        .overlay > .bebou-text { pointer-events: none; position: absolute; left: 0; right: 0; top: 3%; text-align: center; font-family: "Fraunces Variable", Georgia, serif; }
        .bebou-text .b-title { font: 500 13px "IBM Plex Mono", monospace; letter-spacing: .5em; margin-bottom: 10px; }
        .bebou-text .b-title span { display: inline-block; opacity: 0; transform: translateY(8px); filter: blur(6px); transition: opacity .5s, transform .7s cubic-bezier(.16,1,.3,1), filter .6s; }
        .bebou-text .b-name { font-style: italic; font-weight: 500; font-size: clamp(24px, 3.2vw, 40px); color: ${CREAM}; text-shadow: 0 0 24px ${ROSE}; opacity: 0; transform: scale(.94); transition: opacity 1s .75s, transform 1.4s .75s cubic-bezier(.16,1,.3,1); }
        .bebou-text .b-odds { font: 400 11px "IBM Plex Mono", monospace; letter-spacing: .3em; text-transform: uppercase; color: ${ROSE_LIGHT}; opacity: 0; margin-top: 10px; transition: opacity 1.2s 1.6s; }
        .bebou-text.on .b-title span { opacity: 1; transform: none; filter: none; }
        .bebou-text.on .b-name { opacity: 1; transform: none; }
        .bebou-text.on .b-odds { opacity: .7; }
        .overlay > .bebou-hint { pointer-events: none; position: absolute; left: 0; right: 0; top: 15%; text-align: center; font: 400 11px "IBM Plex Mono", monospace; letter-spacing: .35em; text-transform: uppercase; color: ${ROSE_LIGHT}; opacity: 0; transition: opacity .8s; }
        .overlay > .bebou-hint.on { opacity: .75; animation: bebou-hint 1.05s ease-in-out infinite; }
        @keyframes bebou-hint { 0%, 100% { transform: scale(1); } 12% { transform: scale(1.06); } 26% { transform: scale(1); } 38% { transform: scale(1.03); } }`;
      hintEl = document.createElement('div');
      hintEl.className = 'bebou-hint';
      hintEl.textContent = tr('bb.heartHint');
      c.overlay.append(style, textRoot, hintEl);

      // ── carte de départ
      const first = pickCard();
      await setCard(first.cd, first.rid);
      c.bag.fn(() => {
        ownedMats.forEach((m) => m.dispose());
        ownedArt.forEach((a) => a.dispose());
      });

      // ── paquet : exactement le même que pour une commune, combustion banale depuis le centre
      const pArt = c.bag.add(await generatePackArt(PACK_STYLES.bone));
      const mats = createPackMaterials(pArt);
      const pp = positionLocal.xy;
      // téléphone : bruit de brûlure lu dans le bruit cuit (4 lectures) au lieu de 4 octaves de Perlin 3D par pixel
      const field = length(pp.mul(vec2(1, 0.8))).add((c.quality === 'mobile' ? fbmTexel(pp.mul(4), 4) : mx_fractal_noise_float(vec3(pp.mul(4), 0.4), 4)).mul(0.2));
      const burnFront = field.sub(U.burn);
      for (const m of mats) {
        m.side = DoubleSide;
        m.maskNode = burnFront.greaterThan(0);
        const ember = exp(burnFront.max(0).mul(-160)).mul(4).add(exp(burnFront.max(0).mul(-30)).mul(0.3));
        m.colorNode = mix(m.colorNode as N, color('#0d0907'), smoothstep(0.06, 0.004, burnFront));
        m.emissiveNode = (U.tierTint as unknown as N).mul(ember);
        m.positionNode = positionLocal.add(normalLocal.mul(smoothstep(0.05, 0.0, burnFront).mul(0.03)));
        c.bag.add(m);
      }
      packRig.add(new Mesh(c.bag.add(createPackGeometry(48, 72)), mats));

      const mobile = c.quality === 'mobile';
      const i = instanceIndex;
      const h1 = hash(i), h2 = hash(i.add(11)), h3 = hash(i.add(23)), h4 = hash(i.add(37)), h5 = hash(i.add(53));
      const tint = U.tint as unknown as N;

      // ── halo : poussière qui monte de la table et se range en anneau derrière la carte, puis tourne
      const hm = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      const scatter = vec3(h1.sub(0.5).mul(3.2), h2.mul(-0.7).sub(0.75), h3.sub(0.5).mul(1.6));
      const ang = h1.mul(6.2832).add(time.mul(h4.mul(0.18).add(0.12)));
      const rr = h2.mul(0.1).add(0.95).mul(U.ring);
      const ring = vec3(cos(ang).mul(0.5).mul(rr), sin(ang).mul(0.64).mul(rr), h3.sub(0.5).mul(0.06).sub(0.16));
      const g = U.gather.pow(1.4);
      const mid = mix(scatter, ring, g);
      const swirl = vec3(rot2(mid.xy, g.oneMinus().mul(h4.mul(2).add(1.5))), mid.z);
      hm.positionNode = swirl.add(vec3(0, sin(time.mul(0.9).add(h5.mul(30))).mul(0.012), 0));
      const twinkle = sin(time.mul(h4.mul(4).add(2)).add(h5.mul(40))).mul(0.35).add(0.65);
      const disc = smoothstep(0.5, 0.05, length(uv().sub(0.5)));
      const hc = mix(tint, color(ROSE_LIGHT), h5);
      hm.colorNode = vec4(hc.mul(1.5), disc.mul(twinkle).mul(smoothstep(0.0, 0.25, U.gather)));
      hm.scaleNode = h2.mul(0.008).add(0.003);
      const halo = (haloRef = new Sprite(hm));
      halo.count = mobile ? 2200 : 6000;
      halo.frustumCulled = false;
      rig.add(halo);
      c.bag.add(hm);

      // ── confettis + étincelles au payoff : balistique analytique (traînée, gravité, battement), sans état
      const cm = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending });
      const tt = U.bt;
      const dir = vec3(h1.sub(0.5).mul(1.3), h2.sub(0.5).mul(1.1), h3.sub(0.5).mul(0.6).add(0.08)).normalize();
      const speed = h4.mul(1.9).add(0.5);
      const drag = 2.1;
      const travel = float(1).sub(exp(tt.mul(-drag))).div(drag);
      cm.positionNode = dir
        .mul(speed.mul(travel))
        .add(vec3(sin(tt.mul(2.3).add(h5.mul(6.28))).mul(0.05).mul(min(tt, 1)), tt.mul(tt).mul(-0.035), 0));
      const life = h5.mul(3.2).add(2.4);
      const vis = smoothstep(0.0, 0.03, tt).mul(smoothstep(life, life.mul(0.55), tt));
      const isSpark = h2.greaterThan(0.62);
      // confetti : rectangle qui tourne (rotationNode) et « bascule » (hauteur ∝ |cos|)
      const flipK = abs(cos(tt.mul(h3.mul(9).add(4)).add(h1.mul(6.28)))).mul(0.85).add(0.15);
      const q = uv().sub(0.5);
      const rect = smoothstep(0.5, 0.42, abs(q.x)).mul(smoothstep(0.5, 0.42, abs(q.y)));
      const spark = smoothstep(0.5, 0.0, length(q)).pow(2);
      let cc: N = mix(tint, color(CREAM), step(0.45, h3));
      cc = mix(cc, color(GOLD), step(0.8, h3));
      const shade = flipK.mul(0.6).add(0.4); // la face qui bascule s'assombrit
      cm.colorNode = vec4(select(isSpark, color(ROSE_LIGHT).mul(2.2), cc.mul(shade)), select(isSpark, spark, rect).mul(vis));
      cm.rotationNode = tt.mul(h4.mul(8).sub(4)).add(h1.mul(6.28));
      cm.scaleNode = select(isSpark, vec2(h1.mul(0.012).add(0.006)), vec2(h1.mul(0.012).add(0.014), h1.mul(0.012).add(0.014).mul(0.45).mul(flipK)));
      const confetti = new Sprite(cm);
      confetti.count = mobile ? 1000 : 2600; // retour testeurs : « moins de fleurs, abuse »
      confetti.frustumCulled = false;
      rig.add(confetti);
      c.bag.add(cm);

      // ── post : bloom, flare, glitch de la fausse ouverture, monde désaturé (sauf la lumière), onde de choc…
      post = createPipeline(c, stage.scene, stage.camera, { emissive: true });
      const bl = post.own(bloom(post.emissive!, 0.35, 0.5, 0.0)) as unknown as N;
      bloomRef = bl;
      // téléphone : pas de flare anamorphique (2e bloom complet + flou de 48 lectures, recalculés à chaque image même
      // éteints) — remplacé plus bas par une traînée analytique, comme l'ouverture
      const fl = mobile ? null : post.own(anamorphicFlare(post.emissive!, (n) => bloom(n, 1, 0, 0.12) as unknown as N));
      const aspect = screenSize.x.div(screenSize.y);
      // glitch : tranches horizontales décalées pendant le blocage
      const slice = floor(screenUV.y.mul(36));
      const jitter = hash(slice.add(floor(time.mul(30)).mul(37))).sub(0.5).mul(U.glitch).mul(0.06).mul(step(0.55, hash(slice.add(7))));
      const suv = screenUV.add(vec2(jitter, 0));
      const d0 = suv.sub(U.center).mul(vec2(aspect, 1));
      const r = length(d0);
      const Rs = U.shock.mul(0.95);
      const sring = exp(abs(r.sub(Rs)).div(0.028).negate()).mul(U.shock.oneMinus());
      const warped = U.center.add(d0.sub(d0.normalize().mul(sring.mul(0.03))).div(vec2(aspect, 1)));
      const emis = post.emissive!.sample(warped).rgb;
      let col: N;
      if (!mobile) {
        const sceneCol = post.color.sample(warped).rgb;
        const split = vec3(post.color.sample(warped.add(vec2(U.glitch.mul(0.012), 0))).r, sceneCol.g, post.color.sample(warped.sub(vec2(U.glitch.mul(0.012), 0))).b);
        col = mix(sceneCol, split, U.glitch);
      } else {
        /*
         * Téléphone : même image, sans la copie plein écran de l'aberration chromatique — elle est lue directement dans
         * l'image de la scène, canal par canal (même formule que ChromaticAberrationNode, comme l'ouverture), et le
         * décalage du glitch s'y ajoute (3 lectures en tout, comme avant le glitch seul).
         */
        const off = warped.sub(U.center);
        const ab = U.ca.mul(off.length()).mul(0.01);
        const k = U.ca.mul(1.08 * 0.02);
        const gl = vec2(U.glitch.mul(U.glitch).mul(0.012), 0);
        const rUV = U.center.add(off.mul(k.add(1).add(ab))).add(gl);
        const bUV = U.center.add(off.mul(float(1).sub(k).sub(ab))).sub(gl);
        col = vec3(post.color.sample(rUV).r, post.color.sample(warped).g, post.color.sample(bUV).b);
      }
      // désaturation du monde : seule la lumière émise garde sa couleur
      const base = max(col.sub(emis), 0);
      const grey = vec3(luminance(base)).mul(vec3(1.0, 0.9, 0.88)).mul(0.55);
      col = mix(base, grey, U.mono).add(emis);
      if (fl) {
        col = col.add(bl.rgb).add((fl as N).rgb.mul(tint).mul(U.flare)).add(tint.mul(sring.mul(0.3)));
        col = (chromaticAberration(vec4(col, 1), U.ca, U.center, float(1.08)) as unknown as N).rgb;
      } else {
        // traînée horizontale analytique qui passe par la carte (au lieu du flare anamorphique)
        const dy = abs(screenUV.y.sub(U.center.y));
        const dx = abs(screenUV.x.sub(U.center.x)).mul(aspect);
        const streak = exp(dy.div(0.0035).negate()).mul(0.9).add(exp(dy.div(0.03).negate()).mul(0.22)).mul(exp(dx.mul(-1.5)));
        col = col.add(bl.rgb).add(tint.mul(streak.mul(U.flare).mul(1.6))).add(tint.mul(sring.mul(0.3)));
      }
      col = mix(col, vec3(luminance(col)).oneMinus().mul(vec3(1, 0.85, 0.8)), U.invert);
      col = col.add(color(ROSE_LIGHT).mul(U.flash.mul(0.22)));
      const vig = smoothstep(1.2, 0.3, screenUV.sub(0.5).length().mul(1.6));
      col = col.mul(mix(float(0.78), float(1), vig)).mul(float(1).sub(U.dark.mul(0.6).mul(smoothstep(0.08, 0.55, r))));
      post.output = vec4(col, 1);

      // pipelines compilés pour la vraie cible (MRT émissif, MSAA) : pas d'à-coup sur la carte secrète
      await post.compile();
      c.bag.fn(() => {
        tl?.kill();
        extras.forEach((a) => a.kill());
        idle?.kill();
      });
      c.bag.fn(c.input.onTap(onTap));
      c.gui.add(params, 'scénario', { 'carte secrète (Bébou)': 'secret', 'rareté de la barre d’outils': 'shell' }).name('scénario').onChange(() => void play(true)); // i18n-ok (labo)
      c.gui.add(params, 'bébou', ['au hasard', ...BEBOU_CARDS.map((b) => b.name)]).name('bébou').onChange(() => void play(true)); // i18n-ok (labo)
      c.gui.add(params, 'cœur', { 'au doigt (tap = battement)': 'doigt', automatique: 'auto' }).name('cœur').onChange(() => void play(false)); // i18n-ok (labo)
      c.gui.add(params, 'vitesse', 0.25, 2, 0.01).name('vitesse de la séquence').onChange((v: number) => tl?.timeScale(v)); // i18n-ok (labo)
      if (opts.autoStart !== false) warm = 3;
    },
    replay() {
      void play(true);
    },
    update(dt, t) {
      if (warm > 0 && --warm === 0) void play(false);
      shake.update(dt);
      shake2.update(dt);
      for (const k of Object.keys(U) as Array<keyof typeof U>) {
        if (k === 'center' || k === 'tint' || k === 'tierTint') continue;
        (U[k] as { value: number }).value = S[k as keyof typeof S] as number;
      }
      // la pièce s'éteint vraiment (pas seulement en post) : lumière clé + environnement
      key.intensity = 1.2 * (1 - S.dark * 0.85) + S.flash * 2;
      stage.scene.environmentIntensity = 0.9 * (1 - S.dark * 0.8) + S.flash * 0.6;
      if (holoU) {
        holoU.strength.value = 0.1 + S.holo * 0.8;
        holoU.extraEmissive.value = S.flash * 0.6 + (1 - S.holo) * 0.04;
      }
      (bloomRef as unknown as { strength: { value: number } }).strength.value = 0.3 + S.flash * 1.4 + S.pulse * 0.5 + S.rim * 0.4;
      packRig.visible = S.burn < 0.94;
      // halo de poussière invisible (rassemblement à 0) : ses milliers de sprites additifs ne sont pas rasterisés
      if (haloRef) haloRef.visible = S.gather > 0.001;
      // tant que la carte n'est pas révélée, pas de rotation au glisser (elle montrerait le visage avant l'heure)
      ctx.input.spinEnabled = revealed;
      const pose = revealed ? ctx.input.pose(S.holo > 0.2 ? 0.35 : 0.1) : { x: -ctx.input.tiltY * 0.1, y: ctx.input.tiltX * 0.1 };
      rig.rotation.set(pose.x, pose.y, 0);
      const tr = S.trem;
      rig.position.set(shake.value * 0.004 + Math.sin(t * 61) * 0.0025 * tr, shake2.value * 0.004 + Math.sin(t * 47) * 0.0025 * tr, 0);
      cardRig.rotation.set(Math.sin(t * 53) * 0.01 * tr, S.flip, Math.sin(t * 43) * 0.012 * tr);
      // une fois révélée, la carte flotte doucement devant son halo
      cardRig.position.set(0, Math.sin(t * 1.1) * 0.008 * S.holo, (1 - Math.cos(Math.min(1, S.holo) * Math.PI)) * 0.04);
      stage.camera.position.z = camBase * (1 - S.push * 0.2) * (1 + S.back);
      if (card) card.rotation.z = S.lay * (Math.PI / 2);
      stage.scene.updateMatrixWorld();
      proj.set(0, 0, 0).applyMatrix4(rig.matrixWorld).project(stage.camera);
      U.center.value.set(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
      post.render();
    },
    resize(w, h) {
      stage.fit(w, h);
      camBase = stage.camera.position.z;
    },
    dispose() {},
  };
}
