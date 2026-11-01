# 002 — Déchirure du booster

## Intention
La petite résistance du plastique avant qu'il cède, puis le *crrr* par à-coups : c'est le geste qu'on fait mille fois
dans une vraie ouverture, et il porte déjà l'anticipation. La récompense arrive juste après : la carte glisse hors du
paquet, la caméra l'accompagne, elle se retourne.

## Techniques
- **Un seul maillage coussin**, rendu deux fois : corps (`maskNode: v < bord(u)`) et bande (`v ≥ bord(u)`).
  Le bord est une somme de sinus incommensurables (dentelé, quasi gratuit).
- **Pelage en vertex (`positionNode`)** : chaque colonne déjà déchirée (`u < P`) tourne autour de la ligne de coupe,
  plus fort vers le haut → la bande s'enroule. Puis elle s'envole (transform CPU + uniform).
- **Stick-slip** : la progression suit le doigt mais n'avance que par paquets aléatoires au-delà d'un seuil
  (résistance initiale plus forte) → secousse, son de déchirure court, lambeaux à chaque rupture.
- **Blanchiment** du plastique étiré le long de la coupe, **intérieur argenté** (`frontFacing` + `DoubleSide`).
- Booster procédural (`core/pack.ts`) : visuel Canvas 2D (marque inventée), foil métallisé, soudures crantées
  (normal map analytique), **froissé cuit dans une texture** puis `bumpMap(tex, scale, normalNode)`.
- Lambeaux : `InstancedMesh` de 90 éclats, physique CPU simple. Séquence de sortie en timeline GSAP avec courbes maison.

## Nouveauté three.js utilisée
`maskNode` des node materials, `bumpMap(…, normalNode)` (r187) pour cumuler crantage + froissé.

## Limites
- La bande ne collisionne rien et ne se plie pas au-delà de l'enroulement analytique.
- Le froissé est une texture : il ne réagit pas à la déchirure (pas de plis qui se créent).
- Première version d'un premier essai de froissé procédural par pixel : trop coûteux (15 bruits/pixel) → abandonné pour la texture.

## Pistes
- Déchirure guidée par le tracé réel du doigt (le bord suit la trajectoire, pas une ligne fixe).
- Fibres/filaments de plastique étirés entre les deux bords pendant la déchirure.
- Haptique (`navigator.vibrate`) synchronisée avec les à-coups sur Android.
