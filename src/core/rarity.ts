import { Color } from 'three/webgpu';

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface Rarity {
  id: RarityId;
  tier: number; // 0..5
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
  { id: 'common', tier: 0, label: 'Commune', hex: '#a39d91', accentHex: '#e6e0d2', deepHex: '#3a3631', intensity: 0.0, foil: 0.0, particles: 0, suspense: 0.35, shake: 0, slowmo: 1, glyph: '●' },
  { id: 'uncommon', tier: 1, label: 'Peu commune', hex: '#6f9a74', accentHex: '#c4dcb8', deepHex: '#1f3324', intensity: 0.15, foil: 0.12, particles: 400, suspense: 0.6, shake: 0, slowmo: 1, glyph: '◆' },
  { id: 'rare', tier: 2, label: 'Rare', hex: '#4c7cc2', accentHex: '#b4cdf2', deepHex: '#14233d', intensity: 0.35, foil: 0.3, particles: 1500, suspense: 0.9, shake: 0.05, slowmo: 1, glyph: '✦' },
  { id: 'epic', tier: 3, label: 'Épique', hex: '#b5344f', accentHex: '#f3b2b5', deepHex: '#36101a', intensity: 0.55, foil: 0.55, particles: 4000, suspense: 1.3, shake: 0.15, slowmo: 0.75, glyph: '✸' },
  { id: 'legendary', tier: 4, label: 'Légendaire', hex: '#d9982a', accentHex: '#ffe0a0', deepHex: '#3a2408', intensity: 0.8, foil: 0.8, particles: 12000, suspense: 1.8, shake: 0.35, slowmo: 0.45, glyph: '❂' },
  { id: 'mythic', tier: 5, label: 'Mythique', hex: '#ece5d6', accentHex: '#ffffff', deepHex: '#0d0b10', intensity: 1.0, foil: 1.0, particles: 30000, suspense: 2.6, shake: 0.6, slowmo: 0.25, glyph: '✺' },
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

/** Tirage pondéré pour les expériences qui simulent un pack. */
export const DROP_WEIGHTS: Record<RarityId, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 3.8,
  legendary: 1.0,
  mythic: 0.2,
};

export function rollRarity(rand: () => number = Math.random): RarityId {
  const total = Object.values(DROP_WEIGHTS).reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (const r of RARITIES) {
    x -= DROP_WEIGHTS[r.id];
    if (x <= 0) return r.id;
  }
  return 'common';
}
