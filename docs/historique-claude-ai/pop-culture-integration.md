# Intégration POP CULTURE PACK (SPEC-THEME-POP-CULTURE v5) — 3–4 nov. 2026

- Source : Tri-etoiles-popculture.xlsx (feuille « Tri étoiles ») → scripts/make-pop.py → src/core/sets/popculture.ts (import en remplacement). Commit `d40480b` (branche `fix/retours-live-02`).
- 17 471 cartes · 856 sous-thèmes (imprimés en grand sur la carte) · étoiles 5 404 / 4 142 / 3 603 / 1 981 / 1 621 / 720 · pas de secrète.
- 7 groupes d'affichage (le xlsx n'a pas de colonne « bloc », déduits) : Mangas & anime 208 sous-thèmes (images AniList ou Yu-Gi-Oh), Films 272, Séries TV 279, Dessins animés 90 (listes DA / SERIE dans make-pop.py, tout le reste = Films), Musique (Musique FR, Musique Monde, Chansons, Albums), Acteurs & actrices, YouTube (FR / Monde).
- Ids de groupe = anciens sous-thèmes vides (films, series, anime, musique, youtubeurs) ; « Marvel MCU » garde l'id `marvel`. Yu-Gi-Oh est dans Mangas & anime : le sous-thème vide `yugioh` du Gaming est retiré.
- Ids de carte stables `pop-<nom>` (scripts/data/pop-ids.json, clé nom + type). Numéro = N° de l'Excel, sur 17 471.
- Images : 11 889 / 12 234 URL (AniList, Wikimedia via l'API, cache web), 493 Mo dans public/art/pop (+ miniatures WebP), envoyées sur R2 par le script de déploiement. 345 fichiers supprimés de Commons (404) + 5 237 cartes sans URL → design typographique.
- Wikimedia limite fortement les rafales (429) : make-pop.py fait 1 requête / 0,5–1 s par hôte, met tout l'hôte en pause sur 429, traite AniList avant Wikimedia, `--part k/n` pour répartir sur deux machines.
- Chance Bébou recalculée automatiquement : 1 / 39 173.
- Reste : déployer (Convex + Pages + R2) avec mettre-en-ligne-prod.cmd ; à l'œil : quelques sous-thèmes peuvent être dans un bloc voisin (classement Films / Séries / DA fait à la main sur 643 titres).
