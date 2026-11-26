# Outils : lanceur Claude pleine page

_26/11/2026 soir — Tom + Claude, racine / `v2`. Remplace la fenêtre à boutons PowerShell (`outils/lanceur-claude.ps1`, supprimé)._

## Fait
- `LANCEUR-CLAUDE.cmd` → `outils/lanceur-claude.vbs` → `node outils/lanceur/serveur.mjs` (sans console). Le serveur n'écoute que sur `127.0.0.1:4517`, exige un jeton tiré au lancement, ouvre Edge ou Chrome en fenêtre d'application agrandie (profil à part dans `%LOCALAPPDATA%\cardgamepriv-lanceur`) et s'arrête 20 s après la fermeture de la fenêtre. Journal : `logs/lanceur-claude.log`.
- `outils/lanceur/index.html` : 4 pages (touches 1 à 4, `/` = chercher).
  - **Accueil** : boutons PATCH / V3 / Reprendre, équipe en direct, mot pour l'autre, dossiers de ce PC (retard, à pousser, fichiers modifiés), version en ligne des deux sites, sessions à reprendre par leur titre, derniers patchs, premières tâches, derniers lanceurs lancés (OK / ÉCHEC).
  - **Reste à faire** : `EN-COURS.md` découpé par section, recherche, filtres « Cite Tom / Cite Hugo ». Lecture seule (le fichier reste réécrit par `/cr`).
  - **Patchs** : barres par jour sur 14 jours, frise des tags `v2.X.Y` (qui, heure, titre, taille du diff, commits, compte rendu), le patch en ligne chez les joueurs est repéré par `version.json`.
  - **Chantiers et activité** : chantiers ouverts, pièges connus, 60 derniers commits de `v2` (ceux pas encore sur ce PC surlignés).
  - Avis en bas à droite : l'autre arrive / part / ouvre une session / laisse un mot / pousse, nouveau patch, mise en ligne.
- **Présence** (`outils/lanceur/presence.mjs`) : chaque PC pousse un `etat.json` (nom, heure, sessions Claude ouvertes avec titre, dossier, branche, état, mot) dans `refs/presence/<nom>` sur GitHub — hors branches, aucun build, aucun coût. Tout passe par un dépôt à part `.claude-tmp/presence.git` : le dépôt de travail n'est pas touché. Un veilleur détaché bat toutes les 3 min (au plus un push par 45 s quand quelque chose change) tant qu'une session Claude ou le lanceur est ouvert ; lancé par le lanceur et par le hook `au-demarrage.mjs`. En ligne = battement de moins de 8 min.
- Polish (même soir) : gris plus lisibles, menu en barre du haut sous 900 px de large, bouton PATCH / V3 / Reprendre qui prévient quand une session est déjà ouverte dans son dossier (deuxième clic dans les 6 s pour ouvrir quand même), dernier commit de chacun sur sa carte, fichiers modifiés comptés sans les fins de ligne, un titre par tag quand une ligne d'`EN-COURS` couvre plusieurs versions, la page se recharge seule quand `index.html` change. Essais : `node outils/lanceur/serveur.mjs --sans-fenetre` (port libre, isolé du vrai lanceur) puis l'adresse affichée avec `&fige=1&page=patchs`.
- Qui est qui : auteur git « Hugo » = Hugo, sinon Tom (même règle que les hooks).

## Vérifié (PC de Tom)
- Lancement réel par `LANCEUR-CLAUDE.cmd` : fenêtre Chrome ouverte, serveur encore en vie après 75 s, arrêt de l'essai sans fenêtre.
- Push et relecture de `refs/presence/tom` sur GitHub ; mot d'équipe publié ; requêtes sans jeton ou avec un autre hôte refusées (403) ; identifiant de session invalide refusé.
- Ouverture d'un terminal Windows Terminal par le même appel que les boutons (commande d'essai). Les boutons PATCH / V3 / Reprendre eux-mêmes n'ont pas été cliqués (ils ouvriraient une 2e session dans un dossier occupé).
- Captures des 4 pages en 1920×1080 : `.claude-tmp/lanceur-*.png`.

## À vérifier
- Tom : cliquer PATCH, V3 et une « session à reprendre ».
- Hugo : `git pull`, puis `LANCEUR-CLAUDE.cmd` (ou simplement ouvrir une session Claude) → sa carte passe « en ligne » chez Tom en moins d'une minute. Si rien : `logs/lanceur-claude.log`, et `git push` doit marcher sans fenêtre de connexion.

## Limites connues
- La présence ne voit que les sessions Claude Code du PC (fichiers `~/.claude/sessions/`), pas les sessions cloud ni claude.ai.
- Un veilleur déjà lancé garde son ancien code jusqu'à la fermeture des sessions.
- Les titres de session partent sur GitHub (dépôt privé) : ne pas y mettre de secret.

## Reste
- [x] Fins de ligne des lanceurs normalisées sur `v2` (`58d5fae`, 26/11) ; `merge.renormalize` posé par le hook de démarrage pour les reports depuis `master`.
- [ ] Même normalisation sur `master` au prochain patch (`.gitattributes` + `git add --renormalize`).
