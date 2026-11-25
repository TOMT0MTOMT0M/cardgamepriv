# Retours live 04 — avancement (07/11)

Commit `3d0e8ba` (local, à pousser avec `lanceurs/push-et-mettre-en-ligne.cmd`).

1. **Gros tirages** : la vraie carte seule (plus de bandeau « Légendaire » / « 6★ », plus de nom en dessous), autour : joueur + « il y a X h ». Clic = la carte en grand, même visionneuse que la Collection.
2. **Page pack** : barres « chances par carte » au code rareté — gris, vert, bleu, rouge, doré, arc-en-ciel (étoiles et pourcentages aussi).
3. **En-tête** : boosters en bleu (icône, nombre, barre), pièces dorées, flamme orange, missions vertes, pity en arc-en-ciel.
4. **Étoiles 6★ arc-en-ciel** sur tous les gabarits de carte (plus de gris / aluminium).
5. **Suisse paysage** : étoiles remontées (y 90 → 56) — plus de chevauchement avec un nom long.
6. **14 Merveilles** : miniature = capture statique du design 3D (cadre + diorama), dans `public/art/merveilles/cartes3d/` (envoyées sur R2 à la mise en ligne). La vue détail garde la 3D interactive. Outil pour régénérer : `outils/capture-merveilles.html` (npx vite → ouvrir la page, `?webgl` pour WebGL2).
7. **Missions** : vert = terminée/réclamée, blanc = en cours, gris atténué = pas commencée. **Connexion** : jours faits en vert, aujourd'hui en blanc mis en avant (vert une fois le cadeau pris), paliers ×2 et jour 30 dorés.
8. **Récompenses** : 10 boosters par semaine de connexion d'affilée (au lieu de 5) ; mois parfait = jour 30 : 1 000 pièces + 1 booster + **50 boosters**. Textes du panneau, du toast et du tutoriel mis à jour.

Les cartes déjà peintes dans le cache des joueurs sont repeintes automatiquement (version du cache montée).

Vérifié : tsc (site + serveur), 92 tests serveur, build ; rendus : cartes (Thomas Magnum 6★ / 5★, Kurena 6★), les 14 captures, en-tête et pack PC/mobile, missions, connexion.
