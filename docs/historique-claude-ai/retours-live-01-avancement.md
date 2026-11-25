# Retours live n°1 — avancement

Suite de claude/retours-03-11-avancement.md.
## Retours live n°1 (RECAP-RETOURS-LIVE-01) — FAIT, branche `fix/retours-live-01`, commit `93e0a27`

Commencé par un autre agent (arrêté), repris, complété et vérifié. Commit séparé avant : `e1e3c83` (images Monster / Red Bull du patch World V7, sans rapport avec le récap).

- **Classement** (bug) : composant partagé `views/leaderboard.ts` (page `#/classement` + onglet du profil). Podium 2e – 1er – 3e de même gabarit, « toi » = contour + pastille, sans décaler ni redimensionner ; ligne surlignée sans décalage. Vérifié joueur hors top 3 (Complétion, Boosters) et joueur 1er (Série).
- **Volume** (bug) : l'icône ouvre / ferme le panneau (curseur + Couper/Activer) ; clic ailleurs ou Échap ferme. Plus d'ouverture au survol. Vérifié (ouvert → re-clic fermé → clic dehors fermé).
- **Collection** : bascule Cartes / Albums / Classeurs ; arrivée sur Cartes triées par rareté ; tris Rareté / Date / A→Z / Par album ; filtres étoiles + thème + recherche. Vue Albums inchangée.
- **Profil** : vitrine 12 cartes (2 × 6) en tête du Tableau (serveur `setShowcase` max 12) ; « Succès X/Y débloqués » remplace le plus gros drop ; tous les cosmétiques pointent vers un des 36 succès (`src/core/cosmetics.ts`).
- **Gros tirages** : défilement continu en boucle (contenu doublé), pause au survol / au doigt, clic = carte en grand (croix / clic hors zone / Échap), items lisibles (pseudo complet, nom de carte, « il y a X min »).
- **Boutique** : ordinateur > 860 px = 3 colonnes (packs verticaux à gauche avec « bientôt », gros booster centré interactif, fil vertical à droite) ; clic sur un pack = fiche existante. Téléphone : fil en haut, pochettes en bas comme avant.
- **Nav** : Boutique · Collection · Contrats · Échanges · Games · Classement · Succès (pastille = succès à encaisser). Pages `#/classement` et `#/succes`.
- **GAMES** : page « Bientôt » pour tout le monde ; l'espace Jeux complet reste visible des **admins** (et de la démo) pour le tester. Ouverture à tous : `GAMES_OPEN = true` dans `src/core/games.ts`. Les liens du portefeuille vers les jeux sont masqués tant que c'est fermé.
- Tests : 52 passés (vitest), build OK, typecheck front + convex OK.
