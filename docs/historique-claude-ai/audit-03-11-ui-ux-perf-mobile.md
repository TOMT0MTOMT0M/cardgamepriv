# Audit UI/UX + performances mobile — 03/11

7 agents d'audit (5 UI/UX, 2 perf mobile uniquement) → 148 constats (6 P0) → 6 lots de corrections automatiques.
Périmètre : le jeu `/jeu/` (pas le labo). Les changements sont dans le dossier de Tom, **non commités** (51 fichiers modifiés + `src/game/views/safety.ts`), appliqués par fusion 3-voies sur le commit `93e0a27` (le travail de l'autre session est conservé).
Rapports complets, journaux des correcteurs, patch et captures : `_hors-site/audit-03-11/` (hors git).

## Vérifié
- `tsc --noEmit` strict propre (jeu + labo) · `vite build` OK · `test:rolls` conforme (400 000 boosters, pity 199 max) · `test:server` 52/52.
- Les 10 écrans à 390×844 en mode démo (Chromium, WebGL2 logiciel) : 0 erreur console, 0 débordement horizontal.
- Premier écran : 748 → 704 Ko brotli de JS+CSS ; ~40 illustrations PNG en moins pendant le chargement.
- **Non vérifiable ici (pas de GPU)** : fluidité, mémoire réelle iPhone, rendu WebGPU → à tester sur téléphone.

## Corrigé (principal)
- **P0** : anti double-envoi sur tous les boutons de mutation (`busyButton` + `safety.ts`) · recherche de la grille d'album · grille de la fiche booster paginée (152 000 nœuds → 60/section) · mémoire Canvas 2D bornée (LRU 40 Mo mobile, toiles libérées après envoi GPU) · plus de préchargement des ~40 illustrations / photos des Bébous au démarrage · catalogues : construction des sous-thèmes en O(n) + `JSON.parse` au build (pas de lazy loading : l'API synchrone est gardée).
- **Navigation** : pile de couches → « retour » du téléphone ferme panneaux, grille de la fiche, composeur d'échange ; en-tête téléphone sans débordement, cibles 40 px, « Games » → « Jeux » ; états « connexion… » / « Serveur injoignable » / session expirée ; erreurs OAuth traduites ; toasts en file ; zoom réactivé ; PWA `standalone`.
- **Ouverture** : « Tout révéler » tient toute la série, ×10 ≈ 40 s au lieu de 60, touchers mis en tampon, « Tout passer » ×1 avec récap, échec réseau honnête (série arrêtée, rien compté deux fois, « Réessayer »), bouton « Ouvrir » visible sur l'accueil, paysage et 360 px.
- **Collection / profil** : bandeau « Filtres actifs · Réinitialiser », recherche dans tout le catalogue (cartes grisées), nombres ≥ 1 000 justes, classeurs au doigt (appui long / poignée), albums compacts sur téléphone.
- **Contrats / échanges / Jeux** : second toucher « Confirmer ? » avant de brûler / accepter / miser, mise de duel juste, forge qui respecte les protections, « Passer » la combustion, 3D coupée sur la page Jeux.
- **3D mobile** : profondeur MSAA non stockée, face holo allégée, scène 039 en qualité mobile, AudioContext suspendu, vitrine à 30 i/s au repos, halo de vitrine retiré, bloom plus léger.

## Régression trouvée et neutralisée
La précompilation « sur la vraie cible » ajoutée par le lot E (`compilePassAsync`, post.ts) produisait en WebGL2 « Active draw buffers with missing fragment shader outputs » à chaque image. Désactivée (`TARGET_PRECOMPILE = false`) → retour au comportement d'origine. L'à-coup au 1er zoom (PERF1-03) n'est donc pas corrigé.

## Décisions laissées à Tom
- En-tête téléphone : 131 px (3 rangées de cibles 40 px) ; seule une **barre d'onglets en bas** le ramènerait à ~90 px.
- Renommer « Boutique » → « Boosters » ; fusionner les doublons Succès / Classement (profil + page).
- Révéler → ranger (2 touchers par carte) gardé ; mode « 1 toucher = carte suivante » possible.
- 5★ en « Tout révéler » à ×2 sans arrêt ; 6★ joue toute sa séquence puis 1,6 s d'admiration.
- Profil : 3 chiffres clés avant la vitrine (contre « vitrine en premier » des retours live n°1) — à confirmer.
- Pity masqué à plus de 20 boosters du seuil ; solde court « 12,3 k » partout.
- Paillettes du cadre retirées sur téléphone pour les communes/peu communes ; halo de vitrine retiré sur téléphone.
- Son : laissé **actif par défaut** (le lot E l'avait coupé sans validation, remis comme avant).
- Seuil du second toucher sur « Signer » : contrats 3★+ ou > 10 cartes.
- Serveur : `users.friends` / `users.me` renvoient des champs qui changent à chaque battement de cœur → trafic Convex pour tous (correctif serveur proposé, non fait).
- Versionnage `?v=` des images R2 (la Function sait déjà servir en `immutable`) ; service worker non fait (risque de version périmée).
- Catalogues vraiment à la demande (−352 Ko br) : demande de rendre l'ouverture / la fiche / le fil asynchrones.

## À tester en priorité sur un vrai téléphone
1. Double toucher rapide sur Réclamer / Brûler / Miser / Accepter → une seule action, « Confirmer ? » puis 2e toucher.
2. Bouton / geste « retour » : ferme le panneau ou la couche du dessus sans changer de page.
3. ×10 avec « Tout révéler » touché une fois ; mode avion pendant la dernière carte d'un ×5.
4. iPhone : 10 ouvertures + long tour de collection sans « Total canvas memory » ; cartes nettes.
5. Vitrine à 30 i/s : fluide à l'œil ; aspect holo et scène 039 sur téléphone vs PC.
6. Classeur : défilement libre, appui long pour déplacer ; recherche « pikachu » dans un album.
