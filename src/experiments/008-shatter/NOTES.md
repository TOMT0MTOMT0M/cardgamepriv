# 008 — Éclatement (Voronoï + Rapier)

## Intention
Un geste franc et physique : on frappe, ça résiste une fraction de seconde (les fissures courent, lumineuses),
puis ça cède. Les éclats sont petits près de l'impact et grands loin — c'est ce qui rend le coup *crédible*.
Ils retombent, rebondissent et restent au sol : la scène garde la trace de l'ouverture.

## Techniques
- **Voronoï CPU** par intersection de demi-plans (bissectrices), clippé au rectangle du paquet ; 55 % des germes tirés
  autour du point d'impact (rayon `r^1.7`) → fragmentation dense au centre du coup.
- **Prismes d'éclats** construits à la main (face imprimée + dos + tranche crème), centrés sur leur centroïde ;
  attribut `edge` (0 au bord → 1 au centre) qui sert à dessiner les fissures dans le shader.
- **Fissures** : émissif `smoothstep(edge)` × front de propagation `CRACK − |p − impact|` → le réseau s'allume depuis le coup.
- **Rapier 0.21** (`@dimforge/rapier3d-compat`) : un corps dynamique + collider `convexHull` par éclat, impulsion radiale
  décroissante (`exp(−2.2 d)`), rotation aléatoire, sol fixe invisible, amortissements. Pas fixe 1/60 avec accumulateur,
  **ralenti** = `rarity.slowmo` qui remonte à 1 en 1,2 s.
- Étincelles d'impact : Sprites sans état (direction hashée, temps écoulé uniforme).
- Nombre d'éclats : 16 + 6×tier (moins en mobile). Son : craquement en couches + impact.

## Nouveauté three.js utilisée
`attribute('edge')` lu dans un node material ; reste du lab (Rapier n'est pas un addon three).

## Limites
- Coque plate (le bombé du booster est perdu au moment du bris).
- Les éclats ne se re-fracturent pas en touchant le sol.

## Pistes
- Fracture 3D (Voronoï 3D) d'une capsule de résine épaisse contenant la carte.
- Garder les éclats au sol dans les ouvertures suivantes (un tas qui grandit pendant une session).
- Frappe plus forte = plus d'éclats (vitesse du geste mesurée).
