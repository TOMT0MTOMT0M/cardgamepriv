# 005 — Combustion

## Intention
Une ouverture "rituelle" : on choisit où allumer, et on regarde le paquet se consumer lentement autour de la carte
qui, elle, ne brûle pas. Le plaisir est dans le front irrégulier, le bord qui rougeoie puis s'enroule, les escarbilles
qui s'envolent pile au bon endroit. La lenteur crée l'attente ; plus la carte est rare, plus le feu prend son temps.

## Techniques
- **Champ de combustion unique** `field(p) = |p − ignition| + fBm(4.2p)·0.2 + fBm(26p)·0.025` en espace local du paquet
  (face et dos partagent le même xy → le trou traverse l'épaisseur). Front = `field − B`.
- Matériau : `maskNode = front > 0`, zone carbonisée (couleur, rugosité, métal coupés), liseré de braise `exp(−180·front)`
  + halo `exp(−38·front)`, scintillement fBm temporel. **`positionNode`** : le bord carbonisé s'enroule vers l'extérieur.
- **Particules sans état** : chaque escarbille/cendre (Sprite instancié) a un point d'origine sur le paquet (hash) et
  évalue le *même* champ dans son vertex shader → elle naît exactement quand le front la touche, puis monte et refroidit.
  Aucune simulation, rejouable à volonté, coût fixe.
- **Post** : bloom sur l'émissif + **brume de chaleur** (échantillonnage décalé de la couleur de scène, piloté par le bloom,
  uniquement pendant la combustion).
- Allumage au point touché (raycast sur le plan du paquet). Durée = distance au coin le plus lointain / vitesse,
  allongée selon la rareté. Couleur du feu : physique (≤ rare), teintée par le tier au-delà, blanche en mythique.
- Son : allumage sourd, grondement, crépitements aléatoires, cloche à la libération (si 🔊).

## Nouveauté three.js utilisée
`TextureNode.sample()` sur la sortie d'une passe (`RenderPipeline`) pour la distorsion écran ; `maskNode`.

## Limites
- Les cendres sont des disques (sprites) : pas de vrais flocons qui tournent.
- La brume de chaleur déforme aussi ce qui est devant la flamme (pas de test de profondeur).
- fBm évaluée par fragment et par particule : coûteux sur mobile (preset mobile = 45 % des particules).

## Pistes
- Remplacer les sprites de cendres par de petits quads orientés (InstancedMesh) qui tournoient.
- Souffler sur le téléphone (micro) pour attiser le feu.
- La carte qui "chauffe" révèle un motif caché à l'encre thermochromique (seulement pour les hauts tiers).
