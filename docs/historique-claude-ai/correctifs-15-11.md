# Correctifs du 15/11 (soir) — sur v2, commits `dec4d34` `a21ab39` `7b1e3a9` `0921546` `8b0b9d8` `321d0b4` `76e10dc` `586efca` (pas encore poussés)

## Musiques 6★ (`dec4d34`, `586efca`)
- Bruno Mars → Locked Out of Heaven. Belle-Île-en-Mer → Laurent Voulzy en studio (c'était un live).
- Faker, Zeus, Oner, Keria, Gumayusi → GODS. Bleach → Ranbu no Melody (SID), sauf Ulquiorra → Fiesta de Guerra (Shiro Sagisu). Akashi → Rakuzan Shingeki. Yuuri Katsuki → Yuri on ICE. Neo → Clubbed to Death (Rob Dougan). Brian O'Conner et Dominic Toretto → See You Again. Mirai Nikki → Kuusou Mesorogiwi.
- Versions live / remix remplacées par l'original : Spy x Family, Beastars, Trigun. Mickey : générique français (anglais en EN).
- **24 génériques récupérés par Gemini** (`586efca`) : 16 dessins animés en VF (Bob l'éponge, Dora, Peppa, Scooby-Doo, Steven Universe, Adventure Time, Ben 10, CatDog, Dexter, Franklin, Jimmy Neutron, Animaniacs, Télétubbies, Oui-Oui, Sam le pompier, Avatar) — leur version anglaise reste pour le jeu en anglais ; 6 génériques instrumentaux officiels à la place des reprises ; Cha-La Head-Cha-La 1989 ; Olive et Tom (Corbel). Coupés à 30 s, servis par Pages (`public/audio/generiques/`). Sources : `donnees/generiques/sources-generiques-15-11.txt`. Reste en reprise fidèle : Molang, Tintin, Phinéas et Ferb (FR), Jayce (EN).
- **Départ au refrain** (Musique seulement) : `scripts/music-starts.py`, 127 extraits décalés. Approximatif : on n'a que les 30 s officielles.
- **Boucle** : la musique tourne tant que la 6★ reste à l'écran.

## Catalogue (`a21ab39`, `8b0b9d8`)
- 6★ : Tengen, Muichirou, Mitsuri, Gyoumei, Obanai, Sanemi, Gumayusi (`RERATE_15_11`).
- `RENAME_15_11` : 58 personnages d'Inazuma Eleven aux noms de la VF.
- « Balde de Ubaldis », doublon de Marion Bartoli : retirée (`PURGE_15_11`). Carlos Ruiz : Baseball (`RESUB_15_11`).

## Images (`7b1e3a9`)
- Zip « 6 » : 79 cartes en plein cadre. Visages recentrés : Eden Hazard, Orelsan, Ulquiorra, Mark Evans, Reze.

## Correctifs (`0921546`)
- File admin des suggestions : boutons et filtres réparés. Profil plus aéré, vitrine plus robuste. Mises à jour FR / EN.

## Antigravity / Gemini (`321d0b4`, `76e10dc`)
- `AGENTS.md` + `.agents/rules` (trigger: always_on) : Gemini n'écrit que dans `donnees/**/a-integrer/` et `.gemini-tmp/`. 4 tâches dans `.agents/workflows`. Projet en mode Default (pas Turbo).

## Vérifié
tsc, check:i18n (0), mises à jour FR / EN, profil en démo, catalogue, 55 / 55 6★ de dessins animés avec générique. Tests Convex non lancés (binaires Windows).

## À faire par Tom
1. `git push origin v2`, puis `lanceurs\mettre-en-ligne-v2.cmd`.
2. Sur le lien V2 : file admin, une 6★ Musique qui boucle, Bleach, Ulquiorra, Gumayusi, Carlos Ruiz, Sangoku (Cha-La), Tsubasa, Bob l'éponge en FR puis EN, le profil.
3. `lanceurs\publier-patch.cmd` → **2.1.2**.

## En attente
- Vitrine « qui n'existe plus » : pas reproduit en démo ; capture d'écran utile.
- V3 : prompt Gemini donné (Orchestrator Argon), livrables attendus dans `donnees/v3/a-integrer/`.
