# Drops 6★ / secrètes sur Discord — nouvelle mise en page (08/11)

- V2 : commit `594c197` sur `v2`.
- **Prod : reporté sur `master` → commit `97dde80`, tag `v1.0.6`** (seul conflit : `schema.ts`, table `pushSubs` absente de la V1). Mise en ligne : double-clic `.wt-master\METTRE-EN-LIGNE-v1.0.6.cmd` (push master + tag, `mettre-en-ligne-prod.cmd`, révisions d'images, push). Ne touche pas à `v2`.

## Rendu
- Message du « Bébou Drop Bot » : **le pseudo du joueur** en gras, puis la carte elle-même en grand, vue de face (768×1072, coins arrondis transparents, WebP qualité 0,95 ≈ 220–320 Ko). Plus de fiche (embed), ni de champs Série / Rareté / Collection.
- La carte = même gabarit que la carte 3D de la vue détail (pleine illustration, étoiles, numéro, nom, famille), sans les reflets animés.
- Merveilles : la capture statique de leur design 3D (`art/merveilles/cartes3d/*.webp`).
- Aussi pour les cartes secrètes Bébous (même code d'envoi).

## Fonctionnement
1. Crédit du booster (`packs.ts revealOne`) → ligne `dropShots` + envoi de secours programmé à 45 s.
2. Le jeu du joueur peint la carte (`src/game/dropShot.ts`) et l'envoie (`dropShots.uploadUrl` + `dropShots.attach`) → publication immédiate.
3. Sinon (appli fermée, booster scellé avant un rechargement, envoi raté) : le secours poste l'illustration brute à 45 s.
- Une seule publication par drop (`claim`), image supprimée du stockage Convex après envoi. Pseudos échappés (pas de mention @everyone).
- Schéma : nouvelle table `dropShots` seulement (compatible avec les données existantes). L'ancien `notifyDiscordPull` est gardé pour les envois déjà programmés.

## Vérifié
tsc site + convex OK (v2 et master) · 100 tests serveur OK (dont 4 nouveaux) sur les deux branches · peinture réelle dans Chrome (Vincenzo Nibali, Chichén Itzá, Théâtre des Champs-Élysées) · **test Discord réel** : même message (« **Teto** » + carte.webp 768×1072) envoyé par le bot en MP à Tom, accepté par Discord (200).

## À savoir
Le staging V2 n'a pas de `DISCORD_WEBHOOK_URL` : rien n'y est posté. Pour tester avant un patch, poser sur le staging un webhook d'un salon de test.
