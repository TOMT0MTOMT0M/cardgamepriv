# 024 — Vitrail (lumière projetée)

## Ce que je cherche à faire ressentir
Une carte qui n'est pas seulement vue mais qui **éclaire** : dans une pièce sombre, le soleil se lève derrière elle
et ses couleurs se posent sur la table. La rareté se lit autant dans la tache de lumière que sur la carte.

## Techniques
- **Ombres colorées** (three r18x) : `material.castShadowNode = vec4(transmission, 1)` + `renderer.shadowMap.transmitted = true`.
  La carte écrit la couleur de chaque verre dans la shadow map ; la table la reçoit comme une lumière filtrée.
  Les plombs et le cadre écrivent du noir (opaque). Face et dos partagent le même vitrail (UV du dos retournées).
- **Verres** : Voronoï TSL maison qui renvoie aussi le *point* de la cellule → on lit la couleur de l'illustration
  au centre du verre (`texture().level()` = moyenne floue). Deux réseaux : gros verres pour le fond, petits pour le sujet,
  séparés par un plomb qui suit le contour du sujet (alpha flouté).
- **Couleur de verre** : chroma normalisé (les gris deviennent du verre clair, comme le verre cathédrale), densité
  variable par verre, stries orientées au hasard, relief « verre soufflé » (normale par différences finies).
- **Lumière transmise vue de face** : émissif = transmission × (diffusion + lobe direct quand l'œil est dans l'axe du soleil).
  Le bloom ne lit que cet émissif (MRT), il reste discret.
- **Timing** : obscurité → éclaircie qui hésite (nuage, rare+) → montée longue (`EASE.glide`) pendant que le soleil
  balaie et monte (`EASE.breathe`), puis il continue de tourner très lentement.

## Rareté
| tier | effet |
|---|---|
| commune | gros verres presque incolores, plomb sombre |
| peu commune → rare | plus de verres, saturation qui monte, nuage d'anticipation (rare+) |
| épique | verre dichroïque (~1 verre sur 5 change de teinte selon l'angle du soleil, dans la projection aussi) |
| légendaire | plombs dorés, le cadre s'ajoure en verre ambre là où il était doré |
| mythique | une seconde lumière froide (lune) croise le soleil : deux projections superposées |

## Nouveauté three.js exploitée
`castShadowNode` + `shadowMap.transmitted` (ombres colorées / transmises), shadow map par `DirectionalLight` en WebGPU.

## Limites
- En mode `transmitted`, three ne compare plus la profondeur pour la couleur : la carte ne doit pas recevoir d'ombre
  (`receiveShadow = false`), sinon elle se teinte elle-même.
- Pas de caustiques ni de rayons volumétriques (poussière dans le faisceau) : piste évidente.
- Le contour du sujet dépend de l'alpha flouté : plomb plus ou moins épais selon la netteté du dessin.

## Pistes
- Rayons visibles dans la poussière (brouillard volumétrique TSL r186) ; `ProjectorLight` pour une lumière de projecteur.
- Utiliser ce rendu comme **dos de carte** (le dos devient un vitrail neutre), ou pour une salle de collection.
