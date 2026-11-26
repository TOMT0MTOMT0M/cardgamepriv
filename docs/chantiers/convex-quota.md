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

## Session n°2 — boosters (26/11 nuit, Tom + Claude) : v2.1.25-26, fiche `v2.1.26.md`
**Diagnostic** (convex-test, `reads.testlib.ts` compte lectures et écritures) : le coût venait des RELECTURES, pas des écritures. Joueur lu 3 / 6 / 31 / 61 fois par `preparePack` / `revealPack` / `preparePacks` ×10 / `revealPacks` ×10 (chaque `ctx.db.get` est facturé) ; écrit 1 fois par mutation (patchs regroupés au commit, vu dans les journaux : 9 documents écrits par `revealPack`). Requêtes abonnées relancées par un booster : `session:get` (il lui faut le joueur) et `myTrades` (2 joueurs ENTIERS par échange pour 2 noms) — 2 relances par booster (préparation + révélation).
**Fait** : joueur lu 1 fois par mutation (copie tenue par `patchLive`, `convex/liveUser.ts`) ; `myTrades` lit les noms dans `presence`. Écarté : regrouper les patchs (0 gain), sortir des champs du joueur (`session:get` se relancerait quand même, ≈ 2 % du régime).

| Prod, I/O par appel (lu + écrit) | avant (18 h 30-20 h 04 UTC, 1,6 h) | après (20 h 12-21 h 01 UTC hors mises en ligne, 0,5 h) |
|---|---|---|
| `packs:revealPack` | 154 appels · 38,9 Ko (lu 29,2) | 47 · 24,8 Ko (lu 14,8) |
| `packs:preparePack` | 67 · 20,3 Ko (lu 15,4) | 13 · 17,0 Ko (lu 12,1) |
| `packs:preparePacks` | 14 · 289 Ko (lu 263) | 5 · 136 Ko (lu 110) |
| `packs:revealPacks` | 4 · 459 Ko (lu 401) | 1 · 177 Ko (lu 119) |
| `trades:myTrades` | 99 · 8,6 Ko | 22 · 1,3 Ko |
| boosters, par heure | 8,4 Mo/h ≈ 0,20 GB/jour à ce rythme | 4,6 Mo/h ≈ 0,11 GB/jour (−45 %) |

- Même activité dans les deux fenêtres (≈ 97 `revealPack` / h). À activité égale (appels de la fenêtre « avant » × coût « après ») : boosters 13,2 → 7,6 Mo (−43 %), `myTrades` 0,85 → 0,13 Mo (−85 %) ; gain ≈ 4 Mo/h aux heures de jeu, au plus ≈ 0,1 GB/jour (≈ 3 GB/mois ≈ 0,65 $).
- Total hors migrations : 45,7 → 21,2 Mo/h, mais pas comparable sur 30 min : il est fait d'appels isolés de 2 à 6 Mo (`collectionFull`, `profiles:profile`, `claimCompletions`). Sans eux : 15,8 → 10,2 Mo/h.
- Compteur Convex le 26/11 à 22 h : jour 1,89 GB (5 mises en ligne, 1 sauvegarde, coûts uniques compris), mois 42,3 GB. Calcul (chez Tom, hors git) : `node .claude-tmp/regime-cout.mjs <relevés .jsonl> -- <début> <fin> [trou/trou]` dans `.wt-master`, sur `cout-convex-2026-11-26-19-03.jsonl` et `…-20-10.jsonl`.
- Plus gros postes restants (par appel, journaux du 26/11) : `economy:claimCompletions` 5,7 Mo (relit toute la collection via `collectionOf`), `profiles:profile` 2,6-4,2 Mo (collection du joueur regardé), `inventory:collectionFull` 2,6-3,1 Mo (rechargements après CHAQUE mise en ligne : 5 le 26/11), `profiles:refreshMyRank` jusqu'à 1,2 Mo, `profiles:rankRow` 170-340 Ko.

## Reste
- [x] Boosters (v2.1.25-26) : −45 % d'I/O mesuré, `myTrades` −85 % (tableau ci-dessus).
- [ ] Session Convex n°3 = IDÉES d'abord, rien codé : prompt prêt chez Tom, `.claude-tmp/prompt-session-convex-3.md` (Fable 5.2, effort medium, dossier racine). Cible : 1 GB/mois inclus (≈ 33 Mo/jour, ÷15) ; pistes qui peuvent changer le site ou le visuel, chacune avec gain chiffré, parade, risque, effort → `docs/chantiers/convex-pistes.md`, Tom choisit avant tout code. Postes à viser : `claimCompletions`, `profiles:profile`, `collectionFull` après une mise en ligne (la copie locale gardée 72 h devrait l'éviter : à comprendre), `refreshMyRank` / `rankRow`, `mineSince`, `session:get`.
- [ ] Vérifier le stockage après v2.1.24 dans le tableau de bord (≈ 325 Mo attendus au lieu de 385) — la CLI ne donne pas les octets stockés.
- [ ] Rétention `packOpens` à 7 j possible (aucun écran joueur) si le stockage approche 512 Mo.
- [ ] Remplir le staging avec un petit jeu de test au lieu de `rafraichir-staging-v2.cmd`.
