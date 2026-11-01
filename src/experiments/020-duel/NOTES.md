# 020 — Duel (face à face)

## Intention
Juste le *moment* visuel d'un affrontement, sans règles : deux cartes de part et d'autre de la table se lèvent,
prennent leur élan (recul), se penchent, et leurs flux d'énergie se percutent. Le point de choc hésite, oscille,
puis cède vers la carte la plus faible (sa puissance). Secousse, étincelles ; la gagnante s'illumine, la perdante
s'assombrit et tremble.

## Techniques
- **Flux d'énergie** : un ruban entre les deux cartes ; deux fBm qui coulent en sens opposés (`v ± time`) et se
  rencontrent au point de choc (uniform), chacun dans la couleur de sa carte ; nœud lumineux qui vibre au point de contact.
- Lutte scénarisée : le point de choc oscille (2 allers-retours) avant de céder — c'est l'hésitation qui crée la tension.
- Étincelles sans état au point de choc, halo sur la table (faible : pas de "glow partout"), bloom sur l'émissif.
- Gagnante/perdante par uniforms (assombrissement multiplicatif, foil qui émet, tremblement résiduel).
- Caméra basse, légère parallaxe au pointeur, secousse au choc.

## Nouveauté three.js utilisée
Rien de spécifique (assemblage TSL + `RenderPipeline`).

## Limites
- Adversaire tiré au hasard ; aucune règle (seule la puissance décide du vainqueur visuel).
- Le ruban est un plan : vu de profil, il disparaît.

## Pistes
- Ruban en tube (géométrie extrudée) ou volumétrique raymarché (012).
- Le flux prend la "personnalité" de l'élément de la carte (Cendre = braises, Givre = cristaux, Marée = ondes).
- Intégrer au futur jeu : l'animation d'attaque est déclenchée par le moteur de règles.
