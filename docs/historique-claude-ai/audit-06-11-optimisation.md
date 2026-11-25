# Audit 06/11 — optimisation complète (téléphone d'abord) : net, fluide, premium

Trois agents en lecture seule sur le commit **0014d4d** (déployé) : rendu 3D / netteté / GPU, interface DOM-CSS / premium / motion, chargement / réseau / mémoire / batterie. Aucun code modifié. Les rapports détaillés (fichier:ligne partout) sont joints ; ce document est la synthèse arbitrée et le plan d'action.

Appareils de référence : iPhone 390×844 DPR 3 (1170×2532 physiques) et PC 1920×1080 DPR 1.

---

## 1. Le diagnostic en une page : pourquoi « rien n'est net »

Le flou n'a pas une cause mais **sept, empilées**. Les corriger une par une ne suffit pas ; il faut les prendre dans l'ordre de la chaîne (source → texture → rendu → écran → interface).

| # | Cause | Preuve | Agent |
|---|---|---|---|
| 1 | **Les sources d'illustration sont trop petites** : `art/pop/*.jpg` = 230×358 px (17 471 cartes = 47 % du catalogue), `art/pokemon-151/*.png` = 300×360. Peintes dans une texture de 538–768 px puis affichées en DPR 3 : agrandissement ×4 à ×5. Aucun réglage 3D ne peut créer du détail absent. | fichiers R2 sondés ; `shell.ts:83` (`maxImageSide` 1024 jamais atteint) | 3 |
| 2 | **Le texte des cartes est dessiné trop petit pour un téléphone** : sous-famille, code de set, artiste = 5–6 px CSS à l'écran (base 15–17 px sur 768, texture ×0,7, carte 285 px CSS) ; booster : tagline 4,4 px, « DÉCHIRER ICI » 3,6 px. | `fullart.ts:39-83`, `common.ts:33`, `pack.ts:182-200` | 1 |
| 3 | **Le canvas 3D est rendu en DPR 2 puis étiré ×1,5 par le navigateur** sur un écran DPR 3 (780×1688 → 1170×2532, bilinéaire). Les textures sont ≈ 1:1 avec le canvas : la perte est après le rendu. | `shell.ts:145`, `style.css:58` | 1 |
| 4 | **PC : textures lues entre mip 0 et mip 1** (LOD 0,65–0,8 : carte 417 px écran / 653 px texture, booster 371/640) → flou trilinéaire permanent. Téléphone : idem en vitrine/éventail. | `opening.ts:1979`, `viewer.ts:132`, `cardMaterial.ts:89-94` | 1 |
| 5 | **La police Bold Frame en capitales est illisible sous 14 px** : « R » lu « A », « X » lu « H » (« CONTRATS » → « CONTAATS », « RARE » → « AAAE », « JEUX » → « JEUH »). 547 des 557 textes du téléphone sont dans cette police, 73 sélecteurs < 12 px, 31 % des textes visibles sous 12 px. | `fonts.css:12-14`, `fonts.ts:16-18`, `style.css:84` ; captures `crop-nav-R.png`, `crop-rare.png` | 2 |
| 6 | **Vignettes 2D de la collection peintes à 276 px pour 336–342 px physiques** (agrandies ×1,22) avec des micro-textes de 3 px CSS ; fil « Gros tirages » tourné 11°, réduit ×0,88, texte 7–8 px, image 55 px pour 144 px physiques. | `cardImages.ts:21`, `bigPulls.ts:42-44,187`, `style.css:1985` | 1, 2, 3 |
| 7 | **Le téléphone chauffe au repos, donc la qualité baisse** : 3 boucles rAF permanentes + une animation SVG qui force **1 layout complet par image sur toutes les pages** (169 layouts / 3 s mesurés au repos) + vitrine à 30 i/s + fil JS à 60 i/s + `bp-spin` repeint → throttling thermique → `SLOW_MS` → DPR descend → encore moins net. | `style.css:1003-1005`, `shell.ts:303-376`, `diag.ts:75-88`, `bigPulls.ts:276-298`, `style.css:876-882` | 2, 3 |

À côté du flou, deux freins au « premium » : un **premier écran de 1,41 Mo sur le fil / 4,9 Mo à analyser** dont 57 % est le catalogue complet de 37 088 cartes (810 Ko) importé statiquement (0,5–0,9 s de CPU au démarrage téléphone, +28 Mo de tas, 4 s sur 4G lente), et un **à-coup de 100–400 ms au premier zoom** (les vrais pipelines MRT ne sont jamais précompilés, `post.ts:148`).

---

## 2. Arbitrage DPR 3 vs mémoire GPU (les agents 1 et 3 se contredisaient)

- Agent 1 : rendre en DPR natif (3) dans la visionneuse et la carte montrée (+5–6 ms GPU iPhone 13, +26 Mo de cibles).
- Agent 3 : à DPR 3 les cibles passent de ≈ 150 Mo à ≈ 340 Mo (MSAA ×4 RGBA16F MRT + bloom) → 450–500 Mo GPU pendant une ouverture, zone de jetsam iOS.

**Décision proposée :**
1. **Visionneuse** (1 carte, scène légère) : DPR natif plafonné à 3, **MSAA ×2 au lieu de ×4** sur téléphone, bloom ¼, 30 i/s au repos. Cibles ≈ 100–120 Mo au lieu de 340. C'est l'écran où l'on « inspecte » : il doit être parfait.
2. **Ouverture** : rester en DPR 2 pendant brûlure/déchirure/révélation (5 cartes + particules + bloom), **passer à DPR 3 seulement en phase `shown`/`done`** si le moniteur de cadence le permet (l'adaptatif existant `shell.ts:334-345` redescend sinon). MSAA ×2 sur téléphone (`samples: 2` dans `createPipeline`, obligatoire en WebGL2 où le ×4 est payé plein).
3. **RCAS inline** (5 lectures dans le quad final, ≈ 0,3 ms) en option A/B si après 1–2 le ressenti reste « doux ». FSR1 complet et supersampling écartés (47 Mo de cibles pour moins que le DPR natif).
4. **Biais de mip −0,5** sur les calques couleur (bg, subject, fg, frame) et le booster : 0 ms, règle le PC. Vérifié dans three r187 : `TextureNode.bias()` → `textureSampleBias` WGSL / `texture(s,uv,bias)` GLSL.
5. Pas d'art ×1 à l'ouverture (5 cartes : 64 → 131 Mo GPU). À la place : **`frame` et `masks` à ×1, les 4 autres calques à ×0,7** (+40 % de VRAM au lieu de +100 %), et `masks`+`fx` fusionnés en une RGBA.

---

## 3. Plan d'action en quatre vagues

Effort total ≈ 6–7 jours. Chaque vague est livrable et mesurable seule.

### Vague 1 — « net » immédiat (≈ 1,5 j, risque faible)

| # | Action | Fichiers | Effort |
|---|---|---|---|
| 1.1 | `st-flicker` : animer un wrapper HTML, pas le `<path>` SVG → 0 layout/image sur toutes les pages | `style.css:1003-1005`, `main.ts:401` | 5 min |
| 1.2 | Retirer `filter: blur(6px)` de `canvas.gl.dim` (24 images de flou plein écran à chaque changement de page pour une 3D visible à 5 %) ; `transition: width` → `transform: scaleX` sur les 4 barres ; `bp-spin`/`bp-live`/`mv-pulse` en transform/opacity | `style.css:58-59, 373, 939, 238, 876-882, 856, 279` | 1 h |
| 1.3 | Texte des cartes : règle **≥ 30 px base sur la carte, ≥ 40 sur le booster** ; supprimer le code de set (doublon du numéro), sous-famille et artiste sur une ligne à 30–32 px, « / total » 26 px ; booster : tagline et « DÉCHIRER ICI » retirés ou 44 px ; liseré intérieur 3 px ; bump `CACHE` des vignettes | `fullart.ts`, `paysage.ts`, `bebou.ts`, `common.ts:33`, `pack.ts:107,182-200`, `cardImages.ts:27` | 3 h |
| 1.4 | Biais de mip −0,5 sur bg/subject/fg/frame + front/back booster + dos | `cardMaterial.ts:89-92,127`, `opening.ts:614-615,688-689` | 30 min |
| 1.5 | Vignettes : `SCALE` selon `devicePixelRatio` (0,45 en DPR 3, 0,36 en DPR 2) ; ne pas peindre les micro-textes sous 0,5 (nom + étoiles + numéro seulement) ; roue 3D `TEX_W = 384` | `cardImages.ts:21`, `packWheel3d.ts:30` | 2 h |
| 1.6 | Fil « Gros tirages » téléphone : sans rotation ni échelle, badge 9 px / pseudo 11 px, pas de `will-change`, miniature ≥ 2× | `bigPulls.ts:42-44`, `style.css:1985-1991, 2281` | 1 h |
| 1.7 | **Police de libellé** : réserver Bold Frame aux titres ≥ 16 px en casse mixte ; `--mono`/`FONT_LABEL` → IBM Plex Mono 500 (déjà chargée) pour toutes les capitales et corps < 13 px ; **12 px minimum** (11 px pour les compteurs `tabular-nums`) ; letter-spacing ≤ 0,12 em sous 13 px. *Décision de Tom : identité visuelle choisie le 05/11.* Variante si Bold Frame est gardée partout : supprimer `text-transform: uppercase` (le « r » bas de casse est sans ambiguïté) + 12 px minimum | `fonts.ts:16-18`, `fonts.css`, `style.css` (73 sélecteurs) | ½ j |
| 1.8 | Polices préchargées = celles du premier écran (Bold Frame ×3 + Matcha + Plex 400/500) ; Fraunces (67 Ko) sortie du jeu, chargée par `duelSummon` seul | `vite.config.ts:149-153`, `art/index.ts:2-5` | 20 min |

### Vague 2 — fluide et froid (≈ 1,5 j)

| # | Action | Fichiers | Effort |
|---|---|---|---|
| 2.1 | **Warm hors écran des vrais pipelines MRT** (visionneuse + ouverture PC) comme `duelSummon.ts:778-789` (RenderTarget 4×4) ; supprimer `TARGET_PRECOMPILE`/`compilePassAsync` (90 lignes) | `viewer.ts:245`, `opening.ts:2201-2213`, `post.ts:95-186` | 1 h |
| 2.2 | Boucles au repos : `setAnimationLoop(null)` quand `dimmed && !current` (attention `reviveSurface`) ; `diag.ts` lancé seulement dans les scènes `WATCH` ; fil Gros tirages en animation CSS `translateX` ; vitrine : rendu à la demande après 10 s sans geste ; visionneuse et éventail posé à 30 i/s ; gyroscope coupé sur les pages DOM | `shell.ts:303-376`, `diag.ts:75-88`, `bigPulls.ts:276-298`, `opening.ts:2537`, `viewer.ts:266-286`, `shell.ts:128` | 3 h |
| 2.3 | DPR natif visionneuse + phases `shown`/`done`, `samples: 2` téléphone, bloom ¼ dans `duelSummon` (actuellement ½) | `shell.ts:145-171`, `post.ts:13`, `duelSummon.ts:759` | 2 h |
| 2.4 | Visionneuse : textures 1,25 pour le zoom ×1,6 (borner à 1,0 si `deviceMemory ≤ 4`), envoi 2 textures par image | `viewer.ts:132-140` | 1 h |
| 2.5 | Collection : `contain-intrinsic-size: auto 114px 159px`, aperçu `.art` retiré quand `img.real` est décodée (−25 Mo de bitmaps/page), `preloadThumbs(page)` retiré sur téléphone (l'IntersectionObserver suffit), `drop-shadow` → ombre peinte, pagination 2×30 avec `scheduler.yield`, `will-change` seulement pendant `grid.swap` | `style.css:298,300,334`, `cardImages.ts`, `collection.ts:806-813,973`, `preload.ts:40-56` | 2 h |
| 2.6 | Holo : clearcoat seulement ≥ 4★, normal map précalculée à la place de `bumpMap(masks.g)` (−3 lectures/pixel, −25 % du poste GPU n°1) ; halo additif sur un disque (−50 % de remplissage) ; passe sans MRT en vitrine `lite` | `holo.ts:178-180`, `opening.ts:2053-2058, 2164` | 3 h |
| 2.7 | Mise en page en pixels entiers : hauteur de tuile, pilules d'en-tête, centrages `translate(-50%)` | `style.css:298,407`, `shop.ts:309,1483` | 2 h |

### Vague 3 — léger et robuste (≈ 2,5 j)

| # | Action | Fichiers | Effort |
|---|---|---|---|
| 3.1 | **Catalogue hors du premier écran** : index de build (compteurs, libellés, couleurs des sous-thèmes ≈ 8 Ko br) + JSON par thème à la demande (`ensureCatalog`) ; les 5 cartes tirées renvoyées complètes par le serveur (`packOpens.cards` porte déjà `cardName`/`themeId`) → **−780 Ko fil (−55 %), −3 Mo à analyser, −28 Mo de tas, −0,5–0,9 s au démarrage**. Variante ½ j : `import()` des 4 gros sets attendus dans `boot()` (−0,3–0,5 s, 0 Ko) | `themes.ts:24-30,219,308`, `shop.ts:10`, `opening.ts:86`, `cardFace.ts:7`, `preload.ts:3`, `main.ts:761`, scripts `make-*.py` | 1 j |
| 3.2 | **Sources d'illustration ≥ 720 px** pour Pop/Pokémon (re-collecte via `harvest-*`, sinon upscale hors ligne Real-ESRGAN/lanczos — jamais dans le navigateur) + taille `mid/` 768 px WebP q82 dédiée à la 3D ; inventaire `art-sizes.json` par `make-thumbs.mjs` | R2, `scripts/make-thumbs.mjs`, `images.ts` | collecte + 1 h |
| 3.3 | Convex au repos : table `presence` séparée (le doc `users` n'est plus patché toutes les 35 s) ; `users.friends` sans `lastSeenAt` (≈ 8 Mo/h et radio jamais au repos avec 20 joueurs) ; `feed.recent` retiré ; abonnements d'en-tête compactés en `header.badges` ; `myCollection` en tuples compacts ou doc par joueur (345 Ko → 60 Ko à chaque booster) | `convex/users.ts:113-157`, `economy.ts:57-60`, `inventory.ts:5-16`, `client.ts:260-419` | 1 j |
| 3.4 | Service worker (`vite-plugin-pwa`, `registerType: 'prompt'`, premier écran seulement ≈ 700 Ko après 3.1, images `CacheFirst` bornées) + `public/404.html` (Pages renvoie aujourd'hui **200 HTML** pour un chunk disparu) + `version.json` → toast « Nouvelle version · Relancer » ; `?v=<empreinte>` sur les images → `immutable` | `vite.config.ts`, `functions/art/[[path]].js:32`, `themes.ts:425`, `main.ts:813-887` | ½ j |
| 3.5 | CSS par vue (−20–25 Ko br au premier écran) ; `subjects.ts` du labo hors du bundle jeu ; filet mémoire : baisser `artScale` d'un cran sur `onCanvasPressure`, pas de peinture de vignettes pendant une ouverture | `style.css`, `art/index.ts:10`, `canvas.ts:34-60`, `cardImages.ts` | ½ j |

### Vague 4 — premium (≈ 1,5 j)

| # | Action | Fichiers | Effort |
|---|---|---|---|
| 4.1 | **Barre d'onglets en bas** (5 entrées + « Plus »), en-tête réduit à 44 px → `--top` de 93 à ≈ 48 px, +45 px de contenu, la 3D n'est plus masquée par 2 rangées (Pocket/Snap/Balatro : navigation au pouce) | `main.ts:213-245`, `style.css:657,1610-1617` | 1 j |
| 4.2 | Cibles tactiles 44 px (pilules 36 px, chips 34 px, curseur volume 4 px, onglets 40 px) via `::before` étendu | `style.css:2631,1610,402,1968` | 1 h |
| 4.3 | Durées en jetons `motion.ts` (39 transitions + 92 animations en dur, `games.css` sans aucun jeton) ; `view-in` sur le contenu seulement, `opacity` sans translate | `style.css`, `games.css`, `motion.ts:103-121` | 2 h |
| 4.4 | Backdrop-filter PC : garder 3 (`.topbar` quand `.stuck`, `.pack-sheet`, `.gm-modal-veil`), supprimer 11 (2–4 ms/image sur portable) ; `.filters.stuck` et `.to-top` en fond opaque | `style.css:77,861,894,387,390` | 30 min |
| 4.5 | Haptique d'interface (`haptics.pulse(6)` au changement d'onglet et `pushLayer`), états pressés génériques `:active { scale(.98) }`, squelettes génériques, vides avec pictogramme + CTA, toast 13 px avec « Réessayer », jetons de rayons/ombres (11 rayons et 9 ombres aujourd'hui), gris `--ink-3` → `#9a8d80`, désactivé à 0,6, texte de rareté en `--ra` | `main.ts:836`, `ui.ts:196,417-449`, `style.css` | ½ j |
| 4.6 | Rotations de bitmaps/texte retirées (`.ps-thumb img`, `.sl-art img`, `.al-soon`), `drop-shadow` permanents retirés, fermeture de la fiche booster par glissement, paysage téléphone (`--sw` en vh ou `orientation: portrait` dans le manifest), tone mapping : clé 1,0 / env 0,8 en visionneuse (blanc du papier < 0,8 linéaire), grain du fond figé | `style.css:902,926,1086`, `packSheet.ts`, `renderer.ts:100`, `stage.ts:29` | 2 h |

---

## 4. Mesures à faire sur un vrai téléphone (avant / après chaque vague)

1. **Netteté** : `renderer.domElement.width / innerWidth` (2 → 3 en visionneuse) ; capture native d'une carte en visionneuse : hauteur de capitale ≥ 24 px physiques par ligne, blanc du nom ≥ 240/255 ; `[...document.querySelectorAll('.tile img.real')].map(i => i.naturalWidth / (i.clientWidth * devicePixelRatio))` ≥ 1 ; lire « CONTRATS », « RARE », « JEUX » sur une capture ×3.
2. **Repos** : page Succès 5 s → Layout/s (≈ 60 → ≈ 0) ; boutique 60 s → part « Idle » > 90 %, rAF/s 0–20 ; iPhone Pro : Core Animation FPS ≈ 0 au repos.
3. **À-coups** : première ouverture de la visionneuse et première révélation 5★ → plus de tâche > 50 ms ; changement de page boutique → collection ×5 → durée du gel.
4. **Démarrage** : cache vidé, 4G réelle et « Slow 4G » → octets transférés (objectif ≤ 650 Ko) et temps jusqu'à « c'est prêt » (< 2,5 s en 4G correcte) ; retour après 10 min en arrière-plan (< 1,5 s après SW).
5. **Mémoire** : ouverture ×10, Safari Timelines Memory/GPU → pic < 350 Mo, console sans « mémoire des canvas saturée » ; collection : Memory « Images » ≈ 15 Mo pour 60 tuiles.
6. **Réseau** : trames WS `convex.cloud` au repos avec ≥ 5 amis (objectif < 10 / 5 min) ; taille de `myCollection` après un booster ; doublons d'URL `thumbs/`.
7. **Batterie / chauffe** : 10 min boutique immobile (`dumpsys batterystats` / Instruments Energy) ; 5 min de visionneuse à DPR 3 : cadence à t = 0 et t = 5 min.
8. **WebGL2** (`?backend=webgl`) sur Android : cadence de l'ouverture avec `samples: 4` vs `2`.

---

## 5. Ce que le 03/11 avait déjà réglé (ne pas refaire)

Images dédoublonnées, préchargement du backend, `touch-action`, `content-visibility`, zones sûres, champs à 16 px, `overscroll-behavior`, backdrop-filter coupés sur téléphone (`pointer: coarse`), reconnexion/veille solides, audio suspendu au silence, GSAP sans boucle infinie, `trackTimestamp` coupé sur téléphone.

## 6. Décisions qui reviennent à Tom

- **1.7** : police de libellé (Plex Mono pour les capitales / petits corps) ou Bold Frame partout sans capitales — c'est l'identité visuelle.
- **3.2** : re-collecter les sources Pop/Pokémon (long) ou upscale hors ligne (rapide, moins fidèle).
- **4.1** : barre d'onglets en bas (1 jour, change l'ergonomie).
- **2.3** : accepter MSAA ×2 sur téléphone en échange du DPR 3.

---

## 7. État d'avancement (06/11, soir) — commit `b6d800d`

Tom a demandé de tout corriger sauf les illustrations (3.2) ; l'optimisation mobile pure (vague 3 et boucles) est reportée.

**Fait** : 1.1 → 1.8 (flicker, blur du canvas, textes des cartes et du booster, biais de mip, vignettes selon l'écran + design « mini », fil Gros tirages, **Inter** pour les libellés, polices préchargées), 2.1 (warm des pipelines de la visionneuse), 2.3 (DPR natif en visionneuse via `Experiment.dprCap`, MSAA ×2 téléphone), 2.4 (textures ×1,25 au zoom, envoi 2/image), 2.5 partiel (aperçu retiré après décodage, `contain-intrinsic-size` réel), 2.7 partiel (hauteur de tuile entière), 4.2 (cibles 44 px), 4.3 (jetons de durée, `games.css`), 4.4 (backdrop-filter PC), 4.5 (haptique onglets/panneaux, états pressés, gris, désactivé, chiffres tabulaires), 4.6 partiel (rotations retirées, drop-shadow des icônes, grain figé), `public/404.html`.

**Reporté** : 2.2 (boucles rAF au repos, fil en CSS, vitrine à la demande), 2.6 (holo allégé, halo sur disque), 2.3 pour l'ouverture (phases `shown`/`done` à ×3 — `opening.ts` est travaillé par une autre session), 3.1 catalogue, 3.3 Convex, 3.4 service worker + `version.json`, 3.5, 4.1 barre d'onglets en bas, 4.6 tone mapping (à mesurer d'abord), fermeture de la fiche par glissement, paysage téléphone.

**À vérifier sur téléphone** : `renderer.domElement.width / innerWidth` = 3 en visionneuse ; lisibilité des libellés en Inter ; vignettes nettes (`naturalWidth / (clientWidth × dpr)` ≥ 1) ; pas d'à-coup au premier zoom ; cadence en visionneuse à ×3 (l'adaptatif redescend à 2,75/2,5 si besoin, message `[jeu] appareil un peu juste` dans la console).
