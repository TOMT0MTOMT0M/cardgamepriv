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
}

export interface Achievement {
  id: string;
  label: string;
  how: string;
  /** 1..4 → 50 / 150 / 500 / 2 000 pièces */
  tier: 1 | 2 | 3 | 4;
  stat: keyof AchievementStats;
  target: number;
}

const A = (id: string, label: string, how: string, tier: Achievement['tier'], stat: keyof AchievementStats, target: number): Achievement => ({ id, label, how, tier, stat, target });

export const ACHIEVEMENTS: Achievement[] = [
  A('packs-10', 'Premiers pas', 'Ouvre 10 boosters', 1, 'packsOpened', 10),
  A('packs-100', 'Accro au papier', 'Ouvre 100 boosters', 2, 'packsOpened', 100),
  A('packs-500', 'Déchireur pro', 'Ouvre 500 boosters', 3, 'packsOpened', 500),
  A('packs-2000', 'Usine à boosters', 'Ouvre 2 000 boosters', 4, 'packsOpened', 2000),
  A('uniq-100', 'Petite collection', 'Possède 100 cartes différentes', 1, 'uniques', 100),
  A('uniq-500', 'Belle collection', 'Possède 500 cartes différentes', 2, 'uniques', 500),
  A('uniq-2000', 'Musée', 'Possède 2 000 cartes différentes', 3, 'uniques', 2000),
  A('uniq-5000', 'Encyclopédie', 'Possède 5 000 cartes différentes', 4, 'uniques', 5000),
  A('leg-5', 'Doré', 'Possède 5 cartes 5★', 1, 'legendaries', 5),
  A('leg-25', 'Lingot', 'Possède 25 cartes 5★', 2, 'legendaries', 25),
  A('myth-1', 'Prisme', 'Possède une carte 6★', 2, 'mythics', 1),
  A('myth-10', 'Arc-en-ciel', 'Possède 10 cartes 6★', 3, 'mythics', 10),
  A('myth-50', 'Collectionneur mythique', 'Possède 50 cartes 6★', 4, 'mythics', 50),
  A('secret-1', 'Un de nous', 'Tire une carte secrète Bébou', 4, 'secrets', 1),
  A('full-1', 'Album bouclé', 'Complète un album à 100 %', 1, 'fullSubthemes', 1),
  A('full-10', 'Relieur', 'Complète 10 albums', 2, 'fullSubthemes', 10),
  A('full-50', 'Bibliothécaire', 'Complète 50 albums', 3, 'fullSubthemes', 50),
  A('trade-1', 'Poignée de main', 'Conclus un échange', 1, 'tradesDone', 1),
  A('trade-10', 'Négociant', 'Conclus 10 échanges', 2, 'tradesDone', 10),
  A('trade-50', 'Marchand de rêves', 'Conclus 50 échanges', 3, 'tradesDone', 50),
  A('contract-1', 'Signature', 'Signe un contrat', 1, 'contractsSigned', 1),
  A('contract-10', 'Notaire', 'Signe 10 contrats', 2, 'contractsSigned', 10),
  A('contract-50', 'Pyromane', 'Signe 50 contrats', 3, 'contractsSigned', 50),
  A('streak-7', 'Fidèle', '7 jours de connexion d’affilée', 1, 'streak', 7),
  A('streak-30', 'Mois parfait', '30 jours de connexion d’affilée', 3, 'streak', 30),
  A('games-1', 'Joueur', 'Joue une partie dans l’espace Jeux', 1, 'gamesPlayed', 1),
  A('games-25', 'Habitué', 'Joue 25 parties', 2, 'gamesPlayed', 25),
  A('games-100', 'Pilier du casino', 'Joue 100 parties', 3, 'gamesPlayed', 100),
  A('wins-1', 'Première victoire', 'Gagne un Pack Battle ou une Battle Royale', 1, 'gamesWon', 1),
  A('wins-10', 'Champion', 'Gagne 10 batailles', 2, 'gamesWon', 10),
  A('wins-50', 'Invaincu', 'Gagne 50 batailles', 3, 'gamesWon', 50),
  A('roulette-1', 'Jackpot', 'Remporte le pot de la roulette', 3, 'rouletteWins', 1),
  A('burn-50', 'Allumette', 'Brûle 50 doublons contre des pièces', 1, 'burned', 50),
  A('burn-500', 'Incendiaire', 'Brûle 500 doublons', 2, 'burned', 500),
  A('coins-10k', 'Tirelire', 'Gagne 10 000 pièces au total', 2, 'coinsEarned', 10000),
  A('coins-100k', 'Coffre-fort', 'Gagne 100 000 pièces au total', 3, 'coinsEarned', 100000),
];

export const achievementReward = (a: Achievement) => ACHIEVEMENT_TIERS[a.tier - 1];
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
export function achievementStats(
  p: { packsOpened: number; uniques: number; mythics: number; legendaries: number; secrets: number; fullSubthemes: number; tradesDone: number; contractsSigned: number; streak: number },
  e: EconState,
): AchievementStats {
  return {
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
    burned: e.burned,
    coinsEarned: e.earned,
  };
}
