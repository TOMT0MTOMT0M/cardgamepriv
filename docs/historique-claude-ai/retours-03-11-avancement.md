# Retours validés du 03/11 — avancement

Source : récap « BEBOU CARD — modifs validées » (session retours du 03/11/2026). Découpage en 4 phases, une branche git par phase.

## Phase 1 — boucle principale (sections 0, 1, 2) — FAIT, branche `feat/phase-1-boucle-principale`, commit `cf09a5a`

**Point 0 (vérifié, rien à changer)**
- Les odds affichées viennent de `packOdds()` / `slotShare()` (`src/core/dropRates.ts`) = vrais poids du tirage, pas la part des cartes en BDD. 6★ = 2,48 % par booster (« 1 sur 40 ») ; part par carte : 46,6 / 21,6 / 22,3 / 7 / 2 / 0,5 %.
- Bébou secret : `BEBOU_SECRET_CHANCE = 1 / GAME_CARD_COUNT` (dynamique, côté pondération, partagé client/serveur).
- Collection : les tuiles possédées affichent déjà la vraie carte (`cardImages.ts`).

**Serveur / logique partagée**
- `src/core/pity.ts` : `PITY_LIMIT = 200`, compteur `users.pityCount` avancé au tirage (`preparePack`), remis à zéro dès qu'une Mythique ou une Secrète tombe. Forçage via `PackRequest.forceMythic` (emplacement garanti → mythique). Calibrage : 200 boosters secs ≈ 0,66 %.
- Envies : `users.wishlist` (ids), mutation `users.toggleWish`, 300 max. Exposées dans `GameState.wishlist`.
- Série de connexion : `src/core/streak.ts` (`users.streak {count, day, rewardedAt}`), avancée au premier `heartbeat` du jour (le client en envoie un dès le chargement et au retour sur l'onglet), récompense `claimStreak` = +5 boosters au jour 7 de chaque cycle. Jour sauté → retour à 1.
- Tests : `convex/game.test.ts` (+4 : pity, envies, série) et `scripts/test-rolls.mts` (pity, pire série sèche ≤ 199).

**Boutique (`src/game/views/shop.ts`, `packSheet.ts`, `bigPulls.ts`, `status.ts`)**
- Sidebar et panneau d'odds supprimés. Rangée de 5 pochettes (visuel = face du vrai booster rendue par la scène), ordre Gaming · Pop · **Bebou (signature, plus grand)** · Sport · World ; Pop et Sport grisés avec sceau « BIENTÔT ».
- Fiche booster en overlay (panneau droit sur ordinateur, feuille basse sur téléphone ; fermeture croix / clic hors zone / Échap / retour téléphone) : 5 cartes, ★★★ garantie, barres 1★→6★ en %, pity « X avant 6★ sûr », ligne « 1 chance sur N » (Bebou), « Voir les X cartes » (grille par sous-thème, possédées en couleur / manquantes grisées, recherche, filtres Toutes / Manquantes / Envies, ♥ sur les manquantes), « X de tes envies dans ce booster », Ouvrir ×1/×5/×10 avec réserve / minuteur.
- Fil « Gros tirages » en haut de l'accueil, horizontal, Bébous secrets affichés normalement, animation dédiée 6★ (liseré arc-en-ciel) et secrète (halo rose).
- Icônes de statut dans l'en-tête : série de connexion « 3/7 » (pastille + flamme quand la récompense est à réclamer) et compteur pity, chacune avec son panneau.
- Lien direct vers une fiche : `#/boutique/<bebou|gaming|pop|sport|monde>` (utilisé par les « Go » des missions).

**Ouverture (`src/game/scenes/opening.ts`, `shop.ts`)**
- Fond du récap dynamique selon le meilleur drop (lueur radiale de la rareté, intensité croissante, rayons + particules couleur du pack ; arc-en-ciel pour une 6★).
- Badges NOUVELLE / DOUBLON ×n posés sur les cartes de l'éventail 3D (suivent les cartes) ; panneau bas = ligne résumé compacte (X nouvelles · Y doublons · meilleure carte · compteur « Gaming : 143/8 643 ») + 3 boutons.
- Zoom overlay d'une carte : fermeture clic hors zone / croix / Échap / retour, retour à l'éventail intact.
- 6★ plein écran : pause dramatique (2,6 s), écran assombri, burst prismatique, étoiles une à une avec carillons, titre « MYTHIQUE », puis clic → récap (`phase 'mythicHold'`).
- Bouton « Tout révéler » (`setAuto({ reveal: true })`) : tout se retourne tout seul, la 6★ garde son plein écran. « Tout passer » reste (crédit sans regarder).
- Teasing au dos : tranche lumineuse dorée (5★) / blanche (6★) avant retournement.

**Écarts assumés / à valider avec le groupe**
- Couleurs de rareté : la palette existante du jeu est gardée (5★ doré, 6★ blanc prismatique, secrète rose) plutôt que « violet 5★ / bleu 4★ » du récap, pour rester cohérent avec les cartes, les tuiles et le fil.
- Vérification visuelle faite en WebGL headless (pas de WebGPU logiciel fiable) : l'ouverture 3D complète (brûlure au maintien, 6★ plein écran, éventail) reste à regarder sur une vraie machine.

## Phase 2 — collection & navigation (sections 3, 4, 5) — FAIT, branche `feat/phase-2-collection` (sur la phase 1), commit `f2c4e37`

**Serveur**
- Classeurs : table `binders` (`convex/binders.ts` : `mine`, `create`, `rename`, `remove`, `setCards` (ordre), `toggleCard`, `setCover`, `pin` — un seul épinglé), 30 classeurs / 500 cartes max. Le profil public (`profiles.profile`) renvoie `pinnedBinder`.
- Pochettes de sous-thème : `users.covers` (sous-thème → carte), mutation `users.setSubthemeCover`. Date d'obtention : `inventory.firstPulledAt` exposée (`PlayerCard.firstPulledAt`).

**Missions + son (`views/missions.ts`, `main.ts`, `core/audio.ts`)**
- « Go » par mission : fiche booster (`#/boutique/<pack>`), contrats, échanges. Mission réclamée teintée vert/or. Pastille : déjà en place (nombre à réclamer).
- Curseur de volume (0–100) à côté du haut-parleur (survol / toucher), mémorisé (`bebou.volume`), `Sfx.setVolume`.

**Collection (`views/collection.ts`, refonte complète)**
- Onglets : Gaming · Pop · Sport · World · Les Bébous · Classeurs. Un thème s'ouvre sur sa vue ALBUMS (mosaïque de sous-thèmes : pochette, nom, groupe, X / Y, barre colorée par sous-thème ; recherche ; tri Complétion / Par groupe / A→Z). Les Bébous : grille directe.
- Pochette hybride : carte épinglée à la main (📌), sinon meilleure carte possédée (rareté puis numéro), sinon icône (code du sous-thème).
- Grille d'un album : pagination 60/page (‹ 1 … 4 5 6 … 20 ›), tri N° / Étoiles / Récentes, filtres Toutes / Possédées / Manquantes / Doublons / Nouvelles + étoile + recherche, persistants (`bebou.coll.v2`). ♥ sur les cartes manquantes (envies). En-tête complétion (uniques, %, doublons, par étoile) du thème ou de l'album.
- Carte focus : + Envie, + Classeur (cases à cocher multi-classeurs + « Nouveau classeur avec cette carte »), Échanger (va aux échanges, carte pré-remplie dans « Je donne » dès qu'un ami est choisi), Pochette (épingle / désépingle pour l'album), date d'obtention.
- Classeurs : liste (couverture, nb de cartes, ★ profil), détail (renommer, épingler, réorganiser par glisser-déposer souris/doigt, ✕ retirer, ⌂ couverture, supprimer). Le classeur épinglé s'affiche sur le profil (le sien et celui des potes).
- Liens : `#/collection/<sous-thème>` (grille), `#/collection/<groupe>` (albums filtrés, ex. `pokemon`), `#/collection/<thème>`, `#/collection/classeurs`, `#/collection/nouvelles`.

**À noter** : un autre agent a découpé en parallèle les gros sous-thèmes en albums (Pokémon par région, LoL par ligne de skins…) — la vue Albums le prend tel quel (341 albums Gaming au moment du commit). Vérif visuelle : albums, grille, classeurs, carte focus OK en headless ; mobile à regarder sur un vrai téléphone.

## Phase 3 — contrats & échanges (sections 6, 7) — FAIT, branche `feat/phase-3-contrats-echanges` (sur la phase 2), commit `106eafb`

**Serveur (`convex/trades.ts`, `contracts.ts`)**
- Verrouillage : `lockedCards(userId)` = cartes offertes dans mes propositions en attente ; refusées par `propose`/`counter` (« déjà engagée dans un autre échange ») et par `contracts.sign` (doublons libres = count − 1 − engagés). Côté client : `lockedCards(state)` (`backend.ts`).
- Contre-proposition : `trades.counter(tradeId, offered, requested, note)` — destinataire seulement ; original → `status: 'countered'` (+ `counteredBy`), nouvel échange inversé avec `counterOf`.
- Historique : `trades.history` (acceptés / refusés / annulés / contre-proposés, 30 derniers). Envies d'un ami : `trades.wishlistOf(userId)`.
- Coûts (10/10/20/20/50) et cible aléatoire inchangés. 3 tests ajoutés (35 au total).

**Contrats (`views/contracts.ts`)**
- Combustion DOM dans les cases : le feu part d'un point au hasard et ronge chaque carte (masque radial animé, bord incandescent, charbon), braises, en cascade ; puis flammes plein écran (`.ct-flames`) et la carte obtenue émerge dans la visionneuse 3D (mini-révélation : tour + étoiles). Fond dynamique (`.sum-bg`) si 5★ / 6★. L'ancienne scène 3D `scenes/recycle.ts` n'est plus utilisée par les contrats (gardée pour le labo).
- Protections : « Remplir automatiquement » saute les cartes en envies (♥), dans un classeur (▤) ou en pochette (⌂) — badge sur la tuile, brûlables à la main ; cartes engagées dans un échange 🔒 : non brûlables.
- Compteur « X contrats possibles » sur chaque palier ; bouton toujours « Signer le contrat » (actif quand les cases sont pleines).

**Échanges (`views/trades.ts`, refonte)**
- Toucher une carte = zoom 3D avec « + Demander / + Donner » ; « + » du coin = ajout direct (les deux colonnes).
- Filtres sur les deux colonnes : recherche (nom, numéro, sous-thème), étoiles, pack, « mes doublons uniquement » (défaut côté Je donne) / « ses doublons », « qui me manquent / qui lui manquent » (défaut).
- Matchs parfaits : ses doublons qui me manquent ↔ mes doublons libres qui lui manquent, même étoile, envies en priorité, 6 max ; un clic remplit la proposition.
- Badges d'envies croisés : « ♥ tu la cherches » (côté Je demande), « ♥ Léa la cherche » (côté Je donne, via `friendWishlist`).
- Jauge d'équilibre dans la Proposition : barre donne/reçoit + « tu donnes 4★+5★ contre 2★ », avertissement si ratio > 3 ou < 1/3, sans blocage.
- Contre-proposer un échange reçu : le composeur se remplit à l'envers (je donne ce qu'il demandait, je demande ce qu'il offrait), on retire / ajoute, « Renvoyer la contre-proposition ». Historique dépliable sous les amis. Pastille sur ÉCHANGES : déjà en place.
- Mode démo : les robots ont des envies (stables) et répondent aux contre-propositions.

## Phase 4 — profil & classement (section 8) — FAIT, branche `feat/phase-4-profil` (sur la phase 3), commit `1dc4b7e`

**Cosmétiques (`src/core/cosmetics.ts`)** — rien d'achetable, tout se débloque en jouant
- 8 bannières (5 libres + Or à 250 boosters, Prisme avec une 6★, Un de nous avec une secrète), 9 cadres (Bronze 50 / Argent 250 / Or 1 000 boosters, Collectionneur = album à 100 %, Mythique, Un de nous, Négociant 10 échanges, Flamme = série de 7), 12 titres, 10 badges (5 max, ordonnables).
- Conditions = `unlock(stats)` sur `PlayerStats` (`statsFrom(collection, compteurs)`, partagé serveur / client / démo). Pas d'historique de déblocage pour l'instant : c'est la première brique du **système de succès** (phase à part) qui ajoutera défis, notifications et fil « succès débloqués ».

**Serveur (`convex/profiles.ts`)**
- `users.cosmetics` + compteurs `totalTrades` (accept des deux côtés) / `totalContracts` ; `setCosmetics` ne garde que le débloqué (sans erreur).
- `profile` enrichi : `stats`, `streakDay`, `bestDrop`, `themes` (complétion par thème), `pinnedBinder`, `cosmetics`. `leaderboard` (tous les joueurs). `activity(userId)` (index `activityFeed.by_userId`).

**Profil (`views/profile.ts`, refonte)**
- Bannière, avatar + cadre (cadre Mythique = anneau arc-en-ciel animé), pseudo, titre, badges, devise, « joue depuis le ». Bouton « Personnaliser » → panneau bannières / cadres / titres / badges avec le verrouillé grisé et sa condition, aperçu immédiat, Enregistrer.
- Onglets : **Tableau** (complétion %, boosters, 6★, secrètes, série 🔥 X · jour/7, échanges conclus, contrats signés, cartes en tout, doublons, albums à 100 %, plus gros drop (tuile cliquable), complétion par thème, raretés) · **Collection** (vitrine 6 cartes choisies + classeur épinglé) · **Activité** (gros drops 5★+, échanges conclus, contrats signés ; cliquables) · **Classement** (👑 complétion, 6★ & secrets, boosters, échanges, série : podium top 3 + liste, ma ligne surlignée). Lien direct `#/profil/classement`.
- Profil d'un ami : mêmes onglets avec ses données, « Proposer un échange ».

## Backlog (validé, plus tard)
Animations 6★ par thème · missions liées aux features (échange, envies, fil) · notification quand un pote drop une 6★ · **système de succès** (défis, historique, notifications ; cadres/titres/badges déjà câblés sur les stats) · ajustement des coûts de contrats.

## Refusés (ne pas coder)
Booster doré · historique des contrats · choix de la cible des contrats · mini-célébration mission · stats POW/AURA, prix, vente, marché · monétisation · toucher la régénération (1 booster / 5 min).
