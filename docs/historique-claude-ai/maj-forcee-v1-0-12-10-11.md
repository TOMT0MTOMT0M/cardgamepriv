# Mise à jour forcée — v1.0.12 (10/11)

**Statut : en ligne** — prod (Pages e1375d15, tag v1.0.12, master 8bd821d) et v2 (4262a023, v2 84383a8).

## Fonctionnement
- `version.json` porte `force` (vrai par défaut). Désactivable au build : `BEBOU_MAJ_OPTIONNELLE=1` → simple pastille.
- Vérif 2 s après l'ouverture (avant : 30 s), puis périodique.
- `hardUpdate()` (src/game/maj.ts) : voile « Mise à jour… », supprime les caches `bebou-*` sauf art/garde/app, `reg.update()` du SW (2,5 s max), recharge avec `?maj=<id>` (nettoyé ensuite).
- Garde-fous : 1 essai par version / 10 min (sessionStorage), attend si achat en cours (`shop.busy()`).
- localStorage conservé → le joueur reste connecté.
- Menu : bouton « Réparer et mettre à jour » = même purge, à la demande.

## À vérifier
- Mobile installé : fermer/rouvrir → mise à jour seule, toujours connecté.
- Bouton menu fonctionne.
- Les joueurs encore sous v1.0.11 ou avant doivent recharger une dernière fois à la main (leur ancien code ne connaît pas `force`).
