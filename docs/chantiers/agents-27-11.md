# Lots V3 par 12 agents en parallèle (27/11 soir, Tom + Claude)

Demande de Tom : « plusieurs agents opus high, toutes les tâches qui ne demandent pas mon avis (ou un avis basique que tu tranches), push à la fin ». Un worktree par agent (`.wt-<lot>`, branche `v3-<lot>` tirée de `v2` 0260592), fusion dans `.wt-integration` / `v3-integration`, poussé sur `v2`. Fiches par lot : `packs-evenement.md`, `succes.md`, `marche-kyara.md`, `encheres.md`, `social.md`, `notifications.md`, `convex-pistes.md`, `menage-v3.md`, `ouvertures.md`, `ouvertures-propositions.md` ; patch joueurs : `v2.1.43.md`.

## Fait
- **boosters** : réserve propre du booster d'événement (1/h, 3 au plus, 5 abonné, achat 2 500) ; piste 9, un booster = une mutation (13,4 → 7,3 Ko lus par booster).
- **succes** : récompenses en boosters (1 / 3 / 8 / 20 / 50), 27 paliers longs, aperçu des ouvertures à gagner, « bientôt » pour les 3 à venir.
- **marche** : marché « façon Kyara » (Acheter · Vendre · Échanges · Mon activité), échanges dans le chat, alerte acheteur (1 / vendeur / heure), écart au prix conseillé au lieu de « +50 % ».
- **encheres** : enchères 24 / 48 / 72 h, clôture 21 h, pièces bloquées, +5 % mini, prolongation de 5 min si offre dans les 5 dernières minutes (`12a376d`).
- **social** : profils (grille, typo, bannière / GIF / animation), « Défier », amis par suggestions (0 requête), Jeux en 3 étapes.
- **notifs** : série en danger (20 h), missions / cadeau du jour, résultat de la roulette ; a trouvé le bug de la nuit (→ v2.1.43).
- **convex** : collection d'un ami gardée sur l'appareil (3,5 Mo → 12 Ko à la réouverture), présence −79 % d'écritures (« actif récemment »), classement toutes les 30 min (−50 %).
- **menage** : code client des contrats supprimé (serveur gardé), report v2.1.34 vérifié, textes des autocollants laissés (raisons dans `sachets.md`).
- **ouvertures** : rendu WebGL2 et images/s des 5 ouvertures mesurés (0 erreur, pas de fuite) ; 5 propositions → Tom retient Pression, Cône, Fatigue.
- **verifs** : vérifs en ligne sans téléphone (rapport `.claude-tmp/verifs-27-11/RAPPORT.md`), 2 défauts trouvés (→ v2.1.43).
- **licences-jv / licences-pop** : arrêtés par Tom, rien gardé.
- Chef : fusions (CRLF de `localBackend.ts` remis en LF, 3 conflits), test piste 9 rendu stable, note V3 FR + EN, « contrat » retiré du verrou des annonces, patch v2.1.43 (préparé, publié au oui de Tom), 2 blocages du déploiement V3 corrigés (`af6580d`, `fed23c3`).

## Vérifié
- Intégration : `npm run typecheck` OK, `check:i18n` = 0, `test:server` 62 fichiers / 366 tests (1 sauté), `npx tsc -p convex --noEmit` = 0 ; démo intégrée et lien V3 en ligne sans erreur console.
- v2.1.43 : 295 tests sur `master`, défaut de la feuille reproduit puis corrigé à l'écran, mise en ligne OK, MP du bot à Hugo.

## À vérifier par Tom
- Lien V3 au téléphone : liste de la section « Lots V3 des agents » d'`EN-COURS.md`.
- Version des joueurs : feuille « Vendre » au téléphone, pas de notification la nuit, texte des doublons le 01/12.

## Reste
- Coder Pression, Cône, Fatigue (une session par ouverture, avis au téléphone) ; cosmétiques des nouveaux paliers ; éclats `op-fly` ; 5 petits défauts de `verifs` ; licences ; remesurer le coût Convex le 28/11 ; supprimer les 12 worktrees des agents.
