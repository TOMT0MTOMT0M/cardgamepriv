/**
 * Thème SECRET « Les Bébous » — données pures, AUCUN import (partageable tel quel avec convex/, comme pokemon151.ts).
 *
 * 8 cartes, une par membre du groupe : surnom + photo, toutes en rareté SECRÈTE (au-dessus de mythique).
 * Elles ne tombent QUE dans le « bébou pack » (le pack de base qui contient toutes les cartes de tous les thèmes),
 * avec une probabilité de 1 / nombre total de cartes du jeu PAR PACK (cf. packRules.ts) : la carte la plus rare du site, c'est un de nous.
 *
 * Pour mettre les vraies cartes :
 *  1. remplacer les surnoms ci-dessous (le `slug` reste l'identifiant stable : ne plus le changer
 *     une fois que des cartes sont tombées dans les inventaires) ;
 *  2. déposer chaque photo dans public/art/bebous/ sous le MÊME nom de fichier (`bebou-1.png`, …).
 *     Photo détourée (fond transparent) → le portrait flotte en parallaxe devant le fond or rose ;
 *     photo classique (fond opaque) → elle remplit la carte en pleine illustration. Rien d'autre à changer.
 *     Format conseillé : portrait 3:4 (ex. 1200×1600), visage dans le tiers haut.
 */
export interface BebouEntry {
  /** numéro de carte (1..8) */
  num: number;
  /** identifiant stable (inventaire, échanges) */
  slug: string;
  /** surnom affiché sur la carte */
  nickname: string;
}

export const BEBOUS_INFO = { id: 'bebous', label: 'Les Bébous (secret)', code: 'BÉBOUS', size: 8, artDir: 'art/bebous' } as const;

// [num, slug, surnom] — surnoms provisoires, à remplacer par les vrais
const RAW: Array<[number, string, string]> = [
  [1, 'bebou-1', 'Bébou n°1'],
  [2, 'bebou-2', 'Bébou n°2'],
  [3, 'bebou-3', 'Bébou n°3'],
  [4, 'bebou-4', 'Bébou n°4'],
  [5, 'bebou-5', 'Bébou n°5'],
  [6, 'bebou-6', 'Bébou n°6'],
  [7, 'bebou-7', 'Bébou n°7'],
  [8, 'bebou-8', 'Bébou n°8'],
];

export const BEBOUS: BebouEntry[] = RAW.map(([num, slug, nickname]) => ({ num, slug, nickname }));

/** Identifiant de carte stable. */
export const bebouCardId = (e: BebouEntry) => `bebou-${e.slug.replace(/^bebou-/, '')}`;

/** Nom du fichier photo (relatif à `BEBOUS_INFO.artDir`). */
export const bebouFile = (e: BebouEntry) => `${e.slug}.png`;

// ═══════════════════════════════════════════════════════════════════ KCDQ
/**
 * Cartes spéciales « KCDQ » — à la Bébou : une photo, un prénom, rareté SECRÈTE, même gabarit (sceau, filet or rose),
 * mêmes règles de tirage (uniquement dans le bébou pack, avec les Bébous). Album à part dans la collection.
 *
 * Ajouter une carte : une ligne [num, slug, nom, fichier] ci-dessous + la photo dans public/art/kcdq/ (et sa miniature
 * WebP dans public/art/kcdq/thumbs/, ≤ 256 px). Le `slug` est l'identifiant stable : ne plus le changer ensuite.
 * Photo classique (fond opaque) → pleine carte ; format portrait 3:4 (ex. 1200×1600), sujet au centre.
 */
export const KCDQ_INFO = { id: 'kcdq', label: 'KCDQ (secret)', code: 'KCDQ', artDir: 'art/kcdq' } as const;

export interface KcdqEntry {
  num: number;
  slug: string;
  name: string;
  file: string;
  /** preset « double face » (07/11) : seconde photo, visible quand on penche la carte sur le côté (core/cardMaterial.ts) */
  file2?: string;
}

const KCDQ_RAW: Array<[number, string, string, string, string?]> = [
  [1, 'enzo', 'Enzo', 'kcdq-enzo.jpg'],
  [2, 'teto', 'Teto', 'kcdq-teto.jpg', 'kcdq-teto-2.jpg'],
];

export const KCDQ: KcdqEntry[] = KCDQ_RAW.map(([num, slug, name, file, file2]) => ({ num, slug, name, file, ...(file2 ? { file2 } : {}) }));

/** Identifiant de carte stable. */
export const kcdqCardId = (e: KcdqEntry) => `kcdq-${e.slug}`;
