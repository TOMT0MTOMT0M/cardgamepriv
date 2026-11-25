---
paths:
  - "convex/**"
---
# Convex — règles détaillées (chargées seulement quand on touche `convex/`)

- Pendant une mise en ligne, l'ancien code (onglet d'un joueur qui n'a pas rechargé) et le nouveau tournent quelques minutes sur la même base, et l'ancienne version doit pouvoir être remise.
- Nouveaux champs en `v.optional(...)` ; jamais de champ obligatoire ajouté, jamais de type changé.
- Un champ qui change de sens = un nouveau champ ; l'ancien est lu en repli, puis retiré deux patchs plus tard.
- Transformation de données = migration idempotente dans `convex/migrations.ts`, ajoutée à `lanceurs/mettre-en-ligne-prod.cmd` ET `lanceurs/mettre-en-ligne-v2.cmd`, testée sur le staging (`rafraichir-staging-v2.cmd` pour repartir de données réelles).
- Vérif : `npm run test:server` (un seul fichier : `npx vitest run convex/<fichier>.test.ts`).
- Jamais `convex deploy` à la main : les lanceurs s'en chargent. Ne pas lire `convex/_generated/`.
