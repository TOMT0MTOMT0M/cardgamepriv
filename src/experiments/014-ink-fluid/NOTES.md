# 014 — Encre fluide (suminagashi)

## Intention
Le plaisir tactile de toucher une surface vivante : l'illustration est recouverte d'un film d'encre marbrée
(comme le suminagashi japonais) qu'on remue du doigt. C'est contemplatif, sans enjeu — une carte qu'on "joue"
juste pour la sensation. Les encres sont dans la palette du tier ; la mythique dépose une encre qui change de teinte.

## Techniques
- **Fluide 2D incompressible en compute**, sur **`StorageTexture`** half-float en ping-pong (lecture `READ_ONLY` via
  `.load()`, écriture `WRITE_ONLY` via `textureStore`) — storage textures r183.
- Pas par frame : advection semi-lagrangienne de la vitesse (+ force du doigt en splat gaussien + brassage ambiant
  rotationnel) → divergence → **Jacobi** (24 itérations, 14 en mobile) → soustraction du gradient (+ parois)
  → advection de l'encre (+ injection colorée au doigt) → recopie.
- Interpolation bilinéaire manuelle (4 `load`) pour l'advection (pas de sampler en compute).
- Doigt → raycast sur la carte → UV → cellule de la grille (la grille couvre la fenêtre d'illustration).
  Le drag est réservé à l'encre (`spinEnabled = false`), le tilt reste léger.
- Affichage : l'encre teinte l'art de façon multiplicative ; **film brillant** (clearcoat ∝ densité) ;
  **relief de tension de surface** = normale issue du gradient de densité.
- Gouttes initiales concentriques (anneaux de suminagashi autour de 3 centres).

## Nouveauté three.js utilisée
Storage textures lecture/écriture en TSL (r183) : `storageTexture().setAccess(NodeAccess.*)`, `.load()`, `textureStore`.

## Limites
- Grille 160×224 : les détails fins de l'encre se perdent (pas de MacCormack / BFECC).
- Pas de vorticity confinement : les tourbillons s'amortissent vite.

## Pistes
- Advection MacCormack + confinement de vorticité pour des volutes plus nettes.
- **Révélation à l'encre** : la carte arrive entièrement noyée, on la "lave" au doigt pour la découvrir (lien avec 023).
- Encre qui sèche avec le temps (la brillance disparaît, la teinte se fixe dans le papier).
