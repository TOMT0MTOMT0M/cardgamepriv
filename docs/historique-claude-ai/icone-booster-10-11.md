# Icône « booster déchiré » — 10/11

**Statut : commité sur v2 (7f5982e, sur le PC), pas encore poussé ni en ligne.** Prod non touchée.

## Ce qui est fait
- Rendu 2800 px de la vraie scène d'ouverture : déchirure simulée (bake), bande arrachée, 5 cartes en escalier qui dépassent de 4,5 % (devant) à 10 % (fond).
- Fichiers (nouveaux noms, les anciens restaient en cache SW / Discord) :
  - `public/icons/booster-{180,192,512}.png`, `booster-maskable-512.png`
  - favicon recadré sur le haut déchiré : `booster-fav-{16,32,48}.png`, `public/favicon.ico`
  - aperçu de lien : `public/og-booster.jpg` (booster à gauche, BÉBOU + phrase à droite)
- Branchés dans `index.html`, `jeu/index.html`, `admin/index.html`, `manifest.webmanifest`, `sw.js` (notifications), `vite.config.ts` (précache).
- En build v2, l'aperçu de lien pointe vers `v2.cardgamepriv.pages.dev` (plugin `og-v2`).
- Crochet de test `opening.pose({exit, strip, cards})` : fige la sortie simulée et pose les cartes.

## Refaire le rendu
Jeu en `?demo&backend=webgl`, ouvrir un booster, déchirer, `slowMo(0.004)`, puis
`pose({exit:0.7, strip:false, cards})` avec x de base −0,012 (sinon le coin droit traverse le film), capture à 2800 px.

## À vérifier
- Icône sur l'écran d'accueil (réinstaller l'appli : Android/iOS gardent l'ancienne icône).
- Onglet du navigateur, aperçu du lien v2 dans Discord.
- Bande beige en bas du sachet : reflet du jeu, laissé tel quel.
