# 026 — Lucioles (synchronisation)

## Ce que je cherche à faire ressentir
Le suspense par le **rythme**, pas par l'intensité. Au début chaque luciole clignote pour elle-même ; si la carte est rare,
les éclats se rapprochent, se calent les uns sur les autres, et on sent l'essaim « se mettre d'accord ». Quand tout bat
à l'unisson, l'éclair collectif retourne la carte. Une commune : elles ne s'accordent jamais, la carte se retourne seule,
sans éclat, et elles s'en vont (l'anticlimax est voulu).

## Techniques
- **Oscillateurs de Kuramoto** : `dφᵢ/dt = ωᵢ + K·R·sin(ψ − φᵢ)` avec le champ moyen `R·e^{iψ}` (O(N)).
  Fréquences propres 0.85–1.15 Hz → couplage critique ≈ 1. K par tier : 0.25 / 1.15 / 2.2 / 3.4 / 5.2 / 8
  (commune jamais synchrone, peu commune à moitié, rare+ à l'unisson de plus en plus vite).
- **Éclat bref** à la traversée de phase 0 (gaussienne étroite, ~4 % de la période), presque noir entre deux éclats.
- **Chaque luciole est une `PointLight`** (jusqu'à 480) : `renderer.lighting = new ClusteredLighting()` (Forward+, r185).
  L'herbe (2 200 brins instanciés, balancement TSL) et le sol reçoivent réellement ces lumières.
- **Son** : un petit clic à chaque battement collectif quand R > 0.45 → le rythme devient audible pendant la synchronisation.
- Vol : errance par sinus déphasés, attraction vers une coquille dont le rayon dépend de R, tourbillon, évitement de la carte.
- Simulation sous-pas (1/40 s) pour rester en temps réel à bas fps. `?ff=9` pré-simule 9 s (captures de vérification).

## Rareté
Nombre (40 → 480), couplage (donc vitesse et qualité de la synchronisation), éclat final (rare+), couleur qui bascule vers
la teinte de la rareté après la révélation (épique+), vague spectrale qui tourne autour de l'essaim (mythique).

## Nouveauté three.js exploitée
`ClusteredLighting` (Forward+ clustered, r185) — le système d'éclairage est restauré au changement d'expérience.

## Limites
- Les lumières des lucioles n'ont pas d'ombres (l'herbe ne s'ombre pas).
- En WebGL2, le Forward+ passe par un chemin de repli : à mesurer, probablement plus lent.
- Le timing du climax dépend de la synchronisation (stochastique) : entre ~5 et 9 s selon le tier, coupé à 14 s.

## Pistes
- Faire « répondre » l'essaim au doigt (une luciole-joueur qui entraîne les autres).
- Utiliser R comme jauge de suspense dans d'autres ouvertures (pulsation du pack qui se synchronise avec le son).
