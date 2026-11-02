import { clamp, color, float, floor, sin, step, time, uniform } from 'three/tsl';
import type { Material } from 'three/webgpu';
import { generateBackArt, generateCardArt, starColor, type CardArt } from '../../core/art';
import { DEFAULT_BACK, type BackStyle } from '../../core/art/back';
import type { CardData } from '../../core/cardData';
import type { RarityId } from '../../core/rarity';
import { catalogEntry, themeById } from '../../core/sets/themes';
import { createHoloMaterial } from '../../core/holo';
import { createBackMaterial, createEdgeMaterial } from '../../core/cardMaterial';
import type { N } from '../../core/tsl';

/**
 * Face de carte du jeu : holo par tier (core/holo) + étoiles qui s'allument une à une (canal B des masques = index
 * d'étoile) + éclair. Partagée par l'ouverture et la visionneuse : même graphe de nœuds → mêmes pipelines GPU,
 * compilés une fois (préchauffage) et réutilisés partout.
 * `photo` : carte Bébou (photo d'un ami) → le foil reste sur le cadre, pas sur le visage.
 */
export function buildFace(art: CardArt, tier: number, photo: boolean) {
  const holo = createHoloMaterial(art, tier, photo ? { windowFoil: 0.1, subjectFoil: 0.15 } : {});
  const lit = uniform(0);
  const flash = uniform(0);
  const b = holo.layers.masks.b;
  const idx = floor(b.mul(255 / 32).add(0.5)).sub(1);
  const on = clamp(lit.sub(idx), 0, 1).mul(step(0.06, b));
  const glow = on.mul(float(0.3 + tier * 0.2).add(flash.mul(0.8 + tier * 0.4)));
  holo.material.emissiveNode = (holo.material.emissiveNode as N).add(color(starColor(tier)).mul(glow)).add(holo.film.mul(holo.foil).mul(flash).mul(0.5));
  return { holo, lit, flash };
}

/** Tranche de carte avec liseré lumineux (suspense) de la couleur de la rareté. */
export function buildEdge(hex: string) {
  const rim = uniform(0);
  const edge = createEdgeMaterial();
  edge.emissiveNode = color(hex).mul(rim.mul(sin(time.mul(7)).mul(0.25).add(1.75)));
  return { edge, rim };
}

// ───────────────────────────────────────────── art et dos des cartes du jeu
/**
 * Calques d'une carte du jeu : gabarit « Pleine illustration » (le préféré des testeurs) ; les Bébous gardent leur
 * gabarit dédié (sceau des huit).
 */
export function gameCardArt(cd: CardData, rarityId: RarityId, scale: number): CardArt {
  // Merveilles du monde : gabarit classique — sa fenêtre est le portail du diorama 3D (WINDOW_UV) et son bandeau
  // porte le drapeau du pays
  if (cd.id.startsWith('mrv-')) return generateCardArt(cd, rarityId, { scale, design: 'classic' });
  return generateCardArt(cd, rarityId, cd.set === 'bebous' ? { scale } : { scale, design: 'full-art' });
}

/**
 * Dos des cartes à la couleur de leur thème (Gaming, Pop Culture…), avec le « B » du Bébou game.
 * Un matériau par thème, créé à la demande et mis en cache : même graphe → même pipeline GPU pour tous.
 */
export function themedBacks(bag: { add<T extends { dispose(): void }>(o: T): T }, scale: number) {
  const cache = new Map<string, Material>();
  const make = (key: string, style: BackStyle) => {
    const m = bag.add(createBackMaterial(bag.add(generateBackArt(style, scale))));
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
