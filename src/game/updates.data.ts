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
        date: '8 nov.', title: 'Version 1 — Bébou Cartes', tag: 'nouveau',
        points: [
          `${CARDS} cartes à collectionner dans 4 thèmes — Gaming, Pop Culture, Sport et World — plus des cartes secrètes.`,
          '5 boosters (Bebou, Gaming, Popculture, Sport, World), 1 booster offert toutes les 5 minutes, ouvertures par 5 ou 10.',
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
