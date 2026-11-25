# Audit des maquettes d'animations 6★ (08/11)

Base de l'audit : les 26 scènes livrées sur v2 (commit 1a38575), rejouées dans un banc d'essai (captures image par image, téléphone 390 × 844), mesure de fluidité avec processeur ralenti ×4, analyse des indices sur les 1 506 cartes 6★ concernées, comparaison avec la DA du jeu (noir/blanc futuriste, élégant, pas de cartoon ; couleur réservée à l'information ; matières ultra-réalistes) et avec le niveau des séquences Pokémon et Yu-Gi-Oh (vraie 3D).

## 1. Chiffres qui changent la façon de juger

- **Une 6★ tombe dans environ 1 booster sur 40** (2,5 % : 4 emplacements à 0,25 % + l'emplacement garanti à 1,5 %). Avec 26 familles, la plupart des joueurs verront chaque scène **0 à 2 fois au total**. Conséquences :
  - la version courte servira peu ; la longueur (≈ 5 s + retournement) n'est pas un problème, c'est un moment rare ;
  - chaque scène doit être réussie du premier coup : il n'y aura pas de deuxième chance.
- **Poids des familles** (part des 6★) : Mangas & anime 16,7 % · Musique 15,4 % · Jeux vidéo 6,4 % · LoL 5,8 % · Animaux 5,5 % · Séries 5,3 % · Football 5,0 %. **Ces 7 familles = 60 % des 6★ tirées.** Les 10 plus petites familles réunies = 9 %.
- **Fluidité** : 56 à 60 images/s sur 25 scènes (processeur ralenti ×4) ; seule exception, la Cloche (Nourriture) à 46 images/s, à cause de la vapeur. Petit à-coup au démarrage de certaines scènes (jusqu'à 150 ms pour la Caisse CS, chargement des images). Pas encore testé sur un vrai téléphone.

## 2. Problèmes de fond (communs à toutes les scènes)

**A. La carte est absente de sa propre scène (le plus important).** Chaque scène est un décor 2D plat, sans lien avec la carte 3D qui arrive après. On passe d'un monde 3D réaliste (pile, sachet, Pokémon, Yu-Gi-Oh) à des illustrations vectorielles, et toutes les scènes se terminent par le même flash blanc. → La carte (face cachée, tranche arc-en-ciel) doit être l'actrice : la cartouche, la pochette du vinyle, ce qu'il y a dans le casier, sous la cloche, sur le podium, épinglé sur le globe. La scène se termine avec la carte déjà à sa place de révélation : pas de coupe, le retournement part directement. Techniquement : un calque avec un trou au centre (la vraie carte 3D visible dessous), ou les décors directement dans la scène 3D d'ouverture, comme prévu au départ.

**B. Les indices dévoilent trop, ou pas assez.**
- **290 cartes sur 1 506 (19 %) sont identifiées dès le 3e indice**, parce que leur série n'a qu'une seule 6★ : Séries 61/80, Dessins animés 39/44, Mangas 70/251, Jeux vidéo 30/97, Films 27/50, LoL 15/87. Le nom de la série = le nom de la carte → la révélation est gâchée.
- Indices sans intérêt : Musique (« MUSIQUE FR », « CHANSONS » : 232 cartes), YouTube (« YOUTUBE FR »), Acteurs (2 indices seulement, « POP CULTURE → ACTEURS & ACTRICES »), Ardèche (2), Olympiques (12 cartes à 2 indices).
- Incohérence en Jeux vidéo : tantôt « GAMING → CALL OF DUTY → 2009 », tantôt « GAMING → JEUX VIDÉO → DIABLO » (pas d'année connue).
- Textes jusqu'à 35 caractères (« AVATAR : LE DERNIER MAÎTRE DE L'AIR ») : trop petits sur téléphone.
→ Règle : le 3e indice ne s'affiche que s'il laisse au moins 3 candidates (sinon il s'affiche APRÈS le retournement, en titre de la carte). Trouver de meilleurs 3es indices là où les données le permettent (décennie, pays, genre, nombre de cartes de la famille : « 1 PARMI 232 »).

**C. Répétitions.** Trois comptes à rebours 3-2-1 (Cinéma, Buzzer, Arène) ; quatre fins « on zoome dans l'écran » (Console, Télé, Téléphone, Cinéma) ; le flash blanc partout. → Une seule scène garde le 3-2-1 (Cinéma), et chaque scène a une fin propre.

**D. Écarts avec la DA.**
- Émojis (🐾, 🔔, ♚ qui s'affiche comme une icône) : ça fait bon marché → les remplacer par des formes dessinées.
- Cadres et panneaux d'interface (Chrono, Téléphone) contre la règle « texte sans cadre ni fond ».
- Côté cartoon (Iris : soleil crème, carte qui rebondit), que Tom rejette.
- Trop de couleurs de décor (bois, tapis rouge, gazon vert) → règle proposée : décor monochrome + une seule couleur d'accent par scène, l'arc-en-ciel réservé à la carte.

**E. Le son.** 100 % synthétisé, je n'ai pas pu l'écouter. Les bips, le jingle 8 bits, la cloche et le gong passent bien en synthèse ; la foule, le moteur, le déclencheur photo, le crépitement du vinyle et le sifflet sonneront probablement faux. → Une quinzaine d'échantillons libres de droits (CC0) pour ces sons réalistes, la synthèse pour le reste.

## 3. Verdict famille par famille

Légende : ✅ garder (bonne idée, à finir) · 🔧 améliorer (bonne base, gros défaut) · 🔁 remplacer (l'idée ne tient pas).

### Gaming
| Famille (part) | Scène | Verdict | Ce qui marche | Ce qui ne va pas / à faire |
|---|---|---|---|---|
| Jeux vidéo (6,4 %) | Cartouche | ✅ | Idée claire, « PRESS START » + année à l'écran en pixels, jingle, pixel qui s'étire | Console et télé plates ; la carte devrait être la cartouche ; la cartouche passe devant l'écran en tombant |
| LoL (5,8 %) | Splash | 🔧 | Anneaux gravés élégants, belle montée | Le tunnel d'étoiles est générique (pourrait être n'importe quelle famille) ; rien ne rappelle la ligne ni la gamme de skin → teinte par gamme de skins, la carte naît au centre des anneaux |
| Skins CS (3,1 %) | Caisse | ✅ | La plus addictive : vraies cartes CS plus basses dans la bande, tics, ralentissement | Trop proche de l'interface du vrai jeu (bande horizontale + barre de rareté) ; s'arrête sur une case « mystère » au lieu de la carte → présentation propre au jeu, faux arrêt sur la case voisine avant le dernier cran |
| Valorant (2,7 %) | Inspection | 🔧 | La coupe qui fend l'écran est très efficace | La lame est un dessin plat ; une lame pour les Agents, pistolets et fusils (12 cartes) n'a pas de sens → variantes par classe |

### Pop Culture
| Famille (part) | Scène | Verdict | Ce qui marche | Ce qui ne va pas / à faire |
|---|---|---|---|---|
| Mangas & anime (16,7 %) | Case de manga | ✅ meilleure | Noir et blanc = DA du jeu, lignes de vitesse, onomatopée, la case qui se fend | Contenu des petites cases maladroit (demi-lune, rond) → trames et encrages abstraits ; c'est la plus grosse famille, elle mérite la version la plus soignée |
| Musique (15,4 %) | Vinyle | ✅ | Élégant, noir + label arc-en-ciel, bras, visualiseur | L'extrait de 30 s devrait partir quand le diamant se pose (il part après) ; visualiseur sur le vrai son ; la carte = la pochette |
| Séries TV (5,3 %) | Télé cathodique | ✅ | Neige, mire, « CH 03 » : immédiatement lisible | Fin trop proche de la Console (zoom dans l'écran) ; poste en bois hors DA → poste noir |
| Films (3,3 %) | Salle de cinéma | ✅ | Faisceau + poussière, amorce 3-2-1 | Fauteuils grossiers ; garder le seul 3-2-1 du jeu ici |
| Dessins animés (2,9 %) | Iris | 🔁 | Le rebond est rigolo | Le plus cartoon, hors DA → **remplacer par « Celluloïds »** : feuilles transparentes posées une à une sur une table lumineuse, un crayonné qui s'anime image par image, puis la carte |
| Acteurs (2,7 %) | Tapis rouge | 🔧 | Rafale de flashs, étoile gravée | Décor plat ; 2 indices seulement → vue à la 1re personne qui avance sur le tapis, flashs plus violents |
| YouTube (0,8 %) | Notification | 🔁 | — | Maquette de téléphone, émoji, ressemble à une interface → **remplacer par « Le direct »** : point rouge EN DIRECT, compteur de spectateurs qui s'emballe, messages qui défilent en texte libre, sans cadre (colle à la DA « texte sans fond ») |

### Sport
| Famille (part) | Scène | Verdict | Ce qui marche | Ce qui ne va pas / à faire |
|---|---|---|---|---|
| Football (5,0 %) | Tunnel | ✅ | Le tunnel fonctionne bien (béton qui défile, bouche de lumière), indices du championnat | L'extérieur (stade, projecteurs) est faible ; couleurs des clubs plus tard |
| Sports collectifs (4,1 %) | Buzzer | 🔧 | Tableau LED réussi, sirène | Ballon dessiné grossièrement, 3-2-1 en double avec Cinéma → panier ou but au buzzer selon le sport |
| Olympiques (3,5 %) | Photo-finish | ✅ | Idée originale, balayage + chrono + podium | Coureurs en blocs ; vrai rendu « étiré » du photo-finish, ligne d'arrivée ; 12 cartes à 2 indices |
| Combat (2,1 %) | Ring | ✅ | Cloches, poursuite, speaker en machine à écrire, gong | Ring qui ressemble à une barrière → vrai ring en perspective |
| Raquettes (0,9 %) | Arbitrage vidéo | 🔧 | La marque d'impact + « IN » | Perspective du court ratée (forme de « A ») → vue rapprochée de la ligne seulement, plus lisible |
| Glisse (1,2 %) | Chrono | 🔧 | Intermédiaires + vert « MEILLEUR TEMPS » | Panneau d'interface encadré (hors DA), décor pauvre → chiffres libres sur la neige, portes de slalom qui défilent |
| Mécanique (1,1 %) | Feux de départ | ✅ meilleure du sport | Simple, iconique, tension maximale | Feux plus réalistes, silence plus long avant l'extinction |
| Précision (0,9 %) | Échecs / golf / cible | 🔧 | Le golf marche | Le roi d'échecs (police symbole) s'affiche mal et tombe bizarrement → silhouette dessinée ; la cible est générique |
| Esport (1,3 %) | Arène | 🔁 | Le « GG » en glitch | 3e compte à rebours, mur LED générique → **remplacer par « Le dernier coup »** : fil d'actions en texte qui défile de plus en plus vite, écran figé, « VICTOIRE » |
| Coulisses (1,1 %) | Vestiaire | ✅ | Casiers métalliques (colle à l'ultra-réalisme), cadenas, porte qui s'ouvre | Ajouter la plaque ★★★★★★ et la lumière qui coule de la porte |

### World
| Famille (part) | Scène | Verdict | Ce qui marche | Ce qui ne va pas / à faire |
|---|---|---|---|---|
| Animaux (5,5 %) | Piège photo | ✅ | Viseur, vision nocturne verte, horodatage : très immersif | L'émoji 🐾 → **deux yeux qui brillent dans le noir puis clignent** (aucun spoil de l'espèce, effet garanti) ; ambiances sonores à faire en échantillons |
| Lieux (4,2 %) | Globe | ✅ | Globe en points : futuriste, dans la DA | Zoom final maladroit (le disque déborde) ; l'épingle tombe au hasard → coordonnées Wikidata ; carte postale beige hors DA |
| Nourriture (2,1 %) | Distributeur / Cloche | 🔧 / ✅ | Cloche : vapeur, lumière dorée, réussie | Distributeur : produits en blocs gris, bon marché ; la vapeur coûte cher (46 images/s) |
| Voitures (1,5 %) | Bâche | ✅ | Projecteurs qui claquent, silhouette en traits de lumière, appel de phares | Même silhouette de sportive pour une Austin Mini ou une 2 CV → 3 silhouettes (citadine, sportive, supercar) ; bâche grossière |
| Ardèche (0,5 %) | Carte topo | ✅ | Le plus élégant : lignes blanches sur noir, la rivière bleue | 2 indices seulement ; rien d'autre |

**Bilan : 15 ✅ à garder (dont Mangas, Vinyle et Feux, les meilleures) · 8 🔧 à améliorer · 3 🔁 à remplacer (Iris, Notification, Arène).**

## 4. Ordre de travail proposé

1. **Corriger les indices** (anti-spoil des 290 cartes, meilleurs 3es indices, tailles de texte) : rapide, ça touche toutes les 6★.
2. **La carte actrice de sa scène** (calque à trou + fin de scène sur la carte) : le plus gros gain, à faire d'abord sur les 7 grosses familles (60 % des tirages) : Mangas, Musique, Jeux vidéo, LoL, Animaux, Séries, Football.
3. **Passe DA** : plus aucun émoji, plus de panneau encadré, décor monochrome + un accent, fins toutes différentes.
4. **Remplacer** Iris → Celluloïds, Notification → Le direct, Arène → Le dernier coup.
5. **Sons réalistes** en échantillons libres de droits (foule, moteur, déclencheur, vinyle, sifflet, ambiances).
6. Le reste des 🔧 par ordre de poids.
7. Test sur un vrai téléphone (fluidité, polices japonaises de l'onomatopée).

## 5. Questions pour Tom et Hugo

- La carte actrice : calque à trou (rapide, décor 2D autour de la vraie carte 3D) ou décors en vraie 3D (plus beau, beaucoup plus long) pour les 7 grosses familles ?
- Anti-spoil : cacher le 3e indice quand il donne la carte, ou le garder (certains aiment deviner avant) ?
- Les 3 remplacements proposés vous vont-ils ?
