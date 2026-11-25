# Audit de performances V2 — compte rendu (12/11)

Mode : audit seul. Aucun fichier de code modifié, aucun commit, aucun lanceur.
Base : `v2` telle que poussée sur GitHub (`06f6063`, 12/11). Détail sur le PC : `_hors-site\audit-12-11\` (synthèse : `audit-perf-v2-12-11-detail.md`, décisions : `8-decisions-tom.md`).

## Résultat
- **192 constats** après fusion de 56 doublons : **P0 = 0 · P1 = 16 · P2 = 44 · P3 = 132**.
- Contre-vérification à contexte neuf : aucun P1/P2 rejeté, 43 gravités abaissées, 1 relevée.
- 133 constats sans compromis (18 lots), 50 avec décision visuelle, 9 avec décision de coût. Les 10 principales sont tranchées (voir plus bas).

## Limites (à lire avant de se fier aux chiffres)
- Pas de carte graphique ici : rien de mesuré en 3D, tout est lu dans le code ou calculé.
- Pas de clés ici : pas de rapports `diag-*`, pas de journaux staging frais. Convex = doc de données du 12/11 (prod = V1).
- Banc client en mode démo (5 cartes, sans images) : il mesure la coque, pas une vraie collection.
- Commits locaux non poussés : non audités.

## Les 5 constats qui comptent
1. **Démarrage** (E2-01, E2-02) : 4 calculs de textures bloquent le fil principal sous l'écran de chargement (350–620 ms mesurés sur PC, 1 à 2,5 s estimés sur téléphone), et la vitrine attend le catalogue sans en avoir besoin.
2. **Mémoire iPhone** (E3-01, E3-04, E4-01) : cibles de rendu gardées hors scène et cible morte allouée à chaque Merveille, skin CS ou scène 6★. Pic calculé 800 Mo à 1,2 Go au pire : risque d'onglet tué. Corrections courtes : −150 à −400 Mo.
3. **Classement** (A8-01) : chaque joueur en ligne est recalculé toutes les 5 min, collection entière relue. Premier poste de la facture V2.
4. **Document joueur** (E1-01) : chaque écriture (booster, pièces, battement) relance ≈ 12 requêtes abonnées qui n'ont besoin que de l'identifiant.
5. **Carte 3D** (E4-04, E4-02) : paillettes calculées par pixel puis multipliées par zéro (retrait identique à l'œil) ; à chaque booster, les 5 cartes se construisent dans une seule image (à mesurer avant de coder).

Hors perf, à corriger avant d'ouvrir la V2 : **A5-01**, pièces vides après une connexion par mot de passe jusqu'au rechargement (lu dans le code, non rejoué).

## Lots sans compromis, dans l'ordre
| Lot | Sujet | Constats |
|---|---|---|
| S01 | Bugs avant ouverture (A5-01, presse) | 3 |
| S02 | Mémoire GPU rendue hors scène | 8 |
| S03 | Shader : paillettes mortes, constantes | 3 |
| S04 | Convex : requêtes en identifiant seul | 6 |
| S05 | Classement par signature | 8 |
| S06 | Démarrage : textures en worker, vitrine sans attendre | 6 |
| S07 | Convex : collections relues en entier | 7 |
| S08 | Compilations sur la mauvaise cible | 1 |
| S09 | Booster : nœuds des 5 cartes (mesure d'abord) | 7 |
| S10 à S18 | Cascade locale, écritures sans geste, migrations, listes, images, son, PC, CSS | 84 |

## Décisions prises le 12/11
Fait nouveau : le club passera à 40-50 joueurs dans les prochaines semaines.
1. **Bulles** (E2-03) : gardées seulement sur les menus. — Tom
2. **Lissage ×4** (E3-02) : coupé seulement sur les navigateurs qui le gardent en mémoire. — Tom
3. **Format des tuiles iPhone** (E3-07) : noter d'abord ce que Safari rend ; si c'est du PNG, JPEG pour les tuiles, capture du tirage 6★ inchangée. — délégué
4. **Mode « effets réduits »** : supprimé. La contrainte correspondante de `CLAUDE.md` est à retirer. Par défaut, le réglage « réduire les animations » du téléphone reste respecté (à confirmer). — Tom
5. **Cadence** (E4-18) : 60 images/s au plus sur téléphone ; sur PC, plafond au repos seulement. — délégué
6. **Merveilles et skins CS** (A10-03) : pas de changement. — délégué
7. **Voiles flous** (A3-03) : flou retiré sur téléphone (connexion, sondage). — délégué
8. **Présence dans une table à part** (E1-05) : oui, après S04 et S05, avant l'arrivée des nouveaux joueurs. — délégué
9. **Stockage d'images** (A2-03) : plafond en poids, valeur fixée après mesure sur téléphone. — délégué
10. **« Pour toi » et fiche carte** (A7-02, A7-03) : les deux moitiés, table des souhaits comprise. — délégué

## Coût Convex (estimations)
- V1 mesurée à 20 joueurs : 3,2 Go/j. V2 telle quelle : ≈ 1,0 à 1,2 Go/j. Après les lots : ≈ 0,25 à 0,35 Go/j.
- Les plus chères en V2 : `rankRow` 240 → 50 Mo/j · `friends.mine` 150 → 60 · `users.friends` 136 → 20 (avec E1-05) · `market.board` 76 → 2 · `profile` 66 → < 1 · `refreshMyRank` 60 → 5.
- **À 45 joueurs** (extrapolation) : la liste d'amis passe de ≈ 290 Mo/j à ≈ 1,4 Go/j sans la décision 8 ; « Pour toi » et la fiche carte de ≈ 50 à ≈ 200 Mo/j sans la décision 10.
- `rouletteTick`, `expireTick`, `seasons.tick` : ≈ 0 octet. Seul `refreshRanks` pèse.

## Objectifs proposés
| Mesure | Actuel | Cible |
|---|---|---|
| Boutique à froid, 4G | 4,1 s à 11,9 s (07/11) | ≤ 2,5 s ; ≤ 5 s sur Android 4 Go |
| Tâche la plus longue pendant un geste | 65–95 ms | ≤ 50 ms |
| 1re visite d'une page | 1,4 à 2,2 s | ≤ 300 ms |
| Pic mémoire iPhone | 800 Mo à 1,2 Go (calcul) | ≤ 450 Mo |
| Trames au repos, 5 min | 6 seul, 24 à 20 amis | ≤ 6 |
| I/O Convex par jour, 20 joueurs | ≈ 1,0 Go (V2) | ≤ 0,35 Go |

## À mesurer sur le téléphone (lien V2, `?diag`)
1. Données du site vidées : temps jusqu'à la boutique, à froid puis à chaud.
2. 3 boosters : images > 80 ms à chaque révélation.
3. Collection → carte → retour, 8 fois, dont le Phare et un skin CS : l'onglet se recharge-t-il seul ?
4. Stockage du site après 30 min de jeu (fixe le plafond de la décision 9).
5. Connexion par mot de passe sans recharger : les pièces s'affichent-elles ?
6. Presse : 10 frappes rapides, une frappe perdue ?
7. Onglet Usage du staging après 24 h : `rankRow`, `friends.mine`, `users.friends`.

## État du dépôt
- `.gitignore` : ligne `_hors-site/` ajoutée sur le PC, non commitée (à inclure dans le premier commit de correction).

## Docs dépassés
- `docs/V2-FLUIDITE.md` : fondu entre pages dit désactivé (il est actif) ; cron `markLeader` (n'existe plus).
- « Une image sur deux au repos » et « bloom ¼ » : téléphone seulement.
- Doc de données : « 1 relecture par battement » ; ce sont toutes les écritures du joueur, boosters en tête.

## Non tranché (mesure nécessaire)
- Préchauffage de la visionneuse (E2-09 contre E4-21).
- 185 à 309 recalculs de style par page au banc (M-01) : cause non trouvée.
