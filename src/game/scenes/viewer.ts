import { cardHasCutout } from '../../core/pokeHolo/face';
import { AdditiveBlending, Color, DataTexture, DirectionalLight, Group, Mesh, MeshBasicNodeMaterial, NearestFilter, PlaneGeometry, RGFormat, UnsignedByteType, Vector3, type Material, CircleGeometry } from 'three/webgpu';
/** rayon du dodécagone circonscrit / rayon du cercle inscrit */
const HALO_K = 1 / Math.cos(Math.PI / 12);
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { mobileArtScale } from '../../core/renderer';
import { createPipeline } from '../../core/post';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { abs, floor, fract, length, mix, sin, smoothstep, step, texture, uniform, uv, vec2, vec4 } from 'three/tsl';
import { musicBands, musicLevel, musicLevels } from '../musicPreview';
import type { N } from '../../core/tsl';
import { ensureCardImages, ensureFonts, generateCardArt, nextFrame, type CardArt } from '../../core/art';
import { LAB_CARDS, cardById } from '../../core/cardData';
import { rarity, type RarityId } from '../../core/rarity';
import { CARD, createCardGeometry } from '../../core/cardModel';
import { EASE, springCurve, smoothstep as smooth } from '../../core/ease';
import { reducedMotion, DUR, SPRING } from '../../core/motion';
import { haptics } from '../../core/haptics';
import { buildEdge, buildFace, gameCardArtAsync, themedBacks } from './cardFace';
import type { WonderVisualInstance } from '../../core/wonderDiorama';

/**
 * Diorama des 14 Merveilles (GLTFLoader, meshopt, environnement : ~100 Ko) chargé à la première Merveille ouverte
 * (audit PERF2-05) : la visionneuse est préparée à chaque session, les Merveilles sont des cartes secrètes rarissimes.
 */
let wonderMod: Promise<typeof import('../../core/wonderDiorama')> | null = null;
let wonderLimit = 0;
const loadWonder = () => {
  if (!wonderMod) {
    wonderMod = Promise.all([import('../../core/wonderDiorama'), import('../../core/wonderModels')]).then(([d, m]) => {
      // téléphone : 2 Merveilles gardées assemblées au plus (celle affichée et la précédente) — leurs textures WebP
      // décodées pèsent jusqu'à ~21 Mo chacune et n'étaient jamais libérées
      if (wonderLimit) m.setWonderModelLimit(wonderLimit);
      return d;
    });
    wonderMod.catch(() => (wonderMod = null)); // (réseau : on réessaiera à la prochaine Merveille)
  }
  return wonderMod;
};
/** Même test que `isWonderCard` (core/wonderDiorama.ts), sans charger le module. */
const isWonderCard = (cardId: string) => cardId.startsWith('mrv-');

/** (11/11) Skins CS 6★ en 3D dans la carte (core/csPortal) : module chargé à la première carte concernée. */
let csMod: Promise<typeof import('../../core/csPortal')> | null = null;
const loadCs = () => {
  if (!csMod) {
    csMod = import('../../core/csPortal');
    csMod.catch(() => (csMod = null));
  }
  return csMod;
};

/**
 * Visionneuse de la collection : la carte en grand, en vrai 3D (holo, parallaxe), inclinable au doigt / à la souris,
 * qu'on fait tourner en la glissant. À l'ouverture : un tour sur elle-même, puis ses étoiles s'allument une à une.
 */
export interface ViewerScene extends Experiment {
  /** `dir` : on passe à la carte suivante (1) ou précédente (-1) → courte rotation latérale au lieu du grand tour */
  /**
   * `hold` (10/11, scènes 6★ — game/mythicEncounter.ts) : la carte se prépare, puis ATTEND cette promesse de dos, au
   * centre de l'écran, à la largeur `fromW` (px CSS : celle de la doublure 2D de la scène, qui se fond sur elle) ;
   * ensuite elle se retourne en venant à sa place de repos (au lieu du tour d'entrée habituel).
   */
  /**
   * `ghost` (V3, lot 02) : une image 2D de la carte vole depuis sa tuile jusqu'à `restRect()` (game/sharedFlight.ts) ;
   * la carte 3D, prête, attend son arrivée puis apparaît EXACTEMENT là, de face, à l'échelle 1 (pas de tour d'entrée :
   * c'est la tuile qui est devenue la carte). Ignoré avec `dir` ou `hold`.
   */
  show(cardId: string, rarityId: RarityId, opts?: { dir?: 1 | -1; quiet?: boolean; hold?: Promise<void>; fromW?: number; ghost?: Promise<void> }): Promise<void>;
  /** Vrai si le point (NDC −1..1) est sur la carte : un toucher ailleurs ferme la visionneuse (« clic hors zone »). */
  hits(ndcX: number, ndcY: number): boolean;
  /**
   * (V2 fluidité, lot 6) où la carte se pose à l'écran une fois arrivée (au repos, sans zoom), en coordonnées
   * normalisées (−1..1, y vers le haut) : cible de la tuile qui « grandit » vers la carte 3D. null avant le montage.
   */
  restRect(): { x0: number; y0: number; x1: number; y1: number } | null;
  /**
   * (V3, lot 02) où est la carte À CET INSTANT (NDC, boîte englobante : inclinaison, zoom, flottement compris) — départ
   * du vol retour vers la tuile. null si rien à montrer en 2D : carte cachée, de dos (l'image de la tuile est la face),
   * couchée (carte horizontale) ou skin CS (gros plan).
   */
  cardRect(): { x0: number; y0: number; x1: number; y1: number } | null;
}

/** (v2.0.2) la carte au repos est relevée de 0,1 (la fiche texte se lit dessous) : `lift` de la boucle, et `restRect` */
const REST_LIFT = 0.1;
/**
 * (V3, lot S2) RETOURNEMENT TIRÉ AU DOIGT. Carte posée DE DOS dans la visionneuse (on l'a fait tourner au doigt jusqu'à
 * son dos : le glissé s'aimante sur la face la plus proche) : on la retourne en la tirant vers la droite, autour de sa
 * tranche DROITE (même charnière que l'ouverture, opening.ts `HINGE`) — le bord gauche se soulève vers soi, le droit
 * reste posé. POINT DUR à HINGE_DETENT_DEG : relâchée avant, elle retombe sur le dos (« pat » sourd) ; le point franchi,
 * déclic franc (tic + vibration) et, relâchée, elle finit de s'ouvrir. Reprise au doigt à tout instant en plein vol.
 * Glisser vers la GAUCHE depuis le dos = la rotation libre d'avant.
 */
/** angle du point dur (degrés) — À RÉGLER après essai sur téléphone */
export const HINGE_DETENT_DEG = 58;
const HINGE_DETENT = (HINGE_DETENT_DEG * Math.PI) / 180;
/** résistance du point dur (rad) : la carte « retient » jusqu'à HINGE_DETENT, puis rattrape d'un coup (le claquement) */
const HINGE_HOLD = 0.1;
/** course du doigt pour un demi-tour, en largeurs de carte à l'écran */
const HINGE_SPAN = 1.3;
/** coup de doigt (rad/s) qui ouvre ou referme quel que soit l'angle */
const HINGE_FLICK = 3.6;
/** part de la perspective visible quand le bord se soulève (même valeur que l'ouverture : HINGE_PERSP) */
const HINGE_PERSP = 0.55;

export function createViewerScene(): ViewerScene {
  let ctx: LabContext;
  let stage: ReturnType<typeof createStage>;
  const rig = new Group();
  let mesh: Mesh | null = null;
  let art: CardArt | null = null;
  let mats: Material[] = [];
  let backMat: Material;
  let backs: ReturnType<typeof themedBacks>;
  let geo: ReturnType<typeof createCardGeometry>;
  let face: ReturnType<typeof buildFace> | null = null;
  let wonderInstance: WonderVisualInstance | null = null;
  /** carte-fenêtre d'un skin CS 6★ (même rôle que wonderInstance) */
  let csInstance: import('../../core/csPortal').CsVisualInstance | null = null;
  let tl: gsap.core.Timeline | null = null;
  let token = 0;
  const st = { spin: Math.PI, s: 0.85, z: -0.3, x: 0, y: 0 };
  /**
   * (11/11) carte HORIZONTALE (art.landscape, KCDQ Teto) : après son entrée, la carte se couche d'un quart de tour
   * (`rz`) pendant que la caméra recule un peu (`cam`, multiple de sa distance) puis se repose à la distance où la
   * carte couchée tient dans l'écran.
   */
  const pose = { rz: 0, cam: 1 };
  let camBase = 0;
  /** distance de caméra (× la distance portrait) où la carte couchée tient dans l'écran */
  const landscapeCam = () => {
    const cam = stage.camera;
    const t = Math.tan(((cam.fov * Math.PI) / 180) / 2);
    const dPort = Math.max(CARD.h / 0.6 / (2 * t), CARD.w / 0.66 / (2 * t * cam.aspect));
    // couchée : 0,63 de haut, 0,88 de large — un peu moins haute que la portrait (la fiche se lit dessous), et jamais plus
    // près qu'avant (le recul voulu : sur un écran large, la caméra recule puis revient à sa place)
    const dLand = Math.max(CARD.w / 0.5 / (2 * t), CARD.h / 0.8 / (2 * t * cam.aspect));
    return Math.max(1, dLand / dPort);
  };
  let render: () => void = () => undefined;
  let pipe: ReturnType<typeof createPipeline> | null = null;
  let bloomStrength: { value: number } | null = null;
  /** halo derrière la carte, de la couleur de sa rareté (plus présent et « vivant » pour légendaire et mieux) */
  const halo = { color: uniform(new Color('#ffffff')), k: uniform(0) };
  /**
   * (13/11, retours Hugo) BARRES DE MUSIQUE derrière la carte quand son extrait joue (6★ Musique, openings d'animés) :
   * le spectre de l'extrait (musicPreview.ts), graves au centre, en miroir, de la couleur du halo. Un plan derrière la
   * carte, une texture de EQ_N octets mise à jour à chaque image, invisible (et non dessiné) sans musique.
   * (24/11, Hugo) EN COULEUR et réactives, sur le vrai spectre seulement (`musicBands.live`) : chaque barre prend la
   * couleur de sa fréquence (graves rose-rouge au centre → ambre → cyan → violet vers les aigus, un peu teintée par la
   * rareté), une crête retombe lentement au-dessus d'elle, les graves gonflent les barres et un coup de grosse caisse
   * fait respirer une nappe douce sous la rangée, les aigus font scintiller la pointe des barres. Texture RG : niveau,
   * crête. Sans vrai spectre (Safari, Deezer) : les couleurs, sans réaction (pas de faux battement coloré).
   */
  const EQ_N = 48;
  const eqLv = new Float32Array(EQ_N);
  const eqSm = new Float32Array(EQ_N);
  const eqPk = new Float32Array(EQ_N);
  const eqData = new Uint8Array(EQ_N * 2);
  const eqTex = new DataTexture(eqData, EQ_N, 1, RGFormat, UnsignedByteType);
  eqTex.magFilter = eqTex.minFilter = NearestFilter;
  eqTex.needsUpdate = true;
  const eqK = uniform(0);
  const eqBass = uniform(0);
  const eqKick = uniform(0);
  const eqTreble = uniform(0);
  const eqT = uniform(0);
  const eqC = ['#ff2e63', '#ffb12a', '#2ee6ff', '#9b5cff'].map((h) => uniform(new Color(h)));
  let eqMesh: Mesh | null = null;
  let eqVis = 0;
  const haloT = { k: 0, pulse: 0 };
  const haloColor = new Color('#ffffff');
  /** zoom d'inspection (molette, ou deux touchers rapides) : cible et valeur lissée */
  let zoomT = 1;
  /** gros plan des skins CS 6★ (×CS_CLOSE, en douceur) */
  const CS_CLOSE = 1.22;
  let csClose = 1;
  let zoom = 1;
  let lastTap = 0;
  /**
   * (V3, lot 01) RENDU À LA DEMANDE. Une image n'est calculée que si quelque chose a VRAIMENT changé à l'écran depuis
   * la dernière : pose de la carte, caméra, halo, étoiles, barres de musique (`sig`, comparé à `drawn`, celle de la
   * dernière image calculée). Avant : une image sur deux « au calme » — le flottement lent, le zoom qui se pose et
   * l'inclinaison fine au gyroscope tombaient à 30 i/s (saccade), et la visionneuse ne s'arrêtait jamais (60 → 30 i/s
   * sur la table). Maintenant : pleine cadence pendant un geste, une image sur deux quand la carte ne fait que flotter
   * (comme avant), AUCUNE image quand plus rien ne bouge.
   * Ce qui s'anime TOUT SEUL dans le temps (la carte ne doit jamais se figer) :
   *  - Merveilles (diorama), skins CS 6★, barres de musique : à chaque image, toujours ;
   *  - faces de palier ≥ 4 hors photo (reflet « Pokébox » : `time` dans pokeHolo/fx.ts) et halo qui palpite (5★, 6★,
   *    secrète) : des variations LENTES (dérive de l'arc-en-ciel sur 21 s, pouls de ±18 % sur 4 s) — une image sur deux
   *    une fois la carte posée, comme avant (le pas d'une image à l'autre est invisible) ;
   *  - le flottement d'ambiance (balancement + lévitation) : il ne s'arrête jamais (DA : animations toujours actives),
   *    une image sur deux hors geste comme avant ; une carte simple flotte donc toujours : le « 0 image » vaut pour une
   *    carte qui ne flotte pas (zoomée tenue, etc.). Pour la batterie, on pourrait le poser après quelques secondes
   *    sans geste : décision de Tom (changement visible).
   * Réveil dans la même image (la boucle du shell appelle `update` à chaque image) : toucher, souris, gyroscope, zoom,
   * timeline, musique ; et une image forcée après un redimensionnement, une autre scène dessinée sur le canvas
   * (`renderer.info.calls` a bougé : préchauffage, scène jouée par-dessus) ou une pause de la boucle.
   */
  const SIG_N = 20;
  const sig = new Float64Array(SIG_N);
  const drawn = new Float64Array(SIG_N).fill(NaN);
  /** plus petit écart qui compte (radians, unités de scène, couleur) : bien sous le pixel, reflets holo compris */
  const SIG_EPS = 1e-4;
  let drawnCalls = -1;
  let drawnW = 0;
  let drawnH = 0;
  let lastUpd = 0;
  /** une image obligatoire (redimensionnement, retour de la scène) */
  let wake = true;
  /** préparation hors champ en cours (`show`) : ses deux images DOIVENT être rendues (pipelines construits là) */
  let warming = 0;
  /** effets lents seuls (voir plus haut) : une image sur deux */
  let slowSkip = 0;
  /** horloge du flottement (s) */
  let ambT = 0;
  /** balancement : 1 = libre, 0 = doigt / souris sur la carte (lissé : il ne saute plus au toucher ni au lâcher) */
  let idleS = 1;
  const lastNdc = { x: 0, y: 0 };
  /** inclinaison de référence : un écart de plus de TILT_WAKE = le téléphone a bougé (le bruit du capteur n'y suffit pas) */
  const tiltRef = { x: 0, y: 0 };
  const TILT_WAKE = 0.02;
  /** secondes depuis le dernier mouvement du téléphone */
  let tiltT = 9;
  /** la face a un reflet animé dans le temps (palier ≥ 4, hors photo : pokeHolo) */
  let timeFx = false;
  const setZoom = (z: number) => {
    zoomT = Math.min(1.85, Math.max(1, z));
    document.body.classList.toggle('viewer-zoomed', zoomT > 1.04);
    // (v2.0.1) les boutons s'effacent avec le zoom : 0 = zoom de base, 1 = zoom max
    document.body.style.setProperty('--vz', ((zoomT - 1) / 0.85).toFixed(3));
  };

  const corner = new Vector3();
  function hits(nx: number, ny: number): boolean {
    if (!mesh) return false;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      corner.set((cx * 0.63) / 2, (cy * 0.88) / 2, 0).applyMatrix4(mesh.matrixWorld).project(stage.camera);
      x0 = Math.min(x0, corner.x); y0 = Math.min(y0, corner.y); x1 = Math.max(x1, corner.x); y1 = Math.max(y1, corner.y);
    }
    // une marge : on ferme seulement en touchant franchement à côté
    const m = 0.08;
    return nx >= x0 - m && nx <= x1 + m && ny >= y0 - m && ny <= y1 + m;
  }

  function restRect() {
    if (!stage) return null;
    stage.camera.updateMatrixWorld();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      // (pose de repos : centre relevé de REST_LIFT, comme `lift` dans la boucle — V3 lot 02 : c'était +0,05 depuis la
      // v2.0.2, la tuile en vol arrivait ≈ 18 px trop bas et la carte 3D « sautait » en prenant le relais)
      corner.set((cx * 0.63) / 2, (cy * 0.88) / 2 + REST_LIFT, 0).project(stage.camera);
      x0 = Math.min(x0, corner.x); y0 = Math.min(y0, corner.y); x1 = Math.max(x1, corner.x); y1 = Math.max(y1, corner.y);
    }
    return Number.isFinite(x0 + y0 + x1 + y1) ? { x0, y0, x1, y1 } : null;
  }

  function cardRect() {
    if (!stage || !mesh || !rig.visible || csInstance || art?.landscape || Math.abs(pose.rz) > 0.01) return null;
    // de dos (rotation libre ou retournement en cours) : la face n'est pas ce qu'on voit
    if (Math.cos(rig.rotation.y) * Math.cos(rig.rotation.x) < 0.2) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      corner.set((cx * 0.63) / 2, (cy * 0.88) / 2, 0).applyMatrix4(mesh.matrixWorld).project(stage.camera);
      x0 = Math.min(x0, corner.x); y0 = Math.min(y0, corner.y); x1 = Math.max(x1, corner.x); y1 = Math.max(y1, corner.y);
    }
    return Number.isFinite(x0 + y0 + x1 + y1) ? { x0, y0, x1, y1 } : null;
  }

  /*
   * (V3, lot S2) état du retournement tiré au doigt (voir HINGE_DETENT_DEG). `a` : angle de charnière (0 = posée de
   * dos, π = de face), `v` sa vitesse (rad/s) ; `turn` : demi-tours acquis (0 ou π) — une fois ouverte, la carte reste
   * de face avec a = 0. `yawOff` : le glissé libre (core/input.ts) garde son angle d'une carte à l'autre ; une nouvelle
   * carte repart de face (multiple de π le plus proche, retiré).
   */
  const hg = { a: 0, v: 0, turn: 0, yawOff: 0, held: false, decided: false, pressed: false, x0: 0, a0: 0, target: -1, armed: true };
  const hingeReset = () => {
    hg.a = hg.v = hg.turn = 0;
    hg.held = hg.decided = false;
    hg.target = -1;
    hg.armed = true;
    hg.yawOff = Math.round(ctx.input.yaw / Math.PI) * Math.PI;
  };
  /** (lot S2) une image du retournement tiré : prise au doigt, suivi, point dur, puis ressort vers le dos ou la face */
  function hinge(dt: number) {
    const inp = ctx.input;
    // relâché : sous le point dur la carte retombe sur le dos, au-delà elle finit de s'ouvrir (un coup de doigt franc
    // décide quel que soit l'angle)
    if (hg.held && !inp.down) {
      hg.held = false;
      if (hg.decided) hg.target = (hg.a >= HINGE_DETENT && hg.v > -HINGE_FLICK) || hg.v > HINGE_FLICK ? Math.PI : 0;
    }
    if (!inp.down) hg.pressed = false;
    else if (!hg.pressed) {
      hg.pressed = true;
      // posée de dos et immobile (tour d'entrée fini : st.spin revient à 0 ; angle libre aimanté sur un dos), ou en
      // train de se retourner : un doigt posé SUR la carte la prend (en plein vol : à l'angle où elle est)
      const face = st.spin + inp.yaw - hg.yawOff + hg.turn;
      const onBack = !!mesh && rig.visible && !csInstance && st.spin === 0 && hg.a === 0 && Math.cos(face) < -0.94;
      if ((onBack || hg.a > 0) && hits(inp.ndcX, inp.ndcY)) {
        hg.held = true;
        hg.decided = hg.a > 0;
        hg.x0 = inp.ndcX;
        // (angle « doigt » qui donne l'angle actuel à travers le point dur : pas de saut à la reprise)
        hg.a0 = hg.a;
        if (hg.a < HINGE_DETENT) for (let i = 0; i < 4; i++) hg.a0 = Math.min(HINGE_DETENT, hg.a + HINGE_HOLD * smooth(HINGE_DETENT - 0.4, HINGE_DETENT, hg.a0));
        hg.v = 0;
        hg.target = -1;
      }
    }
    const prev = hg.a;
    if (hg.held) {
      const dx = ((inp.ndcX - hg.x0) / 2) * ctx.width; // px CSS
      // depuis le dos, le premier mouvement décide : vers la droite = on retourne ; vers la gauche = rotation libre
      if (!hg.decided && Math.abs(dx) > 8) {
        if (dx > 0) hg.decided = true;
        else hg.held = false;
      }
      if (hg.held && hg.decided) {
        const r = restRect();
        const cardPx = r ? ((r.x1 - r.x0) / 2) * ctx.width * zoom : ctx.width * 0.5;
        const raw = Math.min(Math.PI, Math.max(0, hg.a0 + (dx / Math.max(120, cardPx * HINGE_SPAN)) * Math.PI));
        // point dur : en approchant, la carte prend du retard sur le doigt ; le point franchi, elle rattrape d'un coup
        hg.a = raw < HINGE_DETENT ? Math.max(0, raw - HINGE_HOLD * smooth(HINGE_DETENT - 0.4, HINGE_DETENT, raw)) : raw;
        hg.v = hg.v * 0.6 + ((hg.a - prev) / Math.max(dt, 1 / 240)) * 0.4;
      }
    } else if (hg.target >= 0) {
      // ressort de pose des cartes (motion.ts), sous-pas fixes comme core/ease Spring
      const { stiffness: k, damping: c } = SPRING.carte;
      const n = Math.max(1, Math.ceil(dt * 240));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        hg.v += (k * (hg.target - hg.a) - c * hg.v) * h;
        hg.a += hg.v * h;
      }
      if (hg.target === 0 && hg.a <= 0) {
        // retombée contre la table : arrêt net, petit son sourd
        hg.a = hg.v = 0;
        hg.target = -1;
        ctx.sfx.pat(0.28);
      } else if (hg.target > 0 && Math.abs(hg.a - Math.PI) < 0.004 && Math.abs(hg.v) < 0.05) {
        // ouverte : le demi-tour est acquis, la carte reste de face (même pose : turn + π ≡ a = π)
        hg.turn = (hg.turn + Math.PI) % (Math.PI * 2);
        hg.a = hg.v = 0;
        hg.target = -1;
      }
    }
    // le point dur franchi vers l'ouverture : déclic franc (réarmé en redescendant nettement dessous)
    if (hg.armed && prev < HINGE_DETENT && hg.a >= HINGE_DETENT) {
      hg.armed = false;
      ctx.sfx.tick(1.38, 0.24);
      haptics.pulse(12);
    } else if (!hg.armed && hg.a < HINGE_DETENT * 0.88) hg.armed = true;
    // carte soulevée : la tranche de la pile (game/riffle.ts, DOM au-dessus du canvas) s'efface, la carte passe devant
    const up = hg.a > 0;
    if (up !== hingeUp) document.body.classList.toggle('viewer-hinge', (hingeUp = up));
  }
  let hingeUp = false;

  function clear() {
    if (wonderInstance) {
      wonderInstance.dispose();
      wonderInstance = null;
    }
    if (csInstance) {
      csInstance.dispose();
      csInstance = null;
    }
    if (mesh) {
      rig.remove(mesh);
      // (perf 06/11, fuite) sinon three garde l'objet de rendu (maillage + dos partagé) et, par lui, la face, ses
      // textures et ses toiles : une carte retenue par carte regardée, pour toute la session
      mesh.dispatchEvent({ type: 'dispose' } as never);
    }
    mats.forEach((m) => m.dispose());
    art?.dispose();
    mesh = null;
    art = null;
    mats = [];
    face = null;
    timeFx = false;
  }

  return {
    hits,
    restRect,
    cardRect,
    // définition native de l'écran (×3 sur iPhone) : une seule carte, scène légère — c'est l'écran où l'on inspecte
    dprCap: 3,
    /** pour le shell : au repos tant que la carte n'est ni touchée, ni animée, ni zoomée (changement de définition 3D permis) */
    pacing: () => (tl?.isActive() || ctx.input.down || ctx.input.dragging || hg.target >= 0 || Math.abs(zoomT - zoom) > 0.002 ? 'busy' : 'rest'),
    async show(cardId, rarityId, opts) {
      const my = ++token;
      setZoom(1); // nouvelle carte : on repart sans zoom
      hingeReset(); // (lot S2) … et de face, sans retournement en cours
      // (lot 02) vol depuis la tuile : seulement pour une ouverture simple (pas de carte voisine, pas de scène 6★)
      const ghost = !opts?.dir && !opts?.hold ? opts?.ghost : undefined;
      const cd = cardById(cardId);
      const mobile = ctx.quality === 'mobile';
      // nouvelle ouverture : rien de l'ancienne carte ne s'affiche le temps de préparer la nouvelle
      if (!opts?.dir) {
        rig.visible = false;
        haloT.k = 0;
        // (audit 12/11, E3-08) l'ancienne carte est libérée TOUT DE SUITE (elle est déjà cachée) : la nouvelle se peignait
        // et partait au GPU avant, deux cartes en mémoire pendant ≈ 4 images (82 Mo sur iPhone). En glissé, les deux
        // cartes se voient : l'ordre d'avant est gardé.
        tl?.kill();
        clear();
      }
      // Merveille : on n'attend plus le modèle 3D (≈ 1–2 Mo) — le diorama montre le monument procédural puis le
      // remplace dès que le modèle arrive (avant : visionneuse figée le temps du téléchargement en 4G)
      const wonder = isWonderCard(cardId) ? loadWonder() : null;
      void wonder?.then((w) => w.preloadWonderModel(cardId), () => undefined);
      // skin CS 6★ : modèle + textures (~300 Ko) chargés avec les illustrations ; échec réseau / animations réduites sur l'appareil → carte normale
      const csAssets = rarityId === 'mythic' && !reducedMotion() && cardId.startsWith('cs-')
        ? loadCs().then((m) => (m.isCs3dCard(cardId) ? m.preloadCs3d(cardId).then((a) => ({ m, a })) : null)).catch(() => null)
        : null;
      await ensureCardImages([cd]);
      if (my !== token) return;
      // (le module du diorama arrive en parallèle des illustrations ; en cas d'échec réseau, la carte s'affiche sans)
      const W = wonder ? await wonder.catch(() => null) : null;
      const CS = csAssets ? await csAssets : null;
      if (my !== token) return;
      const rr = rarity(rarityId);
      // mobile : calques à la taille réelle de la carte à l'écran, zoom d'inspection compris (×1,6 → jusqu'à ×1,25 de la
      // base, écran ×3 ; audit 06/11 : à 0,8 la carte zoomée était agrandie ×2) ; bornée à ×1 sur les appareils à ≤ 4 Go
      const lowMem = ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
      const scale = mobile ? mobileArtScale(ctx.width, ctx.height, 0.8 * 1.6, lowMem ? 1 : 1.25, 3) : 1;
      let nextArt: CardArt;
      // (audit 12/11, S17 / A9-08) même voie sur ordinateur : peinture en étapes, textures envoyées deux par image
      {
        // téléphone : calques peints en 4 étapes (plus de pic de 20–80 ms), puis envoyés au GPU AVANT le tour d'entrée
        // (avant : 6 textures + mipmaps dans la 1re image du tour → à-coup) ; les toiles sont vidées aussitôt (release)
        nextArt = await gameCardArtAsync(cd, rarityId, scale);
        if (my !== token) return nextArt.dispose();
        // deux textures (+ mipmaps) par image, comme à l'ouverture : plus d'à-coup de 8–20 ms quand on feuillette
        const texs = [nextArt.bg, nextArt.subject, nextArt.fg, nextArt.frame, nextArt.masks, nextArt.fx];
        for (let i = 0; i < texs.length; i += 2) {
          ctx.renderer.initTexture(texs[i]);
          if (texs[i + 1]) ctx.renderer.initTexture(texs[i + 1]);
          await nextFrame();
          if (my !== token) return nextArt.dispose();
        }
      }
      // (audit 12/11, S09 / E4-22) carte ordinaire : face, tranche et dos préparés AVANT le tour d'entrée. Le maillage
      // passe une image hors champ (derrière la caméra, rien n'est dessiné) : three y construit ses nœuds et ses
      // pipelines, et le dos neuf d'un thème y envoie ses 2 textures — plus dans la 1re image du tour d'entrée.
      let pre: { face: ReturnType<typeof buildFace>; edge: Material; mesh: Mesh } | null = null;
      if (!W && !CS) {
        const back = backs.forCard(cardId);
        if (mobile) {
          const send = backs.toSend(back);
          if (send.length) {
            send.forEach((t) => ctx.renderer.initTexture(t));
            await nextFrame();
            if (my !== token) return nextArt.dispose();
          }
        }
        const pf = buildFace(nextArt, rr.tier, !!cd.photo, cardHasCutout(cd));
        const { edge: pe } = buildEdge(rr.hex);
        const pm = new Mesh(geo, [pf.holo.material, back, pe]);
        pm.frustumCulled = false;
        pm.position.z = camBase + 10;
        stage.scene.add(pm);
        warming++; // (rendu à la demande : ces deux images sont calculées même carte immobile)
        // (deux VRAIES images : `nextFrame` de core/art rend seulement la main, sans attendre un rendu ; 120 ms au plus,
        // pour ne pas rester en attente quand rien n'est dessiné — onglet caché)
        await Promise.race([new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))), new Promise<void>((r) => setTimeout(r, 120))]);
        warming--;
        stage.scene.remove(pm);
        pm.position.z = 0;
        if (my !== token) {
          pm.dispatchEvent({ type: 'dispose' } as never);
          pf.holo.material.dispose();
          pe.dispose();
          return nextArt.dispose();
        }
        pre = { face: pf, edge: pe, mesh: pm };
      }
      // (lot 02) la carte est prête : elle attend que la tuile en vol soit posée à sa place (`restRect`) pour apparaître
      // dessous, à l'identique — fermer en plein vol abandonne ici (le fantôme repart vers la tuile)
      if (ghost) {
        await ghost;
        if (my !== token) {
          if (pre) {
            pre.mesh.dispatchEvent({ type: 'dispose' } as never);
            pre.face.holo.material.dispose();
            pre.edge.dispose();
          }
          return nextArt.dispose();
        }
      }
      clear();
      rig.visible = true;
      art = nextArt;
      face = pre ? pre.face : buildFace(art, rr.tier, !!cd.photo, cardHasCutout(cd));
      face.holo.uniforms.strength.value = 0.7;
      // (même règle que createHoloMaterial : reflet pokeHolo hors photo ; paliers 4–5 = illustration-rare,
      // double-rare-placed, qui lisent `time`)
      timeFx = !cd.photo && rr.tier >= 4;

      if (W) {
        const { edge } = buildEdge('#ffd27a');
        wonderInstance = W.createWonderCardInstance(
          cardId,
          art,
          backs.forCard(cardId),
          edge,
          geo,
          stage.camera,
          ctx.quality,
          1.15,
          ctx.renderer,
        );
        mesh = wonderInstance.cardMesh;
        // (07/11, retours de Tom : 2e Merveille sans modèle 3D tant qu'on ne recharge pas) `mesh.material` est un TABLEAU
        // [face, dos, tranche] : mis tel quel dans `mats`, clear() plantait sur `.dispose` (« e.dispose is not a
        // function ») et laissait la visionneuse à moitié nettoyée. La face est libérée par wonderInstance.dispose(), le
        // dos est partagé (backs) : seule la tranche est à nous.
        mats = [edge];
        rig.add(mesh);
        haloColor.set('#f5c662');
      } else if (CS) {
        const { edge } = buildEdge(rr.hex);
        csInstance = CS.m.createCsCardInstance(cardId, CS.a, art, backs.forCard(cardId), edge, geo, stage.camera, ctx.quality, ctx.renderer);
        mesh = csInstance.cardMesh;
        // la face est à l'instance (libérée par csInstance.dispose()), le dos est partagé : seule la tranche est à nous
        mats = [edge];
        rig.add(mesh);
        haloColor.set(rr.hex);
      } else {
        const edge = pre ? pre.edge : buildEdge(rr.hex).edge;
        mats = [face.holo.material, edge];
        mesh = pre ? pre.mesh : new Mesh(geo, [face.holo.material, backs.forCard(cardId), edge]);
        rig.add(mesh);
        haloColor.set(rr.secret ? '#e8927c' : rr.tier === 0 ? '#ffffff' : rr.hex);
      }

      tl?.kill();
      const f = face;
      // (10/11) une scène 6★ se joue au-dessus : la carte attend de dos, déjà à sa place ; le calque se fond dessus
      const held = !!opts?.hold && !opts.dir;
      if (held) {
        // même taille et même place que la doublure : centre de l'écran (le repos est 0,05 plus haut), largeur fromW
        const r = restRect();
        const restW = r ? ((r.x1 - r.x0) / 2) * ctx.width : 0;
        const s0 = restW > 0 && opts!.fromW ? Math.min(1.15, Math.max(0.4, opts!.fromW / restW)) : 1;
        Object.assign(st, { spin: Math.PI, s: s0, z: 0, x: 0, y: -0.05 });
        haloT.k = 0;
        await opts!.hold;
        if (my !== token) return;
      }
      tl = gsap.timeline();
      // halo : il prend la couleur de la carte et monte doucement (presque rien pour une commune)
      if (!opts?.dir) halo.color.value.copy(haloColor); // nouvelle ouverture : couleur posée ; carte voisine : fondu
      haloT.pulse = rr.tier >= 4 || rr.secret ? 1 : 0;
      const haloK = [0.05, 0.07, 0.12, 0.17, 0.24, 0.3, 0.3][Math.min(6, rr.tier)];
      // carte voisine : le halo glisse d'une couleur à l'autre sans s'éteindre ; nouvelle ouverture : il monte depuis 0
      if (opts?.dir) tl.to(haloT, { k: haloK, duration: 0.6, ease: EASE.glide }, 0);
      else tl.fromTo(haloT, { k: 0 }, { k: haloK, duration: 1.1, ease: EASE.glide }, 0.2);
      const dir = opts?.dir ?? 0;
      // (retours 06/11) `quiet` : aucun son (collection — on y feuillette beaucoup de cartes)
      const sfx = opts?.quiet ? null : ctx.sfx;
      let at = 0.9;
      if (dir) {
        // carte voisine : elle arrive de côté en pivotant d'un quart de tour (feuilleter un classeur)
        Object.assign(st, { spin: -dir * Math.PI * 0.5, s: 0.94, z: -0.08, x: dir * 0.32, y: 0 });
        tl.to(st, { spin: 0, x: 0, z: 0, s: 1, duration: 0.5, ease: EASE.glide, onStart: () => sfx?.whoosh(0.22, 0.05) }, 0);
        at = 0.3;
      } else if (held) {
        // le calque de la scène finit de se fondre (0,4 s) sur la carte de dos ; elle se retourne en venant à sa place
        const lead = (DUR.emphatique() / 1000) * 0.85; // (le fondu du calque dure « emphatique », core/motion.ts)
        tl.to(st, { s: 1, y: 0, duration: 0.8, ease: EASE.glide }, lead)
          .to(st, { spin: Math.PI * 2, duration: 1.0, ease: springCurve(0.55, 11), onStart: () => sfx?.whoosh(0.35, 0.08) }, lead + 0.04)
          .call(() => (st.spin = 0), [], lead + 1.04);
        at = lead + 0.82;
      } else if (ghost) {
        // (lot 02) la tuile est devenue la carte : déjà à sa place, de face, à l'échelle 1 — pas de tour d'entrée (il
        // montrait le dos sous l'image de face qui s'efface : la « téléportation » de l'audit 3.3) ; les étoiles s'allument
        Object.assign(st, { spin: 0, s: 1, z: 0, x: 0, y: 0 });
        ambT = 0; // flottement à zéro (balancement nul) : la carte 3D se superpose à plat sur l'image 2D
        at = DUR.rapide() / 1000;
      } else {
        Object.assign(st, { spin: Math.PI, s: 0.85, z: -0.3, x: 0, y: 0 });
        tl.to(st, { z: 0, s: 1, duration: 0.7, ease: EASE.glide }, 0)
          .to(st, { spin: Math.PI * 2, duration: 1.0, ease: springCurve(0.55, 11), onStart: () => sfx?.whoosh(0.35, 0.08) }, 0.1)
          .call(() => (st.spin = 0), [], 1.1);
      }
      // (11/11) carte horizontale : elle se couche après son entrée, la caméra prend un peu de recul
      if (art.landscape) {
        const k = landscapeCam();
        const t0 = dir || ghost ? 0.3 : 1.0;
        pose.rz = 0;
        tl.to(pose, { rz: Math.PI / 2, duration: 0.9, ease: springCurve(0.62, 9), onStart: () => sfx?.whoosh(0.28, 0.06) }, t0)
          .to(pose, { cam: k * 1.12, duration: 0.45, ease: EASE.glide }, t0)
          .to(pose, { cam: k, duration: 0.9, ease: EASE.glide }, t0 + 0.45);
        at = Math.max(at, t0 + 0.6);
      } else {
        pose.rz = 0;
        tl.to(pose, { cam: 1, duration: 0.5, ease: EASE.glide }, 0);
      }
      const n = Math.min(6, rr.rank + 1);
      const gap = (dir ? 0.06 : 0.1) + rr.tier * 0.015;
      for (let k = 0; k < n; k++) tl.to(f.lit, { value: k + 1, duration: 0.12, onStart: () => sfx?.tick(1 + k * 0.14, 0.06 + rr.tier * 0.012) }, at + k * gap);
      const end = at + n * gap;
      tl.to(f.flash, { value: 1, duration: 0.07, onStart: () => sfx?.chime(Math.max(1, rr.tier), 0.08 + rr.tier * 0.02) }, end)
        .to(f.flash, { value: 0, duration: 1.2, ease: EASE.glide }, end + 0.07);
    },
    async setup(c) {
      ctx = c;
      stage = createStage(c, { bg: ['#000000', '#000000'] /* (C4) noir profond */, env: 'studio', envIntensity: 1.2, fill: 0.47, fillPortrait: 0.54 }); // (v2.0.1) carte un peu plus petite : Rejouer au-dessus, les boutons dessous
      const key = new DirectionalLight(0xfff0e0, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, rig);
      camBase = stage.camera.position.z;
      await ensureFonts();
      if (c.quality === 'mobile') wonderLimit = 2; // (posé au chargement du diorama, cf. loadWonder)
      geo = c.bag.add(createCardGeometry());
      backs = themedBacks(c.bag, 0.6);
      backMat = backs.fallback;
      // préchauffage : une carte factice → les shaders sont prêts au premier clic
      art = generateCardArt(LAB_CARDS[0], 'rare', { scale: 0.25 });
      face = buildFace(art, 2, false);
      const { edge } = buildEdge('#ffffff');
      mats = [face.holo.material, edge];
      mesh = new Mesh(geo, [face.holo.material, backMat, edge]);
      rig.add(mesh);
      // halo derrière la carte (ne tourne pas avec elle)
      const hm = c.bag.add(new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending }));
      // (audit 12/11, S17 / E4-20) dodécagone circonscrit au lieu du carré (voir opening.ts)
      const hd = length(uv().sub(0.5).mul(2 * HALO_K));
      hm.colorNode = vec4(halo.color.mul(smoothstep(1, 0, hd).pow(2.4).mul(halo.k)), 1);
      const haloMesh = new Mesh(c.bag.add(new CircleGeometry(1.2 * HALO_K, 12)), hm);
      haloMesh.position.set(0, 0.05, -0.32);
      stage.scene.add(haloMesh);
      {
        const em = c.bag.add(new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending }));
        const u = uv();
        const fx = u.x.mul(EQ_N);
        const cell = fract(fx);
        const smp = texture(c.bag.add(eqTex), vec2(floor(fx).add(0.5).div(EQ_N), 0.5));
        const d = abs(u.y.sub(0.5)).mul(2);
        // les graves gonflent toute la rangée (jusqu'à +22 %)
        const grow = eqBass.mul(0.22).add(0.8);
        const h = smp.r.mul(grow).add(0.015);
        const inBar = step(0.3, cell).mul(step(cell, 0.7));
        const bar = inBar.mul(step(d, h));
        // crête : un trait fin qui retombe lentement au-dessus de chaque barre
        const capY = smp.g.mul(grow).add(0.03);
        const cap = inBar.mul(step(capY.sub(0.018), d)).mul(step(d, capY)).mul(step(0.04, smp.g));
        // couleur par fréquence : graves au centre, aigus vers les bords (en miroir)
        const fq = abs(u.x.sub(0.5)).mul(2);
        const col = mix(mix(eqC[0], eqC[1], smoothstep(0, 0.35, fq)), mix(eqC[2], eqC[3], smoothstep(0.6, 1, fq)), smoothstep(0.3, 0.65, fq));
        const tint = mix(col, halo.color, 0.18);
        // aigus : la pointe des barres scintille, surtout vers les bords
        const tip = smoothstep(h.mul(0.45), h, d);
        const twinkle = sin(eqT.mul(31).add(floor(fx).mul(7.3))).mul(0.5).add(0.5);
        const shimmer = tip.mul(twinkle).mul(eqTreble).mul(fq.mul(0.8).add(0.2)).mul(0.9);
        // les bords s'éteignent (la rangée finit en fondu), le haut des barres un peu plus clair
        const side = smoothstep(0, 0.12, u.x).mul(smoothstep(1, 0.88, u.x));
        // grosse caisse : une nappe douce respire au centre, sous les barres
        const pool = smoothstep(1, 0, length(vec2(u.x.sub(0.5).mul(2.2), d.mul(1.6)))).pow(2).mul(eqKick.mul(0.55).add(eqBass.mul(0.12)));
        const body = bar.mul(d.mul(0.6).add(0.2).add(shimmer)).add(cap.mul(0.9));
        em.colorNode = vec4(tint.mul(body.mul(side)).add(eqC[0].mul(pool)).mul(eqK), 1);
        eqMesh = new Mesh(c.bag.add(new PlaneGeometry(2.6, 1.05)), em);
        eqMesh.position.set(0, 0.05, -0.36);
        // visible au préchauffage (pipeline prêt, eqK = 0 : rien ne se dessine) ; caché dès la première image
        stage.scene.add(eqMesh);
      }
      // bloom sur l'émissif : les étoiles, les paillettes et le foil brillent vraiment (comme à l'ouverture)
      const pl = (pipe = createPipeline(c, stage.scene, stage.camera, { emissive: true, lean: true }));
      const bl = pl.own(bloom(pl.emissive!, 0.3, 0.45, 0.0)) as unknown as N;
      // téléphone : bloom au ¼ de la résolution (au lieu de ½) — l'émissif est épars (étoiles, paillettes) : halo un
      // peu plus doux, −75 % de pixels de bloom en permanence dans la visionneuse
      if (c.quality === 'mobile') (bl as unknown as { setResolutionScale(s: number): void }).setResolutionScale(0.25);
      bloomStrength = (bl as unknown as { strength: { value: number } }).strength;
      pl.output = vec4((pl.color as N).rgb.add(bl.rgb), 1);
      render = () => {
        if (bloomStrength && face) bloomStrength.value = (reducedMotion() ? 0.2 : 0.3) + (face.flash.value as number) * (reducedMotion() ? 0.45 : 0.9);
        pl.render();
      };
      // matériaux compilés, puis une image à blanc hors écran : les VRAIS pipelines (MRT émissif, MSAA, HalfFloat) sont
      // créés ici et non dans la première image affichée (à-coup de 100 à 400 ms au premier zoom de carte — la face holo
      // pèse ≈ 470 nœuds). La carte factice est encore dans le rig : c'est elle qui sert.
      // (audit 12/11, S09 / E2-09) UNE FACE PAR PALIER (0 à 5, + photo) gardée en vie, comme à l'ouverture. Mesuré au banc
      // (WebGL2) : chaque carte ouverte recompilait et reliait son shader de face (28 Ko) — le palier y est écrit en
      // constantes, et three jette un programme dès que plus aucun matériau ne s'en sert (le factice de palier 2 était
      // libéré à la première carte). Ces 7 matériaux ne sont jamais affichés : ils gardent programmes et pipelines en cache.
      const warmArt = generateCardArt(LAB_CARDS[0], 'rare', { scale: 0.25 });
      const warmMats: Material[] = [];
      const warmMeshes: Mesh[] = [];
      for (let t = 0; t <= 6; t++) {
        const wf = buildFace(warmArt, Math.min(5, t), t === 6);
        warmMats.push(wf.holo.material);
        const wm = new Mesh(geo, [wf.holo.material, backMat, edge]);
        wm.position.set((t - 3) * 0.1, 0, -0.4);
        warmMeshes.push(wm);
        stage.scene.add(wm);
      }
      await pl.compile({ real: true });
      pl.warm();
      // (E4-14) préchauffée sur le canvas, la passe a alloué ses cibles en pleine définition : rendues tout de suite sur
      // téléphone (recréées à la première carte, mêmes formats → mêmes pipelines, comme après `suspend`)
      if (c.quality === 'mobile') pl.releaseTargets();
      warmMeshes.forEach((m) => stage.scene.remove(m));
      c.bag.fn(() => {
        warmMeshes.forEach((m) => m.dispatchEvent({ type: 'dispose' } as never));
        warmMats.forEach((m) => m.dispose());
        warmArt.dispose();
      });
      c.bag.fn(() => (tl?.kill(), clear()));
      // inspecter une carte de près : molette (ordinateur) ou deux touchers rapides (téléphone, souris)
      const wheel = (e: WheelEvent) => {
        if (c.overlay.hidden) return;
        e.preventDefault();
        setZoom(zoomT * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
      };
      c.canvas.addEventListener('wheel', wheel, { passive: false });
      c.bag.fn(() => c.canvas.removeEventListener('wheel', wheel));
      c.bag.fn(
        c.input.onTap(() => {
          if (c.overlay.hidden) return;
          const now = performance.now();
          if (now - lastTap < 320) {
            setZoom(zoomT > 1.04 ? 1 : 1.6);
            lastTap = 0;
          } else lastTap = now;
        }),
      );
    },
    update(dt, t) {
      halo.color.value.lerp(haloColor, 1 - Math.exp(-dt * 5));
      // barres de musique : montent avec l'extrait, retombent quand il s'arrête
      {
        const playing = musicLevels(eqLv, t);
        eqVis += ((playing ? musicLevel() : 0) - eqVis) * (1 - Math.exp(-dt * 6));
        if (eqMesh) eqMesh.visible = eqVis > 0.01;
        if (eqVis > 0.01) {
          for (let i = 0; i < EQ_N; i++) {
            const target = playing ? eqLv[i] : 0;
            // monte vite, retombe doucement (lecture d'un vumètre) ; la crête tient puis redescend lentement
            eqSm[i] += (target - eqSm[i]) * (1 - Math.exp(-dt * (target > eqSm[i] ? 22 : 7)));
            eqPk[i] = eqSm[i] >= eqPk[i] ? eqSm[i] : Math.max(0, eqPk[i] - dt * 0.35);
            eqData[2 * i] = Math.round(Math.min(1, eqSm[i]) * 255);
            eqData[2 * i + 1] = Math.round(Math.min(1, eqPk[i]) * 255);
          }
          eqTex.needsUpdate = true;
        }
        // graves, coup de grosse caisse, aigus : seulement sur le vrai spectre
        const live = playing && musicBands.live;
        const follow = (u: { value: number }, v: number, up: number, down: number) => {
          u.value += (v - u.value) * (1 - Math.exp(-dt * (v > u.value ? up : down)));
        };
        follow(eqBass, live ? musicBands.bass : 0, 18, 6);
        follow(eqKick, live ? musicBands.kick : 0, 30, 8);
        follow(eqTreble, live ? musicBands.treble : 0, 24, 8);
        eqT.value = t;
        eqK.value = eqVis * (reducedMotion() ? 0.5 : 1) * 0.42;
      }
      // « réduire les animations » de l'appareil : halo plus faible et immobile
      const red = reducedMotion();
      halo.k.value = haloT.k * (red ? 0.45 : 1 + haloT.pulse * Math.sin(t * 1.6) * 0.18) * (1 + eqKick.value * eqVis * 0.12);
      // ici on fait tourner la carte en la glissant (l'ouverture, elle, le coupe) — sauf pendant un retournement tiré
      ctx.input.spinEnabled = !hg.held;
      // curseur « main » : on attrape la carte pour la faire tourner ; l'indication s'efface après le premier tour
      const cur = ctx.input.dragging ? 'grabbing' : 'grab';
      if (ctx.canvas.style.cursor !== cur) ctx.canvas.style.cursor = cur;
      if (ctx.input.dragging && !document.body.classList.contains('viewer-spun')) document.body.classList.add('viewer-spun');
      const p = ctx.input.pose(0.38);
      hinge(dt);
      // gestes : doigt / bouton appuyé, pointeur qui bouge, téléphone qui bouge (gyroscope), zoom, timeline, musique
      const inp = ctx.input;
      const tx = inp.tiltX, ty = inp.tiltY;
      const moved = inp.ndcX !== lastNdc.x || inp.ndcY !== lastNdc.y;
      lastNdc.x = inp.ndcX;
      lastNdc.y = inp.ndcY;
      const tilted = Math.abs(tx - tiltRef.x) + Math.abs(ty - tiltRef.y) > TILT_WAKE;
      if (tilted) {
        tiltRef.x = tx;
        tiltRef.y = ty;
        tiltT = 0;
      } else tiltT += dt;
      const zooming = Math.abs(zoomT - zoom) > 0.002;
      const anim = !!tl?.isActive();
      const live = !!wonderInstance || !!csInstance || eqVis > 0.01;
      // (inclinaison lente : le seuil TILT_WAKE est franchi par à-coups, la pleine cadence tient 0,4 s après chacun)
      const gesture = inp.down || inp.dragging || moved || tiltT < 0.4 || zooming || anim || live || hg.target >= 0;
      ambT += dt;
      idleS += ((inp.inside ? 0 : 1) - idleS) * (1 - Math.exp((-dt * 3000) / DUR.emphatique()));
      const idle = idleS;
      // (11/11) skin CS 6★ : la carte reste de face, en gros plan ; le geste et le gyroscope tournent le skin dedans
      csClose += ((csInstance ? CS_CLOSE : 1) - csClose) * (1 - Math.exp(-dt * 4));
      if (csInstance) {
        const q = ctx.input.pose(0.9);
        csInstance.inspect.yaw = q.y;
        csInstance.inspect.pitch = q.x;
        csInstance.inspect.idle += ((ctx.input.inside || ctx.input.down ? 0 : 1) - csInstance.inspect.idle) * (1 - Math.exp(-dt * 3));
      }
      // un peu au-dessus du centre (la fiche texte se lit dessous) ; zoomée, la carte se recentre : la fiche s'est effacée
      const lift = REST_LIFT * Math.max(0, 1 - (zoom - 1) / 0.6); // (v2.0.2) plus haut : les boutons en dessous ne la touchent plus
      rig.position.set(st.x, lift + st.y + Math.sin(ambT * 0.9) * 0.006, st.z);
      if (csInstance) rig.rotation.set(0, st.spin, 0);
      else rig.rotation.set(p.x + Math.sin(ambT * 0.5) * 0.05 * idle, st.spin + p.y - hg.yawOff + hg.turn + hg.a + Math.sin(ambT * 0.37) * 0.18 * idle, 0);
      zoom += (zoomT - zoom) * (1 - Math.exp(-dt * 10));
      rig.scale.setScalar(st.s * zoom * csClose);
      if (hg.a > 1e-4) {
        // (lot S2) CHARNIÈRE DROITE, même géométrie que l'ouverture (opening.ts, HINGE) : le centre décrit
        // (w/2)(1 − cos a) en x et (w/2) sin a en z — le bord droit reste posé, le gauche se soulève vers soi ; seconde
        // moitié : la « main » ramène la carte au centre (sinon elle atterrirait décalée d'une largeur). La perspective
        // est en partie compensée (HINGE_PERSP) : la carte ne « gonfle » pas vers la caméra.
        const k = rig.scale.x;
        const w = (Math.abs(Math.cos(pose.rz)) * CARD.w + Math.abs(Math.sin(pose.rz)) * CARD.h) * k;
        const u = Math.min(1, Math.max(0, (hg.a / Math.PI - 0.5) * 2));
        const lz = (w / 2) * Math.sin(hg.a);
        const depth = Math.max(0.2, stage.camera.position.z - rig.position.z);
        rig.position.x += (w / 2) * (1 - Math.cos(hg.a)) - w * u * u * (3 - 2 * u);
        rig.position.z += lz;
        rig.scale.setScalar(k * (1 - HINGE_PERSP * (1 - Math.max(0.5, (depth - lz) / depth))));
      }
      if (mesh) mesh.rotation.z = pose.rz;
      if (camBase) stage.camera.position.z = camBase * pose.cam;
      wonderInstance?.update(dt, t);
      csInstance?.update(dt, t);
      /*
       * (V3, lot 01 — remplace « une image sur deux au calme », audit 06/11) rendu à la demande, voir `sig` plus haut.
       * La définition native (×3) coûte ≈ ×2,25 de pixels : une visionneuse qui tourne à 60 i/s sur la table chauffait
       * le téléphone jusqu'à brider toute la session. Ici, posée et immobile : 0 image.
       */
      sig[0] = rig.position.x;
      sig[1] = rig.position.y;
      sig[2] = rig.position.z;
      sig[3] = rig.rotation.x;
      sig[4] = rig.rotation.y;
      sig[5] = rig.rotation.z;
      sig[6] = rig.scale.x;
      sig[7] = mesh ? mesh.rotation.z : 0;
      sig[8] = stage.camera.position.z;
      sig[9] = haloT.k; // (sans le pouls : il compte dans les effets lents)
      sig[10] = halo.color.value.r;
      sig[11] = halo.color.value.g;
      sig[12] = halo.color.value.b;
      sig[13] = eqK.value;
      sig[14] = face ? (face.lit.value as number) : 0;
      sig[15] = face ? (face.flash.value as number) : 0;
      sig[16] = face ? (face.holo.uniforms.strength.value as number) : 0;
      sig[17] = rig.visible ? 1 : 0;
      sig[18] = mesh ? mesh.id : -1;
      sig[19] = csClose;
      let changed = false;
      for (let i = 0; i < SIG_N; i++) {
        // (NaN de départ : toujours « changé »)
        if (!(Math.abs(sig[i] - drawn[i]) <= SIG_EPS)) {
          changed = true;
          break;
        }
      }
      const now = performance.now();
      const info = ctx.renderer.info;
      const cv = ctx.canvas;
      // image forcée : une autre scène (ou un préchauffage) a dessiné depuis notre dernière image, le canvas a changé de
      // taille, ou la boucle s'est arrêtée (scène quittée puis reprise, onglet caché) — l'image affichée n'est plus la nôtre
      const forced = wake || warming > 0 || info.calls !== drawnCalls || cv.width !== drawnW || cv.height !== drawnH || now - lastUpd > 250;
      lastUpd = now;
      const slow = (rig.visible && timeFx) || (haloT.pulse > 0 && haloT.k > 0.001);
      // geste en cours : toutes les images ; carte qui ne fait que flotter (ou effets lents seuls) : une image sur deux,
      // comme avant (le flottement est lent) ; rien ne bouge : aucune
      let draw = forced || gesture;
      if (draw) slowSkip = 0;
      else if (changed || slow) draw = (slowSkip++ & 1) === 0;
      if (draw) {
        render();
        drawn.set(sig);
        drawnCalls = info.calls;
        drawnW = cv.width;
        drawnH = cv.height;
        wake = false;
      }
    },
    resize(w, h) {
      wake = true;
      stage.fit(w, h);
      camBase = stage.camera.position.z;
      // carte couchée déjà posée : la distance suit le nouveau format d'écran
      if (art?.landscape && !tl?.isActive()) pose.cam = landscapeCam();
    },
    /** Téléphone, visionneuse fermée (appelé par le shell) : ses cibles plein écran (~100 Mo) sont rendues au GPU. */
    suspend(next?: string | null) {
      pipe?.releaseTargets();
      // (audit 12/11, E3-04) retour à la boutique ou à une page : la carte regardée (6 calques + mipmaps, diorama,
      // skin 3D) part avec — `show` la reconstruit à chaque ouverture ; une préparation en cours est abandonnée.
      // PAS vers une scène jouée par-dessus la visionneuse (invocation, rencontre, prélude 6★) : elles y reviennent
      // sans repasser par `show`, la carte doit les attendre.
      if (next !== 'opening' && next != null) return;
      token++;
      clear();
      rig.visible = false;
    },
    dispose() {},
  } as ViewerScene;
}
