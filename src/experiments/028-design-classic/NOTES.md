# 028 — Design 1/10 : Classique

## Ce que je cherche à faire ressentir
La carte « honnête » : rien ne détourne de l’illustration. C’est aussi le gabarit par défaut de toutes les autres expériences.

## La carte
Le gabarit de base du lab : papier, double filet, grande fenêtre, nom en haut, étoiles en haut à droite, bandeau d’univers en bas.
Format commun aux 10 designs : **nom de la carte + nom de son univers + rareté en étoiles** (1 ★ commune → 6 ★ mythique),
aucune statistique, aucun texte d'ambiance. Couleur des étoiles : pierre, vert-de-gris, cobalt, grenat, or, nacre.

## Rareté (en plus des étoiles)
filets et nom foil dès peu commune ; liseré de fenêtre et emblème foil dès rare ; carte entièrement foil dès légendaire.
Commun à tous : foil holographique sur l'illustration dès épique (`core/holo`), sur le sujet en mythique.

## Vitrine
`core/showcase.ts` — à chaque carte, les étoiles **s'allument une par une** (canal B des masques = index d'étoile),
puis éclat + balayage de foil selon le tier. Tap = carte suivante (tour complet, l'illustration change quand la carte
est de dos : mêmes textures, aucune recompilation). « Diaporama » dans le panneau pour faire défiler les 12 cartes.

## Fichiers
Dessin du cadre et des masques : `src/core/art/designs/` (Canvas 2D). L'illustration est recadrée par design
(agrandissement + recentrage), sans redessiner les sujets.
