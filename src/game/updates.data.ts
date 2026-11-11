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
/**
 * Annonce du moment : à la PROCHAINE visite (une seule fois par appareil), le jeu ouvre la page des mises à jour
 * (src/game/announce.ts). Changer cet identifiant à chaque nouvelle annonce qui mérite d'être montrée d'office.
 */
export const ANNOUNCE_ID = 'patch-2026-11-08';

export const UPDATES: UpdateMonth[] = [
  {
    month: 'Novembre 2026',
    entries: [
      {
        date: '11 nov.', title: 'Nouveau tri des étoiles : World et Sport', tag: 'amélioré',
        points: [
          'World : 75 cartes changent d’étoiles (Paris, Heineken et la Nissan GT-R passent en 6★, par exemple).',
          'Sport : 287 cartes changent d’étoiles (Ousmane Dembélé, T1 et Rey Mysterio passent en 6★). Antoine Dupont, Tadej Pogačar, Naoya Inoue et Hikaru Nakamura quittent les 6★.',
          'Les cartes déjà tirées suivent toutes seules : collection, vitrine, échanges et annonces en cours.',
        ],
      },
      {
        date: '11 nov.', title: '37 cartes 5★ et 6★ avec une meilleure image', tag: 'corrigé',
        points: [
          'Nouvelles images pour Eminem, Bruno Mars, Chris Brown, Charles Aznavour, Allumer le feu, Tchikita, Mon fils ma bataille, Iron Man, Hulk, Han Solo, Yoda, le Joker, Ron Weasley, Michael Scofield, Fernand Naudin, Jess Day et Jayce.',
          'Animés : Ichigo, Kisuke Urahara, Eren, Giyuu, Shikamaru, Ippo, Aquamarine, Yuno Gasai, Exodia et le Dragon Blanc aux Yeux Bleus.',
          'Sport : Zidane, Deschamps, Alex Ferguson, Kobe Bryant, Evander Holyfield, Bugha, Footix et WrestleMania. Et aussi Ratchet et les Maki.',
        ],
      },
      {
        date: '11 nov.', title: 'Sport Pack : 278 nouvelles cartes Sport & Esport', tag: 'nouveau',
        points: [
          'Esport : nouveaux joueurs pros sur League of Legends (anciens et nouveaux), Counter-Strike, Valorant, Call of Duty, Apex Legends (Zer0 6★, Reps, Yulariman et Blinkzr 5★) et Fortnite.',
          'Sport : Lin Dan (6★), Lee Chong Wei, Gao Ling et Carolina Marín (Badminton) ; Shohei Ohtani (6★), Aaron Judge et Bobby Witt Jr. (Baseball) ; Shai Gilgeous-Alexander (Basketball) ; Félix et Alexis Lebrun (6★, Tennis de table) ; Luke Littler (6★), Luke Humphries et Gian van Veen (Fléchettes) ; The Rock (6★, Catch) ; Remco Evenepoel et Paul Seixas (Cyclisme) ; Efren Reyes et Raymond Ceulemans (Billard).',
          'Passent en 6★ : Antoine Dupont (Rugby), Tadej Pogačar (Cyclisme), Naoya Inoue (Boxe) et Hikaru Nakamura (Échecs) — les cartes déjà tirées suivent toutes seules.',
        ],
      },
      {
        date: '10 nov.', title: 'Vos suggestions traitées plus vite', tag: 'amélioré',
        points: [
          'Tom et Hugo ont un nouvel outil pour lire vos suggestions et vos cartes signalées, et régler vos soucis (boosters manquants, parrainage, échange bloqué) en quelques secondes. Continuez à tout signaler dans l’onglet Suggestions !',
        ],
      },
      {
        date: '10 nov.', title: 'Toujours la dernière version', tag: 'amélioré',
        points: [
          'Quand une mise à jour sort, le jeu se met à jour tout seul la prochaine fois que tu le rouvres (ou que tu reviens dessus), même installé sur l’écran d’accueil. Jamais pendant une ouverture de booster, et tu restes connecté.',
          'Un souci d’affichage ? Menu du profil → « Réparer et mettre à jour » : le jeu vide ses caches et recharge la dernière version.',
        ],
      },
      {
        date: '10 nov.', title: 'Classement réparé', tag: 'corrigé',
        points: [
          'Le classement ne s’affichait plus depuis que les collections ont beaucoup grossi : il revient, et s’ouvre plus vite.',
          'Ta ligne est à jour dès que tu ouvres le classement ; celles des autres se mettent à jour toutes les 5 minutes.',
        ],
      },
      {
        date: '10 nov.', title: 'Sondage : à toi de choisir la suite', tag: 'nouveau',
        points: [
          'Un petit sondage d’une minute s’ouvre à la connexion : les univers que tu veux collectionner, les nouveautés de jeu qui te tentent, ta note du jeu et un mot libre. Les réponses décident de ce qui arrive en premier.',
          '« Plus tard » le referme : il revient une heure après, tant qu’il n’est pas rempli.',
        ],
      },
      {
        date: '9 nov.', title: 'Échanges : « Accepter » réparé, et trouver qui a une carte', tag: 'nouveau',
        points: [
          'Le bouton « Accepter » d’un échange reçu marche du premier coup (il fallait parfois toucher la fine barre d’équilibre au milieu avant).',
          'Échanges → « Trouver une carte » : cherche n’importe quelle carte du jeu, puis « Qui l’a ? » montre les joueurs qui la possèdent et combien ils en ont de libres. « Échanger » ouvre l’échange avec la carte déjà demandée : il ne reste qu’à choisir ce que tu donnes.',
          'Collection : « Chercher un propriétaire » sur la fiche d’une carte, et toucher une carte qui te manque montre directement qui l’a.',
          'Recherche de cartes plus souple partout : plusieurs mots dans n’importe quel ordre (« pikachu pokemon », « messi foot »), sans se soucier des accents ni des apostrophes, l’univers ou l’artiste, le numéro, ou « 6★ » pour les étoiles.',
        ],
      },
      {
        date: '8 nov.', title: 'God pack, échanges réparés et tout ce qui a changé depuis la V1', tag: 'nouveau',
        points: [
          'GOD PACK : 1 booster sur 1 000 est un god pack. Que des cartes 4★ et plus, au moins une 5★ et une 6★, et sa propre animation à l’ouverture. Toute la bande est prévenue quand quelqu’un en ouvre un.',
          'Échanges : le bouton « Accepter » d’un échange reçu marche à nouveau (il était devenu illisible et ne répondait pas toujours). Il ouvre maintenant une confirmation « Oui, échanger » qui reste affichée, et si l’échange coince, la raison reste écrite dans l’échange.',
          'Visages : plus de 600 cartes recadrées pour que le visage soit en entier, et plus caché sous le nom.',
          'Patrick Bruel et tout ce qui le concerne (ses chansons, Le Prénom) sont retirés du jeu.',
          'Pack Battle : tirages deux fois plus lents, les deux cartes du tirage en grand au centre, et les deux colonnes de la même taille à la fin.',
          'Battle Royale : on peut miser de 1 à 5 boosters, le même nombre pour tout le monde. Le total d’étoiles de toutes tes cartes départage.',
          '« Image à revoir » : un bouton dans toutes les visionneuses (collection, profil, échanges, contrats, ouverture) pour nous signaler une image buguée ou absente en un geste.',
          'Nouvelles illustrations pour 27 cartes 5★ et 6★ (Michael Jordan, Usain Bolt, Altaïr, Ciri, Edward Elric…).',
          'Les cartes qui n’avaient pas de vraie image sont retirées du jeu (les 5★ et 6★ restent le temps de leur en trouver une).',
          'Raretés revues : certaines stars surtout connues hors d’Europe et des États-Unis descendent en étoiles.',
          'Pitbull : l’extrait joué est maintenant « International Love ».',
          'Discord : les 6★ et les cartes secrètes tirées y sont annoncées avec la carte de face, en grand, et le nom du joueur. Connecté avec Discord ? Tu reçois tout seul le rôle « Card » sur le serveur.',
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
