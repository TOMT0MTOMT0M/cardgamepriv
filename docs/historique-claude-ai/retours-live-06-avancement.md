# Retours live 6 (07/11) — avancement (commit a212d2f, à pousser via lanceurs\push-et-mettre-en-ligne.cmd)

## Bugs
- **B1 Gros tirages** : la vraie carte peinte (`observeRealCard` sur `.bp-card`, bigPulls.ts) au lieu de l'image brute.
- **B2 Miniature ≠ détail** — cause racine (aussi lots 3 et 4) : images remplacées sous le même nom, servies `max-age 7 j + stale-while-revalidate 30 j` → le navigateur gardait l'ancienne miniature. Désormais toutes les adresses d'images sont versionnées `?v=<époque>[.<rév>]` (src/core/artRev.ts, servies « immutable » par functions/art). `ART_EPOCH = 2` (tout repart une fois). `scripts/art-rev.mjs` (lancé par mettre-en-ligne-prod.cmd AVANT le build) compare public/art à R2 et monte la révision de chaque image remplacée (src/core/artRev.json). Merveilles : la miniature prend le même gabarit que la 3D (`gameDesignId`, core/art/index.ts). Cache des cartes peintes v9 (clé = adresse versionnée de la miniature). Vérifié : les miniatures locales correspondent bien à leurs images (animaux, lieux, merveilles, monde).
- **B3 Jaquettes / photos non portrait** (format > 0,82 : DS, albums carrés, 4:3…) → gabarit Suisse, image entière (`PORTRAIT_MAX`, imageSubject.ts ; `suisseLandscapeBand` cadre aussi les formats presque carrés). Plus aucun flou de remplissage. **Sauf les 6★ depuis le 07/11 soir (voir plus bas).**
- **B4 Cadres profil** : le cadre était un dégradé dans `box-shadow` (ignoré). Couleur pure (`frameCss = hex`), anciens cadres ramenés à leur couleur principale.
- **B5 Extrait Apple Music** : à l'ouverture, dans le voile de la 6★ sous « MYTHIQUE » / nom (zone réservée, `has-mp`) ; visionneuse : en haut à gauche.
- **B6 Échanges** : toucher une carte (annonces, offres, échanges en attente, proposition) l'ouvre en grand (`[data-zoom]`, `zoomPlain`, trades.ts).

## Chantiers
- **C1** sachets : nom du pack en noir, Matcha World (`label`, core/pack.ts ; `SACHET_LABEL` opening.ts), pas de logo.
- **C2** retournements ×1,3 (`FLIP_K`, core/motion.ts). **C3** déjà en place (déchirure pour tous, `UNLOCK_STYLES = false`).
- **C4 DA noir / blanc** : variables de :root (les anciennes --rose / --gold valent blanc), couleurs chaudes remplacées partout, bloc final « DA NOIR / BLANC » à la fin de src/game/style.css (boutons primaires blancs / secondaires contour blanc, zéro dégradé). Fonds 3D noirs, pièce en noir et blanc, theme-color #000. Gardés : bordure arc-en-ciel 6★, éclat de rareté à la révélation, feu des contrats. Les fonds de vitrine (cosmétiques) ne sont pas touchés.
- **C5** gabarit Suisse : numéro 56 px noir, thème 38 px / sous-thème 31 px, vraies étoiles, plus de barre de couleur.
- **C6** zéro effet : fond d'aplat (plus de rayons, halo, bokeh, vignettage, ombre, liseré, éclats), plus de halo d'étoiles, de foil sur le nom, de foil image / paillettes en 3D (`HOLO_LIMITS`), vernis presque mat ; plus de reflet sur les tuiles.
- **C7** plus d'emblème à côté du thème (full-art, classique).
- **C8** Contrats = onglet de la Collection (#/collection/contrats, #/contrats redirige) ; nav à 7 onglets ; Mises à jour / Tutoriel / Suggestions en 3 icônes à droite de la nav (PC) et dans le menu du profil (téléphone).
- **C9** classement : rangs 1/2/3 en typographie, podium noir/blanc, 1er plus grand, sans émojis.
- **C10** 1 palier = 1 récompense (`cos: true` → 0 pièce, un seul cosmétique ; vérifié par script). 84 paliers (36 avant) : nouveaux succès Cartes World / Gaming / Pop Culture / Sport, Forge, Niveau Bébou (paliers obtenus), Classement. Toutes les couleurs sont libres. Récompense affichée en une puce.
- **C11** un seul post Mises à jour : V1, 8 nov. (nombre de cartes lu dans le catalogue).
- **C12** « Devise » → « Informations ».
- **C13** bannière : option « Aucune couleur » (par défaut) ; avec un GIF, la couleur fait un contour.
- **C14** cadres animés (CSS `.frame-a-…`) : Éclairs (5 cartes 5★), Feu (50 × 5★), Ange (25 albums), Cœurs (25 échanges), Galaxie (1 000 cartes), Néon (25 contrats).
- **C15** titres de la liste tranchée ; « Numéro un » : `markLeader` (convex/profiles.ts, toutes les heures) pose `users.wasTop` au premier du classement.

## Vérifié
tsc (client + convex), build, 80 tests serveur ; captures (PC 1440 et téléphone 390) des pages et des cartes Suisse / full-art / classique.

## 6★ toujours en pleine illustration (07/11 soir, commit fead19d)
- **Décision Tom & Hugo** : les 6★ gardent UNIQUEMENT le design full art actuel, quel que soit le format de la photo (pas de design spécial, pas de Suisse). Les images non portrait des 6★ sont remplacées par des photos verticales.
- **Code** : `const dz = rarityId === 'mythic' ? dz0 : landscapeDesign(card, im, dz0)` (src/core/art/index.ts, artSteps). Le Suisse reste pour les 1★–5★ non portrait. Cache des cartes peintes `bebou-cartes-v10` (cardImages.ts) → toutes les miniatures sont repeintes.
- **État au 07/11** : 1 558 cartes 6★, dont 521 avec une photo non portrait (format > 0,82). Tant qu'une image n'est pas remplacée, la 6★ s'affiche en full art avec la photo recadrée (bandes coupées sur les côtés).
- **51 remplacées par Claude** (photos libres Wikimedia Commons, jaquettes verticales Steam pour FF VII / Arthur Morgan / Witcher 3) : 15 monuments (Trevi, Golden Gate, Tower Bridge, Atomium, Brooklyn Bridge, Duomo…), 2 Ardèche (Gorges, Chauvet 2), 25 animaux, 7 voitures (918 Spyder, F50, SF90, Gallardo, Valkyrie, DS, Mini), M&M's, Heinz. Même chemin, même extension, 900 px de large ; miniatures refaites. Originaux dans `sauvegardes/6etoiles-originales/` (hors git). Images hors git → partent sur R2 à la prochaine mise en ligne (art-rev monte leur révision).
- **470 restent à remplacer à la main** — liste complète : `6etoiles-images-a-remplacer.xlsx` à la racine du projet (colonne « Fait ? », chemin, taille actuelle, raison) :
  - 343 volontairement pas tentées : personnes réelles (artistes, sportifs, acteurs, YouTubeurs, personnages en photo de film/série), pochettes d'albums (carrées par nature, 162 cartes Musique), drapeaux (Pays), Summoners War (11).
  - 55 sans photo verticale libre trouvée (Nintendo, Bloodborne, Altaïr, Captain Price, des plats, des voitures, quelques monuments et animaux).
  - 72 avec des candidats refusés (photo floue, objet hors sujet, sujet trop petit, illustration ancienne…).
- **Comment remplacer** : photo verticale (largeur/hauteur ≤ 0,8, idéal 2:3 ou 3:4, ≥ 900 px de large) au MÊME chemin `public/art/…` et même extension, puis `npm run thumbs`, puis mise en ligne (lanceur). Script de Claude réutilisable : `.claude-tmp/scrape6/install.py` (sauvegarde + redimensionne + miniature).
