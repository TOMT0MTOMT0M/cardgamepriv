
## Images manquantes — récolte du 04/11 (scripts/fill-images.py)
- Point de départ : donnees/suivi/Cartes-sans-image-rempli.xlsx (7 519 cartes). Les liens de Gemini étaient fabriqués
  sur un modèle (« Nom_(Sous-thème).jpg ») : ~2,5 % existaient. Non utilisés.
- Sources (APIs publiques, titre / nom vérifié à chaque fois) : Deezer (chansons, albums, artistes) · YGOPRODeck ·
  wikis Fandom de la franchise (wiki trouvé par la recherche Fandom) · TMDB (distribution des films / séries en prise de
  vues réelles ; animation exclue — on aurait la photo des doubleurs ; clé de Tom en variable d'env., jamais écrite) ·
  TVmaze · avatar YouTube · GBIF → iNaturalist (animaux : nom français → nom scientifique → photo libre) · TheSportsDB ·
  Steam (jaquettes) · Openverse (World : plats, marques, lieux) · Wikipédia titre exact (noms d'un seul mot refusés
  pour les personnages : trop d'homonymes).
- Import : scripts/fill-images.py <dossiers> --only pop|jv|spt|monde → save() du thème + journal (« fill:<source> »),
  puis gen des quatre thèmes.
- Résultat : 5 039 / 7 519 cartes illustrées. Restent 2 480 (surtout 1-2★) : donnees/suivi/Cartes-sans-image-restantes.xlsx.
  Non fait : recherche Google / Bing en masse (refusée : contournement de protection anti-robots).
- 2e passe (04/11, soir) : wikis Disney FR/EN, Pixar, Ghibli, Star Wars… choisis par la société de production TMDB du
  film ; AniList (anime) ; TheAudioDB (artistes) ; Yugipedia ; Open Food Facts (parfums Monster / Red Bull, snacks) ;
  ESPN (sportifs, même sport exigé). +206 images (contrôlées à l'œil, 15 homonymes retirés). Restent 2 274 cartes.
  Arrêts : Fandom et Wikimedia ont limité nos requêtes (pages anti-robot, 429) — on n'a pas contourné.
  Summoners War : aucune illustration > 100 px nulle part → design typographique.
