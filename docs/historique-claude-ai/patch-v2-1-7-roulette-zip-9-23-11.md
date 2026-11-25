# Patch v2.1.7 (23/11) — nerf roulette, nouvelles 6★, zip 9

## État
- Prêt, **pas encore en ligne**. Branche `patch-v2.1.7` (`6f0dbd7`), worktree `.wt-master` remis sur `master`.
- `v2` : même contenu (`710de3a`, textes roulette adaptés à la roulette couleurs V3 + test `rouletteColors` ajusté) puis `merge -s ours patch-v2.1.7` (`1ad9102`). Non poussée.
- Images du zip 9 copiées aussi dans `public/art` de la V3.

## À lancer par Tom (dans l'ordre)
1. `.wt-master\METTRE-EN-LIGNE-v2.1.7.cmd` (sauvegarde, tag, push master, prod + migrations resyncRarities / purgeCards, R2).
2. `lanceurs\push.cmd` (pousse `v2`).

## Contenu
- **Roulette** : 1 seul numéro par tirage ; mise = 1 500 pièces, 2 cartes 5★ ou 1 carte 6★ (plus de 4★). Toucher un autre numéro remplace le choix. Les mises déjà posées à 2-3 numéros restent valables jusqu'au tirage.
- **Nouvelles 6★** : Rocket (Galactik Football, `pop-rocket-galactik-football`, affichée « Rocket ») et Mount & Blade (`jv-indes-action-recents-mount-and-blade`). Patchs `donnees/patchs/Patch-pop-ajouts-23-11.xlsx` et `Patch-jv-ajouts-23-11.xlsx` (make-jeux-video.py lit maintenant des patchs).
- **6★** (`RERATE_23_11`) : Harvey Specter, Dwayne Johnson.
- **Retirée** (`PURGE_23_11`) : Antoine Daniel.
- **Aomine** : « ミスディレクション » (中西亮輔), extrait iTunes JP.
- **Zip 9** : 43 cartes en pleine illustration (`-r2611231743`) ; crème de marrons, Phryges, Lushen entiers sur fond flouté.
- `make-monde-v2.py` : les cartes World V1 ré-illustrées prennent leur nouvelle image (fugu, crème de marrons, et la Russie du 17/11 qui n'était jamais passée — idem le fugu du zip 8).

## Vérifié (copie Linux propre)
- tsc client + convex, check:i18n, test:rolls, build : OK (master et v2).
- Tests serveur : seul échec `i18n.test.ts` Balde de Ubaldis (déjà là avant).
- Catalogue : Rocket GF, Mount & Blade, Harvey, Dwayne = mythic ; Antoine Daniel absent.

## À vérifier sur le site des joueurs
- Roulette : un seul numéro sélectionnable, 3 choix de paiement.
- Cartes Rocket (GF), Mount & Blade, Dwayne Johnson, Fugu, Crème de marrons, Russie.
- Musique d'Aomine.

## Remarque
- L'image « Mount & Blade » fournie est la jaquette de *Warband* (une carte Warband 1★ existe déjà).
