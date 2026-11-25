# Classement réparé — v1.0.11 (10/11)

**État** : commité, pas encore en ligne. `master` `82c7fc9` + tag `v1.0.11` (worktree `.wt-master`) ; `v2` `88bd471` (même correctif, rejoué par-dessus les bulles). La session Claude n'a pas le droit de pousser sur GitHub (accès refusé à l'application Claude) : c'est le lanceur qui pousse.

## Cause (probable, la capture Discord n'était pas lisible d'ici)
`profiles:leaderboard` relisait la collection ENTIÈRE de chaque joueur à chaque affichage, et le cron horaire « Numéro un » aussi. Avec la taille des collections depuis l'ouverture, la requête dépasse la limite de Convex (16 384 documents lus par exécution) et échoue.

## Correctif
- Table `rankRows` : une ligne par joueur. `profiles:leaderboard` ne lit qu'elle (même réponse, l'ancien client marche).
- `profiles:refreshRanks` (cron toutes les 5 min) : recalcule les joueurs actifs depuis leur ligne + toute ligne de plus de 6 h, un joueur par requête ; retire les bannis ; marque le « Numéro un » (remplace `markLeader`).
- `profiles:refreshMyRank` : le client recalcule sa propre ligne en ouvrant le classement.
- Entrée « Classement réparé » dans Mises à jour. Test du classement étendu (cron, ma ligne, bannis, Numéro un).

## Vérifié
tsc (jeu + Convex), tests master 113 et v2 114, build sur les deux branches.

## À lancer chez Tom, dans l'ordre
1. `.wt-master\METTRE-EN-LIGNE-v1.0.11.cmd` : push de master, v2 et des tags → mise en ligne prod → classement calculé pour tout le monde → révisions d'images.
2. `lanceurs\mettre-en-ligne-v2.cmd` : le lien V2.

## À vérifier
Sur le site des joueurs : #/classement s'affiche avec tout le monde ; ouvrir un booster puis revenir au classement → ta ligne bouge.
