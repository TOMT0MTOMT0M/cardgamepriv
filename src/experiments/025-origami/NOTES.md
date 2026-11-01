# 025 — Enveloppe origami

## Ce que je cherche à faire ressentir
Le plaisir tactile d'ouvrir une lettre : le sceau qui cède, la pointe qui accroche, le papier qui se déroule et
garde la mémoire de son pli. Rien de « magique » au début — l'intérieur imprimé révèle la rareté avant la carte.

## Techniques
- **Pli roulant** : chaque rabat est une grille 26 × 15 dont la forme est recalculée chaque frame (CPU, ~1 500 sommets) :
  l'angle cumulé le long du rabat `a(s) = θ·min(1, s/lb) + boucle·smoothstep(0.3H, H, s)` est intégré en (sortant, haut).
  Replié (θ = π), le rabat repose à la hauteur 2·lb/π : chaque rabat a sa couche (W/E < S < N).
- **Boucle de la pointe** pilotée par la vitesse angulaire (la pointe traîne quand le rabat va vite, retour amorti).
- **Mémoire du pli** : le papier ne retombe jamais à plat (θ final ≈ 0.09 rad), il retombe puis se relève légèrement.
- **Une seule feuille** : attribut `sheet` = coordonnées dans le patron déplié → le motif intérieur est continu d'un rabat
  à l'autre. `frontFacing` choisit kraft (extérieur, cachet postal procédural) ou impression intérieure.
- **Sceau pré-rompu** : deux demi-cylindres, chacun collé au point matériel du centre de son rabat (N et S) — ils partent
  avec leur rabat.
- **Indice de rareté** : une `PointLight` teintée sous les rabats ; à travers le papier, une lueur émissive très douce
  (rare+), qui s'échappe quand la pointe se décolle et éclaire l'intérieur des rabats.

## Rareté
commune : papier blanc · peu commune : guillochis fin teinté · rare : treillis imprimé · épique : treillis en foil ·
légendaire : feuille d'or en éclats (Voronoï) sur fond profond · mythique : film irisé + éclats d'or. Le décollement de
la pointe accroche plus longtemps et la carte attend plus avant de se lever quand le tier monte.

## Nouveauté three.js
Pas une API récente : l'intérêt est la déformation et la chorégraphie. (Matériau 100 % TSL, `frontFacing`, attributs custom.)

## Limites
- Pas d'épaisseur de papier ni de collision entre rabats (ils se croisent légèrement près des coins pendant l'ouverture).
- Pas d'ombres : la carte et les rabats ne s'ombrent pas mutuellement (une contact shadow aiderait beaucoup).

## Pistes
- Ombres portées (la lumière rasante le mérite), papier légèrement translucide face à la lumière.
- Version « lettre » : on tire la carte hors d'une pochette (glissement + friction).
