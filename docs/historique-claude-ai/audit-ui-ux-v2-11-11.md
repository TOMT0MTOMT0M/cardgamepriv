# Audit UI/UX complet — V2 (11/11)

Base : branche `v2`, commit `6160254`. Rendu : build Vite + `/jeu/?demo&backend=webgl` dans un Chromium sans écran, téléphone 390 × 844 et PC 1440 × 900. Captures : `.wt-audit/.claude-tmp/audit/shots/` (`phone-*.png`, `pc-*.png`). Contrôles automatiques : axe-core (WCAG 2.2 AA) et mesure des cibles et des tailles de texte sur chaque écran.
Niveaux : 🔴 règle absolue brisée · 🟠 importante · 🟡 finition. Effort : XS < 1 h · S ½ j · M 1–2 j · L > 2 j.

## Synthèse : les 10 corrections les plus rentables

| # | Correction | Niveau | Effort |
|---|---|---|---|
| 1 | Corriger les 2 textes qui disent que les pièces n'achètent jamais de cartes et qu'il n'y a « pas de marché » (faux depuis le Marché du 10/11) | 🔴 | XS |
| 2 | Double toucher « Confirmer · 1 250 » sur l'achat de boosters en pièces | 🔴 | S |
| 3 | Noms et rôles accessibles : 10 cases de contrat sans nom, onglets Suggestions sans `role="tab"` | 🔴 | XS |
| 4 | Contraste des missions « à faire » (3,6:1 → ≥ 4,5:1) et cibles de moins de 24 px (« changer », « Go → », lien joueur des Gros tirages) | 🔴 | XS |
| 5 | Bouton Chat flottant : ne plus couvrir « Boutique » dans le récap d'ouverture, « Passer » dans la visite guidée, ni les dernières actions des pages | 🟠 | S |
| 6 | Afficher le compte à rebours du prochain booster (« +1 dans 3:37 ») aussi sur téléphone | 🟠 | S |
| 7 | Onglets coupés sans indice (profil, jeux, classement, tableau d'offres, filtres) : dégradé de bord + flèche, onglet actif ramené en vue | 🟠 | S |
| 8 | Taille de texte minimale : 12 px partout, 13–14 px pour le texte courant au doigt ; Bold Frame seulement à partir de 18 px | 🟠 | M |
| 9 | Remplacer les ~45 émojis couleur (🔒 📌 🎁 🖼 ⏭ 🏆…) par les icônes SVG monochromes déjà utilisées dans l'en-tête | 🟠 | S |
| 10 | Téléphone : navigation principale dans une barre en bas (5 entrées, texte seul) au lieu de 7 onglets qui défilent en haut | 🟠 | L, à valider |

Les points 1 à 7 prennent environ 2 jours au total, ne changent ni la mise en scène ni la DA, et règlent tout ce qui casse une règle absolue. Les points 8 et 10 sont les plus visibles pour les joueurs : à trancher avec Hugo.

Points forts à garder : chances par carte et par booster affichées avant l'ouverture, garantie (pity) expliquée dans la fiche, messages d'échec rassurants (« ce booster n'est pas encore crédité… rien n'est perdu »), états vides avec une action à faire, contour de focus global, coupure de toutes les animations quand l'appareil demande « réduire les animations » (style.css:710), champs à 16 px au doigt (pas de zoom iOS), vibrations réglables, connexion sans e-mail avec un lien pour afficher le mot de passe.

## Règles utilisées (sources)

- **Heuristiques de Nielsen** : n° 1 visibilité de l'état du système, n° 4 cohérence, n° 5 prévention des erreurs, n° 6 reconnaître plutôt que se souvenir, n° 8 design minimaliste. [NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)
- **Onglets** : « The fewer tabs, the better » ; les onglets en carrousel cachent ceux qui ne tiennent pas. [NN/g, Tabs Used Right](https://www.nngroup.com/articles/tabs-used-right/)
- **Lois de l'UX** : Fitts (cible grande et proche du doigt), Hick (moins de choix = décision plus rapide), Jakob (faire comme les apps que les joueurs connaissent), Miller (regrouper), Doherty (réponse en moins de 400 ms). [lawsofux.com](https://lawsofux.com/doherty-threshold/)
- **WCAG 2.2 AA** : 1.4.3 contraste 4,5:1 · 2.5.8 cible ≥ 24 × 24 px ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)), 44 × 44 recommandé pour les actions importantes (2.5.5) · 2.4.11 élément focalisé jamais entièrement caché par un élément collant ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured)) · 4.1.2 nom, rôle, valeur.
- **Apple HIG** : barre d'onglets en bas sur iPhone, toujours visible, sans onglets en débordement ([Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)) ; texte de 17 pt par défaut et 11 pt minimum, plus grand pour une police fantaisie ([Typography](https://developer.apple.com/design/human-interface-guidelines/typography)) ; contrôles de 44 × 44 pt, demander confirmation pour une action difficile à annuler, réduire les animations répétitives ([Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).
- **Material 3** : barre de navigation pour 3 à 5 destinations d'égale importance sur écran compact. [Android Developers](https://developer.android.com/develop/ui/compose/components/navigation-bar)
- **Zone du pouce** : 49 % des usages se font à une main, le haut de l'écran est difficile à atteindre. [Hoober, UXmatters](https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php)
- **Chances et dépenses** : Apple impose d'afficher les chances avant tout tirage payant (règle 3.1.1, [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)) ; la FTC a sanctionné HoYoverse (Genshin) pour des chances et des coûts peu clairs, cachés derrière une monnaie virtuelle ([FTC, 01/2025](https://www.ftc.gov/business-guidance/blog/2025/01/level-tips-businesses-ftcs-settlement-genshin-impact-developer-hoyoverse)).
- **Jeux de collection** : dans Pokémon TCG Pocket, les joueurs se plaignent d'une interface qui cache les boosters plus anciens, d'animations rallongées et de menus répétitifs ; ils demandent que le dernier booster ouvert soit présélectionné ([GamingHQ](https://gaminghq.eu/2025/04/20/pokemon-tcg-pocket-players-request-simpler-pack-opening-experience-after-ongoing-ui-frustrations)). Le moteur social (« Wonder Pick ») y est la plus grosse nouveauté ([PocketGamer.biz](https://www.pocketgamer.biz/game-analysis-the-winning-formula-behind-pokmon-trading-card-game-pocket)).

## Audits précédents : ce qui est réglé, ce qui reste

Les documents d'audit du projet (06/11, audits « interface » et « netteté ») n'ont pas pu être lus d'ici. Point fait sur l'audit du 03/11 (`archives/audit-2026-11-03/`, journaux `fix-*.md`).
- **Réglé** : en-tête téléphone sur 2 rangées · vibrations avec réglage (menu du profil) · service worker en place (`public/sw.js`, ex-PERF2-12) · « Signer » en double toucher pour les gros contrats · champs à 16 px au doigt · focus rendu à l'élément d'origine dans la fiche booster.
- **Reste** :
  - cibles de 40 px au lieu de 44 (UX3-12) ;
  - focus des autres panneaux, comme le portefeuille, les missions ou le chat, non vérifié (UX5-07, partiel) ;
  - onglet « Classement » encore dans le profil (UX3-17) ;
  - choix de la vitrine pas encore en feuille plein écran sur téléphone (UX3-20) ;
  - pagination de la collection au lieu d'un défilement continu (UX3-11) ;
  - dans le composeur d'échange, toucher une carte ouvre le zoom au lieu de l'ajouter (UX4-15). La refonte des échanges en cours s'en occupe, pas de reconception ici.

## Constats détaillés

### 🔴 Règles absolues (6)

**R1 — Textes faux sur l'économie.**
- Règle : Nielsen n° 4 (cohérence). La FTC exige d'être exact sur ce que permet une monnaie virtuelle.
- Où ça casse : le portefeuille dit « pièces 100 % virtuelles · jamais échangeables contre des cartes » (`views/wallet.ts:66`) et la page Jeux dit « les pièces ne servent jamais à acheter des cartes, pas de marché » (`views/games.ts:164`), alors que le Marché vend des cartes en pièces (choix du 10/11). Captures `phone-pop-wallet`, `pc-jeux`.
- Correction : « Pièces 100 % virtuelles : boosters, Marché et jeux. Jamais d'argent réel. » Mettre la même règle dans le tutoriel.
- Effort : XS. DA : aucun changement visuel.

**R2 — 1 250 pièces dépensées en un toucher.**
- Règle : Nielsen n° 5 (prévenir les erreurs). Apple HIG : demander confirmation pour une action difficile à annuler.
- Où ça casse : les boutons « +1 · 250 » et « +5 · 1 250 » de la fiche booster achètent tout de suite (`views/packSheet.ts:144-156`), sans confirmation ni annulation. Captures `phone-o2-sheet`, `pc-boutique`.
- Correction : reprendre le double toucher de « Signer » (UX4-02). Le 1er toucher arme le bouton, qui devient « Confirmer · 1 250 » pendant 3 s, avec le solde restant affiché dessous.
- Effort : S. DA : même bouton, un libellé de plus.

**R3 — Cases de contrat sans nom.**
- Règle : WCAG 4.1.2 (signalé critique par axe, téléphone et PC).
- Où ça casse : 10 boutons `.ct-slot` vides (`views/contracts.ts:184`).
- Correction : `aria-label="Case 3 sur 10, vide"` ou le nom de la carte posée.
- Effort : XS. DA : rien de visible.

**R4 — Onglets Suggestions mal balisés.**
- Règle : WCAG 4.1.2 (axe « aria-required-children », critique).
- Où ça casse : `.sg-tabs` porte `role="tablist"` mais ses boutons n'ont ni `role="tab"` ni `aria-selected` (`views/suggestions.ts:53`).
- Correction : ajouter les rôles, comme les onglets de la connexion (`views/login.ts`).
- Effort : XS. DA : rien de visible.

**R5 — Missions « à faire » trop pâles.**
- Règle : WCAG 1.4.3, contraste 4,5:1.
- Où ça casse : `opacity: 0.72` sur un texte `--ink-3` donne #656565 sur noir, soit 3,6:1, sur 18 éléments par panneau (`style.css:3401-3402`). Capture `phone-pop-missions`.
- Correction : retirer l'opacité et garder `--ink-3` (6,6:1). L'état « à faire » se distingue déjà par le filet et la barre vide.
- Effort : XS. DA : la hiérarchie reste en niveaux de gris.

**R6 — Cibles de moins de 24 px.**
- Règle : WCAG 2.5.8.
- Où ça casse :
  - dans les missions, « changer » mesure 52 × 23 px et « Go → » 33 × 23 px ;
  - dans les Gros tirages, le lien du joueur mesure 117 × 22,7 px (relevé par axe).
- Correction : zone de toucher de 44 px avec `::after` (motif déjà utilisé pour le ♥ des tuiles, UX3-13), sans changer le dessin.
- Effort : XS. DA : invisible.

### 🟠 Importantes (13)

**O1 — Navigation principale hors de portée du pouce.**
- Règle : Apple HIG (barre d'onglets en bas, sans débordement), Material 3 (3 à 5 destinations), loi de Fitts, Hoober (49 % à une main), loi de Jakob (Pokémon TCG Pocket et Dragon Ball ont une barre en bas).
- Où ça casse : 7 onglets défilent en haut et sont coupés à l'écran (« C… », « SUC… », « CLASSEMI… ») (`main.ts:181-190`, `style.css:1642`). Toutes les captures téléphone.
- Correction : barre en bas à 5 entrées : Boutique · Collection · Échanges · Jeux · Club. « Club » regroupe Classement, Succès et Amis en onglets internes. Les compteurs restent en haut. Le chat devient la 6e place ou garde son bouton au-dessus de la barre.
- Effort : L. DA : texte Inter en capitales, sans fond, avec la pastille blanche ronde actuelle (`nav-pill`) qui glisse. Aucune icône cartoon.
- À valider par Tom et Hugo : ça change l'expérience des joueurs.

**O2 — Onglets et filtres coupés sans indice.**
- Règle : NN/g (un onglet caché est un onglet perdu), Nielsen n° 6.
- Où ça casse :
  - onglets du profil : « CLAS… » ;
  - Espace Jeux : « ROULE… » ;
  - Classement : 5 onglets dont 2 invisibles ;
  - Tableau d'offres : « Mes offres » hors de l'écran ;
  - rangs de contrats : 4★→5★ et 5★→6★ ;
  - filtre « World » de la collection.

  Captures `phone-profil`, `phone-jeux`, `phone-classement2`, `phone-tableau`, `phone-contrats`.
- Correction : dégradé de bord et flèche « › » (même composant que `.nav-more`), et l'onglet actif ramené au centre (`showActiveTab` existe déjà pour la nav). Sinon, des libellés plus courts pour que tout tienne.
- Effort : S. DA : le dégradé est noir sur noir.

**O3 — Le bouton Chat recouvre des actions.**
- Règle : WCAG 2.4.11, loi de Fitts (il occupe le meilleur coin du pouce).
- Où ça casse :
  - le récap d'ouverture n'a pas la marge du chat (`chat.css:267` exclut `.shop`), donc « BOUTIQUE » passe sous le bouton (`phone-a2-skip`) ;
  - il cache aussi « Vider » dans les contrats (`phone-contrats`), la flèche de la carte Battle Royale dans les jeux (`phone-jeux`) et « Passer » dans la visite guidée (`phone-g1`) ;
  - il cache la fin des lignes de texte dans Succès et Roulette.
- Correction :
  - masquer le bouton pendant le récap, la visite guidée et les feuilles ;
  - ajouter la marge du bas au récap ;
  - `scroll-padding-bottom` sur les pages ;
  - option : le replier en pastille de 36 px pendant qu'on fait défiler.
- Effort : S. DA : inchangée.

**O4 — Texte trop petit au doigt.**
- Règle : Apple HIG, 11 pt minimum et 17 pt par défaut. Une police fine ou fantaisie doit être plus grande.
- Où ça casse : sur les écrans mesurés, environ 1 100 éléments à 12 px, 300 à 11 px et 190 à 10–10,5 px. Les libellés en capitales `--gm-label` font 10,5 px (`usinage.css:27`). Exemples : « JOUEURS / MISE / GAIN », « PALIER 0/5 », « il y a 4 min », « 4 paliers à découvrir ».
- Correction : au doigt (`@media (pointer: coarse)`), plancher à 12 px, capitales espacées à 11,5–12 px avec un interlettrage réduit (0,12 em au lieu de 0,2 em), texte courant à 13–14 px.
- Effort : M. DA : mêmes polices et même hiérarchie, une échelle au-dessus.

**O5 — Bold Frame utilisée pour des libellés.**
- Règle : Apple HIG (police fantaisie plus grande que le minimum). DA du projet : Bold Frame pour les titres, Inter pour les libellés.
- Où ça casse : 13–16 px de Bold Frame pour les noms de joueurs (classement, Tableau d'offres), les noms d'albums, les titres de succès et de paliers, et les noms dans les tuiles du récap. Très peu lisible : « Léa (robot) », « Schtroumpf… ». Captures `phone-classement2`, `phone-albums`, `phone-a2-skip`.
- Correction : règle unique, Bold Frame à partir de 18 px et Inter 600 en dessous.
- Effort : M. DA : c'est la règle de la DA, appliquée jusqu'au bout.

**O6 — Cibles de 35 à 40 px pour les actions fréquentes.**
- Règle : Apple HIG (44 × 44 pt), WCAG 2.5.5 conseillé.
- Où ça casse :
  - en-tête : avatar 36 × 36, pièces 72 × 36 ;
  - onglets et puces à 40 px ;
  - réglages son et vibrations à 35 px.
- Correction : zone de 44 px avec `::after`, dessin inchangé.
- Effort : S. DA : invisible.

**O7 — Émojis couleur dans l'interface.**
- Règle : DA (noir et blanc, couleur réservée à l'information, pas de cartoon), Nielsen n° 4. Le rendu change selon le système, et sans police d'émojis on voit « ‖ », comme dans les captures `phone-o4` et `phone-o8`.
- Où ça casse : environ 45 émojis (🔒 ×18, 📌 ×8, 🎁 ×3, 👁, 🔥, 👋, 🖼, ⏭, 🎲, 🏆, 👑…). Fichiers les plus touchés : `views/games.ts`, `views/collection.ts`, `views/trades.ts`, `views/shop.ts`, `ui.ts:533`, `scenes/opening.ts`.
- Correction : petites icônes SVG monochromes au trait de 1,8, comme les icônes de `nav-extra` (`main.ts:192`), regroupées dans un module `icons.ts`.
- Effort : S à M. DA : renforcée.

**O8 — Motion : durées en dur et « Effets réduits » incomplet.**
- Règle : règle du repo (jetons de `motion.ts` uniquement), Apple HIG (réduire les animations répétitives).
- Où ça casse :
  - 189 durées ou courbes écrites en dur dans les CSS (`style.css` ×147, `casino.css` ×41…). Exemples : `pack-gain 0.6s`, `breathe-glow 2.6s`, `pop 0.5s` ;
  - le réglage « Effets réduits » du jeu (`body.fx-reduced`) ne coupe qu'une partie des 58 boucles `infinite`. Seul le réglage de l'appareil les coupe toutes (`style.css:710`).
- Correction :
  - remplacer par `var(--dur-*)` / `var(--ease-*)`, en ajoutant au besoin des jetons pour les boucles (respiration, pulsation) ;
  - dupliquer la règle de `style.css:710` sous `body.fx-reduced`.
- Effort : M. DA : identique à l'œil.

**O9 — Régénération invisible au téléphone.**
- Règle : Nielsen n° 1, Doherty (l'attente doit se voir).
- Où ça casse : « +1 dans 3:37 » est masqué au doigt (`style.css:617`), alors que c'est la boucle principale du jeu (1 booster toutes les 5 min). Sur PC il est visible. Captures `phone-boutique` et `pc-boutique`.
- Correction : petite ligne « 3:37 » à 11–12 px sous « 12/15 » quand la réserve n'est pas pleine, en chiffres de largeur fixe.
- Effort : S. DA : texte seul, sans cadre.

**O10 — Compteur de garantie « 0/200 » sans explication.**
- Règle : Nielsen n° 6, clarté des chances.
- Où ça casse : l'en-tête montre « ☆ 0/200 » (`.pt-cnt`, `main.ts:443`). C'est un `span` qui ne réagit pas au toucher, et sur téléphone rien ne dit ce que c'est.
- Correction : en faire un bouton qui ouvre une petite bulle : « Garantie : une 6★ au plus tard dans 200 boosters », avec un lien vers la fiche.
- Effort : S. DA : couleur gardée, c'est de l'information.

**O11 — Visite guidée illisible sur téléphone.**
- Règle : premier lancement. Le texte doit se lire sur n'importe quel fond (WCAG 1.4.3).
- Où ça casse : le texte de l'étape « Les boosters » est posé directement sur le booster 3D (gris sur alu). Le projecteur entoure Boutique et Gros tirages au lieu de la roue des boosters (`views/guide.ts:24`, cible `.packs-row`). Captures `phone-g0`, `phone-g1`. À vérifier sur iPhone : le rendu sans écran est lent.
- Correction : bulle de texte en bas sur un voile noir à 80 %, et cible recalculée une fois la roue en place.
- Effort : S. DA : texte blanc sans cadre sur voile.

**O12 — Pages PC alignées de deux façons.**
- Règle : Gestalt (alignement), Nielsen n° 4.
- Où ça casse : Jeux, Forge, Albums, Contrats et Échanges avec un ami sont calées à gauche (max ≈ 660 px) et laissent la moitié droite vide. Succès, Profil, Mises à jour, Classement et Amis sont centrées. Captures `pc-*`.
- Correction : un conteneur commun centré (max 1 200 px) avec des grilles à 2 colonnes quand il y a la place.
- Effort : S. DA : inchangée.

**O13 — Listes déroulantes et cases natives.**
- Règle : DA, Nielsen n° 4. iOS zoome sur un champ de moins de 16 px.
- Où ça casse :
  - tri du Marché (`.mk-sort`, 12 px, `usinage.css:328`) ;
  - « Adversaire » des duels (`views/games.ts:288`) ;
  - catégorie des Suggestions (`views/suggestions.ts:66`) ;
  - cases à cocher natives du Tableau d'offres (`views/board.ts:91-92`).

  Captures `phone-echanges`, `phone-tableau`.
- Correction : puces `.seg` déjà existantes ou une feuille de choix. Les cases deviennent des puces à bascule.
- Effort : S. DA : remplace des éléments système hors DA.

### 🟡 Finitions (13)

- **F1 — Rail « Gros tirages » sur téléphone** (`phone-boutique`). Vignettes coupées au bord gauche, en concurrence avec le booster (figure/fond), texte « il y a … » faible. Correction : une seule ligne défilante discrète sous l'en-tête, ou le dernier tirage seul qui s'efface. Effort S.
- **F2 — Trois boutons de saut à l'ouverture** (« Direct 4★ », « Tout révéler », « Tout passer »), loi de Hick (`phone-o4`). Correction : deux boutons visibles, le 3e sur un appui long ou dans « … ». À trancher : ce sont les retours d'Hugo du 10/11. Effort XS.
- **F3 — « Touche pour révéler » peu lisible**, blanc sur alu (`phone-o6`). Correction : placer l'indice sous le booster, sur le noir, comme « Glisse vers la droite… ». Effort XS.
- **F4 — Vitrine vide du profil** (`phone-profil`). La phrase en Bold Frame passe sur la grille de 12 cases et n'offre aucune action. Correction : une ligne Inter et un bouton « Ouvrir un booster ». Effort XS.
- **F5 — Récap d'ouverture.** « 0,0 % → 0,0 % » ne dit rien pour 5 cartes sur 37 233. Correction : montrer la progression de l'album le plus touché (« Pokémon 12 → 14/1 025 »). Effort S.
- **F6 — Segment Échanges** : « AVEC UN AMI » tient sur 2 lignes. À régler dans la refonte des échanges en cours. Effort XS.
- **F7 — En-tête PC chargé** : 9 éléments, dont 3 icônes sans libellé (Mises à jour, Tutoriel, Suggestions), loi de Miller. Correction : les ranger dans le menu du profil, comme sur téléphone. Effort S.
- **F8 — Cartes de succès sur PC** (`pc-succes`). Chaque carte répète « 4 paliers à découvrir · se dévoile au palier précédent » (Nielsen n° 8). Correction : une seule ligne « prochain palier » et le reste au toucher. Effort S.
- **F9 — Pages sans squelette de chargement.** Classement et Tableau d'offres sont restés vides plusieurs secondes sur PC pendant la capture, peut-être à cause de la lenteur de la capture. Correction : réutiliser `.tile.skel`. À vérifier sur un vrai appareil. Effort S.
- **F10 — Calendrier de connexion** : un petit trait orange apparaît à côté du « 7 » (`phone-pop-status`), sans doute un reste de pastille. Effort XS.
- **F11 — Fiche booster sur téléphone** : la ligne « Par booster : 4★ et + 1 sur 2,4 · … 6★ 1 sur 40 » n'est visible qu'après défilement. Correction : la remonter sous les barres de chances (clarté des chances). Effort XS.
- **F12 — Menu du profil** : le point blanc sur l'avatar ne dit pas ce qu'il signale (nouvelle mise à jour). Correction : `aria-label` et ligne marquée dans le menu, déjà en partie là. Effort XS.
- **F13 — Roue des boosters sur téléphone** : les pochettes latérales n'offrent qu'une bande de 26 px au toucher (mesure des cibles). Correction : toute la hauteur de la roue sensible au toucher, ou une zone de 44 px. Effort XS. (Le dernier booster choisi est déjà mémorisé, `views/shop.ts:93`, comme le demandent les joueurs de Pokémon TCG Pocket.)

## Non couvert ou à vérifier
- La connexion et la création de compte n'ont pas pu être affichées (mode démo sans serveur). Revue du code (`views/login.ts`) : bon balisage, `autocomplete` correct, rien de bloquant.
- Visionneuse, ouverture complète, visite guidée : vues sur téléphone seulement. Sur PC, l'ouverture n'a pas été jouée (le rendu sans écran est trop lent).
- Les panneaux Missions et Connexion sur PC n'ont pas pu être capturés (3 échecs de capture).
- Sons et vibrations non testés (rendu sans son).
- Chantiers en cours (échanges, événements, saisons, défis, nouveau mini-jeu) : seul leur état actuel est signalé, sans reconception.
