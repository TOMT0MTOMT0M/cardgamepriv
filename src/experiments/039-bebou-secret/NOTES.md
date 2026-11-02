# 039 — Carte secrète : « Un de nous »

## Intention
La carte la plus rare du site (0,1 % par pack, uniquement dans le « bébou pack » — cf. `core/packRules.ts`) n'est ni un légendaire ni un mythique : c'est **un
membre du groupe** (thème secret « Les Bébous »). Sa révélation doit être le moment qu'on raconte, et elle repose
sur la **fausse ouverture** — le levier de dopamine le plus fort qu'on ait : l'attente d'une commune, puis la surprise.

## La séquence (≈ 13 s en automatique ; au doigt, c'est le joueur qui fixe le tempo)
1. **Ouverture banale** — même paquet, même combustion à braise pâle qu'une commune (`scénario → rareté de la barre
   d'outils` permet de comparer : les 2 premières secondes sont identiques à l'image près).
2. **Le blocage** — le retournement démarre normalement… et s'arrête la carte sur la tranche. Glitch par tranches,
   arrêt de bande (le son s'effondre vers le grave), la pièce s'éteint *vraiment* (lumière clé + environnement), le
   monde se désature : seule la tranche luit, or rose.
3. **Silence** — 1,3 s sans rien. Puis la carte se remet lentement de dos ; la poussière commence à monter de la table.
4. **Le cœur — au doigt (par défaut)** — c'est **le joueur qui fait battre le cœur** : chaque tap = un battement. Taper vite
   (écart < 0,6 s) renforce le battement (son, secousse). Une fois les 6 battements donnés, le dos est fendu et **le tap
   suivant libère la carte** : le payoff arrive quand il le décide. Indication « touche · fais battre son cœur » seulement
   s'il n'a pas tapé au bout de 1,1 s. Filet de sécurité : sans tap pendant 1,7 s le cœur bat tout seul, et 2,2 s après le
   6e battement le payoff part tout seul — la séquence ne reste jamais bloquée. Pendant la fausse ouverture et jusqu'à la
   révélation, un tap ne relance pas la séquence (avant, un tap impatient la recommençait).
   **En automatique** (`cœur` dans le panneau, ou `?coeur=auto`) : 6 battements de plus en plus rapprochés (1,05 s → 0,4 s). À chaque battement : les fissures de
   lumière gagnent le dos (Voronoï à 2 échelles, front bruité depuis le centre), une pulsation passe à travers le
   carton, la caméra avance d'un cran, le halo se range en anneau derrière la carte.
5. **Souffle retenu** — le dos entier se fend, la carte tremble, montée de bruit.
6. **Payoff** — la carte vrille (2 tours ½, `expo.out`), onde de choc, inversion éclair, flash or rose, flare, aberration,
   7 000 confettis et étincelles, chœur synthétique + cloche + nappe. Les couleurs reviennent.
7. **Retombée** — « CARTE SECRÈTE » s'écrit lettre à lettre, puis le surnom, puis « 1 chance sur 1 000 · un de nous ».
   Le foil s'éveille, le halo continue de tourner : la carte flotte devant son auréole.

## Techniques
- Fissures : `voronoi()` (core/tsl) → arêtes `f2 − f1`, deux échelles, révélées par un front `smoothstep` dont le
  rayon suit les battements ; émissif → MRT → bloom (la lumière « fuit » vraiment).
- Désaturation sélective : en post, `scène − émissif` passe en gris teinté, l'émissif est rajouté en couleur.
- Glitch : tranches horizontales décalées (hash par tranche et par 1/30 s) + séparation RVB, 0,3 s.
- Confettis : `SpriteNodeMaterial.rotationNode` (rotation) + `scaleNode` en `vec2` (bascule = hauteur ∝ |cos|),
  balistique analytique sans état (traînée exponentielle, gravité, battement latéral).
- Halo : sprites analytiques, poussière au sol → anneau elliptique qui tourne, « respire » au payoff.
- Son (core/audio.ts, ajoutés) : `heartbeat()`, `tapeStop()`, `choir()`.
- **Haptique** (`navigator.vibrate`, Android/Chrome ; ignorée sans erreur sur iOS) : un coup sec au blocage, un
  « poum-poum » par battement calé sur les deux coups du son (plus fort à chaque battement), un tremblement qui monte
  pendant le souffle retenu, une grosse vibration au payoff.

## La carte Bébou
- Gabarit dédié `bebou` (core/art/designs/bebou.ts) : photo pleine carte, double filet or rose, et à la place des
  étoiles le **sceau des huit** (étoile à 8 branches, une par membre). Surnom en grand, « LES BÉBOUS · 03/08 ».
- Photo : `public/art/bebous/bebou-N.png`. Détourée (fond transparent) → portrait en parallaxe sur fond or rose ;
  classique (fond opaque) → pleine illustration. Jamais de détourage automatique sur une photo (`CardData.photo`).
- Le foil ne recouvre pas la photo (un visage ne se couvre pas d'arc-en-ciel) : il reste sur le cadre, le sceau, le surnom.
- Les 8 photos actuelles sont des **silhouettes provisoires** (1–4 opaques, 5–8 détourées, pour tester les deux chemins).

## Réglages
- Tap = rejouer avec un autre Bébou (jamais deux fois le même d'affilée).
- Panneau : scénario (secret / rareté de la barre d'outils), Bébou imposé, **cœur (au doigt / automatique)**, vitesse.
- URL (captures) : `?speed=0.15` ralentit tout, `?bebou=3` impose un Bébou, `?coeur=auto` battements automatiques.

## Limites / pistes
- Rendu fin à juger sur vrai GPU (SwiftShader ≈ 0,6 fps ici).
- Fait (1er nov.) : battements au doigt + haptique. Testé en headless (SwiftShader) : tap précoce ignoré, 6 battements au
  tap puis libération → révélation 1,8 s après le tap, mode automatique, et cas « personne ne touche » (révélation par
  le filet de sécurité). Ressenti à valider sur téléphone (le tempo du filet de sécurité surtout).
