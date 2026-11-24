/**
 * TITRES UNIQUES (« world first », 20/11) — un titre par collection, pour UN SEUL joueur dans tout le jeu : le premier
 * qui possède 100 % des cartes de la collection le remporte pour toujours ; personne d'autre ne peut l'obtenir ensuite.
 *
 * Logique pure, partagée par le serveur (convex/titres.ts : attribution atomique), le mode démo et l'interface.
 * AJOUTER UN TITRE = une ligne dans `UNIQUE_TITLES` (id figé, ensemble de complétion de src/core/economy.ts :
 * `grp:<groupe>`, `sub:<album>` ou `theme:<thème>`) + son nom anglais dans i18n/en/data.ts (`ut.<id>`). Rien d'autre.
 */
import { tData } from './i18n';
import { completionSets, type CompletionSet } from './economy';
import { msgRef, str } from './msgRefs';

export interface UniqueTitle {
  /** identifiant figé (stocké en base) */
  id: string;
  /** ensemble à compléter à 100 % (`completionSets()`) */
  setId: string;
  /** le titre, en français (l'anglais : `ut.<id>` dans i18n/en/data.ts) */
  label: string;
  /** teinte du titre (#rrggbb) : celle de l'univers, loin des couleurs de rareté */
  tint: string;
}

export const UNIQUE_TITLES: readonly UniqueTitle[] = [
  { id: 'radiant', setId: 'grp:valorant', label: 'Radiant', tint: '#ffe9a8' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'hokage', setId: 'sub:naruto', label: 'Hokage', tint: '#ff9a4d' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-pokemon', setId: 'grp:pokemon', label: 'Maître Pokémon', tint: '#ff6b6b' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'challenger', setId: 'grp:lol', label: 'Challenger', tint: '#7fd4ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  // (24/11, V3, liste de Hugo) un titre par univers ; « Départements et régions » et « Pays » ne forment plus qu'un album
  // (« lieux », base Etoiles) : il porte « Globetrotteur »
  { id: 'maitre-des-pals', setId: 'sub:jv-palworld', label: 'Maître des Pals', tint: '#8fd6ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'souverain-de-teyvat', setId: 'sub:jv-genshin-impact', label: 'Souverain de Teyvat', tint: '#f2d38a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'elu-des-douze', setId: 'sub:jv-dofus', label: 'Élu des Douze', tint: '#9fe3a0' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-des-cieux', setId: 'sub:jv-summoners-war', label: 'Maître des Cieux', tint: '#a8c8ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'super-plombier', setId: 'sub:jv-mario', label: 'Super Plombier', tint: '#ff8a80' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'trophee-de-diamant', setId: 'grp:youtubeurs', label: 'Trophée de Diamant', tint: '#c7f2ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'empereur-mage', setId: 'sub:black-clover', label: 'Empereur-Mage', tint: '#7fdc9a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-du-bankai', setId: 'sub:bleach', label: 'Maître du Bankai', tint: '#ff9f6b' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'pilier', setId: 'sub:demon-slayer', label: 'Pilier', tint: '#ff8fb1' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'grand-detective', setId: 'sub:detective-conan', label: 'Grand Détective', tint: '#8fb6ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'super-saiyan', setId: 'sub:dragon-ball', label: 'Super Saiyan', tint: '#ffd85c' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'mage-de-rang-s', setId: 'sub:fairy-tail', label: 'Mage de Rang S', tint: '#ff9e7a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'demon-blanc', setId: 'sub:gintama', label: 'Démon Blanc', tint: '#e8eef5' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'petit-geant', setId: 'sub:haikyu', label: 'Petit Géant', tint: '#ffb35c' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-du-nen', setId: 'sub:hunter-x-hunter', label: 'Maître du Nen', tint: '#9be3b5' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'legende-dinazuma', setId: 'sub:inazuma-eleven', label: 'Légende d’Inazuma', tint: '#ffd166' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'stand-requiem', setId: 'sub:jojo-s-bizarre-adventure', label: 'Stand Requiem', tint: '#d9a8ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-du-territoire', setId: 'sub:jujutsu-kaisen', label: 'Maître du Territoire', tint: '#a59cff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'titan-originel', setId: 'sub:l-attaque-des-titans', label: 'Titan Originel', tint: '#d6b38a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'symbole-de-la-paix', setId: 'sub:my-hero-academia', label: 'Symbole de la Paix', tint: '#8fd0ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-des-pirates', setId: 'sub:one-piece', label: 'Roi des Pirates', tint: '#ffcf70' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-des-demons', setId: 'sub:seven-deadly-sins', label: 'Roi des Démons', tint: '#ff7a8a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'princesse-de-la-lune', setId: 'sub:sailor-moon', label: 'Princesse de la Lune', tint: '#ffb8e1' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'monarque-des-ombres', setId: 'sub:solo-leveling', label: 'Monarque des Ombres', tint: '#9d8cff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-a-lil-ecarlate', setId: 'sub:tokyo-ghoul', label: 'Roi à l’Œil Écarlate', tint: '#ff6b7a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'conquerant-de-laincrad', setId: 'sub:sword-art-online', label: 'Conquérant de l’Aincrad', tint: '#8ad8ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-des-duels', setId: 'sub:yugioh', label: 'Maître des Duels', tint: '#f5d76e' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'legende-de-metropolis', setId: 'sub:dc-films', label: 'Légende de Metropolis', tint: '#7fa8ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'elu-de-poudlard', setId: 'sub:harry-potter', label: 'Élu de Poudlard', tint: '#e8c37a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'avenger', setId: 'sub:marvel', label: 'Avenger', tint: '#ff8a7a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'disque-de-diamant', setId: 'sub:albums', label: 'Disque de Diamant', tint: '#c9f1ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'single-de-diamant', setId: 'sub:single', label: 'Single de Diamant', tint: '#b8ecff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'victoire-de-la-musique', setId: 'sub:musique-fr', label: 'Victoire de la Musique', tint: '#ffb3c8' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'grammy-winner', setId: 'sub:musique-monde', label: 'Grammy Winner', tint: '#f6d98a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'oscar', setId: 'sub:acteurs', label: 'Oscar', tint: '#f3d27a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'champion-poids-lourds', setId: 'sub:boxe', label: 'Champion Poids Lourds', tint: '#ff9d8a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'icone-de-wrestlemania', setId: 'sub:catch', label: 'Icône de WrestleMania', tint: '#ffc15e' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'champion-ufc', setId: 'sub:mma', label: 'Champion UFC', tint: '#ff8f8f' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'mvp', setId: 'grp:esport', label: 'MVP', tint: '#8ef0d0' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'soulier-dor', setId: 'sub:football-attaquants', label: 'Soulier d’Or', tint: '#f7d36b' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maestro', setId: 'sub:football-milieux', label: 'Maestro', tint: '#a8e6a1' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'catenaccio', setId: 'sub:football-defenseurs', label: 'Catenaccio', tint: '#9cc8ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'trophee-yachine', setId: 'sub:football-gardiens', label: 'Trophée Yachine', tint: '#b6f0c0' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-des-pistes', setId: 'sub:ski-alpin', label: 'Roi des Pistes', tint: '#d8f3ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'champion-paralympique', setId: 'sub:paralympiques', label: 'Champion Paralympique', tint: '#ffcf8a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-du-stade', setId: 'sub:athletisme', label: 'Roi du Stade', tint: '#ffb07a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maillot-jaune', setId: 'sub:cyclisme', label: 'Maillot Jaune', tint: '#ffe36b' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-des-bassins', setId: 'sub:natation', label: 'Maître des Bassins', tint: '#7fd8ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'grand-maitre', setId: 'sub:echecs', label: 'Grand Maître', tint: '#e9e3d4' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-du-green', setId: 'sub:golf', label: 'Maître du Green', tint: '#9be39a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'grand-chelem', setId: 'sub:tennis', label: 'Grand Chelem', tint: '#e6f58a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'nba-hall-of-famer', setId: 'sub:basketball', label: 'NBA Hall of Famer', tint: '#ffab6b' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'lexpert', setId: 'sub:handball', label: 'L’Expert', tint: '#8fc4ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'all-black', setId: 'sub:rugby', label: 'All Black', tint: '#d7dde5' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-du-filet', setId: 'sub:volleyball', label: 'Roi du Filet', tint: '#ffd88a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-de-monaco', setId: 'sub:formule-1', label: 'Roi de Monaco', tint: '#ff8a8a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-du-paddock', setId: 'sub:moto', label: 'Roi du Paddock', tint: '#ffa77a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'pilote-tout-terrain', setId: 'sub:rallye', label: 'Pilote Tout-Terrain', tint: '#d9b88a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-du-cretace', setId: 'sub:dinosaures-prehistoire', label: 'Roi du Crétacé', tint: '#b5d98a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'scarabee-dor', setId: 'sub:insectes-arachnides', label: 'Scarabée d’Or', tint: '#e8cf6a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'seigneur-de-la-faune', setId: 'sub:mammiferes', label: 'Seigneur de la Faune', tint: '#d8b48f' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'seigneur-des-cieux', setId: 'sub:oiseaux', label: 'Seigneur des Cieux', tint: '#9fd4ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'souverain-des-marais', setId: 'sub:reptiles-amphibiens', label: 'Souverain des Marais', tint: '#9cd99a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'seigneur-des-abysses', setId: 'sub:vie-marine', label: 'Seigneur des Abysses', tint: '#6fc7e8' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-de-la-chataigne', setId: 'sub:ardeche', label: 'Maître de la Châtaigne', tint: '#d9a77a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'citoyen-du-monde', setId: 'sub:capitales', label: 'Citoyen du Monde', tint: '#a9c9ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'globetrotteur', setId: 'sub:lieux', label: 'Globetrotteur', tint: '#8fe0c0' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'poseidon', setId: 'sub:mers-fleuves-lacs', label: 'Poséidon', tint: '#7ab8ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'legende-de-lunesco', setId: 'sub:monuments-patrimoine', label: 'Légende de l’UNESCO', tint: '#e3cf9a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'tresor-de-la-planete', setId: 'sub:sites-naturels', label: 'Trésor de la Planète', tint: '#a3e3a8' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-du-sucre', setId: 'sub:desserts-patisseries', label: 'Roi du Sucre', tint: '#ffc2d6' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'fin-gourmet', setId: 'sub:plats-du-monde', label: 'Fin Gourmet', tint: '#ffcf9a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'meilleur-ouvrier-de-france', setId: 'sub:plats-francais', label: 'Meilleur Ouvrier de France', tint: '#a9c3ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'gourmand-ultime', setId: 'sub:snacks-marques-fast-food', label: 'Gourmand Ultime', tint: '#ffb38a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'esprit-de-la-foret', setId: 'sub:ghibli', label: 'Esprit de la Forêt', tint: '#a8e0a0' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'legende-du-mans', setId: 'sub:voitures-francaises', label: 'Légende du Mans', tint: '#9cb8ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'roi-de-lautobahn', setId: 'sub:voitures-europeennes', label: 'Roi de l’Autobahn', tint: '#c9d2dc' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'route-66', setId: 'sub:voitures-americaines', label: 'Route 66', tint: '#ff9a8a' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'drift-king', setId: 'sub:voitures-asiatiques', label: 'Drift King', tint: '#ff9ad0' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
];

export const uniqueTitle = (id: string) => UNIQUE_TITLES.find((t) => t.id === id);
/** Nom du titre dans la langue active. */
export const uniqueTitleLabel = (t: UniqueTitle) => tData(`ut.${t.id}`, t.label);

/** L'ensemble (cartes, nom de la collection) d'un titre ; undefined si le catalogue ne le contient pas (pas encore chargé). */
export function uniqueTitleSet(t: UniqueTitle): CompletionSet | undefined {
  return completionSets().find((s) => s.id === t.setId);
}

/** Avancement d'un joueur sur un titre. Ensemble introuvable ou vide : jamais « complet ». */
export function uniqueTitleProgress(t: UniqueTitle, ownedIds: ReadonlySet<string>): { have: number; total: number; done: boolean } {
  const set = uniqueTitleSet(t);
  const total = set?.cards.length ?? 0;
  let have = 0;
  if (set) for (const c of set.cards) if (ownedIds.has(c.id)) have++;
  return { have, total, done: total > 0 && have === total };
}

/** Titres que ce joueur peut remporter maintenant : collection complète ET titre encore libre. */
export function claimableUniqueTitles(ownedIds: ReadonlySet<string>, takenIds: ReadonlySet<string>): UniqueTitle[] {
  return UNIQUE_TITLES.filter((t) => !takenIds.has(t.id) && uniqueTitleProgress(t, ownedIds).done);
}

/** Un titre attribué, tel que le jeu le voit (requête `titres:holders`, démo). */
export interface UniqueTitleHolder {
  titleId: string;
  userId: string;
  name: string;
  at: number;
}

// (messages stockés : le nom du titre et celui de la collection, relus dans la langue active)
msgRef('utitle', (p) => { const t = uniqueTitle(str(p.titleId) ?? ''); return t ? uniqueTitleLabel(t) : undefined; });
