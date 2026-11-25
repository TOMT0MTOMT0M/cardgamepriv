# Déchirure du booster simulée — 10/11

**Branche v2** : `fdde21f` (simulation) puis `3fc8d7e` (anti-scintillement + main), sur `e7bc051` (Berserk). Pas encore poussé : `lanceurs/push.cmd` puis `lanceurs/mettre-en-ligne-v2.cmd`.

## Principe
Simulation physique HORS-LIGNE du sachet, enregistrée, puis rejouée dans le jeu (aucun calcul physique sur le téléphone).

- **Simulateur** `scripts/bake-tear/bake.mts` (`npm run bake:tear`, ~35 s par variante) : XPBD à 2 400 Hz.
  - Film alu/PET : 4 nappes (corps avant/dos, bande avant/dos), 65 colonnes, ~11 000 sommets ; quasi inextensible ; flexion par angle dièdre signé ; **plis plastiques**.
  - Soudures des côtés et des crans ; ligne de déchirure qui cède par à-coups ; bord dentelé fin dans le shader.
  - Le doigt pince l'encoche, tire, coup de poignet, lâche : la bande vole (gravité + traînée).
  - **La main qui tient le sachet** : pouce sur la moitié basse droite de la face avant, deux doigts au dos, contact collant (film appuyé contre la pile).
  - **5 cartes rigides** calées sur la timeline du jeu : collision avec frottement, elles écartent les lèvres.
- **Encodage** : corps filtré dans le temps (binomial 5 points, 2 passes), quantifié à 5 µm ; bande à 20 µm. `public/bake/tear-0..2.tear`, ~1,2 Mo chacune, gzip, format 2. Service worker : cache d'abord (`?v=BAKE_REV`, actuellement 2).
- **Rejeu** `src/core/tearBake.ts` : interpolation + normales de grille (~0,5 ms/image sur PC). Déchirure pilotée par le doigt, sortie par l'horloge des cartes. Repli : ancienne déchirure procédurale.

## Scintillement (retour de Tom 10/11 : « texture trop fragile, elle flicker »)
Mesure = variation de la normale du corps d'une image à l'autre (aller-retour), hors bande déchirée.
| | avant | après |
|---|---|---|
| déchirure | 16–19 mrad | 2,3 mrad |
| sortie des cartes | 24–28 mrad | 2,9–3,4 mrad |
Causes : frémissement du solveur + arrondi à 20 µm (visible en reflet sur l'alu poli).

## Réglages (`bake.mts`)
`A_BEND` (raideur), `YIELD` (pli permanent), `CONTACT_V` (violence de l'ouverture), `THUMB` / `FINGERS` (position et taille de la main), `HAND_STICK`, `DAMP_BODY`, `SMOOTH` ; variantes dans `VARIANT_LIST`. Après une nouvelle cuisson : monter `BAKE_REV`. Contrôle hors navigateur : `--preview` puis `scripts/bake-tear/preview.py`.

## Vérifié
tsc, 110 tests serveur, build ; rendu headless (WebGL logiciel) de la déchirure et de la sortie. À juger sur téléphone : scintillement résiduel en WebGPU, creux du pouce (discret, ~0,7 mm).
