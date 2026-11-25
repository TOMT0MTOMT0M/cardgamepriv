# Refonte de la personnalisation du profil : compte rendu (14/11)

Statut : **en ligne pour les joueurs depuis le patch v2.0.9 (14/11, 23 h 50)**. Un commit de plus attend sur `v2` en local (`b5c3a41`, passage d'office par « Personnaliser ») : à pousser et publier en v2.0.10. Étude de finition : https://claude.ai/artifact/PSgQawP6j6vdW94WGnLKY4

## Ce qui a changé

- **Atelier « Personnaliser »** (plein écran) : aperçu vivant toujours visible. Téléphone : collé en haut, bascule Profil / Vitrine / En liste. PC : colonne à gauche, grille à droite. Annuler / Enregistrer dans la barre du haut. Crayons sur la photo et la bannière.
- **Tuiles** de même taille, élément dessiné en vrai. Équipé, Nouveau, Verrouillé (élément intact, cadenas, « 14/25 »). Un verrouillé s'essaie dans l'aperçu, jamais enregistré.
- **41 nouveautés** : 13 fonds, 13 cadres dessinés, 9 écritures de titre, 6 vitrines. Les 6 cadres animés existants sont redessinés (mêmes ids). Zéro emoji dans l'atelier et sur les badges.
- **Tout se gagne dans les succès** : plus rien de libre, sauf « Aucun » et l'écriture d'origine. Pas de lien entre beauté et difficulté.
- **Succès : 49 paliers de plus (137)**, du très facile au très long, et une échelle « Tous les thèmes ». 20 nouveaux paliers donnent un élément, 29 des pièces et des boosters.
- **Accords** (10) : cadre + fond de la même matière = un plus derrière la photo.
- **Fonds animés** : Braise, Orage, Nébuleuse, Synthwave en shader léger (demi-résolution, 30 images/s sur téléphone, pause hors écran, retiré sous 50 images/s).
- **Chat, amis, classement** : photo ronde + cadre fixe, titre dans son écriture, par la carte publique (`presence.cos`), sans requête en plus.
- **Pièces en fin d'ouverture** (v2.0.9) : compteur figé pendant la révélation, puis un seul versement animé (pièces qui filent, jauge, montée de tintements).
- **Passage d'office par « Personnaliser »** (15/11, `b5c3a41`) : à sa prochaine visite, chaque joueur est amené une fois sur son profil, atelier ouvert, avec un message d'une ligne. Une fois par compte (`users.atelierSeenAt`), quel que soit l'appareil. Pas pour un compte tout neuf, jamais pendant une connexion, une ouverture, une fenêtre ou un tour ; il referme quand il veut. Rejouer pour un joueur : `npx convex run admin:resetAtelier '{"name":"pseudo"}'`. Test : `?atelier` dans l'adresse.
- **Serveur** : champs `v.optional` seulement (`users.cosmetics.background`, `titleStyle`, `presence.cos`, `users.atelierSeenAt`). Aucune migration.

## Conséquences à connaître

- **Niveau Bébou** : il compte tous les paliers, donc il monte pour tout le monde ; paliers à 75 et 100 ajoutés.
- Les 20 nouveaux paliers « élément » ne donnent pas de pièces (règle d'origine).
- Passage d'office : un joueur d'avant la V2 qui revient pour la première fois a d'abord son tour des nouveautés ; l'atelier s'ouvre à la visite suivante.

## Vérifié

`tsc`, `check:i18n` (0), `vitest` (42 fichiers, 237 tests), `vite build`, sur une copie du dépôt. Rendu en démo, PC et mobile : atelier, profil, classement, succès, chat et amis. Passage d'office : ouverture depuis l'accueil (téléphone) et depuis le profil déjà affiché (PC), fermeture sans réouverture, rien sans le paramètre de test en démo.

## Performance (machine de test sans carte graphique, démo)

| | Avant | Après |
|---|---|---|
| Ouverture du panneau, PC | 8,5 ms | 10 à 14 ms |
| Ouverture, téléphone simulé (processeur ÷ 4) | 32 ms | 38 à 47 ms |
| Images/s, panneau ouvert | 60 | 60 ; 57,7 avec fond Braise + accord Feu + titre Néon |

Pas de gain à l'ouverture, fluidité tenue. Pas des chiffres de vrai téléphone.

## À faire par Tom

1. `lanceurs\mettre-en-ligne-v2.cmd`, puis sur le lien V2 ajouter `?atelier` à l'adresse pour voir le passage d'office.
2. `lanceurs\publier-patch.cmd` pour l'envoyer aux joueurs (v2.0.10).

## Pas vérifié / restes

- Passage d'office avec un vrai compte en ligne (champ serveur lu, marquage) : couvert par le test serveur, pas vu à l'écran.
- Fond animé sur la vraie page Profil, photo importée réelle, vrai téléphone, son des pièces.
- Quelques anciennes clés de texte (`pf.*`) ne servent plus et restent en place.
