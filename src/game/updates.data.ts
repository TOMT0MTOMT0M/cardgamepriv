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
        date: '11 nov.', title: '56 chansons en 6★, Finn d’Adventure Time', tag: 'nouveau',
        points: [
          'Nouvelles 6★ : Give Me the Night, Temperature, Plus près des étoiles, Caravane, Le Temps des cathédrales, Je ne suis pas un héros, Laisse pas traîner ton fils, Gravé dans la roche, Suicide social, Le monde ou rien, Mosaïque solitaire, Avant la douane, et les grands classiques (Lettre à Élise, Le Lac des cygnes, La Chevauchée des Walkyries…).',
          'Openings d’animés en 6★ : Unravel, KICK BACK, Kaikai Kitan, Guren no Yumiya, Sign, crossing field, Peace Sign, Idol, Black Rover, Brave Shine, Snow Fairy, Fly High!! et d’autres.',
          'Passent en 6★ : Locked Out of Heaven, Take on Me, Wonderwall, In the End, Dream On, Every Breath You Take, Californication, L’Aziza, Ne me quitte pas, Petite Marie, La Boulette… Chaque 6★ joue son extrait.',
          'Finn l’Humain (Adventure Time) arrive en 6★. Gérard Depardieu est retiré du jeu.',
        ],
      },
      {
        date: '11 nov.', title: 'Skins CS 6★ en 3D et Éclipse pour Berserk', tag: 'nouveau',
        points: [
          'Dans la visionneuse, les skins Counter-Strike 6★ apparaissent en 3D dans la carte : la caméra zoome, puis le doigt, la souris ou le gyroscope font tourner l’arme.',
          'Les 6★ Berserk ont leur propre animation, l’Éclipse, à l’ouverture comme dans la visionneuse.',
        ],
      },
      {
        date: '11 nov.', title: 'Nouveau tri des étoiles : Pop Culture, World et Sport', tag: 'amélioré',
        points: [
          'Pop Culture : 530 cartes montent en étoiles, dont 335 qui passent en 6★ (Leonardo DiCaprio, Morgan Freeman, Louis de Funès, Bruce Lee, Astérix et Obélix, les capitaines de Bleach, Blue Lock…).',
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
        date: '10 nov.', title: 'Retours de Hugo : le Marché, des cartes plus grandes, l’ouverture plus rapide', tag: 'nouveau',
        points: [
          'Nouveau Marché dans Échanges : mets une carte en vente à prix fixe, en pièces, et achète celles des autres en un geste (pas d’enchères : le premier qui achète l’a).',
          'Échanges en trois onglets clairs : Marché, Avec un ami, Offres.',
          'Ouverture : « Direct 4★ » va droit à ta première 4★ (ou ouvre tout le booster s’il n’y en a pas), sans faire défiler les autres ; la déchirure fait beaucoup moins de bruit.',
          'La pity en haut à droite ne bouge plus qu’une fois le booster fini : plus de spoil.',
          'Contrats : 10 cartes pour chaque étoile, de 1★ à 5★.',
          'Collection : cartes plus grandes, moins par rangée. Et tu peux voir la collection complète des autres depuis leur profil.',
          'Retour des formes rondes et de la police ronde sur les boosters, avec des touches de couleur.',
          'Toutes les 5★ en pleine illustration ; les 6★ d’animés jouent l’opening de leur animé, et les extraits manquants des 6★ Musique sont arrivés (Au DD…).',
        ],
      },
      {
        date: '10 nov.', title: 'Tout le jeu passe au style de l’espace Jeux', tag: 'amélioré',
        points: [
          'Collection, Échanges, Classement, Succès, Amis, Profil, Suggestions : même dessin que l’espace Jeux — noir, traits fins, coins droits, repères aux angles.',
          'Grands titres de page, étiquettes en capitales, textes plus lisibles (surtout au téléphone).',
          'Boutons, onglets, menus et fenêtres identiques d’une page à l’autre. Les cartes, les boosters et l’ouverture ne changent pas.',
        ],
      },
      {
        date: '10 nov.', title: 'Nouveau son : plus doux, plus proche, plus précis', tag: 'amélioré',
        points: [
          'Tous les sons courants sont refaits en « matière » : carton, feutre, bois, alu froissé — fini les bips aigus.',
          'Tout ce qui se touche répond par un petit « toc » feutré, placé là où tu touches.',
          'Les souffles suivent la vitesse des animations, et les impacts tombent pile sur l’image.',
          'Plus léger pour le téléphone : les sons sont fabriqués une fois au lancement, puis simplement relus.',
        ],
      },
      {
        date: '10 nov.', title: 'Profil : vitrine au glisser-déposer, page plus lisible', tag: 'amélioré',
        points: [
          'Vitrine : touche une carte de ta collection pour l’ajouter, touche-la encore pour la retirer. Glisse-la sur une case pour la placer, glisse les cartes de la vitrine pour changer leur ordre, ou hors de la vitrine pour les retirer (au téléphone : maintiens la carte, puis glisse).',
          'Pendant que tu choisis, la vitrine reste en haut de l’écran ; « Compléter auto » remplit les cases vides avec tes meilleures cartes.',
          'Tableau du profil rangé : trois chiffres clés, puis Activité, Collection, Raretés et Univers, avec un code couleur (bleu = progression, vert = activité, doré = succès, arc-en-ciel = 6★).',
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
          'L’Éclipse : un booster qui cache une carte Berserk 5★ ou 6★ se trahit — sa lueur vire au rouge sang, puis, une fois ouvert, le soleil noir se lève au-dessus d’un lac pendant que « Behelit » joue en fond.',
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
