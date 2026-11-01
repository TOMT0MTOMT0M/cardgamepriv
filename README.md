# Card Lab

Laboratoire d'expérimentations visuelles 3D pour un jeu de cartes privé : rendu de cartes, ouverture de packs, rareté.
three.js **r187** · `WebGPURenderer` (fallback WebGL2 automatique) · shaders 100 % **TSL**.

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:mobile   # HTTPS + réseau local (WebGPU et gyroscope exigent HTTPS sur téléphone)
npm run build        # tsc strict + vite build
```

- Sidebar : expériences groupées par catégorie (A rendu · B ouverture · C rareté · D bonus). `←` / `→` pour naviguer.
- Barre d'outils : **Replay** (`R`), **rareté** (`1`…`6`), **WebGPU ⇄ WebGL2**, **DPR**, preset **📱 Mobile**, **capture PNG** (`P`), gyroscope (mobile), son.
- 👍 / 👎 + note par expérience (localStorage) → **Export JSON** pour me faire ton retour.

Détails, tableau de bord et choix techniques : [`LAB_NOTES.md`](./LAB_NOTES.md). Chaque expérience a son `NOTES.md`.

## Vérification automatique
```bash
npm run build
node scripts/verify.cjs --shots=1500,4000          # captures + erreurs console de chaque expérience (Chrome/Edge)
node scripts/verify.cjs --leak=3                    # enchaîne 3× toutes les expériences et compare renderer.info.memory
# Linux sans GPU : xvfb-run -a node scripts/verify.cjs --sw
```
Nécessite Playwright (`npx playwright install chromium`) — non inclus dans les dépendances.
