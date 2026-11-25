# Chantier V3 — Marché plus visuel « façon Kyara »

Références de Tom (25/11) : `docs/references/marche-kyara/kyara-acheter.png`, `kyara-vendre.png`.
On s'inspire des PRINCIPES, on ne recopie ni leur interface ni leurs couleurs : tout reste dans notre DA « usinage » (noir/blanc, couleur = information, jetons de `motion.ts`, Bold Frame / Inter, aucun émoji).

## À reprendre
- **La carte est l'annonce** : grande grille de cartes entières (full art), 3 colonnes sur PC, 2 sur téléphone ; le texte se réduit à 3 infos sous la carte : prix, écart au prix médian (« +3 % méd. », couleur selon bon / mauvais prix), vendeur. Fin de vente / « Terminée » en petit à droite.
- **Filtre de rareté en pastilles** de nos couleurs de rareté (gris, vert, bleu, rouge, doré, arc-en-ciel) + « Toutes », à côté d'une seule barre de recherche (perso ou univers) ; « Filtres » regroupe le reste.
- **Onglets courts** : Acheter · Vendre · Échanges · Mon activité (notre « Historique »).
- **Vendre = ma collection en grille**, triée « plus d'exemplaires d'abord » : on voit tout de suite ses doublons et on vend d'un toucher.
- **Échanges dans le chat** : un message peut contenir une carte « J'échange » avec un rappel personnel (« Il te manque » / « Tu l'as déjà (×1) ») et un bouton « Proposer un échange ». À brancher sur notre chat général existant.

## À ne pas reprendre
- Les enchères (refusées : prix fixe, sans enchères, décision du 10/11).
- Les salons multiples et les langues dans le chat (club de 40-50 joueurs : un « chat général » suffit).
- Les logos, idéogrammes et la palette de Kyara.

## Contraintes
Aucune hausse de coûts Convex (pas de requête réactive qui relit les inventaires de tout le monde), textes FR/EN, `check:i18n` = 0, rendu vérifié sur téléphone par Tom ou Hugo.
