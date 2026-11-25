# Teto lenticulaire + Bébous Magizz / Asluck (11/11) — v1.0.17

Master 20de42a (tag v1.0.17), fusionné dans v2 (f03a851, conflit `viewer.ts` résolu). Mise en ligne : `.wt-master\METTRE-EN-LIGNE-v1.0.16.cmd`. Il pousse master (v1.0.16 et v1.0.17) et tous les tags, puis déploie le HEAD de master. Le lanceur v1.0.17 n'a pas pu être écrit sur le PC (refusé par la sécurité).

## Teto (KCDQ), carte horizontale et lenticulaire
- Photos : image 1 = allongé (`kcdq-teto.jpg`), image 2 = assis (`kcdq-teto-2.jpg`), 1024×576, même recadrage pour les deux (`focusX` 0,62).
- Carte couchée : même maillage, gabarit Bébou repeint au format paysage (`designs/bebou.ts paintBebouFrame`, `art/index.ts landscapeSteps`). L'aplat 2D est rendu à l'endroit : la tuile de collection montre la carte entière.
- Visionneuse : après l'entrée, la carte se couche d'un quart de tour, la caméra recule puis se pose (`viewer.ts`). Séquence secrète (039) : même chose après la vrille. Ouverture : couchée dès qu'elle est face visible.
- Lenticulaire (`core/lenticular.ts`) : nervures de 0,6 mm parallèles au petit côté, donc verticales une fois la carte couchée. Image 1 de face ou penchée à gauche, image 2 au-delà de 5° vers la droite, retour à l'image 1 vers 25° à gauche.
  - Pendant la bascule : balayage le long de la carte, fines rayures et liseré sombre.
  - Vernis épais strié (clearcoat 0,45 avec relief des nervures). Pas de foil irisé sur la photo.
  - Réglages en tête du fichier : `LENTICULAR` et `lensCoat` dans `holo.ts`.
- Physique : pour un basculement gauche / droite, les nervures doivent être verticales. Des nervures horizontales feraient basculer en penchant haut / bas.

## Bébous
- n°1 Magizz (`bebou-1.jpg`), n°2 Asluck (`bebou-2.jpg`), ids inchangés (`bebou-1`, `bebou-2`).
- Les Bébous restent verrouillées : aucun tirage.

## Vérifié
- Type-check, tests (master 122, v2 133) et build OK.
- Visionneuse en démo, PC et téléphone : pose couchée, bascule gauche / droite, tuiles 2D.

## Pas vérifié
- L'animation elle-même : le rendu headless est trop lent pour la voir.
- La séquence secrète avec Teto.
- Le réglage de la bascule au gyroscope sur un vrai téléphone.

## Test en démo
- `?force=kcdq-teto` sur un Bébou pack.
- Ou ajouter la carte à la sauvegarde démo.
