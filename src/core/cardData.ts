import type { RarityId } from './rarity';

export type SubjectKind = 'monolith' | 'moth' | 'sigil' | 'tower' | 'serpent' | 'bloom' | 'eye' | 'stag';

export interface CardPalette {
  /** papier / carton du cadre */
  paper: string;
  /** encre principale (traits, texte) */
  ink: string;
  /** ciel / fond profond */
  sky: string;
  /** fond secondaire (horizon, halo) */
  haze: string;
  /** sujet */
  body: string;
  /** accent lumineux (zones émissives) */
  glow: string;
}

export interface CardData {
  id: string;
  num: number;
  name: string;
  epithet: string;
  element: string;
  cost: number;
  power: number;
  guard: number;
  flavor: string;
  subject: SubjectKind;
  palette: CardPalette;
  seed: number;
  /** Rareté "naturelle" de la carte (le sélecteur du shell peut la surcharger). */
  rarity: RarityId;
}

/** Données fictives. Aucun personnage existant : tout est inventé et dessiné procéduralement. */
export const CARDS: CardData[] = [
  {
    id: 'veilleur-cendre', num: 7, name: 'Veilleur de Cendre', epithet: 'Gardien', element: 'Cendre',
    cost: 4, power: 6, guard: 5, flavor: 'Il ne dort pas. Il attend que le feu se souvienne de lui.',
    subject: 'monolith', seed: 1307, rarity: 'rare',
    palette: { paper: '#e9e1cf', ink: '#2a211b', sky: '#3b2a26', haze: '#c4572f', body: '#1d1715', glow: '#ffb35c' },
  },
  {
    id: 'phalene-albatre', num: 12, name: 'Phalène d’Albâtre', epithet: 'Esprit', element: 'Lune',
    cost: 2, power: 2, guard: 3, flavor: 'Elle tourne autour de la seule lumière qui ne brûle pas.',
    subject: 'moth', seed: 4412, rarity: 'uncommon',
    palette: { paper: '#ede7da', ink: '#262423', sky: '#1f2430', haze: '#8d93a6', body: '#e8dcc2', glow: '#f6e7b0' },
  },
  {
    id: 'sigille-marees', num: 23, name: 'Sigille des Marées', epithet: 'Rituel', element: 'Marée',
    cost: 3, power: 0, guard: 0, flavor: 'Trace-le dans le sable. La mer finira la phrase.',
    subject: 'sigil', seed: 9023, rarity: 'epic',
    palette: { paper: '#e3e0d4', ink: '#14211f', sky: '#0f2a2a', haze: '#2f6a62', body: '#d8c79a', glow: '#f3e3a8' },
  },
  {
    id: 'tour-muette', num: 31, name: 'La Tour Muette', epithet: 'Lieu', element: 'Pierre',
    cost: 5, power: 0, guard: 9, flavor: 'Mille fenêtres, et personne n’a jamais vu une porte.',
    subject: 'tower', seed: 3131, rarity: 'legendary',
    palette: { paper: '#e6dfd0', ink: '#1e1d22', sky: '#2c3446', haze: '#c98f6a', body: '#26252b', glow: '#ffcf7a' },
  },
  {
    id: 'serpent-givre', num: 44, name: 'Serpent de Givre', epithet: 'Bête', element: 'Givre',
    cost: 6, power: 8, guard: 4, flavor: 'Là où il passe, l’eau oublie de couler.',
    subject: 'serpent', seed: 4404, rarity: 'epic',
    palette: { paper: '#e4e6e3', ink: '#17202a', sky: '#1b2b3a', haze: '#7ea2b8', body: '#d9e4e6', glow: '#ffffff' },
  },
  {
    id: 'floraison-noire', num: 52, name: 'Floraison Noire', epithet: 'Maléfice', element: 'Ronce',
    cost: 3, power: 4, guard: 2, flavor: 'Chaque pétale tombé est une promesse tenue.',
    subject: 'bloom', seed: 5252, rarity: 'rare',
    palette: { paper: '#ebe2d6', ink: '#1f1418', sky: '#1a1215', haze: '#6b2a36', body: '#c9465a', glow: '#ffb0a0' },
  },
  {
    id: 'oeil-du-puits', num: 66, name: 'Œil du Puits', epithet: 'Oracle', element: 'Abîme',
    cost: 7, power: 5, guard: 7, flavor: 'Regarde assez longtemps, et c’est toi qui remontes.',
    subject: 'eye', seed: 6666, rarity: 'mythic',
    palette: { paper: '#e8e0cc', ink: '#191512', sky: '#100d0b', haze: '#5a4628', body: '#e2c88a', glow: '#ffd27a' },
  },
  {
    id: 'cerf-orage', num: 78, name: 'Cerf d’Orage', epithet: 'Bête', element: 'Orage',
    cost: 5, power: 7, guard: 6, flavor: 'Le tonnerre ne le suit pas. Il le précède.',
    subject: 'stag', seed: 7878, rarity: 'legendary',
    palette: { paper: '#e7e2d6', ink: '#1a1c1f', sky: '#262a2c', haze: '#8a8f7a', body: '#d2cbb8', glow: '#fff1c2' },
  },
  {
    id: 'pierre-levee', num: 3, name: 'Pierre Levée', epithet: 'Lieu', element: 'Pierre',
    cost: 1, power: 0, guard: 3, flavor: 'Quelqu’un l’a dressée. Personne ne sait pour qui.',
    subject: 'monolith', seed: 303, rarity: 'common',
    palette: { paper: '#e6e1d6', ink: '#24221f', sky: '#55606a', haze: '#a7a99a', body: '#2e2c2a', glow: '#f0e6c8' },
  },
  {
    id: 'lierre-sourd', num: 15, name: 'Lierre Sourd', epithet: 'Plante', element: 'Ronce',
    cost: 1, power: 1, guard: 2, flavor: 'Il pousse vers le silence.',
    subject: 'bloom', seed: 1515, rarity: 'common',
    palette: { paper: '#e9e4d4', ink: '#1c2219', sky: '#243026', haze: '#5f7a54', body: '#a9c08a', glow: '#e9f2c4' },
  },
  {
    id: 'phare-noye', num: 88, name: 'Phare Noyé', epithet: 'Lieu', element: 'Marée',
    cost: 4, power: 0, guard: 6, flavor: 'Il éclaire encore. Pour les poissons.',
    subject: 'tower', seed: 8808, rarity: 'uncommon',
    palette: { paper: '#e2e3dc', ink: '#121c22', sky: '#15303a', haze: '#3f7b80', body: '#1a2a30', glow: '#ffe7a6' },
  },
  {
    id: 'mue-de-lune', num: 99, name: 'Mue de Lune', epithet: 'Esprit', element: 'Lune',
    cost: 8, power: 9, guard: 9, flavor: 'Elle a laissé sa lumière derrière elle, comme une peau.',
    subject: 'moth', seed: 9999, rarity: 'mythic',
    palette: { paper: '#efe9dc', ink: '#17151a', sky: '#0e0d14', haze: '#3d3a52', body: '#f2ead8', glow: '#ffffff' },
  },
];

export const SET_CODE = 'LAB';
export const SET_SIZE = 120;

export function cardById(id: string): CardData {
  return CARDS.find((c) => c.id === id) ?? CARDS[0];
}

/** Carte "vitrine" pour une rareté donnée (la plus représentative). */
export function cardForRarity(r: RarityId, offset = 0): CardData {
  const list = CARDS.filter((c) => c.rarity === r);
  const pool = list.length ? list : CARDS;
  return pool[offset % pool.length];
}
