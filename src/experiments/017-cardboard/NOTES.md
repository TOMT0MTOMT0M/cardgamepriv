# 017 — Carton, vernis & usure

## Intention
Rappeler que c'est un *objet* : du carton qui plie entre les doigts, qui revient en vibrant avec un petit "clac",
dont le vernis attrape la lumière quand il se courbe. Et une histoire : une commune a vécu (coins blanchis,
rayures, encres passées), une légendaire est mint. Si on force trop, le pli reste — le frisson du collectionneur.

## Techniques
- **Pliage cylindrique en vertex** (`positionNode`) sur deux axes successifs, avec des formules **sans annulation
  numérique** (`z' = 2·sin²(θ/2)/κ + z·cos θ`) → stable même à courbure quasi nulle (pas de z-fighting face/dos).
- **Normales exactes** : la normale de géométrie subit la même rotation, puis `transformNormalToView` → `normalNode`.
  Appliqué aux 3 matériaux (face, dos, tranche) → la tranche suit.
- **Ressort sous-amorti** (ζ ≈ 0.1) au relâcher : la carte oscille 2–3 fois. Drag horizontal/vertical = axe de pliage.
- **Vernis sélectif** : clearcoat sur le sujet + éléments en relief, rayé par une texture de rayures (rugosité du vernis).
- **Usure procédurale** : SDF du contour arrondi → bord blanchi effiloché (fBm), coins plus usés, rayures, crasse
  vers les bords, désaturation + jaunissement. Valeur par défaut selon le tier, réglable.
- **Pli permanent** : au-delà de 85 % de la courbure max, une ligne blanche apparaît au centre et reste (`effacer le pli`).

## Nouveauté three.js utilisée
`transformNormalToView`, `positionGeometry`/`normalGeometry` dans un `positionNode` partagé entre matériaux.

## Limites
- Pliage purement cylindrique (pas de torsion, pas de vrai flambage).
- Le pli permanent n'a pas de relief (seulement la couleur) et il est toujours au centre.

## Pistes
- Pli localisé là où le doigt appuie (axe et position libres), avec relief (normal discontinue).
- Coins cornés (déformation locale d'un coin au drag depuis l'angle).
- Usure qui augmente réellement à chaque manipulation et se sauvegarde (la carte "vieillit" dans ta collection).
