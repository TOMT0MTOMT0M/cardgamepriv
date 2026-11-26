# Économie : un seul étalon (proposition du 26/11, rien de codé)

Demande de Hugo : l'écart est trop grand entre ce que rapportent la connexion quotidienne, la Forge, et ce que coûtent les boosters ou la roulette. Il faut une règle qui marche pour tout le monde.

## Les chiffres actuels (code au 26/11)
| Source / prix | Valeur | Fichier |
|---|---|---|
| Recharge | 1 booster / 5 min, réserve 15 (20 abonné) | `src/core/packRegen.ts` |
| Pièces à l'ouverture | 10-40 (Bebou), 15-50 (thème), 25-90 (spécial) ; ≈ 30 en moyenne | `economy.ts` `PACK_COINS` |
| Forge (valeur d'une carte) | 1★ 5 · 2★ 15 · 3★ 40 · 4★ 100 · 5★ 300 · 6★ 1 000 | `economy.ts` `CARD_VALUE` |
| Valeur de Forge d'un booster | ≈ 162 (calcul sur `SLOT_WEIGHTS` / `GUARANTEED_WEIGHTS`) | `dropRates.ts` |
| Calendrier 30 j | 50 → 330 / jour, ×2 aux jours 7/14/21, jour 30 = 1 000 + 51 boosters ; mois = 7 050 (≈ 235 / jour) | `economy.ts` `calendarReward` |
| Série 7 jours | 10 boosters | `streak.ts` |
| Missions | 1 à 3 boosters, bonus 2 | `missions.ts` |
| Achat de booster | 250 pièces | `economy.ts` `PACK_PRICE` |
| Roulette (V3) | 1 000 le numéro, 2 000 avec une couleur, ou 2× 5★, ou 1× 6★ | `games.ts` |
| Marché | 1 pièce à 10× la valeur de Forge | `market.ts` |

## Le problème
La Forge et les pièces d'ouverture grandissent avec le nombre de boosters ouverts, et les boosters sont presque gratuits (288 par jour possibles). Le reste est fixe et petit. Estimation (≈ 70 % de doublons, à vérifier) :

| Profil | Boosters / jour | Ouverture | Forge | Calendrier | Total / jour |
|---|---|---|---|---|---|
| Petit joueur (1 réserve) | 15 | 450 | ≈ 1 700 | 235 | ≈ 2 400 |
| Régulier (4 réserves) | 60 | 1 800 | ≈ 6 800 | 235 | ≈ 8 800 |
| Gros joueur | 150 | 4 500 | ≈ 17 000 | 235 | ≈ 21 700 |

- Le calendrier pèse 10 % du revenu d'un petit joueur, 1 % d'un gros : la connexion quotidienne ne compte pas.
- La roulette à 1 000 coûte 0,4 jour à un petit joueur, 0,05 jour à un gros.
- Acheter un booster à 250 n'a de sens que réserve vide.
- Incohérence : à la roulette, 2× 5★ (600 en valeur) = 1 000 pièces = 1× 6★ (1 000).

## Proposition : tout compter en boosters
**Étalon B = prix d'un booster = 250 pièces.** Chaque prix et chaque récompense est un multiple de B, écrit à un seul endroit (`economy.ts`, calculé depuis `PACK_PRICE`). On change B : tout suit.

1. **Forge à rendement dégressif par jour** (heure de Paris) : 100 % jusqu'à 12 B (3 000 pièces), 50 % jusqu'à 40 B (10 000), 25 % au-delà. Pièces d'ouverture comprises. Le petit joueur ne voit rien ; le gros passe d'environ 21 700 à environ 9 000. L'écran Forge affiche « rendement plein encore X pièces aujourd'hui ». Convex : un compteur du jour sur le joueur (`v.optional`), déjà lu et écrit à la forge, donc coût quasi nul.
2. **Connexion quotidienne relevée** pour peser environ 15-25 % d'une journée de petit joueur : jour 1 = 1 B (250), +20 par jour (jour 29 = 810), ×2 aux jours 7/14/21, jour 30 = 8 B (2 000) + les 51 boosters. Mois parfait : environ 18 900 au lieu de 7 050.
3. **Prix calés sur le revenu d'un petit joueur** (R ≈ 10 B par jour) : booster 1 B (inchangé) ; roulette 4 B / 8 B (inchangée, environ 0,4 jour) ; mise en cartes alignée sur la table : 1 000 = 1× 6★ = **3× 5★** (au lieu de 2).
4. **Marché** : prix conseillé = 1,5× la valeur de Forge (sert à « Forge → vente », qui veut un prix nettement au-dessus de la Forge) ; plafond 10× inchangé.
5. **Garde-fou** (inchangé et vérifié) : un booster rend environ 0,77 B (Forge 0,65 + pièces 0,12), toujours moins que 1 B. Pas de boucle « acheter, forger, racheter ».

## Avant de coder
- Mesurer les vrais revenus par joueur (pièces gagnées, forgées, par jour, sur 7 jours) : une seule requête en lecture, avec Tom (Convex au-dessus de l'offre gratuite).
- Décider avec Tom : seuils du point 1 (12 B / 40 B), calendrier du point 2, 3× 5★ à la roulette.
- Change l'expérience des joueurs : en V3, note de patch FR et EN, et `npm run test:server` sur `economy` / `games`.
