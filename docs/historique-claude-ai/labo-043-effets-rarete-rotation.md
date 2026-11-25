# Labo 043 — effets de rareté, rotation et matières (05/11)

Expérience `043-rarity-fx` : 35 effets (5 par palier, 1★ → secrète). Commits 7ba320e (création), 0b191fb (rotation), 388f085 (fin du holo), d6e0088 (vitrine, pièce, cristal, budget). Non poussés à la date — on pousse une fois fini.

## Décision du 05/11 : plus d'arc-en-ciel sur l'illustration
Le « holo » (film mince / spectre balayé) est jugé horrible, ni élégant ni novateur. Remplacé par des MATIÈRES : impression de luxe, billets de banque, horlogerie, laque et or, gemmes, papier découpé, photographie ancienne, verre. Les effets réagissent tous à la ROTATION réelle de la carte (souris, gyroscope, glisser, torsion), via `RotationRig` (kit.ts) : orientation, vitesse, énergie, inertie (ressort), chemin cumulé, coup de poignet, torsion, essuyage.

## Garde-fous intégrés (du rapport de recherche du 05/11)
- `printGuard` : min(high, max(0,5, 1 − low)) — les noirs de l'illustration restent noirs, les blancs reçoivent moitié moins.
- `alive` : « quasi nul de face » — l'effet n'existe presque qu'en inclinaison / mouvement.
- `cellFlash` : une facette par cellule (Voronoï précalculé) s'allume quand l'orientation passe par son angle.
- Ombres par mip flouté (0 passe), reflet « boîte à lumière » (rectangle arrondi), lampe en bande (`strip`).
- `noSubject` : le sujet dessiné sur un vrai plan devant la carte (hors cadre).
- `CardBackdropNode` : copie PARTIELLE du framebuffer (rectangle de la carte + marge) pour la carte Cristal ; UV reconstruit depuis screenUV, même formule WebGL2 / WebGPU ; format aligné sur la cible (HalfFloat sous post-traitement).
- Budget de particules adaptatif (`adapt`) : image > 24 ms pendant 1,5 s → ×0,85, plancher 0,4, ne remonte jamais avant un rebuild.
- Mode « vitrine » (`?vitrine`) : la carte reste à plat, c'est l'œil qui bouge — frustum asymétrique (projection hors-axe, pokebox / Kooima). Sur mobile, le gyroscope fait la fenêtre.

## Les 35 effets (v4)
1★ Reflet de vitrine · Liseré argent · Grain papier · Coin lumineux · Sceau gaufré
2★ Vernis sélectif · Balayage · Paillettes de cadre · Métal tourné · Titre gravé
3★ Encre à variation optique · Kintsugi · Cadran soleil · Pierre de lune · Double plan
4★ Théâtre de papier · Émail guilloché · Profondeur · Encre vivante · Givre
5★ Or liquide · Verre épais · Labradorite · Aurore · Caustiques
6★ Dichroïque · Daguerréotype · Hors cadre · Cristal (dalle transparente, fond d'écran partiel) · Poussière d'étoiles
Secrète : Carte vivante · Cosmos infini · Lumière propre · Pièce secrète (interior mapping, atlas 2×2) · Bioluminescence

## Pistes restantes
Cartes relightables façon RTI (musées) si un jour on photographie de vraies cartes ; rendu à la demande quand tout est au repos ; mode vitrine avec webcam (MediaPipe) sur PC.

## URL utiles
`?exp=043-rarity-fx&rarity=<palier>&view=planche&q=low|mid|high&demo&vitrine&nobloom&src=kcdq&card=N`

## À vérifier sur appareil
WebGPU (non testable sans GPU ici ; surtout la copie partielle du framebuffer et la projection hors-axe), gyroscope + torsion sur Android / iPhone, contrôle de lisibilité ΔE, ressenti du mouvement.
