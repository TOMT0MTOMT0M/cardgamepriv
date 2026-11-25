# Patch v2.1.6 (20/11) — EN PROD : zip 8 de Hugo, musiques films / jeux, mini-sondage télé

## En ligne (15 h 02)
- Prod = master `8f4ed46`, tags `v2.1.5` (gros tirages) et `v2.1.6`, `version.json` = `prod-20261120T1402-8f4ed46`. Lancé par Claude.
- Sauvegarde : `.wt-master\sauvegardes\avant-patch-v2.1.6-2026-11-20-1500.zip`.
- 72 images envoyées sur R2 (36 cartes + miniatures `-r2611201333`).
- `v2` : même contenu (`d5d8fb0`) + `merge -s ours patch-v2.1.6` (`8e574fa`), poussée avec `push.cmd`.

## Contenu
- **36 cartes** en pleine illustration (portrait 0,72). Entières sur fond flouté : Another Brick in the Wall, Sexual Healing, Sexion d'Assaut. D'Jok recadré à la main. Brimstone via `VALORANT_FILE_OVERRIDE`.
- **6★** (`RERATE_20_11`) : Michael Scott, Suguru Getou, Haruka Nanase, Knight. ShowMaker l'était déjà (13/11).
- **L Lawliet** : « L no Theme » (Hideki Taniuchi).
- **Musique des 6★ de films (53) et de jeux vidéo (33)** : table `screen`, groupe `jeux-video` ajouté dans `musicPreview.ts`. Interprètes originaux seulement.
- **Mini-sondage télé** (`tele-2026-12`) : annonce de l'ajout de début décembre, puis « quelles émissions » (25 au choix) et « quelles 6★ » (texte libre). Revient toutes les 8 h tant qu'il n'est pas rempli. Résultats dans `/admin/` → Sondage (avec l'ancien sondage dessous).
- Mises à jour FR / EN : entrée du 20 nov.

## Vérifié
- tsc client et convex, `check:i18n`, build, tests serveur (1 échec `i18n.test.ts` Balde de Ubaldis, présent avant le patch).
- En prod : `version.json` à jour, images L et Brimstone servies (200).

## Manque une source
- **Lucky Luke, générique d'Antoine de Caunes** (2001) : introuvable sur iTunes et Deezer. Il faut un mp3 de 30 s.
- Sans musique originale en boutique : Forrest Gump, Kirikou, Platoon, Rambo, Percy Jackson ; Mario, Zelda, Metroid, Donkey Kong, Animal Crossing, Crash, Resident Evil, Half-Life. Familles « divers », MMO, rétro, party games, Summoners War, Palworld : pas de musique.

## Attention
- `git worktree prune` lancé depuis la VM a supprimé l'inscription de `.wt-master` ; recréée à la main (`.git/worktrees/-wt-master`), le lanceur a ensuite tourné normalement. **Ne jamais lancer `git worktree prune` depuis la VM.**

## À vérifier sur le site des joueurs
- Cartes Kakashi, Sasuke, L, le Joker, Brimstone ; Michael Scott en 6★.
- Musique d'une 6★ Star Wars ou Harry Potter, d'une 6★ Final Fantasy ou Halo, et de L.
- Le mini-sondage à la connexion (`?sondage` pour le forcer).
