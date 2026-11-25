---
name: patch
description: Prépare un patch v2.X.Y de la version en ligne (master, worktree .wt-master), de la demande jusqu'au lanceur à double-cliquer.
disable-model-invocation: true
argument-hint: "v2.X.Y + ce qu'il faut corriger + fini quand…"
---
# /patch — patch de la version en ligne

Demande : $ARGUMENTS

Rappel : version en ligne = `master` (worktree `.wt-master/`). `lanceurs/publier-patch.cmd` n'est PAS pour un patch : il envoie toute la V3 de `v2`.

0. `docs/chantiers/` est dans le dossier racine (branche `v2`) : depuis `.wt-master/`, utiliser `../docs/chantiers/` et commiter ces docs depuis le dossier racine.
1. **État** : `git pull --rebase --autostash` si le démarrage a signalé du retard ; lire `docs/chantiers/EN-COURS.md`, `git log --oneline -5 master`, dernier tag `v2.*`.
2. **Lecture ciblée** : seulement les fichiers cités et ce que le plan exige. Grep avant de lire ; jamais un catalogue généré en entier.
3. **Plan** dans `docs/chantiers/v2.X.Y.md` (10 lignes max) : fichiers touchés, risque, schéma Convex oui/non, critères « fini quand » binaires. Continuer sans attendre, sauf décision irréversible ou qui change l'expérience des joueurs.
4. **Branche** `patch-v2.X.Y` depuis `master`. Implémenter. Ajouter l'entrée du patch dans `src/game/updates.data.ts`.
5. **Vérifs, boucle bornée (5 essais max)** : `npm run typecheck` et `npm run test:server`, plus `test:sound` / `test:rolls` / `check:images` selon ce qui change. Pas vert après 5 essais : s'arrêter et expliquer le blocage.
6. **Commit** : un par lot, uniquement ses fichiers, message `fix|feat(...): … (patch v2.X.Y)` + lignes d'attribution.
7. **Lanceur** : `.wt-master/METTRE-EN-LIGNE-v2.X.Y.cmd`, copié du dernier (`METTRE-EN-LIGNE-v2.1.9.cmd`), en-tête et numéros mis à jour.
8. **Report sur v2** : cherry-pick des commits du patch sur `v2`, puis `git merge -s ours patch-v2.X.Y` sur `v2` (sinon `publier-patch.cmd` refusera plus tard). Pousser `v2` et `patch-v2.X.Y` (`git push`). Ne jamais pousser `master` à la main : le lanceur le fait.
9. **Mise en ligne** : demander « je publie v2.X.Y chez les joueurs ? ». Au oui de la personne (Tom ou Hugo), lancer `cmd.exe //c "METTRE-EN-LIGNE-v2.X.Y.cmd" < /dev/null` depuis `.wt-master/` en arrière-plan, lire `logs\mise-en-ligne-v2.X.Y.log`, puis donner 2-3 vérifications précises sur https://cardgamepriv.pages.dev/jeu/.
10. **Fin** : appliquer la procédure de `/cr` (EN-COURS.md + compte rendu 1 page).
