# Mesure perf sur vrais téléphones — 07/11/2026 (sans harnais)

**En ligne 15 h 25** : `f40879b` sur `fix/retours-live-02` (= `f552b5b` + optimisation worker ci-dessous). Pages https://2a67e64f.cardgamepriv.pages.dev. Avant : `f552b5b` à 15 h 05 = `681c253` Ouverture officielle + `90c1fcb` diag v2 + `f552b5b` nom moulé en cache. **`lanceurs/ouverture.cmd` (heure d'ouverture, remise à zéro) N'A PAS été lancé** : à faire par Tom ce soir (voir `claude/ouverture-07-11.md`).

## Outil (déjà dans le jeu, étendu)
- `game/diag.ts` `reportLoad` → retours du labo, une fois par appareil et par version (`LOAD_REPORT_V = 'charge-2'`), `?diag` force :
  - entrée « Chargement » (`diag-charge-<appareil>`) : boutique à X s, jalons (`étape 15/35/85/100 %`, `plis:peinture|worker|cache`, `nom moulé <pack> (cache) · worker|sur place`), tâches longues, appareil, + 6 pires images avec leurs scripts ;
  - entrée « Usage » (`diag-usage-<appareil>`) à 2 min 30 après la boutique : images > 80 ms par page (#/…), 10 pires avec scripts.
- `core/perfLog.ts` : observateur **Long Animation Frames** (Chrome / Android ; pas Safari ni Firefox) : par image > 80 ms, durée, style + mise en page, page, 3 scripts les plus longs `ms fichier.js:position fonction (type invocateur)`.
- Lecture : sur le PC (VM) `curl "$VITE_CONVEX_SITE_URL/lab/feedback?key=$(cat .feedback-key)"` (= `node scripts/pull-feedback.mjs`), filtrer les entrées `diag-*`. Positions → code : rebâtir le MÊME commit avec `vite build --sourcemap hidden` (mêmes noms de fichiers) et résoudre `fichier:position` avec la carte de sources.

## Avant (rapports v1, 06-07/11, avant le sachet moulé)
- Samsung Internet (WebGPU, DPR 3,75) : boutique 3,3 s, gel 1,1 s au démarrage, 0,4-0,5 s ×2 juste après.
- Chrome Android (UA « ordinateur », 980×1832) : boutique 6,3 s, plis 1,4 s, 20 tâches longues (6 s), pire 1,8 s.
- Firefox Android (WebGL2) : boutique 8,7 s, pas de tâches longues mesurables.
- Scènes 3D sur téléphone : 31-34 i/s avec gels ~1 s (Samsung : 58-60 i/s).

## Rapports charge-2 (07/11 14 h 08-14 h 11, première visite après f552b5b)
- Samsung : boutique 4,14 s. Chrome Android 4 Go : boutique 11,85 s.
- Par sachet (×5) : `plis:peinture` ≈ 1 s + `nom moulé` 0,4-0,9 s, sur le fil principal (cache vide à la 1re visite).
- Une image de **5 s** à 6,9 s avec ~25 ms de script = création des pipelines GPU par l'image de préchauffage (`opening.ts` `post.render()` sous l'écran de chargement, voulue : sans elle le gel tombe pendant la 1re ouverture). Pas touché : `compileAsync` ne couvre pas MRT/MSAA (audit), et la 2e visite (cache de shaders de Chrome) doit d'abord être mesurée.
- `cardImages.ts:148` (miniatures 2D peintes d'un bloc) : tâches de 316 ms.

## Optimisation (en ligne 15 h 25, commit `f40879b`, patch `.claude-tmp/0010-perf-worker.patch` via `pousser-perf-worker.cmd`)
- `core/packCrease.ts` (pur, déplacé tel quel de pack.ts) + `core/packWorker.ts` : carte des plis (`crease`) et moulage du nom (`mold` : relief + normales + AO + ombrage vignette) calculés dans un **Web Worker** ; repli sur place si le worker échoue (20 s max). Relief toujours mis en cache (Cache Storage).
- `packLabel.ts` : `resampleRGBA` (bilinéaire) + `moldFront`.
- `cardImages.ts` : `generateCardArtAsync` avec la main rendue entre chaque étape (requestIdleCallback).
- Vérifié : tsc client + convex, 89 tests, build (worker 8,4 Ko), patch appliqué sur f552b5b, push + Pages OK.

## Prochaine étape
Rapports `?diag` après relance : attendre `plis:worker` / `nom moulé … · worker` et la disparition des 316 ms ; regarder si l'image de 5 s revient à la 2e visite.
