# Master prompt — Audit de performances V2 (12/11, version 4)

À coller dans une session Claude Code ouverte sur `cardgamepriv`.
Ou, plus court : « Lis le doc projet `claude/master-prompt-audit-perf-v2-12-11.md` et exécute-le. »

---

## Réglage

`MODE = AUDIT SEUL`
(remplacer par `AUDIT + CORRECTIONS` pour enchaîner sur les lots, étape 8)

## Mission

Tu es l'orchestrateur d'un audit de performances de la **V2** du jeu : branche git `v2`, lien `https://v2.cardgamepriv.pages.dev`, staging Convex `cardgamepriv-v2`.

But : le ressenti d'un TCG mobile natif dans le navigateur. Téléphone d'abord (Chrome Android, Samsung Internet, Firefox Android, Safari iPhone), PC ensuite.

Quatre axes, tous importants : **performances** (calcul, mémoire), **vitesse** (chargement, réponse au toucher), **fluidité** (cadence, à-coups) et **coût Convex** (appels, lectures, octets, écritures).

Deux niveaux de lecture : **général** (où partent le temps et les coûts, page par page) et **en précision** (cause exacte, `fichier:ligne`, comment la mesurer).

## Périmètre : toute la V2, de fond en comble

- **Dedans** : l'intégralité du jeu `/jeu/` sur `v2`. Chaque page, panneau, transition, scène 3D, worker, fichier chargé, et chaque fonction Convex que le jeu appelle (requêtes, mutations, actions, crons, tables, index).
- **Dehors** : le labo, `/admin/` et la V1 (`master`, prod). On ne les audite pas, on n'y touche pas. Le code gardé pour la compatibilité V1 n'est pas un constat.
- **Rien n'est trop petit** : un gain minime est noté (P3), jamais écarté.
- Pas de zone « déjà vue » : l'ancien est audité comme le récent.

## Contraintes non négociables

- **Identique à l'œil** : direction artistique, timings du référentiel motion, reflets de rareté, animations 6★. Une piste qui change l'image est classée « compromis visuel, décision de Tom ».
- Le mode « effets réduits » continue de fonctionner.
- **Aucun coût en plus** : pas de service payant, pas de hausse Convex / R2 / Pages. Une piste plus fluide mais plus chère côté serveur est classée « compromis de coût, décision de Tom ».
- Schéma Convex : champs optionnels et migration idempotente seulement.
- En `AUDIT SEUL` : aucun fichier de code modifié, aucun commit, aucun lanceur de mise en ligne. Les seuls fichiers écrits sont dans `_hors-site/audit-12-11/` (vérifie qu'il est ignoré par git).
- Convex en lecture seule : jamais `convex dev`, `deploy`, `run`, `import`, `env set`. Jamais la prod.
- Une autre session peut travailler sur `v2` dans le même dossier : ne touche qu'à tes fichiers. Un build de mesure sort dans `_hors-site/audit-12-11/build/`, pas dans `dist/`.
- Ne prends pas le contrôle du PC. Si un lanceur doit tourner, dis lequel et dans quel ordre.

## Sources : aucune n'est la référence absolue

Ordre de confiance :
1. le code sur `v2` aujourd'hui ;
2. une mesure faite pendant cet audit, les rapports `diag-*` de vrais téléphones, et les chiffres Convex du doc projet `claude/audit-perf-v2-donnees-convex-12-11.md` (relevés le 12/11 sur la prod et le staging) ;
3. les autres docs (`docs/V2-FLUIDITE.md`, anciens audits) : point de départ seulement.

Quand un doc et le code se contredisent, le code gagne et l'écart est noté. Un point « fait » se revérifie dans le code. Un point « écarté » peut être rouvert si le code ou une mesure a changé.

Attention : les chiffres Convex viennent surtout de la **prod, donc de la V1**. Ils disent où chercher, pas ce que fait la V2. Pour chaque fonction chère en prod, la question est : existe-t-elle encore en V2, sous quelle forme, et que coûte-t-elle sur le staging ?

## Organisation : beaucoup de petits agents peu chers

Cette mission autorise explicitement un grand nombre de sous-agents. Principe : **les modèles légers lisent et relèvent, les modèles lourds ne reçoivent que des questions étroites.**

| Modèle | Rôle | Volume |
|---|---|---|
| `haiku` | Relever des faits avec une liste de contrôle, sans jugement | Beaucoup (20 à 30) |
| `sonnet` | Appliquer des règles connues aux fiches, mesurer, vérifier un constat | Une quinzaine |
| `opus` | Trouver une cause à travers plusieurs fichiers, ou toute piste dont l'erreur coûterait cher | 3 |
| `fable` | Rendu 3D sous contrainte visuelle, arbitrage final | 2 |

Règles d'économie, pour toi et pour chaque agent :
- **Petit périmètre** : une tranche = 15 fichiers ou 3 000 lignes au plus. Au-delà, coupe en deux agents du même modèle.
- **Consigne courte** : 30 lignes au plus, avec des chemins, jamais de code collé.
- **Chercher avant de lire** : `grep` d'abord, lecture ciblée ensuite. Pas de lecture de fichier entier sans raison.
- **Sortie en deux parties** : le détail dans un fichier de `_hors-site/audit-12-11/`, et un retour de **10 lignes maximum** à l'orchestrateur.
- Tu ne lis jamais un rapport entier : seulement les retours de 10 lignes et les tableaux de constats.
- Vagues de 8 à 10 agents en parallèle, lancés dans un seul message.
- Tiens `_hors-site/audit-12-11/00-etat.md` à jour (vague en cours, agents rendus, trous) pour pouvoir reprendre après une coupure.
- **Escalade** : un point rendu « cause incertaine » monte d'un niveau, sur ce seul point, avec la fiche en entrée. **Rétrogradation** : une tâche qui se révèle mécanique redescend.
- Modèle indisponible : prendre le niveau au-dessus.

## Étape 0 — Cadrage (toi)

1. Lis `CLAUDE.md`, `docs/V2-FLUIDITE.md`, et deux docs projet : `claude/audit-perf-v2-donnees-convex-12-11.md` et `claude/fluidite-v2-09-11.md`.
2. Écris `_hors-site/audit-12-11/00-cadrage.md`, 20 lignes : ce que les docs disent fait, écarté, à mesurer, chaque ligne marquée « vérifié dans le code » ou « dit par le doc ». Ce fichier est donné à tous les agents d'analyse.
3. Regarde si tu as un vrai GPU. Sans GPU réel, les images par seconde ne valent rien : seuls comptent les compteurs du moteur, les octets, les nombres de requêtes et de trames.
4. Récupère les rapports `diag-*` des vrais téléphones (`node scripts/pull-feedback.mjs`).

Pistes déjà chiffrées, à vérifier en premier dans le code V2 (ce ne sont pas des conclusions) :
- lecture de collection : `inventory.myCollection` (40 % du coût prod, remplacée en V2 ?) et `inventory.userCollection` (toujours là en V2) ;
- classement : `profiles.rankRow` lit plus d'un Mo pour renvoyer 0,4 Ko, encore première sur le staging ; `profiles.refreshRanks` + `rankPlan` toutes les 5 minutes ;
- battement de cœur : 54 % des appels prod viennent des requêtes qu'il relance (`users.friends`, `friends.mine`, `users.me`, `missions.mine`, `economy.state`) ;
- tâches à cadence fixe sur le staging : `games.rouletteTick`, `listings.expireTick`, `seasons.tick` ;
- nouveautés V2 : `deals.forYou` (420 documents par appel), `presse.*`, `chat.inbox`.

## Étape 1 — Trois cartes (3 agents `haiku`, type Explore, en parallèle)

Chaque ligne avec ses fichiers. Sortie : `_hors-site/audit-12-11/1-carte-<nom>.md`.
- **Carte client** : routes, pages, panneaux, fenêtres, scènes 3D et leurs matériaux, workers, service worker.
- **Carte Convex** : chaque fonction (type, tables lues, tables écrites, index utilisés), les crons et leur fréquence, et qui appelle quoi côté client.
- **Carte des fichiers servis** : chunks du build mode `v2` et leur poids, `import()` dynamiques, images, sons et polices les plus lourds.

Vérifie toi-même que les cartes sont complètes (routeur, dossier `convex/`). Puis découpe-les en **tranches** : c'est la liste de couverture de tout l'audit.

## Étape 2 — Fiches par tranche (15 à 25 agents `haiku`, par vagues)

Un agent par tranche. Il remplit une liste de contrôle, **des faits avec `fichier:ligne`, aucun avis**, et termine par « à regarder de près » (3 lignes). Sortie : `_hors-site/audit-12-11/2-fiche-<tranche>.md`.

Tranches indicatives, à ajuster aux cartes :
- client : boutique et vitrine · ouverture et révélation · visionneuse et matériaux de carte · scènes 6★ (une fiche par famille) · collection, albums, classeurs · profil et classement · échanges, marché, annonces · jeux, casino, mini-jeu, défis · chat, notifications, bulles · son et musique · missions, succès, événements, saisons, tuto · noyau (routeur, transitions, client réseau, caches, service worker, workers) ;
- Convex : un agent par groupe de 4 à 6 modules, plus un pour crons, migrations, schéma et index.

**Liste de contrôle client**
- abonnements Convex : ouverts où, fermés où, en double ?
- boucles `requestAnimationFrame`, minuteries : démarrées où, arrêtées où ?
- écouteurs : ajoutés, retirés, `passive` ?
- travail au montage : lecture de gros JSON, tris, Canvas2D, création de textures ;
- ce qui est libéré au démontage (`dispose`, toiles, tampons audio) et ce qui ne l'est pas ;
- taille des listes et du DOM, pagination ou non, images (taille servie, `loading`, `decoding`) ;
- propriétés animées en CSS, `backdrop-filter`, `filter`, ombres, `will-change` ;
- 3D : passes, cibles de rendu et leur taille, MSAA, définition, cadence au repos, variantes de matériaux ;
- chargement : imports statiques lourds, imports dynamiques, préchargements.

**Liste de contrôle Convex, par fonction**
- lecture : index, `.collect()`, parcours complet, `.filter` hors index, `db.get` en boucle ;
- ordre de grandeur des documents lus, et s'il grandit avec les joueurs ou avec la collection ;
- réponse : documents entiers ou champs utiles, taille ;
- écriture : quelles tables, donc quelles requêtes d'autres joueurs sont relancées ;
- appel : abonnement permanent ou ponctuel, depuis quelles vues, à quelle fréquence ;
- chiffres connus du doc de données, recopiés tels quels.

## Étape 3 — Mesures (2 à 3 agents `sonnet`, en même temps que l'étape 2)

- **Mesure client** : build mode `v2` dans `_hors-site/audit-12-11/build/`, mode démo si présent, téléphone émulé 390×844 et PC 1920×1080, processeur ralenti ×4. Par page et par transition : tâches longues, mises en page, recalculs de style, nœuds DOM, octets chargés. Un seul agent lance le serveur, sur un port à lui.
- **Mesure réseau** : abonnements ouverts par écran, trames au repos pendant 5 minutes, appels en double à l'ouverture.
- **Mesure Convex V2** : journaux du staging (`npx convex logs --success --jsonl --history 1000`, environnement V2). Chaque ligne donne octets lus, documents lus, taille de la réponse, durée, résultat en cache ou non. Agréger par fonction. Compléter avec `convex-test` pour une fonction précise.

## Étape 4 — Analyses par catégorie (8 à 10 agents `sonnet`, en parallèle)

Chacun reçoit le cadrage, les fiches et les mesures de sa catégorie, et ne relit le code que là où une fiche pointe.

1. Chargement et démarrage (à froid, retour d'arrière-plan, cache du premier lancement)
2. Médias : images, sons, polices
3. Interface DOM / CSS et animations, mode effets réduits
4. Listes et pages lourdes : collection, chat, marché, échanges
5. Abonnements côté client : par écran, jamais fermés, en double
6. Coût Convex fonction par fonction, première moitié des modules
7. Coût Convex fonction par fonction, seconde moitié
8. Crons, tâches planifiées, migrations, index
9. PC : 1440p / 4K, 120–144 Hz (animations calées sur la cadence au lieu du temps), puce graphique intégrée
10. Scènes 3D, premier passage : ce qui se voit dans les fiches sans expertise (cibles trop grandes, rendu continu au repos, ressources non libérées)

## Étape 5 — Expertises étroites (3 agents `opus`, 1 agent `fable`)

Ils reçoivent les fiches et les constats marqués « cause incertaine » ou « à approfondir », pas le dépôt entier. Ils ne lisent que les fichiers pointés.

- `opus` — **Invalidations en cascade** : battement de cœur, présence, chat, notifications, classement. Quelle écriture relance quelles requêtes, chez combien de joueurs. Proposer une forme à coût égal ou moindre.
- `opus` — **Fil principal** : les à-coups dont la cause traverse plusieurs fichiers, du toucher à la première image.
- `opus` — **Mémoire et longues sessions** : durées de vie des textures, toiles, tampons audio, abonnements ; pic sur iPhone après 10 ouvertures et 20 navigations.
- `fable` — **Rendu 3D et GPU** : coût par pixel des matériaux, post-traitement, compilation des pipelines et à-coups de première ouverture, scènes 6★, repli WebGL2. Tout sous la contrainte « identique à l'œil ».

## Format d'un constat (étapes 4 et 5)

Identifiant · gravité (P0 gel ou plantage, P1 à-coup ou surcoût visible, P2 confort, P3 petit gain) · axe · `fichier:ligne` · ce qui se passe · appareil (téléphone / PC / les deux) · gain estimé · risque visuel ou de coût (aucun / décision de Tom) · effort · mesure avant / après.

- Niveau de preuve obligatoire : **mesuré**, **lu dans le code** ou **hypothèse**. Pas d'images par seconde sans vrai GPU.
- Coût Convex chiffré : fréquence d'appel × documents lus × octets, à 20 joueurs, et dire si ça grandit avec le temps.
- Les P3 tiennent en une ligne chacun, mais ils y sont tous.
- La gravité se juge sur ce que le joueur ressent et sur ce que ça coûte, pas sur un seuil d'ancien doc.
- **Couverture** : chaque agent rend, pour chaque tranche reçue, « constats n° … », « rien à signaler » ou « non traité, parce que … ».

## Étape 6 — Contre-vérification (agents `sonnet` par paquets, puis `fable`)

- Un agent `sonnet` à contexte neuf par paquet de 8 constats P0 à P2. Il reçoit le constat seul, sans le raisonnement, et cherche à le réfuter : le code dit-il cela sur `v2`, est-ce déjà corrigé, la correction change-t-elle l'image ou un coût ? Verdict : confirmé, plausible, rejeté.
- Les P3 : un agent `haiku` par paquet de 20, qui vérifie seulement que la ligne citée existe et dit bien cela.
- `fable`, une seule fois : les P0 et les désaccords entre auteur et vérificateur.

## Étape 7 — Synthèse (toi)

- **Tableau de couverture** : chaque tranche × les catégories qui la concernent. Une case vide = un trou : relance un agent léger dessus avant de conclure.
- Classement par gain × confiance ÷ effort, découpé en **lots** (un lot = un commit = une mesure avant / après). Tous les constats y figurent, P3 regroupés en lots de petits gains.
- Trois listes : sans compromis, compromis visuel, compromis de coût.
- Coût Convex : les 10 fonctions V2 les plus chères, estimation avant / après, et ce que le passage de la V2 en prod changerait par rapport aux 17,82 Go relevés.
- Protocole de mesure sur vrai téléphone, 8 lignes maximum, avec `?diag`.
- **Objectifs : tu les proposes toi-même**, à partir de l'état mesuré et de ce qu'un TCG mobile natif donne au toucher : valeur actuelle, cible, raison. Les repères des anciens audits ne sont que des ordres de grandeur à confronter, durcir ou abandonner (tâche de 50 ms au plus pendant une interaction, boutique en 2,5 s en 4G, retour d'arrière-plan en 1,5 s, pic mémoire sous 350 Mo, moins de 10 trames Convex par 5 minutes au repos).
- Liste courte des endroits où les docs sont dépassés ou faux.
- Compte rendu : un seul doc projet, `claude/audit-perf-v2-12-11.md`, une page. Le détail reste dans `_hors-site/audit-12-11/`.

## Étape 8 — seulement si `MODE = AUDIT + CORRECTIONS`

Lots sans compromis uniquement, dans l'ordre du classement, en autonomie, jusqu'aux P3. **Un seul agent écrit à la fois** : `sonnet` pour un lot mécanique, `opus` pour un lot qui touche Convex ou plusieurs fichiers, `fable` pour la 3D. Pour chaque lot : mesure avant, plan écrit, un commit, type-check et tests Convex, mesure après, relecture du diff par un agent `sonnet` à contexte neuf. Un lot qui n'améliore pas les chiffres est annulé. Arrêt seulement pour une décision irréversible ou qui change l'expérience des joueurs.

## Réponse finale à Tom

En français, résultat d'abord, court : les 5 constats qui comptent, le nombre de constats par gravité, ce qui a changé (rien en audit seul), ce qu'il doit mesurer sur son téléphone, quel lanceur lancer et dans quel ordre. Une seule question, seulement si elle bloque.
