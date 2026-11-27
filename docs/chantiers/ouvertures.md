# Chantier V3 « ouvertures de booster » — Tom + Claude, racine / `v2`

Décision de Tom (26/11) : retirer Brûlure et Éventail, garder la Déchirure et ses 2 habillages de Noël, ajouter 5 ouvertures à gagner.
Détail des propositions, réserves et outils : `.claude-tmp/ouvertures-v3-etape1.md` (hors git).

## Décisions de Tom (27/11)
- Deux séries de propositions refusées (gestes d'emballage, puis mouvements du sachet et accessoires). Direction : de l'inédit au niveau de la Déchirure (film simulé et cuit, réponse sous le doigt), aucun clin d'œil au thème des cartes, aucun accessoire.
- Succès qui débloquent les 5 : `packs-750`, `burn-250`, `world-150`, `full-15`, `streak-21`, sans lien de thème avec l'ouverture.
- « Fais retroussé en first » : une ouverture codée, les 4 autres attendent son avis.

## Fait (27/11) — « Retroussé », commit `73e9b78`, sur le lien V3
- Geste : glisser vers le bas. La soudure du haut cède, le film se retourne le long d'un pli roulé, les soudures latérales lâchent cran par cran, les cartes restent debout ; puis rangement et pile prête. Succès `packs-750`. Essai sans le succès : `/jeu/?demo&ouverture=retrousse`.
- Simulateur : scénario `scripts/bake-tear/retrousse.mts` (`npm run bake:retrousse`), 2 variantes `public/bake/retrousse-N.tear` (1,1 Mo chacune), contrôles `scripts/bake-tear/check.mts`. `bake.mts` ne gagne que `--out` et `--scenario`.
- Lecteur (`src/core/tearBake.ts`) : une famille de cuissons chargée à la fois, `BAKE_REV_RETROUSSE = 1` ; interpolation dans le repère de la charnière (`src/core/bakeInterp.ts`).
- Scène (`opening.ts`) : `rolling`, `setRollProgress`, `onRolled`, `buildRollMaterials` (envers en métal satiné, `ROLL_INNER`), claquements calés sur les ruptures enregistrées, remontée du cadrage (`ROLL_KEEP`, `ROLL_LIFT_MAX`), butée `rollGate` tant que les cartes ne sont pas prêtes, repli sur la Déchirure si la cuisson n'est pas là. Jetons `RETROUSSE` dans `motion.ts`.
- Données : entrée `OPENINGS`, textes FR + EN, indice, coach. Le filtre de `onlineBackend.ts` garde toute ouverture connue (donc `glace` / `etoile` aussi, sur `v2`).

## Vérifié
- `npm run typecheck`, `tsc -p convex/tsconfig.json`, `npm run test:server` (305), `npm run check:i18n` = 0.
- Déchirure recuite identique à l'octet (`node .cache/bake-ref/nonreg.mjs`) ; son lecteur identique au bit près ; `bakeInterp.ts` allégé identique au bit près (24 000 instants).
- En démo dans un Chrome sans fenêtre (WebGPU), sans erreur : Retroussé au geste et au toucher simple, révélation, Déchirure, glace, Brûlure, Éventail.

## À vérifier par Tom (téléphone, lien V3)
- Rendu du pli et de l'envers, surtout les deux coins bombés du haut au premier tiers du geste.
- Cadrage (film retourné sous le sachet, haut des cartes sous la barre d'onglets ?), sons et vibrations (réglés sans écoute).
- Geste lent / rapide / lâché ; Android : pas de défilement ni de rechargement en glissant vers le bas.
- Série ×5 / ×10, « Tout révéler », 6★ / GOD PACK après un Retroussé ; images/s face à la Déchirure.
- Déchirure, glace, étoile : identiques à avant.

## Fait (27/11 soir) — lots 1 et 2
- Lot 1 (`2aa4e86`) : son propre du Retroussé, livre de sons `ouvertures` cuit à la demande (`src/core/sound/openBank.ts` : `peel` = film qui se décolle, `seal` = soudure qui cède ; sonie alignée par mesure sur l'alu et le tic remplacés ; repli sur eux tant que la cuisson n'est pas faite). Écoute : `.claude-tmp/sons-retrousse/*.wav`. Aperçu dans la fiche d'un booster : vignette au trait par ouverture (`src/game/views/openingPreview.ts`, styles `.pv` dans `progression.css`), jouée à l'affichage, en boucle sur l'ouverture choisie, rejouée au toucher d'une verrouillée.
- Lot 2 : Brûlure et Éventail retirés. `OPENINGS` sans `burn` / `fan` → `setOpening` les refuse comme inconnus ; un choix resté rangé chez un joueur n'est pas migré, `setOpeningChoice` le joue comme la Déchirure (fiche : Déchirure cochée). Scène : l'état vitrine s'appelle `idle` (ex-`burn`, même comportement), plus de maintien / brûlure / éventail (`revealFan`, `dealFan`, `jumpFan`, `fanLayout`, `FAN_MAX`, jetons `TEASE_STAGGER` / `TEASE_LAST_EXTRA`) ; indications « Maintiens / Touche pour ouvrir » et doigts fantômes `hold` / `tap` retirés (FR + EN). Tests : `openings.test.ts` réécrit ; `atelier.test.ts` tolère `burn-250` / `world-150` sans cosmétique (liste `PENDING`, à vider à mesure que leurs ouvertures arrivent).
- Vu dans un Chrome sans fenêtre (WebGPU, démo) : ancien choix `burn` → Déchirure (indication et doigt fantôme compris), Déchirure + révélation + 5★ + récap, Retroussé (geste, film retourné, pile), ×10 Retroussé avec GOD PACK sur le dernier morceau (6★ Zeraora), aucune erreur.

## Fait (27/11 soir) — « Fenêtre » (succès « Braise », `burn-250`), sur le lien V3
- Accord de Tom sur la proposition en 5 lignes (« Go pour braise »). Essai sans le succès : `/jeu/?demo&ouverture=fenetre`.
- Simulateur `scripts/bake-tear/fenetre.mts` (`npm run bake:fenetre`, `54c849f`) : face avant = cadre troué + panneau (grille non uniforme calée sur le contour de la pile), dos entier ; sachet tenu par ses deux crans (le haut libre glissait : le bord du haut ne cédait jamais) ; la pile avance (PUSH 4,5 mm à p = 1), légèrement bombée pendant la poussée (BOW 0,8 mm : les coins tendent le film en premier) ; RUPTURE À L'EFFORT : chaque lien du contour s'use quand l'effort transmis (λ / h²) dépasse son seuil (FBRK 250 ± 15 %, coins × 0,6), cède usé — coins à p 0,16-0,18, fronts jusqu'à p ≈ 0,6, derniers liens au bout du geste (coup sec) ; un bord du trou contre la tranche de la pile est écarté de côté (sinon il explosait) ; sortie : pile à 16 mm en 0,32 s (EASE.glide), panneau plaqué (STICKZ) puis gravité 0,35 g à 0,3 s. 2 variantes de 0,61 Mo, étirement ≤ 4 %. Mesures et réglages : en-tête du fichier ; aperçu hors jeu : `.cache/bake-fenetre/preview-N.json`.
- Format (champs facultatifs, Déchirure recuite identique à l'octet) : nappes `nx` / `xs` / `hole`, scénario `fenetre`, événements `corner` / `free`, `cut` (part du contour rompue par image), `window`. Lecteur : famille `fenetre`, `BAKE_REV_FENETRE = 1`.
- Scène (`aa098d3`) : `windowing`, `winPlayer` (sachet troué + panneau, matériaux du Retroussé + fente de lumière `winSlit`), `winWelds` (butée avant le premier coin, `WIN_NEED`), `winGate`, `winCross` / `winKnock` (coins : `seal` + vibration ; fronts : grains `peel` selon `cut` ; fin : coup sec), `onWindowed` (sortie cuite, sachet qui tombe, pile rangée, `winKeep` / `R.k` / `R.s`), `followZ` = avancée enregistrée. Jetons `FENETRE` (motion.ts). Geste : vertical, vers le bas ou le haut, sur 45 % de l'écran.
- Vu en démo (Chrome sans fenêtre, WebGPU) : geste en 3 temps (coins qui s'allument à p 0,24, fronts, rectangle presque fermé à 0,68), sortie (panneau qui glisse, pile qui ressort par le trou, sachet percé qui tombe), pile prête, aucune erreur. Images/s (PC) : Déchirure 125,5 / Fenêtre 125,2 / Retroussé 126,1.

## Fait (27/11 soir) — Fenêtre retouchée, Déchirure glacée refaite
- Fenêtre (`dfbc2b7`, retours de Tom) : le sachet percé RECULE derrière la pile (FENETRE.recul / reculZ) avant de tomber — tombant devant elle, on croyait voir les cartes sortir par le haut.
- Déchirure glacée (demande de Tom : « un booster pris dans un bloc de glace, 3 coups, le sachet se brise en même temps que la glace, la matière est devenue fragile ; baked ») — `02f76df`, essai : `/jeu/?demo&ouverture=glace`. Cuisson `scripts/bake-tear/glace.mts` (`npm run bake:glace`) : Voronoï 3D de la glace + 2D du film, mêmes graines (les lignes de casse traversent le sachet), serrées autour de l'impact ; faces de cassure niveaux 1 / 2 / 3 ; éclats solides lâchés au passage du front de fissure ; 3 variantes (points d'impact). Format `core/shatterFormat.ts`, lecteur `core/shatterBake.ts`. Scène : style `glace`, `iceTap` (le 1er coup choisit la variante la plus proche), CRACK / FROST, `onShattered`, matière de glace `buildIceMaterial`, givre sur le film (`buildRollMaterials({ frost })`). Sons `iceCrack` / `iceShatter`. Jetons GLACE. Le libellé reste « Déchirure glacée » (promis dans le calendrier), la description change.
- Étoile de Noël : « Poussière d'étoile » acceptée par Tom (tracé doré, le film se change en poussière d'or) — à faire.

## Reste
- [ ] **Avis de Tom au téléphone** : Fenêtre, Déchirure glacée ; puis Étoile de Noël ; puis les 3 ouvertures à gagner restantes (à proposer : nom, geste, rendu, succès parmi `world-150`, `full-15`, `streak-21`).
- [ ] Glace et étoile sont promises en ligne (cases 20 et 23 de l'Avent) : si la V3 ne sort pas avant le 20/12, les joueurs auront l'ancienne version — patch à décider avec Tom.
- [ ] Bruit et masque de la Brûlure dans `buildPackMaterials` (`bakedBurnNoise`, `burnFront`, `U.burn` / `B.burn`, `burnNoise` de `core/tsl`) : inactifs ; la session « sachets » a fini son commit (27/11, 16 h 40), on peut les retirer.
- [ ] Note V3 (`updates.data.ts` + `updates.en.ts`) : une ligne « ouvertures » quand les 5 sont là (Brûlure / Éventail retirés, nouvelles à gagner).
- [ ] Fenêtre, pistes si Tom en veut plus : rides en diagonale peu visibles (poussée plus forte, PUSH / BOW), bord blanchi du film découpé (shader), son propre de perçage.
- [ ] Seuils d'étirement de `check.mts` (1 % / 2 %) : la cuisson est à 2,3 % aux épaules du sachet, le contrôle sort donc en échec ; à revoir après l'avis de Tom (la Déchirure en ligne est à 11 % au même test).
- [x] (v2.1.34) `glace` / `etoile` choisies en ligne : jouées.

## Pièges
- Une soudure du simulateur garde l'écart de repos des deux faces (0,1 mm) : en longueur nulle, les faces se traversent et scintillent au rendu.
- Le film retroussé découvre les cartes pendant le geste : tout ce qui retarde la pile se voit (d'où `rollGate`).
- La cuisson enregistre la levée des cartes avec `RETROUSSE.levee` / `leve` : changer ces jetons demande de recuire.
- (27/11, Fenêtre) Une marge de contact plus grande qu'une maille (FILM_R = 1,6 mm contre 1,44 mm) étire l'arête voisine : 11 % à chaque image. Marge latérale propre : LAT_R = 0,3 mm.
- (27/11, Fenêtre) Panneau plus raide que le film (PSTIFF 3) : il vibre et se plisse dès qu'un coin se libère (XPBD à une itération). Sans adhérence à la carte, il se décolle quand la pile freine et se froisse en l'air.
- (27/11) Chrome sans fenêtre : le port DevTools 9341 était déjà pris par le Chrome d'une autre session (lié sur 127.0.0.1, le mien sur [::1]) — mes commandes ont piloté sa page. Vérifier `netstat` avant de choisir un port. Un vite lancé de la racine se bloquait (CPU continu) : config d'appoint qui ignore `.wt-*`, `.claude-tmp`, `.cache`, `public/art`, `donnees`… (hmr coupé) → 5 s de chargement.
