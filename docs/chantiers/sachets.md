# V3 — sachets « Autocollant » dans le jeu (27/11/2026, Tom + Claude, racine / `v2`)

Décidé (Tom + Hugo, 27/11) : variante B (cartouche) partout ; Gaming noir `#1b1b21`, Sport jaune `#ffd60a`, World vert
citron `#a6ee0c`, Pop inchangé, Bébou Pack turquoise `#10d0d8` ; booster du moment à la couleur du thème de l'événement
(`EVENT_THEMES`, `src/core/packSticker.ts`) ; matière allégée (passe 2 du labo 047). Rendu validé : `docs/labo/047-sachets/07` à `11`.

## Plan (où le jeu dessine ses sachets, ce que chaque endroit reçoit)
1. **Visuel** (`opening.ts` : `boosterStyles`, `genArt`, 1er visuel) : `generatePackArt(style simple)` → `stickerPackArt(id, 'b', langue)` pour les 5 boosters et le booster du moment (gabarit `moment` : nom et teinte de l'événement, logo et date de fin). Le masque des autocollants est écrit DANS `art.masks` (R = encre / autocollant de la face, G = brillant, B = ligne de déchirure inchangée) ; les soudures sont calculées depuis la hauteur (plus lues dans R / G) → aucune texture en plus.
2. **Grand booster** (`buildPackMaterials`) : matière allégée (matériau standard, 3 lectures : couleur, masques, normales ; plus de vernis ni de grain du film) ; brûlure, « bientôt », ombrage, fuite de lumière et relief des plis inchangés.
3. **Vignettes et fiche du booster** (`shop.ts` via `packThumb`) : `thumbFront` porte déjà le relief du nom et les autocollants → rien à changer, à vérifier.
4. **Roue 3D du téléphone** (`packWheel3d.ts`) : le métal seulement hors encre (masque R réduit à 256 px), sinon les autocollants seraient en miroir.
5. **Déchirure et Retroussé cuits** (`buildTearMaterials`, `buildRollMaterials`) : même surface allégée à l'extérieur, envers alu inchangé ; le masque leur arrive par `tearNodes` (déjà échangé à chaque booster). Géométrie cuite et plis inchangés → `BAKE_REV` et `CREASE_VERSION` ne bougent que si la cuisson ou `paintCreaseMap` changent.

Puis : `EVENT_THEMES` branché sur `src/core/events.ts` (teintes du dashboard, thème retrouvé depuis la teinte). Mesure avant / après : roue 3D au format téléphone (images/s, ms par image) + temps de génération d'un visuel.

## Mesures
(à remplir)

## Fait
(à remplir)
