# Convex — pistes pour baisser la Database I/O (session Convex n°3, 26/11 soir) — IDÉES, rien n'est codé

**Choix de Tom (26/11, 23 h) : les recommandations.** Paquet A en entier (pistes 1 à 7, et 8 allégé sans changer la cadence), en 2-3 patchs live, sans rien de visible ni de migration. D'abord 2 et 5 (code du jeu seul : pas de sauvegarde à la mise en ligne), puis 1, 3, 4, 6, 7, 8. Ensuite la piste 9 en V3. Pas encore décidé : 8 à 30 min, 10, 11, 12-14, 15 (changement de jeu, avec Hugo).

## Compte rendu (26/11, Tom + Claude)
- **Fait** : code et mesures du 26/11 relus (`claimCompletions`, `profile`, `collectionFull` / `invStore.ts`, `mineSince`, classement, boosters, présence) ; doc Convex (sauvegardes, cache, prix) ; 15 pistes chiffrées ci-dessous (`7fb5405`). Rien de codé.
- **Vérifié** : `coutBoosters.test.ts` vert (master) ; 19 patchs ont touché `convex/` du 14 au 26/11, dont 11 le schéma ou les migrations.
- **À vérifier par Tom** : compteur du 27/11 (`npx convex deployment usage`), pour connaître le vrai facteur jour / soirée.
- **Reste** : ~~patch 1 = pistes 2 + 5~~ en ligne le 26/11 (v2.1.31, `docs/chantiers/v2.1.31.md` ; seuil de la piste 5 : 10 lignes hors marge, pas 5) ; ~~patch 2 = 1, 3, 4, 6, 7, 8 allégé~~ en ligne le 26/11 à 23 h 26 (v2.1.32, `docs/chantiers/v2.1.32.md`) ; chiffres de ce document à recaler avec un relevé plus long (celui du 26/11 au soir était trop lent).
- **Patch 2 (v2.1.32), écarts au plan** : piste 3, la copie de la collection d'un ami est gardée en mémoire le temps de la session (pas sur l'appareil) ; piste 6, purge à 2 jours seulement, champs des boosters non allégés (`cardName` lu par le fil, Discord et le client) ; piste 7, seulement `feed:bigPulls` (la roulette et `cardPanel` ne lisent pas le fil) ; piste 8 sans changer la cadence. Sur la V3, les titres uniques des primes se basent sur les cartes vérifiées (`titres:claim` pour les autres). Vérifié : 281 tests sur `master`, 305 sur `v2`, profil léger = relecture complète sur 8 suites aléatoires. À vérifier par Tom : relevé du 27/11 (`node scripts/cout-convex.mjs`).

Ce que Convex facture (doc officielle, `.claude/rules/convex.md`) : chaque document lu ou écrit par une fonction, index compris, sauf quand une requête est servie par le cache (rien n'a changé depuis le dernier calcul avec les mêmes arguments). Une requête abonnée est recalculée dès qu'un document qu'elle a lu change. Une sauvegarde (`convex export` ou bouton « Backup now ») relit toute la base ; Starter n'a pas de sauvegarde automatique, et aucune option ne limite l'export à quelques tables.

## Point de départ (mesures du 26/11, `convex-quota.md`)

Convention de `convex-quota.md` : débit horaire de la soirée × 24 h. C'est le haut de la fourchette (la nuit est plus calme) ; le compteur du 27/11 dira le vrai facteur. Les gains en % restent valables.

| Poste | Mo/h (soirée) | Mo/jour (× 24) | Part |
|---|---|---|---|
| Gros appels isolés : `collectionFull` (≈ 2,5 Mo × 1,5/h), `claimCompletions` (5,7 Mo × 0,8/h), `profiles:profile` (1,8-4,2 Mo × 1,2/h), `rankRow` / `refreshMyRank` | ≈ 11 | ≈ 264 | 45 % |
| Boosters (2 mutations par booster, ≈ 42 Ko ; ≈ 100-120 boosters/h le soir) | 4,6 | 110 | 19 % |
| `inventory:mineSince` (12,5 Ko × ≈ 140/h) | 1,7 | 41 | 7 % |
| Cron du classement (`rankPlan` 82 Ko + `saveRanks` 110 Ko, toutes les 10 min) | 1,1 | 27 | 5 % |
| Présence et liste du club (`users:friends`, `friends:mine`, `heartbeat`) | 1,1 | 26 | 4 % |
| Fils communs (`feed:bigPulls`, `games:roulette`, `deals:cardPanel`, `leaderboard`) | 1,0 | 24 | 4 % |
| `session:get` (3,1 Ko × ≈ 200/h) | 0,6 | 14 | 2 % |
| Sauvegarde du lanceur (≈ 82 Mo ; 19 patchs ont touché `convex/` du 14 au 26/11, ≈ 1 par jour) | — | ≈ 82 | 14 % |
| **Total** | **≈ 21** | **≈ 590** | ≈ 17,7 GB/mois ≈ **3,7 $/mois** au-delà de l'inclus |

Cible : 33 Mo/jour (1 GB/mois), soit ÷ 18. Conclusion en bas : on peut descendre à ≈ 100-150 Mo/jour sans toucher au jeu ; en dessous, c'est le nombre de boosters ouverts qui fixe le plancher.

## Tableau des pistes (classées par gain / effort)

| n° | Piste | Gain Mo/jour | Visible pour le joueur | Effort | Live ou V3 |
|---|---|---|---|---|---|
| 1 | Primes de complétion vérifiées sur les seuls ensembles réclamés | ≈ 100 | rien | petit | live |
| 2 | Copie locale de la collection qui ne vieillit plus (+ raison de chaque relecture complète dans les journaux) | ≈ 80 | rien | petit | live (client seul) |
| 3 | Profil d'un autre joueur sans relire sa collection ; sa collection seulement à la demande, suivie par différence | ≈ 45 | rien (1 s d'attente la 1re fois sur la collection d'un ami) | petit-moyen | live |
| 4 | Sauvegarde seulement quand le schéma ou une migration change | ≈ 35 | rien | petit | live (lanceur) |
| 5 | `mineSince` repart de la dernière révision à chaque réponse | ≈ 30 | rien | petit | live (client seul) |
| 6 | Boosters scellés allégés et effacés 2 jours après ouverture | ≈ 10 + 30 sur la sauvegarde | rien | petit | live |
| 7 | Fils communs en un seul petit document | ≈ 14 | rien | petit | live |
| 8 | Cron du classement allégé (sans relire toutes les lignes) puis toutes les 30 min | ≈ 12 + 10 | un peu : lignes des autres à jour en 30 min au lieu de 10 | petit | live |
| 9 | Un booster = une mutation (le suivant est scellé d'avance) | ≈ 45 | rien (réserve : voir fiche) | moyen | live possible, mieux V3 |
| 10 | Présence moins bavarde (statut et « en ligne » écrits moins souvent) | ≈ 14 | un peu : statut moins en direct | petit | live |
| 11 | Mises en ligne Convex groupées une fois par semaine | ≈ 25 | un peu : correctifs serveur le lundi | nul (organisation) | live |
| 12 | Document joueur coupé en « chaud » (boosters, pièces) et « froid » | ≈ 15 | rien | gros | V3 |
| 13 | Collection compacte (une ligne par paquet de cartes au lieu d'une par carte) | ≈ 30 de plus après 1-3, stockage −170 Mo | rien | gros | V3 |
| 14 | Sauvegarde incrémentale (complète une fois par mois, sinon seulement ce qui a changé) | ≈ 6 | rien | gros | V3 |
| 15 | (changement de jeu) recharge des boosters plus lente ou ouverture par 5 | jusqu'à ≈ 35 | beaucoup | petit | à décider |

Les gains ne s'additionnent pas toujours (9 et 12 visent les mêmes octets) : les totaux des paquets en tiennent compte.

## Fiches

### 1. Primes de complétion vérifiées sur les seuls ensembles réclamés (`economy:claimCompletions`)
- Mécanisme : aujourd'hui, réclamer une prime relit toute la collection (17 000 documents, 5,7 Mo) pour savoir quels albums sont complets. Le client le sait déjà (il calcule les primes en attente avec sa copie locale) : il envoie les ids des ensembles, et le serveur vérifie chaque carte de ces ensembles par une petite lecture d'index (`by_user_card_rarity`, joueur + carte, `.first()`). Un album de 12 cartes = 12 lectures ≈ 4 Ko.
- Gain : 5,7 Mo → ≈ 20 Ko par appel. Mesuré 2 appels en 2,6 h → ≈ 4,4 Mo/h ≈ 100 Mo/jour (hypothèse : même rythme toute la journée). ≈ 17 % du total.
- Joueur : rien. Ensemble envoyé mais pas complet → refusé comme aujourd'hui.
- Risque : aucun pour les pièces (le serveur revérifie tout). Vieux onglet sans le nouvel argument → ancien chemin (argument `v.optional`).
- Effort : petit, patch live, schéma inchangé.

### 2. Copie locale de la collection qui ne vieillit plus (`inventory:collectionFull`)
- Mécanisme : la copie gardée sur l'appareil (`src/core/net/invStore.ts`) expire 72 h après la dernière lecture COMPLÈTE, même si elle a été suivie par différence entre-temps ; elle est liée au jeton de session (nouvelle connexion = relecture) ; IndexedDB qui met plus de 1,5 s à répondre (Safari) = relecture. Chaque relecture coûte 2,5 à 6,4 Mo. On garde la date de la dernière synchronisation, une clé par joueur, un filet de 30 jours, et 4 s d'attente. Avant tout, `collectionFull` reçoit un argument `why` (« pas de copie », « expirée », « autre session », « trop de changements ») : les journaux diront enfin pourquoi les joueurs rechargent après une mise en ligne (5 relectures le 26/11, à comprendre).
- Gain : ≈ 1,5 relecture/h × 2,5 Mo ≈ 4 Mo/h ≈ 96 Mo/jour aujourd'hui → ≈ 15 Mo/jour (nouveaux appareils, filet mensuel) : ≈ −80 Mo/jour (hypothèse sur le rythme, à confirmer par `why`).
- Joueur : rien (démarrage un peu plus rapide).
- Risque : une écriture d'inventaire qui échapperait à `rev` / `dropInv` resterait invisible jusqu'au filet (30 j au lieu de 3) ; même hypothèse que le classement par différence, déjà tenue par les tests. Parade : monter `EPOCH` à chaque migration qui touche l'inventaire.
- Effort : petit, client seul (plus l'argument `why` côté serveur), patch live, schéma inchangé.

### 3. Profil d'un autre joueur sans relire sa collection (`profiles:profile`)
- Mécanisme : ouvrir un profil relit toute la collection du joueur regardé (1,8 à 4,2 Mo) pour des statistiques déjà gardées ailleurs : `rankRows.stats` (à jour via `statsCached`), complétion par thème dans `rankInc.th` (à vérifier : les secrètes y sont exclues), meilleur drop par l'index `by_user_rarity` (seulement les lignes de l'étoile la plus haute). La collection de l'ami n'est lue que si l'écran la montre, puis suivie par différence (`userCollectionSince`, même principe que `mineSince`) avec une copie par ami sur l'appareil.
- Gain : ≈ 1,2 profil/h × 1,8 Mo ≈ 2,1 Mo/h ≈ 50 Mo/jour → ≈ 5 : ≈ −45 Mo/jour.
- Joueur : rien sur le profil ; la collection de l'ami arrive 1 s plus tard la 1re fois (parade : tuiles d'attente, déjà en place), instantanée ensuite.
- Risque : statistiques du profil légèrement différentes si `rankInc.th` ne compte pas comme `THEMES` (test d'égalité à écrire avant). Vieux onglet : l'ancienne requête reste.
- Effort : petit-moyen, live, schéma inchangé.

### 4. Sauvegarde seulement quand le schéma ou une migration change
- Mécanisme : la sauvegarde du lanceur (`convex export`, ≈ 82 Mo, toute la base) part dès que `convex/` change. Un patch qui ne change que du code se défait en remettant l'ancien code : les données ne bougent pas. On ne garde la sauvegarde que si `convex/schema.ts`, `convex/migrations.ts` ou la liste des migrations du lanceur change (11 patchs sur 19 du 14 au 26/11).
- Gain : ≈ 40 % des sauvegardes → ≈ 35 Mo/jour au rythme de novembre.
- Joueur : rien.
- Risque : une fonction boguée qui écrit de mauvaises données sans migration (ex. : pièces mal créditées) n'aurait pas de sauvegarde juste avant. Parade : Tom peut forcer la sauvegarde (variable du lanceur), et les journaux `coinTx` / `invGone` permettent de réparer à la main.
- Effort : petit, lanceurs seulement.

### 5. `mineSince` repart de la dernière révision à chaque réponse
- Mécanisme : l'abonnement à la collection relit toutes les lignes écrites depuis sa révision de départ, et ne repart d'une révision récente qu'au-delà de 60 lignes (`INV_REBASE_ROWS`) : en moyenne 36 documents relus (12,5 Ko) à chaque booster pour 5 cartes nouvelles. Avec un seuil de 5 lignes, chaque relance relit ≈ 5-10 documents.
- Gain : 12,5 → ≈ 3 Ko par appel ; 1,7 → 0,4 Mo/h ≈ −30 Mo/jour.
- Joueur : rien.
- Risque : un réabonnement de plus par booster (1 appel de fonction, 1 M/mois inclus, ≈ 700 k utilisés en novembre : à surveiller). Marge de 30 s gardée (`invDiff.ts`).
- Effort : petit, client seul (aucune sauvegarde au lanceur), live.

### 6. Boosters scellés allégés et effacés 2 jours après ouverture (`packOpens`)
- Mécanisme : chaque booster est écrit, relu deux fois et réécrit en entier (≈ 2 Ko : nom, thème, sous-thème de chaque carte, recalculables depuis le catalogue), puis gardé 30 jours (114 Mo de stockage, ≈ 30 % de ce que relit chaque sauvegarde). Aucun écran joueur ne lit les boosters ouverts (seulement l'admin : 10 derniers). On n'écrit plus que l'id, l'étoile, le tirage de brillance et le numéro ; la requête du booster scellé rajoute le reste depuis le catalogue ; la purge passe à 2 jours.
- Gain : ≈ −4 Ko par booster (≈ 10 Mo/jour) ; stockage −100 Mo ; sauvegarde 82 → ≈ 57 Mo (≈ −25 Mo/jour au rythme actuel, −10 si la piste 4 est faite).
- Joueur : rien (l'admin voit 2 jours d'historique au lieu de 30 ; les pièces restent dans `coinTx`, les gros tirages dans le fil).
- Risque : vieux onglet qui lit `cardName` dans un booster scellé → la requête le renvoie toujours. Schéma : `cardName`, `themeId`, `subthemeId` passent en `v.optional` (élargissement compatible).
- Effort : petit, live.

### 7. Fils communs en un seul petit document (`feed:bigPulls`, `games:roulette`, `deals:cardPanel`)
- Mécanisme : ces requêtes abonnées relisent 20 lignes du fil (≈ 17 Ko) chez chaque joueur à chaque gros tirage de n'importe qui. Un document « derniers gros tirages » tenu à jour à l'insertion (≈ 3 Ko, liste compacte) suffit ; même idée pour la roulette du jour.
- Gain : ≈ 0,6 Mo/h ≈ −14 Mo/jour.
- Joueur : rien.
- Risque : faible ; l'ancienne requête reste pour les vieux onglets.
- Effort : petit, live, une table de plus (`v.optional` inutile : table neuve).

### 8. Cron du classement allégé, puis toutes les 30 min
- Mécanisme : toutes les 10 min (dès qu'un joueur est là), `rankPlan` relit toutes les lignes du classement avec leurs statistiques (≈ 2 Ko chacune) et `saveRanks` les relit encore pour le titre « Numéro un ». On garde le meilleur score actuel dans un seul document (1 lecture au lieu de 45) et on met la date et la signature de chaque ligne dans une table légère. Puis cadence 30 min.
- Gain : allégement ≈ −12 Mo/jour (rien de visible) ; 30 min : encore ≈ −10 Mo/jour.
- Joueur : à 30 min, les lignes des AUTRES sont à jour en 30 min au plus (la mienne l'est toujours : `refreshMyRank` à l'ouverture du classement). Parade : « mis à jour il y a x min » sous le classement.
- Risque : faible ; le filet hebdomadaire reste.
- Effort : petit, live, une table neuve.

### 9. Un booster = une mutation (le suivant est scellé d'avance)
- Mécanisme : chaque booster coûte deux mutations (`preparePack` 17 Ko pour le tirage, `revealPack` 25 Ko pour le crédit), chacune lisant et réécrivant le joueur et sa présence, et chacune relançant `session:get` et `mineSince` chez lui. En ouvrant un booster, la même mutation scelle tout de suite le suivant du même type (si la réserve le permet) : le prochain clic n'a plus besoin de `preparePack`. Les inventaires relus au tirage servent aussi au crédit.
- Gain : ≈ −40 % sur les boosters (≈ 42 → 25 Ko) et la moitié des relances de `session:get` : ≈ −45 Mo/jour.
- Joueur : rien à l'écran (animation identique, déjà à 0 ms). La réserve baisse d'un booster dès l'ouverture du précédent. Parade : compter le booster scellé dans la réserve affichée ; changer de thème garde le booster scellé pour la prochaine fois (c'est déjà le cas d'un booster scellé non ouvert aujourd'hui).
- Risque : triche si le booster scellé pouvait être jeté et retiré : il ne l'est jamais (débité au scellage, comme aujourd'hui). Recharge : débiter plus tôt fait repartir la recharge plus tôt (un peu favorable au joueur) — à valider comme petit changement de règle. Vieux onglet : `preparePack` reste.
- Effort : moyen (`packs.ts`, client des boosters), live possible ; mieux en V3 (les sachets par thème y changent déjà ce code).
- **(27/11) FAIT en V3** (branche `v3-boosters`, fiche `packs-evenement.md`). `packs:openPack` crédite et scelle d'avance le suivant de la même sorte ; le client le sert sans appel. Règle retenue (au lieu de « débiter au scellage ») : le booster d'avance est RÉSERVÉ dans la réserve (`packAhead`, `ev.ahead`) et débité à son ouverture → la réserve affichée ne change pas de sens, la recharge non plus ; jamais jeté (anti-reroll), rendu à la prochaine ouverture de sa sorte. Plus d'abonnement `getSealedPack` (lecture unique `sealedMine` au démarrage). `preparePack` / `revealPack` gardés pour les vieux onglets.
- **Mesure** (`convex/coutBoosters.test.ts`, base simulée, un booster en régime établi) : AVANT 2 mutations, 6,8 Ko lus + relances `session:get` ×2 et `getSealedPack` ×2 6,7 Ko = 13,5 Ko, 18 documents écrits ; APRÈS 1 mutation, 4,8 Ko lus + `session:get` ×1 3,0 Ko = 7,8 Ko, 16 documents écrits → **−43 % lu, −2 écritures (joueur, présence) par booster**. Avec l'ancien code (preparePack relisait le booster inséré : 3,4 Ko au lieu de 2,3) l'AVANT réel était ≈ 14,1 Ko → ≈ −45 %. Empreinte de la base des anciens chemins inchangée (`e6a4c9ca0f244caf`). À confirmer en prod par `node scripts/cout-convex.mjs` une semaine après la sortie.

### 10. Présence moins bavarde
- Mécanisme : chaque booster écrit deux statuts (« Ouvre un… », « Contemple son tirage ») dans la présence, et le battement de cœur la réécrit toutes les 4 min : chaque écriture relance la liste du club (13 Ko, 26 documents) chez tous ceux qui l'ont ouverte. On n'écrit plus « Contemple son tirage », et `lastSeenAt` toutes les 10 min (« en ligne » = vu depuis moins de 12 min).
- Gain : ≈ −14 Mo/jour (hypothèse : moitié des relances de `users:friends` / `friends:mine`).
- Joueur : un peu : statut moins en direct, « en ligne » qui retombe plus tard. Parade : le statut garde « Ouvre un booster… » ; texte « actif récemment » au lieu de « en ligne ».
- Risque : nul pour les données.
- Effort : petit, live.

### 11. Mises en ligne Convex groupées une fois par semaine
- Mécanisme : chaque mise en ligne qui touche `convex/` coûte une sauvegarde (82 Mo), les migrations (0,6 Mo) et le redémarrage de tous les abonnements des joueurs. Les patchs client seul (images, textes, interface) continuent au jour le jour ; ceux qui touchent `convex/` attendent le lundi, sauf urgence.
- Gain : de ≈ 1 sauvegarde par jour à 1 par semaine : ≈ −25 à −70 Mo/jour selon ce que donne la piste 4.
- Joueur : un peu : un correctif côté serveur peut attendre quelques jours. Parade : l'urgence (perte de cartes, blocage) passe tout de suite.
- Risque : nul ; c'est de l'organisation (`/patch`).
- Effort : nul.

### 12. Document joueur coupé en « chaud » et « froid » (V3)
- Angle différent de celui écarté le 26/11 (qui visait `session:get`) : ici, on vise les mutations. Chaque booster lit et réécrit le joueur entier (2,8 Ko) deux fois. Les champs écrits par les boosters et les pièces (réserve, pièces, pity, compteurs, missions) passent dans un petit document (≈ 0,6 Ko) ; cosmétiques, appareils, profil, Avent, succès réclamés restent dans `users`.
- Gain : ≈ −8 Ko par booster (−4 après la piste 9) : ≈ −15 Mo/jour. `session:get` ne change pas (il lit les deux).
- Joueur : rien.
- Risque : gros chantier (toutes les mutations qui écrivent ces champs), migration, double lecture pendant 2 patchs ; vieux onglets pendant la mise en ligne.
- Effort : gros, V3.

### 13. Collection compacte (V3)
- Mécanisme : une ligne d'inventaire coûte ≈ 350 octets lus (document + index) pour ≈ 30 octets utiles. Ranger la collection par paquets (un document par joueur et par sous-thème ou par tranche de ≈ 100 cartes, contenu compacté) divise par ≈ 40 toute lecture de collection entière (17 000 cartes : 6 Mo → ≈ 150 Ko) : relecture complète, profil avec collection, filet du classement, sauvegarde, migrations.
- Gain : ≈ −30 Mo/jour de plus après les pistes 1-3 ; stockage `inventory` 187 → ≈ 15 Mo ; sauvegarde ≈ −20 Mo. En contrepartie, un booster réécrit 3-5 paquets (≈ 1 Ko chacun) au lieu de 5 lignes : ≈ +15 % par booster.
- Joueur : rien.
- Risque : le plus gros de la liste : tout code qui touche l'inventaire (échanges, marché, forge, offres, classement par différence, copie locale) est réécrit ; migration de 31 Mo de données. Parade : ancienne table gardée en lecture seule deux patchs, comparée à la nouvelle.
- Effort : gros, V3.

### 14. Sauvegarde incrémentale (V3)
- Mécanisme : une sauvegarde complète par mois, et à chaque mise en ligne seulement ce qui a changé depuis : lignes d'inventaire par `rev` (index `by_user_rev`, joueur par joueur), traces `invGone`, joueurs, échanges et `coinTx` récents, par une requête interne de lecture qui écrit dans `sauvegardes/`.
- Gain : sauvegardes ≈ 82 Mo → ≈ 2-3 Mo par mise en ligne (après 4 et 11 : ≈ −6 Mo/jour).
- Joueur : rien.
- Risque : une restauration en deux temps doit être testée sur le staging (une restauration Convex efface tout). Ne vaut le coup que si les pistes 4 et 11 ne suffisent pas.
- Effort : gros.

### 15. (changement de jeu, à décider) Moins de boosters ouverts un par un
- Mécanisme : après les pistes 1-14, le coût restant est surtout proportionnel au nombre de boosters (≈ 20 Ko chacun, ≈ 100-120 par heure le soir). Deux leviers de jeu : recharge de 5 à 10 min (÷ 2 boosters) ou ouverture par 5 quand la réserve est pleine (mesuré le 26/11 : une série coûte ≈ 31 Ko par booster, contre 42 un par un).
- Gain : jusqu'à ≈ −35 Mo/jour (recharge ÷ 2 ; boosters et relances qu'ils provoquent).
- Joueur : beaucoup : moins de boosters ou rythme d'ouverture changé. Change l'économie (validation de Hugo, `economie.md`).
- Effort : petit côté code ; décision de jeu.

## Trois paquets

Totaux en Mo/jour au régime de soirée × 24 (haut de fourchette), sauvegardes au rythme de novembre. $/mois = (GB/mois − 1) × 0,22.

| Paquet | Pistes | Mo/jour | GB/mois | $/mois |
|---|---|---|---|---|
| Aujourd'hui | — | ≈ 590 | ≈ 17,7 | ≈ 3,7 |
| A. Rien de visible | 1, 2, 3, 4, 5, 6, 7, 8 (allégement seul) | ≈ 240 | ≈ 7,2 | ≈ 1,4 |
| B. Visible avec parade | A + 8 (30 min), 9, 10, 11 | ≈ 145 | ≈ 4,4 | ≈ 0,75 |
| C. Drastique | B + 12, 13, 14 | ≈ 105 | ≈ 3,2 | ≈ 0,5 |
| C + changement de jeu | C + 15 | ≈ 75 | ≈ 2,3 | ≈ 0,3 |

- A : les gros appels isolés tombent de ≈ 264 à ≈ 30 Mo/jour, la sauvegarde de 82 à ≈ 33. Tout est en patch live, sans migration, surtout côté client (pistes 2 et 5 : aucune sauvegarde à la mise en ligne).
- B : les boosters passent de ≈ 100 à ≈ 60, cron et présence ÷ 2, une sauvegarde par semaine.
- C : ce qui reste est le prix d'un booster (≈ 55 Mo/jour) et des abonnements de base (≈ 40).
- La cible de 1 GB/mois (33 Mo/jour) n'est pas tenue même en C : au × 24, les abonnements de base des joueurs connectés (≈ 40 Mo/jour) la dépassent déjà sans un seul booster. Si la journée réelle vaut ≈ 60 % du × 24 (à lire sur le compteur du 27/11), C + 15 tombe vers 1,35 GB/mois et C vers 2 GB (≈ 0,2 $/mois).
- Ordre de grandeur de l'enjeu : aujourd'hui ≈ 3,7 $/mois ; le paquet A seul ramène à ≈ 1,4 $.

## Écartées
- Regrouper les écritures d'une mutation : Convex les regroupe déjà au commit (mesuré le 26/11, 0 gain).
- Sortir des champs du joueur pour `session:get` : il se relancerait quand même (≈ 2 % du régime) ; la piste 12 vise les mutations, pas cette requête.
- Classement, fil ou profils servis en fichiers statiques sur R2 : les fabriquer relit autant la base que les requêtes, qui profitent déjà du cache Convex ; il faudrait une clé R2 dans Convex et des actions en plus, pour moins de 5 Mo/jour.
- Collection d'un ami fournie par son propre appareil (envoyée sur R2) : 0 lecture, mais un client modifié afficherait une fausse collection.
- Calculer côté client sans vérification serveur (primes, succès) : triche ; la piste 1 garde la vérification.
- Passer au forfait Professional ou à Convex auto-hébergé : payant ou un serveur à tenir.
- Sauvegarde par le bouton « Backup now » du tableau de bord : relit aussi toute la base (doc « Backup & Restore »), même coût que `convex export`.
- Retirer d'autres index d'`inventory` (`by_card_rarity`, `by_user_rarity`) : servent à « qui possède cette carte » et aux échanges ; gain surtout en stockage.
- Couper les abonnements plus tôt quand l'onglet est caché (aujourd'hui 60 s) : chaque retour relance tous les abonnements ; sans mesure du nombre de retours par heure, on ne sait pas si couper plus tôt coûte ou rapporte. À mesurer si A et B ne suffisent pas.
