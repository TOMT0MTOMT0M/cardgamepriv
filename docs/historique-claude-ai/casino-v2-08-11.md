# Espace Jeux V2 : direction « usinage » + animations de taille — branche v2 (08/11)

Commits `1a38575`, `9e7615e`, `4ba6819`, `90ff0f6`, `7163bde`, `76da0fb`, `fbfd03c`, puis ferrofluide `a337434`, `bf1c29e`, **`1db84a0` (refonte perf)**, **`583b2fe` (coulées visqueuses)**, **`c0257f6` (attiré par le curseur sur toute la page, 09/11)** sur `v2`. Dernière mise en ligne V2 : `f9aa1db` → il reste à lancer `push.cmd` puis `mettre-en-ligne-v2.cmd`.

## Direction « usinage » (2e passe, remplace le « casino noir » laqué)
- `src/game/casino.css` réécrit (chargé après games.css) : noir pur, filets au pixel, **repères d'angle** sur toutes les pièces encadrées (variable `--cs`, ils s'allongent au survol, sur le joueur prêt et sur le gagnant), coins droits 2–3 px (boutons, onglets, jetons compris, dans l'espace Jeux seulement), trame de points au pas de 22 px qui s'efface vers le bas, règle graduée sous le titre.
- Typo : Bold Frame pour les titres (plus de Matcha World dans l'espace Jeux), Inter pour les textes longs, étiquettes en capitales espacées. Aucun emblème (⚔ ♛ ◎ retirés des boutons et de l'historique).
- Matières : dos des petites cartes en acier brossé + « B » gravé ; jetons de la roulette et bille du résultat en **acier tourné**, numéro gravé.
- Couleur = information seulement : raretés, couleurs des joueurs à la roulette, défaite en rouge.

## Dessins « ferrofluide » de l'accueil (`views/gridArt.ts`)
- Historique des retours de Tom : circuits sur la grille → plus organique → « les anciennes illustrations étaient meilleures, mais avec cet effet » → plus lent, friction, élastique → fluide magnétique repoussé par l'aura du curseur → « ne déforme pas le dessin, seulement le fluide » → « le ferrofluide ne peut PAS quitter son chemin, on le déplace SUR les lignes » → « extrêmement laggy même sur PC : refonte complète, même idée, optimisée, plus raffinée et subtile » (`1db84a0`) → « presque bien ; au lieu de gouttes, plus long, un peu visqueux et random » (`583b2fe`) → « le liquide doit être attiré par le curseur où qu'on soit sur la page Jeux ; plus loin = attraction plus forte, mais à un certain seuil toujours l'effet repoussé, aimant / contre-aimant » (`c0257f6`).
- **Cause du lag (ancienne version)** : filtres SVG (flou « gluant » feGaussianBlur + feColorMatrix, lueur floue) recalculés à chaque image sur 3 dessins + styles réécrits sur plusieurs `<use>` par image.
- **Architecture** :
  - le dessin = SVG fixe (sillon halo + filet, piste déposée, gouttes `<circle>` posées sur le dessin), **aucun filtre**, jamais repeint sauf un `stroke-dashoffset` par piste pendant le tracé initial ;
  - le fluide = un petit `<canvas>` 2D (`.gm-art-fx`, DPR plafonné à 2) posé dessus ; boucle rAF seulement tant qu'une coulée vit ou que le curseur bouge — **elle s'endort** quand le curseur est immobile depuis 2,5 s et que plus rien ne bouge ;
  - géométrie pré-échantillonnée une fois (un point / 2 px, tangente, normale, transformations comprises ; sauts de piste repérés — crans de la roulette ; pistes fermées repérées — cercles, cartes ; points cachés par la carte de devant du duel repérés) ; le masque du duel est un clip `evenodd` côté canvas ;
  - **curseur partagé** : un seul jeu d'écouteurs `window` pour les 3 dessins (posé au premier montage, retiré au dernier), chaque dessin convertit la position dans son repère une fois par image. Le champ se coupe quand la souris sort de la fenêtre, à la perte de focus, et au doigt quand on le lève.
- **Le fluide = des coulées** : ruban plein qui épouse exactement la piste entre queue et tête, fin à la queue, plein et arrondi à la tête, renflements irréguliers qui glissent lentement. **Tiré au hasard à chaque coulée** : longueur (40–120 px courant, 28–62 px appelée, 36–92 px résidente, bornée par la piste), épaisseur (1,7–2,9 px), retard de la queue (0,22–0,5 s), ondulations, vitesse (± 20 %). **Volume conservé** (étirée = plus fine). Inertie, frottement visqueux, friction statique ; la queue suit avec retard et se retourne lentement. **Épines** près du curseur, plantées sur la ligne.
- **Aimant / contre-aimant (09/11)** : où que soit le curseur sur la page, le fluide est **attiré** le long de son rail vers le point de la piste le plus proche du curseur, d'autant plus fort que le curseur est loin (0 au bord de l'aura → `ATTR` = 560 px/s² atteint à `REACH` = 380 px au-delà, plafonné) ; **dans l'aura** (rayon 54 px + selon la vitesse) il est **repoussé** comme avant → il se pose juste au bord de l'aura. Tant que le curseur est sur la page : 1 coulée résidente par dessin (2 pour la Royale et le duel), née à un endroit au hasard de la piste la plus proche du curseur ; une résidente posée sur une piste nettement plus loin que la meilleure (> 40 px) se retire et renaît plus près (examen toutes les 450 ms) ; le courant ambiant est suspendu (ce sont les coulées attirées qui vivent). Pistes fermées parcourues en boucle (plus de blocage au point de départ du tracé). Une coulée attirée sous la carte de devant du duel en ressort par le bord le plus proche. Les coulées du courant ambiant, tenues par leur guide, ne font que s'infléchir (× 0,45).
- **Mesures** (Chromium sans GPU, 1440 px) : ancienne version filtres → 3 s d'interaction 2,0 s de tâches, p90 33 ms/image, repos 0,78 s / 3 s ; version actuelle → grand geste sur toute la page 1,6–1,8 s, p90 16,7 ms ; curseur posé sur la page 0,07–0,09 s / 3 s (boucle endormie).
- Réglages : `SPEED`, `PULSE_SPEED` en haut ; dans `mountGridArt` : `PUSH`, `DRAG`, `VISC`, `STATIC`, `ATTR`, `REACH`, `RES_MAX`, `GUIDE_K/C` ; tirages dans `spawn()` / `pulse()` ; ruban dans `coulee()` ; épines dans `spines()`.
- Mise en page inchangée : coin recalé au pixel sur la trame ; ordinateur = platine en haut de la carte, téléphone = fragment dans le coin haut-droit. Mouvement réduit = dessin tracé, immobile, sans canvas.

## UX
- En-tête : fil d'Ariane « Jeux / 03 Roulette », solde qui roule, onglets à pastille blanche qui glisse (défilement auto vers l'onglet actif au téléphone).
- Accueil : trois fiches techniques (Joueurs · Mise · Gain), une ligne de description, état en direct, flèche.
- Panneaux numérotés 01, 02… (compteur CSS) avec un en-tête façon cartouche.
- Enjeu en fiche Enjeu / Victoire / Défaite / Égalité (Pack Battle et Royale) ; compteur de boosters « 1/10 » entre − et +.
- Roulette : mise en 3 étapes numérotées, compte à rebours `06:48:44`, jauge de couverture graduée (36 crans), **barre « Miser » collante au téléphone** dès qu'un numéro est choisi et que le panneau de mise est hors de l'écran.

## Moments de jeu (1re passe, gardés)
- Pack Battle : règle graduée du rapport de force + totaux qui roulent, cartes du centre avec élan + reflet, rayons fins derrière les 5★/6★, suspense, lumière qui court sur le filet du gagnant, verdict en grand titre qui monte.
- Battle Royale : rangs, classement qui glisse (FLIP).
- Roulette : bille continue qui s'arrête pile après 2 tours, traîne, disque du résultat par-dessus la table ; le tout premier tirage s'anime aussi.

## Partout dans l'appli
- `src/core/morph.ts` : `installMorph()` (main.ts) — hauteur animée de `.missions-pop, .status-pop, .gm-panel, .gm-ed-host, .gm-verdict, .gm-room, .ct-sheet, [data-morph]` ; `data-morph="reveal"` = dépliage depuis 0 ; `flip()`, `leave()`, `rollNumber()` ; pastille glissante `i.seg-ind` sur tous les `.seg` (elle reprend le fond de l'onglet actif ; `data-seg-key` garde sa place quand le contrôle est refait).
- `src/game/panneaux.css` : panneaux de l'en-tête en rideau + cascade ; fenêtres qui montent et redescendent (feuille par le bas au téléphone).
- Mouvement réduit / « Effets réduits » : boucles coupées, dépliages instantanés.

## Vérifié
tsc + vite build OK ; parcours démo capturés PC 1440 et téléphone 390 ; mouvement réduit vérifié ; ferrofluide : coulées en gros plan (×3), découpe du duel ; attraction : curseur posé en bas à gauche, en haut à droite et entre deux cartes → les coulées des 3 dessins vont se poser du côté du curseur et restent au bord de l'aura quand il est proche ; temps par image et coût au repos mesurés ; aucune erreur console.

## Attention
Une autre session commite en parallèle sur `v2` (ex. `b9ff896`, animations 6★ ; `408c4c4`, police Atsuka Montreal) dans le même dossier : ne committer que ses propres fichiers. Dans une nouvelle session, la suppression de fichiers dans le dossier n'est plus autorisée : git laisse alors `HEAD.lock` / `maintenance.lock` → les renommer en `stale-…` sous `.git` après chaque commit.
