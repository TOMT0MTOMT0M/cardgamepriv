# Animations 6★ pour toutes les familles — livré sur v2 (08/11), refonte le même jour

Toutes les 6★ (hors Pokémon, Yu-Gi-Oh et secrètes, qui gardent leur séquence) : indices plein écran façon walkout (thème → famille → détail, jamais le nom) → scène de leur famille (≈ 2,5–3 s) → révélation habituelle de la 6★.

## Refonte « niveau Awwwards » (commit `b9ff896` sur v2), d'après l'audit du 08/11
- **La carte est l'actrice de chaque scène** : une doublure 2D (dos acier brossé, « B » gravé, tranche arc-en-ciel) est la cartouche, la pochette du vinyle, ce qui sort de la télé / du casier / de sous la cloche… Elle finit toujours au centre, le calque se fond dessus : **plus de flash blanc**, la vraie carte 3D prend le relais.
- **Indices anti-spoil** : le nom de la série n'est montré que si elle compte ≥ 3 cartes 6★ (sinon « 1 PARMI 80 ») ; les 290 cartes identifiables ne le sont plus. Année pour les jeux vidéo.
- **DA** : zéro émoji, aucun panneau encadré, décor monochrome + une couleur d'accent par famille, grain + vignette partout, fins toutes différentes (un seul 3-2-1, au cinéma).
- **Remplacées** : Iris → Celluloïds (table lumineuse, crayonné image par image) · Notification → Le direct (EN DIRECT, messages, compteur qui explose) · Arène → Le dernier coup (fil d'actions, écran gelé, VICTOIRE). Animaux : deux yeux qui s'allument dans le noir.
- Variantes par sous-famille : Valorant (lame / arme / agent), Sports collectifs (parquet / gazon / glace), Précision (échecs / golf / cible), Voitures (3 silhouettes), Nourriture (distributeur / cloche), LoL (teinte par gamme de skins).
- Vérifié : 26 scènes jouées de bout en bout sans erreur, 53–60 images/s avec processeur ralenti ×4, type-check, 94 tests, build. Pas encore vu dans le vrai jeu (lien V2).

## Reste à faire
- Sons réalistes en échantillons libres de droits (foule, moteur, déclencheur, vinyle, sifflet, ambiances) — la synthèse reste en place.
- Coordonnées réelles des lieux (Wikidata) pour le globe ; couleurs des clubs ; ambiances de visionneuse par famille.
- Test sur un vrai téléphone (fluidité, police japonaise de l'onomatopée manga).

Code : `src/game/mythic/` (`kit.ts` : `actor()`, `word()`, `label()`, `ACCENTS`) ; doc dans le dépôt : `docs/ANIMATIONS-6ETOILES.md`.
