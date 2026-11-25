# Sortie V2 en prod : samedi 14/11, réouverture 20 h

## Bilan (14/11, 18 h 45)
- **v2.0 en ligne** sur `cardgamepriv.pages.dev` (17 h 52–17 h 57), même base Convex. Migrations OK, 0 image manquante sur R2.
- **Bilan des données : 0 perte**, 25 joueurs → 25, 0 étoile changée, 0 carte disparue.
- Sauvegarde de référence : `sauvegardes\v1\base-2026-11-14-1748.zip`. Le zip `avant-patch-v2.0-*` est vide (bug de `publier-patch`, corrigé).
- Annonce Discord envoyée avec le visuel V2 (`scripts/annonce-sortie-v2.mjs`).

## v2.0.1 (prête sur `v2`, dernier commit `dbc2674`)
- Boosters en pièces sans plafond quotidien (250 pièces, 10 au plus par achat).
- **Retours de Hugo fusionnés** : onglet **Marché** ; **vendre / échanger directement dans « Pour toi »** (en tête, puis les échanges tout faits, puis mes annonces) ; prix moyen des ventes ; succès en pastilles (« 2/7 », un toucher déplie ce qui manque) ; classement « ta place » ; roue de la roulette ; booster du moment dans la roue.
- Tous les textes traduits en anglais (`check:i18n` : 0 texte en dur).
- Chat général sans drops ; « @ pour citer » dans le champ.
- Anglais : heure des Gros tirages et onglets qui affichaient une clé brute ; fiche booster refaite au changement de langue.
- Visionneuse : Rejouer en haut au milieu, carte plus petite, en bas Protéger · Couverture · Classeur puis Je la veux · 👤 · Image à revoir ; boutons qui s'effacent avec le zoom.
- Collection : barre de filtres collée au header ; onglets aux rayons concentriques.
- **6★ plein cadre** : 95 recadrées ; 74 à remplacer ; Excel de toutes les 6★ : `donnees/suivi/6etoiles-full-art-14-11.xlsx`.
- Vérifié : typecheck, 222 tests serveur, build (avant les deux derniers lots côté client : typecheck seulement).

## Reste ce soir
| Heure | Qui | Action |
|---|---|---|
| maintenant | Tom | `publier-patch.cmd`, numéro **2.0.1**, PUBLIER |
| jusqu'à 19 h 40 | Tom + Hugo | Tests en prod |
| 19 h 40 | Tom | **GO / NO-GO**, puis `/admin/` → Cadeau à tous : 50 boosters |
| 20 h 00 | auto | Ouverture |

## Pour v2.0.2
- 520 6★ en portrait mais petites (< 380 px) : les images « floues » ; colonne « remarque » de l'Excel. Caracal à recadrer à la main (World V1).
- Note de patch « Version 2 » : « certaines de tes cartes ont changé d'étoile » est faux.

## Retour arrière
- Retour à la V1 = restaurer `sauvegardes\v1\base-2026-11-14-1748.zip`, puis le code `v1.0.24`. Après 20 h, on corrige seulement en avant. **Ne jamais lancer la remise à zéro complète.**

## Après la sortie
- `v2` reste la branche de travail : badge « V3 — test », dimanche `rafraichir-staging-v2.cmd`. `.wt-master` sert aux **v2.0.X**.
