# 030 — Design 3/10 : Cartouche flottant

## Ce que je cherche à faire ressentir
Un objet posé sur une image : on lit la carte comme une étiquette de musée flottante, l’illustration reste libre.

## La carte
Illustration bord à bord, un cartouche de papier posé dessus (ombre portée) avec nom et étoiles ; un onglet en haut porte l’univers.
Format commun aux 10 designs : **nom de la carte + nom de son univers + rareté en étoiles** (1 ★ commune → 6 ★ mythique),
aucune statistique, aucun texte d'ambiance. Couleur des étoiles : pierre, vert-de-gris, cobalt, grenat, or, nacre.

## Rareté (en plus des étoiles)
liseré du cartouche foil dès peu commune ; cartouche et onglet entièrement foil dès légendaire.
Commun à tous : foil holographique sur l'illustration dès épique (`core/holo`), sur le sujet en mythique.

## Vitrine
`core/showcase.ts` — à chaque carte, les étoiles **s'allument une par une** (canal B des masques = index d'étoile),
puis éclat + balayage de foil selon le tier. Tap = carte suivante (tour complet, l'illustration change quand la carte
est de dos : mêmes textures, aucune recompilation). « Diaporama » dans le panneau pour faire défiler les 12 cartes.

## Fichiers
Dessin du cadre et des masques : `src/core/art/designs/` (Canvas 2D). L'illustration est recadrée par design
(agrandissement + recentrage), sans redessiner les sujets.
