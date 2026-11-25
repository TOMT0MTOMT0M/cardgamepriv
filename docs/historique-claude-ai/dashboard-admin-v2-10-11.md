# Dashboard admin — en prod v1.0.13 (10/11)

**Adresse** : https://cardgamepriv.pages.dev/admin/ (prod, dès que `METTRE-EN-LIGNE-v1.0.13.cmd` a tourné) · V2 : https://v2.cardgamepriv.pages.dev/admin/. Réservé à Tom et Hugo (vérifié côté serveur). Se connecter au jeu, puis ouvrir `/admin/`. Un badge en haut indique **PROD · vrais joueurs** ou **V2 · test**. Il fait partie du site en ligne : il marche sans Claude et sans le PC.

## Onglets
- **Accueil** : ce qui attend, chiffres du club, activité, version en ligne, accès direct « Le jeu est cassé ? ».
- **Retours** : suggestions (bugs, cartes, ajouts, idées) + sondage ; réponse visible du joueur ; « Copier » pour Claude ; → Cartes à corriger.
- **Cartes à corriger** : liste partagée, export Excel, copie.
- **Joueurs** → fiche : boosters, pièces, donner / **retirer** une carte (sa collection), parrainage, mot de passe, visite guidée, **déconnecter partout**, **annuler ses échanges en attente**, **notes de l'équipe**, bannir / rétablir.
- **Alertes** anti-abus.
- **Outils** : **cadeau à tout le monde**, notification à tous (V2 seulement), verrou du club, **qui possède cette carte**, **roulette** (forcer le tirage, remettre un pot), classement, rôle Discord, **export joueurs**, lanceurs PC, commandes Convex.
- **Journal** : qui a fait quoi.
- **Guide** : mode d'emploi (chaque jour, un joueur a un souci, URGENCE avec retour arrière sans Claude, ce qui demande du code).

## Technique
- Mêmes fichiers sur `master` et `v2` : `convex/adminDash.ts` (+ 9 tests), `src/admin/`, `admin/index.html`. Notifications détectées par le schéma (absentes de la V1).
- Schéma : 3 nouvelles tables (`adminLog`, `cardFixes`, `playerNotes`), rien de modifié.
- master `0e937ca` (tag `v1.0.13`) · v2 `f4ec884`, `3be753f`, `84d72b9`.
- Les joueurs ne voient qu'une ligne dans « Mises à jour » ; mise à jour non forcée.

## master et v2 réalignées (10/11, suite)
- v1.0.8 reporté sur v2 (`d0da5e1`) : god pack, échanges, visages, Bruel, annonce. Conflits résolus en gardant les deux côtés (curation V2 + purge Bruel, annonce ET sondage au démarrage, imports 6★ + god pack).
- v1.0.9 reporté sur v2 (`5064e2a`) : Accepter, Trouver une carte / Qui l'a ?, recherche.
- Contrôle ligne par ligne : tout ce que master a ajouté ou supprimé depuis `0679d94` est dans v2. Puis `git merge -s ours master` (`a1e0093`, arbre v2 inchangé) → **master est ancêtre de v2 : `publier-patch.cmd` passera**.
- `CLAUDE.md` maintenant suivi par git (`3d36391`), avec le circuit des correctifs urgents v1.0.X.
- Vérifié sur v2 : type-check, 130 tests serveur, build, démo `/jeu/?demo` (boutique, échanges, collection, mises à jour).

## À faire par Tom
1. `.wt-master\METTRE-EN-LIGNE-v1.0.13.cmd` : pousse master, v2 (tous les commits ci-dessus) et les tags, puis met la prod en ligne.
2. `lanceurs\mettre-en-ligne-v2.cmd` depuis le dossier principal (lien V2) : regarder le god pack (`?god` en démo), Accepter un échange, « Trouver une carte ».
