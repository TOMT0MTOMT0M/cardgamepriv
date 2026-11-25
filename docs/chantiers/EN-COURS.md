# En cours — fichier de passation

Lu au début de chaque session (règle de CLAUDE.md), réécrit à la fin par `/cr`. Une page max.
_Mis à jour : 26/11/2026 (Tom : patch v2.1.13 Avent en ligne, reporté sur v2 ; à vérifier sur téléphone)._

## Chantiers ouverts

| Qui | Dossier / branche | Chantier | État |
|---|---|---|---|
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.10 : labo prod = labo complet (046 sachets cartoon) ; plus de labo sur le lien V2 (racine → `/jeu/`) | en ligne (tag `v2.1.10`, `5f5a4df` ; v2 `e08b146`) — `docs/chantiers/v2.1.10.md` |
| Tom + Claude | `.wt-master` / `master` | patch v2.1.11 : récompenses de saison 0 + pity anti-spoil | en ligne (tag `v2.1.11`, `52cfd6e` ; v2 `a0eb9ca`) — `docs/chantiers/v2.1.11.md` |
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.12 : images (353 + 159), musiques 6★, famille France | en ligne (tag `v2.1.12`, `40bd36e` ; v2 `73b61aa`) — `docs/chantiers/v2.1.12.md` |
| Hugo + Claude | `.wt-master` / `master` | patch v2.1.14 : 53 6★ à photo carrée en plein écran centré sur le visage ; onglet Événement grisé sur le live jusqu'au 01/12 | en ligne (tag `v2.1.14`, `3e12cca`) — `docs/chantiers/v2.1.14.md`. Grisage = live seulement (pas reporté sur `v2`) |
| Hugo + Claude | `.wt-master` / `master` | patchs v2.1.15 et v2.1.16 : 5★ (615) et 6★ (61 de plus) à photo horizontale en plein écran sur le visage | en ligne — `docs/chantiers/v2.1.15.md`, `v2.1.16.md` |
| Tom + Claude | `.wt-master` / `master` | patch v2.1.13 : calendrier de l'Avent (95 boosters, 13 000 pièces, 9 cosmétiques de Noël par case, God Pack le 24, étoile refaite) | en ligne (tag `v2.1.13`, `1faee0e` ; v2 `b2dd383`) — `docs/chantiers/v2.1.13.md` |
| Tom + Claude | racine / `v2` | V3 : titres uniques, roulette, abonnement, succès, sachets par thème, marché | en cours |
| Hugo | son dossier | contenu des cartes (base Etoiles) | — |

## Reste à faire
- [ ] 6★ plein écran : fournir des images pour les 135 détourées et vérifier les 114 fond blanc (`donnees/suivi/6etoiles-plein-ecran-26-11.xlsx`)
- [ ] 6★ / 5★ à cadrer à la main : 40 6★ et 541 5★ → `donnees/suivi/5-6etoiles-cadre-a-changer-26-11.xlsx`
- [ ] Avent : onglet Événement grisé sur le live (v2.1.14) → à rouvrir pour le 01/12 (retirer `nav-off` + renvoi dans `route()` de `main.ts`, patch sur master) ; la note v2.1.13 annonce déjà l'onglet
- [ ] Images : Leo, Jubelle (Summoners War), Coiffe Kitsou sans fichier ; 5 Musique 6★ sans extrait (Cocteau, Niska, James Joyce, Tupac, « Je serai ta meilleure amie »)
- [ ] Dragon Cochon (Dofus) : laissée, retrait = migration de collections (Hugo : tant pis)
- [ ] Lucky Luke 2001 (mp3) : ignoré à la demande de Hugo
- [ ] Avent (en ligne v2.1.13) : Tom vérifie sur téléphone — étoile, cases 21/23, Chapeau de Noël, bannières, animations de profil, éclat des 2 ouvertures ; le 01/12 ouvrir la 1re case en vrai
- [ ] V3 — Packs événement : 7 j, 1/h, réserve propre 3 (5 abonné), 2 500 pièces ; consommer SA réserve (prend un booster normal aujourd'hui) ; collection Télé + booster de lancement
- [ ] V3 — Succès : ouvertures à gagner avec aperçu, paliers plus longs, récompenses proportionnelles (pièces, boosters, titres, cosmétiques) ; nouveaux cosmétiques nécessaires → les demander à Tom
- [ ] Animaux : sous-thèmes mal rangés (poissons en Mammifères…) → à corriger dans la base (Etoiles 9, Hugo)
- [ ] V3 — Sachets par thème : piste « Case de BD » choisie le 25/11 ; Tom la retouche dans Photoshop → EN ATTENTE de ses fichiers, puis vignettes, roue 3D, booster du moment
- [ ] V3 — Marché « façon Kyara » (captures reçues, brief : `docs/chantiers/marche-kyara.md`) ; passe « moins de texte » Marché / Échanges / Jeux (Pack Battle, Battle Royale : mêmes règles, plus visuels)
- [ ] V3 — Roulette : toucher le pot = carte en grand, couleurs dans le replay
- [ ] 01/12 : vérifier en ligne la clôture de la saison 0 (cron horaire) : récompenses, titres, God pack du 1er
- [ ] God pack ouvert dans un ×10 : l'animation peut tomber sur le mauvais morceau (cartes correctes) — mineur, `spreadSeries` dans `shop.ts`
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
- Régénérer `sport.ts` (`make-sport.py`, via `reillustrer.py`) renomme l'album `paralympiques` en `sport-paralympiques` : le remettre à la main (curation v2.1.9) ; les 4 gros thèmes demandent `pip install openpyxl requests pillow` et `PYTHONUTF8=1`.
- Un patch d'images : `public/art` de `.wt-master` ne contient que les nouvelles images, `r2-sync` n'envoie que celles-là (rien n'est retiré de R2).
- Faire `git fetch` avant de numéroter un patch : Tom avait pris v2.1.11 pendant la session.
- Après un patch : cherry-pick sur `v2` puis `git merge -s ours patch-v2.X.Y` sur `v2`.
- Lanceurs `METTRE-EN-LIGNE-v2.X.Y.cmd` hors git : chacun n'a que les siens (v2.1.13 chez Tom, v2.1.12 chez Hugo). Prendre le plus récent connu.
- `.wt-master` de Hugo sans `public/art` (hors git) : le lanceur v2.1.10 crée un dossier vide (images servies par R2). Ne jamais y copier le `public/art` de la racine (images V3 → écraseraient celles des joueurs dans R2).
- Lancer un lanceur de `.wt-master` avec son chemin complet : `cmd.exe //c "C:\…\.wt-master\METTRE-EN-LIGNE-v2.X.Y.cmd"` (sinon « n'est pas reconnu »).
- Capture du calendrier sans la 3D (Chrome headless reste bloqué sur l'écran de chargement du jeu) : banc `.wt-master/.claude-tmp/avent.html` servi par `npm run dev`, puis `chrome --headless=new --screenshot`.
- Deux sessions dans le dossier racine en même temps : un commit de l'une peut embarquer les fichiers indexés de l'autre (arrivé le 26/11, annulé). Une seule session par dossier.
