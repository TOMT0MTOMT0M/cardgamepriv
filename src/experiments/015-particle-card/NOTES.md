# 015 — Carte en particules

## Intention
La carte n'est pas un objet, c'est un *état* de la matière. Elle se défait en poussière, flotte, puis se recompose
en vague du bas vers le haut — et au moment où elle est complète, elle se "condense" dans la vraie carte (nette, éclairée).
Le style de dispersion dit la rareté : sable qui tombe (commune), poussière au vent, explosion, vortex doré, vortex spectral.

## Techniques
- Une particule par cellule de la face (160 × 224 ≈ 36 000 ; 112 × 157 en mobile), position d'origine calculée dans
  le shader à partir de `instanceIndex` et de la **matrice monde de la carte** (uniform) → la carte peut bouger, la
  reconstruction la suit.
- **Compute TSL** : `If(...).Else(...)` — dispersion (impulsion initiale unique, curl `mx_noise_vec3`, gravité/vent/orbite
  par tier, traînée) ou reconstruction (**ressort amorti** k = 140, ζ ≈ 0.82, activé par une **vague** dont le délai
  dépend de la ligne + bruit).
- Le doigt repousse les particules pendant la reconstruction (sable).
- Rendu : `Sprite` instancié, couleur = art aplati à l'UV d'origine, carrés qui se rétrécissent en s'éloignant ;
  paillettes (légendaire+), teinte spectrale (mythique). **Fondu** vers le vrai maillage de carte à la fin.

## Nouveauté three.js utilisée
`If().Else()` en compute, uniform `mat4` lu en compute, `Sprite.count`.

## Limites
- Les sprites sont toujours face caméra : carte inclinée = mosaïque légèrement "plate".
- Le fondu particules → carte trahit un léger écart de luminosité (art non éclairé vs carte éclairée).

## Pistes
- Particules orientées (quads instanciés alignés sur la carte) pour un raccord parfait.
- Dispersion déclenchée par un "souffle" au micro, reconstruction par un geste de rassemblement (pinch).
