import { clamp, color, cos, float, floor, mix, positionLocal, sin, step, time, uniform, vec3 } from 'three/tsl';
import type { Material } from 'three/webgpu';
import { generateBackArt, generateCardArt, generateCardArtAsync, starColor, type ArtOptions, type CardArt } from '../../core/art';
import { DEFAULT_BACK, type BackStyle } from '../../core/art/back';
import { isSecretPhotoSet, type CardData } from '../../core/cardData';
import type { RarityId } from '../../core/rarity';
import { catalogEntry, themeById } from '../../core/sets/themes';
import { createHoloMaterial, holoFx, setHoloReduced } from '../../core/holo';
import { bindFxReduced, onFxReducedChange } from '../../core/fxPref';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import type { N } from '../../core/tsl';

/**
 * Face de carte du jeu : holo par tier (core/holo) + étoiles qui s'allument une à une (canal B des masques = index
 * d'étoile) + éclair. Partagée par l'ouverture et la visionneuse : même graphe de nœuds → mêmes pipelines GPU,
 * compilés une fois (préchauffage) et réutilisés partout.
 * `photo` : carte Bébou (photo d'un ami) → le foil reste sur le cadre, pas sur le visage.
 */
/** Qualité des faces (posée par le shell) : téléphone → variante « lite » du holo, même aspect, ≈ −40 % d'ALU par pixel. */
let faceLite = false;
// option « Effets réduits » (core/fxPref.ts) : plafonds du holo de toutes les faces du jeu, à chaud, PC comme téléphone
bindFxReduced();
onFxReducedChange(setHoloReduced);
export function setFaceQuality(q: 'high' | 'mobile') {
  faceLite = q === 'mobile';
}

export function buildFace(art: CardArt, tier: number, photo: boolean) {
  const holo = createHoloMaterial(art, tier, { ...(photo ? { windowFoil: 0.1, subjectFoil: 0.15 } : {}), lite: faceLite });
  const lit = uniform(0);
  const flash = uniform(0);
  const b = holo.layers.masks.b;
  const idx = floor(b.mul(255 / 32).add(0.5)).sub(1);
  const on = clamp(lit.sub(idx), 0, 1).mul(step(0.06, b));
  const glow = on.mul(float(0.3 + tier * 0.2).add(flash.mul(0.8 + tier * 0.4)));
  holo.material.emissiveNode = (holo.material.emissiveNode as N).add(color(starColor(tier)).mul(glow)).add(holo.film.mul(holo.foil).mul(flash).mul(0.5).mul(holoFx.glint));
  return { holo, lit, flash };
}

/** Tranche de carte avec liseré lumineux (suspense) de la couleur de la rareté. */
/**
 * Tranche d'une carte : couleur de la rareté, intensité `rim`. 6★ : tranche ARC-EN-CIEL (la teinte tourne le long du
 * bord et dans le temps) — mais face cachée elle se présente DORÉE comme une 5★ (`tease` = 0) : le joueur sait qu'il
 * tient « au moins une 5★ », la 6★ ne se révèle qu'en se fendant en arc-en-ciel pendant l'anticipation (`tease` → 1).
 * (réf. motion §1.2 : le suspense n'existe que si l'issue reste incertaine ; une tranche arc-en-ciel dès l'éventail
 * supprimait toute incertitude sur le palier.) `teaseHex` : si donnée, la couleur montrée tant que `tease` = 0 (la
 * secrète, rose, se présente dorée elle aussi) ; sinon la tranche a sa couleur tout de suite (`tease` = 1).
 */
export function buildEdge(hex: string | 'rainbow', teaseHex?: string) {
  const rim = uniform(0);
  const tease = uniform(teaseHex ? 0 : 1);
  const edge = createEdgeMaterial();
  const base =
    hex === 'rainbow' ? cos(vec3(0, 2.094, 4.189).add(positionLocal.x.mul(9).add(positionLocal.y.mul(6)).add(time.mul(2.2)))).mul(0.5).add(0.55) : color(hex);
  const tint = teaseHex ? mix(color(teaseHex), base, tease) : base;
  edge.emissiveNode = tint.mul(rim.mul(sin(time.mul(7)).mul(0.25).add(1.75)));
  return { edge, rim, tease };
}

// ───────────────────────────────────────────── art et dos des cartes du jeu
/**
 * Calques d'une carte du jeu : gabarit « Pleine illustration » (le préféré des testeurs) ; les Bébous gardent leur
 * gabarit dédié (sceau des huit).
 */
export function gameCardArt(cd: CardData, rarityId: RarityId, scale: number): CardArt {
  return generateCardArt(cd, rarityId, gameArtOptions(cd, scale));
}

/** Même chose en 4 étapes (on rend la main entre chacune) : pour générer une carte pendant une animation. */
export function gameCardArtAsync(cd: CardData, rarityId: RarityId, scale: number): Promise<CardArt> {
  return generateCardArtAsync(cd, rarityId, gameArtOptions(cd, scale));
}

/**
 * Options des calques du jeu. Mémoire (iOS plafonne le total des canvas) : pas d'aplat (jamais envoyé), et chaque
 * toile est vidée dès que sa texture est sur le GPU (`release`) — avant, 7 toiles (≈ 11 Mo à 0,7) restaient en vie
 * par carte jusqu'au ramasse-miettes.
 */
function gameArtOptions(cd: CardData, scale: number): ArtOptions {
  // Merveilles du monde : gabarit classique — sa fenêtre est le portail du diorama 3D (WINDOW_UV) et son bandeau
  // porte le drapeau du pays
  // (téléphone : anisotropie 4 au lieu de 8 — cartes vues presque de face)
  const base: ArtOptions = { scale, noFlat: true, release: true, ...(faceLite ? { anisotropy: 4 } : {}) };
  if (cd.id.startsWith('mrv-')) return { ...base, design: 'classic' };
  return isSecretPhotoSet(cd.set) ? base : { ...base, design: 'full-art' };
}

/**
 * Dos des cartes à la couleur de leur thème (Gaming, Pop Culture…), avec le « B » du Bébou game.
 * Un matériau par thème, créé à la demande et mis en cache : même graphe → même pipeline GPU pour tous.
 */
export function themedBacks(bag: { add<T extends { dispose(): void }>(o: T): T }, scale: number) {
  const cache = new Map<string, Material>();
  const make = (key: string, style: BackStyle) => {
    const m = bag.add(createBackMaterial(bag.add(generateBackArt(style, scale, true))));
    cache.set(key, m);
    return m;
  };
  const fallback = make('default', DEFAULT_BACK);
  return {
    fallback,
    /** dos d'une carte du catalogue (par id) */
    forCard(cardId: string): Material {
      const e = catalogEntry(cardId);
      const t = e ? themeById(e.themeId) : undefined;
      if (!t) return fallback;
      return cache.get(t.id) ?? make(t.id, { ground: t.style.ground, line: t.style.foil, accent: t.style.ink, label: t.label.toUpperCase().split('').join(' ') });
    },
  };
}
