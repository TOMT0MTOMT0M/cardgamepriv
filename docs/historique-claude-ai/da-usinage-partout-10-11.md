# DA « usinage » de la page Jeux étendue à tout le jeu — 10 nov. 2026

Branche `v2`, commit `b1449eb`. **Poussé et en ligne sur le lien V2 le 10/11 vers 18 h 30** : `push.cmd` (`7a2122b..b1449eb v2 -> v2`) puis `mettre-en-ligne-v2.cmd` → build `v2-20261110T1730-b1449eb`, staging Convex `good-gull-939`, https://v2.cardgamepriv.pages.dev/jeu/. La prod n'a pas bougé.

## Ce qui a changé
- **Nouveau `src/game/usinage.css`** (chargé après `style.css` et `panneaux.css` dans `main.ts`) : la direction de l'espace Jeux et du chat sur toutes les pages — noir, filets au pixel, repères d'angle sur les pièces encadrées (ils s'allongent au survol), coins droits 2–3 px, trame de points en haut de page, blanc plein = actif, plus de halo ni de dégradé décoratif.
- **Rayons en jetons** : 244 rayons de `style.css`, `games.css`, `panneaux.css` lisent `--r-pill` / `--r-box` / `--r-ctl` (3 / 3 / 2 px). Les cartes, pochettes, vignettes de carte et cases de contrat gardent leur rayon en dur.
- **Titres de page** (Contrats, Classement, Succès, Amis, Suggestions, Mises à jour, Tutoriel) : étiquette au petit carré, grand titre Bold Frame, filet + règle graduée, comme « Espace Jeux ». Échanges et Profil : titres en Bold Frame aussi. Atsuka Montreal ne reste que sur le logo, la connexion et les moments forts de l'ouverture.
- **Textes** : Inter pour ce qui se lit (descriptions, listes, champs), Bold Frame pour les titres et les chiffres, étiquettes en capitales espacées.
- **Composants partagés** : en-tête (avatar carré, pastilles carrées), boutons, onglets, jetons de filtre, champs, notifications, panneaux Missions / Portefeuille / Connexion, fenêtres des échanges, barres de progression droites, avatars carrés dans les listes.
- **Couleur = information** : gardées telles quelles — raretés, code couleur du profil (10/11), états des missions, médailles du podium, « c'est toi ».
- **Page Jeux** : inchangée à l'œil. Corrigé au passage : les repères d'angle ne s'allongeaient pas au survol (`--cs` figé à 9 px par une variable posée sur `.games`) ; ils sont écrits sur l'élément. La Forge charge `casino.css` (mêmes panneaux).
- Entrée « Mises à jour » du 10 nov. ; règle ajoutée dans `CLAUDE.md` (jetons de rayon, usinage partout).

## Non touché
Cartes (tuiles, 3D, effets de rareté), sachets, ouverture, scènes 6★, cadres d'avatar gagnés (l'avatar du profil reste rond), dashboard `/admin/`, labo.

## Vérifié
- `npm run typecheck`, `npm run test:server` (130 tests), `vite build --mode v2`.
- Captures en démo, 1440 × 900 et 390 × 844 : Collection (cartes, albums, classeurs, forge, contrats), Échanges + fenêtre d'annonce, Jeux (accueil, duel, roulette), Classement, Succès, Amis, Profil, Mises à jour, Tutoriel, Suggestions, panneaux Missions / Portefeuille / Connexion, menu du profil au téléphone.
- Survol : repères 9 → 22 px sur les fiches de l'espace Jeux, 9 → 18 px ailleurs.
- Lien V2 : `/version.json` renvoie bien le build `b1449eb`.

## Pas vérifié (pas de 3D dans le navigateur sans écran)
- Boutique au téléphone : rangée des pochettes, fiche du booster en feuille, boutons de l'ouverture (passer, tout révéler), récapitulatif de fin d'ouverture.
- Carte ouverte en grand : fiche de la carte et boutons de la visionneuse.
- Connexion, sondage, « qui a cette carte », visite guidée : stylés par les jetons, non ouverts.

## À trancher par Tom
- Titres de page en Bold Frame (comme la page Jeux) au lieu d'Atsuka Montreal : pour revenir en arrière, une seule règle dans `usinage.css` (« en-tête de page »).
- Avatars carrés dans l'en-tête et les listes, rond sur le profil (à cause des cadres gagnés).
