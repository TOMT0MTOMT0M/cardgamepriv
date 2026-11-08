# Idées pour la V2

Liste des idées validées ou à discuter pour le prochain patch groupé. Tout se développe sur le circuit V2 (lien
admin, base Convex séparée) et sort en une fois vers la prod.

---

## 0. Fait sur la branche v2 (08/11) — casino « pro » + tout ce qui change de taille s'anime

- **Espace Jeux en « casino noir »** (`src/game/casino.css`, `views/games.ts`) : grand titre, solde en jeton qui
  ROULE quand il change, onglets dont la pastille glisse ; accueil en trois tables (dessins au trait, lumière qui suit
  la souris, filet qui s'allume, flèche) ; panneaux laqués ; jetons de booster monochromes ; dos des petites cartes en
  acier brossé avec « B » gravé.
- **Pack Battle** : barre de rapport de force entre les deux joueurs (flash couleur de rareté à partir de 5★), totaux
  qui roulent, cartes du centre qui arrivent avec élan + reflet, rayons fins derrière les 5★/6★, suspense (salle qui
  s'assombrit, battement), guirlande de lumière qui court autour du gagnant, verdict en grand titre.
- **Battle Royale** : rang #1…#8, le classement se réordonne en GLISSANT, trait lumineux sur le meneur.
- **Roulette** : jetons posés sur les cases, bille qui ralentit en continu et s'arrête pile sur le numéro (deux tours),
  traîne, puis grosse bille du résultat par-dessus la table. Le tout premier tirage s'anime aussi.
- **Partout dans l'appli** (`src/core/morph.ts`, `src/game/panneaux.css`) : un bloc qui change de hauteur se
  déplie / se replie au lieu de sauter (panneaux de l'en-tête, panneaux des jeux, contrats…) ; les panneaux de l'en-tête
  s'ouvrent en rideau avec leur contenu en cascade ; les fenêtres (sélecteur de cartes, tableau d'échanges) montent et
  REDESCENDENT avant de disparaître ; tous les contrôles segmentés ont une pastille qui glisse.
- Mouvement réduit / « Effets réduits » : rien ne tourne en boucle, les dépliages sont instantanés.
- **Puis (08/11, 2e passe) : direction « usinage »** — fini la laque et les typos rondes : filets au pixel, repères
  d'angle (qui s'allongent au survol et sur le gagnant), coins droits (3 px), trame de points, règle graduée sous le titre,
  étiquettes techniques en capitales espacées, Bold Frame pour les titres (plus de Matcha dans l'espace Jeux), Inter pour
  les textes longs, plus aucun emblème (⚔ ♛ ◎ retirés). Jetons et bille en acier tourné, numéro gravé.
  UX : fil d'Ariane « Jeux / 03 Roulette », fiches techniques des 3 jeux (joueurs · mise · gain), enjeu en fiche
  Enjeu / Victoire / Défaite / Égalité, compteur de boosters « 1/10 », mise de la roulette en 3 étapes, compte à
  rebours 06:48:44, jauge de couverture graduée (36 crans), barre « Miser » collante au téléphone.
- **Puis (08/11, 3e passe) : dessins « courant »** (`views/gridArt.ts`) — les trois dessins de l'accueil sont des
  circuits posés SUR les points de la trame de fond (au pixel près, recalés au redimensionnement). Un courant épais et
  visqueux les trace (tête en goutte, coulée qui fusionne aux angles via un filtre gluant sur ordinateur, soudures qui
  s'allument), puis une impulsion repasse de temps en temps ; au survol, le circuit s'emballe. Ordinateur : platine en
  haut de la carte, texte dessous ; téléphone : fragment dans le coin, sans filtre, impulsions plus rares. Rien ne tourne
  quand la carte est hors écran ou l'onglet caché ; mouvement réduit = circuit immobile déjà tracé.

---

## 1. Notifications comme une vraie appli (téléphone et PC) — à faire

**Le principe.** Le jeu a déjà un manifeste d'appli (`public/manifest.webmanifest` : nom « Bébou », icônes, plein
écran). Il manque le « service worker » (le fichier qui reçoit les notifications même jeu fermé) et l'envoi côté
serveur. Notifications Web Push : gratuites, sans service tiers.

**Selon l'appareil**
- Android : directement depuis Chrome, même sans ajout à l'écran d'accueil.
- iPhone (iOS 16.4+) : seulement si le jeu est ajouté à l'écran d'accueil (Safari → Partager → « Sur l'écran
  d'accueil »). Prévoir un petit guide en 2 étapes dans le jeu.
- PC : Chrome, Edge, Firefox.

**Côté joueur**
- Bouton « Activer les notifications » (une seule demande d'autorisation), puis réglages : chaque joueur coche ce
  qu'il veut recevoir.
- Un toucher sur la notification ouvre directement la bonne page du jeu (échange, amis, boutique…).

**Ce qu'on notifie**
- Réserve de boosters pleine (15/15) : le serveur calcule l'heure exacte où la réserve sera pleine et envoie à ce
  moment-là (à reprogrammer à chaque ouverture / gain de boosters).
- Échanges : nouvelle proposition, contre-proposition, échange accepté.
- Amis : demande reçue, demande acceptée.
- Parrainage : le filleul a ouvert ses 10 boosters → +10 boosters pour le parrain.
- Jeux : tirage de la roulette (10 h / 20 h), défi Pack Battle reçu.
- Calendrier : rappel avant de perdre sa série de connexion.
- Annonces de l'équipe : nouveau patch, événement.

**Technique (pour la session de dev)**
- Service worker (`public/sw.js`) : réception, affichage, clic → ouverture de la bonne page.
- Clés VAPID (gratuites) posées sur Convex par un lanceur (`npx convex env set …`), jamais dans le code.
- Table Convex des abonnements (un par appareil, lié au joueur ; nettoyage des abonnements expirés).
- Action Convex d'envoi (runtime Node, bibliothèque web-push), branchée sur les événements ci-dessus ;
  programmation de la « réserve pleine » avec `ctx.scheduler.runAt`.
- Garde-fous : pas de notification la nuit (ex. 23 h – 8 h), regroupement si plusieurs événements d'un coup.
- Tests sur un vrai iPhone et un vrai Android (Tom et Hugo) via le lien admin V2 avant la sortie.
- Estimation : environ une demi-journée + tests.

---

## 1 bis. Bulles de notification animées (dans le jeu) — à faire

**Demande de Tom (07/11)** : TOUTES les pastilles de notification (bulles en haut à droite des boutons) apparaissent
en bulle qui grandit de façon fluide, bien placée sur le bon axe, et quand elle disparaît elle EXPLOSE comme une
bulle de savon, un peu cartoon. Transitions, timings et courbes (ease) soignés.

**État actuel (inventaire du 07/11)**
- Pastilles existantes : Échanges (`.badge`), Succès (`.ach-badge`), Amis (`.am-badge`), Suggestions (`.sg-badge`
  et `.mm-sg` dans le menu), Missions (`.msn-n`), Portefeuille (`.w-dot`), Profil (`.u-dot`), nouvelles cartes de la
  Collection (`.fresh-badge`).
- Animation actuelle : un seul `@keyframes badge-in` (grossit depuis 0, 0,45 s) ; la disparition est un simple
  `hidden` → la bulle s'efface d'un coup. Chaque pastille a son propre style.

**Spec de l'animation (un seul composant pour toutes les bulles)**
- Placement : ancrée sur le coin haut-droit du bouton / de l'icône, centrée sur ce coin (même décalage partout,
  jeton CSS unique), `transform-origin` au centre de la bulle → elle grandit sur place, sans pousser la mise en page
  (position absolue). Sur téléphone : vérifier la barre de navigation du bas et les zones de sécurité.
- Apparition (≈ 420 ms) : échelle 0 → 1 avec un léger dépassement (≈ 1,1 puis 1), petit écrasement cartoon au
  rebond (scaleX 1,08 / scaleY 0,92 vers 60 %), opacité 0 → 1 sur les 120 premières ms.
  Courbe de départ proposée : `cubic-bezier(0.34, 1.56, 0.64, 1)` ; à régler à l'œil.
- Changement de nombre (2 → 3) : petit « bump » 1 → 1,18 → 1 (≈ 220 ms) et le chiffre roule vers le haut.
- Disparition = bulle de savon qui éclate (≈ 350 ms au total) :
  1. elle gonfle un instant (1 → 1,25 en ≈ 90 ms, ease-out) avec un reflet brillant qui traverse ;
  2. « pop » : la bulle disparaît d'un coup (≈ 60 ms) ;
  3. 6 à 8 gouttelettes partent en étoile (10 à 16 px, ease-out, ≈ 260 ms, fondu) + un anneau fin qui s'élargit
     (×2, ≈ 220 ms) — le tout dans la couleur de la bulle.
- Plusieurs bulles en même temps : léger décalage (≈ 60 ms) pour ne pas tout faire éclater pile ensemble.
- « Effets réduits » et `prefers-reduced-motion` : simple fondu (≈ 150 ms), pas de gouttelettes.
- Son (optionnel) : tout petit « pop » à l'éclatement, au volume des effets du jeu, coupé si le son est coupé.
- Technique : un module unique (ex. `src/game/bubble.ts`) — `bubble(el).set(n)` / `.dot()` / `.clear()` —
  animé en Web Animations API (pas de reflow), gouttelettes en `span` temporaires supprimées à la fin.
  Remplace toutes les pastilles listées ci-dessus, qui gardent leurs couleurs actuelles (rose, or…).

**Bulles à AJOUTER (oubliées aujourd'hui)**
- Jeux : défi Pack Battle reçu, place libre dans une Battle Royale, résultat d'une partie, tirage de la roulette
  (10 h / 20 h) et gain à récupérer.
- Boutique : réserve de boosters pleine (15/15), boosters scellés pas encore ouverts, cadeau à récupérer.
- Connexion / calendrier : cadeau du jour pas encore récupéré, série en danger.
- Missions : mission terminée à récupérer (vérifier que la pastille actuelle couvre bien ce cas).
- Contrats (dans Collection) : contrat reçu / signé / terminé.
- Amis : parrainage payé (+10 boosters), filleul inscrit.
- Mises à jour : nouveau patch pas encore lu.
- Classement : changement de place notable (entrée dans le top, dépassé par un ami) — à discuter, peut faire bruit.

**Lien avec les notifications push (section 1)** : quand le jeu est ouvert, un événement arrive en bulle animée
plutôt qu'en notification système ; jeu fermé, notification système, et la bulle est là au retour. Mêmes réglages
par type pour les deux.

---

## 1 ter. Gros cache au premier lancement → démarrage et navigation plus rapides — à faire

**Demande de Tom (07/11)** : au premier chargement, télécharger sur le téléphone un maximum de choses pour que les
démarrages suivants (et tout le reste) soient plus rapides.

**Ce qui existe déjà (07/11)**
- Fichiers JS / CSS du build : cache navigateur 1 an (`_headers`, noms avec empreinte).
- Illustrations (`/art/*`, servies depuis R2 par `functions/art/`) : 1 semaine + revalidation en arrière-plan ;
  1 an quand l'adresse est versionnée (`?v=`).
- Cartes 2D déjà peintes (`bebou-cartes-v10`), plis et nom moulé des sachets : Cache Storage.
- MAIS pas de service worker : le cache HTTP du téléphone peut être vidé à tout moment (surtout iPhone), et chaque
  démarrage repasse par le réseau (page, catalogue ~700 Ko, etc.).

**Ce qu'on ferait (même service worker que les notifications, section 1)**
- Au premier lancement, en arrière-plan, sans bloquer le jeu :
  1. « Socle » (quelques Mo, tout de suite) : page du jeu, JS, CSS, polices, catalogue, sons, effets → le démarrage
     suivant se fait SANS réseau, même hors connexion (écran « pas de réseau » propre au lieu d'une page blanche).
  2. Illustrations des cartes possédées + celles des boosters les plus ouverts, petit à petit quand le téléphone est
     au repos.
  3. Lourd en option : modèles 3D des Merveilles (~20 Mo), effets (~6 Mo) — seulement quand c'est utile, ou via un
     bouton « Tout télécharger pour jouer hors connexion (X Mo) » dans les réglages.
- Pas les 37 088 cartes d'un coup : ~15–25 Ko la miniature → 600–900 Mo, trop pour un téléphone.
- Mises à jour : à chaque patch, le service worker ne retélécharge QUE les fichiers qui ont changé (noms avec
  empreinte) puis propose « mise à jour disponible, recharge » (cf. circuit V2) — les patchs deviennent légers.
- `navigator.storage.persist()` pour demander que le navigateur ne vide pas ce cache.

**Limites à connaître**
- iPhone : Safari peut effacer les données d'un site non utilisé pendant ~7 jours ; une appli ajoutée à l'écran
  d'accueil est bien mieux protégée → encore une raison de pousser l'ajout à l'écran d'accueil.
- Données mobiles : télécharger le gros seulement en arrière-plan et par petits morceaux (pas de détection fiable du
  Wi-Fi sur iPhone) ; le socle reste petit.
- La compilation des shaders 3D ne se met pas en cache côté jeu (le navigateur garde déjà les siens) : le
  préchauffage actuel reste nécessaire.
- AVANT de coder : mesurer avec le rapport de chargement existant (diag, « jalons du démarrage ») ce qui coûte
  vraiment au démarrage sur téléphone (réseau ? 3D ? peinture des cartes ?) pour viser juste.

---

## 1 quater. Audit UI/UX complet, dans tous les détails — à faire

**Demande de Tom (07/11)** : auditer TOUS les détails de l'interface et de l'expérience, en s'appuyant sur des
recherches (règles de base puis avancées), vérifier qu'on ne brise aucune règle absolue / importante, et en tirer des
conseils — pour MONTER le niveau, pas dénaturer le jeu (DA noir et blanc futuriste, texte sans cadre, couleurs
réservées à l'information, motion déjà défini dans le papier « dopamine / animations » du 04/11).

**Méthode (pour la session)**
1. Recherches d'abord, sources citées : règles de base (Nielsen, lois de l'UX — Fitts, Hick, Jakob, Miller,
   Doherty…, Gestalt), accessibilité WCAG 2.2 AA (contrastes, tailles de cible ≥ 44 px, focus, lecteurs d'écran,
   mouvement réduit), règles des plateformes (Apple HIG, Material 3 : zones de pouce, barres, gestes, zones de
   sécurité), puis avancé : jeux mobiles et gacha / collection (boucles de récompense, attente, anticipation, retour
   haptique et sonore, clarté des chances), micro-interactions, typographie et hiérarchie, états vides / chargement /
   erreur, onboarding, éthique (pas de schémas trompeurs, chances et dépenses toujours claires).
2. Repartir de l'audit du 03/11 (« audit-03-11-ui-ux-perf-mobile », documents du projet) : ce qui est réglé, ce qui
   reste.
3. Passer CHAQUE écran et chaque état, sur téléphone ET PC : boutique / ouverture, collection et visionneuse, forge et
   contrats, échanges et tableau d'offres, jeux, classement, succès, amis / parrainage, profil, menus, missions,
   connexion, portefeuille, réglages, tutoriel, erreurs, premier lancement, compte à rebours. Captures à l'appui.
4. Classer les constats : 🔴 règle absolue brisée (bloquant, accessibilité, perte de données / d'argent du jeu,
   confusion grave) · 🟠 importante · 🟡 finition. Pour chacun : la règle, où ça casse, la correction proposée,
   l'effort — et pourquoi elle respecte la DA.
5. Rendu : un rapport lisible (documents du projet) + une liste de corrections priorisées à faire sur le circuit V2,
   validées par Tom et Hugo avant d'être codées.

---

## 1 quinquies. Tuiles des cartes manquantes : silhouette floutée — idée (déjà prototypée)

**Demande de Tom (07/11)**, capture de la fiche booster (section YouTube) à l'appui :
- les cartes pas encore trouvées s'affichent en carrés gris vides (illustration en aplat noir à 35 %) ;
- le numéro de catalogue (16 795…) prend de la place pour rien ;
- la chance « 1 / 62 320 » recouvre le nom, illisible.

**Ce qu'on veut** : pour une carte non débloquée, sa propre illustration floutée, assombrie (un peu désaturée), avec
un petit cadenas ; plus de numéro de catalogue sur les tuiles ; la chance sur sa propre ligne sous le nom. Les
secrètes gardent leur « ? ». Concerne `cardTile` (src/game/ui.ts), donc toutes les grilles (collection, fiche
booster, échanges…).

**Prototype prêt** : commit `cbedd9a` (puis retiré, pour garder ça en idée) — `git cherry-pick cbedd9a` pour le
reprendre. Rendu vérifié sur PC en démo : flou 5 px, luminosité 0,42, saturation 0,55, cadenas 24 % de la tuile.

---

## 2. Abonnement « soutien » à 2 €/mois — mis de côté (07/11), à rediscuter

Idée : aider à payer serveurs, abonnement Claude et temps passé. Avantages envisagés : réserve à 20 boosters au lieu
de 15, recharge plus rapide, badge « soutien » ; paiement PayPal (abonnement mensuel, résiliable depuis PayPal).
Points relevés :
- Frais PayPal en France ≈ 2,90 % + commission fixe (≈ 0,35 €) : environ 20 % d'un paiement de 2 €, il reste
  ≈ 1,60 € par abonné et par mois. Alternative : Stripe (Apple Pay / Google Pay, part fixe plus faible).
- Revenus à déclarer (statut freelance de Tom), petite page de conditions de vente et lien de résiliation.
- Équité entre potes : privilégier des avantages de confort et cosmétiques.
- Il faudrait : compte PayPal Professionnel, Client ID / Secret (le Secret posé par Tom sur le serveur), liste
  définitive des avantages et du prix.
