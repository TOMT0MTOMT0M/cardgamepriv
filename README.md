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
`?demo`), il tourne en mode démo hors-ligne avec des amis robots. Détails : section « LE JEU » de `LAB_NOTES.md`.

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

Détails, tableau de bord et choix techniques : [`LAB_NOTES.md`](./LAB_NOTES.md). Chaque expérience a son `NOTES.md`.

**Mise en ligne** (Windows) : double-clic sur `deployer.cmd` → `npm install`, serveur Convex (`npx convex dev --once`,
le déploiement utilisé par le site), build, Cloudflare Pages (cardgamepriv.pages.dev). Journal : `deployer.log`.
Le jeu : https://cardgamepriv.pages.dev/jeu/ · le labo : https://cardgamepriv.pages.dev/

## Vérification automatique
```bash
npm run build
node scripts/verify.cjs --shots=1500,4000          # captures + erreurs console de chaque expérience (Chrome/Edge)
node scripts/verify.cjs --leak=3                    # enchaîne 3× toutes les expériences et compare renderer.info.memory
# Linux sans GPU : xvfb-run -a node scripts/verify.cjs --sw
```
Nécessite Playwright (`npx playwright install chromium`) — non inclus dans les dépendances.
