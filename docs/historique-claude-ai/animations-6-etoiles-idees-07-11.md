# Animations des 6★ par famille — 2e passe (07/11)

1 561 cartes 6★ réparties en 27 familles. Déjà faits : Pokémon (rencontre sauvage), Yu-Gi-Oh (invocation), Merveilles (diorama 3D, secrètes), Musique (extrait 30 s). Ce document est la base à valider par Tom, famille par famille : garder / changer / enlever.

## 1. Ce que font les meilleurs (et ce qu'on en retient)

- **Pokémon TCG Pocket — cartes immersives** : à l'ouverture, une petite cinématique fait « entrer » dans l'illustration ; on peut la rejouer depuis la collection. Elles sont réservées à quelques cartes par extension, car chacune est faite à la main.
  → Pour nous : impossible à la main pour 1 561 cartes. On fait **un modèle par famille, nourri par les données de la carte** (nom, image, pays, année, club…), et on le rejoue depuis la visionneuse.
- **EA FC — les « walkouts »** : avant la carte, la cinématique dévoile des indices un par un (poste, nation, championnat, club). Le joueur devine en même temps. La lumière du début annonce déjà le niveau.
  → C'est la meilleure grammaire de suspense pour nous : **des indices tirés des données avant la carte** (thème → famille → détail). Défaut connu là-bas : les joueurs trouvent ça long → animation complète la 1re fois, courte ensuite, toujours passable d'un toucher.
- **Hearthstone — cartes Diamant** : un élément 3D sort du cadre.
- **Marvel Snap** : l'illustration elle-même s'anime, puis la bordure.
  → Pour nous c'est **interdit sur la carte** (C6 : la carte reste nette). Le spectacle se joue **autour** : décor, objets 3D, son, lumière de la scène.
- **League of Legends** : les skins les plus rares ont une vraie mise en scène de cinéma. Ça colle à nos 87 cartes LoL, qui sont surtout des skins prestige ou uniques.

## 2. Une même structure pour toutes les 6★ (4 temps, ≈ 4–6 s la 1re fois)

1. **Annonce** (déjà là) : noir, silence, la tranche passe à l'arc-en-ciel.
2. **Indices** (1,5 s) : 2 ou 3 infos qui claquent plein écran, à la manière d'un walkout. Par exemple : « GAMING » → « JEUX VIDÉO » → « 2008 ». Ou : « SPORT » → « FOOTBALL » → « PREMIER LEAGUE ». Tout est déjà dans nos données (thème, famille, sous-famille, année, type…).
3. **Scène de la famille** (2–3 s) : le décor propre au groupe (ci-dessous).
4. **La carte** : le retournement actuel, inchangé, puis le nom et les étoiles.

Ensuite : version courte (1,5 s) dès qu'on a déjà vu cette scène (comme `markWildSeen` pour Pokémon). Bouton « Rejouer » dans la visionneuse. Option « Effets réduits » : indices seulement, pas de scène.

## 3. Idées détaillées par famille

Taille de chantier : P = petit (2D / DOM, 1/2 j) · M = moyen (scène 3D simple, 1 j) · G = gros (modèles 3D, sons à récolter, 2 j et +).

### Gaming
- **Jeux vidéo (97 : Summoners War, GTA, Mario, Zelda, FF…)** — *Cartouche* · M
  Indices : GAMING → nom de la famille (« ZELDA ») → année. Scène : console rétro 3D sans marque, la carte glisse dans la fente, l'écran cathodique s'allume en pixels avec « PRESS START » et l'année, le pixel s'étire jusqu'à la carte. Visionneuse : fond d'écran cathodique à balayage, petit jingle 8-bit **original**. Données : année et type (jaquette / perso / objet) déjà là.
- **League of Legends (87 : skins)** — *Splash* · M
  Indices : GAMING → LEAGUE OF LEGENDS → ligne (« MID ») ou gamme (« K/DA »). Scène : la caméra traverse l'illustration en profondeur (relief calculé depuis l'image), puis elle se replie en carte. Visionneuse : l'illustration en relief derrière la carte, pilotée par le gyroscope. Risque : le relief demande une carte de profondeur. Repli : un simple travelling 2D.
- **Skins CS (46 : couteaux, gants)** — *Caisse* · P
  Scène : bande d'objets qui défile et freine, sans aucune interface du vrai jeu. Les autres cases sont de vraies cartes CS du catalogue, de rareté plus basse. Dernier cran sur la 6★. Visionneuse : inspection 3D (rotation au doigt). Le défilement est déjà une forme connue chez nous (roulette, roue PC).
- **Valorant (41 : surtout des couteaux)** — *Inspection* · M
  Scène : l'arme (son illustration détourée, en plaque épaisse) tourne devant la caméra comme une inspection, avec le bruit sec du métal, puis se pose dans la carte. Visionneuse : même inspection au gyroscope.
- **Pokémon (42)** : garder la rencontre sauvage.

### Pop Culture
- **Mangas & anime (261, la plus grosse famille)** — *Case de manga* · M
  Indices : POP → MANGAS & ANIME → série (« JUJUTSU KAISEN »). Scène : une page de manga noir et blanc. La case du milieu se fend sous les lignes de vitesse, une onomatopée géante apparaît (« DON ! », « ZAN ! », au hasard dans une liste), et la carte jaillit de la case. Visionneuse : lignes de vitesse quand on fait pivoter vite la carte. Yu-Gi-Oh garde son invocation.
- **Musique (232)** — *Vinyle* · P (l'extrait existe déjà pour 200 cartes)
  Scène : la pochette (l'image de la carte) glisse, le disque sort et tourne, le diamant se pose, l'extrait démarre. Autour de la carte, des barres de visualiseur qui suivent vraiment le son (analyseur Web Audio). Visionneuse : le disque tourne derrière la carte pendant l'extrait. Les 32 cartes sans extrait ont le vinyle, sans son.
- **Séries TV (80)** — *Télé cathodique* · P
  Scène : une vieille télé s'allume (la ligne blanche qui s'ouvre), deux secondes de zapping avec de la neige, puis la carte à l'écran. Visionneuse : bouton « Zapper » vers une autre 6★ de la même série, si on l'a.
- **Films (50 : MCU, Star Wars, HP…)** — *Salle de cinéma* · M
  Scène : la salle s'éteint, le faisceau du projecteur s'allume, un compte à rebours de pellicule 3-2-1 sans logo, et la carte apparaît sur l'écran. Visionneuse : bandes noires de cinéma, et le titre façon générique.
- **Dessins animés (44)** — *Iris* · P
  Scène : rond noir qui s'ouvre, la carte arrive en rebondissant (écrasement-étirement), avec un « boing » original. Visionneuse : petit rebond quand on la touche.
- **Acteurs & actrices (41)** — *Tapis rouge* · P
  Scène : rafale de flashs blancs (ça marche en noir et blanc), puis une étoile gravée au sol avec le nom, qui devient le socle de la carte. Visionneuse : un flash de temps en temps.
- **YouTube (12)** — *Notification* · P
  Scène : un téléphone vibre, notification « vient de publier », bouton lecture, cloche qui sonne. Aucun logo. Visionneuse : compteur qui défile.

### Sport
- **Football (75)** — *Tunnel* · M
  Indices façon walkout : SPORT → championnat (déjà dans la sous-famille : « PREMIER LEAGUE ») → club ou sélection. Scène : sortie du tunnel vers la pelouse, clameur, les projecteurs du stade s'allument un par un. Visionneuse : chants de tribune en fond. À récolter : **couleurs des clubs** (Wikidata a une propriété « couleur officielle », remplie seulement pour une partie des clubs). Repli : tunnel noir et blanc.
- **Sports collectifs (62 : basket, rugby…)** — *Buzzer* · P
  Scène : tableau d'affichage 3-2-1, sirène, le ballon de la discipline (basket, rugby, hand…) part en cloche et la carte se révèle à l'impact.
- **Olympiques & athlétisme (52)** — *Photo-finish* · P
  Scène : ligne de balayage verticale qui « imprime » la carte de gauche à droite, comme une photo d'arrivée, puis la carte monte sur la 1re marche du podium.
- **Combat (31 : catch, boxe…)** — *Ring* · P
  Scène : cloche, annonce du speaker en grand texte (« DANS LE COIN ROUGE… »), poursuite de lumière, la carte au centre du ring.
- **Raquettes (14)** — *Arbitrage vidéo* · P
  Scène : trajectoire de balle en ralenti, rebond, marque « IN » à l'impact.
- **Glisse & montagne (18)** — *Chrono* · P
  Scène : temps intermédiaires qui défilent, chrono final vert « meilleur temps ».
- **Sports mécaniques (16 : moto, F1, rallye)** — *Feux de départ* · P
  Scène : cinq feux rouges s'allument, puis s'éteignent d'un coup, la carte part, le moteur rugit.
- **Précision & stratégie (14 : golf, échecs, billard…)** — *Ralenti du geste* · P
  Scène selon la discipline : putt qui roule, fléchette au centre, échec et mat. Une petite variante par sport, toutes sur le même modèle.
- **Esport (20)** — *Arène* · P
  Scène : écran LED géant, compte à rebours, « GG » et textes de commentateur.
- **Coulisses & légendes (16 : stades, arbitres…)** — *Vestiaire* · P
  Scène : un casier s'ouvre sur la carte. Pour les arbitres : coup de sifflet.

### World
- **Animaux (83, dont 61 mammifères)** — *Piège photo* · M (G avec les cris)
  Indices : WORLD → classe (« MAMMIFÈRE », déjà dans nos données) → milieu. Scène : viseur de caméra de terrain (REC, horodatage, vision nocturne verte → passe en couleur), traces de pas qui traversent l'écran, puis la carte. Visionneuse : ambiance sonore du milieu (savane, forêt, océan : 6 ambiances suffisent). **Cris individuels** : xeno-canto (oiseaux, chauves-souris, grenouilles, mammifères terrestres) et Wikimedia Commons. Licences Creative Commons, souvent « pas d'usage commercial / pas de modification » : bon pour un jeu entre amis, mais couper un extrait peut compter comme une modification. xeno-canto demande une clé d'API depuis octobre 2025. Je propose de commencer par les ambiances, puis les cris en 2e temps.
- **Lieux & pays (63, dont 53 monuments)** — *Globe* · M
  Scène : un globe noir et blanc tourne et plonge sur le pays, une épingle se plante, la carte arrive comme une carte postale tamponnée. Visionneuse : coordonnées et heure locale du lieu. À récolter : coordonnées (Wikidata P625), une fois pour toutes. Les Merveilles gardent leur diorama.
- **Nourriture (31 : snacks, plats)** — *Distributeur / Cloche* · P
  Snacks et marques : un distributeur automatique fait tomber la carte. Plats : une cloche de restaurant se soulève, avec un grésillement.
- **Voitures (23, dont 17 supercars)** — *Bâche* · M
  Scène : la bâche glisse, les projecteurs du garage claquent un par un, le moteur rugit (sons génériques, un par catégorie). Visionneuse : appel de phares.
- **Ardèche (7)** — *Carte topo* · P
  Scène : les courbes de niveau se dessinent, la rivière suit son tracé jusqu'à la carte. Le clin d'œil local.

## 4. Données

| Besoin | Déjà là | À récolter |
|---|---|---|
| Indices (thème, famille, sous-famille) | oui, toutes les cartes | — |
| Année (JV), type (Monde), artiste (Musique) | oui | — |
| Extraits musicaux | 200 / 232 | 32 manquants |
| Championnat (foot) | oui (sous-famille) | — |
| Couleurs des clubs | non | Wikidata, partiel |
| Coordonnées des lieux | non | Wikidata P625 |
| Ambiances sonores (6) | non | banque libre de droits |
| Cris d'animaux | non | xeno-canto / Commons, licences à vérifier |
| Sons des scènes (moteur, cloche, sifflet, flashs…) | non | une vingtaine de sons libres de droits |

Règle : **aucune musique, aucun logo, aucune interface reprise** d'un jeu, d'un film ou d'une marque. Uniquement des sons et des décors originaux ou libres de droits.

## 5. Côté code

- Un registre `mythicScene(cardId) → scène` qui généralise ce qui existe déjà : `onPokemon` / `runWild` dans shop.ts, `withWildEncounter` et `withDuelSummon` sur la visionneuse. Chaque scène est un module chargé seulement quand une 6★ de sa famille tombe (le poids du site ne bouge pas).
- Chaque scène expose : `indices(card)`, `prelude(card, court)` pour l'ouverture, `viewer(card)` pour la visionneuse, et `fallback` en « Effets réduits ».
- Tout se joue dans la scène 3D d'ouverture déjà en place (pas de 2e moteur), plus des calques DOM pour les textes.
- « Vu une fois » enregistré par famille, comme `markWildSeen`.

## 6. Ordre proposé (impact × facilité)

1. Le socle : structure en 4 temps et indices, utiles pour toutes les familles d'un coup.
2. Mangas & anime (261) · Musique-vinyle (232) · Séries TV (80) : beaucoup de cartes, scènes simples.
3. Jeux vidéo (97) · LoL (87) · Football (75) · Animaux (83, en ambiances).
4. Toutes les petites familles en P.
5. Les « G » : cris d'animaux, couleurs des clubs, relief LoL.

## 7. Questions pour Tom

- Les indices façon walkout avant la carte : oui pour toutes les 6★, ou réservés à certaines familles ?
- Durée : 4–6 s la 1re fois, 1,5 s ensuite. Ça te va ?
- Les sons : le jeu est-il souvent joué avec le son ? (Ça décide si on investit dans les cris et les ambiances.)
- Les secrètes (Bébous, KCDQ) : leur séquence « Un de nous » reste à part, d'accord ?
