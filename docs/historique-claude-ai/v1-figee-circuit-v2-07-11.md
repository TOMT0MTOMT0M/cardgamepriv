# V1 figée + circuit V2 (07/11, soir)

## État
- **V1 = branche `master`, tag `v1.0`** (ex-`fix/retours-live-02`, avance rapide). Prod : `cardgamepriv.pages.dev` (Pages, branche `master`) + Convex `dev:wry-chicken-825` (`.env.local`) = base des joueurs.
- **Branche `v2`** = tout le nouveau travail. Lien admin `https://v2.cardgamepriv.pages.dev` (Pages, branche `v2`) + **projet Convex séparé `cardgamepriv-v2`** (`.env.v2.local`, mode Vite `v2`). Réservé à l'équipe (admin/modérateur), badge « V2 — test » en bas à droite.
- Mode d'emploi complet dans le dépôt : `docs/V2.md` ; restauration : `docs/V1.md`.

## Lanceurs (double-clic, journal `logs\`)
| Lanceur | Rôle |
|---|---|
| `push.cmd` | pousse toutes les branches + tags (le shell Claude n'a pas les identifiants GitHub) |
| `sauvegarder-v1.cmd` | export base (fichiers inclus) + archive code `v1.0` → `sauvegardes\v1\` |
| `creer-staging-v2.cmd` | **une fois** : projet Convex v2, `.env.v2.local`, variables copiées SAUF `DISCORD_WEBHOOK_URL` / `DISCORD_BOT_TOKEN`, import d'un export prod, modérateurs |
| `mettre-en-ligne-v2.cmd` | code → staging + migrations, tsc, build mode v2, images **nouvelles** → R2, Pages branche `v2`. Jamais la prod |
| `rafraichir-staging-v2.cmd` | re-importe un export prod frais dans le staging |
| `publier-patch.cmd` | contrôles → simulation → export base `sauvegardes\avant-patch-vX.Y-*.zip` → **PUBLIER** → fusion `v2`→`master` → `mettre-en-ligne-prod.cmd` (SANS_PAUSE) → commit artRev → tag → `v2` réalignée → push |
| `mettre-en-ligne-prod.cmd` | moteur prod ; demande OUI hors de `master` |

## Côté code
- `src/core/canal.ts` (CANAL, BUILD_ID, badge), `src/game/v2gate.ts` (écran « Réservé à l'équipe » si `ready && !user.staff`), `src/game/maj.ts` (sonde `/version.json` toutes les 3 min + au retour sur l'onglet → pastille « Mise à jour disponible · Recharger » ; `vite:preloadError` → un rechargement auto), `vite.config.ts` (plugin `versionJson`, `define __BUILD_ID__`, `BEBOU_SHA` passé par les lanceurs).
- `scripts/staging-v2.mjs init|refresh|deploy|name` : `convex dev --configure new` réécrit `.env.local` → sauvegardé/restauré autour, refus si le déploiement obtenu = prod.
- `scripts/r2-sync.mjs --nouvelles-seulement` : bucket R2 partagé → V2 n'envoie pas les images remplacées (elles attendent le patch).

## Règles de schéma Convex (rappel)
Champs optionnels seulement ; changement de sens = nouveau champ ; migration idempotente dans `convex/migrations.ts` ajoutée aux DEUX lanceurs de mise en ligne, testée sur le staging.

## À faire par Tom (une fois)
1. `push.cmd` ; 2. `creer-staging-v2.cmd` ; 3. portail Discord → OAuth2 → Redirects : `https://<staging>.convex.site/auth/discord/callback` ; 4. `mettre-en-ligne-v2.cmd`.

## Attention
Une autre session Claude commitait en parallèle sur `v2` dans le même dossier (commits `docs(V2)`, prototype silhouette floutée commité puis annulé) — deux sessions sur un même working tree = risque de mélange de commits.
