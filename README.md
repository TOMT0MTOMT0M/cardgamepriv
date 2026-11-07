# Card Lab

Laboratoire d'expérimentations visuelles 3D pour un jeu de cartes privé : rendu de cartes, ouverture de packs, rareté.
three.js **r187** · `WebGPURenderer` (fallback WebGL2 automatique) · shaders 100 % **TSL**.

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:mobile   # HTTPS + réseau local (WebGPU et gyroscope exigent HTTPS sur téléphone)
npm run build        # tsc strict + vite build
```

**Le jeu** (boutique, ouverture, collection, échanges) : http://localhost:5173/jeu/ — sans serveur configuré (ou avec
`?demo`), il tourne en mode démo hors-ligne avec des amis robots. Détails : section « LE JEU » de `docs/LAB_NOTES.md`.

```bash
npm run test:server  # tests du serveur Convex (base simulée en mémoire)
npm run test:rolls   # vérifie les taux de drop sur 400 000 boosters
npm run thumbs       # miniatures WebP des illustrations (après ajout/remplacement d'images)
npm run feedback     # récupère les retours du labo envoyés en ligne → feedback/latest.md
npx convex dev       # pousse les fonctions et le schéma du serveur
```

- Sidebar : expériences groupées par catégorie (A rendu · B ouverture · C rareté · D bonus). `←` / `→` pour naviguer.
- Barre d'outils : **Replay** (`R`), **rareté** (`1`…`7`, 7 = secrète), **WebGPU ⇄ WebGL2**, **DPR**, preset **📱 Mobile**, **capture PNG** (`P`), gyroscope (mobile), son.
- `H` : masquer toute l'interface (mode présentation).
- 👍 / 👎 + note par expérience (localStorage) → **☁ Envoyer** les met en ligne (ensuite chaque modification part seule), ou **Export JSON** pour un fichier.

Détails, tableau de bord et choix techniques : [`docs/LAB_NOTES.md`](./docs/LAB_NOTES.md). Chaque expérience a son `NOTES.md`.

**Mise en ligne** (Windows, depuis la V1 du 07/11) : le travail se fait sur la branche `v2` et se teste sur le lien admin
`https://v2.cardgamepriv.pages.dev` (`lanceurs/mettre-en-ligne-v2.cmd`, serveur Convex de staging) ; les joueurs reçoivent
un patch complet par `lanceurs/publier-patch.cmd` (sauvegarde de la base → fusion `v2` → `master` → tag `vX.Y` → prod).
Mode d'emploi : [`docs/V2.md`](./docs/V2.md) · ce qui est en ligne et comment le restaurer : [`docs/V1.md`](./docs/V1.md).
Le jeu : https://cardgamepriv.pages.dev/jeu/ · le labo : https://cardgamepriv.pages.dev/ · journaux : `logs/`.

## Organisation du dossier
```
src/            code du site : src/game/ = le jeu (/jeu/), src/core/ = moteur 3D + catalogues (src/core/sets/), src/experiments/ = le labo
convex/         serveur (fonctions, schéma, tests)
functions/      Cloudflare Pages Functions (images servies depuis R2)
public/         fichiers statiques (public/art/ = illustrations, envoyées sur R2, hors git)
jeu/            page HTML du jeu · index.html = page du labo
scripts/        génération des catalogues (make-*.py), récolte d'images, miniatures, R2, vérifications
  scripts/data/   journaux de récolte et ids stables des cartes (à garder)
donnees/        sources des catalogues
  tri-etoiles/    Excel « Tri étoiles » validés (un par thème) — ex. python scripts/make-pop.py gen donnees/tri-etoiles/Tri-etoiles-popculture.xlsx
  patchs/         patchs appliqués par-dessus un tri (Patch-monde-V7.xlsx)
  suivi/          exports de suivi (cartes sans image…)
docs/           LAB_NOTES.md (journal technique), INFRASTRUCTURE.md, specs/, labo/, recherches/
lanceurs/       .cmd Windows à double-cliquer (V2, patch prod, sauvegarde, R2, admin jeux, cartes de test)
logs/           journaux des lanceurs (hors git)
feedback/       retours du labo récupérés (npm run feedback, hors git)
archives/       anciens rapports et fichiers d'origine (audit du 03/11, Pokémon 151 d'origine) — hors git
sauvegardes/    sauvegardes .zip du projet (hors git)
```

## Vérification automatique
```bash
npm run build
node scripts/verify.cjs --shots=1500,4000          # captures + erreurs console de chaque expérience (Chrome/Edge)
node scripts/verify.cjs --leak=3                    # enchaîne 3× toutes les expériences et compare renderer.info.memory
# Linux sans GPU : xvfb-run -a node scripts/verify.cjs --sw
```
Nécessite Playwright (`npx playwright install chromium`) — non inclus dans les dépendances.
