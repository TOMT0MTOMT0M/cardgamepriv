/**
 * MISES À JOUR (onglet #/maj, retours 06/11) — le journal des nouveautés, mois par mois, le plus récent en haut.
 * Pour ajouter une mise à jour : une entrée en tête du mois en cours (ou un nouveau mois en tête de la liste).
 * `tag` : nouveau · amélioré · corrigé.
 */
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

export const UPDATES: UpdateMonth[] = [
  {
    month: 'Novembre 2026',
    intro: 'Le mois où le site a pris sa forme : les 4 thèmes, des dizaines de milliers de cartes et tout ce qui va autour.',
    entries: [
      {
        date: '6 nov.', title: 'Gros boosters, nouveaux sachets et onglets d’aide', tag: 'nouveau',
        points: [
          '5 ou 10 boosters d’un coup ouvrent UN seul booster de 25 ou 50 cartes (mêmes chances), la meilleure carte à la toute fin.',
          'Nouveaux sachets tout simples : gris, violet, orange, vert, bleu, avec le logo et le nom du pack ; dos métallisé.',
          'Cartes retournées plus lentement, du son seulement pour la dernière carte (ou une 5★ / 6★).',
          'Les photos horizontales ont leur propre style de carte ; effets des cartes bleues / rouges adoucis.',
          'Fiche booster : la vraie chance de chaque carte est écrite sous elle.',
          'Bannière, cadre, couleur et vitrine : la même palette partout, plus la couleur libre.',
          'Onglets Mises à jour et Tutoriel ; Hugo et Tom modèrent les suggestions.',
        ],
      },
      {
        date: '5 nov.', title: 'Familles, nouvelles polices, achat de boosters', tag: 'nouveau',
        points: [
          'Collection : thème → familles (Pokémon, Jeux vidéo, Mangas & anime…) → albums → cartes.',
          'Boosters achetables en pièces (250 l’unité, 10 par jour).',
          'Échanges sur un seul écran : tableau d’offres en haut, échanges directs en dessous.',
          'Succès : les paliers se dévoilent un par un. Extraits musicaux sur les cartes Musique 6★.',
          'Vitrine personnalisable, artiste imprimé sur les cartes albums et chansons.',
        ],
      },
      {
        date: '4 nov.', title: 'Suggestions, couleur du profil, grand ménage', tag: 'amélioré',
        points: [
          'Onglet Suggestions : bug, carte à refaire, série à ajouter, idée libre.',
          'Couleur du profil à choisir dans Personnaliser.',
          'Les cartes 1★ à 3★ sans illustration ont été retirées ; 77 illustrations 4★+ ajoutées.',
          'Rencontre sauvage pour les Pokémon 6★, invocation pour les Yu-Gi-Oh 6★.',
        ],
      },
      {
        date: '1er – 3 nov.', title: 'Les débuts', tag: 'nouveau',
        points: [
          'Les 5 packs : Bebou Pack, Gaming Pack, Pop Culture Pack, Sport Pack, World Pack.',
          'Collection, contrats, échanges, espace Jeux, succès, profils, amis.',
          'Recharge : 1 booster toutes les 5 minutes, jusqu’à 15 en réserve.',
        ],
      },
    ],
  },
];
