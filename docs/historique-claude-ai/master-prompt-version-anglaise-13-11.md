Version anglaise complète de cardgamepriv, sur `v2`. Lis d'abord le doc projet `claude/audit-traduction-anglaise-13-11.md` et les inventaires `.claude-tmp/i18n-inventaire-textes.csv` (chaque texte avec fichier et ligne) et `.claude-tmp/i18n-inventaire-cartes.csv` (40 322 cartes). Respecte CLAUDE.md (schéma en `v.optional`, migrations idempotentes, jetons `motion.ts`, DA usinage, aucun coût en plus, un commit par lot).

## Règle de langue
- Français si la langue de l'appareil (`navigator.languages[0]`, sinon `navigator.language`) vaut `fr`, `fr-FR`, `fr-BE` ou `fr-CH`, sans tenir compte des majuscules. Sinon : anglais. La liste est une constante unique dans `src/core/i18n.ts`.
- Le choix manuel passe avant tout : enregistré dans `localStorage` (`bebou.lang`) et sur le compte (`users.lang`, `v.optional`). Le client envoie la langue effective au serveur à la connexion et à chaque changement. Le serveur s'en sert pour les push et les messages privés Discord.
- Sélecteur : dans l'en-tête, collé au bouton du son (`snd-wrap`, `src/game/main.ts` ~l.444), même taille et même style. C'est une pastille `FR | EN`, Inter en capitales, la langue active en blanc, sans icône ni drapeau. Le changement s'applique tout de suite, sans recharger, s'il n'y a pas d'ouverture en cours (sinon à la fin de l'ouverture). Il change aussi `<html lang>` et `document.title`.
- Pour tester : `?lang=en` / `?lang=fr` force la langue.

## Socle
- Un `t(clé, params)` fait maison, sans bibliothèque, avec `fr.ts` / `en.ts` typés : une clé manquante casse `typecheck`.
- Pluriels avec `Intl.PluralRules`. Dates, nombres et tris avec la locale active (remplacer les 44 `fr-FR` / `'fr'`). Garder l'heure de Paris pour la roulette, les missions et les saisons.
- Le paquet anglais n'est chargé qu'en anglais. Mesure la taille du bundle et le temps d'arrivée sur la boutique avant et après : en français, rien ne doit bouger.

## Lots, dans cet ordre
1. **Socle + sélecteur + règle de langue.**
2. **Interface joueur** : tout `src/game` et la partie jeu de `src/core` (vues, toasts, guide, infos, sécurité, sondage, succès, missions, défis, cosmétiques, mode démo `localBackend.ts`), plus les attributs (`aria-label`, `title`, `placeholder`) et les 6 `content:` du CSS. Les ~340 pluriels faits main et les phrases à variables deviennent des messages avec paramètres.
3. **Texte dessiné** : booster (`pack.ts`), raretés (`rarity.ts`), `jvTitle.ts`, dos et designs de cartes, `opening.ts`, titres des scènes 6★ (`src/game/mythic/scenes/*`). Le cache des cartes peintes doit avoir la langue dans sa clé. Recontrôle que chaque titre tient dans l'écran.
4. **Serveur** : les erreurs `ConvexError` deviennent des codes + paramètres, traduits par `errMsg`. `activityFeed` et `coinTx` stockent un type + des paramètres (champs optionnels), et l'affichage prend le nom de carte dans le catalogue via `cardId`. Ajoute une migration idempotente qui convertit les anciennes lignes reconnues ; les autres restent telles quelles. Push et messages privés Discord dans la langue du joueur. Le salon Discord commun reste en français. Champs `nameEn` / `blurbEn` optionnels pour les boosters du moment, à remplir dans le dashboard admin. L'admin et le labo restent en français.
5. **Catalogue anglais** : un fichier `*.en.ts` par set, généré par les scripts `make-*` (colonne `EN` ajoutée aux sources). Les ids ne changent jamais.
   - Pokémon : noms officiels anglais (PokéAPI). LoL : Data Dragon `en_US` via le slug. Valorant : valorant-api `en-US` via l'uuid. CS : rien à faire.
   - Pop et Sport : titre anglais de Wikipédia via les liens fr→en, sinon le nom actuel. Chansons, albums et artistes restent en version originale.
   - World, Jeux vidéo, 1 345 sous-thèmes, 90 types, 26 groupes : traduits par toi.
   - Toute traduction incertaine part dans `donnees/suivi/traduction-a-verifier.xlsx` (id, FR, EN proposé, raison) pour Tom et Hugo.
   - La recherche de cartes trouve les deux langues.
6. **Images** : captures anglaises des 14 Merveilles (`outils/capture-merveilles.ts`), dans un dossier `en/` choisi selon la langue. Manifest, `404.html` et `sw.js` dans les deux langues quand c'est possible. L'aperçu de lien (`og:`) reste en français : il n'y en a qu'un par page.
7. **Textes longs** : les notes de patch `updates.data.ts` (toutes), le guide et la visite.
8. **Tests** : les tests vérifient des codes, plus des phrases. Ajoute un test qui échoue s'il manque une clé en anglais. Ajoute un script `npm run check:i18n` qui re-scanne le code (même méthode que l'inventaire) et liste tout texte français resté en dur côté joueur.

## Vérifier avant de dire « fait »
- `npm run typecheck`, `npm run test:server`, `npm run build`, `npm run check:i18n` : 0 reste côté joueur.
- Sur téléphone, en `?lang=en` puis `?lang=fr` : boutique, ouverture (dont une 6★), collection, échanges, jeux, profil, chat, notifications. Après 3 essais de vérification visuelle bloqués, arrête-toi et dis à Tom quoi regarder.
- Compte rendu dans un seul doc projet, `claude/version-anglaise.md` (1 page, mis à jour à chaque lot) : lots faits, reste à faire, ce que Tom doit tester, lanceurs à lancer et dans quel ordre (`lanceurs\mettre-en-ligne-v2.cmd` pour le V2). Ne lance jamais la prod.
- Si le contexte se remplit, finis le lot en cours, commite, mets le doc à jour : la session suivante repart de ce doc.
