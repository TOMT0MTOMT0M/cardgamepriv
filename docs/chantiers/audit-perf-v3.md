# Audit de performances de la V3 (téléphone d'abord, puis serveur)

Chantier : racine / `v2`. Qui : Tom + Claude. Ouvert le 27/11/2026. Audit fait la nuit du 27 au 28/11, corrections le 28/11 : sur `v2` et EN LIGNE sur le lien V3 (`f2b7e3f`), pas chez les joueurs (elles partiront avec la V3).

## Corrections (28/11) — mesures au PC (Chrome sans fenêtre, processeur ralenti ×4, écran du téléphone émulé)
Rapport de l'audit : `.claude-tmp/audit-perf/COMPTE-RENDU.md` (n° = ligne du tableau). Outils de mesure : `.claude-tmp/audit-perf/outils/bench-*.mjs`.

| n° | Correction | Avant → après | Commit |
|---|---|---|---|
| 1, 9 | Fil « Gros tirages » : plus de recalcul de style forcé à chaque défilement ; compte à rebours d'événement de la boutique n'écrit plus que ce qui change | recalculs forcés 481 (805 ms / 20 s) → 0 | `50eaea9` |
| 3 | Canvas 2D relus (sachets, plis, autocollants, vignettes) créés en lecture CPU ; 6e pli enfin mis en cache | relectures GPU par lancement 24-26 → 12 ; cache des plis 10 → 12 | `50eaea9` |
| 16 | Démo (`?demo`) : pas de connexion Convex ouverte d'office | 1 WebSocket permanente → 0 (sauf le rapport de chargement unique) | `50eaea9`, `5e78015` |
| 13 | Mise à jour : fichiers non hachés revalidés par ETag | patch simulé : 80 fichiers retéléchargés → 5 | `271c7d1` |
| 2, 6 | Cartes témoins compilées après la boutique ; chaque carte compilée hors scène avant d'être posée | boutique visible ≈ 5,1 → 4,0 s ; ouverture 796 ms d'à-coups → 0 ; visionneuse 166-242 ms → ≈ 0 | `7125ab8` |
| 4 | Boutique calme gardée pendant l'invite | 44 → 36 images dessinées / s | `7125ab8` |
| 7 | Sons, textures Pokébox, bruit, nom moulé mis en cache (`bebou-calc`, versionné : `SOUND_REV`, `TEX_REV`, `NOISE_REV`) | calcul des workers 541-586 ms → ≤ 1 ms par lancement ; ≈ 12 Mo de cache en plus | `5ad02fc` |
| 5, 11 | Données mobiles : musiques et effets plus téléchargés d'office ; une seule variante de déchirure avant la boutique | 4,06 → 2,92 Mo avant la boutique | `a1770bc`, `b390a96` |
| 12 | Flamme du bouton Série animée seulement menu ouvert ; lueur du jour J par opacité ; neige au ResizeObserver | page Événement 5,4 → 1,4 ms / image | `0925e3a` |
| 8, 14, 15 | Mises en page forcées retirées (morph, main, chat, pastilles, mises à jour fermées) ; Échanges / Collection en sommeil quand cachées ; dessins de Jeux en une seule boucle | Échanges et chat jusqu'à 2× plus rapides à l'arrivée | `69820b4` `e8c03a7` `aeadc39` `340b86f` |
| 10 | Catalogue retiré des modules Convex qui ne le lisent pas (nouveaux `launchGate.ts`, `cardRarity.ts`, `rappels.ts`) ; tâche horaire renommée `rappels:remindTick` | modules qui chargent le catalogue 42/53 → 31/56 | `60b2ad9` |
| 17 | Retours Convex allégés | `games:history` 441 → 32 Ko ; `session.get` 6,2 → 5,8 Ko | `a6eab12` |

Vérifié : typecheck jeu + Convex, `check:i18n`, `test:server` 373/373, `test:sound`, `test:rolls` ; démarrage, ouverture complète et 9 pages sans erreur au PC puis sur le lien V3.
Staging Convex, premiers appels après la mise en ligne (1 à 2 appels seulement, à confirmer en prod) : `inventory:mineSince` 219 → 28 ms, `launch:status` 247 → 20 ms, `friends:mine` 307 → 90 ms (médianes avant) ; `rappels:remindTick` tourne (13 h), 0 erreur.

Laissés exprès :
- 302 réécritures du cache GPU par lancement : faites par Chrome Android, les shaders du jeu sont identiques d'un lancement à l'autre.
- Bloom en 14 soumissions : impossible à regrouper sans réécrire le bloom de three.js — le flou réutilise le même matériau pour la passe horizontale et verticale de chaque niveau (seule la direction change), donc une soumission groupée lirait la dernière valeur partout et casserait le halo. Gain en jeu : ≈ 1,2 ms d'envoi par image dessinée. Réduire le nombre de passes changerait le halo (DA).
- `session.get` : le vrai gain serait d'en sortir la liste d'envies (client à changer).

À faire : essai de Tom au téléphone (liste dans EN-COURS) ; coût Convex à remesurer en prod après la sortie de la V3 (`node scripts/cout-convex.mjs`).

## Fait (27/11, 23 h)
- **Master prompt écrit**, prêt à coller dans une session neuve ouverte dans le dossier racine : `.claude-tmp/audit-perf/MASTER-PROMPT.md` (dossier hors git, PC de Tom seulement).
  - 82 agents, par un workflow : 50 Haiku (un lot de code chacun) → 10 Opus (contre-examen, cherchent d'abord à réfuter) → 1 Fable (synthèse + 20 axes) → 20 Sonnet (approfondissement) → 1 Fable (compte rendu).
  - Lecture seule : aucun code, aucun commit, aucune écriture Convex. Pas de recherche web. Regard neuf : interdit de lire `docs/chantiers/`, `LAB_NOTES`, l'historique, les notes de patch, les messages de commit.
  - Cible : la **branche `v2`** (V3 en préparation, lien `v2.cardgamepriv.pages.dev`), pas la version des joueurs (choix de Tom en cours de session ; la première version du prompt visait `master`).
  - Les mesures sont faites une seule fois par l'orchestrateur (étape 0), puis lues par les agents : plusieurs navigateurs en même temps fausseraient les chiffres.
  - Les 50 lots suivent l'arborescence de `v2` au commit `0260592` (`opening.ts` coupé en trois).
- **Téléphone de mesure branché et piloté depuis le PC** : Xiaomi Redmi Note 11 Pro 5G (Snapdragon 695, Adreno 6xx, 6 Go, Android 13, Chrome 158, WebGPU présent, DPR 2,75, écran 392×792).
  - adb 37.0.3 dans `C:\Users\Tom\adb\platform-tools\` (pas dans le PATH).
  - Pont : `adb forward tcp:9333 localabstract:chrome_devtools_remote`, puis le même protocole DevTools que le Chrome sans fenêtre.
  - Deux scripts modèles : `.claude-tmp/audit-perf/outils/telephone-etat.mjs` (état de la page, WebGPU, images par seconde) et `telephone-trace.mjs` (trace de performance).

## Vérifié
- `adb devices` : téléphone en état `device`.
- Jeu en démo ouvert dans le Chrome du téléphone par adb, page lue par `Runtime.evaluate`.
- Trace de performance enregistrée : 40 809 événements en 2,5 s.
- Température et batterie lues par adb (Thermal Status 0).
- Aucune mesure de performance n'a été faite : seulement le fonctionnement des outils.

## À vérifier par Tom
- Batterie du téléphone à 5 % au moment du test : la charger à 50 % au moins avant de lancer (le prompt s'arrête sinon).
- Coût : 82 agents en effort high, dont 10 Opus, prennent une grosse part du quota Max de la semaine.
- Pendant les mesures : téléphone posé, déverrouillé, Chrome au premier plan, sans y toucher.

## Reste
- [ ] Lancer le master prompt (session neuve, dossier racine).
- [ ] Lire `.claude-tmp/audit-perf/COMPTE-RENDU.md`, puis décider des corrections (chantier à part).
- [ ] Non couvert par le prompt : iPhone, téléphone plus faible, jeu connecté (le mode démo ne passe pas par Convex). Pour le jeu connecté : Tom se connecte sur le téléphone avant le lancement et l'adresse du point 4 de l'étape 0 est changée.

## Pièges
- `Tracing.start` ne marche que sur la cible navigateur (`ws://127.0.0.1:9333/devtools/browser`) ; sur l'onglet, 0 catégorie.
- Téléphone invisible pour adb et pour Windows : débogage USB coupé, mode USB resté sur « recharge », ou câble de charge seule.
- Le staging n'a pas de vrais joueurs : ses volumes d'appels ne sont pas une charge. Le prompt prend les volumes sur la prod, en lecture seule, comme ordre de grandeur.
