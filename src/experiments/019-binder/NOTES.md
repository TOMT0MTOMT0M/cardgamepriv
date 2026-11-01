# 019 — Collection 3D (BatchedMesh)

## Intention
Le plaisir du classeur : *voir* toute sa collection d'un coup, comme dans une salle de musée circulaire. On fait
tourner la salle d'un geste, une carte se soulève quand on la survole, et choisir une rareté fait ressortir ses
cartes pendant que les autres s'effacent. Valider aussi que des centaines de cartes tiennent à 60 fps.

## Techniques
- **Un seul `BatchedMesh`** (540 instances, géométrie de carte simplifiée) → un draw call ; r187 fusionne les draws
  consécutifs de même géométrie. Frustum culling par instance.
- **`DataArrayTexture`** : une couche par carte (12 faces + 1 dos, 256 × 358), remplie depuis les canvas procéduraux
  (retournement vertical manuel : pas de `flipY` sur une texture array).
- **Données par instance** via une petite `DataTexture` float (index de couche, tier) lue en `load(ivec2(batchIndirectIndex, 0))`.
  ⚠️ Découverte : `batchColor` (`setColorAt`) est **multiplié d'office dans la couleur diffuse** → inutilisable pour
  encoder des données (première version toute noire, documenté).
- Un seul matériau : face / dos / tranche choisis par `normalGeometry.z` (BatchedMesh = pas de groupes de matériaux).
- Défilement au drag avec élan ; **raycast par instance** (`batchId`) ; carte survolée soulevée par un ressort.
- Sélecteur de rareté à chaud (`setRarity`) : uniform → mise en avant sans reconstruire.
- Collection tirée avec des poids réalistes (55 % communes … 0,5 % mythiques).

## Nouveauté three.js utilisée
`BatchedMesh` sur WebGPU (fusion des draws r187), `batchIndirectIndex` TSL, `DataArrayTexture` + `.depth()`.

## Limites
- Pas de mipmaps sur la texture array (la génération auto laissait des niveaux vides → noir) : scintillement au loin.
  Correctif possible : calculer les niveaux sur CPU et les fournir via `mipmaps`.
- Les cartes ne sont pas éclairées individuellement (pas de foil dans le classeur).

## Pistes
- Mipmaps CPU + foil léger sur les rares (masque dans une 2e texture array).
- Classeur "pages" (feuilles qui tournent, 9 pochettes) plutôt que salle circulaire.
- Tri/filtre animé (les cartes volent vers leur nouvelle place).
