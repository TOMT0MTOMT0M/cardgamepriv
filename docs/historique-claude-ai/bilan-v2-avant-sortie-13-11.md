# Bilan V2 avant la sortie (13/11)

Basé sur `v2` au commit `0b95132` : le PC ne répond plus, je n'ai pas pu voir ce que la session de préparation a commité depuis. Plan de sortie : `claude/sortie-v2-prod-14-11.md`.

## Ce que la V2 apporte aux joueurs (sortie du 14/11, 20 h)
- **Social** : chat, échanges repensés (« Pour toi » en un toucher, « chez les joueurs » sous chaque carte), marché à prix fixe, notifications push, saisons mensuelles, défis, La Presse.
- **Contenu** : booster du moment ; plus de 3 000 cartes Pop Culture et Sport ; nouveau tri des étoiles ; extraits des 6★ Musique et openings d'animés ; skins CS 6★ en 3D, Éclipse Berserk, ouvertures à débloquer.
- **Ressenti** : déchirure simulée, 26 scènes 6★ par famille, son V2, style « usinage » partout, audit de performance corrigé.
- **Gardé** : collections, pièces, boosters et succès passent tels quels (migrations idempotentes, aucune remise à zéro).
- **Pas dans la sortie** : la branche `wip/retours-hugo` (retours de Hugo, doc `claude/retours-hugo-v2-13-11.md`), à fusionner après la sortie.

## Ce qui manque ou reste à vérifier avant 20 h
**Bloquant**
1. **Les 5 bloquants du plan de sortie** : fusion `master` → `v2`, `reillustrees.json`, `.wt-master` dans `publier-patch`, texte du verrou, clés VAPID. Leur état ne m'est pas connu.
2. **Toutes les variables de la prod, pas seulement VAPID.** Le code en lit 15 : `DISCORD_*`, `MAX_PLAYERS` (le club passe à 40-50 : un plafond à 20 bloquerait les nouveaux), `PUBLIC_SITE_URL`, `FRONTEND_URL`, `FEEDBACK_READ_KEY`, `CLUB_CODE`. Comparer les noms entre le staging et la prod, sans afficher les valeurs.
3. **Images** : patch prêt (`v2-verifier-images.patch`, outil seulement, rien dans le jeu). `npm run check:images` vérifie que chaque carte du catalogue a son image et sa miniature dans `public/art/`, ce que la mise en ligne envoie sur R2. Hors ligne, aucun appel au site. La liste des manques va dans `logs/images-manquantes.txt`.

**À corriger sur `v2` (texte)**

4. Accueil Jeux : « Règles d'or : … **pas de marché** ». Patch prêt (`v2-texte-jeux.patch`) : « Monnaie 100 % virtuelle. Les jeux ne font que redistribuer ce que vous misez. »
5. **Notes de version** : les entrées du 8 au 12 novembre décrivent les tests de la V2. Mieux : une seule entrée « V2.0 — 14 nov », plus `ANNOUNCE_ID` (déjà prévu dans le plan de sortie).
6. **Rééquilibrage des étoiles** : le dire dans l'annonce Discord, avec la liste que donne `bilan-exports.mjs`.

**À trancher par Tom**

7. **Première saison** : 16 jours (novembre), ou départ en décembre.
8. **Défis et La Presse** : Hugo n'en veut plus (retirés sur la branche wip). Les garder pour la sortie ou les retirer dès la v2.0 ? Le texte du verrou les annonce.

**À surveiller samedi soir et la première semaine**

9. **Coût Convex** pendant le pic de 20 h : tableau d'usage Convex et `/admin/`.
10. **iPhone** : notifications seulement avec le jeu ajouté à l'écran d'accueil. Mettre les deux étapes dans l'annonce Discord.
11. **Économie** : le marché est la première voie pièces → cartes. Surveiller les prix et les alertes anti-abus.
12. **Chat** : on peut retirer et couper, mais pas signaler. Décider qui modère.

## Reste pour Claude (dès que le PC répond)
- `wip/retours-hugo` : appliquer `lot-5.patch` puis `lot-11.patch`, avec un commit chacun.
- `v2` (corrections permises pendant le gel, avec l'accord de Tom) : `v2-texte-jeux.patch` et `v2-verifier-images.patch`.
- `.wt-hugo` (créé depuis le VM) : `git worktree prune`.
