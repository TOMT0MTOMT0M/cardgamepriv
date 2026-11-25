# Rééquilibrage des étoiles (11/11) — sur v2, commit `18cd37f`

## Répartition réelle dans le jeu (V2, après patchs, retraits, corrections de notes)
| Thème | Cartes | 1★ | 2★ | 3★ | 4★ | 5★ | 6★ |
|---|---|---|---|---|---|---|---|
| Pop | 19 388 | 30,86 | 23,65 | 20,57 | 11,32 | 7,87 | **5,73** (avant 6,77) |
| Sport | 7 444 | 28,49 | 23,24 | 20,57 | 12,18 | 10,52 | **5,00** (avant 5,03) |
| World | 5 240 | 30,40 | 23,38 | 20,59 | 12,04 | 8,99 | 4,33 (rien ajouté) |
| Gaming | 8 241 | 33,42 | 22,68 | 20,31 | 11,10 | 8,69 | 3,80 |
Objectif : 30,93 / 23,71 / 20,62 / 11,34 / 9,28 / 4,12. Les taux de tirage (dropRates.ts) n'en dépendent pas.

## Ajouts (5★/6★ jamais touchées)
- **Pop, `Patch-pop-ajouts-11-11.xlsx` (N° 17535 → 20513)** : fusion de deux lots faits en parallèle (choix de Tom : « les deux, sans doublons ») :
  - 1 500 personnages d'animés (cette session) : AniList, sous-thèmes existants, série du perso vérifiée, sans doublon ; étoiles selon les favoris AniList.
  - 343 personnages + 1 136 chansons d'artistes déjà présents (autre session) ; 21 doublons retirés (Luffy, Zoro, Ace, Gohan, Tsunade… remis en 1-4★ par erreur).
  - Exclus : Yu-Gi-Oh (noms de la VF/VO anglaise), City Hunter, Lady Oscar, crossovers (Saiki…), noms génériques.
- **Sport, `Patch-sport-v3-ajouts.xlsx`** : 45 joueurs de Ligue 1 (effectifs Wikidata, photos Commons), 1★–3★.
- Toutes les nouvelles cartes ont une image.

## Fichiers de tri
Feuilles de synthèse refaites avec les vrais chiffres : `Tri-etoiles-popculture.xlsx` (+ copie `_2`), `Tri-etoiles-sport_2.xlsx`, `Tri-etoiles-monde_3.xlsx` (feuille « Répartition » + « Sous-thèmes (réel) »).

## Points relevés
- Le sous-thème « Kingdom » contient en fait des personnages de **Magi** (données d'origine).

## À vérifier par Tom
1. `lanceurs\mettre-en-ligne-v2.cmd` (envoie ~3 000 images sur R2).
2. Sur le V2 : Naruto / One Piece / My Hero Academia, nouvelles cartes et doublons éventuels.
3. Prod : rien de ce lot n'est dans la v1.0.18.
