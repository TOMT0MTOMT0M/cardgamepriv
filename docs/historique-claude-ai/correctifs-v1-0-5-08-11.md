# Correctifs V1 du 08/11 — tag v1.0.5 (master)

## 1. Images 5/6★ remplacées (27)
Fichiers dans `public/art` (hors git), miniatures refaites, originaux dans `sauvegardes/images-remplacees-08-11/`.
Révision `?v=` posée par `art-rev.mjs` à la mise en ligne → Collection, Vitrine, détail, Gros tirages, miniatures relisent tout depuis le catalogue (aucune adresse figée en base).
Cartes : Frédérick Bousquet, Altaïr, Brice Agostini (Brice de Nice), Captain Price, Carol Peletier, Chamber, Championnat du monde de LoL, Ciri (jeu), Clank, Didier Drogba, Dream (Sandman), Edward Elric, Felix Brych, Jonesy (3★), Heidi, Malabar, Mark Cavendish, Mastu, Michael Jordan, Nés sous la même étoile, Panthère des neiges, Pitbull, Robert Pires, Slipknot, Tim Duncan, Usain Bolt, Viper.

## 2. Prisme occidental — 123 cartes renotées
`src/core/sets/curation.ts` → `RERATE_08_11`, appliqué dans `installCatalog` (jeu + serveur). Inventaires réalignés par `migrations:resyncRarities`.
- Musique indienne : Asha Bhosle 6→3, Lata Mangeshkar 5→3, A. R. Rahman 5→3, SPB / Yesudas / Susheela / Janaki 6→2, Mano / Karthik →1, chanteurs 4★ (Shaan, Kumar Sanu…) →1-2 ; J/K-pop de niche (AKB48, Super Junior, Girls' Generation, BoA) 4→2.
- Acteurs : SRK 6→3, Rajinikanth 6→3, Salman / Akshay / Mammootty / Mohanlal 6→2, Aamir 5→2, Tollywood/Kollywood 5→1… ; 4★ indiens →1-2.
- Cricket (Tendulkar 6→4, Kohli 5→3…), badminton (Saina Nehwal 6→3…), tennis de table (Feng Tianwei 6→3…), sumo (5→2-3), mégapoles chinoises (Chongqing / Chengdu 6→3, Canton / Shenzhen 6→4…), YouTubeurs brésiliens 4→2, Arijit Singh (album) 4→1.
- Gardés : Jackie Chan, BTS, Blackpink, Psy, Ryuichi Sakamoto, Bombay/Delhi 4, Sydney 5.
- Non traité (à voir) : Summoners War a 31 cartes 5/6★ ; Wolfgang Dziony 5★ (obscur, occidental).

## 3. Battle Royale multi-boosters
1 à 5 boosters par joueur (`ROYALE_MAX_PACKS`), fixé à la création, identique pour tous ; total d'étoiles de toutes les cartes ; winner takes all / ex æquo inchangés. Schéma : `royales.packCount` optionnel (absent = 1). Tests convex ajoutés (96 passent).

## 4. Purge des cartes sans vraie image
Toutes les cartes du catalogue ont un fichier : les « sans image » restantes étaient des **placeholders** (NO IMAGE ×66, IMAGE MANQUANTE ×19, icône de personne, croix, aplat gris, anneaux olympiques / drapeau de Valence / médaille génériques à la place d'athlètes). Scan des 37 088 miniatures (doublons exacts + sosies + aplats).
→ 123 cartes 1★–4★ purgées (`PURGE_08_11`, ajoutées à `PURGED_CARD_IDS` → `migrations:purgeCards`). 5★/6★ gardées : Jean-Pierre Aumont, JO d'été, JO d'hiver, Patrick Berhault, Couteau (Deluxe) Valorant.
Pas purgées (vraie image mais générique / fausse, à revoir) : Tekken (21 persos sur l'affiche Tekken 7), Mortal Kombat (12), Mario Party 1-10 (même jaquette), Star Fox (6), FNAF (6), FIFA 97 (4)…

## 5. Pitbull → « International Love »
`musicPreviews.data.ts` + `music-previews.json` + choix forcé dans `harvest-music-previews.py`.

## Mise en ligne
Faite depuis la copie de travail `.wt-master` (une autre session travaillait sur v2 dans le dossier principal) : `.wt-master\lanceurs\mettre-en-ligne-prod.cmd`, puis `lanceurs\push.cmd`.

## Fusion dans la V2 — faite (08/11, commit `17a86d3` sur `v2`)
`git merge master` dans `v2`. Un seul conflit, dans `src/game/views/games.ts` : la fiche d'enjeu de la Battle Royale (grille Enjeu / Victoire / Défaite / Ex æquo de la refonte « usinage ») prend maintenant le nombre de boosters choisi (n boosters, n × 5 cartes). Ajouts côté V2 : accueil « Mise 1–5 boosters » pour la Royale ; sélecteur « Boosters par joueur » redessiné dans casino.css (choix en blanc plein). Vérifié : tsc, 96 tests vitest, build, Royale à 3 boosters jouée en démo (lobby, salle, ouverture). Reste à pousser (`lanceurs\push.cmd`) puis `lanceurs\mettre-en-ligne-v2.cmd` (les migrations `resyncRarities` / `purgeCards` passent sur le staging).
