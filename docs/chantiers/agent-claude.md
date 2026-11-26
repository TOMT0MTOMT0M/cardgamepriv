# Agent Claude sur la clé API de Tom (26/11/2026, Hugo + Claude)

## Fait (`42c5c21`, branche `v2`)
- Tri des idées : ce qui existait déjà (`check:images`, YuNet / `faceFocus.json`, purge des placeholders du 08/11, `make-catalogue-en.py`, `scripts/mesure`, `controle-joueurs.mjs`, `pull-feedback.mjs`) n'est pas refait. L'API sert au traitement en masse (Batch −50 %) et aux audits automatiques ; le reste sur l'abonnement.
- `scripts/agent/` (`agent.mts`, `lib.mts`, `audit.mts`), `npm run agent -- <tâche>`, `lanceurs/agent-claude.cmd` (menu), `docs/AGENT-CLAUDE.md`. Dépendance de dev `@anthropic-ai/sdk`.
- Tâches : `images` (Haiku 5.5 vision, 41 029 cartes, incrémental), `cadrage` (Sonnet 5.5, 1 159 5★/6★ sans visage connu → format `faceFocus.json`), `catalogue` (Sonnet), `traduction` (Sonnet, 7 208 noms EN), `convex` et `perf` (Opus 5.5 + outils de lecture seule ; insights de la prod), `suivre`, `etat`.
- Garde-fous : estimation seule sans `--go` ; plafond par tâche ; plafond mensuel 90 $ (`AGENT_BUDGET_MOIS`) dans `docs/rapports-agent/depenses.json` commun aux deux PC ; refus de relancer une tâche dont un lot est en cours ; secrets et dossiers générés illisibles pour l'audit ; aucune donnée de joueur envoyée.

## Vérifié
- `npm run typecheck` OK ; typecheck des scripts de l'agent OK ; toutes les tâches à blanc ; préparation des images (sharp, ~170 tokens / image) ; `npx convex insights --prod --json` lit bien la prod.
- Estimations à blanc : images 1,4 $, cadrage 2,4 $, catalogue 3,4 $, traduction 0,4 $, audits ≤ 10 $ chacun.
- Pas testé : un vrai appel API (pas de clé ; `--go` bloqué par sécurité pendant la session).

## À vérifier par Tom
- Limite 100 $ dans la console Anthropic ; clé dans `.env.local` sous `AGENT_CLAUDE_KEY`.
- 1er lancement : `agent-claude.cmd` → 7 (Convex), lire `docs/rapports-agent/convex-*.md` ; puis 8 (perf). Si erreur au 1er appel, coller `logs\agent-claude.log` dans une session.

## Reste
- [ ] Lancer images / catalogue / traduction / cadrage, puis `suivre` ; Hugo trie les CSV.
- [ ] Appliquer les lots des audits Convex et perf (une session par lot, mesure avant / après).
- [ ] Cadrage validé à l'œil → fusion dans `faceFocus.json` + monter `bebou-cartes-vN`.
