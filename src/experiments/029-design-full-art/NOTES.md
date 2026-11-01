# 029 — Design 2/10 : Pleine illustration

## Ce que je cherche à faire ressentir
L’effet « full art » des cartes chassées : la carte entière est l’image, le nom n’est qu’une signature.

## La carte
Illustration bord à bord, voile sombre en bas qui porte le nom en grand, univers au-dessus, étoiles en haut à gauche.
Format commun aux 10 designs : **nom de la carte + nom de son univers + rareté en étoiles** (1 ★ commune → 6 ★ mythique),
aucune statistique, aucun texte d'ambiance. Couleur des étoiles : pierre, vert-de-gris, cobalt, grenat, or, nacre.

## Rareté (en plus des étoiles)
liseré intérieur dès peu commune, foil dès rare ; nom foil dès légendaire.
Commun à tous : foil holographique sur l'illustration dès épique (`core/holo`), sur le sujet en mythique.

## Vitrine
`core/showcase.ts` — à chaque carte, les étoiles **s'allument une par une** (canal B des masques = index d'étoile),
puis éclat + balayage de foil selon le tier. Tap = carte suivante (tour complet, l'illustration change quand la carte
est de dos : mêmes textures, aucune recompilation). « Diaporama » dans le panneau pour faire défiler les 12 cartes.

## Fichiers
Dessin du cadre et des masques : `src/core/art/designs/` (Canvas 2D). L'illustration est recadrée par design
(agrandissement + recentrage), sans redessiner les sujets.
