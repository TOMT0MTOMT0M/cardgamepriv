# Chantier V3 — Marché plus visuel « façon Kyara »

Références de Tom (25/11) : `docs/references/marche-kyara/kyara-acheter.png`, `kyara-vendre.png`.
On s'inspire des PRINCIPES, on ne recopie ni leur interface ni leurs couleurs : tout reste dans notre DA « usinage » (noir/blanc, couleur = information, jetons de `motion.ts`, Bold Frame / Inter, aucun émoji).

## À reprendre
- **La carte est l'annonce** : grande grille de cartes entières (full art), 3 colonnes sur PC, 2 sur téléphone ; le texte se réduit à 3 infos sous la carte : prix, écart au prix médian (« +3 % méd. », couleur selon bon / mauvais prix), vendeur. Fin de vente / « Terminée » en petit à droite.
- **Filtre de rareté en pastilles** de nos couleurs de rareté (gris, vert, bleu, rouge, doré, arc-en-ciel) + « Toutes », à côté d'une seule barre de recherche (perso ou univers) ; « Filtres » regroupe le reste.
- **Onglets courts** : Acheter · Vendre · Échanges · Mon activité (notre « Historique »).
- **Vendre = ma collection en grille**, triée « plus d'exemplaires d'abord » : on voit tout de suite ses doublons et on vend d'un toucher.
- **Échanges dans le chat** : un message peut contenir une carte « J'échange » avec un rappel personnel (« Il te manque » / « Tu l'as déjà (×1) ») et un bouton « Proposer un échange ». À brancher sur notre chat général existant.

## À ne pas reprendre
- ~~Les enchères (refusées : prix fixe, sans enchères, décision du 10/11).~~ Périmé : enchères décidées le 26/11, codées par l'agent `encheres` (branche à part) sur les points d'accroche ci-dessous.
- Les salons multiples et les langues dans le chat (club de 40-50 joueurs : un « chat général » suffit).
- Les logos, idéogrammes et la palette de Kyara.

## Contraintes
Aucune hausse de coûts Convex (pas de requête réactive qui relit les inventaires de tout le monde), textes FR/EN, `check:i18n` = 0, rendu vérifié sur téléphone par Tom ou Hugo.

---

# Lot V3 « marche » (27/11, agent `marche`, branche `v3-marche`)

## Fait
- **Onglets courts** de la page Marché (`views/trades.ts`) : Acheter · Vendre · Échanges · Mon activité. Anciens liens gardés (`#/echanges/chercher` → Acheter, `pour` / `tableau` / `cours` → Échanges, `historique` → Mon activité ; la notification push garde `chercher`). Visite guidée : cibles mises à jour.
- **Acheter** (`views/market.ts`, mode `buy`) : la carte est l'annonce. Grille de cartes entières, sous chacune : prix · écart au prix conseillé (« +3 % », vert = bon prix ≤ −5 %, gris autour, orange +20 à +60 %, rouge au-delà) / vendeur (+ « ♥ » si voulue, « ✓ » si déjà à moi). Une barre de recherche (perso ou univers ; les cartes du catalogue qui correspondent en petite rangée au-dessus, toucher = « chez les joueurs »), pastilles de rareté « Toutes » + 6 couleurs (6★ arc-en-ciel), « Filtres » (tri, Mes manquantes, Mes envies, type d'annonce quand les enchères sont branchées ; un point blanc si un filtre est actif), « N annonces ». Toucher une annonce = sa fiche (grande carte, n°, prix, écart, vendeur → profil, Acheter en deux touchers, Fiche de la carte).
- **Vendre** : ma collection LIBRE en grille, « Plus d'exemplaires d'abord » (ou plus rares / par nom), recherche et pastilles, par fournées de 60 (« Afficher plus ») ; un toucher = feuille Prix fixe | Enchère | Échange (prix pré-rempli au conseillé, écart en direct) ; mes ventes en rangée au-dessus (toucher = fiche, Retirer).
- **Échanges** : en cours (rien d'écrit s'il n'y a rien), « Pour toi », tableau d'offres, « Composer moi-même ». **Mon activité** = l'historique.
- **Moins de texte** : intros du marché supprimées (le portefeuille est déjà dans l'en-tête), libellés courts ; « Pour toi » et tableau d'offres : intro et cas vides en une ligne.
- **Échanges dans le chat** : sous la carte jointe par un autre joueur, « Il te manque » / « Tu l'as déjà (×N) » et « Proposer un échange » (demande en un toucher, `askFor`).
- **Écart au prix** (décision du chef : pas d'étiquette « +50 % ») : référence = prix conseillé 1,5× Forge (`marketGap`, `src/core/market.ts`) ; pas de prix médian côté serveur sans lecture en plus (la moyenne des ventes reste affichée dans la feuille Vendre quand elle existe, déjà lue par la fiche carte).
- **C bis, alerte acheteur** : `market:sell` prévient les joueurs qui veulent la carte (carte, album, famille, sans l'avoir), comme Forge → vente, au prix affiché ; helper commun `alertWishers` (Forge → vente et, demain, les enchères). Plafond : **1 alerte par vendeur et par heure** pour un même joueur (table neuve `wishAlerts`, une ligne par acheteur et vendeur, réécrite : bornée). **Pastille** : `market:alerts` (mes lignes seulement) → `src/game/wishSales.ts` : nombre sur « Marché » (en-tête) et sur « Acheter » jusqu'à la visite d'Acheter ; les cartes voulues mises en vente depuis la visite précédente portent « nouveau ».
- **Enchères** : point d'accroche `setMarketPlugin` (`views/market.ts`) : `watch` (annonces `kind: 'auction'`), `corner` (temps restant sous la carte), `dealFoot` (boutons de la fiche), `sellForm` (onglet Enchère de la feuille Vendre). Rien ne s'affiche tant que rien n'est branché.

## Vérifié
- `npm run test:server` : 55 fichiers, 322 tests OK (1 sauté, déjà avant).
- `npm run typecheck` OK ; `npm run check:i18n` = 0 ; `convex/alerteAcheteur.test.ts` (prévenus au bon prix, celui qui l'a et le vendeur exclus, 1 par heure, ligne réécrite, pastille), `forgeVente.test.ts`, `market.test.ts`, `i18n.test.ts` OK.
- Coût mesuré (convex-test, `countReads`) : « qui veut cette carte » (`market:wanted`, 1 carte, 2 intéressés) = 4 documents, 581 octets (+ 1 présence et 1 inventaire par intéressé en vrai) ; à la mise en vente s'ajoutent, par joueur prévenu, 1 ligne `wishAlerts` + ce que lit `notify` (joueur, abonnements push). `market:alerts` (abonnée) : session + mes lignes seulement, ni document joueur ni `Date.now()` : ne repart que quand on m'envoie une alerte. Rien d'autre d'abonné en plus ; Acheter / Vendre gardent l'abonnement au tableau du marché seulement quand l'onglet est à l'écran.
- Démo 390 px et 1280 px (Chrome sans fenêtre, annonces simulées le temps des captures, rien laissé dans le jeu) : grille Acheter, fiche d'annonce, Filtres, Vendre (grille + feuille), Échanges, chat (rappel + Proposer → message du serveur de démo). Illustrations absentes dans le dossier de travail (silhouettes) : rendu des images à voir en vrai.

## À vérifier par Tom (téléphone)
- Acheter : 2 colonnes lisibles, la ligne prix / écart / vendeur, couleurs de l'écart, pastilles de rareté, « Filtres ». Toucher une annonce → fiche → Acheter (deux touchers).
- Vendre : ma collection « plus d'exemplaires d'abord », un toucher → feuille, mise en vente.
- Alerte : Hugo met une carte en envie, Tom la vend À LA MAIN → push « Tom vend une carte que tu veux » chez Hugo, pastille sur « Marché » et « Acheter », « nouveau » sur la carte ; une 2ᵉ vente de Tom dans l'heure ne renotifie pas.
- Chat : une carte jointe par l'autre → « Il te manque » / « Tu l'as déjà », « Proposer un échange ».

## Décidé (petites décisions)
- 4 à 5 colonnes sur grand écran (pas de chat collé à droite chez nous) au lieu de 3 ; 2 au téléphone ; Vendre : 3 au téléphone.
- Plus de bouton « Acheter » sous chaque carte : la fiche de l'annonce le porte (moins de texte, et la place pour « Enchérir »).
- Onglet par défaut : Acheter (Échanges s'il y a un échange reçu) ; la dernière visite reste retenue.
- Plafond d'alerte appliqué aussi à Forge → vente (même helper) ; première visite sur un appareil : les alertes des dernières 24 h comptent.
- « ♥ » / « ✓ » sur la ligne du vendeur plutôt que sur la carte (le coin de la carte porte le n°).

## Reste
- Brancher les enchères (agent `encheres`, `git merge v3-marche`).
- Remesurer en prod après mise en ligne : `node scripts/cout-convex.mjs` (lignes `market:sell`, `market:alerts`).
- Texte `bd.locked` (tableau d'offres) parle encore de « contrat » (retirés le 01/12) : à raccourcir avec le ménage des contrats.
