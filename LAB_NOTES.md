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
  disposal de tous les buffer attributes, épaisseur min/max d'iridescence et BRDF diffuse EON sur `MeshPhysicalMaterial`.

**Exploitées dans le lab** : `RenderPipeline` + MRT (003, 005, 006, 009…), storage textures en ping-pong (014) et en
**lecture-écriture** (023), `compileAsync()` (toutes via `stage.compile()`), `GaussianSplat` (016), `fog()+rangeFogFactor()` (010),
`bumpMap(…, normalNode)` (001, 002), `lensDirt()` (006), `BatchedMesh` (019), compute TSL (009, 014, 015),
**ombres colorées** `castShadowNode` + `shadowMap.transmitted` (024), **Forward+ / `ClusteredLighting`** r185 (026, jusqu'à 480 PointLights).
**Non exploitées (et pourquoi)** : FSR1/TAAU (pistes pour 010 en mobile), `SunLight`+CSM (pas de grande scène extérieure), `LightProbeGrid` / brouillard volumétrique (hors sujet carte), `BitonicSort` (pas de tri de particules
nécessaire en additif).

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

## Conventions transverses
- **Timing** : rien de linéaire. Courbes maison (`EASE.glide/heave/breathe/settle/snap`), ressorts analytiques (`springCurve`)
  et numériques (`Spring`, sous-pas fixes), timelines GSAP en **temps réel** (`lagSmoothing(0)`) avec ralentis par `timeScale`.
- **Palette** : chaque expérience a son fond (dégradé radial sombre chaud + grain anti-banding) ; teintes de rareté
  pensées hors du violet/cyan générique (pierre, vert-de-gris, cobalt, grenat, ambre, nacre).
- **Rareté** : le sélecteur reconstruit l'expérience (ou la met à jour à chaud via `setRarity` : 006, 019).
- **Son** : `core/audio.ts` (bouton 🔈) — tout est synthétisé (clics filtrés, souffles, déchirures granuleuses, impacts,
  risers, cloches inharmoniques, nappes) et déclenché par les timelines : c'est le bonus « sound design » de la liste D,
  intégré à toutes les expériences plutôt qu'isolé.
- **Libération** : chaque expérience vit dans un `Bag` vidé au changement (géométries, matériaux, textures, passes, timelines, listeners).

## Mobile & performances
- Preset **📱 Mobile** (auto sur écran tactile) : DPR ≤ 1.5, particules réduites (−55 à −65 %), moins d'itérations (fluide),
  grilles plus grossières (015, 016), moins de pas de raymarching (012).
- `npm run dev:mobile` sert en **HTTPS** sur le réseau local : indispensable pour WebGPU et le gyroscope sur téléphone
  (bouton 🧭 pour autoriser l'accès sur iOS). Le gyroscope recentre lentement la carte (on peut la tenir naturellement).
- Expériences a priori les plus lourdes sur mobile : 005 (fBm par particule), 007 (transmission + 42k sprites → 14k),
  012 (raymarching plein écran), 014 (fluide), 018 (chaîne post complète). À mesurer chez toi.

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
| 015 | Carte en particules | 36k particules compute, dispersion par tier, ressorts GPU, vague, fondu vers la carte | `If().Else()` compute, uniform mat4 | ✅ | 4.4 | sprites face caméra |
| 016 | Sculpture en gaussian splats | sujet 2D gonflé (chamfer → dôme), gaussiennes orientées, pop-up scale.z, paillettes | `GaussianSplat` r186 | ✅ | 1.4–2.0 | sujets fins = relief faible |
| 018 | Mythique « L'Éclipse » | combine 001/003/005/006/009/011 : battements, fausse pause, feu spectral, lentille au ralenti, convergence, onde de choc, inversion, foil qui s'éveille | chaîne TSL complète | ✅ (logique tracée) | 1.1–1.4 | à juger sur vrai GPU |
| 019 | Collection 3D (→ A) | BatchedMesh 540 instances / 1 draw, DataArrayTexture, LUT par instance, raycast par instance, filtre par rareté | BatchedMesh WebGPU (fusion r187), `batchIndirectIndex` | ✅ | 2.4–2.8 | pas de mipmaps (scintillement) |
| 021 | Lenticulaire | sélection de vue par angle + effet loupe, diaphonie, nervures normal + clearcoatNormal | `clearcoatNormalNode` | ✅ | 4.7 | vues = palettes |
| 022 | Taille-douce (billet) | gravure au trait ∝ valeur, hachures, loupe UV, micro-texte, encre OVI/métallique, relief d'encre | — | ✅ | 3.3 | aliasing des traits fins |
| 023 | Grattage | storage texture read-write, tampon segment, bord déchiqueté, couverture CPU, écaillage final | storage textures r/w (r183) | ✅ | 2.2 | pas de copeaux |
| 024 | Vitrail (lumière projetée) | Voronoï TSL avec point de cellule → verres, plomb (réseau + contour du sujet), verre dichroïque, lumière transmise émissive | `castShadowNode` + `shadowMap.transmitted` | ✅ | 0.5–1.0 | la carte ne doit pas recevoir d'ombre ; pas de rayons volumétriques |
| 025 | Enveloppe origami | pli roulant intégré (CPU), boucle de pointe ∝ vitesse, mémoire du pli, feuille unique (attribut `sheet`), `frontFacing`, sceau pré-rompu, lueur à travers le papier | — (TSL + attributs custom) | ✅ | 0.6–0.8 | pas d'épaisseur ni de collision entre rabats ; pas d'ombres |
| 026 | Lucioles (synchronisation) | oscillateurs de Kuramoto, éclats brefs, 2 200 brins d'herbe instanciés, son au battement collectif, `?ff=` pour les captures | `ClusteredLighting` (Forward+, r185) | ✅ | 0.2–0.6 | timing du climax stochastique (5–9 s) ; chemin WebGL2 à mesurer |

## Format des cartes (depuis le 1er nov.)
- Jeu **100 % collection** : plus de coût, puissance, garde ni texte d'ambiance. Une carte affiche **son nom, son univers
  et sa rareté en étoiles** (1 ★ commune → 6 ★ mythique), plus les couleurs et effets du tier.
- Couleur des étoiles : pierre `#9a9387`, vert-de-gris `#7fae84`, cobalt `#5b8bd6`, grenat `#c43b58`, or `#e2a93b`, nacre `#f1ece2`.
- **Univers** (inventés, `src/core/universes.ts`) : Royaume de Cendre, Archipel des Marées, Cour de la Lune Pâle,
  Les Monts Muets, Forêt des Ronces, Le Grand Abîme — chacun a un emblème dessiné (flamme, vagues, croissant, sommets,
  ronce, puits). Les 12 cartes y sont réparties via `universe` dans `cardData.ts` (`epithet`/`element` gardés pour le catalogue serveur).
- Le gabarit par défaut de toutes les expériences est le design **Classique** ; les 10 designs sont dans `src/core/art/designs/`
  et se choisissent par `generateCardArt(card, rarity, { design: 'art-deco' })`.
- Retirées (hors sujet pour un jeu de collection) : **017** carton & usure (abîmer une carte de collection = anti-dopamine),
  **020** duel, **027** main de cartes (jouer sur un tapis). Récupérables dans l'historique git.

## Coexistence avec l'infrastructure (Convex / Discord / Cloudflare)
L'infra est montée en parallèle dans le même dossier (`convex/`, `src/core/net/`, `wrangler.jsonc`, `public/_headers`, `.env*`).
Le lab n'écrit plus que **ses propres fichiers** (`src/experiments/0xx/`, `LAB_NOTES.md`, et `registry.ts` après vérification) ;
jamais `package.json`, `main.ts`, `style.css`, `tsconfig.json`. `.env.local` et `.wrangler` sont dans `.gitignore`.
Pour brancher une ouverture sur le serveur : `net.preparePack()` avant l'animation (la rareté pilote 003/013/018/025),
`net.revealPack()` au payoff (voir `INFRASTRUCTURE.md`).

## Résumé (10 lignes)
**Mes 3 préférées**
1. **026 Lucioles** — la rareté devient un *rythme* : on sent l'essaim se mettre d'accord avant de voir quoi que ce soit.
2. **024 Vitrail** — la carte existe par la lumière qu'elle jette sur la table ; simple, physique, lisible à tous les tiers.
3. **025 Origami** — le plaisir tactile d'ouvrir une lettre ; l'intérieur imprimé annonce la rareté avant la carte.
Côté designs : **Art déco**, **Carte céleste** (la rareté *est* une constellation) et **Pleine illustration**.

**Les 3 à pousser techniquement**
1. **019 Collection 3D** — c'est le cœur d'un jeu de collection : classeur par univers, cartes manquantes en creux, zoom vers la vitrine des designs.
2. **018 Mythique** — la séquence la plus riche, calibrée sans vrai GPU : budget mobile, timings, passes post.
3. **014 Encre fluide** — la simulation compute la plus prometteuse (MacCormack, vorticité, résolution adaptative mobile).
