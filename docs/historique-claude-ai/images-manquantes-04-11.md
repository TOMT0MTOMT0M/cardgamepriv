# Images manquantes — récolte du 04/11/2026

- Départ : 7 519 cartes sans image (Cartes-sans-image-rempli.xlsx de Gemini : liens fabriqués, ~2,5 % existaient → non utilisés).
- 1re passe : 5 039 cartes illustrées. 2e passe (sources nouvelles) : +206. **Total 5 245 / 7 519 ; restent 2 274** (surtout 1-2★) → donnees/suivi/Cartes-sans-image-restantes.xlsx.
- Thèmes après gen : Pop Culture 16 327/17 471 · Jeux vidéo 2 928/3 396 · Sport 7 161/7 708 · World 5 228/5 343. Images envoyées sur R2.
- Sources 1re passe : Deezer, YGOPRODeck, wikis Fandom, TMDB (clé de Tom, prise de vues réelles seulement), TVmaze, YouTube, GBIF→iNaturalist, TheSportsDB, Steam, Openverse, Wikipédia (titre exact).
- Sources 2e passe : wikis Disney FR/EN, Pixar, Ghibli, Star Wars, HP… (choisis via la société de production TMDB), AniList, TheAudioDB, Yugipedia, Open Food Facts, ESPN (même sport exigé). 15 homonymes retirés à la relecture.
- Import : scripts/fill-images.py → save() du thème + journal de récolte (« fill:<source> ») ; gen des 4 thèmes ; typecheck + 77 tests OK.
- Limites rencontrées : Fandom (pages anti-robot) et Wikimedia (429) ont limité nos requêtes — non contourné. Recherche Google/Bing en masse refusée (contournement anti-robots).
- Restes notables : Summoners War (79, aucune illustration > 100 px nulle part), footballeurs obscurs, personnages de dessins animés, parfums Monster/Red Bull.
- Piste pour la suite : relancer Wikipédia/Wikidata et Fandom un autre jour (limites levées), ou remplir à la main la colonne G de l'Excel des restantes.

## 05/11 — les 113 cartes 4★+ restantes (commit f29f244)
- Purge du 04/11 (autre session) : les 1-3★ sans image ont été retirées du jeu ; restaient 113 cartes 4★+ (donnees/suivi/Cartes-4etoiles-sans-image-a-faire.xlsx).
- **110 images ajoutées** : les 70 liens « Piste » (colonne I — 41 Summoners War, objets gaming, Pop Culture) + 40 images du dossier de Tom (nom du fichier = nom de la carte, suffixe « — sous-thème » pour départager). Relues une à une ; Lapis (Magic Knight eau) recadrée sur le bon perso ; pixel art (Épée en diamant, BFG 9000) agrandi sans flou. Quelques Summoners War sont des captures du jeu avec l'interface (Abellio, Perna, Zaiross, Zeratu) — à remplacer si mieux trouvé.
- Archive de travail : .cache/hv-4etoiles (results.json + img/), import par scripts/fill-images.py.
- **Supprimées** (purged-ids.json + convex/purgedCards.ts, migration purgeCards à la mise en ligne) : « Remix: Fly Me to the Moon » (Acteurs — l'image d'origine de l'Excel montrait **Kaye Ballard**, c'est elle qui était visée) et « List of songs in Guitar Hero III: Legends of Rock » (Albums, page de liste Wikipédia, pas un album).
- **Reste sans image en 4★+ : Tinky Winky** (Les Télétubbies).
- Placeholder fantôme : déjà corrigé le 04/11 (cache des cartes peintes v3, clé = fichier d'illustration actuel) — les joueurs qui avaient ces cartes voient la nouvelle image dès la mise en ligne.
