# cardgamepriv

TCG de collection privé (≈20 joueurs), mobile d'abord. three.js r187 WebGPU + TSL, Vite, Convex, Cloudflare Pages + R2.
Circuit de travail complet : `docs/V2.md`. Infra : `docs/INFRASTRUCTURE.md`.

## Vérifier avant de dire « fait »
- `npm run typecheck`
- `npm run test:server` (tests Convex). Un seul fichier : `npx vitest run convex/chat.test.ts`
- `npm run test:rolls` seulement si les taux de drop ou `packRoll` / `packRules` changent
- Rendu : `npm run dev` puis `/jeu/` (`?demo` = hors-ligne), ou le lien V2 après `lanceurs/mettre-en-ligne-v2.cmd`

## Git et mise en ligne
- Travail sur `v2` uniquement. Ne pas toucher `master` ni `.wt-master/` (worktree de master).
- Exception, seulement à la demande de Tom (correctif urgent ou outil qui doit être en prod tout de suite) : patch `v1.0.X` commité et tagué dans `.wt-master/`, avec son lanceur `.wt-master/METTRE-EN-LIGNE-v1.0.X.cmd` (Tom le lance). Puis le même contenu reporté sur `v2` et `git merge -s ours master` sur `v2` après avoir contrôlé que tout master y est (sinon `publier-patch.cmd` refuse).
- La prod ne sort que par `lanceurs/publier-patch.cmd`, lancé par Tom. Ne pas lancer `convex:deploy` ni `cf:deploy` à la main.
- Les `.cmd` de `lanceurs/` tournent chez Tom : lui dire lequel et dans quel ordre.
- Un commit par lot, uniquement ses propres fichiers (une autre session peut commiter en parallèle sur `v2`).
- Un patch a son entrée dans `src/game/updates.data.ts`.

## Convex
- Schéma compatible avec la V1 : nouveaux champs en `v.optional`, jamais de type changé.
- Transformation de données = migration idempotente dans `convex/migrations.ts`, ajoutée aux deux lanceurs `mettre-en-ligne-*`, testée sur le staging.

## Lecture ciblée
- Catalogues `src/core/sets/` (popculture, sport, monde, jeuxvideo, lolLines : 35 000+ lignes) : GÉNÉRÉS par `scripts/make-*.py` depuis `donnees/`. Ne pas les lire en entier ni les éditer à la main : grep, puis modifier la source et régénérer. L'en-tête de chaque fichier dit s'il est généré.
- Ids de cartes figés dans `scripts/data/*-ids.json` : ne jamais les changer.
- `docs/LAB_NOTES.md` (720 lignes) : grep la section utile.
- Ignorer `dist/`, `node_modules/`, `.cache/`, `archives/`, `sauvegardes/`, `imports/`, `logs/`, `convex/_generated/`.
- Secrets (`.env.local`, `.env.v2.local`, `.discord-bot-token`, `.feedback-key`) : ne jamais afficher leur contenu.
- Fichiers de travail (captures, aperçus) dans `.claude-tmp/`.

## Contraintes produit
- Aucun service payant en plus, aucune hausse de coût Convex / R2 / Pages.
- Durées et courbes : uniquement les jetons de `src/core/motion.ts`, rien en dur.
- DA, effets de rareté et animations 6★ identiques à l'œil sauf demande explicite.
- Le mode « Effets réduits » (`src/core/fxPref.ts`) doit continuer de fonctionner.
- Perf : mesurer avant, re-mesurer après. Un lot sans gain mesuré est annulé.

## Façon de travailler
- Dès 3 fichiers touchés : plan en 5 lignes, puis exécuter sans attendre.
- S'arrêter seulement pour une décision irréversible ou qui change l'expérience des joueurs.
- Compte rendu final court : ce qui a changé, ce que Tom doit vérifier.

# Compact instructions
Garder : fichiers modifiés, commandes de vérification et leur résultat, décisions prises, reste à faire.
