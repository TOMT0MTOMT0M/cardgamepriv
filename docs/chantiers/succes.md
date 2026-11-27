# Succès — refonte V3 (27/11, agent `succes`, branche `v3-succes`)

Décision Tom + Hugo (`historique-claude-ai/v3-base-etoiles-8-titres-24-11.md` point 5, ligne « Succès » d'EN-COURS) : ouvertures à gagner avec aperçu, paliers plus longs, récompenses proportionnelles ; nouveaux cosmétiques → les demander à Tom.

## Barème (étalon `PACK_PRICE` = 250 = 1 B, `src/core/economy.ts`)
| Niveau | Effort (joueur régulier ≈ 60 boosters/jour) | Avant | Maintenant |
|---|---|---|---|
| 1 | quelques jours | 50 | **1 B = 250** |
| 2 | 1-2 semaines | 150 + 1 booster | **3 B = 750 + 2 boosters** |
| 3 | ≈ 1 mois | 500 + 3 | **8 B = 2 000 + 5** |
| 4 | plusieurs mois | 2 000 + 5 | **20 B = 5 000 + 10** |
| 5 (nouveau) | très long (≥ 4-6 mois) | — | **50 B = 12 500 + 20** |

- Repères : petit joueur ≈ 10 B/jour, joueur médian ≈ 16 B/jour (4 070 pièces, mesure du 27/11), mois parfait du calendrier ≈ 76 B + 51 boosters. Un niveau 5 vaut ≈ 3 jours de jeu d'un joueur médian pour des mois d'effort.
- Les paliers « cosmétique » (C10) ne donnent toujours que leur cosmétique. Niveaux des 139 paliers existants inchangés (Tom / Hugo les avaient fixés, tests des cosmétiques).
- Tous les paliers : 56 950 pièces + 172 boosters avant → 158 250 + 331 pour les 139 existants, + 300 000 + 490 pour les 27 nouveaux (166 paliers, 458 250 pièces + 821 boosters en tout, sur des mois).

## 27 paliers longs (au-dessus de chaque échelle, pièces + boosters)
| Échelle | Nouveaux paliers (niveau) |
|---|---|
| Ouvrir des boosters | 7 500 « Fabrique de sachets » (5), 10 000 « Dix mille sachets » (5) |
| Collection | 25 000 « Mémoire du monde » (5), 30 000 « Presque tout » (5) — catalogue 41 037 |
| World / Gaming / Pop / Sport | 4 500 « Atlas », 7 500 « Platine », 15 000 « Panthéon pop », 6 500 « Temple de la renommée » (5) |
| Cartes 5★ / 6★ | 750 « Réserve d'or », 250 « Constellation » (5) |
| Albums complétés | 150 « Bibliothèque » (4), 250 « Bibliothèque d'Alexandrie » (5) — 1 314 albums |
| Échanges | 250 « Bourse aux cartes » (5) |
| Forge | 10 000 « Fonderie » (4), 25 000 « Soleil de forge » (5) |
| Série de connexion | 150 « Cent cinquante jours » (4), 365 « Une année » (5) |
| Saisons | 6 podiums « Abonné au podium », 6 victoires « Empire » (5) |
| Niveau Bébou / Tous les thèmes | 125 « Bébou mythique », 3 000 « Omniscient » (5) |
| Jeux | 500 parties (4), 1 000 parties (5), 250 victoires (5), 10 jackpots (5), 250 000 pièces gagnées (4), 1 000 000 « Millionnaire » (5) |

## Ouvertures à gagner
- `openingOf(succès)` / `OPENINGS_SOON` + `openingSoon()` (`src/core/cosmetics.ts`). Aperçu = `openingPreview()` de la fiche d'un booster (rien de dupliqué).
- Page Succès : une pastille qui cache une ouverture porte un petit repère (sachet) ; dépliée, chaque palier verrouillé qui en débloque une montre son aperçu en boucle (toucher = rejouer), son texte et « Palier N · nom ». Retroussé (`packs-750`), Fenêtre (`burn-250`).
- Pas encore créées : `world-150`, `full-15`, `streak-21` → « Ouverture à gagner · bientôt », sans aperçu (et puce « Ouverture · bientôt » dans la récompense). Elles basculent seules sur l'aperçu dès qu'une ouverture de `OPENINGS` prend ce `need`.
- Au déblocage (après « Encaisser ») : l'aperçu de l'ouverture dans le récap + bouton « L'utiliser » (choisie tout de suite pour tous les boosters, `setOpening`).

## Décidé (petites décisions)
- Barème en B ci-dessus ; niveau 5 ajouté ; aucun niveau existant déplacé.
- Paliers déjà encaissés : gardent ce qu'ils ont donné (pas de complément rétroactif). Un palier atteint mais pas encore encaissé paie au nouveau barème.
- Aperçu en boucle dans la page Succès (dans la fiche d'un booster, seule l'ouverture choisie boucle) : c'est la récompense qu'on veut montrer.
- Contrats : succès / cosmétiques « contrat » non gagnés toujours cachés après le 01/12 (v2.1.40, inchangé) ; aucun palier « contrat » ajouté ; `menage` prévenu de garder `RETIRED_STATS` / `achievementGone` / `visibleLadders`.

## Fait
- `src/core/economy.ts` (barème, niveau 5, 27 paliers), `src/core/i18n/en/data.ts` (54 textes EN), `src/core/cosmetics.ts` (`openingOf`, `OPENINGS_SOON`, `openingSoon`), `src/game/views/succes.ts` (aperçus, récap, « paliers » de la vue Amis traduit), `src/game/succes.css` (nouveau), textes `sc.op*` FR + EN, `convex/succes.test.ts` (nouveau), `convex/atelier.test.ts` (139 → 166).
- Coût Convex : aucune requête ni mutation modifiée (même lecture / écriture dans `claimAchievements`), pas de schéma, pas de migration.

## Vérifié
- `npm run typecheck` OK ; `npm run test:server` 55 fichiers, 325 tests OK ; `npm run check:i18n` = 0.
- `convex/succes.test.ts` : barème, difficulté jamais décroissante dans une échelle, paliers longs au sommet, ouvertures / « bientôt », serveur (paliers déjà encaissés gardés, nouveaux paliers réclamables au nouveau barème, pas de double paiement).
- Démo à 390 px (Chrome sans fenêtre) : repère sur les pastilles, aperçu du Retroussé sur « Ouvrir des boosters », « bientôt » sur « Cartes World », encaissement à 760 boosters → récap avec l'aperçu + « L'utiliser » → « Ouverture « Retroussé » choisie », aucune erreur console.

## À vérifier par Tom (téléphone)
- Succès → déplier « Ouvrir des boosters » (aperçu du Retroussé), « Forge » (Fenêtre), « Cartes World » / « Albums » / « Série » (bientôt).
- Le barème (pièces + boosters par niveau) et les 27 noms de paliers.

## Reste / questions pour Tom
- Complément rétroactif pour les paliers déjà encaissés à l'ancien barème (≈ 3-5× moins) ? Par défaut non (demanderait une migration qui écrit chez tous les joueurs).
- Nouveaux cosmétiques souhaitables (non créés) : titres pour les sommets niveau 5 (« Millionnaire », « Une année », « Bibliothèque d'Alexandrie », « Empire », « Omniscient », « Dix mille sachets ») ; un cadre animé pour `uniq-30000` ; un fond pour `burn-25000` ; un badge « 365 jours ». Les 3 ouvertures `world-150`, `full-15`, `streak-21` (chantier ouvertures).
- Note V3 FR / EN : dans le rapport au chef d'orchestre (pas dans `updates.data.ts`).
