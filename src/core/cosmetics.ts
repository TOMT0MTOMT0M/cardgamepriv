/**
 * COSMÉTIQUES DU PROFIL — données pures, partagées serveur (convex/profiles.ts) / client / démo.
 *
 * Règle du groupe (3 nov.) : tout se débloque EN JOUANT, rien ne s'achète. Bannières, cadres d'avatar, titres et badges
 * sont des récompenses de SUCCÈS (les 36 de src/core/economy.ts) — calculées à la volée sur les stats, rien à stocker.
 */
import { PUBLIC_CARD_COUNT, SUBTHEMES, catalogEntry } from './sets/themes';
import { ACHIEVEMENTS, achievementDone, achievementStats, emptyEcon } from './economy';

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
  /** comment on l'obtient (affiché quand c'est verrouillé) : le succès qui le débloque */
  how: string;
  /** succès qui le débloque (src/core/economy.ts, ACHIEVEMENTS) ; absent = disponible d'office */
  need?: string;
  unlock: (s: PlayerStats) => boolean;
  /** bannière : dégradé CSS · cadre : couleurs ; le reste est dessiné côté client */
  css?: string;
  /** badge / titre : petit glyphe */
  glyph?: string;
}

/**
 * Retours live n°1 (03/11) : « tout cosmétique se débloque via les succès ». Chaque cosmétique pointe vers un des
 * 36 succès de l'espace Jeux (src/core/economy.ts) — uniquement ceux calculés sur les stats du profil, pour que le
 * serveur puisse vérifier un choix sans les compteurs de l'économie.
 */
const ach = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
const fromStats = (s: PlayerStats) => achievementStats(s, emptyEcon());
type Partial0 = Omit<Cosmetic, 'how' | 'unlock'>;
function C(c: Partial0): Cosmetic {
  if (!c.need) return { ...c, how: '', unlock: () => true };
  const a = ach(c.need);
  if (!a) throw new Error(`succès inconnu : ${c.need}`);
  return { ...c, how: `Succès « ${a.label} » : ${a.how}`, unlock: (s) => achievementDone(a, fromStats(s)) };
}

/** Bannières (fond du haut du profil). */
export const BANNERS: Cosmetic[] = [
  C({ id: 'ember', label: 'Braise', css: 'linear-gradient(120deg, #2a1410, #5a2a22 45%, #1a0d0b)' }),
  C({ id: 'night', label: 'Nuit', css: 'linear-gradient(120deg, #0c1118, #16314a 50%, #0a0f16)' }),
  C({ id: 'forest', label: 'Forêt', css: 'linear-gradient(120deg, #0c1412, #123f2f 50%, #0a1210)' }),
  C({ id: 'plum', label: 'Prune', css: 'linear-gradient(120deg, #120f17, #3b1630 50%, #0e0b12)' }),
  C({ id: 'sand', label: 'Sable', css: 'linear-gradient(120deg, #16100c, #5a3a12 50%, #120d09)' }),
  C({ id: 'gold', label: 'Or', need: 'packs-500', css: 'linear-gradient(120deg, #2a1d06, #7a5a1a 45%, #d9982a 70%, #2a1d06)' }),
  C({ id: 'prism', label: 'Prisme', need: 'myth-1', css: 'linear-gradient(120deg, #ff6b9a22, #ffd36b33, #6bffb833, #6bc8ff33, #c86bff33), linear-gradient(120deg, #1a1420, #2a2433)' }),
  C({ id: 'secret', label: 'Un de nous', need: 'secret-1', css: 'radial-gradient(ellipse at 30% 50%, #e8927c55, transparent 60%), linear-gradient(120deg, #2a0f0e, #4a1f1a 50%, #120607)' }),
];

/** Cadres d'avatar. */
export const FRAMES: Cosmetic[] = [
  C({ id: 'none', label: 'Aucun', css: 'transparent' }),
  C({ id: 'bronze', label: 'Bronze', need: 'packs-100', css: 'linear-gradient(135deg, #b87333, #e0a070, #8a5020)' }),
  C({ id: 'silver', label: 'Argent', need: 'packs-500', css: 'linear-gradient(135deg, #9aa3ad, #e8edf2, #6e7883)' }),
  C({ id: 'gold', label: 'Or', need: 'packs-2000', css: 'linear-gradient(135deg, #d9982a, #ffe0a0, #a06a10)' }),
  C({ id: 'collector', label: 'Collectionneur', need: 'full-1', css: 'linear-gradient(135deg, #4c7cc2, #b4cdf2, #2a4a80)' }),
  C({ id: 'mythic', label: 'Mythique', need: 'myth-1', css: 'conic-gradient(from 0deg, #ff6b9a, #ffd36b, #6bffb8, #6bc8ff, #c86bff, #ff6b9a)' }),
  C({ id: 'secret', label: 'Un de nous', need: 'secret-1', css: 'linear-gradient(135deg, #e8927c, #ffe4d8, #b05040)' }),
  C({ id: 'trader', label: 'Négociant', need: 'trade-10', css: 'linear-gradient(135deg, #6f9a74, #c4dcb8, #3a5a40)' }),
  C({ id: 'flame', label: 'Flamme', need: 'streak-7', css: 'linear-gradient(135deg, #ff7a2a, #ffd36b, #c03010)' }),
];

/** Titres (sous le pseudo). */
export const TITLES: Cosmetic[] = [
  C({ id: 'rookie', label: 'Bébou débutant' }),
  C({ id: 'opener', label: 'Ouvreur compulsif', need: 'packs-100' }),
  C({ id: 'opener2', label: 'Déchireur de boosters', need: 'packs-2000' }),
  C({ id: 'collector', label: 'Collectionneur', need: 'full-1' }),
  C({ id: 'archivist', label: 'Archiviste', need: 'full-10' }),
  C({ id: 'legend', label: 'Chasseur de légendes', need: 'leg-5' }),
  C({ id: 'mythic', label: 'Touché par la foudre', need: 'myth-1' }),
  C({ id: 'secret', label: 'Un de nous', need: 'secret-1' }),
  C({ id: 'trader', label: 'Négociant', need: 'trade-10' }),
  C({ id: 'pyro', label: 'Pyromane', need: 'contract-10' }),
  C({ id: 'loyal', label: 'Fidèle au poste', need: 'streak-7' }),
  C({ id: 'king', label: 'Roi de la collection', need: 'uniq-2000' }),
];

/** Badges (petites médailles sous le pseudo, plusieurs à la fois, ordonnables). */
export const BADGES: Cosmetic[] = [
  C({ id: 'first', label: '10 boosters', need: 'packs-10', glyph: '🎴' }),
  C({ id: 'p100', label: '100 boosters', need: 'packs-100', glyph: '💯' }),
  C({ id: 'p1000', label: '2 000 boosters', need: 'packs-2000', glyph: '🏆' }),
  C({ id: 'full', label: 'Album complet', need: 'full-1', glyph: '📗' }),
  C({ id: 'mythic', label: '6★', need: 'myth-1', glyph: '✺' }),
  C({ id: 'secret', label: 'Bébou secret', need: 'secret-1', glyph: '✷' }),
  C({ id: 'trade', label: 'Échangeur', need: 'trade-1', glyph: '⇄' }),
  C({ id: 'contract', label: 'Contrat signé', need: 'contract-1', glyph: '🔥' }),
  C({ id: 'streak', label: '7 jours', need: 'streak-7', glyph: '🔥7' }),
  C({ id: 'half', label: '5 000 cartes', need: 'uniq-5000', glyph: '📚' }),
];

/**
 * Couleur du profil (retours 04/11, chantier 5) : l'accent du profil (cadre d'avatar sans cadre, titre, onglets actifs,
 * bordures, chiffres clés). Une palette libre pour tout le monde + un sélecteur de couleur libre (« #rrggbb »), et
 * quelques teintes à débloquer par les succès. `css` = la couleur (hexadécimale).
 */
export const ACCENTS: Cosmetic[] = [
  C({ id: 'rose', label: 'Bébou', css: '#e8927c' }),
  C({ id: 'corail', label: 'Corail', css: '#ff7b6b' }),
  C({ id: 'ambre', label: 'Ambre', css: '#f0a04b' }),
  C({ id: 'citron', label: 'Citron', css: '#e6d35a' }),
  C({ id: 'menthe', label: 'Menthe', css: '#6fd6a2' }),
  C({ id: 'lagon', label: 'Lagon', css: '#4fc6c9' }),
  C({ id: 'azur', label: 'Azur', css: '#6aa8ff' }),
  C({ id: 'lavande', label: 'Lavande', css: '#a58bff' }),
  C({ id: 'fuchsia', label: 'Fuchsia', css: '#ff6fc2' }),
  C({ id: 'ivoire', label: 'Ivoire', css: '#efe4d2' }),
  C({ id: 'or', label: 'Or massif', need: 'packs-500', css: '#ffc94a' }),
  C({ id: 'rubis', label: 'Rubis', need: 'leg-5', css: '#ff3b5c' }),
  C({ id: 'saphir', label: 'Saphir', need: 'full-1', css: '#3f7dff' }),
  C({ id: 'jade', label: 'Jade', need: 'trade-10', css: '#2fbf71' }),
  C({ id: 'braise', label: 'Braise', need: 'streak-7', css: '#ff6a1a' }),
  C({ id: 'foudre', label: 'Foudre', need: 'myth-1', css: '#c86bff' }),
  C({ id: 'secret', label: 'Un de nous', need: 'secret-1', css: '#ffb4a2' }),
];
/** couleur libre du sélecteur : « #rrggbb » (gratuite pour tout le monde) */
export const CUSTOM_ACCENT = /^#[0-9a-f]{6}$/;
/** couleur d'accent à appliquer (undefined = l'accent par défaut du site) */
export function accentColor(id?: string): string | undefined {
  if (!id) return undefined;
  if (CUSTOM_ACCENT.test(id)) return id;
  return find(ACCENTS, id)?.css;
}

/** Cosmétiques débloqués par un succès (page Succès : « récompenses »). */
export function cosmeticsOf(achievementId: string): Array<{ kind: 'Bannière' | 'Cadre' | 'Titre' | 'Badge' | 'Couleur'; c: Cosmetic }> {
  const out: Array<{ kind: 'Bannière' | 'Cadre' | 'Titre' | 'Badge' | 'Couleur'; c: Cosmetic }> = [];
  for (const [kind, list] of [['Bannière', BANNERS], ['Cadre', FRAMES], ['Titre', TITLES], ['Badge', BADGES], ['Couleur', ACCENTS]] as const) for (const c of list) if (c.need === achievementId) out.push({ kind, c });
  return out;
}

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
  /** couleur du profil : id d'ACCENTS ou « #rrggbb » libre */
  accent?: string;
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
  const a = (choice.accent ?? '').toLowerCase();
  const accent = CUSTOM_ACCENT.test(a) ? a : ok(ACCENTS, choice.accent);
  return { banner: ok(BANNERS, choice.banner), frame: ok(FRAMES, choice.frame), title: ok(TITLES, choice.title), badges, ...(accent ? { accent } : {}) };
}

/** Ce que le joueur a débloqué (pour la galerie et pour le fil « succès » à venir). */
export function unlockedIds(list: Cosmetic[], stats: PlayerStats): string[] {
  return list.filter((c) => c.unlock(stats)).map((c) => c.id);
}

export const bannerOf = (id?: string) => find(BANNERS, id) ?? BANNERS[0];
export const frameOf = (id?: string) => find(FRAMES, id) ?? FRAMES[0];
export const titleOf = (id?: string) => find(TITLES, id);
export const badgeOf = (id: string) => find(BADGES, id);

/**
 * Photo de profil / bannière IMPORTÉES par le joueur (retours live 02) : un GIF animé (lu en boucle, muet ; image fixe
 * en « mouvements réduits ») ou une image fixe. Poids maximal et formats : les mêmes au serveur (convex/profiles.ts) et
 * au client. Démo : plus bas (le fichier tient dans le localStorage du navigateur).
 */
export type ProfileMediaKind = 'avatar' | 'banner';
export const PROFILE_MEDIA_MAX = 2 * 1024 * 1024;
export const PROFILE_MEDIA_DEMO_MAX = 700 * 1024;
export const PROFILE_MEDIA_TYPES = ['image/gif', 'image/png', 'image/jpeg', 'image/webp'];
/** « 2,4 Mo » */
export const fmtMo = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
/** Motif de refus (vide = accepté) : le même texte au client (avant l'envoi) et au serveur. */
export function profileMediaProblem(size: number, type: string | undefined, max = PROFILE_MEDIA_MAX): string {
  if (!PROFILE_MEDIA_TYPES.includes(type ?? '')) return 'Format refusé : GIF, PNG, JPEG ou WebP seulement.';
  if (size > max) return `Fichier trop lourd (${fmtMo(size)}) : ${max >= 1024 * 1024 ? fmtMo(max) : `${Math.round(max / 1024)} Ko`} au maximum.`;
  return '';
}
