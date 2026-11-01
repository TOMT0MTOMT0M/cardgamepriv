# 016 — Sculpture en gaussian splats (pop-up)

## Intention
Un livre pop-up magique : le sujet de l'illustration *se lève* hors de la carte et prend du volume, avec la texture
douce et un peu "peinte" propre aux gaussian splats. On tourne la carte et on voit le relief, les ocelles de la
phalène qui dépassent, la paillette qui accroche la lumière.

## Techniques
- **Addon officiel `GaussianSplat` (r186)** + `createGaussianSplatGeometry` / `writeCovariance` (`GaussianSplatUtils`),
  données **100 % procédurales** (aucune capture) : pas de fichier `.splat`/`.spz`.
- **Gonflage** : l'alpha du sujet est échantillonné (210 × 163), distance au contour par **chamfer 3-4 en 2 passes**,
  hauteur = √distance (profil en dôme). Une gaussienne aplatie par échantillon, **orientée selon la normale du dôme**
  (quaternion petit-angle), + une couche arrière plus sombre et plus large (volume).
- Couleurs converties sRGB → linéaire (le lab travaille en linéaire, les splats lisent les octets tels quels).
- Les zones émissives du sujet (masque fx) sont légèrement plus lumineuses.
- **Pop-up** : `scale.z` de l'objet animé de 0 à 1 avec un ressort (les covariances suivent la transformation).
- Paillettes en suspension près du sujet à partir de rare (petites gaussiennes chaudes). Tri automatique de l'addon.

## Nouveauté three.js utilisée
`GaussianSplat` natif (r186) — fonctionne aussi sur le fallback WebGL2 de `WebGPURenderer`.

## Limites
- Première version avec une "aura" de grosses gaussiennes transparentes : bouillie orange → **retirée**.
- Les sujets fins (la tour) donnent un relief faible ; les sujets larges (phalène, œil, fleur) rendent bien mieux.
- Tri CPU des splats à chaque mouvement de caméra (≈ 50k : OK desktop, à surveiller sur mobile).

## Pistes
- Animer les gaussiennes (battement des ailes) via un compute qui réécrit les centres.
- Faire "pousser" la sculpture couche par couche (seuil sur la hauteur) plutôt qu'un simple scale.
- Mélanger avec 012 : la sculpture splat comme contenu de l'hologramme.
