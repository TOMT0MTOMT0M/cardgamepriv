# Audit performance — suite du 07/11

> Complète `claude/audit-perf-2026-11-06.md` (sections 1-12). Même méthode, même harnais pour S1 ; S3 non mesurable ici.

## 13. Suite (07/11, session suivante) — commit `f54c89f`

Tout ce qui précède (fusion `79b9b6c`) est **poussé et en ligne** (23:39, site + Convex par `push-et-mettre-en-ligne.cmd`,
qui déploie Convex avant le site — l'ordre inverse de §9 bis : sans conséquence pour le jeu, seul le HUD du labo d'un
onglet ancien aurait pu afficher « undefined » jusqu'au rechargement).

Trois suites appliquées, **sans changement de pixel** :

| # | changement | mesure (conteneur, GPU logiciel) | visuel |
|---|---|---|---|
| S1 | **Carte des plis gardée d'une visite à l'autre** (§8 ter piste a) : Cache Storage `bebou-plis`, PNG sans perte (toile opaque). `CREASE_VERSION` dans `pack.ts` à changer si `paintCreaseMap` / `applyGrain` changent. Encodage et écriture en tâche de fond après la boutique. | aller-retour PNG : **0 octet différent** sur 2 478 080 ; 2e visite : `plis:cache` **75 ms** au lieu de `plis:peinture` 3 530 ms (rastérisation logicielle ; sur téléphone, le gain réel = le temps de peinture mesuré par S2) ; boutique 6,13 → 2,67 s ici | identique (même toile) |
| S2 | **Rapport de chargement** (`diag.ts reportLoad`, `core/perfLog.ts`) : une fois par appareil (ou `?diag`), 6 s après la boutique, dans les retours du labo (entrée « Chargement ») : temps jusqu'à la boutique, `plis:peinture` ou `plis:cache`, tâches longues (nombre, total, les 8 pires), moteur / qualité / écran / cœurs / mémoire / réseau. Aussi en console (`[chargement]`). | — | aucun |
| S3 | **Gros tirages** (C11, variante sans compromis) : plus de lecture de `scrollTop` au début de chaque image (elle forçait une mise en page synchrone après les écritures des autres animations) ; la position écrite est la vérité, le mouvement de l'utilisateur est détecté dans l'événement `scroll`. | non mesurable ici (GPU logiciel : ~1,6 image/s, bruit > effet) ; par construction, la mise en page forcée (42 ms/s mesurés par l'audit) disparaît | identique : mêmes positions, même cadence |

À lire après quelques visites sur téléphone : `/lab/feedback?key=…`, lignes `diag-charge-*` → si `plis:peinture` > 300 ms,
S1 règle déjà les visites suivantes ; la piste (b) (peinture dans un worker) ne vaut que pour la toute première visite.

Restent à décider (compromis visuels, §8) : **C1** vitrine PC à 30 i/s au repos, **C12/C13** présence des amis moins
fine (Convex). Non appliqués.
