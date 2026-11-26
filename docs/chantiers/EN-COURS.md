# En cours — fichier de passation

Lu au début de chaque session (règle de CLAUDE.md), réécrit à la fin par `/cr`. Une page max.
_Mis à jour : 26/11/2026 (Hugo : liste des licences à étoffer, `9eae34f` ; avant : agent Claude sur la clé API de Tom poussé, `42c5c21` ; avant : liste QOL validée — collection + audit de tous les onglets, idée Forge → vente, contrats à retirer et enchères en V3 ; avant : dossier racine resynchronisé, reste local `outils/labo/` supprimé ; Tom : labo refait, v2.1.20 en ligne, LABO Fable + branches labo/nuit-v3 supprimés, prompt Gemini « nouveau thème » relu ; avant : lanceur Claude + LABO poussés, v2.1.19, Convex au-dessus de l'offre gratuite)._

## Chantiers ouverts

| Qui | Dossier / branche | Chantier | État |
|---|---|---|---|
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.10 : labo prod = labo complet (046 sachets cartoon) ; plus de labo sur le lien V2 (racine → `/jeu/`) | en ligne (tag `v2.1.10`, `5f5a4df` ; v2 `e08b146`) — `docs/chantiers/v2.1.10.md` |
| Tom + Claude | `.wt-master` / `master` | patch v2.1.11 : récompenses de saison 0 + pity anti-spoil | en ligne (tag `v2.1.11`, `52cfd6e` ; v2 `a0eb9ca`) — `docs/chantiers/v2.1.11.md` |
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.12 : images (353 + 159), musiques 6★, famille France | en ligne (tag `v2.1.12`, `40bd36e` ; v2 `73b61aa`) — `docs/chantiers/v2.1.12.md` |
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.14 : 53 6★ à photo carrée en plein écran centré sur le visage ; onglet Événement grisé sur le live jusqu'au 01/12 | en ligne (tag `v2.1.14`, `3e12cca`) — `docs/chantiers/v2.1.14.md`. Grisage = live seulement (pas reporté sur `v2`) |
| Hugo + Claude | `.wt-master` / `master` | patchs v2.1.15 et v2.1.16 : 5★ (615) et 6★ (61 de plus) à photo horizontale en plein écran sur le visage | en ligne — `docs/chantiers/v2.1.15.md`, `v2.1.16.md` |
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.17 : les 14 Merveilles du monde en 6★ ordinaires (Monde + Bebou Pack) | en ligne (tag `v2.1.17`, `f45898b` ; v2 `124e921`) — `docs/chantiers/v2.1.17.md` |
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.18 : photos de profil importées visibles partout | en ligne (tag `v2.1.18`, `62ba326` ; v2 `694aac4`) — `docs/chantiers/v2.1.18.md` |
| Tom + Claude | `.wt-master` / `master` | patch v2.1.13 : calendrier de l'Avent (95 boosters, 13 000 pièces, 9 cosmétiques de Noël par case, God Pack le 24, étoile refaite) | en ligne (tag `v2.1.13`, `1faee0e` ; v2 `b2dd383`) — `docs/chantiers/v2.1.13.md` |
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.19 : texte du Portefeuille corrigé | en ligne (tag `v2.1.19`, `b99fb79` ; v2 `89b189e`) — `docs/chantiers/v2.1.19.md` |
| Tom + Claude | `.wt-master` / `master` | patch v2.1.20 : labo refait (archives 001-038 + bouton ⤓/⤒, onglets, recherche, vignettes, menu ⚙, `npm run labo:new`) ; jeu inchangé, pas de note de patch | en ligne (tag `v2.1.20`, `72534f8` ; v2 `e7cebc7`) — `docs/chantiers/v2.1.20.md` |
| Tom + Claude | racine / `v2` | outils : lanceur Claude sans console vide (`.vbs`), journal, `.gitattributes` CRLF ; LABO Fable supprimé le 26/11 (outil + bouton) | poussé, pas testé en vrai — `docs/chantiers/outils-lanceur.md` |
| Hugo + Claude | racine / `v2` | outils : agent Claude sur la clé API de Tom (100 $/mois) — images, cadrage, catalogue, traductions (Batch) + audits Convex et perf mobile, lecture seule, rapports dans `docs/rapports-agent/` | poussé (`42c5c21`), testé à blanc, attend la clé — `docs/chantiers/agent-claude.md` |
| Tom + Claude | racine / `v2` | V3 : titres uniques, roulette, abonnement, succès, sachets par thème, marché | en cours |
| Hugo + Claude | racine / `v2` | QOL : liste validée (section « QOL » ci-dessous), rien de codé | à démarrer par collection 1-2-3 — `docs/chantiers/qol.md` |
| Hugo | son dossier | contenu des cartes (base Etoiles) | — |
| Hugo + Claude | racine / `v2` | contenu : licences à étoffer / scraper (liste dans « Reste à faire ») | listé (`9eae34f`), rien de généré — `docs/chantiers/licences.md` |

## Reste à faire
### Avant / au 01/12
- [ ] Avent : onglet Événement grisé sur le live (v2.1.14) → à rouvrir pour le 01/12 (retirer `nav-off` + renvoi dans `route()` de `main.ts`, patch sur master) ; la note v2.1.13 annonce déjà l'onglet
- [ ] 01/12 : vérifier en ligne la clôture de la saison 0 (cron horaire) : récompenses, titres, God pack du 1er
- [ ] Avent (en ligne v2.1.13) : Tom vérifie sur téléphone — étoile, cases 21/23, Chapeau de Noël, bannières, animations de profil, éclat des 2 ouvertures ; le 01/12 ouvrir la 1re case en vrai

### Version en ligne
- [ ] IMPORTANT — Convex au-dessus de l'offre gratuite. Prod au 26/11 (mois) : Database I/O 40,6 GB pour 1 GB inclus ; appels 675 k / 1 M ; egress 1,23 GB pour 1 GB. Le 26/11 (jour, partiel) : 0,17 GB. À faire : offre Free (écritures bloquables) ou Starter (facturé) ? et trouver ce qui consomme l'I/O (`npx convex deployment usage`, `npx convex insights` : conflits sur `purgeCards` / `remapCards`, relancées à la mise en ligne — piste non vérifiée)
- [ ] v2.1.19 : vérifier à l'écran le texte du Portefeuille
- [ ] v2.1.20 : Tom vérifie le labo en ligne (onglets, ⤓/⤒, vignettes, menu ⚙, téléphone) (Hugo a récupéré le code le 26/11)
- [ ] Nouveau thème via Gemini (prompt de Hugo relu le 26/11 : colonnes `N° | Sous-thème | Carte | Type | Étoiles finales | Score notoriété | Image URL`, URL d'images vérifiées ou vides, retraits Bruel / Ménès / Depardieu) : joindre la liste des cartes existantes (nom + thème) pour l'unicité
- [ ] Licences : étoffer les licences existantes (plus de cartes par licence) et en scraper davantage — sources dans `donnees/`, puis régénérer par `scripts/make-*.py` (ids figés, curation à préserver)
  - Jeux vidéo : Final Fantasy, Dragon Quest, Digimon, World of Warcraft, Warhammer, Zelda, Yu-Gi-Oh
  - Mangas / animés : Blue Lock, Demon Slayer, Détective Conan, Eyeshield 21, Haikyu, My Hero Academia, Seven Deadly Sins, Sailor Moon, Solo Leveling, Sword Art Online, Tokyo Ghoul
  - Pop culture : films DC, Harry Potter, Transformers
  - Sport : échecs, tennis de table, rallye
  - Monde : Ardèche (plus de villes et villages), dinosaures et préhistoire
  - Dessins animés : trop peu de cartes par thème et mal triés → proposer un système de familles pour certains
- [ ] Images : sans fichier = Leo 5★ et Jubelle (Summoners War), Coiffe Kitsou, Tinky Winky 6★ (les autres 5★/6★ sont servis par le site, vérifié le 26/11)
- [ ] God pack ouvert dans un ×10 : l'animation peut tomber sur le mauvais morceau (cartes correctes) — mineur, `spreadSeries` dans `shop.ts`
- [ ] Admin : destinataire Wero à saisir dans `/admin/` (bientôt)

### Outils
- [ ] Tom : tester `LANCEUR-CLAUDE.cmd` (pas de console vide) ; retirer à la main `CLAUDE_LABO_*` de `.env.local` (LABO supprimé) — Hugo aussi, s'il les avait
- [ ] Agent Claude (Tom, ce soir) : limite 100 $ dans la console Anthropic, `AGENT_CLAUDE_KEY=` dans `.env.local` (JAMAIS `ANTHROPIC_API_KEY` en variable Windows), puis `lanceurs\agent-claude.cmd` → 7 Convex, 8 perf, puis 3-6 et le lendemain 2 (suivre). Rapports Convex / perf → une session par lot, mesuré avant / après. Mode d'emploi : `docs/AGENT-CLAUDE.md`
- [ ] Commit à part `git add --renormalize lanceurs/` (les `.cmd` paraissent modifiés depuis `.gitattributes`, fins de ligne seulement)

### V3
- [ ] **Rework économie** (validé par Hugo le 26/11, rien de codé) — détail et chiffres : `docs/chantiers/economie.md`
  - Constat : Forge et pièces d'ouverture grandissent avec les boosters ouverts (presque gratuits : 1 / 5 min), le reste est fixe et petit. Revenu estimé par jour : petit joueur ≈ 2 400 (calendrier = 10 %), régulier ≈ 8 800, gros ≈ 21 700 (calendrier = 1 %). Roulette 1 000 = 0,4 jour d'un petit joueur, rien pour un gros
  - Étalon unique : 1 booster = 250 pièces (`PACK_PRICE`) ; tous les prix et récompenses en multiples, calculés à un seul endroit (`economy.ts`)
  - Forge dégressive par jour (heure de Paris), pièces d'ouverture comprises : 100 % jusqu'à 3 000, 50 % jusqu'à 10 000, 25 % au-delà ; écran Forge « rendement plein encore X pièces aujourd'hui » ; compteur du jour sur le joueur (`v.optional`)
  - Connexion quotidienne relevée : jour 1 = 250, +20 / jour (jour 29 = 810), ×2 aux jours 7/14/21, jour 30 = 2 000 + 51 boosters ; mois parfait ≈ 18 900 au lieu de 7 050
  - Roulette inchangée (1 000 / 2 000), mais mise en cartes alignée : 1 000 = 1× 6★ = 3× 5★ (au lieu de 2)
  - Marché : prix conseillé = 1,5× la valeur de Forge (sert à Forge → vente) ; plafond 10× inchangé
  - Garde-fou conservé : un booster rend ≈ 190 (Forge ≈ 162 + pièces ≈ 30) < 250, pas de boucle acheter → forger → racheter
  - Avant de coder : mesurer les vrais revenus par joueur (une requête en lecture, avec Tom, Convex au-dessus de l'offre gratuite) ; valider avec Tom les seuils 3 000 / 10 000, le calendrier et les 3× 5★ ; note de patch FR + EN, `npm run test:server`
- [ ] Profils : revoir le visuel, mieux aligner les polices, régler le mélange bannière / GIF
- [ ] Packs événement : 7 j, 1/h, réserve propre 3 (5 abonné), 2 500 pièces ; consommer SA réserve (prend un booster normal aujourd'hui) ; collection Télé + booster de lancement
- [ ] Succès : ouvertures à gagner avec aperçu, paliers plus longs, récompenses proportionnelles (pièces, boosters, titres, cosmétiques) ; nouveaux cosmétiques nécessaires → les demander à Tom
- [ ] Sachets par thème : piste « Case de BD » choisie le 25/11 ; Tom la retouche dans Photoshop → EN ATTENTE de ses fichiers, puis vignettes, roue 3D, booster du moment
- [ ] Marché « façon Kyara » (captures reçues, brief : `docs/chantiers/marche-kyara.md`) ; passe « moins de texte » Marché / Échanges / Jeux (Pack Battle, Battle Royale : mêmes règles, plus visuels)
- [ ] Roulette : toucher le pot = carte en grand, couleurs dans le replay
- [ ] Ouvertures : retirer Brûlure, Éventail et les autres ; on garde la Déchirure + les 2 de Noël, et on AJOUTE 5 nouvelles ouvertures à gagner (décision Tom 26/11 ; la branche nuit-v3 du LABO Fable a été supprimée)
- [ ] Notifications : « ta série est en danger » + tirage de la roulette
- [ ] Contrats : mécanique à retirer ou refondre (Hugo 26/11) — plus rentable que vendre ou échanger, donc personne ne vend ni n'échange. Doublons = forge ou vente, c'est tout. Pas de QoL sur les contrats d'ici là. Retrait propre : contrats en cours remboursés ou laissés finir sans nouveaux, migration Convex idempotente (`convex/migrations.ts`, testée sur le staging), note de patch FR + EN
- [ ] Marché : enchères possibles sur une carte (en plus du prix fixe) — APRÈS Forge → vente (qui pose le « mettre en vente vite ») ; clôture à heure fixe par tâche programmée Convex, offre minimum, pièces bloquées pendant l'enchère

### QOL (validé par Hugo le 26/11 ; rien de poussé)
Collection (`src/game/views/collection.ts`) — ordre conseillé : 1, 2, 3 d'abord (front seul, zéro coût Convex)
- [ ] 1. Recherche unique : la barre des albums cherche dans les 5 thèmes (aujourd'hui : l'onglet ouvert seulement) + les noms de cartes (« Goku » → album + carte), résultats groupés par thème
- [ ] 2. « Voir l'album » dans la visionneuse d'une carte ; toucher l'intertitre d'album de la vue Cartes ouvre l'album
- [ ] 3. Albums récents (4-5 derniers ouverts) + albums épinglés (★ sur la pochette) en haut de la vue Albums
- [ ] 4. Albums « presque finis » (il manque 1 à 3 cartes) : filtre ou rangée dédiée
- [ ] 6. Fil d'Ariane cliquable (thème › famille › album) au lieu du seul « ‹ Albums »
- [ ] 7. Filtres repliés au téléphone : bouton « Filtres (n) » qui ouvre un tiroir
- Refusé : défilement continu dans la grille (on garde les pages de 60)

Autres écrans (audit du 26/11) — ordre conseillé : C, E, H, A, L
- [ ] A. Récap d'ouverture : bouton « Forger ces doublons » dès qu'il y a des doublons (aujourd'hui renvoi aux contrats seulement si 100 % doublons, `shop.ts:2037`)
- [ ] B. Récap, réserve vide : pistes pour regagner un booster (missions, Avent…) en plus du compte à rebours
- [ ] C. Marché : marque « je l'ai / ♥ envie » sur les annonces + filtre « mes manquantes / mes envies » (`market.ts:222`)
- [ ] D. Marché : nom du vendeur → son profil (`market.ts:192`)
- [ ] E. Un nom de joueur ouvre son profil partout : chat (`chat.ts:836`), fiche carte « chez les joueurs » (`cardPanel.ts:220`), marché
- [ ] F. « Message » et « Défier » sur un profil et sur la ligne d'un ami (`chat.open(conv)` existe, jamais appelé)
- [ ] G. Amis : recherche avec suggestions au lieu du pseudo exact (`friends.ts:147`) ; parrainage par `navigator.share` (feuille de partage du téléphone)
- [ ] H. Missions : « Tout récupérer » (jour + bonus + hebdo ; aujourd'hui 4 touchers ou plus, `missions.ts:54-127`)
- [ ] J. Roulette : « même mise que la dernière fois »
- [ ] K. Classement : toucher « tu es Xe » saute à ma ligne (`leaderboard.ts:147`) ; filtre « amis »
- [ ] L. Barre du téléphone : la flèche « › » porte la pastille d'un onglet caché qui a un badge (`syncNavMore`, `main.ts`)
- [ ] M. Push « missions prêtes / cadeau du jour » (avec « série en danger », cf. V3)
- [ ] Ménage : supprimer `views/defis.ts` (plus routé : `#/jeux/defis` → `#/jeux`)
- [ ] Forge : sélection rapide « Toutes les 4★ et moins » (aujourd'hui une puce par étoile)
- [ ] Forge → vente (idée Hugo 26/11) : au moment de forger, si des cartes sélectionnées sont dans les envies d'autres joueurs (carte, album ou famille : `wishFams`), proposer « X aimerait compléter 3 des cartes que tu veux forger : les mettre en vente au prix minimum ? » ; les voulues partent au marché, le reste à la forge ; l'acheteur est prévenu (push). Côté serveur : une requête groupée « qui veut ces cartes » (n'existe que carte par carte dans `cardPanel`) — mesurer le coût Convex. Prix minimum proposé nettement AU-DESSUS de la valeur de forge (sinon personne n'accepte) : réglage d'économie à fixer avec Tom. Pas de retour automatique à la forge si invendue (décision Hugo)
- [ ] C bis. Alerte à l'acheteur : « une carte de ton album / de tes envies vient d'être mise en vente » (push + pastille) — vérifier d'abord si elle existe déjà ; à faire avec C

- Détail des décisions : Project claude.ai `00-etat-du-projet` et `04-regles-du-jeu` ; historique : `docs/historique-claude-ai/`

## Vérifs à relancer
- `npm run typecheck` · `npm run test:server`

## Pièges connus
- `lanceurs/publier-patch.cmd` envoie tout `master..v2` (la V3 en cours) : jamais pour un correctif de la version en ligne.
- Régénérer `sport.ts` (`make-sport.py`, via `reillustrer.py`) renomme l'album `paralympiques` en `sport-paralympiques` : le remettre à la main (curation v2.1.9) ; les 4 gros thèmes demandent `pip install openpyxl requests pillow` et `PYTHONUTF8=1`.
- Un patch d'images : `public/art` de `.wt-master` ne contient que les nouvelles images, `r2-sync` n'envoie que celles-là (rien n'est retiré de R2).
- Faire `git fetch` avant de numéroter un patch : Tom avait pris v2.1.11 pendant la session.
- Après un patch : cherry-pick sur `v2` puis `git merge -s ours patch-v2.X.Y` sur `v2`.
- Lanceurs `METTRE-EN-LIGNE-v2.X.Y.cmd` hors git : chacun n'a que les siens (v2.1.13 chez Tom, v2.1.12 chez Hugo). Prendre le plus récent connu.
- `.wt-master` de Hugo sans `public/art` (hors git) : le lanceur v2.1.10 crée un dossier vide (images servies par R2). Ne jamais y copier le `public/art` de la racine (images V3 → écraseraient celles des joueurs dans R2).
- Lancer un lanceur de `.wt-master` avec son chemin complet : `cmd.exe //c "C:\…\.wt-master\METTRE-EN-LIGNE-v2.X.Y.cmd"` (sinon « n'est pas reconnu »).
- Capture du calendrier sans la 3D (Chrome headless reste bloqué sur l'écran de chargement du jeu) : banc `.wt-master/.claude-tmp/avent.html` servi par `npm run dev`, puis `chrome --headless=new --screenshot`.
- Deux sessions dans le dossier racine en même temps : un commit de l'une peut embarquer les fichiers indexés de l'autre (arrivé le 26/11, annulé). Une seule session par dossier (arrivé aussi dans `.wt-master` le 26/11 : v2.1.18 construite par-dessus la v2.1.17 non publiée).
- La prod = déploiement Convex « dev » : lire avec `npx convex run …` sans `--prod` (`--prod` renvoie une base vide).
- `EN-COURS.md` a des fins de ligne Windows : un script qui découpe sur `
` ne retrouve plus les titres.
- `npm run check:images` contrôle les fichiers locaux, pas le site : sur un PC au `public/art` incomplet, vérifier l'adresse en ligne (réponse 200 de type image).
- Un `.gitattributes` non commité (eol=crlf) fait paraître tous les `.cmd` modifiés et bloque `git pull` (« Aborting ») : le mettre de côté le temps du pull (arrivé le 26/11).
