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
import { createCardGeometry } from '../../core/cardModel';
import { EASE, springCurve } from '../../core/ease';
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
  show(cardId: string, rarityId: RarityId, opts?: { dir?: 1 | -1; quiet?: boolean }): Promise<void>;
  /** Vrai si le point (NDC −1..1) est sur la carte : un toucher ailleurs ferme la visionneuse (« clic hors zone »). */
  hits(ndcX: number, ndcY: number): boolean;
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
  const st = { spin: Math.PI, s: 0.85, z: -0.3, x: 0 };
  let render: () => void = () => undefined;
  let pipe: ReturnType<typeof createPipeline> | null = null;
  let bloomStrength: { value: number } | null = null;
  /** halo derrière la carte, de la couleur de sa rareté (plus présent et « vivant » pour légendaire et mieux) */
  const halo = { color: uniform(new Color('#e8e2d6')), k: uniform(0) };
  const haloT = { k: 0, pulse: 0 };
  const haloColor = new Color('#e8e2d6');
  /** zoom d'inspection (molette, ou deux touchers rapides) : cible et valeur lissée */
  let zoomT = 1;
  let zoom = 1;
  let lastTap = 0;
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

  function clear() {
    if (wonderInstance) {
      wonderInstance.dispose();
      wonderInstance = null;
    }
    if (mesh) rig.remove(mesh);
    mats.forEach((m) => m.dispose());
    art?.dispose();
    mesh = null;
    art = null;
    mats = [];
    face = null;
  }

  return {
    hits,
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
      // mobile : calques à la taille réelle de la carte à l'écran (×2), au lieu d'un 0,7 fixe
      const scale = mobile ? mobileArtScale(ctx.width, ctx.height, 0.8, 1) : 1;
      let nextArt: CardArt;
      if (mobile) {
        // téléphone : calques peints en 4 étapes (plus de pic de 20–80 ms), puis envoyés au GPU AVANT le tour d'entrée
        // (avant : 6 textures + mipmaps dans la 1re image du tour → à-coup) ; les toiles sont vidées aussitôt (release)
        nextArt = await gameCardArtAsync(cd, rarityId, scale);
        if (my !== token) return nextArt.dispose();
        for (const t of [nextArt.bg, nextArt.subject, nextArt.fg, nextArt.frame, nextArt.masks, nextArt.fx]) ctx.renderer.initTexture(t);
        await nextFrame();
        if (my !== token) return nextArt.dispose();
      } else nextArt = gameCardArt(cd, rarityId, scale);
      clear();
      rig.visible = true;
      art = nextArt;
      face = buildFace(art, rr.tier, !!cd.photo);
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
        mats = [mesh.material as unknown as Material, edge];
        rig.add(mesh);
        haloColor.set('#f5c662');
      } else {
        const { edge } = buildEdge(rr.hex);
        mats = [face.holo.material, edge];
        mesh = new Mesh(geo, [face.holo.material, backs.forCard(cardId), edge]);
        rig.add(mesh);
        haloColor.set(rr.secret ? '#e8927c' : rr.tier === 0 ? '#e8e2d6' : rr.hex);
      }

      tl?.kill();
      const f = face;
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
        Object.assign(st, { spin: -dir * Math.PI * 0.5, s: 0.94, z: -0.08, x: dir * 0.32 });
        tl.to(st, { spin: 0, x: 0, z: 0, s: 1, duration: 0.5, ease: EASE.glide, onStart: () => sfx?.whoosh(0.22, 0.05) }, 0);
        at = 0.3;
      } else {
        Object.assign(st, { spin: Math.PI, s: 0.85, z: -0.3, x: 0 });
        tl.to(st, { z: 0, s: 1, duration: 0.7, ease: EASE.glide }, 0)
          .to(st, { spin: Math.PI * 2, duration: 1.0, ease: springCurve(0.55, 11), onStart: () => sfx?.whoosh(0.35, 0.08) }, 0.1)
          .call(() => (st.spin = 0), [], 1.1);
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
      stage = createStage(c, { bg: ['#211c19', '#070606'], env: 'studio', envIntensity: 1.2, fill: 0.6, fillPortrait: 0.66 });
      const key = new DirectionalLight(0xfff0e0, 1.2);
      key.position.set(-1, 2, 3);
      stage.scene.add(key, rig);
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
      // pipelines compilés pour la VRAIE cible (MRT émissif, MSAA, HalfFloat) et non pour le canvas : plus d'à-coup
      // de plusieurs centaines de ms au premier zoom de carte (la face holo pèse ≈ 470 nœuds)
      await pl.compile();
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
      rig.position.set(st.x, lift + Math.sin(t * 0.9) * 0.006, st.z);
      rig.rotation.set(p.x + Math.sin(t * 0.5) * 0.05 * idle, st.spin + p.y + Math.sin(t * 0.37) * 0.18 * idle, 0);
      zoom += (zoomT - zoom) * (1 - Math.exp(-dt * 10));
      rig.scale.setScalar(st.s * zoom);
      wonderInstance?.update(dt, t);
      render();
    },
    resize(w, h) {
      stage.fit(w, h);
    },
    /** Téléphone, visionneuse fermée (appelé par le shell) : ses cibles plein écran (~100 Mo) sont rendues au GPU. */
    suspend() {
      pipe?.releaseTargets();
    },
    dispose() {},
  } as ViewerScene;
}
