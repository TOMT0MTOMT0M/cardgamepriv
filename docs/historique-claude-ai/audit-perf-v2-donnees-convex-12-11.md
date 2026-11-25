# Audit perf V2 — données Convex relevées (12/11)

Source : journaux d'exécution des deux déploiements, lus avec les clés de déploiement (lecture seule : liste des fonctions et journaux ; rien écrit, rien déployé). Chaque ligne de journal donne les octets et documents lus, la taille de la réponse et la durée. Agrégé par fonction.

Limites : les journaux ne gardent que les ~1 000 dernières exécutions. La fenêtre prod est donc courte (une demi-heure d'activité réelle), celle de la V2 longue mais avec seulement les testeurs. Les totaux du mois et les limites du plan ne sont pas accessibles avec ces clés (page Usage du tableau de bord).

Type : Q = requête, M = mutation, A = action.

## Ce qui ressort

**Prod (vrais joueurs)**
- Sept fonctions font 84 % des octets lus, chacune avec 1 600 à 5 500 documents lus par appel (sans doute l'inventaire entier, à confirmer dans le code) : `inventory:myCollection`, `profiles:rankRow`, `inventory:userCollection`, `profiles:refreshMyRank`, `economy:claimAchievements`, `economy:burn`, `profiles:profile`.
- `inventory:myCollection` : 42 % à elle seule, 1,2 Mo lus et 562 Ko renvoyés par appel, p95 à 2,6 s. La V2 la remplace par `inventory:mineSince` (5,9 Ko par appel sur le staging).
- `profiles:rankRow` : 19 %, 1,5 Mo et 4 700 documents lus pour renvoyer 0,4 Ko.
- `inventory:userCollection` : réponse jusqu'à 1,4 Mo, p95 à 4,8 s.
- `friends:mine` et `users:friends` : peu chers par appel mais les plus appelés (177 et 192 en 27 min).

**V2 (staging, testeurs seulement)**
- `profiles:rankRow` reste première (26 % des lectures), avec la même forme : 303 documents lus pour renvoyer 0,3 Ko.
- Tâches à cadence fixe, qui semblent tourner joueurs présents ou non (à confirmer dans le code) : `profiles:refreshRanks` + `profiles:rankPlan` (141 fois en 11 h 47, soit toutes les 5 min, 20 % des lectures), `games:rouletteTick` (142 fois), `listings:expireTick` (47 fois), `seasons:tick` + `seasons:advance` (12 fois).
- `inventory:userCollection` existe toujours en V2 (189 Ko lus, 167 Ko renvoyés par appel avec les petites collections du staging).
- Nouveautés V2 à regarder : `deals:forYou` (146 Ko et 420 documents par appel), `presse:*` (mini-jeu, 19 Ko par `start`), `chat:inbox` (39 appels, 4,3 Ko chacun).

## Totaux de la page Usage — projet `cardgamepriv`

Captures de Tom du 12/11 vers 14 h (heure de Paris). La période en cours commence le jour de l'ouverture aux joueurs (07/11 au soir) : elle couvre environ 5 jours et demi. La page n'affiche pas les limites du plan (à lire dans l'onglet Billing).

| Ressource | 7 oct. – 6 nov. (tests, avant ouverture) | 7 nov. – 12 nov. (joueurs, période en cours) |
|---|---|---|
| Appels de fonctions | 70 K | 358 K |
| Calcul des actions | 0,00039 GB-heures | 0,043 GB-heures |
| Stockage base | 9,71 Mo | 105,06 Mo |
| Lectures / écritures base (Database I/O) | 3,52 Go | 17,82 Go |
| Stockage fichiers | 839,96 Ko | 11,07 Mo |
| Sortie de données | 11,54 Mo | 416,37 Mo |
| Déploiements | 2 | 3 |

Lecture :
- 17,82 Go lus / écrits pour une base de 105 Mo : l'équivalent de la base entière relue 170 fois en 5 jours et demi.
- Au même rythme sur 30 jours : environ 95 Go et 1,9 million d'appels (projection simple, à comparer au forfait dans Billing).

### Appels par fonction, période en cours (onglet « Function Calls », 357 K au total)

| Fonction | Appels | Fonction | Appels |
|---|---|---|---|
| `users.friends` | 83 K | `migrations.purgeCards` | 3 K |
| `friends.mine` | 53 K | `migrations.resyncRarities` | 2,9 K |
| `feed.bigPulls` | 35 K | `binders.mine` | 2,8 K |
| `listings.mine` | 23 K | `games.lobby` | 2,3 K |
| `users.me` | 20 K | `launch.status` | 2,2 K |
| `missions.mine` | 20 K | `listings.open` | 2,2 K |
| `economy.state` | 19 K | `trades.history` | 1,5 K |
| `users.heartbeat` | 16 K | `games.rouletteTick` | 1,5 K |
| `packs.getSealedPack` | 14 K | `games.roulette` | 1,4 K |
| `inventory.myCollection` | 12 K | `profiles.leaderboard` | 1,1 K |
| `trades.myTrades` | 10 K | `profiles.rankRow` | 1,1 K |
| `packs.revealPack` | 6,2 K | `packs.preparePacks` | 1 K |
| `packs.preparePack` | 3,2 K | `games.duel` | 817 |

La liste continue (« Show more » non déplié).

### Lectures / écritures base par fonction, période en cours (onglet « Database I/O », 17,82 Go au total)

C'est la mesure de référence pour le coût : toute la semaine, tous les joueurs. « Par appel » = total ÷ appels du tableau précédent, quand le nombre d'appels est connu.

| Fonction | Total | Part | Par appel (semaine) | Par appel (journaux du 12/11) |
|---|---|---|---|---|
| `inventory.myCollection` | 7,15 Go | 40 % | 596 Ko | 1 206 Ko |
| `profiles.leaderboard` | 3,55 Go | 20 % | 3,2 Mo | 10 Ko |
| `profiles.rankRow` | 1,31 Go | 7 % | 1,2 Mo | 1 531 Ko |
| `feed.bigPulls` | 961,7 Mo | 5 % | 27 Ko | 27 Ko |
| `friends.mine` | 929,97 Mo | 5 % | 18 Ko | 24 Ko |
| `users.friends` | 576,07 Mo | 3 % | 7 Ko | 13 Ko |
| `profiles.markLeader` | 508,93 Mo | 3 % | — | absente |
| `profiles.profile` | 362,57 Mo | 2 % | — | 1 633 Ko |
| `profiles.refreshMyRank` | 330,98 Mo | 2 % | — | 1 805 Ko |
| `inventory.userCollection` | 302,5 Mo | 2 % | — | 519 Ko |
| `economy.state` | 254,51 Mo | 1 % | 13 Ko | 2,6 Ko |
| `economy.claimAchievements` | 173,47 Mo | 1 % | — | 1 564 Ko |
| `packs.revealPack` | 161,64 Mo | 1 % | 26 Ko | 19 Ko |
| `migrations.resyncRarities` | 142,39 Mo | 1 % | 49 Ko | — |
| `migrations.purgeCards` | 141,64 Mo | 1 % | 47 Ko | — |
| `contracts.sign` | 132,75 Mo | 1 % | — | — |
| `listings.mine` | 123,93 Mo | 1 % | 5 Ko | 11 Ko |
| `packs.revealPacks` | 111,32 Mo | 1 % | — | 162 Ko |
| `packs.preparePacks` | 94,72 Mo | 1 % | 95 Ko | 77 Ko |
| `trades.myTrades` | 64,43 Mo | — | 6 Ko | 9 Ko |
| `users.heartbeat` | 55,29 Mo | — | 3,5 Ko | 3,8 Ko |
| `trades.history` | 54,41 Mo | — | 36 Ko | 105 Ko |
| `economy.burn` | 54,34 Mo | — | — | 1 821 Ko |
| `users.me` | 45,1 Mo | — | 2,3 Ko | 2,6 Ko |
| `missions.mine` | 45,1 Mo | — | 2,3 Ko | 2,6 Ko |
| `packs.preparePack` | 41,58 Mo | — | 13 Ko | 10 Ko |
| `economy.claimCompletions` | 40,85 Mo | — | — | — |
| `profiles.setCosmetics` | 32,45 Mo | — | — | — |
| `profiles.rankPlan` | 28,99 Mo | — | — | 59 Ko |
| `economy.friendsAchievements` | 23,91 Mo | — | — | — |
| `listings.open` | 20 Mo | — | 9 Ko | 8 Ko |
| `games.readyDuel` | 11,25 Mo | — | — | — |
| `games.history` | 10,66 Mo | — | — | — |
| `packs.getSealedPack` | 10,65 Mo | — | 0,8 Ko | 0,5 Ko |
| `games.roulette` | 10,58 Mo | — | 8 Ko | 23 Ko |
| export de sauvegarde (`snapshot_export`) | 7,73 Mo | — | — | — |
| `profiles.saveRanks` | 6,86 Mo | — | — | 15 Ko |
| `launch.resetStep` | 6,75 Mo | — | — | — |

Toutes les autres fonctions (une centaine, dont l'admin) sont sous 6,5 Mo chacune sur la période.

Lecture, mesurée :
- **Trois fonctions font 67 % du coût**, les dix premières 90 %.
- **Deux familles font les trois quarts** : la lecture de collection (`myCollection` + `userCollection`, 7,45 Go, 42 %) et le classement (`leaderboard`, `rankRow`, `markLeader`, `refreshMyRank`, `rankPlan`, `saveRanks`, 5,74 Go, 32 %).
- La famille du battement de cœur (`friends.mine`, `users.friends`, `economy.state`, `users.me`, `missions.mine`, `users.heartbeat`) fait 54 % des appels mais 11 % des octets (1,9 Go).

Lecture, déduite (à confirmer dans le code) :
- **`myCollection` coûte de plus en plus cher** : 596 Ko par appel en moyenne sur la semaine, 1,2 Mo le 12/11. Le coût suit la taille des collections, qui grandissent chaque jour.
- **`profiles.leaderboard` semble déjà corrigée** : 3,2 Mo par appel en moyenne sur la semaine, 10 Ko le 12/11. Ses 3,55 Go seraient du passé (avant le patch classement du 10/11). `profiles.markLeader` n'apparaît plus dans les journaux du 12/11.
- **`profiles.rankRow` n'est pas corrigée** : 1,2 Mo par appel sur la semaine, 1,5 Mo le 12/11.
- Un déploiement « Prod » existe dans le projet et n'exécute que `games.rouletteTick` (659 Ko) : un cron qui tourne sur un déploiement que personne n'utilise.

Déductions sur les appels, à confirmer dans le code :
- **Le battement de cœur entraîne plus de la moitié des appels.** Pour 16 K `users.heartbeat` : 83 K `users.friends` (5 par battement), 53 K `friends.mine` (3 par battement), et environ 20 K chacune pour `users.me`, `missions.mine`, `economy.state` (1 par battement). Total 195 K, soit 54 % des appels. Les journaux du 12/11 montrent le même lien : 62 battements, 62 `users:me`, 62 `missions:mine`, 61 `economy:state`.
## Prod — `cardgamepriv` (`wry-chicken-825`)

Fenêtre : 12/11 de 13:23 à 13:49 UTC (27 min), 1086 exécutions, 45 fonctions. Lu : 94,9 Mo. Écrit : 0,65 Mo. Erreurs : 0. Conflits d'écriture : 0.

| Fonction | Type | Appels | En cache | Lu / appel (Ko) | Docs / appel | Lu total (Ko) | Part | Écrit total (Ko) | Réponse moy. (Ko) | Réponse max (Ko) | ms moy. | ms p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `inventory:myCollection` | Q | 33 | 8 | 1205,8 | 3709 | 39791,5 | 42 % | 0,0 | 562,4 | 703,6 | 746 | 2640 |
| `profiles:rankRow` | Q | 12 | 0 | 1531,0 | 4700 | 18372,2 | 19 % | 0,0 | 0,4 | 0,5 | 707 | 2359 |
| `inventory:userCollection` | Q | 22 | 2 | 518,9 | 1596 | 11416,5 | 12 % | 0,0 | 523,2 | 1437,2 | 880 | 4785 |
| `friends:mine` | Q | 177 | 37 | 24,4 | 20 | 4318,6 | 5 % | 0,0 | 3,3 | 4,1 | 189 | 447 |
| `profiles:refreshMyRank` | M | 2 | 0 | 1805,4 | 5548 | 3610,8 | 4 % | 1,2 | 0,0 | 0,0 | 1073 | 1304 |
| `economy:claimAchievements` | M | 2 | 0 | 1564,4 | 4784 | 3128,7 | 3 % | 8,1 | 0,0 | 0,0 | 1928 | 2957 |
| `users:friends` | Q | 192 | 143 | 12,6 | 6 | 2409,8 | 3 % | 0,0 | 5,4 | 5,4 | 119 | 198 |
| `feed:bigPulls` | Q | 85 | 71 | 26,7 | 66 | 2273,4 | 2 % | 0,0 | 12,3 | 12,3 | 34 | 113 |
| `economy:burn` | M | 1 | 0 | 1821,3 | 5566 | 1821,3 | 2 % | 5,9 | 0,0 | 0,0 | 901 | 901 |
| `profiles:profile` | Q | 1 | 0 | 1632,6 | 5019 | 1632,6 | 2 % | 0,0 | 1,8 | 1,8 | 2355 | 2355 |
| `packs:revealPacks` | M | 10 | 0 | 161,7 | 76 | 1616,7 | 2 % | 351,7 | 0,2 | 0,4 | 330 | 696 |
| `listings:mine` | Q | 92 | 19 | 10,7 | 9 | 986,2 | 1 % | 0,0 | 2,7 | 6,8 | 186 | 402 |
| `packs:preparePacks` | M | 11 | 0 | 76,9 | 81 | 845,8 | 1 % | 183,7 | 6,9 | 11,0 | 545 | 1779 |
| `trades:history` | Q | 6 | 0 | 105,4 | 45 | 632,4 | 1 % | 0,0 | 7,4 | 11,2 | 251 | 481 |
| `trades:myTrades` | Q | 39 | 5 | 9,1 | 5 | 356,7 | 0 % | 0,0 | 0,9 | 1,8 | 167 | 297 |
| `profiles:rankPlan` | Q | 5 | 0 | 59,1 | 46 | 295,7 | 0 % | 0,0 | 4,3 | 4,3 | 177 | 200 |
| `users:heartbeat` | M | 62 | 0 | 3,8 | 2 | 233,0 | 0 % | 36,3 | 0,0 | 0,0 | 161 | 216 |
| `listings:open` | Q | 22 | 3 | 8,4 | 5 | 184,4 | 0 % | 0,0 | 0,8 | 0,8 | 178 | 283 |
| `missions:mine` | Q | 62 | 12 | 2,6 | 2 | 161,8 | 0 % | 0,0 | 0,4 | 0,4 | 139 | 214 |
| `users:me` | Q | 62 | 12 | 2,6 | 2 | 161,8 | 0 % | 0,0 | 0,8 | 2,2 | 137 | 209 |
| `economy:state` | Q | 61 | 12 | 2,6 | 2 | 157,1 | 0 % | 0,0 | 1,8 | 2,1 | 141 | 235 |
| `economy:history` | Q | 4 | 0 | 20,3 | 62 | 81,1 | 0 % | 0,0 | 12,9 | 12,9 | 207 | 276 |
| `profiles:saveRanks` | M | 5 | 0 | 14,9 | 29 | 74,7 | 0 % | 7,4 | 0,0 | 0,0 | 163 | 185 |
| `packs:revealPack` | M | 3 | 0 | 19,2 | 12 | 57,6 | 0 % | 22,7 | 1,1 | 1,2 | 222 | 246 |
| `trades:wishlistOf` | Q | 22 | 2 | 1,9 | 1 | 42,1 | 0 % | 0,0 | 0,1 | 1,6 | 122 | 159 |
| `missions:claim` | M | 3 | 0 | 10,9 | 5 | 32,7 | 0 % | 10,0 | 0,0 | 0,0 | 136 | 154 |
| `trades:propose` | M | 2 | 0 | 13,3 | 11 | 26,6 | 0 % | 1,6 | 0,0 | 0,0 | 245 | 300 |
| `games:roulette` | Q | 1 | 0 | 23,0 | 12 | 23,0 | 0 % | 0,0 | 7,0 | 7,0 | 172 | 172 |
| `packs:getSealedPack` | Q | 43 | 11 | 0,5 | 1 | 22,7 | 0 % | 0,0 | 0,6 | 1,1 | 131 | 212 |
| `packs:preparePack` | M | 2 | 0 | 10,1 | 14 | 20,2 | 0 % | 10,2 | 1,1 | 1,1 | 185 | 204 |
| `profiles:leaderboard` | Q | 2 | 0 | 10,0 | 23 | 19,9 | 0 % | 0,0 | 7,4 | 7,4 | 154 | 155 |
| `labFeedback:submit` | M | 4 | 0 | 4,9 | 4 | 19,5 | 0 % | 4,2 | 0,1 | 0,1 | 161 | 210 |
| `missions:claimBonus` | M | 1 | 0 | 5,6 | 3 | 5,6 | 0 % | 3,0 | 0,0 | 0,0 | 128 | 128 |
| `games:lobby` | Q | 1 | 0 | 5,2 | 3 | 5,2 | 0 % | 0,0 | 0,6 | 0,6 | 161 | 161 |
| `games:rouletteTick` | M | 5 | 0 | 0,9 | 1 | 4,3 | 0 % | 0,0 | 0,0 | 0,0 | 159 | 195 |
| `dropShots:attach` | M | 1 | 0 | 3,9 | 4 | 3,9 | 0 % | 0,4 | 0,0 | 0,0 | 128 | 128 |
| `survey:answered` | Q | 1 | 0 | 3,3 | 2 | 3,3 | 0 % | 0,0 | 0,0 | 0,0 | 184 | 184 |
| `dropShots:uploadUrl` | M | 1 | 0 | 3,3 | 2 | 3,3 | 0 % | 0,0 | 0,2 | 0,2 | 158 | 158 |
| `binders:mine` | Q | 7 | 0 | 0,4 | 1 | 3,1 | 0 % | 0,0 | 0,1 | 0,9 | 193 | 284 |
| `launch:status` | Q | 7 | 5 | 0,2 | 0 | 1,2 | 0 % | 0,0 | 0,1 | 0,1 | 66 | 271 |
| `dropShots:claim` | M | 2 | 0 | 0,4 | 2 | 0,9 | 0 % | 0,5 | 0,2 | 0,3 | 112 | 117 |
| `dropShots:forgetImage` | M | 1 | 0 | 0,6 | 2 | 0,6 | 0 % | 0,4 | 0,0 | 0,0 | 158 | 158 |
| `profiles:refreshRanks` | A | 5 | 0 | 0,0 | 0 | 0,0 | 0 % | 0,0 | 0,0 | 0,0 | 2243 | 4109 |
| `listings:expireTick` | M | 2 | 0 | 0,0 | 0 | 0,0 | 0 % | 0,0 | 0,0 | 0,0 | 163 | 163 |
| `dropShots:post` | A | 2 | 0 | 0,0 | 0 | 0,0 | 0 % | 0,0 | 0,0 | 0,0 | 737 | 1228 |

## V2 — `cardgamepriv-v2` (`good-gull-939`)

Fenêtre : 12/11 de 01:59 à 13:46 UTC (707 min), 1000 exécutions, 48 fonctions. Lu : 9,4 Mo. Écrit : 0,26 Mo. Erreurs : 0. Conflits d'écriture : 0.

| Fonction | Type | Appels | En cache | Lu / appel (Ko) | Docs / appel | Lu total (Ko) | Part | Écrit total (Ko) | Réponse moy. (Ko) | Réponse max (Ko) | ms moy. | ms p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `profiles:rankRow` | Q | 24 | 0 | 100,1 | 303 | 2402,3 | 26 % | 0,0 | 0,3 | 0,4 | 163 | 261 |
| `profiles:rankPlan` | Q | 141 | 67 | 13,6 | 13 | 1924,0 | 20 % | 0,0 | 2,3 | 2,3 | 81 | 160 |
| `users:friends` | Q | 35 | 0 | 20,8 | 12 | 729,7 | 8 % | 0,0 | 2,9 | 2,9 | 142 | 166 |
| `friends:mine` | Q | 41 | 1 | 17,4 | 19 | 715,2 | 8 % | 0,0 | 2,3 | 2,3 | 152 | 185 |
| `presse:current` | Q | 42 | 0 | 9,8 | 11 | 411,1 | 4 % | 0,0 | 1,0 | 1,6 | 142 | 165 |
| `deals:forYou` | Q | 2 | 1 | 146,5 | 420 | 293,0 | 3 % | 0,0 | 0,1 | 0,1 | 117 | 234 |
| `presse:start` | M | 15 | 0 | 19,2 | 13 | 287,4 | 3 % | 71,6 | 0,2 | 0,3 | 584 | 616 |
| `inventory:collectionFull` | Q | 1 | 0 | 275,0 | 844 | 275,0 | 3 % | 0,0 | 106,1 | 106,1 | 178 | 178 |
| `trades:myTrades` | Q | 42 | 1 | 6,1 | 4 | 255,8 | 3 % | 0,0 | 0,6 | 0,6 | 139 | 170 |
| `presse:strike` | M | 23 | 0 | 10,4 | 6 | 238,5 | 3 % | 66,8 | 0,4 | 0,5 | 119 | 148 |
| `inventory:userCollection` | Q | 1 | 0 | 189,5 | 583 | 189,5 | 2 % | 0,0 | 166,7 | 166,7 | 209 | 209 |
| `chat:inbox` | Q | 39 | 0 | 4,3 | 4 | 168,4 | 2 % | 0,0 | 0,4 | 0,4 | 142 | 167 |
| `games:rouletteTick` | M | 142 | 0 | 1,1 | 1 | 157,9 | 2 % | 2,8 | 0,0 | 0,0 | 150 | 163 |
| `listings:mine` | Q | 40 | 1 | 3,9 | 3 | 154,3 | 2 % | 0,0 | 0,0 | 0,0 | 149 | 189 |
| `users:me` | Q | 40 | 1 | 3,5 | 2 | 141,3 | 2 % | 0,0 | 1,2 | 1,2 | 137 | 163 |
| `missions:mine` | Q | 40 | 1 | 3,5 | 2 | 141,3 | 2 % | 0,0 | 0,4 | 0,4 | 138 | 165 |
| `economy:state` | Q | 40 | 1 | 3,5 | 2 | 141,3 | 2 % | 0,0 | 1,6 | 1,6 | 141 | 175 |
| `deals:cardPanel` | Q | 5 | 0 | 24,5 | 14 | 122,5 | 1 % | 0,0 | 0,1 | 0,1 | 150 | 170 |
| `packs:revealPack` | M | 4 | 0 | 28,5 | 12 | 114,0 | 1 % | 39,7 | 1,1 | 1,2 | 123 | 127 |
| `packs:preparePack` | M | 4 | 0 | 21,3 | 10 | 85,2 | 1 % | 24,2 | 1,1 | 1,2 | 188 | 255 |
| `seasons:advance` | M | 12 | 0 | 6,1 | 13 | 73,1 | 1 % | 0,0 | 0,0 | 0,0 | 10 | 17 |
| `profiles:saveRanks` | M | 6 | 0 | 12,0 | 21 | 71,9 | 1 % | 12,7 | 0,0 | 0,0 | 151 | 159 |
| `presse:cashOut` | M | 2 | 0 | 32,7 | 12 | 65,4 | 1 % | 10,2 | 0,5 | 0,6 | 120 | 124 |
| `challenges:create` | M | 1 | 0 | 31,7 | 22 | 31,7 | 0 % | 15,1 | 0,0 | 0,0 | 175 | 175 |
| `inventory:mineSince` | Q | 5 | 0 | 5,9 | 17 | 29,5 | 0 % | 0,0 | 2,2 | 3,5 | 151 | 168 |
| `games:roulette` | Q | 2 | 0 | 11,0 | 11 | 21,9 | 0 % | 0,0 | 3,2 | 3,2 | 150 | 153 |
| `economy:history` | Q | 1 | 0 | 19,8 | 62 | 19,8 | 0 % | 0,0 | 12,8 | 12,8 | 119 | 119 |
| `trades:history` | Q | 2 | 0 | 9,4 | 5 | 18,8 | 0 % | 0,0 | 0,4 | 0,4 | 138 | 162 |
| `users:heartbeat` | M | 4 | 0 | 4,4 | 2 | 17,8 | 0 % | 3,6 | 0,0 | 0,0 | 120 | 148 |
| `feed:bigPulls` | Q | 1 | 0 | 13,0 | 30 | 13,0 | 0 % | 0,0 | 12,9 | 12,9 | 12 | 12 |
| `seasons:status` | Q | 12 | 0 | 1,1 | 1 | 12,8 | 0 % | 0,0 | 0,0 | 0,0 | 13 | 17 |
| `trades:propose` | M | 1 | 0 | 12,5 | 9 | 12,5 | 0 % | 0,7 | 0,0 | 0,0 | 169 | 169 |
| `challenges:mine` | Q | 3 | 0 | 4,0 | 3 | 12,1 | 0 % | 0,0 | 0,4 | 1,1 | 123 | 149 |
| `push:reserveFull` | M | 1 | 0 | 10,7 | 4 | 10,7 | 0 % | 3,6 | 0,0 | 0,0 | 114 | 114 |
| `challenges:expire` | M | 1 | 0 | 8,6 | 16 | 8,6 | 0 % | 4,4 | 0,0 | 0,0 | 153 | 153 |
| `games:lobby` | Q | 3 | 1 | 2,7 | 2 | 8,0 | 0 % | 0,0 | 0,4 | 0,4 | 74 | 113 |
| `packs:getSealedPack` | Q | 9 | 1 | 0,8 | 1 | 6,8 | 0 % | 0,0 | 0,5 | 1,2 | 123 | 166 |
| `market:board` | Q | 2 | 1 | 1,8 | 1 | 3,6 | 0 % | 0,0 | 0,0 | 0,0 | 73 | 146 |
| `chat:page` | Q | 1 | 0 | 3,6 | 2 | 3,6 | 0 % | 0,0 | 0,0 | 0,0 | 107 | 107 |
| `chat:tail` | Q | 3 | 2 | 1,2 | 1 | 3,6 | 0 % | 0,0 | 0,0 | 0,0 | 48 | 143 |
| `push:markOk` | M | 2 | 0 | 1,5 | 2 | 3,0 | 0 % | 2,1 | 0,0 | 0,0 | 143 | 148 |
| `trades:wishlistOf` | Q | 1 | 0 | 2,1 | 1 | 2,1 | 0 % | 0,0 | 0,0 | 0,0 | 101 | 101 |
| `binders:mine` | Q | 1 | 0 | 0,6 | 2 | 0,6 | 0 % | 0,0 | 0,3 | 0,3 | 106 | 106 |
| `launch:status` | Q | 1 | 0 | 0,6 | 1 | 0,6 | 0 % | 0,0 | 0,1 | 0,1 | 114 | 114 |
| `profiles:refreshRanks` | A | 141 | 0 | 0,0 | 0 | 0,0 | 0 % | 0,0 | 0,0 | 0,0 | 254 | 362 |
| `listings:expireTick` | M | 47 | 0 | 0,0 | 0 | 0,0 | 0 % | 0,0 | 0,0 | 0,0 | 151 | 173 |
| `seasons:tick` | A | 12 | 0 | 0,0 | 0 | 0,0 | 0 % | 0,0 | 0,0 | 0,0 | 32 | 42 |
| `pushSend:send` | A | 2 | 0 | 0,0 | 0 | 0,0 | 0 % | 0,0 | 0,0 | 0,0 | 1816 | 1877 |
