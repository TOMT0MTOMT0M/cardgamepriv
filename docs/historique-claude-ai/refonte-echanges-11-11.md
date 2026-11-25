# Refonte des échanges — compte rendu (11/11)

**État : codée sur la branche `wip/echanges` (4 commits : 4db94f5, 367881e, bad5d02, ae124e4), pas encore fusionnée dans v2.** Lot D (pièces en complément, échanges à trois) non fait, à la demande.

## Fait
- **A · Sous chaque carte** (visionneuse de la collection, carte manquante comprise) : une bande « Chez les joueurs » qui dit combien l'ont, combien en doublon, à partir de combien elle est en vente et combien la veulent. Elle ouvre une fiche à trois listes :
  - Qui l'a (doublon ou non, en ligne) → Demander ;
  - En vente (prix, vendeur) → Acheter ;
  - Qui la veut → Proposer.
  - Deux gestes seulement : **Je la veux** et **Protéger**. Les boutons Échanger, Chercher un propriétaire et Proposer sur le tableau sont retirés.
- **B · Recoupement serveur à la demande** (`convex/deals.ts`) :
  - Il croise mes envies avec les doublons proposables de tous les joueurs, à étoile égale, et fabrique des échanges prêts. Il y ajoute « Ils cherchent tes doublons ».
  - La contrepartie est choisie automatiquement : ses envies d'abord, sinon une carte qui lui manque. Elle reste modifiable.
  - Demander se fait en un toucher. L'autre répond Accepter, Choisir autre chose (conclu au toucher) ou Refuser. Le demandeur peut Changer ou Annuler. Une notification part à chaque étape.
- **C · Une seule page Échanges** en trois zones :
  - Pour toi ;
  - Chercher : catalogue et marché ensemble, mêmes filtres, Vendre une carte ;
  - En cours : reçus, envoyés, historique, « Composer moi-même ».

## Décisions prises
- Une carte est proposable si c'est un doublon (on garde toujours 1 exemplaire), hors Bébou, hors carte protégée et hors carte de mes envies.
- Une demande en un toucher = 1 carte contre 1 de même étoile. « Choisir autre chose » se limite aux doublons proposables du demandeur.
- Si je n'ai aucun doublon à proposer, Demander ouvre le composeur avec la carte déjà demandée.
- Tableau d'offres : invisible, sauf mes annonces et offres encore ouvertes, repliées dans En cours jusqu'à leur terme. Serveur et données inchangés.
- Schéma : `users.tradeProtected` et `trades.quick`, optionnels ; pas de migration ni d'index ajouté.
- Une carte obtenue reste dans les envies : pas de retrait automatique.

## Vérifié / Pas vérifié
- **Vérifié** :
  - type-check jeu et convex ;
  - 147 tests serveur, dont 11 nouveaux (`convex/deals.test.ts`) ;
  - lectures mesurées pour 20 joueurs × 300 cartes : « Pour toi » ≈ 430 documents, au plus toutes les 90 s ; fiche de carte ≈ 32 ;
  - rendu en démo, téléphone et PC.
- **Pas vérifié** :
  - le staging V2 en ligne ;
  - les notifications push réelles ;
  - le mode « Effets réduits » à l'écran ;
  - la fiche sur PC.

## À vérifier par Tom
1. Après la fusion dans v2 : `lanceurs\mettre-en-ligne-v2.cmd` (nouveau module serveur `deals`).
2. Sur le lien V2, avec Hugo :
   - marquer une envie ;
   - demander depuis Pour toi ;
   - répondre « Choisir autre chose » ;
   - protéger une carte : elle doit disparaître des propositions chez l'autre.
3. Sur téléphone : la bande sous la carte et la place prise par les boutons de la visionneuse.
4. « Choisir autre chose » passe sur deux lignes au téléphone : garder ou raccourcir.
