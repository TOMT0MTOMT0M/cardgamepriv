# Skins CS 6★ en 3D dans la carte (11/11) — tout est sur v2 (fusions `44c35ba`, `3794a2a`)

## Ce qui est fait
- **42 cartes CS 6★** s'ouvrent dans la visionneuse en **carte-fenêtre** : le skin (vrai modèle de CS2) flotte dans une boîte derrière la vitre. Nom, étoiles et bordure 6★ restent imprimés sur la vitre.
- **Inspection** (`bb83cd0`) : la carte reste de face, en gros plan (×1,22). Le doigt, la souris et le gyroscope font tourner le skin. Il ne traverse jamais la vitre et se balance tout seul quand personne ne touche.
- **Concernés** : couteaux Butterfly, Karambit, M9 et Talon (toutes finitions 6★), AWP Dragon Lore, M4A4 Howl.
- **Variantes recherchées** : Doppler Sapphire, Gamma Doppler Emerald, Fade 100 %, Marble Fade Karambit #412 Fire & Ice, Butterfly #897, M9 #763. Les Case Hardened sont des blue gems seulement à l'œil : le placement exact du motif n'est pas public.
- **Gants 6★** (`ae55006`) : Crimson Kimono, Hedge Maze et Pandora's Box, en paire comme sur Steam.
  - Matériau recomposé d'après le shader de gants de CS2, avec la normale en 3e texture.
  - Aspect tissu sur ordinateur ; matériau plus simple au téléphone.
- **Sticker 6★ Reason Gaming (Holo) Katowice 2014** (`5822b3a`) :
  - posé sur une feuille de papier mat, avec sa ligne de prédécoupe ;
  - le reflet holo glisse quand on incline la carte (spectre de CS2) ;
  - même geste que les autres skins.
  - Coût : 12 triangles, 3 textures (~120 Ko) et un spectre commun de 2 Ko.
- **Éclairage** identique aux cartes de la visionneuse. En Effets réduits, ou si le réseau échoue, la carte reste en 2D.

## Images sur R2 (envoyées le 11/11)
- Gants : `cs-skin-{5766610447f3,b05ee2bf4f0d,e506270deff6}-{c,m,n}.webp`.
- Sticker : `cs-sticker-74-{c,m,n}.webp` et `holo-spectre.webp`.

## Chaîne de fabrication
1. `lanceurs\extraire-cs2.cmd` (Source 2 Viewer CLI, CS2 installé) remplit `imports\cs2\`. Le lot 5 ajoute le sticker.
2. `python scripts/make-cs3d.py` recompose les peintures (`bake_glove` pour les gants).
3. `node scripts/make-cs3d.mjs` produit `public/models/cs/*.glb`, `public/art/cs3d/*.webp` (pour R2) et `src/core/sets/cs3d.ts`.
- Code : `src/core/csPortal.ts`, branché dans `src/game/scenes/viewer.ts`.

## Vérifié
- Type-check et tests serveur.
- Rendus dans le vrai jeu : couteaux et armes, rotation du skin, et le holo du sticker sous deux angles.

## À vérifier par Tom (lien V2, après `mettre-en-ligne-v2.cmd`)
1. Les 3 gants, sur PC et au téléphone :
   - les couleurs, comparées aux aperçus Steam ;
   - le cadrage ;
   - le sens de la normale : si les coutures semblent creusées à l'envers, il faut inverser y.
2. Le sticker : intensité du holo au téléphone (mélange réglé à 0,62 dans `csPortal`).
3. Au téléphone : gyroscope et glisser sur un Karambit et sur l'AWP.
4. Couleurs à juger : Crimson Web, Stained, Black Laminate.
