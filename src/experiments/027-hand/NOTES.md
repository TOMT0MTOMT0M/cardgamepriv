# 027 — Main de cartes (sensation)

## Ce que je cherche à faire ressentir
Le plaisir de manipuler ses cartes avant même de jouer : elles répondent au doigt avec du poids, de l'inertie,
une légère paresse. C'est le prototype le plus « jeu » du lab — tout le reste (rareté, effets) viendra se brancher dessus.

## Techniques
- **Un ressort par axe et par carte** (`Spring` à sous-pas : x, y, z, rx, ry, rz, échelle). La main n'est qu'un calcul
  de cibles : éventail en arc, survol qui soulève/agrandit et écarte les voisines (∝ 1/distance).
- **Glisser** : la carte suit le pointeur sur un plan devant la main ; son inclinaison vient de la **vitesse** lissée
  du geste (roulis, lacet, tangage), comme une carte tenue du bout des doigts.
- **Réordonner** : glisser dans la zone de main ouvre un trou à l'index d'insertion, les autres se poussent.
- **Jouer** : relâcher au-dessus de la ligne de jeu → vol GSAP (anticipation, arc, chute en `power3.in`) vers le
  prochain emplacement libre (contour visible pendant le glisser), impact : anneau de poussière, secousse, son ;
  l'intensité et la couleur de l'anneau montent avec la rareté.
- **Ombres de contact** : un quad SDF (rectangle arrondi) par carte, projeté sur le tapis ; flou et taille ∝ hauteur,
  opacité inverse. Pas de shadow map : c'est plus doux et gratuit.
- **Inspecter** : tap → la carte vient au centre, suit le tilt (souris/gyroscope) ; tap → retour en main.
- Distribution : les cartes arrivent en cascade face cachée puis se retournent une à une.
- La carte de la rareté choisie (au milieu) utilise le foil holo partagé (`core/holo`) à partir de rare.

## Rareté
Seule la carte du milieu change : foil holo (rare+), lueur et anneau colorés à l'impact, secousse plus forte.

## Nouveauté three.js
Aucune spécifiquement : TSL pour le tapis, les ombres SDF et l'anneau. L'intérêt est l'interaction.

## Limites
- Pas de gestion multi-doigts ; pas de « lancer » (relâcher avec élan ne projette pas la carte).
- Les ombres de contact ne tiennent pas compte de la forme inclinée de la carte en vol.
- 5 emplacements fixes sur le tapis ; en portrait ils sont serrés.

## Pistes
- Lancer avec élan et glisse sur le feutre (friction), cartes qui se poussent sur la table.
- Brancher les révélations du lab sur « jouer une carte » (ex. 006 ou 018 au moment de l'impact).
