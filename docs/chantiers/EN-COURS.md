# En cours — fichier de passation

Lu au début de chaque session (règle de CLAUDE.md), réécrit à la fin par `/cr`. Une page max.
_Mis à jour : 25/11/2026 (Hugo : labo sur le lien prod seulement, patch v2.1.10)._

## Chantiers ouverts

| Qui | Dossier / branche | Chantier | État |
|---|---|---|---|
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.10 : labo prod = labo complet (046 sachets cartoon) ; plus de labo sur le lien V2 (racine → `/jeu/`) | en ligne (tag `v2.1.10`, `5f5a4df` ; v2 `e08b146`) — `docs/chantiers/v2.1.10.md` |
| Tom + Claude | racine / `v2` | V3 : calendrier de l'Avent, titres uniques, roulette, abonnement, succès, sachets par thème, marché | en cours |
| Hugo | son dossier | contenu des cartes (base Etoiles) | — |

## Reste à faire
- [ ] Intégrer les mp3 des 6★ introuvables en boutique dès que Tom les fournit (Crash Bandicoot, Zelda ALttP, Inazuma Eleven VF, Yu-Gi-Oh VF, Code Lyoko, Kaamelott, South Park VF, Lucky Luke 2001)
- [ ] Signaler à Tom les 5★/6★ de la base Etoiles 8 encore sans image
- [ ] V3 — Avent (démarre le 01/12) : nouvelle grille jour par jour, cosmétiques de Noël (cadres, bannières, animations de profil, ouvertures), God Pack du 24 avec au moins 1 hit, étoile du sapin à aligner
- [ ] V3 — Packs événement : 7 j, 1/h, réserve propre 3 (5 abonné), 2 500 pièces ; consommer SA réserve (prend un booster normal aujourd'hui) ; collection Télé + booster de lancement
- [ ] V3 — Succès : ouvertures à gagner avec aperçu, paliers plus longs, récompenses proportionnelles
- [ ] V3 — Sachets par thème : piste « Case de BD » choisie le 25/11 ; Tom la retouche dans Photoshop → EN ATTENTE de ses fichiers, puis vignettes, roue 3D, booster du moment
- [ ] V3 — Marché « façon Kyara » (captures reçues, brief : `docs/chantiers/marche-kyara.md`) ; passe « moins de texte » Marché / Échanges / Jeux (Pack Battle, Battle Royale : mêmes règles, plus visuels)
- [ ] V3 — Roulette : toucher le pot = carte en grand, couleurs dans le replay
- [ ] Pity (bug, version en ligne aussi) : le compteur X/200 se remet à zéro AVANT la révélation de la 6★ → spoil ; ne le mettre à jour qu'après la révélation
- [ ] URGENT avant le 30/11 (fin de la saison 0, version en ligne) : récompenses de saison = 1er God pack, 2e 20 boosters, 3e 15 boosters, titre + contour de cadre pour le top 3, 4e-10e 10 boosters, titre « Participant de la saison 0 » à tout joueur ayant ouvert ≥ 100 boosters dans la saison
- [ ] Prod : MAX_PLAYERS de 30 à 50 (variable Convex de prod — accord de Tom et Hugo du 25/11)
- [ ] V3 — Ouvertures : retirer Brûlure, Éventail et les autres, seule la Déchirure reste
- [ ] V3 — Notifications : « ta série est en danger » + tirage de la roulette
- [ ] Portefeuille : retirer le texte « les pièces n'achètent jamais de cartes » (faux)
- [ ] Catalogue : protéger la Citroën C15 (carte hors Excel) lors des régénérations
- [ ] Images Etoiles 8 : 70 cartes 5★/6★ sans image (Summoners War, Wakfu, Dofus, X-Men…) ; relancer AniList pour Vegeto, Gogeta, Obito
- [ ] Admin : destinataire Wero à saisir dans `/admin/`
- Détail des décisions : Project claude.ai `00-etat-du-projet` et `04-regles-du-jeu` ; historique : `docs/historique-claude-ai/`

## Vérifs à relancer
- `npm run typecheck` · `npm run test:server`

## Pièges connus
- `lanceurs/publier-patch.cmd` envoie tout `master..v2` (la V3 en cours) : jamais pour un correctif de la version en ligne.
- Après un patch : cherry-pick sur `v2` puis `git merge -s ours patch-v2.X.Y` sur `v2`.
- Lanceurs `METTRE-EN-LIGNE-v2.X.Y.cmd` hors git : chacun n'a que les siens (v2.1.9 chez Tom, v2.1.10 chez Hugo). Prendre le plus récent connu.
- `.wt-master` de Hugo sans `public/art` (hors git) : le lanceur v2.1.10 crée un dossier vide (images servies par R2). Ne jamais y copier le `public/art` de la racine (images V3 → écraseraient celles des joueurs dans R2).
- Lancer un lanceur de `.wt-master` avec son chemin complet : `cmd.exe //c "C:\…\.wt-master\METTRE-EN-LIGNE-v2.X.Y.cmd"` (sinon « n'est pas reconnu »).
