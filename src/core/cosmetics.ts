/**
 * COSMÉTIQUES DU PROFIL — données pures, partagées serveur (convex/profiles.ts) / client / démo.
 *
 * Règle du groupe (3 nov.) : tout se débloque EN JOUANT, rien ne s'achète. Bannières, cadres d'avatar, titres et badges
 * sont des récompenses de SUCCÈS (les 36 de src/core/economy.ts) — calculées à la volée sur les stats, rien à stocker.
 */
import { locale } from './i18n';
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
  /** (retours live 6, C15) cartes différentes par thème */
  worldUniques: number;
  gamingUniques: number;
  popUniques: number;
  sportUniques: number;
  /** doublons brûlés à la forge (compteur de l'économie, porté par le profil pour les titres de la forge) */
  burned?: number;
  /** 1 = a déjà été n°1 du classement (convex/profiles.ts, markLeader) */
  wasTop?: number;
  /** (11/11, saisons — convex/seasons.ts) saisons finies dans les 3 premiers / premier */
  seasonPodiums?: number;
  seasonWins?: number;
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
  /** (retours live 6, C14) cadre ANIMÉ : nom de l'animation (style.css, `.frame-a-…`) */
  anim?: string;
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

/**
 * Couleur du profil (retours 04/11, chantier 5) : l'accent du profil (cadre d'avatar sans cadre, titre, onglets actifs,
 * bordures, chiffres clés). Une palette libre pour tout le monde + un sélecteur de couleur libre (« #rrggbb »), et
 * quelques teintes à débloquer par les succès. `css` = la couleur (hexadécimale).
 */
// (retours live 6, C10) toutes les couleurs sont libres (le sélecteur « #rrggbb » l'était déjà) : un palier de succès
// ne débloque plus qu'UNE récompense, les couleurs ne sont plus des récompenses
export const ACCENTS: Cosmetic[] = [
  C({ id: 'blanc', label: 'Blanc', css: '#ffffff' }),
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
  C({ id: 'or', label: 'Or massif', css: '#ffc94a' }),
  C({ id: 'rubis', label: 'Rubis', css: '#ff3b5c' }),
  C({ id: 'saphir', label: 'Saphir', css: '#3f7dff' }),
  C({ id: 'jade', label: 'Jade', css: '#2fbf71' }),
  C({ id: 'braise', label: 'Braise', css: '#ff6a1a' }),
  C({ id: 'foudre', label: 'Foudre', css: '#c86bff' }),
  C({ id: 'secret', label: 'Un de nous', css: '#ffb4a2' }),
];

/**
 * (retours 06/11 : « bannière, cadre, couleur, vitrine : les mêmes couleurs disponibles ») — la bannière et le cadre
 * se choisissent désormais dans la MÊME palette que la couleur du profil et la vitrine (ACCENTS : mêmes teintes, mêmes
 * déblocages), plus la couleur libre (« #rrggbb »). Les anciens fonds / cadres (avant le 06/11) restent reconnus pour
 * ceux qui les ont choisis, mais ne sont plus proposés.
 */
// (retours live 6, C4 : zéro dégradé) bannière = un APLAT de la couleur (assombrie pour le texte blanc) ; cadre = la
// couleur pure. (B4) Le cadre était un dégradé posé dans un `box-shadow`, qui n'accepte qu'une couleur : rien ne
// s'affichait autour de la photo.
const bannerCss = (hex: string) => `color-mix(in srgb, ${hex} 58%, #000000)`;
const frameCss = (hex: string) => hex;
/**
 * Bannières (fond du haut du profil) : « Aucune couleur » (C13 — par défaut, et pour une bannière GIF sans contour),
 * puis une par couleur de la palette.
 */
export const BANNERS: Cosmetic[] = [C({ id: 'none', label: 'Aucune couleur', css: 'transparent' }), ...ACCENTS.map((a) => ({ ...a, id: `c-${a.id}`, css: bannerCss(a.css!) }))];
/**
 * (retours live 6, C14) cadres ANIMÉS autour de la photo (style.css, `.frame-a-…`) : récompenses de succès. `css` = la
 * couleur de l'anneau (classement, aperçus).
 */
const ANIMATED_FRAMES: Cosmetic[] = [
  C({ id: 'a-eclairs', label: 'Éclairs', need: 'leg-5', css: '#8fd6ff', anim: 'eclairs' }),
  C({ id: 'a-feu', label: 'Feu', need: 'leg-50', css: '#ff7a2a', anim: 'feu' }),
  C({ id: 'a-ange', label: 'Ange', need: 'full-25', css: '#ffffff', anim: 'ange' }),
  C({ id: 'a-coeurs', label: 'Cœurs', need: 'trade-25', css: '#ff5d8f', anim: 'coeurs' }),
  C({ id: 'a-galaxie', label: 'Galaxie', need: 'uniq-1000', css: '#b59cff', anim: 'galaxie' }),
  C({ id: 'a-neon', label: 'Néon', need: 'contract-25', css: '#39ffd2', anim: 'neon' }),
];
/** (11/11, saisons) cadre gagné en finissant une saison sur le podium (convex/seasons.ts) — doré : la couleur dit le rang */
const SEASON_FRAMES: Cosmetic[] = [C({ id: 's-podium', label: 'Podium de saison', need: 'season-podium', css: '#ffc94a' })];
/** Cadres d'avatar : aucun, un par couleur de la palette, puis les cadres animés et celui des saisons. */
export const FRAMES: Cosmetic[] = [C({ id: 'none', label: 'Aucun', css: 'transparent' }), ...ACCENTS.map((a) => ({ ...a, id: `c-${a.id}`, css: frameCss(a.css!) })), ...ANIMATED_FRAMES, ...SEASON_FRAMES];
const LEGACY_BANNERS: Cosmetic[] = [
  C({ id: 'ember', label: 'Braise', css: 'linear-gradient(120deg, #2a1410, #5a2a22 45%, #1a0d0b)' }),
  C({ id: 'night', label: 'Nuit', css: 'linear-gradient(120deg, #0c1118, #16314a 50%, #0a0f16)' }),
  C({ id: 'forest', label: 'Forêt', css: 'linear-gradient(120deg, #0c1412, #123f2f 50%, #0a1210)' }),
  C({ id: 'plum', label: 'Prune', css: 'linear-gradient(120deg, #120f17, #3b1630 50%, #0e0b12)' }),
  C({ id: 'sand', label: 'Sable', css: 'linear-gradient(120deg, #16100c, #5a3a12 50%, #120d09)' }),
  C({ id: 'gold', label: 'Or', need: 'packs-500', css: 'linear-gradient(120deg, #2a1d06, #7a5a1a 45%, #d9982a 70%, #2a1d06)' }),
  C({ id: 'prism', label: 'Prisme', need: 'myth-1', css: 'linear-gradient(120deg, #ff6b9a22, #ffd36b33, #6bffb833, #6bc8ff33, #c86bff33), linear-gradient(120deg, #1a1420, #2a2433)' }),
  C({ id: 'secret', label: 'Un de nous', need: 'secret-1', css: 'radial-gradient(ellipse at 30% 50%, #e8927c55, transparent 60%), linear-gradient(120deg, #2a0f0e, #4a1f1a 50%, #120607)' }),
];
const LEGACY_FRAMES: Cosmetic[] = [
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

/**
 * Titres (sous le pseudo) — (retours live 6, C15, liste tranchée) liés à l'univers du jeu, un par palier de succès.
 * Anciens titres (« Ouvreur compulsif »…) retirés : un joueur qui en portait un repasse sans titre.
 */
export const TITLES: Cosmetic[] = [
  C({ id: 'rookie', label: 'Bébou débutant' }),
  C({ id: 't-bebou-2', label: 'Bébou confirmé', need: 'bebou-15' }),
  C({ id: 't-bebou-3', label: 'Bébou d’or', need: 'bebou-30' }),
  C({ id: 't-bebou-4', label: 'Roi des Bébous', need: 'bebou-50' }),
  C({ id: 't-world-1', label: 'Explorateur', need: 'world-50' }),
  C({ id: 't-world-2', label: 'Globe-trotteur', need: 'world-1000' }),
  C({ id: 't-world-3', label: 'Tour du monde', need: 'world-3500' }),
  C({ id: 't-gaming-1', label: 'Tryhard', need: 'gaming-50' }),
  C({ id: 't-gaming-2', label: 'Boss final', need: 'gaming-1500' }),
  C({ id: 't-gaming-3', label: 'GG', need: 'gaming-5500' }),
  C({ id: 't-pop-1', label: 'Fan absolu', need: 'pop-100' }),
  C({ id: 't-pop-2', label: 'Icône pop', need: 'pop-3000' }),
  C({ id: 't-pop-3', label: 'Star absolue', need: 'pop-11000' }),
  C({ id: 't-sport-1', label: 'Athlète', need: 'sport-50' }),
  C({ id: 't-sport-2', label: 'Champion', need: 'sport-1500' }),
  C({ id: 't-sport-3', label: 'Ballon d’or', need: 'sport-5000' }),
  C({ id: 't-packs-1', label: 'Déchireur', need: 'packs-250' }),
  C({ id: 't-packs-2', label: 'Les mains en or', need: 'packs-2000' }),
  C({ id: 't-albums-1', label: 'Relieur', need: 'full-10' }),
  C({ id: 't-albums-2', label: 'Maître des albums', need: 'full-50' }),
  C({ id: 't-trade-1', label: 'Marchand', need: 'trade-10' }),
  C({ id: 't-trade-2', label: 'Magnat des échanges', need: 'trade-50' }),
  C({ id: 't-contract-1', label: 'Signataire', need: 'contract-10' }),
  C({ id: 't-contract-2', label: 'As des contrats', need: 'contract-50' }),
  C({ id: 't-forge-1', label: 'Pyromane', need: 'burn-100' }),
  C({ id: 't-forge-2', label: 'Maître de la forge', need: 'burn-1000' }),
  C({ id: 't-streak-1', label: 'Fidèle', need: 'streak-14' }),
  C({ id: 't-streak-2', label: 'Inconditionnel', need: 'streak-30' }),
  C({ id: 't-coll-1', label: 'Collectionneur', need: 'uniq-500' }),
  C({ id: 't-coll-2', label: 'Roi de la collection', need: 'uniq-10000' }),
  C({ id: 't-star-1', label: 'Chasseur d’étoiles', need: 'myth-1' }),
  C({ id: 't-star-2', label: 'Chasseur de légendes', need: 'myth-10' }),
  C({ id: 't-star-3', label: 'Arc-en-ciel', need: 'myth-50' }),
  C({ id: 't-top', label: 'Numéro un', need: 'top-1' }),
  // (11/11, saisons) premier d'une saison mensuelle du classement (convex/seasons.ts)
  C({ id: 't-season-1', label: 'Champion de saison', need: 'season-1' }),
];

/**
 * (11/11, sondage : « animations d'ouverture à débloquer ») ANIMATIONS D'OUVERTURE — décision de Tom du 07/11 : la
 * déchirure pour tout le monde, les autres se GAGNENT (un succès chacune). Le choix vaut pour tous les boosters ; il est
 * gardé au serveur (`users.cosmetics.opening`, convex/profiles.ts `setOpening`, refusé si verrouillé). Mise en scène :
 * src/game/scenes/opening.ts (`openStyleOf`).
 */
export type OpeningId = 'tear' | 'burn' | 'fan';
export const OPENINGS: Array<Cosmetic & { id: OpeningId; blurb: string }> = [
  { ...C({ id: 'tear', label: 'Déchirure' }), id: 'tear', blurb: 'Glisse le doigt pour déchirer le haut du booster.' },
  { ...C({ id: 'burn', label: 'Brûlure', need: 'burn-250' }), id: 'burn', blurb: 'Maintiens pour brûler l’emballage depuis le centre.' },
  { ...C({ id: 'fan', label: 'Éventail', need: 'world-150' }), id: 'fan', blurb: 'Un toucher arrache le haut, les cartes s’ouvrent en éventail.' },
];
export const DEFAULT_OPENING: OpeningId = 'tear';

/** Badges (petites médailles sous le pseudo, plusieurs à la fois, ordonnables). */
export const BADGES: Cosmetic[] = [
  C({ id: 'first', label: '10 boosters', need: 'packs-10', glyph: '🎴' }),
  C({ id: 'p100', label: '100 boosters', need: 'packs-100', glyph: '💯' }),
  C({ id: 'p1000', label: '1 000 boosters', need: 'packs-1000', glyph: '🏆' }),
  C({ id: 'full', label: 'Album complet', need: 'full-1', glyph: '📗' }),
  C({ id: 'mythic', label: '5 × 6★', need: 'myth-5', glyph: '✺' }),
  C({ id: 'secret', label: 'Bébou secret', need: 'secret-1', glyph: '✷' }),
  C({ id: 'trade', label: 'Échangeur', need: 'trade-1', glyph: '⇄' }),
  C({ id: 'contract', label: 'Contrat signé', need: 'contract-1', glyph: '🔥' }),
  C({ id: 'streak', label: '7 jours', need: 'streak-7', glyph: '🔥7' }),
  C({ id: 'half', label: '5 000 cartes', need: 'uniq-5000', glyph: '📚' }),
];

/**
 * FOND DE VITRINE (retours 05/11 : « pouvoir changer la couleur et le fond de notre vitrine »). `css` = le fond, qui
 * peut utiliser `--vc` (la couleur de vitrine choisie : bordure, lueur, étagère). Quelques fonds à débloquer.
 */
export const VITRINES: Cosmetic[] = [
  C({ id: 'velours', label: 'Velours', css: 'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--vc) 16%, transparent), transparent 62%), linear-gradient(180deg, rgba(30, 23, 20, 0.92), rgba(12, 10, 9, 0.96))' }),
  C({ id: 'nuit', label: 'Nuit étoilée', css: 'radial-gradient(1.5px 1.5px at 12% 22%, #fff9, transparent), radial-gradient(1px 1px at 68% 14%, #fff8, transparent), radial-gradient(1.5px 1.5px at 84% 62%, #fff7, transparent), radial-gradient(1px 1px at 34% 78%, #fff6, transparent), radial-gradient(ellipse at 50% 120%, color-mix(in srgb, var(--vc) 30%, transparent), transparent 60%), linear-gradient(180deg, #0b1020, #05070e)' }),
  C({ id: 'feutre', label: 'Feutrine', css: 'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--vc) 20%, #12382a), #071a12 75%)' }),
  C({ id: 'papier', label: 'Papier kraft', css: 'radial-gradient(ellipse at 30% 0%, #ffffff14, transparent 50%), linear-gradient(180deg, #3a2a1c, #21170f)' }),
  C({ id: 'neon', label: 'Néon', css: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--vc) 18%, transparent) 0 1px, transparent 1px 44px), repeating-linear-gradient(0deg, color-mix(in srgb, var(--vc) 14%, transparent) 0 1px, transparent 1px 44px), linear-gradient(180deg, #0d0a14, #07060b)' }),
  C({ id: 'beton', label: 'Béton', css: 'radial-gradient(ellipse at 50% 0%, #ffffff12, transparent 60%), linear-gradient(180deg, #2a2a2c, #161617)' }),
  C({ id: 'or', label: 'Écrin doré', need: 'packs-500', css: 'radial-gradient(ellipse at 50% 0%, #ffd77a33, transparent 60%), linear-gradient(180deg, #3a2a0c, #1a1206)' }),
  C({ id: 'aurore', label: 'Aurore', need: 'streak-60', css: 'radial-gradient(ellipse at 20% 0%, #6bffb833, transparent 55%), radial-gradient(ellipse at 80% 10%, #c86bff33, transparent 55%), linear-gradient(180deg, #0c1418, #06090c)' }),
  C({ id: 'prisme', label: 'Prisme', need: 'myth-25', css: 'linear-gradient(120deg, #ff6b9a1f, #ffd36b26, #6bffb826, #6bc8ff26, #c86bff26), linear-gradient(180deg, #1a1420, #0d0a10)' }),
  C({ id: 'secret', label: 'Un de nous', need: 'secret-3', css: 'radial-gradient(ellipse at 50% 0%, #e8927c44, transparent 60%), linear-gradient(180deg, #2a0f0e, #120607)' }),
];
export const vitrineOf = (id?: string) => find(VITRINES, id) ?? VITRINES[0];

/** couleur libre du sélecteur : « #rrggbb » (gratuite pour tout le monde) */
export const CUSTOM_ACCENT = /^#[0-9a-f]{6}$/;
/** couleur d'accent à appliquer (undefined = l'accent par défaut du site) */
export function accentColor(id?: string): string | undefined {
  if (!id) return undefined;
  if (CUSTOM_ACCENT.test(id)) return id;
  return find(ACCENTS, id)?.css;
}

/** Cosmétiques débloqués par un succès (page Succès : « récompenses »). */
export type CosmeticKind = 'Bannière' | 'Cadre' | 'Titre' | 'Badge' | 'Couleur' | 'Vitrine' | 'Ouverture';
export function cosmeticsOf(achievementId: string): Array<{ kind: CosmeticKind; c: Cosmetic }> {
  const out: Array<{ kind: CosmeticKind; c: Cosmetic }> = [];
  for (const [kind, list] of [['Bannière', BANNERS], ['Cadre', FRAMES], ['Titre', TITLES], ['Badge', BADGES], ['Couleur', ACCENTS], ['Vitrine', VITRINES], ['Ouverture', OPENINGS]] as const) for (const c of list) if (c.need === achievementId) out.push({ kind, c });
  return out;
}

/** Statistiques d'un joueur à partir de sa collection et de ses compteurs (même calcul serveur / client / démo). */
export function statsFrom(
  collection: Array<{ cardId: string; rarity: string; count: number }>,
  extra: { packsOpened: number; tradesDone: number; contractsSigned: number; streak: number; burned?: number; wasTop?: number; seasonPodiums?: number; seasonWins?: number },
): PlayerStats {
  const ids = new Set<string>();
  let mythics = 0, legendaries = 0, secrets = 0;
  // (retours live 6, C15) cartes différentes par thème (titres World / Gaming / Pop Culture / Sport)
  const byTheme = new Map<string, Set<string>>();
  for (const c of collection) {
    const e = catalogEntry(c.cardId);
    if (!e) continue;
    if (c.rarity === 'secret') secrets++;
    else {
      ids.add(c.cardId);
      let t = byTheme.get(e.themeId);
      if (!t) byTheme.set(e.themeId, (t = new Set()));
      t.add(c.cardId);
    }
    if (c.rarity === 'mythic') mythics++;
    if (c.rarity === 'legendary') legendaries++;
  }
  let fullSubthemes = 0;
  for (const st of SUBTHEMES) if (st.cards.length && st.cards.every((c) => ids.has(c.id))) fullSubthemes++;
  const n = (t: string) => byTheme.get(t)?.size ?? 0;
  return {
    ...extra,
    uniques: ids.size,
    total: PUBLIC_CARD_COUNT,
    mythics,
    legendaries,
    secrets,
    fullSubthemes,
    worldUniques: n('monde'),
    gamingUniques: n('gaming'),
    popUniques: n('pop'),
    sportUniques: n('sport'),
  };
}

/** Couleur d'une bannière (contour d'une bannière GIF, C13) : undefined = « Aucune couleur ». */
export function bannerColor(id?: string): string | undefined {
  if (!id || id === 'none') return undefined;
  if (CUSTOM_ACCENT.test(id)) return id;
  return find(ACCENTS, id.replace(/^c-/, ''))?.css;
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
  /** vitrine : fond (VITRINES) et couleur (id d'ACCENTS ou « #rrggbb ») */
  vitrine?: string;
  vitrineColor?: string;
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
  const color = (v?: string) => {
    const a = (v ?? '').toLowerCase();
    return CUSTOM_ACCENT.test(a) ? a : ok(ACCENTS, v);
  };
  const accent = color(choice.accent);
  const vitrine = ok(VITRINES, choice.vitrine);
  const vitrineColor = color(choice.vitrineColor);
  const pick = (list: Cosmetic[], legacy: Cosmetic[], v?: string) => {
    const a = (v ?? '').toLowerCase();
    return CUSTOM_ACCENT.test(a) ? a : ok(list, v) ?? ok(legacy, v);
  };
  return { banner: pick(BANNERS, LEGACY_BANNERS, choice.banner), frame: pick(FRAMES, LEGACY_FRAMES, choice.frame), title: ok(TITLES, choice.title), badges, ...(accent ? { accent } : {}), ...(vitrine ? { vitrine } : {}), ...(vitrineColor ? { vitrineColor } : {}) };
}

/** Ce que le joueur a débloqué (pour la galerie et pour le fil « succès » à venir). */
export function unlockedIds(list: Cosmetic[], stats: PlayerStats): string[] {
  return list.filter((c) => c.unlock(stats)).map((c) => c.id);
}

const customOf = (id: string | undefined, css: (hex: string) => string): Cosmetic | undefined =>
  id && CUSTOM_ACCENT.test(id) ? { id, label: id.toUpperCase(), how: '', unlock: () => true, css: css(id) } : undefined;
export const bannerOf = (id?: string) => find(BANNERS, id) ?? find(LEGACY_BANNERS, id) ?? customOf(id, bannerCss) ?? BANNERS[0];
/** cadres d'avant le 07/11 (dégradés) : leur couleur principale, en aplat (le `box-shadow` n'accepte qu'une couleur) */
const legacyFrame = (c: Cosmetic | undefined) => (c && c.id !== 'mythic' ? { ...c, css: c.css?.match(/#[0-9a-f]{6}/i)?.[0] ?? c.css } : c);
export const frameOf = (id?: string) => find(FRAMES, id) ?? legacyFrame(find(LEGACY_FRAMES, id)) ?? customOf(id, frameCss) ?? FRAMES[0];
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
export const fmtMo = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} Mo`;
/** Motif de refus (vide = accepté) : le même texte au client (avant l'envoi) et au serveur. */
export function profileMediaProblem(size: number, type: string | undefined, max = PROFILE_MEDIA_MAX): string {
  if (!PROFILE_MEDIA_TYPES.includes(type ?? '')) return 'Format refusé : GIF, PNG, JPEG ou WebP seulement.';
  if (size > max) return `Fichier trop lourd (${fmtMo(size)}) : ${max >= 1024 * 1024 ? fmtMo(max) : `${Math.round(max / 1024)} Ko`} au maximum.`;
  return '';
}
