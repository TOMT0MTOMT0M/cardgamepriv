# Mission : récolter les modèles 3D des 149 skins CS (cartes 5★ et 6★)

Tu prépares les fichiers 3D d'un jeu de cartes privé (≈20 amis, non commercial). Chaque carte 5★/6★ « Skins CS » affichera son skin en 3D temps réel (three.js, sur téléphone) à l'intérieur de la carte. Je m'occupe du code ; toi, tu trouves, télécharges et documentes les fichiers. Ne code rien, n'optimise rien, ne convertis rien.

## Entrée
`cs-3d-5-6-etoiles.csv` (joint, séparateur `;`) : 149 lignes = 131 couteaux, 8 gants, 5 armes, 5 stickers. Colonnes : num, id, nom_marche_steam, etoiles, type, modele, rarete_in_game. L'`id` est la clé : réutilise-le tel quel partout, ne le modifie jamais.

## Ce qu'il faut récolter, en 3 couches

### Couche 1 — les 22 modèles de base (un par `modele`)
AK-47, AWP, M4A4, Bayonet, Bowie Knife, Butterfly Knife, Classic Knife, Falchion Knife, Flip Knife, Huntsman Knife, Karambit, M9 Bayonet, Nomad Knife, Paracord Knife, Skeleton Knife, Stiletto Knife, Talon Knife, Ursus Knife, Hand Wraps, Moto Gloves, Specialist Gloves, Sport Gloves.
Pour chacun : le maillage CS2 (ou CS:GO si absent) avec ses UV d'origine, en .glb/.gltf de préférence, sinon .fbx/.obj/.smd/.dmx. Avec TOUTES ses textures de base, indispensables pour poser la peinture : couleur, normal, rugosité, et surtout les masques (ambient occlusion, cavity / surface, masques de matériau « masks1 / masks2 », masque d'usure). Pour le Butterfly Knife : le modèle articulé (lame + 2 manches) si possible. Pour les gants : la version « monde/ramassable » ou la version mains + bras, dis laquelle.

### Couche 2 — l'apparence de chaque skin (144 finitions)
Je recompose moi-même chaque skin sur le modèle de base, comme le fait le jeu. Ce qu'il me faut, par ordre d'importance :
- A. Les données de la peinture : nom interne du paint kit (ex. `am_doppler_phase2`), style (Custom Paint, Gunsmith, Hydrographic, Spray-Paint, Anodized, Anodized Multicolored, Anodized Airbrushed, Patina…), fichier(s) de motif (pattern) TÉLÉCHARGÉS, couleurs (4 valeurs RGB), échelle et rotation du motif, plage d'usure, valeurs de phong / rugosité / métal, et comment le pattern seed décale le motif. Sources possibles : items_game.txt, dépôt GitHub SteamDatabase/GameTracking-CS2, fichiers .vcompmat / .vmat, dépôts d'extraction de textures CS.
- B. Si le skin existe déjà « cuit » (textures couleur / normal / rugosité calées sur les UV du modèle de la couche 1, ≥ 2048 px) : prends-les aussi.
- C. Un modèle 3D complet du skin, téléchargeable gratuitement (ex. Sketchfab « Downloadable ») : seulement en secours si A et B manquent. Note la licence.

Les finitions communes à plusieurs couteaux (Fade, Doppler, Gamma Doppler, Marble Fade, Case Hardened, Crimson Web, Slaughter, Tiger Tooth, Lore, Autotronic, Black Laminate, Damascus Steel, Ultraviolet, Blue Steel, Stained…) n'ont besoin des données A qu'une seule fois : range-les dans `peintures/<nom-finition>/`. Pour B et C, il faut la version propre à chaque couteau (les UV diffèrent).

Choix de variante quand le skin en a plusieurs : état Factory New (sinon Minimal Wear), sans StatTrak, sans sticker ni nametag. Doppler et Gamma Doppler : Phase 2 (prends aussi Ruby / Sapphire / Emerald si trouvés, en bonus). Marble Fade : Fire & Ice. Fade : fondu complet (~100 %). Case Hardened : un « blue gem » connu (note le pattern seed). Les autres : un pattern seed courant, noté.

### Couche 3 — les 5 stickers
Image du sticker seule, fond transparent, ≥ 1024 px, plus la texture holo / foil si elle existe séparément.

### Pour chaque carte, en plus
- `reference.png` : une capture d'inspection en jeu ou un rendu haute définition du skin exact (sert à comparer la fidélité de ma 3D), sans watermark ni interface.
- `annee` : année d'arrivée du skin dans le jeu ; `caisse` : caisse ou collection d'origine.

## Règles
- Gratuit uniquement : aucun achat, abonnement, compte payant ni crédit. Pas de site de modèles payants.
- Rien de généré par IA, rien d'agrandi artificiellement, aucun fichier « recréé à la main » présenté comme l'original : si c'est une reproduction de fan, dis-le dans `notes`.
- Vérifie que c'est le bon skin (nom ET finition) avant de le garder : compare à l'icône du marché Steam.
- Ne télécharge rien d'exécutable (.exe, .bat, .msi, scripts, installeurs, « outils d'extraction »). Seulement des fichiers 3D, images, textes et JSON.
- Si tu ne trouves pas, écris `INTROUVABLE` et passe à la suite. N'invente jamais un lien, une valeur ou un nom interne.
- Garde l'URL de la page et l'URL directe de chaque fichier.

## Livrable : un seul zip `cs-3d.zip`
```
cs-3d/
  modeles/<modele>/            ex. modeles/Karambit/karambit.glb + textures
  skins/<id>/                  un dossier par ligne du CSV (B ou C + reference.png)
  peintures/<nom-finition>/    données A partagées (motifs + peinture.json)
  stickers/<id>/
  manifest.csv
  modeles.csv
  RAPPORT.md
```
`manifest.csv` (séparateur `;`, une ligne par id du CSV, les 149 présentes) :
`id;nom_marche_steam;niveau(A|B|C|INTROUVABLE, plusieurs possibles ex. A+B);fichiers;modele_base;paint_kit_interne;style;pattern_seed;usure;annee;caisse;page_source;url_fichiers;licence;auteur;notes`

`modeles.csv` (22 lignes) : `modele;fichier;format;jeu(CS2|CSGO);nb_triangles_si_connu;textures;page_source;licence;notes`

`peinture.json` par finition (champs vides si inconnus, jamais inventés) :
`{"finition":"","paint_kit_interne":"","style":"","pattern":["fichier.png"],"couleurs":[[r,g,b],[r,g,b],[r,g,b],[r,g,b]],"echelle_motif":null,"usure_min":null,"usure_max":null,"phong":null,"sources":[""]}`

`RAPPORT.md` : combien en A / B / C / INTROUVABLE, les modèles de base manquants, les doutes.

Commence par la couche 1 (sans elle, la peinture ne se pose sur rien), puis les 6★ de la couche 2, puis les 5★, puis les stickers.
