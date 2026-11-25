# Sachet : nom thermoformé, plis par booster, fiche booster mobile — 07/11/2026

**En ligne** (14 h 25) : `fb7b9aa` sur `fix/retours-live-02` (après `c16f43f`, qui a apporté le nom moulé, les plis par booster et la fiche mobile), Convex + build + R2 + Pages OK — https://48b1064f.cardgamepriv.pages.dev. Lancé par Claude sur le PC (`.claude-tmp\pousser-*.cmd`, double-clic dans l'Explorateur) à la demande de Tom.

## Nom du pack moulé (retours de Tom)
- Plus d'encre noire : relief thermoformé dans le film (épaules arrondies, congé au pied, même matière).
- (14 h 20) Tom a renoncé aux reflets gravés : les reflets dessinés dans Matcha World (trous fins des lettres) sont **comblés**, la lettre est lisse — seulement la police en relief. `LABEL_RELIEF.groove = 0` (> 0 les recreuse).
- `src/core/packLabel.ts` : rastérisation ×2, trous fermés triés par cercle inscrit (`highlightMax` 4 % de la police : reflet → comblé ; au-delà : contre-forme de « O », « A », « P »… laissée à plat — vérifié : Popculture 20 reflets / 4 contre-formes, Gaming 12/1, World 10/3, Bebou 10/5), distance euclidienne signée lissée (sinon stries de reflet), profil smoothstep (`shoulder` 5 %, `height` 0,7), tramage à l'encodage 8 bits.
- `pack.ts` `moldedLabel` : carte de normales propre à la face avant (`PackArt.frontNormal`), ombrage de cavité léger, vignette 2D éclairée une fois (`thumbFront`, utilisée par `packThumb`). Dos inchangé (`creaseNormal`).

## Plis des grands boosters
- Bug : au changement de booster, seules couleur et masques étaient échangés — carte de hauteur et normales des plis restaient celles du 1er booster chargé (déchirure idem). Les mini-boosters du menu, eux, avaient chacun leurs plis.
- `opening.ts` : `packSwaps` / `tearSwaps` échangent toutes les textures ; géométrie `createPackGeometry(…, { folds: false })` + `packCreaseLift` (relief lu dans la carte de hauteur du sachet, ≈ 6 mm par grand pli) au lieu des grands plis fixes `BIG_CREASES`.

## Fiche booster sur téléphone
- Même style que le panneau de l'ordinateur (texte seul, filets d'un pixel, libellés en chasse fixe, nom qui se forme lettre à lettre à l'ouverture) ; vignette 2D du booster retirée ; aplat noir translucide, sans cadre ni arrondi. Bloc final de `style.css` (« fiche téléphone »), `MOBILE_SHEET` dans `packSheet.ts`.

## Vérifié
tsc, build, 82 tests ; rendu du relief hors navigateur. Rendu 3D sur téléphone : à valider par Tom (réglages dans `LABEL_RELIEF`, force des plis géométriques dans `packCreaseLift`).
