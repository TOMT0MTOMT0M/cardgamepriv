# Chantier — quota Convex (26/11/2026, Hugo)

## Fait
- Déploiements coupés par Convex (offre Free dépassée). Usage : Database Storage 512/512 MB, Database I/O 1/1 GB ; fichiers 22 MB/1 GB (les images ne sont pas en cause, illustrations sur R2).
- Cause du stockage : le staging `cardgamepriv-v2` (`good-gull-939`) contenait une copie complète de la prod (~367 MB contre ~385 MB pour la prod), et le quota est commun à l'équipe.
- Sauvegarde du staging : `sauvegardes/staging-avant-vidage-20261126.zip` (20 MB, hors git).
- Staging vidé : `inventory`, `packOpens`, `activityFeed`, `coinTx` (import d'un JSONL vide avec `--replace`). Prod non touchée.
- Forfait Starter pris par l'équipe → la prod est réactivée, mais les dépassements sont facturés. Le mail au support n'a plus lieu d'être.

## Vérifié
- `npx convex data --deployment good-gull-939 inventory|packOpens` : « There are no documents in this table ».

## À vérifier par Tom
- Le jeu se charge en prod ; la page Usage retombe vers ~385 MB.
- Poser un plafond de dépenses dans le tableau de bord Convex (Billing).
- Le lien V3 n'a plus d'inventaires / tirages / historique : normal.

## Reste (prochaine session, dédiée à Convex)
- [ ] Diagnostic I/O prod (40,6 GB ce mois pour 1 GB inclus) : `npx convex insights`, crons à 5 min, piste `purgeCards` / `remapCards` à vérifier.
- [ ] Rétention 30 j sur `packOpens` (114 MB) et `activityFeed` (41 MB) : migration + cron, après vérification des dépendances ; sauvegarde prod avant.
- [ ] Examiner `inventory` (187 MB).
- [ ] Remplir le staging avec un petit jeu de test au lieu de `rafraichir-staging-v2.cmd`.
