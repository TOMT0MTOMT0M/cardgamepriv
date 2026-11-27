# Chantier — Enchères au marché (V3)

Branche `v3-encheres` (tirée de `v2` à 0260592). Décidé : liste QOL validée par Hugo le 26/11 (`qol.md` l. 11), spécification de Tom (clôture à heure fixe par tâche programmée Convex, offre minimum, pièces bloquées). La mention « enchères refusées (10/11) » de `marche-kyara.md` est périmée.

## Règles (src/core/auctions.ts)
- Une enchère = UNE carte, en plus de la vente à prix fixe. Jamais de Bébou.
- Mise à prix ≥ valeur de Forge (`CARD_VALUE` : 5 / 15 / 40 / 100 / 300 / 1 000), plafond = celui du marché (10×).
- Durée 24 / 48 / 72 h = clôture à **21 h (Paris)** le jour de mise en vente (calendrier de Paris) + 1, 2 ou 3 jours. Heure d'été gérée.
- Surenchère minimale +5 %, au moins +1 pièce. Pas d'offre sur sa propre enchère ; pas de surenchère sur soi-même (« tu as déjà la meilleure offre »).
- Pièces bloquées : débitées à l'offre (journal « Enchère : offre sur X (pièces bloquées) »), rendues tout de suite au dépassé + notification push « Tu as été dépassé ».
- Retrait possible tant qu'il n'y a aucune offre ; plus après.
- Clôture : carte → gagnant, pièces → vendeur (pas de frais, comme le marché) ; sans offre : carte rendue au vendeur. Vendeur et gagnant prévenus (push, `kind: 'trade'`).
- Une enchère occupe une des 10 places de vente du marché ; la carte quitte la collection pendant l'enchère (séquestre, comme la vente à prix fixe) : ni forgée, ni échangée, ni vendue ailleurs.

## Fait
- Serveur (b952ba2) : table neuve `auctions` (index `by_status_ends`, `by_seller_status`, `by_bidder_status`), `convex/auctions.ts` (`board`, `create`, `bid`, `cancel`, `closeTick`), cron horaire à la minute 1 UTC (`crons.ts`, bloc à part), places partagées dans `convex/market.ts` (`openCount = sellSlotsUsed`). Messages FR + EN (erreurs `auctions.1-9`, journal `c.auction*`, notifications `n.auction*`).
- Tests `convex/auctions.test.ts` (13) : dates de clôture (hiver / été / changement d'heure / passage d'année), surenchère, mise aux enchères (bornes, Bébou, carte déjà engagée / plus d'exemplaire, Forge refusée), offre / dépassé / remboursement / journal, pièces insuffisantes, deux offres concurrentes, retrait, clôture avec / sans offre, clôture rejouée (idempotence), notifications, coût, places partagées.
- Client (10ddaa8) : `src/game/views/auctions.ts` (+ `auctions.css`, textes `i18n/*/game.views.auctions.ts`) — `createAuctions` (grille, réglage − montant +, « Offrir N » en deux touchers, « En tête » / « Dépassé », « Mes enchères » + résultats de la semaine) et `auctionSellForm` (mise à prix, durée, date de clôture). Backend en ligne + démo (`src/game/auctionsLocal.ts` : robots qui mettent des doublons aux enchères et surenchérissent, au plus 2× la valeur).

## Coût Convex (mesuré par `countReads`)
- `auctions.board` (abonné seulement quand la pastille est à l'écran) : ne lit QUE `auctions` (+ la session) ; noms recopiés dans l'enchère à l'écriture, jamais `presence` (réécrite au battement) ni `users`. 5 enchères ouvertes = 6 documents, 1,6 Ko. Au plus 200 ouvertes + 30 résultats.
- `closeTick` hors de 21 h : 0 document lu, 0 écriture (24 appels / jour).
- `market.sell` : avant `.collect()` des ventes ouvertes ; après `.take(11)` ventes + `.take(11)` enchères (0 document s'il n'y en a pas).

## Décidé (petites décisions)
- « Jour d'échéance » = jour de Paris de la mise en vente + N jours, à 21 h : « 24 h » dure de 21 h à 45 h selon l'heure de mise en vente ; l'écran affiche la vraie date (« Clôture : demain à 21 h »).
- Cron toutes les heures à la minute 1 (plutôt qu'un seul à 21 h) : pas de calcul d'heure d'été, un passage manqué est rattrapé l'heure suivante, coût nul hors échéance.
- Pas de surenchère sur soi-même ; une offre au plafond termine de fait l'enchère (« Plafond atteint »).
- Mise à prix pré-remplie à la valeur de Forge (le minimum) ; durée par défaut 48 h.
- Pas de notification au vendeur à chaque offre (seulement à la clôture) : moins de bruit.
- Noms vendeur / enchérisseur recopiés à l'écriture (un changement de pseudo ne se voit pas sur une enchère déjà ouverte).

## À vérifier par Tom (téléphone)
- Marché → Acheter → pastille « Enchères » : tuiles, réglage − / +, « Offrir N » puis « Offrir N ? ».
- Marché → Vendre → choisir une carte → « Enchère » : mise à prix, 24 / 48 / 72 h, date de clôture.
- Notification « Tu as été dépassé » (deux comptes), puis clôture le soir à 21 h.

## Reste
- Intégration dans la vue du Marché refaite par l'agent `marche` (`git merge v3-marche`).
- Pas d'anti-« dernière seconde » (prolongation si offre à la fin) : à décider par Tom si besoin.
- Les enchères n'apparaissent pas (encore) dans la fiche d'une carte ni dans l'historique du Marché.
