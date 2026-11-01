# 006 — Escalade post-FX par tier

## Intention
Isoler la variable "habillage". Le geste est toujours le même (recul, retournement, retombée) ; seul l'écrin change.
Je veux qu'on sente la *hiérarchie* sans lire l'étiquette, et que même le mythique reste élégant : une impulsion
courte, puis tout retombe. Le mode « cycle auto » enchaîne les 6 tiers pour comparer.

## Escalade
| tier | ajout |
|---|---|
| commune | rien — un retournement propre, c'est tout |
| peu commune | bloom léger sur les reliefs, cloche |
| rare | + aberration chromatique en impulsion |
| épique | + flare anamorphique, ralenti (×0.75), secousse, désaturation à l'anticipation puis étalonnage teinté, impact sourd |
| légendaire | + ralenti ×0.45, poussière d'objectif (`lensDirt`), nappe scintillante |
| mythique | + inversion éclair (2 frames), zoom-punch (`radialBlur`), ralenti ×0.25 |

## Techniques
- **Ralenti réel** : `timeScale` de la timeline GSAP animé autour de l'instant où la face apparaît.
- **Flare anamorphique** : second `BloomNode` à ¼ de résolution dont on remplace `highPassFn` par un passe-haut + flou
  horizontal 48 taps sur une `rtt()` (même principe que l'exemple officiel `webgpu_postprocessing_anamorphic`).
- Bloom sur l'**émissif** uniquement (MRT) : seuls les reliefs (masque G) et les zones émissives du sujet s'allument.
- `chromaticAberration` (addon TSL), `lensDirt` (r187) alimenté par le bloom + texture de poussière procédurale,
  `radialBlur` pour le zoom-punch, `saturation()` pour l'étalonnage, inversion de luminance teintée, vignette.
- Secousse : deux ressorts découplés (x/y) excités au payoff, amplitude = `rarity.shake`.
- `setRarity` à chaud : la carte est reconstruite dans un sac de ressources dédié (pas de fuite en cyclant).

## Nouveauté three.js utilisée
`lensDirt()` (r187), `BloomNode.highPassFn` + `rtt()`, `RenderPipeline`.

## Limites
- Les valeurs d'escalade sont "à l'oreille" : à calibrer avec tes retours (curseur « intensité FX »).
- L'aberration chromatique est appliquée après le bloom → le halo se colore aussi (choix, discutable).

## Pistes
- Profil d'escalade éditable (courbe par tier) exporté en JSON pour le jeu final.
- Tester l'ordre inverse : FX pendant l'anticipation, calme au payoff (contre-intuitif mais parfois plus fort).
