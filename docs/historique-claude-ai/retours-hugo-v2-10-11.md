# Retours de Hugo sur la V2 (10/11)

Branche `v2`, 7 commits (`e5d5b40` → `6a3c616`). Typecheck OK, 134 tests Convex OK (dont `convex/market.test.ts`, nouveau). Pas encore poussé : le push depuis le VM n'a pas d'identifiants GitHub.

## Fait
- **Police des sachets** : retour à Matcha World, la police ronde d'origine, avec les réglages de relief V1 (cache `nom-v4`). Atsuka reste pour les gros titres de l'interface.
- **Formes rondes** : jetons `--r-pill` 999 px, `--r-box` 16 px, `--r-ctl` 10 px. Les repères d'angle sont éteints. La base noir et blanc reste, avec une couleur repère par page (pastille, onglet actif, règle graduée).
- **Déchirure** : un grain de son au plus toutes les 90 ms, environ 2,5× moins fort.
- **« Direct 4★ »** (remplace « 4★ et + ») : les cartes sous 4★ se rangent d'un coup et la scène va droit à la première 4★. Sans 4★ dans le booster, tout s'ouvre d'un coup. Le World Pack (éventail) garde l'ancien défilement.
- **Pity** : elle ne bouge plus au tirage, seulement une fois le booster fini.
- **Contrats** : 10 cartes pour chaque étoile, de 1★ à 5★.
- **Collection** : cartes plus grandes (2 colonnes au téléphone, environ 6 sur ordinateur), cache des cartes v12.
- **Collection des autres** : l'onglet Collection du profil montre toutes les cartes (recherche, étoiles). Bouton « Voir sa collection », lien direct `#/profil/<id>/collection`.
- **Échanges** : trois onglets, un écran à la fois — **Marché** (par défaut) · Avec un ami · Offres.
- **Marché** (table `market`, nouvelle, rien ne change pour la V1) : une carte à prix fixe en pièces, sans enchères. La carte reste en séquestre pendant la vente, et l'achat est atomique : le premier qui achète l'a. Prix de 1 à 10× la valeur de la carte, 10 annonces par joueur, pas de Bébou. La règle d'or de `economy.ts` est amendée : le marché entre joueurs est la seule exception.
- **5★** : toutes en pleine illustration, plus de gabarit Suisse.
- **6★ Musique** : 29 extraits manquants retrouvés (Au DD, Naha, Bande organisée, Jefe…) sur iTunes ou Deezer. Pour Deezer, l'id est gardé et l'aperçu signé est redemandé au moment de jouer, en JSONP. Les 299 adresses iTunes ont été vérifiées. Les récoltes automatiques existantes étaient justes. Il manque encore Poulenc.
- **6★ d'animés** : l'opening de l'animé joue en fond à la révélation et dans la visionneuse. Couvert : 101 animés sur 133. Berserk et Yu-Gi-Oh gardent leur musique. Sources : `scripts/data/previews-curated.json`, puis `harvest-curated-previews.py` et `make-music-previews.py`.

## À vérifier (lien V2)
1. Ouvrir 3 boosters avec « Direct 4★ » : un avec une 4★, un sans, un avec une 6★.
2. La pity ne change qu'au récap.
3. Le son de la déchirure.
4. Le nom moulé sur les sachets.
5. Échanges → Marché : vendre une carte, la retirer, en acheter une (deux comptes).
6. Le profil d'un ami → Voir sa collection.
7. Une 6★ d'animé : l'opening joue.

## Idées pour personnaliser chaque drop 6★ (à valider)
- Vidéo de l'opening : trop lourde (R2, droits). Garder la musique et ajouter un fond animé aux couleurs de l'animé.
- Sport : chant ou hymne du club. Jeux vidéo : thème principal du jeu. Films et séries : générique.
- Animés sans opening trouvé : Bocchi, Clannad, DanMachi, Dororo, Frieren, Fruits Basket, Golden Kamuy, Mushoku Tensei, Slam Dunk, Soul Eater, Steins;Gate, Vanitas… Liste complète dans `previews-curated-resolved.json` (valeur `null`).
