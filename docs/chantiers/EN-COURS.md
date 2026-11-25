# En cours — fichier de passation

Lu au début de chaque session (règle de CLAUDE.md), réécrit à la fin par `/cr`. Une page max.
_Mis à jour : 25/11/2026 (mise en place de la méthode, `docs/GUIDE-CLAUDE.md`)._

## Chantiers ouverts

| Qui | Dossier / branche | Chantier | État |
|---|---|---|---|
| Tom + Claude | `.wt-master` / `master` | patch v2.1.9 (base Etoiles 8, Paralympiques, Bébous verrouillées) | en ligne (tag `v2.1.9`) |
| Tom + Claude | racine / `v2` | V3 : calendrier de l'Avent, titres uniques, roulette, abonnement, succès, sachets par thème, marché | en cours |
| Hugo | son dossier | contenu des cartes (base Etoiles) | — |

## Reste à faire
- [ ] TEST Hugo
- [ ] TEST Tom
- [ ] Intégrer les mp3 des 6★ introuvables en boutique dès que Tom les fournit (Crash Bandicoot, Zelda ALttP, Inazuma Eleven VF, Yu-Gi-Oh VF, Code Lyoko, Kaamelott, South Park VF, Lucky Luke 2001)
- [ ] Signaler à Tom les 5★/6★ de la base Etoiles 8 encore sans image
- [ ] V3 — Avent (démarre le 01/12) : nouvelle grille jour par jour, cosmétiques de Noël (cadres, bannières, animations de profil, ouvertures), God Pack du 24 avec au moins 1 hit, étoile du sapin à aligner
- [ ] V3 — Packs événement : 7 j, 1/h, réserve propre 3 (5 abonné), 2 500 pièces ; consommer SA réserve (prend un booster normal aujourd'hui) ; collection Télé + booster de lancement
- [ ] V3 — Succès : ouvertures à gagner avec aperçu, paliers plus longs, récompenses proportionnelles
- [ ] V3 — Sachets par thème : attendre le choix de Tom (labo 046 : Autocollant / Case de BD / Écusson + logo Bébou), puis vignettes, roue 3D, booster du moment
- [ ] V3 — Marché « façon Kyara » (captures à demander à Tom) ; passe « moins de texte » Marché / Échanges / Jeux
- [ ] V3 — Roulette : toucher le pot = carte en grand, couleurs dans le replay
- [ ] Pity : demander à Tom dans quel cas le compteur bouge trop tôt (1 booster, ×10, Direct 4★ ?)
- [ ] Images Etoiles 8 : 70 cartes 5★/6★ sans image (Summoners War, Wakfu, Dofus, X-Men…) ; relancer AniList pour Vegeto, Gogeta, Obito
- [ ] Admin : destinataire Wero à saisir dans `/admin/`
- Détail des décisions : Project claude.ai `00-etat-du-projet` et `04-regles-du-jeu` ; historique : `docs/historique-claude-ai/`

## Vérifs à relancer
- `npm run typecheck` · `npm run test:server`

## Pièges connus
- `lanceurs/publier-patch.cmd` envoie tout `master..v2` (la V3 en cours) : jamais pour un correctif de la version en ligne.
- Après un patch : cherry-pick sur `v2` puis `git merge -s ours patch-v2.X.Y` sur `v2`.
