# Chantier QOL (confort de jeu) — Hugo + Claude, racine / `v2`

## Fait (26/11)
- Audit de la collection (`src/game/views/collection.ts`) puis de tous les autres écrans (ouverture, marché, échanges, missions, succès, jeux, profil, amis, classement, chat, forge, navigation).
- Liste validée par Hugo, notée dans `EN-COURS.md` (section « QOL » + 2 lignes V3). Aucun code modifié.

## Décisions
- Collection : 1 recherche unique tous thèmes + cartes, 2 « Voir l'album », 3 albums récents / épinglés, 4 « presque finis », 6 fil d'Ariane cliquable, 7 filtres en tiroir au téléphone. Refusé : défilement continu (on garde les pages de 60).
- Autres écrans : A à M sauf I (contrats). Ordre conseillé : C, E, H, A, L.
- Forge : puce « Toutes les 4★ et moins » ; Forge → vente (cartes voulues par d'autres proposées au marché au prix minimum, au-dessus de la valeur de forge ; pas de retour auto à la forge si invendue) ; alerte acheteur (C bis).
- V3 : contrats à retirer ou refondre (plus rentables que vendre / échanger → personne ne vend), retrait propre avec migration + note de patch ; enchères au marché après Forge → vente.

## Vérifié
- Envies d'album / famille existent déjà (`wishFams`, bouton « ♥ Je veux l'album ») ; recherche globale de cartes existe dans la vue Cartes ; « qui veut cette carte » n'existe que carte par carte (`cardPanel.ts`).

## À vérifier par Tom
- Relire la liste QOL et les 2 décisions V3 (contrats, enchères) ; fixer avec Hugo le prix minimum de Forge → vente.

## Fait (27/11) — en ligne en v2.1.34 (`8f3c7cc`, codé par une autre session en parallèle) ; sur `v2` : `27e0ad0` + report `d4d9978` (B réserve vide, G Partager, « −N ») + ours `810b571`
Doublon : deux sessions ont codé le même lot le même jour à partir de la liste d'`EN-COURS.md`. Pour l'éviter, cocher « en cours (session X) » sur la ligne avant de commencer.

### Version `v2` (détail)
- Collection 4 (rangée « Presque finis »), 6 (fil thème › famille › album ; le 1er morceau ramène au thème, plus à la famille), 7 (tiroir « Filtres (n) » ≤ 600 px, bulle du chat masquée pendant).
- Marché C (« ✓ je l'ai » = la carte, toutes raretés ; « ♥ envie » = carte, album ou famille) + filtres « Mes manquantes » / « Mes envies » ; D (vendeur → profil). Classement K (« Tu es Xe » → ma ligne ; filtre « Amis », masqué sans amis donc absent en démo).
- Récap A (« Forger ces doublons (n) » → Forge présélectionnée, rien brûlé ; n = doublons du tirage, peut dépasser ce que la Forge accepte). Forge : puce « Toutes les 4★ et moins ». Roulette J (« Même mise », mises en pièces seulement). E (nom → profil : chat, fiche carte). F (« Message » : profil, ami ; `#/chat/<conv>` garde maintenant l'adresse complète de la page dessous).
- Ménage : `views/defis.ts`, `views/presse.ts`, `defis.css` et leurs textes retirés (`74d08d3`).
- Vérifié en démo (Chrome sans fenêtre, 390 px) : rangée, fil, tiroir, Forge, présélection, classement, Message. Pas vu : marques du marché (aucune annonce en démo), roulette (500 pièces en démo < 1 000), récap réel après ouverture.

## À vérifier par Tom
- Au téléphone, dans le jeu en ligne (v2.1.34) : voir la liste de `v2.1.34.md`. Le lien V3 a la version `v2` (même chose, autre code) : un écart visible entre les deux = le signaler.

## Reste
- « Défier » (F) : pas de lancement de défi vers un joueur sans choisir boosters et mise (`createDuel`) — à concevoir.
- G (amis : suggestions ; le partage est fait), M (push), C bis (alerte acheteur), Forge → vente (chiffrer d'abord la requête groupée « qui veut ces cartes »).
