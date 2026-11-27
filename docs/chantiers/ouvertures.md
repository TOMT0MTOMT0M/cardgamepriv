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

## Reste
- [ ] Avis de Tom, puis réglages (matière, cadrage, sons).
- [ ] Son propre au Retroussé (banque cuite, `npm run test:sound`) et aperçu dans la feuille de choix (aucune ouverture n'en a).
- [ ] Retrait de `burn` / `fan` : repli client sur `tear`, aucune migration ; `burn-250` et `world-150` débloquent alors une nouvelle ouverture ; code mort de la scène supprimé.
- [ ] 4 autres ouvertures : « Fenêtre » d'abord (demande une rupture des soudures à l'effort dans le simulateur), 3 à trouver avec Tom.
- [ ] Seuils d'étirement de `check.mts` (1 % / 2 %) : la cuisson est à 2,3 % aux épaules du sachet, le contrôle sort donc en échec ; à revoir après l'avis de Tom (la Déchirure en ligne est à 11 % au même test).
- [ ] À trancher, version en ligne : `glace` (case 20) et `etoile` (case 23) choisies en ligne sont ignorées par `onlineBackend.ts` (lu dans le code) ; patch d'une ligne avant le 20/12.

## Pièges
- Une soudure du simulateur garde l'écart de repos des deux faces (0,1 mm) : en longueur nulle, les faces se traversent et scintillent au rendu.
- Le film retroussé découvre les cartes pendant le geste : tout ce qui retarde la pile se voit (d'où `rollGate`).
- La cuisson enregistre la levée des cartes avec `RETROUSSE.levee` / `leve` : changer ces jetons demande de recuire.
