# Retours 05/11 — avancement (commit 8bfa468, à pousser via lanceurs\push-et-mettre-en-ligne.cmd)

- **Collection** : thème → FAMILLES (groupes : Pokémon, Valorant, LoL, Skins CS, Jeux vidéo ; Mangas & anime, Films…) → sous-familles (Kanto, Johto…) → cartes. Lien #/collection/pokemon = la famille. `famId` dans collection.ts.
- **Cartes** (gabarit full-art + classic) : famille en grand (`cardFamily()` dans themes.ts), sous-famille en bas à droite à la place du numéro (déjà en haut à droite). Albums / chansons : artiste en bas à gauche (src/core/sets/popArtists.ts, Wikidata P175, 2 200 / 2 500 cartes ; scripts/pop-artists.py). Sujets larges (armes Valorant/CS) recentrés (imageSubject.ts). Gabarit « photo horizontale » préparé : `LANDSCAPE` dans src/core/art/index.ts (design: null tant qu'il n'existe pas ; ~9 % des photos Pop sont horizontales). Cache des cartes peintes v4 + `FONT_VERSION` dans la clé.
- **Polices** : src/core/fonts.ts + fonts.css. Matcha World = gros titres seulement (logo, h1 de page, titres d'échanges, verdicts, nom 6★ plein écran) — accents et « · » ajoutés par scripts/build-fonts.py (l'original n'en a pas). Bold Frame en 3 graisses sous un seul nom : 400 texte · 500-600 libellés · 700 titres/noms de carte. Bold Frame = licence usage personnel.
- **Ouverture** : en série ×5/×10 chaque booster rejoue son ouverture ; « Tout révéler » ×2,2 (au lieu de ×3,5), 320 ms de lecture par carte, 5★ en version complète avec ralenti + 1,1 s d'admiration, 6★ inchangée.
- **Économie** : achat de boosters 250 pièces, 10/jour (`PACK_PRICE`, `PACK_BUY_DAILY`, mutation economy.buyPacks), dans la fiche booster. Bébous / KCDQ verrouillées (`BEBOU_SECRETS_LOCKED` dans themes.ts → chance 0).
- **Pack Battle** : « Remiser un booster » (nouveau duel, même adversaire, même nombre de boosters) remplace « Rejouer » ; Royale : « Nouvelle partie ».
- **Échanges** : un seul écran — tableau d'offres en haut (grille qui défile à droite, 1 rangée, 2 sur grand écran), échanges directs en dessous.
- **Succès** : paliers révélés un par un (« N paliers à découvrir »).
- **Musique 6★** : extrait 30 s iTunes pour 200 / 232 cartes (src/game/musicPreview.ts, données src/game/musicPreviews.data.ts) à la révélation et dans la visionneuse.
- **Profil** : onglet Vitrine (10 fonds dont 4 à débloquer + couleur), bouton « Mes amis » corrigé ; menu du haut en blanc plus vif.
