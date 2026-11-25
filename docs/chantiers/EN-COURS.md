# En cours — fichier de passation

Lu au début de chaque session (règle de CLAUDE.md), réécrit à la fin par `/cr`. Une page max.
_Mis à jour : 25/11/2026 (mise en place de la méthode, `docs/GUIDE-CLAUDE.md`)._

## Chantiers ouverts

| Qui | Dossier / branche | Chantier | État |
|---|---|---|---|
| Tom + Claude | `.wt-master` / `master` | patch v2.1.9 (base Etoiles 8, Paralympiques, Bébous verrouillées) | en ligne (tag `v2.1.9`) |
| Tom + Claude | racine / `v2` | V3 : calendrier de l'Avent, titres uniques, roulette, abonnement, succès, sachets par thème, marché | en cours |
| Hugo | son dossier | contenu des cartes (base Etoiles) | — |

## Fichiers partagés réservés
_(aucun — une ligne « qui · fichier · pourquoi » quand on en réserve un)_

## Reste à faire
- [ ] Intégrer les mp3 des 6★ introuvables en boutique dès que Tom les fournit (Crash Bandicoot, Zelda ALttP, Inazuma Eleven VF, Yu-Gi-Oh VF, Code Lyoko, Kaamelott, South Park VF)
- [ ] Signaler à Tom les 5★/6★ de la base Etoiles 8 encore sans image
- [ ] V3 : la prochaine session V3 détaille ici ses lots restants

## Vérifs à relancer
- `npm run typecheck` · `npm run test:server`

## Pièges connus
- `lanceurs/publier-patch.cmd` envoie tout `master..v2` (la V3 en cours) : jamais pour un correctif de la version en ligne.
- Après un patch : cherry-pick sur `v2` puis `git merge -s ours patch-v2.X.Y` sur `v2`.
