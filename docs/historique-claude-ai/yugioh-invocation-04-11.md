# Invocation Yu-Gi-Oh (6★) — 04/11

Cinématique jouée à la place de la séquence mythique pour les 10 cartes 6★ Yu-Gi-Oh du pack Pop Culture, sur ordinateur et téléphone.

## Déroulé (≈ 10 s)
1. Le dos de la carte brûle et devient le dos choisi par Tom (`public/fx/yugioh/back.webp`).
2. La carte se pose sur un terrain de duel qui s'allume, et la caméra descend à hauteur de genou en ouvrant l'angle. En même temps démarre « l'heure du duel » (`sfx/duel.mp3`, fourni par Tom).
3. La carte se retourne, puis le faisceau de projection s'allume.
4. Le monstre apparaît en hologramme (bleu, balayage, glitchs) et pousse son cri.
5. Il se matérialise du bas vers le haut, puis son nom s'affiche.
6. Flash, retour à l'ouverture (la carte en plein écran, ses étoiles), puis la suite du booster.

1er toucher : la matérialisation se termine tout de suite. 2e toucher : fin. Le bouton « Passer » arrête tout. « Effets réduits » coupe les secousses et les glitchs et adoucit les flashs.

## Fichiers
- Scène : `src/game/scenes/duelSummon.ts` ; table des 10 cartes : `src/game/scenes/duelMonsters.ts` ; animation des squelettes : `src/game/scenes/duelRig.ts`.
- Branchement : `opening.ts` (événement `onCinematic` + `resumeAfterCinematic()`, phase `scene` comme la rencontre Pokémon) et `shop.ts` (`prepareDuel`, scène montée pendant l'ouverture du booster).
- Sons synthétisés ajoutés à `core/audio.ts` : `duelSting`, `holoHum`, `scanSweep`, `creature(kind)`, `loadSample` / `playSample`.
- Labo : `042-duel-summon` (`?carte=pop-dark-magician`, `?speed=0.25`).
- Démo : `/jeu/?demo&force=pop-blue-eyes-white-dragon` met la carte en 6★ dans le prochain booster Pop Culture.

## Ressources (`public/fx/yugioh/`, servies par le site, pas par R2)
- `<carte>.webp` + `<carte>-z.webp` : illustration détourée + relief, pour l'hologramme 2.5D (`scripts/make-holo-yugioh.py` : rembg + Depth Anything V2).
- `models/<carte>.glb` : s'il existe, il remplace l'hologramme 2.5D. Il garde sa couleur, ses normales, son ORM et sa découpe alpha. Il est mis à l'échelle sur sa silhouette réelle, ailes comprises.
  - Modèle sans animation avec un squelette de dragon ailé (os NECK / HEAD / OPTION_00_L/R…) : animé par `duelRig.ts`. Il se déplie en montant (cou dressé, ailes ouvertes), ouvre la gueule au cri, puis respire (battement d'ailes, queue).
  - Modèle avec ses propres clips : il joue `summon` puis `idle`.
- **Blue-Eyes White Dragon** : vrai modèle (FBX `imports/Raw Files/`, ~44 000 triangles), converti avec ses textures par `scripts/yugioh-fbx/convert.py` (984 Ko : meshopt + WebP 1024). Sans lueur ajoutée sur les yeux (retour de Tom). Validé par Tom le 04/11.
- Les 6 autres .glb (Gemini) sont des formes simples (~350 triangles), utilisés à la demande de Tom en attendant de vrais modèles. Sans .glb (Yami, Kaiba, Jaden), c'est l'hologramme de l'illustration.
- Nouveau modèle trouvé en FBX + .tga : `python3 scripts/yugioh-fbx/convert.py "<fbx>" public/fx/yugioh/models/<carte>.glb --parts '{"eyeball":"eye","head":"head","body":"body"}' --alpha head`.
- `sfx/<carte>.mp3` : cri de la carte s'il existe et dure ≤ 12 s (coupé en fondu après ~4,5 s). Sinon, cri synthétisé.
- `sfx/duel.mp3` : extrait de 14 s fourni par Tom.

## État
- Commité le 04/11 (`d4e9c70`) avec la rencontre Pokémon.
- Pas encore commités : le vrai modèle Blue-Eyes, `duelRig.ts`, le cadrage et la matière des modèles dans `duelSummon.ts`, et `scripts/yugioh-fbx/`.

## À faire / à décider
- De vrais modèles pour les 6 autres monstres (même conversion).
- Rejouer l'invocation depuis la visionneuse (comme la rencontre Pokémon) si Tom le veut.
