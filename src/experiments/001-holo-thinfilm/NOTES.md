# 001 — Holo thin-film

## Intention
Le frisson de la carte holo qu'on incline sous la lampe : la couleur n'est pas *posée*, elle *apparaît* avec l'angle.
Je veux qu'on ait envie de bouger la carte lentement pour "chercher" le reflet, et que l'illustration reste lisible —
le foil est un vernis de lumière, pas un filtre arc-en-ciel.

## Techniques
- **Interférence de couche mince spectrale en TSL** (`core/tsl.ts → thinFilm`) : 12 longueurs d'onde (400–700 nm),
  différence de marche `2·n·d·cosθt`, pondération par les fonctions colorimétriques CIE 1931 (fit de Wyman 2013)
  converties en sRGB linéaire et normalisées → les franges ont les vraies teintes "bulle de savon / huile".
- **Champ d'épaisseur** = motif de foil (linéaire, radial, *cracked ice* via voronoï TSL avec id de cellule, nébuleuse fBm)
  + un faux réseau de diffraction (`dot(V.xy, dir)`) qui fait glisser les teintes au tilt.
- **Grain de foil** : micro-facettes par cellule (hash PCG), injectées comme normal map tangente, puis
  `bumpMap(relief, scale, normalNode)` (paramètre `normalNode` ajouté en r187) pour garder le gaufrage du cadre.
- **Encre sur foil** : les encres sombres éteignent le métal (`metalness ∝ luminance(art)`), le papier du cadre est foilé plus discrètement que l'illustration.
- **Paillettes** : seules les facettes alignées avec la lampe (réflexion objet-space) s'allument.
- Mode comparatif : `iridescence` native de `MeshPhysicalNodeMaterial` (case à cocher).
- Masques par rareté : commune = pas de foil ; peu commune = filets + nom ; rare = + fenêtre ; épique = + fond d'illustration ;
  légendaire = carte entière ; mythique = + sujet. Motif par défaut différent par tier.

## Nouveauté three.js utilisée
`bumpMap(texture, scale, normalNode)` (r187), `MeshPhysicalNodeMaterial.iridescence*Node`.

## Limites
- Le grain par cellule peut scintiller (aliasing) à petite taille d'écran : pas de filtrage des facettes.
- La diffraction est simulée (pas de vrai réseau) ; la couche mince seule varie peu avec l'angle sur des films fins.

## Pistes
- Filtrer le grain par LOD (dérivées écran) pour supprimer le scintillement sur mobile.
- Texture de motif (logo, étoiles) gravée dans l'épaisseur du film — "holo à motif".
- Lier l'intensité du foil à l'inclinaison réelle du téléphone (gyro) plus qu'au pointeur.
