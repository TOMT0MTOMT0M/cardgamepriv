# Audit 06/11 — agent n°1 : rendu 3D, netteté, coût GPU (téléphone d'abord)

Code audité : `/home/claude/h2` (commit 0014d4d), three r187 (`node_modules/three/package.json`). Lecture seule.
Appareils de référence pour les chiffres : **iPhone 390×844 css, DPR 3** (1170×2532 px physiques) et **PC 1920×1080, DPR 1**.
Hypothèses de calcul (toutes tirées du code) : caméra fov 30 (`stage.ts:35`), cadrage `fill`/`fillPortrait` (`stage.ts:44-52`), carte 0,63×0,88 (`cardModel.ts:7-12`), booster 0,78×1,18 (`pack.ts:10`), textures de carte 768×1072 × `scale` (`art/index.ts:211`), booster 640 px (`pack.ts:87`).

---

## 0. La chaîne complète (résolution → écran), avec les pertes

```
texture carte (768×1072 × scale)        ─┐  échantillonnage trilinéaire + aniso 4/8 (art/index.ts:127, cardFace.ts:83)
texture booster 640×968                  ─┤
                                          ▼
passe de scène PassNode : MRT {output, emissive} RGBA16F, MSAA ×4, taille = canvas (post.ts:17-18 ; PassNode.js:253, 821)
   téléphone : MSAA résolu sur la puce, profondeur jetée (post.ts:16, 39)
                                          ▼
bloom (BloomNode : 1 + 5×2 = 11 passes, ½ res PC / ¼ res téléphone — opening.ts:2118, viewer.ts:236 ; duelSummon.ts:759 = ½ res même sur téléphone)
PC seulement : flare = rtt PLEIN ÉCRAN + 2e bloom ¼ (post.ts:197, RTTNode autoResize) ; aberration = rtt PLEIN ÉCRAN (opening.ts:2134 → convertToTexture → rtt)
                                          ▼
quad final RenderPipeline → canvas directement (fullscreenPass ⇒ samples 0, pas de MSAA inutile : Renderer.js:2970) + tone mapping Neutral + sRGB
                                          ▼
canvas = innerWidth×innerHeight × DPR, DPR = min(devicePixelRatio, 2) sur téléphone (shell.ts:145), ≤ 2 PC (renderer.ts:77)
                                          ▼
CSS `canvas.gl { width:100vw; height:100dvh }` (style.css:58) ⇒ le navigateur ÉTIRE le canvas ×1,5 (iPhone DPR 3), ×1,31 (Pixel 2,625), ×1,75 (DPR 3,5) en bilinéaire
```

**Où le piqué se perd, par ordre d'importance :**
1. **Téléphone : l'étirement final ×1,5** (780×1688 → 1170×2532). Toute l'image 3D (bords de carte, texte, foil, bloom) est rééchantillonnée en bilinéaire par le compositeur : c'est la perte la plus visible et elle touche tout.
2. **Taille de police dans la texture** : la plupart des lignes de texte des cartes font 5–7 px CSS à l'écran sur téléphone (voir §1.3) — ce n'est pas un problème de filtrage, elles ne peuvent pas être nettes.
3. **PC : lecture entre deux mips** (LOD 0,65–0,8 sur cartes et booster) : mélange trilinéaire mip0/mip1 ⇒ flou doux permanent.
4. Viewer téléphone zoomé ×1,6 : texture 614 px pour 824 px canvas (×1,34 magnification) puis ×1,5 d'étirement ⇒ ×2.

---

## 1. Netteté

### R1-01 — P0 — Le canvas 3D est rendu à DPR 2 puis étiré ×1,5 sur les écrans DPR 3
- **Fichier** : `src/game/shell.ts:145` (`let dpr = mobile ? Math.min(window.devicePixelRatio || 1, 2) : …`), `:164-165` (`setPixelRatio(dpr); setSize(w, h, false)`), `src/game/style.css:58`.
- **Ce qui se passe** : sur iPhone (DPR 3) le canvas fait 780×1688 et est affiché sur 1170×2532. Chaque pixel rendu couvre 1,5 pixel physique : bords de carte MSAA, texte, grain du foil sont lissés par l'upscale bilinéaire du navigateur. Les textures sont pourtant presque à l'échelle 1:1 du canvas (carte « montrée » à l'ouverture : 285 px CSS = 570 px canvas pour une texture de 538 px) — la perte est bien **après** le rendu.
- **Pourquoi ça nuit** : net (tout), premium (« rien n'est crisp »).
- **Correction** : DPR natif **dans la visionneuse** (1 carte, scène légère) et pendant les phases `shown`/`done` de l'ouverture si le moniteur de cadence le permet ; garder ×2 pendant la brûlure/déchirure (5 cartes + particules + bloom). Concrètement : `maxDpr` devient `devicePixelRatio` (plafonné à 3) ; `show(key)` pose un `dprCap` par scène (viewer : 3, opening : 2 par défaut, 3 à la demande via une API `setDprCap`), `resize()` est appelé au changement. Le mécanisme adaptatif existant (`shell.ts:334-345`) ramène à 2,5/2 si `SLOW_MS` est dépassé deux fenêtres de suite.
- **Coût estimé** : pixels ×2,25 (1,32 → 2,96 MP). Visionneuse iPhone 13 : ≈ 4–5 ms → ≈ 9–11 ms GPU (sous 16,7). Android milieu de gamme (Adreno 619 / Mali-G57) : ≈ 10–12 ms → ≈ 22–27 ms ⇒ l'adaptatif redescendra à ×2,5 puis ×2 ; prévoir le palier 2,5 (`Math.round((dpr-0.25)*4)/4` le gère déjà). Mémoire : cibles de passe 10,5 → 23,7 Mo × 2 (MRT) = +26 Mo ; bloom ¼ +3 Mo.
- **Risque** : chauffe/batterie dans la visionneuse (déjà rendue à 60 i/s en permanence, cf. R3-03) ; à coupler avec le 30 i/s au repos.
- **Vérifier** : Safari iOS → `renderer.domElement.width` doit valoir `innerWidth*3` ; photo macro d'un bord de carte : plus de « marche » de 1,5 px.

### R1-02 — P0 — Le texte des cartes est dessiné à une taille qui ne peut pas être lisible sur téléphone
- **Fichier** : `src/core/art/designs/fullart.ts:39-83` (tailles en px de la base 768), `common.ts:33-42` (`spacedFit`, minimum 9–10 px), `art/index.ts:211` (`W = 768 × scale`), `renderer.ts:121-125` (`mobileArtScale`).
- **Chiffres** (base 768 → texture → écran). Téléphone, ouverture carte « montrée » (`opening.ts:1210`, s = 1,12, z = 0,14 ⇒ carte ≈ 73 % de la largeur = 285 px CSS ; texture scale 0,70 = 538 px ; 1 px CSS ≈ 2,7 px de base) ; visionneuse (carte 257 px CSS, scale 0,80 = 614 px ; 1 px CSS ≈ 3,0 px de base) :

| Élément (fullart.ts) | px base | px texture (×0,7 / ×0,8) | px CSS écran ouverture / viewer | PC 1080p ouverture (×0,85, carte 417 px) / viewer (×1, 464 px) |
|---|---|---|---|---|
| Nom (`:65`, 62 → rétrécit) | 62 | 43 / 50 | **23 / 21** | 34 / 37 |
| Numéro (`:39`) | 30 | 21 / 24 | 11 / 10 | 16 / 18 |
| « / total » (`:43`) | 21 | 15 / 17 | 7,8 / 7 | 11 / 13 |
| Famille « POKÉMON » (`:56`, min 16) | 28 | 20 / 22 | 10 / 9,4 (min 5,9) | 15 / 17 |
| Sous-famille « JOHTO » (`:73`, min 10) | 16 | 11 / 13 | **5,9 / 5,4** (min 3,7) | 8,7 / 9,7 |
| Code de set (`:75`) | 15 | 10,5 / 12 | **5,6 / 5,0** | 8,1 / 9,1 |
| Artiste (`:82`, min 10) | 17 | 12 / 14 | **6,3 / 5,7** | 9,2 / 10 |

Booster (`pack.ts:182-200`, texture 640 px ; sur téléphone le booster fait ≈ 176 px CSS en vitrine ⇒ 1 px CSS = 3,6 px texture) : « S É R I E » 20 px → **5,5 px CSS**, tagline 16 px → 4,4 px, « ✂ DÉCHIRER ICI » 13 px → 3,6 px. Sachet simple : « C A R T E S » 30 px → 8 px CSS.
- **Pourquoi ça nuit** : net + premium. Un texte de 5 px CSS est perçu comme « flou », quelle que soit la résolution. Aucune des corrections GPU (DPR 3, RCAS, biais) ne change ça.
- **Correction** : règle « ≥ 30 px base sur la carte 3D (≈ 11 px CSS téléphone), ≥ 40 px sur le booster » : supprimer le code de set (déjà porté par le numéro), passer sous-famille et artiste à 30–32 px (une seule ligne, `spacedFit` min 24), « / total » à 26 px ; booster : tagline et « DÉCHIRER ICI » retirés ou en 44 px. Coût : 0 GPU ; repeindre les vignettes (bump `CACHE` dans `cardImages.ts:27`).
- **Vérifier** : capture d'écran iPhone à 100 % : hauteur de capitale ≥ 8 px physiques… non : ≥ 24 px physiques (8 px CSS) pour chaque ligne gardée.

### R1-03 — P1 — PC : les textures de carte et de booster sont lues entre mip 0 et mip 1 (flou trilinéaire permanent)
- **Fichier** : `src/game/scenes/opening.ts:1979` (`artScale = … : 0.85`), `viewer.ts:132` (`scale = … : 1`), `pack.ts:87` (640 px), `cardMaterial.ts:89-94` (`texture(art.bg, uvAt(...))` sans biais).
- **Ce qui se passe** : PC 1080p, carte montrée 417 px écran pour 653 px texture ⇒ LOD = log2(653/417) = **0,65** ; visionneuse 464 px / 768 ⇒ LOD **0,73** ; booster 371 px / 640 ⇒ LOD **0,79**. Le filtrage trilinéaire mélange mip0 et mip1 (326 px !) à 65–79 % ⇒ texte et plis du booster « baveux » même en plein écran. (Téléphone : LOD ≈ 0 en carte montrée, >0 en éventail/vitrine : booster 352 px canvas / 640 ⇒ LOD 0,86 : même défaut.)
- **Correction** : biais de LOD négatif sur les calques couleur (bg, subject, fg, frame) et sur front/back du booster : `texture(art.bg, uvAt(depths.bg)).bias(-0.6)` — vérifié dans r187 : `TextureNode.bias()` clone le nœud (`TextureNode.js:886-893`) et génère `textureSampleBias` en WGSL (`WGSLNodeBuilder.js:1161`) et `texture(s, uv, bias)` en GLSL (`GLSLNodeBuilder.js:760`) : fonctionne sur les deux backends, coût identique à un sample. Laisser `masks`/`fx` sans biais (relief = bump : un biais ferait scintiller). Ne PAS mettre de biais si on adopte des textures à la taille écran.
- **Coût** : 0 ms ; **risque** : léger scintillement du grain (`finishLayer` 0,04–0,05) sur les cartes petites (éventail) ⇒ limiter à −0,5 et garder l'anisotropie 8 sur PC.
- **Vérifier** : capture PC 1080p, zoom 400 % sur « POKÉMON » avant/après.

### R1-04 — P1 — Visionneuse téléphone : zoom ×1,6–1,85 sur une texture de 614 px
- **Fichier** : `viewer.ts:78` (`zoomT ≤ 1.85`), `:132` (`mobileArtScale(…, 0.8, 1)` ⇒ 0,80), `:260` (double tap → 1,6), `renderer.ts:122` (DPR plafonné à 2 dans le calcul).
- **Chiffres** : zoom 1,6 ⇒ carte 412 px CSS = 1236 px physiques pour 614 px de texture ⇒ **×2 de magnification** (bilinéaire) ; c'est précisément le geste « inspecter la carte ».
- **Correction** : dans la visionneuse seulement, `mobileArtScale(w, h, 0.8 × zoomMax, 1.5)` avec DPR réel (plafond 3) ⇒ scale ≈ 1,25–1,5 (960–1152 px). Mémoire GPU d'une carte à 1,25 : 6 calques × 960×1340 × 4 o = 31 Mo + mips 33 % = 41 Mo (une seule carte vivante, toiles vidées par `release`) — acceptable sur iPhone ≥ 12, à borner à 1,0 (26 Mo) si `deviceMemory ≤ 4`. Génération CPU : ≈ ×2,4 de pixels peints (`generateCardArtAsync` déjà en 4 étapes, `viewer.ts:137`).
- **Vérifier** : double-tap sur une carte Pokémon : le nom doit rester aussi net qu'en vue normale.

### R1-05 — P2 — Vignettes 2D (collection) peintes à 276 px pour des tuiles de 340 px physiques
- **Fichier** : `src/game/cardImages.ts:21` (`SCALE = 0.36` ⇒ 276×386), `style.css:407` (`minmax(112px,1fr)` ⇒ 3 colonnes de ≈ 113 px CSS sur 390 px = 339 px physiques en DPR 3), WebP q 0,86 (`:141`).
- **Chiffres** : étirement ×1,23 (DPR 3), ×1,0 (DPR 2). Textes : nom 22 px texture ⇒ 7 px CSS ; famille 10 px ⇒ 3 px CSS (illisible, décoratif).
- **Correction** : `SCALE = Math.min(0.5, 113 × min(dpr, 3) / 768)` = 0,44 (DPR 3) ⇒ 338 px ; +60 % d'octets en cache (≈ 25–40 Ko/carte) ; bump `CACHE`. Et ne peindre que nom + étoiles + numéro sur les vignettes (design « mini »).

### R1-06 — P2 — Roue 3D des boosters : textures 256 px pour des pochettes de 340–400 px physiques
- **Fichier** : `packWheel3d.ts:30-31` (`TEX_W = 256`, `BACK_W = 128`), `:44` (aniso 2), `style.css:2562` (`--sw: clamp(96px, 29vw, 128px)` ⇒ 113 px CSS, la pochette du milieu plus proche de la caméra).
- **Chiffres** : 113 px CSS × 3 = 339 px physiques (plus pour celle du milieu) pour 256 px ⇒ ×1,3–1,6 de magnification.
- **Correction** : `TEX_W = 384` (mémoire ×2,25 : 5 × 384×580 × 4 o = 4,5 Mo, négligeable).

### R1-07 — P2 — Anisotropie et mipmaps : état des lieux (rien de cassé, deux détails)
- Toutes les CanvasTexture ont des mipmaps (défaut three) et aniso 8 PC / 4 téléphone (`art/index.ts:127`, `cardFace.ts:83`, `pack.ts:260`), 2 sur la roue (`packWheel3d.ts:44`), 1 sur téléphone dans `duelSummon.ts:127`. WebGPU n'applique l'anisotropie qu'en trilinéaire (`WebGPUTextureUtils.js:187-191`) : c'est le cas partout.
- Détail 1 : `cardMaterial.ts:99` (`.level(float(4))` pour l'ombre du cadre) n'est utilisé qu'avec `aoFromFrame`, jamais dans le jeu (`holo.ts:109` passe `opts.aoFromFrame` = undefined) ⇒ OK.
- Détail 2 : le bruit cuit du booster (`opening.ts:604-607`, `generateMipmaps = false`, Linear) est lu en `positionLocal` : pas de mip ⇒ aliasing possible quand le booster est petit (vitrine) ; sans conséquence visible (il ne sert qu'au front de brûlure).

---

## 2. Propositions chiffrées (ce que chacune répare vraiment)

| Piste | Répare | Ne répare pas | Coût GPU iPhone 13 (DPR 2 → cible) | Coût Android milieu de gamme | Mémoire | Comment dans r187 |
|---|---|---|---|---|---|---|
| **DPR natif (3) dans la visionneuse / carte montrée** (R1-01) | l'étirement ×1,5 : bords, texte, foil | la taille des polices (R1-02) | +5–6 ms (≈ 10 ms total) | +12–15 ms ⇒ adaptatif à 2,5/2 | +26 Mo cibles, +3 Mo bloom | `setPixelRatio(3)` par scène (`shell.ts:164`) |
| **RCAS inline dans le quad final** (5 lectures de `pl.color`, formule de `SharpenNode.js`) | perception de netteté des textures et des mips (×1,3–1,5 de « piqué » apparent) | l'étirement par le compositeur s'il reste à DPR 2 ; les polices | +0,2–0,4 ms à DPR 2, +0,6–0,9 ms à DPR 3 | +0,8–1,5 ms | 0 (inline) — `sharpen()`/`FSR1Node` alloueraient 1–2 cibles RGBA16F plein écran (24–47 Mo à DPR 3) | écrire le noyau 5 taps dans `pl.output` (opening.ts:2158, viewer.ts:238) |
| **FSR1 (EASU+RCAS)** : scène à ×2, canvas à ×3 | étirement (meilleur que le bilinéaire du navigateur) sans payer ×2,25 de fragment | polices ; flou des mips à la source | +1,5–2,5 ms (2,96 MP × 17 taps) | +4–6 ms | 2 cibles RGBA16F 2,96 MP = 47 Mo | `fsr1(pass.getTextureNode(), 0.2)` après `scenePass.setResolutionScale(2/3)` — **fonctionne en WebGL2** (repli `textureLoad` sans `textureGather`, `FSR1Node.js:196-199`). Pas rentable ici : la scène n'est pas « fragment-bound » au point de ne pas supporter DPR 3 en visionneuse, et 47 Mo de cibles pèsent plus que le gain |
| **Supersampling (PassNode.setResolutionScale(1.5))** | aliasing fin (déjà couvert par MSAA ×4) | rien de ce que Tom voit ; le quad final réduit en bilinéaire 4 taps ⇒ aliasing de réduction | ×2,25 fragment | prohibitif | ×2,25 cibles | `SSAAPassNode` (temporel, N× le coût) ou `setResolutionScale(1.5)` ; **à écarter** |
| **Biais de mip −0,5/−0,6** (R1-03) | PC : LOD 0,65–0,8 → ≈ 0,1 ; téléphone : booster vitrine (LOD 0,86), éventail | téléphone carte montrée (déjà LOD 0) ; polices | 0 ms | 0 ms | 0 | `texture(...).bias(-0.6)` (TextureNode.js:886, WGSL `textureSampleBias`, GLSL `texture(s,uv,bias)`) |
| **Art ×1 (768 px) à l'ouverture téléphone** | rien en carte montrée (texture 538 vs 570 px canvas : déjà ≈ 1:1 à DPR 2) ; utile seulement si DPR 3 (570 → 855 px canvas) | — | 0 ms GPU ; CPU peinture ×2 | idem | 5 cartes : 64 Mo → 130 Mo (+ mips) : **trop** pour Android 4 Go | `mobileArtScale(…, max = 1.0)` avec DPR réel |
| **Masques/fx à ½ résolution** (contre-proposition pour financer R1-04) | mémoire : −37 % par carte (2 calques sur 6 à ¼ des pixels) | — | ≈ 0 (moins de bande passante) | idem | 5 cartes à 0,85 : 94 → 62 Mo | `ArtOptions.scale` séparé pour masks/fx (`art/index.ts:222, 288-289`) + `uv` inchangé |

**Recommandation** : (1) R1-02 (polices), (2) DPR natif visionneuse + carte montrée, (3) biais −0,5 partout sur les calques couleur et le booster, (4) RCAS inline (léger, ~0,3 ms) uniquement si après (2) le ressenti reste « doux » — à mesurer, pas à poser par défaut, (5) textures visionneuse 1,25 ; FSR1 et supersampling écartés.

---

## 3. Fluidité (à-coups)

### R3-01 — P0 — Les pipelines « vrais » (MRT émissif) ne sont jamais précompilés : à-coup au premier affichage dans la visionneuse et à la première carte de chaque rareté sur PC
- **Fichier** : `src/core/post.ts:148` (`TARGET_PRECOMPILE = false`) ⇒ `compilePassAsync` (`:154-157`) retombe sur `renderer.compileAsync(scene, camera)` **pour le canvas** ; `viewer.ts:245` (`await pl.compile()` croit compiler « pour la VRAIE cible ») ; `opening.ts:945` (`compileReal()` idem) ; `opening.ts:2201-2211` (contournement **téléphone seulement** : une image rendue par les deux sorties) ; `opening.ts:2213` (sur PC, les cartes factices sont retirées **avant** toute image).
- **Preuve que les pipelines diffèrent** : la passe a `setMRT(mrt({ output, emissive }))` (`post.ts:18`) ⇒ le NodeBuilder émet un fragment à 2 sorties (`@location(0)/@location(1)`), différent du fragment 1 sortie compilé pour le canvas ⇒ nouveau module + nouveau pipeline créés **synchrones** dans `render()` (WebGPU `createRenderPipeline` bloquant ; WebGL2 `linkProgram` bloquant). La face holo ≈ 470 nœuds (commentaire `viewer.ts:244`) : 100–400 ms sur téléphone, 50–150 ms sur PC, par variante (6 tiers + photo + dos + tranche).
- **Correction** : le même « warm » hors écran que `duelSummon.ts:778-789` (`renderer.setRenderTarget(new RenderTarget(4,4)); post.render(); restore`) :
  - visionneuse : à la fin de `setup` (la carte factice est encore dans `rig`, `viewer.ts:222`), **avant** `clear()` ; sur PC comme sur téléphone ;
  - ouverture PC : rendre une image à blanc avec les factices avant `:2213` (la branche `if (mobile)` devient inconditionnelle, mais vers une RenderTarget 4×4 : pas de flash de la pile factice).
  Ensuite `TARGET_PRECOMPILE` et `compilePassAsync` deviennent inutiles (supprimer les ~90 lignes `post.ts:95-186` : moins de surface, zéro risque WebGL2).
- **Coût** : 1 image de ≈ 10–40 ms sous l'écran de chargement ; **risque** : nul (déjà en production dans `duelSummon`).
- **Vérifier** : DevTools Performance (Android Chrome) : plus de tâche longue > 50 ms à la première ouverture de la visionneuse ; `console.time` autour du 1er `pl.render()` de `show()`.

### R3-02 — P1 — Visionneuse : textures envoyées au GPU avant l'animation, mais les mipmaps sont générées dans la même image que `initTexture` (téléphone)
- **Fichier** : `viewer.ts:139` (`for … initTexture(t)` 6 textures d'un coup puis un seul `nextFrame`), `opening.ts:899-903` (2 par image — déjà bien).
- **Ce qui se passe** : `initTexture` déclenche upload + `generateMipmaps` (compute/blit passes, `WebGPUTextureUtils.js:506`) : 6 × (614×858 RGBA + mips) ≈ 13 Mo en une image ⇒ 8–20 ms sur Android milieu de gamme, pendant que la scène précédente est encore affichée (sensible si on feuillette : `collection.ts:1536` `dir`).
- **Correction** : copier la cadence de l'ouverture (2 textures par image, `await nextFrame()` entre).

### R3-03 — P1 — Visionneuse et vitrine rendues à 60 i/s même immobiles ; rendu à la demande absent
- **Fichier** : `viewer.ts:266-286` (`update` rend à chaque image ; flottement `Math.sin(t*0.9)*0.006` et halo pulsant rendent la scène « jamais calme »), `opening.ts:2537-2544` (30 i/s au repos : vitrine téléphone uniquement), `shell.ts:303-376` (boucle `setAnimationLoop` permanente, aucune notion de « rien n'a changé »).
- **Pourquoi** : batterie/chauffe (iPhone : la visionneuse d'une carte 6★ à DPR 3 chaufferait), et le throttling thermique qui suit fait baisser la cadence **de toute la session** (le moniteur `shell.ts:334` ne remonte qu'après 3 fenêtres « fast » ⇒ 7,5 s).
- **Correction** : (a) visionneuse : même règle « calm ⇒ 1 image sur 2 » qu'à l'ouverture quand `!ctx.input.down && !dragging && gyro immobile && !tl.isActive()` ; (b) opening phase `done` (éventail posé) idem. Coût : 0 ; gain : −50 % GPU au repos.

### R3-04 — P2 — Autres sources d'à-coups vérifiées (RAS ou mineur)
- `generateCardArtAsync` en 4 étapes (`art/index.ts:348`), toiles vidées après upload (`:129-134`) : bien.
- `readRenderTargetPixels` : aucun dans le jeu. `toBlob` (`opening.ts:1893`, miniatures de boosters ; `cardImages.ts:141`) : asynchrones, hors boucle.
- Allocations par image : `slots.map(...)` dans le raycast seulement au mouvement souris (`opening.ts:2434-2437`), `Promise.all` des `popErrorScope` seulement après un retour de veille (`shell.ts:367`). `backdropNode` avec `rand(... time)` : bruit animé plein écran, bon marché mais réévalué à chaque image (empêche tout « rendu identique ⇒ skip »).
- `gsap.ticker.lagSmoothing(0)` + `Timer` three (`shell.ts:97-99`) : cohérent ; `dt` borné à 1/20 s.
- Boucle : `document.hidden` ⇒ return (`shell.ts:304`) : bien.
- Compilation « canvas » (`stage.compile()`) toujours faite en plus de la vraie : double coût de compilation au montage (≈ +30 % du temps de l'écran de chargement) ⇒ supprimable avec R3-01.

---

## 4. Coût GPU téléphone (par image, ouverture, iPhone DPR 2 = 1,32 MP)

| Poste | Fichier | Coût estimé | Remarque |
|---|---|---|---|
| Passe de scène MRT ×2 RGBA16F, MSAA ×4 (résolu sur puce, profondeur jetée) | `post.ts:16-18, 39` | écriture résolue 2 × 10,5 Mo = 21 Mo/image (1,3 Go/s à 60 i/s) | bien optimisé pour TBDR ; **en WebGL2** (repli) `storeMultisampledColorBuffer` est ignoré : 2 × 42 Mo multisamplés écrits + blit ⇒ 4× plus cher : prévoir `samples: 2` en WebGL2 téléphone |
| Vitrine téléphone (`lite`) | `opening.ts:2164-2170` | la passe écrit toujours la cible **émissive** (10,5 Mo/image) alors que `lite` ne la lit pas | P2 : passe sans MRT pour la vitrine (variante de pipeline supplémentaire à chauffer) |
| Face holo « lite » par pixel | `holo.ts:99-185`, `cardMaterial.ts:85-111` | 6 calques + 2 lectures de `masks` par `bumpMap` + 2 `noiseTexel` + 1 LUT + 2 env (standard + clearcoat) = **≈ 13 lectures de texture/pixel**, trilinéaire aniso 4 ; voronoï 3×3 analytique dès 2★ (`:134`) | carte montrée ≈ 45 % de l'écran : ≈ 0,6 MP × 13 = 7,7 M lectures ⇒ ≈ 2,5–4 ms sur A15, 8–12 ms sur Mali-G57. **Le poste n°1.** Le bump sur `masks.g` (2 lectures) pourrait venir d'une normal map précalculée (1 lecture, CPU à la peinture) ; `clearcoat` (`holo.ts:179`) = 2e lobe + 2e lecture env : ≈ 25 % de l'ALU du matériau pour un vernis à 0,35 — à garder uniquement ≥ 4★ |
| Dos de carte | `cardMaterial.ts:125-137` | 4 lectures + clearcoat + env | 5 dos visibles dans la pile : modestes (petits) |
| Booster | `opening.ts:612-648` | 2 passes DoubleSide (face/dos), bump sur `crinkle` (3 lectures) + front + masks + bruit cuit ; `maskNode` (discard) pendant la brûlure | ≈ 20 % de l'écran ; `tearBody/tearStrip` (`:2032-2039`, 96×80 segments ×2) rendus seulement en style tear |
| Halo additif 2,6×2,6 | `opening.ts:2053-2058` | plan ≈ plein écran transparent additif (1,32 MP × 8 o lecture+écriture ≈ 21 Mo/image) ; caché en vitrine téléphone (`:2413`) | 79 % de la surface du quad est à 0 (hors du disque ou < 0,003) : passer à un `CircleGeometry` de rayon 1,0 et `scale` sur `U.glow` ⇒ −50 % de remplissage |
| Particules | `opening.ts:2063-2088` | 1100 sprites de 2–10 px ⇒ overdraw faible | ok ; `partsRef.visible` géré (`:2416`) |
| Poussières vitrine | `:2092-2107` | 36 sprites | négligeable |
| Bloom ¼ | `:2118` | 11 passes sur 195×422 ⇒ < 0,3 ms | ok. **`duelSummon.ts:759` : bloom à ½ même sur téléphone** (pas de `setResolutionScale(0.25)`) ⇒ 11 passes sur 390×844 ≈ 1 ms : aligner |
| Quad final | `:2143-2158` | 3 lectures couleur (aberration par canal) + 5 mips de bloom + maths | ≈ 0,5 ms |
| Fond | `stage.ts:25-31` | 1 `rand` + mix par pixel | négligeable |
| Env map PMREM | `env.ts:95` | générée une fois par renderer (cache WeakMap `env.ts:68`) | ok |

**Trop cher pour un milieu de gamme et quoi faire sans perdre le premium :**
1. Holo : clearcoat seulement ≥ 4★ (`holo.ts:179` ⇒ `tier >= 4 ? 0.35 : 0`), normal map précalculée à la place de `bumpMap(L.masks.g)` (`holo.ts:178`, `cardMaterial.ts:133,146`) : −3 lectures/pixel, même aspect. Gain ≈ 25–30 % du matériau.
2. Halo sur disque (ci-dessus) : −10 Mo/image.
3. Vitrine : passe sans MRT (ou garder MRT mais `lite` est déjà là) : −10 Mo/image.
4. WebGL2 téléphone : `samples: 2` (`createPipeline(..., { samples: 2 })`, `post.ts:13`).

---

## 5. Qualité « premium »

### R5-01 — P2 — Tone mapping Neutral : les blancs du papier et du texte sont compressés
- **Fichier** : `renderer.ts:100-101` (`NeutralToneMapping`, exposition 1), `stage.ts:39-40` (env studio ×0,9–1), `opening.ts:1982` (clé 1,2 → jusqu'à 1,2×(1+1,5) à l'éclair).
- **Ce qui se passe** : Khronos Neutral compresse au-dessus de ≈ 0,8 linéaire : le papier `#f7f2e8` éclairé (clé 1,2 + env 0,9 ⇒ > 1,0) sort autour de 0,88 ⇒ blancs légèrement gris, contraste texte/voile réduit. C'est le bon choix pour la fidélité des illustrations (identité sous 0,8) ; à ne pas changer pour ACES/AgX (désaturation).
- **Correction** : baisser `key.intensity` à 1,0 et `envIntensity` à 0,8 dans la visionneuse pour que le papier reste < 0,8 (les glints émissifs dépassent et passent dans le bloom, c'est voulu) ; **mesurer** avant : capture et lecture de la valeur du blanc du nom (doit être ≥ 240/255).

### R5-02 — P2 — Antialiasing des bords : MSAA ×4 correct, mais perdu par l'étirement
- `renderer.ts:83` (`antialias: true` ⇒ `samples = 4`, `Renderer.js:360`), bords arrondis en géométrie (`cardModel.ts:38` : 6 segments par quart ⇒ facettes de ≈ 0,8 px à 285 px CSS : invisibles). FXAA/SMAA inutiles. Le quad final n'est pas multi-échantillonné (`Renderer.js:2970`, bien). Le seul défaut est R1-01.

### R5-03 — P2 — Bords du booster et du cadre
- Booster : pas de bord géométrique arrondi, tranches = `DoubleSide` du même maillage (`opening.ts:628`) : les soudures (`crimpBands`, 1,2 px de trait à 640 px) tombent sous 1 px à l'écran téléphone (352 px canvas) ⇒ moiré/gris. Remède : traits ≥ 2,5 px (`pack.ts:107`) ou pas de 8 px au lieu de 6.
- Liseré intérieur de la carte (`fullart.ts:27-30`, `lineWidth 2` à 768) ⇒ 1,4 px texture à 0,7, 0,75 px CSS à l'écran ⇒ se dissout. Remède : 3 px (`:28`).

### R5-04 — P2 — Grain animé du fond + 30 i/s au repos
- `stage.ts:29` : bruit `rand(screenCoordinate + time)` renouvelé à chaque image ; à 30 i/s (vitrine calme) il « fourmille » plus lentement — effet légèrement cheap sur un fond sombre. Remède : figer le `time` du grain (bruit statique de 0,018) ou le remplacer par un dither de Bayer 8×8 (déterministe).

---

## Plan d'action ordonné (gain / effort)

| # | Action | Gain | Effort | Fichiers |
|---|---|---|---|---|
| 1 | **Warm hors écran des vrais pipelines** (visionneuse + ouverture PC), supprimer `compilePassAsync` | à-coup 100–400 ms au 1er zoom et 1res révélations PC | 1 h | `viewer.ts:245`, `opening.ts:2201-2213`, `post.ts:95-186` |
| 2 | **Tailles de texte ≥ 30 px base sur carte, ≥ 40 sur booster**, supprimer les lignes < 30 | lisibilité : la cause principale du « pas crisp » | 2–3 h + bump cache vignettes | `fullart.ts`, `paysage.ts`, `bebou.ts`, `pack.ts`, `cardImages.ts:27` |
| 3 | **DPR natif dans la visionneuse** (+ carte montrée à l'ouverture, gardé par l'adaptatif) | fin de l'étirement ×1,5 | 2 h | `shell.ts:145-171`, `show()` |
| 4 | **Biais −0,5 sur calques couleur + booster** | PC : flou trilinéaire ; téléphone : vitrine/éventail | 30 min | `cardMaterial.ts:89-92`, `opening.ts:614-615, 688-689`, `cardMaterial.ts:127` |
| 5 | Visionneuse : textures 1,25 (zoom) + envoi 2 par image | zoom net, moins d'à-coup | 1 h | `viewer.ts:132-140` |
| 6 | 30 i/s au repos en visionneuse et éventail posé | batterie, throttling | 1 h | `viewer.ts:266`, `opening.ts:2537` |
| 7 | Holo : clearcoat ≥ 4★, normal map précalculée | −25 % du poste n°1 GPU | 3 h | `holo.ts:178-180`, `art/index.ts` |
| 8 | Halo sur disque ; passe sans MRT en vitrine ; bloom ¼ dans duelSummon ; `samples: 2` WebGL2 | bande passante −20 Mo/image | 1–2 h | `opening.ts:2053`, `duelSummon.ts:759`, `post.ts:13` |
| 9 | RCAS inline dans le quad final (option, à A/B) | piqué apparent | 1 h | `opening.ts:2158`, `viewer.ts:238` |
| 10 | Vignettes 2D à 0,44, roue 384 px, traits booster/liseré ≥ 2,5–3 px | netteté 2D | 1 h | `cardImages.ts:21`, `packWheel3d.ts:30`, `pack.ts:107`, `fullart.ts:28` |

## Mesures à faire sur un vrai téléphone (avant/après)

1. `renderer.domElement.width / innerWidth` (console Safari distant) : 2 aujourd'hui, 3 après (3).
2. Capture d'écran native (pas de zoom) d'une carte en visionneuse ; mesurer en px physiques la hauteur des capitales de chaque ligne (cible ≥ 24 px) et le contraste du blanc du nom (≥ 240/255).
3. Performance (Chrome Android, « Performance » onglet) : première ouverture de la visionneuse ⇒ durée de la plus longue tâche (cible < 50 ms) ; même chose à la 1re révélation 5★.
4. Temps GPU par image : `trackTimestamp` est coupé sur téléphone (`renderer.ts:86`) ; mesurer la cadence (`shell.ts` log « appareil un peu juste ») en visionneuse à DPR 3 sur : iPhone 12/13, un Android milieu de gamme (Redmi/Galaxy A), avec une 6★ (voronoï + nébuleuse) et une 1★.
5. Mémoire : `performance.memory` indisponible iOS ⇒ surveiller l'absence de « canvas saturé » (`canvas.ts:36`) après 10 ouvertures ×5 avec textures visionneuse 1,25.
6. Chauffe : 5 min de visionneuse à DPR 3 ; relever la cadence à t = 0 et t = 5 min (throttling thermique) avec et sans 30 i/s au repos.
7. WebGL2 (`?backend=webgl`) sur Android : cadence de l'ouverture avec `samples: 4` vs `2`.
