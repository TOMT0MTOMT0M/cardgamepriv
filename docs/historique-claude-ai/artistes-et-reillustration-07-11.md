# Artistes des albums/singles + suivi des cartes à ré-illustrer + perf Convex — 07/11/2026

**En ligne** (13 h 50) : `fix/retours-live-02` poussé jusqu'à `c620e89` (a212d2f Retours live 6 → 31107dc artistes → efca3de cron ASCII → c620e89 perf Convex), Convex dev déployé, Pages https://507fa363.cardgamepriv.pages.dev. La session cloud n'a pas les droits GitHub : les commits passent par des patchs déposés dans `.claude-tmp\` du dossier du jeu + un .cmd (`git am` puis `lanceurs\push-et-mettre-en-ligne.cmd`) lancé par double-clic dans l'Explorateur.

## 0. Convex : dépassement du plan gratuit (07/11)
- Tableau de bord 1er–7 nov. : **Database I/O 4,03 Go / 1 Go** (reste très bas : 81 k appels, 11 Mo stockés). Tom est passé au plan **Starter** (paiement à l'usage, ~0,29 $/Go de lecture en Europe).
- Cause : `users.heartbeat` (client toutes les 35 s) écrivait `lastSeenAt` sur le joueur → toutes ses requêtes ré-exécutées, dont `inventory.myCollection` (1,26 Go) et `economy.state` (1,18 Go) qui relisent tout l'inventaire, + `users.me` (0,98 Go), + amis/classement pour tout le club.
- Correctif `c620e89` : battement sans écriture si rien de neuf, `lastSeenAt` au plus toutes les 4 min (`SEEN_EVERY_MS`, en ligne = 6 min, `ONLINE_MS` client aligné) ; `getUserIdByToken` (session seule) pour myCollection, binders.mine, packs.getSealedPack, trades.myTrades ; `economy.state` ne lit plus l'inventaire, primes de complétion / succès recalculés côté client (`src/game/ecoOnline.ts`, à partir de `achInput` + collection). Attendu : lecture divisée par 5 à 10. À vérifier dans « Usage » d'ici quelques jours.
- Bug corrigé au passage (`efca3de`) : identifiant de cron « classement : numéro un » refusé par Convex (non ASCII) → « numero un ».
- Restes possibles si besoin : `profiles.leaderboard` (relit tous les inventaires à chaque changement, 157 Mo/sem.) → instantané calculé par le cron horaire ; `feed.bigPulls` (136 Mo/sem.).

## 1. Artiste des albums / singles
- 2 499 cartes concernées (Pop Culture : 1 589 Chansons + 910 Albums), extraites dans `scripts/data/music-cards.json`.
- Récolte `scripts/harvest-music-artists.py` (relançable, `k/n` = en parallèle, `music-priority.json` = ids à faire d'abord) : **iTunes** (403 en rafale depuis nos serveurs → 112 cartes), **Deezer** en relève (popularité, 2 499 / 2 499), **MusicBrainz** en recoupement (~1 460), **Wikidata** P175 (passe du 05/11, 2 200).
- Décision `scripts/build-music-artists.py` : vote entre sources (karaoké / tribute / reprises écartés), forme imprimée iTunes > Wikidata > Deezer. **2 107 sûrs · 363 douteux (imprimés avec la meilleure piste) · 29 introuvables (rien d'imprimé).**
- Liste à vérifier : `donnees/suivi/Artistes-albums-singles-a-verifier.xlsx` (392 lignes) — colonne G « Artiste corrigé », « - » = rien. Retour : `python scripts/build-music-artists.py --import <fichier>` → `scripts/data/music-artists-manual.json` (prioritaire).
- Champ dédié : `CatalogEntry.artist` (themesCore.ts, depuis `POP_ARTISTS` de `popArtists.ts`, chargé avec catalogBig) + `CatalogCard.artist` (convex/cardsCatalog.ts).
- Affichage : ligne dédiée **juste sous le titre** sur Pleine illustration (famille + titre remontent de 46 px, DA noir/blanc de Retours live 6 conservée), Suisse paysage (là où vont désormais les pochettes carrées) et Paysage ; la sous-famille reste seule en pied.

## 2. Cartes à ré-illustrer
- Registre partagé = artifact « Cartes à ré-illustrer » (https://claude.ai/artifact/3KLWLv2vA2UYHUFDMYPPe5), slug `12c1afa6-3a72-483f-b0b9-cdad0d920b5e`, base `db` collection `cards` (doc id = id de carte) : name, theme, sub, stars, reason, note, status (`A FAIRE` / `IMAGE FOURNIE` / `REPOUSSEE` / `EN LIGNE`), imageId (asset), imageName, addedBy, addedAt, updatedAt.
- Ajout par recherche dans le catalogue, dépôt d'image par ligne ou en lot (nommées comme la carte, « — sous-thème » pour départager) → IMAGE FOURNIE automatique. Export CSV + copie. Hugo doit être invité en **Éditeur**.
- Pour sortir la liste : `db_query` sur `cards` (where status == …).
- Repush : `scripts/reillustrer.py <dossier>` → save() du thème sous un NOUVEAU nom de fichier `…-rAAMMJJhhmm` + miniature → gen → push-et-mettre-en-ligne. Journal `donnees/suivi/reillustrees.json` → lignes en EN LIGNE. Pokémon / LoL / Valorant / CS / Bébous : à la main.
