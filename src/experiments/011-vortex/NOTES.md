# 011 — Vortex

## Intention
L'espace lui-même se tord : ce n'est pas le paquet qui s'anime, c'est l'image entière qui est aspirée (comme une
lentille gravitationnelle). Le moment de suspense est un **cœur noir qui bat** à la couleur du tier ; puis le
tourbillon s'inverse et recrache d'abord des cartes banales, et la bonne en dernier — anticipation → pause → payoff.

## Techniques
- **Distorsion screen-space dans le `RenderPipeline`** : la sortie de la passe est rééchantillonnée en `screenUV`
  tourné autour du centre (angle ∝ chute gaussienne × torsion) et pincé radialement (aspiration).
  Trois échantillons R/G/B à des angles légèrement différents → aberration chromatique *dans le sens de la rotation*.
- Horizon sombre (disque), liseré lumineux teinté par le tier, bras de spirale discrets (angle polaire + torsion).
- Centre du tourbillon = projection écran de l'objet (origine `screenUV` en haut à gauche).
- **Mur à grille de points** : c'est lui qui rend la déformation lisible (sans structure, un tourbillon sur un dégradé ne se voit pas).
- Paquet aspiré en spirale (rayon `k(1−k)`, rotation en `k²`), 4 cartes "de remplissage" en art aplati demi-résolution
  éjectées en éventail, carte finale qui se déroule (rotation z) avec anticipation. Pulsations du cœur = tier + 2 battements.

## Nouveauté three.js utilisée
`RenderPipeline` + `TextureNode.sample()` (distorsion arbitraire de la passe de scène).

## Limites
- La distorsion déforme aussi la carte finale tant que le tourbillon n'est pas refermé (assumé, mais discutable).
- Pas de profondeur : un objet devant le vortex est déformé comme le fond.

## Pistes
- MRT avec un masque "objet" pour ne déformer que le décor.
- Faire tourner le tourbillon avec le doigt (geste circulaire = torsion).
