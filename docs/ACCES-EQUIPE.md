# Accès de l'équipe — Tom et Hugo à égalité (07/11)

## Dans le jeu (automatique)
`admin:setModerators` (lancé à chaque mise en ligne, prod et V2) donne aux comptes **tom** et **hugo** les deux
drapeaux : `isModerator` (file des suggestions) **et** `isAdmin` (onglet Admin des jeux, alertes anti-abus, forge,
accès équipe au lien V2, passage du compte à rebours). Les commandes `npx convex run admin:*` (donner des cartes,
pièces, bannir…) marchent depuis n'importe quel PC connecté au projet Convex (point 2).

## Comptes à partager (à faire par Tom, une fois, dans chaque tableau de bord)
| Service | Où | Quoi donner à Hugo |
|---|---|---|
| **GitHub** (code) | github.com/TOMT0MTOMT0M/cardgamepriv → Settings → Collaborators → Add people | rôle **Admin** (ou Write) |
| **Convex** (base, fonctions, variables) | dashboard.convex.dev → équipe `gamersardechois` → Settings → Members → Invite | rôle **Admin** — donne la prod ET le staging V2 |
| **Cloudflare** (site Pages + images R2) | dash.cloudflare.com → Manage Account → Members → Invite | **Super Administrator** (ou Administrator) |
| **Discord** (application OAuth + bot) | discord.com/developers → Teams → créer une équipe, y ajouter Hugo ; puis l'application → General Information → Team → transférer à l'équipe | membre **Admin** de l'équipe |
| **Jeton du bot Discord** | fichier local `.discord-bot-token` | à lui passer en privé (jamais dans git) |

## Le PC de Hugo (pour lancer les lanceurs lui-même)
1. `git clone https://github.com/TOMT0MTOMT0M/cardgamepriv.git` puis `npm install` ;
2. `.env.local` : copie de celui de Tom (`sauvegardes\v1\env-local-v1.txt` — contient le jeton R2, à passer en privé) ;
3. `.feedback-key` et `.discord-bot-token` : copies des fichiers de Tom (en privé) ;
4. `npx convex login` et `npx wrangler login` (avec SES comptes, une fois invités ci-dessus) ;
5. pour le lien V2 : `.env.v2.local` (copie de celui de Tom) — `creer-staging-v2.cmd` n'est PAS à relancer.
Ensuite les mêmes lanceurs : `mettre-en-ligne-v2.cmd`, `publier-patch.cmd`, `push.cmd`, `donner-*.cmd`…
Un seul à la fois sur la prod : se prévenir avant `publier-patch.cmd`.
