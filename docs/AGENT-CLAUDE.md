# Agent Claude (clé API de Tom, 100 $/mois)

Ce que l'abonnement Claude Code fait mal : traiter des **milliers de cartes d'un coup** (API Batch, −50 %) et des **audits qui tournent seuls**. Les sessions normales (enquête, refonte, tests) restent sur l'abonnement.
**Lecture seule** : l'agent ne touche ni au jeu, ni à Convex, ni à R2. Il écrit des rapports dans `docs/rapports-agent/` (versionnés : Tom et Hugo voient les mêmes). Un humain valide, puis une session Claude Code applique.

## Mise en place (une fois, sur le PC qui lance l'agent)
1. Console Anthropic → **Limits** : limite de dépense mensuelle à **100 $** (le vrai garde-fou).
2. `.env.local` (racine) : ajouter `AGENT_CLAUDE_KEY=sk-ant-...`. **Jamais** de variable Windows `ANTHROPIC_API_KEY` (Claude Code facturerait les sessions sur l'API, cf. `GUIDE-CLAUDE.md`).
3. Facultatif : `AGENT_BUDGET_MOIS=90` (plafond de l'agent, 90 $ par défaut). Le registre `docs/rapports-agent/depenses.json` est commun aux deux PC : pousser après chaque usage.

## Utilisation
`lanceurs\agent-claude.cmd` (menu) ou `npm run agent -- <tâche>`. **Sans `--go` : estimation seulement**, rien n'est dépensé. `--max N` limite le nombre de cartes, `--plafond N` relève le plafond de la tâche.

| Tâche | Ce qu'elle fait | Modèle | Coût estimé (26/11) | Sortie |
|---|---|---|---|---|
| `images` | La photo montre-t-elle le bon sujet ? (homonyme, filigrane, capture, floue, coupée, placeholder) + basse résolution et fichier absent sans IA. Incrémental : une carte n'est recontrôlée que si son fichier change (ré-illustration). | Haiku 5.5 vision, Batch | ~1,5 $ pour les 41 000 cartes | `images-*.csv` |
| `cadrage` | 5★/6★ carrées ou horizontales absentes de `faceFocus.json` (pochettes, objets, monuments) : point focal + « plein écran oui/non ». | Sonnet 5.5 vision, Batch | ~2,5 $ (1 159 cartes) | `cadrage-*.json` (format `faceFocus.json`) + `.csv` |
| `catalogue` | Rareté incohérente (prisme occidental), doublons, mauvaise famille, orthographe. | Sonnet 5.5, Batch | ~3,5 $ | `catalogue-*.csv` |
| `traduction` | Noms anglais de `CATALOG_EN` : mauvais article Wikipédia, contresens, titre traduit à tort. | Sonnet 5.5, Batch | ~0,5 $ (7 200 noms) | `traduction-*.csv` |
| `convex` | Audit des quotas (I/O 40 GB pour 1 GB) : lit `npx convex insights --prod` (lecture seule) + le code, classe les causes avec I/O estimée et lots proposés. | Opus 5.5 + outils de lecture | plafond 10 $ | `convex-AAAA-MM-JJ.md` |
| `perf` | Audit perf mobile : build réel (tailles), dernières mesures `scripts/mesure`, lecture du code ; lots classés par gain ressenti. | Opus 5.5 + outils de lecture | plafond 10 $ | `perf-AAAA-MM-JJ.md` |
| `suivre` | Récupère les lots terminés (souvent < 1 h, 24 h max), calcule le coût réel, écrit les rapports. | — | — | — |
| `etat` | Dépenses du mois par tâche, lots en cours. | — | — | — |

Pour `convex`, on peut coller le relevé du tableau de bord **Usage** de Convex (par fonction) dans `docs/rapports-agent/convex-usage.txt` avant de lancer : l'audit sera plus précis.

## Rythme conseillé (≈ 20-35 $/mois)
- 1re fois : `images`, `catalogue`, `traduction`, `cadrage`, `convex`, `perf` (≈ 30 $ au plus).
- Après chaque patch d'images : `images` (seulement les nouvelles, quelques centimes).
- Chaque mois : `convex` (vérifier que l'I/O baisse) et `perf` après un lot de perf.

## Après un rapport
- CSV : s'ouvre dans Excel (séparateur `;`). Hugo trie ; les corrections passent par `donnees/`, `curation.ts` ou `scripts/reillustrer.py`, jamais dans les fichiers générés.
- Cadrage : vérifier à l'œil, puis une session fusionne dans `src/core/art/faceFocus.json` et monte `bebou-cartes-vN`.
- Audits : une session Claude Code prend un lot à la fois, **mesure avant / après**, un commit par lot.

## Fichiers
`scripts/agent/agent.mts` (tâches) · `lib.mts` (clé, prix, budget, Batch, CSV) · `audit.mts` (boucle Opus, outils `lister` / `lire` / `chercher`, secrets et dossiers générés exclus).
Données envoyées à Anthropic : images et noms des cartes, code source, insights Convex. **Aucune donnée de joueur.**
