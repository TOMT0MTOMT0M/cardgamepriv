# V2 « zéro friction » — mesures, plan, lots (09/11/2026)

Objectif : le ressenti d'un TCG mobile natif dans le navigateur (téléphone d'abord), **sans hausse de coût** (Convex,
R2, Pages). Branche `v2` uniquement. Ce document est tenu à jour lot par lot : mesures avant / après, ce qui est fait,
ce qui est écarté et pourquoi.

## 1. Comment c'est mesuré (et ce que ça ne mesure pas)

Banc : `scripts/mesure/` (`serve.mjs` + `mesure.py`), Chrome piloté par Playwright sur un build **démo** (sans Convex),
images `/art/` relayées depuis le lien V2.

- **Téléphone simulé** : 390×844, DPR 2, CPU ×4, 4G (9 Mbit/s ↓, 1,5 Mbit/s ↑, 85 ms). **PC** : 1440×900, sans bride.
- Mesuré : temps jusqu'à l'interactivité (froid / chaud), requêtes et Ko transférés, tâches longues, temps par image
  (p50 / p90 / max, images > 25 ms) par écran, délai toucher → première image modifiée, tas JS, mémoire GPU déclarée
  par three.js.
- **Limite importante** : la machine de mesure n'a **pas de carte graphique** ; WebGPU y tourne en logiciel
  (SwiftShader). Toute image qui contient de la 3D y prend 0,5 à 4 s. Les temps par image des écrans 3D (boutique,
  ouverture, vue détail) sont donc **inutilisables en valeur absolue** et trop bruités pour comparer deux lots. Ils
  sont donnés pour mémoire. Les vraies valeurs 3D viennent du rapport intégré au jeu (`?diag`, `game/diag.ts`) sur les
  téléphones de Tom et Hugo : c'est la première ligne de la liste « à vérifier » en bas.
- Fiables ici : réseau, poids, cache, tâches longues hors 3D, écrans DOM (collection, échanges, jeux), Convex (lecture
  du code + tests).

## 2. Base (commit `c0257f6`, avant tout changement)

### Démarrage

| | Téléphone simulé | PC |
|---|---|---|
| Interactif à froid (GPU logiciel) | 15,2 s | 14,4 s |
| Interactif à chaud (GPU logiciel) | 19,1 s | 22,3 s |
| Requêtes / poids à froid | 61 · 1 487 Ko (gzip) | 66 · 1 536 Ko |
| Requêtes réseau à chaud | page + ~25 revalidations · 149 Ko | 116 Ko |
| Tâches longues au démarrage | 25 · 9,0 s (pire 3,2 s) | 20 · 7,0 s |
| Tas JS (boutique) / GPU déclaré | 43 Mo / 80 Mo | 91 Mo / 125 Mo |

Le « chaud » plus lent que le « froid » montre le bruit du GPU logiciel : le démarrage est dominé par la création des
pipelines 3D, pas par le réseau. Référence réelle (rapports `?diag` du 07/11) : boutique à 4,1 s (Samsung), 11,9 s
(Chrome Android 4 Go), dont une image de 5 s de création de pipelines.

Poids du chemin critique (build v2, brotli) : **1,16 Mo**, dont catalogue 608 Ko (52 %), three.js 199 Ko, jeu 58 Ko,
CSS 45 Ko, polices 102 Ko. `catalogBig` (480 Ko) n'est pas préchargé par le HTML : il part **après** l'analyse de tout
le reste.

### Écrans (temps par image, ms)

| Écran | Téléphone p50 / p90 / max | PC p50 / p90 / max | Note |
|---|---|---|---|
| Collection, défilement | 16,7 / 16,8 / 117 | 33 / 83 / 433 | DOM, fiable (le PC paie le GPU logiciel en fond) |
| Transition → Échanges | 16,7 / 50 / 150 | 16,7 / 33 / 83 | DOM, fiable |
| Transition → Jeux | 50 / 133 / 1 267 | 50 / 200 / 317 | 1re visite : tâche de 1,4 s (téléphone) |
| Transition → Collection (1re) | 16,7 / 683 / 1 600 | — | 21 tâches longues, 7,5 s cumulés (peinture des 60 cartes) |
| Boutique, vue détail, ouverture | 800 – 6 500 | 1 000 – 4 600 | GPU logiciel : non significatif |

### Toucher → première image modifiée

| Geste | Téléphone | PC |
|---|---|---|
| Boutique → Collection (1re visite) | 2 246 ms | 2 909 ms |
| → Jeux (1re visite) | 1 415 ms | 25 ms |
| → Échanges | 36 ms | 48 ms |
| Tuile → vue détail | 136 ms | 62 ms |
| → Boutique (retour à la 3D) | 605 ms | 616 ms |

### Convex — session type (lecture du code, 10 joueurs en ligne, 30 min, 10 boosters)

≈ **8 700 appels** de fonctions (7 900 ré-exécutions de requêtes, 810 mutations dont 510 battements de cœur),
≈ 125 Mo lus en base, ≈ 3,7 Mo descendants par joueur. Postes : `users.friends` (lit toute la table `users`, relancé
chez tout le monde à chaque écriture sur n'importe quel joueur), `friends.mine`, `myCollection` (toute la collection
renvoyée à chaque booster), `feed.bigPulls` (400 lignes lues puis filtrées), cron `markLeader` (relit tous les
inventaires toutes les heures, ≈ 230 Mo/jour même sans joueur). 12 abonnements permanents, aucun coupé onglet caché.

## 3. Constats classés (gain ressenti / effort)

Issus de quatre audits (rendu, chargement, navigation, Convex) recoupés avec ceux du 06/11. Déjà fait avant cette
mission et non refait : catalogue en deux temps + `JSON.parse`, polices préchargées, `404.html`, `version.json`,
adresses d'images versionnées immuables, cartes peintes en Cache Storage, post-traitement à la demande, bloom ¼,
une image sur deux au repos, `backdrop-filter` coupés sur téléphone, battement qui n'écrit plus que toutes les 4 min.

| # | Constat | Gain | Effort | Lot |
|---|---|---|---|---|
| 1 | Pas de cache applicatif : le service worker ne fait que les notifications, absent de Safari iOS en onglet | démarrage sans réseau, résiste à l'éviction, hors ligne | M | 1 |
| 2 | `catalogBig` téléchargé en série après tout le JS | −1 aller-retour + 480 Ko en parallèle | XS | 1 (mesuré sans gain : annulé) |
| 3 | Retour de la vue détail : la grille des 60 tuiles est entièrement refaite | plus de clignotement | S | 2 |
| 4 | Pages téléchargées 3 s après la boutique seulement | plus d'attente au 1er toucher | XS | 2 |
| 5 | Miniature des tuiles sans fondu ; vue détail vide pendant le chargement | plus d'apparition brutale | S | 2 |
| 6 | Préchauffage des shaders qui rate les vraies cartes (`rimK` constante → shader différent en pleine illustration) | plus de gel à la 1re révélation de chaque rareté | S | 3 |
| 7 | La définition 3D ne remonte jamais sur un écran 60 Hz (seuil 15 ms < 16,7 ms) | netteté retrouvée après un passage chargé | S | 3 |
| 8 | Boucles permanentes au repos (diag, fil des gros tirages avec mise en page forcée) | fil principal au repos, moins de chauffe | S | 3 |
| 9 | `backdrop-filter` restants sur téléphone au-dessus de la 3D | images plus régulières en vue détail | XS | 3 |
| 10 | Battement de cœur appelé toutes les 35 s pour une écriture toutes les 4 min | −35 appels / joueur / 30 min | XS | 4 |
| 11 | `feed.bigPulls` lit 400 lignes ; `markLeader` toutes les heures | −9 Mo / 30 min, −220 Mo/jour | S | 4 (`bigPulls`) ; `markLeader` : décision |
| 12 | Abonnements ouverts onglet caché | appels en moins, radio au repos | S | à faire |
| 13 | Présence + annuaire dans `users` (`users.friends` relancé partout) | −4 000 appels, −50 Mo / 30 min | M, migration | à faire |
| 14 | `myCollection` re-poussée à chaque booster | −45 Mo lus, −1,8 Mo / joueur | M, migration | à faire |
| 15 | Élément partagé tuile → carte 3D ; historique dans la sous-navigation de la collection ; défilement restauré | continuité « native » | M–L, visuel | à faire |
| 16 | Changement de définition 3D en pleine révélation ; textures des sachets envoyées d'un bloc | à-coups en moins | M | à faire |
| 17 | KTX2 / AVIF, détourage hors fil principal | à mesurer sur vrai téléphone d'abord | L | écarté pour l'instant |

## 4. Lots livrés (un commit par lot, sur `v2`)

### Lot 1 — le jeu s'installe sur l'appareil (`ed6f2ef`, `1848d93`)

- `vite.config.ts` écrit **`/precache.json`** : chaque fichier du jeu, sa taille, son palier. Rien du labo, rien de la
  démo. Les fichiers de `/assets/` ont une empreinte dans leur nom : un patch ne fait reprendre que ceux qui changent.
- `public/sw.js` (le même service worker que les notifications, push inchangé) sert d'abord depuis Cache Storage :
  `/assets/*`, les médias du manifeste, et les images `/art/*?v=` (gardées à l'usage, 1 800 au plus ≈ 25 Mo). La page
  `/jeu/` reste **réseau d'abord** (3 s), copie locale en repli : un patch est vu tout de suite, et le jeu s'ouvre
  hors connexion. `version.json`, `precache.json`, le labo et les requêtes partielles ne sont jamais touchés.
- `src/game/bundle.ts` installe en tâche de fond (4,5 s après la boutique, jamais pendant une ouverture ni onglet
  caché) : différentiel, reprise automatique (seulement ce qui manque), `navigator.storage.persist()`, arrêt
  silencieux si le stockage est refusé ou plein, socle seul en économie de données, pas de médias lourds s'il reste
  moins de 40 Mo. Le service worker est maintenant posé sur tous les navigateurs (avant : seulement ceux qui ont le
  push, donc pas Safari iOS en onglet).
- Écran de chargement : au premier lancement, le texte affiche la **progression réelle** (« téléchargement du jeu ·
  52 % »), d'après les fichiers du socle effectivement reçus. Aux lancements suivants il n'apparaît pas.

Taille du bundle par palier (build v2, 171 fichiers) :

| Palier | Contenu | Brut | Transféré (brotli) | Quand |
|---|---|---|---|---|
| 0 — socle | page, JS, CSS, polices, catalogue complet | 4,99 Mo | ≈ 1,28 Mo | par la page elle-même, au 1er lancement |
| 1 — jeu | pages à la demande, scènes 6★, autres polices | 0,72 Mo | ≈ 0,28 Mo | en fond, dès la boutique |
| 2 — médias | `public/fx` (Yu-Gi-Oh : images, modèles, sons), `public/audio` | 6,49 Mo | 6,49 Mo | en fond, ensuite |
| à l'usage | miniatures et illustrations vues (`/art/*?v=`) | ≤ ≈ 25 Mo | — | au fil du jeu |
| hors bundle | modèles des Merveilles (20 Mo) | — | — | cache HTTP, comme avant |

Mesuré (banc, téléphone simulé) :

| | Avant | Après |
|---|---|---|
| Relance : requêtes servies sans réseau | 61 / 86 (cache HTTP, évinçable) | **62 / 63** (reste `precache.json`, 9 Ko) |
| Relance hors connexion | page d'erreur du navigateur | **le jeu démarre**, pages comprises |
| Installation complète (13 Mo bruts) | — | ≈ 100 s sur le banc (bridé par le GPU logiciel) |
| Octets du 1er lancement | 1 487 Ko | 1 490 Ko (+ `precache.json`) |

Écarté dans ce lot : précharger `catalogBig` depuis le HTML. Mesuré : fin de téléchargement du catalogue 1 907 → 1 870 ms
en 4G, et le dernier fichier JS arrive plus tard (2 662 → 2 831 ms) : la bande passante est le goulot, pas l'ordre.
Annulé.

### Lot 2 — navigation (`34d55e8`)

- Retour de la vue détail : la grille des 60 tuiles n'est refaite que si quelque chose a changé pendant la
  visionneuse. Mesuré : la tâche longue du retour (113 ms téléphone simulé, 420 – 503 ms selon les passes) **disparaît**.
- Miniatures des tuiles : fondu à l'arrivée (150 ms, jeton `--dur-rapide`), une fois par image et par session.
- Le module d'une page part dès que le doigt se pose sur son lien (avant : seulement 3 s après la boutique).

Écarté dans ce lot : suspendre la peinture des cartes pendant le défilement. Mesuré sur la collection : 49 → 66
images en retard, 8 tâches longues avant comme après. Aucun gain : annulé.

### Lot 3 — rendu 3D (`5ba24cd`)

- `core/holo.ts` : `rimK` passe en uniform. Avant, une carte « Pleine illustration » et la carte de préchauffage
  donnaient deux shaders différents : le préchauffage ne servait pas aux vraies cartes. Compté sur le banc : pipelines
  GPU créés pendant la première ouverture **4 → 2** (une ouverture chacun, boosters tirés au hasard : indicatif).
  Rendu identique (même valeur, 0 ou le coefficient du palier).
- `game/shell.ts` : la définition 3D **remonte** quand la scène tient la cadence de l'écran (moyenne ≤ 17,6 ms et moins
  de 5 % d'images en retard sur 3 fenêtres). L'ancien seuil (15 ms) était sous l'intervalle d'un écran 60 Hz : après
  une baisse, la session restait floue. Anti yo-yo : une rechute dans les 5 min bloque les remontées 10 min.
- `game/diag.ts` : plus de rappel à chaque image hors scène 6★ (sondage toutes les 100 ms).
- Téléphone : `backdrop-filter` retiré des deux derniers éléments posés sur la 3D (`.va`, `.mp-chip`), fonds un peu
  plus opaques.

Non mesurable ici (GPU logiciel) : à confirmer avec `?diag` sur téléphone.

### Lot 4 — Convex (`a4b9f5e`)

- `feed.bigPulls` lit par un index (`activityFeed.big`, champ **optionnel**, index `by_big`) : 30 lignes lues au lieu
  de 400 à chaque nouvelle entrée du fil. Marqué à l'insertion (boosters, Pack Battle, Royale) ; migration idempotente
  `migrations:markBigPulls` ajoutée à `mettre-en-ligne-v2.cmd` et `mettre-en-ligne-prod.cmd` ; ancien parcours en
  repli tant que la base n'est pas marquée. Même nom de requête, même forme de retour : le client V1 n'y voit rien.
- Battement de cœur : 35 s → **110 s**. Le serveur n'écrit la présence qu'au plus toutes les 4 min, « en ligne » =
  vu depuis moins de 6 min : 110 s garantit qu'un joueur actif ne paraît jamais hors ligne.
- Test ajouté (`convex/game.test.ts`) : index, repli, migration rejouée sans effet. 104 tests verts.

### Corrections après relecture (`afa83d5`)

Une relecture indépendante des quatre lots a trouvé 12 points, tous corrigés : battement d'abord réglé trop long
(245 s : un joueur actif pouvait paraître hors ligne 2 min), gros tirages en jeu non marqués, délai de 3 s appliqué
sans copie locale de la page, différentiel qui pouvait effacer les fichiers d'une page restée sur l'ancienne version,
yo-yo de définition entre scènes, fichiers sans empreinte jamais revalidés en économie de données, miniature qui
pouvait rester invisible sur un navigateur sans `loading=lazy`.

### Lot 5 — Convex : abonnements à la demande (`4bda465`)

- La liste du club (`users.friends`, la requête la plus relancée : elle relit tous les joueurs à chaque écriture sur
  n'importe lequel) n'est suivie en temps réel que sur Jeux, Échanges, Amis, Profil et Classement. Sur la boutique et
  la collection — où l'on passe le plus de temps — une lecture simple au démarrage la remplit.
- Onglet caché depuis 60 s : les abonnements permanents sont coupés ; au retour ils reprennent tout de suite, sans
  vider l'affichage. Un onglet oublié sur un PC ne fait plus tourner aucune requête. Les notifications (push) n'en
  dépendent pas.
- Aucun changement côté serveur ni de schéma. Non testable ici (pas de Convex sur le banc) : à vérifier sur le lien V2.

### Lot 6 — collection → vue détail en continu (`03c3117`)

- À l'ouverture d'une carte depuis la grille, la carte de la tuile **grandit jusqu'à la place exacte de la carte 3D**
  (animation `transform`, durée « emphatique » et courbe d'entrée du référentiel motion) et tient l'écran pendant que
  la 3D se prépare, puis s'efface quand elle arrive. Avant : écran noir avec le texte seul.
- Position d'arrivée calculée par la scène (`viewer.restRect()`), vérifiée au pixel : 390 px → 257×360 en (66, 222) ;
  1440 px → 387×540 en (527, 149), identiques à la carte 3D.
- Rien en « effets réduits » ni si la carte peinte n'est pas encore prête (comportement d'avant).

### Fluidité 2 — pistes du papier de recherche web (10/11)

Papier relu contre le code et les sources (38 fautes corrigées : 2 pistes sur 16 déjà faites, 9 partielles).
Exécution piste par piste, mesurée sur le banc. Gardé :

| Lot | Effet mesuré / prouvé |
|---|---|
| Peinture des cartes de la collection en worker (détourage + encodage WebP) | 1re visite, 55 cartes, téléphone simulé : 24–32 tâches longues · 2,2–3,6 s → 7 tâches · 0,5 s ; plus longue 280–390 → ~100 ms ; cartes identiques octet pour octet ; repli sur l'ancien chemin (Safari probable) |
| Catalogue construit en un passage, tableaux bruts libérés | installation 49,8 → 28,3 ms, total 130 → 105 ms, tas −12 % (Node) ; résultat identique octet pour octet |
| Boucle de rendu arrêtée hors scène 3D, changement de définition différé au repos, démarrage prudent après 2 arrêts brutaux (iOS) | pages DOM : ~50 → 0 rappels d'animation/s ; plus de réallocation en pleine révélation |
| Textures des sachets envoyées d'avance (2 par image), canvas source libérés | glissé de la roue : 6 → 2 textures par image ; ouverture 4 → 2 ; ~15 Mo de canvas libérés par sachet, +~34 Mo GPU au repos (voisins préparés) |
| Préchauffage par la vraie passe de rendu (MRT + MSAA) | démarrage : 63 → 34 pipelines créés en bloquant (29 en parallèle) ; 1re ouverture inchangée |
| Service worker : fichiers /assets servis sans le réveiller (Chrome), Navigation Preload | ~60 passages par le service worker en moins par relance ; hors ligne OK |
| Jeux : 3 dessins montés un par tâche | plus longue tâche à l'entrée 1,56–1,65 s → 0,6–0,9 s |
| Défilement restauré au retour arrière ; View Transitions derrière `?vt=1` (désactivées par défaut) | fonctionnel (900 → 900 px) |
| Albums (téléphone) : hauteur réservée juste | barre de défilement : saut de 258 → 2 px |

Écarté après vérification : Early Hints (gain d'une seule visite, invérifiable), `_routes.json` (déjà généré par Pages),
découpage des fichiers (déjà stable), animations CSS de la vitrine (déjà composées ou mortes), précache à l'installation
pour le cache de code (modules ES : sans effet), vues gardées attachées (≈ 45 tests `isConnected` à revoir : régression).
Relecture indépendante des lots fusionnés : 1 défaut et 3 mineurs corrigés. Parcours complet 390 / 1440 px sans erreur.

## 5. Coûts : avant / après

| Poste | Avant | Après | Pourquoi |
|---|---|---|---|
| Convex — battements / joueur / 30 min | 51 | 16 | période 110 s |
| Convex — `bigPulls` : lignes lues par exécution | 400 | 30 | index `by_big` |
| Convex — session type (10 joueurs, 30 min), estimation | ≈ 8 700 appels · ≈ 125 Mo lus | ≈ 6 700 appels · ≈ 103 Mo lus | −350 battements, −9 Mo de fil, `users.friends` coupée la moitié du temps (≈ −1 650 exécutions, −13 Mo) |
| Convex — onglet laissé ouvert en arrière-plan | toutes les requêtes relancées en continu | 0 après 60 s | abonnements coupés onglet caché |
| Fonction R2 (`/art/*`) | 1 appel par image et par vidage du cache HTTP | 1 appel par image, puis plus rien tant qu'elle est dans les 1 800 gardées | cache du service worker |
| Pages (fichiers statiques, gratuits) | re-téléchargement après éviction (iPhone) | une fois par appareil et par version ; +6,5 Mo de médias une fois | bundle |
| Services payants ajoutés | — | aucun | |

Les chiffres Convex sont des estimations par lecture du code (hypothèses en section 2), pas des relevés du tableau de
bord : à comparer avec l'onglet Usage de Convex une semaine après le patch. Le gros de la facture (lignes 13 et 14 du
tableau des constats) n'est **pas** traité ici.

## 6. Ce qui reste (pas fait, et pourquoi)

| Sujet | Gain attendu | Pourquoi pas dans cette passe |
|---|---|---|
| Présence et annuaire hors de `users` | moins qu'annoncé : la liste du club affiche le statut en direct (« Ouvre un booster… ») et le nombre de boosters, qui changent à chaque ouverture — elle doit donc être relancée tant qu'on l'affiche | le vrai levier serait de ne plus écrire le statut à chaque ouverture : **ça change ce que voient les joueurs, décision de Tom**. Le lot 5 retire déjà le coût là où la liste n'est pas affichée. |
| Collection sans re-poussée à chaque booster (`invRev`) | ≈ −45 Mo lus, −1,8 Mo / joueur | touche toutes les mutations qui donnent ou retirent des cartes : même raison |
| Cron `markLeader` (relit tous les inventaires chaque heure) | ≈ −200 Mo/jour (estimation) | l'espacer retarde l'attribution du titre « Numéro un » : **décision de Tom** |
| Fusion `me` + `economy.state` + `missions.mine` | ≈ −650 appels / 30 min | nouvelle requête côté serveur à garder compatible avec la V1 : à faire avec le staging sous les yeux |
| View Transitions entre pages, historique dans la sous-navigation de la collection, défilement restauré au retour | continuité « native » | chaque page remet son état à zéro à l'entrée (onglet, tri, page) : à reprendre vue par vue, et à valider à l'œil |
| Changement de définition différé hors révélation ; textures des sachets et des dos envoyées deux par image ; préchauffage des scènes 6★ hors ouverture | à-coups en moins | non mesurable sans GPU ; envoyer d'avance les textures des 5 sachets coûte de la mémoire GPU (risque iPhone) : à faire avec les rapports `?diag` |
| Animations hors compositeur (`name-shine`, `bp-hue`, `bp-secret`) | fil principal plus libre en révélation | réécriture à l'identique à comparer image par image |
| AVIF / KTX2, détourage dans un worker, 60 i/s par animation | à chiffrer | demande un vrai téléphone ; KTX2 n'a de sens que si la mémoire GPU est le goulot mesuré |
| Miniatures de toute la collection dans le bundle | — | **écarté** : 36 955 fichiers ≈ 443 Mo, et 739 000 appels à la fonction R2 pour 20 joueurs (quota gratuit : 100 000 / jour). Remplacé par le cache à l'usage. |

## 7. Vérifications

Faites ici (build démo, Chrome piloté, 390 px et 1440 px) : `tsc` client et Convex, 104 tests Convex, build mode v2,
parcours boutique → ouverture → collection → vue détail → retour → échanges → jeux → classement → succès → amis →
profil, **aucune erreur console ni requête échouée**, installation du bundle, relance hors connexion.

Pas faites (impossible d'ici) : première connexion et échange **en ligne** (le banc tourne sans Convex), migration sur
le staging, mode « effets réduits » (aucun des changements ne touche ses règles, mais il n'a pas été rejoué), tout ce
qui est 3D en vrai (GPU logiciel), iPhone.

### À lancer chez Tom, dans cet ordre

1. `lanceurs\mettre-en-ligne-v2.cmd` — déploie Convex sur le staging, passe `markBigPulls`, build v2, Pages `v2`.
2. `lanceurs\push.cmd` — pousse les commits.

### À vérifier à l'œil sur le téléphone (lien V2)

1. `…/jeu/?diag` : ouvrir 3 boosters, puis lire le rapport — images > 80 ms pendant la première révélation de chaque
   rareté (attendu : moins qu'avant), et la ligne « définition 3D remontée » après un passage chargé.
2. Premier lancement après avoir vidé les données du site : le texte « téléchargement du jeu · N % » avance.
3. Jouer 2 min, passer en **mode avion**, fermer et rouvrir : le jeu démarre (bandeau « pas de réseau » attendu).
4. Collection : les miniatures arrivent en fondu, pas d'un coup ; ouvrir une carte puis revenir : la grille ne
   clignote plus.
5. Vue détail sur téléphone : les boutons d'action et la pastille de musique (fonds sans flou) restent lisibles.
6. Bordure métallique des cartes au cadre « Suisse » et absence de bordure sur les pleines illustrations : inchangées.
7. Page d'accueil : « Gros tirages » affiche les mêmes cartes qu'avant ; un ami actif reste « en ligne ».
8. Collection → carte : la carte de la tuile grandit jusqu'à la carte 3D sans saut au moment du relais ; dire si le
   raccord avec le tour d'entrée te plaît.
9. Lien V2 : sur la boutique puis sur Amis / Échanges / Jeux, les joueurs et leurs statuts s'affichent ; mettre le
   jeu en arrière-plan 2 min puis revenir : tout se remet à jour en une seconde.
10. Après le prochain déploiement V2 : la pastille « Mise à jour disponible · Recharger » apparaît, et un seul
   rechargement suffit.
11. « Effets réduits » activé : ouverture, collection et jeux se comportent comme avant.
