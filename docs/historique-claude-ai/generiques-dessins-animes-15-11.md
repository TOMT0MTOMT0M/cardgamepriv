# Génériques des 6★ de dessins animés (15/11) — sur v2, commits `5f924f1` + `4c4e48d` (pas encore poussés)

## Ce qui change
- Une 6★ du bloc **Dessins animés** (Marge Simpson…) joue le générique de son dessin animé, à l'ouverture et dans la visionneuse, avec le même lecteur que les openings d'animés.
- **Les 55 cartes, 49 dessins animés.** FR quand le générique français est édité (Albator, Heidi, Capitaine Flam, Musclor, Jayce, Oggy, Zig et Sharko, T'choupi, Foot 2 Rue, Galactik Football, Princesse Sarah, Babar, Barbapapa, Phinéas et Ferb…), sinon l'original.
- **Jeu en anglais** : la version anglaise remplace la française quand elle diffère (Phinéas et Ferb, Jayce, Musclor).
- **Grizzy et les Lemmings, Kaeloo, Les Zinzins de l'espace** : extraits fournis par Tom (30 s, fondu, volume aligné, 400-480 Ko), servis par Pages depuis `public/audio/generiques/` (même origine, aucun coût en plus). Référence `file:<chemin>` dans `previews-curated.json`.
- Reprises fidèles faute d'enregistrement officiel : Ben 10, Molang, The Owl House, Big City Greens, Dexter, Doug, Franklin, La Cour de récré, Oui-Oui, Tintin, Phinéas FR, Jayce EN.
- Corrigé au passage : les corrections à la main du 12/11 (American Idiot, Pump It, Bande organisée, Poulenc) vivent dans `scripts/data/previews-overrides.json` : régénérer ne les efface plus.
- Mises à jour : entrée « 15 nov. » FR et EN.

## Vérifié
Type-check OK. Les 47 adresses Apple répondent. Les 55 cartes ont leur générique. Structure FR / EN des mises à jour identique. Tests Convex pas lancés (binaires Windows), rien de changé côté serveur.

## À faire par Tom
1. `git push origin v2` (le push échoue ici, faute d'identifiants GitHub). Verrous git laissés par la session renommés en `.git/stale-*` : supprimables.
2. `lanceurs\mettre-en-ligne-v2.cmd`.
3. Sur le lien V2 : Marge Simpson, Albator, Grizzy, Kaeloo, Etno ; Phinéas et Ferb en FR puis en EN.
4. Pour la prod : `lanceurs\publier-patch.cmd` quand tu veux le sortir.
