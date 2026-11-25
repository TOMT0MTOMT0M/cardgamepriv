---
paths:
  - "donnees/**"
  - "scripts/make-*.py"
  - "scripts/data/**"
  - "src/core/sets/**"
---
# Catalogue et données (chargé seulement quand on touche ces fichiers)

- `src/core/sets/` est GÉNÉRÉ par `scripts/make-*.py` depuis `donnees/` : modifier la source puis régénérer, jamais à la main. Grep, ne pas lire en entier.
- Ids de cartes dans `scripts/data/*-ids.json` : figés, ne jamais les changer.
- Hugo envoie un Excel par thème (listes de cartes, tri par étoiles) ; les listes qu'on lui renvoie gardent ce format Excel.
- Le contenu demandé par les joueurs (nouvelles cartes, univers) est décidé par Hugo.
- Fichiers bruts déposés par Gemini : `donnees/**/a-integrer/` (intégrés par Claude, mp3/wav hors git).
