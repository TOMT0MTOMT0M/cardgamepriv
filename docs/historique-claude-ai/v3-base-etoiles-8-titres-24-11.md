# V3 : base Etoiles 8, titres, roulette, lot 2 (24-25/11)

Tout est sur la branche `v2` (la V3), pas encore poussé. Commits : `d30b3de` et `c711e1d` (Etoiles), `c868a0b` (titres), `2058eef` (roulette / abonnement).

## À lancer par Tom
1. `lanceurs\push.cmd`
2. `lanceurs\mettre-en-ligne-v2.cmd` : envoie environ 490 nouvelles images sur R2, lance `remapCards` puis `purgeCards` sur le staging.
- Le lot 2 sur le live : `.wt-master\METTRE-EN-LIGNE-v2.1.8.cmd` (recréé le 25/11). Il ne contient que le lot 2 : zip 10, musiques, ondes.

## Fait
- **Base Etoiles 8** :
  - source `donnees/base/Etoiles-8.xlsx`, `make-etoiles.py` génère `etoiles.ts`, appliqué par installCatalog ;
  - le catalogue est identique à la base carte pour carte (41 047 cartes) ;
  - 14 nouveaux albums, 43 albums vidés retirés ; voitures gardées dans le World Pack ;
  - 44 doublons transférés chez les joueurs (`remapCards`), 79 cartes purgées ;
  - `purgeCards` ne touche jamais une carte du catalogue (19 ids réutilisés) ;
  - Bébous / KCDQ rouverts (photos 3 à 8 provisoires).
- **Images** : 492 sur 848 nouvelles cartes. 70 cartes 5★ / 6★ sans image :
  - Summoners War (22), classes Dofus (12) et Wakfu (13), X-Men (8), Fast & Furious (7) ;
  - Vegeto, Gogeta, Obito (AniList ne répondait plus, à relancer) ;
  - Nomade (Wanderer), GTA VI, Béatrice Hess.
- **Titres** : 79 ajoutés (83). L'album « lieux » porte « Globetrotteur ».
- **Roulette** : 1 000 pièces le numéro, 2 000 avec une couleur.
- **Abonné** : une mise gratuite par jour (un numéro, sans couleur), avec un avantage affiché sur la page Abonnement.
- Vérifié : tsc, i18n, build v2, 273 tests serveur.

## Reste à faire (instructions du 25/11, points 3 à 8)
1. **Packs événement** : 7 jours, 1 offert par heure, réserve de 3 (5 pour un abonné), achat à 10 × le prix d'un booster (2 500 pièces). Le pack événement consomme sa propre réserve (aujourd'hui il prend un booster normal). Texte de l'avantage abonné prêt (`ab.p5`).
2. **Avent** : nouvelle grille jour par jour (pièces et boosters).
   - Cosmétiques : cadres Flocon givré, Sucre d'orge, Chapeau de Noël ; bannières Village enneigé, Atelier du Père Noël ; animations de profil Chute de neige, Aurore boréale (genre nouveau) ; ouvertures Déchirure glacée, Étoile de Noël.
   - Jour 24 : god pack avec au moins 1 hit. Étoile du sapin alignée.
3. **Roulette** : toucher le pot pour voir la carte en grand ; couleurs dans le replay.
4. **Pity** : le compteur de l'en-tête est déjà figé pendant l'ouverture. Il faut savoir dans quel cas Tom l'a vu bouger trop tôt (1 booster, × 10, Direct 4★ ?).
5. **Succès** : ouvertures à gagner, avec un aperçu au déblocage (seule la Déchirure pour l'instant) ; paliers plus longs ; récompenses proportionnelles.
6. **Sachets** par thème : choisir une piste du labo 046.
7. **Booster Télé** de décembre : attend les cartes.
8. **Marché** plus visuel (façon Kyara) : captures à demander.
9. **Animaux** : poissons rangés en Mammifères, etc. À corriger dans la base (Etoiles 9 pour Hugo).
