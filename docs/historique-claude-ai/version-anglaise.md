# Version anglaise — suivi (branche `v2`, mis à jour le 13/11) — **les 8 lots sont faits**

## Fait
| Lot | Commit | Contenu |
|---|---|---|
| 1 | `efad25c` | `t()` maison, dictionnaires typés, pluriels, formats. Règle : `?lang=` → choix manuel (`bebou.lang`, puis compte `users.lang`) → appareil (fr, fr-FR, fr-BE, fr-CH = français, sinon anglais). Pastille **FR \| EN** à côté du son. |
| 2a–2h | `a6dfd1b` … `5dd164c` | Toute l'interface joueur. |
| 3 | `a347fe3` | Texte dessiné (raretés, cartes, Merveilles, duels, scènes 6★, dos des boosters). |
| 4a / 4b | `dd4c65c` / `036a48c` | Erreurs serveur en codes ; fil, pièces, notifications push, MP Discord, statuts des amis dans la langue du joueur ; `nameEn/blurbEn` des boosters du moment (dashboard) ; migration `i18nMessages` dans les deux lanceurs ; démo traduite. |
| 5 | `5b5b460` | Catalogue anglais (`scripts/make-catalogue-en.py`) : 7 263 cartes, 277 sous-thèmes, 26 groupes, 90 types. Recherche dans les deux langues. **1 056 propositions à relire : `donnees/suivi/traduction-a-verifier.xlsx`**. |
| 6 | `db21e02` | Captures anglaises des 14 Merveilles (`public/art/merveilles/cartes3d/en/`, déjà sur ton disque), manifest anglais, 404 bilingue. og: français. |
| 7 | `36220cc` | Notes de patch (`updates.en.ts`) et tutoriel en anglais. `check:i18n` : **0**. |
| 8 | `dd3c6da` | 59 tests sur codes d'erreur ; tests i18n (clés, paramètres, messages, migration, catalogue, notes de patch). |

**Vérifications** : typecheck, 221 tests, build, `check:i18n` = 0. **Mesures** : boutique 9,3 s avant / 9,3 s FR / 9,4 s EN ; premier téléchargement +1 % gzip ; anglais à part (dictionnaire 120 Ko + catalogue 318 Ko), seulement en anglais.

## Méthode (pour la suite)
- Nouveau texte joueur : clé dans `fr/<module>.ts` + `en/<module>.ts` (sinon test et typecheck cassés). Message stocké par le serveur : `fm('code', params)`. Erreur : `fe('code', params)`.
- Corriger une traduction de carte : `scripts/data/en/manuel-*.json` puis `python3 scripts/make-catalogue-en.py build`.
- Nouvelle note de patch : l'ajouter aussi dans `src/game/updates.en.ts` (le test vérifie la structure).

## À tester par Tom
1. `lanceurs\mettre-en-ligne-v2.cmd` (schéma : champs optionnels ; migration `i18nMessages` ; images anglaises des Merveilles vers R2).
2. Téléphone, `…/jeu/?lang=en` puis `?lang=fr` : boutique, ouverture avec 6★, collection (noms, albums, Merveilles, recherche « bulbasaur » / « bulbizarre »), échanges, jeux, profil, chat, Mises à jour, Tutoriel. Un nom long (Monde) tient-il sur la carte ?
3. En anglais : une erreur (miser plus que ses pièces), historique du portefeuille, fil du profil, statut d'un ami ; une notification sur un compte réglé en EN.
4. Dashboard → Événements : « Nom en anglais » ; sachet et boutique en `?lang=en`.
5. Relire l'Excel des traductions (animaux rares, personnages francisés, lignes de skins LoL).
