---
description: Noms français officiels des personnages d'une série (pour renommer les cartes)
---
Modèle conseillé : Gemini 4 Argon pour une grosse série (beaucoup de sources à recouper), sinon Hydrogen.

1. Demande-moi la série si je ne l'ai pas dite. Trouve ses cartes dans `src/core/sets/*.ts` (id + nom actuel).
2. Pour chaque personnage, le nom de la version française diffusée en France (doublage, manga FR). Recoupe au moins
   deux sources (wiki officiel ou de fans sérieux, génériques, sous-titres). Ne traduis jamais toi-même.
3. Écris `donnees/suivi/a-integrer/noms-<serie>-JJ-MM/noms.csv` : `id;nom_actuel;nom_fr;source1;source2;confiance`.
   Si le nom français est identique au japonais, ou inconnu, laisse `nom_fr` vide.
