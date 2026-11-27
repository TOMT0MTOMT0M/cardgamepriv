# Packs événement + piste Convex 9 (V3, 27/11) — branche `v3-boosters`

Spécification : `docs/historique-claude-ai/v3-base-etoiles-8-titres-24-11.md` l. 28 ; piste 9 : `convex-pistes.md`.

## Fait
- **Réserve propre du booster d'événement** (`src/core/events.ts` : `eventRegen`, `EVENT_CAP` 3, `SUB_EXTRA_EVENT_PACKS` 2, `EVENT_REGEN_MS` 1 h, `EVENT_LAUNCH_PACKS` 1). Ouvrir un booster d'événement prend SA réserve, plus la réserve normale. Champ joueur `users.ev = { id, n, at, ahead? }` (optionnel) ; un autre événement repart de zéro. Marche pour tout événement créé dans le dashboard (rien de propre à la Télé).
- **Achat** à `EVENT_PACK_PRICE` = 10 × `PACK_PRICE` (2 500, `src/core/economy.ts`) : `packs:buyEventPack`, un par un, dans la réserve de l'événement (peut dépasser le plafond, comme l'achat normal).
- **Abonné** : 5 au lieu de 3 ; avantage affiché sur la page Abonnement (`ab.p5` / `ab.p5d`, déjà traduits).
- **Boutique** : bandeau de l'événement avec la réserve (« 2/3 », « +1 dans 42 min ») ; fiche du booster d'événement : réserve, recharge « 1 par heure », achat +1 à 2 500 ; « Encore un » du récap sur la bonne réserve. Démo (`?demo`) : même règle.
- **Piste 9** : `packs:openPack` (crédit + booster suivant scellé d'avance, réservé, débité à son ouverture), `packs:sealedMine` (lu une fois au démarrage, remplace l'abonnement `getSealedPack`), client `src/core/net/client.ts` (un booster d'avance par sorte, servi sans appel ; repli sur `revealPack` si le serveur n'a pas encore `openPack`). Pity affiché sans spoil (`users.pityHold`). Un jeu ne mise pas un booster réservé (`games.ts`, erreur `packs.6`). Mesures : fiche 9 de `convex-pistes.md` (−43 % lu, −2 écritures par booster).

## Décidé (petites décisions)
- Booster de lancement = la réserve d'un événement démarre à 1 à son début et se recharge depuis ce début (un joueur qui arrive 2 h après en trouve 3).
- Pas de boost ×2 sur la réserve d'événement ; recharge arrêtée à la fin de l'événement.
- Achat d'un booster d'événement : un par un (bouton +1 seul), journal des pièces « Achat de 1 booster ».
- Piste 9 : booster d'avance RÉSERVÉ puis débité à l'ouverture (au lieu de débité au scellage) : la réserve affichée et la recharge gardent leur sens. Un booster d'avance par sorte (Bebou, chaque thème, l'événement) ; il reste pour sa sorte quand on change de sorte. Réserve entièrement réservée : le booster d'avance d'une autre sorte s'ouvre à la place (comme un booster déjà tiré).
- Défis entre amis : un booster d'avance compte à son ouverture (sinon le 1er booster après un défi accepté ne compterait pas).

## Vérifié
- `npm run typecheck` OK ; `npm run check:i18n` = 0.
- `npm run test:server` : 330 passés, 1 sauté, 1 échec par dépassement de temps sous charge (`events.test.ts`, taux sur 30 000 tirages, sans lien) qui passe seul. Nouveaux : `convex/packsAhead.test.ts` (10), `events.test.ts` mis à jour, `coutBoosters.test.ts` (mesure avant / après, empreinte inchangée).
- Démo (Chrome sans fenêtre, 390 et 360 px) : bandeau « RÉSERVE 3/3 », fiche (réserve, achat 2 500), ouverture d'un booster d'événement : réserve d'événement 3 → 2, réserve normale inchangée.

## À vérifier par Tom (téléphone, lien V3)
- Bandeau de l'événement à 360 px : « BOOSTER DU MOMENT » est coupé (« BOOSTE… ») pour faire place à la réserve.
- En ligne : ouvrir 3 boosters d'affilée (Encore un) : la réserve baisse de 1 à chaque fois ; changer de thème puis revenir.
- Un événement de test créé dans `/admin/` : réserve 1 au début, +1 par heure, achat.

## Reste / questions pour Tom
- Les cartes Télé (Hugo) : rien d'inventé ; l'événement Télé se crée dans le dashboard quand elles sont là.
- « Nouvelle carte » d'un booster d'avance : calculée quand il est scellé (une carte obtenue entre-temps par échange peut rester marquée NEW).
- Un tricheur qui lit le réseau voit le contenu du booster d'avance (comme aujourd'hui celui d'un booster tiré) : il ne peut ni le jeter ni le relancer.
