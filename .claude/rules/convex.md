---
paths:
  - "convex/**"
---
# Convex — règles détaillées (chargées seulement quand on touche `convex/`)

- Pendant une mise en ligne, l'ancien code (onglet d'un joueur qui n'a pas rechargé) et le nouveau tournent quelques minutes sur la même base, et l'ancienne version doit pouvoir être remise.
- Nouveaux champs en `v.optional(...)` ; jamais de champ obligatoire ajouté, jamais de type changé.
- Un champ qui change de sens = un nouveau champ ; l'ancien est lu en repli, puis retiré deux patchs plus tard.
- Transformation de données = migration idempotente dans `convex/migrations.ts`, ajoutée à `lanceurs/mettre-en-ligne-prod.cmd` ET `lanceurs/mettre-en-ligne-v2.cmd`, testée sur le staging (petit jeu de test : ne plus lancer `rafraichir-staging-v2.cmd`, il double le stockage). Relancée à chaque mise en ligne → tampon `stampFresh` / `stampSet` (sinon elle relit toute la table à chaque fois : 43 Mo pour `inventory`).
- Vérif : `npm run test:server` (un seul fichier : `npx vitest run convex/<fichier>.test.ts`).
- Jamais `convex deploy` à la main : les lanceurs s'en chargent. Ne pas lire `convex/_generated/`.
- Limites par exécution : 32 000 documents parcourus, 16 Mio lus, 16 000 écrits. Agréger dans une table dédiée (cf. `rankRows`, `rankInc` pour le classement) plutôt que tout relire.
- Chaque écriture d'inventaire pose `rev: invRev()` ; chaque suppression passe par `dropInv` ; jamais d'étoile ni de carte changée sur place (supprimer puis recréer) — le classement par différence (`convex/rankInc.ts`) et la copie locale du client en dépendent. Collection entière d'un joueur : `invOf` (convex/inventory.ts).
- Changement d'étoiles = migrations `resyncRarities` puis `resyncRaritiesOpen` (échanges, annonces, offres, marché).

## Coût (plan Starter : Database I/O 1 GB/mois inclus puis 0,22 $/GB ; stockage 0,5 GB). Règles tirées de la doc officielle (26/11)
- Coût d'une fonction = données lues par appel × nombre d'appels. Mesurer avant / après chaque lot : `node scripts/cout-convex.mjs` (journaux `usageStats` de la prod). Un lot sans gain mesuré est annulé.
- Tout document lu compte, y compris ceux écartés par `.filter` ou en JS : la condition va dans `.withIndex` (index composé si besoin). `.collect()` seulement sur un ensemble petit et borné ; sinon `.take(n)` ou `.paginate`.
- Une requête abonnée se relance dès que N'IMPORTE QUEL champ d'un document qu'elle a lu change (pas d'invalidation par champ). Champs qui bougent souvent → document à part (cf. `presence`) ; ne pas lire le document joueur (2,7 Ko, réécrit à chaque booster) dans une requête qui n'en a pas besoin.
- Pas d'écriture si rien ne change (comparer avant `patch` / `replace`) : pas d'écriture = pas d'invalidation des abonnés.
- Données qui bougent peu (catalogue, classement, profils d'autres joueurs) : lecture ponctuelle `client.query`, pas d'abonnement.
- Chaque index est une copie de la table (stockage) et se réécrit à chaque écriture : pas d'index `by_x` quand `by_x_y` existe (sauf tri par `_creationTime` voulu → trier en mémoire, cf. `invOf`).
- Pas de `Date.now()` dans une requête abonnée si on peut l'éviter (cache moins efficace) ; temps arrondi passé par le client ou champ posé par une tâche programmée.
- `ctx.runQuery` / `ctx.runMutation` depuis une action = un appel de fonction en plus (1 M/mois inclus) : fonctions TypeScript ordinaires quand c'est possible.
- Écritures en masse (migrations) : lots de 100-200 espacés (`runAfter(1000, …)`), chaque écriture réveille les abonnés concernés.
- Sauvegarde `convex export` ≈ 80 Mo d'I/O (toute la base) : seulement si le patch touche `convex/` (test automatique du lanceur).
