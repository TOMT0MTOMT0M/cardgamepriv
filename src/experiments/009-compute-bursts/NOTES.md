# 009 — Bursts compute à traînées

## Intention
Que la *personnalité* du burst dise la rareté autant que sa quantité. Une commune lâche un peu de poussière qui retombe ;
une peu commune, des bulles qui montent ; une rare, un anneau qui s'ouvre et freine ; une épique, un vortex ;
une légendaire, une fontaine d'étincelles derrière la carte ; une mythique, des particules qui *dessinent* le contour
de la carte avant d'exploser en couleurs spectrales. Énergie lumineuse normalisée : 30 000 particules ne doivent pas
faire un mur blanc.

## Techniques
- **Compute TSL** (`instancedArray` → storage buffers) : `pos` (xyz + âge), `vel` (xyz + durée de vie), `trail` (N × K vec3).
- **Curl noise** par différences finies d'un potentiel `mx_noise_vec3` (6 évaluations) → champ à divergence nulle,
  + orbite tangentielle, gravité, traînée exponentielle, **attraction vers le contour** de la carte (mythique), relâchée en 0,6 s.
- **Traînées réelles** : historique en ring buffer par décalage (K = 9) mis à jour à **sous-pas fixes** (1/60 s) →
  longueur indépendante du framerate.
- **Rubans orientés caméra** : un seul `Mesh` instancié via `mesh.count = N` (pas de matrices d'instance),
  le vertex shader lit `trail[i·K + seg]`, oriente le ruban (`cross(dir, toCam)`), l'amincit vers la queue.
- Délais d'émission étalés (hash²) : le burst a une attaque, pas un "pop" d'une frame.
- Mythique : teinte par particule tournant dans le spectre (`hue()` TSL).
- Normalisation d'énergie : intensité ∝ √(1500 / N).

## Nouveauté three.js utilisée
Compute TSL (`Fn().compute(n)`, `instancedArray`), `Mesh.count` pour l'instanciation sans matrices.

## Limites
- Le décalage du ring buffer coûte K écritures par particule et par sous-pas ; un vrai index circulaire serait plus sobre.
- Pas de tri : additif uniquement (pas de particules sombres/fumée).
- En WebGL2 (fallback), le compute passe par transform feedback : plus lent.

## Pistes
- Faire réagir le champ de curl au doigt (vortex local au toucher).
- Particules qui retombent et s'accumulent sur la carte (collision plane analytique).
- Synchroniser l'émission avec les pics d'un son (Web Audio AnalyserNode).
