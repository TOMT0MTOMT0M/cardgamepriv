import type { CreatureKind } from '../../core/audio';

/**
 * Les 6★ Yu-Gi-Oh qui ont leur cinématique d'invocation (scènes/duelSummon.ts). Données pures (aucun three.js) : la
 * boutique les lit pour savoir s'il faut préparer la scène, sans la charger.
 *
 * Fichiers (public/fx/yugioh/, servis par le site lui-même) :
 *  - `<file>.webp` / `<file>-z.webp` : sujet détouré + relief (scripts/make-holo-yugioh.py) → hologramme 2.5D ;
 *  - FACULTATIFS, déposés à la main : `models/<file>.glb` (modèle 3D animé, clips `summon` puis `idle` s'ils existent)
 *    remplace l'hologramme 2.5D ; `sfx/<file>.mp3` remplace le cri synthétisé ; `sfx/duel.mp3` remplace le motif « duel ».
 */
export interface DuelMonster {
  file: string;
  /** cri synthétisé (core/audio.ts → creature) */
  cry: CreatureKind;
  /** hauteur de l'hologramme (unités de scène ; la carte fait 0,88) */
  tall: number;
  /** couleur d'accent (ligne de matérialisation, étincelles, terrain) */
  accent: string;
  /** buste (portrait de duelliste) plutôt que créature entière : bords fondus, moins de relief */
  bust?: boolean;
  /** nom français (titre de l'invocation) */
  fr?: string;
  /** pièces du modèle 3D à masquer (nom de matériau ou de maillage) */
  hide?: RegExp;
}

export const DUEL_MONSTERS: Record<string, DuelMonster> = {
  'pop-blue-eyes-white-dragon': { file: 'blue-eyes-white-dragon', cry: 'dragon', tall: 2.1, accent: '#9fe6ff', fr: 'Dragon Blanc aux Yeux Bleus', hide: /^(bewd_)?eye$/ },
  'pop-red-eyes-black-dragon': { file: 'red-eyes-black-dragon', cry: 'darkDragon', tall: 2.0, accent: '#ff4d3d', fr: 'Dragon Noir aux Yeux Rouges' },
  'pop-slifer-the-sky-dragon': { file: 'slifer-the-sky-dragon', cry: 'skyDragon', tall: 2.2, accent: '#ff3b47', fr: 'Slifer le Dragon Céleste' },
  'pop-obelisk-the-tormentor': { file: 'obelisk-the-tormentor', cry: 'giant', tall: 2.4, accent: '#5aa8ff', fr: 'Obélisk le Tourmenteur' },
  'pop-exodia-the-forbidden-one': { file: 'exodia-the-forbidden-one', cry: 'giant', tall: 2.3, accent: '#ffb43a', fr: 'Exodia le Maudit' },
  'pop-dark-magician': { file: 'dark-magician', cry: 'mage', tall: 2.0, accent: '#b07cff', fr: 'Magicien Sombre' },
  'pop-dark-magician-girl': { file: 'dark-magician-girl', cry: 'fairy', tall: 1.95, accent: '#ff8fd0', fr: 'Magicienne des Ténèbres' },
  'pop-yami-yugi': { file: 'yami-yugi', cry: 'duelist', tall: 1.75, accent: '#ffd35a', bust: true },
  'pop-seto-kaiba': { file: 'seto-kaiba', cry: 'duelist', tall: 1.75, accent: '#7fb2ff', bust: true },
  'pop-jaden-yuki': { file: 'jaden-yuki', cry: 'duelist', tall: 1.7, accent: '#ff6a3d', bust: true },
};

export const duelMonster = (cardId: string): DuelMonster | null => DUEL_MONSTERS[cardId] ?? null;
