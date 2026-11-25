# Événements limités — booster du moment (11/11)

**État : codé sur la branche `wip/evenements` (commits `299f42a` serveur, `12925ac` jeu, `15799be` dashboard, `01e12d0` correctif mobile), pas encore fusionné dans v2, pas en ligne.**

## Fait
- **Serveur**
  - Nouvelle table `packEvents` : nom, phrase d'accroche, début et fin, couleur, contenu (sous-thèmes ou groupes, ou cartes précises).
  - Requête légère `events:current`, qui ne dévoile rien avant le début.
  - Des tâches programmées réécrivent l'événement au début et à la fin, ce qui met à jour tous les joueurs connectés. Une notification push part au début, avec un lien vers la boutique.
  - Le tirage passe par `convex/packs.ts` : même hasard serveur, mêmes taux, pity et god pack compris, coût d'un booster de la réserve. Il est refusé hors période.
- **Jeu**
  - Bandeau « Booster du moment » en tête de la boutique, avec compte à rebours. Rien ne s'affiche quand aucun événement n'est actif.
  - La fiche du booster montre les chances par carte, les cartes rangées par sous-thème, le temps restant et la mention « édition limitée ».
  - Le sachet en alu prend la teinte de l'événement, avec le nom moulé.
  - Un message prévient si l'événement sort pendant qu'on joue.
- **Dashboard admin, onglet Événements**
  - On peut créer, modifier, sortir maintenant, terminer, et supprimer avant la sortie, avec confirmation et trace dans le Journal.
  - Aperçu en direct : sachet, bandeau, nombre de cartes par étoile, chance d'une 6★ précise.
- **Démo** : un événement d'exemple « Valorant ». `?demo&evenement=non` n'affiche aucun événement ; `?demo&evenement=fin` en fait finir un dans 90 s.

## Décisions prises
- Les cartes de l'événement restent aussi dans les boosters normaux : pas d'exclusivité.
- Pas de carte secrète dans un booster du moment : les Bébous restent dans le Bebou Pack.
- Un seul événement à la fois, 60 jours au plus.
- Pièces gagnées et missions : celles d'un booster de thème. Un booster tiré pendant l'événement reste ouvrable après la fin.
- Teintes proposées (violet, fuchsia, pétrole, cuivre), loin des couleurs de rareté. Pas de notification la nuit (23 h – 8 h).

## Vérifié / Pas vérifié
- **Vérifié** :
  - type-check du jeu et du serveur ;
  - 145 tests serveur, dont 9 nouveaux : taux, dates, refus hors période, accès admin, pity, séries, chevauchement ;
  - bandeau et fiche en démo, au téléphone et sur PC ;
  - dashboard, testé avec un faux serveur.
- **Pas vérifié** : le sachet 3D, la notification push réelle, le vrai serveur de staging.

## À vérifier par Tom
1. Après la fusion : `lanceurs\mettre-en-ligne-v2.cmd`.
2. Dashboard → Événements : créer un événement court qui commence tout de suite.
3. Au téléphone :
   - le bandeau ne chevauche pas le booster 3D ;
   - le sachet a la bonne couleur et un nom lisible, même long ;
   - le compte à rebours avance ;
   - la notification arrive.
4. Ouvrir ×1, puis ×5. Terminer l'événement : le bandeau disparaît. Vérifier aussi en « Effets réduits ».
