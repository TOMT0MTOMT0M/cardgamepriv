# 004 — Gaufrage & dorure brossée

## Intention
L'objet *imprimé* de luxe : on sent le papier coton, les lettres dorées en relief qu'on aurait envie de toucher,
le vernis qui ne brille que sur le sujet. La lumière rasante qui tourne lentement fait "vivre" le relief même quand
on ne touche à rien. Contre-pied du holo : la richesse vient de la matière, pas de la couleur.

## Techniques
- **Normal map générée sur CPU** (`buildNormalMap`) : hauteur = relief (masque G) passé par deux flous (profil biseauté
  arrondi), fenêtre d'illustration légèrement enfoncée, motif de losanges **gaufré à sec** dans le papier, fibres
  de papier ; normales par différences centrales (Sobel), encodées en texture → `normalMap(tex, scale)`.
  Plus propre que `bumpMap` (dérivées écran) : pas d'aliasing, indépendant de la taille à l'écran.
- **Dorure à chaud anisotrope** : `anisotropyNode` (vec2 en espace tangent) avec 3 brossages — linéaire, tourné
  (concentrique), soleil (rayons art déco). Micro-rayures : bandes de hash perpendiculaires au brossage qui modulent
  la rugosité.
- **Métal par rareté** : gaufrage à sec (commune, sans métal) → cuivre → argent → or rose → or → chrome noir + or (mythique, bicolore).
- **Vernis sélectif** : `clearcoat` = alpha du sujet dans la fenêtre. `sheen` léger sur le papier (velouté).
- Lampe rasante en orbite + environnement "galerie".
- `compileAsync()` (parallèle en r187) en fin de setup : la carte n'apparaît qu'une fois les pipelines prêts.

## Nouveauté three.js utilisée
`anisotropyNode` de `MeshPhysicalNodeMaterial`, `compileAsync()` parallèle (r187).

## Limites
- La normal map est générée à la résolution de la carte (768 px) : en très gros plan, le biseau se pixellise.
- Shader lourd (anisotropie + clearcoat + sheen) : compilation lente sur GPU logiciel ; à surveiller sur mobile.

## Pistes
- Vraie SDF (jump flooding en compute) pour des biseaux nets à toutes les échelles.
- Débossage "contre-forme" au dos de la carte (le relief se lit en négatif).
- Mode "lampe torche" au doigt : la lumière rasante suit le pointeur.
