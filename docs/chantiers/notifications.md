# Chantier — notifications push (V3)

Branche `v3-notifs` (tirée de `v2` 0260592). Lignes d'EN-COURS : « Notifications : « ta série est en danger » + tirage de la roulette » et QOL « M. Push « missions prêtes / cadeau du jour » ».

## Fait (27/11, `949ebad`)
- **Série en danger** (type `streak`) : à 20 h (Paris), joueur vu hier mais pas aujourd'hui, série ≥ 2 jours → « Ta série de N jours s'arrête à minuit — le cadeau du jour N+1 t'attend ». Un joueur passé aujourd'hui a sa série sauvée : il n'a pas ce push.
- **Missions / cadeau du jour** (type `daily`) : de 9 h à 21 h, joueur passé aujourd'hui puis parti depuis au moins 1 h, avec des missions terminées non récupérées (jour ou semaine) ou le cadeau du calendrier pas pris → un rappel (missions d'abord, cadeau mentionné ; sinon « Ton cadeau du jour t'attend — jour N : X pièces [et Y boosters] »). Rien entre 22 h et 9 h.
- **Plafond** : au plus 1 push par type et par jour (`notify(…, { once })`, table neuve `pushDaily`, lignes de plus de 2 jours purgées à 9 h). Un joueur qui n'est pas passé aujourd'hui ne reçoit que la série en danger (pas de doublon sur le cadeau).
- **Roulette** : résultat envoyé aux joueurs qui ont misé et perdu (« Roulette : le n° 17 est sorti — X rafle le pot » ou « le pot passe au tirage suivant »), type « Jeux » ; le gagnant garde son push habituel. Avertissement « tirage dans 10 min » traduit FR / EN (il était en français pour tout le monde).
- **Réglages** : 2 cases de plus (« Série en danger », « Missions et cadeau du jour »), actives par défaut, y compris pour qui avait déjà réglé ses notifications en V2 (marque `~v3` posée quand les réglages V3 sont enregistrés).
- **Correctif** trouvé par les tests : l'heure de Paris de `convex/push.ts` lisait « 22 h » → NaN, donc la nuit (23 h - 8 h) n'était JAMAIS reconnue : push d'échange / ami / jeux / chat envoyés en pleine nuit au lieu d'être reportés à 8 h, réserve pleine et annonces envoyées la nuit ; titre de la roulette « tirage de NaN h ». Corrigé (fonction de `src/core/games.ts`).
- Cron : `crons.hourly('push : rappels serie et missions', …)` → `rappels.remindTick` (avant le 28/11 : `push.remindTick`, déplacé dans `convex/rappels.ts` par l'audit perf V3 n°10, même code ; dans les journaux, la fonction s'appelle `rappels:remindTick`).

## Décidé (notifs)
- Événement « roulette » retenu : le résultat d'un tirage auquel le joueur a misé (il n'avait qu'une pastille). Écartés : rappel de la mise gratuite de l'abonné (déjà 2 push roulette par jour avec l'avertissement), tirage programmé (existe déjà).
- Résultat de la roulette rangé sous « Jeux » (pas de nouveau type) ; libellé de « Jeux » mis à jour.
- « Missions / cadeau » : seulement pour qui est passé aujourd'hui (rien aux joueurs partis depuis des jours) ; « parti » = dernier signe de vie (`lastSeenAt`) il y a 1 à 2 h.
- Les push ouvrent l'accueil `#/` (missions et calendrier sont des panneaux, pas des pages).
- Pas d'écriture du document joueur (le plafond vit dans `pushDaily`).

## Coût Convex
- Tâche horaire : lit seulement les joueurs repérés par l'index `lastSeenAt` dans une fenêtre d'une heure (9 h : depuis 20 h la veille ; 20 h : vus il y a 18 à 48 h), jamais les inventaires. ≈ 50 joueurs × 2,7 Ko : estimé < 0,5 Mo/jour (≈ 0,2 % des ≈ 240 Mo/jour), 24 appels de fonction/jour + 1 action d'envoi par push, ≤ 2 petites lignes `pushDaily` par joueur et par jour. À mesurer en prod après la sortie (`node scripts/cout-convex.mjs`, `push:remindTick`).

## Vérifié
- `npm run typecheck` OK, `npm run check:i18n` = 0, `npm run test:server` 55 fichiers / 329 tests OK (dont `convex/pushRappels.test.ts`, 9 tests : qui reçoit quoi, langue, plafond, réglage coupé / réglages V2, heure de Paris été / hiver / jours de bascule, nuit, purge, roulette).

## À vérifier par Tom (téléphone, lien V3)
- Profil → Notifications : les 2 nouvelles cases s'affichent bien (texte, retour à la ligne).
- Le lendemain d'une visite, ne pas ouvrir le jeu avant 20 h → push « Ta série… » ; jouer, finir des missions sans les prendre, partir 1 h → push « missions ».
- Un tirage de roulette misé et perdu → push du résultat.

## Reste / questions pour Tom
- Le correctif de la nuit concerne aussi la version en ligne (V2) : à passer en patch joueurs ? (changement visible : plus de push d'échange / chat entre 23 h et 8 h, reportés à 8 h, comme le promet le texte des réglages.)
- Ouvrir directement le panneau Missions / Connexion depuis le push (aujourd'hui : l'accueil).
