# Audit du 06/11 : pourquoi le site paraît flou (aucun code modifié)

Mesuré sur le site en ligne (déploiement 4a1beb07) en 1920×1080 à DPR 1 (les deux écrans de Tom sont en 1080p), puis comparé au même rendu fait en DPR 2 et réduit à 1080p.

## Causes, par ordre d'impact
1. **La 3D est rendue pile à la résolution de l'écran, sans marge.** Sur un écran DPR 1, le canvas fait 1920×1080. Les textures (booster 640 px de large, cartes 768×1072, ×0,85 à l'ouverture) sont affichées plus petites que leur taille réelle, donc le GPU les lit dans un mip intermédiaire (filtrage trilinéaire) : environ 60 % de la version demi-résolution. D'où les logos, les plis du booster et le texte imprimé sur les cartes un peu baveux. Preuve : le même booster rendu à ×2 puis réduit est nettement plus net.
2. **Sur téléphone, la 3D est plafonnée à ×2** alors que les iPhone et la plupart des Android sont à ×3. Le navigateur étire donc l'image ×1,5, et jusqu'à ×2,4 quand le jeu baisse la définition (plancher ×1,25).
3. **Le texte des cartes est dans la texture 3D**, pas dans le DOM : il subit le même filtrage que l'illustration.
4. **L'interface en verre dépoli** (33 `backdrop-filter: blur`) et les ombres floues sur de nombreux éléments : tout ce qui est derrière un panneau est volontairement flou.
5. **Éléments du DOM tournés ou mis à l'échelle** : les cartes du fil « Gros tirages » penchées de 3°, la roue des boosters à ×0,4–1, `will-change: transform` (le navigateur rastérise une fois puis étire le bitmap).
6. **Typographie** : polices display (Bold Frame, Matcha World) en 9–12 px, lettres très espacées, gris peu contrastés (`--ink-3`).
7. Plus léger : tone mapping Neutral (aplatit les hautes lumières), bloom et aberration chromatique pendant l'ouverture.

## Pistes de correction (non appliquées)
- Supersampling de la 3D sur ordinateur (ex. DPR interne ×1,5 sur écran ×1), ou passe de netteté RCAS (FSR1, déjà dans three) après le rendu.
- Biais de mip négatif (−0,5 à −0,75) sur les textures des cartes et du booster, avec l'anisotropie déjà en place.
- Textures des cartes dimensionnées pour l'affichage réel (×1 à l'ouverture sur ordinateur, ×1,5 sur écrans 1440p/4K).
- Téléphone : DPR jusqu'à 3 en vue carte et ouverture, quitte à garder ×2 ailleurs.
- DOM : moins de verre dépoli, pas de rotation sur les blocs de texte, `will-change` retiré après les animations, tailles de texte mini 12–13 px et gris plus contrastés.
