# 010 — Carte-fenêtre (diorama)

## Intention
Que la carte soit une *fenêtre* et pas une image : en l'inclinant, on découvre ce qu'il y a à côté de la tour, plus loin
dans la vallée. L'émerveillement du "il y a un monde là-dedans". La rareté ne change pas le monde, elle change
**l'heure** : couvert, matin, heure bleue, couchant pourpre, heure dorée, nuit avec aurore.

## Techniques
- **Portail par passe** (technique de l'exemple officiel `webgpu_portal`) : `pass(sceneDiorama, camera)` utilisée comme
  nœud de couleur, échantillonnée en `screenUV` → le diorama est rendu avec *la même caméra*, la parallaxe est exacte.
- Le diorama est **solidaire de la carte** (sa matrice = celle de la carte, avec une échelle en profondeur réglable) :
  c'est une boîte derrière la vitre, pas un fond d'écran.
- Fenêtre en **émissif** (le monde a déjà son propre éclairage), cadre en albédo ; ombre intérieure du cadre via la SDF
  de fenêtre ; vitre = `clearcoat` seulement dans la fenêtre (reflets du studio par-dessus le monde).
- Diorama low-poly : terrain `positionNode` fBm (vallée creusée), `flatShading`, **brouillard r187**
  `fog(color, rangeFogFactor(near, far))`, tour en segments empilés avec fenêtres éclairées par hash de cellule,
  astre, nuages et oiseaux en `Sprite` instanciés animés en TSL ; aurore (fBm en rideaux) + étoiles pour le mythique.

## Nouveauté three.js utilisée
`fog()` + `rangeFogFactor()` (remplace `rangeFog`, supprimé), `pass()` comme texture de matériau.

## Limites
- Une passe de rendu supplémentaire plein écran (le diorama n'est pas recadré sur la fenêtre).
- Un seul diorama (celui de *La Tour Muette*) : un diorama par sujet serait un vrai chantier artistique.

## Pistes
- Rendre la passe portail à résolution réduite + upscale (TAAU/FSR1 r184) pour le mobile.
- Diorama vivant selon l'heure réelle du téléphone.
- Toucher la vitre : ondulation (normal map animée) qui déforme le monde derrière.
