# Ambiance « Éclipse » Berserk — v2 (10/11 → 11/11)

**Idée de Tom** : un booster qui contient une carte Berserk 5★ ou 6★ change la scène d'ouverture.

## Fait (v2)
- `a98ae6d` — images de **Femto** et de **Guts (Armure du Berserker)**, fournies par Tom.
- `baccd15` — ambiance d'ouverture.
  - **Sachet fermé** : la lumière vire au cramoisi et la scène s'assombrit.
  - **Sachet descellé** : soleil noir, ciel rouge, crête à l'horizon, lac-miroir où une onde court à chaque carte posée.
  - **Musique** : extrait officiel de 30 s de « Behelit », jusqu'à la fin du booster.
  - **Effets réduits** : seulement la couleur et la pénombre.
- `5bfa225`, `5839b6c` — pour les **6★ Berserk, l'Éclipse remplace la case de manga** des animés.
  - **À l'ouverture** : l'ambiance du booster tient lieu de prélude.
  - **Dans la visionneuse** : scène 6★ « Éclipse » (`src/game/mythic/scenes/eclipse.ts`), avec les indices avant et le bouton « Rejouer ». Pas de musique.
- **11/11 soir, branche `wip/3d`, commit `6001700`, pas encore fusionné dans v2**
  - **Séries ×5 / ×10** : chaque morceau de la série qui contient une Berserk 5★/6★ joue l'Éclipse à son tour. D'abord la pénombre et l'horizon qui rougeoie (1,1 s, jeton `ECLIPSE.suite`), puis le soleil noir se lève. Avant, le ciel montait d'un coup, sans annonce.
  - Le sachet ne vire au cramoisi que pour les 5 premières cartes, exprès, pour ne pas dévoiler la carte trop tôt.
  - **Apôtres** : 9 silhouettes de créatures démoniaques génériques, inventées pour le jeu (`src/game/apostles.ts`, 6 types). Elles se tiennent sur la crête et se reflètent dans le lac, à l'ouverture comme dans la visionneuse. Au téléphone, 3 ou 4 sont visibles et le centre reste dégagé.
  - **Pas de signe ajouté** : le soleil noir porte la scène. La Marque du Sacrifice n'est pas reproduite.
  - **Coût** : une bande de 1280×58 px au téléphone, une lecture de texture par pixel, seulement pendant l'Éclipse. Dans le bruit sur le VM (466 → 469 ms par image en rendu logiciel).
- Cartes Berserk : Femto, Chevalier Squelette, Guts (Armure), Griffith et Guts en 6★ ; Schierke, Farnese et Serpico en 5★.

## Où c'est dans le code
- `src/game/eclipse.ts` : quelles cartes déclenchent l'Éclipse.
- `src/game/scenes/opening.ts` : `eclipseBegin`, `eclipseRise`, `eclipseRipple`, constantes `ECL`.
- `src/game/apostles.ts` : les silhouettes.
- `src/game/mythic/index.ts` : famille `berserk`.
- `src/core/motion.ts` : jetons `ECLIPSE`.

## Vérifié
- Type-check, tests serveur (136 sur `wip/3d`).
- Scène « Éclipse » jouée dans la visionneuse (Femto).
- **Pas vu** : la scène avec les apôtres dans la visionneuse (impossible de la lancer depuis le banc de test). Rien de mesuré sur un vrai téléphone.

## À vérifier par Tom (lien V2, après la fusion ; démo : `…/jeu/?demo&force=pop-femto`)
1. Un ×5 Pop Culture qui contient une Berserk 5★/6★ : le morceau s'assombrit, puis le soleil se lève et la musique démarre.
2. Visionneuse → Guts (Armure du Berserker) 6★ → « Rejouer » : les apôtres sont sur la crête.
3. Ciel, soleil, lac, apôtres : trop rouge, trop sombre ? Fluidité au téléphone.
