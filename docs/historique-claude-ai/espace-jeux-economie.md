# Espace Jeux & économie — V1 livrée (03/11)

Source : spec « BEBOU CARD — Espace jeux & économie » (03/11). Décisions de Tom au lancement : la série de 7 jours (+5 boosters) est **gardée** en plus du calendrier en pièces ; les missions du jour donnent **boosters + pièces** ; succès en **version simple** (calculés sur les stats).

## Règles d'or (codées)
Les pièces ne servent jamais à acheter des cartes, pas de marché, monnaie 100 % virtuelle. Les jeux ne font que redistribuer (aucun sink en V1).

## Valeur des cartes (table unique — `src/core/economy.ts`)
1★ 5 · 2★ 15 · 3★ 40 · 4★ 100 · 5★ 300 · 6★ 1 000 · secrète 5 000 (en mise seulement, jamais brûlable). Étoiles au Pack Battle : secrète = 7.

## Sources de pièces
- Calendrier 30 jours (suit la série de connexion, jour manqué = jour 1) : 50 → 330 (+10/j), ×2 aux jours 7/14/21, jour 30 = 1 000 + 1 booster. Mois parfait = **7 050** (la spec annonçait ≈ 7 500–8 000 : la formule donne 7 050).
- Missions du jour : leurs boosters + 40/50/60 pièces. Missions de la semaine (3, lundi→dimanche) : 150/200/250.
- Ouverture : bébou pack 10–40, booster de thème 15–50 (tirées avec le booster, créditées au dévoilement ; aussi pour les boosters ouverts en jeu, au joueur qui ouvre).
- Brûlage (« la forge ») : doublons libres seulement, valeur de la table.
- Complétion : 5 × cartes de l'ensemble — chaque album (sous-thème), chaque groupe (Pokémon 1 025 = 5 125…), chaque thème entier ; payée une fois.
- Succès : 36, paliers 50 / 150 / 500 / 2 000.

## Jeux V1
- **1v1 Pack Battle** : N boosters (1–10, sortes libres) + side pot (pièces/cartes) à ±5 % ; invitation ou ouvert à tous ; toute modification remet les validations à zéro ; les deux valident → tout est débité, ouvert et tranché côté serveur en une mutation. Gagnant = toutes les cartes tirées + les 2 side pots ; égalité parfaite = push.
- **Battle Royale** : 3–8 joueurs, 1 booster chacun ; créateur lance dès 3 (auto à 8) ; ex æquo → cartes partagées au hasard.
- **Roulette** : 100 numéros exclusifs, 1 numéro = 100 de valeur, 3 minimum ; tirage quotidien 21 h Paris (cron toutes les 10 min) ; pot reporté si personne ; +1 carte 5★/6★ offerte par tirage. Les cartes misées sortent de l'inventaire (gelées dans le pot).

## Anti-abus (alertes seulement, panneau Admin)
Flux net A→B > 5 000 / 30 j (duels, royales, roulette, échanges — table `valueFlows`) · échanges > 3:1 répétés 3 fois / 30 j · nouveau compte (< 7 j) qui perd ≥ 1 000 vers un ancien · plusieurs comptes sur le même appareil (id d'appareil envoyé au heartbeat). Verdicts « légitime / à surveiller » enregistrés. Admin : `npx convex run admin:setAdmin '{"name":"tom"}'` (ou `activer-jeux-admin.cmd`, qui donne aussi 5 000 pièces de test).

## À surveiller
Équilibrage : un joueur actif qui ouvre ~20 boosters/jour gagne ~550 pièces rien qu'à l'ouverture, + ~230 de calendrier, + missions → au-dessus de la cible 400–600/jour. Levier simple : baisser `PACK_COINS`. V2 prévue : Course de cartes, Crash Bébou, boutique de cosmétiques (sinks).
