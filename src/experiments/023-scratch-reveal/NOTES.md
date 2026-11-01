# 023 — Grattage

## Intention
Le geste du ticket à gratter, transposé à l'ouverture : on ne *regarde* pas la carte apparaître, on la *dégage*.
On voit d'abord un bout de couleur (est-ce du doré ?), puis un morceau de nom… le suspense est entre les doigts du
joueur. Passé 60 %, la pellicule restante s'écaille d'elle-même et la carte s'illumine brièvement.

## Techniques
- **Storage texture en lecture-écriture** (`NodeAccess.READ_WRITE`, format `r32float`) — nouveauté r183 : le compute
  lit la couverture et la réécrit dans la même passe (pas de ping-pong).
- Tampon le long du **segment** du geste (distance point-segment) → trait continu même à bas framerate ;
  bord **déchiqueté** (rayon modulé par hash + fBm) : la pellicule casse en miettes.
- Pellicule : argent mat imprimé (motif bruité + diagonales), **liseré sombre** et **relief de miettes** au bord des
  zones grattées (normale depuis le gradient du masque).
- **Couverture estimée sur CPU** (grille 48 × 67 marquée le long du geste) → pas de readback GPU.
- Écaillage final : la pellicule restante disparaît selon un seuil de bruit animé ; flash teinté par la rareté.
- Tap = coup de pièce automatique (zigzag) ; son de grattage proportionnel au déplacement.

## Nouveauté three.js utilisée
Storage textures lecture-écriture en TSL (r183).

## Limites
- Pas de copeaux qui tombent (particules) ; la pellicule n'a pas d'épaisseur réelle.
- L'estimation de couverture ignore le bord déchiqueté (approx. à ±5 %).

## Pistes
- Copeaux physiques (InstancedMesh) qui tombent sous le doigt.
- Grattage révélant d'abord un **indice** imprimé sous la pellicule (couleur du tier) avant la carte.
- Vibration haptique pendant le grattage (Android).
