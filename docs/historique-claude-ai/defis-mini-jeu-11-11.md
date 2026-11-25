# Défis entre amis + La Presse (11/11)

**État : codés sur la branche `wip/jeux` (commits `1d8ef1d` et `ecbe484`), pas encore fusionnés dans v2, pas en ligne.**

## Fait
- **Défis entre amis** (`#/jeux/defis`) : on défie 1 à 7 amis.
  - Objectifs : premier à tirer une 5★ ou une 6★, le plus de nouvelles cartes, ou le plus d'étoiles.
  - Durée : 1 h, 24 h ou 3 jours. Mise de 0 à 2 000 pièces, la même pour tous, mise de côté dès l'inscription.
  - Départ : quand tout le monde a répondu, quand le créateur le lance, ou au bout de 6 h. Si personne n'accepte, le défi est annulé et la mise rendue.
  - « Premier à… » se gagne dès que la carte tombe ; sinon, le meilleur score l'emporte à la fin. Égalité ou aucun gagnant : tout est rendu.
  - Les pièces gagnées passent par l'anti-abus. Une notification part à l'invitation, au départ et à la fin.
  - Nouvelles tables : `challenges`, `challengeSeats`.
- **La Presse** (`#/jeux/presse`), un mini-jeu contre la maison.
  - Mise de 50, 100 ou 250 pièces. Le serveur tire en secret 6 cartes de l'album choisi.
  - Chaque frappe en dévoile une, et ses étoiles chargent la pièce (1★ = 38 % de la mise).
  - Deux raretés identiques d'affilée : la pièce se fend et la mise est perdue. On encaisse quand on veut ; à la 6e frappe, l'encaissement est automatique.
  - 20 parties par jour au plus. Nouvelle table : `presseRuns`.
- L'accueil de l'espace Jeux gagne deux onglets et une deuxième rangée de cartes. Le mode démo marche : les robots acceptent les défis, et « Terminer (démo) » clôt un défi.

## Décisions prises
- Pas d'objectif « compléter un album » : il coûterait trop de lectures.
- Seuls les boosters de la boutique ouverts après le départ comptent : pas de défi lancé sur une 5★ déjà connue.
- Pas de cron : le départ et la fin sont programmés par Convex. Le score avance quand le booster est crédité, en une lecture le plus souvent vide.
- Au plus 3 défis en attente ou en cours lancés par un même joueur.
- La Presse ne paie qu'en pièces, jamais en cartes.
  - Avantage de la maison : environ 7,6 % en jouant au mieux, calcul vérifié par un test.
  - Une pièce d'au moins 4 fois la mise est annoncée dans le fil.
- Défis et Presse comptent dans les parties jouées et gagnées, et dans les missions « jeux ».

## Vérifié / Pas vérifié
- **Vérifié** : type-check du jeu et du serveur ; 149 tests serveur, dont 13 nouveaux ; rendu en démo au téléphone (390 px) et sur PC (1 366 px).
- **Pas vérifié** :
  - en ligne : `api.d.ts` a été édité à la main ;
  - les notifications envoyées ;
  - le départ et la fin programmés ;
  - les images des cartes ;
  - le mode « Effets réduits ».

## À vérifier par Tom
1. Après la fusion : `lanceurs\mettre-en-ligne-v2.cmd`.
2. Avec Hugo, lancer un défi « 1 h · Étoiles · mise 50 » : invitation, départ, scores en direct, puis notification de fin et paiement.
3. La Presse au téléphone : on voit bien la jauge et le risque de fêlure ? Le dosage (38 % par étoile, 20 parties par jour) convient ?
