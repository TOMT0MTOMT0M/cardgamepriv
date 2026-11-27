# Ménage V3 (27/11) — contrats, report v2.1.34, textes des autocollants

Demande : Tom (équipe de 12 agents, lot `menage`). Branche `v3-menage` tirée de `v2` (`0260592`). Rien de visible pour les joueurs après le 01/12 (les contrats sont déjà retirés par v2.1.40).

## 1. Contrats : code CLIENT supprimé pour de bon
La V3 sort après le 01/12 0 h : tout ce qui ne servait qu'avant cette date côté client est parti.
- **Supprimé** : `src/game/views/contracts.ts` (page), `src/core/i18n/{fr,en}/game.views.contracts.ts` (textes `ct.*`) ; route `contrats` (`main.ts` : module, page, titre d'onglet, ordre des onglets, onglet allumé) ; onglet « Contrats » de la Collection ; `signContract` (`backend.ts`, `onlineBackend.ts`, `net/client.ts`, démo `localBackend.ts`) et `ecoLocal.hooks.onContract` ; `autoFill` (`core/contracts.ts`, n'était utilisé que par la page) ; CSS `.ct-*` / `.contracts` de `style.css` et `usinage.css` ; `.ct-sheet` de `MORPH_SEL` (`morph.ts`).
- **Branches datées simplifiées** (toujours « après le 01/12 ») : astuce de chargement (`boot.tip3b`), visite guidée (`gd.collDb`), Infos « Forge et marché », bouton Go d'une mission « contrat » / « doublons » → boutique, récap d'ouverture (plus de bouton « Contrats »), profil (ligne « Contrats signés » seulement si > 0, fil vide `pf.nothingMineB`), lien « N doublons · à forger » de la Collection → `#/collection/forge`.
- **Textes retirés** (FR + EN) : `title.contrats`, `boot.tip3`, `shop.contracts`, `plural.contrat possible`, `coll.contracts`, `gd.collD`, `pf.nothingMine`, `if.contractsForge`, `if.contract`, `if.contractA`, `if.contractNext`, `if.contractBody`. Changé : `coll.burn` « à brûler en contrat » → « à forger » / « to forge ».
- **Gardé** : `#/contrats` et `#/collection/contrats` → Forge (`route()`) ; tout `convex/` (les vieux onglets V2 appellent encore `contracts.sign`, refus daté `contracts.8`) ; `src/core/contracts.ts` (règles lues par `convex/contracts.ts` et ses tests) ; `economy.ts`, `cosmetics.ts`, `missions.ts`, `weekly.ts` (partagés avec le serveur : masquage daté des succès / cosmétiques « contrat » non gagnés, mission de la semaine du 30/11) ; vues `succes.ts` / `atelier.ts` (périmètre de l'agent `succes`, prévenu) ; textes `ach.contract-*`, `cos.*`, `pf.w.contracts`, `wk.contract`, `ms.contract`, `f.dContract`, erreurs `contracts.*` (succès gagnés, vieux fil d'activité, messages du serveur) ; `.ct-prot` (pastille des protections, utilisée par la Forge).
- **Décidé** : `@property --r` (style.css) gardé alors que l'animation qui l'animait (`burn-eat`) part : il est enregistré en `<percentage>` et `opening.ts` pose `--r` en px sur les éclats `op-fly` — le retirer changerait cette animation (aujourd'hui les éclats ne s'écartent probablement pas : valeur invalide → 0 %). À regarder dans un lot « ouvertures » si on veut les voir partir.
- Prévenus : `succes` (ce qui reste / part), `social` (3 lignes de `profile.ts`), `boosters` (récap de `shop.ts`).

## 2. Report v2.1.34 sur `v2` : déjà complet
- B (récap réserve vide → `boosterWays`, `shop.ts`), G (« Partager » du parrainage, `navigator.share` au doigt, `friends.ts`) et « −N » sur les pochettes « Presque finis » (`collection.ts`, `.al-miss`) : présents (report `d4d9978`, ancêtre de la branche).
- Note V3 : les points 🧭 et 👆 ne sont plus dans `updates.data.ts` / `updates.en.ts` (retirés par `d4d9978`) ; pas d'autre doublon avec la note v2.1.34. **Rien à changer** : les deux fichiers ne sont pas touchés.

## 3. Textes des autocollants des sachets : laissés dans `packSticker.ts`
- **Décidé : on les laisse** dans la table `TX` (FR / EN), commentaire mis à jour. Raisons : c'est du dessin calé à la main mot par mot (une traduction changée dans un dictionnaire déborderait sans alerte) ; la langue est un paramètre (`L`) — le labo 047 montre FR ou EN quelle que soit la langue de l'interface, alors que `t()` ne sert que la langue active et que le dictionnaire anglais n'est pas chargé sur un jeu en français ; le jeu passe déjà la langue du joueur (`gameSachetArt(…, lang())`). Pas dans un worker, pas de cache versionné (toile refaite à chaque chargement). Rendu inchangé. `sachets.md` (Reste) à jour.

## Vérifié
- `npm run typecheck` : OK ; `npm run check:i18n` : 0 ; `npm run test:server` : 54 fichiers, 320 tests verts (1 ignoré) ; un premier passage avait eu un délai dépassé sous charge dans `abo.test.ts` (vert seul, puis vert dans la suite complète).
- Démo (Chrome sans fenêtre, 390 px, port 5228) : `#/contrats` et `#/collection/contrats` → `#/collection/forge` ; onglets Collection : Cartes, Albums, Classeurs, Forge ; Tuto : section « Forge et marché » ; profil sans « contrat » ; aucune erreur console.

## À vérifier par Tom (lien V3)
- Collection : plus d'onglet Contrats ; « N doublons · à forger » mène à la Forge.
- Un ancien lien `#/contrats` arrive sur la Forge.
- Récap d'une ouverture de doublons seulement : « Ma collection » + « Forger ces doublons ».
