/**
 * ÉCONOMIE (spec « Espace jeux & économie », 3 nov.) — logique pure partagée par le serveur Convex (convex/economy.ts,
 * convex/games.ts), le mode démo et l'interface.
 *
 * Règles d'or (non négociables) :
 *  - les pièces ne servent JAMAIS à acheter des cartes : pas de boutique de cartes, pas de jeu qui échange des cartes
 *    contre des pièces ; pas de marché (échanges oui, vente non) ;
 *  - monnaie 100 % virtuelle, aucun achat en argent réel.
 *
 * Une seule table de valeur, utilisée PARTOUT : brûlage, équivalence des mises en duel, roulette.
 */
import type { RarityId } from './rarity';
import { THEMES, subthemeViews, type CatalogEntry } from './sets/themes';

// ───────────────────────────────────────────── table de valeur

/** Valeur d'une carte en pièces, selon ses étoiles. Secrète (Les Bébous) : 5× une 6★ — seulement en mise. */
export const CARD_VALUE: Record<RarityId, number> = { common: 5, uncommon: 15, rare: 40, epic: 100, legendary: 300, mythic: 1000, secret: 5000 };

/** Étoiles d'une carte (compteur des Pack Battles). Une secrète compte 7 (au-dessus d'une 6★). */
export const CARD_STARS: Record<RarityId, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6, secret: 7 };

/** Les secrètes ne se brûlent jamais (verrou anti-accident). */
export const burnable = (r: RarityId | string) => r !== 'secret';

export interface StakeItem {
  cardId: string;
  rarity: RarityId;
  count: number;
}

/** Valeur de cartes (table ci-dessus). */
export const cardsValue = (items: Array<{ rarity: RarityId | string; count: number }>) =>
  items.reduce((a, it) => a + (CARD_VALUE[it.rarity as RarityId] ?? 0) * it.count, 0);

/** Valeur d'une mise : pièces + cartes. */
export const stakeValue = (s: { coins: number; cards: Array<{ rarity: RarityId | string; count: number }> }) => s.coins + cardsValue(s.cards);

/** Somme des étoiles de cartes tirées. */
export const starsOf = (cards: Array<{ rarity: RarityId | string }>) => cards.reduce((a, c) => a + (CARD_STARS[c.rarity as RarityId] ?? 0), 0);

/** « 1 250 » (espace fine insécable, sans Intl : le même code tourne côté Convex). */
export const fmtCoins = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ───────────────────────────────────────────── connexion quotidienne : calendrier de 30 jours

/**
 * Calendrier mensuel (s'ajoute à la série de 7 jours et ses 5 boosters, décision de Tom du 3 nov.).
 * Il suit la même série de connexion (src/core/streak.ts) : jour = position dans un cycle de 30, un jour manqué remet
 * la série — donc le calendrier — au jour 1.
 *  - jour 1 = 50 pièces, puis +10 par jour (jour 29 = 330) ;
 *  - paliers ×2 aux jours 7, 14 et 21 ;
 *  - jour 30 = 1 000 pièces + 1 booster offert.
 * Mois parfait : 7 050 pièces + 1 booster.
 */
export const CALENDAR_DAYS = 30;
export const CALENDAR_DOUBLE = [7, 14, 21];

export function calendarReward(day: number): { coins: number; packs: number } {
  if (day >= CALENDAR_DAYS) return { coins: 1000, packs: 1 };
  const base = 50 + 10 * (Math.max(1, day) - 1);
  return { coins: CALENDAR_DOUBLE.includes(day) ? base * 2 : base, packs: 0 };
}

/** Jour du calendrier (1..30) pour une série de connexion de `count` jours. */
export const calendarDay = (streakCount: number) => (streakCount > 0 ? ((streakCount - 1) % CALENDAR_DAYS) + 1 : 0);

/** Total d'un mois parfait (affiché dans le panneau). */
export const CALENDAR_MONTH_TOTAL = Array.from({ length: CALENDAR_DAYS }, (_, i) => calendarReward(i + 1).coins).reduce((a, b) => a + b, 0);

// ───────────────────────────────────────────── ouverture de boosters

/** Pièces gagnées à chaque booster ouvert, tirées dans une fourchette fixe par sorte de booster. */
export const PACK_COINS: Record<'bebou' | 'theme' | 'special', [number, number]> = { bebou: [10, 40], theme: [15, 50], special: [25, 90] };

export function rollPackCoins(kind: 'bebou' | 'theme' | 'special', rand: () => number): number {
  const [lo, hi] = PACK_COINS[kind];
  return lo + Math.floor(rand() * (hi - lo + 1));
}

// ───────────────────────────────────────────── achat de boosters (retours 05/11)

/**
 * Booster acheté avec des pièces : il rejoint la réserve (n'importe quelle sorte, au choix à l'ouverture). Prix calé
 * sur l'économie : un booster rapporte ≈ 25-30 pièces à l'ouverture + ≈ 160 pièces de cartes au brûlage (valeur
 * moyenne des 5 cartes), donc 250 > ce qu'il rend (pas de boucle « acheter → brûler → racheter ») ; ≈ une journée de
 * calendrier ou ~8 boosters ouverts. Plafond quotidien pour que la recharge gratuite reste la voie normale.
 */
export const PACK_PRICE = 250;
export const PACK_BUY_DAILY = 10;
/** achats encore possibles aujourd'hui (jour de Paris, comme le calendrier) */
export const packBuysLeft = (e: EconState, today: string) => Math.max(0, PACK_BUY_DAILY - (e.shopDay === today ? e.shopBought ?? 0 : 0));
export function packBuyProblem(count: number, coins: number, e: EconState, today: string): string | null {
  if (!Number.isInteger(count) || count < 1 || count > PACK_BUY_DAILY) return 'Quantité invalide.';
  const left = packBuysLeft(e, today);
  if (count > left) return left ? `Plus que ${left} booster${left > 1 ? 's' : ''} à acheter aujourd’hui.` : `Limite de ${PACK_BUY_DAILY} boosters achetés par jour atteinte : reviens demain.`;
  if (coins < count * PACK_PRICE) return `Pas assez de pièces (il t’en manque ${count * PACK_PRICE - coins}).`;
  return null;
}

// ───────────────────────────────────────────── brûlage de doublons

/** Pièces rendues par un brûlage (valeur de la table). Vérifie : doublons seulement, pas de secrète. */
export function burnProblem(items: StakeItem[], spare: (it: StakeItem) => number): string | null {
  if (!items.length) return 'Choisis au moins une carte.';
  const seen = new Set<string>();
  for (const it of items) {
    if (!Number.isInteger(it.count) || it.count < 1) return 'Quantité invalide.';
    if (!burnable(it.rarity)) return 'Les cartes secrètes ne se brûlent pas.';
    const k = `${it.cardId}:${it.rarity}`;
    if (seen.has(k)) return 'Même carte en double dans la liste.';
    seen.add(k);
    if (spare(it) < it.count) return 'On ne brûle que des doublons libres (on garde toujours 1 exemplaire).';
  }
  return null;
}

// ───────────────────────────────────────────── complétion (albums, familles, thèmes)

/** Formule unique adaptative : 5 pièces × nombre de cartes de l'ensemble complété. */
export const COMPLETION_RATE = 5;

export interface CompletionSet {
  /** `sub:<sous-thème>` · `grp:<groupe>` · `theme:<thème>` */
  id: string;
  label: string;
  kind: 'album' | 'groupe' | 'thème';
  cards: CatalogEntry[];
  reward: number;
}

let SETS: CompletionSet[] | null = null;

/** Tous les ensembles qui rapportent une prime de complétion (albums, groupes d'albums, thèmes entiers). */
export function completionSets(): CompletionSet[] {
  if (SETS) return SETS;
  const out: CompletionSet[] = [];
  for (const t of THEMES) {
    if (!t.cards.length) continue;
    for (const v of subthemeViews(t)) {
      if (!v.cards.length) continue;
      if (v.group) {
        for (const s of v.subs) if (s.cards.length) out.push({ id: `sub:${s.id}`, label: s.label, kind: 'album', cards: s.cards, reward: s.cards.length * COMPLETION_RATE });
        out.push({ id: `grp:${v.id.replace(/^group:/, '')}`, label: v.label, kind: 'groupe', cards: v.cards, reward: v.cards.length * COMPLETION_RATE });
      } else out.push({ id: `sub:${v.id}`, label: v.label, kind: 'album', cards: v.cards, reward: v.cards.length * COMPLETION_RATE });
    }
    out.push({ id: `theme:${t.id}`, label: `${t.label} (thème entier)`, kind: 'thème', cards: t.cards, reward: t.cards.length * COMPLETION_RATE });
  }
  SETS = out;
  return out;
}

/** Ensembles complets (toutes leurs cartes possédées, n'importe quelle rareté) et pas encore réclamés. */
export function claimableCompletions(ownedIds: Set<string>, claimed: string[]): CompletionSet[] {
  const done = new Set(claimed);
  return completionSets().filter((s) => !done.has(s.id) && s.cards.every((c) => ownedIds.has(c.id)));
}

/** Avancement d'un ensemble. */
export const completionProgress = (s: CompletionSet, ownedIds: Set<string>) => s.cards.reduce((a, c) => a + (ownedIds.has(c.id) ? 1 : 0), 0);

// ───────────────────────────────────────────── succès

/** Paliers de récompense des succès, selon la difficulté. */
export const ACHIEVEMENT_TIERS = [50, 150, 500, 2000] as const;

/** Ce que les succès regardent (stats du profil + compteurs de l'économie). */
export interface AchievementStats {
  packsOpened: number;
  uniques: number;
  mythics: number;
  legendaries: number;
  secrets: number;
  fullSubthemes: number;
  tradesDone: number;
  contractsSigned: number;
  streak: number;
  gamesPlayed: number;
  gamesWon: number;
  rouletteWins: number;
  burned: number;
  coinsEarned: number;
  /** (retours live 6, C15) cartes différentes par thème : World, Gaming, Pop Culture, Sport */
  worldUniques: number;
  gamingUniques: number;
  popUniques: number;
  sportUniques: number;
  /** a déjà été n°1 du classement (1 = oui) — posé par le serveur (convex/profiles.ts, `markLeader`) */
  wasTop: number;
  /** BÉBOU : paliers obtenus dans les autres succès du profil (le « niveau » du joueur) */
  bebouLevel: number;
}

export interface Achievement {
  id: string;
  label: string;
  how: string;
  /** 1..4 → 50 / 150 / 500 / 2 000 pièces (+ 0 / 1 / 3 / 5 boosters) */
  tier: 1 | 2 | 3 | 4;
  stat: keyof AchievementStats;
  target: number;
  /**
   * (retours live 6, C10 — validé le 07/11) UNE SEULE récompense par palier : ce palier donne UN cosmétique
   * (src/core/cosmetics.ts, champ `need`) et aucune pièce ni booster. Sans ce drapeau : pièces + boosters.
   */
  cos?: true;
}

const A = (id: string, label: string, how: string, tier: Achievement['tier'], stat: keyof AchievementStats, target: number, cos = false): Achievement => ({ id, label, how, tier, stat, target, ...(cos ? { cos: true as const } : {}) });
/** palier « cosmétique » (la récompense est un titre, un badge, un cadre ou une vitrine) */
const K = true;

/**
 * Retours live 6 (C10, C15) : 1 palier = 1 récompense, pièces/boosters OU un cosmétique. Pour répartir les nouveaux
 * titres (C15) et les cadres animés (C14), plus de paliers et de nouveaux succès (cartes par thème, niveau Bébou,
 * classement). Les ids existants ne changent pas (paliers déjà encaissés).
 */
export const ACHIEVEMENTS: Achievement[] = [
  // Boosters
  A('packs-10', 'Premiers pas', 'Ouvre 10 boosters', 1, 'packsOpened', 10, K),
  A('packs-50', 'Habitué', 'Ouvre 50 boosters', 1, 'packsOpened', 50),
  A('packs-100', 'Accro au papier', 'Ouvre 100 boosters', 2, 'packsOpened', 100, K),
  A('packs-250', 'Déchireur', 'Ouvre 250 boosters', 2, 'packsOpened', 250, K),
  A('packs-500', 'Déchireur pro', 'Ouvre 500 boosters', 3, 'packsOpened', 500, K),
  A('packs-1000', 'Mille sachets', 'Ouvre 1 000 boosters', 3, 'packsOpened', 1000, K),
  A('packs-1500', 'Usine à boosters', 'Ouvre 1 500 boosters', 3, 'packsOpened', 1500),
  A('packs-2000', 'Les mains en or', 'Ouvre 2 000 boosters', 4, 'packsOpened', 2000, K),
  // Collection
  A('uniq-100', 'Petite collection', 'Possède 100 cartes différentes', 1, 'uniques', 100),
  A('uniq-500', 'Belle collection', 'Possède 500 cartes différentes', 2, 'uniques', 500, K),
  A('uniq-1000', 'Grande collection', 'Possède 1 000 cartes différentes', 2, 'uniques', 1000, K),
  A('uniq-2000', 'Musée', 'Possède 2 000 cartes différentes', 3, 'uniques', 2000),
  A('uniq-5000', 'Encyclopédie', 'Possède 5 000 cartes différentes', 4, 'uniques', 5000, K),
  A('uniq-7500', 'Bibliothèque nationale', 'Possède 7 500 cartes différentes', 4, 'uniques', 7500),
  A('uniq-10000', 'Roi de la collection', 'Possède 10 000 cartes différentes', 4, 'uniques', 10000, K),
  // Thèmes
  A('world-50', 'Explorateur', 'Possède 50 cartes World différentes', 1, 'worldUniques', 50, K),
  A('world-300', 'Voyageur', 'Possède 300 cartes World différentes', 2, 'worldUniques', 300),
  A('world-1000', 'Globe-trotteur', 'Possède 1 000 cartes World différentes', 3, 'worldUniques', 1000, K),
  A('world-2000', 'Grand voyageur', 'Possède 2 000 cartes World différentes', 3, 'worldUniques', 2000),
  A('world-3500', 'Tour du monde', 'Possède 3 500 cartes World différentes', 4, 'worldUniques', 3500, K),
  A('gaming-50', 'Tryhard', 'Possède 50 cartes Gaming différentes', 1, 'gamingUniques', 50, K),
  A('gaming-400', 'Joueur assidu', 'Possède 400 cartes Gaming différentes', 2, 'gamingUniques', 400),
  A('gaming-1500', 'Boss final', 'Possède 1 500 cartes Gaming différentes', 3, 'gamingUniques', 1500, K),
  A('gaming-3000', 'Speedrunner', 'Possède 3 000 cartes Gaming différentes', 3, 'gamingUniques', 3000),
  A('gaming-5500', 'GG', 'Possède 5 500 cartes Gaming différentes', 4, 'gamingUniques', 5500, K),
  A('pop-100', 'Fan absolu', 'Possède 100 cartes Pop Culture différentes', 1, 'popUniques', 100, K),
  A('pop-800', 'Cinéphile', 'Possède 800 cartes Pop Culture différentes', 2, 'popUniques', 800),
  A('pop-3000', 'Icône pop', 'Possède 3 000 cartes Pop Culture différentes', 3, 'popUniques', 3000, K),
  A('pop-6000', 'Culture G', 'Possède 6 000 cartes Pop Culture différentes', 3, 'popUniques', 6000),
  A('pop-11000', 'Star absolue', 'Possède 11 000 cartes Pop Culture différentes', 4, 'popUniques', 11000, K),
  A('sport-50', 'Athlète', 'Possède 50 cartes Sport différentes', 1, 'sportUniques', 50, K),
  A('sport-400', 'Titulaire', 'Possède 400 cartes Sport différentes', 2, 'sportUniques', 400),
  A('sport-1500', 'Champion', 'Possède 1 500 cartes Sport différentes', 3, 'sportUniques', 1500, K),
  A('sport-3000', 'Capitaine', 'Possède 3 000 cartes Sport différentes', 3, 'sportUniques', 3000),
  A('sport-5000', 'Ballon d’or', 'Possède 5 000 cartes Sport différentes', 4, 'sportUniques', 5000, K),
  // Raretés
  A('leg-5', 'Doré', 'Possède 5 cartes 5★', 1, 'legendaries', 5, K),
  A('leg-25', 'Lingot', 'Possède 25 cartes 5★', 2, 'legendaries', 25),
  A('leg-50', 'Fort Knox', 'Possède 50 cartes 5★', 3, 'legendaries', 50, K),
  A('leg-100', 'Trésor', 'Possède 100 cartes 5★', 4, 'legendaries', 100),
  A('myth-1', 'Chasseur d’étoiles', 'Possède une carte 6★', 2, 'mythics', 1, K),
  A('myth-5', 'Prisme', 'Possède 5 cartes 6★', 2, 'mythics', 5, K),
  A('myth-10', 'Chasseur de légendes', 'Possède 10 cartes 6★', 3, 'mythics', 10, K),
  A('myth-25', 'Réfraction', 'Possède 25 cartes 6★', 3, 'mythics', 25, K),
  A('myth-50', 'Arc-en-ciel', 'Possède 50 cartes 6★', 4, 'mythics', 50, K),
  A('secret-1', 'Un de nous', 'Tire une carte secrète Bébou', 4, 'secrets', 1, K),
  A('secret-3', 'La bande au complet', 'Possède 3 cartes secrètes Bébou', 4, 'secrets', 3, K),
  // Albums
  A('full-1', 'Album bouclé', 'Complète un album à 100 %', 1, 'fullSubthemes', 1, K),
  A('full-5', 'Relieur amateur', 'Complète 5 albums', 2, 'fullSubthemes', 5),
  A('full-10', 'Relieur', 'Complète 10 albums', 2, 'fullSubthemes', 10, K),
  A('full-25', 'Archiviste', 'Complète 25 albums', 3, 'fullSubthemes', 25, K),
  A('full-50', 'Maître des albums', 'Complète 50 albums', 3, 'fullSubthemes', 50, K),
  // Échanges
  A('trade-1', 'Poignée de main', 'Conclus un échange', 1, 'tradesDone', 1, K),
  A('trade-5', 'Troc', 'Conclus 5 échanges', 1, 'tradesDone', 5),
  A('trade-10', 'Marchand', 'Conclus 10 échanges', 2, 'tradesDone', 10, K),
  A('trade-25', 'Négociant', 'Conclus 25 échanges', 3, 'tradesDone', 25, K),
  A('trade-50', 'Magnat des échanges', 'Conclus 50 échanges', 3, 'tradesDone', 50, K),
  // Contrats
  A('contract-1', 'Signature', 'Signe un contrat', 1, 'contractsSigned', 1, K),
  A('contract-5', 'Paraphe', 'Signe 5 contrats', 1, 'contractsSigned', 5),
  A('contract-10', 'Signataire', 'Signe 10 contrats', 2, 'contractsSigned', 10, K),
  A('contract-25', 'Notaire', 'Signe 25 contrats', 3, 'contractsSigned', 25, K),
  A('contract-50', 'As des contrats', 'Signe 50 contrats', 3, 'contractsSigned', 50, K),
  // Forge
  A('burn-50', 'Allumette', 'Brûle 50 doublons à la forge', 1, 'burned', 50),
  A('burn-100', 'Pyromane', 'Brûle 100 doublons à la forge', 2, 'burned', 100, K),
  A('burn-500', 'Incendiaire', 'Brûle 500 doublons', 2, 'burned', 500),
  A('burn-1000', 'Maître de la forge', 'Brûle 1 000 doublons', 3, 'burned', 1000, K),
  // Série de connexion
  A('streak-3', 'Bonjour', '3 jours de connexion d’affilée', 1, 'streak', 3),
  A('streak-7', 'Une semaine', '7 jours de connexion d’affilée', 1, 'streak', 7, K),
  A('streak-14', 'Fidèle', '14 jours de connexion d’affilée', 2, 'streak', 14, K),
  A('streak-30', 'Inconditionnel', '30 jours de connexion d’affilée', 3, 'streak', 30, K),
  A('streak-60', 'Aurore', '60 jours de connexion d’affilée', 4, 'streak', 60, K),
  // Classement
  A('top-1', 'Numéro un', 'Sois premier du classement (complétion)', 4, 'wasTop', 1, K),
  // Bébou : le niveau (paliers obtenus dans les succès du profil)
  A('bebou-5', 'Bébou en herbe', 'Obtiens 5 paliers de succès', 1, 'bebouLevel', 5),
  A('bebou-15', 'Bébou confirmé', 'Obtiens 15 paliers de succès', 2, 'bebouLevel', 15, K),
  A('bebou-30', 'Bébou d’or', 'Obtiens 30 paliers de succès', 3, 'bebouLevel', 30, K),
  A('bebou-50', 'Roi des Bébous', 'Obtiens 50 paliers de succès', 4, 'bebouLevel', 50, K),
  // Espace Jeux (pièces seulement)
  A('games-1', 'Joueur', 'Joue une partie dans l’espace Jeux', 1, 'gamesPlayed', 1),
  A('games-25', 'Habitué du casino', 'Joue 25 parties', 2, 'gamesPlayed', 25),
  A('games-100', 'Pilier du casino', 'Joue 100 parties', 3, 'gamesPlayed', 100),
  A('wins-1', 'Première victoire', 'Gagne un Pack Battle ou une Battle Royale', 1, 'gamesWon', 1),
  A('wins-10', 'Vainqueur', 'Gagne 10 batailles', 2, 'gamesWon', 10),
  A('wins-50', 'Invaincu', 'Gagne 50 batailles', 3, 'gamesWon', 50),
  A('roulette-1', 'Jackpot', 'Remporte le pot de la roulette', 3, 'rouletteWins', 1),
  A('coins-10k', 'Tirelire', 'Gagne 10 000 pièces au total', 2, 'coinsEarned', 10000),
  A('coins-100k', 'Coffre-fort', 'Gagne 100 000 pièces au total', 3, 'coinsEarned', 100000),
];

/** palier « cosmétique » : 0 pièce (C10 : une seule récompense, le cosmétique) */
export const achievementReward = (a: Achievement) => (a.cos ? 0 : ACHIEVEMENT_TIERS[a.tier - 1]);
/**
 * Retours live 02 (§8) : récompense selon la difficulté du palier — pièces + BOOSTERS (jamais de cartes directes) ;
 * (retours live 6, C10) les paliers « cosmétique » ne donnent QUE leur cosmétique.
 */
export const ACHIEVEMENT_PACKS = [0, 1, 3, 5] as const;
export const achievementPacks = (a: Achievement) => (a.cos ? 0 : ACHIEVEMENT_PACKS[a.tier - 1]);

/**
 * SUCCÈS À PALIERS (retours live 02, §8) : les succès de même mécanique (« ouvrir des boosters » : 10 → 100 → 500 →
 * 2 000…) forment UN succès à paliers. Les paliers gardent leurs ids (déjà encaissés, cosmétiques qui en dépendent).
 */
export interface AchievementLadder {
  stat: keyof AchievementStats;
  label: string;
  /** paliers, du plus facile au plus dur */
  steps: Achievement[];
}
const LADDER_LABEL: Record<keyof AchievementStats, string> = {
  packsOpened: 'Ouvrir des boosters',
  uniques: 'Collection',
  worldUniques: 'Cartes World',
  gamingUniques: 'Cartes Gaming',
  popUniques: 'Cartes Pop Culture',
  sportUniques: 'Cartes Sport',
  legendaries: 'Cartes 5★',
  mythics: 'Cartes 6★',
  secrets: 'Cartes secrètes',
  fullSubthemes: 'Albums complétés',
  tradesDone: 'Échanges conclus',
  contractsSigned: 'Contrats signés',
  burned: 'Forge',
  streak: 'Série de connexion',
  wasTop: 'Classement',
  bebouLevel: 'Niveau Bébou',
  gamesPlayed: 'Parties jouées',
  gamesWon: 'Batailles gagnées',
  rouletteWins: 'Roulette',
  coinsEarned: 'Pièces gagnées',
};
export const ACHIEVEMENT_LADDERS: AchievementLadder[] = (() => {
  const m = new Map<keyof AchievementStats, Achievement[]>();
  for (const a of ACHIEVEMENTS) m.set(a.stat, [...(m.get(a.stat) ?? []), a]);
  return [...m].map(([stat, steps]) => ({ stat, label: LADDER_LABEL[stat], steps: steps.sort((x, y) => x.target - y.target) }));
})();
/** Paliers atteints d'une échelle (0 = aucun). */
export const ladderLevel = (l: AchievementLadder, s: AchievementStats) => l.steps.filter((a) => achievementDone(a, s)).length;
export const achievementDone = (a: Achievement, s: AchievementStats) => (s[a.stat] ?? 0) >= a.target;

/** Succès atteints pas encore réclamés. */
export const claimableAchievements = (s: AchievementStats, claimed: string[]) => ACHIEVEMENTS.filter((a) => achievementDone(a, s) && !claimed.includes(a.id));

// ───────────────────────────────────────────── état économique d'un joueur

/** Compteurs de l'économie stockés avec le joueur (users.econ côté serveur, la sauvegarde en démo). */
export interface EconState {
  /** pièces gagnées depuis le début (succès « Tirelire ») */
  earned: number;
  /** doublons brûlés contre des pièces */
  burned: number;
  gamesPlayed: number;
  gamesWon: number;
  rouletteWins: number;
  /** dernier jour (heure de Paris) où le cadeau du calendrier a été pris */
  calendarDay?: string;
  /** ensembles complétés déjà payés (`sub:…`, `grp:…`, `theme:…`) */
  completions: string[];
  /** succès déjà payés */
  achievements: string[];
  /** achats de boosters : jour (Paris) et nombre achetés ce jour-là */
  shopDay?: string;
  shopBought?: number;
}

export const emptyEcon = (): EconState => ({ earned: 0, burned: 0, gamesPlayed: 0, gamesWon: 0, rouletteWins: 0, completions: [], achievements: [] });

/** Pour stocker en base (Convex refuse les champs `undefined`). */
export const cleanEcon = (e: EconState): EconState => ({
  earned: e.earned,
  burned: e.burned,
  gamesPlayed: e.gamesPlayed,
  gamesWon: e.gamesWon,
  rouletteWins: e.rouletteWins,
  completions: e.completions,
  achievements: e.achievements,
  ...(e.calendarDay ? { calendarDay: e.calendarDay } : {}),
  ...(e.shopDay ? { shopDay: e.shopDay, shopBought: e.shopBought ?? 0 } : {}),
});

// ───────────────────────────────────────────── anti-abus (alertes, jamais de blocage automatique)

export const ABUSE = {
  /** fenêtre glissante */
  windowMs: 30 * 24 * 3600_000,
  /** flux net de valeur A → B (duels + échanges + roulette) au-delà duquel on alerte */
  netFlow: 5000,
  /** échange déséquilibré : ratio de valeur au-delà de… */
  tradeRatio: 3,
  /** … répété au moins tant de fois sur la fenêtre */
  tradeRatioCount: 3,
  /** compte « nouveau » (signal contextuel) */
  newAccountMs: 7 * 24 * 3600_000,
  /** perte d'un nouveau compte vers un ancien qui déclenche le signal */
  newAccountLoss: 1000,
} as const;

/** Stats des succès à partir des stats du profil (src/core/cosmetics.ts) et des compteurs de l'économie. */
/** succès du PROFIL (ni l'espace Jeux, ni le niveau Bébou lui-même) : ce que compte le niveau Bébou */
const ECON_ONLY = new Set<keyof AchievementStats>(['gamesPlayed', 'gamesWon', 'rouletteWins', 'coinsEarned', 'bebouLevel']);
export function achievementStats(
  p: {
    packsOpened: number; uniques: number; mythics: number; legendaries: number; secrets: number; fullSubthemes: number; tradesDone: number; contractsSigned: number; streak: number;
    worldUniques?: number; gamingUniques?: number; popUniques?: number; sportUniques?: number; burned?: number; wasTop?: number;
  },
  e: EconState,
): AchievementStats {
  const s: AchievementStats = {
    packsOpened: p.packsOpened,
    uniques: p.uniques,
    mythics: p.mythics,
    legendaries: p.legendaries,
    secrets: p.secrets,
    fullSubthemes: p.fullSubthemes,
    tradesDone: p.tradesDone,
    contractsSigned: p.contractsSigned,
    streak: p.streak,
    gamesPlayed: e.gamesPlayed,
    gamesWon: e.gamesWon,
    rouletteWins: e.rouletteWins,
    // (C15) la forge compte aussi pour les cosmétiques : le profil porte le nombre de doublons brûlés
    burned: Math.max(e.burned, p.burned ?? 0),
    coinsEarned: e.earned,
    worldUniques: p.worldUniques ?? 0,
    gamingUniques: p.gamingUniques ?? 0,
    popUniques: p.popUniques ?? 0,
    sportUniques: p.sportUniques ?? 0,
    wasTop: p.wasTop ?? 0,
    bebouLevel: 0,
  };
  s.bebouLevel = ACHIEVEMENTS.filter((a) => !ECON_ONLY.has(a.stat) && achievementDone(a, s)).length;
  return s;
}
