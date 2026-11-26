# Chantier — quota Convex (26/11/2026, Hugo puis Tom)

## Fait
- (Hugo) Offre Free dépassée → staging `good-gull-939` vidé (sauvegarde `sauvegardes/staging-avant-vidage-20261126.zip`), forfait Starter pris (dépassements facturés). Ne plus lancer `rafraichir-staging-v2.cmd`.
- (Tom + Claude, soir) Diagnostic I/O par les journaux de fonctions (`npx convex logs --jsonl` : octets lus par exécution ; `insights` ne montre que les conflits OCC). Avant, 65 min, 60,8 Mo ≈ 1,35 GB/jour : cron du classement 37 % (collection entière relue à chaque booster, jusqu'à 17 700 lignes = 5,9 Mo, filet 24 h = 43 Mo/jour, `rankPlan` 38 Mo/jour même la nuit), client V1 de Nytrox 29 % (`myCollection`, lien `fix-retours-live-01`), `collectionFull` 12 % (copie locale jetée à chaque patch), boosters 12 %, mises en ligne ≈ 67 Mo (`remapCards` / `i18nMessages` / `markBigPulls` relisaient tout), sauvegarde `convex export` ≈ 82 Mo par patch.
- v2.1.21 : classement par différence (`convex/rankInc.ts`, table `rankInc`, `invGone.born`, `resyncRarities` supprime puis recrée), `rankPlan` par la présence (rien si personne depuis 20 min), cron 10 min ; copie locale gardée entre versions (époque `copie-1`, 72 h) ; tampons sur les 3 migrations ; rétention 30 j (`migrations:purgeOld` + cron 04:30 UTC) ; sauvegarde du lanceur seulement si `convex/` change.
- v2.1.22 / v2.1.23 : MP du bot à l'autre après chaque mise en ligne prod (`discordBot:prevenirEquipe`, `scripts/prevenir-equipe.mjs`).
- Lien V1 `fix-retours-live-01` supprimé de Cloudflare Pages (page noire tentée : Cloudflare ne rend pas le nom → supprimée aussi).

## Vérifié
- typecheck · 272 tests (master) / 294 (v2) ; 320 calculs par différence = relecture complète ; 3 000 lignes + 1 booster : 733 Ko → 7 Ko.
- Prod après (41 min, régime, hors migrations et coûts uniques) : ≈ 16 Mo/h ≈ 0,38 GB/jour (avant 56 Mo/h) ; classement 20,7 → 1,4 Mo/h ; `myCollection` 0 ; `collectionFull` 0 en régime. Coûts uniques vus : 1er calcul complet par joueur (6 × ≈ 3,4 Mo), `collectionFull` une fois par joueur après v2.1.21 (4 × 3,3 Mo), 2e passage des migrations (v2.1.22).
- v2.1.23 : pas de sauvegarde, 5 migrations « skipped », MP « Hugo : envoyé ». Compteur : jour 1,20 → 1,63 GB (3 sauvegardes, migrations, coûts uniques compris) ; mois 41,6 → 42,0 GB.
- Stockage inchangé (≈ 385 Mo ; plus vieilles lignes du 07/11 : la rétention commence à libérer le 07/12).

## À vérifier par Tom
- Demain : `npx convex deployment usage` → jour complet attendu ≈ 0,4 GB (contre 1,6). Sinon, relire les journaux (`npx convex logs --history 1000 --jsonl --success`).
- Plafond (alerte seulement) : `npx convex deployment usage-limits set --metric databaseIoGb --window day --type warning --limit 0.5`.

## Seconde passe (26/11 soir, doc officielle et forum Convex uniquement)
- Règles retenues → `.claude/rules/convex.md` (section « Coût ») ; mesure : `node scripts/cout-convex.mjs` (I/O par fonction, chaque semaine et avant / après chaque lot).
- Doc « Limits » : chaque index est facturé comme une copie de la table. `inventory` 187 Mo = données (≈ 31 Mo) + 5 index ; `packOpens` 114 Mo = données + 3 index. v2.1.24 (tag `v2.1.24`, `40254a3` ; v2 `2753a6a`) retire `inventory.by_user` et `packOpens.by_userId`, doublons d'un index plus long (collection entière : `invOf`, même ordre). Attendu ≈ −60 Mo de stockage, −1/6 des écritures d'index d'inventaire. En ligne le 26/11 vers 20 h, sans erreur, MP « Hugo : envoyé ».
- Invalidation par document (pas par champ) : toute écriture sur `users` relance chaque requête qui le lit → piste n°1 pour les boosters.

## Reste
- [ ] Boosters = 1er poste (≈ 45 % du régime) : le document joueur (2,7 Ko) est relu et réécrit plusieurs fois par booster, et chaque écriture relance `session:get` / `myTrades` (≈ 130 et 75 fois/h). Session dédiée : mesurer (`scripts/cout-convex.mjs`), comparer avant d'écrire, sortir les champs qui bougent à chaque booster dans un document à part (comme `presence`).
- [ ] Vérifier le stockage après v2.1.24 dans le tableau de bord (≈ 325 Mo attendus au lieu de 385).
- [ ] Rétention `packOpens` à 7 j possible (aucun écran joueur) si le stockage approche 512 Mo.
- [ ] Remplir le staging avec un petit jeu de test au lieu de `rafraichir-staging-v2.cmd`.
