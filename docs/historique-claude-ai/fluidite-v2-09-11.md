# Fluidité V2 — état au 11/11

Le détail des mesures est dans `docs/V2-FLUIDITE.md` (section « Fluidité 3 »). Les séries 1 et 2 (09–10/11) sont en ligne sur le lien V2 : jeu installé sur l'appareil, navigation, peinture en worker, préchauffage, coûts Convex réduits.

## Fait le 11/11 — fusionné dans v2 (`dea404c`), pas encore en ligne
- **Collection par différence** (Convex)
  - Le jeu lit la collection en entier une seule fois, puis seulement ce qui change. Côté serveur : champ `inventory.rev` et table `invGone`.
  - Mesuré sur 300 cartes et 6 boosters : 173 754 o → 13 373 o renvoyés.
  - Une seule écriture en plus : quand le dernier exemplaire d'une carte part.
  - `myCollection` reste pour la V1. Pas de migration.
  - Règle pour tout nouveau code : chaque écriture d'inventaire pose `rev: invRev()`, chaque suppression passe par `dropInv`.
  - Corrigé à la fusion : la migration des étoiles (`resyncRarities`) et la purge ne posaient pas `rev`. Après un nouveau tri, la copie du joueur aurait gardé les anciennes étoiles.
- **Page Jeux** : les tâches longues à l'entrée passent de 1 017–1 258 ms à 229–433 ms, la pire de 445–505 ms à 65–95 ms (processeur ralenti ×4). Dessins identiques.
- **Scènes 6★ en 3D** (invocation Yu-Gi-Oh, rencontre Pokémon) : la définition ne change plus en pleine scène, elle attend la fin. Pas mesurable sans vraie carte graphique.
- **`test:rolls`** à jour (les Bébous sont verrouillées).
- **Décisions de Tom** : le statut « Ouvre un booster… » et le cron « Numéro un » horaire sont gardés. Le fondu enchaîné entre pages est actif par défaut (`?vt=0` le coupe).

## Écarté
- **Variante de shader à la 1re ouverture** : la cause est trouvée, mais deux corrections n'ont rien gagné et ont été annulées. Piste suivante : ne rendre aucune image pendant la précompilation des cartes, à juger avec `?diag`.

## À vérifier sur téléphone (lien V2, après `mettre-en-ligne-v2.cmd`)
1. Ouvrir 3 boosters : la collection se met à jour. Un échange qui donne le dernier exemplaire fait disparaître la carte chez les deux joueurs.
2. Après un nouveau tri des étoiles : les cartes déjà tirées affichent bien les nouvelles étoiles.
3. Entrer dans Jeux : plus de gel.
4. `?diag` pendant une invocation Yu-Gi-Oh ou une rencontre Pokémon : pas de saut de netteté.
5. Une semaine après, onglet Convex « Usage » : `inventory:mineSince` faible, `myCollection` presque nul.
