# Audit — version 100 % anglaise (13/11, branche `v2`)

**Verdict : faisable.** Aujourd'hui il n'y a aucun système de langues : tout est écrit en dur, en français. Inventaires complets dans `.claude-tmp/` : `i18n-inventaire-textes.csv` (3 644 lignes, avec fichier et ligne) et `i18n-inventaire-cartes.csv` (40 322 cartes).

## 1. Textes du jeu
| Zone | Volume mesuré | Comment |
|---|---|---|
| Interface joueur (`src/game`, `src/core`) | ~2 280 textes, ~16 000 mots, ~120 fichiers ; + ~200 attributs (`aria-label`, `title`, `placeholder`) ; + 6 textes CSS (`content: 'nouveau'`, `'Retirer'`, `'PACK SIGNATURE'`…) | sortis dans `fr.json` / `en.json` |
| Serveur Convex | ~530 textes, dont 319 erreurs `ConvexError` affichées telles quelles par `errMsg` (`ui.ts`) | codes d'erreur + paramètres |
| Textes longs | guide, infos, sécurité, sondage, notes de patch (`updates.data.ts` : 128 textes, ~2 650 mots) | traduits à la main |
| Texte dessiné en 3D / canvas | booster (`pack.ts` : « ✂ DÉCHIRER ICI », « 5 CARTES · DONT 1 RARE OU MIEUX », « SÉRIE I »), raretés (`rarity.ts`), « CARTE SECRÈTE », « PERSONNAGE / OBJET » (`jvTitle.ts`), « P A C K   D E   B A S E » (`opening.ts`), titres des scènes 6★ (« DERNIER COUP », « EN DIRECT », « ÉCHEC ET MAT », « VICTOIRE »…) | passent par `t()`, mise en page à recontrôler |
| Images avec du texte FR | 14 captures `art/merveilles/cartes3d/*.webp` (nom, pays, « LES 14 MERVEILLES ») ; `og-booster.jpg` et `og-bebou.jpg` | à refaire en anglais |
| Page et PWA | `lang="fr"`, titre, meta et og (`jeu/index.html`), `manifest.webmanifest`, `404.html`, `sw.js` | |
| Discord | messages privés du bot (« Ouvrir le jeu »), drops (`dropShots.ts`), rôles | dépend de la langue du joueur |

## 2. Cartes (40 322)
| Famille | À traduire | Source anglaise |
|---|---|---|
| Pokémon 1 025 | tout (Bulbizarre → Bulbasaur) | auto : noms officiels par n° de Pokédex |
| LoL 2 120 | ~1 100 (« Aatrox lune de sang ») | auto : Data Dragon `en_US`, le slug est déjà dans l'id |
| Valorant 992 | ~310 | auto : valorant-api `en-US` par uuid |
| Skins CS 1 107 | rien (déjà en anglais) | — |
| Jeux vidéo 2 997 | ~90 (« Les Sims », « Lames du Chaos ») | à la main |
| Pop Culture 19 387 | persos repris de Wikipédia FR (« Severus Rogue » → Snape) : quelques centaines, nombre exact inconnu | semi-auto (liens fr→en de Wikipédia) + relecture |
| Sport 7 444 | ~1 100 (clubs, compétitions, translittérations comme « Dmitri Toursounov ») | semi-auto Wikipédia |
| World 5 240 | presque tout : animaux 2 104, lieux 1 714, nourriture 777, voitures ~60, Ardèche 36, Merveilles 14 | semi-auto + relecture : **le plus gros morceau** |
| Bébous / KCDQ 10 | « Bébou n°6 »… | à la main |

En plus : **1 345 libellés de sous-thèmes** imprimés en grand sur les cartes (~270 clairement en français, comme « L'Attaque des Titans » ou « Olive et Tom » : à relire en entier), 90 types (« Personnage », « Mammifère »…) et 26 groupes. Les catalogues sont générés (`scripts/make-*.py` depuis `donnees/*.xlsx`). Il faut donc une colonne EN dans les sources et un fichier `*.en.ts` à part, chargé seulement en anglais. Les ids ne changent pas.

## 3. Pièges
1. **Phrases enregistrées en français dans Convex** : `activityFeed.message`, `coinTx.label`, et `cardName` recopié (packOpens, duels, dropShots, presseRuns, feed). Il faut stocker un type + des paramètres, et afficher le nom de la carte depuis le catalogue via `cardId`. L'historique déjà en base reste en français, sauf migration.
2. **Textes générés pour un joueur précis** : push (trades, friends, games, referrals, events, push), bot Discord. Il faut un champ `users.lang` (`v.optional`).
3. **Grammaire écrite à la main** : ~340 pluriels (`carte(s)`, `n > 1 ? 's'`) et ~290 phrases à variables (« Ouvrir le ${nom} »). On passe à des messages avec paramètres + `Intl.PluralRules`.
4. **Formats** : 44 usages de la locale `fr` dans 22 fichiers (dates, nombres, tris `localeCompare`), `fmtPct` « 62,4 % », espaces fines, « 20 h ».
5. **Recherche** (`cardSearch.ts`) : chercher dans les deux langues.
6. **Contenu écrit par les admins** : nom et texte des boosters du moment (`packEvents`). Ajouter des champs EN optionnels dans le dashboard.
7. **Mode démo** `localBackend.ts` : ~140 textes, copie de ceux du serveur.
8. **Tests** : 35 fichiers vérifient 138 phrases françaises. Ils devront tester les codes.
9. **Largeurs** : l'anglais est souvent plus court, mais certains onglets sont déjà coupés (audit UI, O2). Recontrôler les capitales espacées.
10. **Heure de Paris** en dur (roulette 10 h / 20 h, missions, saisons) : ça va si les joueurs anglophones sont en Europe.

## 4. Ce qui reste en français (à confirmer)
Chansons, albums et artistes (6 275 cartes + `musicPreviews.data.ts`), pseudos, chat, suggestions, réponses au sondage, admin, labo, scripts, adresses `#/boutique`… À trancher : les blagues Ardèche / Bébous, l'historique des patchs, langue auto (téléphone) ou choisie dans le profil.

## 5. Ordre proposé
1. Socle : `t()` maison (pas de lib, zéro coût), `users.lang` + sélecteur, formats.
2. Interface, textes 3D / canvas, CSS, attributs.
3. Serveur : codes d'erreur, feed et coinTx structurés (migration idempotente), push et Discord par langue.
4. Catalogue : auto, puis semi-auto, puis à la main.
5. Images, textes longs, tests, essai sur téléphone en FR et en EN.

*Vu en passant :* `art/nourriture/001-raclette-savoyarde.png` montre des œufs Bénédicte, pas une raclette.
