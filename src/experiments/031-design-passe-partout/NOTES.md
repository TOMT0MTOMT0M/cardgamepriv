# 031 — Design 4/10 : Passe-partout (musée)

## Ce que je cherche à faire ressentir
La carte comme une œuvre encadrée : calme, précieuse. La rareté transforme le cadre (biseau doré, filet d’or).

## La carte
Large marie-louise crème, biseau de coupe, cartel de musée (nom, univers en italique, étoiles en timbre sec).
Format commun aux 10 designs : **nom de la carte + nom de son univers + rareté en étoiles** (1 ★ commune → 6 ★ mythique),
aucune statistique, aucun texte d'ambiance. Couleur des étoiles : pierre, vert-de-gris, cobalt, grenat, or, nacre.

## Rareté (en plus des étoiles)
étoiles en timbre sec (blanc) pour commune/peu commune, colorées dès rare ; biseau doré dès épique ; filet d’or dès légendaire.
Commun à tous : foil holographique sur l'illustration dès épique (`core/holo`), sur le sujet en mythique.

## Vitrine
`core/showcase.ts` — à chaque carte, les étoiles **s'allument une par une** (canal B des masques = index d'étoile),
puis éclat + balayage de foil selon le tier. Tap = carte suivante (tour complet, l'illustration change quand la carte
est de dos : mêmes textures, aucune recompilation). « Diaporama » dans le panneau pour faire défiler les 12 cartes.

## Fichiers
Dessin du cadre et des masques : `src/core/art/designs/` (Canvas 2D). L'illustration est recadrée par design
(agrandissement + recentrage), sans redessiner les sujets.
