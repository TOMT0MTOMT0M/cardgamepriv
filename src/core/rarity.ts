import { Color } from 'three/webgpu';
import { SLOT_WEIGHTS } from './dropRates';

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'secret';

export interface Rarity {
  id: RarityId;
  /**
   * Palier VISUEL 0..5, lu par toutes les expériences (tableaux à 6 entrées, tests `tier >= 5`).
   * La rareté secrète réutilise le palier 5 : partout où une expérience ne la connaît pas, elle
   * reçoit au minimum le traitement mythique au lieu de casser.
   */
  tier: number;
  /** Rang réel 0..6 (ordre, étoiles, tirage) : commune 0 … mythique 5, secrète 6. */
  rank: number;
  /** Rareté SECRÈTE (thème « Les Bébous ») : au-dessus de tout, la carte la plus rare du site. */
  secret?: true;
  label: string;
  /** Teinte signature du tier (sRGB hex). Palette pensée pour éviter le violet/cyan générique. */
  hex: string;
  /** Teinte claire d'accent (reflets, étincelles). */
  accentHex: string;
  /** Teinte sombre (ombres colorées, fonds). */
  deepHex: string;
  /** 0..1 — intensité globale de l'effet "rare" (lumière, bloom, particules…). */
  intensity: number;
  /** Fraction de la carte couverte de foil (sert aux masques). */
  foil: number;
  /** Nb de particules de burst (préréglage desktop). */
  particles: number;
  /** Durée de suspense avant la révélation (s). */
  suspense: number;
  /** Amplitude de screen shake (0..1). */
  shake: number;
  /** Facteur de ralenti au payoff (1 = pas de ralenti). */
  slowmo: number;
  glyph: string;
}

export const RARITIES: Rarity[] = [
  { id: 'common', tier: 0, rank: 0, label: 'Commune', hex: '#a39d91', accentHex: '#e6e0d2', deepHex: '#3a3631', intensity: 0.0, foil: 0.0, particles: 0, suspense: 0.35, shake: 0, slowmo: 1, glyph: '●' },
  { id: 'uncommon', tier: 1, rank: 1, label: 'Peu commune', hex: '#6f9a74', accentHex: '#c4dcb8', deepHex: '#1f3324', intensity: 0.15, foil: 0.12, particles: 400, suspense: 0.6, shake: 0, slowmo: 1, glyph: '◆' },
  { id: 'rare', tier: 2, rank: 2, label: 'Rare', hex: '#4c7cc2', accentHex: '#b4cdf2', deepHex: '#14233d', intensity: 0.35, foil: 0.3, particles: 1500, suspense: 0.9, shake: 0.05, slowmo: 1, glyph: '✦' },
  { id: 'epic', tier: 3, rank: 3, label: 'Épique', hex: '#b5344f', accentHex: '#f3b2b5', deepHex: '#36101a', intensity: 0.55, foil: 0.55, particles: 4000, suspense: 1.3, shake: 0.15, slowmo: 0.75, glyph: '✸' },
  { id: 'legendary', tier: 4, rank: 4, label: 'Légendaire', hex: '#d9982a', accentHex: '#ffe0a0', deepHex: '#3a2408', intensity: 0.8, foil: 0.8, particles: 12000, suspense: 1.8, shake: 0.35, slowmo: 0.45, glyph: '❂' },
  { id: 'mythic', tier: 5, rank: 5, label: 'Mythique', hex: '#ece5d6', accentHex: '#ffffff', deepHex: '#0d0b10', intensity: 1.0, foil: 1.0, particles: 30000, suspense: 2.6, shake: 0.6, slowmo: 0.25, glyph: '✺' },
  // SECRÈTE — or rose incarnat sur fond presque noir : chaud, humain (c'est un de nous), hors de toutes les teintes des autres tiers.
  { id: 'secret', tier: 5, rank: 6, secret: true, label: 'Secrète', hex: '#e8927c', accentHex: '#ffe4d8', deepHex: '#120607', intensity: 1.0, foil: 1.0, particles: 60000, suspense: 6.5, shake: 0.85, slowmo: 0.15, glyph: '✷' },
];

export const RARITY_BY_ID: Record<RarityId, Rarity> = Object.fromEntries(RARITIES.map((r) => [r.id, r])) as Record<RarityId, Rarity>;

export function rarity(id: RarityId): Rarity {
  return RARITY_BY_ID[id];
}

/** Couleur linéaire (pour les uniforms / shaders). */
export function rarityColor(id: RarityId, which: 'hex' | 'accentHex' | 'deepHex' = 'hex'): Color {
  return new Color(RARITY_BY_ID[id][which]);
}

export function isRarityId(s: string | null | undefined): s is RarityId {
  return !!s && s in RARITY_BY_ID;
}

/**
 * Tirage pondéré pour les expériences qui simulent un pack : mêmes poids que le jeu (emplacements normaux),
 * cf. dropRates.ts. 0 pour la secrète : elle a son propre tirage, une fois par pack et seulement dans le
 * « bébou pack » (1 / nb total de cartes, par pack) : voir packRules.ts.
 */
export const DROP_WEIGHTS: Record<RarityId, number> = { ...SLOT_WEIGHTS, secret: 0 };

/** Vrai pour la rareté secrète (cartes « Les Bébous »). */
export function isSecret(id: RarityId): boolean {
  return !!RARITY_BY_ID[id].secret;
}

/** Nombre d'étoiles d'une rareté (1 ★ commune … 6 ★ mythique ; la secrète en affiche 6 + son sceau). */
export function starCount(id: RarityId): number {
  return Math.min(6, RARITY_BY_ID[id].rank + 1);
}

export function rollRarity(rand: () => number = Math.random): RarityId {
  const total = Object.values(DROP_WEIGHTS).reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (const r of RARITIES) {
    x -= DROP_WEIGHTS[r.id];
    if (x <= 0) return r.id;
  }
  return 'common';
}
