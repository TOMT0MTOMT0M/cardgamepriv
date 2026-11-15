---
description: Vérifie que chaque musique 6★ est l'original (pas une reprise, un live, un karaoké)
---
Modèle conseillé : Gemini 4 Hydrogen (niveau High) ; Orchestrator (Argon) si tu veux qu'il planifie seul.

1. Lis `src/game/musicPreviews.data.ts` (tables MUSIC_PREVIEWS, ANIME_OPENINGS, CARTOON_THEMES) : id → titre,
   interprète. Pour chaque id de carte, trouve le nom et le sous-thème dans `src/core/sets/*.ts`.
2. Pour chaque entrée, juge : est-ce le morceau attendu pour cette carte, par l'interprète d'origine, dans sa
   version connue ? Repère reprises, karaokés, « made famous by », lives, remixes, versions TV size douteuses,
   mauvais opening pour l'animé, générique en anglais alors qu'un générique français existe.
3. Écris `donnees/suivi/a-integrer/audit-musiques-JJ-MM/audit.csv` :
   `cle;carte_ou_serie;actuel_titre;actuel_interprete;probleme;bon_titre;bon_interprete;annee;lien_apple_ou_deezer;confiance`
   (`cle` = id de carte, ou `anime:<sous-thème>` / `cartoon:<sous-thème>`). Seulement les lignes à corriger.
   Le lien doit pointer vers le morceau exact sur Apple Music ou Deezer ; sinon écris « pas en boutique ».
