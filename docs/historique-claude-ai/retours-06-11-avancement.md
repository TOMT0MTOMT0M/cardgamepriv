# Retours 06/11 — avancement (commit 0014d4d, à pousser via lanceurs\push-et-mettre-en-ligne.cmd)

- **Son** : la visionneuse est muette quand on ouvre une carte de la collection (`viewer.show(..., { quiet: true })`). Ouverture : son seulement pour la dernière carte du booster (ou du gros booster) et pour les 5★ / 6★ (`quietCard` dans opening.ts).
- **Effets des cartes** adoucis : plafonds holo (HOLO_LIMITS.full image 0,1 · bordure 0,72 · éclats 0,55), plus de fond irisé à l'épique (à partir de la 5★, 0,7), aberration chromatique (franges bleu/rouge) seulement pour la 6★.
- **Thème / sous-thème sur la carte** : sous-thème en grand et groupe en bas partout, SAUF Pokémon, LoL, Valorant, CS (`FAMILY_FIRST` dans themes.ts).
- **Gabarit Paysage** (2e style, photos horizontales ≥ 1,2) : designs/paysage.ts — photo entière en bande pleine largeur, passe-partout mat en bas (famille, nom centré, artiste · sous-famille). `LANDSCAPE.design = 'paysage'`. Cache des cartes peintes v5.
- **Ouverture** : retournements ≈ ×2,2 plus lents (TIER_BEAT, core/motion.ts). ×5 / ×10 = UN booster de 25 / 50 cartes : toutes les cartes triées de la moins rare à la plus rare, montrées en morceaux de 5 sans nouvel emballage (`opening.open(..., { continued, seriesLast })`), compteur « 12 / 25 » ; chaque morceau garde l'id d'un vrai booster, crédité du moins bon au meilleur.
- **Boosters** : sachets simples (Bebou gris, Gaming violet, Pop orange, Sport vert, World bleu) avec le logo BÉBOU cartes + le nom du pack (`simple: true`, core/pack.ts) ; dos en métal brossé entièrement métallique.
- **Fiche booster** : sous chaque carte de « Cartes du booster », sa vraie chance par booster (`cardPackChance`, core/packRoll.ts).
- **Suggestions** : modérateurs `users.isModerator` (Hugo, Tom) posés par `admin:setModerators` à chaque mise en ligne (ou `npx convex run admin:setModerator '{"name":"hugo"}'`) ; pastille du nombre de nouvelles suggestions sur l'onglet.
- **Personnaliser** : bannière, cadre, couleur et vitrine dans la même palette (ACCENTS, mêmes déblocages) + couleur libre partout ; anciens fonds/cadres encore reconnus, plus proposés.
- **Nouveaux onglets** : Mises à jour (#/maj, données dans src/game/updates.data.ts — ajouter une entrée en tête chaque mois) et Tutoriel (#/tuto, chiffres lus dans le code).
- Bold Frame : « & + × » se lisaient mal → exclus par unicode-range, pris dans la police de repli.
