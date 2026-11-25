# Animations des Jeux — 14/11 (v2, commit `895a710`)

## Fait
- **Pack Battle** : cérémonie selon la rareté (`views/gameFx.ts` `cardBeat`) — 4★+ : le dos palpite à la couleur de la rareté avant le retournement ; retournement 0,72 s (1–3★) → 1,15 s (6★) ; savourage après une 5★/6★. « +n★ » qui file vers le score (3★+). Étiquette « En tête » qui glisse du côté du meneur et frappe quand il change. 6★ : éclair + secousse de la scène. Fin : la lumière de la règle part entière chez le gagnant.
- **Battle Royale** : « +n★ » vers le total (4★+), rangée balayée à la couleur d'une 5★/6★, rang n°1 qui frappe quand le meneur change, podium (1er plein, 2e/3e cerclés).
- **Roulette** : la bille dépasse d'une case, hésite et retombe ; onde carrée depuis la case gagnante, le reste de la table s'éteint un instant.
- **Navigation dans les Jeux** : View Transitions dans le sens de la navigation (onglet suivant →, précédent ←, entrer ↓ / sortir ↑) ; lignes en cascade (`@starting-style` + `sibling-index()`) ; au téléphone, les parties à rejoindre passent avant le formulaire de création ; retour au toucher ; accueil : tables posées au défilement (`animation-timeline: view()`).
- Tout en jetons `motion.ts`, DA usinage inchangée ; mouvement réduit : fondus seulement. Vérifié en démo (duel et royale joués jusqu'au bout, aucune erreur).

## À tester par Tom (lien V2, téléphone)
1. Un Pack Battle avec une 4★+ (dos qui palpite) et si possible une 6★ (éclair).
2. Une Battle Royale à 4 : classement qui glisse, podium.
3. Un tirage de roulette (bille qui dépasse puis retombe).
4. Passer d'un onglet des Jeux à l'autre : le corps glisse, l'en-tête reste fixe.

## Idées suivantes (non faites)
- Roulette : chiffres du résultat en « split-flap ».
- Son calé sur le dos qui palpite (montée) avant une 6★.
