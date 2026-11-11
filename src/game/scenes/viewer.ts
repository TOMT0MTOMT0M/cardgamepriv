import { cardHasCutout } from '../../core/pokeHolo/face';
import { AdditiveBlending, Color, DirectionalLight, Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3, type Material } from 'three/webgpu';
import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { createStage } from '../../core/stage';
import { mobileArtScale } from '../../core/renderer';
import { createPipeline } from '../../core/post';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { length, smoothstep, uniform, uv, vec4 } from 'three/tsl';
import type { N } from '../../core/tsl';
import { ensureCardImages, ensureFonts, generateCardArt, nextFrame, type CardArt } from '../../core/art';
import { LAB_CARDS, cardById } from '../../core/cardData';
import { rarity, type RarityId } from '../../core/rarity';
import { CARD, createCardGeometry } from '../../core/cardModel';
import { EASE, springCurve } from '../../core/ease';
import { DUR } from '../../core/motion';
import { buildEdge, buildFace, gameCardArt, gameCardArtAsync, themedBacks } from './cardFace';
import { isHoloReduced } from '../../core/holo';
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
  show(cardId: string, rarityId: RarityId, opts?: { dir?: 1 | -1; quiet?: boolean; hold?: Promise<void>; fromW?: number }): Promise<void>;
  /** Vrai si le point (NDC −1..1) est sur la carte : un toucher ailleurs ferme la visionneuse (« clic hors zone »). */
  hits(ndcX: number, ndcY: number): boolean;
  /**
   * (V2 fluidité, lot 6) où la carte se pose à l'écran une fois arrivée (au repos, sans zoom), en coordonnées
   * normalisées (−1..1, y vers le haut) : cible de la tuile qui « grandit » vers la carte 3D. null avant le montage.
   */
  restRect(): { x0: number; y0: number; x1: number; y1: number } | null;
}

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
  const haloT = { k: 0, pulse: 0 };
  const haloColor = new Color('#ffffff');
  /** zoom d'inspection (molette, ou deux touchers rapides) : cible et valeur lissée */
  let zoomT = 1;
  let zoom = 1;
  let lastTap = 0;
  const lastTilt = { x: 0, y: 0 };
  let calmSkip = 0;
  const setZoom = (z: number) => {
    zoomT = Math.min(1.85, Math.max(1, z));
    document.body.classList.toggle('viewer-zoomed', zoomT > 1.04);
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
      // (pose de repos : centre légèrement relevé, cf. `lift` dans la boucle)
      corner.set((cx * 0.63) / 2, (cy * 0.88) / 2 + 0.05, 0).project(stage.camera);
      x0 = Math.min(x0, corner.x); y0 = Math.min(y0, corner.y); x1 = Math.max(x1, corner.x); y1 = Math.max(y1, corner.y);
    }
    return Number.isFinite(x0 + y0 + x1 + y1) ? { x0, y0, x1, y1 } : null;
  }

  function clear() {
    if (wonderInstance) {
      wonderInstance.dispose();
      wonderInstance = null;
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
  }

  return {
    hits,
    restRect,
    // définition native de l'écran (×3 sur iPhone) : une seule carte, scène légère — c'est l'écran où l'on inspecte
    dprCap: 3,
    /** pour le shell : au repos tant que la carte n'est ni touchée, ni animée, ni zoomée (changement de définition 3D permis) */
    pacing: () => (tl?.isActive() || ctx.input.down || ctx.input.dragging || Math.abs(zoomT - zoom) > 0.002 ? 'busy' : 'rest'),
    async show(cardId, rarityId, opts) {
      const my = ++token;
      setZoom(1); // nouvelle carte : on repart sans zoom
      const cd = cardById(cardId);
      const mobile = ctx.quality === 'mobile';
      // nouvelle ouverture : rien de l'ancienne carte ne s'affiche le temps de préparer la nouvelle
      if (!opts?.dir) {
        rig.visible = false;
        haloT.k = 0;
      }
      // Merveille : on n'attend plus le modèle 3D (≈ 1–2 Mo) — le diorama montre le monument procédural puis le
      // remplace dès que le modèle arrive (avant : visionneuse figée le temps du téléchargement en 4G)
      const wonder = isWonderCard(cardId) ? loadWonder() : null;
      void wonder?.then((w) => w.preloadWonderModel(cardId), () => undefined);
      await ensureCardImages([cd]);
      if (my !== token) return;
      // (le module du diorama arrive en parallèle des illustrations ; en cas d'échec réseau, la carte s'affiche sans)
      const W = wonder ? await wonder.catch(() => null) : null;
      if (my !== token) return;
      const rr = rarity(rarityId);
      // mobile : calques à la taille réelle de la carte à l'écran, zoom d'inspection compris (×1,6 → jusqu'à ×1,25 de la
      // base, écran ×3 ; audit 06/11 : à 0,8 la carte zoomée était agrandie ×2) ; bornée à ×1 sur les appareils à ≤ 4 Go
      const lowMem = ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
      const scale = mobile ? mobileArtScale(ctx.width, ctx.height, 0.8 * 1.6, lowMem ? 1 : 1.25, 3) : 1;
      let nextArt: CardArt;
      if (mobile) {
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
      } else nextArt = gameCardArt(cd, rarityId, scale);
      clear();
      rig.visible = true;
      art = nextArt;
      face = buildFace(art, rr.tier, !!cd.photo, cardHasCutout(cd));
      face.holo.uniforms.strength.value = 0.7;

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
      } else {
        const { edge } = buildEdge(rr.hex);
        mats = [face.holo.material, edge];
        mesh = new Mesh(geo, [face.holo.material, backs.forCard(cardId), edge]);
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
      } else {
        Object.assign(st, { spin: Math.PI, s: 0.85, z: -0.3, x: 0, y: 0 });
        tl.to(st, { z: 0, s: 1, duration: 0.7, ease: EASE.glide }, 0)
          .to(st, { spin: Math.PI * 2, duration: 1.0, ease: springCurve(0.55, 11), onStart: () => sfx?.whoosh(0.35, 0.08) }, 0.1)
          .call(() => (st.spin = 0), [], 1.1);
      }
      // (11/11) carte horizontale : elle se couche après son entrée, la caméra prend un peu de recul
      if (art.landscape) {
        const k = landscapeCam();
        const t0 = dir ? 0.3 : 1.0;
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
      stage = createStage(c, { bg: ['#000000', '#000000'] /* (C4) noir profond */, env: 'studio', envIntensity: 1.2, fill: 0.6, fillPortrait: 0.66 });
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
      const hd = length(uv().sub(0.5).mul(2));
      hm.colorNode = vec4(halo.color.mul(smoothstep(1, 0, hd).pow(2.4).mul(halo.k)), 1);
      const haloMesh = new Mesh(c.bag.add(new PlaneGeometry(2.4, 2.4)), hm);
      haloMesh.position.set(0, 0.05, -0.32);
      stage.scene.add(haloMesh);
      // bloom sur l'émissif : les étoiles, les paillettes et le foil brillent vraiment (comme à l'ouverture)
      const pl = (pipe = createPipeline(c, stage.scene, stage.camera, { emissive: true }));
      const bl = pl.own(bloom(pl.emissive!, 0.3, 0.45, 0.0)) as unknown as N;
      // téléphone : bloom au ¼ de la résolution (au lieu de ½) — l'émissif est épars (étoiles, paillettes) : halo un
      // peu plus doux, −75 % de pixels de bloom en permanence dans la visionneuse
      if (c.quality === 'mobile') (bl as unknown as { setResolutionScale(s: number): void }).setResolutionScale(0.25);
      bloomStrength = (bl as unknown as { strength: { value: number } }).strength;
      pl.output = vec4((pl.color as N).rgb.add(bl.rgb), 1);
      render = () => {
        if (bloomStrength && face) bloomStrength.value = (isHoloReduced() ? 0.2 : 0.3) + (face.flash.value as number) * (isHoloReduced() ? 0.45 : 0.9);
        pl.render();
      };
      // matériaux compilés, puis une image à blanc hors écran : les VRAIS pipelines (MRT émissif, MSAA, HalfFloat) sont
      // créés ici et non dans la première image affichée (à-coup de 100 à 400 ms au premier zoom de carte — la face holo
      // pèse ≈ 470 nœuds). La carte factice est encore dans le rig : c'est elle qui sert.
      await pl.compile({ real: true });
      pl.warm();
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
      // « Effets réduits » (core/fxPref.ts) : halo plus faible et immobile
      const red = isHoloReduced();
      halo.k.value = haloT.k * (red ? 0.45 : 1 + haloT.pulse * Math.sin(t * 1.6) * 0.18);
      ctx.input.spinEnabled = true; // ici on fait tourner la carte en la glissant (l'ouverture, elle, le coupe)
      // curseur « main » : on attrape la carte pour la faire tourner ; l'indication s'efface après le premier tour
      const cur = ctx.input.dragging ? 'grabbing' : 'grab';
      if (ctx.canvas.style.cursor !== cur) ctx.canvas.style.cursor = cur;
      if (ctx.input.dragging && !document.body.classList.contains('viewer-spun')) document.body.classList.add('viewer-spun');
      const p = ctx.input.pose(0.38);
      const idle = ctx.input.inside ? 0 : 1;
      // un peu au-dessus du centre (la fiche texte se lit dessous) ; zoomée, la carte se recentre : la fiche s'est effacée
      const lift = 0.05 * Math.max(0, 1 - (zoom - 1) / 0.6);
      rig.position.set(st.x, lift + st.y + Math.sin(t * 0.9) * 0.006, st.z);
      rig.rotation.set(p.x + Math.sin(t * 0.5) * 0.05 * idle, st.spin + p.y + Math.sin(t * 0.37) * 0.18 * idle, 0);
      zoom += (zoomT - zoom) * (1 - Math.exp(-dt * 10));
      rig.scale.setScalar(st.s * zoom);
      if (mesh) mesh.rotation.z = pose.rz;
      if (camBase) stage.camera.position.z = camBase * pose.cam;
      wonderInstance?.update(dt, t);
      /*
       * (audit 06/11) téléphone, carte au repos (personne ne la touche, pas de zoom en cours, pas d'animation d'entrée,
       * gyroscope immobile) : une image sur deux — la définition native (×3) coûte ≈ ×2,25 de pixels, et une visionneuse
       * qui tourne à 60 i/s chauffe le téléphone jusqu'à brider toute la session. Le flottement reste fluide à 30 i/s ;
       * le moindre geste repasse à 60.
       */
      const tx = ctx.input.tiltX, ty = ctx.input.tiltY;
      const tiltMoving = Math.abs(tx - lastTilt.x) + Math.abs(ty - lastTilt.y) > 0.004;
      lastTilt.x = tx;
      lastTilt.y = ty;
      const calm = ctx.quality === 'mobile' && !ctx.input.down && !ctx.input.dragging && !tiltMoving && !tl?.isActive() && Math.abs(zoomT - zoom) < 0.002 && !wonderInstance;
      if (!calm) calmSkip = 0;
      if (!calm || (calmSkip++ & 1) === 0) render();
    },
    resize(w, h) {
      stage.fit(w, h);
      camBase = stage.camera.position.z;
      // carte couchée déjà posée : la distance suit le nouveau format d'écran
      if (art?.landscape && !tl?.isActive()) pose.cam = landscapeCam();
    },
    /** Téléphone, visionneuse fermée (appelé par le shell) : ses cibles plein écran (~100 Mo) sont rendues au GPU. */
    suspend() {
      pipe?.releaseTargets();
    },
    dispose() {},
  } as ViewerScene;
}
