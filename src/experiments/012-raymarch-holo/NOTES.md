# 012 — Hologramme raymarché

## Intention
La carte comme *appareil* : un petit projecteur dans lequel flotte un objet impossible. On tourne la carte et on
tourne autour de l'objet — il est vraiment *dedans*. La rareté ne change pas la couleur seulement, elle change la
complexité de la mécanique (1 → 3 anneaux, gemme fusionnée, lunes en orbite, irisation mythique).

## Techniques
- **Raymarching TSL** dans le fragment shader de la face : rayon = de la surface (`positionLocal`) vers l'intérieur,
  direction = `positionLocal − caméra (espace objet)` → la parallaxe est exacte quel que soit le tilt.
- `Loop` (72 pas, 44 en mobile) avec `Break()` sur impact ou sortie de volume ; pas relaxé (0.85·d, minimum 1.5 mm).
- SDF : tores sur trois axes animés (`rot2`), octaèdre adouci + sphère qui respire fusionnés par `smin` polynomial,
  lunes (légendaire+). Normales par 4 évaluations tétraédriques.
- Rendu "projection" : halo volumique accumulé `exp(−90·d)` le long du rayon, Fresnel, Lambert doux, lignes de
  balayage en espace écran, bande qui défile, scintillement composé ; mythique : liseré en **interférence de couche
  mince** (fonction spectrale de 001).
- Fenêtre : fond de l'illustration assombri (la "cabine" du projecteur), émetteur lumineux au bas, vitre en clearcoat.

## Nouveauté three.js utilisée
`Loop`/`Break`/`If` TSL dans un `Fn` réutilisable (la même SDF est appelée 5× : marche + normales).

## Limites
- Coût fragment proportionnel à la surface de la fenêtre à l'écran : en plein écran sur mobile, viser 30–40 pas.
- Pas d'ombre de l'objet sur la cabine (une 2e marche serait nécessaire).

## Pistes
- Une SDF par sujet de carte (la tour, la phalène…) = "version hologramme" de chaque illustration.
- Interaction : toucher la fenêtre perturbe le champ (onde dans la SDF).
