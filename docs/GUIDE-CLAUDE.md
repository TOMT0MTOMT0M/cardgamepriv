# Guide Claude — travailler vite et sans gaspiller (Tom & Hugo, 25/11/2026)

**L'idée en une phrase** : chaque message renvoie toute la conversation à Claude. Une conversation longue est donc lente, chère, et Claude s'y perd. On fait **des sessions courtes, une par tâche**, et on garde la mémoire du travail **dans des fichiers**, pas dans la conversation.

## 1. Ce qui est déjà en place dans le repo (rien à faire)
- `CLAUDE.md` : règles courtes lues à chaque session (dont : lire `docs/chantiers/EN-COURS.md` au démarrage).
- `.claude/rules/` : règles détaillées chargées **seulement** quand on touche les fichiers concernés (`convex.md`, `donnees.md`).
- `.claude/skills/` : deux commandes qui ne coûtent rien tant qu'on ne les tape pas :
  - `/patch v2.X.Y …` : tout le circuit d'un patch de la version en ligne ;
  - `/cr` : fin de session (fichier de passation + compte rendu d'une page).
- `.claude/settings.json` : Claude lance tout seul type-check, tests, `git add/commit` ; il **demande** avant de pousser `master`, un `reset --hard` ou un `convex run` ; il ne peut **jamais** lire les secrets ni déployer à la main.
- `docs/chantiers/EN-COURS.md` : le fichier de passation (qui fait quoi, ce qui reste).
- **`LANCEUR-CLAUDE.cmd`** (racine du repo) : le lanceur pleine page (fenêtre du navigateur, serveur local `outils/lanceur/`) — boutons PATCH (version en ligne), V3, Reprendre ; qui est en ligne et sur quelles sessions Claude (Tom et Hugo, mis à jour tout seul) ; « Reste à faire » lu dans EN-COURS ; frise des patchs ; chantiers et derniers commits ; dossiers en retard sur GitHub.
- **Garde-fous à deux, automatiques** : au démarrage, Claude sait si l'autre a poussé et récupère ses changements ; il ne peut pas modifier un fichier que l'autre a changé sur GitHub avant de l'avoir récupéré ; le lien V3 refuse d'être publié depuis un dossier en retard.
- **Plus de double-clic** : Claude lance lui-même les lanceurs depuis la session, sur ton PC (Tom ou Hugo). Push, lien V3 et staging : tout seul. Mise en prod : il demande « je publie v2.X.Y chez les joueurs ? » et attend un oui (réponse possible depuis le téléphone). Il ne lance jamais `NE-PAS-LANCER-*` ni un lanceur qui demande une connexion.

## 2. À faire une fois sur ton PC (10 min, chacun le sien)
1. Dans un terminal : `claude update`.
2. Vérifier qu'aucune variable d'environnement Windows `ANTHROPIC_API_KEY` n'existe (sinon Claude Code facture en API au lieu de l'abonnement).
3. Dans Claude Code : `/config` → « Enable Remote Control for all sessions » = oui (suivi depuis le téléphone).
4. `/mcp` : retirer tout serveur au nom `@modelcontextprotocol/server-…` (anciens serveurs de référence, plus maintenus) et couper ce qui ne sert pas au jeu. Pour GitHub, `gh` suffit.
5. `/statusline` : demander « modèle, % de contexte utilisé ».
6. **Ne pas** activer Code Mode (expérimental, et il coupe Remote Control).

## 3. Les règles de tous les jours
1. **Une tâche = une session.** Tâche finie → `/cr` → `/clear`. Test simple : si ton prochain message aurait du sens dans une session neuve, fais `/clear` avant.
2. **Le modèle se choisit au début**, jamais en cours de route (changer casse le cache : le tour suivant relit tout, plus lent et plus cher).
   - Patchs de la version en ligne (`.wt-master`) : **Sonnet** (réglé par défaut dans ce dossier).
   - V3, gros chantiers, shaders, bugs tordus : **Opus**, effort moyen. Pour un tour difficile, écrire `ultrathink` dans le message.
3. **Donner les chemins exacts** (`src/game/roulette.ts`) plutôt que « regarde le projet ». Sans `@` devant : `@` colle le fichier entier.
4. **Toujours dire « fini quand… »** avec des critères vérifiables (type-check OK, tests OK, ce qu'on doit voir à l'écran).
5. **Deux corrections ratées sur le même point** → `/rewind` (revenir en arrière) ou `/clear` + « relis docs/chantiers/<chantier>.md et reprends ». On ne s'acharne pas.
6. **Pas de sous-agents par réflexe** : chacun recharge tout et mange le même quota. Seulement pour du vrai parallèle ou une vérification finale.
7. **Le quota est partagé** entre claude.ai (le Project) et Claude Code : une grosse conversation sur claude.ai, c'est du temps de code en moins. `/usage` une fois par semaine pour voir ce qui consomme.

## 4. À deux
- Un dossier et une session par personne ; jamais deux sessions (ni Claude + Gemini) sur les mêmes fichiers en même temps.
- Rien à réserver : les garde-fous ci-dessus empêchent d'écraser le travail de l'autre. Si un push est refusé, Claude récupère et fusionne lui-même.
- Tom et Hugo peuvent tous les deux mettre en ligne la prod et le lien V3 : celui qui pilote la session dit « oui », puis prévient l'autre (« v2.X.Y en ligne »). Jamais deux mises en ligne en même temps : le lanceur s'arrête de toute façon si GitHub a avancé.
- `CLAUDE.local.md` et la mémoire automatique de Claude sont **perso** (pas partagés). Une leçon utile aux deux : « ajoute-la à CLAUDE.md ».

## 5. Deux mots sur les rumeurs
- **« Fin des MCP »** : faux. Anthropic a seulement retiré une vieille brique interne (v2.1.323) et charge maintenant les outils MCP à la demande, ce qui les rend presque gratuits tant qu'ils ne servent pas. Rien à migrer.
- **« Harness »** : c'est tout ce qui entoure le modèle (règles, commandes, permissions, fichiers de passation, vérifs). Le nôtre, c'est ce guide. On n'en construit pas un sur mesure ; on ajoute une règle seulement quand Claude a vraiment fait une erreur, et on en retire quand un nouveau modèle n'en a plus besoin.

## 6. Exemple : je sors le patch v2.2.0 (fictif)
1. Double-clic sur `LANCEUR-CLAUDE.cmd` → bouton **PATCH** (session neuve dans `.wt-master`, Sonnet, Remote Control auto). Claude lit `EN-COURS.md` + les 5 derniers commits : pas d'exploration du repo.
2. Un seul message :
   > `/patch v2.2.0` — la roulette affiche le gain avant la fin de l'animation sur iPhone. Fichiers probables : `src/game/roulette.ts`, `src/game/roulette.css`. Fini quand : type-check et tests OK, gain affiché après l'arrêt de la bille.
3. Claude écrit le plan (10 lignes) dans `docs/chantiers/v2.2.0.md`, crée `patch-v2.2.0`, corrige, ajoute l'entrée « Mises à jour ».
4. Il boucle seul sur les vérifs (5 essais max), commite, prépare `METTRE-EN-LIGNE-v2.2.0.cmd`, reporte sur `v2` (cherry-pick + `merge -s ours`), pousse `v2` et `patch-v2.2.0`.
5. Il demande : « je publie v2.2.0 chez les joueurs ? ». Tu réponds « oui » (même depuis le téléphone).
6. Claude lance `METTRE-EN-LIGNE-v2.2.0.cmd` lui-même, lit le journal, puis : « En ligne. Vérifie sur iPhone : 1) le gain s'affiche après l'arrêt, 2) une mise rouge/noir passe. » Tu vérifies, tu dis « ok » et tu préviens l'autre. `/cr` → EN-COURS.md à jour + compte rendu d'une page. `/clear`.

**Ce qu'on gagne** : pas de relecture du repo (fichier de passation), pas de procédure réexpliquée (`/patch`), pas d'allers-retours « c'est fait / non ça casse » (vérifs bornées), un cache qui tient (modèle fixe), et la session suivante repart de zéro proprement.

## 7. Checklist
**Chaque tâche** : `LANCEUR-CLAUDE.cmd` → bon bouton · session neuve · modèle choisi · chemins exacts + « fini quand » · plan dans un fichier · vérifs vertes · ton « oui » pour la prod, Claude lance, tu préviens l'autre · `/cr` · `/clear`.
**Chaque semaine** : `/usage` et `/context` · relire CLAUDE.md (supprimer ce qui ne sert plus) · archiver les vieux comptes rendus du Project claude.ai.
**Plus tard** : un « évaluateur » séparé pour juger les animations 6★ sur une grille DA écrite ; Code Mode quand il ne sera plus expérimental.
