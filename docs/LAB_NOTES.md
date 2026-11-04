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
  rarity.ts            6 tiers + secrète (rank 6, palier visuel 5) + paramètres (intensité, foil, particules, suspense, shake, ralenti) + tirage pondéré
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
- **Rareté** (7 depuis l'ajout de la secrète, voir plus bas) : le sélecteur reconstruit l'expérience (ou la met à jour à chaud via `setRarity` : 006, 019).
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
- `--set=lab|pokemon151` choisit le set ; le script affiche le bilan des illustrations (chargées / détourées / basse déf / échecs).

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
| 039 | Carte secrète « Un de nous » | fausse ouverture (blocage sur la tranche), fissures Voronoï 2 échelles par battement, monde désaturé sauf l'émissif, glitch par tranches, halo + confettis analytiques, chœur/cœur/arrêt de bande | `SpriteNodeMaterial.rotationNode` + `scaleNode` vec2 | ✅ | 0.5–0.7 | à juger sur vrai GPU ; photos provisoires |
| 038 | Planche de contrôle du set | recette des illustrations : calques aplatis au gabarit choisi, badges de diagnostic, palette | — (Canvas 2D) | ✅ | — | outil, pas une expérience visuelle |
| 040 | 14 Merveilles — diorama-fenêtre sans bord | portail 010, gimbal d'horizon (élévation compressée tanh), sol disque à rayons remappés + crête cylindrique à brume propre, ClippingGroup à la vitre | `ClippingGroup`, `PassNode.setScissor()` | ✅ | 0.2–0.4 | monuments = primitives low-poly |

## Fuite de lumière 003 dans le jeu + centrage de la vitrine (2 nov., nuit)
- **Rareté connue dès que le booster est posé** (pas à l'ouverture) : `opening.ts`, à l'entrée de la phase `sealed`
  (tous les styles : brûlure, déchirure, éventail). Rythme de 003 : n = tier + 1 pulsations de plus en plus rapprochées
  (attaque 90 ms, décroissance exp), fausse pause de 0,9 s avant la dernière dès Épique, puis le sachet **respire**
  (plus vite pour les hauts tiers). Couleur = meilleure carte (une Secrète se fait toujours passer pour une Commune) ;
  Mythique : teinte qui dérive dans le spectre. Intensité 0,35 (Commune, lueur grise un peu décevante) → 1,95 (Mythique).
- Émissif du sachet (`leakPrint`) : soudures / lignes de scellage (`exp(-38·distance au bord)`) + lumière **à travers
  l'impression claire** (luminance² × chute depuis le centre × scintillement) + masques de soudure ; halo derrière le
  booster de la même couleur ; battement de cœur (son + vibration) à chaque pulsation dès Rare ; léger tremblement
  dès Légendaire. En brûlant, la fuite ne fait que monter. `debug().leak` pour les tests.
- **Centrage** : booster et bouton « Ouvrir » au centre de l'espace libre entre le panneau des boosters et la colonne
  « Gros tirages » (avant : seul le panneau de gauche était compté → décalé vers la droite sur grand écran).

## « Gros tirages » sur la page d'accueil (2 nov., nuit)
- Fil en direct des **Légendaires, Mythiques et Secrètes** (5★ et +) tirées par tout le groupe, sur la vitrine de la
  boutique (`src/game/views/bigPulls.ts`) : carte (miniature, badge de rareté, nom), joueur (avatar → son profil),
  « il y a 3 min » (rafraîchi toutes les 30 s). Toucher une carte l'ouvre dans la visionneuse 3D.
- Grand écran (≥ 1180 px) : colonne à droite du booster (2 cartes de front, défile). Plus étroit / téléphone : bouton
  « Gros tirages » (dernière carte + point rouge « en direct », s'allume quand une carte arrive) → bandeau horizontal.
- Mythique : liseré irisé qui tourne (`@property --bp-a`) ; une carte qui arrive pendant qu'on regarde entre en glissant
  avec un éclat de sa couleur ; une Secrète que tu n'as pas reste « ✷ Carte secrète » (on sait qu'elle est tombée).
- **Serveur** : nouvelle requête `feed.bigPulls` (`convex/feed.ts`, filtre les 400 dernières entrées du fil).
  ⚠️ `npx convex deploy` pour l'activer ; tant qu'elle n'est pas déployée, le client retombe sur le fil existant (20
  dernières entrées) sans erreur. Mode démo : tes belles cartes + des tirages simulés des amis robots (1 toutes les
  ~3 min).
- Au passage (téléphone) : ×1 / ×5 / ×10 sur la même ligne que « Ouvrir » (ils recouvraient le carrousel des boosters).

## Merveilles : décors refaits, Mausolée, drapeaux (2 nov., nuit)
- **Mausolée d'Halicarnasse** : reconstitution Wikimedia Commons (STL 557 Mo, 11 M triangles, CC BY-SA) → soudure des
  sommets par grille + décimation quadrique (`fast-simplification`) → 200 k triangles → chaîne habituelle. Les 14 ont
  désormais un vrai modèle. Nouveaux aussi : vrai **temple de Zeus** d'Olympie, **Sphinx** + Khéphren et Mykérinos
  (le relevé de Khéops réutilisé, plus petit, socle enfoui) à Gizeh, **Pain de Sucre** au fond de la baie de Rio.
- **`src/core/wonderEnv.ts`** (nouveau) : tout le décor, recette par carte (`WONDER_ENVS`).
  - Relief **identique côté CPU et GPU** : bruit de valeur « hash sans sinus » écrit en TSL et en JS → on pose arbres,
    bateaux, chameaux exactement sur le sol que le GPU dessine (plus de `mx_fractal_noise`, inaccessible au CPU).
  - Sol : couleur selon altitude **et pente** (différences finies dans le vertex shader → varying) : herbe / sable,
    roche sur les versants, neige en haut ; rides de sable sur les dunes ; plages au bord de l'eau.
  - Eau : couleur selon la **profondeur réelle** (lagon clair → bleu profond), écume au rivage, scintillement.
  - Bassin miroir + allées de cyprès pour le Taj Mahal.
  - Accessoires CC0 / CC-BY (Quaternius, Poly by Google : palmier, cyprès, pin parasol, olivier, jungle, pin, rochers,
    buissons, voiliers, chameaux) en **InstancedMesh** (1 draw par matériau et par espèce), dispersés par PRNG à graine
    (même décor à chaque fois) avec anneau, secteur, pente max, eau / terre, couloir de vue dégagé devant le monument,
    tailles à l'échelle de chaque monument. ≈ 560 Ko pour tous les accessoires.
- **Drapeaux** (`src/core/art/flags.ts`) : 11 drapeaux dessinés au Canvas (emblèmes simplifiés), dans le bandeau du bas
  du gabarit classique à la place de l'emblème « Monde » : drapeau + nom du pays + « Monde réel » en petit, drapeau en
  relief (masque G). Les cartes Merveilles utilisent le gabarit **classique** aussi dans le jeu (`gameCardArt`) : sa
  fenêtre est celle du portail 3D.
- Placements revus (taille, rotation 3/4, profondeur) pour les 14 ; voir `WONDER_MODELS`.
- **Drapeau en fond de carte** (demande de Tom) : sur les Merveilles, tout le cadre hors fenêtre est le drapeau du pays
  (`flagBackground` dans `classic.ts` : drapeau pleine carte + trame de toile + vignettage + bandeaux assombris en haut et
  en bas pour la lisibilité ; texte et filets passent en crème avec ombre portée). Le fond ne montre que les bords du
  drapeau (l'emblème central est sous la fenêtre) → l'écusson complet reste en petit dans le bandeau, à côté du pays.

## Ouvertures ×5 / ×10 et « passer » (2 nov., soir)
- **Boutique** : sélecteur ×1 / ×5 / ×10 au-dessus de « Ouvrir » (mémorisé ; ×5 / ×10 grisés si la réserve ne suffit
  pas ; un booster déjà tiré s'ouvre seul). Le bouton devient « OUVRIR ×5 ».
- **Série** : les boosters s'enchaînent dans la même scène, compteur « BOOSTER 3/5 · 2 / 5 ». Le 1er se brûle au doigt,
  les suivants se brûlent tout seuls. Chaque booster est tiré puis **crédité seulement une fois montré** (le serveur
  n'autorise qu'un booster scellé à la fois et on n'annonce rien sur Discord avant que le joueur ait vu sa carte).
- **« ⏭ 4★ et + »** (bascule, ×1 aussi) : `opening.setAuto({ burn, minRank: 3 })` → les cartes Commune / Peu commune /
  Rare (1 à 3★) se retournent et filent dans la rangée seules, en accéléré (timelines ×3,5 / ×2,2) ; la scène s'arrête
  sur chaque Épique (4★), Légendaire, Mythique, Secrète et attend un toucher. La séquence secrète « Un de nous » coupe le
  défilement pour la suite.
- **« Tout passer »** : crédite le booster en cours, tire + crédite le reste de la série d'affilée, puis récap.
- **Récap de série** : « 5 boosters · 25 cartes · 2 cartes 4★ et + », meilleures cartes d'abord, grille défilante ;
  « Encore ×5 » relance la même quantité (ou ce que permet la réserve).
- Vérifié (`/jeu/?demo`, Playwright) : ×5 avec 4★+ puis « Tout passer » au 3e → réserve −5, 25 cartes créditées, 0 erreur.

## Modèles 3D réels des Merveilles (2 nov., soir)
Les monuments procéduraux (primitives) sont remplacés par de **vrais modèles** CC-BY (Sketchfab + Poly Pizza), posés
dans le diorama sans bord. Crédits : `public/models/merveilles/CREDITS.md`. Mausolée d'Halicarnasse : rien de libre et
fidèle → reste procédural (repli automatique pour toute merveille sans modèle ou si le chargement échoue).
- **Chaîne hors ligne** `scripts/process-wonder-model.mjs` (gltf-transform) : suppression d'animations / de nœuds ou
  matériaux indésirables (eau et barque de Babylone), aplatissement + fusion, recadrage des sommets aberrants par
  percentiles (photogrammétries), orientation, base à y = 0, échelle unitaire, simplification au budget (meshopt ; passe
  « sloppy » si la photogrammétrie est faite d'îlots de triangles), textures WebP, compression meshopt. Option `pose` :
  rotation des bras d'une statue en T autour des épaules (le Colosse lève sa torche).
  Total ≈ 19 Mo pour les 14 cartes, chargés **uniquement** quand une merveille est affichée.
- **Runtime** `src/core/wonderModels.ts` : une merveille = des **pièces** (Zeus = statue devant son temple ; Machu Picchu
  = citadelle sur sa crête + Huayna Picchu) avec largeur/hauteur, rotation, décalage, teinte, recoloration, socle,
  colline rocheuse, torche. Cache par carte, clones partagés (`userData.sharedModel` → jamais libérés par une instance).
  Préchargé par le viewer et l'exp 040 (`preloadWonderModel`) ; sinon le procédural s'affiche puis est remplacé.
- Choix assumés : Zeus d'Olympie était **assis** — aucun modèle libre ; on a une statue de Zeus debout (scan) devant un
  temple. Le Colosse est une reconstitution (personne ne sait à quoi il ressemblait). Corcovado en photogrammétrie
  écarté (trop lourd, la simplification le trouait) : la statue est posée sur une colline rocheuse.

## Ouverture : plus de cartes qui se traversent (2 nov.)
- **Pile** : les cartes étaient espacées de 0,002 (après la brûlure) à 0,004 (dans le booster) alors qu'une carte fait 0,007
  d'épaisseur → elles s'interpénétraient, et avec les petites rotations `rz` de la pile leurs coins traversaient la carte
  de devant. Constante `STACK_DZ = 0.011` dans `opening.ts` (pile, sortie du booster) ; rangée du bas espacée de 0,008.
- **Retournement** : en pivotant sur son axe, la moitié de la carte reculait de sa demi-largeur et traversait la pile.
  Dans `update`, la carte est avancée de `demi-largeur × |sin(flip)|` (+ 8 mm) : le bord qui recule s'arrête au plan de
  repos ; l'échelle compense la perspective (même taille apparente). Nul à plat (flip = 0 ou π) → aucun autre état touché.
- Vérifié dans le jeu (`/jeu/?demo`, Playwright) : ouverture complète, 0 erreur console.

## Cartes secrètes « Merveilles du Monde » — diorama sans bord (2 nov.)
Tout vit dans `src/core/wonderDiorama.ts` (API : `createWonderCardInstance(…, renderer?)` → `update`, `setDepth`, `dispose`).
Le LiDAR a été essayé puis **retiré** (demande de Tom : pas de HUD, et le rendu nuage de points n'apportait rien).

**Problèmes réglés** : on voyait le dessous de la scène en inclinant la carte, et le bord du monde (plan de sol fini, ciel
sous l'horizon) dès qu'on tournait un peu.

- **« Gimbal » d'horizon** (`update`, étape a) : on exprime la caméra dans le repère de la carte, on prend son élévation α
  vers le centre de la fenêtre (plan yz). Zone linéaire [−1°, +4°] = monde rigidement solidaire de la carte (parallaxe
  exacte, comme 010) ; au-delà, compression `tanh` vers [−4°, +9°], et on fait pivoter le monde autour du centre de la
  fenêtre de φ = f(α) − α (une `Rx(φ)` en plus dans la matrice du diorama — `Rx(−φ)` sur l'œil ajoute exactement φ à α).
  Garde-fou : l'œil reste ≥ 5 cm (échelle carte) au-dessus du sol. Carte vue par la tranche latérale : la correction se
  relâche en douceur (α n'a plus de sens). Résultat : à n'importe quelle orientation, on regarde le monde à hauteur
  d'homme, l'horizon toujours à portée, jamais par en dessous ni à la verticale.
- **Sol posé au bas de la fenêtre**, `WORLD_SCALE = 0.15`. Le relief n'existe que derrière la vitre ou au-delà de 24
  unités : autour de la caméra (qui orbite à ~16–20 unités) le sol est plat → impossible d'entrer dans une colline.
- **Pas de bord** : sol = `RingGeometry` à rayons remappés (t^2.2 : dense près de la vitre, grossier dans la brume),
  fermé à 46 unités par une **crête cylindrique** (256 segments, hauteur = fBm périodique sur l'angle, hauteur selon le
  type de terrain) avec sa **propre brume** (`fog: false`, pied = couleur du brouillard) → silhouette toujours lisible,
  raccord invisible. Le brouillard de scène (recalculé en unités monde à chaque frame) sature avant la crête ; le ciel
  vire à la couleur brume sous l'horizon (filet de sécurité). Nuages en anneau tout autour, lumières attachées au monde.
- **Monument seul coupé à la vitre** (`ClippingGroup`, plan recalculé chaque frame) : le sol, lui, continue « sous le cadre ».
- **Perf** : la passe portail est limitée par **scissor** au rectangle écran de la carte (4 coins projetés), au lieu de
  rendre tout l'écran ; résolution 0,8 en mobile. Le monde complet (sol + crête + eau) ≈ 25k triangles, aucune passe en plus.
- 040 : `?wonder=<num|id>` et `?tilt=x,y` (pose forcée) pour vérifier les angles extrêmes en capture.
- Corrigé au passage : la rampe de Chichén Itzá était inclinée dans le mauvais sens.

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

## Rareté SECRÈTE + thème « Les Bébous » (1er nov.)
Règle du groupe : au-dessus des 6 étoiles, une rareté **secrète** réservée au thème Bébous — 8 cartes, une par membre
(surnom + photo), ~0,1 % dans les packs de base. La carte la plus rare du site, c'est un de nous.

- `rarity.ts` : 7e rareté `secret` (« Secrète », or rose `#e8927c`, glyphe ✷). Nouveau champ **`rank`** (0..6 : ordre,
  étoiles, tirage) à côté de **`tier`** (palier *visuel* 0..5). La secrète a `tier: 5` : les ~40 endroits du lab qui
  indexent des tableaux à 6 entrées ou testent `tier >= 5` la traitent au minimum comme une mythique au lieu de casser.
  `isSecret()`, `starCount()`, `DROP_WEIGHTS.secret = 0` (jamais tirée carte par carte : voir « Règle de drop » plus bas). Barre d'outils : 7e pastille, touche `7`.
- Données : `src/core/sets/bebous.ts` (zéro import, partageable avec Convex) — `[num, slug, surnom]`, surnoms provisoires.
  `cardData.ts` : set `bebous`, univers `bebous` (emblème : étoile à 8 branches dans un anneau), champ `photo`.
  `cardForRarity('secret')` pioche toujours dans les Bébous.
- Photos : `public/art/bebous/bebou-1..8.png`. **Jamais détourées** automatiquement (`loadCardImage(url, { key: false })`).
  `art/portraitSubject.ts` : photo détourée → portrait en parallaxe devant un fond or rose ; photo opaque → pleine carte
  (cadrage cover, visage au tiers haut, étalonnage chaud). Les 8 fichiers actuels sont des silhouettes provisoires
  (1–4 opaques, 5–8 détourées) : déposer les vraies photos **sous le même nom** suffit.
- Gabarit `bebou` (`art/designs/bebou.ts`), choisi automatiquement pour les cartes du set Bébous : double filet or rose,
  **sceau des huit** à la place des étoiles, surnom en grand. Hors des 10 maquettes génériques (dispo dans 038).
- `holo.ts` : options `windowFoil` / `subjectFoil` — sur une photo d'ami le foil reste sur le cadre, pas sur le visage.
- Expérience **039** : la révélation secrète (voir son NOTES.md). 006 : le cycle auto suit l'ordre des raretés.

### Règle de drop des Bébous (décidée par le groupe le 1er nov.)
- **0,1 % PAR PACK**, pas par carte.
- **Uniquement dans le « bébou pack »** = le pack de base qui contient TOUTES les cartes de TOUS les thèmes disponibles.
  Les boosters de thème (« POKEMON », …) ne donnent jamais de Bébou.
- Le bébou pack grossit à chaque thème ajouté, mais la proba doit rester **exactement 0,1 % par pack**. D'où un tirage
  **séparé, une fois par pack**, fait avant et indépendamment du tirage des autres cartes : la taille du pool n'entre
  pas dans le calcul, il n'y a rien à réajuster quand un thème arrive.
- `src/core/packRules.ts` (zéro import, partageable avec Convex) : `PackKind = 'theme' | 'bebou'`, `PACK_SIZE = 5`,
  `BEBOU_PACK_SECRET_CHANCE = 0.001`, `planPack(kind, rand)` → `{ size, bebouSlot }`. Le Bébou prend la **dernière**
  place du pack (révélée en dernier, et c'est l'emplacement « peu commune + garantie » qu'il remplace).

### Côté serveur
Appliqué le 1er nov. : voir « LE JEU » ci-dessous (`preparePack` utilise `rollPack`, donc `planPack`).

## Retours d'Hugo appliqués (1er nov., soir)
- **Cartes du jeu en « Pleine illustration »** (029, son préféré ; « Classique » n'a pas plu) — `gameCardArt()` dans
  `src/game/scenes/cardFace.ts` ; les Bébous gardent leur gabarit. Dans ce gabarit : **sous-thème en grand**
  (« POKÉMON ») au-dessus du nom, **numéro « 025 / 1025 » lisible en haut à droite**, code + n°/total en bas.
  Univers Pokémon : plus « Kanto » (1025 cartes, toutes générations).
- **Dos des cartes** (`art/back.ts`) : médaillon rond avec un **« B »** (le Bébou game) au lieu de l'étoile et du « L »,
  libellé du bas = « B É B O U » (labo) ou le thème ; dans le jeu, **un dos par thème à ses couleurs** (`themedBacks()`,
  même graphe → même pipeline).
- **Moins de particules** : gerbe de l'ouverture divisée par ~3 (max 2 200, 1 100 sur mobile) ; confettis de 039
  2 600 / 1 000 au lieu de 7 000 / 2 600 (« moins de fleurs, abuse »).
- **Bug « buggé quand on bouge le booster »** (005) : la carte à l'intérieur ne suivait pas l'inclinaison du booster et
  glissait derrière les trous de la brûlure. Corrigé dans 005 et dans le jeu (la pile suit la pose du booster tant
  qu'il est fermé, puis s'en détache). **Et un bug plus grave trouvé en testant** : glisser le doigt pendant la brûlure
  faisait tourner toute la pile par demi-tours (rotation libre de l'entrée) → on voyait de dos la FACE de cartes encore
  cachées. L'ouverture n'utilise plus que l'inclinaison ; 039 bloque la rotation jusqu'à la révélation ; la visionneuse
  de collection garde la rotation au glisser.

## League of Legends + Skins CS (2 nov., après-midi — specs du groupe)
- **League of Legends** (`sets/lol.ts`, sous-thème `lol` du Gaming Pack, ex-« Champions LoL ») : **2 120 cartes** =
  173 champions (skin de base) + 1 947 skins, sans chromas. Étoiles = colonne VALIDÉE de `Tri-etoiles-lol-skins.xlsx`
  (656/503/437/240/197/87). Ids `lol-<IdDataDragon>_<n>` (ex. `lol-Jinx_2`). Ordre : champions A→Z, chacun suivi de ses skins.
  Images : splash **centré** de Community Dragon (1280×720) recadré en portrait (474:662) → `public/art/lol/*.jpg`
  (~55 Ko). Nouveau drapeau `CardData.cover` → `paintCoverSubject` (art/imageSubject.ts) : la scène remplit toute la
  carte du gabarit Pleine illustration, jamais détourée. « Lucian Prime bleu » (vieux recolor sans image chez Riot) :
  image de Lucian tueur à gages recolorée en bleu.
- **Skins CS** (`sets/cs.ts`, sous-thème `cs`) : **1 107 cartes** = 485 armes (≥ 10 €) + 428 couteaux + 94 gants +
  100 stickers, étoiles de `Tri-etoiles-csgo.xlsx` (296/223/314/125/103/46). Ids `cs-<id ByMykel>`. Nom affiché sans
  le « ★ » ni le préfixe « Sticker | ». Images Steam détourées, armes/couteaux larges pivotés de 32° (comme Valorant),
  en **WebP** (`public/art/cs/*.webp`, ~18 Ko au lieu de ~95 Ko en PNG). `thumbPath` accepte maintenant .jpg/.webp.
- Récolte : `python scripts/make-gaming-skins.py lol|cs <excel>` puis `node scripts/make-thumbs.mjs lol cs`.
- Univers `lol` / `cs` (emblèmes neutres : hexagone + losange, lames croisées), au lieu de « Monde ».
- **Cadrage de TOUTES les cartes (retour de Tom)** : le gabarit Pleine illustration agrandit la fenêtre historique `WIN`
  (672 px de large) ×1,62, la carte visible n'en montre que 474 px → les sujets larges étaient coupés sur les côtés
  (≈ 1/3 des Pokémon, la plupart des armes Valorant, ~90 % des photos World). `imagePlacement` plafonne maintenant la
  largeur du sujet à 90 % de la zone visible. Les photos sans transparence (World…) passent par `paintCoverSubject` :
  format portrait → plein cadre ; format paysage → pleine largeur, rien de coupé, fondue dans sa copie floutée.
  LoL : le splash « centré » de Riot reste le meilleur cadrage (essai d'alignement sur l'écran de chargement : moins fiable).
- Le jeu passe à ~8 000 cartes → la chance Bébou du Bebou Pack suit seule (1 / nombre total de cartes).

## Profil, missions, échanges libres (2 nov., midi — demandes de Tom)
**Échanges** : on peut échanger n'importe quelle carte, plus seulement les doublons (même son dernier exemplaire ; le
serveur l'autorisait déjà). Bouton « Suggestions / Toutes les cartes » + recherche.
**Collection** : l'onglet « Nouvelles » se vide dès qu'on clique dessus (marquées vues ; il disparaît au filtre suivant) ;
**gel au chargement corrigé** : la grille ne construit plus les 2 020 tuiles d'un coup, seulement ce qui est à l'écran,
le reste en défilant ; les vraies cartes se peignent plus calmement en tâche de fond.
**Profil** (clic sur l'avatar, `#/profil`, `#/profil/<id>` pour un ami) : vitrine de 6 cartes (choisies, sinon les
meilleures automatiquement), devise, stats (complétion, boosters, doublons, secrètes, meilleure carte), raretés, liens
vers les profils des autres, « Proposer un échange ». Une carte de la vitrine s'ouvre en 3D. Remplace le menu de
l'avatar (déconnexion / remise à zéro de la démo sont sur le profil). Serveur : `convex/profiles.ts`, champs `showcase`
et `bio` sur `users`.
**Missions du jour** (cible dans l'en-tête, pastille = à réclamer) : 3 missions tirées au hasard chaque jour à minuit
(heure de Paris) parmi 10 sortes (ouvrir N boosters, un booster précis, cartes ★★★+ / ★★★★+ / ★★★★★+, nouvelles cartes,
cartes Pokémon/Valorant, doublons, signer un contrat, proposer/accepter un échange) ; +1 à +3 boosters chacune, +2 de
bonus quand les 3 sont réclamées, 1 changement de mission par jour. Logique partagée `src/core/missions.ts`, serveur
`convex/missions.ts` (champ `missions` sur `users`), mode démo aussi. Tests : 26 verts.

## Troisième passe de finitions (2 nov., fin de matinée)
**Visionneuse** : zoom à la molette (ordinateur) ou en touchant deux fois (téléphone) — la fiche texte s'efface et la
carte se recentre ; **bug corrigé** : dans la collection et les contrats, glisser pour tourner la carte et la molette
n'atteignaient pas la carte 3D (la page restait par-dessus, classe `card-open` sur `body` désormais).
**Boutique / ouverture** : poussières dorées qui flottent autour du booster ; étiquettes des boosters qui se coupent
proprement (plus de « · » seul en bout de ligne) ; « Touche pour la suivante » lisible au-dessus de la rangée de cartes ;
pastille « NOUVELLE » resserrée dans le récap au téléphone.
**En-tête** : icônes dessinées au lieu des émojis (haut-parleur dont les ondes laissent place à une croix, petit booster
doré pour la réserve, qui saute quand un booster arrive) ; reflet qui passe sur la réserve pleine ; tic discret au
changement de page.
**Grilles** : la carte survolée à la souris s'incline vers le curseur ; tuiles « squelettes » pendant le chargement des
échanges ; texte discret un peu plus contrasté (`--ink-3`).
**Contrats** : on dit tout de suite s'il manque des doublons (« tu en as 2, encore 8 à trouver ») ; au téléphone, la
rangée des étoiles défile avec un fondu au bord et garde l'étoile choisie visible.
**Chargement** : l'écran de chargement est dans la page HTML → visible dès la première image, avant le téléchargement
du jeu (main.ts le reprend).

## Deuxième passe de finitions (2 nov., matin)
**Boutique / ouverture** : sur ordinateur, le booster (et « Ouvrir ») se centrent dans l'espace à droite du panneau
(fenêtre de vue décalée, retour au centre pendant l'ouverture) ; glisser le doigt sur le booster 3D = booster voisin ;
au téléphone, faire défiler le carrousel choisit le booster qui s'arrête au centre ; le booster tourne dans le sens du
choix ; miniatures des vrais boosters dans la liste ; boosters « bientôt » désaturés ; **bug corrigé** : après un clic
sur « Ouvrir », maintenir Espace ne brûlait pas l'emballage (le bouton gardait le focus) ; compteur « 2 / 5 » qui
rebondit ; en-tête de nouveau net au récap ; éventail plus grand sur téléphone ; Entrée = « Encore un » au récap ;
« que des doublons » mène aux contrats ; « Ma collection » ouvre directement les nouvelles cartes du tirage.
**Collection** : grille affichée par paquets (2 020 cartes sans figer la page au changement de filtre) ; barre de
filtres qui reste en haut en défilant (ordinateur) ; bouton ↑ ; « / » pour chercher, Échap pour effacer ; filtre
« Nouvelles (n) » ; toucher une carte manquante dit dans quel booster la chercher ; fondu enchaîné aperçu → vraie carte
(plus de tuile vide) ; fondu court au changement d'onglet ; coche dorée sur une étoile complète ; halo de la couleur de
la rareté derrière la carte dans la visionneuse (il respire pour légendaire et mieux) ; ← → rappelé à la souris.
**Partout** : le bouton/geste « retour » du téléphone ferme la carte en grand au lieu de quitter la page ; indicateur
d'onglet qui glisse ; pastille dorée « nouvelles cartes » sur Collection ; réserve de boosters cliquable (→ boutique) ;
message quand un booster arrive alors qu'on attendait ; menu sous l'avatar au lieu d'une boîte de dialogue (remise à
zéro de la démo en deux clics) ; astuces sur l'écran de chargement ; ponctuation française insécable dans les messages ;
virgule décimale (« 1 sur 2,4 ») ; focus clavier rendu à la carte en fermant la visionneuse.
**Contrats / échanges** : plus aucune reconstruction de grille quand on ajoute ou retire une carte (cases et tuiles mises
à jour sur place, plus de clignotement) ; vraies cartes dans les cases ; numéros discrets dans les cases vides ;
« Remplir » / « Vider » grisés quand ils ne servent à rien ; cartes choisies marquées (contour + « ×2 ») dans les
contrats et les échanges ; listes des échanges redessinées seulement si elles changent.

## Passe de finitions (2 nov., nuit) — que des petits détails
**Toucher / clavier / accessibilité** : plus de flash gris au toucher ni de menu « copier » quand on maintient le
booster ; plus de zoom iPhone en tapant dans la recherche ou le petit mot d'échange (champs à 16 px) ; anneau de focus
au clavier ; Entrée ouvre une carte de la grille ; ↑ ↓ changent de booster ; ← → passent d'une carte à l'autre dans la
visionneuse de la collection ; animations coupées si le téléphone demande « réduire les animations ».
**Boutique / ouverture** : toucher le booster 3D l'ouvre ; halo de la couleur du booster derrière lui ; filet de
progression de collection sous chaque booster ; textes « Touche… » au doigt, « Clique… (ou Espace) » à la souris ;
curseurs adaptés (main pour maintenir, pour révéler, sur l'éventail) ; la carte survolée de l'éventail se soulève avec un
petit tic ; le panneau d'info s'efface quand la carte part dans la rangée ; la pile qui attend respire ; vibrations
légères pendant la brûlure et aux retournements ; récap en cascade avec « 3 nouvelles » / « que des nouvelles ! ».
**Collection** : vraies cartes peintes en cache persistant (Cache Storage, `bebou-cartes-v1` — changer le numéro si le
gabarit change) → instantané aux visites suivantes ; plus de clignotement quand on filtre ; reflet au survol (irisé
pour épique+) et éclat périodique des légendaires ; pastille dorée sur les cartes obtenues depuis la dernière visite ;
recherche sans accents ; chiffres à la française (2 020, 5,9 %) ; barres et pourcentage qui se remplissent à l'arrivée.
**Contrats / échanges** : cases qui arrivent avec un rebond, note qui monte à mesure qu'on remplit, bouton « Signer » qui
respire quand c'est prêt ; vignettes des cartes dans les échanges ; message quand un ami propose un échange.
**Fluidité** : la collection et l'en-tête ne se redessinent plus à chaque présence d'ami (mode en ligne) ; définition 3D
abaissée automatiquement si l'appareil peine (< 40 i/s) ; bandeau « pas de réseau ».
**Divers** : icône de l'app (onglet + écran d'accueil), titre d'onglet avec le nombre de boosters prêts, dos des
boosters du jeu réécrits (« Fabriqué entre nous »), labo : plus de dossier « Empty », réglages sous la barre d'outils
sur téléphone, image précédente estompée pendant un chargement.

## Décisions du 2 nov. appliquées
- **Noms des packs** : Bebou Pack · Gaming Pack · Pop Culture Pack · Sport Pack · World Pack (ids internes inchangés).
- **Taux Bébou = 1 / nombre total de cartes, par Bebou Pack** (`GAME_CARD_COUNT`, `BEBOU_SECRET_CHANCE` dans
  `sets/themes.ts`) : 2 028 cartes aujourd'hui → 1 sur 2 028 ; suit tout seul chaque ajout. Affiché en boutique, sur
  le pack, dans 039 et dans les messages du fil / Discord.
- **Valorant** (995 cartes, `sets/valorant.ts`, généré par `scripts/make-valorant.py` depuis l'Excel validé) : images
  en local (`public/art/valorant/<uuid>.png`), agents en pied, armes larges pivotées de 32° et réduites (`CardData.fit`),
  emblème « viseur » neutre. Ordre : agents A→Z puis skins par collection.
- **Ardèche** : sous-thème « bientôt » du World Pack.
- **Collection = vraies cartes** (`game/cardImages.ts`) : le gabarit Pleine illustration peint en 2D depuis la
  miniature WebP, à l'entrée à l'écran, une carte à la fois (≈ 10 ms), cache de session. Aussi dans le récap et les échanges.
- **Contrats façon CS:GO** (`core/contracts.ts`, `convex/contracts.ts`, onglet Contrats) : 10 / 10 / 20 / 20 / 50
  doublons de 1★…5★ → 1 carte de l'étoile au-dessus, jamais le dernier exemplaire, sous-thème au prorata, nouvelle carte
  garantie si possible ; les cartes s'embrasent puis la nouvelle se révèle dans la visionneuse.
- **Recharge des boosters** (`core/packRegen.ts`) : 1 toutes les 5 min, 15 max, calcul paresseux côté serveur ;
  indicateur x/15 + compte à rebours + barre dans l'en-tête (deux lignes sur téléphone). Le « +2 / 12 h » est coupé.

## Dossier « recherches web3d » → 5 points appliqués (1er nov., nuit)
- **Gyroscope dans le jeu** : on penche le téléphone, la carte suit. Android : actif dès le premier toucher.
  iPhone : l'autorisation est demandée au clic « Ouvrir » / sur une carte de la collection (`shell.requestGyro()`,
  première ligne du gestionnaire — Safari refuse sinon).
- **Vibrations** (`core/haptics.ts`) : `navigator.vibrate` sur Android ; sur iPhone (pas d'API), astuce de l'interrupteur
  natif `<input switch>` qui fait un « tic » Taptic Engine (iOS 18+). Motif plus long pour légendaire / mythique, et
  battements de cœur dans 039. **À tester sur un vrai iPhone.**
- **Payoff légendaire / mythique** (ouverture du jeu) : flare anamorphique teinté à la couleur de rareté, onde de choc
  qui déforme l'écran ; mythique en plus : **flash négatif de 30 ms**. Volontairement court pour ne pas saturer.
- **Visionneuse** : bloom sur l'émissif (étoiles, paillettes, foil), plus fort au flash final. Toucher une carte de
  l'éventail ou une vignette du récap d'ouverture l'ouvre en grand.
- **Holo des épiques** : motif radial (anneaux depuis le haut de l'illustration) entre le linéaire des rares et le
  « craquelé » des légendaires → chaque palier se reconnaît à l'œil.

## 4 THÈMES × SOUS-THÈMES (1er nov., soir — décision du groupe)
- On passe d'une quinzaine de thèmes à **4 thèmes = 4 boosters** : **GAMING** (Pokémon, Yu-Gi-Oh, Champions LoL,
  Valorant skins + agents, skins CS, jeux vidéo) · **POP CULTURE** (films, séries, mangas/anime, Marvel MCU, musique,
  youtubeurs) · **SPORT & ESPORT** (sport, esport) · **LE MONDE** (lieux & pays, nourriture, voitures, animaux).
- Chaque carte a **2 tags** : `themeId` (1 des 4) + `subthemeId` (pokemon, lol, mcu…). Les étoiles 1★→6★ restent
  **réparties par sous-thème** (côté données). Le tirage : étoile d'abord, puis une carte du thème à cette étoile.
- **5e pack : le BÉBOU PACK** = pack de base, toutes les cartes des 4 thèmes, seul pack à Bébous (0,1 % par pack, tirage
  à part : reste exactement 0,1 % quoi qu'on ajoute, rien à recalculer). Affiché en tête de la boutique.
- `src/core/sets/themes.ts` : `THEMES` (4), `SUBTHEMES` (tous les sous-thèmes, ceux sans cartes = « bientôt »),
  `BEBOU_THEME`, `subthemeById`, `themeOpen`, `themeTagline`. **Ajouter un sous-thème** = son fichier de données + ses
  images + `npm run thumbs` + remplir `cards`/`artDir`/`code` de son entrée dans `SUBTHEMES`.
- Aujourd'hui seul **Pokémon (GAMING)** a des cartes : POP CULTURE, SPORT & ESPORT et LE MONDE sont visibles, marqués
  « bientôt », non ouvrables (refusés aussi par le serveur, sans débiter de booster).
- Compatibilité : les ids de cartes ne changent pas (collections et échanges intacts) ; l'ancien booster « pokemon »
  (packs déjà tirés) est ramené à « gaming » côté client et serveur ; `cards[].subthemeId` ajouté (optionnel) au schéma.
- Collection : onglets = les 4 thèmes (+ Bébous si on en a un), pastilles de sous-thème, progression et étoiles
  calculées sur la sélection.
- Tests : `npm run test:server` 15/15 (booster GAMING, ancien id « pokemon », thèmes vides refusés…), `npm run test:rolls`
  conforme (Bébou 0,100 % / bébou pack, 0 dans GAMING).

## Retours des testeurs EN LIGNE (1er nov.)
- Panneau de retours du labo : bouton **☁ Envoyer** → tous les 👍/👎/notes de ce navigateur partent dans Convex (table
  `labFeedback`, une ligne par navigateur : renvoyer met à jour, pas de doublon). Après le premier envoi, **chaque
  modification repart seule** (3 s après la dernière frappe). Prénom demandé une fois (proposé : le nom Discord si connecté).
  Export JSON toujours là.
- Lecture : `GET <VITE_CONVEX_SITE_URL>/lab/feedback?key=…` → retours bruts par testeur + regroupement par expérience.
  La clé est dans **`.feedback-key`** (local, ignoré par git, jamais publié) ; `deployer.cmd` la pose dans l'environnement
  Convex (`FEEDBACK_READ_KEY`). Sans clé côté serveur, l'export est fermé (503).
- **`npm run feedback`** (`scripts/pull-feedback.mjs`, sans dépendance) → `feedback/latest.md` (lisible : par expérience,
  votes et notes), `feedback/latest.json`, archive `feedback/retours-AAAA-MM-JJ.json` (dossier ignoré par git).
- Tests : 2 de plus dans `convex/game.test.ts` (envoi + mise à jour sans doublon + agrégat, clé refusée / absente).

## LE JEU — page `/jeu/` (1er nov.)
La vraie page pour le groupe, à côté du labo : **boutique → ouverture 3D → collection → échanges**.
`npm run dev` puis http://localhost:5173/jeu/ (bouton « ▶ Le jeu » dans la barre du labo). En build : `dist/jeu/`.

### Serveur ou démo
- `VITE_CONVEX_URL` configuré → **serveur Convex + Discord** (vrais comptes, vraie collection, vrais échanges).
- Sinon, ou avec `?demo` → **mode démo hors-ligne** : même interface, tout dans le navigateur (localStorage), trois amis
  **robots** (étiquetés « (robot) ») qui ont chacun ~30 boosters et acceptent les échanges à peu près équilibrés, et
  proposent parfois un échange. `?demo&secret` : le prochain bébou pack contient forcément un Bébou (pour tester).
- Code : `src/game/backend.ts` (interface commune), `onlineBackend.ts` (Convex), `localBackend.ts` (démo).

### Thèmes, boosters, taux de drop (source unique client + serveur, zéro three.js)
- `src/core/sets/themes.ts` : **registre des thèmes**. Un booster par thème (« POKEMON ») + le **bébou pack** (tous les
  thèmes, seul pack à Bébous). **Ajouter un thème** (ex. LoL) = un fichier `src/core/sets/<thème>.ts` au format de
  pokemon151.ts + ses images dans `public/art/<thème>/` + `npm run thumbs` + une entrée dans `THEMES`. Boutique,
  collection, échanges, serveur et bébou pack suivent seuls.
- `src/core/dropRates.ts` : **taux de drop par étoile** (≠ composition des thèmes, qui reste côté données). Booster de 5 :
  4 emplacements normaux + 1 garanti rare ou mieux, révélé en dernier.

  | | emplacements 1–4 | emplacement 5 | résultat par booster (calculé + vérifié sur 400 000 packs) |
  |---|---|---|---|
  | 1★ commune | 58,25 % | — | |
  | 2★ peu commune | 27 % | — | |
  | 3★ rare | 10 % | 71,5 % | une rare (ou mieux) dans **chaque** booster |
  | 4★ épique | 3,5 % | 21 % | épique ou mieux : **1 booster sur 2,4** |
  | 5★ légendaire | 1 % | 6 % | légendaire ou mieux : **1 sur 8** |
  | 6★ mythique | 0,25 % | 1,5 % | mythique : **1 sur 40** |
  | ✷ secrète | — | — | **0,1 % par bébou pack**, tirage à part (packRules.ts), jamais dans un booster de thème |
- `src/core/packRoll.ts` : **la** fonction de tirage, utilisée par le serveur ET la démo. `npm run test:rolls`.

### Serveur Convex (modifié — `npx convex dev` pour pousser)
- `preparePack({ packKind: 'theme' | 'bebou', themeId })` : tire avec `rollPack` (RNG crypto). Sans `packKind` = bébou
  pack (compatibilité des anciens appels). Anti-reroll inchangé (un pack scellé non ouvert est rendu tel quel).
- Schéma **compatible avec les données existantes** : champs nouveaux tous optionnels (`packOpens.packKind/themeId`,
  `cards[].themeId`, `trades.note`), feed `secret_pull`.
- Fil en direct : épique et mieux, ou n°1 d'une rare et mieux (avant : TOUS les n°1 → au début chaque carte en a un,
  le fil et Discord auraient été inondés). Discord : légendaire et mieux, et un message spécial pour la carte secrète.
- Échanges : validation à la proposition (cartes connues, quantités, ce que l'autre possède vraiment, 12 cartes max par
  côté, petit mot), **`trades.cancel`**, noms affichés dans `myTrades`. L'acceptation revérifie tout (transaction).
- `convex/http.ts` : le retour Discord marche aussi vers une page (`/jeu/`), plus seulement la racine.
- **Tests serveur** : `npm run test:server` (convex-test + vitest, base simulée en mémoire, 11 tests : boosters de thème,
  bébou pack gagnant/perdant forcé, anti-reroll, compatibilité, échanges acceptés/refusés/annulés/invalides).

### Ouverture 3D (`src/game/scenes/opening.ts`) — la dopamine
- La **boutique est la même scène** : le booster affiché tourne sur lui-même quand on en choisit un autre, et c'est lui
  qu'on ouvre (aucun chargement entre les deux).
- **Maintenir le doigt** brûle l'emballage depuis le centre (relâcher : la brûlure recule doucement) ; par les trous on
  voit déjà le dos des cartes. Braise + **fuite de lumière** par la ligne de déchirure à la couleur de la meilleure carte
  (dès épique)… sauf une carte secrète, qui se fait passer pour une commune.
- 5 cartes révélées **de la moins rare à la plus rare**. Rare+ : liseré, halo, tremblement, montée (durée ∝ rareté),
  retournement, éclair, **étoiles qui s'allument une à une**, gerbe de confettis/étincelles (nombre ∝ rareté), foil qui
  s'éveille, vibration. Légendaire+ : ralenti, aberration chromatique, chœur. Fiche : nom, étoiles, rareté, NOUVELLE ou
  doublon, n° imprimé.
- **Avant la dernière carte**, les cartes déjà vues s'écartent et la lumière baisse : toute l'attention sur elle (pour
  tous les packs, sinon ce serait un indice).
- **Carte secrète** = toujours la 5e : la scène passe la main à **039 « Un de nous »** en mode `fromStack` (sans le
  paquet : la carte attend face cachée au centre, cadrage identique), avec le cœur au doigt. « Continuer » → éventail.
- Fin : les 5 cartes en éventail (placé d'après la taille réelle de l'écran) + récapitulatif + « Encore un ».

### Préchargement — images et shaders
- **Shaders** : au démarrage, la scène d'ouverture compile une carte factice par rareté (+ variante photo des Bébous)
  avec **exactement le même graphe** que les vraies (`scenes/cardFace.ts`, partagé avec la visionneuse) ; les matériaux
  factices restent en vie → pipelines en cache. Dès que le pack est tiré, ses 5 cartes sont générées (une par frame) et
  compilées **pendant que le joueur brûle l'emballage**. La scène secrète (039) est montée et compilée en fond dès que le
  pack contient un Bébou. La visionneuse de collection est préparée 1,5 s après le démarrage.
- **Images** : miniatures WebP (`public/art/<thème>/thumbs/`, 256 px, ~12 Ko : 12 Mo pour les 1025 au lieu de 129 Mo de
  PNG) pour les grilles, chargées paresseusement + préchargées en tâche de fond (cartes possédées d'abord). Les PNG
  pleine définition ne servent qu'à la 3D, et seulement pour les cartes d'un pack (dès le tirage) ou la carte ouverte en
  grand. Les Bébous non possédés ne sont jamais chargés (thème secret). `npm run thumbs` après avoir ajouté/remplacé des
  images (ne refait que ce qui a changé).
- `src/core/siteRoot.ts` : racine du site valable depuis `/` et `/jeu/` (avec `base: './'`, « ./art/… » visait
  `/jeu/art/…`). `cardById` passe par une Map (1025+ cartes).

### Collection et échanges
- Collection : un onglet par thème (Bébous : seulement si on en possède un), progression globale et **par étoile**,
  filtres possédées / manquantes / doublons / étoiles / recherche, silhouettes pour les manquantes, clic → visionneuse 3D.
- Échanges : on choisit un ami → **croisement automatique** des deux collections : « ses doublons qui te manquent » et
  « tes doublons qui lui manquent » (case « voir toutes les cartes » pour élargir). On ne donne jamais son dernier
  exemplaire. Indicateur d'équilibre (en étoiles), petit mot, propositions reçues/envoyées (accepter, refuser, annuler).

### Vérifié (Chromium headless, WebGPU SwiftShader, desktop 1000×680 + téléphone 390×844 et 360×740)
Booster de thème complet (5 révélations → récap → collection → visionneuse → échange avec un robot), bébou pack avec
Bébou forcé (4 cartes → séquence secrète → cœur au doigt → révélation → éventail) : **aucune erreur console**.
Labo : 039, 002, 013, 019 sans régression.

## Set « Pokémon 151 » — premières vraies illustrations (1er nov.)
**Le système accepte maintenant des illustrations bitmap** à côté des sujets procéduraux, et le set Pokémon 151
(`public/art/pokemon-151/`, 151 PNG + `manifest.json`) est le **set par défaut** de toutes les expériences.

- **Données** : `src/core/sets/pokemon151.ts` — `[dex, slug, nom FR, rareté]` × 151, **zéro import** (partageable tel quel
  avec Convex). Rareté éditoriale, à retoucher librement : 51 communes · 45 peu communes · 33 rares · 14 épiques ·
  6 légendaires (Dracaufeu, Léviator, Artikodin, Électhor, Sulfura, Dracolosse) · 2 mythiques (Mewtwo, Mew).
- **Sets** (`cardData.ts`) : `CARD_SETS = { pokemon151, lab }`. `CARDS` est un tableau *vivant* (contenu remplacé par
  `setActiveSet`) → aucune expérience n'a eu à changer. Choix : `?set=lab|pokemon151`, ou le menu **set** du panneau
  dans les vitrines 028–037 et dans 038 (mémorisé en localStorage). Les scènes qui visent une carte précise du lab
  (`010` tour, `018` œil) la retrouvent via `cardById` (recherche dans tous les sets).
- **Sujet `image`** : `art/images.ts` charge, **détoure** les fonds blancs opaques (remplissage 4-connexe depuis le
  pourtour, seuil blanc 248, puis trous fermés ≥ 0,18 % de l'image — entre la queue et le corps de Raichu, Otaria…,
  bord adouci et « dé-blanchi »), recadre sur le contenu et **extrait une palette** (teinte dominante pondérée
  saturation × luminosité → ciel sombre teinté, halo clair, papier, encre ; les jaunes glissent vers l'ambre pour
  éviter le kaki). `art/imageSubject.ts` peint le fond (dégradé, rayons, halo, bokeh, vignettage, ombre au sol), pose
  l'illustration sur le calque **sujet** (donc parallaxe, liseré lumineux) et écrit les masques fx (B = relief flou de
  la silhouette, G = foil du sujet en mythique). Le foil holo de fond (≥ épique) suit donc la vraie silhouette, et 007
  grave la silhouette dans le cristal.
- `ensureFonts()` attend aussi les illustrations du **set actif** (≈ 1,1–1,4 s pour les 151 en local, en cache
  ensuite) ; `cardArtFor` attend en plus celle de sa carte. Image absente → silhouette « ? » + avertissement, jamais
  d'exception.
- Univers `pokemon` (« Pokémon · Kanto », emblème neutre : éclat à 4 branches — pas de logo), ligne de collection
  par set (`PKM · 025/151`, `setInfo(card)` dans les 10 gabarits).
- **019** : au-delà de 48 cartes, couches de 192×268 (144×201 en mobile) au lieu de 256×358 → 31 Mo au lieu de 56 Mo
  pour 152 couches.
- **038 Planche de contrôle** : tout le set rendu avec le vrai pipeline, badges `échec` / `160px` / `détourée`, clic =
  grand format + source sur damier + palette.

### Audit des images (résultat du test)
- **151/151 chargées**, aucune 404, aucune erreur console sur les 35 expériences (SwiftShader, rareté légendaire).
- **105 sources sont des scans 160×142** (PNG palette, fond blanc opaque) : détourées à la volée sans fuite visible
  (planche 038, filtre « détourées »), mais agrandies ×3 dans la fenêtre → **douces**. Deux autres (043 Mystherbe 250 px,
  151 Mew 233 px) passent aussi sous le seuil « basse déf ». Remplacer ces fichiers par des versions HD à fond
  transparent, **même nom**, suffit : rien d'autre à changer.
- 44 sources HD (300–350 px, alpha d'origine) : 001–009, 016–022, 025, 053, 054, 065–068, 092–094, 108, 109, 114, 123,
  125, 130, 131, 133–136, 144–150.

### Côté infra
(Historique — appliqué depuis : le serveur tire dans le registre des thèmes, cf. « LE JEU ».) Le serveur tirait alors ses boosters dans les 12 cartes du lab. Pour qu'il distribue le set Pokémon (testé : bundle
esbuild + tirage par rareté OK, 163 ids uniques), dans `convex/cardsCatalog.ts` :
```ts
import { POKEMON_151, pokemonCardId } from '../src/core/sets/pokemon151';
// renommer l'actuel CATALOG_CARDS en LAB_CATALOG (garde les ids déjà en inventaire valides), puis :
export const POKEMON_CATALOG: CatalogCard[] = POKEMON_151.map((e) => ({ id: pokemonCardId(e), num: e.dex, name: e.name, epithet: 'Pokémon', element: '', baseRarity: e.rarity }));
export const CATALOG_CARDS: CatalogCard[] = [...POKEMON_CATALOG, ...LAB_CATALOG];
export const PACK_POOL: CatalogCard[] = POKEMON_CATALOG; // et pickCardForRarity filtre PACK_POOL au lieu de CATALOG_CARDS
```
Côté client, `cardById(sealed.cards[i].cardId)` retrouve la carte et son illustration.

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

## Jeu — optimisation mobile (2 nov.)
Uniquement quand `quality === 'mobile'` (écran tactile) : l'ordinateur ne change pas.
- **Netteté** : DPR ×2 dès le départ (avant ×1,5 puis ×1 → très pixelisé sur écran ×3), plancher ×1,25. Un téléphone
  bridé à 30 i/s par le système (économie d'énergie) ne fait plus baisser la définition (cadence mesurée à vide).
- **Calques des cartes** calés sur la taille réelle à l'écran (`mobileArtScale`, ≈0,7–0,85 au lieu de 0,62 ; dos
  0,45 → idem ; visionneuse 0,7 → ≈0,8–0,95) ; vignettes des boosters 96 px au lieu de 64.
- **MSAA résolu sur la tuile** (`storeMultisampledColorBuffer = false` dans `createPipeline`) : les échantillons ne
  sont plus écrits en mémoire (×4 de bande passante sur les 2 cibles MRT).
- **Vitrine** : 2e sortie de post (même passe, mêmes pipelines) = image + vignette seulement. Le bloom, le choc, le
  flare et l'aberration ne tournent plus pendant la prévisualisation des boosters.
- **Ouverture** : flare anamorphique (2e bloom + flou 48 lectures, recalculé chaque image même éteint) → traînée
  analytique ; aberration chromatique lue directement dans l'image de la scène (plus de copie plein écran).
- **Booster** : bruit fractal de la brûlure (4 octaves Perlin 3D par pixel) cuit dans une texture R16F.
- **À-coups** : pipelines MRT/MSAA réels créés sous l'écran de chargement (une image rendue par les deux sorties) ;
  textures des cartes envoyées au GPU une carte par image pendant la brûlure ; gerbe de particules cachée éteinte.
- **CSS** : plus de `backdrop-filter` au-dessus du canvas sur tactile (re-flou à chaque image), fonds plus opaques.
- `trackTimestamp` coupé dans le jeu sur mobile.

## Jeux vidéo (2 nov.) — 3 396 cartes, 177 familles
- Source : `Tri-etoiles-jeux-video.xlsx` (feuille « Tri étoiles », colonne « Étoiles » = validée) + `SPEC-THEME-JEUX-VIDEO.md`.
- **1 famille = 1 sous-thème** (`jv-<famille>`, 177), id de carte `jv-<famille>-<carte>` (clé (famille, carte) : Jax MK ≠ Jax LoL).
  Champ `group` sur SubTheme : boutique, mention du booster, onglets de collection (+ liste des familles) et missions les
  montrent comme UN « Jeux vidéo ». Les contrats tirent par famille (affichage : 4 premières + « autres »).
- Drop activé tout de suite : Gaming Pack 8 643 cartes (~40 % de JV), Bébou 1 sur 9 575.
- Images : `python scripts/make-jeux-video.py harvest|recheck|fixart|gen Tri-etoiles-jeux-video.xlsx` (journal
  `scripts/data/jv-harvest.json`, reprise automatique). Steam (jaquettes), Wikipédia, wikis indépendants (Super Mario
  Wiki, Zelda Wiki, minecraft.wiki, wiki.gg…). Fandom refuse le téléchargement automatique : non utilisé.
  2 201 / 3 396 avec image (202 Mo, `public/art/jv`). Le reste : design typographique `src/core/art/jvTitle.ts`.
- ⚠️ Cloudflare Pages : ~16 800 fichiers dans public/ (limite 20 000 par déploiement).

## World Pack V2 (2 nov.) — 5 237 cartes, 34 sous-thèmes
- Source : `Tri-etoiles-monde_2.xlsx` (« Étoiles finales (VALIDÉ) »). `python scripts/make-monde-v2.py harvest|gen Tri-etoiles-monde_2.xlsx`
  → `src/core/sets/monde.ts` (les anciens lieux.ts, animaux.ts… ne sont plus utilisés).
- **Ids stables** : les 924 cartes V1 gardent id + illustration (`scripts/data/monde-ids.json`, figé). 7 renommages
  retrouvés (Bombay, Sainte-Sophie…), « Acropole & Parthénon » par alias ; « Citroën C15 des Cévennes » absente de la V2
  mais gardée (Ardèche → 36 cartes). Étoiles V2 appliquées aux cartes existantes (les exemplaires déjà tirés gardent la leur).
- Affichage : 14 Merveilles · Ardèche · 4 groupes (Lieux & pays, Animaux, Nourriture, Voitures = ids des anciens
  sous-thèmes, liens/missions d'avant OK) → liste des sous-thèmes. Merveilles toujours secrètes : 1 World Pack sur 5 237
  (`WORLD_SECRET_CHANCE` calculé). Bébou : 1 sur 13 888.
- Images : URL du fichier (Wikimedia, GBIF) puis Wikipédia ; homonymes écartés (Chihuahua → chien, Phoenix → groupe…).
  4 875 / 5 237 avec image (`public/art/monde`, envoyées dans R2 au prochain déploiement). Le reste : design typographique.

## Rattrapage des illustrations manquantes (scripts/scrap-manquantes.py)
- Ne retente que les cartes sans image (marque « s2 » dans les journaux de récolte), puis `gen` des deux scripts.
- Sources : abréviations développées (GTA, FNAF, MGS, NFS…) + Steam/Wikipédia avec titre EXACT ; Wikidata → page Wikipédia anglaise
  (personnages et jeux de la bonne franchise, d'après la description) ; fortnite-api.com ; Liquipedia (Rainbow Six, ≥ 2,1 s entre requêtes) ;
  World Pack : Wikidata P18/P154 avec description cohérente avec le sous-thème (homonymes écartés : Serengeti race de chat, Murray ville de l'Utah…).
- wiki.gg répond 401 aux robots : non utilisé. Summoners War (icônes 100 px) et Palworld (wiki.gg) restent en design typographique.
- Résultat : Jeux vidéo 2 201 → 2 486 cartes illustrées ; World Pack 4 875 → 5 023.

## Correctif sous-thèmes GAMING (3 nov.)
- Pokémon → 9 régions (d'après le n° de Pokédex), Valorant → 8 catégories, CS → 8 catégories : comptes identiques au correctif.
  Vrais sous-thèmes regroupés à l'affichage (`split()` dans themes.ts), le groupe reprend l'ancien id (pokemon, valorant, cs).
- Ids, étoiles, numéros, illustrations inchangés. Le sous-thème est imprimé en grand sur la carte (`uniName`) ; cache des
  rendus de cartes passé en v2. Numéro affiché « 152/1025 » : `numberingSize()` (dénominateur du groupe).
- LoL : 5 lanes (champions) + 133 lignes de skins + « Classiques & uniques » = 139 sous-thèmes, lus dans la colonne K de
  Tri-etoiles-lol-skins.xlsx par scripts/make-lol-lines.py → src/core/sets/lolLines.ts (séparé de lol.ts).

## Espace Jeux & économie V1 (spec du 3 nov.)
- Logique partagée : `src/core/economy.ts` (table de valeur 5/15/40/100/300/1000, secrète 5000 non brûlable ; calendrier
  30 j ; fourchettes d'ouverture ; complétion 5 × cartes ; 36 succès 50/150/500/2000 ; seuils anti-abus),
  `src/core/games.ts` (Pack Battle ±5 %, Royale 3-8, Roulette 100 numéros / 21 h Paris), `src/core/weekly.ts`
  (missions de la semaine ~200 ; pièces des missions du jour en plus des boosters).
- Serveur : `convex/economy.ts`, `convex/games.ts` (tout se tranche au verrouillage, en une mutation), `convex/abuse.ts`
  (alertes, jamais de blocage), `convex/crons.ts` (roulette toutes les 10 min, tire dès 21 h), `convex/econLib.ts`.
  Pièces d'ouverture tirées avec le booster (`packOpens.coins`) et créditées au dévoilement.
- Admin : `npx convex run admin:setAdmin '{"name":"tom"}'` · pièces de test : `admin:grantCoins`.
- Client : onglet JEUX (`views/games.ts`), pastille de pièces + portefeuille (`views/wallet.ts`), sélecteur de cartes
  (`views/picker.ts`), missions de la semaine dans le panneau des missions. Démo : robots adversaires (`ecoLocal.ts`).
- Décisions de Tom : série de 7 jours (+5 boosters) GARDÉE en plus du calendrier ; missions = boosters + pièces ;
  succès en version simple.

## SPORT PACK — thème Sport & Esport (SPEC-THEME-SPORT v5.1, 3 nov.)
- Source : `Tri-etoiles-sport.xlsx` (feuille « Tri étoiles », « Étoiles finales ») → `scripts/make-sport.py gen` →
  `src/core/sets/sport.ts` (données pures, réécrit en entier à chaque `gen` : import en REMPLACEMENT).
- 7 708 cartes, 114 sous-thèmes (vrais sous-thèmes, libellé imprimé en grand sur la carte), regroupés à l'affichage en 10 :
  Football · Esport · Sports collectifs · Raquettes · Combat · Sports mécaniques · Olympiques & athlétisme · Glisse & montagne ·
  Précision & stratégie · Coulisses & légendes. Le groupe « esport » reprend l'id de l'ancien sous-thème vide.
- Étoiles 1→6 = common→mythic (2 384 / 1 828 / 1 589 / 874 / 715 / 318, quotas de la spec). Pas de secrète en Sport.
- Ids `spt-<nom>` figés dans `scripts/data/sport-ids.json` (clé nom + type ; un retypage garde l'id). Numéro = « N° » de
  l'Excel sur 7 708 (`size: SPORT_SIZE`, `setInfo()` respecte maintenant `sub.size`).
- Type affiché sur le design typographique : Athlète, Club, Joueur esport, Stade… (`label`).
- Images (public/art/sport, ~600 Mo, + thumbs WebP) : 7 093 / 7 708.
  `harvest` : URL de l'Excel (Commons résolu par lots via l'API → miniature 960 px ; Special:FilePath est limité à ~2 req/s,
  429) ; logos non libres cherchés sur Wikipédia fr/en ; Liquipedia ≥ 1 s entre requêtes. `wikifill` : fichiers supprimés
  de Commons → image de la page Wikipédia au nom exact, gardée si la description Wikidata parle de sport.
  `fix` : corrections à la main (OVERRIDES : Uzi → le joueur et pas le pistolet, zen, David Beckham, Mario Lemieux, Argentine).
  615 cartes sans image fiable → design typographique (placeholder standard).
- Après une nouvelle version de l'Excel : `gen`, `harvest --retry`, `wikifill`, `fix`, `gen`, puis `node scripts/r2-sync.mjs`.

## Patch WORLD PACK V7 — boissons énergisantes (3 nov.)
- `Patch-monde-V7.xlsx` (racine) appliqué par `scripts/make-monde-v2.py` à chaque gen / harvest (liste `PATCHES`), par-dessus
  Tri-etoiles-monde_2.xlsx : (1) INSERT des 106 cartes N° 5237→5342 ; (2) rebrands N° 4264 et 4418 ; (3) resync des étoiles
  N° 1→5236 (43 changent). Le script refuse de générer si les contrôles échouent (5 342, 1652/1267/1101/606/496/220,
  Monster 60, Red Bull 48).
- Nouveaux sous-thèmes « Monster » (MON) et « Red Bull » (REB), groupe Nourriture. Ids `miam-…` pour les nouvelles cartes.
- Rebrands : MÊME id (`miam-red-bull` → Red Bull Original 6★, `miam-monster-energy` → Monster Original Green 6★) — des joueurs
  ont peut-être déjà ces cartes. Red Bull garde son image V1 (même photo) ; Monster prend la canette verte de l'Excel.
- Les numéros de « Plats français » situés après ces deux cartes reculent d'un ou deux (affichage seulement ; ids inchangés).
- Images : 30 des 108 cartes Monster / Red Bull (toutes celles qui ont une URL) ; 78 cartes 1★-3★ sans URL → design typographique.
- En jeu : 5 343 cartes = 5 342 du tri + « Citroën C15 des Cévennes » (carte V1 gardée, absente du tri).
