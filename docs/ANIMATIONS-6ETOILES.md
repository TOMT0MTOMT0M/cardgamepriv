# Animations des 6★ par famille (V2, 08/11 — refonte « la carte actrice », même jour)

Toutes les 6★ ont maintenant leur mise en scène, sauf celles qui avaient déjà la leur :
Pokémon (rencontre sauvage), Yu-Gi-Oh (invocation), secrètes (Bébous, KCDQ, Merveilles).

## Déroulé (4 temps)

1. **Annonce** : la tranche arc-en-ciel dans la pile (inchangée).
2. **Indices** (≈ 1,5 s) : 2 ou 3 infos plein écran, façon walkout, tirées des données (jamais le nom de la carte).
   GAMING → ZELDA → 1991 · SPORT → FOOTBALL → PREMIER LEAGUE · POP CULTURE → MANGAS & ANIME → NARUTO.
3. **Scène de la famille** (≈ 2,5–3 s), une par famille (tableau ci-dessous). **La carte (face cachée, dos acier,
   tranche arc-en-ciel) est l'actrice de chaque scène** : elle est la cartouche, la pochette, ce qu'il y a dans le
   casier… et finit TOUJOURS au centre, à l'échelle 1 ; le calque se fond dessus (pas de flash blanc) et la vraie carte
   3D prend le relais.
4. **La carte** : la révélation habituelle de la 6★ (anticipation, retournement, impact, étoiles).

Anti-spoil : le 3e indice n'est le nom de la série / sous-famille que si elle compte au moins 3 cartes 6★ ; sinon
« 1 PARMI 80 » (nombre de 6★ de la famille). Jeux vidéo : l'année quand elle est connue.
DA : zéro émoji, pas de panneau encadré, décor monochrome + UNE couleur d'accent par famille (`ACCENTS` dans kit.ts),
grain + vignette sur toutes les scènes, fins toutes différentes.

- **Version courte** (≈ 2 s : la famille seule + la scène accélérée ×2,2) dès que la scène de cette famille a déjà été
  vue sur l'appareil (`localStorage` `bebou.mythSeen`), et toujours en « Tout révéler ».
- **Effets réduits** : indices seuls.
- **Toucher / Échap** : passe directement à la carte. « Tout passer » coupe tout.
- **Rejouer** : bouton « ▶ Rejouer » à côté de « Image à revoir » dans toutes les visionneuses (version complète).

## Familles

| Famille | Scène | Fichier |
|---|---|---|
| Jeux vidéo | Cartouche (console rétro, PRESS START, année, jingle 8 bits) | `cartouche.ts` |
| League of Legends | Splash (plongée dans un tunnel de lumière, anneaux gravés) | `splash.ts` |
| Skins CS | Caisse (bande de vraies cartes CS plus basses, arrêt sur la case arc-en-ciel) | `caisse.ts` |
| Valorant | Inspection (la lame tourne, reflet, coupe nette) | `inspection.ts` |
| Mangas & anime | Case de manga (planche, lignes de vitesse, onomatopée, la case se fend) | `manga.ts` |
| Musique | Vinyle (pochette, disque, bras, crépitement, visualiseur) | `vinyle.ts` |
| Séries TV | Télé cathodique (allumage, zapping dans la neige) | `tele.ts` |
| Films | Salle de cinéma (faisceau, amorce 3-2-1) | `cinema.ts` |
| Dessins animés | Celluloïds (table lumineuse, feuilles posées une à une, crayonné image par image, la carte = dernière feuille) | `celluloids.ts` |
| Acteurs & actrices | Tapis rouge (flashs, étoile gravée) | `tapisRouge.ts` |
| YouTube | Le direct (EN DIRECT, messages qui défilent, le compteur explose) | `direct.ts` |
| Football | Tunnel (sortie vers la pelouse, projecteurs un par un) | `tunnel.ts` |
| Sports collectifs | Buzzer (tableau LED, sirène, ballon de la discipline) | `buzzer.ts` |
| Olympiques & athlétisme | Photo-finish (balayage, chrono, podium) | `photoFinish.ts` |
| Combat | Ring (cloche, poursuite, speaker, gong) | `ring.ts` |
| Raquettes | Arbitrage vidéo (trajectoire, impact, « IN ») | `arbitrage.ts` |
| Glisse & montagne | Chrono (intermédiaires, MEILLEUR TEMPS) | `chrono.ts` |
| Sports mécaniques | Feux de départ (5 feux, extinction, moteur) | `feux.ts` |
| Précision & stratégie | Échecs : le roi tombe · Golf : la balle dans le trou · autres : la cible | `precision.ts` |
| Esport | Le dernier coup (fil d'actions de plus en plus vite, écran gelé, VICTOIRE) | `dernierCoup.ts` |
| Coulisses & légendes | Vestiaire (cadenas, la porte s'ouvre ; sifflet pour les arbitres) | `vestiaire.ts` |
| Animaux | Piège photo (vision nocturne, deux yeux qui s'allument et clignent, déclenchement) | `piegePhoto.ts` |
| Lieux & pays | Globe (rotation, épingle, carte postale tamponnée) | `globe.ts` |
| Nourriture | Distributeur (snacks, marques) · Cloche (plats) | `nourriture.ts` |
| Voitures | Bâche (projecteurs, la bâche glisse, appel de phares) | `bache.ts` |
| Ardèche | Carte topo (courbes de niveau, la rivière) | `topo.ts` |

Règles : la carte reste nette (le spectacle est autour), aucune illustration ni nom avant le retournement, aucune
musique / aucun logo / aucune interface reprise. Tous les sons sont synthétisés (`src/game/mythic/sounds.ts`).

## Code

- `src/game/mythic/index.ts` (léger) : famille d'une carte, indices, « déjà vue », lecture, bouton Rejouer.
- `src/game/mythic/runtime.ts` + `mythic.css` (chargés à la 1re 6★) : calque, indices, enchaînement, toucher pour passer.
  Pendant l'ouverture, le rendu 3D est mis en pause sous le calque.
- `src/game/mythic/scenes/*.ts` : une scène = une fonction qui remplit une timeline gsap (outils dans `kit.ts`).
  Chaque scène est un fichier chargé seulement quand une 6★ de sa famille tombe.
- Ouverture : `shop.ts` → `onCinematic` lance le prélude puis `opening.resumeReveal()` (nouveau) reprend la révélation.

### Ajouter / changer une scène

1. Écrire `src/game/mythic/scenes/<nom>.ts` (`export default function (k: SceneCtx) { … }`), 2 à 3 s, qui finit sur son climax.
2. L'inscrire dans `SCENES` de `src/game/mythic/index.ts` (clé = id du groupe, ou du sous-thème sans groupe).
3. Positionner les éléments centrés avec `k.pin(el)` (jamais `translate(-50%)` en CSS sur un élément animé par gsap).
4. `k.actor()` = la carte (déjà centrée, opacité 0) : la faire entrer, la manipuler, la laisser au centre à l'échelle 1.
   `k.word()` (gros titre Atsuka Montreal — ex-Matcha World, V2), `k.label()` (étiquette), `k.accent` (couleur de la famille).
