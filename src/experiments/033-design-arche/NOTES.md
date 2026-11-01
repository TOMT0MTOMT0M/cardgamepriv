# 033 — Design 6/10 : Arche

## Ce que je cherche à faire ressentir
Un retable : la carte se contemple. La forme d’arche donne de la verticalité aux sujets.

## La carte
Fenêtre en arc brisé dans un cadre de pierre claire, clé de voûte avec l’emblème de l’univers, nom sur une banderole.
Format commun aux 10 designs : **nom de la carte + nom de son univers + rareté en étoiles** (1 ★ commune → 6 ★ mythique),
aucune statistique, aucun texte d'ambiance. Couleur des étoiles : pierre, vert-de-gris, cobalt, grenat, or, nacre.

## Rareté (en plus des étoiles)
banderole foil dès peu commune ; arche et clé de voûte foil dès rare ; cadre foil à 75 % dès légendaire.
Commun à tous : foil holographique sur l'illustration dès épique (`core/holo`), sur le sujet en mythique.

## Vitrine
`core/showcase.ts` — à chaque carte, les étoiles **s'allument une par une** (canal B des masques = index d'étoile),
puis éclat + balayage de foil selon le tier. Tap = carte suivante (tour complet, l'illustration change quand la carte
est de dos : mêmes textures, aucune recompilation). « Diaporama » dans le panneau pour faire défiler les 12 cartes.

## Fichiers
Dessin du cadre et des masques : `src/core/art/designs/` (Canvas 2D). L'illustration est recadrée par design
(agrandissement + recentrage), sans redessiner les sujets.
