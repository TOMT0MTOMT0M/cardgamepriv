# 022 — Taille-douce (billet)

## Intention
Traiter la carte comme un objet de valeur, au sens propre : gravure de billet de banque, encre en relief qu'on
"sent" à la lumière rasante, papier de sécurité fibré, micro-texte invisible à l'œil nu. Et un geste d'expert : la
loupe qu'on promène pour vérifier l'authenticité. Les hauts tiers ont des encres de sécurité (or métallique,
encre **optiquement variable** qui change de couleur avec l'angle — un vrai dispositif anti-contrefaçon).

## Techniques
- **Gravure au trait** : champ de lignes parallèles ondulées (guilloché : double sinus), épaisseur = obscurité de l'image
  (`smoothstep(w, w − aa, |fract − 0.5|·2)`), **hachures croisées** dans les ombres profondes.
- Hors de la fenêtre : impression monochrome au seuil (texte, filets) ; micro-texte (`CARD·LAB·SÉRIE·I…`) tuilé dans un
  liseré de 1 mm autour de la fenêtre, illisible sans loupe.
- **Loupe** : raycast pointeur → UV ; dans le disque, UV grossies ×4 ; bord sombre + clearcoat (verre).
- **Relief de l'encre** : normale dérivée de la phase des lignes (`cos`), seulement là où il y a de l'encre.
- Encres par tier ; légendaire = métallique, mythique = OVI (mélange par angle + couche mince spectrale).
- Papier : fibres colorées par sinus haute fréquence.

## Nouveauté three.js utilisée
Rien de spécifique (TSL pur sur un `MeshPhysicalNodeMaterial`).

## Limites
- Le trait est calculé par pixel : aliasing visible si la densité est trop forte pour la taille à l'écran
  (à filtrer avec `fwidth`).
- Pas de filigrane (il faudrait un rétro-éclairage).

## Pistes
- Anti-aliasing analytique des lignes (`fwidth`) et densité adaptative à la distance.
- Filigrane visible quand on "tient la carte devant la lumière" (rétro-éclairage via un mode).
- Numéro de série unique par carte (gravé, différent à chaque ouverture).
