# Notifications push, bulles animées, hors connexion — v2 (08/11 → 10/11)

**Dernier commit** : `b3a3a0d` (10/11, bulles ajoutées + « Tout télécharger »). Pas encore poussé.

## 1. Notifications comme une vraie appli (Web Push, gratuit) — 08/11
- `public/sw.js` reçoit la notification même jeu fermé ; un toucher ouvre la bonne page. `convex/push.ts` : un abonnement par appareil, préférences par type, rien entre 23 h et 8 h, regroupement 90 s, « réserve pleine » programmée à l'instant exact. `convex/pushSend.ts` (Node, `web-push`).
- Branché sur : échanges, amis, parrainage payé, défi Pack Battle, gain à la roulette, réserve pleine, annonces (`push:announce`).
- Profil › Compte › « Notifications » : Activer / Couper, cases par type, test, guide iPhone.
- **À faire par Tom (une fois)** : `lanceurs\activer-notifications.cmd` (staging ; `prod` au patch).
- Pas encore fait : rappel « série en danger », tirage de la roulette 10 h / 20 h.

## 2. Bulles animées — 08/11, complétées le 10/11
- `src/game/bubble.ts` : une seule animation pour toutes les pastilles (grandit, bump, éclate en bulle de savon ; fondu en Effets réduits).
- **10/11, bulles ajoutées** (`src/game/navDots.ts`, point doré `.nb-dot`) :
  - Boutique : réserve pleine (sauf quand on y est) ;
  - Jeux : défi reçu, partie jouée (duel, Battle Royale), tirage de roulette où on avait misé — depuis la dernière visite de Jeux ;
  - Amis : filleul inscrit, parrainage payé ;
  - Mises à jour : entrée du journal non lue (en-tête PC, menu du profil et avatar sur téléphone).
- Serveur : `users.gamesNoticeAt` / `users.referralNoticeAt` (optionnels, aucune migration), écrits avec ce qui touche déjà le joueur, lus par `users:me` déjà suivi → aucune requête en plus. 2 tests.
- Laissés tels quels : calendrier et série (flamme dorée + pastille du portefeuille), missions, contrats (solos), classement (à discuter).

## 3. Hors connexion — 10/11 (`src/game/offline.ts`)
- Le jeu s'installait déjà sur l'appareil (fluidité, lot 1). En plus :
  - en fond, une fois par appareil : miniatures des 300 cartes possédées les plus récentes (~4 Mo) ;
  - Profil › Compte › « Hors connexion » : état (jeu installé, illustrations de la collection), **Tout télécharger** (jeu entier dont les Merveilles 3D ~20 Mo, nouveau palier 3 du manifeste ; miniatures de toute la collection ; cartes 4★+ en pleine définition, dans un cache jamais élagué), barre de progression, « Arrêter ».
- Service worker : `/models` en cache d'abord ; `/art` lu d'abord dans le cache « Tout télécharger ».
- Coût : rien côté Convex ; chaque image R2 demandée une fois par appareil.

## Vérifié (10/11)
tsc (jeu + Convex), 114 tests, build ; démo PC et téléphone : pastille Mises à jour qui s'allume puis s'éteint après lecture, fiche Hors connexion et téléchargement complet (32 Mo en local).

## À vérifier sur le lien V2
- Jeux : se faire défier par Hugo → point sur Jeux, qui disparaît en ouvrant Jeux.
- Mises à jour : point au premier lancement, parti après lecture.
- Profil › Compte › Hors connexion › Tout télécharger, puis mode avion : la collection s'affiche.
