# 018 — Mythique : « L'Éclipse »

## Intention
Le moment qu'on raconte aux amis. Une séquence d'une dizaine de secondes qui *mérite* sa rareté, construite comme
un morceau de musique : battements qui accélèrent, **silence** (fausse pause, la pièce s'assombrit), le paquet se
consume par le centre dans un feu spectral, une éclipse se forme — le temps ralentit, des milliers de particules
convergent et *dessinent* le contour de la carte —, puis l'onde de choc, l'inversion éclair, le retournement.
Et surtout la retombée : le foil spectral "s'éveille" lentement, la lumière revient, la carte est à toi.

## Combinaison de techniques du lab
- Fuite de lumière par les soudures (003) → battements, fausse pause, assombrissement de la périphérie.
- Combustion par champ fBm (005), front **spectral** (teinte qui tourne avec l'angle polaire et le temps), bord qui s'enroule.
- Lentille gravitationnelle + horizon + liseré (011) au ralenti (`timeScale` 0.3).
- Convergence de particules (009) — ici **analytique** (sprites sans état : coquille → contour → dérive).
- Onde de choc en espace écran (anneau qui pousse les UV), inversion de luminance, flash, flare anamorphique
  (`core/post.ts → anamorphicFlare`), aberration chromatique, vignette (006).
- Foil spectral de 001, extrait en module réutilisable (`core/holo.ts`), dont l'intensité monte après le payoff.
- Son : battements, riser, grondement, impact, cloche, nappe scintillante.

## Escalade par tier
La séquence complète n'existe qu'en mythique : commune = combustion + retournement ; ≥ rare = battements ;
≥ épique = fausse pause + flare ; ≥ légendaire = éclipse au ralenti + onde de choc ; mythique = particules + inversion.

## Nouveauté three.js utilisée
Assemblage de toute la chaîne TSL : `RenderPipeline` + MRT, `bloom`, `chromaticAberration`, `BloomNode.highPassFn`,
`pass().getTextureNode().sample()`, `Sprite.count`, `maskNode`/`positionNode`.

## Limites
- Démarrage après 3 frames de chauffe : la 1re frame compile les pipelines de post (sinon la timeline, en temps réel, avance pendant la compilation).
- Impossible à valider image par image dans mon environnement (GPU logiciel ~1 fps) : la logique de la timeline est
  vérifiée par trace d'état ; **le rendu fin est à juger chez toi**.

## Pistes
- Musique générée synchronisée (tempo = battements), haptique sur mobile.
- Laisser le joueur *provoquer* l'éclipse (maintenir le doigt = charger), relâcher = payoff.
