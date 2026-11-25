# Audit 06/11 — agent n°2 : interface DOM/CSS, sensation premium, typographie, motion, fluidité perçue

Lecture seule sur `/home/claude/h2` (commit 0014d4d). Mesures Playwright (Chromium 1243 headless, SwiftShader) sur le serveur Vite `http://127.0.0.1:5397/jeu/?demo` (mode démo local, collection remplie par 12 `preparePack`/`revealPack` → 60 cartes), deux appareils émulés :
- **iPhone** 390×844, DPR 3, tactile (`pointer: coarse`) — captures `m-*.png`, données `data-m.json`, `dyn-m.json` ;
- **PC** 1920×1080, DPR 1 — captures `pc-*.png`, données `data-pc.json`.

Limites : pas d'illustrations dans cette copie (`public/` vide → 403 sur `art/**`), donc les tuiles sont peintes en « design typographique » ; les textures 3D manquent aussi. Les temps d'image du GPU logiciel ne valent rien en absolu (boutique ≈ 900 ms/image sous SwiftShader) : seuls les **compteurs du moteur** (`Performance.getMetrics` : LayoutCount, RecalcStyleCount, durées script/style/layout) et les mesures DOM (`getComputedStyle`, `getBoundingClientRect`, `naturalWidth`) sont exploités ici. Les pages 100 % DOM (collection, succès, échanges…) tournent elles à 60 i/s même sous SwiftShader, donc leurs chiffres de défilement sont parlants.

Les constats « déjà trouvés le 06/11 » (3D à la résolution écran, texte dans la texture, 33 backdrop-filter listés) ne sont pas répétés ; ils sont **qualifiés** (lesquels des 33 comptent vraiment, et où).

---

## 1. Netteté de l'interface

### N-01 — P0 — Bold Frame en capitales : « R » lu comme « A », « X » comme « H » (toute l'interface)
- **Fichiers** : `src/core/fonts.css:12-14` (`font-family: 'Bold Frame'` pour les graisses 100-1000, `size-adjust: 108%`), `src/core/fonts.ts:16-18` (`FONT_TEXT`, `FONT_LABEL` = Bold Frame), `src/game/style.css:84` (`.topbar nav a … text-transform: uppercase; font: 500 12px var(--mono)`), `:933` (`.ps-bt`), `:941` (`.ps-bn`), `:287` (`.sum-title`), `:207` (`.hud-count`), `:210` (`.hud-hint`) — toutes les étiquettes `uppercase`.
- **Ce qui se passe** : Bold Frame One (graisse 500-600) dessine le **R majuscule sans jambe lisible** et le **X comme un H** à moins de ~14 px. Preuves à la résolution native du téléphone (`crop-nav-R.png` tiré de `m-shop.png`) : l'onglet « CONTRATS » se lit « CONTAATS », « JEUX » se lit « JEUH » ; dans la fiche booster (`crop-rare.png`, `m-packsheet.png`) « RARE » se lit « AAAE », « CHANCES PAR CARTE » → « CHANCES PAA CAATE ». Même chose sur PC (`pc-shop.png`, nav). Mesure : 547 des 557 éléments texte visibles sur téléphone sont en Bold Frame (`data-m.json → fonts`), dont 73 sélecteurs distincts sous 12 px.
- **Pourquoi ça nuit** : c'est LE facteur « rien n'est net » côté DOM : l'œil bute sur des mots mal formés, l'interface paraît floue même quand les pixels sont nets. Premium ↓, lisibilité ↓.
- **Correction** : (a) réserver Bold Frame aux titres ≥ 16 px en casse mixte (où le R se lit : « Pop Culture Pack » est net) ; (b) pour toutes les **étiquettes en capitales et les petits corps (< 13 px)**, basculer `--mono` sur une police de libellé lisible (IBM Plex Mono déjà chargée via `@fontsource`, graisse 500, ou Inter/DM Sans) : dans `fonts.ts` passer `FONT_LABEL = '"IBM Plex Mono", …'` et retirer Bold Frame de `--mono` ; (c) si Tom tient à Bold Frame partout : supprimer `text-transform: uppercase` des libellés (casse mixte → le « r » bas de casse est sans ambiguïté) et remonter le corps minimal à 12 px. Coût nul en GPU ; risque : identité visuelle (à valider avec Tom, c'est son choix du 05/11). `FONT_VERSION` (`fonts.ts:12`) doit changer si les cartes peintes suivent.
- **Vérifier** : sur téléphone, lire à voix haute les onglets et les libellés de la fiche booster sans les connaître ; capture ×3 d'un mot contenant R/X.

### N-02 — P0 — Cartes peintes 276 px affichées sur 342 px physiques : flou + micro-textes illisibles dans la grille
- **Fichiers** : `src/game/cardImages.ts:21` (`SCALE = 0.36 // 276 × 386 px : net dans une tuile de ~130 px en DPR 2–3`), `:141` (`toBlob('image/webp', 0.86)`), `src/game/style.css:330` (`.tile img.real { width:100%; height:100%; object-fit: cover }`), `:407` (`grid … minmax(112px, 1fr)` ; sur téléphone la grille mesurée est `114px 114px 114px`).
- **Mesure iPhone** (`coll.cjs`, `m-grid.png`) : tuile `114 × 159.234` px CSS → image `112 × 157.2` px CSS = **336 × 472 px physiques** pour une bitmap de **276 × 386** : ratio 0,82 → **agrandie ×1,22** (bilinéaire) ; en DPR 3 le commentaire « net en DPR 2–3 » est faux. Les textes peints dans la carte (numéro « 189 / 1919 », « ACTEURS & ACTRICES », étoiles) font **~3 px CSS** (8–9 px physiques, voir `crop-tiles.png`) : illisibles, ils ne font que du bruit gris. Sur PC (DPR 1) la même bitmap est réduite ×0,41 : textes idem illisibles.
- **Pourquoi** : la grille est l'écran le plus regardé après l'ouverture ; une vignette floue sur un écran ×3 casse la promesse « net ».
- **Correction** : (a) `SCALE` dépendant de l'écran : `Math.min(0.6, Math.ceil(tileCssWidth * devicePixelRatio / 768 * 20) / 20)` → 0,45 en DPR 3 pour 114 px (346 px ≥ 342), 0,36 reste en DPR 2 ; mettre la valeur dans la clé de cache (`:88` l'inclut déjà) ; coût : +56 % de pixels peints (≈ 8–20 ms par carte, déjà étalé en idle) et ≈ 30 Ko/webp au lieu de 20 ; (b) **ne pas peindre** les micro-textes (numéro, sous-thème, artiste) quand `scale < 0.5` : option `minimal: true` dans `generateCardArt` (`src/core/art`) et les mettre dans le DOM (`.tile .meta`, `:302`, déjà présent mais caché par `.real-on`, `:334`) ; (c) `image-rendering: auto` conservé, mais ajouter `decoding="async"` sur `img.real`.
- **Vérifier** : `naturalWidth / (clientWidth × devicePixelRatio) ≥ 1` sur l'iPhone ; nom de la carte net au zoom ×3 d'une capture.

### N-03 — P1 — Fil « Gros tirages » (téléphone) : tuiles tournées jusqu'à ±7°, réduites ×0,88, texte 7–8 px, image 55 px pour 144 px physiques
- **Fichiers** : `src/game/views/bigPulls.ts:42-44` (`FAN_POP 0.3`, `FAN_TILT 7`, `FAN_SHRINK 0.12`), `:187` (`style.transform = translate3d(…%) rotate(…deg) scale(…)`), `src/game/style.css:1985` (`.shop-home .bp-item { width: 78px; … will-change: transform, opacity }`), `:1987` (`.shop-home .bp-badge { font-size: 7px }`), `:1991` (`.bp-user 9.5px`), `:867` (`.bp-badge 7.5px`), `:2281` (PC : `.shop-right .bp-item … will-change: transform, opacity`).
- **Mesure** (`dyn-m.json → bigPulls`) : `matrix(0.863, 0.171, …)` = rotation **11,2°** (`FAN_TILT 7 × d`, `d` borné à ±1,6) et échelle **0,88** ; tailles de police calculées **7 / 8 / 8 px** ; `<img>` de 55 px naturel affichée sur **144 px physiques** (×2,6). Permanence de `will-change` sur 6–8 éléments → 6–8 couches GPU de 78×110 px ×3 (≈ 0,8 Mo chacune) gardées en mémoire. Capture `crop-bigpulls.png` : tout est flou (rotation + échelle sur du texte rastérisé à 1×).
- **Pourquoi** : c'est le premier élément à gauche de la boutique ; il donne le ton « flou » dès l'arrivée. Mémoire GPU inutile sur téléphone.
- **Correction** : téléphone : supprimer rotation et échelle (`FAN_TILT = 0`, `FAN_SHRINK = 0` quand `pointer: coarse`), ne garder que l'opacité ; porter `.bp-badge` à 9 px et `.bp-user` à 11 px ; retirer `will-change` (`:1985`, `:2281`) — les transforms sont déjà promus pendant le défilement ; servir l'avatar/miniature à ≥ 2× (`loadCardImage` avec la miniature WebP plutôt que le `thumb` 55 px). Si l'éventail est conservé sur PC, le limiter à ±3° et ne pas mettre à l'échelle le texte (mettre `rotate` sur `.bp-card` seulement).
- **Vérifier** : `getComputedStyle(.bp-item).transform === 'none'` sur téléphone ; capture ×3 du pseudo lisible.

### N-04 — P1 — 73 sélecteurs sous 12 px sur téléphone, dont 10 px en masse (31 % des textes visibles)
- **Mesure** `data-m.json` (textes visibles, toutes pages) : 330 textes < 12 px sur 557 ; distincts les plus fréquents : `.vol-mute / .vol-hap / .vol-n` 10 px (`style.css:1968-1969`, présents sur chaque page via le panneau son), `b.pt-n` 10 px (`:1001`), `.me .packs .p-n` 11 px (`:112`), `.tile .meta` 9 px et `.stars` 8 px (`:302-303`), `.bp-badge` 7 px, `span.sc-tier` 9 px (`:1422`), `.sc-cos` 9,5 px (`:1435`), `.ct-tp` 9,5 px (`:1161`), `.ct-th` 10 px (`:450`), `.lb-you` 8,5 px (`:1387`), `.ps-bn` 9 px (`:941`), `.ps-bt` 10 px (`:933`), `.sum-title` 10 px (`:287`), `.sum-prog` 10,5 px (`:236`), `.hud-count` 11 px (`:207`), `.hud-hint` 11 px (`:210`), `.v-hint` 10 px (`:434`), `.v-pos` 10 px (`:428`), `.tap-hint` 10,5 px (`:2594`), `.eyebrow` 10 px avec `letter-spacing 0.35em` (`:444`), `.l-txt` 11 px / 0,25em (`:69`). PC : 68 sélecteurs, mêmes familles.
- **Pourquoi** : sous 11 px en Bold Frame (voir N-01), la graisse 400 tombe à 1 px de fût : gris au lieu de blanc. Pocket/Snap n'ont **aucun** texte sous 11 pt et leurs libellés sont en casse mixte.
- **Correction** : règle globale : **12 px minimum** pour tout texte porteur de sens, 11 px pour les compteurs numériques en `tabular-nums` ; supprimer `letter-spacing ≥ 0.2em` sous 12 px (`.eyebrow 0.35em`, `.ct-pick-t 0.3em`, `h3 0.3em`, `legend 0.25em`, `.ob-lbl 0.2em`, `.sg-* 0.2em`, `.hud-count 0.4em`, `.mv-kicker 0.5em`) → 0,08–0,12em et taille 12 px : l'espacement large était là pour compenser une police étroite ; avec N-01 il devient inutile. Coût nul.
- **Vérifier** : script `audit.cjs` (section `small`) doit rendre 0 ligne < 11 px.

### N-05 — P1 — Mise en page sur demi-pixels : tuiles de 159,234 px, en-tête à 93 px mais pilules à y = 8,0/11,0 et x = 91,28 / 265,22
- **Mesure** (`data-m.json → halfPx`, 20 éléments par page sur téléphone) : `.coin-btn` left 91,28 px ; `.pt-cnt` left 265,22 ; `.vol-mute` top 248,88 ; tuiles de la grille top 560,781 et hauteur 159,234 (`aspect-ratio: 63/88` sur 114 px, `style.css:298`) ; sur PC `.sl-ph`/`.sl-art img` tournés de −3°.
- **Pourquoi** : en DPR 3 un bord de 1 px (`border: 1px solid var(--line)`) posé à 0,78 px est rendu sur 2 rangées de pixels atténuées : le liseré « premium » devient un trait sale. Les textes dans les éléments en `translate(-50%)` (`.toast :571`, `.summary :231`, `.card-info :217`, `.fb` badges `shop.ts:1483`, `.tap-hint` `shop.ts:309`) tombent sur une demi-position quand la largeur est impaire.
- **Correction** : (a) grille : `aspect-ratio` → hauteur entière par `grid-auto-rows: calc(round(up, var(--tile-w) * 88 / 63, 1px))` ou poser `--tile-w` en JS (`Math.floor(w)`) ; (b) flex `gap` et `padding` de l'en-tête en valeurs entières, `margin-left: auto` remplacé par un `justify-content` qui n'engendre pas de fractions (ou `translate: 0.5px` ciblé) ; (c) pour les éléments centrés, calculer `left = round((vw - w)/2)` en JS (déjà fait pour `.fb` sauf le `translateX(-50%)` final : remplacer par `−round(w/2)` mesuré une fois). Coût nul.
- **Vérifier** : `getBoundingClientRect().left * devicePixelRatio % 1 === 0` sur les pilules de l'en-tête et la 1re tuile.

### N-06 — P2 — Rotations décoratives de bitmaps et de texte
- `style.css:902` (`.sl-art img … transform: rotate(-3deg)` PC), `:926` (`.ps-thumb img rotate(-3deg)` fiche booster, visible sur `m-packsheet.png`), `:906` (`.sl-seal … rotate(-12deg)`, texte), `:1086` (`.al-soon rotate(-10deg)`, texte 1,5 px de bord), `:863` (`.bp-card:hover rotate(-1deg)`).
- Un bitmap tourné de 3° est ré-échantillonné bilinéairement : bords crénelés/flous sur le booster de 84 px ; un texte tourné de 10–12° perd le hinting. Les apps de référence tournent des **formes** (ombres, lueurs), jamais des bitmaps nets ni du texte sous 14 px.
- **Correction** : rotation 0 sur `img`/texte ; si l'inclinaison est voulue, l'appliquer à l'ombre portée (`::after`) ou servir une image déjà tournée en 2× ; `.sl-seal`/`.al-soon` : garder la rotation mais passer à 12 px graisse 600 et `transform-origin` entier.

### N-07 — P2 — Icônes : SVG inline partout (bien), mais `filter: drop-shadow` permanent sur 9–23 éléments par page
- `data-m.json → flt` : 9 (boutique) à 23 (succès PC) éléments visibles avec `filter: drop-shadow(...)` : `.me .packs .p-ico` (`style.css:98`), `.tile .art img` (`:300`), `.bp-art img` (`:864`), `.l-logo` (`:66`, écran de chargement : `drop-shadow` + `background-clip:text` + animation `name-shine` infinie pendant tout le téléchargement).
- Un `filter` crée une surface intermédiaire par élément et la ré-échantillonne ; sur une icône de 14 px la lueur est invisible mais la surface coûte. Remplacer par une ombre dans le SVG lui-même (`<feDropShadow>` non — un second `<path>` décalé en opacité) ou simplement la retirer.

### N-08 — P2 — Gris et états : contrastes WCAG calculés (`--bg #0b0908`, `--panel-solid #171311`)
- `--ink-3 #8b7f73` : 5,09:1 sur le fond, **4,73:1 sur un panneau** (limite AA 4,5) — acceptable à ≥ 12 px, insuffisant aux 9–10 px où il est utilisé partout (`.muted :156`, `.ps-bt`, `.sum-title`, `.hud-count`…).
- `button:disabled { opacity: .45 }` (`style.css:37`) : texte à **1,9:1** (ex. « EN RECHARGE » `m-packsheet.png`).
- `.tap-hint` `--ink-2` à `opacity .62` (`:2594`) : **3,9:1** à 10,5 px capitales espacées.
- Couleur de rareté **épique `rgb(181,52,79)`** utilisée comme couleur de texte : **3,2:1** sur panneau (`.chip` 11 px `:402`, `b` 16 px dans contrats, `.ob-ts` 9,5 px) ; rare bleu `rgb(76,124,194)` 4,45:1.
- **Correction** : `--ink-3` → `#9a8d80` (≈ 5,9:1) ; état désactivé : `opacity: .6` + fond plus sombre plutôt que 0,45 ; texte de rareté : utiliser `--ra` (variante claire) pour le texte, `--rc` pour les liserés seulement (déjà le cas sur `.ci-r :224`).

### N-09 — P2 — `will-change` permanents
- `style.css:265` `.fb` (badges d'éventail, OK : vie courte), `:1985`/`:2281` `.bp-item` (permanent, voir N-03), `:2566` `.packs-row.wheel .sleeve` (roue 3D : 5–6 pochettes de 128×243 px ×3 → ≈ 5 Mo de couches gardées même quand la roue HTML est invisible sous la 3D, `.wheel.gl … opacity: 0 !important` `:2588`), `:2585` `.wheel-dial i`.
- Mesure : 13 éléments visibles avec `will-change` sur la boutique téléphone (`data-m.json → shop.wc`).
- **Correction** : poser `will-change` par JS pendant le geste (pointerdown → pointerup + 300 ms) et le retirer ensuite ; en mode `.wheel.gl` le retirer complètement.

---

## 2. Sensation premium

### P-01 — P1 — Hiérarchie typographique : 3 niveaux seulement, et le niveau « libellé » porte tout le texte
- Niveau 1 : Matcha World (10 éléments visibles au total : logo, `h1`), niveau 2 : Bold Frame 15–46 px casse mixte (lisible, joli), niveau 3 : Bold Frame 9–12 px capitales espacées (illisible, voir N-01/N-04). Les corps de paragraphe (`.ct-head p` 14 px `:443`, `.ps-desc` 12 px `:928`, `.ps-facts` 11 px `:929`) sont dans une police d'affichage (Bold Frame est un « display face »), pas une police de lecture.
- Ce qui fait « premium » chez Pocket/Snap : une **police de lecture** neutre et nette pour tout ce qui informe (corps 13–15 px, chiffres tabulaires), une police d'affichage réservée aux titres et aux moments forts, et une **échelle** régulière (11 / 13 / 15 / 18 / 24 / 34).
- **Correction** : échelle en variables (`--fs-1: 11px … --fs-6: 34px`) et audit mécanique : interdire `font: … <12px` hors `--fs-1` ; `--title` = police de lecture (Plex Mono 400/500 ou une sans-serif), `--display` = Bold Frame Two + Matcha pour les titres. Coût : refonte CSS d'une demi-journée.

### P-02 — P1 — Les 33 `backdrop-filter` : lesquels garder
- Mesurés **visibles** : téléphone **0** (la règle `@media (pointer: coarse)` `style.css:820-825` les coupe — bien) ; PC boutique **14** en même temps au-dessus du canvas 3D qui se redessine à chaque image : `header.topbar` blur(10) sur **107 520 px²** (`:77`), 5 × `.sleeve` blur(8) 26 218 px² (`:894`), 8 × `.bp-item` blur(6) ≈ 30 700 px² (`:861`) ; collection PC : `.topbar` + `.cards-bar.stuck` blur(12) 67 100 px² (`:387/:1491`).
- Coût PC : 14 passes de flou par image (chacune lit la zone sous l'élément, déjà rendue, la floute en 2 passes séparables) ≈ 0,5 Mpx floutés par image : sur un portable à GPU intégré c'est 2–4 ms/image en plus du rendu 3D — pour un effet que personne ne voit sur un fond noir uni à 90 % (la 3D sous l'en-tête est quasi noire, cf. `pc-shop.png`).
- **Garder** (3) : `.topbar` sur PC uniquement quand quelque chose défile dessous (ajouter la classe `.stuck` par IntersectionObserver comme `.filters`), `.pack-sheet` PC (`:919`, panneau unique), `.gm-modal-veil` (`games.css:231`, modale). **Supprimer** : `.sleeve` (fond `var(--panel)` 0,86 suffit), `.bp-item`, `.qty :190`, `.hud-skip :198`, `.card-info :217`, `.summary :231` (ils sont déjà opaques à 0,78–0,86), `.to-top :390`, `.user-menu` n'en a pas (bien), le reste des 33 est dans des règles hors écran (`src/style.css` du labo, `duelSummon.ts`).
- **Vérifier** : `data-pc.json → shop.bf` doit tomber à ≤ 2.

### P-03 — P1 — Transitions : 33 durées en dur dans `style.css` + 6 dans `games.css` contre 102 jetons, et 92 `animation:` toutes en dur
- Jetons définis `src/core/motion.ts:20-33` et posés `:103-121` (`--dur-rapide 150/120`, `--dur-standard 250/200`, `--dur-emphatique 400/320`). Hors-jeton : `transition: opacity 0.6s` (×3, `:434`, `:275-276`), `width 0.9s/0.8s/0.6s` (barres `:116`, `:238`, `:373`, `:939`), `transform 0.9s` (`:341`), `background 0.4s/0.5s`, `filter 0.3s`, `box-shadow 0.35s` ; `games.css` n'utilise **aucun** jeton (`transition: … 0.2s/0.3s`). Les 92 `@keyframes` (durées 0,3 à 40 s) ne lisent pas les jetons : `.view-in 0.38s` (`:161`) alors que `--dur-emphatique` vaut 400/320 ms.
- Conséquence : sur PC l'entrée de page (380 ms) est plus lente que les panneaux (320 ms) ; sur téléphone une barre de progression (900 ms) est plus lente que la cérémonie 3★ (`TIER_BEAT[2].flip 0.52 s`). Ça se ressent comme « mou ».
- **Correction** : (a) remplacer les 39 durées en dur par les jetons (les barres : `--dur-dramatique` à définir = 900 ms, cohérent avec `DUR.dramatique`), (b) `animation-duration` des entrées (`view-in`, `rise`, `sum-in`, `grid-in`, `badge-in`, `pop`) → `var(--dur-emphatique)` / `var(--dur-standard)`, (c) `games.css` : importer les jetons. Coût nul ; risque nul.

### P-04 — P1 — Propriétés animées coûteuses
- `transition: width` sur les barres (`.p-bar i :373`, `.ps-bb i :939`, `.sum-prog i::after :238`, `.me .packs .p-bar > i` est en `transform` — bien) → **layout + peinture à chaque image** pendant 600–900 ms. Remplacer par `transform: scaleX()` avec `transform-origin: left`.
- `@keyframes` animant `box-shadow` (repeinte à chaque image, non composité) : `bp-live` **infini** (`:856`, point rouge « live » dans le fil, visible en permanence sur la boutique PC), `bp-secret` infini (`:883`), `pack-gain`, `bp-flash`, `side-hint`, `coach-hold`, `games.css` `cal-glow`, `landed`, `gm-armed`. Les infinis se remplacent par un pseudo-élément en `opacity`/`transform` (comme `breathe-glow :182`, déjà bien fait pour `.open-btn`).
- `mv-pulse` anime `letter-spacing` (`:279`) : re-mise en forme du texte à chaque image pendant le moment 6★ (le plus chargé). Remplacer par `transform: scaleX(1.03)`.
- `bp-spin` anime la propriété personnalisée `--bp-a` d'un `conic-gradient` (`:876-882`, `.pf-ava-wrap.frame-mythic::before :1270`) : **main thread + repeinte à chaque image, infini** (mesuré : 4 animations `bp-spin` actives sur la boutique téléphone, `dyn-m.json → anims`). Remplacer par un `::before` en `conic-gradient` fixe qui tourne en `transform: rotate()` (composité) sous un masque.
- `canvas.gl.dim { filter: blur(6px) saturate(.7) }` avec `transition: … filter 400ms` (`:58-59`) : à **chaque changement de page**, 24 images de flou plein écran **1170×2532** sur le canvas (sigma 18 px physiques) — exactement pendant l'animation `view-in`. La page pose par-dessus un dégradé 0,55→0,85 d'opacité (`:351`) sur un canvas à `opacity .22` : la 3D floutée est à ≈ 5 % de visibilité. **Retirer `filter`**, garder `opacity` ; si un flou est voulu, le prendre une fois (`toDataURL` d'une image réduite ×0,25) en `background-image` du `.view`.
- `st-flicker` (`:1003-1005`) : voir F-01.

### P-05 — P2 — États et micro-interactions : solides, deux trous
- Bien : `:active` à 50 ms (`:39`), `:focus-visible` (`:47`), `busyButton` avec roue (`:186-188`), toasts à file et « nudge » (`ui.ts:417-447`), haptique raisonnée (`haptics.ts`, 23 appels, motifs par rareté dans `motion.ts TIER_BEAT.haptic`), pastilles `badge-in` avec ressort, `touch-action: manipulation`.
- Trous : (a) **aucun retour haptique sur les actions d'interface** (changement d'onglet, ouverture de fiche, bascule des filtres) : seuls contrats/collection/fiche booster appellent `haptics.pulse` ; Pocket vibre à chaque onglet (très court, 5–8 ms). Ajouter `haptics.pulse(6)` dans `route()` (`main.ts:836`) quand `changed` et dans `pushLayer` (`ui.ts:196`). (b) `.tile.owned:active { transform: scale(.97) }` existe mais pas d'état pressé sur `.album` (`:1083` : seul `:hover`), ni sur `.ct-tier`, `.tab`, `.seg button`, `.chip` (changement de couleur seulement) : ajouter un `:active { transform: scale(.98) }` générique sur `.tab, .chip, .album, .ct-tier, .seg button`.

### P-06 — P2 — Chargement, vides, erreurs
- Squelette : un seul (`.tile.skel :323`, utilisé 1 fois dans `views/`), les pages lourdes arrivent par `vw-box` + roue (`main.ts:876`, `:1959`) puis **sautent** en place (`view-in` translateY 10 px). Les listes (succès 716 nœuds, échanges, classement) n'ont pas de squelette : au premier affichage l'écran est vide 1 image puis plein. Ajouter 3–4 blocs squelettes génériques (`.skel-row`) dans `waitEl`.
- Vides : `.empty` (`:412`) = texte 13 px centré, pas d'illustration ni d'action ; Pocket met une icône + un bouton. Ajouter un pictogramme SVG + CTA (`« Ouvrir un booster »`).
- Erreurs : `errMsg` (`ui.ts:449`) + `toast('err')` : bien ; le toast tient 12 px (`:571`) → 13 px, et laisser un bouton « Réessayer » dans le toast pour les erreurs réseau.

### P-07 — P2 — Rayons, ombres, couleur : cohérents mais sans système
- 11 rayons différents mesurés dans `style.css` (5, 6, 7, 8, 9, 12, 14, 16, 18, 20, 22, 999). Ombres `0 18px 40px -16px`, `0 30px 80px -30px`, `0 10px 26px -12px`, `0 14px 34px -16px`… (9 variantes). Passer en jetons `--r-s 8 / --r-m 14 / --r-l 20 / --r-pill 999` et `--shadow-1/2/3` ; coût nul, gain : l'œil perçoit la régularité comme « fini ».

---

## 3. Fluidité perçue

### F-01 — P0 — Une animation SVG dans l'en-tête force **un layout complet par image, sur toutes les pages, en permanence**
- **Fichier** : `src/game/style.css:1003` `.me .st-btn.ready .fl { animation: st-flicker 1.6s ease-in-out infinite; }`, `:1005` `@keyframes st-flicker { … transform: scaleY(1.08) translateY(-1px) }` ; la cible est un `<path class="fl">` dans le SVG de la flamme (`main.ts:401`, `STREAK_ICON`).
- **Mesure** (`idle.cjs`, page Succès, 3 s au repos, téléphone) : **169 layouts / 171 recalcs de style / 43 ms de layout + 42 ms de script** en 3 s. Même page, `st-flicker` seul mis en pause : **1 layout, 0,1 ms**. Lors d'un défilement de la collection : 197 layouts pour 173 images ; ouverture d'album : 242 layouts / 238 images. Un `transform` sur un **élément SVG enfant** n'est pas composité par Chromium : chaque image re-calcule le style du document et refait le layout.
- **Pourquoi** : 15–30 ms de travail inutile par seconde sur le fil principal, à chaque page, dès que la série est « prête » (état par défaut une fois par jour) ; sur téléphone c'est la différence entre un défilement à 60 i/s et des images perdues ; et la batterie (le document ne repose jamais).
- **Correction** : animer un `<span class="fl-wrap">` HTML qui contient le SVG (ou le SVG entier) au lieu du `<path>` : `.st-btn.ready svg { animation: st-flicker … }` — composité, 0 layout. Variante : `transform-box: fill-box` n'y change rien, il faut sortir du SVG. Coût 5 min, risque nul.
- **Vérifier** : Chrome DevTools › Performance sur la page Succès au repos : plus de « Layout » violet continu ; `Performance.getMetrics().LayoutCount` stable.

### F-02 — P1 — Trois boucles rAF tournent sur les pages 100 % DOM
- Mesuré (`idle.cjs`) : **120 rAF/s** sur Succès = `update` (boucle `setAnimationLoop` de three, `shell.ts:303-376` : retourne tôt quand `dimmed` mais tourne) + `tick` (`diag.ts:70-88`, boucle de diagnostic permanente, jamais arrêtée) ; `bigPulls.ts:283` s'arrête bien (`idle()`).
- Coût : ~9 ms de script/3 s, mais surtout l'OS ne peut pas descendre la cadence d'écran (ProMotion reste à 120 Hz = batterie) et chaque image réveille le compositeur.
- **Correction** : `renderer.setAnimationLoop(null)` quand `dimmed && !current` et le relancer dans `show()`/`setDimmed(false)` ; `diag.ts` : lancer la boucle seulement quand `shell.active()` correspond à `WATCH` (démarrer depuis `shell.show`).

### F-03 — P1 — Grille de la collection : chaque tuile possédée = 1 `<img>` blob + 10 nœuds cachés (`visibility: hidden`) conservés
- `style.css:334` `.tile.real-on .art, .meta, .name { visibility: hidden }` : les 60 tuiles de la page gardent `.art` (gradient radial), `.q` 34 px, `.meta`, `.stars`, `.name` → **≈ 12 nœuds par tuile, 815 → 1107 nœuds** à l'ouverture d'un album (mesuré), `content-visibility: auto` (`:298`) limite la casse mais le style est tout de même calculé. `contain-intrinsic-size: 120px 168px` (`:298`) ≠ taille réelle 114×159 → saut de 9 px par rangée au défilement rapide (les tuiles hors écran sont plus hautes que les vraies).
- **Correction** : `contain-intrinsic-size: auto 114px 159px` (le navigateur mémorise la dernière taille) ; retirer l'aperçu du DOM une fois `img.real` chargée (`cardImages.ts` : `tile.querySelector('.art')?.remove()` après la transition) ; `img.real` avec `loading="lazy" decoding="async"`.

### F-04 — P1 — Pagination par 60 + « Voir plus » : bien, mais le passage de page réinjecte 60 tuiles d'un coup
- `collection.ts:806-813` : `frag.append(…)` de 60 tuiles + `preloadThumbs` → 1 tâche de ≈ 25–45 ms sur téléphone (mesuré : album open `scriptMs 22,7` + `layoutMs 33,5` sur PC SwiftShader). Découper en 2 × 30 avec `requestIdleCallback`/`scheduler.yield()` ; `grid.swap` (`:409`) anime `opacity .25 → 1` et `translateY(6px)` sur **toute la grille** (60 tuiles + 60 images) : promouvoir avec `will-change: transform, opacity` **le temps de l'animation** seulement (`animationend` → retirer).

### F-05 — P2 — Transition de page : `view-in` sur un `.view` qui contient tout, pendant que le canvas se floute
- `style.css:161-162` `.view.view-in { animation: view-in 0.38s }` (`opacity + translateY(10px)`) sur `position: absolute; inset: 0` = une couche plein écran 1170×2532 ×4 octets ≈ 12 Mo à allouer/peindre au moment où le canvas transitionne `filter: blur` (P-04) et où `shell.show(null)` + `setDimmed(true)` touchent le DOM : les trois se cumulent dans la même fenêtre de 400 ms. Mesuré sur la navigation boutique → collection (téléphone, GPU logiciel) : 2 tâches longues de 930 et 969 ms (`dyn-m.json → navToCollection.long`) ; sur vrai téléphone attendre 60–120 ms de gel.
- **Correction** : retirer le `filter` du canvas (P-04), animer seulement le contenu (`.coll-head, .grid`) plutôt que `.view` entier, ou réduire à `opacity` seul (pas de translate → pas de ré-rastérisation).

### F-06 — P2 — Feuille booster (téléphone) : entrée correcte, mais 121 nœuds + 6 barres `width` animées + image tournée
- `dyn-m.json → sheetOpen` : `.ps-root.in` à 173 px du haut, 671 px de haut, 121 nœuds, `translateY(40px) + opacity` (composité, bien, `:1037`). Les 6 `.ps-bb i { transition: width 0.9s }` (`:939`) démarrent toutes ensemble pendant l'entrée : 54 images de layout. → `transform: scaleX`.
- Pas de **geste de fermeture par glissement** vers le bas (seuls `Escape`, la croix et le voile) : attendu sur une bottom sheet mobile. Ajouter un `pointermove` sur `.ps-head` (seuil 80 px) → `popLayer`.

### F-07 — P2 — Défilement : `scroll-snap` absent des pages (bien), `overscroll-behavior: contain` partout (bien), mais la barre de filtres collante sur PC et le bouton « haut » apparaissent avec `backdrop-filter` + `box-shadow` animée
- `style.css:383` `.filters { transition: background-color, box-shadow }` + `:387 .stuck { backdrop-filter: blur(12px) }` ; `:390 .to-top { animation: rise2 }` + `backdrop-filter`. Sur PC la zone collante 67 100 px² est re-floutée à chaque image de défilement (le contenu sous elle bouge). Remplacer par un fond opaque `rgba(17,13,12,.96)` et un `border-bottom`.
- 60 vs 120 Hz : aucune animation JS n'est liée à la cadence (`dt` borné `shell.ts:306`, `bigPulls` en `dt`) — bien.

### F-08 — P2 — Images paresseuses : `loading="lazy"` seulement sur les couvertures d'album (`collection.ts:571, 636`)
- Les `img.real` des tuiles passent par l'IntersectionObserver de `cardImages.ts` (bien) ; les avatars/miniatures du fil, des échanges et du classement n'ont ni `loading="lazy"` ni `decoding="async"` ni dimensions (`width/height`) → décalages de mise en page (CLS) à l'arrivée des images et décodage synchrone sur le fil principal. Ajouter les trois attributs dans `ui.ts cardTile()` (`:61`) et les gabarits des vues.

---

## 4. Mobile

### M-01 — P1 — En-tête de 93 px + 47 px de zone sûre = 140 px (17 % de l'écran) et pas de barre d'onglets au pouce
- Mesuré iPhone : `--top` = **93 px** posé par `main.ts:213-245` (mesure ResizeObserver ; le repli CSS `:657` dit 130 px — valeur fausse à corriger pour éviter un saut au 1er rendu : elle vaut 93), topbar 2 rangées (pilules + nav défilante avec `.nav-more`). En paysage (`m-landscape-shop.png`) `--top` = 56 px.
- Pocket, Snap, Balatro mettent la navigation **en bas** (zone du pouce, 49–56 px + safe-area) et l'en-tête se réduit à 44 px (monnaie + avatar). Ici les onglets (11 !) sont en haut, à 40 px de haut, 11 px de texte, il faut les faire défiler (`nav-more :1617`). Sur un 390 px, 5 onglets visibles sur 11.
- **Correction** : barre d'onglets fixe en bas à 5 entrées (Boutique, Collection, Échanges, Jeux, Plus) + feuille « Plus » pour les 6 autres ; en-tête réduit à 44 px (pilules) ; `--top` tombe à ≈ 48 px → +45 px de contenu et la 3D cesse d'être masquée par 2 rangées. Coût : 1 jour (CSS + `main.ts` nav + `placePill`).

### M-02 — P1 — Cibles tactiles sous 44 px dans l'en-tête et les filtres
- Mesure `data-m.json → targets` (toutes pages) : `a.packs` 67×**36**, `button.coin-btn` 68×**36** (`style.css:2631` `height: 36px`), `button.user` **36×36**, `button.nav-more` **30**×40, onglets de nav **40** de haut (`:1610 min-height: 40px`), `button.chip` (étoiles) 40×**34** / 36×40, `.vol-mute` 54×35, `input.vol` (curseur) 172×**4** (zone de saisie réelle du `<input type=range>` : 4 px de haut), `a.bp-who` 43×**11**, `.sleeve` roue 26×158 (hit-test de la 3D via DOM : 26 px de large pour les pochettes de côté).
- Apple HIG / Material : 44×44 (48 dp). Les pilules d'en-tête sont touchées 10 fois par session.
- **Correction** : `min-height: 44px` sur `.me .packs, .coin-btn, .user, .nav-more, .topbar nav a, .chip` (le visuel peut rester à 36 px avec un `::before` étendu en `inset: -4px`) ; `input.vol { height: 28px }` avec `appearance: none` et une piste dessinée ; `.bp-who` : étendre la zone au bloc parent.

### M-03 — P2 — Paysage téléphone : la boutique perd le booster et la roue chevauche l'en-tête
- `m-landscape-shop.png` (844×390) : la roue des pochettes est à 20 px sous l'en-tête, le booster central n'apparaît pas, 60 % de l'écran est vide en dessous ; le nom « POP CULTURE PACK » est coupé/dédoublé. Règle existante `style.css:1714` (`max-height: 500px and orientation: landscape`) ne gère pas la roue 3D (`.packs-row.wheel :2563`, dimension `--sw: clamp(96px, 29vw, 128px)` = 128 px → hauteur `1.9×` = 243 px sur 390 px d'écran).
- Collection en paysage (`m-landscape-collection.png`) : correcte.
- **Correction** : en paysage ≤ 500 px de haut : `--sw: clamp(72px, 16vh, 96px)`, roue à droite et booster à gauche (`grid-template-columns: 1fr 1fr`) ou verrouiller le portrait via le manifest (`orientation: portrait`) — le plus simple pour une app installée.

### M-04 — P2 — Clavier, zones sûres, PWA : globalement bons
- `viewport-fit=cover`, `interactive-widget=resizes-content` (`jeu/index.html:7`), `env(safe-area-inset-*)` sur en-tête, feuilles, `to-top`, `v-info` ; champs à 16 px sous `pointer: coarse` (`:684`, `:835`, `:1841` — pas de zoom iOS) ; `apple-mobile-web-app-status-bar-style: black-translucent` + `theme-color #0b0908` (`:8, :30`) ; geste retour géré par la pile de couches (`ui.ts:145-230`).
- Restes : (a) `100dvh` sur le canvas (`:58`) mais `.views` en `inset: 0` fixe : OK ; (b) le manifest (`../manifest.webmanifest`) est absent de cette copie → vérifier `display: standalone`, `orientation`, icône maskable ; (c) pas de `<meta name="apple-mobile-web-app-capable">` problème : présent `:28` ; (d) la pilule hors-ligne `.offline-pill` (`:697`) garde son `::before` en animation `dot-pulse` **infinie même cachée** (`opacity: 0`) : ajouter `animation-play-state: paused` hors `body.offline`.

---

## Plan d'action ordonné (gain / effort)

| # | Action | Gain | Effort |
|---|---|---|---|
| 1 | **F-01** déplacer `st-flicker` du `<path>` SVG vers un wrapper HTML | 1 layout/image en moins sur toutes les pages, batterie | 5 min |
| 2 | **P-04** retirer `filter: blur` de `canvas.gl.dim`, `width`→`scaleX` sur les 4 barres, `bp-spin`/`bp-live` en transform/opacity | transitions de page sans gel, plus de repeintes infinies | 1 h |
| 3 | **N-02** `SCALE` des cartes peintes selon `devicePixelRatio` + micro-textes retirés sous 0,5 | grille nette sur iPhone | 2 h |
| 4 | **N-01 / N-04 / P-01** police de libellé lisible pour `--mono`, 12 px minimum, letter-spacing ≤ 0,12em sous 13 px | lisibilité partout, « net » perçu | ½ j (décision Tom) |
| 5 | **N-03** fil Gros tirages téléphone : sans rotation/échelle, 9–11 px, pas de `will-change` | 1er écran net, 6 couches GPU en moins | 1 h |
| 6 | **M-02** cibles 44 px dans l'en-tête, filtres, curseur de volume | confort tactile | 1 h |
| 7 | **P-02** backdrop-filter : garder 3, supprimer 11 sur PC | 2–4 ms/image sur portable | 30 min |
| 8 | **P-03** durées en jetons (39 transitions + 92 animations, `games.css`) | cohérence du « feel » | 2 h |
| 9 | **F-02** arrêter la boucle three et `diag.ts` sur les pages DOM | batterie, 120 Hz libre | 1 h |
| 10 | **N-05** entiers de mise en page (hauteur de tuile, pilules d'en-tête, centrages) | liserés nets en DPR 3 | 2 h |
| 11 | **M-01** barre d'onglets en bas + en-tête 44 px | +45 px de contenu, ergonomie pouce | 1 j |
| 12 | **F-03 / F-04 / F-08** nettoyage DOM des tuiles, `contain-intrinsic-size` réel, lazy/decoding | défilement, mémoire | 2 h |
| 13 | **P-05 / P-06 / P-07** haptique d'interface, états pressés, squelettes, vides, jetons de rayons/ombres | finition premium | ½ j |
| 14 | **N-06 / N-07 / N-08** rotations de bitmaps, drop-shadow, gris et désactivés | polish | 1 h |
| 15 | **M-03** paysage téléphone (ou verrouillage portrait) | pas d'écran cassé | 1 h |

## Mesures à faire sur un vrai téléphone (iPhone DPR 3 + Android)

1. Safari/Chrome › Performance (ou `chrome://inspect`) sur la page **Succès au repos** 5 s : nombre de Layout/Recalc par seconde avant/après F-01 (attendu : ≈ 60/s → ≈ 0).
2. Défilement de la **collection** (album de 60 tuiles, cartes réelles) : images perdues (Chrome › Rendering › Frame Rendering Stats), et CPU moyen ; refaire après F-03/F-04.
3. Capture d'écran native (×3) de la grille : lisibilité du nom et absence de flou de l'image (comparer `naturalWidth` à `clientWidth × 3` dans la console : `[...document.querySelectorAll('.tile img.real')].map(i => i.naturalWidth / (i.clientWidth * devicePixelRatio))` ≥ 1).
4. Capture native des onglets et de la fiche booster : lire « CONTRATS », « RARE », « JEUX » (N-01).
5. Changement de page boutique → collection ×5 : durée du gel (Chrome Performance « Long task »), avant/après P-04/F-05.
6. Batterie : 10 min sur la page Collection sans toucher, avant/après F-01/F-02 (Android : `adb shell dumpsys batterystats`, iPhone : % batterie et température).
7. Toucher les pilules d'en-tête 20 fois en visant vite : taux de ratés avant/après M-02.
8. Paysage : capture de la boutique (M-03).
9. Hz : sur iPhone Pro, Réglages › Accessibilité › Limiter la fréquence d'images OFF : vérifier que les pages DOM ne forcent plus 120 Hz (Instruments › Core Animation FPS ≈ 0 au repos après F-02).
