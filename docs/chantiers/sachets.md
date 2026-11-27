# V3 — sachets « Autocollant » dans le jeu (27/11/2026, Tom + Claude, racine / `v2`)

Décidé (Tom + Hugo, 27/11) : variante B (cartouche) partout ; Gaming noir `#1b1b21`, Sport jaune `#ffd60a`, World vert
citron `#a6ee0c`, Pop inchangé, Bébou Pack turquoise `#10d0d8` ; booster du moment à la couleur du thème de l'événement
(`EVENT_THEMES`) ; matière allégée (passe 2 du labo 047). Rendu validé : `docs/labo/047-sachets/07` à `11`.

## Plan (où le jeu dessine ses sachets, ce que chaque endroit reçoit)
1. **Visuel** (`opening.ts` : `genArt`, 1er visuel) : `generatePackArt(style simple)` → sachet « Autocollant » B dans la langue du joueur, 5 boosters + booster du moment. Masque des autocollants écrit DANS `art.masks` (R = encre / autocollant de la face, G = brillant, B = ligne de déchirure inchangée), soudures calculées depuis la hauteur → aucune texture en plus.
2. **Grand booster** (`buildPackMaterials`) : matière allégée ; brûlure, « bientôt », ombrage, fuite de lumière, relief des plis inchangés.
3. **Vignettes et fiche** (`shop.ts` via `packThumb`) : `thumbFront` porte déjà relief du nom et autocollants → rien à changer.
4. **Roue 3D du téléphone** (`packWheel3d.ts`) : métal seulement hors encre (masque réduit à 256 px).
5. **Déchirure et Retroussé** (`buildTearMaterials`, `buildRollMaterials`) : même surface à l'extérieur, envers alu inchangé ; masque reçu par `tearNodes`. Cuisson et plis inchangés.

## Fait
- `9e63807` lot 3 — `core/packSticker.ts` : `gameSachetArt`, mode `film.jeu`, `inkSurface` (matière allégée lue dans `masks`) ; `opening.ts` : `boosterArt` + grand booster ; `packWheel3d.ts` ; `pack.ts` : `PackArt.inked`. Défaut corrigé : lignes du terrain du Sport (liseré sombre sous la craie, trait plus large).
- `58ed935` lot 4 — Déchirure et Retroussé lisent le masque. `BAKE_REV` / `CREASE_VERSION` NON montés : géométrie cuite identique, `paintCreaseMap` intouché, les nouvelles graines de plis ont leur propre clé de cache (`nonreg.mjs` sans objet).
- `dc0067b` lot 5 — `EVENT_THEMES` + `eventThemeOf` dans `core/events.ts` (teinte de la palette, sinon nom de l'événement ; teinte libre = logo neutre) ; palette du dashboard = les 6 thèmes (violet, fuchsia, pétrole, cuivre retirés ; un événement enregistré garde sa teinte) ; démo Valorant au thème Jeux vidéo ; date de fin sur l'étiquette dateuse.
- `31a33d7` lot 6 — génération découpée (`pause()` entre les étapes, jeu seulement) : pire tâche par sachet 51–61 ms → moins de 50 ms (CPU ×4).
- Lien V3 mis à jour (`mettre-en-ligne-v2.cmd`, 27/11 16 h 38, lots 3 à 5 ; le lot 6 suit à la prochaine mise en ligne).

## Mesures (Chrome sans fenêtre, WebGPU, GPU du PC de Tom, 390 × 844, `/jeu/?demo&quality=mobile`, 3 tours)
| | avant (`38cd63d`) | après |
|---|---|---|
| GPU par image rendue, vitrine au repos (horodatages WebGPU) | 0,207 ms | 0,187 ms (−10 %) |
| GPU par image rendue, roue en mouvement | 0,200 ms | 0,181 ms (−9 %) |
| JS par image (repos / roue) | 0,2–0,3 / 0,6–0,7 ms | idem |
| Génération d'un sachet, CPU ×4 (une fois par session, en tâche de fond) | 136–188 ms | 265–330 ms, aucune tâche > 50 ms (lot 6) |
Cadence : plafonnée par le jeu (≈ 43 images rendues/s au repos, ≈ 74/s roue), identique. Mesures en cadence libre écartées (elles mêlent le plafond à 60 i/s du téléphone). Scripts : `.claude-tmp/sachets/mesure.mjs`, `gen.mjs`.

## Vérifié
- `npm run typecheck`, `npm run test:server` (52 fichiers, 307 tests), `npm run check:i18n` = 0.
- Captures (Chrome sans fenêtre, WebGPU) : boutique, roue, fiche, une ouverture complète par sachet (Gaming, Pop, Sport, World, Bébou, Valorant), un ×10 (50 cartes), le Retroussé, l'ordinateur (roue verticale), le labo 047 ; aucune erreur console. Lueur du sachet scellé comparée à la version en ligne : identique.

## À vérifier par Tom (lien V3, téléphone)
- Boutique : les 6 sachets dans la roue (encre mate, alu seulement sur le cartouche du nom et les soudures), Sport : lignes du terrain.
- Une Déchirure et un Retroussé : la bande arrachée et l'envers restent alu ; l'ouverture d'une 6★ (fuite de lumière) inchangée.
- Booster du moment : un événement enregistré avec une ancienne teinte (violet, fuchsia…) et un nom hors thème garde sa teinte avec un logo neutre ; le rouvrir dans le dashboard (« Thème du sachet ») pour lui donner un thème.

## Reste
- [ ] Avis de Tom et Hugo au téléphone.
- [x] (ménage V3, 27/11 — décidé : on les laisse) Textes des autocollants (« 5 cartes », « SÉRIE · … ») : restent en FR / EN dans `packSticker.ts` (table `TX`). Raisons : dessin calé à la main mot par mot (une traduction changée ailleurs déborderait) ; langue passée en paramètre (le labo 047 montre FR ou EN quelle que soit l'interface, `t()` ne sert que la langue active) ; le jeu passe déjà la langue du joueur (`gameSachetArt`). Pas dans un worker, pas de cache versionné (toile refaite à chaque chargement). Rendu inchangé. Détail : `menage-v3.md`.
- [ ] Événements déjà enregistrés en prod (violet, fuchsia…) : à repasser sur un thème dans le dashboard le jour de la mise en ligne de la V3.

## Pièges
- Une autre session travaillait sur `opening.ts` dans la racine : travail fait dans `.wt-sachets` (branche `sachets-jeu` tirée de `origin/v2`), poussé par `git push origin sachets-jeu:v2`, racine avancée en avance rapide.
- Deux sessions sur le même port DevTools (9341) : l'une pilotait le Chrome de l'autre. Prendre un port à soi (ici 9457) et un port vite à soi (5213).
- `resolveTimestampsAsync` de three.js ne rend que la DERNIÈRE image : sommer `backend.timestampQueryPool.render.timestamps`.
