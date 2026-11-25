# Patch WORLD PACK V7 — Monster & Red Bull (appliqué le 3 nov. 2026)

- Fichier : Patch-monde-V7.xlsx, appliqué par scripts/make-monde-v2.py (liste PATCHES) par-dessus Tri-etoiles-monde_2.xlsx, dans l'ordre OP1 → OP2 → OP3.
- OP1 INSERT : 106 cartes (N° 5237 → 5342), nouveaux sous-thèmes « Monster » et « Red Bull » (groupe Nourriture).
- OP2 rebrands, MÊME id de carte : 4264 Red Bull → Red Bull Original 6★ (miam-red-bull) ; 4418 Monster Energy → Monster Original Green 6★ (miam-monster-energy).
- OP3 resync des étoiles 1 → 5236 : 43 cartes changent (7 promotions, 36 rétrogradations).
- Contrôles OK (le script bloque sinon) : 5 342 cartes · 1652/1267/1101/606/496/220 · Monster 60 · Red Bull 48.
- En jeu : 5 343 cartes (+ Citroën C15 des Cévennes, carte V1 gardée hors tri).
- Images : 30/108 Monster-Red Bull (toutes les URL fournies) ; 78 cartes 1★-3★ sans URL → design typographique.
- Reste à faire : `node scripts/r2-sync.mjs` (nouvelles images) puis déploiement Convex + site.
