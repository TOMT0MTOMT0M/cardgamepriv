# Audit performance — Bébou Cartes — 6 novembre 2026

> Avant = commit **c5b0f81** (`results/baseline.json`) ; après = fusion **`perf/fusion` @ 79b9b6c** (12 lots,
> `results/final.json`). Médianes de 3 passes [min–max], WebGPU (SwiftShader), mode démo. Rien n'est poussé.

## 1. Résumé

**Téléphone** (390×844 DPR 3, `quality=mobile`, CPU ×4, Fast 3G) :
1. **La 3D du preset téléphone était noire en WebGPU** (MSAA ×2 inexistant en WebGPU + échantillons « jetés ») :
   corrigé (`2cd5fba`), puis MSAA ×4 en WebGPU (arbitrage délégué par Tom) (`daa5c6d`) — coût : mémoire GPU vitrine
   **170 → 369 Mo** (estimation), à surveiller sur iPhone (§8 bis).
2. Chargement : écran de chargement visible **1 892 → 1 528 ms (−19 %)**, boutique affichée **31,0 → 28,9 s (−7 %)**,
   JS avant la boutique **1 138 → 1 052 Ko** (catalogue complet sorti du 1er téléchargement puis compacté).
3. Ouvertures : **0 pipeline compilé pendant une ouverture** (6-9 avant), tâches longues **−26 à −33 %**, script −8 à −9 %.
4. Fuites : **+300 → 0 canvases** et **+4,2 → +0,9 Mo** de tas pour 10 ouvertures ; canvases vivants en fin de
   parcours 160 → 56, mémoire des canvas −21 %.
5. Le plus gros poste restant au chargement est la **peinture de la carte des plis** (PROFIL A1, ~18 s ici en
   rastérisation logicielle ×4) : à mesurer sur un vrai téléphone avant d'investir (§8 ter).

**PC** (1920×1080) : vitrine au repos **script 60 → 27 ms/s (−55 %)**, soumissions GPU 28 → 3 et draw calls 33 → 8
par image (bloom / flare à la demande, au bit près) ; ouvertures script **−20 %**, **0 pipeline** créé (12-14),
tâches longues −33 % ; script jusqu'à la boutique **152 → 82 ms (−46 %)** ; interactif (TTI) 27,7 → 12,1 s.
**Aucun changement visible** hors la décision MSAA ×4 (bords lissés au téléphone) : captures identiques au pixel (§12),
sauf un écart de bloom ≤ 3/255 sur une capture (récap du gros booster, PC), attribué au harnais et non au jeu (§12).
Côté serveur : 2 changements Convex compatibles (payload collection −62 %, `users.me` 65× moins chère) — déployer
**le site d'abord, puis Convex** (§9 bis).

## 2. Méthode

- Code de référence : commit **c5b0f81** (branche `fix/retours-live-02`), build `vite build` de production (+ cartes de
  sources pour le profilage), servi comme Cloudflare Pages (brotli, `_headers`).
- Navigateur : Chrome 153 sans interface, **WebGPU** via SwiftShader (rendu logiciel), piloté par Playwright + CDP.
  Mode démo `/jeu/?demo` (backend local) avec une partie de référence (150 cartes, réserve pleine).
- Profils : **PC** 1920×1080 DPR 1 ; **téléphone** 390×844 DPR 3, tactile, UA Android, `?quality=mobile`, CPU ×4,
  chargement en réseau Fast 3G (1,6 Mbit/s, 150 ms), cache désactivé.
- Chaque indicateur = **médiane de 3 passes** (navigateur neuf à chaque passe) [min–max].
- Écrans mesurés (fenêtres de 6 s) : vitrine au repos, roue des boosters, ouverture complète d'un booster (raretés
  imposées : sans 5★, avec une 5★, avec une 6★), collection (arrivée + défilement), visionneuse, échanges, profil.
- Fuites : 10 ouvertures d'affilée puis 20 changements de page, GC forcé avant chaque relevé.
- Captures pixel : horloge simulée pas à pas, `Math.random` à graine fixe, animations CSS figées, 1000×760 et
  390×844 (DPR 3) ; deux passes du même code comparées pour connaître les zones instables.
- Harnais complet et mode d'emploi : `/home/claude/perf/HARNESS.md`.

### Définitions
- **Boutique affichée** : l'écran de chargement passe à `.done` (`main.ts`, fin de `boot()`).
- **Interactif (TTI)** : fin de la dernière tâche longue (> 50 ms) suivie de 3 s sans tâche longue, à partir de la
  boutique affichée. Indicatif ici (voir limites : les attentes du GPU logiciel le rendent bruité).
- **Images 3D/s** : images effectivement rendues par three (`getCurrentTexture` du canvas). **rAF/s** : images où un
  rappel `requestAnimationFrame` a tourné. **script / style / layout ms/s** : temps CPU du thread principal par seconde.

## 3. Tableau de référence « avant » (c5b0f81)

**Chunks (baseline)** — JS total 9 522 Ko brut / 3 158 Ko gzip / 2 429 Ko brotli ; JS du premier écran du jeu (entrée + 39 modulepreload) : 40 fichiers  4 477 Ko brut / 1 233 Ko gzip / 990 Ko br ; CSS du jeu 230 Ko brut / 39 Ko br ; polices préchargées : 7.

| chunk | brut (Ko) | gzip | brotli |
|---|---:|---:|---:|
| 008-shatter-BqKDcjNx.js | 4 238 | 1 626 | 1 170 |
| themes-C8CTrxPZ.js | 3 004 | 777 | 602 |
| three.webgpu-DFU1IpFK.js | 627 | 171 | 140 |
| three.core-CVFPGqHe.js | 262 | 67 | 55 |
| jeu-DGfF0HXG.css | 205 | 41 | 33 |
| art-DDcx9KzJ.js | 167 | 60 | 52 |
| jeu-BWYDCQlP.js | 156 | 56 | 50 |
| lab-vgT_cT7T.js | 107 | 33 | 29 |
| 043-rarity-fx-mmHCNYE4.js | 79 | 30 | 27 |
| gsap-BHS3Flg1.js | 68 | 26 | 24 |
| musicPreviews.data-CnA1ZbNN.js | 62 | 20 | 16 |
| trades-BCHFg7OZ.js | 57 | 18 | 16 |
| GLTFLoader-s2VCFTGE.js | 45 | 13 | 12 |
| localBackend-CyvVpNkX.js | 45 | 14 | 13 |
| collection-DejNcqGD.js | 43 | 15 | 13 |


#### PC — chargement (médiane [min–max] de 3 passes, cache désactivé)

| indicateur | valeur |
|---|---:|
| FCP (écran de chargement) | 300 <small>[284–312]</small> |
| boutique affichée (loader `.done`), ms | 8 014 <small>[7 854–8 298]</small> |
| 1re image 3D après, ms | 8 017 <small>[7 857–8 300]</small> |
| script (CPU thread) jusqu'à la boutique, ms | 152 <small>[151–160]</small> |
| tâches (CPU thread, tout compris) jusqu'à la boutique, ms | 4 123 <small>[4 017–4 151]</small> |
| style jusqu'à la boutique, ms | 26 <small>[23–26]</small> |
| layout jusqu'à la boutique, ms | 12 <small>[12–13]</small> |
| tâches longues jusqu'à la boutique, ms | 5 009 <small>[4 627–5 377]</small> |
| TBT jusqu'à la boutique, ms | 4 659 <small>[4 277–4 977]</small> |
| interactif (TTI : dernière tâche longue + 3 s calmes), ms | 27 691 <small>[27 544–27 861]</small> |
| TBT jusqu'au TTI, ms | 15 981 <small>[15 279–19 210]</small> |
| tâches longues (total) jusqu'au TTI, ms | 16 781 <small>[15 979–20 010]</small> |
| plus longue tâche, ms | 7 679 <small>[7 660–7 805]</small> |
| script (CPU) jusqu'au TTI, ms | 495 <small>[452–536]</small> |
| tas JS, Mo | 45.8 <small>[31.4–46.3]</small> |
| pipelines GPU créés | 61 <small>[61–61]</small> |
| modules de shaders | 85 <small>[85–85]</small> |
| textures GPU (estimation), Mo | 622 <small>[622–622]</small> |
| canvases vivants | 43 <small>[43–43]</small> |
| mémoire des canvases, Mo | 58.9 <small>[58.9–58.9]</small> |
| requêtes avant la boutique | 56 <small>[56–56]</small> |
| … poids transféré, Ko | 1 372 <small>[1 372–1 372]</small> |
| … dont JS, Ko | 1 138 <small>[1 138–1 138]</small> |
| … dont polices, Ko | 188 <small>[188–188]</small> |
| … dont CSS, Ko | 42 <small>[42–42]</small> |
| … dont images, Ko | 0.5 <small>[0.5–0.5]</small> |
| requêtes jusqu'au TTI (+ ~9 s) | 142 <small>[142–142]</small> |
| … poids, Ko | 1 505 <small>[1 505–1 505]</small> |
| … en échec (404 illustrations R2) | 69 <small>[69–69]</small> |

#### PC — écrans (par seconde ; fenêtres de 6 s, ouvertures : jusqu'au récap)

| écran | images 3D/s | rAF/s | script ms/s | style ms/s | layout ms/s | tâches longues ms | max ms | pipelines créés | draw calls | tas Mo | tex GPU Mo | canvas Mo | encodages | durée s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| shop_idle | 54 | 54 | 60 | 15 | 0.0 | 0 | 0 | 0 | 33 | 46 | 622 | 59 | 0 | — |
| wheel | 52 | 52 | 59 | 16 | 0.5 | 120 | 120 | 0 | 33 | 36 | 632 | 59 | 0 | — |
| open_common | 45 | 45 | 86 | 6.5 | 1.9 | 1 623 | 445 | 14 | 46 | 49 | 729 | 59 | 0 | 9.9 |
| open_5 | 51 | 51 | 82 | 6.7 | 1.4 | 1 112 | 326 | 12 | 46 | 64 | 732 | 59 | 0 | 11 |
| open_6 | 52 | 52 | 77 | 6.8 | 1.4 | 832 | 300 | 12 | 46 | 43 | 735 | 59 | 0 | 14 |
| coll | 0.0 | 50 | 3.4 | 8.9 | 5.6 | 154 | 94 | 0 | 0 | 49 | 644 | 59 | 45 | — |
| coll_scroll | 0.0 | 57 | 6.0 | 7.4 | 1.9 | 0 | 0 | 0 | 0 | 31 | 644 | 59 | 15 | — |
| viewer | 55 | 55 | 49 | 6.4 | 0.8 | 196 | 86 | 3 | 18 | 36 | 671 | 59 | 0 | — |
| trades | 0.0 | 57 | 2.4 | 3.8 | 1.0 | 0 | 0 | 0 | 0 | 36 | 671 | 59 | 0 | — |
| profile | 0.0 | 56 | 2.4 | 5.5 | 1.8 | 90 | 90 | 0 | 0 | 33 | 671 | 59 | 3 | — |

#### PC — mémoire après GC (retour boutique) et fuites

| | heap_mb | dom_nodes | js_listeners | win_listeners | doc_listeners | canvases_alive | canvas_mb | gpu_tex_live | gpu_tex_mb | gpu_buf_mb | r_geometries | r_textures | programs | cache_storage_mb | css_anims |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| fin du parcours | 32 | 3 450 | 399 | 43 | 17 | 148 | 59 | 93 | 671 | 1.3 | 12 | 86 | 74 | 0.5 | 12 |
| avant fuites | 32 | 3 403 | 399 | 43 | 17 | 146 | 59 | 91 | 668 | 1.3 | 12 | 84 | 74 | 0.5 | 12 |
| après 10 ouvertures | 37 | 3 701 | 399 | 43 | 17 | 448 | 59 | 93 | 671 | 1.4 | 12 | 86 | 74 | 0.5 | 12 |
| après 20 pages | 37 | 3 930 | 420 | 44 | 17 | 448 | 59 | 93 | 671 | 1.4 | 12 | 86 | 74 | 0.6 | 12 |
| Δ 10 ouvertures | 4.9 | 298 | 0 | 0 | 0 | 302 | 0.0 | 2 | 3.0 | 0.0 | 0 | 2 | 0 | 0.0 | 0 |
| Δ 20 pages | 0.4 | 229 | 21 | 1 | 0 | 0 | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0.1 | 0 |

#### MOBILE — chargement (médiane [min–max] de 3 passes, cache désactivé, 1,6 Mbit/s 150 ms, CPU ×4)

| indicateur | valeur |
|---|---:|
| FCP (écran de chargement) | 1 892 <small>[1 892–1 912]</small> |
| boutique affichée (loader `.done`), ms | 31 013 <small>[30 506–31 503]</small> |
| 1re image 3D après, ms | 31 018 <small>[30 514–31 510]</small> |
| script (CPU thread) jusqu'à la boutique, ms | 444 <small>[426–471]</small> |
| tâches (CPU thread, tout compris) jusqu'à la boutique, ms | 21 252 <small>[20 885–22 268]</small> |
| style jusqu'à la boutique, ms | 187 <small>[164–247]</small> |
| layout jusqu'à la boutique, ms | 96 <small>[92–110]</small> |
| tâches longues jusqu'à la boutique, ms | 21 047 <small>[20 460–21 443]</small> |
| TBT jusqu'à la boutique, ms | 20 347 <small>[19 960–20 843]</small> |
| interactif (TTI : dernière tâche longue + 3 s calmes), ms | 31 080 <small>[30 626–115 933]</small> |
| TBT jusqu'au TTI, ms | 20 347 <small>[20 030–74 436]</small> |
| tâches longues (total) jusqu'au TTI, ms | 21 047 <small>[20 580–76 336]</small> |
| plus longue tâche, ms | 17 966 <small>[17 669–19 353]</small> |
| script (CPU) jusqu'au TTI, ms | 1 165 <small>[865–3 508]</small> |
| tas JS, Mo | 42.7 <small>[27.0–52.6]</small> |
| pipelines GPU créés | 68 <small>[68–74]</small> |
| modules de shaders | 92 <small>[92–100]</small> |
| textures GPU (estimation), Mo | 146 <small>[146–162]</small> |
| canvases vivants | 58 <small>[55–61]</small> |
| mémoire des canvases, Mo | 62.5 <small>[56.5–64.7]</small> |
| requêtes avant la boutique | 56 <small>[56–56]</small> |
| … poids transféré, Ko | 1 372 <small>[1 372–1 372]</small> |
| … dont JS, Ko | 1 138 <small>[1 138–1 138]</small> |
| … dont polices, Ko | 188 <small>[188–188]</small> |
| … dont CSS, Ko | 42 <small>[42–42]</small> |
| … dont images, Ko | 0.5 <small>[0.5–0.5]</small> |
| requêtes jusqu'au TTI (+ ~9 s) | 86 <small>[86–149]</small> |
| … poids, Ko | 1 387 <small>[1 387–1 506]</small> |
| … en échec (404 illustrations R2) | 20 <small>[20–71]</small> |

#### MOBILE — écrans (par seconde ; fenêtres de 6 s, ouvertures : jusqu'au récap)

| écran | images 3D/s | rAF/s | script ms/s | style ms/s | layout ms/s | tâches longues ms | max ms | pipelines créés | draw calls | tas Mo | tex GPU Mo | canvas Mo | encodages | durée s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| shop_idle | 25 | 39 | 146 | 46 | 0.3 | 984 | 379 | 5 | 15 | 31 | 170 | 58 | 0 | — |
| wheel | 29 | 31 | 163 | 121 | 0.3 | 2 227 | 245 | 0 | 15 | 28 | 185 | 57 | 0 | — |
| open_common | 28 | 28 | 230 | 22 | 8.1 | 3 944 | 831 | 6 | 32 | 41 | 219 | 56 | 0 | 13 |
| open_5 | 35 | 35 | 232 | 23 | 4.1 | 3 391 | 612 | 8 | 32 | 49 | 209 | 56 | 0 | 15 |
| open_6 | 37 | 37 | 220 | 25 | 4.7 | 3 079 | 613 | 9 | 31 | 58 | 209 | 56 | 0 | 17 |
| coll | 0.3 | 50 | 13 | 25 | 9.7 | 666 | 244 | 0 | 0 | 61 | 147 | 56 | 6 | — |
| coll_scroll | 0.0 | 57 | 9.3 | 15 | 0.0 | 0 | 0 | 0 | 0 | 31 | 147 | 56 | 0 | — |
| viewer | 23 | 32 | 124 | 22 | 10 | 1 468 | 423 | 3 | 0 | 33 | 204 | 60 | 6 | — |
| trades | 0.0 | 57 | 10 | 15 | 4.5 | 81 | 81 | 0 | 0 | 31 | 170 | 55 | 0 | — |
| profile | 0.0 | 50 | 22 | 24 | 13 | 684 | 388 | 0 | 0 | 31 | 170 | 55 | 3 | — |

#### MOBILE — mémoire après GC (retour boutique) et fuites

| | heap_mb | dom_nodes | js_listeners | win_listeners | doc_listeners | canvases_alive | canvas_mb | gpu_tex_live | gpu_tex_mb | gpu_buf_mb | r_geometries | r_textures | programs | cache_storage_mb | css_anims |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| fin du parcours | 31 | 3 940 | 351 | 43 | 17 | 160 | 55 | 79 | 161 | 1.3 | 12 | 76 | 83 | 0.2 | 7 |
| avant fuites | 31 | 3 940 | 351 | 43 | 17 | 160 | 55 | 79 | 161 | 1.3 | 12 | 76 | 83 | 0.2 | 7 |
| après 10 ouvertures | 35 | 4 237 | 351 | 43 | 17 | 460 | 55 | 79 | 161 | 1.3 | 12 | 76 | 83 | 0.2 | 8 |
| après 20 pages | 35 | 4 366 | 377 | 44 | 17 | 460 | 55 | 79 | 161 | 1.3 | 12 | 76 | 83 | 0.2 | 8 |
| Δ 10 ouvertures | 4.2 | 297 | 0 | 0 | 0 | 300 | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0.0 | 1 |
| Δ 20 pages | 0.2 | 129 | 26 | 1 | 0 | 0 | 0.0 | 0 | 0.0 | 0.0 | 0 | 0 | 0 | 0.0 | 0 |

#### Arts canvas 2D et cache (baseline)
- **Cartes 2D** (grilles) : ≈ **24 ms CPU par carte sur PC** (`paintWith` → `generateCardArt` 1 453 ms pour ~60 cartes,
  dont `drawImage` 707 ms, encodage WebP `toBlob` 103 ms) ; ≈ **58 ms par carte au téléphone** (CPU ×4 ; 6 cartes
  peintes à l'arrivée sur la collection, la grille téléphone en montre moins). Première visite de la collection :
  45 cartes peintes (PC) / 6 (tél.), **hit-rate Cache Storage 0 %** (profil neuf : 45 `match`, 0 `hit`, 45 `put`) ;
  au retour sur la page dans la même session, les tuiles viennent de la mémoire (aucune peinture, aucun `match`).
  Le hit-rate entre deux sessions (Cache Storage persistant) n'est pas mesuré (chaque passe part d'un profil vierge).
- **Boosters** (au chargement) : `src/core/pack.ts` 358 ms PC / 713 ms tél. (dont `simplePackArt` 211 ms PC),
  `core/art/*` 138 / 273 ms, faces de cartes de préchauffage (`cardFace.ts`) 30 / 378 ms, et surtout la réduction des
  visuels pour la roue 3D (`packWheel3d.ts` `shrink`) **4 390 / 17 500 ms** (voir PROFIL A1). Vignettes WebP des
  5 pochettes : 5 encodages (asynchrones).
- Canvases vivants après le parcours : 148 (PC) / 160 (tél.), 59 / 55 Mo ; **+30 canvases par ouverture** (fuite, A9).

## 4. Classement des coûts (profilage)

Détail : `/home/claude/perf/PROFIL.md` (tableau classé par impact mesuré, séparé « rendu 3D / canvas / boucles » et
« chargement / DOM-CSS / réseau »). Les 10 plus lourds (PC / téléphone) :

1. Réduction des visuels de la roue 3D au chargement (`packWheel3d.ts:35`, `drawImage` qualité `high`) : **4,4 s /
   17,5 s** de CPU, 59 % / 62 % du chargement — l'essentiel de l'attente avant la boutique (8,0 s / 31,0 s).
2. JS du premier écran : 990 Ko brotli (4,5 Mo brut) dont catalogue `themes` 602 Ko br (61 %) ; ≈ 5,7 s de réseau en 3G.
3. Vitrine rendue en continu au repos sur PC : 54 images/s, ≈ 99 ms CPU/s de boucle 3D (bloom 26 %).
4. Mémoire GPU des cibles plein écran gardées par chaque scène (MSAA ×4 rgba16float ×2 sorties) : 655 Mo PC / 186 Mo tél.
5. Style recalculé en continu : roue téléphone 121 ms/s, vitrine 15 / 46 ms/s.
6. Compilations de pipelines pendant chaque ouverture : 12-14 PC / 6-9 tél. (à-coups 0,8-4 s cumulés).
7. Défilement JS « Gros tirages » + lecture `scrollTop` à chaque image : 12 ms/s PC, 55 ms/s tél.
8. Boucle rAF active sur les pages 100 % DOM (50-57 rAF/s, three à 0) + `diag.ts`.
9. Peinture des cartes 2D : ≈ 24 ms / carte PC, 58 ms / carte tél. ; hit-rate Cache Storage 0 % en 1re visite.
10. Fuites : +30 canvases, +30 nœuds DOM, +0,5 Mo de tas par ouverture ; +21-26 écouteurs / 20 pages.
(+ `missionDay` qui recrée un `Intl.DateTimeFormat` à chaque appel : 0,4-0,9 s par ouverture, surtout via la démo.)

## 5. Lots appliqués (12 commits, fusion `perf/fusion`)

Gains mesurés par chaque agent sur le harnais (médianes de 3 passes, « avant » = commit précédent sauf mention) ; le
tableau §6 donne l'effet cumulé mesuré sur la fusion.

| # | commit | agent | changement | gain mesuré | visuel |
|---|---|---|---|---|---|
| 1 | `2cd5fba` | Rendu | **Correctif** : 3D noire au preset téléphone en WebGPU (MSAA ×2 inexistant en WebGPU + `storeOp: discard` → passe de scène jetée) | correctif (vitrine, ouverture, visionneuse visibles en WebGPU téléphone) | rend l'image à nouveau |
| 2 | `47f2411` | Rendu | Préchauffage complet de l'ouverture (vraie passe MRT + MSAA + post sous l'écran de chargement, PC compris) ; couleurs des tranches en uniforms ; roue 3D préparée en entier | pipelines créés pendant une ouverture PC 12-14 → **0**, tél. 6-9 → 0-1 ; tél. script d'ouverture −8 à −10 %, p95 image 6★ −23 % ; PC tâches longues ouverture 5★ −27 % | identique au pixel |
| 3 | `160a781` | Rendu | Bloom et flare recalculés seulement quand leur contribution n'est pas nulle (PC) | vitrine PC script **−44 %** (59,5 → 33,4 ms/s), soumissions GPU 28 → 3 par image, draw calls 33 → 8 ; roue −47 % ; ouvertures −9 à −14 % | identique au pixel (1 écart ≤ 3/255 sur `pc-big-recap` expliqué par le harnais, §12) |
| 4 | `daa5c6d` | Rendu | **Arbitrage délégué par Tom** : téléphone WebGPU en MSAA ×4 (×2 en WebGL2) | — (coût : voir §8 bis) | bords lissés comme avant l'audit 06/11 |
| 5 | `c0343d8` | Rendu | Carte des plis des sachets peinte une fois pour les 5 boosters (et réduite une fois pour la roue) | mémoire des canvas −16 à −18 % (≈ −10 Mo) ; vitrine tél. script −17 %, roue tél. −12 % | identique au pixel |
| 6 | `bd0526c` | Rendu | Fuite des cartes : maillage libéré (l'objet de rendu du dos partagé retenait chaque carte, ses 6 toiles, ses tampons GPU) | 10 ouvertures : toiles +302 → **+8**, tampons GPU +100 → **0**, tas +4,9 → +3,1 Mo (PC) | identique au pixel |
| 7 | `540fafe` | Chargement | Les 4 gros sets du catalogue (~620 Ko br) sortent du premier téléchargement : chargés par `import()` pendant le démarrage de la 3D | JS critique tél. 1 138 → 535 Ko br ; DCL tél. 7,8 → 4,1 s (−48 %) ; boutique affichée tél. −4,4 %, PC −6 % | identique |
| 8 | `e30be67` | Chargement | Formateurs de date (`Intl.DateTimeFormat`) créés une fois ; profil : snapshot de l'économie lu une fois | 200 × `eco.snapshot` : PC 890 → 59 ms, tél. 1 675 → 253 ms ; aussi côté Convex | identique |
| 9 | `6bf34d9` | Chargement | Convex : `myCollection` réduit aux 5 champs lus ; `feed.recent` seulement s'il est lu | payload collection −62 % (1 000 cartes : 275 → 105 Ko, convex-test) ; 12 → 11 abonnements | identique |
| 10 | `22e152a` | Chargement | Catalogues Pop Culture et Sport compactés au build (décodés à l'identique, auto-vérifié) | catalogue 623 → 528 Ko br ; octets avant la boutique tél. −6,7 %, boutique affichée −7 % | identique |
| 11 | `e7e4126` | Chargement | Feuilles de style demandées avant le JS | écran de chargement visible plus tôt : tél. 2 024 → 1 512 ms, PC 360 → 236 ms (compense le lot 7) | identique |
| 12 | `cacccf5` | Chargement | Convex : `users.me` ne relit plus tout l'inventaire (compteurs du HUD du labo calculés côté client) | convex-test 1 000 cartes : 14,2 → 0,22 ms par exécution ; plus de ré-exécution à chaque carte gagnée | identique |

## 6. Tableau avant / après — PC puis téléphone (mesure finale)

« au-delà du bruit » = écart ≥ 5 % et ≥ bruit de l'indicateur, plages des passes disjointes (`compare_results.py`).
Les tableaux complets (tous indicateurs) : `harness/compare_results.py baseline final --all`.

### PC (1920×1080, DPR 1)

| indicateur | avant (c5b0f81) | après (fusion) | écart | verdict |
|---|---:|---:|---:|---|
| **Chargement** | | | | |
| Écran de chargement visible (FCP), ms | 300 [284–312] | 268 [236–308] | -11 % | dans le bruit |
| Boutique affichée, ms | 8 014 [7 854–8 298] | 7 951 [7 772–8 336] | -1 % | = |
| Script CPU jusqu'à la boutique, ms | 152 [151–160] | 81.8 [74.4–82.1] | -46 % | **au-delà du bruit** |
| Tâches CPU jusqu'à la boutique, ms | 4 123 [4 017–4 151] | 4 082 [4 082–4 188] | -1 % | = |
| TBT jusqu'à la boutique, ms | 4 659 [4 277–4 977] | 4 752 [4 589–4 962] | +2 % | = |
| Interactif (TTI, indicatif), ms | 27 691 [27 544–27 861] | 12 096 [11 891–12 778] | -56 % | **au-delà du bruit** |
| TBT jusqu'au TTI, ms | 15 981 [15 279–19 210] | 4 983 [4 899–5 349] | -69 % | **au-delà du bruit** |
| Octets avant la boutique, Ko | 1 372 | 1 285 | -6 % | **au-delà du bruit** |
| … dont JS, Ko | 1 138 | 1 052 | -8 % | **au-delà du bruit** |
| Requêtes avant la boutique | 56.0 | 57.0 | +2 % | = |
| Pipelines GPU créés au chargement | 61.0 | 81.0 | +33 % | **au-delà du bruit** |
| Mémoire des canvas au chargement, Mo | 58.9 | 52.4 [51.7–53.1] | -11 % | **au-delà du bruit** |
| **Vitrine au repos** | | | | |
| Script, ms/s | 60.1 [57.7–60.5] | 27.2 [25.3–28.0] | -55 % | **au-delà du bruit** |
| Style, ms/s | 14.5 [13.4–14.6] | 14.2 [13.9–14.8] | -2 % | = |
| Images 3D/s | 53.6 [47.7–53.7] | 58.2 [55.9–59.1] | +9 % | dans le bruit |
| Draw calls / image | 33.0 | 8 | -76 % | **au-delà du bruit** |
| Soumissions GPU / image | 28.0 [28.0–28.0] | 3 | -89 % | **au-delà du bruit** |
| **Roue / sélection** | | | | |
| Script, ms/s | 59.3 [57.7–64.6] | 27.7 [27.6–29.0] | -53 % | **au-delà du bruit** |
| Style, ms/s | 16.2 [13.9–16.5] | 14.6 [14.4–15.1] | -10 % | dans le bruit |
| **Ouverture (sans 5★)** | | | | |
| Script, ms/s | 85.7 [84.1–87.0] | 68.2 [66.7–73.1] | -20 % | **au-delà du bruit** |
| Pipelines créés pendant l'ouverture | 14.0 | 0 | -100 % | **au-delà du bruit** |
| Tâches longues, ms | 1 623 [1 556–2 047] | 1 092 [1 079–1 115] | -33 % | **au-delà du bruit** |
| Intervalle d'image p95, ms | 32.1 [28.2–37.4] | 22.7 [21.0–22.8] | -29 % | **au-delà du bruit** |
| Soumissions GPU / image | 28.1 [28.1–28.1] | 14.9 [14.9–15.0] | -47 % | **au-delà du bruit** |
| **Ouverture avec 5★** | | | | |
| Script, ms/s | 81.6 [80.5–82.9] | 65.8 [65.0–65.9] | -19 % | **au-delà du bruit** |
| Pipelines créés | 12.0 | 0 | -100 % | **au-delà du bruit** |
| Tâches longues, ms | 1 112 [909–1 145] | 643 [633–727] | -42 % | **au-delà du bruit** |
| **Ouverture avec 6★** | | | | |
| Script, ms/s | 77.2 [73.3–80.3] | 60.0 [55.4–63.3] | -22 % | **au-delà du bruit** |
| Pipelines créés | 12.0 | 0 | -100 % | **au-delà du bruit** |
| Tâches longues, ms | 832 [773–983] | 921 [804–933] | +11 % | dans le bruit |
| Intervalle d'image p95, ms | 23.5 [23.5–28.8] | 21.8 [21.5–25.2] | -7 % | dans le bruit |
| **Collection / visionneuse / pages** | | | | |
| Collection : script, ms/s | 3.44 [3.13–3.71] | 3.08 [2.92–3.26] | -11 % | dans le bruit |
| Collection : style, ms/s | 8.95 [7.61–9.34] | 8.48 [7.86–8.97] | -5 % | dans le bruit |
| Défilement : script, ms/s | 6 [2.78–7.36] | 2.75 [2.47–3.32] | -54 % | dans le bruit |
| Visionneuse : script, ms/s | 48.8 [44.2–49.6] | 43.2 [40.7–47.8] | -11 % | dans le bruit |
| Visionneuse : pipelines créés | 3 | 2 | -33 % | **au-delà du bruit** |
| Échanges : script, ms/s | 2.39 [2.36–2.46] | 2.14 [1.97–2.35] | -10 % | dans le bruit |
| Profil : script, ms/s | 2.42 [2.26–2.49] | 3.7 [3.65–4.12] | +53 % | **au-delà du bruit** |
| **Mémoire (fin de parcours, après GC)** | | | | |
| Tas JS, Mo | 31.7 [31.6–31.8] | 29.8 [29.5–30.1] | -6 % | **au-delà du bruit** |
| Canvases vivants | 148 [146–148] | 48.0 | -68 % | **au-delà du bruit** |
| Mémoire des canvas, Mo | 58.7 | 48.0 | -18 % | **au-delà du bruit** |
| Textures GPU (estimation), Mo | 671 [668–671] | 671 | +0 % | = |
| Tampons GPU, Mo | 1.33 | 1.33 | +0 % | = |
| Nœuds DOM | 3 450 [3 402–3 457] | 3 305 [3 039–3 305] | -4 % | = |
| **Fuites (10 ouvertures puis 20 pages, 1re passe)** | | | | |
| Δ canvases vivants / 10 ouvertures | 302 | 0 | -100 % | une passe |
| Δ tas / 10 ouvertures, Mo | 4.94 | 1 | -80 % | une passe |
| Δ nœuds DOM / 10 ouvertures | 298 | -139 | -147 % | une passe |
| Δ tampons GPU / 10 ouvertures, Mo | 0.03 | 0 | -100 % | une passe |
| Δ écouteurs JS / 20 pages | 21.0 | 21.0 | +0 % | une passe |
| Δ tas / 20 pages, Mo | 0.38 | 0.23 | -39 % | une passe |

Remarques PC : `gpu_fps` (débit du GPU logiciel) n'est pas un indicateur de rendu (artefact du harnais) ; profil :
script 2,4 → 3,7 ms/s (+1,3 ms/s, page DOM, sans lien identifié avec les lots ; sans effet visible) ; « pipelines créés
au chargement » 61 → 81 = le préchauffage voulu (`47f2411`) ; « nœuds DOM / 10 ouvertures » négatif = le récap est
reconstruit (pas de fuite).

### Téléphone (390×844, DPR 3, CPU ×4, Fast 3G pour le chargement)

| indicateur | avant (c5b0f81) | après (fusion) | écart | verdict |
|---|---:|---:|---:|---|
| **Chargement** | | | | |
| Écran de chargement visible (FCP), ms | 1 892 [1 892–1 912] | 1 528 [1 496–1 612] | -19 % | **au-delà du bruit** |
| Boutique affichée, ms | 31 013 [30 506–31 503] | 28 927 [28 854–29 696] | -7 % | **au-delà du bruit** |
| Script CPU jusqu'à la boutique, ms | 444 [426–471] | 418 [406–447] | -6 % | dans le bruit |
| Tâches CPU jusqu'à la boutique, ms | 21 252 [20 885–22 268] | 20 749 [20 113–20 864] | -2 % | = |
| TBT jusqu'à la boutique, ms | 20 347 [19 960–20 843] | 19 193 [18 800–19 861] | -6 % | **au-delà du bruit** |
| Interactif (TTI, indicatif), ms | 31 080 [30 626–115 933] | 42 560 [32 851–43 241] | +37 % | dans le bruit |
| TBT jusqu'au TTI, ms | 20 347 [20 030–74 436] | 21 661 [20 803–21 839] | +6 % | dans le bruit |
| Octets avant la boutique, Ko | 1 372 | 1 285 | -6 % | **au-delà du bruit** |
| … dont JS, Ko | 1 138 | 1 052 | -8 % | **au-delà du bruit** |
| Requêtes avant la boutique | 56.0 | 57.0 | +2 % | = |
| Pipelines GPU créés au chargement | 68.0 [68.0–74.0] | 79.0 | +16 % | **au-delà du bruit** |
| Mémoire des canvas au chargement, Mo | 62.5 [56.5–64.7] | 49.2 [47.2–49.2] | -21 % | **au-delà du bruit** |
| **Vitrine au repos** | | | | |
| Script, ms/s | 146 [133–149] | 115 [99.3–132] | -21 % | dans le bruit |
| Style, ms/s | 45.9 [40.8–47.5] | 39.8 [37.1–42.4] | -13 % | dans le bruit |
| Images 3D/s | 25.4 [18.3–32.8] | 31.7 [31.3–32.6] | +24 % | dans le bruit |
| Draw calls / image | 15.0 | 15.0 [0–15.0] | +0 % | = |
| Soumissions GPU / image | 2.1 [2–2.15] | 2 | -5 % | = |
| **Roue / sélection** | | | | |
| Script, ms/s | 163 [157–174] | 147 [144–162] | -10 % | dans le bruit |
| Style, ms/s | 121 [115–142] | 134 [120–157] | +11 % | dans le bruit |
| **Ouverture (sans 5★)** | | | | |
| Script, ms/s | 230 [228–230] | 212 [207–220] | -8 % | **au-delà du bruit** |
| Pipelines créés pendant l'ouverture | 6 | 0 | -100 % | **au-delà du bruit** |
| Tâches longues, ms | 3 944 [3 789–4 958] | 2 683 [2 650–2 695] | -32 % | **au-delà du bruit** |
| Intervalle d'image p95, ms | 69.3 [67.3–97.3] | 61.4 [55.2–73.9] | -11 % | dans le bruit |
| Soumissions GPU / image | 13.9 [13.9–13.9] | 13.9 [13.8–13.9] | -0 % | = |
| **Ouverture avec 5★** | | | | |
| Script, ms/s | 232 [224–238] | 212 [210–213] | -9 % | **au-delà du bruit** |
| Pipelines créés | 8 | 0 | -100 % | **au-delà du bruit** |
| Tâches longues, ms | 3 391 [2 609–3 638] | 2 283 [1 929–2 426] | -33 % | **au-delà du bruit** |
| **Ouverture avec 6★** | | | | |
| Script, ms/s | 220 [218–231] | 202 [201–209] | -8 % | **au-delà du bruit** |
| Pipelines créés | 9 | 1 | -89 % | **au-delà du bruit** |
| Tâches longues, ms | 3 079 [3 022–3 178] | 2 271 [2 209–2 577] | -26 % | **au-delà du bruit** |
| Intervalle d'image p95, ms | 53.6 [48.4–54.9] | 47.4 [44.9–51.5] | -12 % | dans le bruit |
| **Collection / visionneuse / pages** | | | | |
| Collection : script, ms/s | 12.7 [10.5–12.7] | 10.1 [10.1–11.9] | -21 % | dans le bruit |
| Collection : style, ms/s | 24.6 [23.6–29.2] | 20.4 [19.0–20.5] | -17 % | dans le bruit |
| Défilement : script, ms/s | 9.34 [8.81–23.3] | 7.25 [6.26–7.84] | -22 % | dans le bruit |
| Visionneuse : script, ms/s | 124 [115–134] | 129 [127–131] | +4 % | = |
| Visionneuse : pipelines créés | 3 | 2 | -33 % | **au-delà du bruit** |
| Échanges : script, ms/s | 10.4 [8.01–10.4] | 10.2 [8–13.4] | -2 % | = |
| Profil : script, ms/s | 22.4 [6.25–25.3] | 7.81 [7.39–8.5] | -65 % | dans le bruit |
| **Mémoire (fin de parcours, après GC)** | | | | |
| Tas JS, Mo | 30.6 [30.2–31.0] | 29.8 [29.3–29.9] | -3 % | = |
| Canvases vivants | 160 | 56.0 | -65 % | **au-delà du bruit** |
| Mémoire des canvas, Mo | 55.5 | 44.0 | -21 % | **au-delà du bruit** |
| Textures GPU (estimation), Mo | 161 [161–170] | 198 [198–210] | +23 % | **au-delà du bruit** |
| Tampons GPU, Mo | 1.3 | 1.3 | -1 % | = |
| Nœuds DOM | 3 940 [3 940–3 941] | 3 837 [3 837–3 865] | -3 % | = |
| **Fuites (10 ouvertures puis 20 pages, 1re passe)** | | | | |
| Δ canvases vivants / 10 ouvertures | 300 | 0 | -100 % | une passe |
| Δ tas / 10 ouvertures, Mo | 4.19 | 0.87 | -79 % | une passe |
| Δ nœuds DOM / 10 ouvertures | 297 | -330 | -211 % | une passe |
| Δ tampons GPU / 10 ouvertures, Mo | 0.03 | 0 | -100 % | une passe |
| Δ écouteurs JS / 20 pages | 26.0 | 25.0 | -4 % | une passe |
| Δ tas / 20 pages, Mo | 0.24 | 0.24 | -3 % | une passe |

Remarques téléphone : le TTI est **peu fiable** au téléphone (une passe baseline à 116 s) — juger « boutique affichée »
et « TBT jusqu'à la boutique ». La définition 3D adaptative du jeu (`dpr3d`) est restée plus haute après (vitrine 1,75 →
2,0) : la fusion rend **plus** de pixels au repos pour un script plus bas. Mémoire GPU (estimation des cibles) :
vitrine 170 → 369 Mo, ouverture 6★ 209 → 342 Mo, visionneuse 204 → 362 Mo, fin de parcours 161 → 198 Mo — c'est le
MSAA ×4 décidé (`daa5c6d`) ; le PC est inchangé (622 → 623 Mo).

## 7. Écarté (et pourquoi)

- **R3 — boucle 3D en pause sur les pages sans 3D** (PROFIL A7 : 2-3 ms/s PC, 10-22 ms/s tél.) : gain réel (118 → 0
  rAF/s), mais la file WebGPU cessait d'avancer pendant la pause → faux « GPU perdu » et **rechargement de la page**
  au retour d'arrière-plan. Risque inacceptable sans test sur vrai appareil (patch gardé : `rendu-tools/r3-ecarte.patch`).
- **R6 — vignettes 2D : calques `masks` / `fx` en 1×1** : pas de gain au-delà du bruit (−5,5 %, plages qui se
  recouvrent) : Canvas2D ne rastérise jamais ces calques en mode vignette (jamais relus) ; vignettes identiques
  (empreintes SHA-256).
- **B7 — « fuites » d'écouteurs à la navigation** : mesuré sur 3 tours de 20 pages : 363 → 379 → 398 → 398 écouteurs,
  nœuds DOM en baisse, tas stable → créations paresseuses bornées, **pas de fuite cumulative**.
- **`008-shatter-*.js` (4,3 Mo)** : importé uniquement par le labo (`lab-*.js`), hors du jeu → rien à faire.
- **Avertissement en dev pour une lecture du catalogue avant son installation** (réserve de la revue de 540fafe) :
  non fait (la vérification ponctuelle par Proxy a été faite au lot 7 ; un garde permanent ajouterait du code
  pour un risque futur) — à garder en tête : ne pas lire `THEMES`/`catalogEntry()` au chargement d'un module.

## 8. Gains possibles avec compromis visuel (à décider par Tom — rien n'est appliqué)

| # | piste | ce que ça changerait à l'écran | gain estimé / mesuré |
|---|---|---|---|
| C1 | Vitrine PC à 30 i/s au repos (comme au téléphone) | flottement du booster et respiration du halo moins fluides (cadence ÷ 2) | après le lot 3, ≈ −15 ms/s de script vitrine PC (≈ −45 % de la boucle 3D restante) |
| C2 | Visionneuse / éventail du récap à 30 i/s au repos sur PC | idem (carte qui flotte, liseré arc-en-ciel) | visionneuse PC ≈ −25 ms/s |
| C3 | Aberration chromatique sautée quand `U.ca = 0` (ouverture PC) | certains pixels changent d'1 niveau sur 255 (arrondi 16 → 8 bits), invisible mais pas « 0 pixel » | 1 passe plein écran + 1 cible rgba16f plein écran de moins par image (GPU) |
| C4 | Holo : clearcoat seulement où il se voit, relief 1 lecture au lieu de 2, halo sur disque | reflets du vernis / relief légèrement différents | −15 à −30 % de calcul par pixel de carte (estimation GPU) |
| C5 | Vitrine téléphone sans cible émissive MRT | identique en théorie, risque d'à-coup (nouvelles variantes de pipeline) | bande passante d'une cible plein écran ×4 en vitrine tél. |
| C6 | Invocation Yu-Gi-Oh (`duelSummon`) : bloom ½ → ¼ au téléphone | halo de l'invocation un peu plus doux | −75 % de pixels de bloom pendant la scène 6★ |
| C7 | MSAA téléphone : revenir sous ×4 si l'iPhone manque de mémoire (voir §8 bis) | bords | jusqu'à −100/−200 Mo GPU estimés |
| C8 | Gyroscope coupé sur les pages DOM | inclinaison de départ différente au retour | négligeable — **non recommandé** |
| C9 | Écran de chargement en CSS critique dans le HTML | le logo peut apparaître un instant dans la police de repli | FCP tél. ≈ 1,5 s → ≈ 0,5 s attendu |
| C10 | Squelettes à la place de « chargement… » (1er accès lent à une page) | changement de design | perçu seulement |
| C11 | Fil « Gros tirages » composité (transform / CSS) au lieu de `scrollTop` en JS ; ou 30 i/s au téléphone | défilement pas identique au pixel (sous-pixels, reprise au doigt) ; ou moins fluide | **jusqu'à −55 ms/s de CPU au repos au téléphone** (dont 42 ms/s de `scrollTop` forcé) — plus gros poste restant de la vitrine téléphone |
| C12 | `users.friends` : présence moins fine ou table de présence à part | ordre de la liste d'amis / passage hors ligne moins réactifs (ou migration de schéma) | ≈ K listes complètes / 35 s en moins par client (K = joueurs en ligne) |
| C13 | Battement de cœur 70 s au lieu de 35 s | « en ligne » détecté moins vite | ÷ 2 ré-exécutions des requêtes qui lisent `users` |
| C14 | Polices : sous-ensembles plus serrés / moins de graisses | risque de glyphe manquant / allure | ≤ 188 Ko avant la boutique |
| C15 | Cache immuable des illustrations R2 (`?v=empreinte` via manifeste) | aucun, mais risque de version périmée si le manifeste n'est pas régénéré | plus de revalidation après 7 jours (non mesurable ici) |
| C16 | Service worker pour les tuiles | aucun visible ; risque de version périmée du jeu | faible (Cache Storage `/__cartes/` couvre déjà) |

## 8 bis. Décision MSAA téléphone (×4 en WebGPU) et son coût

Arbitrage délégué par Tom, choix fait : le rendu lissé validé avant l'audit 06/11 : **×4 en WebGPU, ×2 en WebGL2** (`daa5c6d`, après le correctif
`2cd5fba`). Coût mesuré (mesure finale, estimation des cibles, téléphone) : mémoire GPU vitrine **170 → 369 Mo**,
ouverture 6★ **209 → 342 Mo**, visionneuse **204 → 362 Mo**, fin de parcours **161 → 198 Mo** ; images/s inchangées dans le bruit (le coût de
remplissage ×4 n'est pas mesurable sur GPU logiciel). WebGPU n'expose pas d'attachement « sans mémoire » : cette
mémoire est probablement réelle, même si les GPU à tuiles résolvent sur la puce.
**Repli proposé si l'iPhone manque de mémoire (rechargements « 3D perdue », onglet tué)** : ×1 seulement dans la
visionneuse à DPR 3 (où les marches font ⅓ de pixel CSS et où la carte est grande), ×4 gardé pour la vitrine et
l'ouverture ; ou, sans changement d'image, partager / libérer les cibles MSAA des scènes cachées (deux scènes montées
gardent chacune leurs cibles plein écran : 2 × output + 2 × émissif).

## 8 ter. Cas A1 : la carte des plis au chargement

Le plus gros poste du chargement mesuré (PROFIL A1 : 4,4 s PC / 17,5 s tél. de CPU, 59-62 %) n'est pas la réduction
elle-même mais la **rastérisation différée** de Canvas2D : la 1re lecture de la toile du booster (réduction pour la roue
3D) paie toute sa peinture, dont la carte des plis (~140 plis × 2 traits flous + 40 taches `blur(22px)` + grain sur
640×968). Dans le conteneur, Canvas2D est rastérisé en logiciel (le coût suit le CPU ×4) ; sur un vrai téléphone, les
flous sont faits par le GPU : **coût réel sans doute bien plus faible**, à mesurer sur l'appareil (Performance de
Chrome distant / Safari Web Inspector, tâche longue au chargement). `c0343d8` la peint désormais une fois pour les
5 boosters (le reste n'est plus payé pendant la vitrine), mais la 1re reste sous l'écran de chargement.
Deux pistes au pixel près, à n'engager qu'après mesure sur vrai téléphone : (a) garder la carte rastérisée d'une
visite à l'autre (Cache Storage, PNG sans perte ; gain aux visites suivantes seulement) ; (b) la peindre dans un worker
(OffscreenCanvas : mêmes ordres, rendu identique à prouver par empreintes). Pas de « moins de flous » : changerait les plis.

## 9. Convex (non mesuré en démo — lecture du code et convex-test)

Abonnements ouverts dès le premier écran (connecté) : **12** — `users.me`, `packs.getSealedPack`,
`inventory.myCollection`, `users.friends`, `trades.myTrades`, `missions.mine`, `friends.mine`, `binders.mine`,
`listings.mine`, `feed.recent` (20), `feed.bigPulls`, `economy.state` (`src/core/net/client.ts` l. 270-400,
`src/game/ecoOnline.ts` l. 16). Pages : `listings.open` (échanges), `games.lobby/duel/royale/roulette` (jeux).

Points de coût repérés (ordre de grandeur, à mesurer côté serveur) :
- `users.friends` lit **tous** les utilisateurs et renvoie `lastSeenAt` + `online` : chaque battement de cœur
  (`users.heartbeat` toutes les **35 s** par joueur, `client.ts` l. 419) invalide la requête pour **tous** les clients
  connectés → avec K joueurs en ligne, chaque client reçoit ≈ K mises à jour / 35 s de la liste entière.
- `users.me` relisait **tout l'inventaire** à chaque battement de cœur et à chaque carte gagnée → **fait
  (`cacccf5`)** : plus de lecture d'inventaire (14,2 → 0,22 ms par exécution, convex-test) ; toujours ré-exécutée au
  battement de cœur (document utilisateur), mais 65× moins chère.
- `inventory.myCollection` renvoyait les documents complets (≈ 260 o/carte) en entier à chaque booster ouvert →
  **fait (`6bf34d9`)** : 5 champs, 1 000 cartes 275 → 105 Ko (−62 %, convex-test).
- `feed.bigPulls` parcourt les 400 dernières entrées du fil à chaque invalidation ; `feed.recent` redondant →
  **fait (`6bf34d9`)** : `feed.recent` seulement s'il est lu (HUD du labo, ou repli) ; 12 → 11 abonnements.
- Restent (compromis / décision, §8 C12-C13) : `users.friends` invalidée à chaque battement de cœur de chaque joueur.

## 10. Limites de la mesure

- **GPU logiciel** (SwiftShader) : ≈ 0,3 image/s exécutée en 1920×1080. Les ms/frame absolues ne valent rien ; le
  harnais mesure le travail CPU à la cadence rAF réelle et ne fait exécuter au GPU que les passes non récurrentes quand
  il est en retard (détails : HARNESS.md §4). Les gains purement GPU (remplissage, shaders plus légers, MSAA) ne se
  voient qu'indirectement (`gpu_fps`, indicatif) ; à confirmer sur un vrai appareil.
- Le contexte WebGPU du canvas est émulé (rendu dans une texture hors écran) : même travail, mais pas de présentation.
- Les attentes du thread principal sur le processus GPU (envoi de textures depuis un canvas, création de pipelines)
  sont gonflées par le GPU logiciel : TTI et tâches longues après l'affichage sont bruités ; les jalons fixes
  (boutique affichée, CPU de script jusque-là) sont fiables.
- **Illustrations R2 absentes** en local (404) : cartes peintes en « design typographique » (même code de peinture,
  sans téléchargement ni décodage d'illustration : le coût réel des miniatures est sous-estimé).
- **Convex non mesuré** (démo locale) : voir §9.
- Preset téléphone : bug MSAA ×2 contourné par le harnais (§1) ; le jeu baisse sa définition 3D s'il se croit lent
  (surveiller `dpr3d`).
- Pas de gyroscope, pas d'audio réel (sans sortie), pas de vrai réseau mobile (émulé).
- Mesure finale : PC par `run.sh` ; téléphone relancé seul (même build) après un arrêt du serveur — mêmes conditions.
- Les gains purement GPU (bloom sauté, MSAA) se voient en soumissions / draw calls, pas en images/s (GPU logiciel).

## 9 bis. Déploiement (ordre)

1. **Site d'abord** (Cloudflare Pages : `lanceurs\push-et-mettre-en-ligne.cmd`).
2. **Puis Convex** (`npm run convex:deploy`) : `convex/inventory.ts` (`myCollection` 5 champs) et `convex/users.ts`
   (`users.me` sans compteurs). Dans cet ordre, aucun client ne voit de champ manquant ; dans l'ordre inverse, le HUD du
   labo d'un onglet ancien afficherait « undefined cartes uniques » jusqu'au rechargement (le jeu n'est pas touché).
   `myCollection` et `feed.recent` sont compatibles dans les deux sens.

## 11. À vérifier sur un vrai téléphone (Tom)

1. **Vitrine, ouverture, visionneuse visibles** en WebGPU (Android Chrome récent, iPhone iOS 26) — c'était noir avant
   `2cd5fba` ; bords lissés (×4).
2. **Mémoire / stabilité avec MSAA ×4** : ouvrir 10 boosters dont une 6★, aller-retour collection / visionneuse,
   passer l'appli en arrière-plan puis revenir : pas de « 3D perdue » ni de rechargement.
3. **Temps avant la boutique** (1re visite, 4G) : le catalogue arrive pendant le démarrage de la 3D ; la tâche longue
   de peinture de la carte des plis (A1) : mesurer sa durée réelle (si > 300 ms, engager une des pistes de §8 ter).
4. 1re ouverture de chaque rareté (surtout 5★ / 6★) : plus d'à-coup à la révélation.
5. Après déploiement Convex : « Gros tirages » toujours affichés, collection à jour après un booster, HUD du labo.
6. PC : après un gros booster ×5 (« Tout passer ») ou une 5★/6★, retour en vitrine : aucun halo résiduel figé
   près du booster (contrôle du bloom à la demande, §12).

## 12. Captures (vérification visuelle)

Captures déterministes (horloge simulée, aléa re-semé avant l'ouverture et la collection, animations CSS figées).
- **PC (1000×760), fusion vs `shots/baseline-rs` (c5b0f81)** : 8/9 identiques au pixel ; `pc-coll` 77 pixels isolés
  aux bords de la grille (zone instable connue, déjà vue entre deux passes de la référence).
- **Téléphone (390×844 DPR 3)** : la fusion diffère de c5b0f81 par le MSAA ×4 voulu (`daa5c6d` : bords lissés, et
  vignettes / fonds rendus par la scène) → comparée à la référence **c5b0f81 + 2cd5fba + daa5c6d** (`shots/ref-msaa`) :
  **9/9 identiques au pixel**.
- **Écrans en plus** (`--only shop,tiers,big`, nouveaux dans le harnais) : révélation une à une d'une 1★, 2★, 3★, 4★
  (tranches colorées, réserve de la revue de `47f2411`) et gros booster ×5 (pile, 1re carte, récap via « Tout passer ») :
  téléphone 8/8 identiques (vs ref-msaa) ; PC 7/8 identiques ; **`pc-big-recap` : 1 904 pixels, écart max 3/255**, stable
  d'une passe à l'autre, lié au bloom à la demande (`160a781`) : avec le saut du bloom désactivé, 8/8 identiques.
  **Analyse (session principale) : artefact du harnais, pas un défaut du jeu.** En mode capture, le harnais n'exécute
  pas le travail GPU des images intermédiaires (`gpuDrop: 'all'`, GPU logiciel trop lent) : le bloom est « calculé »
  côté JS (le jeu note « émissif nul ») mais sa passe GPU est jetée, la texture garde le contenu de la dernière image
  réellement exécutée (capture `big-1`, carte révélée) et la capture du récap la réutilise. Dans un vrai navigateur,
  tout travail soumis est exécuté : la texture vaut 0 et l'image est identique. Contre-épreuves : (1) la condition
  proposée par la revue (gerbe éteinte, lue sur `U.count` / `U.bt`) ne change **rien** à l'écart (1 904 pixels
  identiques) → la gerbe n'est pas la cause ; (2) capture sans abandon GPU (`H_GPU_DROP=off`) : les 5 premiers écrans
  identiques, mais la série a été arrêtée par la limite de temps avant le récap (≈ 10 min par écran en GPU logiciel
  complet) → **preuve directe non obtenue**. Lot `160a781` gardé tel quel ; contrôle à faire sur vrai appareil (§11.6).
  Le harnais accepte désormais `H_GPU_DROP=off` pour refaire cette contre-épreuve.
- **Animations** (`document.getAnimations()` : durées, délais, courbes, images clés) : identiques à la référence pour
  toutes les captures (PC et téléphone, écrans en plus compris).
- Non capturés : scènes 6★ Yu-Gi-Oh / Pokémon / merveilles / secrète, World Pack (éventail), paysage, retour de veille,
  perte de GPU — couverts par la relecture du code (`lots/revue.md`) seulement.
