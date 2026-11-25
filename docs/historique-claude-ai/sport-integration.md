# Intégration SPORT PACK (SPEC-THEME-SPORT v5.1) — 3 nov. 2026

- Source : Tri-etoiles-sport.xlsx (feuille « Tri étoiles ») → scripts/make-sport.py → src/core/sets/sport.ts (import en remplacement).
- 7 708 cartes · 114 sous-thèmes (imprimés en grand sur la carte) · 10 groupes d'affichage : Football, Esport, Sports collectifs, Raquettes, Combat, Sports mécaniques, Olympiques & athlétisme, Glisse & montagne, Précision & stratégie, Coulisses & légendes.
- Étoiles 1→6 inchangées (2 384 / 1 828 / 1 589 / 874 / 715 / 318). Pas de secrète.
- Ids stables `spt-<nom>` (scripts/data/sport-ids.json). Numéro = N° de l'Excel, affiché « 149 / 7708 ».
- Images : 7 093 / 7 708 (Commons via API, Wikipédia fr/en pour les logos, Liquipedia, cache web ; secours Wikipédia vérifié par Wikidata). 615 en design typographique.
- Corrections manuelles d'images (homonymes DBpedia) : Uzi, zen, David Beckham, Mario Lemieux, Équipe d'Argentine — liste OVERRIDES dans le script.
- À faire côté Tom : `node scripts/r2-sync.mjs` (≈ 600 Mo d'images), puis déployer (Convex + Pages).
- Pipeline de mise à jour : gen → harvest --retry → wikifill → fix → gen → r2-sync.
