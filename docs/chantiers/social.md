# Chantier V3 — social : profils, « Défier », amis par suggestions, moins de texte aux Jeux

Branche `v3-social` (worktree `.wt-social`, tirée de `v2` 0260592). Captures avant / après : `.claude-tmp/social/`
(`avant-*.png`, `apres-*.png` : profil à moi et d'un ami, 390 px et 1280 px ; Jeux : accueil, Pack Battle, Battle Royale).

## Fait (27/11)
- **Profils** (`usinage.css`, bloc « (V3, lot social) PROFIL » ; `profile.ts`) :
  - en-tête sur une grille : photo | identité | actions, alignées sur le bas ; profil d'un autre : actions sous le
    pseudo, calées sur son bord gauche ; téléphone : « Voir sa collection » pleine largeur puis Échanger · Message ·
    Défier · + Ami en 4 parts égales (3 rangées de boutons → 2) ;
  - typo en trois niveaux : pseudo Bold Frame 34 / 24 px ; étiquettes en capitales (repère, titre, badges) à 24 px de
    haut sur la ligne du titre ; texte courant 12,5 px (devise, « depuis ») ;
  - bannière plus haute (108 → 148 px ordinateur, 84 → 116 px téléphone) : un GIF importé n'est plus une bande ;
  - calques de la bannière, de bas en haut : couleur (noir sous une image) → image / GIF → voile bas → animation de
    profil → contour de couleur → boutons. Sur une image, l'animation est en mélange « screen » (elle ajoute de la
    lumière : l'aurore se voit enfin sur un GIF, sans le salir) ; la neige garde un liseré sombre ;
  - budget vertical de la vitrine `--pf-over` 470 → 510 px (les 12 cartes tiennent toujours au premier écran).
- **QOL F « Défier »** : bouton sur le profil d'un joueur et sur la ligne d'un ami → `#/jeux/duel/vs/<id>` = création
  de Pack Battle, adversaire choisi, titre « Défier X », bouton « Envoyer le défi » ; boosters et mise comme
  d'habitude. Serveur inchangé : `games:createDuel` acceptait déjà `invitedId` (notification + pastille Jeux, testé
  dans `games.test.ts`).
- **QOL G amis par suggestions** (`friends.ts`) : dès 2 lettres, jusqu'à 8 joueurs (début du pseudo, puis début d'un
  mot, puis n'importe où ; casse et accents ignorés), chacun avec son bouton + Ami / Envoyée / Accepter / ✓ Ami.
  « Demander » avec une seule suggestion = elle ; sinon le pseudo exact comme avant.
- **Jeux, moins de texte** (`games.ts`, `games.css`) : règles en 3 étapes numérotées + « Règles complètes » repliées ;
  « 13 en réserve » au lieu de « Touche un booster pour changer sa sorte · réserve : 13 boosters » (↻ sur la pastille,
  infobulle) ; ligne « Valeur du pot annexe » seulement s'il y a un pot ; Royale : « 13 en réserve · −1 au lancement ».
  Roulette non touchée.

## Décisions (prises seul, petites)
- Décidé : suggestions filtrées sur l'appareil dans la liste du club déjà chargée (`backend.state.friends`) → 0 requête,
  0 octet de plus côté Convex ; donc pas de délai de frappe (rien à économiser). Pas d'index de recherche.
- Décidé : « Proposer un échange » → « Échanger » et « + Ajouter en ami » → « + Ami » sur le profil (libellé long dans
  l'aria-label) ; nouvelle variante `short` de `friendBtn`.
- Décidé : « Défier » = lien d'adresse (rechargeable, retour arrière OK), pas d'état caché.
- Décidé : règles complètes gardées (repliées), pas supprimées.

## Vérifié
- `npm run typecheck` OK ; `npm run check:i18n` = 0 ; `npm run test:server` (voir rapport).
- Démo, Chrome sans fenêtre 390 / 1280 px : profils (à moi avec GIF + aurore + titre ; d'un ami), Amis (« ro » → 3
  suggestions), `#/jeux/duel/vs/bot-0` (« Défier Léa (robot) », adversaire choisi), Pack Battle et Battle Royale ; 0 erreur.

## À vérifier par Tom (téléphone, lien V3)
- Profil avec une bannière GIF + une animation de profil (neige, aurore) : l'animation se voit, le GIF reste net.
- Profil d'un ami : 2 rangées de boutons, rien ne déborde (aussi en grande taille de texte).
- Amis : taper 2 lettres → suggestions ; « + Ami » d'une suggestion.
- « Défier » depuis un profil → créer → l'autre reçoit la notification « … te défie ».
- Jeux → Pack Battle / Battle Royale : 3 étapes lisibles, « Règles complètes » s'ouvre.

## Reste
- Rien de bloquant. Piste : mêmes 3 étapes dans la salle d'un duel (texte d'attente), non fait.
