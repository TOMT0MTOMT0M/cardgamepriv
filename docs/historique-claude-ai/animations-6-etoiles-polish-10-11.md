# Animations 6★ — polish, visionneuse partout, labo (10/11)

Commit `981fa6e` sur `v2` (pas encore poussé ni mis en ligne : voir « À lancer »). Suite de
`claude/animations-6-etoiles-v2-08-11.md`.

## Ce qui change pour le joueur

- **La scène se joue partout** : ouvrir une 6★ en Collection, Gros tirages, Échanges, Contrats, Profil ou dans le récap
  joue la scène de sa famille, puis la carte se retourne à sa place — comme la rencontre Pokémon et l'invocation
  Yu-Gi-Oh.
  - On sait déjà quelle carte c'est : un seul indice (la famille, ≈ 0,9 s), puis la scène à vitesse normale.
  - Un toucher passe. Pas rejouée quand on feuillette, ni dans la minute qui suit (ouverture → récap).
  - « Effets réduits » : rien, la carte directement. « Rejouer » : version complète, la carte se retourne de nouveau.
- **Dans le labo** : expérience 045 « Scènes 6★ par famille (26) » — famille, sous-famille (variantes), version
  (ouverture complète / courte / visionneuse), vitesse. C'est le code du jeu, avec la vraie visionneuse dessous.

## Polish

**Raccord avec la vraie carte**
- La carte des scènes est maintenant le vrai dos peint (alu brossé, deux filets, « B » usiné, teinte du thème). Avant :
  un rectangle anthracite avec un « B » à volutes, qui changeait de matière au moment du raccord.
- Ouverture : la carte 3D qui attend est 1,37 fois plus grande que celle de la scène sur téléphone. La carte de la scène
  grandit d'abord jusqu'à elle, puis le calque se fond. Mesuré en jeu : 72,249 · 247×344 contre 72,250 · 246×343.
- Visionneuse : la carte 3D attend de dos à la taille de celle de la scène, puis se retourne en venant à sa place.
- Un reflet balaie la carte quand elle se pose, dans toutes les scènes.

**Typographie**
- Atsuka Montreal : une seule capitale à volutes par titre. « VICTOIRE », « ÉCHEC ET MAT », « LA SIX ÉTOILES », les
  indices de famille et le fil de l'Esport avaient une volute sur chaque lettre.
- Les titres tiennent dans l'écran (« Spirit Blossom », « La six étoiles ! », « Échec et mat », « Victoire »
  débordaient).
- Bold Frame n'est plus en capitales (R et X s'y lisent A et H : « SPOAT », « PAEMIEA LEAGUE »).

**Scènes retouchées**
| Scène | Changement |
|---|---|
| Cartouche (Jeux vidéo) | composition centrée ; la console éjecte la carte par le haut (elle « poussait » vers le bas) ; étoiles en pixels sans année |
| Caisse (CS) | miniatures préchargées pendant l'ouverture du booster ; plus d'icône d'image cassée |
| Inspection (Valorant) | le reflet reste sur la carte ; coupe plus franche |
| Le direct (YouTube) | textes à la taille de l'écran (13 px avant sur téléphone) |
| Buzzer (Sports co) | matrice LED sur le tableau seulement ; tir qui reste dans l'écran ; sols lisibles |
| Le dernier coup (Esport) | le fil tient dans l'écran sur ordinateur |
| Chrono (Glisse) | « Meilleur temps » lisible sur la neige |
| Échecs | l'échiquier couvre toute la largeur sur ordinateur |
| Bâche (Voitures) | trois silhouettes différentes (citadine, coupé, supercar à aileron) ; avant, la même |
| Piège photo (vie marine) | vision nocturne bleue |
| Télé (Séries) | la carte à l'écran a ses filets et son « B » |

## Vérifié / pas vérifié

- Vérifié : `tsc`, 110 tests Convex, build `--mode v2`, les 26 scènes et leurs variantes image par image à 390 × 844 et
  1440 × 900, et en jeu (démo, GPU logiciel) l'ouverture d'un booster 6★ et l'ouverture d'une 6★ dans la visionneuse,
  sans erreur.
- Pas vérifié : un vrai téléphone (fluidité, rendu du retournement), les sons (toujours synthétisés), une 6★ Musique
  ouverte en Collection (l'extrait démarre dès le début de la scène).

## À lancer chez Tom

1. `lanceurs\mettre-en-ligne-v2.cmd`
2. `lanceurs\push.cmd`

## À regarder sur le lien V2

1. Collection → une 6★ (hors Pokémon / Yu-Gi-Oh) : la scène, puis la carte se retourne sans saut de taille.
2. Ouvrir un booster avec une 6★ : à la fin de la scène, la carte grandit jusqu'à la vraie, puis se retourne.
3. Le labo, expérience 045.

## Constaté au passage (pas corrigé)

- `src/core/fonts/atsuka-montreal.woff2` n'a pas la règle « capitale qui suit une lettre → petite capitale » annoncée
  dans `scripts/build-display-font.py` (seule la table `liga` est dans le fichier). Un titre écrit TOUT EN CAPITALES en
  HTML a donc une volute sur chaque lettre. Les scènes 6★ passent par `displayCase` ; à vérifier ailleurs.
- Corrigé dans ce commit, hors scènes : la tuile qui « grandit » vers la carte (collection) restait posée par-dessus
  la rencontre Pokémon et l'invocation Yu-Gi-Oh (une ligne de CSS).

## Reste à faire (inchangé)

Sons réalistes en échantillons libres de droits ; coordonnées réelles des lieux pour le globe ; couleurs des clubs ;
ambiances de visionneuse par famille.

Code : `src/game/mythic/`, `src/game/mythicEncounter.ts`, `src/experiments/045-mythic-scenes/` ; doc du dépôt :
`docs/ANIMATIONS-6ETOILES.md`.
