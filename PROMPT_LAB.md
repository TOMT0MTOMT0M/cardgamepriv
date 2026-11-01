# MISSION — Card Lab : expérimentations 3D WebGPU (cartes, ouverture de packs, rareté)

Tu es un développeur créatif WebGL/WebGPU senior, du niveau des sites primés "Site of the Day" sur Awwwards. Tu travailles en autonomie dans ce dossier (vide au départ).

## Contexte
Je prépare un jeu de cartes privé entre amis. Avant de concevoir le jeu, je veux un **laboratoire d'expérimentations** : beaucoup de prototypes visuels courts, différents les uns des autres, que je vais tester puis trier. Je te dirai ensuite lesquels garder et pousser.

**Ton seul objectif : la QUANTITÉ et la DIVERSITÉ d'expériences visuelles de haute qualité.** Pas de gameplay, pas de règles, pas de backend, pas de comptes, pas de design de l'interface admin.

## Stack imposée
- Vite + TypeScript (strict), `npm`.
- **three.js dernière version stable** (`npm i three@latest`, vérifie la version installée et note-la dans `LAB_NOTES.md`). Imports `three/webgpu` et `three/tsl`.
- `WebGPURenderer` partout, avec le fallback WebGL2 automatique. Tous les shaders en **TSL** (node materials, `Fn`, `uniform`, `storage`, `compute`). Pas de `ShaderMaterial` GLSL sauf si une expérience le justifie (dis-le).
- Post-processing via `RenderPipeline` (anciennement `PostProcessing`, renommé en r183) et les nodes de `three/addons/tsl/display/*` (bloom, DOF, chromatic aberration, motion blur, TRAA, etc.).
- Temps via `Timer` (pas `Clock`, déprécié).
- Panneau de réglages : `lil-gui` ou Tweakpane. Perf : `stats-gl` (ou équivalent compatible WebGPU) + timestamps GPU si disponibles.
- Libs autorisées si utiles : GSAP (timelines), Rapier (`@dimforge/rapier3d-compat`) pour la physique, `troika-three-text` ou texte en SDF/MSDF. Rien d'autre sans le noter.

**IMPORTANT — API qui bouge vite :** l'API TSL/WebGPU change à chaque release. Ne te fie PAS à ta mémoire. Avant d'utiliser une fonction, vérifie qu'elle existe dans `node_modules/three/src/nodes/`, `node_modules/three/examples/jsm/` et les exemples officiels `webgpu_*` de la version installée. Repères récents à exploiter : storage textures lecture/écriture en TSL (r183), `compileAsync()` non bloquant (r184), upscaling FSR1/TAAU (r184), Forward+ / clustered lighting (r185), `compileComputeAsync()`, `SunLight` + cascaded shadows, addon Gaussian splatting, PBR à conservation d'énergie retravaillée (r186). `rangeFog`/`viewportResolution` ont été supprimés (→ `fog(color, rangeFogFactor(near, far))`, `screenSize`). S'il existe une version plus récente, lis son changelog et exploite ses nouveautés en priorité.

## Architecture du lab (fonctionnelle, pas jolie)
```
src/
  main.ts                 // shell : sidebar + canvas + panneau GUI
  core/
    registry.ts           // liste de toutes les expériences
    Experiment.ts         // interface commune
    renderer.ts           // WebGPURenderer partagé, resize, DPR cap
    cardModel.ts          // géométrie de carte réutilisable (coins arrondis, épaisseur, tranche)
    cardData.ts           // données fictives : nom, rareté, stats, calques d'art
    rarity.ts             // tiers : common, uncommon, rare, epic, legendary, mythic
    art/                  // génération procédurale des illustrations placeholder
  experiments/
    001-holo-thinfilm/
      index.ts
      NOTES.md            // concept, techniques, nouveauté utilisée, limites, pistes
    002-.../
```
- Interface `Experiment` : `{ id, title, category, tags, tech[], setup(ctx), update(dt), dispose(), params?, replay?() }`. `dispose()` doit tout libérer (géométries, matériaux, textures, render targets, listeners) : je dois pouvoir passer d'une expérience à l'autre 50 fois sans fuite.
- Routing par hash : `#/exp/001-holo-thinfilm`. Rechargement = même expérience.
- Sidebar groupée par catégorie (A/B/C/D ci-dessous), avec tags de techno.
- Barre d'outils globale sur chaque expérience : **Replay**, **sélecteur de rareté** (doit changer le rendu/l'animation), **WebGPU/WebGL2** (forcer le fallback), **DPR**, **capture PNG**, FPS + temps GPU.
- Boutons **👍 / 👎 + note texte** par expérience, sauvegardés en localStorage, avec un bouton "Export JSON" : c'est comme ça que je te ferai mon retour.
- Interactions communes : tilt à la souris avec inertie (ressort), drag/rotation, et **gyroscope sur mobile** (on jouera beaucoup sur téléphone).

## Contenu des cartes
- Aucune image protégée, aucun personnage existant. Art **100 % procédural** (SDF, noise, formes géométriques, typographie) ou images que je déposerai dans `public/art/`.
- Chaque carte = calques : fond / sujet / premier plan / cadre / texte, + **masques** (zones foil, zones emboss, zones émissives). Ces calques servent au parallaxe et aux effets.
- Format carte réaliste : ratio 63×88 mm, coins arrondis, vraie épaisseur, tranche visible.

## Liste des expériences (minimum 18, vise plus)
Chaque expérience doit explorer une idée DIFFÉRENTE. Ajoute les tiennes si elles sont meilleures.

**A. Rendu de carte (matériaux & surfaces)**
1. Holo thin-film : iridescence par interférence en TSL selon l'angle de vue, masque de zones, grain de foil.
2. Foil gravé/embossé : normal map générée (SDF texte + motifs), métal anisotrope (`MeshPhysicalNodeMaterial`).
3. Carte en verre/cristal : transmission, dispersion, iridescence, sujet suspendu à l'intérieur.
4. Carte-fenêtre : la carte est un portail vers un mini-diorama 3D (render target ou stencil), parallaxe réel quand on la tilte.
5. Hologramme raymarché : SDF animée dans le cadre via `Fn` + boucles TSL.
6. Surface fluide : simulation (compute + storage textures lecture/écriture) d'encre/liquide sur la carte, réactive au curseur.
7. Carte en particules : la carte est faite de N particules GPU (compute) qui se désassemblent/réassemblent.
8. Gaussian splat : sujet en splat via l'addon officiel (si disponible dans la version).
9. Matière physique : carton qui plie (déformation vertex), reflets de vernis sélectif, usure/patine.

**B. Ouverture de pack**
10. Déchirure de l'emballage : plastique froissé (normal procédurale, spéculaire), découpe le long d'un tracé SDF, lambeaux.
11. Dissolve/brûlure : bord émissif à base de noise, cendres en particules.
12. Shatter : fracture Voronoï du pack, débris avec Rapier.
13. Vortex/portail : distorsion screen-space dans le `RenderPipeline`, aspiration des cartes.
14. Éventail + flip : sortie des cartes, chorégraphie caméra, révélation une par une avec timing travaillé (anticipation → pause → payoff).

**C. Rareté (le moment fort)**
15. Indice de rareté AVANT la révélation : lumière colorée qui fuit du pack, intensité selon le tier (le suspense compte plus que l'explosion).
16. Escalade post-FX par tier : bloom, flare anamorphique, aberration chromatique, slow-motion, screen shake, bascule colorimétrique.
17. Bursts compute : particules curl-noise avec traînées, quantité et comportement selon la rareté.
18. Mythic : une séquence unique, la plus ambitieuse du lab (combine plusieurs techniques).

**D. Bonus si le temps le permet**
- Classeur/collection 3D (instancing, BatchedMesh, des centaines de cartes à 60 fps).
- Sound design généré en Web Audio, synchronisé aux animations.
- Duel de deux cartes face à face (juste visuel, sans règles).

## Exigences de qualité (anti "IA slop")
- INTERDIT : dégradés violet/cyan génériques, glow partout, bloom à fond, néon par défaut, particules aléatoires sans intention, easing linéaire, animation qui dure trop longtemps.
- OBLIGATOIRE : retenue, palette pensée par expérience, contraste de valeurs, **timing et easing soignés** (springs, courbes personnalisées), anticipation et récompense, micro-détails (grain, imperfections, poussière, rugosité variable), lumière crédible.
- Chaque effet doit avoir une **intention** expliquée dans son `NOTES.md` ("ce que je cherche à faire ressentir").
- Performance cible : 60 fps sur un laptop récent, ≥ 30 fps sur un téléphone milieu de gamme. Plafonne le DPR, propose un preset "mobile" dans la GUI.

## Process de travail
1. Phase 0 : setup du projet, shell du lab, `cardModel`, `rarity`, art procédural de base. Vérifie que WebGPU s'active et que le fallback WebGL2 marche.
2. Puis enchaîne les expériences **une par une**, dans un ordre qui alterne les catégories (pas toutes les cartes d'abord).
3. Après chaque expérience : `npm run build` sans erreur TS, vérification dans un navigateur (Playwright headless avec flags WebGPU si possible : capture d'écran + zéro erreur console), puis commit git `exp(00X): titre`.
4. Tiens `LAB_NOTES.md` à jour : tableau de toutes les expériences (id, titre, techniques, nouveauté three.js exploitée, état, fps mesuré, limites connues).
5. Ne t'arrête pas pour me demander validation entre deux expériences. Si une piste échoue, documente pourquoi dans ses NOTES et passe à la suivante.
6. Ne peaufine pas une expérience au-delà de ~1 à 2 h d'effort : la priorité est la variété. Je choisirai lesquelles pousser.

## Livrable final
- `npm install && npm run dev` lance le lab.
- `LAB_NOTES.md` complet + un résumé de 10 lignes : tes 3 expériences préférées et pourquoi, et les 3 qui méritent le plus d'être poussées techniquement.

Commence maintenant par la phase 0.
