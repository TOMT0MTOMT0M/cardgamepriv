---
trigger: always_on
---

# Périmètre : ce que tu peux toucher (règle absolue)

Tu travailles dans le même dossier que Claude, qui commite en parallèle sur la branche `v2`.

- Tu ÉCRIS uniquement dans `donnees/**/a-integrer/` (crée le sous-dossier du chantier) et dans `.gemini-tmp/`
  (brouillons, téléchargements). Nulle part ailleurs.
- Tu LIS ce que tu veux pour comprendre, sauf les secrets : `.env*`, `.discord-bot-token`, `.feedback-key` —
  ne les ouvre jamais.
- Interdit : modifier `src/`, `scripts/`, `public/`, `convex/`, `lanceurs/`, `.wt-master/`, `.wt-hugo/`, `CLAUDE.md`,
  `AGENTS.md`, `.agents/`, les catalogues générés (`src/core/sets/*.ts`), les ids figés (`scripts/data/*-ids.json`).
- Interdit : toute commande git (status compris si elle écrit), `npm install`, les lanceurs `.cmd`, `npx convex …`,
  tout déploiement. Pas de serveur de dev laissé tournant.
- Ne lis pas en entier les gros fichiers : `src/core/sets/popculture.ts`, `sport.ts`, `monde.ts`, `jeuxvideo.ts`,
  `lolLines.ts` (35 000+ lignes), `docs/LAB_NOTES.md` — cherche dedans (recherche texte) ce qu'il te faut.
- Ignore `node_modules/`, `dist/`, `.cache/`, `archives/`, `sauvegardes/`, `imports/`, `logs/`.
