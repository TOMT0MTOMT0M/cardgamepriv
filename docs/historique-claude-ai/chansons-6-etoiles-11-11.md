# Chansons 6★, Finn, retrait de Depardieu (11/11) — sur v2, commit `59977d4`

## Ce qui change (Pop Culture)
- **56 nouvelles chansons 6★** (sous-thème Chansons, N° 17478 → 17533) : variété FR, rap FR, classiques, openings d'animés. Pochettes Deezer / iTunes (1000 px) ; œuvres classiques : images Wikimedia (partitions, Tchaïkovski, illustration Rackham pour les Walkyries).
- **Finn l'Humain** (Adventure Time) 6★, N° 17534 (nom « Finn l'Humain » : « Finn » est déjà le Finn de Star Wars).
- **15 chansons passent en 6★** (`RERATE_11_11` dans curation.ts) : Locked Out of Heaven, Running Up That Hill, Take on Me, Wonderwall, In the End, Californication, Uprising, Dream On, Every Breath You Take, L'Aziza, Face à la mer, Petite Marie, Cette année-là, Ne me quitte pas, La Boulette. Déjà 6★ : Mon fils ma bataille, Petit frère, Désolé, On verra, Naha.
- **Gérard Depardieu** retiré (ajouté à `PURGE_BRUEL` : catalogue + collections par `migrations:purgeCards`).
- Extraits de 30 s pour les 72 chansons (choix manuels → iTunes / Deezer). Corrigé : « On verra » jouait Angèle, c'est Nekfeu.

## Choix faits
- « Yoasobi » → **Idol** (Oshi no Ko). « Caravane » de Raphaël et « Closer » de Joe Inoue sont de nouvelles cartes : les cartes « Caravan » et « Closer » (Chainsmokers) existantes ne bougent pas.
- « Or noir » (Kaaris) = morceau-titre : même pochette que « Zoo ».
- Total Pop affiché : sur 17 534 (au lieu de 17 477).

## Vérifié
Typecheck, 136 tests serveur ; catalogue : Depardieu absent, nouvelles cartes et chansons renotées en 6★.

## À vérifier par Tom
1. `lanceurs\mettre-en-ligne-v2.cmd` (envoie les 57 nouvelles images sur R2, renote, purge Depardieu).
2. Sur le V2 : quelques nouvelles 6★ (Unravel, Lettre à Élise, Finn) et leur extrait.
3. Pochettes à revoir peut-être : Désaccordé (pochette XEU presque blanche), les 6 classiques.
4. Pour la prod : dire si ce lot rejoint un patch v1.0.X.
