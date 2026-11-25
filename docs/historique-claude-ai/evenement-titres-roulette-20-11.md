# Événement, titres uniques, roulette, abonnement (20/11)

Branche `v2` (la V3 en préparation), commits `b229350` et `72a7062`, poussés sur GitHub. En ligne sur le lien V2 (staging) depuis le 20/11 à 15 h 22. Rien en prod.

## Livré
- **Onglet Événement** (`#/evenement`) : calendrier de l'Avent en relief (24 volets CSS 3D) + raccourci « booster du moment ».
  - Case N dès le N décembre (heure de Paris, vérifiée serveur), rattrapage jusqu'au 31/12.
  - 5 250 pièces + 35 boosters sur 23 cases ; case 24 = God Pack (le prochain booster ouvert).
  - Cosmétiques de Noël au nombre de cases : 4 → badge, 12 → titre, 18 → cadre, 24 → titre (succès `noel26-…`).
  - Mode test (admins + démo) : jour simulé, « Tout ouvrir », « Tout refermer ».
- **Titres uniques** : Radiant (Valorant), Hokage (Naruto), Maître Pokémon, Challenger (LoL).
  - Table `uniqueTitles`, une ligne par titre ; `titres:claim` lit l'index puis insère dans la même transaction Convex.
  - Réclamé tout seul à 100 % ; section dans Succès ; pastille à côté du pseudo (profil, classement, marché, amis).
  - Ajouter un titre = une ligne dans `src/core/uniqueTitles.ts`. Libérer : `npx convex run titres:revoke '{"titleId":"radiant"}'`.
- **Roulette** : 17 rouges, 17 noirs, 2 verts (18 et 36). Mise couleur 50 à 1 000 pièces, cumulable avec les numéros ; rouge / noir × 2, vert × 10 ; hors du pot.
- **Abonnement à 5 € / mois** (`#/abonnement`, menu du profil + icône de l'en-tête).
  - Paiement Wero, activation à la main : `/admin/` → Abonnements (destinataire Wero, demandes « j'ai payé », + 1 mois, arrêter).
  - Avantages : réserve 15 → 20, carte Bebou à proposer (nom, idée, image), vote du mois (ouvert depuis le dashboard).
  - Rappel 5 jours avant la fin (tâche programmée). Secours : `npx convex run abo:activateCmd '{"name":"tom"}'`.
  - Aucun prestataire de paiement, aucune donnée bancaire en base.

## Technique
- Schéma : champs optionnels seulement + tables `uniqueTitles`, `bebouCards`, `aboPolls`, `aboVotes`. Aucune migration, aucun cron en plus.
- Tests : `avent`, `titres`, `rouletteColors`, `abo`. Typecheck, i18n, build OK. `convex/i18n.test.ts` (catalogue anglais) échouait déjà avant.

## À faire par Tom / Hugo
- Saisir le destinataire Wero dans `/admin/` → Abonnements (sinon « J'ai payé » reste grisé).
- Supprimer les branches `claude-v3-evt` et `claude-v3-abo` (locales et GitHub) et les `.bundle` de `.claude-tmp/`.

## Décisions prises, à valider
- Rattrapage des cases jusqu'au 31/12 ; 2 cases vertes seulement ; mises couleur hors « parties jouées ».
- Abonnement : mois de 30 jours, à la suite du mois en cours ; chiffres du vote visibles après avoir voté ; « où va l'argent » sans pourcentages.
- Carte Bebou : le texte dit « à la prochaine mise à jour », pas « janvier ».

## Reste à faire
1. Collection « Télé » + booster de lancement (cartes = Hugo).
2. Refonte des sachets par thème.
3. Passe « moins de texte » : Marché, Échanges, Pack Battle, Battle Royale.
