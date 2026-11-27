# Ouvertures V3 — propositions pour les 3 dernières à gagner (27/11, agent `ouvertures`)

Succès à pourvoir : `world-150`, `full-15`, `streak-21` (aucun lien de thème avec l'ouverture, décision de Tom).
5 propositions, Tom en choisit 3. Aucune ligne de code écrite pour l'instant.

## Le cadre
- **La barre** : la Déchirure. Le film alu / PET y est vraiment simulé (XPBD, plis qui restent, soudures, cartes rigides), la simulation est cuite hors ligne, puis rejouée sous le doigt (`scripts/bake-tear/bake.mts`).
- **Ce que le simulateur sait faire depuis le 27/11** :
  - rupture à l'effort et nappes trouées (Fenêtre) ;
  - charnière qui roule et soudures qui cèdent cran par cran (Retroussé) ;
  - Voronoï et éclats solides (glace) ;
  - événements de rupture exportés vers le son et les vibrations (`cut`, `corner`, `free`).
- **Exclu** :
  - ce qui est déjà fait ou retiré : Déchirure, Retroussé, Fenêtre, glace, étoile, Brûlure, Éventail ;
  - les séries refusées : la série 1 (gestes d'emballage) et la série 2 (mouvements du sachet, accessoires) ;
  - les candidats de la série 3 mis de côté : Torsion, Soufflet, Bascule, Empreinte, Drapé…
  - tout clin d'œil au thème des cartes ou au succès, tout accessoire, tout calque 2D, tout ton dessin animé.
- **Fil commun des 5** : chacune part d'une loi physique réelle du sachet lui-même. Les seuls acteurs sont l'air enfermé, le film, les soudures, les 5 cartes et le doigt.

---

## 1. Pression : l'air enfermé fait sauter la soudure
- **Geste** : le doigt se pose en bas du sachet et remonte. Il écrase les deux faces l'une contre l'autre, comme on vide un tube : derrière lui le film est plaqué, devant lui l'air s'accumule. Un toucher lance la remontée seule (≈ 1 s).
- **Matière et physique** :
  - le sachet est un volume fermé, simulé par une contrainte de volume dans le XPBD (technique classique des tissus gonflés), à laquelle on retire le volume de la pile ;
  - le haut gonfle en coussin. Comme le film ne s'étire pas, ses bords se froncent en petites dents régulières le long des soudures, la même physique que les plis au bord d'un ballon en mylar ;
  - la soudure du haut se décolle à l'effort (le motif de la Fenêtre) : un front de décollement blanchi court depuis le point le plus tendu ;
  - au seuil, la bouche s'ouvre d'un coup, l'air sort, le coussin se dégonfle en se froissant et les cartes montent par la bouche.
- **Ce qui la rend inédite** : l'ouverture vient de l'intérieur, de l'air que le joueur pousse lui-même. On sent la pression monter sous le doigt avant que ça cède. Je n'ai jamais vu de booster numérique ouvert par la pression.
- **Faisabilité** :
  - cuisson hors ligne, oui. Phase pilotée par p (49 images), puis sortie à 30 i/s ;
  - les 2 nappes du corps seules, la topologie du Retroussé ;
  - à écrire : la contrainte de volume (une somme sur les triangles, avec plusieurs itérations hors ligne) et la ligne écrasée par le doigt (une rangée épinglée qui monte) ;
  - GPU au téléphone : le coût de la Déchirure (même nombre de sommets, matériaux du Retroussé). WebGL2 : identique, rien de propre au WebGPU.
- **Son et vibration** :
  - pendant la remontée : grincement du film tendu (grains dont la densité suit la pression enregistrée) et vibrations courtes de plus en plus serrées ;
  - au décollement : le crépitement de la soudure (`seal`, existe) ;
  - à l'ouverture : un claquement sourd, puis un souffle d'air (bruit filtré qui baisse), et une impulsion forte.
- **Risques** :
  - un coussin trop gonflé fait jouet ou dessin animé : borner le bombé à ≈ 6 mm, comme un vrai sachet ;
  - « le booster qui éclate » rappelle la Secousse de la série 1. La différence : ici pas de secousse, une soudure qui se décolle sous la pression du doigt, et pas d'explosion ;
  - le volume avec une seule itération oscille : hors ligne on en met 8 ou plus.
- **Effort** : moyen, une session comme la Fenêtre (scénario, contrainte de volume, son « souffle »).

## 2. Cône : le film tiré par un point
- **Geste** : le doigt se pose au milieu de la face avant et glisse vers le haut. Le film colle au doigt (attache souple, celle de la Déchirure) et se soulève des cartes vers le haut et vers le joueur.
- **Matière et physique** :
  - une feuille qui ne s'étire pas, tirée par un point, ne peut pas faire une bosse ronde : elle forme un cône pointu (le « cône développable » des physiciens) ;
  - des arêtes vives rayonnent depuis le doigt, avec un pli en croissant qui reste marqué (plasticité) ;
  - la tension passe dans les soudures latérales : elles se décollent à l'effort depuis les coins du bas, en deux fronts courbes qui remontent ;
  - quand les fronts se rejoignent, la face avant entière pend au doigt comme une tente pointue, puis tombe. La pile est nue, le dos du sachet reste derrière elle.
- **Ce qui la rend inédite** : le motif des arêtes vient seul de la géométrie de la feuille, sans dessin, et il suit le doigt en continu. Ce motif est connu en physique, jamais vu dans un jeu de cartes.
- **Faisabilité** :
  - cuisson hors ligne, oui, avec 2 ou 3 variantes (position du doigt au départ) ;
  - à écrire : le point de prise libre sur la face (aujourd'hui fixé au coin de la bande) et l'adhérence du film aux cartes avant le décollement (la Fenêtre a `STICKZ`) ;
  - le maillage de 1,44 mm suffit pour des arêtes de quelques millimètres ;
  - GPU : la Déchirure. WebGL2 : identique.
- **Son et vibration** : un craquement sec à chaque arête qui se forme (événement exporté par la cuisson quand un pli dépasse son seuil plastique), le crépitement de la soudure le long des fronts, un froissement à la chute.
- **Risques** :
  - de face, une levée vers le joueur se lit mal. Il faut une légère inclinaison du cadrage pendant le geste (à régler) ;
  - les arêtes facettées : le maillage doit rester fin là où le doigt prend ;
  - cousine de la Fenêtre par la fin (la face part, la pile reste). Le geste et la forme n'ont rien à voir.
- **Effort** : moyen à gros (point de prise libre, inclinaison du cadrage).

## 3. Fatigue : plier jusqu'à ce que le métal casse
- **Geste** : un va-et-vient vertical sur le haut du sachet (environ 3 passes de 15 % de l'écran). Chaque passe rabat le haut vide du sachet vers l'avant, puis vers l'arrière, par-dessus la tranche des cartes. Un toucher lance 3 pliages tout seuls (≈ 1,2 s).
- **Matière et physique** :
  - c'est la fatigue d'un métal, ce qui arrive à une feuille d'alu qu'on plie plusieurs fois au même endroit ;
  - chaque pliage use la ligne de pli (dommage cumulé dans la plasticité). Le PET blanchit le long du pli (blanchiment sous contrainte) ;
  - l'alu se fend en microfissures, et la lumière de l'intérieur filtre par ces fentes (la fente de lumière existe, `TSLIT` / `winSlit`) ;
  - à la 3e passe, le pli casse net, d'un trait droit. Le haut tombe, les cartes montent.
- **Ce qui la rend inédite** : c'est la seule ouverture rythmée en aller-retour, et la rupture s'accumule sous les yeux du joueur au lieu d'arriver d'un coup.
- **Faisabilité** :
  - cuisson hors ligne, oui, pilotée par la phase du va-et-vient ;
  - à écrire : un dommage par arête (usure à chaque inversion de courbure, puis rupture : le motif de l'usure de la Fenêtre), le blanchiment et les fissures en attribut par sommet, lus par le shader ;
  - GPU : la Déchirure. WebGL2 : identique.
- **Son et vibration** : un « tic » de pli à chaque inversion, de plus en plus sec et aigu à mesure que le métal durcit ; un grésillement de microfissures à la 2e passe ; à la 3e, un claquement net et une impulsion forte. Les vibrations sont calées sur chaque inversion.
- **Risques** :
  - ressemble au Contre-pli de la série 3. La différence : 3 cycles et l'usure qu'on voit ;
  - la fin (le haut qui tombe) rappelle la Déchirure : à compenser par la cassure droite et blanche ;
  - 3 passes, c'est plus long qu'un trait : il faut un filet de sécurité (un geste vif compte double).
- **Effort** : moyen.

## 4. Résonance : le film qui chante sous le frottement
- **Geste** : le doigt frotte la face avant en allers-retours rapides (n'importe où, n'importe quel sens). Un toucher lance un frottement automatique.
- **Matière et physique** :
  - un doigt qui frotte accroche puis glisse, comme un archet. Ce va-et-vient excite les modes propres de la face, une membrane tendue entre ses soudures ;
  - les lignes qui restent immobiles (figures de Chladni) se voient dans le reflet de l'alu, qui ondule partout ailleurs ;
  - quand le frottement tient la cadence, l'amplitude monte (résonance). Les soudures fatiguent et se décollent, et la face lâche d'un coup.
- **Ce qui la rend inédite** :
  - le son et l'image sortent des mêmes fréquences : le sachet chante vraiment la note de sa propre forme ;
  - le joueur entend qu'il approche de la rupture.
- **Faisabilité** :
  - la vibration est calculée dans le shader des sommets (une somme de 4 à 6 modes d'une membrane rectangulaire, amplitudes pilotées par le frottement) : pas de cuisson, coût négligeable, identique en WebGL2 ;
  - le lâcher final est cuit (décollement des soudures à l'effort, comme la Fenêtre) ;
  - le son est fabriqué au vol avec les mêmes fréquences (synthèse modale, livre de sons `ouvertures`).
- **Son et vibration** : la note monte en intensité avec l'amplitude ; la vibration du téléphone suit chaque accroche du doigt ; un dernier accord quand la face lâche, puis un froissement.
- **Risques** :
  - les figures de Chladni ne se voient d'habitude qu'avec du sable, qu'on n'a pas le droit d'ajouter (accessoire). Dans le seul reflet, elles peuvent rester discrètes ;
  - le ton peut paraître « magique » plutôt que matériel ;
  - le son devient l'acteur principal : sans le son, l'ouverture perd beaucoup ;
  - Android limite les vibrations rapides, iPhone n'en a pas.
- **Effort** : moyen côté code ; le réglage du son demande une écoute de Tom.

## 5. Lanières : le film se fend dans son sens
- **Geste** : le doigt griffe la face de haut en bas, une ou plusieurs fois. Chaque passage fend le film le long de sa trajectoire, redressée à la verticale.
- **Matière et physique** :
  - un film étiré à la fabrication (PET bi-orienté) ne se déchire pas n'importe comment : il se fend droit, dans le sens de ses fibres ;
  - chaque fente libère une lanière qui se roule sur elle-même en spirale, sous ses contraintes internes ;
  - au-delà de la moitié de la largeur, le reste de la face lâche en lanières, et la pile reste debout entre les rubans qui pendent de la soudure du bas.
- **Ce qui la rend inédite** :
  - le joueur choisit où fendre ;
  - c'est la seule ouverture où le film s'en va en plusieurs morceaux qui restent attachés et qui se roulent.
- **Faisabilité** :
  - à cuire par familles : 4 ou 5 fentes possibles, chacune cuite, et le jeu enchaîne celles que le doigt touche (une lanière par colonne de la grille) ;
  - les spirales, le Retroussé sait les faire (pli roulé) ;
  - le plus gros risque technique de la série : plusieurs ordres de fentes possibles, donc plus de mémoire (≈ 0,6 Mo par fente) ;
  - GPU : la Déchirure. WebGL2 : identique.
- **Son et vibration** : un « zip » sec et court par fente (la vitesse du doigt donne la hauteur), un froissement par lanière qui se roule, une impulsion par fente.
- **Risques** :
  - la plus proche d'une déchirure : Tom peut la lire comme une variante de la Déchirure ;
  - plusieurs passages sont nécessaires, donc un filet de sécurité : au-delà de 2 fentes, tout lâche.
- **Effort** : gros.

---

## Mon classement
1. Pression : la plus vraie, et la plus forte sous le doigt.
2. Cône.
3. Fatigue.
4. Résonance (si Tom veut une ouverture où le son est le cœur).
5. Lanières (risque d'être lue comme une variante de la Déchirure).

## Direction en deux lignes, à donner à Tom
> Ouvrir le sachet par les lois de sa propre matière : l'air enfermé qui fait sauter la soudure (Pression), le film tiré en un point qui forme un cône (Cône), le métal plié jusqu'à la fatigue (Fatigue).
> Toutes cuites au simulateur de la Déchirure, avec la rupture à l'effort de la Fenêtre ; rien de propre au WebGPU, donc identiques en WebGL2.
