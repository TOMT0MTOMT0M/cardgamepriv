# 034 — Design 7/10 : Médaillon

## Ce que je cherche à faire ressentir
Le bijou : la carte devient un pendentif. Le cercle recentre tout sur le sujet.

## La carte
Fenêtre ronde comme un camée sur velours, anneaux et perles d’or, nom et univers gravés le long du cercle, filigranes aux coins.
Format commun aux 10 designs : **nom de la carte + nom de son univers + rareté en étoiles** (1 ★ commune → 6 ★ mythique),
aucune statistique, aucun texte d'ambiance. Couleur des étoiles : pierre, vert-de-gris, cobalt, grenat, or, nacre.

## Rareté (en plus des étoiles)
anneaux et perles foil (atténués en commune) ; nom gravé foil dès rare ; étoiles colorées dès rare.
Commun à tous : foil holographique sur l'illustration dès épique (`core/holo`), sur le sujet en mythique.

## Vitrine
`core/showcase.ts` — à chaque carte, les étoiles **s'allument une par une** (canal B des masques = index d'étoile),
puis éclat + balayage de foil selon le tier. Tap = carte suivante (tour complet, l'illustration change quand la carte
est de dos : mêmes textures, aucune recompilation). « Diaporama » dans le panneau pour faire défiler les 12 cartes.

## Fichiers
Dessin du cadre et des masques : `src/core/art/designs/` (Canvas 2D). L'illustration est recadrée par design
(agrandissement + recentrage), sans redessiner les sujets.
