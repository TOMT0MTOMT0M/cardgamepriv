# 013 — Éventail & retournements

## Intention
Le rituel complet d'une ouverture, en version mise en scène : les cartes sortent du paquet une à une, s'ouvrent en
éventail, puis se retournent avec un **timing qui dépend de leur rareté**. Les communes claquent (rapide, sec) ; la
dernière carte — la bonne — se soulève, hésite (micro-oscillation), puis se retourne au ralenti. La caméra s'approche
de la carte active, la mise au point la suit, puis la bonne carte vient au premier plan pendant que les autres reculent.

## Techniques
- Une **timeline GSAP par retournement** : anticipation (soulèvement + recul, `heave`), pause proportionnelle au tier,
  retournement en **ressort analytique** (`springCurve`), ralenti (`timeScale`) pour épique+, payoff (impact, cloche,
  pic de lueur), retombée `settle`.
- Retournements automatiques en **temps réel** (`gsap.delayedCall`), tap pour forcer la suivante.
- **Caméra** : dolly + cible animées par carte ; **DepthOfField** (addon TSL `dof`) avec distance de mise au point
  lissée vers la carte active (`getViewZNode()` de la passe).
- Bloom sur l'émissif (foil des cartes qui "s'allume" au payoff). Cartes de remplissage à 55 % de résolution.
- Distribution : sortie du paquet en cascade (décalage 140 ms), arc d'éventail, le paquet tombe hors champ.

## Nouveauté three.js utilisée
`dof()` (DepthOfFieldNode) + `getViewZNode()`, `RenderPipeline`.

## Limites
- Les cartes de l'éventail se chevauchent sans ombres portées entre elles (pas de shadow map).
- Ordre de révélation fixe (gauche → droite) ; on ne choisit pas la carte.

## Pistes
- Laisser choisir la carte à retourner (tap sur une carte précise) et garder la bonne pour la fin de toute façon.
- Ombres de contact entre cartes (AO screen-space léger ou ombres projetées sur la table).
- Swipe vers le haut pour envoyer une carte révélée dans la collection (lien avec 019).
