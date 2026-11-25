# Corrections de l'audit perf V2 — chantier clos le 13/11

Branche `v2`, 43 commits (`f5528cd` → `c8ae71c`), **poussés** et **en ligne sur le staging V2** le 13/11 à 11 h 51 (lanceurs lancés par Claude avec l'accord de Tom). La prod n'a pas bougé ; `.env.local` vérifié sur la prod après chaque mise en ligne.
État détaillé, lot par lot, avec les commandes du banc : `_hors-site/audit-12-11/9-etat-corrections.md`.
Vérifié à la fin : `tsc --noEmit` et `tsc -p convex --noEmit` sans erreur, `vitest` 38 fichiers et 205 tests passés, `test:sound` passé, `vite build` réussi. Chaque lot relu par un agent à contexte neuf, ses corrections appliquées.
Consignes de Tom du 13/11 : plus de retours demandés, finir tous les lots ; puis faire aussi les lots WebGPU, même sans pouvoir les tester.

## Fait et mesuré

| Lot | Commit | Avant | Après |
|---|---|---|---|
| S04 requêtes en identifiant seul | `c5ef916` | 11 requêtes sur 11 lisent le document joueur | 0 sur 11 |
| S05 classement par signature | `bae1147` | 246 documents lus, 2 recalculs par tour | 6 documents, 0 recalcul |
| Décision 8 présence | `d5f5f7a` | liste du club 6 027 octets ; « mes amis » 6 328 octets | 1 755 ; 2 770 |
| S07 collections relues | `ab8131b` | Succès > Amis 775 documents ; forge 100 lignes ; contrat 9 422 lignes | 25 ; 4 ; 49 |
| Décision 10 « Pour toi », fiche carte | `9439f43` | 159 et 16 documents | 44 et 14 |
| S12 migrations par pages | `13c807c` | table des échanges lue en entier | 400 lignes par mutation |
| S11 appels sans geste | `c098029` | 2 écritures du document joueur par chargement | 0 |
| S13 marché, historique | `b04fa90` | 30 et 61 lectures de documents joueur | 2 et 2 |
| E1-08 session en une requête | `0db73c3`, `e9de7bb` | par écriture sur le joueur : 3 requêtes, 6 documents lus | 1 requête, 2 documents |
| A8-08 tampon des migrations | `0db73c3`, `e9de7bb` | tout l'inventaire relu 2 fois à chaque mise en ligne | 0 ligne à partir de la 3e mise en ligne sans changement |
| A7-21 échange en un toucher | `0db73c3` | 302 lignes d'inventaire lues | 4 |
| S02 mémoire GPU hors scène | `dbeb3be` | visionneuse 89,6 Mo ; juste après 62,2 Mo | 61,9 Mo ; 34,5 Mo |
| S03 paillettes mortes du shader | `a23c1df` | 1 329 408 caractères de shaders | 1 294 298 |
| S06 textures des reflets en worker | `c8b1aea` | 237 ms sur le fil principal au démarrage (profil PC) | 2 ms, pixels identiques |
| S06 vitrine montée sans attendre le catalogue | `53a5afa` | catalogue retardé de 4 s : boutique à 28,1 et 27,8 s | 24,7 et 23,8 s, même image |
| S06 bruits des matériaux en worker | `53a5afa`, `e06bde4` | 68 ms + 22 ms sur le fil principal (profil PC) | 0, valeurs identiques |
| S09 visionneuse sans recompilation | `2205811` | 1 shader de face (28 Ko) recompilé à chaque carte ouverte | 0 |
| Décision 9 cache d'illustrations | `b59f2c1` | plafond de 1 800 entrées, poids inconnu | 150 Mo et 15 % du quota |

Serveur : tests qui comptent les lectures. 3D : banc sans carte graphique (WebGL2 logiciel, téléphone 390×844 @2 et ordinateur 1280×720). Profil CPU : sur PC, un téléphone est plusieurs fois plus lent.

## Fait, non mesurable ici (à voir sur appareil)

| Lot | Commit | Ce qui change |
|---|---|---|
| S01 bugs | `ea4cb32` | pièces après connexion par mot de passe ; frappe perdue à la presse |
| Décisions 1, 2, 4, 5, 7 | `a9005fe`, `8bff38b`, `66aaff0` | bulles des tuiles, lissage ×4 conditionnel, « effets réduits » supprimé, cadence au-delà de 60 Hz, voiles sans flou |
| Décision 3 | `9a2b482`, `b59f2c1` | tuiles en JPEG 0,9 quand le navigateur n'encode pas le WebP (Safari) |
| S08 | `7001b64` | précompilations Merveilles, skins CS, invocation (testé par Tom) |
| S09 / E4-22, E4-02 | `2205811`, `046a8ea` | carte de la visionneuse préparée avant son entrée ; les 5 cartes d'un booster entrent une par image |
| S10, S14, S16 | `f37b71c`, `767addc`, `b523f00`, `34619d2` | émissions regroupées ; forge, recherches, profil, Collection ; son |
| S15 | `fd39040`, `046a8ea` | collection gardée sur l'appareil (1 lecture complète par 24 h et par version) ; ménage des caches ; page servie depuis la copie locale après 1,5 s de réseau muet |
| S17 | `07b4d58`, `d686d17` | ordinateur : sortie sans la recopie plein écran de l'aberration au repos, gerbe cachée quand elle est éteinte, roue 3D sans copies de textures, cartes peintes en étapes ; halos ; cadences du classeur et de la grille ; rig de duel |
| E4-06, E3-08, E3-09 | `e06bde4` | constantes de face calculées par sommet ; ancienne carte libérée avant de peindre la nouvelle ; toiles et extraits rendus plus tôt |
| A8-03 | `0db73c3` | « Numéro un » recalculé seulement si une ligne a bougé |
| Rapport de chargement | `38a444f` | sept jalons du montage de la scène d'ouverture |

## Lots WebGPU, jamais exécutés (demandés par Tom, un commit chacun pour pouvoir en annuler un seul)

| Lot | Commit | Ce qui change | Signe d'un problème → annulation |
|---|---|---|---|
| E4-10 | `04504c7` | ordinateur : échantillons de lissage et profondeur jetés après résolution (scènes du jeu, pas le labo) | écran noir ou image figée sur ordinateur → `git revert 04504c7` |
| E4-14 | `f7ebfdb` (+ `c8ae71c`) | sortie finale de la visionneuse et de l'invocation préchauffée sur le canvas ; le shell redessine aussitôt la scène affichée | image parasite de cartes factices quelques secondes après le lancement, ou écran figé → `git revert f7ebfdb` (après avoir annulé `c8ae71c`) |
| E4-23 | `f4a8203` (+ `c8ae71c`) | faces double face et lenticulaire préchauffées 9 s après l'arrivée en boutique, hors champ | à-coup ou artefact en vitrine une dizaine de secondes après le lancement → `git revert f4a8203` (après avoir annulé `c8ae71c`) |

Banc WebGL2 (téléphone et ordinateur) : boutique, 22 s de vitrine, visionneuse, sans erreur. La relecture indépendante a confirmé dans le code de three r187 : jeter les échantillons garde bien la résolution (storeOp discard + resolveTarget), 4 échantillons sur ordinateur, et la sortie d'un pipeline va dans la cible courante du moteur (donc le canvas).

## Essayé puis annulé
- Déchirures de sachet décodées dans un worker (`7d54eb9`, annulé par `2871fb0`) : aucun gain au rapport du téléphone.
- E3-11 (tuiles détachées relâchées) : cassait les pages gardées en mémoire.

## Non fait, définitivement, et pourquoi
- **E4-24** (vitrine téléphone sans pièce jointe émissive) : demande une 2e passe de scène, donc un 2e jeu de pipelines pour tous les matériaux de la vitrine (compilés au lancement) et un 2e jeu de cibles plein écran sur téléphone. Coût certain au chargement et en mémoire, les deux points que l'audit cherche à réduire, pour ≈ 10 Mo écrits par image en moins.
- **E2-11** (une face par palier, textures échangées) : refonte du matériau des cartes, partagé avec le labo.
- **E3-12** : 1 Mo ; textures noires si le périphérique GPU est perdu.
- **A8-06** : 0,2 Mo/j ; décaler l'entrée d'un nouveau joueur dans la saison fausserait son classement.
- **A6-16** : négligeable d'après l'audit ; un cron de purge coûterait plus qu'il ne rapporte.
- **A5-03, A5-04** : couper les abonnements de page en arrière-plan rejouerait toasts et sons au retour ; A5-04 contredit A1-05.
- **A1-08 b, A2-10, A2-13, A2-14, T-13, T-14**, table de couche mince : quelques ms, une fois, ou une écriture de cache par image.
- **P3 d'hygiène** de S14 (A10-14, A4-07, A4-08, A4-10, A4-12, A4-14, A4-16, M-06, M-08, T-15, T-16) et de S18 (A3-05, A3-07, A3-08, A3-17, M-09, T-05) : gain nul ou non chiffré d'après l'audit. A4-17 jugé faux par l'audit ; M-02 concerne l'outil de mesure.

## Ce qui change côté données
- Tables nouvelles : `presence`, `wishes`, `migStamps`. Champs optionnels : `rankRows.sig`, `rankRows.stats`, `users.notifFullKey`. Index nouveaux : `binders.by_user_pinned`, `market.by_card_status`, `packOpens.by_status`, `inventory.by_user_rarity`.
- Requête nouvelle : `session.get` (les trois anciennes restent pour la V1 et en repli).
- Migrations idempotentes dans les deux lanceurs : `backfillPresence`, `backfillWishes`.
- Sur l'appareil : base IndexedDB `bebou-collection`, vidée à la déconnexion.

## À savoir
- Migrations `resyncRarities` et `purgeCards` : sautées seulement après deux passages complets de suite sans changement du catalogue, si aucun booster scellé n'était périmé, et pendant 7 jours au plus. Passage complet à la main : `npx convex run migrations:resyncRarities '{"force":true}'`.
- Collection : la copie de l'appareil n'est reprise que pour la même session, la même version du jeu et moins de 24 h.
- Visionneuse : son montage de fond relie 11 programmes au lieu de 6.
- Réseau très lent : un patch peut n'être vu qu'au lancement suivant ; la mise à jour forcée reste le filet.
- Classement : filet de recalcul complet passé de 6 h à 24 h. « Pour toi » : 600 doublons envoyés au plus.
- PC : au repos, un écran 144 Hz rend 72 images/s.

## À vérifier par Tom sur https://v2.cardgamepriv.pages.dev/jeu/
Le mode en ligne et WebGPU ne tournent pas sur le banc de Claude : ces points ne sont vérifiés que par tests serveur et relecture.
1. Lancement, téléphone et PC : rester 20 s en boutique sans rien toucher. Aucune image de carte parasite, aucun écran noir ou figé (lots WebGPU).
2. Connexion, déconnexion, connexion par mot de passe : pièces, missions du jour, calendrier et pastilles à jour sans recharger.
3. Collection : fermer le jeu, le rouvrir, elle est complète ; après un booster, les cartes gagnées y sont.
4. Booster : les 5 cartes sont là à la révélation, reflets présents ; brûlure du sachet comme avant.
5. Visionneuse : première carte ouverte après le lancement, puis plusieurs raretés, feuilleter, zoom.
6. Sur PC : boutique au repos, une révélation légendaire (aberration, gerbe de particules), roue des boosters, une invocation 6★.
7. Écran noir ou carte absente sur une Merveille, un skin CS 6★ ou une invocation 6★ → `git revert 7001b64`.
