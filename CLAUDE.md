# cardgamepriv

TCG de collection privé (≈40-50 joueurs), mobile d'abord. three.js r187 WebGPU + TSL, Vite, Convex, Cloudflare Pages + R2.
Circuit de travail complet : `docs/V2.md`. Infra : `docs/INFRASTRUCTURE.md`.

## Démarrage de session
- Lire `docs/chantiers/EN-COURS.md` et `git log --oneline -5` avant toute action ; ne pas explorer le repo au-delà de la tâche. `docs/chantiers/` vit dans le dossier racine (branche `v2`) : depuis `.wt-master/`, c'est `../docs/chantiers/`.
- Une session = une tâche. Patch de la version en ligne : `/patch`. Fin de session : `/cr` (EN-COURS.md + compte rendu 1 page), puis `/clear`.
- `git` et `gh` en ligne de commande, pas de serveur MCP pour GitHub. Ne jamais installer un serveur MCP sans l'accord de Tom.
- Vérifs bornées : « ou stop après 5 essais », puis expliquer le blocage. Le rendu visuel reste vérifié par Tom ou Hugo.
- Méthode complète (Tom et Hugo) : `docs/GUIDE-CLAUDE.md`.

## Vérifier avant de dire « fait »
- `npm run typecheck`
- `npm run test:server` (tests Convex). Un seul fichier : `npx vitest run convex/chat.test.ts`
- `npm run test:sound` si `src/core/sound/` ou `src/core/audio.ts` change (banque de sons cuite hors navigateur)
- `npm run test:rolls` seulement si les taux de drop ou `packRoll` / `packRules` changent
- `npm run check:i18n` = 0 dès qu'un texte joueur change (clé FR **et** EN, note de patch aussi dans `updates.en.ts`)
- Rendu : `npm run dev` puis `/jeu/` (`?demo` = hors-ligne), ou le lien V3 (équipe) après `lanceurs/mettre-en-ligne-v2.cmd`

## Git et mise en ligne
- (17/11) **Les noms de version ont glissé d'un cran** : la version EN LIGNE chez les joueurs s'appelle « V2 » (sortie le 14/11) et vit sur `master` (worktree `.wt-master/`, tags `v2.X.Y`) ; la branche git `v2` (lien V2, badge « V3 — test ») contient la **V3** en préparation.
- Correctif, image, carte, musique… demandé « pour le jeu » / « pour les joueurs » sans parler de V3 = **patch de la version en ligne** : branche `patch-v2.X.Y` depuis `master`, tag `v2.X.Y` posé par son lanceur `.wt-master/METTRE-EN-LIGNE-v2.X.Y.cmd` (modèle : le dernier, `METTRE-EN-LIGNE-v2.1.9.cmd`). Puis cherry-pick sur `v2` et `git merge -s ours patch-v2.X.Y` sur `v2` (sinon `publier-patch.cmd` refuse). Procédure complète : `/patch`. Dans le doute : demander à Tom.
- Travail V3 (nouvelles fonctions, refontes) : sur `v2`.
- `lanceurs/publier-patch.cmd` envoie en prod TOUT `master..v2`, donc la V3 en cours : ne pas s'en servir pour un correctif tant que `v2` porte des lots V3 non validés. Ne pas lancer `convex:deploy` ni `cf:deploy` à la main.
- (25/11) **Claude lance lui-même les lanceurs** depuis sa session sur le PC de Tom, toujours sous la forme exacte `cmd.exe //c "lanceurs\<nom>.cmd" < /dev/null` (depuis `.wt-master/` : `cmd.exe //c "METTRE-EN-LIGNE-v2.X.Y.cmd" < /dev/null`), en arrière-plan s'il dure plus de 2 min, puis lit le journal dans `logs\` et dit si c'est OK. `< /dev/null` passe les `pause`.
  - Sans demander : `push.cmd`, `mettre-en-ligne-v2.cmd` (lien V3 + staging), `rafraichir-staging-v2.cmd`.
  - **Prod** (`METTRE-EN-LIGNE-v2.X.Y.cmd`, `publier-patch.cmd`) : demander « je publie v2.X.Y chez les joueurs ? » et attendre un oui de Tom (il répond depuis son téléphone).
  - Jamais : `NE-PAS-LANCER-*`, `mettre-en-ligne-prod.cmd` en direct, un lanceur qui ouvre un navigateur ou demande une connexion (le dire à Tom).
  - Si la session tourne ailleurs que sur le PC de Tom (cloud, pas d'accès git) : lui dire quel lanceur lancer.
- Un commit par lot, uniquement ses propres fichiers (une autre session peut commiter en parallèle sur `v2`).
- À deux : un dossier (worktree) et une session par personne. Avant de toucher un fichier partagé (`convex/schema.ts`, `vite.config.ts`, `src/game/updates.data.ts`), le réserver dans `docs/chantiers/EN-COURS.md`.
- Un patch a son entrée dans `src/game/updates.data.ts`.
- (17/11) Comparateur live / V3 (équipe) : `https://v2.cardgamepriv.pages.dev/miroir/` — deux copies de démo (master et v2) construites par `scripts/miroir/build.mjs` dans `mettre-en-ligne-v2.cmd`, gestes rejoués d'une copie à l'autre par `src/miroir/sonde.js`. Chaque côté a son code ET ses fichiers de `public/` (seules les illustrations R2 sont communes). Rien à maintenir à la main.

## Convex
- Schéma compatible avec la V1 : nouveaux champs en `v.optional`, jamais de type changé.
- Transformation de données = migration idempotente dans `convex/migrations.ts`, ajoutée aux deux lanceurs `mettre-en-ligne-*`, testée sur le staging.
- Détails : `.claude/rules/convex.md` (chargé automatiquement quand on touche `convex/`).

## Lecture ciblée
- Catalogues `src/core/sets/` (popculture, sport, monde, jeuxvideo, lolLines : 35 000+ lignes) : GÉNÉRÉS par `scripts/make-*.py` depuis `donnees/`. Ne pas les lire en entier ni les éditer à la main : grep, puis modifier la source et régénérer. L'en-tête de chaque fichier dit s'il est généré.
- Ids de cartes figés dans `scripts/data/*-ids.json` : ne jamais les changer.
- `docs/LAB_NOTES.md` (720 lignes) : grep la section utile.
- `docs/historique-claude-ai/` : anciens comptes rendus du Project claude.ai (96 comptes rendus + le guide, jusqu'au 25/11) — grep seulement.
- Ignorer `dist/`, `node_modules/`, `.cache/`, `archives/`, `sauvegardes/`, `imports/`, `logs/`, `convex/_generated/`.
- Secrets (`.env.local`, `.env.v2.local`, `.discord-bot-token`, `.feedback-key`) : ne jamais afficher leur contenu.
- Fichiers de travail (captures, aperçus) dans `.claude-tmp/`.

## Pièges connus (déjà arrivés)
- Images : une ré-illustration prend un NOUVEAU nom (`scripts/reillustrer.py`, suffixe `-rAAMMJJhhmm`) ; dessin des cartes changé → monter `bebou-cartes-vN` (`cardImages.ts`) ; plis changés → `CREASE_VERSION` (`pack.ts`) ; déchirure recuite → `BAKE_REV`. Sinon les joueurs gardent l'ancien rendu.
- WebGPU : MSAA ×4 en WebGPU, ×2 en WebGL2 au téléphone (×2 en WebGPU = 3D noire) ; ne jamais couper la boucle 3D (`setAnimationLoop(null)`) sur les pages sans 3D (faux « GPU perdu » + rechargement) ; ne pas lire `THEMES` / `catalogEntry()` au chargement d'un module (catalogue chargé par `import()`).
- Données : la curation (Bruel / Ménès retirés, renotations, purges) s'applique par-dessus la base de Hugo ; une régénération ne doit pas la défaire. Ne pas faire confiance aux URL d'images fournies par Gemini ou un Excel sans vérifier.
- Git : un tag déjà poussé ne s'écrase jamais (numéro suivant) ; jamais `git worktree prune` depuis une VM (a cassé `.wt-master`).
- Vibrations : rien sur iPhone Safari, rien sur Android sans toucher préalable ni dans les navigateurs intégrés : ne pas « réparer ».
- Champ Convex retiré : mettre le site en ligne avant Convex (sinon « undefined » dans les vieux onglets).

## Contraintes produit
- Aucun service payant en plus, aucune hausse de coût Convex / R2 / Pages.
- Durées et courbes : uniquement les jetons de `src/core/motion.ts`, rien en dur.
- DA, effets de rareté et animations 6★ identiques à l'œil sauf demande explicite.
- Interface : direction « usinage » partout (`src/game/usinage.css`, chargé après `style.css`). Rayons par jetons `--r-pill` / `--r-box` / `--r-ctl`, jamais en dur (sauf les cartes) ; filets `--gm-line` / `--gm-line-2` ; couleur = information seulement.
- Perf : mesurer avant, re-mesurer après. Un lot sans gain mesuré est annulé.

## Façon de travailler
- Dès 3 fichiers touchés : plan en 5 lignes, puis exécuter sans attendre.
- S'arrêter seulement pour une décision irréversible ou qui change l'expérience des joueurs.
- Compte rendu final court : ce qui a changé, ce que Tom doit vérifier.

# Compact instructions
Garder : fichiers modifiés, commandes de vérification et leur résultat, décisions prises, reste à faire.
