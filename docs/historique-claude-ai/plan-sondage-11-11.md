# Plan tiré du sondage « maj-2026-11 » (11/11)

**État (11/11, après les réponses de Tom) : classeurs épinglés faits sur v2 ; refonte des échanges proposée, à valider ; le reste en attente.**
Source : captures du dashboard admin (prod) envoyées par Tom le 11/11.

## Résultats (11 réponses)
- **Note : 4,5 / 5** (six 4★, cinq 5★, aucune note sous 4).
- **Univers** : Nos cartes 6 · Jeux vidéo 4 · Films & séries 3 · Animes 2 · Esport & streamers 2 · Musique 1 · Le Monde 1 · Sport 0.
- **Nouveautés** (3 choix max par joueur) : Événements limités 5 · Animations d'ouverture 4 · Mini-jeux 3 · Échanges & marché 3 · Saisons & classements 3 · Défis entre amis 2 · Missions 1 · Profil 1 · Appli & notifications 1.
- **Réponses écrites (4)** :
  - Fhasa : esport LoL, Warcraft (persos principaux), persos d'Arcane. Ne peut pas « observer » les 5★ et 6★.
  - Judepomme : cartes Ines et Juliette, émissions télé (Star Ac, Koh-Lanta). Difficile de savoir qui détient une carte. Veut 2-3 classeurs sur le profil.
  - Bébou Magizz : trop de pièces, veut les dépenser en boosters.
  - Teto : « KYARA>BEBOUCARD », pas de demande exploitable.
- Lecture : 11 réponses, donc un écart d'une ou deux voix ne départage rien. Seuls les extrêmes sont nets.

## Décisions de Tom (11/11)
- **Bug 5★/6★ de Fhasa** : il n'a sans doute pas fait la mise à jour. Rien à faire.
- **Qui possède une carte, échanges** : pas de rustine. Refonte complète du système, voir `claude/refonte-echanges-11-11.md` (proposition à valider).
- **Boosters en pièces** : on laisse comme c'est (250 pièces, 10 par jour).
- **Classeurs sur le profil** : validé, fait.
- **Contenu** (Ines et Juliette, Warcraft, Arcane, esport LoL, émissions télé) : Hugo s'en occupe, Claude n'y touche pas.

## Fait
**Jusqu'à 3 classeurs épinglés sur le profil** — v2 `75ce59a`, pas poussé.
- Épingler un classeur ne retire plus les autres ; le 4e est refusé avec un message.
- Le profil affiche un bloc par classeur : 24 cartes s'il est seul, 12 chacun à plusieurs, « + N autres » déplie.
- Aucun changement de schéma. Le serveur renvoie la liste `pinnedBinders` et garde `pinnedBinder` (le premier) pour un jeu pas à jour.
- Vérifié : type-check jeu et serveur, 135 tests serveur (dont 2 nouveaux, `convex/binders.test.ts`).
- Pas vérifié : le rendu à l'écran (pas de navigateur ici).

## Reste, dans l'ordre
1. **Refonte des échanges** (après validation de la proposition).
2. **Événements limités** (5 voix, V2) : chaque arrivée de contenu de Hugo sort comme un booster du moment. Format à écrire avant de coder.
3. **Animations d'ouverture à débloquer** (4 voix, V2) : à gagner par les succès, décidé le 07/11.
4. Ensuite : saisons avec récompenses, nouveaux mini-jeux, défis entre amis.

Pas prioritaire : Sport (0 voix), Musique, Le Monde, personnalisation du profil. Appli & notifications est déjà fait sur v2.

## Outils ajoutés
- `lanceurs\exporter-sondage.cmd` (v2 `bf21170`, pas testé sur la vraie base) : toutes les réponses dans `logs\sondage-reponses.json`.
- Tests depuis le VM Linux : les binaires de `node_modules` sont ceux de Windows. TypeScript et rolldown Linux sont installés à part dans le VM (`~/tools`), avec `--fsModuleCache=false` pour vitest. À refaire à chaque nouvelle session.
