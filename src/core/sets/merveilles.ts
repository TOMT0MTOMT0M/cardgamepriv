/**
 * Sous-thème « Les 14 Merveilles du Monde » (World Pack 🌍) — données pures, AUCUN import (partageable avec convex/).
 * Généré par scripts/build-world-catalog.mjs.
 */
export type WorldRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'secret';

export interface WorldSetEntry {
  num: number;
  slug: string;
  name: string;
  rarity: WorldRarity;
}

export const MERVEILLES_INFO = { id: 'merveilles', label: 'Les 14 Merveilles du Monde', code: 'MRV', size: 14, artDir: 'art/merveilles' } as const;

const R = { c: 'common', u: 'uncommon', r: 'rare', e: 'epic', l: 'legendary', m: 'mythic', s: 'secret' } as const;

const RAW: Array<[number, string, string, keyof typeof R]> = [
  [1, 'grande-pyramide-de-kheops', 'Grande Pyramide de Khéops', 's'],
  [2, 'jardins-suspendus-de-babylone', 'Jardins suspendus de Babylone', 's'],
  [3, 'statue-de-zeus-a-olympie', 'Statue de Zeus à Olympie', 's'],
  [4, 'temple-d-artemis-a-ephese', 'Temple d\'Artémis à Éphèse', 's'],
  [5, 'mausolee-d-halicarnasse', 'Mausolée d\'Halicarnasse', 's'],
  [6, 'colosse-de-rhodes', 'Colosse de Rhodes', 's'],
  [7, 'phare-d-alexandrie', 'Phare d\'Alexandrie', 's'],
  [8, 'grande-muraille-de-chine', 'Grande Muraille de Chine', 's'],
  [9, 'petra-khazneh', 'Pétra (Khazneh)', 's'],
  [10, 'christ-redempteur-rio', 'Christ Rédempteur (Rio)', 's'],
  [11, 'machu-picchu', 'Machu Picchu', 's'],
  [12, 'chichen-itza', 'Chichén Itzá', 's'],
  [13, 'colisee-de-rome', 'Colisée de Rome', 's'],
  [14, 'taj-mahal', 'Taj Mahal', 's'],
];

export const MERVEILLES_14: WorldSetEntry[] = RAW.map(([num, slug, name, r]) => ({ num, slug, name, rarity: R[r] }));

export const mrvCardId = (e: WorldSetEntry) => `mrv-${e.slug}`;

export const mrvFile = (e: WorldSetEntry) => `${String(e.num).padStart(3, '0')}-${e.slug}.png`;
