/**
 * COSMÉTIQUES DU PROFIL — données pures, partagées serveur (convex/profiles.ts) / client / démo.
 *
 * Règle du groupe (3 nov.) : tout se débloque EN JOUANT, rien ne s'achète. Bannières, cadres d'avatar, titres et badges
 * ont chacun une condition sur les statistiques du joueur. Le vrai système de succès (défis, historique des déblocages,
 * notifications) est une phase à part : les conditions ci-dessous en sont la première brique — elles sont calculées
 * à la volée à partir des stats, sans rien stocker.
 */
import { PUBLIC_CARD_COUNT, SUBTHEMES, catalogEntry } from './sets/themes';

export interface PlayerStats {
  packsOpened: number;
  /** cartes uniques (hors Bébous) */
  uniques: number;
  /** cartes uniques possibles (hors Bébous) */
  total: number;
  mythics: number;
  legendaries: number;
  secrets: number;
  /** sous-thèmes à 100 % */
  fullSubthemes: number;
  tradesDone: number;
  contractsSigned: number;
  /** série de connexion en cours */
  streak: number;
}

export interface Cosmetic {
  id: string;
  label: string;
  /** comment on l'obtient (affiché quand c'est verrouillé) */
  how: string;
  unlock: (s: PlayerStats) => boolean;
  /** bannière : dégradé CSS · cadre : couleurs ; le reste est dessiné côté client */
  css?: string;
  /** badge / titre : petit glyphe */
  glyph?: string;
}

const free = () => true;

/** Bannières (fond du haut du profil). */
export const BANNERS: Cosmetic[] = [
  { id: 'ember', label: 'Braise', how: '', unlock: free, css: 'linear-gradient(120deg, #2a1410, #5a2a22 45%, #1a0d0b)' },
  { id: 'night', label: 'Nuit', how: '', unlock: free, css: 'linear-gradient(120deg, #0c1118, #16314a 50%, #0a0f16)' },
  { id: 'forest', label: 'Forêt', how: '', unlock: free, css: 'linear-gradient(120deg, #0c1412, #123f2f 50%, #0a1210)' },
  { id: 'plum', label: 'Prune', how: '', unlock: free, css: 'linear-gradient(120deg, #120f17, #3b1630 50%, #0e0b12)' },
  { id: 'sand', label: 'Sable', how: '', unlock: free, css: 'linear-gradient(120deg, #16100c, #5a3a12 50%, #120d09)' },
  { id: 'gold', label: 'Or', how: 'Ouvre 250 boosters', unlock: (s) => s.packsOpened >= 250, css: 'linear-gradient(120deg, #2a1d06, #7a5a1a 45%, #d9982a 70%, #2a1d06)' },
  { id: 'prism', label: 'Prisme', how: 'Possède une carte 6★', unlock: (s) => s.mythics >= 1, css: 'linear-gradient(120deg, #ff6b9a22, #ffd36b33, #6bffb833, #6bc8ff33, #c86bff33), linear-gradient(120deg, #1a1420, #2a2433)' },
  { id: 'secret', label: 'Un de nous', how: 'Tire une carte secrète Bébou', unlock: (s) => s.secrets >= 1, css: 'radial-gradient(ellipse at 30% 50%, #e8927c55, transparent 60%), linear-gradient(120deg, #2a0f0e, #4a1f1a 50%, #120607)' },
];

/** Cadres d'avatar. */
export const FRAMES: Cosmetic[] = [
  { id: 'none', label: 'Aucun', how: '', unlock: free, css: 'transparent' },
  { id: 'bronze', label: 'Bronze', how: 'Ouvre 50 boosters', unlock: (s) => s.packsOpened >= 50, css: 'linear-gradient(135deg, #b87333, #e0a070, #8a5020)' },
  { id: 'silver', label: 'Argent', how: 'Ouvre 250 boosters', unlock: (s) => s.packsOpened >= 250, css: 'linear-gradient(135deg, #9aa3ad, #e8edf2, #6e7883)' },
  { id: 'gold', label: 'Or', how: 'Ouvre 1 000 boosters', unlock: (s) => s.packsOpened >= 1000, css: 'linear-gradient(135deg, #d9982a, #ffe0a0, #a06a10)' },
  { id: 'collector', label: 'Collectionneur', how: 'Complète un sous-thème à 100 %', unlock: (s) => s.fullSubthemes >= 1, css: 'linear-gradient(135deg, #4c7cc2, #b4cdf2, #2a4a80)' },
  { id: 'mythic', label: 'Mythique', how: 'Possède une carte 6★', unlock: (s) => s.mythics >= 1, css: 'conic-gradient(from 0deg, #ff6b9a, #ffd36b, #6bffb8, #6bc8ff, #c86bff, #ff6b9a)' },
  { id: 'secret', label: 'Un de nous', how: 'Tire une carte secrète Bébou', unlock: (s) => s.secrets >= 1, css: 'linear-gradient(135deg, #e8927c, #ffe4d8, #b05040)' },
  { id: 'trader', label: 'Négociant', how: 'Conclus 10 échanges', unlock: (s) => s.tradesDone >= 10, css: 'linear-gradient(135deg, #6f9a74, #c4dcb8, #3a5a40)' },
  { id: 'flame', label: 'Flamme', how: 'Série de connexion de 7 jours', unlock: (s) => s.streak >= 7, css: 'linear-gradient(135deg, #ff7a2a, #ffd36b, #c03010)' },
];

/** Titres (sous le pseudo). */
export const TITLES: Cosmetic[] = [
  { id: 'rookie', label: 'Bébou débutant', how: '', unlock: free },
  { id: 'opener', label: 'Ouvreur compulsif', how: 'Ouvre 100 boosters', unlock: (s) => s.packsOpened >= 100 },
  { id: 'opener2', label: 'Déchireur de boosters', how: 'Ouvre 1 000 boosters', unlock: (s) => s.packsOpened >= 1000 },
  { id: 'collector', label: 'Collectionneur', how: 'Complète un sous-thème à 100 %', unlock: (s) => s.fullSubthemes >= 1 },
  { id: 'archivist', label: 'Archiviste', how: 'Complète 10 sous-thèmes à 100 %', unlock: (s) => s.fullSubthemes >= 10 },
  { id: 'legend', label: 'Chasseur de légendes', how: 'Possède 10 cartes 5★', unlock: (s) => s.legendaries >= 10 },
  { id: 'mythic', label: 'Touché par la foudre', how: 'Possède une carte 6★', unlock: (s) => s.mythics >= 1 },
  { id: 'secret', label: 'Un de nous', how: 'Tire une carte secrète Bébou', unlock: (s) => s.secrets >= 1 },
  { id: 'trader', label: 'Négociant', how: 'Conclus 5 échanges', unlock: (s) => s.tradesDone >= 5 },
  { id: 'pyro', label: 'Pyromane', how: 'Signe 10 contrats', unlock: (s) => s.contractsSigned >= 10 },
  { id: 'loyal', label: 'Fidèle au poste', how: 'Série de connexion de 7 jours', unlock: (s) => s.streak >= 7 },
  { id: 'king', label: 'Roi de la collection', how: 'Possède 1 000 cartes uniques', unlock: (s) => s.uniques >= 1000 },
];

/** Badges (petites médailles sous le pseudo, plusieurs à la fois, ordonnables). */
export const BADGES: Cosmetic[] = [
  { id: 'first', label: 'Premier booster', how: 'Ouvre ton premier booster', unlock: (s) => s.packsOpened >= 1, glyph: '🎴' },
  { id: 'p100', label: '100 boosters', how: 'Ouvre 100 boosters', unlock: (s) => s.packsOpened >= 100, glyph: '💯' },
  { id: 'p1000', label: '1 000 boosters', how: 'Ouvre 1 000 boosters', unlock: (s) => s.packsOpened >= 1000, glyph: '🏆' },
  { id: 'full', label: 'Album complet', how: 'Complète un sous-thème à 100 %', unlock: (s) => s.fullSubthemes >= 1, glyph: '📗' },
  { id: 'mythic', label: '6★', how: 'Possède une carte 6★', unlock: (s) => s.mythics >= 1, glyph: '✺' },
  { id: 'secret', label: 'Bébou secret', how: 'Tire une carte secrète', unlock: (s) => s.secrets >= 1, glyph: '✷' },
  { id: 'trade', label: 'Échangeur', how: 'Conclus un échange', unlock: (s) => s.tradesDone >= 1, glyph: '⇄' },
  { id: 'contract', label: 'Contrat signé', how: 'Signe un contrat', unlock: (s) => s.contractsSigned >= 1, glyph: '🔥' },
  { id: 'streak', label: '7 jours', how: 'Série de connexion de 7 jours', unlock: (s) => s.streak >= 7, glyph: '🔥7' },
  { id: 'half', label: 'À mi-chemin', how: 'Possède la moitié des cartes du jeu', unlock: (s) => s.total > 0 && s.uniques * 2 >= s.total, glyph: '½' },
];

/** Statistiques d'un joueur à partir de sa collection et de ses compteurs (même calcul serveur / client / démo). */
export function statsFrom(
  collection: Array<{ cardId: string; rarity: string; count: number }>,
  extra: { packsOpened: number; tradesDone: number; contractsSigned: number; streak: number },
): PlayerStats {
  const ids = new Set<string>();
  let mythics = 0, legendaries = 0, secrets = 0;
  for (const c of collection) {
    if (!catalogEntry(c.cardId)) continue;
    if (c.rarity === 'secret') secrets++;
    else ids.add(c.cardId);
    if (c.rarity === 'mythic') mythics++;
    if (c.rarity === 'legendary') legendaries++;
  }
  let fullSubthemes = 0;
  for (const st of SUBTHEMES) if (st.cards.length && st.cards.every((c) => ids.has(c.id))) fullSubthemes++;
  return { ...extra, uniques: ids.size, total: PUBLIC_CARD_COUNT, mythics, legendaries, secrets, fullSubthemes };
}

/** Plus gros drop : la meilleure carte (rareté, puis numéro d'impression le plus bas). */
export function bestCard<T extends { cardId: string; rarity: string; bestMintNumber?: number }>(collection: T[]): T | null {
  const R: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
  let best: T | null = null;
  for (const c of collection) {
    if (!catalogEntry(c.cardId)) continue;
    if (!best || R[c.rarity] > R[best.rarity] || (R[c.rarity] === R[best.rarity] && (c.bestMintNumber ?? 9e9) < (best.bestMintNumber ?? 9e9))) best = c;
  }
  return best;
}

export interface CosmeticChoice {
  banner?: string;
  frame?: string;
  title?: string;
  badges?: string[];
}

const find = (list: Cosmetic[], id: string | undefined) => (id ? list.find((c) => c.id === id) : undefined);

/** Garde seulement ce qui est débloqué (serveur et démo : un choix verrouillé est ignoré, jamais une erreur). */
export function cleanCosmetics(choice: CosmeticChoice, stats: PlayerStats): CosmeticChoice {
  const ok = (list: Cosmetic[], id?: string) => {
    const c = find(list, id);
    return c && c.unlock(stats) ? c.id : undefined;
  };
  const seen = new Set<string>();
  const badges = (choice.badges ?? []).filter((id) => {
    const c = find(BADGES, id);
    if (!c || !c.unlock(stats) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, 5);
  return { banner: ok(BANNERS, choice.banner), frame: ok(FRAMES, choice.frame), title: ok(TITLES, choice.title), badges };
}

/** Ce que le joueur a débloqué (pour la galerie et pour le fil « succès » à venir). */
export function unlockedIds(list: Cosmetic[], stats: PlayerStats): string[] {
  return list.filter((c) => c.unlock(stats)).map((c) => c.id);
}

export const bannerOf = (id?: string) => find(BANNERS, id) ?? BANNERS[0];
export const frameOf = (id?: string) => find(FRAMES, id) ?? FRAMES[0];
export const titleOf = (id?: string) => find(TITLES, id);
export const badgeOf = (id: string) => find(BADGES, id);
