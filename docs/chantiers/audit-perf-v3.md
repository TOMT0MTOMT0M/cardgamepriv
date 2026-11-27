# Audit de performances de la V3 (téléphone d'abord, puis serveur)

Chantier : racine / `v2`. Qui : Tom + Claude. Ouvert le 27/11/2026. Rien n'est codé, rien n'est lancé.

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
