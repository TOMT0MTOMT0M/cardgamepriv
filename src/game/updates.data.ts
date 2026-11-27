/**
 * MISES À JOUR (onglet #/maj, retours 06/11) — le journal des nouveautés, mois par mois, le plus récent en haut.
 * Pour ajouter une mise à jour : une entrée en tête du mois en cours (ou un nouveau mois en tête de la liste).
 * `tag` : nouveau · amélioré · corrigé.
 */

export interface UpdateEntry {
  date: string;
  title: string;
  tag: 'nouveau' | 'amélioré' | 'corrigé';
  /** (v2.0.1) grosse mise à jour : mise en avant, toujours dépliée, avec un chapeau */
  featured?: boolean;
  lead?: string;
  points: string[];
}
export interface UpdateMonth {
  month: string;
  intro?: string;
  entries: UpdateEntry[];
}

/**
 * `{CARTES}` dans un point = le nombre total de cartes à collectionner, lu dans le catalogue AU MOMENT DE L'AFFICHAGE
 * (src/game/views/infos.ts) : il suit les ajouts et les retraits. (12/11) Avant, il était lu au chargement de ce fichier,
 * avant l'arrivée des 4 gros thèmes : la page affichait 5 247 cartes au lieu du vrai total.
 */
export const CARDS_TOKEN = '{CARTES}';

/**
 * (retours live 6, C11) pour l'instant UN SEUL post : la V1, datée du 8 novembre 2026 — le nombre de cartes, les grosses
 * fonctionnalités, et le rythme : une grosse mise à jour par mois. Pas de fil détaillé.
 */
/**
 * Annonce du moment : à la PROCHAINE visite (une seule fois par appareil), le jeu ouvre la page des mises à jour
 * (src/game/announce.ts). Changer cet identifiant à chaque nouvelle annonce qui mérite d'être montrée d'office.
 */
export const ANNOUNCE_ID = 'v2-0-2026-11-14';

export const UPDATES: UpdateMonth[] = [
  {
    month: 'Novembre 2026',
    entries: [
      {
        date: '20 nov.', title: 'V3 : onglet Événement, titres uniques, roulette en couleurs', tag: 'nouveau',
        points: [
          '♥ Abonnement à 5 € par mois pour soutenir le jeu (serveurs et développement) : +5 boosters de réserve, ta carte Bebou à ton idée, et le vote du mois. Paiement par Wero, un mois à la fois. Aucun avantage sur les tirages.',
          '🎄 Nouvel onglet Événement : le calendrier de l’Avent en forme de sapin, avec sa petite musique, du 1er au 24 décembre. Une case par jour (pièces ou boosters), les jours manqués se rattrapent jusqu’au 31, et la case 24 cache un God Pack.',
          '❄️ Cosmétiques de Noël à gagner en ouvrant les cases : un badge, deux titres et un cadre.',
          '♛ Titres uniques : le premier joueur qui complète Valorant, Naruto, Pokémon ou League of Legends remporte un titre que personne d’autre n’aura (Radiant, Hokage, Maître Pokémon, Challenger). Il s’affiche à côté de son pseudo, et tous les titres sont dans Succès → Succès d’albums.',
          '🎡 Roulette : la roue et le tapis sont en rouge, noir et une case verte. En payant le double, pose une couleur sur ton numéro : si personne n’a le numéro sorti, sa couleur rafle le pot.',
        ],
      },
      {
        date: '14 nov.', title: '🚀 Version 2 : la plus grosse mise à jour du jeu', tag: 'nouveau', featured: true,
        lead: 'Ta collection est gardée : cartes, pièces, boosters, succès, classeurs, rien ne s’est perdu. Et pour fêter ça : 🎁 50 boosters offerts à tout le monde.',
        points: [
          '💬 Chat : le salon de tout le monde et les messages privés. Tape @ et la première lettre d’un pseudo pour le citer : il reçoit une notification.',
          '🛒 Marché : vends une carte à prix fixe en pièces ou propose-la à l’échange, directement dans « Pour toi ». Achète celles des autres : le premier qui achète l’a.',
          '🤝 Échanges : sous chaque carte, qui l’a, qui la vend, qui la veut et son prix moyen. « Pour toi » prépare des échanges tout faits avec tes envies, en un toucher.',
          '🏆 Saisons : chaque mois, le classement des nouvelles cartes gagnées et des boosters pour tout le monde à la fin. La première se termine le 30 novembre.',
          '⏳ Booster du moment : une édition limitée, avec son compte à rebours en tête de la boutique.',
          '🪙 Boosters en pièces : achète-en autant que tu veux, toujours 250 pièces l’unité.',
          '🃏 Nouvelles cartes : plus de 3 000 cartes en plus, {CARTES} à collectionner.',
          '✨ Les 6★ : chacune a sa mise en scène, les 6★ Musique et d’animés jouent leur extrait, et presque toutes sont en pleine illustration.',
          '🎲 Jeux : Pack Battle, Battle Royale et la Roulette, avec sa roue, la rediffusion du tirage et un rappel 10 min avant.',
          '🎖️ Succès : en pastilles, « 2/7 » et ta progression ; un toucher montre ce qu’il te manque.',
          '📊 Classement : ta place, et ce qu’il te manque pour passer devant le joueur juste au-dessus.',
          '🔊 Son et ouverture : un son tout neuf, plus doux, et une déchirure du booster plus vraie.',
          '🔔 Notifications : réserve pleine, échanges, amis, chat. Sur iPhone, ajoute d’abord le jeu à l’écran d’accueil.',
          '🌍 English : le jeu passe en anglais tout seul si ton téléphone ou ton PC n’est pas en français (bouton FR | EN à côté du son).',
        ],
      },
      {
        // (v2.1.41) « Forge → vente » (idée de Hugo)
        date: '28 nov.', title: '🔥 Forge → vente : tes doublons voulus partent au marché en un toucher', tag: 'nouveau',
        points: [
          '🔥 Quand tu forges, si d’autres joueurs veulent certaines de tes cartes (envie de la carte, de son album ou de sa famille), la Forge te propose de les mettre en vente. Un toucher : elles partent au marché, le reste est forgé.',
          '🪙 Prix conseillé = 1,5× la valeur de Forge : 1★ 8 · 2★ 23 · 3★ 60 · 4★ 150 · 5★ 450 · 6★ 1 500 pièces. L’écran « Vendre » du marché part aussi de ce prix.',
          '🔔 Ceux qui veulent la carte reçoivent une notification : « … vend une carte que tu veux ». Une seule pour tout le lot.',
          '🛒 10 ventes ouvertes au plus : les cartes les plus chères passent d’abord. Une carte pas vendue reste en vente, tu peux la retirer quand tu veux.',
          'Pourquoi : forger se faisait en un toucher, vendre demandait plusieurs gestes. Maintenant, vendre à quelqu’un qui la veut est aussi simple.',
        ],
      },
      {
        // (v2.1.40) retrait des contrats, même date que la nouvelle économie
        date: '28 nov.', title: '📜 Fin des contrats le 1er décembre', tag: 'nouveau',
        points: [
          '📜 Le 1er décembre à minuit (heure de Paris), les contrats s’arrêtent. D’ici là, tu peux encore en signer.',
          '🔥 Ensuite, un doublon se forge contre des pièces, ou se vend et s’échange au marché.',
          '🎯 Missions : plus de mission « contrat ». Si ta mission de la semaine en demande, elle compte comme faite le 1er décembre : il ne te reste qu’à la récupérer.',
          '🎖️ Succès : les succès « contrat » déjà gagnés restent, avec leurs récompenses. Les autres disparaissent de la liste.',
          'Pourquoi : les contrats rapportaient plus que vendre ou échanger, alors plus personne ne vendait ni n’échangeait.',
        ],
      },
      {
        date: '28 nov.', title: '🪙 Nouvelle économie au 1er décembre', tag: 'nouveau',
        points: [
          '📅 Connexion quotidienne bien plus généreuse : jour 1 = 250 pièces (le prix d’un booster), +20 chaque jour, ×2 aux jours 7, 14 et 21, et le jour 30 = 2 000 pièces + 51 boosters. Un mois parfait rapporte 18 900 pièces au lieu de 7 050.',
          '🔥 Forge : chaque jour, les doublons forgés et les pièces d’ouverture des boosters rapportent 100 % jusqu’à 3 000 pièces, puis 50 % jusqu’à 10 000, puis 25 %. Tout repart à 100 % à minuit. L’écran Forge te dit ce qu’il te reste à plein rendement.',
          '🎲 Roulette, dès maintenant : une mise en cartes = 3 cartes 5★ (ou toujours 1 carte 6★, ou 1 500 pièces).',
          'Pourquoi : les plus gros ouvreurs gagnaient plus de 10 fois plus de pièces par jour que les autres. Se connecter chaque jour compte maintenant vraiment.',
        ],
      },
      {
        date: '27 nov.', title: 'Échanges en un toucher : ses envies d’abord', tag: 'amélioré',
        points: [
          '♥ « Demander » une carte à un joueur lui propose en priorité une carte qu’il cherche : celles de sa liste d’envies, et maintenant aussi celles des albums et familles qu’il veut en entier. Le message te le dit.',
          '🤝 Pareil dans « Pour toi », et quand on te demande une carte, « Choisir autre chose » te montre d’abord celles de tes albums voulus.',
        ],
      },
      {
        date: '27 nov.', title: 'Au téléphone, les boutons restent à leur place', tag: 'corrigé',
        points: [
          '👤 Profil d’un joueur : « Voir sa collection », « Proposer un échange », « Message » et « Ajouter en ami » se rangent sous son pseudo au lieu de déborder sur sa bannière (et sur ordinateur, son pseudo n’est plus coupé).',
          '📦 Récap d’ouverture : les boutons tiennent dans le panneau (« Forger ces doublons » sur toute la largeur) et la bulle du chat ne passe plus dessus.',
          '🔤 Avec une grande taille de texte sur le téléphone, les onglets des Échanges restent sur une ligne et le récap ne passe plus sous la barre du haut.',
        ],
      },
      {
        date: '27 nov.', title: 'Des badges en médaillons', tag: 'amélioré',
        points: [
          '🏅 Les badges du profil deviennent des médaillons dessinés (booster, coupe, livre, étoile, cadenas, flamme…), chacun avec sa teinte.',
        ],
      },
      {
        date: '27 nov.', title: 'Plus pratique partout : collection, marché, forge, amis', tag: 'amélioré',
        points: [
          '📚 Collection : une rangée « Presque finis » en tête des albums, avec ceux où il ne te manque que 1 à 3 cartes (« −2 » sur la pochette).',
          '📚 Dans un album, le fil thème › famille › album se touche pour remonter d’un coup. Au téléphone, les filtres se rangent derrière un bouton « Filtres ».',
          '🛒 Marché : chaque annonce te dit si tu as déjà la carte ou si elle est dans tes envies, et un filtre « Mes manquantes / Mes envies » les trie.',
          '👤 Touche un pseudo (vendeur au marché, chat, « chez les joueurs » sous une carte) pour ouvrir son profil. Un bouton « Message » sur les profils et tes amis ouvre la conversation privée.',
          '🏆 Classement : touche « tu es Xe » pour aller à ta ligne, et le filtre « Amis » ne garde que tes amis, avec leurs vrais rangs.',
          '🔥 Forge : « Forger ces doublons » depuis le récap d’ouverture (rien n’est brûlé sans ton OK), et une puce « Toutes les 4★ et moins ».',
          '📦 Réserve vide : le récap te montre comment regagner un booster tout de suite (missions, série, calendrier, achat en pièces).',
          '🎰 Roulette : « Même mise que la dernière fois » remet ton numéro et ton paiement en un toucher.',
          '🎁 Parrainage : « Partager » ouvre la feuille de partage de ton téléphone.',
          '🎄 Les ouvertures « Déchirure glacée » et « Étoile de Noël » du calendrier seront bien jouées une fois choisies.',
        ],
      },
      {
        date: '26 nov.', title: 'Collection chargée plus vite', tag: 'amélioré',
        points: [
          '⚡ Ta collection gardée sur cet appareil reste valable bien plus longtemps, même après une reconnexion : le jeu la recharge moins souvent en entier au démarrage.',
        ],
      },
      {
        date: '26 nov.', title: 'Collection et missions plus pratiques', tag: 'amélioré',
        points: [
          '🔎 Collection → Albums : la recherche fouille les 5 thèmes et les noms de cartes (« Goku » montre ses albums et ses cartes), rangés par thème.',
          '📖 « Voir l’album » sous une carte ouverte, et dans la vue Cartes le nom d’un album ouvre cet album.',
          '★ Épingle tes albums préférés (étoile sur la pochette) : ils restent en haut de la vue Albums, avec les 5 derniers ouverts. Gardé sur cet appareil.',
          '🎯 Missions : « Tout récupérer » réclame d’un coup les missions du jour, le bonus et celles de la semaine.',
          '› Au téléphone, la flèche de la barre d’onglets porte une pastille quand un onglet caché à droite en a une.',
        ],
      },
      {
        date: '26 nov.', title: 'Images de cartes et 6★ tout juste tirées', tag: 'corrigé',
        points: [
          '🖼️ Leo (Summoners War), Tinky Winky et la Coiffe Kitsou (Dofus) ont enfin leur image.',
          '✨ Une 6★ tout juste tirée pouvait rester affichée avec l’image d’attente dans la collection : elle montre maintenant sa vraie image. Les cartes déjà touchées se réparent toutes seules.',
        ],
      },
      {
        date: '26 nov.', title: 'God pack dans un ×5 ou un ×10', tag: 'corrigé',
        points: [
          '✦ Un God pack ouvert en ×5 ou en ×10 joue sa séquence « GOD PACK » juste avant ses cartes, à la fin du gros booster : elle pouvait se jouer plus tôt, sur des cartes ordinaires. Les cartes obtenues étaient déjà les bonnes.',
        ],
      },
      {
        date: '26 nov.', title: '🎄 L’onglet Événement ouvre le 1er décembre', tag: 'amélioré',
        points: [
          '🎁 L’onglet Événement, grisé jusque-là, s’ouvre tout seul le 1er décembre à minuit (heure de Paris), même si le jeu est déjà ouvert : la première case du calendrier de l’Avent t’attend.',
        ],
      },
      {
        date: '26 nov.', title: 'Lancement plus rapide après une mise à jour', tag: 'amélioré',
        points: [
          '⚡ Après une mise à jour, ta collection n’est plus rechargée en entier au lancement : le jeu repart de la copie gardée sur ton appareil.',
          '📊 Classement : ta ligne est recalculée dès que tu l’ouvres, celles des autres toutes les 10 minutes.',
        ],
      },
      {
        date: '26 nov.', title: 'Texte du Portefeuille corrigé', tag: 'corrigé',
        points: [
          '🪙 Le Portefeuille ne dit plus que les pièces ne s’échangent jamais contre des cartes : depuis le marché, c’est possible entre joueurs.',
        ],
      },
      {
        date: '26 nov.', title: 'Photos de profil visibles partout', tag: 'corrigé',
        points: [
          '🖼️ Une photo de profil importée ne s’affichait que sur la page profil. Elle apparaît maintenant aussi dans le classement, le chat, les amis, le marché et les jeux.',
        ],
      },
      {
        date: '26 nov.', title: 'Les 14 Merveilles du monde deviennent des 6★', tag: 'corrigé',
        points: [
          '🏛️ Les 14 Merveilles ne sont plus des cartes secrètes : ce sont des 6★ comme les autres, qui tombent du pack Monde et du Bebou Pack. Leur décor en 3D ne change pas.',
          '📚 Si tu en avais déjà une, elle est gardée et passe en 6★.',
        ],
      },
      {
        date: '26 nov.', title: 'Encore des 6★ en plein écran', tag: 'amélioré',
        points: [
          '🖼️ 26 cartes 6★ de plus passent en plein écran, centrées sur le visage (Ninho, « Libérée, délivrée »…).',
        ],
      },
      {
        date: '26 nov.', title: 'Des 5★ et 6★ en plein écran', tag: 'amélioré',
        points: [
          '🖼️ Environ 650 cartes 5★ et 6★ dont la photo est horizontale passent en plein écran, centrées sur le visage, au lieu d’être posées entières dans un cadre.',
        ],
      },
      {
        date: '26 nov.', title: 'Des 6★ mieux cadrées', tag: 'amélioré',
        points: [
          '🖼️ Les 6★ dont la photo est carrée (Diam’s…) passent en plein écran, centrées sur le visage, au lieu d’être posées entières dans un cadre.',
        ],
      },
      {
        date: '26 nov.', title: '🎄 Le calendrier de l’Avent', tag: 'nouveau',
        points: [
          '🎁 Nouvel onglet Événement : du 1er au 24 décembre, une case par jour. Une case oubliée se rattrape jusqu’au 31 décembre.',
          '📦 Au total : 95 boosters, 13 000 pièces et, le 24, un God Pack avec au moins une 6★.',
          '❄️ 9 cosmétiques de Noël à garder pour toujours : 3 cadres, 2 bannières, 2 animations de profil (neige, aurore boréale) et 2 ouvertures de booster.',
        ],
      },
      {
        date: '25 nov.', title: 'Fin de la saison 0 : les récompenses', tag: 'nouveau',
        points: [
          '🏆 La saison 0 se termine le 30 novembre : 1er un God pack, 2e 20 boosters, 3e 15 boosters, 4e à 10e 10 boosters, et 1 booster pour les autres dès une carte gagnée.',
          '🎖️ Le top 3 gagne le titre « Podium de la saison 0 » et le cadre « Podium de saison » ; tout joueur qui a ouvert au moins 100 boosters dans la saison gagne le titre « Participant de la saison 0 ».',
          '🤫 Pity 6★ : le compteur ne bouge plus avant que la 6★ soit révélée.',
        ],
      },
      {
        date: '26 nov.', title: 'Des illustrations pour plus de 350 cartes', tag: 'amélioré',
        points: [
          '🖼️ Plus de 350 cartes qui n’avaient pas d’image en ont une : Dofus, Wakfu, Genshin Impact, Summoners War, Fast & Furious, X-Men, esport…',
          '✨ Une centaine de visuels remplacés, surtout des 6★ : musique, foot, esport, animés.',
          '🗂️ Les départements et régions de France ont leur propre famille, séparée des pays.',
          '🎵 Nouvelles musiques en fond des 6★ : les génériques français de Code Lyoko, South Park, Yu-Gi-Oh! et Inazuma Eleven, Kaamelott, et les thèmes de Zelda et Crash Bandicoot.',
          '🎶 Plus de 100 extraits ajoutés aux 6★ Musique, et de la musique pour Suits, Bakuman, Fortnite, Dofus, Wakfu, Genshin Impact et les champions du monde 1998 et 2018.',
        ],
      },
      {
        date: '25 nov.', title: 'Le grand rangement : 848 nouvelles cartes', tag: 'nouveau',
        points: [
          '🆕 848 nouvelles cartes : Dofus et Wakfu, Genshin Impact, Summoners War, Studio Ghibli, catch, esport LoL et CS, paralympiques, X-Men, Élite, Fast & Furious…',
          '🗂️ Albums rangés autrement : le foot par poste (attaquants, milieux, défenseurs, gardiens, entraîneurs), les voitures par origine, un seul album Ghibli, Yu-Gi-Oh et Pays, régions & départements ; les Paralympiques ont leur propre famille ; « Chansons » devient « Singles ».',
          '⭐ Plus de 500 cartes changent d’étoiles (nouvelles 6★ : Roman Reigns, Nuguri, Canyon, m0NESY, NiKo, Chihiro, Totoro…).',
          '🔁 Les cartes en double (Hulk Hogan acteur et catch…) n’en font plus qu’une : tes exemplaires passent sur la carte gardée, rien n’est perdu.',
        ],
      },
      {
        date: '24 nov.', title: 'Musiques d’entrée, ondes en couleur', tag: 'amélioré',
        points: [
          '🎵 Ondes sonores en couleur : les graves au centre, les aigus sur les bords ; elles suivent la grosse caisse et scintillent sur les aigus.',
          '🤼 Chaque catcheur 6★ arrive sur sa musique d’entrée : The Undertaker, Stone Cold, The Rock, John Cena, Triple H…',
          '🏆 « Ramenez la coupe à la maison » pour Griezmann et Kanté, « RISE » pour le Championnat du monde de LoL, « Take Over » pour ShowMaker.',
          '🎮 Les 6★ League of Legends jouent la musique de la Faille de l’invocateur (saison 1), Palworld son thème.',
          '📺 Nouveaux openings : Assassination Classroom, Steins;Gate, Detective Conan, Doraemon, Mushoku Tensei, Seven Deadly Sins… Rambo, Aizen, et « Inferno » pour l’Éclipse de Berserk.',
          '🖼️ 42 cartes en pleine illustration : Perceval, le Joker recentrés, Rimuru, Subaru, Michonne, Thierry Henry, Randy Orton…',
        ],
      },
      {
        date: '23 nov.', title: 'Roulette resserrée, nouvelles 6★', tag: 'amélioré',
        points: [
          '🎲 Roulette : un seul numéro par tirage. La mise : 1 500 pièces, 2 cartes 5★ ou 1 carte 6★ (les 4★ ne se misent plus).',
          '🆕 Deux nouvelles 6★ : Rocket (Galactik Football) et Mount & Blade.',
          '⭐ Harvey Specter et Dwayne Johnson passent en 6★.',
          '🏀 Daiki Aomine joue « Misdirection » (Kuroko\'s Basket).',
          '🖼️ 43 cartes en pleine illustration : Rem, Rias Gremory, Obi-Wan Kenobi, Rick Grimes, Neymar, Céline Dion, Rayman 2…',
          '🗑️ La carte Antoine Daniel est retirée du jeu.',
        ],
      },
      {
        date: '20 nov.', title: 'Musiques des films et des jeux, nouvelles 6★', tag: 'amélioré',
        points: [
          '📺 Le prochain ajout de cartes arrive début décembre : les émissions télé, avec leurs candidats et présentateurs. Dis-nous lesquelles tu veux dans le mini-sondage.',
          '🎬 Les 6★ de films et de jeux vidéo jouent la musique de leur film ou de leur jeu : Star Wars, Harry Potter, Le Parrain, Rocky, Final Fantasy, The Last of Us, Minecraft, Halo… 86 en tout.',
          '🕵️ L Lawliet joue « L no Theme » (Death Note).',
          '⭐ Michael Scott, Suguru Getou, Haruka Nanase et Knight passent en 6★.',
          '🖼️ 36 cartes en pleine illustration, mieux cadrées : Kakashi, Sasuke, Sanji, L, le Joker, Dexter, Brimstone, Scooby-Doo…',
        ],
      },
      {
        date: '17 nov.', title: 'V3 : le jeu plus vivant sous le doigt', tag: 'amélioré',
        points: [
          '📖 Collection : touche une carte, elle s’envole jusqu’à la visionneuse et revient se poser à sa place quand tu fermes.',
          '👍 Effeuille tes classeurs : dans la visionneuse, glisse le pouce sur la tranche à droite pour passer les cartes ; ça freine sur les 5★ et 6★.',
          '🔄 Une carte de dos se retourne en la tirant au doigt vers la droite, autour de sa tranche.',
          '✂️ Déchirure : la soudure du booster résiste par crans, une fente de lumière s’ouvre ; lâche en route, le pli reste.',
          '🎵 Fin d’ouverture : tes pièces arrivent d’un coup, en musique, sur un compteur à rouleaux.',
          '🎲 Jeux : garde le doigt appuyé pour accélérer ×3,5, les cartes du duel se retournent, la bille de la roulette rebondit vraiment.',
          '⚖️ Échanges : une balance penche du côté le plus lourd, et un échange accepté est scellé.',
          '⚡ Plus fluide partout : roue des boosters, visionneuse, Forge, Atelier, marché, molette de la Collection, chat avec le clavier, notifications à balayer.',
        ],
      },
      {
        date: '17 nov.', title: 'Génériques des séries et nouvelles images 6★', tag: 'amélioré',
        points: [
          '📺 Les 6★ de séries jouent leur générique : Friends, Game of Thrones, Breaking Bad, Stranger Things, Les Soprano, Malcolm… 56 séries et films en tout.',
          '🦸 Marvel MCU : les 6★ jouent le thème des Avengers d’Alan Silvestri. Hellsing : « The World without Logos ».',
          '⭐ Aelita (Code Lyoko) et Palworld passent en 6★.',
          '🖼️ 27 cartes en pleine illustration, mieux cadrées : Alucard, Sukuna, Wolverine, Jett, Reyna, Killjoy, E.T.…',
          '🔥 Forge : tes doublons sont rangés par étoile (1★, 2★, 3★…) ; quand tu en avais beaucoup, seuls les 1★ s’affichaient. Rien n’était perdu.',
          '🛠️ Gros tirages : le bandeau ne montre plus certaines cartes en triple après un changement de menu.',
        ],
      },
      {
        date: '15 nov.', title: 'Musiques 6★, cartes et profil', tag: 'amélioré',
        points: [
          '🎵 Les musiques des 6★ tournent en boucle tant que tu restes sur la carte, et les chansons démarrent au refrain.',
          '🎶 Nouvelles musiques : GODS pour Faker, Zeus, Oner et Keria, Ranbu no Melody pour Bleach, See You Again pour Fast & Furious, Clubbed to Death pour Neo… et des reprises remplacées par l’original.',
          '⚔️ Demon Slayer : Tengen, Muichirou, Mitsuri, Gyoumei, Obanai et Sanemi passent en 6★.',
          '⚽ Inazuma Eleven : les noms de la version française (Mark Evans, Axel Blaze…).',
          '🎮 Gumayusi passe en 6★. Carlos Ruiz rejoint le baseball, et « Balde de Ubaldis », doublon de Marion Bartoli, est retirée.',
          '🖼️ 79 cartes en pleine illustration, et des visages mieux cadrés.',
          '👤 Profil plus aéré.',
        ],
      },
      {
        date: '15 nov.', title: 'Dessins animés : le générique des 6★', tag: 'nouveau',
        points: [
          '📺 Une 6★ de dessin animé (Marge Simpson, Bob l’éponge, Albator, Heidi, Grizzy…) joue maintenant le générique de son dessin animé, à l’ouverture comme dans la Collection : les 55, dans 49 dessins animés. En français quand le générique français existe, sinon l’original.',
        ],
      },
      {
        date: '15 nov.', title: 'Collection : choisis ton affichage', tag: 'amélioré',
        points: [
          '🔲 Cartes et albums : choisis la taille de la grille à côté de la recherche. Sur PC, 2 rangées de 6, 4 rangées de 8 ou 6 rangées de 10, toujours entières à l’écran. Sur téléphone, de plus en plus de cartes par rangée.',
          '↕️ Le défilement s’arrête toujours sur une rangée entière. Sur téléphone, la rangée se cale juste sous le haut de l’écran.',
        ],
      },
      {
        date: '15 nov.', title: 'Profil : construis ton univers', tag: 'nouveau',
        points: [
          '🎨 Personnaliser : un atelier plein écran, avec l’aperçu de ton profil en direct. Sur téléphone il reste collé en haut, sur PC il est à côté des choix.',
          '🖼️ 41 nouveautés : 13 fonds (certains animés), 13 cadres dessinés, 9 écritures pour ton titre et 6 vitrines. Ta couleur les teinte tous.',
          '🔗 Accords : un cadre et un fond de la même matière se répondent. Feu + Braise, Néon + Synthwave, Pixel + Damier… il y en a 10.',
          '🔒 Verrouillé ne veut plus dire caché : tu vois l’élément en vrai, ce qu’il faut faire et où tu en es. Touche-le pour l’essayer.',
          '🎖️ Succès : 49 paliers de plus (137 en tout), du très facile au très long, et une nouvelle échelle « Tous les thèmes ». Toutes les nouveautés s’y gagnent.',
          '💬 Ton cadre et ton titre s’affichent aussi dans le chat, chez tes amis et au classement.',
          '🪙 Pièces : pendant une ouverture, plus de « +N » à chaque booster. Elles arrivent toutes à la fin, une fois les cartes révélées, et remplissent le compteur.',
          '🚪 À ta prochaine visite, le jeu t’amène une fois sur « Personnaliser » pour te montrer tout ça. Tu refermes quand tu veux.',
        ],
      },
      {
        date: '14 nov.', title: 'v2.0.1 à v2.0.8 : les retouches de la sortie', tag: 'amélioré',
        points: [
          'Notifications : le jeu te propose de les activer à chaque connexion, et tous les types sont actifs par défaut (réglables dans ton profil).',
          'Échanges : dans « Choisir autre chose », tu peux demander n’importe quelle carte de l’autre joueur (filtres par étoile et recherche) ; hors de ses doublons, il valide.',
          'Envies : « Je veux l’album » (ou toute une famille) en un toucher, depuis l’album dans la Collection.',
          'Carte tirée : un bouton « Collection » vers son album, et où tu en es (15/235 · 2,4 %).',
          'Collection : sur ordinateur, 2 rangées de 6 cartes, un cran de molette = une rangée, et un bouton « Doublons ».',
          'Animations : elles sont toujours actives, même si ton appareil demande de les réduire (skins CS en 3D compris).',
          'Collection : le défilement s’arrête rangée par rangée, deux rangées entières toujours visibles sur ordinateur.',
          'Couleurs : une teinte par jeu, des barres de classement colorées, et les succès colorés selon leur avancement.',
          'Jeux : une règle graduée bien visible pour les scores du Pack Battle et du Battle Royale, sans effet de lumière à la fin.',
          'Grosses collections : au-delà de 8 000 cartes différentes, la collection et le profil s’affichent de nouveau.',
          'Cartes 5★ : le cadre « Suisse » est de retour sur les 5★ à photo horizontale.',
          'Battle Royale : sur ordinateur, les cartes s’affichent en grand sur toute la largeur.',
          'Collection : les 5★ et 6★ ne sont plus floues dans la grille.',
          'Extraits : un curseur de volume dans l’étiquette du morceau, retenu sur ton appareil.',
          'Visionneuse : « Rejouer » en haut, les boutons rangés sous la carte, et ils s’effacent quand tu zoomes.',
          'Collection : la barre des filtres reste collée en haut quand tu descends.',
          'Chat général : seulement les messages, les drops restent dans Gros tirages.',
          'Images : 95 cartes 6★ de plus en pleine illustration.',
          'Anglais : l’heure des gros tirages et quelques onglets s’affichaient mal, c’est réglé.',
        ],
      },
      {
        date: '13 nov.', title: 'Corrections : Star Wars et The Mandalorian, Oner et ShowMaker, nouvelles images', tag: 'corrigé',
        points: [
          'Star Wars et The Mandalorian : Grogu, le Mandalorien, Cobb Vanth et Koska Reeves rejoignent l’album The Mandalorian.',
          'Oner et ShowMaker passent 6★.',
          'Nouvelles images : Iron Man recadré, 15 cartes The Walking Dead, Will Smith, Captain America, Soldat de l’Hiver, Scarlet Witch, Joey Tribbiani, Jeff Tuche, Rex, Ben 10, ZywOo, Oner, ShowMaker, Dembélé, Fernando Alonso, Ballon d’Or, LaLiga, Zelda, Alan Wake II, PNL, Idol et d’autres.',
        ],
      },
      {
        date: '12 nov.', title: 'Plus de 6★ en pleine illustration, nouvelles images et vrais taux des boosters', tag: 'amélioré',
        points: [
          'Pleine illustration : 208 cartes 6★ dont la photo était posée en bande passent en plein cadre (photos recadrées sur le visage ; pochettes, voitures et groupes gardés en entier sur un fond tiré de l’image).',
          'Nouvelles images pour 77 cartes : Gojo, Kaneki, Aizen, Byakuya, Lelouch, Minato, Shikamaru, Mulan, Neo, John Wick, Indiana Jones, Louis de Funès, François Pignon, Pierre Brochant, Perceval, Arthur (Kaamelott), Kanye West, Orelsan, Stevie Wonder, One Direction, Thomas Müller, Gerrard, Kanté, Neuer, s1mple, apEX, Keria, Neon, Tracer, Séphiroth, Heineken, la Nissan GT-R, la Skyline R34…',
          'Norman fait des vidéos est retiré du jeu.',
          'Fiche booster : les vrais taux. Les pourcentages par carte tombent juste (100 % au total), le god pack et la pity sont comptés (6★ : 1 booster sur 38,6), la chance de chaque carte aussi, et le World Pack affiche la chance de ses Merveilles secrètes.',
          'Le nombre de cartes affiché suit le vrai catalogue : {CARTES} cartes à collectionner (les Bébous verrouillées ne sont plus comptées).',
          'Extraits : American Idiot joue enfin American Idiot (c’était 21 Guns), Pump It et Bande organisée le bon morceau, et Francis Poulenc a le sien. 20 chansons ont aussi le bon artiste imprimé (Bad → Michael Jackson, Someone Like You → Adele…).',
        ],
      },
      {
        date: '12 nov.', title: 'Les nouvelles 6★ Musique ont leur extrait', tag: 'nouveau',
        points: [
          'Les chansons, artistes et albums passés en 6★ jouent maintenant leur extrait de 30 s quand on les tire et dans la visionneuse.',
        ],
      },
      {
        date: '11 nov.', title: 'Pop Culture et Sport : 3 024 nouvelles cartes', tag: 'nouveau',
        points: [
          'Animés : 1 843 nouveaux personnages dans les séries déjà présentes (Toji Fushiguro, Himiko Toga, Bokuto, Akaza, Escanor, Echidna, Dabi…), de 1★ à 4★.',
          'Musique : 1 136 nouvelles chansons des artistes déjà dans le jeu, de 1★ à 4★.',
          'Sport : 45 joueurs de Ligue 1 (Kvaratskhelia, Désiré Doué, João Neves, Lucas Hernandez…).',
          'Les 5★ et 6★ ne changent pas : la collection est juste plus fournie.',
        ],
      },
      {
        date: '11 nov.', title: 'Échanges repensés, booster du moment et saisons', tag: 'nouveau',
        points: [
          'Échanges : sous chaque carte, qui l’a, qui la vend et qui la veut. « Pour toi » prépare des échanges tout faits avec tes envies : on demande en un toucher, l’autre accepte, choisit une autre carte ou refuse. Ton bouton « Protéger » garde une carte hors des propositions.',
          'Booster du moment : un booster en édition limitée, avec son compte à rebours en tête de la boutique.',
          'Saisons : chaque mois, un classement des nouvelles cartes gagnées, des boosters pour tout le monde à la fin, un cadre et un titre pour le podium.',
          'Animations d’ouverture à gagner : la brûlure (succès Braise) et l’éventail (succès Cartographe), à choisir dans la fiche d’un booster.',
          'Aussi : les cartes que tu n’as pas montrent leur illustration floutée, les gants et un sticker CS 6★ en 3D, des apôtres dans l’Éclipse, de nouveaux sons pour les 6★, une collection plus rapide à mettre à jour.',
        ],
      },
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
          '{CARTES} cartes à collectionner dans 4 thèmes — Gaming, Pop Culture, Sport et World — plus des cartes secrètes.',
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
