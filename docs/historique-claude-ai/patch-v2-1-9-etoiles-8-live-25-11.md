# Patch v2.1.9 — base Etoiles 8 en ligne (25/11)

**État : prêt, à lancer par Tom.** Branche `patch-v2.1.9` (4 commits) dans `.wt-master/` (worktree sur `master`) ; `v2` a les mêmes changements + `merge -s ours patch-v2.1.9`.

## Ce qui part chez les joueurs
- Base Etoiles 8 complète : 848 nouvelles cartes (492 avec image, 984 fichiers dans `public/art`), 530 changements d'étoiles, 17 renommages, albums rangés (Studio Ghibli, football par poste, 14 nouveaux sous-albums, 43 vidés).
- Sport : **Paralympiques = famille à part** (11 familles, 122 cartes), plus dans « Olympiques & athlétisme ».
- Doublons/alias : 44 cartes transférées (`remapCards`, ex. Hulk Hogan acteur → catch), 123 retirées (`purgeCards`), raretés resynchronisées.
- Cartes Bébous : **restent verrouillées** (`BEBOU_SECRETS_LOCKED = true`, demande de Tom du 25/11), aussi sur V3.
- Entrée « 25 nov. — Le grand rangement : 848 nouvelles cartes » (FR/EN).

## Reste V3 uniquement (branche `v2`)
79 titres uniques, abonnement (roulette gratuite + 2 stacks), roulette 1000/2000, calendrier de l'Avent, succès, packs événement, marché, Télévision.

## Vérifs faites
typecheck app + Convex, i18n, 242 tests serveur, build, test:rolls : OK ; après le lot Paralympiques/Bébous : typecheck + game/i18n/etoiles tests OK, familles Sport contrôlées.

## Ordre des lanceurs
1. `.wt-master\METTRE-EN-LIGNE-v2.1.9.cmd` (merge master, tag, sauvegarde, migrations resyncRarities → remapCards → purgeCards, R2, Pages)
2. `lanceurs\push.cmd`
3. (option) `lanceurs\mettre-en-ligne-v2.cmd` pour le lien V3
