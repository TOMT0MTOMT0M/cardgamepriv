# V2 « zéro friction » — mesures, plan, lots (09/11/2026)

Objectif : le ressenti d'un TCG mobile natif dans le navigateur (téléphone d'abord), **sans hausse de coût** (Convex,
R2, Pages). Branche `v2` uniquement. Ce document est tenu à jour lot par lot : mesures avant / après, ce qui est fait,
ce qui est écarté et pourquoi.

## 1. Comment c'est mesuré (et ce que ça ne mesure pas)

Banc : `scripts/mesure/` (`serve.mjs` + `mesure.py`), Chrome piloté par Playwright sur un build **démo** (sans Convex),
images `/art/` relayées depuis le lien V2.

- **Téléphone simulé** : 390×844, DPR 2, CPU ×4, 4G (9 Mbit/s ↓, 1,5 Mbit/s ↑, 85 ms). **PC** : 1440×900, sans bride.
- Mesuré : temps jusqu'à l'interactivité (froid / chaud), requêtes et Ko transférés, tâches longues, temps par image
  (p50 / p90 / max, images > 25 ms) par écran, délai toucher → première image modifiée, tas JS, mémoire GPU déclarée
  par three.js.
- **Limite importante** : la machine de mesure n'a **pas de carte graphique** ; WebGPU y tourne en logiciel
  (SwiftShader). Toute image qui contient de la 3D y prend 0,5 à 4 s. Les temps par image des écrans 3D (boutique,
  ouverture, vue détail) sont donc **inutilisables en valeur absolue** et trop bruités pour comparer deux lots. Ils
  sont donnés pour mémoire. Les vraies valeurs 3D viennent du rapport intégré au jeu (`?diag`, `game/diag.ts`) sur les
  téléphones de Tom et Hugo : c'est la première ligne de la liste « à vérifier » en bas.
- Fiables ici : réseau, poids, cache, tâches longues hors 3D, écrans DOM (collection, échanges, jeux), Convex (lecture
  du code + tests).

## 2. Base (commit `c0257f6`, avant tout changement)

### Démarrage

| | Téléphone simulé | PC |
|---|---|---|
| Interactif à froid (GPU logiciel) | 15,2 s | 14,4 s |
| Interactif à chaud (GPU logiciel) | 19,1 s | 22,3 s |
| Requêtes / poids à froid | 61 · 1 487 Ko (gzip) | 66 · 1 536 Ko |
| Requêtes réseau à chaud | page + ~25 revalidations · 149 Ko | 116 Ko |
| Tâches longues au démarrage | 25 · 9,0 s (pire 3,2 s) | 20 · 7,0 s |
| Tas JS (boutique) / GPU déclaré | 43 Mo / 80 Mo | 91 Mo / 125 Mo |

Le « chaud » plus lent que le « froid » montre le bruit du GPU logiciel : le démarrage est dominé par la création des
pipelines 3D, pas par le réseau. Référence réelle (rapports `?diag` du 07/11) : boutique à 4,1 s (Samsung), 11,9 s
(Chrome Android 4 Go), dont une image de 5 s de création de pipelines.

Poids du chemin critique (build v2, brotli) : **1,16 Mo**, dont catalogue 608 Ko (52 %), three.js 199 Ko, jeu 58 Ko,
CSS 45 Ko, polices 102 Ko. `catalogBig` (480 Ko) n'est pas préchargé par le HTML : il part **après** l'analyse de tout
le reste.

### Écrans (temps par image, ms)

| Écran | Téléphone p50 / p90 / max | PC p50 / p90 / max | Note |
|---|---|---|---|
| Collection, défilement | 16,7 / 16,8 / 117 | 33 / 83 / 433 | DOM, fiable (le PC paie le GPU logiciel en fond) |
| Transition → Échanges | 16,7 / 50 / 150 | 16,7 / 33 / 83 | DOM, fiable |
| Transition → Jeux | 50 / 133 / 1 267 | 50 / 200 / 317 | 1re visite : tâche de 1,4 s (téléphone) |
| Transition → Collection (1re) | 16,7 / 683 / 1 600 | — | 21 tâches longues, 7,5 s cumulés (peinture des 60 cartes) |
| Boutique, vue détail, ouverture | 800 – 6 500 | 1 000 – 4 600 | GPU logiciel : non significatif |

### Toucher → première image modifiée

| Geste | Téléphone | PC |
|---|---|---|
| Boutique → Collection (1re visite) | 2 246 ms | 2 909 ms |
| → Jeux (1re visite) | 1 415 ms | 25 ms |
| → Échanges | 36 ms | 48 ms |
| Tuile → vue détail | 136 ms | 62 ms |
| → Boutique (retour à la 3D) | 605 ms | 616 ms |

### Convex — session type (lecture du code, 10 joueurs en ligne, 30 min, 10 boosters)

≈ **8 700 appels** de fonctions (7 900 ré-exécutions de requêtes, 810 mutations dont 510 battements de cœur),
≈ 125 Mo lus en base, ≈ 3,7 Mo descendants par joueur. Postes : `users.friends` (lit toute la table `users`, relancé
chez tout le monde à chaque écriture sur n'importe quel joueur), `friends.mine`, `myCollection` (toute la collection
renvoyée à chaque booster), `feed.bigPulls` (400 lignes lues puis filtrées), cron `markLeader` (relit tous les
inventaires toutes les heures, ≈ 230 Mo/jour même sans joueur). 12 abonnements permanents, aucun coupé onglet caché.

## 3. Constats classés (gain ressenti / effort)

Issus de quatre audits (rendu, chargement, navigation, Convex) recoupés avec ceux du 06/11. Déjà fait avant cette
mission et non refait : catalogue en deux temps + `JSON.parse`, polices préchargées, `404.html`, `version.json`,
adresses d'images versionnées immuables, cartes peintes en Cache Storage, post-traitement à la demande, bloom ¼,
une image sur deux au repos, `backdrop-filter` coupés sur téléphone, battement qui n'écrit plus que toutes les 4 min.

| # | Constat | Gain | Effort | Lot |
|---|---|---|---|---|
| 1 | Pas de cache applicatif : le service worker ne fait que les notifications, absent de Safari iOS en onglet | démarrage sans réseau, résiste à l'éviction, hors ligne | M | 1 |
| 2 | `catalogBig` téléchargé en série après tout le JS | −1 aller-retour + 480 Ko en parallèle | XS | 1 |
| 3 | Retour de la vue détail : la grille des 60 tuiles est entièrement refaite | plus de clignotement | S | 2 |
| 4 | Pages téléchargées 3 s après la boutique seulement | plus d'attente au 1er toucher | XS | 2 |
| 5 | Miniature des tuiles sans fondu ; vue détail vide pendant le chargement | plus d'apparition brutale | S | 2 |
| 6 | Préchauffage des shaders qui rate les vraies cartes (`rimK` constante → shader différent en pleine illustration) | plus de gel à la 1re révélation de chaque rareté | S | 3 |
| 7 | La définition 3D ne remonte jamais sur un écran 60 Hz (seuil 15 ms < 16,7 ms) | netteté retrouvée après un passage chargé | S | 3 |
| 8 | Boucles permanentes au repos (diag, fil des gros tirages avec mise en page forcée) | fil principal au repos, moins de chauffe | S | 3 |
| 9 | `backdrop-filter` restants sur téléphone au-dessus de la 3D | images plus régulières en vue détail | XS | 3 |
| 10 | Battement de cœur appelé toutes les 35 s pour une écriture toutes les 4 min | −430 appels / joueur / 30 min… | XS | 4 |
| 11 | `feed.bigPulls` lit 400 lignes ; `markLeader` toutes les heures | −9 Mo / 30 min, −220 Mo/jour | S | 4 |
| 12 | Abonnements ouverts onglet caché | appels en moins, radio au repos | S | 4 |
| 13 | Présence + annuaire dans `users` (`users.friends` relancé partout) | −4 000 appels, −50 Mo / 30 min | M, migration | à faire |
| 14 | `myCollection` re-poussée à chaque booster | −45 Mo lus, −1,8 Mo / joueur | M, migration | à faire |
| 15 | Élément partagé tuile → carte 3D ; historique dans la sous-navigation de la collection ; défilement restauré | continuité « native » | M–L, visuel | à faire |
| 16 | Changement de définition 3D en pleine révélation ; textures des sachets envoyées d'un bloc | à-coups en moins | M | à faire |
| 17 | KTX2 / AVIF, détourage hors fil principal | à mesurer sur vrai téléphone d'abord | L | écarté pour l'instant |

## 4. Lots

Un commit par lot, re-mesure après chacun. Un lot sans gain mesuré ou vérifiable est annulé.
(Section complétée au fur et à mesure — voir plus bas.)
