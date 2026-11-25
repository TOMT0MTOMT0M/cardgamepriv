---
name: cr
description: Fin de session — met à jour docs/chantiers/EN-COURS.md et écrit le compte rendu d'une page du chantier.
disable-model-invocation: true
---
# /cr — passation de fin de session

0. `docs/chantiers/` est dans le dossier racine (branche `v2`) : depuis `.wt-master/`, utiliser `../docs/chantiers/` et commiter ces docs depuis le dossier racine.
1. Mettre à jour `docs/chantiers/EN-COURS.md` en gardant son format : chantier, dossier/branche, fait (+ hash du dernier commit), reste (cases à cocher), vérifs à relancer, pièges rencontrés. Libérer les fichiers réservés.
2. Compte rendu dans le fichier du chantier `docs/chantiers/<chantier>.md`, 1 page max : Fait / Vérifié / À vérifier par Tom / Reste. Le mettre à jour s'il existe, ne jamais créer un deuxième document pour le même chantier.
3. Commiter seulement ces fichiers (`docs(chantier): …`), pousser la branche si ce n'est pas `master`.
4. Répondre en 5 lignes max : ce qui a changé, ce que Tom doit vérifier, puis « tu peux faire /clear ».
