# Règles du jeu — récap complet du groupe + correspondance code (mis à jour le 2 nov 2026)

Récap rédigé par le frère de Tom (côté données, via Kimi). Tom + Claude = côté code. Mis à jour avec ses réponses du 1er nov., la réorganisation en **4 thèmes** (1er nov., soir) et les décisions du **2 nov.** (noms des packs, taux Bébou, contrats, Ardèche, Valorant, recharge des boosters).

## 1. Le concept
- Site **privé, entre nous**, d'ouverture de cartes à collectionner. **Un jeu de collection de cartes, pas un jeu Pokémon** : Pokémon est un sous-thème parmi d'autres.
- Le but, dans cet ordre : **la dopamine à l'ouverture**, **chacun sa collection**, **échanges de doublons entre nous**.
- **Beaucoup, beaucoup de cartes** : plein de sous-thèmes, du gros volume.
- Le cœur du projet : thème secret **« Les Bébous »** — des cartes de nous-mêmes. **La carte la plus rare du site, c'est un de nous.**
- **5 cartes par pack** (confirmé le 2 nov. : plus nerveux, chaque carte compte).

## 2. Qui fait quoi
- **Tom (+ Claude)** : tout le code du site, toutes les mécaniques de jeu — packs, **taux de drop**, contrats, animations, échanges…
- **Le frère (via Kimi)** : base de données et **classification** des cartes — specs par sous-thème, fichiers de données, tri des étoiles. **Jamais de mécaniques de jeu.**
- **Le groupe** : valide les sous-thèmes, ajuste les étoiles, fournit les photos pour les thèmes perso.

## 3. Organisation : 4 thèmes × sous-thèmes — 5 packs officiels
Chaque carte a **2 tags** : son **thème** (1 des 4) + son **sous-thème**.

**Noms officiels des 5 packs (2 nov.)** : **Bebou Pack** · **Gaming Pack** · **Pop Culture Pack** · **Sport Pack** · **World Pack**.

| Pack (thème) | Sous-thèmes | État |
|---|---|---|
| **Gaming Pack** | Pokémon · Valorant · Yu-Gi-Oh · Champions LoL · Skins CS · Jeux vidéo | **Pokémon (1025) + Valorant (995) branchés** ; LoL prêt côté données (173) |
| **Pop Culture Pack** | Films · Séries · Mangas / Anime · Marvel (MCU) · Musique · Youtubeurs | bientôt |
| **Sport Pack** | Sport · Esport | bientôt |
| **World Pack** | **Ardèche** · Lieux & pays · Nourriture · Voitures · Animaux | bientôt |
| *(secret)* **Les Bébous** | 8 cartes, une par membre (surnom + photo), toutes SECRÈTES | surnoms et photos : **à la fin**, quand le reste sera avancé |

**Bebou Pack** : le pack de base, qui contient **toutes les cartes des 4 thèmes**, et le **seul** endroit où peuvent tomber les 8 cartes secrètes Bébous.

**Ardèche (décision du 2 nov.)** : on ne l'abandonne pas. Sous-thème du **World Pack**, en **petit ensemble de cartes rares** : villages, spécialités, lieux iconiques, private jokes. → côté données : peu de cartes, et des étoiles hautes (pas de 1★/2★ — à confirmer dans la spec du sous-thème).

Règles de contenu par sous-thème : LoL = champions uniquement (pas les skins) ; **Valorant = skins Deluxe et au-dessus + couteaux + 30 agents, sans chromas ni Select/Standard (spec du 2 nov.)** ; CS = tous les skins, couteaux et gants en hautes étoiles ; Jeux vidéo = jaquettes + personnages cultes, toutes plateformes et époques ; Séries / Films = œuvres connues, personnages ET acteurs (FR et monde) ; Mangas / Anime = grosses œuvres, persos principaux + antagonistes + secondaires marquants ; Marvel = MCU (films et séries) ; Musique = artistes + albums cultes + titres, tous genres, beaucoup de français (pas que rap) ; Youtubeurs = FR + top 1 % monde ; Sport = tous sports, athlètes actuels + légendes ; Esport = gros joueurs de plein de jeux ; Nourriture = plats iconiques + snacks/marques + fast food + chefs connus.

Idées en réserve (non validées) : memes du groupe, Star Wars, Disney/Pixar, Harry Potter, Magic.

## 4. La rareté
- Étoiles **1★ à 6★ sur toutes les cartes**, **gérées par sous-thème**.
- Répartition cible **par sous-thème** (composition, PAS fréquence de tirage) : **30,93 / 23,71 / 20,62 / 11,34 / 9,28 / 4,12 %** (1★ → 6★).
  - Pokémon (1025) : **317 / 244 / 211 / 116 / 95 / 42** · Valorant (995) : **308 / 236 / 205 / 113 / 92 / 41** · Champions LoL (173) : **53 / 41 / 36 / 20 / 16 / 7**.
- Tri proposé à partir de **sondages de popularité quand ils existent**, puis **ajusté manuellement via Excel**.
- **Les poids de drop par étoile se règlent côté code** (voir « Taux de drop »).
- **Rareté SECRÈTE au-dessus de tout**, réservée aux Bébous.

### Règle de drop des Bébous (2 nov.)
- **1 chance sur le nombre total de cartes du jeu, PAR PACK**, uniquement dans le **Bebou Pack**. Les 4 packs de thème n'en donnent jamais.
- Exemple : 10 000 cartes → 1 sur 10 000 ; 100 000 cartes → 1 sur 100 000. **Aujourd'hui : 2 028 cartes (1025 Pokémon + 995 Valorant + 8 Bébous) → 1 sur 2 028.**
- **Recalculé automatiquement** à chaque ajout de cartes (rien à régler). Le chiffre affiché dans la boutique et sur le pack suit tout seul. Le Bébou prend la dernière place du pack (révélée en dernier).

## 5. Le format des cartes
- **Nom + image + étoiles. C'est tout.** Pas de stats, pas de notes.
- Noms **en français quand ça existe**, sinon nom original.
- **Une seule édition par sous-thème** — pour plus de cartes, on les ajoute au sous-thème existant.
- Gabarit des cartes du jeu : **« Pleine illustration »** (sous-thème en grand au-dessus du nom, numéro « 025 / 1025 » en haut à droite). La **collection affiche les vraies cartes** obtenues (même gabarit que la 3D).
- **Un visuel de booster par pack** (Gaming Pack, Pop Culture Pack, Sport Pack, World Pack) + le **Bebou Pack**.

## 6. Contrats façon CS:GO (2 nov.) — l'usage des doublons
- On brûle **des doublons d'une même étoile** contre **une carte de l'étoile au-dessus**.
- Prix (selon l'étoile brûlée) : **1★ et 2★ → 10 cartes · 3★ et 4★ → 20 cartes · 5★ → 50 cartes**. Pas de contrat 6★.
- **Jamais le dernier exemplaire** d'une carte : la collection ne recule pas.
- Comme dans CS:GO, la carte reçue vient **des sous-thèmes des cartes brûlées, au prorata** (7 Pokémon + 3 Valorant → 70 % / 30 %).
- **Bonus collection** : si le sous-thème tiré a des cartes de cette étoile que tu n'as pas, tu reçois forcément une **nouvelle** carte.
- Jamais de Bébou par contrat.

## 7. Boosters : recharge (2 nov.)
- **1 booster toutes les 5 minutes, jusqu'à 15 en réserve** (remplace le « +2 toutes les 12 h »).
- Indicateur dans l'en-tête : réserve **x/15**, compte à rebours du prochain, barre de progression.

## 8. Où on en est
- **La page de jeu est en ligne** : https://cardgamepriv.pages.dev/jeu/ (labo : https://cardgamepriv.pages.dev/).
- Gaming Pack : **Pokémon 1025 + Valorant 995**. Bebou Pack ouvrable. Pop Culture, Sport, World affichés « bientôt ».
- Onglets : Boutique · Collection · **Contrats** · Échanges.

## 9. Process pour un nouveau sous-thème
1. On choisit un sous-thème (dans l'un des 4 thèmes).
2. Le côté données produit : spec BDD + **Excel de tri des étoiles validé** (comme `Tri-etoiles-valorant.xlsx` : nom, type, URL d'image, colonne « Étoiles finales (VALIDÉ) »), ou un fichier au format de `pokemon151.ts`.
3. Le groupe ajuste les étoiles si besoin.
4. Côté code : script de récolte (ex. `scripts/make-valorant.py` : images téléchargées en local, fichier `src/core/sets/<sous-thème>.ts` généré), `npm run thumbs`, entrée dans `SUBTHEMES` (`src/core/sets/themes.ts`), puis `deployer.cmd`. Le pack du thème, le Bebou Pack (et son taux Bébou), la collection, les contrats, les échanges et le serveur suivent seuls.

---

## Taux de drop (côté code, `src/core/dropRates.ts`, partagé client + serveur)
Booster de 5 cartes = 4 emplacements normaux + 1 emplacement garanti rare ou mieux (révélé en dernier). On tire l'étoile, puis une carte du thème (tous sous-thèmes confondus) à cette étoile.

| | emplacements 1–4 | emplacement 5 | résultat par booster (vérifié sur 400 000 packs) |
|---|---|---|---|
| 1★ | 58,25 % | — | |
| 2★ | 27 % | — | |
| 3★ | 10 % | 71,5 % | une rare ou mieux dans chaque booster |
| 4★ | 3,5 % | 21 % | épique ou mieux : 1 booster sur 2,4 |
| 5★ | 1 % | 6 % | légendaire ou mieux : 1 sur 8 |
| 6★ | 0,25 % | 1,5 % | mythique : 1 sur 40 |
| ✷ | — | — | 1 / nb total de cartes par Bebou Pack (1 sur 2 028 aujourd'hui), tirage à part |

## ✅ Fait
- **1er nov.** : rareté secrète + Bébous (expérience 039 « Un de nous »), page de jeu `/jeu/` (boutique, ouverture 3D, collection, échanges, mode démo), serveur Convex (tirage partagé, alertes Discord), préchargement, retours du labo en ligne, `deployer.cmd`. Retours d'Hugo (gabarit Pleine illustration, dos « B », moins de particules). Gyroscope, vibrations, payoff légendaire/mythique, bloom de la visionneuse, holo radial des épiques.
- **2 nov.** : noms officiels des 5 packs ; taux Bébou = 1 / nb total de cartes ; Ardèche dans le World Pack ; **Valorant (995 cartes) branché** ; collection = vraies cartes ; **contrats façon CS:GO** ; **recharge 1 booster / 5 min, 15 max**. 23 tests serveur.
- **2 nov. (nuit)** : passe de finitions, que des petits détails (aucune règle changée) — toucher le booster pour l'ouvrir, halo à sa couleur, textes « touche / clique » selon l'appareil, éventail qui réagit au survol, cartes neuves marquées d'une pastille dans la collection, navigation carte à carte (← →), recherche sans accents, chiffres à la française, cache des cartes (collection instantanée au retour), définition 3D qui s'adapte aux téléphones lents, icône de l'app et aperçu pour Discord. Détail complet dans LAB_NOTES.
- **2 nov. (matin)** : deuxième passe de finitions (aucune règle changée) — sur ordinateur le booster se centre dans l'espace libre ; glisser le doigt sur le booster ou faire défiler le carrousel change de booster ; miniatures des vrais boosters ; collection fluide même sur 2 020 cartes (filtres qui restent en haut, bouton ↑, filtre « Nouvelles », dire où trouver une carte manquante) ; le « retour » du téléphone ferme la carte en grand ; pastille dorée des nouvelles cartes sur l'onglet Collection ; contrats et échanges sans clignotement ; halo de rareté dans la visionneuse ; bug « maintenir Espace » corrigé. Détail dans LAB_NOTES.

## V2 (plus tard)
- Collection en 3D (classeur / salle d'expo).
- Ouverture plus rapide façon éventail (013) et ouverture hybride déchirure + brûlure.
- Sound design 2.0.

## Reste à faire
- Brancher les 173 champions LoL (Gaming Pack) quand les fichiers arrivent.
- Ardèche : liste des cartes + photos (côté données / groupe).
- À la fin : 8 surnoms + 8 photos des Bébous — portrait vertical (3:4, ex. 1200×1600), visage dans le tiers haut, fichiers `bebou-1.png` … `bebou-8.png` dans `public/art/bebous/`.
