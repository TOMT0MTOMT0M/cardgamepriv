# BEBOU CARD — Spec BDD : Thème JEUX VIDÉO

> **Périmètre de ce fichier** : uniquement la **base de données du thème** — structure de la table, import et **rareté de chaque carte**. Les mécaniques de jeu (packs, probabilités de tirage, animations) sont gérées de votre côté.
> Contrairement aux autres thèmes, il n'y a **pas d'API ni de script de récolte** : le fichier Excel livré **est** la base de données finale, déjà triée et validée.

---

## 1. Vue d'ensemble

- **Contenu** : 3 396 cartes jeux vidéo — jaquettes de jeux, personnages cultes et quelques objets iconiques, toutes plateformes et toutes époques
- **Volume** : **3 396 cartes** réparties en **177 familles** (franchises ou regroupements cohérents : Mario, Tekken, Palworld, Classiques navigateur & Flash…)
- **Types de cartes** : `Jaquette` (1 781) · `Personnage` (1 577) · `Objet` (38)
- **Rareté** : étoiles **1★ à 6★**, déjà attribuées et validées par le groupe — **aucun tri à refaire**
- **Hiérarchie obligatoire** : `Thème → Famille → Carte` (ne pas aplatir les familles)

---

## 2. Fichier source : `Tri-etoiles-jeux-video.xlsx`

Feuille à importer : **« Tri étoiles »** (3 396 lignes + en-tête).

| Colonne | Contenu | À importer ? |
|---|---|---|
| `Thème` | « Jeux vidéo » partout | Oui |
| `Famille` | franchise / regroupement (177 valeurs) | Oui — **clé de regroupement** |
| `Carte` | nom de la carte (FR quand il existe) | Oui |
| `Type` | `Personnage` / `Jaquette` / `Objet` | Oui |
| `Étoiles` | rareté finale 1-6 | **Oui — LA donnée clé** |
| `Étoiles (avis initial)` | brouillon de travail avant validation | **Non — ignorer** |
| `Année` | année de sortie (quand connue, sinon vide) | Oui (optionnel, utile pour tris/affichage) |
| `Glissement quota` | indicateur interne de calage des quotas | **Non — ignorer** |

Les autres feuilles (`Résumé & quotas`, `Familles`, `Réserve`) sont des tableaux de bord de travail — ne pas les importer.

---

## 3. Table `cartes_jeux_video`

```sql
cartes_jeux_video (
  id        SERIAL PRIMARY KEY,
  theme     VARCHAR,          -- « Jeux vidéo »
  famille   VARCHAR,          -- 177 valeurs
  carte     VARCHAR,          -- nom affiché
  type      VARCHAR,          -- Personnage | Jaquette | Objet
  etoiles   INT,              -- 1 à 6
  annee     INT NULL,         -- année de sortie ou NULL
  UNIQUE (famille, carte)     -- clé métier : PAS le nom seul
)
```

⚠️ **La clé de déduplication est `(famille, carte)`, jamais `carte` seule** — voir §5.

---

## 4. Rareté : déjà figée

Distribution finale (ne pas recalculer, ne pas rééquilibrer) :

| Étoiles | Cartes | Part |
|---|---|---|
| 1★ | 1 356 | 39,9 % |
| 2★ | 841 | 24,8 % |
| 3★ | 552 | 16,3 % |
| 4★ | 321 | 9,5 % |
| 5★ | 229 | 6,7 % |
| 6★ | 97 | 2,9 % |

Le quota théorique (~31/23/20/11/9/4 %) a été **volontairement assoupli** par le groupe : la distribution ci-dessus est la référence finale.

---

## 5. Points d'attention pour l'intégration (les seules « adaptations »)

Le site contient déjà les packs Pokémon (1 026), LoL champions + skins (2 121), Valorant (996) et CS (1 108). Le pack JV a été vérifié contre ces 4 packs : **aucun doublon réel**. Il reste 3 points à connaître :

### a) 8 homonymes avec des champions LoL — ce sont des personnages DIFFÉRENTS

| Carte JV | Famille JV | Homonyme sur le site |
|---|---|---|
| Jax | Mortal Kombat | Jax (LoL) |
| Ashe | Overwatch | Ashe (LoL) |
| Morgana | Persona | Morgana (LoL) |
| Twitch | Rainbow Six | Twitch (LoL) |
| Katarina | Tekken | Katarina (LoL) |
| Leona | The King of Fighters / Fatal Fury | Leona (LoL) |
| Fiora | Xenoblade | Fiora (LoL) |
| Riven (jaquette du jeu de 1997) | Ubisoft divers | Riven (LoL) |

→ Garder les deux versions de chaque nom. D'où la clé `(famille, carte)` et non `carte` seule.

### b) Famille « Pokémon (jeux) » — 23 cartes, complémentaires du thème Pokémon

Ce sont les **jaquettes des jeux** Pokémon (Rouge/Bleu 6★, Or/Argent 5★, etc.). Le thème Pokémon déjà en ligne contient les **créatures** (1 026 cartes). Aucun nom en commun, aucun doublon : les deux cohabitent.

### c) Famille « Valve divers » — les jeux CS, distincts des skins CS

`CS:GO` (6★), `Counter-Strike 1.6` (3★), `Counter-Strike 2` (2★), `Counter-Strike: Source` (1★) sont les **jaquettes des jeux eux-mêmes**. Le pack CS déjà en ligne = 1 108 skins/couteaux/gants. Aucun doublon.

---

## 6. Visuels

Aucune image n'est fournie avec ce pack (contrairement aux thèmes API). À gérer côté dev :

- **Jaquettes** : cover officielle du jeu (bases type IGDB / SteamGridDB, ou assets presse)
- **Personnages / Objets** : artwork ou render officiel
- Nommage conseillé : `jv-{famille-slug}-{carte-slug}.png`

---

## 7. Checklist import

1. Lire la feuille « Tri étoiles » de `Tri-etoiles-jeux-video.xlsx`
2. Importer colonnes `Thème, Famille, Carte, Type, Étoiles, Année` — **ignorer** « Étoiles (avis initial) » et « Glissement quota »
3. Contrainte `UNIQUE (famille, carte)`
4. Vérifier : 3 396 lignes, 177 familles, 97 cartes 6★
5. Après import, le super-thème gaming du site passe à **≈ 8 640 cartes** (5 247 + 3 396)
