# Patch v1.0.16 (11/11) — 37 cartes ré-illustrées

- **Master** : `bce2212`, tag `v1.0.16`.
- **Report sur v2** : `cbcad29`, puis `merge -s ours master` (`5179594`).
- **Mise en ligne** : `.wt-master\METTRE-EN-LIGNE-v1.0.16.cmd`.
- **Images** : celles fournies par Tom (zip « 3 »). Toutes les cartes sont des 6★, sauf Maki et Michael Scofield (5★).
- **Nouveau nom de fichier** : `…-r2611110028` + miniature, avec `scripts/reillustrer.py` (copie compatible Python 3.10 dans `.wt-master\.claude-x\reill.py`). Aucun cache ne peut ressortir l'ancienne image.
- **Recadrage** : les photos paysage ou carrées sont recadrées en portrait 0,72 (`.claude-x\crop1111.py`). Le recadrage se centre sur le visage le plus grand (YuNet), sinon au centre. 26 visages sont ajoutés à `faceFocus.json`.
- **Fichiers sans nom de carte exact** (associés via `manifest.json`) :
  - Allumer le feu → `pop-allumer-le-feu`
  - Exodia le maudit → `pop-exodia-the-forbidden-one`
  - Tchikita → `pop-tchikita`
  - Kobe Bryant → `spt-kobe-bryant`
  - Maki → `miam-maki` (Plats du monde)
  - Sir Alex Ferguson → `spt-alex-ferguson`
  - Chris Brown → `pop-chris-brown`
  - Hulk → `pop-hulk` (Marvel)
  - Ratchet → `jv-ratchet-and-clank-ratchet`
- **Vérifications** : type-check (master et v2) OK, `game.test.ts` OK. Les images sont identiques sur master et v2.
- **Originaux** : `.wt-master\.claude-x\reill-1111\`.

## À vérifier après la mise en ligne
Ouvrir en grand quelques cartes recadrées : Iron Man, Giyuu, Fernand Naudin, Jayce, Footix, WrestleMania, Alex Ferguson, Maki et le Joker.
