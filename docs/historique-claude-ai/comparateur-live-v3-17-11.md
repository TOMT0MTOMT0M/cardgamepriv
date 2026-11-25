# Comparateur live / V3 (17/11)

**Adresse** : https://v2.cardgamepriv.pages.dev/miroir/ (équipe seulement : se connecter d'abord sur le jeu V3 du lien V2). En ligne depuis le 17/11 au soir. Commits `c71cbe0` et `2a3f96a` sur `v2`, poussés.

## Ce que c'est
- Deux copies du jeu en mode démo, sans serveur, superposées à la même taille. La **live** (branche `master`) est à gauche de la barre, la **V3** (dossier de travail `v2`) à droite.
- La barre se déplace librement, sans cran ni raccourci, à la souris ou au doigt. Sa position est gardée.
- Chaque côté a **son propre code ET ses propres fichiers de `public/`** (sons, fx, déchirures, modèles 3D, icônes). Seules les illustrations R2 sont communes.
- Chaque geste fait d'un côté est rejoué de l'autre côté : clics, glisser (déchirure, rotation des cartes), molette, toucher, clavier, saisie. Les défilements et l'écran (#/…) suivent aussi.
- **Mêmes tirages** des deux côtés : la graine est relancée à chaque geste, et la démo a sa propre suite par module (localBackend, packRoll, ecoLocal, ecoLocalJeux, chatLocal, economy).
- **Son** : seulement du côté où se trouve la souris.
- À chaque ouverture, la V3 repart de l'état de la live. Si l'une des copies se recharge, les deux repartent ensemble.
- Les paramètres de l'adresse passent aux deux copies : `?lang=en`, `?backend=webgl`, `?god`, `?force=…`, `?pity`.
- Pour simuler un téléphone : outils de développement de Chrome, vue appareil, sur la page du comparateur.

## Mise à jour
- Le comparateur est reconstruit à chaque `mettre-en-ligne-v2.cmd` : la live reprend la dernière version de `master`, la V3 reprend le dossier de travail. Pousser sur GitHub ne suffit pas.

## Fichiers
- `src/miroir/sonde.js` : script injecté en tête des deux copies. Il cloisonne le stockage, les caches, le service worker et les notifications, relaie les gestes et gère le son.
- `src/miroir/comparateur.ts`, `miroir/index.html` : la page (entrée du build seulement en mode v2).
- `scripts/miroir/build.mjs` : construit `dist/miroir/live` et `dist/miroir/v3`. La live est exportée avec un index git à part, sans toucher au dossier de travail. Ses fichiers de `public/` qui diffèrent de ceux de la V3 sont copiés dans son dossier.
- `functions/miroir/[side]/[[path]].js` : sert d'abord les fichiers propres à chaque copie, puis ceux du site, et les illustrations R2.
- `mettre-en-ligne-v2.cmd` construit le comparateur après le build. Un échec ne bloque pas la mise en ligne.

## Vérifié
- Le type-check passe, et la construction passe sur le PC de Tom (3 s).
- En ligne : la page, les deux copies, les icônes et les illustrations répondent normalement.
- Sur une copie de test (Chrome sans écran) : navigation, défilement et saisie sont identiques des deux côtés, en vue mobile tactile aussi. Sur une ouverture de booster complète, les sauvegardes des deux côtés sont **identiques**.
- Un son modifié côté live est bien copié dans le dossier de la live (essai de la copie de `public/`).

## Limites connues
- Le curseur de saisie et l'anneau de focus ne s'affichent que du côté actif.
- Rien de ce qui passe par le serveur (Convex, Discord, notifications) : c'est la démo hors-ligne.
- Une fonction qui n'existe qu'en V3 fait diverger les deux côtés jusqu'à la prochaine ouverture du comparateur.
- Une illustration remplacée sous le même nom (R2) apparaît des deux côtés.
