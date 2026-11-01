# LAB NOTES — Card Lab

## Versions installées (vérifiées dans `node_modules`)
| paquet | version |
|---|---|
| three | **0.187.0 (r187)** — dernière stable au 1er nov. 2026 |
| @types/three | 0.187.0 |
| vite | 8.3.5 (Rolldown) |
| typescript | 7.0.2 (compilateur natif) — `strict: true` |
| lil-gui | 0.21.0 |
| stats-gl | 4.2.3 (FPS + CPU + GPU via timestamp queries WebGPU) |
| gsap | 3.15.0 |
| @dimforge/rapier3d-compat | 0.21.0 |
| @fontsource-variable/fraunces, @fontsource/ibm-plex-mono | typo des cartes (ajout hors liste : polices locales, pas de CDN) |
| @vitejs/plugin-basic-ssl (dev) | HTTPS local pour tester sur téléphone (ajout hors liste) |

`troika-three-text` n'est **pas** utilisé : il dérive des `ShaderMaterial` incompatibles avec les node materials.
Le texte des cartes est rendu en Canvas 2D dans les calques (net, gratuit, et sert aussi de masque de relief).

## Nouveautés three.js r183 → r187 repérées (changelog lu) et exploitées
- r183 : `RenderPipeline` (ex-`PostProcessing`), storage textures lecture/écriture en TSL.
- r184 : `compileAsync()` non bloquant, FSR1 / TAAU.
- r185 : Forward+ / clustered lighting.
- r186 : `GaussianSplat` natif (PLY/SPZ), matériau rétroréfléchissant, `LightProbeGrid`, brouillard volumétrique TSL.
- r187 : `bumpMap(tex, scale, normalNode)`, `compileAsync()` parallèle, `getTextureGradient()`, `BatchedMesh` qui fusionne les draws consécutifs,
  `NodeMaterialInstance` (ex-`ProxyNodeMaterial`), `three/tsl` tree-shakeable, `lensDirt()`, `BitonicSort` en une passe,
  disposal de tous les buffer attributes, iridescence `thicknessRange` physique.

## Architecture
```
src/main.ts            shell : sidebar, routing #/exp/<id>, toolbar, feedback, GUI, stats, boucle (Timer)
src/core/
  Experiment.ts        interface commune + LabContext
  registry.ts          liste des expériences (import() à la demande)
  renderer.ts          WebGPURenderer partagé, backend forcé, DPR plafonné, preset mobile
  bag.ts               "sac" de ressources libérées automatiquement au changement d'expérience
  input.ts             tilt souris à ressort, drag avec élan + aimantation, gyroscope (recentrage lent), taps
  ease.ts              ressorts, courbes maison (glide, heave, breathe, settle, snap), rng déterministe
  audio.ts             sound design Web Audio 100 % synthétisé (désactivé par défaut)
  cardModel.ts         géométrie 63×88 mm : grille déformable à coins arrondis (mapping carré→disque), dos, tranche
  cardData.ts          12 cartes fictives (noms, stats, palettes, sujets)
  rarity.ts            6 tiers + paramètres (intensité, foil, particules, suspense, shake, ralenti) + tirage pondéré
  cardMaterial.ts      composite TSL des calques avec parallaxe réelle, SDF de fenêtre, tranche à âme sombre, dos foil
  env.ts               environnements studio procéduraux (softboxes → PMREM), mis en cache
  stage.ts             scène + caméra cadrée sur la carte (paysage/portrait), fond dégradé + grain
  tsl.ts               voronoï avec id, hash 2D, interférence de couche mince spectrale, utilitaires
  art/                 illustrations 100 % procédurales (Canvas 2D) : 8 sujets, cadre, texte, masques, dos guilloché
```
Chaque carte = 6 textures : `bg`, `subject`, `fg` (calques de parallaxe), `frame` (cadre + texte, fenêtre transparente),
`masks` (R foil · G relief · B émissif), `fx` (R émissif sujet · G foil sujet · B relief sujet) + `flat` (aplatie).

## Vérification
- `npm run build` (tsc strict + vite) après chaque expérience.
- `scripts/verify.cjs` (Playwright) : capture + zéro erreur console. Dans mon conteneur (pas de GPU), WebGPU tourne sur
  **SwiftShader** (CPU) : les FPS mesurés là ne veulent rien dire (1–6 fps) ; colonne "fps" = mesure SwiftShader, à remplacer par tes mesures.
- Découverte : en headless pur, la présentation d'un canvas WebGPU échoue (`Instance dropped in popErrorScope`, device perdu) —
  il faut une vraie fenêtre (Xvfb) + `--use-webgpu-adapter=swiftshader`.

## Tableau des expériences
| id | titre | techniques | nouveauté three.js | état | fps (SwiftShader 1180×780) | limites connues |
|---|---|---|---|---|---|---|
| 001 | Holo thin-film | thin-film spectral 12λ, voronoï TSL, micro-facettes, paillettes | `bumpMap(normalNode)` r187, iridescence native (comparatif) | ✅ WebGPU + WebGL2 | 1.7–3.5 | scintillement du grain à petite taille |
| 002 | Déchirure du booster | maskNode bord dentelé, pelage `positionNode`, stick-slip, lambeaux instanciés, froissé cuit | `bumpMap(normalNode)` r187 | ✅ | 0.9–6 | bande sans collision ; froissé statique |
| 003 | Fuite de lumière | émissif soudures/translucidité, halo SDF sur table, poussière Sprite instanciée, MRT + bloom + radialBlur | `RenderPipeline` + MRT, `Sprite.count` | ✅ | 0.6–0.7 | halo non ombré |
| 004 | Gaufrage & dorure brossée | normal map Sobel générée CPU, `anisotropyNode` 3 brossages, clearcoat sélectif, sheen | `compileAsync()` parallèle r187 | ✅ | 2.9–3 | biseau pixellisé en très gros plan |
| 005 | Combustion | champ fBm partagé, particules sans état, brume de chaleur post, braises | `TextureNode.sample()` sur passe | ✅ | 0.3–0.6 | fBm par particule coûteux |
| 006 | Escalade post-FX par tier | bloom émissif, flare anamorphique (highPassFn+rtt), CA, lensDirt, radialBlur, ralenti GSAP timeScale, secousse | `lensDirt` r187, `RenderPipeline` | ✅ | 0.9 | calibrage à l'oreille |
| 007 | Carte de cristal | transmission, `dispersionNode`, atténuation par tier, gravure laser 42k sprites opaques, dépoli | dispersion/transmission node materials | ✅ | 0.6–0.7 | pas de verre derrière du verre |
| 008 | Éclatement Voronoï + Rapier | Voronoï CPU densifié à l'impact, prismes, fissures émissives, Rapier convexHull, ralenti | `attribute()` custom | ✅ | 4.0 | coque plate |
| 009 | Bursts compute à traînées | compute TSL, curl noise, ring buffer, rubans `Mesh.count`, 6 personnalités | compute + `instancedArray`, `Mesh.count` | ✅ | 0.7–1.6 | décalage K écritures |
| 010 | Carte-fenêtre (diorama) | portail `pass()` en screenUV, diorama low-poly solidaire, heure du jour par tier, vitre clearcoat | `fog()+rangeFogFactor()`, pass-as-texture | ✅ | 1.1–1.9 | passe plein écran |
| 011 | Vortex | distorsion écran (rotation gaussienne + pincement), CA par canal, horizon, grille de points, spirale | `RenderPipeline` + `sample()` | ✅ | 4.1–5.1 | déforme aussi la carte |
| 012 | Hologramme raymarché | raymarching TSL Loop/Break, SDF tores+octaèdre smin, halo volumique, scanlines, irisation | `Loop`/`Break` dans `Fn` | ✅ | 2.4 | coût ∝ surface de fenêtre |
| 013 | Éventail & retournements | timelines par rareté, ressorts analytiques, caméra + DOF suivi, ralenti | `dof()` + `getViewZNode()` | ✅ | 0.5 | pas d'ombres entre cartes |
| 014 | Encre fluide (suminagashi) | fluide compute (advection, Jacobi, projection), encre multiplicative, film brillant, relief de densité | storage textures r/w r183 | ✅ | 3.2 | pas de MacCormack |
