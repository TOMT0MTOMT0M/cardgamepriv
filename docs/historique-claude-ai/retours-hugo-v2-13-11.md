# Retours Hugo sur la V2 (12–13/11)

## Sur `v2` (petits correctifs, avant le gel)
- `e601900` **Déchirure** : la bande kaki sous les crans des packs teintés venait de l'intérieur du film, peint en gris fixe. Il prend maintenant la teinte du sachet.
- `6413ec0` **Booster du moment sur PC** : il se superposait au Bebou Pack dans la roue verticale. Il prend maintenant le cran du milieu.
- `0b95132` **Lot 1** : visionneuse alignée ; plus de « toc » au toucher d'une carte ; collection sur 5 colonnes au lieu de 6 ; case MYTHIQUE dans la scène 6★ CS.

## Sur la branche `wip/retours-hugo` (hors V2 prod du 14/11, gel oblige)
- `3137f5b` **Lots 2, 3, 4 et 9** :
  - Échanges devient **Marché**, avec un nouvel onglet **Vendre · Échanger** : vente à prix fixe ou échange (tableau d'offres rouvert, 24 ou 48 h).
  - Les cartes du marché se touchent pour ouvrir leur fiche.
  - **Prix moyen** des 20 dernières ventes.
  - **Boosters en pièces sans plafond quotidien** (250, 10 au plus par achat).
  - **Défis et La Presse retirés** de l'accueil des Jeux (les défis en cours restent visibles).
- `2383316` **Lots 6, 7 et 8** :
  - **Succès en pastilles** ;
  - **Classement plus visuel** : médailles, marches, barres, carte « ta place » ;
  - **Barres de musique** derrière la carte dans la visionneuse.
- **En attente du PC** (patches prêts, à appliquer dans cet ordre sur `2383316`) :
  - `lot-5.patch` (déjà sur le disque, `.claude-tmp/xfer/`) — **roulette** : vraie roue SVG, rejeu du dernier tirage à la connexion (une fois par tirage, moins de 13 h), notification 10 min avant (type push `roulette` à cocher, `rouletteRounds.warned` optionnel, test ajouté).
  - `lot-11.patch` — **booster du moment dans la roue** :
    - il a sa pochette en tête de la roue (téléphone) et de la roue verticale (PC) tant qu'il dure, puis elle disparaît avec lui ;
    - toucher le bandeau fait tourner la roue jusqu'à lui ;
    - sa mini-pochette 3D est refaite quand l'événement change.
- Vérifié : tsc (client et convex), test:sound, tests serveur (5 échecs déjà présents sans ces lots, dans ma copie seulement), rendus headless PC et téléphone ; lot 11 contrôlé par l'état de la scène (pochette au milieu, grand booster = événement, fiche fermée comprise).
- `.wt-hugo` a été créé depuis le VM : inutilisable sous Windows (`git worktree prune`, la branche reste).

## Pour Hugo
- **6★ à refaire en pleine illustration : 333 photos** (L/H > 0,82). Liste : `6etoiles-photos-a-remplacer-13-11.csv` à la racine. Pop Culture 240, Sport 59, Nourriture 12, Jeux vidéo 7, Lieux 6, Voitures 6, Animaux 3. Les CS, Pokémon et Valorant (126) sont laissés de côté.

## Reste
- Après la sortie du 14/11 : fusionner `wip/retours-hugo` dans `v2`, puis le lien V2 pour tester avec Hugo.
