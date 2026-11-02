/**
 * Sous-thème « Ardèche » (World Pack 🌍) — données pures, AUCUN import (partageable avec convex/).
 * Généré par scripts/build-world-catalog.mjs.
 */
export type WorldRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface WorldSetEntry {
  num: number;
  slug: string;
  name: string;
  rarity: WorldRarity;
}

export const ARDECHE_INFO = { id: 'ardeche', label: 'Ardèche', code: '07', size: 35, artDir: 'art/ardeche' } as const;

const R = { c: 'common', u: 'uncommon', r: 'rare', e: 'epic', l: 'legendary', m: 'mythic' } as const;

const RAW: Array<[number, string, string, keyof typeof R]> = [
  [1, 'pont-d-arc', 'Pont d\'Arc', 'm'],
  [2, 'gorges-de-l-ardeche', 'Gorges de l\'Ardèche', 'm'],
  [3, 'grotte-chauvet-2', 'Grotte Chauvet 2', 'm'],
  [4, 'creme-de-marrons-clement-faugier', 'Crème de marrons Clément Faugier', 'm'],
  [5, 'citroen-c15-des-cevennes', 'Citroën C15 des Cévennes', 'm'],
  [6, 'mont-gerbier-de-jonc', 'Mont Gerbier-de-Jonc', 'l'],
  [7, 'mont-mezenc', 'Mont Mézenc', 'l'],
  [8, 'cascade-du-ray-pic', 'Cascade du Ray-Pic', 'l'],
  [9, 'balazuc', 'Balazuc', 'l'],
  [10, 'vogue', 'Vogüé', 'l'],
  [11, 'labeaume', 'Labeaume', 'l'],
  [12, 'caillette-ardechoise', 'Caillette ardéchoise', 'l'],
  [13, 'criques-ardechoises', 'Criques ardéchoises', 'l'],
  [14, 'picodon-aop', 'Picodon AOP', 'l'],
  [15, 'bois-de-paiolive', 'Bois de Païolive', 'e'],
  [16, 'lac-d-issarles', 'Lac d\'Issarlès', 'e'],
  [17, 'aubenas-son-chateau', 'Aubenas & son Château', 'e'],
  [18, 'vallon-pont-d-arc', 'Vallon-Pont-d\'Arc', 'e'],
  [19, 'defiles-de-ruoms', 'Défilés de Ruoms', 'e'],
  [20, 'privas-capitale-du-marron-glace', 'Privas (Capitale du Marron Glacé)', 'e'],
  [21, 'annonay-berceau-des-montgolfier', 'Annonay (Berceau des Montgolfier)', 'e'],
  [22, 'bombine-ardechoise', 'Bombine ardéchoise', 'e'],
  [23, 'marrons-glaces-d-ardeche', 'Marrons glacés d\'Ardèche', 'e'],
  [24, 'chataigne-d-ardeche-aop', 'Châtaigne d\'Ardèche AOP', 'e'],
  [25, 'fin-gras-du-mezenc', 'Fin gras du Mézenc', 'e'],
  [26, 'les-vans', 'Les Vans', 'r'],
  [27, 'joyeuse', 'Joyeuse', 'r'],
  [28, 'pont-du-diable-de-thueyts', 'Pont du Diable de Thueyts', 'r'],
  [29, 'alba-la-romaine', 'Alba-la-Romaine', 'r'],
  [30, 'vals-les-bains-eau-de-vals', 'Vals-les-Bains & Eau de Vals', 'r'],
  [31, 'train-de-l-ardeche-le-mastrou', 'Train de l’Ardèche (Le Mastrou)', 'r'],
  [32, 'maoche-ardechoise', 'Maôche ardéchoise', 'r'],
  [33, 'myrtilles-sauvages-au-peigne', 'Myrtilles sauvages au peigne', 'r'],
  [34, 'sanglier-des-cevennes', 'Sanglier des Cévennes', 'r'],
  [35, 'canoe-bidon-jaune-dans-les-gorges', 'Canoë & Bidon Jaune dans les Gorges', 'r'],
];

export const ARDECHE_SET: WorldSetEntry[] = RAW.map(([num, slug, name, r]) => ({ num, slug, name, rarity: R[r] }));

export const ardCardId = (e: WorldSetEntry) => `ard-${e.slug}`;

export const ardFile = (e: WorldSetEntry) => `${String(e.num).padStart(3, '0')}-${e.slug}.png`;
