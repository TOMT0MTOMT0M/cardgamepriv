# 035 — Design 8/10 : Suisse (typographique)

## Ce que je cherche à faire ressentir
Le contre-pied : zéro ornement, tout est dans la typographie et le numéro de collection (très « objet de collection »).

## La carte
Grille stricte, sans empattement, une couleur d’accent ; nom en très gros, illustration en bande, numéro de collection en maigre géant. Étoiles = carrés.
Format commun aux 10 designs : **nom de la carte + nom de son univers + rareté en étoiles** (1 ★ commune → 6 ★ mythique),
aucune statistique, aucun texte d'ambiance. Couleur des étoiles : pierre, vert-de-gris, cobalt, grenat, or, nacre.

## Rareté (en plus des étoiles)
accent = couleur d’univers puis couleur de rareté dès rare ; numéro et barre foil dès épique ; nom foil en mythique.
Commun à tous : foil holographique sur l'illustration dès épique (`core/holo`), sur le sujet en mythique.

## Vitrine
`core/showcase.ts` — à chaque carte, les étoiles **s'allument une par une** (canal B des masques = index d'étoile),
puis éclat + balayage de foil selon le tier. Tap = carte suivante (tour complet, l'illustration change quand la carte
est de dos : mêmes textures, aucune recompilation). « Diaporama » dans le panneau pour faire défiler les 12 cartes.

## Fichiers
Dessin du cadre et des masques : `src/core/art/designs/` (Canvas 2D). L'illustration est recadrée par design
(agrandissement + recentrage), sans redessiner les sujets.
