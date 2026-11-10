/**
 * MISES À JOUR (onglet #/maj, retours 06/11) — le journal des nouveautés, mois par mois, le plus récent en haut.
 * Pour ajouter une mise à jour : une entrée en tête du mois en cours (ou un nouveau mois en tête de la liste).
 * `tag` : nouveau · amélioré · corrigé.
 */
import { PUBLIC_CARD_COUNT } from '../core/sets/themes';

export interface UpdateEntry {
  date: string;
  title: string;
  tag: 'nouveau' | 'amélioré' | 'corrigé';
  points: string[];
}
export interface UpdateMonth {
  month: string;
  intro?: string;
  entries: UpdateEntry[];
}

/** nombre total de cartes à collectionner (lu dans le catalogue : il suit les ajouts) */
const CARDS = String(PUBLIC_CARD_COUNT).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

/**
 * (retours live 6, C11) pour l'instant UN SEUL post : la V1, datée du 8 novembre 2026 — le nombre de cartes, les grosses
 * fonctionnalités, et le rythme : une grosse mise à jour par mois. Pas de fil détaillé.
 */
export const UPDATES: UpdateMonth[] = [
  {
    month: 'Novembre 2026',
    entries: [
      {
        date: '10 nov.', title: 'Cartes 6★ : leur scène partout', tag: 'amélioré',
        points: [
          'Ouvrir une carte 6★ dans la Collection, les Échanges, les Contrats, le Profil ou les Gros tirages rejoue la scène de sa famille (cartouche, vinyle, case de manga, tunnel…), puis la carte se retourne. Un toucher passe la scène ; « Rejouer » relance la version complète.',
          'Les 26 scènes ont été retravaillées : la carte de la scène est le vrai dos en aluminium brossé, elle se raccorde à la carte sans à-coup, et les textes sont plus lisibles sur téléphone.',
        ],
      },
      {
        date: '10 nov.', title: 'Berserk : six nouvelles cartes', tag: 'nouveau',
        points: [
          'Six nouvelles cartes Berserk au-delà de l’Âge d’or, dans le booster Pop Culture : Femto, le Chevalier Squelette et Guts (Armure du Berserker) en 6★, Schierke, Farnese et Serpico en 5★.',
        ],
      },
      {
        date: '8 nov.', title: 'Correctifs du week-end', tag: 'amélioré',
        points: [
          'Battle Royale : on peut maintenant miser de 1 à 5 boosters, le même nombre pour tout le monde. Le total d’étoiles de toutes tes cartes départage.',
          'Nouvelles illustrations pour 27 cartes 5★ et 6★ (Michael Jordan, Usain Bolt, Altaïr, Ciri, Edward Elric…).',
          'Les cartes qui n’avaient pas de vraie image sont retirées du jeu (les 5★ et 6★ restent le temps de leur en trouver une).',
          'Raretés revues : certaines stars surtout connues hors d’Europe et des États-Unis descendent en étoiles.',
          'Pitbull : l’extrait joué est maintenant « International Love ».',
        ],
      },
      {
        date: '7 nov.', title: 'Version 1 — Bébou Cartes', tag: 'nouveau',
        points: [
          'Saison 1 : tout le monde repart de zéro. Compte avec Discord ou un simple pseudo, 15 boosters offerts et recharge ×2 pendant tes 24 premières heures.',
          'La roulette démarre avec un pot de base : des pièces et une carte 6★ offertes par le club.',
          `${CARDS} cartes à collectionner dans 4 thèmes — Gaming, Pop Culture, Sport et World — plus des cartes secrètes.`,
          '5 boosters (Bebou, Gaming, Popculture, Sport, World), 1 booster offert toutes les 5 minutes (jusqu’à 15 en réserve), ouvertures par 5 ou 10.',
          'Collection par familles et albums, classeurs, la Forge et les Contrats pour transformer tes doublons.',
          'Échanges directs entre amis et tableau d’offres ouvert à tous.',
          'Succès à paliers : à chaque palier, une récompense — pièces, boosters, titres, badges ou cadres animés.',
          'Profil personnalisable, classement, amis et parrainage, espace Jeux.',
          'Une grosse mise à jour par mois : nouvelles cartes, nouvelles fonctionnalités. Tout sera annoncé ici.',
        ],
      },
    ],
  },
];
