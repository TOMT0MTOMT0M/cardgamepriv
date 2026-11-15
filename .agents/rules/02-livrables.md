---
trigger: always_on
---

# Livrables : comment rendre le travail

Claude reprend tes fichiers pour les intégrer au jeu. Pour qu'il n'ait rien à deviner :

- Un dossier par chantier : `donnees/<thème>/a-integrer/<chantier>-JJ-MM/` (ex. `donnees/suivi/a-integrer/audit-images-15-11/`).
- Toujours un `LISEZMOI.txt` dans ce dossier : ce que tu as fait, les sources, ce qui reste douteux.
- Tableaux en CSV (séparateur `;`, UTF-8), première colonne = **id de carte** (ex. `pop-marge-simpson`,
  `spt-faker`) ou **id de sous-thème** (ex. `les-simpson`). Les ids se trouvent dans `src/core/sets/*.ts`
  (recherche texte) ; ne les invente jamais.
- Fichiers (images, sons) nommés par l'id : `pop-marge-simpson.jpg`, `cartoon--bob-l-eponge.mp3`.
- Une colonne `confiance` (sûr / probable / douteux) et une colonne `source` (lien) pour chaque ligne.
- Mieux vaut une ligne « INTROUVABLE » ou « douteux » qu'une réponse inventée.
- Écris en français.
