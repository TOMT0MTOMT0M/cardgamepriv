# 021 — Lenticulaire

## Intention
Le charme rétro des cartes lenticulaires (images qui changent selon l'angle) : on incline, et la même scène passe
de l'aube au couchant puis à la nuit. Le grain *physique* compte : nervures visibles, petites bandes parasites
(diaphonie) au moment des transitions, une transition qui balaie la carte plutôt qu'un fondu global.

## Techniques
- Vues = la même carte régénérée avec d'autres palettes (aube, couchant, nuit, orage, aurore) ; 2 vues en commune → 5 en mythique.
- **Sélection de vue** : angle horizontal de vue en espace objet (`atan(V.x, V.z)`) × sensibilité, + **effet loupe** :
  la position sous la lentille (`fract(u · LPI)`) décale l'angle vu → la transition balaie la carte bande par bande.
- **Diaphonie** : près de la frontière entre deux vues, mélange partiel avec la voisine.
- **Nervures** : normale cylindrique périodique pour le matériau ET pour le clearcoat (`clearcoatNormalNode`) — les
  reflets se décomposent en fines lignes. Léger `sheen` au creux des lentilles.

## Nouveauté three.js utilisée
`clearcoatNormalNode` (normal distincte pour la couche de vernis).

## Limites
- Vues = variations de palette (pas d'animation du sujet : les peintres procéduraux n'ont pas encore de paramètre de pose).
- Pas de vraie interlaçage de pixels (sélection analytique), donc pas de moiré réaliste.

## Pistes
- Vues animées (ailes de la phalène, œil qui cligne) → nécessite des sujets paramétrables.
- Lenticulaire vertical sur mobile (le gyroscope incliné avant/arrière change de vue).
- Mode "3D lenticulaire" : vues = profondeurs de parallaxe quantifiées.
