# Patchs v1.0.20 + v1.0.21 (12/11) — musique des 6★ et 56 chansons 6★ en prod

**État** : sur master (`.wt-master`), commits `a5252d6` (v1.0.20) et `b5e0bfe` (v1.0.21), tagués. Pas encore en ligne : Tom lance **seulement** `.wt-master\METTRE-EN-LIGNE-v1.0.21.cmd`, qui contient aussi la v1.0.20.

## Contenu
- **56 nouvelles chansons 6★ et Finn l'Humain 6★** (N° 17478 à 17534). Leurs 57 images et miniatures sont copiées dans `.wt-master\public\art\pop\` ; le lanceur les envoie sur R2.
- **15 chansons passent en 6★** (`RERATE_11_11` : Take on Me, Wonderwall, In the End…). Les exemplaires déjà tirés suivent grâce à `resyncRarities`, lancé par le lanceur.
- **Gérard Depardieu retiré** (`PURGE_BRUEL`) : il sort du catalogue et des collections via `purgeCards`.
- **Lecteur de musique de la V2** (`musicPreview.ts`) :
  - toutes les 6★ Musique ont leur extrait, y compris les 21 morceaux trouvés seulement chez Deezer (adresse redemandée au moment de jouer) ;
  - les 6★ d'animés jouent l'opening de leur animé (101 animés).
- Les étoiles de la v1.0.19 (nouveau tri Pop) sont gardées.
- **Pas repris de la V2** : le gabarit pleine illustration des 5★ et les cartes Berserk ajoutées sur v2.
- Mises à jour : une entrée « 12 nov. ».

## Vérifié
- Type-check du jeu et du serveur, 123 tests serveur, build de master.
- Report sur v2 : le contenu y est déjà, puis `git merge -s ours master` (`81b072b`). master est ancêtre de v2, donc `publier-patch.cmd` passera.

## À vérifier par Tom (site des joueurs)
1. `https://cardgamepriv.pages.dev/version.json` contient `b5e0bfe`.
2. Collection → Take on Me (6★) : l'extrait joue. Tester aussi un morceau Deezer (Au DD de PNL).
3. Une 6★ d'animé dans la visionneuse : l'opening joue en fond.
4. Finn l'Humain et Give Me the Night apparaissent dans le catalogue, avec leur image.
5. Plus de Gérard Depardieu, ni dans le catalogue ni dans les collections.
