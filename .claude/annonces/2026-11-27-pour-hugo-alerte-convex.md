# Pour Hugo (et son Claude) : poser l'alerte Convex à 0,5 GB/jour

_Écrit le 27/11/2026 par Tom + Claude. À faire lundi 30/11, une seule fois, sur le PC de Hugo (Tom n'est pas chez lui)._

## Pourquoi
Depuis le 26/11, Convex est sur l'offre Starter : les dépassements sont facturés. Les correctifs v2.1.21 à v2.1.32 ont ramené la lecture de la base à ≈ 0,24 GB/jour (mesuré le 27/11 sur 2 h 26). Une alerte par e-mail au-delà de 0,5 GB dans la journée prévient d'une dérive (une requête qui relit tout, une migration relancée…) avant la facture. C'est une ALERTE seulement : elle ne coupe rien et ne change rien pour les joueurs.

La commande a été refusée par le garde-fou de la session de Claude chez Tom : c'est Hugo qui la tape lui-même.

## À faire (Hugo, dans le dossier racine, connecté à Convex : `npx convex login` déjà fait)
```
npx convex deployment usage-limits set --metric databaseIoGb --window day --type warning --limit 0.5
```
Vérifier ensuite qu'elle est bien posée (la commande `usage-limits` sans `set` les liste ; sinon le tableau de bord Convex → Usage).

Claude de Hugo : si la commande échoue (connexion, droits), ne pas insister : le dire à Hugo et à Tom. Puis cocher la ligne « Alerte » de `docs/chantiers/EN-COURS.md` (section « Version en ligne ») et marquer cette annonce comme vue :
```
node .claude/hooks/au-demarrage.mjs --vu 2026-11-27-pour-hugo-alerte-convex
```
