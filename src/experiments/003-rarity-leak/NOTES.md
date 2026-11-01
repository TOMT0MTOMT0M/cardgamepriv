# 003 — Fuite de lumière (indice de rareté)

## Intention
Le suspense compte plus que l'explosion. Le paquet est fermé, posé sur une table dans le noir ; quelque chose *vit*
dedans. On ne voit pas la carte, on voit sa lumière qui s'échappe — et le **rythme** des pulsations raconte la rareté :
une lueur grise un peu décevante pour une commune, un battement de cœur qui accélère, une fausse pause, puis un
tremblement pour les hauts tiers. Quand on tape enfin, le payoff est bref : inspiration (la lumière se retient), éclat, la carte.

## Techniques
- **Émissif du paquet** composé de : soudures latérales (`exp(-k·distance au bord)`), lignes de scellage haut/bas,
  interstices du crantage (masque G), et lumière **à travers l'impression claire** (luminance² × chute depuis le centre,
  scintillement fBm). Les encres sombres bloquent, le logo s'allume.
- **Lumière renversée sur la table** : SDF du contour du paquet dans le plan de la table → `exp(-22d) + exp(-5d)`.
  Pas de vraie lumière ponctuelle (elle serait occultée par le paquet lui-même) : un halo analytique contrôlable.
- **Poussière en suspension** : `Sprite` instancié (`count`), positions par `hash(instanceIndex)` + dérive temporelle,
  éclairée uniquement près de la source (≥ rare).
- **RenderPipeline + MRT {output, emissive}** : bloom sur l'émissif seul (pas sur toute l'image), `radialBlur` centré sur
  la projection écran du paquet → rais de lumière discrets à partir d'épique.
- Courbe d'intensité analytique : n = tier+1 pulsations, intervalles décroissants, attaque 90 ms, décroissance exp ;
  fausse pause d'1 s avant la dernière (≥ épique) ; maintien en respiration. Mythique : teinte qui dérive dans le spectre.
- Tremblement ∝ intensité × tier. Son : riser, impact, cloche (si 🔊).

## Nouveauté three.js utilisée
`RenderPipeline` (r183) avec MRT, `radialBlur` et `bloom` TSL, `Sprite.count` (instanciation de sprites).

## Limites
- La lumière sur la table n'est pas ombrée par le paquet (halo analytique).
- Le bloom est sur l'émissif uniquement : les reflets spéculaires forts ne bloomeront pas (choix assumé).

## Pistes
- Faire "respirer" le plastique (gonflement léger du maillage) au rythme des pulsations.
- Vibration haptique synchronisée avec chaque pulsation (Android).
- Faire varier la *couleur* avant la fin (fausse piste : bleu → puis or) pour les légendaires.
