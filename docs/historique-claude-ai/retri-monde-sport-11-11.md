# Nouveau tri des étoiles Pop Culture + World + Sport (11/11) — patch prod v1.0.19

## Décision
Tom : seul le tri part en prod ; le reste de v2 (skins CS 3D, Éclipse, chansons 6★, rééquilibrage…) reste sur V2. Patch dans `.wt-master/` (pas `publier-patch.cmd`, qui enverrait toute la V2).

## Ce qui change
- **Pop Culture** : tri validé du 11/11 (`Tri-etoiles-popculture.xlsx` remplacé, ancien dans l'historique git). 530 cartes montent, dont 335 passent en 6★ (DiCaprio, Morgan Freeman, De Funès, Bruce Lee, Astérix, Obélix, capitaines de Bleach, Blue Lock…). Aucune ne descend. La curation (`RERATE_08_11`, purges) s'applique toujours par-dessus.
- **World** : 75 cartes (Paris, Heineken, Nissan GT-R → 6★…).
- **Sport** : 287 cartes (Dembélé, T1, Rey Mysterio → 6★). Les 4 promotions v1.0.15 suivent le nouveau tri : Dupont 3★, Inoue 2★, Nakamura 2★, Pogačar 1★.
- Seules les raretés bougent (ids, noms, images identiques, contrôlé sur master et v2).

## Cartes déjà tombées
`migrations:resyncRarities` puis `migrations:resyncRaritiesOpen` (échanges en attente, annonces, offres ; + Marché sur V2). Dans `mettre-en-ligne-prod.cmd` et `mettre-en-ligne-v2.cmd`.

## Git
- master : `c732da7` (World/Sport) + `bac4690` (Pop). master déjà poussé sur GitHub.
- Tag `v1.0.18` = `c732da7` (World/Sport seuls) : il était déjà sur GitHub, on ne l'écrase pas (le lanceur v1.0.18 a échoué à l'étape 1, rien n'est parti en prod).
- Tag **`v1.0.19` = `bac4690`** (tout le tri). Lanceur `.wt-master/METTRE-EN-LIGNE-v1.0.19.cmd` ; l'ancien lanceur v1.0.18 rangé dans `.wt-master/_a_supprimer/`.
- v2 : même tri, `merge -s ours master`. v2 contient tout master et est poussé.
- Vérifié sur master : typecheck, 123 tests serveur.

## À lancer par Tom, dans l'ordre
1. `lanceurs\mettre-en-ligne-v2.cmd` (si pas déjà fait) — teste les migrations sur la copie de la prod.
2. `.wt-master\METTRE-EN-LIGNE-v1.0.19.cmd` — prod.
