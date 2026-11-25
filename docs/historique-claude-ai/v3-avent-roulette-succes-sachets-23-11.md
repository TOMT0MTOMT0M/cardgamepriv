# V3 : avent en sapin, roulette, succès d'albums, sachets cartoon (23/11)

Branche `v2` (la V3), commits `4fd4508` → `ecd45e8`, posés par-dessus le patch v2.1.7. Pas encore poussés ni en ligne.

## Livré
- **Calendrier de l'Avent** : la page n'acceptait aucun geste (ni défilement ni toucher), corrigé ; même bug corrigé sur `#/abonnement`.
  - En sapin : l'étoile (24, God Pack) en haut, étages de 1 à 6 cases, tronc de 2 cases. Boules rouge / or / crème, sapin vert, tronc en bois.
  - Musique : « Jingle Bells » (domaine public) en boîte à musique, synthétisée (aucun fichier). Elle suit le volume et le bouton son du jeu. Bouton « Musique » pour la couper, retenu sur l'appareil.
- **Roulette** : une seule case verte (36). Impair = rouge, pair = noir.
  - Mise couleur à part retirée. On mise comme d'habitude (1 numéro depuis le patch v2.1.7). La couleur en option double le prix : 3 000 pièces, 4 cartes 5★ ou 2 cartes 6★.
  - Pot de secours : si personne n'a le numéro sorti, le pot va à la couleur sortie (la plus grosse mise d'abord, puis la première posée). Sinon il est reporté.
  - Les anciennes mises couleur du staging sont rendues au tirage.
- **Succès** : deux onglets, « Succès » et « Succès d'albums » (titres uniques + primes de complétion). Lien : `#/succes/albums`.
- **Labo 046 — sachets cartoon** : un logo par thème (ballon, globe, manette, pop-corn, télé, ourson) + « Bébou Cartes ». Trois pistes : Autocollant, Case de BD, Écusson. Planche des 6 thèmes en haut, sachet 3D au centre. Rien n'est branché sur le jeu.

## À choisir
- Une piste de sachet (ou un mélange), et le logo Bébou (ourson : proposition).

## Reste à faire
1. Brancher la piste choisie sur le jeu (vignettes, roue 3D, booster du moment).
2. Collection Télé (scraper fin novembre).
3. Passe « moins de texte » : Marché, Échanges, Jeux.
