# Outils : lanceur Claude (LABO Fable supprimé)

> 26/11 après-midi : sur demande de Tom, le LABO Fable est supprimé — `outils/labo/`, bouton du lanceur, lignes `.gitignore` et `GUIDE-CLAUDE.md`. Les mentions LABO ci-dessous sont historiques.

_26/11/2026 — Tom + Claude, racine / `v2`, commit `aa785f9`._

## Fait
- `LANCEUR-CLAUDE.cmd` ouvre `outils/lanceur-claude.vbs` (nouveau), qui lance `lanceur-claude.ps1` sans console : plus de fenêtre vide dans Windows Terminal.
- `outils/lanceur-claude.ps1` : fonction commune `Ouvrir-Terminal` (wt.exe, sinon cmd.exe), journal `logs/lanceur-claude.log` (ouverture, boutons, erreurs). Le bouton LABO s'ouvre dans `outils/labo`.
- `outils/labo/LABO.cmd` : titre de fenêtre, journal `logs/labo-demarrage.log`, message à la fermeture.
- `outils/labo/labo.mjs` : lit `CLAUDE_LABO_WORKSPACE_ID` (facultatif) dans `.env.local` et envoie l'en-tête `anthropic-workspace-id`, nécessaire avec une clé d'organisation.
- `.gitattributes` : `.cmd`, `.bat`, `.ps1`, `.vbs` toujours en CRLF.

## Vérifié
- Commit et push sur `v2` après un pull des 24 commits de Hugo. Rien n'a été lancé en vrai.

## À vérifier par Tom
- Double-clic sur `LANCEUR-CLAUDE.cmd` : la fenêtre à boutons s'ouvre, sans console vide.
- Le bouton LABO démarre le chat. En cas d'échec : `logs/labo-demarrage.log` et `logs/lanceur-claude.log`.

## Reste
- [ ] Commit à part `git add --renormalize lanceurs/` : depuis `.gitattributes`, les `.cmd` de `lanceurs/` paraissent modifiés (fins de ligne seulement), chez Tom comme chez Hugo.
- [ ] Supprimer l'entrée « autostash » de `git stash` (sans contenu utile) quand Tom le décide.
