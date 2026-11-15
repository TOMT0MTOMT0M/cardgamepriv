---
description: Audit des illustrations 6★ (mauvaise personne, pas de visage, flou, placeholder, paysage)
---
Modèle conseillé : Gemini 4 Hydrogen (niveau High). Travail long et répétitif.

1. Liste les cartes 6★ : dans `src/core/sets/*.ts`, les lignes dont l'étoile vaut 6 ('m' = mythique). Récupère id,
   nom, sous-thème et nom de fichier image. Les images sont dans `public/art/<pop|sport|jv|monde>/`.
2. Regarde chaque image. Signale : personne/objet qui ne correspond pas au nom ; visage coupé ou absent pour une
   personne ; image floue ou < 400 px de haut ; capture avec interface ; logo/placeholder ; image paysage (largeur >
   0,82 × hauteur).
3. Écris `donnees/suivi/a-integrer/audit-images-JJ-MM/audit.csv` :
   `id;nom;sous-theme;fichier;probleme;gravite(haute/moyenne/basse);confiance;remarque`
   Seulement les cartes qui posent problème. Plus `LISEZMOI.txt` avec le total vérifié et les cas les plus graves.
