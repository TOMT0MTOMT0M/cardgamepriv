---
description: Récupère des génériques / openings introuvables en boutique (fichiers audio pour Claude)
---
Modèle conseillé : Gemini 4 Hydrogen.

Dépose dans `donnees/generiques/a-integrer/` un mp3 par morceau, nommé par la clé demandée
(`cartoon--<sous-thème>.mp3`, `anime--<sous-thème>.mp3` ou `<id de carte>.mp3`). Au moins les 40 premières secondes,
depuis le tout début, sans intro parlée ni logo de chaîne. Version originale diffusée, par l'interprète d'origine ;
dessins animés en version française quand elle existe. Termine par `LISEZMOI.txt` :
`clé | titre | interprète | année | lien source | VF/VO | remarque`. Introuvable fiable → pas de fichier, une ligne
« INTROUVABLE ». Claude coupe, règle le volume et branche.
