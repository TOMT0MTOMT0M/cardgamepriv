# 036 — Design 9/10 : Estampe (sceau)

## Ce que je cherche à faire ressentir
Une estampe signée : le sceau est la marque d’authenticité, il devient un marquage à chaud pour les hauts tiers.

## La carte
Papier washi fibreux, illustration en panneau vertical, nom écrit de haut en bas, sceau vermillon portant l’emblème de l’univers.
Format commun aux 10 designs : **nom de la carte + nom de son univers + rareté en étoiles** (1 ★ commune → 6 ★ mythique),
aucune statistique, aucun texte d'ambiance. Couleur des étoiles : pierre, vert-de-gris, cobalt, grenat, or, nacre.

## Rareté (en plus des étoiles)
étoiles vermillon puis couleur de rareté dès rare ; sceau foil dès légendaire ; bord de l’image foil en mythique.
Commun à tous : foil holographique sur l'illustration dès épique (`core/holo`), sur le sujet en mythique.

## Vitrine
`core/showcase.ts` — à chaque carte, les étoiles **s'allument une par une** (canal B des masques = index d'étoile),
puis éclat + balayage de foil selon le tier. Tap = carte suivante (tour complet, l'illustration change quand la carte
est de dos : mêmes textures, aucune recompilation). « Diaporama » dans le panneau pour faire défiler les 12 cartes.

## Fichiers
Dessin du cadre et des masques : `src/core/art/designs/` (Canvas 2D). L'illustration est recadrée par design
(agrandissement + recentrage), sans redessiner les sujets.
