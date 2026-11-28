import { lang, t as tr } from '../../core/i18n';
import { cardHasCutout } from '../../core/pokeHolo/face';
import { cameraScale, createWheel3D, type Wheel3D, type WheelItem3D } from './packWheel3d';
import { createReel, type Reel } from './packReel';
import {
  AdditiveBlending,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DataUtils,
  DirectionalLight,
  HalfFloatType,
  LinearFilter,
  RedFormat,
  RenderPipeline,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  NormalBlending,
  PlaneGeometry,
  Raycaster,
  Quaternion,
  Sprite,
  SpriteNodeMaterial,
  Vector2,
  Vector3,
  type Material,
  type Texture, CircleGeometry, UnsignedByteType } from 'three/webgpu';
/** rayon du dodécagone circonscrit / rayon du cercle inscrit */
const HALO_K = 1 / Math.cos(Math.PI / 12);
import {
  abs,
  atan,
  attribute,
  clamp as tclamp,
  floor,
  fract,
  frontFacing,
  color,
  cos,
  exp,
  float,
  hash,
  instanceIndex,
  length,
  min,
  mix,
  mx_fractal_noise_float,
  normalLocal,
  pmremTexture,
  positionGeometry,
  positionLocal,
  screenSize,
  screenUV,
  select,
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
  luminance,
  max,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { studioEnv } from '../../core/env';
import { mobileArtScale } from '../../core/renderer';
import { anamorphicFlare, createPipeline } from '../../core/post';
import { createPackGeometry, generatePackArt, packCreaseLift, PACK, PACK_FRAME, PACK_STACK, PLASTIC_TINT, TEAR_V, type PackArt, type PackStyle } from '../../core/pack';
import { gameSachetArt, inkSurface } from '../../core/packSticker';
import { ensureCardImages, ensureFonts, generateCardArt, type CardArt } from '../../core/art';
import { LAB_CARDS, cardById, type CardData } from '../../core/cardData';
import { rarity, type Rarity, type RarityId } from '../../core/rarity';
import type { createHoloMaterial } from '../../core/holo';
import { buildEdge, buildFace, gameCardArtAsync, themedBacks } from './cardFace';
import { haptics } from '../../core/haptics';
import { onReducedMotionChange } from '../../core/motion';
import { perfMark } from '../../core/perfLog';
import { createCardGeometry } from '../../core/cardModel';
import { EASE, Spring } from '../../core/ease';
import { allowMoreBakes, dropBakes, loadBakes, loadTearBakes, loadedBakes, loadedBakesOf, TearBakePlayer, type BakeFamily, type TearBake } from '../../core/tearBake';
import type { TearBakeEvent, TearBakeHeader } from '../../core/tearBakeFormat';
import { dropShatters, loadShatters, loadedShatters, ShatterPlayer } from '../../core/shatterBake';
import type { ShatterBake } from '../../core/shatterFormat';
import { DUR, ECLIPSE, ETOILE, FENETRE, GLACE, MYTHIC_SILENCE, MYTHIC_TURN, RETROUSSE, STAGGER, TIER_BEAT } from '../../core/motion';
import { burnNoise, fbmTexel, preloadNoise, type N } from '../../core/tsl';
import { isEclipseCard } from '../eclipse';
import { apostleStrip } from '../apostles';
import { BEBOU_PACK, THEMES, themeById, themeTagline } from '../../core/sets/themes';
import { EVENT_KEY } from '../../core/events';
import type { PackCard, SealedPack } from '../backend';

/**
 * Scène d'OUVERTURE du jeu — aussi la vitrine de la boutique : le booster qu'on regarde est celui qu'on ouvre.
 *
 *  display  : le booster flotte, s'incline sous le doigt ; changer de booster = un tour sur lui-même.
 *  sealed   : le pack est tiré (serveur) ; on MAINTIENT le doigt pour brûler l'emballage depuis le centre. Par les
 *             trous, on aperçoit déjà le dos des cartes. (Retours live 02, anti-spoil) braise et fuite de lumière sont
 *             les MÊMES pour tous les boosters : rien n'annonce la rareté avant la carte elle-même.
 *  opened   : la pile de 5 cartes ; chaque tap révèle la suivante, de la moins rare à la plus rare.
 *             Avant le retournement, toutes les cartes se comportent pareil (même élan, même retournement, même son,
 *             même vitesse) ; l'effet de rareté part quand la face apparaît : éclair, étoiles qui s'allument une à une,
 *             gerbe de particules, foil qui s'éveille ; légendaire et mythique : ralenti, aberration, flare ; mythique :
 *             plein écran (assombri, battement, montée) dès que sa face est visible, puis l'explosion.
 *             Avant la dernière carte, les cartes révélées s'écartent : toute l'attention sur elle.
 *  done     : les 5 cartes en éventail (récapitulatif).
 *
 * Préchargement : à la mise en place, les shaders de toutes les raretés sont compilés (cartes factices) ; dès que le
 * pack est tiré, ses 5 cartes sont générées et compilées pendant que le joueur brûle l'emballage.
 */
/**
 * Mise en scène de l'ouverture (le choix du joueur vaut pour tous les boosters) :
 *  - `tear` (labo 002) : on DÉCHIRE le haut du booster en glissant le doigt (ou un toucher = déchirure auto). Film
 *    simulé et cuit (tearBake.ts), bord dentelé, plastique qui blanchit, lambeaux ; les cartes sont DANS le booster
 *    (pile serrée, plus petite que le coussin : rien ne traverse l'emballage) et en sortent par le haut ;
 *  - `retrousse` (27/11, à gagner) : on glisse vers le bas, le film se retourne et laisse les cartes debout ;
 *  - `fenetre` (27/11, à gagner) : on glisse, la pile pousse la face avant de l'intérieur ; les coins percent, le
 *    contour se découpe, la pile sort par la face avec le panneau découpé plaqué dessus, qui glisse et tombe.
 * (27/11, V3) Brûlure (`burn`) et Éventail (`fan`) sont retirés : un joueur qui les avait choisis retombe sur la
 * Déchirure (`setOpeningChoice`), sans migration.
 */
export type OpenStyle = 'tear' | 'retrousse' | 'fenetre' | 'glace' | 'etoile';
/** style de la scène : une ouverture, ou `idle` (vitrine : sachet posé, aucune maille de déchirure montrée) */
type SceneStyle = OpenStyle | 'idle';
/** familles de cuissons de la scène : celles de core/tearBake.ts, et les éclats de la Déchirure glacée (core/shatterBake.ts) */
type SceneFam = BakeFamily | 'glace';
/**
 * (retours 07/11) une seule ouverture par défaut pour tous les boosters : la DÉCHIRURE ; les autres se GAGNENT par un
 * succès (src/core/cosmetics.ts, OPENINGS) ; le joueur choisit dans la fiche d'un booster et son choix vaut pour tous
 * les boosters (`setOpeningChoice`, posé par la boutique depuis `users.me`). L'ambiance Éclipse, le god pack et les
 * Merveilles du World Pack se jouent par-dessus, quel que soit le style.
 */
export function openStyleOf(p: Pick<SealedPack, 'packKind' | 'themeId' | 'eventId'> & { cards?: unknown[] }): OpenStyle {
  // (27/11, Retroussé) style FIGÉ par ouverture : la boutique le lit (indice, coach) puis open() le relit — même
  // réponse pour le même booster, même si la cuisson du Retroussé arrive entre les deux (open() relâche le gel)
  if (frozenStyle && frozenStyle.p === p) return frozenStyle.style;
  // (11/11) le booster du moment (événement limité) suit aussi le choix du joueur
  let style = chosenStyle;
  // Retroussé, Fenêtre : seulement si leur lecteur est monté ET précompilé ; sinon la Déchirure (indice compris)
  if ((chosenStyle === 'retrousse' && !rollReady) || (chosenStyle === 'fenetre' && !winReady) || (chosenStyle === 'glace' && !iceReady)) style = 'tear';
  frozenStyle = { p, style };
  return style;
}
let chosenStyle: OpenStyle = 'tear';
/** (27/11) dernier style rendu par openStyleOf, pour ce booster-là (relâché par open()) */
let frozenStyle: { p: object; style: OpenStyle } | null = null;
/** (27/11) le lecteur du Retroussé est monté et ses matériaux précompilés (posé par la scène) */
let rollReady = false;
/** (27/11) idem pour la Fenêtre */
let winReady = false;
/** (27/11) idem pour la Déchirure glacée (bloc de glace) */
let iceReady = false;
/** (27/11) la scène suit le choix (chargement de la famille de cuissons, montage hors ouverture) */
let choiceHook: ((s: OpenStyle) => void) | null = null;
/**
 * Animation d'ouverture choisie par le joueur (déjà vérifiée débloquée par le serveur) ; inconnue → la déchirure.
 * (27/11) Brûlure et Éventail retirés : `burn` / `fan` encore rangés chez un joueur retombent ici sur la déchirure.
 */
export function setOpeningChoice(id: string | undefined) {
  const before = chosenStyle;
  // (27/11) la Déchirure glacée a sa propre scène (bloc de glace) ; son éclat de givre reste en repli (chosenSkin)
  // (27/11) l'Étoile de Noël aussi (« Poussière d'étoile » : rien à charger, toujours prête)
  chosenStyle = id === 'retrousse' || id === 'fenetre' || id === 'glace' || id === 'etoile' ? id : 'tear';
  chosenSkin = id === 'glace' || id === 'etoile' ? id : '';
  if (chosenStyle !== before) {
    frozenStyle = null;
    choiceHook?.(chosenStyle);
  }
}
/**
 * (v2.1.13) ouvertures de Noël (calendrier de l'Avent) : la DÉCHIRURE, avec un éclat en DOM par-dessus la scène au
 * moment où le booster se déchire (givre ou étoiles dorées, style.css `.op-skin`). Rien ne change dans la 3D.
 */
let chosenSkin: '' | 'glace' | 'etoile' = '';
function skinBurst(host: HTMLElement) {
  if (!chosenSkin) return;
  const el = document.createElement('div');
  el.className = `op-skin op-skin-${chosenSkin}`;
  el.setAttribute('aria-hidden', 'true');
  let html = '<b></b>';
  for (let i = 0; i < 18; i++) html += `<i style="--a:${((i * 137.5) % 360).toFixed(1)}deg;--r:${(90 + ((i * 53) % 120)).toFixed(0)}px;--d:${((i % 6) * 30).toFixed(0)}ms"></i>`;
  el.innerHTML = html;
  host.append(el);
  setTimeout(() => el.remove(), DUR.ceremonie);
}

export interface OpeningEvents {
  /** le joueur doit maintenir pour ouvrir */
  onHold?(progress: number): void;
  /** emballage ouvert, pile prête */
  onOpened?(): void;
  /** une carte vient d'être retournée (index dans l'ordre de révélation) */
  onCard?(i: number, card: PackCard, total: number): void;
  /** la carte montrée part dans la rangée ; la suivante attend face cachée */
  onNext?(): void;
  /** prochaine carte = la dernière (les autres s'écartent) */
  onLast?(): void;
  /**
   * (retours Hugo 10/11) « Direct 4★ » : les cartes sous le seuil viennent d'être rangées d'un coup, sans défilement ;
   * `to` = index (ordre de révélation) de la carte qui attend maintenant, face cachée.
   */
  onJump?(to: number, total: number): void;
  /** la dernière carte est SECRÈTE : le jeu passe la main à la séquence « Un de nous » */
  onSecret?(card: PackCard): void;
  /**
   * POKÉMON 6★ : le jeu passe la main à la « rencontre sauvage » (041 : transition Game Boy Color, musique en boucle,
   * scène selon le type) ; il rappelle `resumeAfterScene()` quand le joueur continue.
   */
  onPokemon?(card: PackCard): void;
  /**
   * Une 6★ qui a sa propre cinématique (Yu-Gi-Oh : invocation sur le terrain) va être retournée : vrai = le jeu prend la
   * main (la carte attend face cachée), puis rappelle `resumeAfterCinematic()` ; faux = séquence mythique habituelle.
   */
  onCinematic?(card: PackCard, last: boolean): boolean;
  /** une MYTHIQUE (6★) : séquence plein écran dédiée (pause dramatique, burst, étoiles une à une) — démarre */
  onMythic?(card: PackCard): void;
  /** fin de la séquence mythique : la scène attend un toucher (ou appelle onDone si c'était la dernière carte, après le toucher) */
  onMythicShown?(card: PackCard, last: boolean): void;
  /** toutes les cartes sont révélées (éventail) */
  onDone?(): void;
  /** une carte de l'éventail final a été touchée (le jeu l'ouvre en grand dans la visionneuse) */
  onPick?(card: PackCard): void;
}

export interface OpeningScene extends Experiment {
  /** téléphone : rend ses cibles plein écran quand une autre scène est à l'écran (appelé par le shell) */
  suspend?(): void;
  /** Booster affiché (id de thème ou 'bebou'). */
  setBooster(key: string, animate?: boolean, dir?: 1 | -1): void;
  /**
   * (11/11) BOOSTER DU MOMENT (src/core/events.ts) : son sachet (clé `EVENT_KEY`), le même alu que les autres, teinté
   * de la couleur de l'événement, son nom moulé au centre. null : pas d'événement (le sachet n'est plus proposé).
   * (27/11, V3) sachet « Autocollant » du thème de l'événement ; `endAt` : date de fin sur l'étiquette dateuse.
   */
  setEventBooster(ev: { name: string; accent: string; endAt?: number } | null): void;
  /** Lance l'ouverture d'un pack tiré. Les cartes sont préparées (images, textures, shaders) pendant que le joueur brûle l'emballage. */
  /**
   * `continued` (retours 06/11 : ×5 / ×10 = UN booster de 25 / 50 cartes) : la suite du même gros booster — pas
   * d'emballage, les cartes arrivent directement en pile. `seriesLast` : dernier morceau (son de la dernière carte,
   * éventail final) ; faux = le morceau se range vite et la suite enchaîne.
   */
  open(pack: SealedPack, ev: OpeningEvents, o?: { continued?: boolean; seriesLast?: boolean }): void;
  /** Prépare à l'avance les cartes d'un booster qui sera ouvert ensuite (série) : son ouverture sera instantanée. */
  preload(pack: SealedPack): void;
  /** Après la séquence secrète : affiche directement l'éventail, la carte secrète face visible. */
  finishAfterSecret(): void;
  /** Après une scène dédiée (rencontre Pokémon) : la carte en cours est montrée face visible, la suite reprend. */
  resumeAfterScene(): void;
  /** Après une cinématique de 6★ (onCinematic) : la carte est montrée face visible, plein écran, comme à la fin de la séquence mythique. */
  resumeAfterCinematic(): void;
  /**
   * Après le PRÉLUDE d'une 6★ (indices + scène de sa famille, game/mythic) pris par onCinematic : la révélation
   * habituelle de la carte reprend (anticipation, retournement, impact, étoiles), sans redemander de cinématique.
   */
  resumeReveal(): void;
  /**
   * (10/11) Rectangle écran (px CSS) de la carte qui attend sa révélation, d'après la dernière image rendue : la
   * doublure 2D des scènes 6★ (game/mythic) vient s'y poser avant que le calque se fonde. null s'il n'y en a pas.
   */
  revealRect(): { x: number; y: number; w: number; h: number } | null;
  /** Retour à la vitrine (libère les cartes du pack). */
  reset(): void;
  /** Révéler / avancer (même effet qu'un tap). */
  advance(): void;
  /**
   * Éventail final : rectangle écran (px CSS) de chaque carte, dans l'ordre de l'éventail (de la moins rare à la plus
   * rare), pour poser des badges DOM dessus (NOUVELLE / DOUBLON) ; null tant que l'éventail n'est pas là.
   */
  fanRects(): Array<{ card: PackCard; x: number; y: number; w: number; h: number }> | null;
  /**
   * (V3 lot 04) Éventail final : appelé par la boucle de la scène, juste après le rendu de l'image, quand le rectangle
   * d'une carte a changé (au pixel près : inclinaison, survol, redimensionnement, replacement). Éventail immobile :
   * plus aucun appel. Remplace la boucle requestAnimationFrame des badges de la boutique.
   */
  onFanMove: ((rects: Array<{ card: PackCard; x: number; y: number; w: number; h: number }>) => void) | null;
  /**
   * Pilotage automatique (ouvertures ×5 / ×10, « passer jusqu'aux 4★ ») :
   * - `burn` : l'emballage s'ouvre tout seul (déchirure ou retroussé automatique) ;
   * - `minRank` : les cartes de rang inférieur se retournent et filent dans la rangée en accéléré, sans toucher ;
   *   la scène s'arrête (attend un toucher) sur chaque carte de rang ≥ minRank. 0 = désactivé.
   * - `reveal` (« Tout révéler ») : toutes les cartes se retournent toutes seules, à vitesse normale pour celles de
   *   rang ≥ minRank ; une mythique garde sa séquence plein écran et attend le toucher final.
   * - `jump` (retours Hugo 10/11, avec `minRank`) : plus de défilement — les cartes sous le seuil se rangent d'un coup,
   *   face visible, et la scène va DIRECTEMENT à la première carte de rang ≥ minRank ; s'il n'y en a aucune, tout le
   *   booster s'ouvre d'un coup (éventail final).
   */
  setAuto(o: { burn?: boolean; minRank?: number; reveal?: boolean; jump?: boolean }): void;
  /** Vitrine : le booster lui-même a été touché (le jeu l'ouvre, comme le bouton « Ouvrir »). */
  onBoosterTap: (() => void) | null;
  /**
   * Décale l'image de `px` pixels vers la droite et `py` vers le bas (glissement doux) : sur ordinateur, le booster se
   * centre dans l'espace laissé libre par la fiche du booster ; 0 = centre de l'écran (ouverture, téléphone).
   */
  setFocusOffset(px: number, py?: number): void;
  /**
   * Miniature (URL d'image) de la face d'un booster, pour la boutique ; `size` = largeur demandée (px). null si elle
   * n'est pas encore prête : elle est alors encodée en tâche de fond (WebP asynchrone, mise en cache) et `onThumb(key)`
   * prévient quand elle l'est (audit PERF2-18 / PERF1-15).
   */
  packThumb(key: string, size?: number): string | null;
  /** une miniature de booster (ou le visuel du booster lui-même) vient d'être prête */
  onThumb: ((key: string) => void) | null;
  /**
   * Interface posée sur la scène (px CSS) : hauteur prise en haut (en-tête, compteur) et en bas (panneau de la carte,
   * indication, boutons ; 0 si le panneau est sur le côté). La carte montrée se place dans l'espace libre (UX2-06).
   */
  setInsets(top: number, bottom: number): void;
  /**
   * Récap : hauteur (px CSS, depuis le bas de l'écran) prise par le panneau du récap ; l'éventail final se pose
   * au-dessus (et s'y replace s'il est déjà là). 0 = mise en page par défaut. Remis à 0 par reset().
   */
  setSummaryInset(px: number): void;
  /** Vitrine : booster pas encore disponible (« bientôt ») → légèrement désaturé et moins éclairé. */
  setBoosterSoon(on: boolean): void;
  /** Vitrine : un coup de doigt horizontal sur le booster (le jeu passe au booster voisin). */
  onBoosterSwipe: ((dir: 1 | -1) => void) | null;
  /**
   * Roue des boosters en 3D (téléphone) : pose de chaque pochette (px CSS, repère de `wheelView`), null = cachée.
   * Voir packWheel3d.ts.
   */
  setWheel(items: WheelItem3D[] | null): void;
  /** perspective (px CSS) et point de fuite (px CSS) de la caméra, pour caler la roue HTML dessus ; null = pas de roue 3D */
  wheelView(): { P: number; ox: number; oy: number } | null;
  /** la roue 3D vient d'être prête (la page doit se remettre en page pour la caler) */
  onWheelReady: (() => void) | null;
  /**
   * Roue VERTICALE des boosters (ordinateur, packReel.ts) : ordre des pochettes (celui de la boutique) ; la roue a
   * trouvé son cran sur une autre pochette → `onReelCommit` (la boutique change le grand booster sans animation) ;
   * `reelTo` : la boutique demande une pochette (menu, clavier) → true si la roue s'en charge ; `reelLock` : booster
   * déjà tiré, fiche ouverte… → la roue ne tourne pas.
   */
  setReelKeys(keys: string[]): void;
  onReelCommit: ((key: string) => void) | null;
  reelTo(key: string): boolean;
  reelActive(): boolean;
  reelLock: (() => boolean) | null;
  /** rectangle écran (px CSS) du booster de la vitrine ; null hors vitrine */
  boosterRect(): { x: number; y: number; w: number; h: number } | null;
  /** vitrine : le booster se soulève un instant, comme au survol de la souris sur ordinateur (« touche-moi ») */
  hintPulse(): void;
  readonly phase: Phase;
  debug(): unknown;
  /** tests : ralenti de toutes les timelines gsap */
  slowMo(k: number): void;
  /** tests / rendu de l'icône : fige la sortie simulée à l'instant `exit` (s) et pose les cartes à la main */
  pose(o: { exit: number; strip?: boolean; cards: { x?: number; y: number; z?: number; rz?: number }[] }): void;
}

/** `mythicHold` : la 6★ est révélée plein écran, la scène attend un toucher avant l'éventail */
/** `scene` : une scène dédiée (rencontre Pokémon) a la main — l'ouverture ignore tout toucher jusqu'à resumeAfterScene() */
type Phase = 'display' | 'sealed' | 'opened' | 'busy' | 'shown' | 'mythicHold' | 'done' | 'scene';

/** Réglage « réduire les animations » du téléphone / de l'ordinateur : pas de flash négatif, secousses atténuées. */
const CALM = typeof matchMedia === 'function' && matchMedia('not all').matches;
const CARD_W = 0.63;
const CARD_H = 0.88;
/**
 * Écart entre deux cartes empilées. Une carte fait 0,007 d'épaisseur (CARD.t) : en dessous de ça elles s'interpénètrent
 * (c'était 0,002–0,004 → coins qui traversent la carte de devant, surtout avec les petites rotations rz de la pile).
 */
const STACK_DZ = 0.0165; // (06/11) cartes à 1,2 mm
/**
 * « Tout révéler » : une 6★ joue toute sa séquence (pause dramatique comprise), puis reste admirée ce temps-là avant que
 * la suite reparte seule (au lieu d'attendre un toucher). En manuel, rien ne change : elle attend le toucher.
 */
const MYTHIC_ADMIRE_MS = 1500;
/**
 * (retours 05/11) « Tout révéler » ralenti : vitesse des petites cartes, temps de lecture minimal de chaque carte, et
 * une 5★ qui garde sa version complète (ralenti compris) puis reste admirée un moment avant la suite.
 */
const REVEAL_SPEED = 2.2;
const REVEAL_DWELL_MS = 320;
const LEGEND_ADMIRE_MS = 1100;
/**
 * (retours live 02, anti-spoil) Couleur unique de la braise et de la fuite de lumière du booster scellé : la même pour
 * tous les boosters (c'était la couleur de la meilleure carte : on devinait une rouge ou une 6★ avant de l'ouvrir).
 */
const NEUTRAL_EMBER = '#e8e2d6';
/**
 * (V3, lot 07 + signature S3) DÉCHIRURE À RÉSISTANCE : stick-slip DÉTERMINISTE de la soudure (avant : seuil tiré au
 * hasard à chaque image). La bande reste accrochée tant que la tension (doigt − déchirure) n'atteint pas un seuil, puis
 * file d'un coup jusqu'au doigt. Seuil fort sur les points de soudure (tous les ~14 % de la course, l'encoche d'abord),
 * faible dans le film entre deux ; un geste vif l'efface presque (×0,15) : lent = crans espacés, vif = coupe nette.
 */
const TEAR_WELDS = [0, 0.15, 0.29, 0.43, 0.57, 0.71, 0.85];
const TEAR_NEED = { first: 0.07, weld: 0.055, film: 0.03 };
/**
 * (27/11) Retroussé : mêmes à-coups, mais les points durs viennent de la cuisson tirée (le verrou de la soudure du
 * haut, puis chaque paire de crans latéraux à la moyenne gauche / droite, `rollWeldsOf`) ; le verrou résiste plus.
 */
const ROLL_NEED = { first: 0.08, weld: 0.04, film: 0.02 };
/**
 * (27/11) cadrage du Retroussé : le bas du film retourné reste au-dessus de cette fraction de la demi-hauteur visible
 * (la bande d'indications du bas reste lisible) ; remontée au plus ROLL_LIFT_MAX (unités de la scène)
 */
const ROLL_KEEP = 0.86;
const ROLL_LIFT_MAX = 0.3;
/** points durs du Retroussé : 0, le verrou, puis une paire de crans latéraux (gauche / droite) au p moyen */
function rollWeldsOf(ev: readonly TearBakeEvent[]): number[] {
  const out = [0];
  const lock = ev.find((e) => e.k === 'lock' && e.p !== undefined);
  if (lock) out.push(lock.p!);
  const side = ev.filter((e) => e.k === 'side' && e.p !== undefined).sort((a, b) => a.p! - b.p!);
  for (let i = 0; i < side.length; ) {
    const a = side[i], b = side[i + 1];
    // une paire = un cran à gauche et un à droite à la même hauteur (y) ; un cran seul compte pour lui-même
    if (b && b.x !== a.x && Math.abs(b.y - a.y) < 1e-3) (out.push((a.p! + b.p!) / 2), (i += 2));
    else (out.push(a.p!), (i += 1));
  }
  return out.filter((p, i, a) => i === 0 || p > a[i - 1]);
}
/**
 * (27/11) Fenêtre : la résistance monte sans que rien ne casse (seuil de départ fort), butée juste avant le premier coin
 * qui perce (les 4 coins cèdent ensemble passé ce point), puis le film se laisse découper (seuil faible).
 */
const WIN_NEED = { first: 0.12, weld: 0.05, film: 0.012 };
function winWeldsOf(ev: readonly TearBakeEvent[]): number[] {
  const c = ev.filter((e) => e.k === 'corner' && e.p !== undefined).map((e) => e.p!);
  return c.length ? [0, Math.max(0.01, Math.min(...c) - 0.005)] : [0];
}
/** vitesse de la déchirure demandée (progression / s) : en dessous de `slow` tout accroche, au-delà de `fast` ça tranche */
const TEAR_SPEED = { slow: 1.2, fast: 5 };
/** direction de pelage à l'écran : vers la droite en soulevant un peu la bande (~18° vers le haut) */
const PEEL_C = Math.cos(0.32);
const PEEL_S = Math.sin(0.32);
/** doigt levé passé ce point : la soudure cède d'un trait (sinon le pli reste marqué là où il est, on peut reprendre) */
const TEAR_FINISH = 0.72;
/** fente de lumière (S3) : s'ouvre entre ces deux points de la déchirure */
const TEAR_SLIT = [0.33, 0.55] as const;
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/**
 * AMBIANCE « ÉCLIPSE » (Berserk 5★ / 6★ — game/eclipse.ts). Palette relevée sur les planches : noir, bordeaux,
 * cramoisi, braise, couronne. `ember` / `aura` : la fuite de lumière et le halo du sachet fermé (temps 1) ;
 * `horizon`, `moonY` : fraction de la hauteur d'écran (0 = haut) ; `dark` : assombrissement fermé / ouvert / effets réduits ;
 * `dusk` : présence du ciel à la fin du temps 1 condensé d'un morceau de gros booster (l'horizon rougeoit, l'astre à peine).
 */
/** bande des apôtres sur la crête (game/apostles.ts) : largeur et hauteur en hauteurs d'écran */
const APO = { span: 2, band: 0.09 };
const ECL = { ember: '#e0301a', aura: '#9c0c0c', horizon: 0.6, moonY: 0.26, dark: { sealed: 0.5, open: 0.14, low: 0.3 }, dusk: 0.32 };
/**
 * RETOURNEMENT « charnière » (demande de Tom, 4 nov.) : la carte ne pivote plus sur son axe médian (effet « vallée de
 * l'étrange ») mais autour de sa TRANCHE DROITE, comme une vraie carte qu'on retourne : le bord gauche se soulève vers
 * la caméra, le bord droit reste posé. Géométrie : centre = x₀ + (w/2)(1 − cos φ), z = (w/2) sin φ. Une carte retournée
 * ainsi atterrit décalée de sa largeur ; la « main » la ramène au centre pendant la seconde moitié (`HINGE_SETTLE`).
 * 0 = retournement sur l'axe (ancien comportement).
 */
const HINGE = 1;
/** part de la perspective réellement visible quand la carte se soulève (1 = taille apparente constante, ancien comportement) */
const HINGE_PERSP = 0.55;
/** or des tranches face cachée des 5★, 6★ et secrètes (le même : « au moins une 5★ », sans trahir le palier) */
const TEASE_GOLD = '#e0a63a';
/** Fraction de la durée d'une courbe d'animation où elle passe à mi-chemin (retournement : la face devient visible). */
function halfAt(ease: (t: number) => number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (ease(m) < 0.5) lo = m;
    else hi = m;
  }
  return hi;
}
/** un Pokémon 6★ : sa révélation est la « rencontre sauvage » (expérience 041) */
const wildPokemon = (s: { data: PackCard }) => s.data.rarity === 'mythic' && s.data.cardId.startsWith('pkm-');
const RANK: Record<RarityId, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };

interface Slot {
  data: PackCard;
  cd: CardData;
  rr: Rarity;
  art: CardArt;
  mesh: Mesh;
  mats: Material[];
  holoU: ReturnType<typeof createHoloMaterial>['uniforms'];
  U: { lit: ReturnType<typeof uniform>; flash: ReturnType<typeof uniform>; rim: ReturnType<typeof uniform>; tease: ReturnType<typeof uniform> };
  /** pose animée */
  p: { x: number; y: number; z: number; s: number; flip: number; rz: number; holo: number };
  /** survol à la souris sur l'éventail final (0..1, lissé) */
  hov: number;
}

/** Styles des boosters (un par thème + le bébou pack), tirés du registre des thèmes. */
/** couleur du sachet de chaque booster (retours 06/11) */
const SACHET: Record<string, string> = { bebou: '#9ea2aa', gaming: '#6a4fc4', pop: '#d8742e', sport: '#3a9a66', monde: '#3c73c8' };
/** (retours live 6, C1) le nom imprimé en noir sur chaque sachet (validé par Hugo) */
const SACHET_LABEL: Record<string, string> = { bebou: 'Bebou', gaming: 'Gaming', pop: 'Popculture', sport: 'Sport', monde: 'World' }; // i18n-ok
function boosterStyles(): Record<string, PackStyle> {
  const out: Record<string, PackStyle> = {};
  // mentions au dos des boosters du jeu (celles du labo parlent d'illustrations procédurales)
  const backLines = [tr('op.back1'), tr('op.back2'), tr('op.back3')];
  for (const t of THEMES) out[t.id] = { name: t.label, ...t.style, title: t.booster, series: `S É R I E   I  ·  ${t.label.toUpperCase()}`, tagline: themeTagline(t), backLines };
  out.bebou = { name: 'Bébou', ...BEBOU_PACK.style, title: BEBOU_PACK.booster, series: 'P A C K   D E   B A S E', tagline: BEBOU_PACK.tagline, backLines: [...backLines.slice(0, 2), tr('op.backSecret')] }; // i18n-ok
  // (retours 06/11) sachets SIMPLES : une couleur par pack (gris, violet, orange, vert, bleu), le logo et le nom
  for (const [k, c] of Object.entries(SACHET)) if (out[k]) Object.assign(out[k], { simple: true, ground: c, label: SACHET_LABEL[k] });
  return out;
}

/** (11/11) sachet du booster du moment : comme les 5 autres (alu teinté, nom moulé), à la couleur de l'événement */
function eventBoosterStyle(ev: { name: string; accent: string }): PackStyle {
  return { name: ev.name, ...BEBOU_PACK.style, accent: ev.accent, title: ev.name.toUpperCase(), series: 'B O O S T E R   D U   M O M E N T', tagline: tr('op.limited'), backLines: [tr('op.back1'), tr('op.backTime'), tr('op.back3')], simple: true, ground: ev.accent, label: ev.name };
}

/**
 * lueur de la tranche face cachée, par rang (commune → secrète) : le teasing du code couleur des raretés. 1★ / 2★ :
 * aucune lueur ; 5★, 6★ et secrète : la même lueur dorée (réf. motion §3.3 — l'incertitude reste au sommet de l'échelle).
 */
const TEASE = [0, 0, 0.3, 0.36, 0.5, 0.5, 0.5];

export function createOpeningScene(): OpeningScene {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  let post: { render(): void };
  /** (audit 12/11, E3-01) rend au GPU les cibles plein écran de l'ouverture quand une autre scène est à l'écran */
  let releaseTargets: (() => void) | null = null;
  /** compile les pipelines de la scène pour la cible réelle de la passe (voir setup, WebGPU ; WebGL2 : variante canvas) ; repli : stage.compile() */
  let compileReal: () => Promise<void> = () => stage.compile();
  let key: DirectionalLight;
  const rig = new Group();
  const packRig = new Group();
  const cardsRig = new Group();
  let phase: Phase = 'display';
  let events: OpeningEvents = {};
  let pack: SealedPack | null = null;
  let slots: Slot[] = [];
  let order: number[] = [];
  let cursor = 0;
  let prepared: Promise<void> | null = null;
  let tl: gsap.core.Timeline | null = null;
  /** (V3 lot 04) derniers rectangles écran de l'éventail final envoyés à `onFanMove` (x, y, w, h par carte) */
  const fanSig: number[] = [];
  /** timelines secondaires (sortie des cartes vers la rangée…) : jamais coupées par un tap, seulement au reset */
  const side = new Set<gsap.core.Timeline>();
  let spinTl: gsap.core.Timeline | null = null;
  let holding = false;
  /** pilotage automatique (voir setAuto) */
  const auto = { burn: false, minRank: 0, reveal: false, jump: false };
  /** carte (curseur) dont le prélude 6★ vient d'être joué : sa révélation ne redemande pas de cinématique */
  let preluded = -1;
  /** la carte courante doit-elle défiler en accéléré ? */
  const fastCard = (si: number | undefined) => auto.minRank > 0 && si !== undefined && !!slots[si] && slots[si].rr.rank < auto.minRank;
  /**
   * Vitesse d'une carte en défilement auto (audit UX2-02 / UX2-04) : ×3,5 sous le seuil, sauf une légendaire (5★,
   * accélérée seulement par « Tout révéler ») qui passe à ×2 : son ralenti reste visible, sans annuler l'accéléré.
   */
  // (retours 05/11) « Tout révéler » moins pressé : ×2,2 au lieu de ×3,5 (« 4★ et + » garde son défilement rapide)
  const fastSpeed = (si: number | undefined) => (!fastCard(si) ? 1 : slots[si!].rr.rank >= 3 ? 1 : auto.reveal ? REVEAL_SPEED : 3.5);
  /** « Tout révéler » / « 4★ et + » : une 4★ ou 5★ sous le seuil joue sa VERSION CONDENSÉE (montée raccourcie, même impact) au lieu d'une accélération ×2 */
  const condensed = (si: number | undefined) => fastCard(si) && slots[si!].rr.rank >= 3;
  /**
   * Allume la tranche d'une carte face cachée (teasing) : une note dont la hauteur suit le palier (3★ grave, 4★ plus
   * aiguë, or = accord) ; 1★ / 2★ restent éteintes. `at` en secondes dans `t`.
   */
  /** (retours 06/11) carte muette : ni la dernière du booster, ni une 5★ / 6★ */
  const quietCard = (rank: number, last: boolean) => !(last && seriesLast) && rank < 4;
  /** dernier morceau d'un gros booster ×5 / ×10 (ou booster simple) */
  let seriesLast = true;
  /** les mêmes appels que ctx.sfx, sans aucun son */
  const MUTE_SFX = new Proxy({}, { get: () => () => undefined }) as typeof ctx.sfx;
  /**
   * (son V2) SOUFFLE CALÉ SUR UN MOUVEMENT : même durée réelle que le tween (échelle de temps de sa timeline comprise) et
   * même courbe — le son suit la VITESSE de l'animation (fort là où ça file, éteint là où ça ralentit ; un ressort
   * s'entend rebondir). `up` : la couleur monte (départ) ou descend (arrivée).
   */
  const air = (line: { timeScale(): number } | null, dur: number, vol: number, ease: (t: number) => number, up = true, sfx = ctx.sfx) =>
    sfx.whoosh(dur / Math.max(0.2, line?.timeScale() ?? 1), vol, up, ease);
  /**
   * (son V2) avance (s de timeline) avec laquelle l'impact SONORE d'une révélation est programmé avant l'image : il part
   * sur l'horloge audio, latence de sortie déduite (audio.ts `ahead`), et sort du haut-parleur pile sur le flash.
   */
  const SND_LEAD = 0.1;
  function lightRim(t: gsap.core.Timeline, si: number, at: number) {
    const sl = slots[si];
    const v = TEASE[Math.min(6, sl.rr.rank)];
    if (v <= 0) return;
    const isLast = order.length > 0 && si === order[order.length - 1];
    t.fromTo(sl.U.rim, { value: 0 }, { value: v, duration: 0.18, ease: EASE.glide, immediateRender: false,
      // une note douce par palier (3★ si5 · 4★ ré6 · or mi6 + scintillement) — charte sonore §A
      onStart: () => { if (quietCard(sl.rr.rank, isLast)) return; ctx.sfx.note(7 + Math.min(2, sl.rr.rank - 2), 0.06, 0.5); if (sl.rr.rank >= 4) ctx.sfx.tick(2.2, 0.03); } }, at);
  }
  /** mode auto « rapide » (« Tout révéler », « 4★ et + ») : ouvertures d'emballage raccourcies (la série manuelle garde son rythme) */
  const autoQuick = () => auto.reveal || auto.minRank > 0;
  /**
   * (retours live 02, anti-spoil) vitesse d'une carte AVANT que sa face soit visible : la même pour toutes en défilement
   * auto (sinon une belle carte, plus lente, se trahissait) ; la vitesse propre à sa rareté (`fastSpeed`) prend le
   * relais quand elle apparaît.
   */
  const preSpeed = () => (auto.reveal ? REVEAL_SPEED : auto.minRank > 0 ? 3.5 : 1);
  /** « Tout révéler » : instant où la carte courante a été montrée (temps de lecture minimal avant la suivante) */
  let shownAt = 0;
  /**
   * (audit UX2-01) toucher reçu pendant une transition (carte qui file dans la rangée, emballage qui s'ouvre) : au lieu
   * d'être avalé, il est mis de côté et rejoué dès que la scène attend de nouveau un toucher.
   */
  let queued = false;
  const flushQueued = () => {
    if (!queued) return;
    queued = false;
    advance();
  };
  /** vitesse de base de la carte en cours (le ralenti des 5★/6★ s'y rapporte) et instant du payoff dans sa timeline */
  let curBase = 1;
  let curPay = 0;
  /** « Tout révéler » : une 6★ montrée reste admirée jusqu'à cet instant (performance.now), puis la suite repart seule */
  let autoHoldUntil = 0;
  /** zone libre de l'écran (px CSS) laissée par l'interface : en haut (en-tête, compteur), en bas (panneau de la carte) */
  const insets = { top: 96, bottom: 200 };
  /** hauteur réservée au récap (px CSS, depuis le bas) : l'éventail final se pose au-dessus ; 0 = mise en page par défaut */
  let sumInset = 0;
  /**
   * (retours live 02, anti-spoil) la face de la carte en cours est-elle visible ? Avant, la scène se comporte de la même
   * façon pour toutes les raretés (vitesse, réponse au toucher) ; `curTier` ne prend la vraie valeur qu'à ce moment.
   */
  let revealed = false;
  /** « 4★ et + » : une belle carte vient d'être montrée, la scène attend un toucher avant la suivante */
  let autoWait = false;
  /** 003 — temps écoulé depuis que le booster tiré est posé (lueur NEUTRE, identique pour tous : retours live 02) */
  let sealedT = -1;
  let boosterKey: string = THEMES[0].id;
  const arts = new Map<string, PackArt>();
  /** miniatures des boosters encodées (clé « booster|largeur » → URL blob ; '' = en cours) */
  const thumbCache = new Map<string, string>();
  /** booster demandé dont le visuel n'est pas encore généré (appliqué dès qu'il l'est) */
  let wantKey: string | null = null;
  let wantDir: 1 | -1 = 1;
  /** génère en tâche de fond les visuels des boosters pas encore prêts (lancé à la fin de setup) */
  let startArts: () => Promise<void> = async () => {};
  /** styles des boosters (setup) ; le booster du moment s'y ajoute / s'en retire (setEventBooster) */
  let styles: Record<string, PackStyle> = {};
  let eventWant: { name: string; accent: string; endAt?: number } | null = null;
  let eventSig = '';
  /** visuels en cours de génération (la file de fond et le booster du moment ne se marchent pas dessus) */
  const genBusy = new Set<string>();
  let artsLoopDone = false;
  // (booster du moment tiré, événement fini depuis : sachet du Bebou Pack plutôt qu'un visuel qui n'existe plus)
  const packKeyOf = (p: Pick<SealedPack, 'packKind' | 'themeId' | 'eventId'>) => (p.eventId ? (styles[EVENT_KEY] ? EVENT_KEY : 'bebou') : p.packKind === 'bebou' ? 'bebou' : themeById(p.themeId ?? '')?.id ?? THEMES[0].id);
  let packNodes: Record<string, { value: Texture }> = {};
  /**
   * (07/11) TOUTES les textures d'un booster à remplacer quand on change de booster : avant, seules couleur et masques
   * suivaient — la carte de hauteur et les NORMALES des plis restaient celles du premier booster chargé (même froissé
   * sur tous les grands boosters, alors que les mini-boosters du menu avaient chacun le leur).
   */
  type ArtSwap = { n: { value: Texture }; pick: (a: PackArt) => Texture | undefined };
  /**
   * (perf, audit R5) textures de sachet déjà envoyées (ou posées dans un matériau) : avant, les 6 textures d'un booster
   * partaient d'un bloc (+ leurs mipmaps ≈ 55 passes de rendu) à la 1re sélection, en plein glissé de la roue.
   * `feedArts` les envoie d'avance, DEUX par image, vitrine et roue au repos : le booster affiché d'abord, puis ses
   * voisins (±1 sur téléphone, toute la roue sur ordinateur) ; le sachet visé par un changement de booster passe devant.
   */
  const sentTex = new WeakSet<Texture>();
  let allKeys: string[] = [];
  let urgentKey: string | null = null;
  let lastDir: 1 | -1 = 1;
  let wheelSig = 0;
  let wheelMovedAt = 0;
  const packSwaps: ArtSwap[] = [];
  const tearSwaps: ArtSwap[] = [];
  const track = <T,>(list: ArtSwap[], n: T, pick: ArtSwap['pick']): T => {
    list.push({ n: n as unknown as { value: Texture }, pick });
    return n;
  };
  const applySwaps = (list: ArtSwap[], a: PackArt) => {
    for (const t of a.gpuTextures) sentTex.add(t); // posées dans un matériau : elles partent à la prochaine image
    for (const s of list) {
      const t = s.pick(a);
      if (t) s.n.value = t;
    }
  };
  /** relief des plis du booster dans la géométrie (sommets), lu dans SA carte de hauteur */
  const creaseLift = (list: ArtSwap[], art: PackArt, side: 0 | 1): N | null => {
    if (!art.fullCrease) return null;
    const u = uv();
    const h = track(list, texture(art.crinkle, side === 0 ? u : u.mul(vec2(-1, 1)).add(vec2(1, 0))).level(float(0)), (a) => a.crinkle);
    const lift = packCreaseLift(h, u.x);
    return vec3(0, 0, side === 0 ? lift : lift.negate());
  };
  let cardGeo: ReturnType<typeof createCardGeometry>;
  let backMat: Material;
  let backs: ReturnType<typeof themedBacks>;
  let backArtScale = 0.6;
  let artScale = 0.85;
  const shake = new Spring(0, 260, 9);
  const shake2 = new Spring(0, 300, 10);
  let camBase = 3;
  const proj = new Vector3();
  const followPos = new Vector3();
  const tmpQ = new Quaternion();
  const packQ = new Quaternion();
  /** profondeur du booster pendant l'ouverture (la pile reste à cette distance derrière lui) */
  const PACK_OPEN_Z = 0.12;
  /** (07/11) reflets du sachet aluminium : studio « foil » (bandes de lumière) — créé au premier sachet */
  let foilEnv: N | null = null;
  const foilEnvNode = (): N => (foilEnv ??= pmremTexture(studioEnv(ctx.renderer, 'foil')));
  /** échelle du booster pendant l'ouverture : même taille à l'écran que l'ancien booster (PACK_FRAME) */
  const OPEN_S = PACK_FRAME.h / PACK.h;
  const warm: Material[] = [];
  /** amplitude d'inclinaison de la pile (lissée) et respiration de la pile en attente */
  let tiltAmp = 0;
  /** couleur d'accent de chaque booster (halo de la vitrine) */
  const accents = new Map<string, Color>();
  let breathe = 0;
  /** carte de l'éventail sous la souris (-1 : aucune) */
  let hovered = -1;
  const ray = new Raycaster();
  const ndc = new Vector2();
  let packMeshRef: Mesh | null = null;
  /** gerbe de particules (cachée sur téléphone quand elle est éteinte : 1 100 sprites transparents dessinés pour rien) */
  let partsRef: Sprite | null = null;
  /** halo plein écran (additif) : caché quand il est éteint, et en vitrine sur téléphone (audit PERF1-11) */
  let glowRef: Mesh | null = null;
  /** lambeaux : matrices à remettre à zéro une dernière fois */
  let shredsDirty = true;
  /** progression de la déchirure à la dernière impulsion haptique */
  let hapticTear = 0;
  /** vitrine au repos sur téléphone : une image sur deux (audit PERF1-07) */
  let calmSkip = 0;
  const lastTilt = new Vector2();
  let packLift = 0;
  const lastNdc = new Vector2(9, 9);
  let fanTick = 0;
  /** booster sous la souris (vitrine) */
  let packHover = false;
  /** vitrine (téléphone) : soulèvement « touche-moi » jusqu'à cet instant (s, horloge de la scène) */
  let hintLiftUntil = 0;
  let sceneT = 0;
  /** roue des boosters en 3D (téléphone) et dernière pose reçue */
  let wheel3d: Wheel3D | null = null;
  /** roue 3D compilée (avant : la page garde ses pochettes HTML) */
  let ready3d = false;
  let wheelItems: WheelItem3D[] | null = null;
  let wheelDirty = false;
  /** roue verticale (ordinateur, packReel.ts) */
  let reel: Reel | null = null;
  /** ordre des pochettes de la roue verticale (celui de la boutique), reçu avant que la roue existe */
  let reelKeys: string[] | null = null;
  /** tier de la carte en cours de révélation (un toucher impatient n'accélère que les communes → épiques) */
  let curTier = 0;
  /** vitrine en portrait : le booster remonte et rétrécit pour laisser la place au choix des boosters en bas */
  const L = { dispY: 0, dispS: 1 };
  let dispK = 1;
  /** roue en mouvement (0..1, lissé) : le flottement et l'inclinaison à la souris s'effacent puis REVIENNENT en douceur */
  let reelMoveK = 0;
  /** (07/11, retours de Tom) luminosité du grand booster (il part dans l'ombre sur les côtés du tambour, comme ses voisines) */
  const bigShade = uniform(1);
  /**
   * JUMEAUX du grand booster (roue verticale, ordinateur) : les pochettes du tambour visibles à l'écran sont rendues
   * avec le maillage et les matériaux du grand booster (avant : mini-boosters à 24 × 36 et 768 px → on voyait la
   * pochette suivante passer en basse définition, puis « pop » au lâcher quand le grand booster la remplaçait). Les
   * pochettes hors champ restent des mini-boosters. Textures changées par `applySwaps` : aucun recompilage.
   */
  type Twin = { rig: Group; mesh: Mesh; swaps: ArtSwap[]; shade: { value: number }; key: string | null };
  const twins: Twin[] = [];
  const TWINS = 4;
  /** décalage horizontal de l'image (px CSS) : cible et valeur lissée */
  let focusT = 0;
  let focusCur = 0;
  let focusTY = 0;
  let focusCurY = 0;
  const focusKey = { x: NaN, y: NaN, w: 0, h: 0 };

  // ── déchirure (Bebou Pack, World Pack)
  let style: SceneStyle = 'idle';
  let packMeshMain: Mesh | null = null;
  let tearBody: Mesh | null = null;
  let tearStrip: Mesh | null = null;
  let shreds: InstancedMesh | null = null;
  const tearNodes: Array<Record<'front' | 'back' | 'masks', { value: Texture }>> = [];
  const TP = uniform(0); // progression de la déchirure (0..1.08)
  const TFLY = uniform(0); // envol de la bande arrachée
  /** (13/11) intérieur du film : la teinte du sachet (PackArt.tint), métal brut gris sur les autres visuels */
  const TEAR_INNER = '#cbcbc8';
  const tearInner = uniform(new Color(TEAR_INNER));
  const fly = { t: 0 };
  let tearTarget = 0;
  let tearProgress = 0;
  /** stick-slip (lot 07) : vitesse lissée de la cible (progression / s), cible à l'image d'avant, bande en train de
   *  filer, prochain point de soudure (index dans TEAR_WELDS), soudure lâchée d'un trait (doigt levé passé TEAR_FINISH) */
  let tearVel = 0;
  let tearPrevTarget = 0;
  let tearSlip = false;
  let tearWeld = 0;
  let tearFling = false;
  /** vitesse de la bande quand elle file (progression / s) : toute la course en DUR.rapide */
  const tearRate = 1000 / DUR.rapide();
  /** (S3) fente de lumière rasante à l'intérieur de la coupe (0..1) */
  const TSLIT = uniform(0);
  /**
   * (27/11) Fenêtre : fente de lumière le long du contour découpé — WCUT 0..1 : avancée des fronts depuis les coins (0 =
   * rien, 1 = jusqu'au milieu des bords, d'après la part du contour rompue `cut`), WSLIT : intensité (s'éteint en sortie)
   */
  const WCUT = uniform(0);
  const WSLIT = uniform(0);
  let autoTear: gsap.core.Tween | null = null;
  const tearShake = new Spring(0, 420, 16);
  /**
   * (10/11) DÉCHIRURE SIMULÉE (core/tearBake.ts, scripts/bake-tear) : film alu / PET simulé hors-ligne (plis plastiques,
   * soudures qui cèdent, cartes rigides qui écartent les lèvres en sortant), rejoué ici. La déchirure procédurale reste
   * le repli (enregistrement pas encore arrivé, navigateur sans DecompressionStream).
   */
  let bakePlayer: TearBakePlayer | null = null;
  let bakedBody: Mesh | null = null;
  let bakedStrip: Mesh | null = null;
  /** cette ouverture rejoue la simulation */
  let useBake = false;
  /** tête de lecture de la déchirure (lissée derrière la progression du doigt) */
  let bakePlay = 0;
  /** horloge de la sortie (s) ; < 0 : encore en déchirure */
  const bakeExit = { t: -1 };
  /** pose figée (rendu de l'icône) : visibilité imposée de la bande arrachée */
  let poseStrip: boolean | null = null;
  function setTearVisible(on: boolean) {
    // (27/11) le maillage procédural de la Déchirure ne s'affiche jamais par-dessus le Retroussé
    if (tearBody && tearStrip) tearBody.visible = tearStrip.visible = on && !useBake && !rolling && !windowing && !icing;
    if (bakedBody && bakedStrip) bakedBody.visible = bakedStrip.visible = on && useBake;
    if (rollBody) rollBody.visible = on && rolling;
    if (winBody && winPanel) winBody.visible = winPanel.visible = on && windowing;
    // (session Fable) le sachet gelé n'est dessiné qu'à partir du bris : au repos, la glace le montre par réfraction
    if (iceMesh && iceFilm) (iceMesh.visible = on && icing), (iceFilm.visible = on && icing && ICE.t >= 0);
  }
  /**
   * (27/11) DÉCHIRURE GLACÉE refaite (core/shatterBake.ts, scripts/bake-tear/glace.mts) : le sachet est pris dans un
   * bloc de glace ; 3 coups : les fêlures du 1er puis du 2e apparaissent (CRACK), le film gelé blanchit (FROST), le 3e fait
   * tout éclater (éclats cuits, une variante par point d'impact : celle du 1er coup). Un lecteur par variante (`icePlayers`),
   * deux mailles (glace, film gelé) dont la géométrie suit la variante tirée.
   */
  let icing = false;
  const icePlayers: ShatterPlayer[] = [];
  let icePlayer: ShatterPlayer | null = null;
  let iceMesh: Mesh | null = null;
  let iceFilm: Mesh | null = null;
  let iceMats: { ice: Material; film: Material[] } | null = null;
  let iceWarm = false;
  let iceTaps = 0;
  /** prochain coup de l'ouverture automatique (performance.now) */
  let iceNextAuto = 0;
  /** horloge des éclats (s) depuis le 3e coup ; < 0 : pas encore */
  const ICE = { t: -1 };
  const CRACK = uniform(0);
  const FROST = uniform(0);
  /** dernier appui (px CSS) : le 1er coup choisit la variante dont l'impact est le plus proche */
  let lastDown: { x: number; y: number } | null = null;
  /**
   * (27/11) ÉTOILE DE NOËL « Poussière d'étoile » : le doigt (la baguette) trace sur le sachet ; le long du tracé, le film
   * se change en poussière d'or (dissolution de l'ancienne Brûlure pilotée par la distance au tracé, `starTex`), des
   * paillettes dorées montent puis retombent (les lambeaux de la Déchirure, dorés), des notes de la gamme tintent. Assez
   * de tracé (ETOILE.trace) : tout le sachet se dissout depuis le tracé. Un toucher : l'étoile se trace toute seule.
   */
  let starring = false;
  let starLen = 0;
  let starLast: { x: number; y: number } | null = null;
  let starNoteAt = 0;
  let starSince = 0;
  let starAuto: gsap.core.Tween | null = null;
  const STAR_GOLD = '#ffd36b';
  /** notes du tracé : la gamme du jeu qui monte et redescend (degrés) */
  const STAR_NOTES = [5, 7, 9, 10, 12, 14, 12, 10, 9, 7];
  let starNoteI = 0;
  /** point du tracé lissé (le doigt tremble : la baguette suit avec un léger retard) */
  let starSmooth: { x: number; y: number } | null = null;
  const starA = new Vector3(), starB = new Vector3();
  /**
   * (27/11) FENÊTRE (core/tearBake.ts, scripts/bake-tear/fenetre.mts) : la pile pousse la face avant de l'intérieur, les
   * coins percent, le contour se découpe, la pile sort vers le joueur avec le panneau plaqué dessus. Troisième lecteur
   * (`winPlayer` : sachet troué + panneau), monté et précompilé HORS ouverture comme le Retroussé ; même état du geste
   * (tearTarget / tearProgress / stick-slip / bakePlay / bakeExit), points durs `winWelds`. La pile suit l'avancée
   * enregistrée (`followZ`, en-tête `window`).
   */
  let windowing = false;
  let winPlayer: TearBakePlayer | null = null;
  let winBody: Mesh | null = null;
  let winPanel: Mesh | null = null;
  let winMats: Material[] | null = null;
  let winWarm = false;
  let winHeadWait: (() => void) | null = null;
  let winEv: TearBakeEvent[] = [];
  let winEvI = 0;
  let winWelds: number[] = [0];
  /** avant le premier coin, rien ne laisse voir les cartes : butée tant que la pile n'est pas prête */
  let winGate = 2;
  /** coins et coup sec en attente (un au plus par FENETRE.coup) ; crépitement : part du contour rompue au dernier grain */
  const winQ: TearBakeEvent[] = [];
  let winCoupAt = 0;
  let winCutAt = 0;
  /** avancée de la pile (monde) gardée au lâcher du sachet, ramenée à 0 au rangement (× R.k) */
  let winKeep = 0;
  /** avancée de la pile (unités du sachet) : phase pilotée p → push · p, sortie t → push … out (EASE.glide, outDur) */
  const winZ = (h: TearBakeHeader, f: { p?: number; t?: number }) => {
    const w = h.window;
    if (!w) return 0;
    if (f.t === undefined) return w.push * Math.min(1, Math.max(0, f.p ?? 0));
    return w.push + (w.out - w.push) * EASE.glide(Math.min(1, Math.max(0, f.t / w.outDur)));
  };
  /**
   * (27/11) RETROUSSÉ (core/tearBake.ts, scripts/bake-tear/retrousse.mts) : le doigt descend, la soudure du haut cède,
   * le film se retourne le long d'un pli roulé qui descend ; cartes debout. Second lecteur (`rollPlayer`), monté et
   * précompilé HORS ouverture ; tant qu'il ne l'est pas, openStyleOf rend la Déchirure. Il réutilise l'état du geste de
   * la Déchirure (tearTarget / tearProgress / stick-slip / bakePlay / bakeExit), avec ses propres points durs.
   */
  let rolling = false;
  let rollPlayer: TearBakePlayer | null = null;
  let rollBody: Mesh | null = null;
  /**
   * (27/11) matériaux des mailles cuites (Déchirure : corps, bande ; Retroussé), construits au PREMIER montage puis
   * gardés et réutilisés à chaque remontage : une famille libérée puis reprise n'ajoute ni matériau, ni nœud de texture
   * (tearNodes / tearSwaps : ceux-ci restent à jour par applyTearArt, prêts pour le remontage). Libérés avec la scène.
   */
  let bakedMats: { body: Material[]; strip: Material[] } | null = null;
  let rollMats: Material[] | null = null;
  /** (27/11) suite de onRolled en attente : la tête de lecture doit d'abord rejoindre la fin de la phase pilotée */
  let rollHeadWait: (() => void) | null = null;
  /** événements de la variante tirée (phase pilotée, triés par p) ; prochain à franchir par la tête de lecture */
  let rollEv: TearBakeEvent[] = [];
  let rollEvI = 0;
  /** points durs du stick-slip (rollWeldsOf) */
  let rollWelds: number[] = [0];
  /**
   * (27/11) le film retroussé DÉCOUVRE les cartes pendant le geste (la Déchirure, elle, les garde cachées jusqu'au
   * relais) : tant que la pile n'est pas dans la scène (`prepared`), la course s'arrête à `rollGate` — la charnière
   * reste au-dessus du haut des cartes, on ne voit jamais un sachet vide. 2 = pas de butée.
   */
  let rollGate = 2;
  let rollPileReady = true;
  /** claquements en attente (crans franchis dans la même image) : un au plus par RETROUSSE.coup */
  const rollQ: TearBakeEvent[] = [];
  let rollCoupAt = 0;
  /** dernier cran latéral qui a vibré (son partenaire de paire ne vibre pas : une vibration par paire) */
  let rollSidePrev: TearBakeEvent | null = null;
  /** y le plus bas du film retourné à p = 1 (unités du sachet), par variante */
  const rollLow = new WeakMap<TearBake, number>();
  let rollYmin = -PACK.h / 2;
  /**
   * `k` 0..1 : remontée de la scène pendant la course (cadrage : le film retourné pend sous le sachet) ; `s` 0..1 : les
   * cartes gardent l'échelle du sachet après que la main l'a lâché (B.follow → 0 dès RETROUSSE.lache, avant la chute),
   * jusqu'au rangement — sinon elles grandiraient d'un coup dans le sachet retroussé
   */
  const R = { k: 0, s: 0 };
  /** famille de cuissons suivie (celle du choix du joueur) ; familles à libérer au retour en vitrine */
  let bakeFam: SceneFam = 'tear';
  const toRelease = new Set<SceneFam>();
  /** lecteur de la Déchirure en cours de précompilation tardive (pas joué pendant ce temps) */
  let warmingTear = false;
  /** le Retroussé est arrivé à temps pour le préchauffage du montage (prêt à sa fin) */
  let rollWarm = false;
  /** libère les familles de cuissons quittées (posée au montage ; ne fait rien pendant une ouverture) */
  let releaseFamilies = () => {};
  /** position de la pile dans le booster qu'elle suit (vitrine : 12 cm derrière ; ouverture : DEDANS) */
  let followZ = -PACK_OPEN_Z;
  const yTear = (TEAR_V - 0.5) * PACK.h;
  const NSH = 110;
  const sh = Array.from({ length: NSH }, () => ({ p: new Vector3(), v: new Vector3(), r: new Vector3(), w: new Vector3(), life: 0, s: 1 }));
  let shI = 0;
  const tmpO = new Object3D();

  // pose du booster et état global (animés par gsap)
  // follow : 1 = la pile de cartes est DANS le booster et suit exactement sa pose (sinon on la voit glisser derrière
  // les trous de la brûlure quand on incline le booster — retour testeurs sur 005), 0 = pile libre au centre
  const B = { y: 0, z: 0, spin: 0, s: 1, burn: -0.25, leak: 0, show: 1, follow: 0 };
  const S = { flash: 0, ca: 0, dark: 0, push: 0, glow: 0, trem: 0, bt: 99, flare: 0, shock: 0, invert: 0 };
  const U = {
    burn: uniform(-0.25),
    leak: uniform(0),
    ember: uniform(new Color('#e8e2d6')),
    flash: uniform(0),
    ca: uniform(0),
    dark: uniform(0),
    glow: uniform(0),
    glowColor: uniform(new Color('#ffffff')),
    bt: uniform(99),
    count: uniform(0),
    colA: uniform(new Color('#ffffff')),
    colB: uniform(new Color('#ffffff')),
    origin: uniform(new Vector3()),
    center: uniform(new Vector2(0.5, 0.5)),
    flare: uniform(0),
    shock: uniform(0),
    invert: uniform(0),
    soon: uniform(0),
    /** poussières lumineuses de la vitrine (0 pendant l'ouverture) */
    dust: uniform(0),
    /** ambiance « Éclipse » : présence du ciel (0..1), onde sur le lac (0 → 1, 1 = éteinte), rayon du soleil noir (hauteurs d'écran) */
    ecl: uniform(0),
    eclRip: uniform(1),
    eclR: uniform(0.15),
  };
  /** ambiance « Éclipse » : valeurs animées (aura du sachet fermé, assombrissement, ciel, onde) — voir eclipseBegin */
  const E = { aura: 0, dark: 0, sky: 0, rip: 1 };
  let eclipse = false;
  let eclRisen = false;
  let eclMesh: Mesh | null = null;
  const eclAura = new Color(ECL.aura);
  let soonT = 0;
  /**
   * (retours live 02 ; depuis le 12/11 : réglage « réduire les animations » de l'appareil seulement) : aura / halo, éclair plein écran, aberration,
   * flare, secousses de caméra et particules baissés à l'ouverture (les règles et le plein écran 6★ restent).
   */
  let fxLow = false;
  const FXK = { glow: 0.45, flash: 0.35, shake: 0.3, parts: 0.35, flare: 0.5 };
  const fxk = (k: keyof typeof FXK) => (fxLow ? FXK[k] : 1);

  // ───────────────────────────────────────────── ambiance « Éclipse » (Berserk 5★ / 6★)
  /**
   * Début d'un booster. Avec une carte de l'Éclipse : TEMPS 1 — une fois le sachet posé, sa fuite de lumière et son halo
   * virent lentement au cramoisi et la scène s'assombrit (spoil assumé, décision de Tom du 10/11). Sans : tout ce qui
   * restait d'une Éclipse précédente s'efface.
   * (11/11) Gros booster ×5 / ×10 : chaque MORCEAU (5 cartes, `continued`, sans sachet) qui contient une carte de
   * l'Éclipse la déclenche à son tour — temps 1 condensé pendant que ses cartes montent (pénombre, horizon qui rougeoit,
   * ECLIPSE.suite), puis le lever. Avant : le ciel montait d'un coup, sans annonce, et seul le sachet du 1er morceau
   * (les 5 cartes les moins rares de la série) pouvait virer au cramoisi. Un morceau qui suit un morceau déjà en Éclipse
   * garde le ciel levé (pas de 2e coucher-lever).
   */
  function eclipseBegin(on: boolean, continued: boolean) {
    const wasUp = eclipse && E.sky > 0.5;
    gsap.killTweensOf(E);
    eclipse = on;
    eclRisen = false;
    if (!on) {
      gsap.to(E, { aura: 0, dark: 0, sky: 0, duration: ECLIPSE.coucher, ease: EASE.glide });
      return;
    }
    U.ember.value.set(ECL.ember);
    if (continued) {
      // le lever est lancé par le temps 1 condensé (la boucle n'y touche pas tant que eclRisen est vrai)
      eclRisen = true;
      if (wasUp && !fxLow) return eclipseRise();
      gsap.to(E, { aura: 0, dark: ECL.dark.sealed, sky: fxLow ? 0 : ECL.dusk, duration: ECLIPSE.suite, ease: EASE.glide, onComplete: eclipseRise });
      return;
    }
    gsap.to(E, { sky: 0, duration: ECLIPSE.coucher, ease: EASE.glide });
    gsap.to(E, { aura: 1, dark: ECL.dark.sealed, duration: ECLIPSE.teinte, delay: DUR.dramatique / 1000, ease: EASE.glide });
  }
  /** TEMPS 2 — sachet descellé : le halo s'éteint, le soleil noir et le lac montent lentement (effets réduits : seulement la pénombre). */
  function eclipseRise() {
    eclRisen = true;
    gsap.killTweensOf(E);
    gsap.to(E, { aura: 0, duration: ECLIPSE.coucher, ease: EASE.glide });
    gsap.to(E, { dark: fxLow ? ECL.dark.low : ECL.dark.open, sky: fxLow ? 0 : 1, duration: ECLIPSE.lever, ease: EASE.glide });
  }
  /** une carte vient de se poser face visible : un cercle court sur le lac */
  function eclipseRipple() {
    if (!eclipse || fxLow) return;
    gsap.killTweensOf(E, 'rip');
    gsap.fromTo(E, { rip: 0 }, { rip: 1, duration: ECLIPSE.onde, ease: EASE.glide });
  }
  function eclipseReset() {
    gsap.killTweensOf(E);
    eclipse = eclRisen = false;
    Object.assign(E, { aura: 0, dark: 0, sky: 0, rip: 1 });
  }

  // ───────────────────────────────────────────── booster
  /**
   * Mobile : le bruit fractal de la brûlure (4 octaves de Perlin 3D évaluées pour CHAQUE pixel du booster, à chaque
   * image, même en vitrine) est cuit une fois dans une petite texture flottante 16 bits — même allure, coût d'une
   * lecture de texture. Coordonnées = position locale (pas les UV) : les trous de la face et du dos restent alignés.
   */
  function bakedBurnNoise(): DataTexture {
    // (audit 12/11, S06 / E2-01) UNE texture pour toute la scène, valeurs calculées dans un worker (22 ms sur PC au
    // profil, à chaque appel) : créée vide ici, remplie par `burnNoiseReady`, que le montage attend avant sa 1re image
    if (burnTex) return burnTex;
    const W = BURN_W, H = BURN_H;
    const data = new Uint16Array(W * H);
    const t = new DataTexture(data, W, H, RedFormat, HalfFloatType);
    t.magFilter = t.minFilter = LinearFilter;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    burnTex = t;
    void burnNoiseReady();
    return t;
  }
  let burnTex: DataTexture | null = null;
  let burnP: Promise<void> | null = null;
  const BURN_W = 256, BURN_H = Math.round((256 * PACK.h) / PACK.w);
  /** valeurs du bruit de brûlure demandées (une fois) ; résolue quand la texture, si elle existe, est remplie */
  function burnNoiseReady(): Promise<void> {
    return (burnP ??= burnNoise(BURN_W, BURN_H, PACK.w, PACK.h).then((v) => {
      const fill = () => {
        if (!burnTex) return;
        const d = burnTex.image.data as Uint16Array;
        for (let i = 0; i < d.length; i++) d[i] = DataUtils.toHalfFloat(v[i]);
        burnTex.needsUpdate = true;
      };
      fill();
    }));
  }

  /**
   * Matériaux du grand booster. `o.swaps` : jumeau de la roue (liste de textures à lui, ni `packNodes` ni `U.soon`) ;
   * `o.shade` : luminosité (pochettes qui partent sur les côtés du tambour). Même graphe que le grand booster → mêmes
   * pipelines (aucune compilation de plus).
   */
  /**
   * (27/11) Étoile de Noël : distance au tracé du doigt, en grille (STAR_W × STAR_H sur le sachet), octet = distance /
   * STAR_RANGE × 255, mise à jour au processeur à chaque point tracé (starStamp)
   */
  const STAR_W = 48, STAR_H = Math.round((48 * PACK.h) / PACK.w), STAR_RANGE = 0.5;
  const starBuf = new Uint8Array(STAR_W * STAR_H).fill(255);
  const starTex = new DataTexture(starBuf, STAR_W, STAR_H, RedFormat, UnsignedByteType);
  starTex.magFilter = starTex.minFilter = LinearFilter;
  starTex.needsUpdate = true;
  const STARON = uniform(0);
  function buildPackMaterials(art: PackArt, o: { swaps?: ArtSwap[]; soon?: N; shade?: N } = {}) {
    const sw = o.swaps ?? packSwaps;
    const soonN = o.soon ?? (U.soon as unknown as N);
    const shadeN = o.shade ?? (bigShade as unknown as N);
    const uvn = uv();
    const front = texture(art.front, uvn);
    const back = texture(art.back, uvn);
    const masks = texture(art.masks, uvn);
    // (07/11 soir) normales des plis en flottants (core/pack.ts) : plus de paliers du bumpMap 8 bits
    // (07/11) face avant : plis + nom du pack thermoformé (core/packLabel.ts) ; le dos garde les plis seuls
    const nF = art.frontNormal ? texture(art.frontNormal, uvn) : art.creaseNormal ? texture(art.creaseNormal, uvn) : undefined;
    const nB = art.creaseNormal ? texture(art.creaseNormal, uvn.mul(vec2(-1, 1)).add(vec2(1, 0))) : undefined;
    if (!o.swaps) packNodes = { front, back, masks } as unknown as Record<string, { value: Texture }>;
    track(sw, front, (a) => a.front);
    track(sw, back, (a) => a.back);
    track(sw, masks, (a) => a.masks);
    if (nF) track(sw, nF, (a) => a.frontNormal ?? a.creaseNormal);
    if (nB) track(sw, nB, (a) => a.creaseNormal);
    const pp = positionLocal.xy;
    const fbm =
      ctx.quality === 'mobile'
        ? texture(ctx.bag.add(bakedBurnNoise()), pp.div(vec2(PACK.w, PACK.h)).add(0.5)).r
        : mx_fractal_noise_float(vec3(pp.mul(4), 0.4), 4);
    // (27/11) Étoile de Noël : le champ de la dissolution n'est plus « depuis le centre » mais la distance au TRACÉ du
    // doigt (texture STAR_TEX, unités du sachet × STAR_RANGE) ; l'ancienne Brûlure, sinon (STARON = 0, jamais jouée)
    const starD = texture(starTex, pp.div(vec2(PACK.w, PACK.h)).add(0.5)).r.mul(STAR_RANGE).add(fbm.mul(0.025)).add(mx_fractal_noise_float(vec3(pp.mul(95), 3)).mul(0.014));
    const field = select(STARON.greaterThan(0.5), starD, length(pp.mul(vec2(1, 0.8))).add(fbm.mul(0.2)));
    const burnFront = field.sub(U.burn);
    const make = (col: N, side: 0 | 1) => {
      // (27/11, V3) sachet « Autocollant » : MATIÈRE ALLÉGÉE du labo 047 (core/packSticker.ts inkSurface) — encre et
      // autocollants mats ou satinés, l'alu en réserve (soudures, cartouche du nom) ; 3 lectures de texture, un seul
      // reflet (plus de vernis, de grain du film ni de relief par dérivées)
      const m = new MeshStandardNodeMaterial({ side: DoubleSide });
      const S = inkSurface(masks, uvn, side, side === 0 ? nF : nB);
      // booster « bientôt » : couleurs en partie éteintes (uniforme : aucun recompilage quand on change de booster)
      const base = mix(col.rgb, vec3(luminance(col.rgb)).mul(0.82), soonN.mul(0.7));
      // (Étoile : le bord ne charbonne pas, il se dore)
      m.colorNode = S.tint(mix(base, select(STARON.greaterThan(0.5), color('#f4c95d'), color('#0d0907')), smoothstep(0.06, 0.004, burnFront)).mul(shadeN));
      m.metalnessNode = S.metal;
      m.roughnessNode = S.rough;
      m.normalNode = S.normal;
      m.envNode = foilEnvNode();
      m.maskNode = burnFront.greaterThan(0);
      // (Étoile : halo plus serré — un liseré de poussière dorée, pas une braise)
      const ember = exp(burnFront.max(0).mul(-160)).mul(4).add(exp(burnFront.max(0).mul(-30)).mul(select(STARON.greaterThan(0.5), float(0.08), float(0.3)))).mul(step(-0.2, U.burn));
      // fuite de lumière : la ligne de déchirure et les soudures luisent de la couleur de la meilleure carte
      // (27/11, retour de Hugo) l'Étoile de Noël joue CE sachet : pas de ligne de déchirure allumée (repère de la Déchirure)
      const seam = masks.b.mul(1.4).mul(STARON.oneMinus()).add(S.crans.mul(0.35));
      m.emissiveNode = (U.ember as unknown as N).mul(ember.add(seam.add(leakPrint(col, pp)).mul(U.leak)));
      const lift = creaseLift(sw, art, side);
      m.positionNode = (lift ? positionLocal.add(lift) : positionLocal).add(normalLocal.mul(smoothstep(0.05, 0.0, burnFront).mul(0.03)));
      return m;
    };
    return [make(front, 0), make(back, 1)];
  }

  /**
   * (27/11, V3) visuel d'un booster : son sachet « Autocollant », variante B (core/packSticker.ts), dans la langue du
   * joueur ; le booster du moment prend le gabarit `moment` aux couleurs du thème de l'événement. Repli (clé sans
   * sachet) : l'ancien sachet simple.
   */
  async function boosterArt(k: string, st: PackStyle): Promise<PackArt> {
    const a = await gameSachetArt(k, lang() === 'en' ? 'en' : 'fr', k === EVENT_KEY ? eventWant : null);
    return a ?? generatePackArt(st, { releaseSources: true });
  }

  /** génère le visuel d'un booster puis le pose s'il était attendu (file de fond, booster du moment) */
  async function genArt(k: string) {
    const st = styles[k];
    if (!st || !ctx || genBusy.has(k)) return;
    genBusy.add(k);
    try {
      const a = ctx.bag.add(await boosterArt(k, st));
      if (styles[k] !== st) return; // (booster du moment changé ou retiré pendant la génération)
      arts.set(k, a);
      // la roue en réduit les toiles tout de suite : elles sont vidées à l'envoi des grandes textures au GPU
      // (13/11) le booster du moment aussi : il a sa pochette dans la roue (shop.ts syncEventSleeve)
      wheel3d?.prepare(k);
      api.onThumb?.(k);
      if (wantKey === k) {
        wantKey = null;
        if (phase === 'display') setBooster(k, true, wantDir);
        else if (pack && packKeyOf(pack) === k) {
          // booster ouvert avant que son visuel ne soit prêt : on le pose dès qu'il l'est
          boosterKey = k;
          applyBoosterArt(k);
          if (style !== 'idle') applyTearArt(k);
        }
      }
    } finally {
      genBusy.delete(k);
    }
  }

  /** (11/11) pose ou retire le style du booster du moment ; son visuel suit (file de fond, ou tout de suite après) */
  function applyEventStyle() {
    if (!eventWant) {
      delete styles[EVENT_KEY];
      return;
    }
    const prev = styles[EVENT_KEY];
    styles[EVENT_KEY] = eventBoosterStyle(eventWant);
    accents.set(EVENT_KEY, new Color(eventWant.accent));
    // nouveau visuel (autre événement) : l'ancien n'est plus proposé, ni sa vignette ; s'il est affiché, il le reste
    if (prev && boosterKey !== EVENT_KEY) {
      arts.delete(EVENT_KEY);
      wheel3d?.forget(EVENT_KEY);
      for (const [ck, u] of thumbCache) if (ck.startsWith(`${EVENT_KEY}|`)) (u && URL.revokeObjectURL(u), thumbCache.delete(ck));
    }
    if (artsLoopDone && !arts.has(EVENT_KEY)) void genArt(EVENT_KEY);
  }

  function applyBoosterArt(k: string) {
    const a = arts.get(k);
    if (!a) return;
    applySwaps(packSwaps, a);
  }

  /**
   * 003 — lumière qui traverse l'impression claire du booster (les encres sombres la bloquent, le logo s'allume) :
   * luminance² × chute depuis le centre × léger scintillement.
   */
  const leakPrint = (col: N, p: N): N => {
    const lum = luminance(col.rgb);
    const fall = exp(length(p.mul(vec2(1.2, 0.9))).mul(-2.6));
    const flick = sin(time.mul(7.3).add(p.y.mul(9))).mul(0.08).add(0.92);
    // soudures latérales et lignes de scellage : la lumière s'échappe par les bords du sachet
    const u = uv();
    const d = min(min(u.x, u.x.oneMinus()), min(u.y, u.y.oneMinus()).mul(1.6));
    const rim = exp(d.mul(-38)).mul(1.6);
    return lum.mul(lum).mul(fall).mul(flick).mul(2.4).add(rim);
  };

  /**
   * Bord de déchirure, en coordonnée horizontale GÉOMÉTRIQUE (pas l'UV : au dos les UV sont en miroir, la face et le
   * dos ne se déchiraient pas au même endroit) : grandes ondulations + dents de scie aléatoires (interpolation
   * linéaire de hauteurs tirées au hasard tous les ~5 mm) = plastique qui casse par à-coups.
   */
  const tearEdge = (ug: N): N => {
    const f = ug.mul(150);
    const i0 = floor(f);
    const teeth = mix(hash(i0), hash(i0.add(1)), fract(f)).sub(0.5).mul(0.0075);
    const wave = sin(ug.mul(23)).mul(0.004).add(sin(ug.mul(61).add(1.3)).mul(0.0025));
    return float(TEAR_V).add(teeth).add(wave);
  };

  function buildTearMaterials(art: PackArt, part: 'body' | 'strip', baked = false) {
    const uvn = uv();
    const front = texture(art.front, uvn);
    const back = texture(art.back, uvn);
    const masks = texture(art.masks, uvn);
    tearNodes.push({ front, back, masks } as unknown as Record<'front' | 'back' | 'masks', { value: Texture }>);
    // (07/11 soir) normales des plis en flottants (core/pack.ts) : plus de paliers du bumpMap 8 bits ; face avant : + nom moulé
    const nF = art.frontNormal ? texture(art.frontNormal, uvn) : art.creaseNormal ? texture(art.creaseNormal, uvn) : undefined;
    const nB = art.creaseNormal ? texture(art.creaseNormal, uvn.mul(vec2(-1, 1)).add(vec2(1, 0))) : undefined;
    if (nF) track(tearSwaps, nF, (a) => a.frontNormal ?? a.creaseNormal);
    if (nB) track(tearSwaps, nB, (a) => a.creaseNormal);
    // (enregistrement simulé : la géométrie bouge, la coordonnée de repos vient d'un attribut)
    const ug = baked ? (attribute('aug', 'float') as unknown as N) : positionLocal.x.div(PACK.w).add(0.5);
    const v = uvn.y;
    const edge = tearEdge(ug);
    const tornCol = smoothstep(0.0, 0.012, TP.sub(ug));
    // plastique étiré : blanchit le long de la coupe, plus large juste derrière le front de déchirure
    const front0 = smoothstep(0.12, 0.0, TP.sub(ug)).mul(tornCol);
    const whiten = smoothstep(float(0.006).add(front0.mul(0.012)), 0.0, abs(v.sub(edge))).mul(tornCol);
    const make = (col: N, side: 0 | 1) => {
      // (27/11, V3) l'extérieur : la surface du sachet « Autocollant » (inkSurface, comme le sachet scellé) ; l'intérieur
      // (face arrière) reste métal brut plus mat, la coupe blanchit (film étiré)
      const m = new MeshStandardNodeMaterial({ side: DoubleSide });
      const S = inkSurface(masks, uvn, side, side === 0 ? nF : nB);
      const out = select(frontFacing, S.tint(col.rgb), (tearInner as unknown as N).mul(PLASTIC_TINT));
      m.colorNode = mix(out, color(0.94, 0.93, 0.91).mul(PLASTIC_TINT), whiten.mul(0.85));
      m.normalNode = S.normal;
      m.envNode = foilEnvNode();
      m.metalnessNode = select(frontFacing, S.metal, float(1)).mul(whiten.oneMinus());
      m.roughnessNode = select(frontFacing, S.rough, float(0.3)).add(whiten.mul(0.4));
      // fuite de lumière (003) : soudures + impression claire, de la couleur de la meilleure carte
      // (S3) fente de lumière rasante : passé ~35 % (TSLIT), la lumière de l'intérieur filtre par la coupe déjà ouverte —
      // un filet sur la tranche, et la face intérieure des lèvres éclairée en rasant près de la coupe (elle se voit quand
      // la bande s'enroule vers nous). Même teinte neutre que la fuite (anti-spoil), aucun halo autour du sachet.
      const dv = abs(v.sub(edge));
      const rimL = smoothstep(0.005, 0.0, dv);
      const slit = select(frontFacing, rimL.mul(0.5), smoothstep(0.05, 0.0, dv).pow(2).mul(0.9).add(rimL)).mul(tornCol).mul(TSLIT);
      m.emissiveNode = (U.ember as unknown as N).mul(masks.b.mul(1.4).add(S.crans.mul(0.35)).add(leakPrint(col, positionLocal.xy)).mul(U.leak).mul(whiten.oneMinus()).add(slit));
      // même relief des plis que le booster entier (sa carte de hauteur), sinon la coupe ne raccorde pas
      const crLift = creaseLift(tearSwaps, art, side);
      if (baked) {
        // positions et normales écrites par TearBakePlayer ; le relief des plis du booster s'ajoute selon la normale
        m.maskNode = part === 'body' ? v.lessThan(edge) : v.greaterThanEqual(edge);
        if (crLift) m.positionNode = positionLocal.add(normalLocal.mul(side === 0 ? crLift.z : crLift.z.negate()));
      } else if (part === 'body') {
        m.maskNode = v.lessThan(edge);
        if (crLift) m.positionNode = positionLocal.add(crLift);
      } else {
        m.maskNode = v.greaterThanEqual(edge);
        // la bande se décolle colonne par colonne derrière le front, s'enroule vers nous (plus fort vers le haut) et
        // se soulève près du front (on la tire), puis s'envole
        const behind = TP.sub(ug).max(0);
        const t = tclamp(behind.div(0.24), 0, 1);
        const dy = positionLocal.y.sub(yTear);
        const k = dy.div(PACK.h / 2 - yTear).clamp(0, 1);
        const a = t.pow(1.2).mul(1.9).mul(k.mul(0.7).add(0.45)).add(TFLY.mul(1.6));
        const lift = t.mul(behind).mul(PACK.w * 0.16);
        const pz = crLift ? positionLocal.z.add(crLift.z) : positionLocal.z;
        const y2 = float(yTear).add(dy.mul(cos(a))).sub(pz.mul(sin(a))).add(lift);
        const z2 = pz.mul(cos(a)).add(dy.mul(sin(a)));
        m.positionNode = vec3(positionLocal.x.sub(t.mul(0.012)), y2, z2);
      }
      return m;
    };
    return [make(front, 0), make(back, 1)];
  }

  /**
   * (27/11) Matériaux du RETROUSSÉ (lecteur cuit, une maille à deux groupes : face avant, dos). Extérieur : le même
   * aluminium que le sachet (même surface, mêmes textures, enregistrées dans tearNodes / tearSwaps : elles suivent le
   * visuel du booster, applyTearArt). Envers (face intérieure du film, `frontFacing` faux : l'enroulement des triangles
   * de chaque nappe est tourné vers l'extérieur, comme la Déchirure) : le côté MAT du film aluminium — métal satiné
   * (ROLL_INNER : un large reflet doux du studio, le relief des plis et du nom moulé s'y lit à l'envers), sans vernis ni
   * émission. Ni masque, ni blanchiment, ni fente de lumière.
   */
  const ROLL_INNER = { tint: 0.9, metal: 1, rough: 0.6 };
  /**
   * (27/11) Fenêtre : la fente de lumière (0..1) d'un point du film à ses coordonnées de REPOS (uv) — bande de ±2 mm
   * autour du contour de la pile, ouverte depuis chaque coin jusqu'à WCUT (abscisse le long du bord : 0 au coin, 1 au
   * milieu), plus forte au coin qui vient de percer. Face avant seulement (les uv du dos sont retournées).
   */
  function winSlit(uvn: N): N {
    const hw = PACK_STACK.hw, hh = PACK_STACK.hh;
    const px = uvn.x.sub(0.5).mul(PACK.w), py = uvn.y.sub(0.5).mul(PACK.h).sub(PACK_STACK.cy);
    const dx = px.abs().sub(hw), dy = py.abs().sub(hh);
    const band = float(1).sub(smoothstep(0.0005, 0.0025, max(dx, dy).abs()));
    // abscisse le long du bord le plus proche : 0 au coin, 1 au milieu du bord
    const s = tclamp(select(dx.greaterThan(dy), dy.negate().div(hh), dx.negate().div(hw)), 0, 1);
    const open = smoothstep(WCUT.add(0.03), WCUT.sub(0.03), s);
    const corner = float(1).sub(smoothstep(0, 0.12, s)).mul(0.6);
    return band.mul(open.mul(float(1).add(corner))).mul(WSLIT);
  }
  /**
   * (27/11) `win` : la Fenêtre (fente de lumière le long du contour) ; `frost` : la Déchirure glacée (le sachet gelé se
   * couvre de givre, FROST : cristaux blancs bleutés, surface mate)
   */
  /**
   * (27/11, session Fable) la GLACE du bloc (Déchirure glacée), refaite d'après docs/chantiers/ouvertures.md
   * « Recherche » — sans transmission de three.js (une passe plein écran de plus) : derrière la glace il n'y a que le
   * sachet et le fond, la glace LIT donc elle-même le visuel du sachet.
   *  - RÉFRACTION : uv du sachet décalées selon la pente de chaque facette (indice 1,31) × la glace traversée — le
   *    visuel se brise d'une facette à l'autre ; hors du sachet : le fond sombre ;
   *  - ÉPAISSEUR (forme du bloc, calculée : boîte arrondie de glace.mts) → absorption de Beer-Lambert (le rouge part
   *    d'abord : la glace épaisse bleuit), voile laiteux et bulles en deux couches de parallaxe, givre du pourtour ;
   *  - faces de cassure (attribut `lvl` ≤ CRACK) : des plans qui accrochent la lumière selon leur orientation ;
   *  - en vol (ICE_FLY → 1) : les éclats ne portent plus l'image du sachet, glace claire à bords vifs.
   * Le sachet gelé n'est PAS dessiné au repos (la glace le montre, givre FROST compris) : une couche de moins.
   */
  const ICE_FLY = uniform(0);
  const ICE_BLOCK = { bx: PACK.w / 2 + 0.08, by: PACK.h / 2 + 0.08, bz: 0.085, r: 0.16 };
  function buildIceMaterial(art: PackArt): Material {
    const m = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false });
    const uvr = uv();
    const front = texture(art.front, uvr);
    tearNodes.push({ front, back: texture(art.back, uvr), masks: texture(art.masks, uvr) } as unknown as Record<'front' | 'back' | 'masks', { value: Texture }>);
    const lvl = attribute('lvl', 'float') as unknown as N;
    const crack = lvl.greaterThan(0.5);
    const shown = step(lvl, CRACK.add(0.001));
    const px = uvr.x.sub(0.5).mul(PACK.w), py = uvr.y.sub(0.5).mul(PACK.h);
    // épaisseur 0..1 (1 au cœur, 0 au bord du galet)
    const dd = tclamp(length(vec2(px.abs().sub(ICE_BLOCK.bx - ICE_BLOCK.r).max(0), py.abs().sub(ICE_BLOCK.by - ICE_BLOCK.r).max(0))).div(ICE_BLOCK.r), 0, 1);
    const thick = float(1).sub(dd.mul(dd)).max(0).pow(0.5);
    const rim = float(1).sub(thick);
    // pente de la facette + ondulation de la surface (glace fondue puis regelée : jamais plane)
    const wave = vec2(mx_fractal_noise_float(vec3(uvr.mul(vec2(5, 7.5)), 11)), mx_fractal_noise_float(vec3(uvr.mul(vec2(5, 7.5)), 23))).mul(0.34);
    const slope = normalLocal.xy.div(normalLocal.z.abs().max(0.2)).add(wave);
    // réfraction du sachet (décalage accentué ×3 : à 8 mm de glace le vrai décalage ne se lirait pas au téléphone)
    const K = 0.24 * ICE_BLOCK.bz * 3;
    const uvS = uvr.sub(slope.mul(vec2(K / PACK.w, K / PACK.h)).mul(thick));
    const inS = smoothstep(0, 0.012, min(min(uvS.x, float(1).sub(uvS.x)), min(uvS.y, float(1).sub(uvS.y))));
    let sachet: N = (front as unknown as N).sample(uvS).rgb;
    // givre sur le sachet gelé (FROST) : cristaux épars, plus dense vers ses bords
    const edgeS = float(1).sub(smoothstep(0, 0.16, min(min(uvS.x, float(1).sub(uvS.x)), min(uvS.y, float(1).sub(uvS.y)).mul(1.5))));
    const specks = smoothstep(0.72, 0.9, mx_fractal_noise_float(vec3(uvS.mul(vec2(150, 225)), 0.5)).add(0.5));
    sachet = mix(sachet, vec3(0.86, 0.93, 1), tclamp(FROST.mul(FROST).mul(specks.mul(0.8).add(edgeS.mul(0.6)).add(0.05)), 0, 1));
    const absorb = exp(vec3(0.62, 0.22, 0.09).mul(thick).negate());
    const behind = mix(vec3(0.015, 0.025, 0.045), sachet, inS).mul(absorb);
    // intérieur : voile laiteux et deux couches de bulles, décalées selon la pente (parallaxe : elles vivent à l'inclinaison)
    const veil = smoothstep(0.25, 0.9, mx_fractal_noise_float(vec3(uvr.mul(7).add(slope.mul(0.25)), 2)).add(0.5));
    const bub = smoothstep(0.95, 0.99, mx_fractal_noise_float(vec3(uvr.mul(vec2(70, 105)).add(slope.mul(0.8)), 5)).add(0.5))
      .add(smoothstep(0.94, 0.985, mx_fractal_noise_float(vec3(uvr.mul(vec2(34, 51)).add(slope.mul(1.7)), 9)).add(0.5)).mul(0.6));
    const fres = float(1).sub(normalLocal.z.abs()).pow(3);
    const milk = vec3(0.66, 0.82, 0.96).mul(float(0.06).add(veil.mul(thick).mul(0.16)).add(rim.mul(rim).mul(0.55)));
    const rest = behind.add(milk).add(vec3(0.9, 0.96, 1).mul(bub.mul(thick).mul(0.45)));
    const fly = vec3(0.7, 0.85, 0.97).mul(float(0.35).add(veil.mul(0.25))).add(vec3(1, 1, 1).mul(fres.mul(0.5).add(bub.mul(0.3))));
    // faces de cassure : éclat selon l'orientation du plan (certaines flashent, d'autres restent sombres)
    const glint = normalLocal.dot(vec3(0.36, 0.48, 0.8)).abs().pow(3);
    m.colorNode = select(crack, vec3(0.88, 0.95, 1), mix(rest, fly, ICE_FLY));
    m.metalnessNode = float(0);
    m.roughnessNode = select(crack, float(0.12), mix(float(0.03), float(0.45), rim.mul(rim)));
    m.envNode = foilEnvNode();
    const aRest = mix(float(0.3).add(rim.mul(0.45)).add(fres.mul(0.3)), float(1), inS);
    const aFly = float(0.36).add(fres.mul(0.5)).add(veil.mul(0.12));
    m.opacityNode = select(crack, shown.mul(float(0.24).add(glint.mul(0.7))), mix(aRest, aFly, ICE_FLY));
    m.emissiveNode = select(crack, vec3(0.5, 0.6, 0.7).mul(shown).mul(glint), vec3(0.01, 0.02, 0.03));
    return m;
  }
  function buildRollMaterials(art: PackArt, opt: { win?: boolean; frost?: boolean } = {}) {
    const { win = false, frost = false } = opt;
    const uvn = uv();
    // givre : cristaux fins (points blancs épars) et un voile qui s'épaissit vers les bords du sachet (soudures, crans)
    const edge = float(1).sub(smoothstep(0, 0.16, min(min(uvn.x, float(1).sub(uvn.x)), min(uvn.y, float(1).sub(uvn.y)).mul(1.5))));
    const specks = smoothstep(0.62, 0.82, mx_fractal_noise_float(vec3(uvn.mul(vec2(150, 225)), 0.5)).add(0.5));
    const frostAmt = frost ? tclamp(FROST.mul(specks.mul(0.75).add(edge.mul(0.55)).add(0.12)), 0, 1) : null;
    const front = texture(art.front, uvn);
    const back = texture(art.back, uvn);
    const masks = texture(art.masks, uvn);
    tearNodes.push({ front, back, masks } as unknown as Record<'front' | 'back' | 'masks', { value: Texture }>);
    const nF = art.frontNormal ? texture(art.frontNormal, uvn) : art.creaseNormal ? texture(art.creaseNormal, uvn) : undefined;
    const nB = art.creaseNormal ? texture(art.creaseNormal, uvn.mul(vec2(-1, 1)).add(vec2(1, 0))) : undefined;
    if (nF) track(tearSwaps, nF, (a) => a.frontNormal ?? a.creaseNormal);
    if (nB) track(tearSwaps, nB, (a) => a.creaseNormal);
    const inner = (tearInner as unknown as N).mul(ROLL_INNER.tint);
    const make = (col: N, side: 0 | 1) => {
      // (27/11, V3) l'extérieur : la surface du sachet « Autocollant » (inkSurface, plus de vernis) ; l'envers : alu mat
      const m = new MeshStandardNodeMaterial({ side: DoubleSide });
      const S = inkSurface(masks, uvn, side, side === 0 ? nF : nB);
      m.colorNode = select(frontFacing, S.tint(col.rgb), inner.mul(PLASTIC_TINT));
      m.normalNode = S.normal;
      m.envNode = foilEnvNode();
      m.metalnessNode = select(frontFacing, S.metal, float(ROLL_INNER.metal));
      m.roughnessNode = select(frontFacing, S.rough, float(ROLL_INNER.rough));
      if (frostAmt) {
        m.colorNode = mix(m.colorNode as N, vec3(0.86, 0.93, 1), frostAmt);
        m.metalnessNode = mix(m.metalnessNode as N, float(0), frostAmt);
        m.roughnessNode = mix(m.roughnessNode as N, float(0.75), frostAmt);
      }
      // fuite de lumière (003) à l'extérieur, comme le sachet scellé ; l'envers n'émet rien
      // (27/11, retour de Hugo) SANS la ligne de déchirure (masks.b) : son filet lumineux est le repère du geste de la
      // Déchirure ; recopié ici, il s'allumait sur le Retroussé, la Fenêtre et le film gelé, qui ne s'ouvrent pas là
      const leak = (U.ember as unknown as N).mul(S.crans.mul(0.35).add(leakPrint(col, positionLocal.xy)).mul(U.leak));
      if (!win || side === 1) m.emissiveNode = select(frontFacing, leak, vec3(0, 0, 0));
      else {
        // (27/11) Fenêtre : la lumière de l'intérieur passe par la découpe (les deux lèvres, l'envers un peu moins)
        const slit = (U.ember as unknown as N).mul(winSlit(uvn).mul(2.2));
        m.emissiveNode = select(frontFacing, leak.add(slit), slit.mul(0.6));
      }
      // positions et normales écrites par TearBakePlayer ; le relief des plis du booster s'ajoute selon la normale
      const crLift = creaseLift(tearSwaps, art, side);
      if (crLift) m.positionNode = positionLocal.add(normalLocal.mul(side === 0 ? crLift.z : crLift.z.negate()));
      return m;
    };
    return [make(front, 0), make(back, 1)];
  }

  function applyTearArt(k: string) {
    const a = arts.get(k);
    if (!a) return;
    for (const n of tearNodes) {
      n.front.value = a.front;
      n.back.value = a.back;
      n.masks.value = a.masks;
    }
    applySwaps(tearSwaps, a);
    (tearInner.value as Color).set(a.tint ?? TEAR_INNER);
  }

  function spawnShreds(u: number, n: number) {
    for (let k = 0; k < n; k++) {
      const q = sh[shI++ % NSH];
      q.p.set((u - 0.5) * PACK.w + (Math.random() - 0.5) * 0.02, yTear + (Math.random() - 0.5) * 0.01, PACK.bulge * 0.5 * (Math.random() > 0.5 ? 1 : -1));
      q.v.set(-0.1 + Math.random() * 0.45, 0.25 + Math.random() * 0.5, 0.15 + Math.random() * 0.5);
      q.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      q.w.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
      q.life = 1.2 + Math.random() * 0.8;
      q.s = 0.4 + Math.random() * 1.1;
    }
  }

  /** son de la déchirure : dernier grain joué (performance.now) et progression accumulée depuis */
  let tearSndAt = 0;
  let tearSndAcc = 0;
  function setTearProgress(p: number) {
    const before = tearProgress;
    tearProgress = p;
    TP.value = p;
    const d = p - before;
    if (d > 0.001) {
      spawnShreds(Math.min(1, p), 2 + Math.floor(d * 40));
      tearShake.impulse(2.4 + d * 30);
      // (retours Hugo 10/11 : « trop de bruit ») un grain discret au plus toutes les 90 ms (avant : un grain à chaque
      // image, empilés, et 2,5× plus fort) ; la progression accumulée entre deux grains règle sa longueur
      tearSndAcc += d;
      const now = performance.now();
      if (now - tearSndAt >= 90 || p >= 1) {
        ctx.sfx.tear(0.06 + Math.min(0.3, tearSndAcc * 0.8), 0.07 + Math.min(0.05, tearSndAcc * 0.3));
        tearSndAt = now;
        tearSndAcc = 0;
      }
      // une impulsion par tranche de 0,08 de progression au plus (audit UX2-14 : c'était une par à-coup, 10 à 20 par booster)
      if (p - hapticTear >= 0.08 || p >= 1) {
        hapticTear = p;
        haptics.pulse(5 + Math.round(d * 60));
      }
    }
    events.onHold?.(Math.min(1, p));
    if (p >= 1 && phase === 'sealed') {
      // (S3) rupture : petite bouffée d'air qui s'échappe du sachet, juste avant la sortie des cartes
      ctx.sfx.sweep(DUR.rapide() / 1000, { tex: 'air', lo: 240, hi: 1100, vol: 0.14, up: true, ease: EASE.glide });
      onTorn();
    }
  }

  /**
   * (lot 07) la soudure lâche (début d'un glissement du stick-slip) : une rafale de déchirure dont la force suit la
   * tension relâchée (plus forte sur un point de soudure), et une micro-vibration sur les points de soudure. `fastK` :
   * geste vif (0..1) — la coupe continue garde ses grains espacés (setTearProgress, 90 ms au plus), pas de rafale.
   */
  function tearCatch(tension: number, weld: boolean, fastK: number) {
    const now = performance.now();
    if (fastK < 0.5 && now - tearSndAt >= 45) {
      ctx.sfx.tear(0.05 + Math.min(0.12, tension * 1.6), weld ? 0.11 : 0.07);
      tearSndAt = now;
      tearSndAcc = 0;
    }
    if (weld && fastK < 0.5) {
      hapticTear = tearProgress;
      haptics.pulse(5);
    }
  }

  function startAutoTear(duration: number) {
    if (phase !== 'sealed' || autoTear) return;
    const o = { v: tearTarget };
    autoTear = gsap.to(o, { v: 1.08, duration, ease: EASE.breathe, onUpdate: () => (tearTarget = Math.max(tearTarget, o.v)) });
  }

  /**
   * (27/11) RETROUSSÉ : progression du geste (0..1), distincte de setTearProgress — ni lambeaux, ni secousse de bande,
   * ni onTorn. L'anneau de la boutique suit (onHold) ; le froissement du film est en grains espacés (RETROUSSE.grain),
   * plus fort quand le doigt va vite. Les claquements (verrou, crans) partent quand la TÊTE DE LECTURE franchit leur p
   * (rollHead, dans la boucle) : calés sur l'image qui casse.
   */
  function setRollProgress(p: number) {
    const before = tearProgress;
    tearProgress = p;
    TP.value = p;
    const d = p - before;
    if (d > 0.001) {
      tearSndAcc += d;
      const now = performance.now();
      if (now - tearSndAt >= RETROUSSE.grain * 1000 || p >= 1) {
        const fast = sstep(TEAR_SPEED.slow, TEAR_SPEED.fast, tearVel);
        ctx.sfx.peel(DUR.instant / 1000 + Math.min(RETROUSSE.grainMax, tearSndAcc * 0.6), 0.035 + 0.05 * fast);
        tearSndAt = now;
        tearSndAcc = 0;
      }
    }
    events.onHold?.(Math.min(1, p));
    if (p >= 1 && phase === 'sealed') onRolled();
  }

  /** (27/11) y le plus bas du film retourné à la fin de la phase pilotée (image nTear − 1), une fois par variante */
  function rollLowOf(b: TearBake | null): number {
    if (!b) return rollYmin;
    let y = rollLow.get(b);
    if (y === undefined) {
      const h = b.header, n = h.verts, o = (h.nTear - 1) * n * 3;
      y = Infinity;
      for (let v = 0; v < n; v++) y = Math.min(y, b.rest[v * 3 + 1] + b.frames[o + v * 3 + 1] * h.q);
      rollLow.set(b, y);
    }
    return y;
  }

  /** (27/11) remontée de la scène à p = 1 (unités de la scène) : le bas du film retourné reste au-dessus de ROLL_KEEP */
  function rollLift() {
    const halfH = Math.tan((stage.camera.fov * Math.PI) / 360) * camBase * (1 - S.push);
    const need = -halfH * ROLL_KEEP - rollYmin * packRig.scale.x;
    return Math.min(ROLL_LIFT_MAX, Math.max(0, need));
  }

  /** (27/11) tête de lecture du Retroussé : franchit les événements de la variante tirée → claquements en file */
  function rollCross(play: number) {
    while (rollEvI < rollEv.length && rollEv[rollEvI].p! <= play) {
      const e = rollEv[rollEvI++];
      // file courte : au-delà d'un double coup en attente, les crans franchis d'un trait (lâcher rapide) se fondent
      if (e.k === 'lock') rollQ.unshift(e);
      else if (rollQ.length < 2) rollQ.push(e);
    }
  }
  /** joue au plus un claquement par RETROUSSE.coup (un double coup gauche / droite = deux de suite) */
  function rollKnock() {
    if (!rollQ.length) return;
    const now = performance.now();
    if (now - rollCoupAt < RETROUSSE.coup * 1000) return;
    rollCoupAt = now;
    const e = rollQ.shift()!;
    const pan = e.x * 0.5;
    if (e.k === 'lock') {
      // le verrou de la soudure du haut : un claquement net, puis le film qui commence à se décoller
      ctx.sfx.seal(0.7, 0.3, 0);
      ctx.sfx.peel(RETROUSSE.verrou, 0.14);
      haptics.pulse(14);
      shake.impulse(1.5);
    } else if (e.k === 'side') {
      // un cran latéral : une soudure qui cède par côté (gauche puis droite), plus grave quand elle cède fort ; une vibration par paire
      // (le second cran d'une paire — même hauteur, autre côté, juste après le premier — ne vibre pas ; un cran seul, si)
      ctx.sfx.seal(1.15 - 0.35 * e.f, 0.18 + 0.17 * e.f, pan);
      const m = rollSidePrev;
      const mate = !!m && m.x !== e.x && Math.abs(m.y - e.y) < 1e-3;
      if (!mate) haptics.pulse(6);
      rollSidePrev = mate ? null : e;
    } else if (e.k === 'top') {
      // paquets de la soudure du haut après le verrou : des claquements à peine audibles
      ctx.sfx.seal(1.3 - 0.3 * e.f, 0.06 + 0.06 * e.f, pan);
    }
  }

  /**
   * (27/11) Sachet retroussé : sortie cuite (le film fini de se retourner, les pinces lâchent), la main lâche le sachet,
   * les cartes se lèvent (même loi que la cuisson : RETROUSSE.levee en RETROUSSE.leve, EASE.glide), se rangent, le
   * sachet retourné part vers le bas ; pile prête — même état final que la Déchirure. Ni éclat, ni bouffée d'air.
   */
  function onRolled() {
    phase = 'busy';
    holding = false;
    autoTear?.kill();
    autoTear = null;
    setRollLock(false);
    shake.impulse(2);
    // claquements encore en route : la tête de lecture saute à la fin
    rollCross(1);
    // la sortie cuite part de l'image nTear : on attend que la tête de lecture (lissée, boucle de rendu) ait rejoint la
    // fin de la phase pilotée, sinon le film sauterait d'un trait au lâcher rapide (tearFling)
    const head = () => new Promise<void>((r) => (rollPlayer && bakePlay < 1 ? (rollHeadWait = r) : r()));
    void (prepared ?? Promise.resolve()).then(head).then(() => {
      if (!pack) return;
      kill();
      const n = order.length;
      tl = gsap.timeline();
      const out = sideline(gsap.timeline());
      bakePlay = 1;
      R.k = 1;
      R.s = 1;
      fly.t = 1;
      if (rollPlayer) {
        const h = rollPlayer.header;
        const T = (h.nExit - 1) / h.exitFps;
        out.fromTo(bakeExit, { t: 0 }, { t: T, duration: T, ease: 'none' }, 0);
        // fin du lâcher (pas une chute) : un léger froissement du film
        const land = h.events?.find((e) => e.k === 'land' && e.t !== undefined);
        if (land) out.call(() => ctx.sfx.peel(DUR.instant / 1000 + RETROUSSE.lacheGrain * land.f, 0.03 + 0.04 * land.f), [], Math.min(T, land.t!));
      }
      out.to(B, { follow: 0, duration: RETROUSSE.lache, ease: EASE.glide }, 0).to(B, { y: -2.6, duration: RETROUSSE.tombe, ease: EASE.heave }, RETROUSSE.chute);
      // les cartes se soulèvent dans le sachet retroussé (même loi que la cuisson), ensemble
      order.forEach((si) => tl!.to(slots[si].p, { y: PACK_STACK.cy + RETROUSSE.levee, duration: RETROUSSE.leve, ease: EASE.glide }, 0));
      const qk = autoQuick() ? 1.6 : 1;
      tl.call(() => {
        const c = sideline(gsap.timeline());
        // la remontée du cadrage se défait pendant le rangement (les cartes vont à leur place, rien ne saute) ; le
        // retour du cadrage (S.push) est porté ici, hors de `tl` : la pile est prête (RETROUSSE.ouvert) avant la fin de
        // ce retour, et une révélation qui tue `tl` le laisserait à mi-course (caméra plus proche pendant la révélation)
        c.to(S, { push: 0, duration: RETROUSSE.pose, ease: EASE.glide }, 0);
        c.to(R, { k: 0, s: 0, duration: RETROUSSE.pose, ease: EASE.settle }, 0);
        order.forEach((si, k) => c.to(slots[si].p, { y: 0, z: -STACK_DZ * (n - 1 - k), s: 1, rz: (k - 2) * 0.012, duration: RETROUSSE.pose, ease: EASE.settle }, k * RETROUSSE.decale));
        c.timeScale(qk);
      }, [], RETROUSSE.range);
      tl.call(() => {
        phase = 'opened';
        events.onOpened?.();
        flushQueued();
      }, [], RETROUSSE.ouvert);
      lightRim(sideline(gsap.timeline()), order[0], RETROUSSE.ouvert / qk);
      tl.timeScale(qk);
      out.timeScale(qk);
    });
  }

  /**
   * (27/11) FENÊTRE : progression du geste (0..1) — l'anneau de la boutique et le relais. Les sons et vibrations
   * suivent la TÊTE DE LECTURE (winCross / winKnock, dans la boucle) : calés sur l'image qui perce.
   */
  function setWinProgress(p: number) {
    tearProgress = p;
    TP.value = p;
    events.onHold?.(Math.min(1, p));
    if (p >= 1 && phase === 'sealed') onWindowed();
  }
  /**
   * (27/11) tête de lecture de la Fenêtre : coins franchis et coup sec final en file (un au plus par FENETRE.coup) ;
   * crépitement des fronts selon la part du contour qui a cédé depuis le grain précédent (en-tête `cut`), en grains
   * espacés d'au moins FENETRE.grain
   */
  function winCross(play: number) {
    while (winEvI < winEv.length && winEv[winEvI].p! <= play) {
      const e = winEv[winEvI++];
      if (winQ.length < 5) winQ.push(e);
    }
    const cut = winPlayer?.header.cut;
    if (!cut?.length) return;
    const f = Math.min(1, play) * (cut.length - 1), i = Math.floor(f), i1 = Math.min(cut.length - 1, i + 1);
    const c = cut[i] + (cut[i1] - cut[i]) * (f - i);
    const d = c - winCutAt;
    if (d < 0.004) return;
    const now = performance.now();
    if (now - tearSndAt < FENETRE.grain * 1000) return;
    ctx.sfx.peel(DUR.instant / 1000 + Math.min(FENETRE.grainMax, d * 1.5), 0.03 + Math.min(0.08, d * 1.2));
    if (d > 0.02) haptics.pulse(4);
    tearSndAt = now;
    winCutAt = c;
  }
  function winKnock() {
    if (!winQ.length) return;
    const now = performance.now();
    if (now - winCoupAt < FENETRE.coup * 1000) return;
    winCoupAt = now;
    const e = winQ.shift()!;
    if (e.k === 'corner') {
      // un coin de carte perce le film : un claquement net, une vibration par coin
      ctx.sfx.seal(0.85 + 0.1 * Math.random(), 0.26, e.x * 0.5);
      haptics.pulse(10);
      shake.impulse(1.2);
    } else if (e.k === 'free') {
      // le dernier lien du contour cède : coup sec
      ctx.sfx.seal(0.6, 0.34, 0);
      ctx.sfx.peel(FENETRE.sec, 0.12);
      haptics.pulse(18);
      shake.impulse(2.2);
    }
  }
  /**
   * (27/11) Fenêtre découpée : sortie cuite (la pile sort vers le joueur, le panneau plaqué dessus puis il glisse et
   * tombe), la main lâche le sachet percé qui tombe, la pile revient à sa place — même état final que la Déchirure. Les
   * cartes gardent leur avancée et l'échelle du sachet après le lâcher (R.k, R.s → 0 au rangement : rien ne saute).
   */
  function onWindowed() {
    phase = 'busy';
    holding = false;
    autoTear?.kill();
    autoTear = null;
    setRollLock(false);
    winCross(1);
    const head = () => new Promise<void>((r) => (winPlayer && bakePlay < 1 ? (winHeadWait = r) : r()));
    void (prepared ?? Promise.resolve()).then(head).then(() => {
      if (!pack) return;
      kill();
      const n = order.length;
      tl = gsap.timeline();
      const out = sideline(gsap.timeline());
      bakePlay = 1;
      fly.t = 1;
      const w = winPlayer?.header.window;
      if (winPlayer) {
        const h = winPlayer.header;
        const T = (h.nExit - 1) / h.exitFps;
        out.fromTo(bakeExit, { t: 0 }, { t: T, duration: T, ease: 'none' }, 0);
        // le panneau quitte la carte : un froissement léger
        if (w) out.call(() => ctx.sfx.peel(FENETRE.grainMax, 0.05), [], w.dropAt);
      }
      // la main lâche le sachet percé : les cartes gardent leur avancée (winKeep) et l'échelle du sachet (R.s)
      out.call(() => {
        winKeep = followZ;
        R.k = 1;
        R.s = 1;
      }, [], FENETRE.chute);
      // (retours de Tom 27/11) le sachet percé RECULE d'abord derrière la pile (il n'est pas ouvert en haut : tombant
      // devant elle, on croyait voir les cartes sortir par le haut), puis il tombe
      out.to(B, { follow: 0, duration: FENETRE.lache, ease: EASE.glide }, FENETRE.chute)
        .to(B, { z: FENETRE.reculZ, duration: FENETRE.recul, ease: EASE.glide }, FENETRE.chute)
        .to(B, { y: -2.6, duration: FENETRE.tombe, ease: EASE.heave }, FENETRE.chute + FENETRE.recul * 0.7);
      const qk = autoQuick() ? 1.6 : 1;
      tl.call(() => {
        const c = sideline(gsap.timeline());
        c.to(S, { push: 0, duration: FENETRE.pose, ease: EASE.glide }, 0);
        c.to(R, { k: 0, s: 0, duration: FENETRE.pose, ease: EASE.settle }, 0);
        order.forEach((si, k) => c.to(slots[si].p, { y: 0, z: -STACK_DZ * (n - 1 - k), s: 1, rz: (k - 2) * 0.012, duration: FENETRE.pose, ease: EASE.settle }, k * FENETRE.decale));
        c.timeScale(qk);
      }, [], FENETRE.range);
      tl.call(() => {
        phase = 'opened';
        events.onOpened?.();
        flushQueued();
      }, [], FENETRE.ouvert);
      lightRim(sideline(gsap.timeline()), order[0], FENETRE.ouvert / qk);
      tl.timeScale(qk);
      out.timeScale(qk);
    });
  }

  /** (27/11) Déchirure glacée : la variante dont le point d'impact est le plus proche du dernier appui (à l'écran) */
  function pickIceVariant() {
    if (!icePlayers.length) return;
    let best = icePlayers[0], bd = Infinity;
    if (lastDown) {
      packRig.updateMatrixWorld();
      for (const pl of icePlayers) {
        const [x, y, z] = pl.header.impact;
        proj.set(x, y, z).applyMatrix4(packRig.matrixWorld).project(stage.camera);
        const sx = (proj.x * 0.5 + 0.5) * ctx.width, sy = (0.5 - proj.y * 0.5) * ctx.height;
        const d = Math.hypot(sx - lastDown.x, sy - lastDown.y);
        if (d < bd) (bd = d), (best = pl);
      }
    } else best = icePlayers[Math.floor(Math.random() * icePlayers.length)];
    useIce(best);
  }
  function useIce(pl: ShatterPlayer) {
    icePlayer = pl;
    pl.setTime(0);
    if (iceMesh && iceFilm) {
      iceMesh.geometry = pl.ice;
      iceFilm.geometry = pl.film;
    }
  }
  /** un coup sur le bloc : les fêlures de ce niveau apparaissent, le sachet gelé blanchit ; le 3e fait tout éclater */
  function iceTap() {
    if (phase !== 'sealed' || !icing || iceTaps >= 3) return;
    if (iceTaps === 0) pickIceVariant();
    iceTaps++;
    events.onHold?.(iceTaps / 3);
    const pan = icePlayer ? Math.max(-1, Math.min(1, icePlayer.header.impact[0] * 2)) : 0;
    if (iceTaps < 3) {
      sideline(gsap.timeline())
        .to(CRACK, { value: iceTaps, duration: GLACE.fend, ease: EASE.glide }, 0)
        .to(FROST, { value: GLACE.givre[iceTaps], duration: GLACE.fend, ease: EASE.glide }, 0);
      ctx.sfx.iceCrack(iceTaps, 0.3, pan);
      haptics.pulse(10 + iceTaps * 8);
      shake.impulse(2 + iceTaps * 1.5);
      return;
    }
    onShattered();
  }
  /**
   * (27/11) le 3e coup : la glace et le sachet gelé éclatent ensemble (éclats cuits), la pile est là, la main n'a plus
   * rien à tenir ; les cartes gardent l'échelle du sachet (R.s) jusqu'au rangement — même état final que la Déchirure
   */
  function onShattered() {
    phase = 'busy';
    holding = false;
    autoTear?.kill();
    autoTear = null;
    void (prepared ?? Promise.resolve()).then(() => {
      if (!pack) return;
      kill();
      CRACK.value = 3;
      sideline(gsap.timeline()).to(ICE_FLY, { value: 1, duration: GLACE.fend / 2, ease: EASE.glide }, 0);
      FROST.value = 1;
      ctx.sfx.iceShatter(0.45);
      haptics.pulse([30, 30, 50]);
      shake.impulse(6);
      const n = order.length;
      tl = gsap.timeline();
      const out = sideline(gsap.timeline());
      const T = icePlayer?.duration ?? 1;
      out.fromTo(ICE, { t: 0 }, { t: T, duration: T, ease: 'none' }, 0);
      R.s = 1;
      out.to(B, { follow: 0, duration: GLACE.lache, ease: EASE.glide }, 0);
      const qk = autoQuick() ? 1.6 : 1;
      tl.call(() => {
        const c = sideline(gsap.timeline());
        c.to(S, { push: 0, duration: GLACE.pose, ease: EASE.glide }, 0);
        c.to(R, { s: 0, duration: GLACE.pose, ease: EASE.settle }, 0);
        order.forEach((si, k) => c.to(slots[si].p, { y: 0, z: -STACK_DZ * (n - 1 - k), s: 1, rz: (k - 2) * 0.012, duration: GLACE.pose, ease: EASE.settle }, k * GLACE.decale));
        c.timeScale(qk);
      }, [], GLACE.range);
      tl.call(() => {
        phase = 'opened';
        events.onOpened?.();
        flushQueued();
      }, [], GLACE.ouvert);
      lightRim(sideline(gsap.timeline()), order[0], GLACE.ouvert / qk);
      tl.timeScale(qk);
      out.timeScale(qk);
    });
  }

  /** (27/11) Étoile : tracé effacé (grille des distances au plus loin) */
  function starReset() {
    starBuf.fill(255);
    starTex.needsUpdate = true;
    starLen = 0;
    starLast = null;
    starSmooth = null;
    starNoteI = 0;
    starSince = 0;
  }
  /** point du sachet (unités) sous un point de l'écran (px CSS) : le rayon de la caméra coupe le plan du film avant */
  function starAt(px: number, py: number): { x: number; y: number } | null {
    const nx = (px / ctx.width) * 2 - 1, ny = 1 - (py / ctx.height) * 2;
    starA.set(nx, ny, -1).unproject(stage.camera);
    starB.set(nx, ny, 1).unproject(stage.camera);
    packRig.updateMatrixWorld();
    packRig.worldToLocal(starA);
    packRig.worldToLocal(starB);
    const dz = starB.z - starA.z;
    if (Math.abs(dz) < 1e-9) return null;
    const t = (PACK.bulge - starA.z) / dz;
    return { x: starA.x + (starB.x - starA.x) * t, y: starA.y + (starB.y - starA.y) * t };
  }
  /** paillettes dorées au point (x, y) du sachet : elles montent un peu, scintillent, puis retombent en neige d'or */
  function spawnSparkles(x: number, y: number, n: number) {
    for (let k = 0; k < n; k++) {
      const q = sh[shI++ % NSH];
      q.p.set(x + (Math.random() - 0.5) * 0.03, y + (Math.random() - 0.5) * 0.03, PACK.bulge + 0.004);
      // (polish) poussière fine : beaucoup de petites, quelques grosses ; elles montent doucement puis retombent en neige
      q.v.set((Math.random() - 0.5) * 0.28, 0.3 + Math.random() * 0.5, 0.08 + Math.random() * 0.25);
      q.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      q.w.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
      q.life = 1.1 + Math.random() * 0.9;
      q.s = Math.random() < 0.15 ? 0.45 + Math.random() * 0.3 : 0.12 + Math.random() * 0.2;
    }
    shredsDirty = true;
  }
  /** un point du tracé : grille des distances mise à jour autour de lui, paillettes, une note de temps en temps */
  function starStamp(p: { x: number; y: number }) {
    const last = starLast;
    starLast = p;
    let pts = [p];
    if (last) {
      const d = Math.hypot(p.x - last.x, p.y - last.y);
      if (d < 0.4) {
        starLen += d;
        const n = Math.max(1, Math.ceil(d / 0.01));
        pts = Array.from({ length: n }, (_, k) => ({ x: last.x + ((p.x - last.x) * (k + 1)) / n, y: last.y + ((p.y - last.y) * (k + 1)) / n }));
      }
    }
    const cw = PACK.w / STAR_W, ch = PACK.h / STAR_H, R = 0.2;
    for (const q of pts) {
      if (Math.abs(q.x) > PACK.w / 2 + 0.03 || Math.abs(q.y) > PACK.h / 2 + 0.03) continue;
      const ci = (q.x / PACK.w + 0.5) * STAR_W, cj = (q.y / PACK.h + 0.5) * STAR_H;
      const ri = Math.ceil(R / cw), rj = Math.ceil(R / ch);
      for (let j = Math.max(0, Math.floor(cj) - rj); j <= Math.min(STAR_H - 1, Math.floor(cj) + rj); j++)
        for (let i = Math.max(0, Math.floor(ci) - ri); i <= Math.min(STAR_W - 1, Math.floor(ci) + ri); i++) {
          const d = Math.hypot((i + 0.5) * cw - PACK.w / 2 - q.x, (j + 0.5) * ch - PACK.h / 2 - q.y);
          const v = Math.min(255, Math.round((d / STAR_RANGE) * 255));
          if (v < starBuf[j * STAR_W + i]) starBuf[j * STAR_W + i] = v;
        }
    }
    starTex.needsUpdate = true;
    if (!starSince) starSince = performance.now();
    spawnSparkles(p.x, p.y, 2);
    const now = performance.now();
    if (now - starNoteAt >= ETOILE.note * 1000) {
      starNoteAt = now;
      // la baguette tinte : notes hautes de la gamme du jeu (sol pentatonique)
      ctx.sfx.note(STAR_NOTES[starNoteI++ % STAR_NOTES.length], 0.05, 0.5);
    }
    events.onHold?.(Math.min(1, starLen / ETOILE.trace));
    if (!starAuto && starLen >= ETOILE.trace && phase === 'sealed') onStarred();
  }
  /** un toucher : une étoile à 5 branches se trace toute seule, d'un trait, puis le sachet se dissout */
  function autoStar() {
    if (starAuto || phase !== 'sealed' || !starring) return;
    const R = Math.min(PACK.w, PACK.h) * 0.36, cy = PACK_STACK.cy;
    const pts = Array.from({ length: 6 }, (_, k) => {
      const a = Math.PI / 2 + (k * 4 * Math.PI) / 5;
      return { x: R * Math.cos(a), y: cy + R * Math.sin(a) };
    });
    const o = { t: 0 };
    starLast = null;
    starAuto = gsap.to(o, {
      t: 1,
      duration: ETOILE.autoTrace,
      ease: 'none',
      onUpdate: () => {
        const f = o.t * 5, i = Math.min(4, Math.floor(f)), k = f - i;
        starStamp({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k });
      },
      onComplete: () => {
        starAuto = null;
        if (phase === 'sealed') onStarred();
      },
    });
  }
  /**
   * (27/11) assez de tracé : tout le sachet se change en poussière d'or depuis le tracé (B.burn), gerbe de paillettes,
   * carillon ; la pile, restée en place, se range — même état final que la Déchirure
   */
  function onStarred() {
    phase = 'busy';
    holding = false;
    starAuto?.kill();
    starAuto = null;
    void (prepared ?? Promise.resolve()).then(() => {
      if (!pack) return;
      kill();
      const n = order.length;
      tl = gsap.timeline();
      const out = sideline(gsap.timeline());
      out.to(B, { burn: STAR_RANGE * 1.3, duration: ETOILE.fin, ease: EASE.glide }, 0);
      for (let k = 0; k < 36; k++) out.call(() => spawnSparkles((Math.random() - 0.5) * PACK.w, (Math.random() - 0.5) * PACK.h, 2), [], (k * ETOILE.fin) / 36);
      ctx.sfx.chime(4, 0.14);
      ctx.sfx.shimmer(4, 1.6, 0.08);
      // (polish) arpège qui monte, lueur dorée qui enfle puis s'éteint
      [12, 14, 17, 19].forEach((d, k) => ctx.sfx.note(d, 0.06, 0.9, k * (ETOILE.note / 2)));
      U.glowColor.value.set(STAR_GOLD);
      out.to(S, { glow: 0.55, duration: ETOILE.fin * 0.3, ease: EASE.glide }, 0).to(S, { glow: 0, duration: ETOILE.fin, ease: EASE.glide }, ETOILE.fin * 0.3);
      haptics.pulse([20, 40, 20]);
      R.s = 1;
      out.to(B, { follow: 0, duration: GLACE.lache, ease: EASE.glide }, ETOILE.fin * 0.5);
      const qk = autoQuick() ? 1.6 : 1;
      tl.call(() => {
        const c = sideline(gsap.timeline());
        c.to(S, { push: 0, duration: ETOILE.pose, ease: EASE.glide }, 0);
        c.to(R, { s: 0, duration: ETOILE.pose, ease: EASE.settle }, 0);
        order.forEach((si, k) => c.to(slots[si].p, { y: 0, z: -STACK_DZ * (n - 1 - k), s: 1, rz: (k - 2) * 0.012, duration: ETOILE.pose, ease: EASE.settle }, k * ETOILE.decale));
        c.timeScale(qk);
      }, [], ETOILE.range);
      tl.call(() => {
        phase = 'opened';
        events.onOpened?.();
        flushQueued();
      }, [], ETOILE.ouvert);
      lightRim(sideline(gsap.timeline()), order[0], ETOILE.ouvert / qk);
      tl.timeScale(qk);
      out.timeScale(qk);
    });
  }

  /** (27/11) blocage du défilement / « tirer pour rafraîchir » pendant que le sachet attend le geste vers le bas */
  function setRollLock(on: boolean) {
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('op-roll', on);
  }

  /** Booster déchiré : la bande s'envole, la pile sort par le haut, le booster tombe ; puis la pile se pose. */
  function onTorn() {
    phase = 'busy';
    holding = false;
    autoTear?.kill();
    autoTear = null;
    shake.impulse(5);
    haptics.pulse(24);
    if (style === 'tear') skinBurst(ctx.overlay);
    void (prepared ?? Promise.resolve()).then(() => {
      if (!pack) return;
      kill();
      const n = order.length;
      tl = gsap.timeline();
      // sortie du booster vide sur une timeline à part : un toucher (révélation suivante, défilement auto des séries)
      // coupe la timeline principale et laissait le paquet vide planté DEVANT les cartes. Il recule aussi derrière elles.
      const out = sideline(gsap.timeline());
      // déchirure simulée : la sortie enregistrée suit la MÊME horloge que les cartes (même départ, même accélération)
      if (useBake && bakePlayer) {
        bakePlay = 1;
        const T = (bakePlayer.header.nExit - 1) / bakePlayer.header.exitFps;
        out.fromTo(bakeExit, { t: 0 }, { t: T, duration: T, ease: 'none' }, 0);
      }
      out.to(fly, { t: 1, duration: 0.75, ease: EASE.glide, onStart: () => air(out, 0.75, 0.22, EASE.glide) }, 0)
        .to(B, { follow: 0, duration: 0.3, ease: EASE.glide }, 0.75)
        .to(B, { z: -0.6, duration: 0.6, ease: EASE.glide }, 1.3)
        .to(B, { y: -2.6, duration: 0.85, ease: EASE.heave }, 1.05);
      // la pile glisse hors du booster, la carte de devant un rien en premier
      order.forEach((si, k) => {
        // (07/11) booster +15 % : la pile monte d'autant plus haut pour sortir entièrement par la déchirure
        tl!.to(slots[si].p, { y: PACK.h / PACK_FRAME.h, duration: 0.8, ease: EASE.glide, onStart: k === n - 1 ? () => air(tl, 0.8, 0.14, EASE.glide) : undefined }, 0.25 + (n - 1 - k) * 0.035);
      });
      tl.to(S, { push: 0, duration: 0.8, ease: EASE.glide }, 0.9);
      // (audit UX2-04) mode auto rapide : toute la sortie du booster ×1,6 (les trois timelines ensemble, rien ne se croise)
      const qk = autoQuick() ? 1.6 : 1;
      tl.call(() => {
        const c = sideline(gsap.timeline());
        order.forEach((si, k) => c.to(slots[si].p, { y: 0, z: -STACK_DZ * (n - 1 - k), s: 1, rz: (k - 2) * 0.012, duration: 0.65, ease: EASE.settle }, k * 0.03));
        c.timeScale(qk);
      }, [], 1.2);
      tl.call(() => {
        phase = 'opened';
        events.onOpened?.();
        flushQueued();
      }, [], 1.5);
      lightRim(sideline(gsap.timeline()), order[0], 1.45 / qk);
      tl.timeScale(qk);
      out.timeScale(qk);
    });
  }

  // ───────────────────────────────────────────── cartes
  /** une image (rendre la main au navigateur entre deux étapes lourdes) */
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  async function buildSlot(data: PackCard): Promise<Slot> {
    const cd = cardById(data.cardId);
    await ensureCardImages([cd]);
    const rr = rarity(data.rarity);
    // (audit PERF1-04) téléphone : calques peints en 4 étapes (gameCardArtAsync, lot E), puis dos et graphes de nœuds
    // chacun dans sa propre image
    // (audit 12/11, S17 / A9-08) aussi sur ordinateur : la peinture synchrone des 6 calques (768 px) et leur envoi d'un
    // bloc coûtaient plusieurs images à 144 Hz par carte
    const art = await gameCardArtAsync(cd, data.rarity, artScale);
    await nextFrame();
    const back = backs.forCard(data.cardId);
    const face = buildFace(art, rr.tier, !!cd.photo, cardHasCutout(cd));
    face.holo.uniforms.strength.value = 0.1;
    // code couleur des raretés (retours live 02, §12) : 1★ gris … 5★ doré, 6★ arc-en-ciel ; secrète : son or rose
    // 6★ et secrète : tranche DORÉE tant qu'elles sont face cachée (comme une 5★), leur vraie couleur arrive pendant l'anticipation
    const { edge, rim, tease } = rr.secret ? buildEdge(rr.hex, TEASE_GOLD) : rr.id === 'mythic' ? buildEdge('rainbow', TEASE_GOLD) : buildEdge(rr.id === 'epic' ? '#c23a52' : rr.id === 'legendary' ? TEASE_GOLD : rr.hex);
    const mesh = new Mesh(cardGeo, [face.holo.material, back, edge]);
    mesh.frustumCulled = false;
    return {
      data, cd, rr, art, mesh,
      mats: [face.holo.material, edge],
      holoU: face.holo.uniforms,
      U: { lit: face.lit, flash: face.flash, rim, tease },
      p: { x: 0, y: 0, z: -0.03, s: 1, flip: Math.PI, rz: 0, holo: 0 },
      hov: 0,
    };
  }

  /**
   * (perf 06/11, fuite) Libère une carte. Le maillage doit être « disposé » lui aussi : three garde un objet de rendu par
   * (maillage, matériau) tant que l'un des deux n'est pas libéré — celui du DOS (matériau partagé, jamais libéré)
   * retenait le maillage, donc la face, ses nœuds, ses 6 textures et leurs toiles, et ses tampons GPU : +30 toiles et
   * +10 tampons GPU par ouverture, pour toute la session.
   */
  function releaseSlot(s: Slot) {
    s.mesh.dispatchEvent({ type: 'dispose' } as never);
    s.mats.forEach((m) => m.dispose());
    s.art.dispose();
  }
  function disposeSlots() {
    for (const s of slots) {
      cardsRig.remove(s.mesh);
      releaseSlot(s);
    }
    slots = [];
  }

  /**
   * Cartes d'un booster PRÉPARÉES À L'AVANCE (retours de Tom, 4 nov. : « en série, on dirait qu'il y a un chargement
   * des cartes ») : pendant qu'on regarde un booster, le suivant de la série est déjà construit (images, calques,
   * matériaux) ; à son ouverture, `prepare` le reprend tel quel → plus d'attente entre deux boosters.
   */
  const preloaded = new Map<string, { pr: Promise<Slot[] | null>; tok: { on: boolean } }>();
  function dropPreloaded() {
    for (const [id, { pr, tok }] of preloaded) {
      preloaded.delete(id);
      tok.on = false; // construction en cours : elle s'arrête et libère ce qu'elle a fait
      void pr.then((b) => b?.forEach(releaseSlot), () => undefined);
    }
  }
  /** Construit les 5 cartes d'un booster (sans les poser) ; null si `alive()` devient faux en route. */
  async function buildAll(p: SealedPack, alive: () => boolean): Promise<Slot[] | null> {
    const built: Slot[] = [];
    // dos des thèmes du pack peints d'abord, chacun dans son image (pas dans celle d'une carte, PERF1-04.3)
    if (ctx.quality === 'mobile') {
      for (const c of p.cards) {
        const bm = backs.forCard(c.cardId);
        await nextFrame();
        if (!alive()) return null;
        // (perf) les 2 textures du dos (couleur + masques) partent ici, dans leur image : avant, tous les dos neufs du
        // pack (jusqu'à 5 thèmes = 10 textures + mipmaps) partaient ensemble à la 1re image où la pile se montre
        const send = backs.toSend(bm);
        if (send.length) {
          send.forEach((t) => ctx.renderer.initTexture(t));
          await nextFrame();
          if (!alive()) return null;
        }
      }
    }
    for (const c of p.cards) {
      const sl = await buildSlot(c);
      built.push(sl);
      // mobile : textures envoyées au GPU carte par carte (sinon les 30 calques + mipmaps partent tous dans la même
      // image, au moment où la pile apparaît derrière les trous → à-coup) ; l'aplat inutilisé n'est jamais envoyé
      // (audit PERF1-04) deux textures par image au plus : l'envoi + les mipmaps de 6 calques ne tombent plus dans la même image
      {
        const tex = [sl.art.bg, sl.art.subject, sl.art.fg, sl.art.frame, sl.art.masks, sl.art.fx];
        for (let i = 0; i < tex.length; i++) {
          ctx.renderer.initTexture(tex[i]);
          if (i % 2 === 1 && i < tex.length - 1) await nextFrame();
        }
      }
      await nextFrame(); // une carte par frame : pas d'à-coup pendant la brûlure
      if (!alive()) break; // booster abandonné (reset) : inutile de continuer
    }
    if (!alive()) {
      built.forEach(releaseSlot);
      return null;
    }
    return built;
  }

  /** Prépare les 5 cartes (images → calques → matériaux) puis compile leurs shaders, sans bloquer l'animation. */
  async function prepare(p: SealedPack) {
    // déjà construites en avance (booster suivant d'une série) : reprises telles quelles
    const pre = preloaded.get(p.id)?.pr;
    preloaded.delete(p.id);
    dropPreloaded();
    let built = pre ? await pre.catch(() => null) : null;
    if (!built && pack === p) built = await buildAll(p, () => pack === p);
    if (pack !== p || !built) {
      built?.forEach(releaseSlot);
      return;
    }
    slots = built;
    // TEASING (retours live 02, §12 — remplace l'anti-spoil) : face cachée, la tranche de chaque carte luit déjà doucement
    // dans la couleur de sa rareté (1★ gris · 2★ vert · 3★ bleu · 4★ rouge · 5★ doré · 6★ arc-en-ciel), un peu plus
    // fort à mesure que la rareté monte ; la révélation fait ensuite son éclat habituel
    // … mais pas tout de suite : la tranche S'ALLUME quand la carte arrive devant
    // (réf. motion §1.1 : l'indice le plus précoce porte le signal, son allumage est un temps de mise en scène)
    for (const sl of slots) sl.U.rim.value = 0;
    // révélation de la moins rare à la plus rare (la secrète est toujours la dernière)
    order = slots.map((_, i) => i).sort((a, b) => RANK[slots[a].data.rarity] - RANK[slots[b].data.rarity] || a - b);
    // DANS le booster : pile serrée (≈ l'épaisseur des cartes) centrée dans le coussin, un peu plus petite que lui,
    // sans rotation (coins loin des soudures) → aucune carte ne traverse l'emballage, même en l'inclinant
    order.forEach((si, k) => Object.assign(slots[si].p, { x: 0, y: PACK_STACK.cy, z: (k - (order.length - 1) / 2) * 0.0072, s: PACK_STACK.s, flip: Math.PI, rz: 0, holo: 0 }));
    // (audit 12/11, S09 / E4-02) UNE carte par image dans la scène : three construit les nœuds d'un objet (≈ 470 pour une
    // face) dans la première image où il est soumis ; ajoutées ensemble, les 5 constructions tombaient dans la même
    // image, à chaque booster (la pile est cachée par le sachet, mais soumise au rendu)
    for (const si of order) {
      cardsRig.add(slots[si].mesh);
      await nextFrame();
      if (pack !== p || slots !== built) return;
    }
    // (audit PERF1-03) pipelines des 5 vraies cartes compilés pour la VRAIE cible (passe MRT + MSAA), en asynchrone
    await compileReal();
  }

  // ───────────────────────────────────────────── séquences
  function kill() {
    tl?.kill();
    tl = null;
  }
  /*
   * (V3 lot 04) HIT-STOP : la timeline gelée repart à la PREMIÈRE IMAGE où `ms` se sont écoulées depuis l'impact.
   * Avant : un `setTimeout(ms)` hors cadence d'image, armé après le travail de l'image d'impact et servi en retard dès
   * que le fil principal est chargé (image lourde d'une 6★) → une image de gel de plus, au hasard. Le temps est compté
   * ici sur l'horloge qui fait avancer la timeline elle-même (le ticker GSAP, juste AVANT le rendu de la racine) :
   * même durée nominale, même enchaînement, mais à l'image près. (Pas dans update(dt) : son dt est plafonné à 50 ms,
   * le shell y saute des images sur les écrans 120 Hz et son ordre face au ticker GSAP varie → ±1 image.) L'écouteur
   * n'existe que pendant le gel (au repos, GSAP se met en veille).
   */
  let stopTl: gsap.core.Timeline | null = null;
  let stopLeft = 0;
  const stopTick = (_time: number, deltaMs: number) => {
    stopLeft -= deltaMs;
    if (stopLeft > 0 && tl === stopTl) return;
    gsap.ticker.remove(stopTick);
    if (stopTl && tl === stopTl) stopTl.resume();
    stopTl = null;
  };
  function hitStop(t: gsap.core.Timeline, ms: number) {
    t.pause();
    stopTl = t;
    stopLeft = ms;
    // posé à la fin du tick en cours (on est dans le rendu de la timeline : un écouteur prioritaire ajouté pendant la
    // distribution du ticker ferait rendre la racine deux fois) ; prioritaire = compté avant le rendu de la racine, la
    // reprise avance donc la timeline dans ce même tick, comme après le minuteur
    queueMicrotask(() => {
      if (stopTl === t) gsap.ticker.add(stopTick, false, true);
    });
  }
  function killAll() {
    kill();
    side.forEach((t) => t.kill());
    side.clear();
  }
  function sideline(t: gsap.core.Timeline) {
    side.add(t);
    t.eventCallback('onComplete', () => side.delete(t));
    return t;
  }

  /** Pose d'inclinaison seule (souris / gyroscope), sans la rotation libre du glisser. */
  function tiltPose(maxTilt: number) {
    return { x: -ctx.input.tiltY * maxTilt, y: ctx.input.tiltX * maxTilt };
  }

  /** Demi-largeur / demi-hauteur visibles dans le plan des cartes (pour placer rangée et éventail sur tout écran). */
  function view() {
    const cam = stage.camera;
    const halfH = Math.tan((cam.fov * Math.PI) / 360) * camBase;
    return { halfH, halfW: halfH * cam.aspect };
  }

  /** envoie au GPU au plus 2 textures du sachet `k` qui ne le sont pas encore ; renvoie combien */
  function feedPack(k: string): number {
    const a = arts.get(k);
    if (!a) return 0;
    let n = 0;
    for (const t of a.gpuTextures) {
      if (sentTex.has(t)) continue;
      if (n === 2) break;
      sentTex.add(t);
      ctx.renderer.initTexture(t);
      n++;
    }
    return n;
  }
  /** sachets voisins du booster affiché, le sens du dernier changement d'abord (±1 sur téléphone, ±2 = toute la roue sinon) */
  function neighbours(): string[] {
    const ring = reelKeys ?? allKeys;
    const i = ring.indexOf(boosterKey);
    if (i < 0) return [];
    const out: string[] = [];
    const reach = ctx.quality === 'mobile' ? 1 : 2;
    for (let d = 1; d <= reach; d++) for (const sgn of [lastDir, -lastDir]) {
      const k = ring[(((i + sgn * d) % ring.length) + ring.length) % ring.length];
      if (k !== boosterKey && !out.includes(k)) out.push(k);
    }
    return out;
  }
  /** une étape par image : jamais plus de 2 textures ; seulement au repos, sauf pour le sachet visé par un changement */
  function feedArts() {
    if (!ready3d || phase !== 'display') return;
    if (urgentKey) {
      if (feedPack(urgentKey) > 0) return;
      urgentKey = null;
    }
    if (ctx.input.down || spinTl?.isActive() || reel?.moving || performance.now() - wheelMovedAt < 250) return;
    if (feedPack(boosterKey) > 0) return; // (le booster affiché : déjà parti avec son matériau ; sécurité)
    for (const k of neighbours()) if (feedPack(k) > 0) return;
  }

  function setBooster(k: string, animate = true, dir: 1 | -1 = 1) {
    if (phase !== 'display') return;
    if (k === boosterKey) return void (wantKey = null);
    if (!arts.has(k)) {
      // visuel pas encore généré (tâche de fond) : il sera posé dès qu'il le sera
      wantKey = k;
      wantDir = dir;
      return;
    }
    wantKey = null;
    boosterKey = k;
    lastDir = dir;
    if (!animate) {
      applyBoosterArt(k);
      return;
    }
    urgentKey = k; // les textures partent pendant la 1re moitié du tour (≤ 2 par image), pas toutes à `applyBoosterArt`
    // timeline à part : ne coupe pas l'entrée du booster (reset) si on change de booster pendant qu'il arrive
    spinTl?.kill();
    const sp = (spinTl = sideline(gsap.timeline()));
    // booster suivant (dir 1) : la face part vers la gauche, comme un carrousel qu'on pousse ; précédent : vers la droite
    sp.to(B, { spin: -Math.PI * dir, duration: 0.32, ease: EASE.heave, onStart: () => air(sp, 0.32, 0.12, EASE.heave) })
      .call(() => applyBoosterArt(k))
      .to(B, { spin: -Math.PI * 2 * dir, duration: 0.7, ease: 'back.out(1.6)' })
      .call(() => (B.spin = 0));
  }

  function open(p: SealedPack, ev: OpeningEvents, o: { continued?: boolean; seriesLast?: boolean } = {}) {
    killAll();
    disposeSlots();
    pack = p;
    events = ev;
    seriesLast = o.seriesLast ?? true;
    cursor = 0;
    preluded = -1;
    curTier = 0;
    queued = false;
    curBase = 1;
    autoHoldUntil = 0;
    holding = false;
    const k = packKeyOf(p);
    // (son V2) couleur sonore du booster ; la nappe des menus (si allumée) se tait pendant l'ouverture
    ctx.sfx.setPackColor(k);
    ctx.sfx.padHold('opening', true);
    if (arts.has(k)) {
      boosterKey = k;
      applyBoosterArt(k);
    } else wantKey = k; // (posé par startArts dès qu'il est prêt)
    style = openStyleOf(p);
    frozenStyle = null;
    // (27/11) Retroussé sans lecteur prêt (cuisson libérée entre-temps) : la Déchirure, sans écran vide
    if (style === 'retrousse' && !(rollPlayer && rollBody && rollReady)) style = 'tear';
    if (style === 'fenetre' && !(winPlayer && winBody && winReady)) style = 'tear';
    if (style === 'glace' && !(icePlayers.length && iceMesh && iceReady)) style = 'tear';
    rolling = style === 'retrousse';
    windowing = style === 'fenetre';
    icing = style === 'glace';
    starring = style === 'etoile';
    starAuto?.kill();
    starAuto = null;
    starReset();
    STARON.value = starring ? 1 : 0;
    if (starring) B.burn = ETOILE.bande;
    iceTaps = 0;
    iceNextAuto = 0;
    ICE.t = -1;
    CRACK.value = 0;
    ICE_FLY.value = 0;
    if (icing) {
      // variantes arrivées depuis le montage : un lecteur chacune (la variante jouée est choisie au 1er coup)
      for (const b of loadedShatters()) if (!icePlayers.some((p) => p.bake === b)) icePlayers.push(new ShatterPlayer(b));
      useIce(icePlayers[0]);
      FROST.value = GLACE.givre[0];
    }
    // la pile est DANS le booster (au plan des cartes) ; en vitrine, elle se tient 12 cm derrière (reset)
    followZ = 0;
    winKeep = 0;
    WCUT.value = WSLIT.value = 0;
    winQ.length = 0;
    winCutAt = 0;
    winHeadWait = null;
    if (windowing) {
      // une des variantes de la Fenêtre, au hasard ; ses coins donnent la butée et les claquements
      const wb = loadedBakesOf('fenetre');
      const b = wb.length ? wb[Math.floor(Math.random() * wb.length)] : null;
      if (b) winPlayer!.use(b);
      const h = winPlayer!.header;
      winEv = (h.events ?? []).filter((e) => e.p !== undefined).sort((a, c) => a.p! - c.p!);
      winEvI = 0;
      winWelds = winWeldsOf(winEv);
      winGate = winWelds.length > 1 ? winWelds[1] : 2;
      winPlayer!.setTear(0);
    }
    tearTarget = tearProgress = tearPrevTarget = tearVel = tearWeld = 0;
    tearSlip = tearFling = false;
    TSLIT.value = 0;
    hapticTear = 0;
    TP.value = 0;
    fly.t = 0;
    autoTear?.kill();
    autoTear = null;
    applyTearArt(k);
    // une des variantes enregistrées, au hasard (chaque booster se déchire un peu différemment)
    const bakes = loadedBakes();
    // (27/11, retour de Hugo) la cuisson de la Déchirure ne joue QUE la Déchirure : ses variantes restent chargées tant
    // que la famille quittée n'est pas libérée (retour en vitrine), et l'Étoile garde la famille `tear` — avant, ses
    // mailles étaient animées (et rendables) sous l'Étoile, la Fenêtre ou la glace
    useBake = style === 'tear' && !warmingTear && !!bakePlayer && bakes.length > 0;
    if (useBake) bakePlayer!.use(bakes[Math.floor(Math.random() * bakes.length)]);
    bakePlay = 0;
    bakeExit.t = -1;
    poseStrip = null;
    bakePlayer?.setTear(0);
    R.k = R.s = 0;
    rollQ.length = 0;
    rollSidePrev = null;
    rollHeadWait = null; // (suite d'un Retroussé abandonné : jamais jouée)
    if (rolling) {
      // une des variantes du Retroussé, au hasard ; ses ruptures donnent les points durs et les claquements
      const rb = loadedBakesOf('retrousse');
      const b = rb.length ? rb[Math.floor(Math.random() * rb.length)] : null;
      if (b) rollPlayer!.use(b);
      const h = rollPlayer!.header;
      rollEv = (h.events ?? []).filter((e) => e.p !== undefined).sort((a, c) => a.p! - c.p!);
      rollEvI = 0;
      rollWelds = rollWeldsOf(rollEv);
      rollYmin = rollLowOf(b);
      rollPlayer!.setTear(0);
      // dernière image où la charnière (pli compris : + r) est encore au-dessus du haut de la pile
      rollGate = 2;
      const fo = h.fold;
      if (fo) {
        const top = PACK_STACK.cy + PACK_STACK.hh + fo.r;
        let f = 0;
        while (f < fo.yF.length - 1 && fo.yF[f + 1] >= top) f++;
        rollGate = f / Math.max(1, h.nTear - 1);
      }
    }
    // (27/11) Étoile : c'est le sachet lui-même (sa matière dissout le film le long du tracé) ; pas de maille de déchirure
    if (packMeshMain) packMeshMain.visible = starring;
    setTearVisible(!starring);
    // (Étoile : on trace en glissant — défilement et « tirer pour rafraîchir » bloqués aussi)
    setRollLock((rolling || windowing || starring) && !o.continued);
    // (retours live 02, anti-spoil) braise et fuite de lumière : une seule couleur pour tous les boosters (avant : la
    // couleur de la meilleure carte, qui annonçait une rouge ou une 6★ dès que le booster était posé)
    U.ember.value.set(starring ? STAR_GOLD : NEUTRAL_EMBER);
    // … sauf l'Éclipse (Berserk 5★ / 6★) : braise cramoisie, pénombre — spoil assumé (décision de Tom, 10/11)
    eclipseBegin(p.cards.some(isEclipseCard), !!o.continued);
    B.leak = 0;
    B.follow = 1;
    sealedT = 0;
    revealed = false;
    autoWait = false;
    phase = 'sealed';
    prepared = prepare(p);
    rollPileReady = !rolling && !windowing;
    if (rolling || windowing)
      void prepared.then(() => {
        if (pack === p) rollPileReady = true;
      });
    if (o.continued) {
      // suite du gros booster : l'emballage reste hors champ, les cartes montent du bas de l'écran jusqu'à la pile
      phase = 'busy';
      B.follow = 0;
      B.y = -2.6;
      if (packMeshMain) packMeshMain.visible = false;
      setTearVisible(false);
      void prepared.then(() => {
        if (pack !== p) return;
        tl = gsap.timeline();
        const n = order.length;
        order.forEach((si, k) => {
          const s = slots[si];
          Object.assign(s.p, { x: 0, y: -1.7, z: -STACK_DZ * (n - 1 - k), s: 1, flip: Math.PI, rz: (k - 2) * 0.012 });
          tl!.to(s.p, { y: 0, duration: 0.55, ease: EASE.settle }, k * 0.03);
        });
        tl.call(() => {
          phase = 'opened';
          events.onOpened?.();
          flushQueued();
        }, [], 0.5);
        lightRim(sideline(gsap.timeline()), order[0], 0.5);
      });
      return;
    }
    tl = gsap.timeline();
    // déchirure : le booster reste au plan des cartes (z 0) → quand la pile le quitte (follow → 0) elle ne recule pas à travers lui
    // (07/11) booster +15 % : en vitrine il paraît plus grand ; à l'ouverture il reprend la taille d'écran d'avant
    // (la place entre l'en-tête et les consignes n'a pas changé) — les cartes dedans suivent son échelle (cardsRig)
    tl.to(B, { z: 0, y: 0, spin: Math.abs(B.spin) > Math.PI ? Math.sign(B.spin) * Math.PI * 2 : 0, s: OPEN_S, duration: 0.6, ease: EASE.glide });
    tl.to(S, { push: 0.08, duration: 0.6, ease: EASE.glide }, 0);
  }


  /** Une étoile par « tick », puis récompense. */
  function ignite(s: Slot, at: number) {
    const n = Math.min(6, s.rr.rank + 1);
    const tier = s.rr.tier;
    const mythic = tier >= 5 && !s.rr.secret;
    const si = slots.indexOf(s);
    const quiet = quietCard(s.rr.rank, order.length > 0 && si === order[order.length - 1]);
    // mythique : les 6 étoiles s'allument une à une, lentement, chacune avec son carillon (et un petit choc)
    const gap = mythic ? 0.34 : 0.1 + tier * 0.018;
    for (let k = 0; k < n; k++)
      tl!.to(s.U.lit, {
        value: k + 1, duration: mythic ? 0.2 : 0.12, ease: 'power2.out',
        onStart: () => {
          // étoiles = carillons ASCENDANTS dans la gamme (sol pentatonique ; la 6★ est en la majeur : sfx.transpose) ;
          // 1★ / 2★ : un simple glint
          if (mythic) {
            ctx.sfx.note(5 + k, 0.1 + k * 0.015, 1.2);
            shake.impulse((6 + k * 3) * (CALM ? 0.25 : 1));
            haptics.pulse(20 + k * 8);
          } else if (quiet) return;
          else if (tier >= 2) ctx.sfx.note(2 + tier + k, 0.05 + tier * 0.012, 0.5);
          else ctx.sfx.tick(1.2 + k * 0.3, 0.05);
        },
      }, at + k * gap);
    return at + n * gap;
  }

  /**
   * Révélation d'une carte (style pile) — partition par palier (réf. motion §7, 4 nov.) : anticipation → retournement
   * (charnière droite) → impact (hit-stop, flash, son, haptique) → payoff (étoiles) → savourage. La tranche annonce la
   * rareté (teasing validé, retours live 02), l'anticipation grandit avec elle : rien pour 1★ / 2★, 0,45 s pour une
   * 4★, 1 s pour une 5★, 1,8 s pour une 6★ (dont la tranche dorée se fend en arc-en-ciel à mi-course, puis 0,3 s de
   * silence avant l'impact). « Tout révéler » joue des versions CONDENSÉES des 4★ / 5★ (montée raccourcie, même
   * impact) plutôt qu'une accélération ×2.
   */
  function revealCurrent() {
    const si = order[cursor];
    const s = slots[si];
    const last = cursor === order.length - 1;
    if (last && s.rr.secret) {
      // la séquence « Un de nous » prend le relais : la carte attend face cachée au centre, comme dans 039
      phase = 'busy';
      events.onSecret?.(s.data);
      return;
    }
    if (wildPokemon(s) && events.onPokemon) {
      phase = 'scene';
      queued = false;
      events.onPokemon(s.data);
      return;
    }
    // 6★ avec sa propre cinématique (Yu-Gi-Oh) : la scène d'invocation prend le relais, la carte attend face cachée
    if (s.rr.tier >= 5 && !s.rr.secret && events.onCinematic && preluded !== cursor) {
      phase = 'scene';
      queued = false;
      if (events.onCinematic(s.data, last)) return;
    }
    phase = 'busy';
    const rr = s.rr;
    const T = rr.tier;
    const mythic = T >= 5; // (la secrète est partie vers onSecret juste au-dessus)
    const beat = TIER_BEAT[Math.min(5, T)];
    const cond = condensed(si) && !mythic ? beat.condensed : null;
    // PARTITION par palier (réf. motion §7) : anticipation AVANT le retournement, d'autant plus longue que la carte est
    // rare (la tranche l'annonce déjà) ; 1★ / 2★ : aucune, retournement en 0,2 s
    const preT = CALM ? Math.min(0.3, cond ? cond.pre : beat.pre) : cond ? cond.pre : beat.pre;
    const flipD = cond ? cond.flip : beat.flip;
    const holdT = cond ? cond.hold : beat.hold;
    curTier = T;
    revealed = false;
    // (retours 06/11) au déballage, du son SEULEMENT pour la dernière carte — sauf une 5★ / 6★ avant elle
    const sfx = quietCard(rr.rank, last) ? MUTE_SFX : ctx.sfx;
    kill();
    const main = (tl = gsap.timeline());
    // (audit UX2-06) écran court : la carte montrée remonte / rétrécit juste assez pour ne pas passer sous le panneau
    const pose = payPose(mythic ? 1.12 : 1.06);
    main.to(S, { glow: 0, trem: 0, duration: 0.12 }, 0);
    // 1. ANTICIPATION (3★ et plus) : la carte se soulève, sa tranche palpite de plus en plus vite, montée sonore ;
    //    5★ : le fond s'assombrit ; 6★ : la tranche dorée se FEND en arc-en-ciel à mi-course, battement de cœur, puis
    //    SILENCE avant l'impact (le retrait du son accentue le contraste, donc la surprise)
    if (preT > 0) {
      const liftZ = T >= 4 ? 0.09 : 0.06;
      main.to(s.p, { z: liftZ, s: 1.02 + T * 0.012, duration: Math.min(preT, 0.35), ease: EASE.glide }, 0);
      const rim0 = TEASE[Math.min(6, rr.rank)];
      if (rim0 > 0) {
        // palpitations qui accélèrent : 2 (4★) à 5 (6★), la dernière au moment du retournement
        const n = T >= 5 ? 5 : T >= 4 ? 4 : T >= 3 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const at = preT * (1 - Math.pow(1 - k / n, 1.6));
          const dur = Math.max(0.08, (preT - at) / (n - k) * 0.5);
          main.to(s.U.rim, { value: rim0 * (2 + k * 0.5), duration: dur * 0.4, ease: 'power2.out' }, at)
            .to(s.U.rim, { value: rim0 * 1.3, duration: dur * 0.6, ease: 'power2.in' }, at + dur * 0.4);
        }
        main.to(s.U.rim, { value: rim0 * 3, duration: 0.1 }, Math.max(0, preT - 0.1));
      }
      if (T >= 3 && !cond) main.call(() => sfx.riser(preT * 0.9, T, 0.1 + T * 0.03), [], 0.02);
      if (beat.dark > 0) main.to(S, { dark: beat.dark, duration: Math.min(0.5, preT * 0.5), ease: EASE.glide }, 0);
      if (mythic) {
        const turn = preT * MYTHIC_TURN;
        main.to(s.U.tease, { value: 1, duration: 0.45, ease: 'power3.in' }, turn);
        main.call(() => {
          sfx.crack(0.35);
          sfx.heartbeat(0.5, 40);
          haptics.pulse([40, 80, 40]);
          shake.impulse(CALM ? 2 : 6);
          events.onMythic?.(s.data);
        }, [], turn);
        main.call(() => sfx.heartbeat(0.6, 42), [], turn + (preT - turn) * 0.55);
        main.to(S, { trem: 0.42, duration: preT - turn, ease: 'power3.in' }, turn);
        main.to(s.p, { y: pose.y, z: 0.14, s: 1.12 * pose.k, duration: preT - turn, ease: EASE.breathe }, turn);
        main.call(() => sfx.rumble(preT - turn, 0.3), [], turn);
        if (!CALM) main.call(() => sfx.duck(MYTHIC_SILENCE + 0.05), [], Math.max(turn + 0.2, preT - MYTHIC_SILENCE));
      }
    }
    // 2. RETOURNEMENT (charnière droite, voir render) ; `face` = instant où la face devient visible
    const flipEase = T >= 4 ? EASE.settle : EASE.snap;
    main.to(s.p, { flip: 0, duration: flipD, ease: flipEase, onStart: () => air(main, flipD, 0.16 + T * 0.02, flipEase, true, sfx) }, preT);
    const face = preT + flipD * halfAt(flipEase);
    // l'impact tombe un rien après la face (le temps que l'œil la lise ; mythique : une image pour le voile plein écran)
    const pay = face + (mythic ? 0.12 : 0.04);
    const speed = fastSpeed(si);
    curBase = speed;
    curPay = pay;
    // 3. la face apparaît
    main.call(() => {
      revealed = true;
      // toucher mis en tampon avant de voir la carte : jamais pour sauter une belle carte
      if (T >= 2) queued = false;
      U.glowColor.value.set(T === 0 ? NEUTRAL_EMBER : rr.hex);
      U.colA.value.set(rr.hex);
      U.colB.value.set(rr.accentHex);
    }, [], face);
    // 4. IMPACT + payoff : hit-stop (gel logique, le rendu continue), un seul flash, secousse à partir de la 5★
    // (son V2) le SON de l'impact part SND_LEAD plus tôt, programmé sur l'horloge audio (voir SND_LEAD)
    main.call(() => sfx.ahead(SND_LEAD / Math.max(0.2, main.timeScale()), () => {
      // 6★ : MODULATION en la majeur (+2 demi-tons) pour tout ce qui suit, glissando prismatique, les autres bus s'effacent
      if (mythic) {
        sfx.transpose = 2;
        sfx.event(4.5);
        sfx.prismatic(0.09);
      } else if (T >= 4) sfx.event(2);
      sfx.thump(0.3 + T * 0.09);
      sfx.chime(Math.max(1, T), 0.12 + T * 0.03);
      if (T >= 4) sfx.shimmer(T, 2.8, 0.1);
      if (T >= 5) sfx.choir(4, 0.1);
    }), [], Math.max(0, pay - SND_LEAD));
    main.call(() => {
      if (beat.shake > 0 && !CALM) {
        shake.impulse(4 + beat.shake * 4);
        shake2.impulse(-(3 + beat.shake * 3));
      }
      if (T >= 2) {
        U.origin.value.set(0, 0, 0.1);
        // gerbe dosée (retour testeurs : « il en faut moins ») : de ~250 (rare) à 2 200 (mythique) ; burst prismatique ×1,6 pour la 6★
        U.count.value = Math.round(Math.min(rr.particles * (mythic ? 0.3 : 0.18), (ctx.quality === 'mobile' ? 1100 : 2200) * (mythic ? 1.6 : 1)) * fxk('parts'));
        S.bt = 0;
      }
      haptics.pulse(beat.haptic);
      events.onCard?.(cursor, s.data, order.length);
      eclipseRipple();
      // hit-stop : 60 / 90 / 120 ms de gel (4★ / 5★ / 6★), jamais en défilement accéléré
      if (beat.hitStop > 0 && !CALM && curBase <= 1) hitStop(main, beat.hitStop);
    }, [], pay);
    // la tranche s'éteint après l'impact
    main.to(s.U.rim, { value: 0, duration: mythic ? 0.6 : 0.9, ease: EASE.glide }, pay);
    main.to(S, { flash: T >= 2 ? (0.35 + T * 0.16) * (CALM ? 0.4 : 1) : 0, ca: T >= 5 && !CALM ? 0.25 : 0, /* (retours 06/11) plus de franges bleu / rouge sous la 6★ */ glow: T >= 2 ? 0.8 + T * 0.25 : 0.15, trem: 0, duration: 0.05 }, pay)
      .to(S, { flash: 0, ca: 0, dark: mythic ? 0.5 : 0, duration: 1.3, ease: EASE.glide }, pay + 0.08)
      .to(S, { glow: T >= 2 ? 0.2 + T * 0.06 : 0, duration: 2.2, ease: EASE.glide }, pay + 0.1)
      .to(S, { bt: 6, duration: 6, ease: 'none' }, pay)
      .to(s.U.flash, { value: 1, duration: 0.06 }, pay)
      .to(s.U.flash, { value: 0, duration: 1.4, ease: EASE.glide }, pay + 0.06)
      .to(s.p, { y: pose.y, z: 0.08, s: 1.06 * pose.k, duration: 0.5, ease: 'back.out(2)' }, pay)
      .to(s.p, { holo: 1, duration: 1.4, ease: EASE.glide }, pay + 0.1);
    if (T >= 4) {
      // payoff « événement » (018) : flare, onde de choc ; mythique : inversion éclair de 30 ms
      main.to(S, { flare: T >= 5 ? 0.85 : 0.45, duration: 0.05, ease: 'none' }, pay)
        .to(S, { flare: 0, duration: 1.6, ease: EASE.glide }, pay + 0.1)
        .fromTo(S, { shock: 0 }, { shock: 1, duration: T >= 5 ? 1.3 : 1.0, ease: 'power2.out', immediateRender: false }, pay);
      if (T >= 5 && !CALM) main.to(S, { invert: 1, duration: 0.03 }, pay).to(S, { invert: 0, duration: 0.22, ease: 'power2.out' }, pay + 0.08);
      // ralenti juste après l'impact (jamais en version condensée), puis retour à la vitesse de base
      if (!cond && !CALM) {
        main.call(() => void gsap.to(main, { timeScale: (rr.slowmo + 0.2) * curBase, duration: 0.15 }), [], pay + 0.02);
        main.call(() => void gsap.to(main, { timeScale: curBase, duration: 0.9, ease: 'power2.in' }), [], pay + 0.3);
      }
    }
    // burst prismatique : les couleurs de la gerbe tournent (arc-en-ciel) pendant la montée des étoiles
    if (mythic && !CALM) {
      const hue = { h: 0 };
      main.to(hue, { h: 1, duration: 2.6, ease: 'none', onUpdate: () => {
        U.colA.value.setHSL(hue.h % 1, 0.85, 0.62);
        U.colB.value.setHSL((hue.h + 0.33) % 1, 0.85, 0.75);
      } }, pay);
    }
    const end = ignite(s, pay + (mythic ? 0.5 : 0.15));
    // 5. SAVOURAGE : temps minimal avant que la suite puisse repartir (plus long pour les belles cartes — Larche 2019)
    main.call(() => {
      const fast = curBase > 1;
      if (mythic) {
        // plein écran : on attend un toucher (puis l'éventail si c'était la dernière carte) ; « Tout révéler » : la
        // séquence entière est jouée, puis elle repart seule après un temps d'admiration (voir update)
        phase = last ? 'mythicHold' : 'shown';
        autoHoldUntil = performance.now() + MYTHIC_ADMIRE_MS;
        events.onMythicShown?.(s.data, last);
        return;
      }
      phase = last ? 'busy' : 'shown';
      shownAt = performance.now();
      if (auto.reveal && T >= 4) autoHoldUntil = shownAt + LEGEND_ADMIRE_MS;
      if (last) finish(fast ? 0.35 : T >= 3 ? 1.1 : 0.7);
      else flushQueued();
    }, [], T >= 4 ? Math.max(end, pay + holdT) : pay + holdT);
    // défilement auto (communes → 3★ sous le seuil) : toute la carte en accéléré
    if (speed > 1) main.timeScale(speed);
  }

  /** px CSS par unité de scène, dans le plan des cartes */
  function pxPerU() {
    return ctx.height / (2 * view().halfH);
  }
  /** ordonnée (unités de scène) d'une ligne de l'écran donnée en px CSS depuis le haut */
  function yOfPx(py: number) {
    return (ctx.height / 2 - py) / pxPerU();
  }
  /** l'interface de l'ouverture occupe le bas de l'écran (portrait, ordinateur) ; sinon elle est sur le côté (paysage court) */
  const bottomPanel = () => insets.bottom > 0 && ctx.height > 0;

  /**
   * Pose de la carte montrée (payoff) : centrée, sauf si elle passerait sous le panneau de la carte / la barre de
   * boutons (360×740…) ou sous le compteur — elle se décale alors juste assez, et rétrécit si l'espace libre entre
   * l'en-tête et le panneau ne suffit pas. Ordinateur et grands téléphones : inchangé (y 0, ×1).
   */
  function payPose(s0: number): { y: number; k: number } {
    const H = ctx.height;
    if (!H) return { y: 0, k: 1 };
    const pxU = pxPerU();
    const half = (CARD_H / 2) * s0 * 1.04 * pxU; // ×1,04 : la carte est avancée vers la caméra
    const freeTop = insets.top;
    const freeBot = H - insets.bottom - 6;
    if (H / 2 + half <= freeBot && H / 2 - half >= freeTop) return { y: 0, k: 1 };
    const k = Math.max(0.6, Math.min(1, ((freeBot - freeTop) * 0.98) / (2 * half)));
    const lo = freeTop + half * k, hi = freeBot - half * k;
    const cy = lo > hi ? (freeTop + freeBot) / 2 : Math.max(lo, Math.min(H / 2, hi));
    return { y: (H / 2 - cy) / pxU, k };
  }

  /**
   * La carte montrée part dans la rangée ; la suivante avance et sa tranche s'allume. `chain` (1 toucher par carte,
   * réf. motion §9 P0) : la suivante se retourne dans la foulée, sans second toucher.
   */
  function nextCard(chain = false) {
    phase = 'busy';
    ctx.sfx.transpose = 0; // retour en sol (la modulation ne vaut que pour la 6★ montrée)
    kill();
    const { halfH } = view();
    const move = sideline(gsap.timeline());
    const s = slots[order[cursor]];
    const j = cursor;
    move.to(s.p, { ...rowPlace(j), duration: 0.55, ease: EASE.glide, onStart: () => !quietCard(s.rr.rank, false) && air(move, 0.55, 0.1, EASE.glide, false) }, 0)
      .to(S, { glow: 0, duration: 0.4 }, 0)
      .set(s.U.lit, { value: 6 }, 0)
      .to(s.p, { holo: 1, duration: 0.4 }, 0);
    cursor++;
    const nxt = slots[order[cursor]];
    move.to(nxt.p, { z: 0, s: 1, rz: 0, duration: 0.45, ease: EASE.glide }, 0.1);
    lightRim(move, order[cursor], 0.3);
    if (cursor < order.length - 1) events.onNext?.();
    if (cursor === order.length - 1) {
      // la dernière (même mise en scène quelle que soit sa rareté) : les autres s'écartent — vers le haut quand la rangée
      // est en haut (jamais sous la barre de boutons du bas) —, la lumière baisse un peu, silence
      move.call(() => events.onLast?.(), [], 0.2);
      const away = bottomPanel() ? halfH + 0.8 : -halfH - 0.8;
      for (let k = 0; k < cursor; k++) move.to(slots[order[k]].p, { y: away, duration: 0.7, ease: EASE.heave }, 0.45 + k * 0.04);
      move.to(S, { dark: 0.22, duration: 0.8, ease: EASE.glide }, 0.45);
    }
    // (audit UX2-01) commune / peu commune : la main revient à 0,3 s (l'animation continue à côté) ; un toucher reçu
    // pendant le passage dans la rangée est rejoué ici au lieu d'être perdu
    const quick = s.rr.rank < 2 && cursor < order.length - 1;
    move.call(() => {
      phase = 'opened';
      // la suivante est un Pokémon 6★ : pas d'enchaînement — sa rencontre se déclenche sur SON toucher (la transition
      // ne part jamais toute seule pendant que la carte précédente vole encore vers la rangée)
      if (chain && !(auto.minRank > 0 || auto.reveal) && !wildPokemon(slots[order[cursor]])) {
        queued = false;
        revealCurrent();
      } else {
        if (wildPokemon(slots[order[cursor]])) queued = false; // un toucher « en trop » ne lance pas la rencontre
        flushQueued();
      }
    }, [], quick ? 0.3 : 0.55);
    if (fastCard(order[cursor - 1])) move.timeScale(2.2);
  }

  /**
   * (retours Hugo 10/11) « Direct 4★ » : toutes les cartes sous le seuil, de la carte en attente jusqu'à la première
   * belle carte, se rangent D'UN COUP dans la rangée, face visible (pas de retournement un par un, pas de défilement) ;
   * la belle carte avance devant, face cachée, et sa révélation habituelle suit (pilotage auto). Aucune carte de rang
   * ≥ seuil dans le booster : l'éventail final, tout de suite.
   */
  function jumpAhead() {
    let k = cursor;
    while (k < order.length && fastCard(order[k])) k++;
    phase = 'busy';
    queued = false;
    kill();
    if (k >= order.length) {
      for (const si of order) slots[si].U.lit.value = 6;
      finish(0);
      return;
    }
    const { halfH } = view();
    const move = sideline(gsap.timeline());
    const last = k === order.length - 1;
    // durées : jetons du référentiel motion (s) — rangement « emphatique », cascade serrée
    const dE = DUR.emphatique() / 1000, dS = DUR.standard() / 1000, st = STAGGER.serre / 1000;
    const away = bottomPanel() ? halfH + 0.8 : -halfH - 0.8;
    move.call(() => ctx.sfx.whoosh(dE, 0.06, false, EASE.glide), [], 0);
    for (let j = last ? 0 : cursor; j < k; j++) {
      const sl = slots[order[j]];
      sl.U.lit.value = 6;
      move.to(sl.p, { ...rowPlace(j), ...(last ? { y: away } : {}), flip: 0, holo: 1, duration: dE, ease: last ? EASE.heave : EASE.glide }, Math.max(0, j - cursor) * st);
    }
    move.to(S, { glow: 0, duration: dS }, 0);
    cursor = k;
    const nxt = slots[order[cursor]];
    move.to(nxt.p, { z: 0, s: 1, rz: 0, duration: dE, ease: EASE.glide }, dS / 3);
    lightRim(move, order[cursor], dE * 0.75);
    events.onJump?.(cursor, order.length);
    if (last) {
      move.call(() => events.onLast?.(), [], dS);
      move.to(S, { dark: 0.22, duration: DUR.dramatique / 1000, ease: EASE.glide }, dS);
    }
    move.call(() => {
      phase = 'opened';
      flushQueued();
    }, [], dE + dS / 3);
  }

  /**
   * Place de la j-ième carte déjà révélée (style pile). (Retours live 02) Quand l'interface occupe le bas de l'écran
   * (téléphone en portrait, ordinateur), la rangée passe EN HAUT, juste sous le compteur : avant, elle était collée au bas
   * de l'écran, sous les boutons « 4★ et + / Tout révéler / Tout passer ». La carte montrée passe devant elle.
   * Paysage court (panneau sur le côté) : en bas, comme avant.
   */
  function rowPlace(j: number) {
    const { halfH, halfW } = view();
    if (bottomPanel()) {
      const u = pxPerU();
      const rs = Math.min(0.3, (ctx.height * 0.1) / (CARD_H * u));
      const hPx = CARD_H * rs * u;
      const gap = Math.min(0.36, (2 * halfW * 0.92 - CARD_W * rs) / 3);
      return { x: (j - 1.5) * gap, y: yOfPx(insets.top + 6 + hPx / 2), z: 0.02 + j * 0.008, s: rs, rz: (j - 1.5) * 0.05 };
    }
    const rs = 0.36;
    const gap = Math.min(0.36, (2 * halfW * 0.92 - CARD_W * rs) / 3);
    const rowY = -halfH + (CARD_H * rs) / 2 + 0.06;
    return { x: (j - 1.5) * gap, y: rowY, z: 0.02 + j * 0.008, s: rs, rz: (j - 1.5) * -0.05 };
  }

  /** Places de l'éventail final (dans l'ordre de révélation) — recalculées aussi à la rotation de l'écran (UX2-12). */
  function finalPlaces() {
    const { halfH, halfW } = view();
    // téléphone (portrait) : l'en-tête est sur deux lignes, le récap est plus court (≈ 30 % du bas) → l'éventail se
    // centre dans l'espace vraiment libre et prend presque toute la largeur
    const portrait = halfW < halfH;
    // téléphone en paysage (hauteur < 500 px) : le récap prend une plus grande part de la hauteur
    const shortLand = !portrait && ctx.height > 0 && ctx.height < 500;
    // (récap compact en bas : une ligne résumé + 3 boutons ≈ 150 px → l'éventail prend plus de place qu'avant)
    const top = halfH * (portrait ? 0.76 : 0.82);
    let bottom = -halfH + 2 * halfH * (portrait ? 0.24 : shortLand ? 0.36 : 0.2);
    // (retours live 02) hauteur réelle du récap mesurée par la boutique : aucune carte de l'éventail sous le panneau
    if (sumInset > 0 && ctx.height > 0) bottom = Math.max(bottom, yOfPx(ctx.height - sumInset - 10));
    const n = order.length;
    // taille : limitée par la hauteur libre ET par la largeur (téléphone en portrait : les 5 cartes, qui se
    // chevauchent d'environ 40 %, doivent tenir sans déborder des bords de l'écran)
    const wk = portrait ? 0.92 : 0.9;
    const sc = Math.max(0.12, Math.min(0.72, ((top - bottom - 0.08) * 0.9) / CARD_H, (2 * halfW * wk) / (CARD_W * (1 + (n - 1) * 0.62))));
    const gap = Math.min(0.52, (2 * halfW * wk - CARD_W * sc * 1.08) / Math.max(1, n - 1));
    const cy = (top + bottom) / 2 + 0.03;
    // (audit UX2-18) la meilleure carte (révélée en dernier) prend la place d'honneur, au CENTRE et devant ; les moins
    // rares vont sur les bords (positions de gauche à droite : 2e, 4e, 5e, 3e, 1re révélées)
    const POS5 = [4, 0, 3, 1, 2];
    return order.map((_, k) => {
      const c = (n === 5 ? POS5[k] : k) - (n - 1) / 2;
      return { x: c * gap, y: cy - c * c * 0.02, z: 0.03 - Math.abs(c) * 0.01, s: sc, rz: -c * 0.07 };
    });
  }

  function finish(delay: number) {
    queued = false;
    ctx.sfx.transpose = 0;
    autoWait = false;
    if (!seriesLast) {
      // morceau d'un gros booster : les cartes filent dans la rangée, sans éventail ni son, et la suite enchaîne
      const tl3 = sideline(gsap.timeline({ delay: Math.min(delay, 0.35) }));
      order.forEach((si, k) => tl3.to(slots[si].p, { ...rowPlace(k), flip: 0, duration: 0.45, ease: EASE.glide }, k * 0.03));
      tl3.call(() => {
        phase = 'done';
        events.onDone?.();
      }, [], 0.35);
      return;
    }
    const places = finalPlaces();
    const tl2 = sideline(gsap.timeline({ delay }));
    tl2.call(() => ctx.sfx.whoosh(0.45, 0.07), [], 0);
    order.forEach((si, k) => {
      const s = slots[si];
      tl2.to(s.p, { ...places[k], flip: 0, holo: 1, duration: 0.9, ease: EASE.glide }, k * 0.05);
      tl2.set(s.U.lit, { value: 6 }, 0);
      // chaque carte « se pose » dans l'éventail : un petit tic de plus en plus aigu
      tl2.call(() => ctx.sfx.tick(1.05 + k * 0.09, 0.035), [], 0.55 + k * 0.06);
    });
    tl2.to(S, { dark: 0, glow: 0, push: 0, duration: 0.8 }, 0);
    tl2.call(() => {
      phase = 'done';
      events.onDone?.();
    }, [], 0.5);
  }

  function advance() {
    if (phase === 'scene') return; // la rencontre Pokémon a la main : aucun toucher ne passe à travers
    autoWait = false;
    if (phase === 'mythicHold') {
      // la 6★ plein écran a été admirée : place à l'éventail
      phase = 'busy';
      finish(0.25);
      return;
    }
    if (phase === 'sealed') {
      // un toucher l'ouvre tout seul (déchirure ou retroussé automatique) ; Déchirure glacée : un toucher = un coup
      if (icing) return void iceTap();
      // (27/11) Étoile : un toucher, l'étoile se trace toute seule
      if (starring) return void autoStar();
      startAutoTear(rolling ? RETROUSSE.auto : windowing ? FENETRE.auto : 1.05);
      return;
    }
    if (phase === 'opened') revealCurrent();
    else if (phase === 'shown') nextCard(true);
    // (audit UX2-16) légendaire / mythique : le suspense reste sacré, mais un toucher APRÈS le payoff accélère la fin
    // (étoiles, flare) : ×1,6 pour une 5★, ×2,5 pour une 6★
    else if (phase === 'busy' && tl && curTier >= 4 && tl.time() > curPay) {
      const boost = curTier >= 5 ? 2.5 : 1.6;
      if (curBase < boost) {
        curBase = boost;
        gsap.killTweensOf(tl);
        tl.timeScale(boost);
      }
    }
    // toucher pendant une révélation : on l'accélère (avant l'apparition de la face : pour toutes les cartes, la
    // rareté n'étant pas encore connue ; après : jamais une légendaire ou une mythique, leur effet est sacré)
    else if (phase === 'busy' && tl && curTier < 4 && tl.timeScale() < 2) tl.timeScale(2.2);
    // (audit UX2-01) transition sans timeline principale (carte qui file dans la rangée), ou toucher de plus pendant une
    // commune déjà accélérée : le toucher est gardé et rejoué dès que la scène attend de nouveau (un toucher gardé avant
    // l'apparition d'une rare ou mieux est oublié à son apparition)
    else if (phase === 'busy' && (!tl || curTier < 2)) queued = true;
  }

  function reset() {
    killAll();
    eclipseReset();
    if (ctx) {
      ctx.sfx.transpose = 0;
      ctx.sfx.setPackColor(null);
      ctx.sfx.padHold('opening', false);
    }
    pack = null;
    prepared = null;
    disposeSlots();
    Object.assign(S, { flash: 0, ca: 0, dark: 0, push: 0, glow: 0, trem: 0, bt: 99, flare: 0, shock: 0, invert: 0 });
    Object.assign(B, { y: -0.4, z: 0, spin: 0, s: 0.9, burn: -0.25, leak: 0, show: 1, follow: 0 });
    holding = false;
    phase = 'display';
    style = 'idle';
    rolling = false;
    windowing = false;
    icing = false;
    ICE.t = -1;
    starring = false;
    starAuto?.kill();
    starAuto = null;
    STARON.value = 0;
    winQ.length = 0;
    winKeep = 0;
    winHeadWait = null; // (suite d'une Fenêtre abandonnée : jamais jouée)
    queued = false;
    curBase = 1;
    revealed = false;
    autoWait = false;
    sumInset = 0;
    followZ = -PACK_OPEN_Z;
    autoTear?.kill();
    autoTear = null;
    tearTarget = tearProgress = tearPrevTarget = tearVel = tearWeld = 0;
    tearSlip = tearFling = false;
    TSLIT.value = 0;
    TP.value = 0;
    fly.t = 0;
    sh.forEach((q) => (q.life = 0));
    shredsDirty = true;
    if (packMeshMain) packMeshMain.visible = true;
    setTearVisible(false);
    useBake = false;
    bakeExit.t = -1;
    // (27/11) Retroussé : plus de remontée, défilement rendu ; une famille de cuissons quittée se libère ici (hors ouverture)
    R.k = R.s = 0;
    rollQ.length = 0;
    rollSidePrev = null;
    rollHeadWait = null; // (suite d'un Retroussé abandonné : jamais jouée)
    setRollLock(false);
    releaseFamilies();
    applyBoosterArt(boosterKey);
    tl = gsap.timeline();
    tl.to(B, { y: 0, s: 1, duration: 0.8, ease: 'back.out(1.4)' });
  }

  /** rectangle écran (px CSS) d'une carte, d'après sa matrice à la dernière image (le décalage de vue est dans la projection) */
  function screenRect(sl: Slot) {
    const w = ctx.width, hh = ctx.height;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      proj.set((cx * CARD_W) / 2, (cy * CARD_H) / 2, 0).applyMatrix4(sl.mesh.matrixWorld).project(stage.camera);
      const px = (proj.x * 0.5 + 0.5) * w, py = (0.5 - proj.y * 0.5) * hh;
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
    }
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  }

  // ───────────────────────────────────────────── API
  const api: OpeningScene = {
    get phase() {
      return phase;
    },
    /** diagnostic (tests) : ralenti de toutes les timelines (captures de la sortie simulée) */
    slowMo(k: number) {
      gsap.globalTimeline.timeScale(k);
    },
    pose(o) {
      gsap.globalTimeline.timeScale(0);
      bakeExit.t = o.exit;
      poseStrip = o.strip ?? null;
      order.forEach((si, k) => {
        const c = o.cards[k];
        if (c) Object.assign(slots[si].p, c);
      });
    },
    /** diagnostic (tests) : état de la pile */
    debug() {
      return { style, booster: boosterKey, want: wantKey, arts: [...arts.keys()], artOk: { pack: packNodes.front?.value === arts.get(boosterKey)?.front, tear: tearNodes.every((n) => n.front.value === arts.get(boosterKey)?.front) }, leak: { u: +(U.leak.value as number).toFixed(3), glow: +S.glow.toFixed(3), t: +sealedT.toFixed(2), ember: '#' + (U.ember.value as Color).getHexString() }, eclipse: { on: eclipse, aura: +E.aura.toFixed(2), dark: +E.dark.toFixed(2), sky: +E.sky.toFixed(2), rip: +E.rip.toFixed(2) }, reveal: { revealed, curTier, autoWait, timeScale: tl ? +tl.timeScale().toFixed(2) : 0 }, tear: { target: +tearTarget.toFixed(3), progress: +tearProgress.toFixed(3), holding, weld: tearWeld, slit: +(TSLIT.value as number).toFixed(3), bake: useBake ? (bakePlayer?.header.index ?? -1) : -1, roll: rolling ? (rollPlayer?.header.index ?? -1) : -1, rollReady, win: windowing ? (winPlayer?.header.index ?? -1) : -1, winReady, iceReady, followZ: +followZ.toFixed(4), play: +bakePlay.toFixed(3), exit: +bakeExit.t.toFixed(3) }, fx: { flare: +S.flare.toFixed(2), shock: +S.shock.toFixed(2), invert: +S.invert.toFixed(2) }, cursor, order: [...order], insets: { ...insets, sum: sumInset }, slots: slots.map((s) => ({ id: s.data.cardId, name: s.data.cardName, art: s.cd.name, rarity: s.data.rarity, flip: +s.p.flip.toFixed(2), z: +s.p.z.toFixed(3), rect: screenRect(s) })) };
    },
    setBooster,
    setEventBooster(ev) {
      const sig = ev ? `${ev.name}|${ev.accent}|${ev.endAt ?? ''}` : '';
      if (sig === eventSig) return;
      eventSig = sig;
      eventWant = ev ? { name: ev.name, accent: ev.accent, endAt: ev.endAt } : null;
      if (ctx) applyEventStyle(); // (sinon : appliqué au setup)
    },
    open,
    preload(p: SealedPack) {
      if (preloaded.has(p.id) || preloaded.size >= 2 || !p.cards.length || p.id === pack?.id) return;
      const tok = { on: true };
      const pr = buildAll(p, () => tok.on);
      preloaded.set(p.id, { pr, tok });
      pr.catch(() => preloaded.get(p.id)?.pr === pr && preloaded.delete(p.id));
    },
    reset,
    advance,
    /** pour le shell : 'rest' = vitrine / récap final (définition 3D modifiable) ; 'prepare' = cartes du booster en construction */
    pacing: () => (phase === 'sealed' && !slots.length ? 'prepare' : phase === 'display' || phase === 'done' ? 'rest' : 'busy'),
    setAuto(o) {
      if (o.burn !== undefined) auto.burn = o.burn;
      if (o.minRank !== undefined) auto.minRank = o.minRank;
      if (o.reveal !== undefined) auto.reveal = o.reveal;
      if (o.jump !== undefined) auto.jump = o.jump;
      // carte en cours de révélation sous le nouveau seuil : on accélère tout de suite (face pas encore visible : la
      // vitesse commune, la même pour toutes — anti-spoil)
      const sp = revealed ? fastSpeed(order[cursor]) : preSpeed();
      if (sp > 1 && phase === 'busy' && tl && tl.timeScale() < sp) {
        curBase = sp;
        tl.timeScale(sp);
      }
    },
    setInsets(top, bottom) {
      insets.top = Math.max(0, top);
      insets.bottom = Math.max(0, bottom);
    },
    setSummaryInset(px) {
      const v = Math.max(0, Math.round(px));
      if (Math.abs(v - sumInset) < 2) return;
      sumInset = v;
      // éventail déjà posé : il se replace au-dessus du récap (0,3 s)
      if (phase === 'done' && slots.length && order.length) {
        const places = finalPlaces();
        const re = sideline(gsap.timeline());
        // (overwrite : l'éventail est peut-être encore en vol vers ses anciennes places)
        order.forEach((si, k) => re.to(slots[si].p, { ...places[k], duration: 0.3, ease: EASE.glide, overwrite: 'auto' }, 0));
      }
    },
    onThumb: null,
    onFanMove: null,
    onBoosterTap: null,
    setFocusOffset(px, py = 0) {
      focusT = px;
      focusTY = py;
    },
    onBoosterSwipe: null,
    onWheelReady: null,
    setReelKeys(keys) {
      reelKeys = keys;
      reel?.setKeys(keys);
    },
    onReelCommit: null,
    reelTo(k) {
      return !!reel?.spinTo(k);
    },
    reelActive() {
      return !!reel?.active;
    },
    reelLock: null,
    setWheel(items) {
      wheelItems = items;
      wheelDirty = true;
      // la roue bouge-t-elle ? (pose des pochettes différente de l'image précédente) → pas d'envoi de textures pendant
      let sig = 0;
      if (items) for (const it of items) sig += it.x * 1.31 + it.y * 0.77 + it.z * 0.37 + it.rotY * 7.1 + it.rotZ * 3.3 + it.dim * 3.1;
      if (sig !== wheelSig) {
        wheelSig = sig;
        wheelMovedAt = performance.now();
      }
    },
    wheelView() {
      if (!wheel3d || !ctx || !ready3d) return null;
      return { P: cameraScale(stage.camera, ctx.height).P, ox: ctx.width / 2 + focusCur, oy: ctx.height / 2 + focusCurY };
    },
    boosterRect() {
      if (phase !== 'display' || !packMeshRef || !ctx) return null;
      packMeshRef.updateWorldMatrix(true, false);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        proj.set((cx * PACK.w) / 2, (cy * PACK.h) / 2, 0).applyMatrix4(packMeshRef.matrixWorld).project(stage.camera);
        const px = (proj.x * 0.5 + 0.5) * ctx.width, py = (0.5 - proj.y * 0.5) * ctx.height;
        x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
      }
      return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
    },
    hintPulse() {
      hintLiftUntil = sceneT + 0.55;
    },
    fanRects() {
      if (phase !== 'done' || !slots.length) return null;
      return order.map((si) => ({ card: slots[si].data, ...screenRect(slots[si]) }));
    },
    setBoosterSoon(on) {
      soonT = on ? 1 : 0;
    },
    packThumb(k, size) {
      // (07/11) nom moulé : la face « vignette » (relief ombré une fois) — la couleur seule ne le montrerait presque pas
      const a = arts.get(k);
      const src = (a?.thumbFront ?? a?.front.image) as HTMLCanvasElement | undefined;
      if (!src?.width) return null;
      // (téléphone, écran ×3 : la vignette de 26 px CSS en demande ~84 → 96 au lieu de 64, sinon floue)
      const tw = Math.min(src.width, size ?? (ctx?.quality === 'mobile' ? 96 : 64));
      const ck = `${k}|${tw}`;
      const hit = thumbCache.get(ck);
      if (hit !== undefined) return hit || null; // (chaîne vide = encodage en cours)
      thumbCache.set(ck, '');
      const w = tw, h = Math.round((tw * src.height) / src.width);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      // (audit perf 28/11) en mémoire vive : `toBlob` relit la toile — accélérée, il attendait la file du GPU
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, w, h);
      // (audit PERF2-18) encodage asynchrone hors du thread principal, WebP (≈ 5× plus léger ; PNG si non pris en charge),
      // une seule fois par booster et par taille
      c.toBlob((b) => {
        if (!b) return void thumbCache.delete(ck);
        thumbCache.set(ck, URL.createObjectURL(b));
        api.onThumb?.(k);
      }, 'image/webp', 0.85);
      return null;
    },
    resumeAfterScene() {
      if (phase !== 'scene') return;
      killAll();
      queued = false;
      const si = order[cursor];
      const s = slots[si];
      if (!s) return;
      const last = cursor === order.length - 1;
      Object.assign(s.p, { flip: 0, holo: 1, z: 0.08 });
      s.U.lit.value = 6;
      s.U.rim.value = 0;
      S.dark = 0;
      S.glow = 0.3;
      revealed = true;
      curTier = s.rr.tier;
      events.onCard?.(cursor, s.data, order.length);
      eclipseRipple();
      if (last) {
        phase = 'busy';
        finish(0.05);
      } else {
        const pose = payPose(1.06);
        Object.assign(s.p, { y: pose.y, s: 1.06 * pose.k });
        phase = 'shown';
      }
    },
    resumeReveal() {
      if (phase !== 'scene' || !order.length) return;
      preluded = cursor;
      revealCurrent();
    },
    revealRect() {
      const s = slots[order[cursor]];
      return s ? screenRect(s) : null;
    },
    resumeAfterCinematic() {
      if (phase !== 'scene' || !order.length) return;
      killAll();
      const si = order[cursor];
      const s = slots[si];
      if (!s) return;
      const rr = s.rr;
      const last = cursor === order.length - 1;
      const pose = payPose(1.12);
      // retour de la cinématique : la carte est déjà face visible, à sa pose de payoff ; le flash de sortie s'éteint ici
      Object.assign(s.p, { flip: 0, y: pose.y, z: 0.08, s: 1.06 * pose.k, holo: 1 });
      s.U.rim.value = 0;
      s.U.tease.value = 1;
      revealed = true;
      curTier = rr.tier;
      curBase = 1;
      queued = false;
      U.glowColor.value.set(rr.hex);
      U.colA.value.set(rr.hex);
      U.colB.value.set(rr.accentHex);
      Object.assign(S, { dark: 0.5, glow: 0.5, trem: 0, flash: 0.9, ca: 0, flare: 0 });
      ctx.sfx.transpose = 2;
      phase = 'busy';
      events.onMythic?.(s.data);
      events.onCard?.(cursor, s.data, order.length);
      eclipseRipple();
      const main = (tl = gsap.timeline());
      main.to(S, { flash: 0, duration: 0.9, ease: EASE.glide }, 0);
      const end = ignite(s, 0.35);
      main.call(() => {
        phase = last ? 'mythicHold' : 'shown';
        autoHoldUntil = performance.now() + MYTHIC_ADMIRE_MS;
        events.onMythicShown?.(s.data, last);
      }, [], end);
    },
    finishAfterSecret() {
      killAll();
      // les cartes déjà révélées reviennent ; la secrète est face visible (la séquence 039 vient de la montrer)
      const s = slots[order[order.length - 1]];
      Object.assign(s.p, { flip: 0, z: 0, s: 1, holo: 1 });
      s.U.lit.value = 6;
      S.dark = 0;
      finish(0.05);
    },

    async setup(c) {
      ctx = c;
      c.bag.fn(onReducedMotionChange((on) => (fxLow = on)));
      const mobile = c.quality === 'mobile';
      // mobile : calques à la taille réelle de la carte à l'écran (×2) — avant, 0,62 / 0,45 fixes → flou, texte baveux
      artScale = mobile ? mobileArtScale(c.width, c.height, 0.7) : 0.85;
      backArtScale = mobile ? artScale : 0.6;
      stage = createStage(c, { bg: ['#000000', '#000000'] /* (C4) noir profond */, env: 'studio', envIntensity: 1.25, fill: 0.62, frameW: PACK_FRAME.w, frameH: PACK_FRAME.h });
      key = new DirectionalLight(0xfff2e6, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, rig);
      rig.add(packRig, cardsRig);
      camBase = stage.camera.position.z;
      layout(c.width, c.height);
      // (audit 12/11, S06) jalons du montage dans le rapport « Chargement » : où passent les secondes entre 35 et 85 %
      let lapAt = performance.now();
      const lap = (name: string) => {
        const now = performance.now();
        perfMark(`ouv:${name}`, now - lapAt, now);
        lapAt = now;
      };
      lap('scène'); // i18n-ok
      await ensureFonts();
      lap('polices');

      // boosters : un visuel par thème + le bébou pack, générés une fois (+ le booster du moment s'il y en a un)
      styles = boosterStyles();
      for (const [k, st] of Object.entries(styles)) accents.set(k, new Color(st.accent));
      applyEventStyle();
      // (audit PERF1-15) seul le booster affiché d'abord (le dernier choisi) est généré sous l'écran de chargement ; les
      // autres suivent en tâche de fond, un par image, une fois la vitrine affichée (setBooster / open les attendent)
      try {
        const last = localStorage.getItem('bebou.booster');
        if (last && styles[last]) boosterKey = last;
      } catch {
        /* ignore */
      }
      allKeys = Object.keys(styles).filter((k) => k !== EVENT_KEY);
      arts.set(boosterKey, c.bag.add(await boosterArt(boosterKey, styles[boosterKey])));
      lap('visuel du booster'); // i18n-ok
      startArts = async () => {
        await nextFrame();
        await nextFrame();
        for (;;) {
          // le booster demandé (choisi ou en cours d'ouverture) passe devant les autres
          const k = wantKey && !arts.has(wantKey) && styles[wantKey] && !genBusy.has(wantKey) ? wantKey : Object.keys(styles).find((x) => !arts.has(x) && !genBusy.has(x));
          if (!k) break;
          await genArt(k);
          await nextFrame();
        }
        artsLoopDone = true;
        allowMoreBakes(() => phase === 'display' || phase === 'done'); // (audit perf 28/11, n°11) variantes de déchirure suivantes, au repos
      };
      c.bag.fn(() => thumbCache.forEach((u) => u && URL.revokeObjectURL(u)));
      const packGeo = c.bag.add(createPackGeometry(48, 72, { folds: false }));
      const packMesh = new Mesh(packGeo, buildPackMaterials(arts.get(boosterKey)!));
      // jumeaux pour la roue verticale (ordinateur) : même maillage, mêmes matériaux ; visibles pendant le préchauffage
      if (!mobile) {
        const soon0 = uniform(0) as unknown as N;
        for (let i = 0; i < TWINS; i++) {
          const swaps: ArtSwap[] = [];
          const shade = uniform(1);
          const mesh = new Mesh(packGeo, buildPackMaterials(arts.get(boosterKey)!, { swaps, soon: soon0, shade: shade as unknown as N }));
          (mesh.material as Material[]).forEach((m) => c.bag.add(m));
          const rig = new Group();
          rig.add(mesh);
          stage.scene.add(rig);
          twins.push({ rig, mesh, swaps, shade, key: null });
        }
        c.bag.fn(() => twins.splice(0).forEach((tw) => stage.scene.remove(tw.rig)));
      }
      packMeshRef = packMeshMain = packMesh;
      (packMesh.material as Material[]).forEach((m) => c.bag.add(m));
      packRig.add(packMesh);
      // booster déchirable (Bebou / World) : même maillage, deux passes (corps sous le bord dentelé, bande au-dessus)
      // — plus de colonnes que le booster de vitrine pour un bord net et un enroulement lisse
      const tearGeo = c.bag.add(createPackGeometry(96, 80, { folds: false }));
      tearBody = new Mesh(tearGeo, buildTearMaterials(arts.get(boosterKey)!, 'body'));
      tearStrip = new Mesh(tearGeo, buildTearMaterials(arts.get(boosterKey)!, 'strip'));
      for (const m of [tearBody, tearStrip]) {
        (m.material as Material[]).forEach((x) => c.bag.add(x));
        m.frustumCulled = false;
        packRig.add(m);
      }
      // déchirure simulée : les meshes naissent dès que le 1er enregistrement est là (attendu au plus 1,5 s ici, sous
      // l'écran de chargement, pour être compilés avec le reste ; sinon plus tard, compilés à part)
      {
        let gone = false;
        c.bag.fn(() => {
          gone = true;
          bakedMats = rollMats = null; // (libérés par le sac)
        });
        const mount = (b: Awaited<ReturnType<typeof loadTearBakes>>) => {
          if (!b || gone || bakePlayer) return false;
          bakePlayer = new TearBakePlayer(b);
          const pl = bakePlayer;
          // (27/11) remontage après une libération : mêmes matériaux (déjà dans le sac), aucun nœud de plus ; le lecteur
          // libéré l'a été par releaseFamilies, le sac ne garde que le lecteur courant
          const fresh = !bakedMats;
          if (fresh) c.bag.fn(() => bakePlayer?.dispose());
          bakedMats ??= { body: buildTearMaterials(arts.get(boosterKey)!, 'body', true), strip: buildTearMaterials(arts.get(boosterKey)!, 'strip', true) };
          bakedBody = new Mesh(pl.body, bakedMats.body);
          bakedStrip = new Mesh(pl.strip, bakedMats.strip);
          for (const m of [bakedBody, bakedStrip]) {
            if (fresh) (m.material as Material[]).forEach((x) => c.bag.add(x));
            m.frustumCulled = false;
            m.visible = false;
            packRig.add(m);
          }
          return true;
        };
        /**
         * (27/11) RETROUSSÉ : son lecteur et sa maille, sur le modèle de `mount` (cachée, dans le sachet). Ses deux
         * matériaux sont précompilés avec le reste s'il arrive à temps, sinon par `warmLate` — jamais pendant une ouverture.
         */
        const mountRoll = (b: TearBake | null) => {
          if (!b || gone || rollPlayer) return false;
          rollPlayer = new TearBakePlayer(b);
          // (27/11) remontage après une libération : mêmes matériaux (déjà dans le sac), aucun nœud de plus
          const fresh = !rollMats;
          rollMats ??= buildRollMaterials(arts.get(boosterKey)!);
          rollBody = new Mesh(rollPlayer.body, rollMats);
          if (fresh) rollMats.forEach((x) => c.bag.add(x));
          rollBody.frustumCulled = false;
          rollBody.visible = false;
          packRig.add(rollBody);
          return true;
        };
        c.bag.fn(() => rollPlayer?.dispose());
        /**
         * (27/11) FENÊTRE : son lecteur et ses deux mailles (sachet troué, panneau), mêmes matériaux que le Retroussé
         * (extérieur du sachet, envers en alu mat, des deux côtés : on voit l'intérieur du dos par le trou)
         */
        const mountWin = (b: TearBake | null) => {
          if (!b || gone || winPlayer) return false;
          winPlayer = new TearBakePlayer(b);
          const fresh = !winMats;
          winMats ??= buildRollMaterials(arts.get(boosterKey)!, { win: true });
          winBody = new Mesh(winPlayer.body, winMats);
          winPanel = new Mesh(winPlayer.strip, winMats);
          if (fresh) winMats.forEach((x) => c.bag.add(x));
          for (const m of [winBody, winPanel]) {
            m.frustumCulled = false;
            m.visible = false;
            packRig.add(m);
          }
          return true;
        };
        c.bag.fn(() => winPlayer?.dispose());
        /**
         * (27/11) DÉCHIRURE GLACÉE : un lecteur par variante cuite ; deux mailles (film gelé, puis la glace, transparente,
         * dessinée après) dont la géométrie suit la variante tirée au 1er coup
         */
        const mountIce = (b: ShatterBake | null) => {
          if (!b || gone || icePlayers.some((p) => p.bake === b)) return false;
          const pl = new ShatterPlayer(b);
          icePlayers.push(pl);
          if (iceMesh) return true;
          const fresh = !iceMats;
          iceMats ??= { ice: buildIceMaterial(arts.get(boosterKey)!), film: buildRollMaterials(arts.get(boosterKey)!, { frost: true }) };
          if (fresh) [iceMats.ice, ...iceMats.film].forEach((x) => c.bag.add(x));
          iceFilm = new Mesh(pl.film, iceMats.film);
          iceMesh = new Mesh(pl.ice, iceMats.ice);
          iceMesh.renderOrder = 2;
          for (const m of [iceFilm, iceMesh]) {
            m.frustumCulled = false;
            m.visible = false;
            packRig.add(m);
          }
          return true;
        };
        c.bag.fn(() => icePlayers.forEach((p) => p.dispose()));
        /** précompile des mailles montées après le préchauffage : hors champ (derrière la caméra), en vitrine seulement */
        const warmLate = async (ms: Mesh[]) => {
          const wait = () => new Promise<void>((r) => setTimeout(r, 400));
          while (!gone && (!ready3d || phase !== 'display' || document.hidden)) await wait();
          if (gone) return false;
          for (const m of ms) {
            stage.scene.add(m); // (retirée du sachet le temps de la compilation)
            m.position.set(0, 0, camBase + 10); // derrière la caméra : soumise au rendu (pipelines), aucun pixel
            m.visible = true;
            m.updateMatrixWorld(true);
          }
          try {
            await compileReal();
            await nextFrame();
            await nextFrame();
          } finally {
            for (const m of ms) {
              m.position.set(0, 0, 0);
              m.visible = false;
              // (27/11) maille libérée pendant la compilation (le joueur est revenu à l'autre ouverture) : retirée de la
              // scène, pas remise orpheline dans le sachet
              if (m === rollBody || m === bakedBody || m === bakedStrip || m === winBody || m === winPanel || m === iceMesh || m === iceFilm) packRig.add(m);
              else {
                m.dispatchEvent({ type: 'dispose' } as never); // (comme releaseSlot : ses matériaux sont gardés)
                stage.scene.remove(m);
              }
            }
          }
          return !gone;
        };
        const lateRoll = async (b: TearBake | null) => {
          if (bakeFam !== 'retrousse' || gone) return;
          if (!rollPlayer && !mountRoll(b)) return;
          if (!rollReady && (await warmLate([rollBody!])) && bakeFam === 'retrousse') {
            rollReady = true;
            // le Retroussé est prêt : la Déchirure n'a plus besoin de ses cuissons (libérées hors ouverture)
            toRelease.add('tear');
            releaseFamilies();
          }
        };
        const lateWin = async (b: TearBake | null) => {
          if (bakeFam !== 'fenetre' || gone) return;
          if (!winPlayer && !mountWin(b)) return;
          if (!winReady && (await warmLate([winBody!, winPanel!])) && bakeFam === 'fenetre') {
            winReady = true;
            toRelease.add('tear');
            releaseFamilies();
          }
        };
        const lateIce = async (b: ShatterBake | null) => {
          if (bakeFam !== 'glace' || gone) return;
          mountIce(b);
          if (!iceReady && iceMesh && iceFilm && (await warmLate([iceFilm, iceMesh])) && bakeFam === 'glace') {
            iceReady = true;
            toRelease.add('tear');
            releaseFamilies();
          }
        };
        const lateTear = async (b: TearBake | null) => {
          if (bakeFam !== 'tear' || gone || bakePlayer || !mount(b)) return;
          warmingTear = true;
          try {
            await warmLate([bakedBody!, bakedStrip!]);
          } finally {
            warmingTear = false;
          }
        };
        /** libère (hors ouverture) les familles quittées : cuissons oubliées, lecteur libéré, maille retirée */
        releaseFamilies = () => {
          if (phase !== 'display' || gone) return;
          for (const fam of [...toRelease]) {
            if (fam === 'tear' && warmingTear) continue; // (repassera au prochain retour en vitrine)
            toRelease.delete(fam);
            if (fam === bakeFam) continue; // (le joueur est revenu à ce choix entre-temps)
            if (fam === 'glace') {
              dropShatters();
              iceReady = false;
              for (const m of [iceMesh, iceFilm]) if (m) (m.dispatchEvent({ type: 'dispose' } as never), packRig.remove(m));
              icePlayers.forEach((p) => p.dispose());
              icePlayers.length = 0;
              icePlayer = null;
              iceMesh = iceFilm = null;
              continue;
            }
            dropBakes(fam);
            // (comme releaseSlot) les matériaux sont gardés pour le remontage : sans cet événement, ils retiendraient
            // par leur écouteur la maille retirée et les tableaux de sa géométrie
            if (fam === 'retrousse' && rollPlayer && rollBody) {
              rollReady = false;
              rollBody.dispatchEvent({ type: 'dispose' } as never);
              packRig.remove(rollBody);
              rollPlayer.dispose();
              rollPlayer = null;
              rollBody = null;
            } else if (fam === 'fenetre' && winPlayer && winBody && winPanel) {
              winReady = false;
              winBody.dispatchEvent({ type: 'dispose' } as never);
              winPanel.dispatchEvent({ type: 'dispose' } as never);
              packRig.remove(winBody, winPanel);
              winPlayer.dispose();
              winPlayer = null;
              winBody = winPanel = null;
            } else if (fam === 'tear' && bakePlayer && bakedBody && bakedStrip) {
              bakedBody.dispatchEvent({ type: 'dispose' } as never);
              bakedStrip.dispatchEvent({ type: 'dispose' } as never);
              packRig.remove(bakedBody, bakedStrip);
              bakePlayer.dispose();
              bakePlayer = null;
              bakedBody = bakedStrip = null;
            }
          }
        };
        // le joueur change d'ouverture en cours de session : la famille de cuissons suit (chargée, montée, précompilée
        // hors ouverture) ; l'autre est libérée au retour en vitrine
        choiceHook = (s) => {
          const fam: SceneFam = s === 'retrousse' || s === 'fenetre' || s === 'glace' ? s : 'tear';
          if (fam === bakeFam) return;
          const was = bakeFam;
          bakeFam = fam;
          if (was === 'retrousse') rollReady = false;
          if (was === 'fenetre') winReady = false;
          if (was === 'glace') iceReady = false;
          if (was !== 'tear') {
            toRelease.add(was);
            releaseFamilies();
          }
          // (27/11) leurs sons (livre `ouvertures`) se cuisent en même temps que leurs cuissons se chargent
          if (fam !== 'tear') ctx.sfx.loadBook('ouvertures');
          if (fam === 'retrousse') void loadBakes('retrousse').then(lateRoll);
          else if (fam === 'fenetre') void loadBakes('fenetre').then(lateWin);
          else if (fam === 'glace') void loadShatters().then(lateIce);
          else void loadTearBakes().then(lateTear);
        };
        c.bag.fn(() => {
          choiceHook = null;
          rollReady = false;
          winReady = false;
          iceReady = false;
          setRollLock(false);
        });
        if (chosenStyle === 'glace') {
          // (27/11) Déchirure glacée choisie : on ne charge QUE ses éclats ; même attente bornée que la Déchirure
          bakeFam = 'glace';
          ctx.sfx.loadBook('ouvertures');
          const first = loadShatters();
          lap('sachet');
          const b0 = await Promise.race([first, new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
          lap(`attente glace${b0 ? '' : ' (pas arrivée)'}`); // i18n-ok
          if (b0 && mountIce(b0)) iceWarm = iceMesh!.visible = iceFilm!.visible = true;
          else void first.then(lateIce);
        } else if (chosenStyle === 'fenetre') {
          // (27/11) Fenêtre choisie : on ne charge QUE ses cuissons ; même attente bornée que la Déchirure
          bakeFam = 'fenetre';
          ctx.sfx.loadBook('ouvertures');
          const first = loadBakes('fenetre');
          lap('sachet');
          const b0 = await Promise.race([first, new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
          lap(`attente fenêtre${b0 ? '' : ' (pas arrivée)'}`); // i18n-ok
          if (b0 && mountWin(b0)) winWarm = winBody!.visible = winPanel!.visible = true;
          else void first.then(lateWin);
        } else if (chosenStyle !== 'retrousse') {
          const first = loadTearBakes();
          lap('sachet');
          const b0 = await Promise.race([first, new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
          lap(`attente déchirure${b0 ? '' : ' (pas arrivée)'}`); // i18n-ok
          // arrivé à temps : visible pendant le préchauffage (pipelines créés avec le reste), caché ensuite ; sinon
          // monté caché, compilé à sa première déchirure
          if (b0 && mount(b0)) bakedBody!.visible = bakedStrip!.visible = true;
          else void first.then(mount);
        } else {
          // (27/11) Retroussé choisi : on ne charge QUE ses cuissons ; même attente bornée que la Déchirure
          bakeFam = 'retrousse';
          ctx.sfx.loadBook('ouvertures');
          const first = loadBakes('retrousse');
          lap('sachet');
          const b0 = await Promise.race([first, new Promise<null>((r) => setTimeout(() => r(null), 1500))]);
          lap(`attente retroussé${b0 ? '' : ' (pas arrivé)'}`); // i18n-ok
          if (b0 && mountRoll(b0)) rollWarm = rollBody!.visible = true;
          else void first.then(lateRoll);
        }
      }
      const shredMat = new MeshPhysicalNodeMaterial({ side: DoubleSide });
      shredMat.colorNode = mix(color('#e9e3da'), U.ember as unknown as N, 0.25);
      shredMat.metalnessNode = float(0.8);
      shredMat.roughnessNode = float(0.3);
      // (27/11) Étoile de Noël : les lambeaux deviennent des paillettes d'or qui brillent d'elles-mêmes (scintillement)
      shredMat.emissiveNode = (U.ember as unknown as N).mul(STARON.mul(float(1.6).add(sin(time.mul(23).add(positionLocal.x.mul(400))).mul(1.2))));
      shreds = new InstancedMesh(c.bag.add(new PlaneGeometry(0.014, 0.006)), c.bag.add(shredMat), NSH);
      shreds.frustumCulled = false;
      packRig.add(shreds);

      cardGeo = c.bag.add(createCardGeometry());
      backs = themedBacks(c.bag, backArtScale);
      backMat = backs.fallback;

      // halo derrière la carte (suspense, rareté)
      const glowMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      // (audit 12/11, S17 / E4-20) halo dessiné sur un dodécagone circonscrit au cercle utile (au-delà du rayon 1 il vaut
      // exactement 0) au lieu du carré : mêmes pixels, 20 % de surface mélangée en moins
      const gd = length(uv().sub(0.5).mul(2 * HALO_K));
      glowMat.colorNode = vec4((U.glowColor as unknown as N).mul(smoothstep(1, 0, gd).pow(2.2).mul(U.glow)), 1);
      const glow = (glowRef = new Mesh(c.bag.add(new CircleGeometry(1.3 * HALO_K, 12)), c.bag.add(glowMat)));
      glow.position.z = -0.18;
      rig.add(glow);

      // gerbe de particules (confettis + étincelles), balistique analytique sans état
      const i = instanceIndex;
      const h1 = hash(i), h2 = hash(i.add(11)), h3 = hash(i.add(23)), h4 = hash(i.add(37)), h5 = hash(i.add(53));
      const pm = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending });
      const tt = U.bt;
      const dir = vec3(h1.sub(0.5).mul(1.4), h2.sub(0.5).mul(1.2).add(0.15), h3.sub(0.5).mul(0.6).add(0.1)).normalize();
      const speed = h4.mul(1.8).add(0.45);
      const drag = 2.2;
      const travel = float(1).sub(exp(tt.mul(-drag))).div(drag);
      pm.positionNode = (U.origin as unknown as N)
        .add(dir.mul(speed.mul(travel)))
        .add(vec3(sin(tt.mul(2.3).add(h5.mul(6.28))).mul(0.05).mul(min(tt, 1)), tt.mul(tt).mul(-0.04), 0));
      const life = h5.mul(2.6).add(1.8);
      const alive = float(i).lessThan(U.count);
      const vis = smoothstep(0.0, 0.03, tt).mul(smoothstep(life, life.mul(0.5), tt)).mul(select(alive, float(1), float(0)));
      const isSpark = h2.greaterThan(0.55);
      const flipK = abs(cos(tt.mul(h3.mul(9).add(4)).add(h1.mul(6.28)))).mul(0.85).add(0.15);
      const q = uv().sub(0.5);
      const rect = smoothstep(0.5, 0.42, abs(q.x)).mul(smoothstep(0.5, 0.42, abs(q.y)));
      const spark = smoothstep(0.5, 0.0, length(q)).pow(2);
      const cc: N = mix(U.colA as unknown as N, U.colB as unknown as N, step(0.5, h3));
      const sparkCol: N = (U.colB as unknown as N).mul(2.4);
      pm.colorNode = vec4(select(isSpark, sparkCol, cc.mul(flipK.mul(0.6).add(0.4))) as N, select(isSpark, spark, rect).mul(vis));
      pm.rotationNode = tt.mul(h4.mul(8).sub(4)).add(h1.mul(6.28));
      pm.scaleNode = select(isSpark, vec2(h1.mul(0.011).add(0.005)), vec2(h1.mul(0.011).add(0.012), h1.mul(0.011).add(0.012).mul(0.45).mul(flipK)));
      const parts = (partsRef = new Sprite(c.bag.add(pm)));
      parts.count = mobile ? 1100 : 2200;
      parts.frustumCulled = false;
      rig.add(parts);

      // vitrine : quelques poussières lumineuses flottent lentement derrière le booster (l'air « vit »), très discrètes,
      // sans état (tout dépend du temps) ; elles s'effacent dès qu'on ouvre
      const dmat = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      const di = instanceIndex;
      const r1 = hash(di.add(101)), r2 = hash(di.add(202)), r3 = hash(di.add(303)), r4 = hash(di.add(404));
      const dy = r2.add(time.mul(r4.mul(0.012).add(0.005))).fract().mul(2.6).sub(1.3);
      const dx = r1.mul(2.8).sub(1.4).add(sin(time.mul(r3.mul(0.35).add(0.12)).add(r1.mul(6.28))).mul(0.06));
      dmat.positionNode = vec3(dx, dy, r3.mul(0.65).sub(0.78));
      const twinkle = sin(time.mul(r4.mul(1.8).add(0.5)).add(r2.mul(6.28))).mul(0.5).add(0.5);
      const mote = smoothstep(0.5, 0.0, length(uv().sub(0.5))).pow(2.2);
      // fondu en haut et en bas (pas de point qui « apparaît » d'un coup en recommençant sa montée)
      const edge = smoothstep(1.3, 1.0, abs(dy));
      dmat.colorNode = vec4(color('#ffd6ad'), mote.mul(twinkle.mul(0.55).add(0.15)).mul(edge).mul(U.dust));
      dmat.scaleNode = vec2(r1.mul(0.011).add(0.005));
      const dust = new Sprite(c.bag.add(dmat));
      dust.count = mobile ? 36 : 64;
      dust.frustumCulled = false;
      stage.scene.add(dust);

      // ── AMBIANCE « ÉCLIPSE » (Berserk 5★ / 6★) : UN plan plein écran derrière tout (dessiné en premier, sans
      // profondeur), caché hors Éclipse → coût nul le reste du temps. Tout est procédural, en coordonnées d'écran :
      // ciel cramoisi et nuages lents (bruit cuit), soleil noir + couronne, crête sombre sur l'horizon ; sous
      // l'horizon, le LAC : le même ciel relu à l'envers (un seul calcul par pixel, pas de 2e rendu), houle lente,
      // et l'onde elliptique d'une carte qui se pose (U.eclRip).
      {
        const em = new MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
        em.vertexNode = vec4(positionGeometry.xy.mul(2), 0.5, 1);
        const asp = screenSize.x.div(screenSize.y);
        const hz = float(ECL.horizon);
        const below = step(hz, screenUV.y);
        const depth = max(screenUV.y.sub(hz), 0).div(1 - ECL.horizon);
        // onde : anneau elliptique (lac vu rasant) centré sous la carte, qui s'élargit en s'éteignant
        const el = length(screenUV.sub(vec2(0.5, ECL.horizon + 0.09)).mul(vec2(asp, 3.4)));
        const ring = exp(abs(el.sub(U.eclRip.mul(0.8))).div(0.016).negate()).mul(U.eclRip.oneMinus()).mul(below);
        // houle : des rides qui se resserrent vers l'horizon (perspective), lentes, plus amples au premier plan
        const swell = sin(float(26).div(depth.add(0.14)).add(time.mul(0.8)).add(sin(screenUV.x.mul(9).add(time.mul(0.23))).mul(1.4))).mul(depth.add(0.15)).mul(0.003);
        // point du CIEL lu par ce pixel : lui-même au-dessus de l'horizon, son reflet (tassé : lac vu rasant) en dessous
        const qy = mix(screenUV.y, hz.sub(screenUV.y.sub(hz).mul(1.7)).add(swell.mul(2)).add(ring.mul(0.03)), below);
        const q = vec2(screenUV.x.add(swell.mul(below)).sub(0.5).mul(asp), qy);
        const pm = q.sub(vec2(0, ECL.moonY));
        const rm = length(pm);
        const ang = atan(pm.y, pm.x);
        const R = U.eclR as unknown as N;
        const clouds = smoothstep(-0.25, 0.7, fbmTexel(q.mul(vec2(4.6, 9)).add(vec2(time.mul(0.012), time.mul(0.004))), mobile ? 2 : 3));
        // le ciel n'est rouge que près de l'astre et sur l'horizon : bordeaux presque noir ailleurs, nuages sombres par-dessus
        const lit = exp(rm.div(0.42).negate()).mul(0.85).add(smoothstep(hz.sub(0.22), hz, qy as N).mul(0.22));
        let sky: N = mix(color('#1c0707'), color('#9c0c0c'), lit);
        sky = mix(sky, color('#090405'), clouds.mul(0.82));
        sky = sky.add(color('#b4240c').mul(exp(rm.div(R.mul(2.2)).negate()).mul(0.7)));
        // couronne : fine et blanche au bord, rosée plus loin, en rayons inégaux
        const rays = sin(ang.mul(9).add(clouds.mul(2))).mul(sin(ang.mul(5).sub(1.3))).mul(0.45).add(0.55);
        const out = max(rm.sub(R), 0);
        const corona = exp(out.div(R.mul(rays.mul(0.16).add(0.07))).negate());
        sky = sky.add(mix(color('#cc7b72'), color('#fff1ea'), exp(out.div(R.mul(0.03)).negate())).mul(corona).mul(1.2));
        sky = sky.mul(smoothstep(R.mul(0.975), R, rm)); // le disque noir
        // crête sombre sur l'horizon (se reflète toute seule dans le lac)
        const ridge = sin(q.x.mul(23).add(1.7)).mul(0.5).add(0.5).mul(sin(q.x.mul(7.3)).mul(0.5).add(0.5)).mul(0.018).add(0.012).add(sin(q.x.mul(61)).mul(0.004));
        // (11/11) les APÔTRES debout sur la crête (game/apostles.ts : créatures génériques inventées) — bande dessinée une
        // fois sur un canvas (APO.span × APO.band hauteurs d'écran), une lecture de texture par pixel ; reflet dans le lac compris
        const apoTex = c.bag.add(new CanvasTexture(apostleStrip(APO.span, APO.band, mobile ? 640 : 1024)));
        apoTex.flipY = false;
        apoTex.wrapS = apoTex.wrapT = ClampToEdgeWrapping;
        apoTex.generateMipmaps = false;
        apoTex.minFilter = LinearFilter;
        const apoH = hz.sub(ridge).sub(qy as N).div(APO.band); // hauteur au-dessus de la crête (0 = pieds, 1 = haut de la bande)
        const apo = texture(apoTex, vec2(q.x.div(APO.span).add(0.5), apoH.oneMinus())).a.mul(step(0, apoH)).mul(step(apoH, 1));
        sky = mix(sky, color('#060303'), max(smoothstep(hz.sub(ridge).sub(0.002), hz.sub(ridge), qy), apo));
        const lake = sky.mul(mix(float(0.62), float(0.2), depth)).add(color('#cc7b72').mul(ring.mul(0.22))).add(color('#b4240c').mul(exp(abs(screenUV.y.sub(hz)).div(0.003).negate()).mul(0.3)));
        const eclCol: N = mix(sky, lake, below as N);
        em.colorNode = vec4(eclCol.mul(U.ecl), 1);
        eclMesh = new Mesh(c.bag.add(new PlaneGeometry(1, 1)), c.bag.add(em));
        eclMesh.frustumCulled = false;
        eclMesh.renderOrder = -1000;
        eclMesh.visible = false;
        stage.scene.add(eclMesh);
      }

      // post : bloom sur l'émissif, éclair, aberration, assombrissement
      const pl = createPipeline(c, stage.scene, stage.camera, { emissive: true, lean: true });
      releaseTargets = () => pl.releaseTargets();
      // (audit PERF1-03) compilation des cartes du pack pour la cible RÉELLE de la passe (MRT émissif + MSAA), par la
      // version sûre du lot E (post.ts : la cible du moteur est rendue à chaque pause de la compilation — sinon une
      // image rendue pendant l'attente partait dans la cible de la passe et l'écran restait figé)
      compileReal = () => pl.compile({ real: true });
      const bl = pl.own(bloom(pl.emissive!, 0.35, 0.5, 0.0)) as unknown as N;
      /*
       * (perf 06/11) POST-TRAITEMENT À LA DEMANDE, AU BIT PRÈS. Un effet dont la contribution est nulle n'est plus
       * recalculé : sa passe n'est pas rejouée et sa texture garde son contenu ; la sortie (même shader, mêmes
       * pipelines) le lit comme avant. Rien ne change à l'image tant que ce contenu ne compte pas :
       *  - bloom : l'émissif de la scène est EXACTEMENT nul en vitrine (booster non entamé : step(−0,2, burn) = 0, fuite
       *    de lumière = 0, aucune carte dans la scène ; poussières, halo et roue n'ont pas d'émissif) ; bloom(0) = 0, et
       *    on ne saute qu'après une image calculée sur un émissif nul (sa texture vaut alors 0) ;
       *  - flare (ordinateur) : multiplié par U.flare, il ne compte que si U.flare > 0.
       * `fxForce` : image de préchauffage (toutes les passes, pour créer leurs pipelines sous l'écran de chargement).
       */
      let fxForce = false;
      let bloomZero = true; // dernière image de bloom calculée sur un émissif nul (textures neuves : 0)
      const emissiveZero = () => phase === 'display' && (U.burn.value as number) < -0.2 && (U.leak.value as number) === 0 && cardsRig.children.length === 0;
      const onDemand = (node: unknown, skip: () => boolean, ran?: () => void) => {
        const n = node as { updateBefore(f: unknown): unknown };
        const run = n.updateBefore.bind(n);
        n.updateBefore = (f: unknown) => {
          if (skip()) return undefined;
          ran?.();
          return run(f);
        };
      };
      onDemand(bl, () => !fxForce && bloomZero && emissiveZero(), () => (bloomZero = !fxForce && emissiveZero()));
      const blStrength = (bl as unknown as { strength: { value: number } }).strength;
      // (audit PERF1-12, suggéré par le lot E) téléphone : bloom au ¼ de résolution (émissif épars, halo un peu plus doux)
      if (mobile) (bl as unknown as { setResolutionScale?(s: number): void }).setResolutionScale?.(0.25);
      const aspect = screenSize.x.div(screenSize.y);
      const d0 = screenUV.sub(U.center).mul(vec2(aspect, 1));
      // onde de choc : un anneau qui part de la carte et déforme l'image en passant (légendaire et mieux)
      const r0 = length(d0);
      const Rs = U.shock.mul(0.95);
      // éteint tant que le choc n'est pas lancé (sinon l'anneau de rayon 0 marquerait le centre en permanence)
      const sring = exp(abs(r0.sub(Rs)).div(0.028).negate()).mul(U.shock.oneMinus()).mul(step(0.001, U.shock));
      const warped = U.center.add(d0.sub(d0.div(max(r0, 1e-4)).mul(sring.mul(0.03))).div(vec2(aspect, 1)));
      const tint = U.glowColor as unknown as N;
      const vig = smoothstep(1.2, 0.3, screenUV.sub(0.5).length().mul(1.6));
      let col: N;
      /** (E4-08) ordinateur : l'image composée AVANT l'aberration chromatique */
      let colDirect: N | null = null;
      if (!mobile) {
        // flare anamorphique (légendaire et mieux), comme 018
        const fl = pl.own(anamorphicFlare(pl.emissive!, (n) => bloom(n, 1, 0, 0.12) as unknown as N)) as unknown as N;
        // (perf 06/11) flare éteint (U.flare = 0, hors révélations légendaire / mythique) : sa contribution vaut
        // fl × teinte × 0 = 0 quel que soit le contenu de sa texture → ses ~12 passes ne sont plus recalculées
        onDemand(fl, () => !fxForce && (U.flare.value as number) === 0);
        col = pl.color.sample(warped).rgb.add(bl.rgb).add(fl.rgb.mul(tint).mul(U.flare)).add(tint.mul(sring.mul(0.3)));
        colDirect = col;
        col = (chromaticAberration(vec4(col, 1), U.ca, U.center, float(1.06)) as unknown as N).rgb;
      } else {
        /*
         * Téléphone : même image, deux chaînes de passes en moins.
         *  - le flare anamorphique (2e bloom complet + flou de 48 lectures, recalculés à chaque image même éteint)
         *    devient une traînée horizontale analytique qui passe par la carte, de la couleur de la rareté ;
         *  - l'aberration chromatique (qui recopiait toute l'image dans une texture de plus, plein écran) lit
         *    directement l'image de la scène, canal par canal (même formule que ChromaticAberrationNode).
         */
        const off = warped.sub(U.center);
        const ab = U.ca.mul(off.length()).mul(0.01);
        const k = U.ca.mul(1.06 * 0.02);
        const rUV = U.center.add(off.mul(k.add(1).add(ab)));
        const bUV = U.center.add(off.mul(float(1).sub(k).sub(ab)));
        const base = vec3(pl.color.sample(rUV).r, pl.color.sample(warped).g, pl.color.sample(bUV).b);
        const dy = abs(screenUV.y.sub(U.center.y));
        const dx = abs(screenUV.x.sub(U.center.x)).mul(aspect);
        const streak = exp(dy.div(0.0035).negate()).mul(0.9).add(exp(dy.div(0.03).negate()).mul(0.22)).mul(exp(dx.mul(-1.5)));
        col = base.add(bl.rgb).add(tint.mul(streak.mul(U.flare).mul(1.6))).add(tint.mul(sring.mul(0.3)));
      }
      const finish = (x: N): N => {
        // inversion éclair (30 ms, mythique seulement)
        let o = mix(x, vec3(luminance(x)).oneMinus().mul(vec3(1, 0.9, 0.85)), U.invert) as N;
        o = o.add(color('#fff4e6').mul(U.flash.mul(0.25)));
        return o.mul(mix(float(0.8), float(1), vig)).mul(float(1).sub(U.dark.mul(0.6).mul(smoothstep(0.1, 0.6, length(d0)))));
      };
      pl.output = vec4(finish(col), 1);
      /**
       * (audit 12/11, S17 / E4-08) Ordinateur : `chromaticAberration` recopie toute l'image composée dans une texture
       * plein écran (RGBA 16 bits) et la relit 3 fois, à chaque image, même quand l'aberration vaut 0 (vitrine, pile au
       * repos, presque tout le temps). 2e sortie, même passe de scène et mêmes nœuds, sans cette recopie : utilisée
       * tant que U.ca = 0 (à aberration nulle les deux sorties lisent le même pixel).
       */
      let direct: RenderPipeline | null = null;
      if (colDirect) {
        direct = new RenderPipeline(c.renderer);
        direct.outputNode = vec4(finish(colDirect), 1);
        const dp = direct;
        c.bag.fn(() => dp.dispose());
      }
      /**
       * Téléphone, vitrine : le booster seul n'émet aucune lumière (pas de braise, pas de fuite) → bloom, choc, éclair
       * et aberration y valent 0. Une 2e sortie (même passe de scène, mêmes pipelines GPU) se contente de l'image et
       * du vignettage : la prévisualisation des boosters ne paie plus la chaîne de post-traitement.
       */
      let lite: RenderPipeline | null = null;
      if (mobile) {
        lite = new RenderPipeline(c.renderer);
        lite.outputNode = vec4(pl.color.rgb.mul(mix(float(0.8), float(1), vig)), 1);
        const lp = lite;
        c.bag.fn(() => lp.dispose());
      }
      post = {
        render: () => {
          if (lite && phase === 'display') return lite.render();
          blStrength.value = 0.28 + S.flash * 1.2 * fxk('flash') + S.glow * 0.25 * fxk('glow');
          if (direct && !fxForce && (U.ca.value as number) === 0) return direct.render();
          pl.render();
        },
      };

      // préchauffage des shaders : une carte factice par rareté (+ variante photo des Bébous), même graphe que les vraies
      const dummyArt = c.bag.add(generateCardArt(LAB_CARDS[0], 'common', { scale: 0.25 }));
      const dummies: Mesh[] = [];
      for (let t = 0; t <= 6; t++) {
        const tier = Math.min(5, t);
        const face = buildFace(dummyArt, tier, t === 6);
        // (perf 06/11) les trois formes de tranche des vraies cartes (buildSlot) : unie, dorée « teasée » (secrète),
        // arc-en-ciel « teasée » (6★) — couleurs en uniforms : une forme = un shader pour toutes les raretés
        const { edge } = t === 6 ? buildEdge('#ffffff', TEASE_GOLD) : t === 5 ? buildEdge('rainbow', TEASE_GOLD) : buildEdge('#ffffff');
        warm.push(face.holo.material, edge);
        const m = new Mesh(cardGeo, [face.holo.material, backMat, edge]);
        m.position.set((t - 3) * 0.1, 0, -0.4);
        dummies.push(m);
        stage.scene.add(m);
      }
      // roue des boosters en 3D (sélection en version téléphone, ≤ 860 px de large) : matériaux créés maintenant pour
      // être compilés avec le reste. (07/11) Toujours créée, même en qualité « ordinateur » : un téléphone réglé en
      // haute qualité, ou une fenêtre étroite, montre aussi les mini-boosters 3D (5 petits maillages, rien à payer sinon)
      {
        // (07/11) ordinateur : les mini-boosters servent aussi à la roue verticale, presque aussi grands que le grand
        // booster → textures 768 px et maillage fin
        wheel3d = createWheel3D(stage.scene, (k) => arts.get(k), mobile ? {} : { texW: 768, backW: 384, creaseW: 512, seg: [24, 36] });
        // (perf 06/11) toutes les pochettes : celle dont le visuel est prêt (texturée, plis en relief) ET les autres
        // (encore unies, en attendant leur visuel) — leurs pipelines naissaient sinon à la 1re image de la vitrine
        wheel3d.warm([boosterKey, ...Object.keys(styles).filter((k) => k !== boosterKey)]);
        const w3 = wheel3d;
        c.bag.fn(() => w3.dispose());
        if (!mobile) {
          const r = (reel = createReel(c, stage.scene, stage.camera, w3, {
            bigKey: () => boosterKey,
            onCommit: (k) => api.onReelCommit?.(k),
            hi: (k) => twins.length > 0 && arts.has(k),
            hiMax: twins.length,
            pick: (ray) => {
              const hit = ray.intersectObjects(twins.filter((tw) => tw.rig.visible && tw.key).map((tw) => tw.mesh), false)[0];
              return hit ? (twins.find((tw) => tw.mesh === hit.object)?.key ?? null) : null;
            },
            locked: () => !!api.reelLock?.() || phase !== 'display' || !!ctx.overlay.hidden,
          }));
          r.setKeys(reelKeys ?? Object.keys(styles));
          c.bag.fn(() => r.dispose());
          layout(c.width, c.height); // (la roue existe maintenant : échelle du booster et activation)
        }
      }
      // (fluidité 2) WebGPU : pipelines créés en asynchrone et en parallèle dans la configuration RÉELLE de la passe
      // (MRT émissif, HalfFloat, MSAA ×4 — PassNode.compileAsync, voir post.ts) ; WebGL2 : variante « canvas » comme avant
      await preloadNoise(); // (E2-01) pixels du bruit arrivés du worker avant la 1re image (déjà là en pratique)
      if (burnTex) await burnNoiseReady();
      lap('matériaux'); // i18n-ok
      await compileReal();
      lap('pipelines');
      {
        // la précompilation ne couvre pas la chaîne de post-traitement (bloom, sortie) : créer ces variantes en pleine
        // révélation coûte des centaines de ms (à-coup à la 1re carte de chaque rareté). Une image rendue par les deux
        // sorties, sous l'écran de chargement, les crée toutes maintenant (et, en WebGL2, tout le reste). (perf 06/11) Aussi sur ordinateur (avant :
        // téléphone seulement — 12 à 14 pipelines créés pendant chaque 1re ouverture PC), roue 3D comprise.
        const ph = phase;
        phase = 'sealed';
        fxForce = true;
        if (eclMesh) eclMesh.visible = true; // (Éclipse) son pipeline se crée ici aussi, pas à sa première apparition
        post.render();
        if (eclMesh) eclMesh.visible = false;
        fxForce = false;
        // (2e sortie : « lite » du téléphone, sortie sans aberration de l'ordinateur — E4-08)
        if (mobile || direct) {
          phase = 'display';
          post.render();
        }
        phase = ph;
      }
      lap('1res images');
      wheel3d?.hide();
      for (const tw of twins) tw.rig.visible = false;
      ready3d = true;
      arts.get(boosterKey)?.gpuTextures.forEach((t) => sentTex.add(t)); // parties avec la 1re image
      // la boutique a pu se mettre en page avant : elle passe maintenant aux mini-boosters 3D
      queueMicrotask(() => api.onWheelReady?.());
      // retirées de la scène mais gardées en vie : leurs pipelines restent en cache pour les vraies cartes
      dummies.forEach((m) => stage.scene.remove(m));
      // (audit 12/11, S09 / E4-23) cartes à DEUX illustrations (double face, lenticulaire — des Bébous secrets) : leur
      // graphe de face n'était préchauffé nulle part, son pipeline naissait à la première révélation. Préparé APRÈS
      // l'affichage de la boutique (rien d'ajouté au chargement), vitrine au repos, une face à la fois, hors champ.
      {
        let off = false;
        c.bag.fn(() => (off = true));
        // seconde illustration : des textures À ELLE (three fusionne deux lectures de la même texture en une seule
        // liaison — le shader ne serait pas celui d'une vraie carte, qui en a quatre distinctes)
        let second: typeof dummyArt | null = null;
        const two = async (lenticular: boolean) => {
          second ??= c.bag.add(generateCardArt(LAB_CARDS[1] ?? LAB_CARDS[0], 'common', { scale: 0.25 }));
          const art2 = { ...dummyArt, bg2: second.bg, subject2: second.subject, ...(lenticular ? { lenticular: true } : {}) } as typeof dummyArt;
          const face = buildFace(art2, 5, true);
          const { edge } = buildEdge('#ffffff', TEASE_GOLD);
          warm.push(face.holo.material, edge);
          const m = new Mesh(cardGeo, [face.holo.material, backMat, edge]);
          m.frustumCulled = false;
          m.position.z = camBase + 10; // derrière la caméra : soumis au rendu (nœuds, pipelines), aucun pixel
          m.updateMatrixWorld(true);
          stage.scene.add(m);
          try {
            await compileReal();
            await nextFrame();
            await nextFrame();
          } finally {
            stage.scene.remove(m);
          }
        };
        const later = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
        void (async () => {
          await later(9000);
          for (const lenticular of [false, true]) {
            // seulement en vitrine, hors ouverture ; sinon on repasse plus tard
            while (!off && (phase !== 'display' || document.hidden || c.overlay.hidden)) await later(4000);
            if (off) return;
            await two(lenticular).catch((e) => console.warn('[opening] préchauffage double face', e));
            await later(1500);
          }
        })();
      }
      // déchirure : compilée avec le reste (visible pendant le préchauffage), cachée ensuite
      tearBody.visible = tearStrip.visible = false;
      if (bakedBody && bakedStrip) bakedBody.visible = bakedStrip.visible = false;
      // (27/11) Retroussé arrivé à temps : compilé avec le reste → prêt (openStyleOf peut le rendre) ; sinon warmLate
      if (rollBody) {
        rollBody.visible = false;
        if (rollWarm && bakeFam === 'retrousse') rollReady = true;
      }
      // (27/11) Fenêtre arrivée à temps : idem
      if (winBody && winPanel) {
        winBody.visible = winPanel.visible = false;
        if (winWarm && bakeFam === 'fenetre') winReady = true;
      }
      // (27/11) Déchirure glacée : idem
      if (iceMesh && iceFilm) {
        iceMesh.visible = iceFilm.visible = false;
        if (iceWarm && bakeFam === 'glace') iceReady = true;
      }
      c.bag.fn(() => warm.forEach((m) => m.dispose()));

      // maintenir pour ouvrir (souris, doigt, espace) ; déchirure : le glisser est suivi ici, au pixel près
      let tearX: number | null = null;
      let tearY = 0;
      /**
       * (27/11) Retroussé : course du doigt à l'écran (px CSS) = distance projetée entre la charnière à p = 0 (y0, scène
       * pas remontée) et à p = 1 (yE, scène remontée de rollLift) — la remontée du cadrage (proportionnelle à la course)
       * est déduite : au bout de la course, la charnière est sous le doigt
       */
      let travelPx = 1;
      const rollTravel = () => {
        const fold = rollPlayer?.header.fold;
        if (!fold) return (ctx.height || 800) * 0.5;
        packRig.updateMatrixWorld();
        // (la matrice porte déjà la remontée en cours, rollLift × R.k : geste repris après un lâcher)
        const lift = rollLift();
        const py = (y: number, dy: number) => {
          proj.set(0, y, 0).applyMatrix4(packRig.matrixWorld);
          proj.y += dy;
          proj.project(stage.camera);
          return (0.5 - proj.y * 0.5) * ctx.height;
        };
        return Math.max(40, Math.abs(py(fold.yE, lift * (1 - R.k)) - py(fold.y0, -lift * R.k)));
      };
      const down = (e: Event) => {
        if (phase !== 'sealed') return;
        // (27/11) Déchirure glacée : pas de glisser, seulement des coups (advance) ; l'appui choisit le point d'impact
        if (icing) {
          const pe = e as PointerEvent;
          if (pe.clientX !== undefined) lastDown = { x: pe.clientX - (ctx.canvas.getBoundingClientRect?.().left ?? 0), y: pe.clientY - (ctx.canvas.getBoundingClientRect?.().top ?? 0) };
          return;
        }
        // (27/11) Étoile : la baguette se pose — premier point du tracé
        if (starring) {
          const pe = e as PointerEvent;
          if (pe.clientX === undefined || starAuto) return;
          holding = true;
          tearX = pe.clientX;
          tearY = pe.clientY;
          const r = ctx.canvas.getBoundingClientRect?.();
          const p = starAt(pe.clientX - (r?.left ?? 0), pe.clientY - (r?.top ?? 0));
          starLast = null;
          if (p) starStamp(p);
          e.preventDefault?.();
          return;
        }
        holding = true;
        tearX = (e as PointerEvent).clientX ?? null;
        tearY = (e as PointerEvent).clientY ?? 0;
        if (rolling) travelPx = rollTravel();
        // (27/11) Fenêtre : toute la poussée sur 45 % de la hauteur de l'écran, vers le bas ou vers le haut
        else if (windowing) travelPx = Math.max(120, (ctx.height || 800) * 0.45);
        e.preventDefault?.();
      };
      const up = () => {
        // (lot 07) doigt levé en pleine déchirure : passé TEAR_FINISH la soudure cède d'un trait (plus de fin de course
        // qui patine au bord de l'écran) ; avant, la tension non relâchée retombe et le pli reste marqué à l'angle
        // atteint (la bande ne revient pas) — on peut reprendre où on s'est arrêté
        if (tearX !== null && phase === 'sealed') {
          if (tearProgress >= TEAR_FINISH) {
            tearFling = true;
            tearTarget = 1.08;
          } else if (!tearSlip && tearTarget > tearProgress) tearTarget = tearProgress;
        }
        holding = false;
        tearX = null;
        // (Étoile : le prochain appui commence un nouveau trait, sans le relier à celui-ci)
        starLast = null;
        starSmooth = null;
      };
      const move = (e: PointerEvent) => {
        if (tearX === null || phase !== 'sealed') return;
        const dx = e.clientX - tearX;
        const dy = e.clientY - tearY;
        tearX = e.clientX;
        tearY = e.clientY;
        // (27/11) Retroussé : on tire VERS LE BAS, d'où qu'on parte ; la charnière suit le doigt sur l'ensemble de la
        // course (remontée du cadrage déduite, rollTravel) — en route, l'écart suit la loi de la charnière cuite (yF)
        if (rolling) {
          if (dy > 0) tearTarget = Math.min(1.08, tearTarget + dy / travelPx);
          return;
        }
        // (27/11) Étoile : la baguette trace là où passe le doigt
        if (starring) {
          const r = ctx.canvas.getBoundingClientRect?.();
          const p = starAt(e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
          if (p && !starAuto) {
            starSmooth = starSmooth ? { x: starSmooth.x + (p.x - starSmooth.x) * 0.5, y: starSmooth.y + (p.y - starSmooth.y) * 0.5 } : p;
            starStamp(starSmooth);
          }
          return;
        }
        // (27/11) Fenêtre : on glisse sur le sachet, dans un sens ou dans l'autre (en vertical) : la pile pousse
        if (windowing) {
          tearTarget = Math.min(1.08, tearTarget + Math.abs(dy) / travelPx);
          return;
        }
        // (lot 07) le geste est projeté sur la direction de pelage (droite + un peu vers le haut : un arc de pouce en
        // diagonale compte presque entier, un geste purement horizontal compte comme avant) ; un geste vif rend
        // jusqu'à ×1,7 par pixel — il tranche d'un trait au lieu de buter au bord de l'écran
        const adv = (dx * PEEL_C - dy * PEEL_S) / PEEL_C;
        if (adv > 0) tearTarget = Math.min(1.08, tearTarget + (adv * (1 + 0.7 * sstep(TEAR_SPEED.slow, TEAR_SPEED.fast, tearVel))) / ((cv.clientWidth || 800) * 0.5));
      };
      const cv = c.canvas;
      cv.addEventListener('pointerdown', down);
      // déchirure : le geste peut commencer sur un calque d'interface transparent posé sur la scène (indication,
      // compteur…) → on l'écoute aussi au niveau de la fenêtre, sauf sur un vrai contrôle
      const downAny = (e: PointerEvent) => {
        if (phase !== 'sealed' || e.target === cv) return;
        if ((e.target as HTMLElement | null)?.closest?.('button, a, input, select, textarea')) return;
        down(e);
      };
      window.addEventListener('pointerdown', downAny, true);
      c.bag.fn(() => window.removeEventListener('pointerdown', downAny, true));
      // (fenêtre, pas le canvas : la capture du pointeur est prise par l'élément d'entrée commun)
      window.addEventListener('pointermove', move);
      c.bag.fn(() => window.removeEventListener('pointermove', move));
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      const typing = (e: KeyboardEvent) => /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target as HTMLElement)?.tagName ?? '');
      const kd = (e: KeyboardEvent) => {
        if (e.repeat || typing(e) || ctx.overlay.hidden) return;
        if (e.key === ' ' || e.key === 'Enter') {
          if (phase === 'sealed') holding = true;
          else advance();
        }
      };
      const ku = (e: KeyboardEvent) => (e.key === ' ' || e.key === 'Enter') && (holding = false);
      window.addEventListener('keydown', kd);
      window.addEventListener('keyup', ku);
      c.bag.fn(() => {
        cv.removeEventListener('pointerdown', down);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        window.removeEventListener('keydown', kd);
        window.removeEventListener('keyup', ku);
        killAll();
        disposeSlots();
      });
      // tap : avancer ; sur l'éventail final, la carte touchée s'ouvre en grand
      c.bag.fn(
        c.input.onTap((x, y) => {
          if (ctx.overlay.hidden) return; // une autre scène est affichée (visionneuse…) : ce tap n'est pas pour nous
          if (phase === 'display') {
            // roue verticale (ordinateur) : un clic sur un chevron ou une pochette voisine fait tourner la roue
            if (reel?.tap(x, y)) return;
            // toucher le booster = l'ouvrir
            ray.setFromCamera(new Vector2(x, y), stage.camera);
            if (packMeshRef && ray.intersectObject(packMeshRef, false).length) api.onBoosterTap?.();
            return;
          }
          if (phase !== 'done') {
            // retour tactile AU toucher (synchrone : sur iPhone c'est le seul moment où le navigateur peut vibrer ;
            // l'impulsion d'impact arrivera ensuite sur Android, et rejouera une 6★ gardée en attente sur iPhone)
            if (phase === 'opened' || phase === 'shown' || phase === 'mythicHold') haptics.pulse(12);
            return advance();
          }
          ray.setFromCamera(new Vector2(x, y), stage.camera);
          const hit = ray.intersectObjects(slots.map((s) => s.mesh), false)[0];
          const s = hit && slots.find((x) => x.mesh === hit.object);
          if (s) events.onPick?.(s.data);
        }),
      );
      // vitrine : glisser le doigt sur le booster = booster voisin (comme le carrousel)
      c.bag.fn(
        c.input.onSwipe((dir) => {
          if (phase === 'display' && !ctx.overlay.hidden) api.onBoosterSwipe?.(dir);
        }),
      );
      reset();
      // (audit PERF1-17) update() met à jour les matrices à la main avant chaque rendu (rayons, centre des effets) :
      // le rendu n'a plus à le refaire une 2e fois par image
      stage.scene.matrixWorldAutoUpdate = false;
      void startArts().catch((e) => console.warn('[opening] boosters', e));
    },

    update(dt, t) {
      sceneT = t;
      // pas de rotation au glisser dans cette scène : glisser en brûlant le booster (geste naturel au doigt) faisait
      // tourner la pile par demi-tours et montrait de dos… la face des cartes encore cachées. Inclinaison seule.
      ctx.input.spinEnabled = false;
      // déchirure : le doigt qui glisse vers la droite tire la bande (maintenir sans bouger = elle avance doucement) ;
      // stick-slip DÉTERMINISTE (lot 07, voir TEAR_WELDS) : elle accroche, la tension monte (le sachet penche un rien),
      // puis elle file jusqu'au doigt d'un coup — crans espacés si le geste est lent, coupe continue s'il est vif
      // (27/11) Déchirure glacée : pas de glisser ; l'ouverture automatique donne les 3 coups, espacés de GLACE.autoTap
      if (phase === 'sealed' && icing && auto.burn) {
        const now = performance.now();
        if (!iceNextAuto) iceNextAuto = now + GLACE.autoTap * 1000;
        else if (now >= iceNextAuto) {
          iceTap();
          iceNextAuto = now + GLACE.autoTap * 1000;
        }
      }
      // (27/11) Étoile : ouverture automatique = l'étoile tracée toute seule ; les trous du tracé s'élargissent doucement
      if (phase === 'sealed' && starring) {
        if (auto.burn) autoStar();
        if (starSince) B.burn = Math.min(ETOILE.bande * 2, ETOILE.bande + ((performance.now() - starSince) / 1000) * ETOILE.croit);
      }
      if (phase === 'sealed' && !icing && !starring) {
        if (auto.burn) startAutoTear(rolling ? RETROUSSE.autoSerie : windowing ? FENETRE.autoSerie : 0.9);
        // maintenir sans glisser : la bande avance doucement toute seule (clavier, appui long)
        if (holding && !ctx.input.dragging) tearTarget = Math.min(1.08, tearTarget + dt * 0.45);
        // vitesse demandée (doigt, clavier ou déchirure auto), lissée sur ~60 ms
        const dts = Math.max(dt, 1e-3);
        tearVel += ((tearTarget - tearPrevTarget) / dts - tearVel) * Math.min(1, dts / 0.06);
        tearPrevTarget = tearTarget;
        const fastK = tearFling ? 1 : sstep(TEAR_SPEED.slow, TEAR_SPEED.fast, tearVel);
        const gap = tearTarget - tearProgress;
        let tension = 0;
        // (27/11) Retroussé : mêmes à-coups, points durs de la variante tirée (verrou, paires de crans), sans tearCatch
        // (27/11) Fenêtre : butée avant le premier coin, puis le film se laisse découper (winWeldsOf)
        const welds = rolling ? rollWelds : windowing ? winWelds : TEAR_WELDS;
        const needs = rolling ? ROLL_NEED : windowing ? WIN_NEED : TEAR_NEED;
        if (!tearSlip) {
          const weld = tearProgress >= (welds[tearWeld] ?? 2) - 1e-4;
          const need = (tearWeld === 0 ? needs.first : weld ? needs.weld : needs.film) * (1 - 0.85 * fastK);
          if (gap > need) {
            tearSlip = true;
            if (weld) tearWeld++;
            if (!rolling && !windowing) tearCatch(gap, weld, fastK);
          } else tension = Math.max(0, gap) / need;
        }
        if (tearSlip) {
          // la bande file (à la vitesse d'une coupe nette : toute la course en DUR.rapide) jusqu'au doigt, ou bute sur
          // le point de soudure suivant
          // (Retroussé : pas plus bas que le haut des cartes tant que la pile n'est pas prête, voir rollGate ; Fenêtre :
          // pas de coin percé tant qu'elle ne l'est pas, voir winGate)
          const gate = rollPileReady ? 2 : rolling ? rollGate : windowing ? winGate : 2;
          const stop = Math.min(tearTarget, welds[tearWeld] ?? 2, gate);
          const next = Math.min(stop, tearProgress + dts * tearRate);
          if (next >= stop) tearSlip = false;
          if (next > tearProgress) (rolling ? setRollProgress : windowing ? setWinProgress : setTearProgress)(next);
        }
        S.trem = tension * 0.2 * (1 - fastK);
      }
      tearShake.update(dt);
      TFLY.value = fly.t;
      // (S3) fente de lumière : s'ouvre avec la coupe (la tête de lecture de l'enregistrement si on le rejoue), s'éteint
      // pendant que la bande s'envole
      TSLIT.value = style === 'idle' || rolling || windowing || icing || starring ? 0 : sstep(TEAR_SLIT[0], TEAR_SLIT[1], useBake ? bakePlay : tearProgress) * (1 - fly.t);
      if (icing && icePlayer) {
        // (27/11) Déchirure glacée : les éclats cuits, sur leur horloge (ICE.t) ; cachés une fois retombés
        if (ICE.t >= 0) {
          icePlayer.setTime(ICE.t);
          if (iceMesh && iceFilm) iceMesh.visible = iceFilm.visible = ICE.t < icePlayer.duration - 1e-3;
        }
      } else if (windowing && winPlayer) {
        // (27/11) Fenêtre : même tête de lecture lissée ; la pile avance avec la cuisson (followZ, unités du monde)
        const h = winPlayer.header;
        if (bakeExit.t < 0) {
          const goal = Math.min(1, tearProgress);
          bakePlay += (goal - bakePlay) * (1 - Math.exp(-dt * 28));
          if (Math.abs(goal - bakePlay) < 5e-4) bakePlay = goal;
          winPlayer.setTear(bakePlay);
          winCross(bakePlay);
          followZ = winZ(h, { p: bakePlay }) * packRig.scale.x;
          // fente de lumière : s'allume au premier coin, les fronts avancent avec la part du contour rompue
          const cut = h.cut;
          if (cut?.length) {
            const f = bakePlay * (cut.length - 1), i = Math.floor(f), i1 = Math.min(cut.length - 1, i + 1);
            WCUT.value = Math.min(1, (cut[i] + (cut[i1] - cut[i]) * (f - i)) * 1.15);
          }
          WSLIT.value = winWelds.length > 1 ? sstep(winWelds[1], winWelds[1] + 0.03, bakePlay) : 0;
          if (winHeadWait && bakePlay >= 1) {
            const go = winHeadWait;
            winHeadWait = null;
            go();
          }
        } else {
          winPlayer.setExit(bakeExit.t);
          followZ = winZ(h, { t: bakeExit.t }) * packRig.scale.x;
          WCUT.value = 1;
          WSLIT.value = 1 - sstep(0, FENETRE.chute, bakeExit.t);
          if (winPanel) winPanel.visible = winPlayer.stripVisible(bakeExit.t);
        }
        winKnock();
      } else if (rolling && rollPlayer) {
        // (27/11) Retroussé : même tête de lecture lissée que la Déchirure ; claquements quand elle franchit une rupture
        if (bakeExit.t < 0) {
          const goal = Math.min(1, tearProgress);
          bakePlay += (goal - bakePlay) * (1 - Math.exp(-dt * 28));
          // (coût : ~1 ms par image recalculée sur PC, 4 à 6× au téléphone) arrivée nette : doigt immobile, plus de calcul
          if (Math.abs(goal - bakePlay) < 5e-4) bakePlay = goal;
          rollPlayer.setTear(bakePlay);
          rollCross(bakePlay);
          // (tant que la sortie n'a pas commencé : geste, puis fin du retournement après un lâcher rapide, même si les
          // cartes du booster ne sont pas encore prêtes — la remontée du cadrage ne se fige ni ne saute)
          if (phase === 'sealed' || phase === 'busy') R.k = bakePlay;
          if (rollHeadWait && bakePlay >= 1) {
            const go = rollHeadWait;
            rollHeadWait = null;
            go();
          }
        } else rollPlayer.setExit(bakeExit.t);
        rollKnock();
      } else if (useBake && bakePlayer) {
        if (bakeExit.t < 0) {
          // la tête de lecture suit le doigt (rattrapage rapide : les à-coups de la déchirure restent nets)
          bakePlay += (Math.min(1, tearProgress) - bakePlay) * (1 - Math.exp(-dt * 28));
          bakePlayer.setTear(bakePlay);
        } else {
          bakePlayer.setExit(bakeExit.t);
          if (bakedStrip) bakedStrip.visible = poseStrip ?? bakePlayer.stripVisible(bakeExit.t);
        }
      } else if (tearStrip) {
        tearStrip.position.set(fly.t * 0.9, fly.t * 0.6, fly.t * 0.5);
        tearStrip.rotation.z = -fly.t * 0.9;
        tearStrip.visible = style !== 'idle' && !starring && fly.t < 0.999;
      }
      // (audit PERF1-17) lambeaux : plus d'écriture des 110 matrices ni d'envoi au GPU quand tous sont retombés
      let alive = false;
      if (shreds && style !== 'idle') for (let i = 0; i < NSH && !alive; i++) alive = sh[i].life > 0;
      if (shreds && style !== 'idle' && (alive || shredsDirty)) {
        shredsDirty = alive;
        for (let i = 0; i < NSH; i++) {
          const q = sh[i];
          if (q.life > 0) {
            q.life -= dt;
            q.v.y -= 1.6 * dt;
            q.v.multiplyScalar(Math.exp(-1.8 * dt));
            q.p.addScaledVector(q.v, dt);
            q.r.addScaledVector(q.w, dt);
            tmpO.position.copy(q.p);
            tmpO.rotation.set(q.r.x, q.r.y, q.r.z);
            tmpO.scale.setScalar(q.s * Math.min(1, q.life * 2));
          } else tmpO.scale.setScalar(0);
          tmpO.updateMatrix();
          shreds.setMatrixAt(i, tmpO.matrix);
        }
        shreds.instanceMatrix.needsUpdate = true;
      }
      if (shreds) shreds.visible = style !== 'idle' && !rolling && !windowing && !icing;
      // défilement accéléré : retourne / range tout seul les cartes sous le seuil ; s'arrête sur les belles
      if (auto.minRank > 0 || auto.reveal) {
        const cur = order[cursor];
        // « Tout révéler » : une 6★ montrée reste admirée MYTHIC_ADMIRE_MS, puis la suite repart seule (pas de toucher requis)
        const admired = performance.now() >= autoHoldUntil;
        // (retours live 02, anti-spoil) « 4★ et + » : TOUTES les cartes se retournent seules, et la scène s'arrête APRÈS
        // une belle carte (avant : elle s'arrêtait face cachée devant une 4★+, ce qui l'annonçait)
        if (phase === 'opened' && !autoWait && auto.jump && !auto.reveal && fastCard(cur)) jumpAhead();
        else if (phase === 'opened' && !autoWait && (auto.reveal ? admired : auto.minRank > 0)) revealCurrent();
        else if (phase === 'shown' && (!auto.reveal || performance.now() - shownAt >= REVEAL_DWELL_MS) && ((fastCard(cur) && (!auto.reveal || admired)) || (auto.reveal && !!slots[cur] && (slots[cur].rr.rank < 4 || admired)))) nextCard();
        else if (phase === 'mythicHold' && auto.reveal && admired) advance();
      }
      shake.update(dt);
      shake2.update(dt);
      // ── 003 (retours live 02, anti-spoil) : dès que le booster tiré est posé, une lueur NEUTRE respire par ses
      // soudures — la même pour tous les boosters, quelle que soit la meilleure carte (avant : n pulsations de la couleur
      // de la meilleure carte, battement de cœur + vibration dès Rare, halo coloré, tremblement dès Légendaire, teinte
      // arc-en-ciel pour une 6★ : on savait ce qu'on allait tirer avant d'ouvrir). La rareté ne se montre qu'à la carte.
      if (phase === 'sealed' && sealedT >= 0) {
        sealedT += dt;
        const t0 = 0.65; // le booster finit de se poser
        // (Éclipse : la fuite respire deux fois plus lentement, un peu plus fort)
        const env = sealedT < t0 ? 0 : Math.min(1, (sealedT - t0) / 0.6) * (0.55 + 0.2 * Math.sin((sealedT - t0) * (eclipse ? 0.9 : 1.8)));
        B.leak = env * (eclipse ? 0.5 + 0.2 * E.aura : 0.5);
      } else if (phase !== 'sealed') sealedT = -1;
      U.burn.value = B.burn;
      U.leak.value = B.leak;
      U.flash.value = S.flash * fxk('flash');
      U.ca.value = fxLow ? 0 : S.ca;
      // Éclipse : sachet descellé (quel que soit le style d'ouverture) → le ciel se lève ; sa pénombre s'ajoute à celle des révélations
      if (eclipse && !eclRisen && phase !== 'sealed' && phase !== 'display') eclipseRise();
      const dark = Math.max(S.dark, E.dark);
      U.dark.value = dark;
      U.ecl.value = E.sky;
      U.eclRip.value = E.rip;
      if (eclMesh) eclMesh.visible = E.sky > 0.002;
      if (E.aura > 0.001 && phase === 'sealed') U.glowColor.value.lerp(eclAura, 1 - Math.exp(-dt * 3));
      // vitrine : un halo discret, de la couleur du booster, l'éclaire par derrière (il ne flotte plus dans le noir)
      if (phase === 'display') {
        const acc = accents.get(boosterKey);
        if (acc) U.glowColor.value.lerp(acc, 1 - Math.exp(-dt * 3));
      }
      U.soon.value += (soonT * dispK - U.soon.value) * (1 - Math.exp(-dt * 5));
      U.dust.value = dispK * (1 - U.soon.value * 0.5);
      U.glow.value = (S.glow + E.aura * 0.4) * fxk('glow') + dispK * (0.085 + Math.sin(t * 0.8) * 0.015) * (1 - U.soon.value * 0.6);
      if (glowRef) glowRef.visible = (U.glow.value as number) > 0.003 && !(ctx.quality === 'mobile' && phase === 'display');
      U.bt.value = S.bt;
      // (vie max d'une particule ≈ 4,4 s : au-delà, plus rien de visible)
      // (audit 12/11, S17 / E4-19) aussi sur ordinateur : 2 200 sprites transparents étaient soumis à chaque image, même éteints
      if (partsRef) partsRef.visible = S.bt < 4.6 && (U.count.value as number) > 0;
      U.flare.value = S.flare * fxk('flare');
      U.shock.value = S.shock;
      U.invert.value = fxLow ? 0 : S.invert;
      key.intensity = 1.2 * (1 - dark * 0.6) + S.flash * 1.5;

      packRig.visible = B.burn < 0.94 && B.y > -2.4;
      const display = phase === 'display';
      dispK += ((display ? 1 : 0) - dispK) * (1 - Math.exp(-dt * 5));
      const pose = tiltPose(display ? 0.3 : 0.12);
      packRig.position.set(0, B.y + L.dispY * dispK + (display ? Math.sin(t * 1.1) * 0.012 : 0), B.z);
      packRig.rotation.set(pose.x + (display ? Math.sin(t * 0.6) * 0.04 : 0), B.spin + pose.y + (display ? Math.sin(t * 0.4) * 0.12 : 0), tearShake.value * 0.004 - S.trem * 0.06 * (style === 'idle' ? 0 : 1));
      packRig.scale.setScalar(B.s * (1 + (L.dispS - 1) * dispK) * (1 + packLift * 0.025));
      // roue verticale (ordinateur) : le grand booster est la pochette du milieu du tambour — il suit la roue
      for (const tw of twins) tw.rig.visible = false;
      bigShade.value = 1;
      if (reel) {
        if (display && reel.enabled && !ctx.overlay.hidden && dispK > 0.5) {
          const cy = B.y + L.dispY * dispK;
          reel.setLayout(cy, L.dispS);
          reel.update(dt, t);
          const rp = reel.bigPose();
          packRig.position.y += rp.y - cy;
          // clic maintenu : « pris en main », le booster recule un peu
          packRig.position.z += rp.z - reel.holdK * 0.06;
          packRig.rotation.x += rp.rotX;
          // la roue tourne : le flottement latéral et l'inclinaison à la souris s'effacent (la pochette reste dans son rail)
          // — (07/11, retours de Tom : « une demi-seconde puis le booster se met à suivre la souris d'un coup ») avant :
          // tout ou rien sur `reel.moving`, d'où le saut à l'arrêt ; maintenant un fondu (~0,35 s) dans les deux sens
          reelMoveK += ((reel.moving ? 1 : 0) - reelMoveK) * (1 - Math.exp(-dt * (reel.moving ? 10 : 4.5)));
          const free = pose.y + Math.sin(t * 0.4) * 0.12;
          packRig.rotation.y = B.spin + free + (pose.y * 0.3 - free) * reelMoveK;
          packRig.rotation.x -= (pose.x + Math.sin(t * 0.6) * 0.04) * 0.7 * reelMoveK;
          // (retours de Tom) le halo n'est plus une « orbe » que les pochettes traversent : il passe DERRIÈRE tout le
          // tambour, agrandi d'autant pour garder la même taille à l'écran
          // jumeaux : même pose que le grand booster quand la roue tourne (le grand booster les remplace sans saut)
          bigShade.value = 1 - reel.bigDim;
          {
            const want = reel.hiItems;
            for (const tw of twins) if (tw.key && !want.some((w) => w.key === tw.key)) tw.key = null;
            const sc = B.s * (1 + (L.dispS - 1) * dispK);
            const bob = Math.sin(t * 1.1) * 0.012;
            const tiltX = 0.3 * (pose.x + Math.sin(t * 0.6) * 0.04);
            const rotY = B.spin + pose.y * 0.3;
            for (const w of want) {
              let tw = twins.find((x) => x.key === w.key);
              if (!tw) {
                const a = arts.get(w.key);
                tw = twins.find((x) => !x.key);
                if (!tw || !a) continue;
                tw.key = w.key;
                applySwaps(tw.swaps, a);
              }
              tw.rig.visible = true;
              tw.rig.position.set(packRig.position.x, w.y + bob, B.z + w.z);
              tw.rig.rotation.set(tiltX + w.rotX, rotY, packRig.rotation.z);
              tw.rig.scale.setScalar(sc);
              tw.mesh.position.copy(packMeshMain!.position);
              tw.mesh.quaternion.copy(packMeshMain!.quaternion);
              tw.mesh.scale.copy(packMeshMain!.scale);
              tw.shade.value = 1 - w.dim;
            }
          }
          if (glowRef) {
            const back = reel.depth + 0.25;
            glowRef.position.z = -0.18 - back;
            glowRef.scale.setScalar((camBase + 0.18 + back) / (camBase + 0.18));
          }
        } else {
          reel.hide();
          if (glowRef) {
            glowRef.position.z = -0.18;
            glowRef.scale.setScalar(1);
          }
        }
      }

      // éventail final, à la souris : la carte survolée se soulève (curseur « main »), petit tic au passage
      const mouseOver = phase === 'done' && ctx.input.inside && !ctx.input.down && !ctx.input.gyroEnabled && !ctx.overlay.hidden;
      let hov = mouseOver ? hovered : -1;
      // lancer de rayon quand la souris bouge (et de temps en temps : les cartes finissent de se placer)
      if (mouseOver && (ctx.input.ndcX !== ndc.x || ctx.input.ndcY !== ndc.y || ++fanTick % 8 === 0)) {
        ndc.set(ctx.input.ndcX, ctx.input.ndcY);
        ray.setFromCamera(ndc, stage.camera);
        const hit = ray.intersectObjects(slots.map((s) => s.mesh), false)[0];
        hov = hit ? slots.findIndex((s) => s.mesh === hit.object) : -1;
      }
      if (hov !== hovered) {
        if (hov >= 0) ctx.sfx.tick(1.7, 0.035);
        hovered = hov;
      }
      const kh = 1 - Math.exp(-dt * 14);
      const tr = S.trem;
      slots.forEach((s, i) => {
        const p = s.p;
        s.hov += ((i === hovered ? 1 : 0) - s.hov) * kh;
        const hv = s.hov;
        // retournement : en pivotant sur son axe, la moitié de la carte passerait DERRIÈRE sa position de repos et
        // traverserait la pile. On l'avance donc de sa demi-largeur × |sin(angle)| (+ une épaisseur) : le bord qui
        // recule s'arrête pile au plan de repos. L'échelle compense la perspective → même taille apparente, pas de « pop ».
        // CHARNIÈRE DROITE (voir HINGE) : φ = π − flip (0 = face cachée, π = face visible). Le centre décrit
        // x₀ + (w/2)(1 − cos φ) : le bord droit reste posé, le bord gauche se soulève (z = (w/2) sin φ) et passe par-dessus.
        // Seconde moitié : la « main » ramène la carte au centre (lissé), sinon elle atterrirait décalée d'une largeur.
        const swing = Math.abs(Math.sin(p.flip));
        const w = CARD_W * p.s;
        const phi = Math.PI - p.flip;
        const lift = swing > 1e-4 ? swing * (w / 2 + 0.008) : 0;
        const u = Math.min(1, Math.max(0, (phi / Math.PI - 0.5) * 2));
        const settle = u * u * (3 - 2 * u);
        const dx = HINGE * ((w / 2) * (1 - Math.cos(phi)) - w * settle);
        const rz = p.rz * (1 - hv * 0.7);
        const depth = Math.max(0.2, stage.camera.position.z - p.z - rig.position.z);
        const persp = lift > 0 ? 1 - HINGE_PERSP * (1 - Math.max(0.5, (depth - lift) / depth)) : 1;
        s.mesh.position.set(p.x + dx * Math.cos(rz), p.y - dx * Math.sin(rz) + hv * 0.035, p.z + lift + hv * 0.09);
        // sens de rotation inversé (−flip) : c'est le bord GAUCHE qui vient vers la caméra
        // (11/11) carte HORIZONTALE (KCDQ Teto) : face visible, elle est couchée d'un quart de tour (et un peu plus
        // petite : elle est plus large) — face cachée, elle reste droite comme les autres dans la pile
        const land = s.art.landscape ? Math.min(1, Math.max(0, 1 - p.flip / Math.PI)) : 0;
        s.mesh.rotation.set(Math.sin(t * 53) * 0.008 * tr, -p.flip, rz + land * (Math.PI / 2) + Math.sin(t * 41) * 0.01 * tr);
        s.mesh.scale.setScalar(p.s * persp * (1 + hv * 0.06) * (1 - land * 0.14));
        s.holoU.strength.value = 0.1 + p.holo * 0.65 + hv * 0.15;
      });
      // vitrine, à la souris : le booster survolé se signale (curseur main, léger soulèvement)
      if (phase === 'display' && ctx.input.inside && !ctx.input.down && !ctx.input.gyroEnabled && !ctx.overlay.hidden && packMeshRef && api.onBoosterTap) {
        // lancer de rayon seulement quand la souris bouge (le booster a ~14 000 triangles)
        if (ctx.input.ndcX !== lastNdc.x || ctx.input.ndcY !== lastNdc.y) {
          lastNdc.set(ctx.input.ndcX, ctx.input.ndcY);
          ray.setFromCamera(lastNdc, stage.camera);
          packHover = ray.intersectObject(packMeshRef, false).length > 0;
        }
      } else {
        packHover = false;
        lastNdc.set(9, 9);
      }
      packLift += ((packHover || (phase === 'display' && sceneT < hintLiftUntil) ? 1 : 0) - packLift) * (1 - Math.exp(-dt * (packHover ? 10 : 7)));
      // curseur : maintenir sur le booster scellé, toucher pour révéler, main sur une carte de l'éventail
      const cur = phase === 'sealed' ? (holding ? 'grabbing' : 'grab') : phase === 'opened' || phase === 'shown' ? 'pointer' : (phase === 'done' && hovered >= 0) || packHover ? 'pointer' : (display && reel?.cursor) || '';
      if (!ctx.overlay.hidden && ctx.canvas.style.cursor !== cur) ctx.canvas.style.cursor = cur;
      // la pile qui attend un toucher respire un peu et suit le pointeur (elle invite à jouer) ; la carte montrée et
      // l'éventail s'inclinent davantage
      // (amplitude lissée : pas d'à-coup quand on passe d'une phase à l'autre)
      const ampTarget = phase === 'shown' || phase === 'done' ? 0.22 : phase === 'opened' ? 0.1 : 0;
      tiltAmp += (ampTarget - tiltAmp) * (1 - Math.exp(-dt * 6));
      breathe += ((phase === 'opened' ? 1 : 0) - breathe) * (1 - Math.exp(-dt * 4));
      const tilt = tiltPose(tiltAmp);
      tilt.x += Math.sin(t * 1.3) * 0.02 * breathe;
      // pile « dans » le booster : même pivot et même inclinaison que lui, 12 cm derrière (comme à l'ouverture)
      const f = B.follow;
      tmpQ.setFromEuler(cardsRig.rotation.set(tilt.x, tilt.y, 0));
      if (f > 0) {
        packQ.setFromEuler(packRig.rotation);
        followPos.set(0, 0, followZ).applyQuaternion(packQ).add(packRig.position);
        tmpQ.slerp(packQ, f);
        cardsRig.quaternion.copy(tmpQ);
        cardsRig.position.copy(followPos).multiplyScalar(f);
        // (27/11) Fenêtre : la pile sortie garde son avancée après le lâcher du sachet, jusqu'au rangement (R.k)
        if (windowing) cardsRig.position.z += winKeep * R.k * (1 - f);
        // (27/11) Retroussé, Fenêtre : la main lâche tôt (B.follow → 0), les cartes gardent l'échelle du sachet jusqu'au rangement
        cardsRig.scale.setScalar(1 + (packRig.scale.x - 1) * (rolling || windowing || icing ? Math.max(f, R.s) : f));
      } else {
        cardsRig.position.set(0, 0, windowing ? winKeep * R.k : 0);
        cardsRig.scale.setScalar(rolling || windowing || icing ? 1 + (packRig.scale.x - 1) * R.s : 1);
      }
      const shk = fxk('shake');
      rig.position.set((shake.value * 0.004 + Math.sin(t * 61) * 0.002 * tr) * shk, (shake2.value * 0.004 + Math.sin(t * 47) * 0.002 * tr) * shk, 0);
      // (27/11) Retroussé : le film retourné pend sous le sachet (≈ −1,2 unités du sachet à p = 1) ; s'il sortirait du
      // bas de l'écran, toute la scène (sachet ET cartes) remonte avec la course, bornée, puis redescend au rangement
      if (rolling && R.k > 0) rig.position.y += rollLift() * R.k;
      stage.camera.position.z = camBase * (1 - S.push);
      // décalage de l'image (vitrine sur ordinateur) : fenêtre de vue décalée, rayons et effets suivent tout seuls
      focusCur += (focusT - focusCur) * (1 - Math.exp(-dt * 6));
      if (Math.abs(focusCur - focusT) < 0.3) focusCur = focusT;
      focusCurY += (focusTY - focusCurY) * (1 - Math.exp(-dt * 6));
      if (Math.abs(focusCurY - focusTY) < 0.3) focusCurY = focusTY;
      // (audit PERF1-17) clé numérique au lieu d'une chaîne reconstruite à chaque image
      if (focusCur !== focusKey.x || focusCurY !== focusKey.y || ctx.width !== focusKey.w || ctx.height !== focusKey.h) {
        Object.assign(focusKey, { x: focusCur, y: focusCurY, w: ctx.width, h: ctx.height });
        if (Math.abs(focusCur) < 0.5 && Math.abs(focusCurY) < 0.5) stage.camera.clearViewOffset();
        else stage.camera.setViewOffset(ctx.width, ctx.height, -focusCur, -focusCurY, ctx.width, ctx.height);
      }
      stage.scene.updateMatrixWorld();
      // effets plein écran (onde de choc, aberration) : centrés sur la scène
      proj.set(0, 0, 0).applyMatrix4(rig.matrixWorld).project(stage.camera);
      U.center.value.set(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
      /*
       * (audit PERF1-07) Téléphone, vitrine au repos (le booster ne fait que flotter, personne ne le touche, rien ne
       * tourne ni ne glisse) : une image sur deux — 30 i/s, l'animation garde son temps réel. Le moindre mouvement
       * (doigt, gyroscope, changement de booster, décalage) repasse aussitôt à 60 i/s.
       */
      const tx = ctx.input.tiltX, ty = ctx.input.tiltY;
      const tiltMoving = Math.abs(tx - lastTilt.x) + Math.abs(ty - lastTilt.y) > 0.004;
      lastTilt.set(tx, ty);
      const calm = ctx.quality === 'mobile' && phase === 'display' && !ctx.input.down && !tiltMoving && !spinTl?.isActive() && !tl?.isActive() && Math.abs(dispK - 1) < 0.01 && Math.abs(focusCur - focusT) < 0.5 && packLift < 0.01;
      feedArts();
      // roue des boosters (téléphone) : posée juste avant le rendu ; une roue qui tourne = pas d'image sautée
      if (wheel3d) {
        if (phase === 'display' && wheelItems && !ctx.overlay.hidden) wheel3d.set(wheelItems, cameraScale(stage.camera, ctx.height).k);
        else if (!reel?.active) wheel3d.hide();
      }
      if (!calm || wheelDirty) calmSkip = 0;
      if (!calm || wheelDirty || (calmSkip++ & 1) === 0) post.render();
      wheelDirty = false;
      // (V3 lot 04) badges DOM de l'éventail final : prévenus seulement quand une carte a bougé à l'écran (matrices de
      // l'image qui vient d'être rendue → badges et cartes dans la même image)
      if (api.onFanMove && phase === 'done' && slots.length) {
        const rects = api.fanRects();
        if (rects) {
          let moved = fanSig.length !== rects.length * 4;
          for (let k = 0; k < rects.length; k++) {
            const r = rects[k], o = k * 4;
            if (fanSig[o] !== r.x || fanSig[o + 1] !== r.y || fanSig[o + 2] !== r.w || fanSig[o + 3] !== r.h) {
              moved = true;
              fanSig[o] = r.x;
              fanSig[o + 1] = r.y;
              fanSig[o + 2] = r.w;
              fanSig[o + 3] = r.h;
            }
          }
          if (moved) {
            fanSig.length = rects.length * 4;
            api.onFanMove(rects);
          }
        }
      } else if (fanSig.length) fanSig.length = 0;
    },
    resize(w, h) {
      stage.fit(w, h);
      camBase = stage.camera.position.z;
      layout(w, h);
      // (audit UX2-12) rotation / redimensionnement pendant l'ouverture : éventail final et rangée du bas reprennent
      // leurs places pour le nouvel écran (au lieu de rester sur l'ancienne mise en page)
      if (!slots.length || !order.length) return;
      const re = sideline(gsap.timeline());
      if (phase === 'done') {
        const places = finalPlaces();
        order.forEach((si, k) => re.to(slots[si].p, { ...places[k], duration: 0.3, ease: EASE.glide }, 0));
      } else {
        // cartes déjà rangées (pas pendant le retrait final : elles sortent de l'écran)
        const lastUp = cursor === order.length - 1;
        if (!lastUp && (phase === 'opened' || phase === 'shown')) for (let j = 0; j < cursor; j++) re.to(slots[order[j]].p, { ...rowPlace(j), duration: 0.3, ease: EASE.glide }, 0);
      }
    },
    /**
     * (audit 12/11, E3-01) Téléphone, ouverture quittée (appelé par le shell) : ses cibles plein écran (scène en
     * demi-flottant ×4 échantillons + bloom) étaient gardées pendant la visionneuse, les pages et les duels. Recréées
     * au prochain rendu, mêmes formats → mêmes pipelines (comme la visionneuse et le duel).
     */
    suspend() {
      releaseTargets?.();
    },
    dispose() {},
  };
  function layout(w: number, h: number) {
    // (Éclipse) soleil noir : 15 % de la hauteur, mais jamais plus de 54 % de la largeur en portrait
    if (h > 0) U.eclR.value = Math.min(0.15, (0.27 * w) / h);
    // vitrine. Ordinateur (retours live n°1) : 3 colonnes, plus de rangée en bas → le GROS booster, centré, comme
    // avant. Téléphone / écran étroit : la rangée des pochettes occupe le bas → le booster remonte (plus en portrait).
    const portrait = w / h < 0.8;
    const wide = !portrait && typeof window !== 'undefined' && window.innerWidth > 860;
    // téléphone en paysage (844×390…) : pochettes compactes en bas (CSS lot B) → booster un peu plus haut et plus petit
    const shortLand = !portrait && !wide && h > 0 && h < 500;
    // portrait court (360×740) : un peu plus haut et plus petit, le bouton « Ouvrir » de l'accueil passe sous le booster
    const shortPortrait = portrait && h > 0 && h < 780;
    // (téléphone, 4 nov. : plus de bouton « Ouvrir » sous le booster → il redescend un peu)
    L.dispY = wide ? 0.02 : portrait ? (shortPortrait ? 0.25 : 0.2) : shortLand ? 0.3 : 0.1;
    // (07/11) ordinateur : roue verticale → le grand booster un peu plus petit, ses voisines dépassent en haut et en bas
    L.dispS = wide ? (reel ? 0.64 : 0.84) : shortLand ? 0.46 : shortPortrait ? 0.5 : 0.56;
    if (reel) {
      reel.enabled = wide;
      reel.snap();
    }
  }
  return api;
}
