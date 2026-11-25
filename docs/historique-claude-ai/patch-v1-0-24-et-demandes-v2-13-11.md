# Patch v1.0.24 + demandes V2 — 13/11

## Fait
- **v1.0.24** (`.wt-master`, commit `294f65d`, tag `v1.0.24`, lanceur `.wt-master\METTRE-EN-LIGNE-v1.0.24.cmd`) :
  - Grogu, Le Mandalorien, Cobb Vanth, Koska Reeves : Star Wars → The Mandalorian (`curation.ts` `RESUB_13_11`, ids inchangés).
  - Oner et ShowMaker → 6★ (`RERATE_13_11`, inventaires par `resyncRarities` à la mise en ligne).
  - 56 images (nouveaux noms de fichiers `-r2611132242`) : Iron Man recadré depuis la photo d'origine, 15 cartes The Walking Dead remplacées (photos des acteurs, Wikimedia Commons ; les 13 bonnes gardées), 40 du dossier 5.zip. **Carlos Ruiz écarté** (photo d'un joueur de baseball homonyme, pas du footballeur).
  - Mises à jour : « La V2 arrive ce soir (2-3 h), 50 boosters offerts à la sortie », ouverte d'office à la prochaine visite. **Pas de notification push en V1** (n'existe qu'en V2).
- **v2** : même contenu reporté (`86ddf17`) + `git merge -s ours master` (`172bc0e`). Pas poussé (pas d'accès GitHub depuis ici : les lanceurs poussent).

## Ordre pour Tom
1. `.wt-master\METTRE-EN-LIGNE-v1.0.24.cmd` (sauvegarde, push, prod, images R2).
2. Ensuite, sur v2 : `git merge -s ours master` à refaire (le lanceur ajoute un commit `artRev.json` sur master), puis `lanceurs\mettre-en-ligne-v2.cmd` pour tester.

## Reste à faire (V2, session suivante)
- Fiche booster : taux réels faux sur la V2 (Bebou Pack : 40 312 cartes) → recalculer `packTrueOdds` avec le catalogue V2, vérifier par `npm run test:rolls`.
- Onglet « Échanges » → « Marché » ; vendre une carte directement depuis « Pour toi » (sans chercher).
- Achat de boosters en pièces **illimité**, même prix (pas moins cher).
- Succès : vue simplifiée par catégorie (« COLLECTION 2/7 », pastille « 500/1000 »), un toucher = ce qui manque.
- 50 boosters offerts à tous à la sortie de la V2 (migration idempotente ou action admin).
- Cadrage de toutes les cartes : seul Iron Man corrigé ; un audit automatique des 40 312 images reste à faire (détection du sujet).
