# Ouverture officielle — 07/11 (20 h)

## En place
- **Compte à rebours** plein écran « Ouverture dans 02h14 ». Tout le monde le voit sauf l'équipe (admin/modérateur). À zéro : « C'est ouvert » → fenêtre de création de compte. Lien discret « Accès équipe ».
- **Aucun compte ne peut être créé avant l'heure** (bloqué côté serveur, Discord comme pseudo).
- **Départ** : 15 boosters + recharge ×2 pendant 24 h (bulle « ×2 · 23h41 » sur la réserve). Tom et Hugo : boost compté depuis l'heure d'ouverture.
- **Places** : 30 (Tom et Hugo compris), `MAX_PLAYERS` pour changer. Pas de code du club.
- **Comptes sans Discord** : pseudo + mot de passe (scrypt, verrou 10 min après 8 essais). Mot de passe oublié → `npx convex run pwAuth:setPassword '{"name":"Léa","password":"…"}'`.
- **Visite guidée automatique** (une seule fois par compte) : un curseur (flèche PC / doigt mobile) fait seul le tour en ~30 s — réserve, boosters, collection, échanges, jeux, amis, missions, puis « Ouvre ton premier booster ». « Passer » à tout moment. Rejouer pour un joueur : `npx convex run admin:resetGuide '{"name":"tom"}'`. Aperçu sans rien marquer : ajouter `?guide` à l'adresse.
- **Bannir** : `npx convex run admin:ban '{"name":"pseudo","reason":"multi-comptes"}'` — sessions fermées, reconnexion refusée (même Discord / même pseudo / même appareil pour un nouveau compte pseudo), caché du classement et des listes, place libérée, échanges/annonces/amitiés annulés. `admin:unban`, `admin:bans` pour la liste. L'équipe ne peut pas être bannie.
- **Roulette** : à la fin du reset, pot de base de 3 000 pièces + une carte 6★ offerte (en plus de la carte du site). À la main : `npx convex run games:seedRouletteCmd '{"coins":3000}'`.
- **Remise à zéro** (`launch:resetAll`) : simulation d'abord, puis RESET. Supprime tous les joueurs sauf Tom et Hugo (remis à neuf). Garde suggestions et retours du labo.
- **Bot Discord** (« card », serveur Les Bébous) : MP à la 1re connexion Discord (une fois) avec le lien de parrainage et les avantages. Jeton dans le fichier local `.discord-bot-token` (ignoré par git, jamais publié). Droits : Gérer les messages + épingler (accordés le 07/11).
- **Annonce Discord** (`scripts/annonce-discord.mjs`, aussi seul via `lanceurs/annonce-discord.cmd`) : vide entièrement #bebou-card, y poste l'annonce @everyone (épinglée), puis la poste dans #discussion💬. Sans `--go` : simulation (salons trouvés, nb de messages, droits du bot).
- **Mises à jour** : le post V1 (daté du 7 nov.) annonce la saison 1, les 15 boosters + ×2 et le pot de la roulette.

## Ce soir, dans l'ordre
0. (Facultatif, pour verrouiller tout de suite sans reset) `lanceurs/verrouiller.cmd` → modérateurs + heure 20 h. Déverrouiller : `npx convex run launch:setLaunch "{\"at\":null}"`.
1. Avant 20 h, double-clic **`lanceurs/ouverture.cmd`** — tout en un :
   sauvegarde → envoi des fonctions → modérateurs → heure 20 h (verrouillage) → simulation du reset **et** de l'annonce Discord → vérifier (Hugo dans les « gardes », les deux salons) → taper **RESET** →
   remise à zéro → jeton du bot + MP de test à Tom → vidage de #bebou-card + annonce @everyone dans #bebou-card et #discussion.
2. `mettre-en-ligne-prod.cmd` si le site n'est pas déjà à jour.
3. Vérifier : MP de test reçu, annonce dans les deux salons. Sinon lire `logs\ouverture.log` ; annonce seule : `lanceurs/annonce-discord.cmd` ; MP seul : `npx convex run discordBot:testDm '{"name":"tom"}'`.
4. Tom et Hugo : ne pas ouvrir de boosters avant l'heure (numéros #1, avance). Si vous testez, relancez le reset juste avant l'ouverture.
5. Juste après l'ouverture : créer un compte pseudo de test depuis un autre téléphone, ouvrir un booster, puis `admin:ban` sur ce compte.

## Bot Discord — mise en place (fait le 07/11)
1. https://discord.com/developers/applications → application du jeu, onglet **Bot** → Reset Token → jeton dans `.discord-bot-token`.
2. Invité sur Les Bébous, droits mis à jour avec : `https://discord.com/oauth2/authorize?client_id=1566437956212752414&scope=bot&permissions=2251799813693440`.
3. Si le MP n'arrive pas : paramètres de confidentialité du serveur → « messages privés des membres » autorisés. Le script d'annonce connecte le bot une fois au gateway (requis pour un bot neuf).
4. Nouveau jeton (si reset du jeton) : remplacer le contenu de `.discord-bot-token`, puis `npx convex env set DISCORD_BOT_TOKEN <jeton>`.

## Retour arrière si ça tourne mal
- Base : `npx convex import --replace-all sauvegardes\avant-ouverture-XXXX.zip` (vérifier l'option avec `--help`).
- Site : Cloudflare Pages → projet cardgamepriv → Deployments → déploiement précédent → Rollback.
- #bebou-card : les messages effacés ne reviennent pas.

## Message d'annonce (Discord, posté par le bot)
> @everyone
> 🎴 **Bébou Cartes ouvre ce soir à 20 h !**
> 👉 https://cardgamepriv.pages.dev/jeu/
> Connexion avec Discord **ou** un simple pseudo. Tout le monde part de zéro : **15 boosters offerts** + recharge **×2 pendant 24 h**, et la roulette démarre avec un pot de base.
> Invite tes potes avec ton lien (onglet Amis) : 10 boosters pour eux, 10 pour toi.
> 📱 iPhone : ouvre le lien dans Safari → Partager → « Sur l'écran d'accueil » pour l'avoir en plein écran comme une appli.
> 30 places max.

## Vérifié
tsc (site + convex) OK · 92 tests serveur OK (dont reset, blocage avant l'heure, pseudo, verrou, MP unique, recharge ×2, ban, pot de roulette, visite guidée) · build OK · rendus vérifiés (mobile + PC) : compte à rebours, connexion, bulle ×2, visite guidée de bout en bout (~30 s) · simulation de l'annonce Discord OK (Les Bébous, #discussion💬, #bebou-card 76 messages, droits du bot OK).
