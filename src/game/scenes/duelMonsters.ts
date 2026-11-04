import type { CreatureKind } from '../../core/audio';
import type { PoseSpec } from './duelRig';

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
  /** pose du modèle 3D (squelettes sans animation, voir duelRig.ts → createAutoPose) */
  pose?: PoseSpec;
}

export const DUEL_MONSTERS: Record<string, DuelMonster> = {
  'pop-blue-eyes-white-dragon': { file: 'blue-eyes-white-dragon', cry: 'dragon', tall: 2.1, accent: '#9fe6ff', fr: 'Dragon Blanc aux Yeux Bleus', hide: /^(bewd_)?eye$/ },
  'pop-red-eyes-black-dragon': { file: 'red-eyes-black-dragon', cry: 'darkDragon', tall: 2.0, accent: '#ff4d3d', fr: 'Dragon Noir aux Yeux Rouges', pose: {
      rot: {
        spine: [-0.75, 0, 0], neck: [-0.35, 0, 0], head: [0.95, 0, 0], jaw: [0.25, 0, 0], tail: [0.35, 0.5, 0],
        // ailes : écartées vers l'extérieur (lacet −) et inclinées vers l'extérieur (roulis −) — sinon elles se croisent dans le dos
        wing: [0, -0.4, -0.45], wing03: [0, -0.3, -0.3], fifthwing01: [0, -0.3, -0.2], sixthwing01: [0, -0.2, -0.1],
      },
      dir: { arm: [0.75, -0.25, 0.6], forearm: [0.35, 0.15, 0.92], upleg: [0.18, -0.6, 0.78], leg: [0.08, -0.72, -0.69], foot: [0.05, -0.25, 0.97] },
    } },
  'pop-slifer-the-sky-dragon': { file: 'slifer-the-sky-dragon', cry: 'skyDragon', tall: 2.2, accent: '#ff3b47', fr: 'Slifer le Dragon Céleste', pose: {
      // buste dressé ; le segment qui porte les pattes reste à l'horizontale (level) et la queue s'enroule en spirale
      // derrière lui (curl : chaque segment se plie par rapport au précédent) — boucle verticale comme dans l'anime
      level: { hip: 1 },
      curl: ['tail', 'joint'],
      rot: { spine: [-1.1, 0, 0], neck: [0.2, 0, 0], head: [0.55, 0, 0], joint: [0.05, 0.3, 0], tail: [4.5, 2.2, 0.5], wing: [0, 0.2, -0.35] },
      // pattes arrière en direction fixe (sinon l'enroulement les emporte) : cuisse en avant, jarret en arrière, pied à plat
      dir: { arm: [0.25, -0.35, 0.9], forearm: [0.2, 0.1, 0.97], upleg: [0.12, -0.85, 0.5], leg: [0.05, -0.85, -0.5], foot: [0.05, 0.3, 0.95] },
    } },
  'pop-obelisk-the-tormentor': { file: 'obelisk-the-tormentor', cry: 'giant', tall: 2.4, accent: '#5aa8ff', fr: 'Obélisk le Tourmenteur', pose: {
      // ailes en V derrière les épaules (sprite ROD)
      rot: { spine: [0.28, 0, 0], neck: [-0.2, 0, 0], head: [-0.1, 0, 0], wing: [0, -0.45, -0.35] },
      dir: {
        'arm.L': [0.27, -0.95, 0.12], 'forearm.L': [0.16, -0.94, 0.3], 'arm.R': [-0.22, -0.96, 0.17], 'forearm.R': [-0.1, -0.9, 0.42],
        upleg: [0.18, -0.98, 0.06], leg: [0.12, -0.98, -0.12],
      },
    } },
  'pop-exodia-the-forbidden-one': { file: 'exodia-the-forbidden-one', cry: 'giant', tall: 2.3, accent: '#ffb43a', fr: 'Exodia le Maudit', pose: {
      rot: { head: [-0.08, 0.1, 0] },
      dir: {
        'arm.L': [0.9, 0.32, 0.25], 'forearm.L': [0.12, 0.98, 0.15], 'arm.R': [-0.92, 0.18, 0.28], 'forearm.R': [-0.18, 0.97, 0.12],
        upleg: [0.12, -0.99, 0.03], leg: [0.08, -0.99, -0.05],
      },
    } },
  'pop-dark-magician': { file: 'dark-magician', cry: 'mage', tall: 2.0, accent: '#b07cff', fr: 'Magicien Sombre', pose: {
      rot: { spine: [0.18, 0.25, 0], head: [-0.05, -0.2, 0.08], hips: [0, 0.1, 0.06] },
      dir: {
        'arm.R': [-0.35, -0.55, 0.76], 'forearm.R': [-0.15, -0.05, 0.99], 'arm.L': [0.55, 0.75, -0.25], 'forearm.L': [-0.15, 0.95, 0.25],
        'upleg.L': [0.08, -0.98, 0.15], 'leg.L': [0.05, -0.99, -0.08], 'upleg.R': [-0.06, -0.99, -0.12], 'leg.R': [-0.05, -0.99, -0.02],
      },
      roll: { 'forearm.R': 1.4 },
    } },
  'pop-dark-magician-girl': { file: 'dark-magician-girl', cry: 'fairy', tall: 1.95, accent: '#ff8fd0', fr: 'Magicienne des Ténèbres', pose: {
      rot: { spine: [0.14, -0.2, 0.05], head: [0.05, 0.2, -0.22], hips: [0, 0.1, 0.12] },
      dir: {
        'arm.R': [-0.5, 0.25, 0.83], 'forearm.R': [-0.1, 0.8, 0.6], 'arm.L': [0.3, -0.88, 0.36], 'forearm.L': [-0.55, 0.5, 0.67],
        'upleg.L': [-0.06, -0.95, 0.3], 'leg.L': [0.14, -0.93, -0.35], 'upleg.R': [-0.1, -0.99, 0.02], 'leg.R': [-0.08, -0.99, -0.06],
      },
    } },
  'pop-yami-yugi': { file: 'yami-yugi', cry: 'duelist', tall: 1.75, accent: '#ffd35a', bust: true },
  'pop-seto-kaiba': { file: 'seto-kaiba', cry: 'duelist', tall: 1.75, accent: '#7fb2ff', bust: true },
  'pop-jaden-yuki': { file: 'jaden-yuki', cry: 'duelist', tall: 1.7, accent: '#ff6a3d', bust: true },
};

export const duelMonster = (cardId: string): DuelMonster | null => DUEL_MONSTERS[cardId] ?? null;
