# Ouvertures à débloquer + Saisons (11/11)

**État : codées sur la branche `wip/progression` (`53450e2` ouvertures, `41fd712` saisons). Pas encore fusionnées dans v2 ni en ligne.**

## Fait
- **Ouvertures à débloquer**
  - La déchirure reste l'animation par défaut. La brûlure et l'éventail, masqués depuis le 07/11, se gagnent chacun avec un succès.
  - Le choix se fait dans la fiche booster (bloc « Animation d'ouverture ») et vaut pour tous les boosters.
  - Le serveur refuse une animation verrouillée (`profiles.setOpening`) et range le choix dans `users.cosmetics.opening`.
- **Saisons mensuelles**
  - Une saison dure un mois, à l'heure de Paris. Le score est le nombre de cartes différentes gagnées depuis le début du mois ; en cas d'égalité, le nombre de boosters ouverts départage.
  - Un cron horaire (`convex/seasons.ts`) ouvre la saison et y ajoute les nouveaux joueurs. Au changement de mois, il fige le classement, distribue les récompenses puis ouvre la saison suivante.
  - Repasser le cron ne redonne rien.
- **Classement** : un onglet « Saison » (date de fin, récompenses, classement du mois) et un historique « Saisons passées » (podiums, mon rang, mes boosters reçus).
- **Tests** : `convex/openings.test.ts` et `convex/seasons.test.ts`.

## Décisions prises
- **Brûlure** se gagne avec le succès « Braise » (250 doublons brûlés). **Éventail** se gagne avec « Cartographe » (150 cartes World différentes).
- Le World Pack garde la déchirure par défaut. Un choix « Éventail » s'applique à tous les boosters, sauf au-delà de 10 cartes (séries ×5 et ×10), où on revient à la déchirure.
- L'Éclipse, le god pack et les Merveilles se jouent par-dessus n'importe quelle animation.
- **Récompenses de saison**
  - Boosters : 10 pour le 1er, 6 pour le 2e, 4 pour le 3e, 2 du 4e au 10e, 1 pour chaque autre joueur qui a gagné au moins une carte.
  - Le top 3 reçoit le cadre « Podium de saison », le 1er le titre « Champion de saison ».
- La première saison démarre au premier passage du cron après la mise en ligne : novembre sera donc incomplet. Un joueur arrivé en cours de mois compte à partir de son arrivée.
- **Coût serveur** : chaque passage lit une saison et environ 20 lignes de classement, aucune collection. Il n'écrit qu'à l'arrivée d'un joueur et en fin de mois.
- Schéma : nouvelle table `seasons`, le reste en champs optionnels, aucune migration.

## Vérifié / Pas vérifié
- **Vérifié** : type-check du jeu et du serveur, 141 tests serveur. En démo : les textes du bloc « Animation d'ouverture » et l'onglet Saison au téléphone.
- **Pas vérifié** :
  - la brûlure et l'éventail joués à l'écran (pas de 3D dans le VM) ;
  - la lisibilité de l'option choisie dans le bloc (bordures et libellé absents de la capture sur PC, alors que les styles calculés sont justes) ;
  - une vraie fin de mois sur le staging.

## À vérifier par Tom
1. Fiche booster, au téléphone et sur PC : le bloc « Animation d'ouverture » se lit, l'option choisie se voit.
2. Sur le staging, mettre `econ.burned` à 250 ou plus, choisir Brûlure, puis ouvrir ×1 et ×5. Faire de même avec Éventail : le ×5 doit repasser en déchirure.
3. L'Éclipse Berserk et le god pack avec la brûlure, puis avec l'éventail.
4. Classement → Saison : la saison de novembre doit apparaître dans l'heure qui suit la mise en ligne. Pour simuler une fin de mois sur le staging seulement : `npx convex run seasons:tick '{"now": 1796079600000}'`.
5. Valider les seuils (250 et 150) et le nombre de boosters par rang.
