# Pour Hugo (et son Claude) : mise à niveau du dossier — nouveau lanceur, présence, fins de ligne

_Écrit le 26/11/2026 par Tom + Claude. À appliquer AVANT toute autre tâche, une seule fois, sur le PC de Hugo._

Claude : fais les étapes dans l'ordre, sans rien modifier d'autre. Si une vérification ne donne pas le résultat attendu, ARRÊTE-TOI et explique à Hugo (5 essais au plus). À la fin, donne-lui l'explication de la dernière section.

## Pourquoi
Le 26/11 au soir, trois choses ont changé sur `v2` :
1. **Nouveau lanceur Claude pleine page** (`LANCEUR-CLAUDE.cmd`) : il remplace la petite fenêtre à boutons.
2. **Présence d'équipe** : chaque PC dit à l'autre s'il est en ligne et sur quelles sessions Claude.
3. **Fins de ligne des `.cmd` normalisées** (`58d5fae`) : les lanceurs ne paraissent plus « modifiés » sans raison. Mais tant que le dossier de Hugo n'est pas à jour, ce faux « modifié » bloque son `git pull` (« Aborting ») une dernière fois.

## 1. Mettre le dossier racine (`v2`) à jour
```
git fetch origin
git rev-list --count origin/v2..HEAD
git diff --ignore-cr-at-eol --stat HEAD
```
- **Cas normal** — le compte vaut `0` (aucun commit local) ET la 3e commande n'affiche rien (aucune vraie modification, seulement des fins de ligne) :
  - essayer `git pull --rebase --autostash` ;
  - s'il répond « Aborting » ou « unstaged changes » : `git reset --hard origin/v2`. Sans risque dans ce cas précis (rien de local à perdre, vérifié par les deux commandes ci-dessus ; les fichiers non suivis ne sont pas touchés) ;
  - si la tentative a laissé une entrée dans `git stash list` : vérifier qu'elle est vide avec `git diff --ignore-cr-at-eol --stat "stash@{0}^" "stash@{0}"` (rien ne s'affiche), puis `git stash drop`. Ne supprimer aucune autre entrée sans la regarder.
- **Autre cas** — il y a des commits locaux ou de vraies modifications : ne PAS faire de `reset`. Montrer à Hugo ce qui est en cours (`git status --short`, `git log --oneline origin/v2..HEAD`) et lui demander quoi garder avant d'aller plus loin.

## 2. Réglage git (reports de patchs sans conflit de fins de ligne)
```
git config merge.renormalize true
```
`master` a encore ses `.cmd` à l'ancien format : sans ce réglage, reporter sur `v2` un patch qui touche un lanceur fait un conflit sur tout le fichier.

## 3. Mettre `.wt-master` à jour (version en ligne, patchs v2.1.21 à v2.1.25)
Seulement si le dossier `.wt-master` existe, est sur la branche `master` et n'a rien en cours :
```
git -C .wt-master rev-parse --abbrev-ref HEAD
git -C .wt-master status --short --untracked-files=no
git -C .wt-master merge --ff-only origin/master
```
Sinon : ne rien faire et le dire à Hugo.

## 4. Vérifier
```
git status -sb
node --check outils/lanceur/serveur.mjs
git ls-remote origin "refs/presence/*"
```
- `git status -sb` : `## v2...origin/v2` sans « behind », et plus aucun `.cmd` listé comme modifié.
- `git ls-remote` doit répondre sans ouvrir de fenêtre de connexion (la présence pousse sur GitHub en arrière-plan). S'il demande une connexion : le dire à Hugo, ne pas se connecter à sa place.

## 5. Ce que Hugo fait lui-même (Claude ne lance pas un lanceur qui ouvre un navigateur)
- Fermer l'ancienne fenêtre « Claude - Bebou cartes » si elle est ouverte.
- Double-cliquer `LANCEUR-CLAUDE.cmd` à la racine du dossier. S'il en avait une copie sur le Bureau : la remplacer par la nouvelle.
- Au premier lancement, Edge ou Chrome ouvre une fenêtre à part (profil dédié), agrandie.

## 6. Marquer l'annonce comme faite
```
node .claude/hooks/au-demarrage.mjs --vu 2026-11-26-pour-hugo-lanceur
```
Tant que ce n'est pas fait, l'annonce revient à chaque début de session.

## L'explication à donner à Hugo (courte, en français)
- **Ce qui vient d'être fait** : ton dossier est à jour ; les lanceurs `.cmd` ne paraîtront plus modifiés pour rien ; `git pull` ne bloquera plus dessus.
- **Le nouveau lanceur** (`LANCEUR-CLAUDE.cmd`) est une page pleine fenêtre, 4 onglets (touches 1 à 4) :
  - *Accueil* : boutons PATCH / V3 / Reprendre (ils préviennent si une session est déjà ouverte dans le dossier), qui est en ligne et sur quelle session, un champ « mot pour l'autre », l'état des dossiers, la version en ligne, les sessions à reprendre par leur titre ;
  - *Reste à faire* : `EN-COURS.md` avec recherche et filtre « Cite Hugo » ;
  - *Patchs* : la frise des versions mises en ligne, qui a fait quoi ;
  - *Chantiers et activité* : chantiers ouverts, pièges connus, derniers commits.
- **Présence** : dès que tu ouvres le lanceur ou une session Claude, Tom te voit « en ligne » avec le titre de tes sessions (et inversement), en moins d'une minute. Ça passe par GitHub, sans coût. Les titres de session y sont visibles : ne pas y mettre de secret.
- **Rien d'autre ne change** dans la façon de travailler : une tâche = une session, `/cr` puis `/clear` à la fin.
- Détails : `docs/chantiers/outils-lanceur.md`.
