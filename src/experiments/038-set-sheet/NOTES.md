# 038 — Planche de contrôle du set

## À quoi ça sert
Vérifier d'un coup d'œil qu'un set d'illustrations « passe » dans le système : toutes les cartes du set actif,
rendues avec le vrai pipeline (calques → cadre → aplati), au gabarit choisi. Ce n'est pas une expérience visuelle,
c'est l'outil de recette des images.

## Ce qu'on y lit
- En-tête : illustrations chargées / attendues, nombre de fonds détourés, nombre de sources basse résolution,
  répartition des raretés du set, liste des URL en échec.
- Badges par carte : `échec` (404 / image illisible → silhouette d'attente), `160px` (source < 256 px, agrandie ×3,
  donc douce), `détourée` (fond blanc opaque retiré au chargement).
- Clic : grand format + source détourée sur damier (pour juger le détourage) + palette extraite (teinte, chroma, 6 couleurs).

## Panneau
`set` (mémorisé, s'applique à toutes les expériences) · `gabarit` (les 10 designs) · `rareté affichée`
(naturelle de la carte, ou celle de la barre d'outils) · `filtre` (basse déf, détourées, en échec).

## Fichiers
`src/core/art/images.ts` (chargement, détourage, recadrage, palette), `src/core/art/imageSubject.ts` (peinture
du sujet « image »), `src/core/sets/pokemon151.ts` (données du set). Styles locaux à l'expérience : `style.css`
appartient à l'infra.
