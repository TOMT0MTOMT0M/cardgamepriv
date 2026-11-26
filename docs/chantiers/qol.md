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

## Reste
- Coder collection 1-2-3 (front seul), puis C, E, H, A, L. Chiffrer Forge → vente (requête groupée « qui veut ces cartes », coût Convex) avant de s'y mettre.
