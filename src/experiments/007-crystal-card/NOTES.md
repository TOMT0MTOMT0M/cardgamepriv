# 007 — Carte de cristal

## Intention
L'objet précieux et froid, qu'on tourne vers la lumière. Pas de couleurs imprimées : le sujet est **gravé dans la masse**
(comme les blocs de cristal gravés au laser), le texte est dépoli en surface, et c'est le décor qui, déformé par la
réfraction, donne vie à la carte. La teinte du verre dit la rareté sans un mot.

## Techniques
- Dalle de verre : même géométrie que les cartes (coins arrondis) mais 3,2 mm d'épaisseur, `MeshPhysicalNodeMaterial`
  avec `transmissionNode`, `iorNode`, `thicknessNode`, **`dispersionNode`** (aberration réelle aux arêtes),
  `attenuationColor/Distance` = teinte d'absorption par tier (verre clair → verre de mer → saphir → grenat → citrine → opale).
- **Dépoli** : là où le masque de relief existe (nom, filets, chiffres), rugosité 0.55 + transmission réduite → texte gravé lisible.
- **Gravure laser interne** : 42 000 points tirés dans l'alpha du sujet (CPU), profondeur dans l'épaisseur selon la luminance
  (+ jitter) → un vrai volume. Rendus en `Sprite` instancié via `instancedBufferAttribute`, **opaques** pour être captés
  par la passe de transmission (en transparent, la profondeur de la face avant les masquait — documenté).
- Mythique : iridescence de surface (opale). Légendaire+ : tranche sertie de métal.
- Mur de fond à barres de lumière douces : sans structure derrière, la réfraction est invisible.

## Nouveauté three.js utilisée
`dispersionNode` et transmission des node materials (viewport mip texture), `Sprite.count` + attributs instanciés.

## Limites
- La transmission ne "voit" que les objets opaques rendus avant le verre (pas de verre derrière du verre).
- 42k sprites : correct sur desktop, réduit à 14k en preset mobile.

## Pistes
- Biseau réel sur les arêtes (géométrie chanfreinée) pour des reflets internes plus riches.
- Caustiques projetées sur une table sous la carte (photon-mapping simplifié en compute).
- Gravure animée : les points s'allument par couches quand la carte est révélée.
