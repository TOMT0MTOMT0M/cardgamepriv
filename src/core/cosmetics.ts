/**
 * COSMÉTIQUES DU PROFIL — données pures, partagées serveur (convex/profiles.ts) / client / démo.
 *
 * Règle du groupe (3 nov.) : tout se débloque EN JOUANT, rien ne s'achète. Bannières, cadres d'avatar, titres et badges
 * sont des récompenses de SUCCÈS (les 36 de src/core/economy.ts) — calculées à la volée sur les stats, rien à stocker.
 */
import { fe } from './errors';
import { tData } from './i18n';
import { locale } from './i18n';
import { PUBLIC_CARD_COUNT, SUBTHEMES, catalogEntry } from './sets/themes';
import { ACHIEVEMENTS, achievementDone, achievementRetired, achievementStats, emptyEcon } from './economy';

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
  season0Top?: number;
  season0Player?: number;
  /** (v2.1.13) cases ouvertes du calendrier de l'Avent de l'édition en cours (src/core/avent.ts) : cosmétiques de Noël */
  advent?: number[];
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
  /** (14/11, refonte de la personnalisation) cadre DESSINÉ : nom du dessin (src/game/cosmeticArt.ts) */
  art?: string;
  /** (14/11) matière(s) de l'élément : un cadre et un fond de la même matière forment un ACCORD (`accordOf`) */
  tags?: Matter[];
  /**
   * (v2.1.13) cosmétique de Noël : le jour de la case du calendrier de l'Avent qui le donne (src/core/avent.ts). Débloqué
   * dès que la case est ouverte (`PlayerStats.advent`), pour toujours ; pas de succès.
   */
  advent?: number;
}

/** (14/11) matières des accords : cadre + fond de la même matière = un petit plus visible sur le profil */
export type Matter = 'feu' | 'foudre' | 'cosmos' | 'neon' | 'retro' | 'sport' | 'manga' | 'doux' | 'monde' | 'ombre';

/**
 * Retours live n°1 (03/11) : « tout cosmétique se débloque via les succès ». Chaque cosmétique pointe vers un des
 * 36 succès de l'espace Jeux (src/core/economy.ts) — uniquement ceux calculés sur les stats du profil, pour que le
 * serveur puisse vérifier un choix sans les compteurs de l'économie.
 */
const ach = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;
const fromStats = (s: PlayerStats) => achievementStats(s, emptyEcon());
type Partial0 = Omit<Cosmetic, 'how' | 'unlock'>;
/**
 * (version anglaise) libellé lu à l'affichage : le français est la clé (`cos.<libellé>`), l'anglais dans i18n/en/data.ts.
 * `derive` garde ces lectures (un `{ ...a }` les figerait dans la langue du chargement).
 */
const labelOf = (fr: string) => () => tData(`cos.${fr}`, fr);
const derive = <T extends Cosmetic>(a: T, o: Partial<Cosmetic>): T =>
  Object.defineProperty({ ...a, ...o }, 'label', { get: () => a.label, enumerable: true, configurable: true }) as T;
function C(c: Partial0): Cosmetic {
  const label = labelOf(c.label);
  if (c.advent) {
    const day = c.advent;
    const out = { ...c, how: '', unlock: (s: PlayerStats) => !!s.advent?.includes(day) } as Cosmetic;
    Object.defineProperty(out, 'label', { get: label, enumerable: true, configurable: true });
    Object.defineProperty(out, 'how', { get: () => tData('cos.howAdvent', 'Case {d} du calendrier de l’Avent').replace('{d}', String(day)), enumerable: true, configurable: true }); // i18n-ok
    return out;
  }
  if (!c.need) return Object.defineProperty({ ...c, how: '', unlock: () => true }, 'label', { get: label, enumerable: true, configurable: true }) as Cosmetic;
  const a = ach(c.need);
  if (!a) throw new Error(`succès inconnu : ${c.need}`);
  const out = { ...c, how: '', unlock: (s: PlayerStats) => achievementDone(a, fromStats(s)) } as Cosmetic;
  Object.defineProperty(out, 'label', { get: label, enumerable: true, configurable: true });
  Object.defineProperty(out, 'how', { get: () => tData('cos.howFmt', 'Succès « {l} » : {h}').replace('{l}', a.label).replace('{h}', a.how), enumerable: true, configurable: true }); // i18n-ok
  return out;
}

/**
 * Couleur du profil (retours 04/11, chantier 5) : l'accent du profil (cadre d'avatar sans cadre, titre, onglets actifs,
 * bordures, chiffres clés). Une palette libre pour tout le monde + un sélecteur de couleur libre (« #rrggbb »), et
 * quelques teintes à débloquer par les succès. `css` = la couleur (hexadécimale).
 */
// (retours live 6, C10) toutes les couleurs sont libres (le sélecteur « #rrggbb » l'était déjà) : un palier de succès
// ne débloque plus qu'UNE récompense, les couleurs ne sont plus des récompenses
// i18n-data:début
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
// i18n-data:fin

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
// i18n-data:début
export const BANNERS: Cosmetic[] = [C({ id: 'none', label: 'Aucune couleur', css: 'transparent' }), ...ACCENTS.map((a) => derive(a, { id: `c-${a.id}`, css: bannerCss(a.css!) })),
  // (v2.1.13) Avent 2026 : bannières DESSINÉES en CSS (aucune image), données par leur case (src/core/avent.ts)
  C({ id: 'x-village', label: 'Village enneigé', advent: 6, css: 'radial-gradient(2px 2px at 8% 20%, #fff, transparent), radial-gradient(1.5px 1.5px at 23% 46%, #ffffffcc, transparent), radial-gradient(2px 2px at 41% 14%, #ffffffdd, transparent), radial-gradient(1.5px 1.5px at 62% 36%, #ffffffbb, transparent), radial-gradient(2px 2px at 78% 18%, #fff, transparent), radial-gradient(1.5px 1.5px at 92% 42%, #ffffffcc, transparent), radial-gradient(3px 3px at 24% 77%, #ffd27a, transparent), radial-gradient(3px 3px at 31% 79%, #ffd27a, transparent), radial-gradient(3px 3px at 66% 74%, #ffc65a, transparent), radial-gradient(3px 3px at 74% 76%, #ffd27a, transparent), radial-gradient(ellipse 34% 22% at 20% 100%, #eef6ff 98%, transparent 100%), radial-gradient(ellipse 40% 26% at 62% 104%, #dbe9fa 98%, transparent 100%), radial-gradient(ellipse 30% 20% at 96% 100%, #eaf3ff 98%, transparent 100%), linear-gradient(180deg, #0b1838, #23407a 70%, #3a5c96)' }),
  C({ id: 'x-atelier', label: 'Atelier du Père Noël', advent: 17, css: 'radial-gradient(4px 4px at 10% 14%, #ffd36b, transparent), radial-gradient(4px 4px at 26% 22%, #ff5a5a, transparent), radial-gradient(4px 4px at 42% 14%, #7dff9a, transparent), radial-gradient(4px 4px at 58% 22%, #ffd36b, transparent), radial-gradient(4px 4px at 74% 14%, #ff5a5a, transparent), radial-gradient(4px 4px at 90% 22%, #7dff9a, transparent), radial-gradient(ellipse at 50% 0%, #ffb34733, transparent 60%), repeating-linear-gradient(90deg, #00000033 0 2px, transparent 2px 44px), linear-gradient(180deg, transparent 0 72%, #3a1b0e 72% 74%, #5a2c16 74%), linear-gradient(180deg, #6e1414, #3d0a0a)' }),
];

// i18n-data:fin
/**
 * (retours live 6, C14) cadres ANIMÉS autour de la photo (style.css, `.frame-a-…`) : récompenses de succès. `css` = la
 * couleur de l'anneau (classement, aperçus).
 */
// i18n-data:début
const ANIMATED_FRAMES: Cosmetic[] = [
  C({ id: 'a-eclairs', label: 'Éclairs', need: 'leg-5', css: '#8fd6ff', anim: 'eclairs', art: 'eclairs', tags: ['foudre'] }),
  C({ id: 'a-feu', label: 'Feu', need: 'leg-50', css: '#ff7a2a', anim: 'feu', art: 'feu', tags: ['feu'] }),
  C({ id: 'a-ange', label: 'Ange', need: 'full-25', css: '#ffffff', anim: 'ange', art: 'ange' }),
  C({ id: 'a-coeurs', label: 'Cœurs', need: 'trade-25', css: '#ff5d8f', anim: 'coeurs', art: 'coeurs', tags: ['doux'] }),
  C({ id: 'a-galaxie', label: 'Galaxie', need: 'uniq-1000', css: '#b59cff', anim: 'galaxie', art: 'galaxie', tags: ['cosmos'] }),
  C({ id: 'a-neon', label: 'Néon', need: 'contract-25', css: '#39ffd2', anim: 'neon', art: 'neon', tags: ['neon'] }),
];
// i18n-data:fin
/** (11/11, saisons) cadre gagné en finissant une saison sur le podium (convex/seasons.ts) — doré : la couleur dit le rang */
// i18n-data:début
const SEASON_FRAMES: Cosmetic[] = [C({ id: 's-podium', label: 'Podium de saison', need: 'season-podium', css: '#ffc94a', art: 'podium' })];
/** (v2.1.13) Avent 2026 : cadres dessinés (src/game/cosmeticArt.ts), chacun donné par sa case (src/core/avent.ts) */
const NOEL_FRAMES: Cosmetic[] = [
  C({ id: 'x-flocon', label: 'Flocon givré', advent: 3, css: '#cfeaff', art: 'flocon' }),
  C({ id: 'x-sucre', label: 'Sucre d’orge', advent: 13, css: '#ff4d5e', art: 'sucre' }),
  C({ id: 'x-bonnet', label: 'Chapeau de Noël', advent: 23, css: '#e8333f', art: 'bonnet' }),
];

// i18n-data:fin
/**
 * (14/11, refonte de la personnalisation) cadres DESSINÉS au trait et à l'aplat (src/game/cosmeticArt.ts), teintés par
 * la couleur du profil. (14/11, soir) TOUS se gagnent dans les succès, du facile au très long — et pas « le plus beau
 * pour le plus dur » : de beaux éléments sur des paliers faciles, des sobres sur des paliers longs. `css` absent : la
 * couleur du profil.
 */
// i18n-data:début
export const DRAWN_FRAMES: Cosmetic[] = [
  C({ id: 'n-filet', label: 'Double filet', need: 'streak-45', art: 'filet' }),
  C({ id: 'n-points', label: 'Pointillé', need: 'pop-1500', art: 'points' }),
  C({ id: 'n-crans', label: 'Crans', need: 'world-600', art: 'crans' }),
  C({ id: 'n-pixel', label: 'Pixel', need: 'leg-10', art: 'pixel', tags: ['retro'] }),
  C({ id: 'n-petales', label: 'Pétales', need: 'streak-5', art: 'petales', tags: ['doux'] }),
  C({ id: 'n-engrenage', label: 'Engrenage', need: 'packs-50', art: 'engrenage' }),
  C({ id: 'n-vague', label: 'Vague', need: 'uniq-100', art: 'vague', tags: ['monde'] }),
  C({ id: 'n-confettis', label: 'Confettis', need: 'bebou-5', art: 'confettis' }),
  C({ id: 'n-chat', label: 'Oreilles de chat', need: 'trade-5', art: 'chat', tags: ['doux'] }),
  C({ id: 'n-ronces', label: 'Ronces', need: 'burn-500', art: 'ronces', tags: ['ombre'] }),
  C({ id: 'n-laurier', label: 'Laurier', need: 'sport-3000', art: 'laurier', tags: ['sport'] }),
  C({ id: 'n-impact', label: 'Impact', need: 'myth-3', art: 'impact', tags: ['manga'] }),
  C({ id: 'n-orbite', label: 'Orbite', need: 'uniq-7500', art: 'orbite', tags: ['cosmos'] }),
];
// i18n-data:fin
/** Cadres d'avatar : aucun, un par couleur de la palette, les cadres dessinés, puis les cadres animés et celui des saisons. */
// i18n-data:début
export const FRAMES: Cosmetic[] = [C({ id: 'none', label: 'Aucun', css: 'transparent' }), ...ACCENTS.map((a) => derive(a, { id: `c-${a.id}`, css: frameCss(a.css!) })), ...DRAWN_FRAMES, ...ANIMATED_FRAMES, ...SEASON_FRAMES, ...NOEL_FRAMES];

// i18n-data:fin
// i18n-data:début
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
// i18n-data:fin
// i18n-data:début
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
// i18n-data:fin

/**
 * Titres (sous le pseudo) — (retours live 6, C15, liste tranchée) liés à l'univers du jeu, un par palier de succès.
 * Anciens titres (« Ouvreur compulsif »…) retirés : un joueur qui en portait un repasse sans titre.
 */
// i18n-data:début
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
  // (25/11) saison 0 (novembre 2026) : titres qui ne se regagnent pas
  C({ id: 't-s0-podium', label: 'Podium de la saison 0', need: 's0-podium' }),
  C({ id: 't-s0-joueur', label: 'Participant de la saison 0', need: 's0-joueur' }),
];
// i18n-data:fin

/**
 * (11/11, sondage : « animations d'ouverture à débloquer ») ANIMATIONS D'OUVERTURE — décision de Tom du 07/11 : la
 * déchirure pour tout le monde, les autres se GAGNENT (un succès chacune). Le choix vaut pour tous les boosters ; il est
 * gardé au serveur (`users.cosmetics.opening`, convex/profiles.ts `setOpening`, refusé si verrouillé). Mise en scène :
 * src/game/scenes/opening.ts (`openStyleOf`).
 * (27/11, V3) Brûlure (`burn`) et Éventail (`fan`) retirés, sans migration : un choix resté rangé chez un joueur est
 * inconnu ici, donc refusé par `setOpening` et joué comme la déchirure par le client. Leurs succès gardent leur
 * identifiant : `burn-250` débloque la Fenêtre, `world-150` une prochaine ouverture (docs/chantiers/ouvertures.md).
 */
export type OpeningId = 'tear' | 'retrousse' | 'fenetre' | 'glace' | 'etoile';
// i18n-data:début
export const OPENINGS: Array<Cosmetic & { id: OpeningId; blurb: string }> = [
  Object.defineProperty(derive(C({ id: 'tear', label: 'Déchirure' }), { id: 'tear' }), 'blurb', { get: () => tData('cos.blurb.tear', 'Glisse le doigt pour déchirer le haut du booster.'), enumerable: true }) as Cosmetic & { id: OpeningId; blurb: string },
  // (V3) Retroussé : geste vers le bas, le sachet se retourne (simulation cuite hors ligne, src/game/scenes/opening.ts)
  Object.defineProperty(derive(C({ id: 'retrousse', label: 'Retroussé', need: 'packs-750' }), { id: 'retrousse' }), 'blurb', { get: () => tData('cos.blurb.retrousse', 'Glisse vers le bas : le sachet se retourne et laisse les cartes debout.'), enumerable: true }) as Cosmetic & { id: OpeningId; blurb: string },
  // (V3, 27/11) Fenêtre : les cartes percent la face avant de l'intérieur (simulation cuite, scripts/bake-tear/fenetre.mts)
  Object.defineProperty(derive(C({ id: 'fenetre', label: 'Fenêtre', need: 'burn-250' }), { id: 'fenetre' }), 'blurb', { get: () => tData('cos.blurb.fenetre', 'Glisse sur le sachet : les cartes poussent et le percent de l’intérieur.'), enumerable: true }) as Cosmetic & { id: OpeningId; blurb: string },
  // (v2.1.13) Avent 2026 : la déchirure, avec un éclat de givre ou une pluie d'étoiles (src/game/scenes/opening.ts)
  Object.defineProperty(derive(C({ id: 'glace', label: 'Déchirure glacée', advent: 20 }), { id: 'glace' }), 'blurb', { get: () => tData('cos.blurb.glace', 'Le booster est pris dans la glace : trois coups et tout éclate.'), enumerable: true }) as Cosmetic & { id: OpeningId; blurb: string },
  Object.defineProperty(derive(C({ id: 'etoile', label: 'Étoile de Noël', advent: 23 }), { id: 'etoile' }), 'blurb', { get: () => tData('cos.blurb.etoile', 'Trace une étoile : le sachet se change en poussière d’or.'), enumerable: true }) as Cosmetic & { id: OpeningId; blurb: string },
];
// i18n-data:fin
export const DEFAULT_OPENING: OpeningId = 'tear';

/** Badges (petites médailles sous le pseudo, plusieurs à la fois, ordonnables). */
// i18n-data:début
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
// i18n-data:fin

/**
 * FOND DE VITRINE (retours 05/11 : « pouvoir changer la couleur et le fond de notre vitrine »). `css` = le fond, qui
 * peut utiliser `--vc` (la couleur de vitrine choisie : bordure, lueur, étagère). Quelques fonds à débloquer.
 */
// i18n-data:début
export const VITRINES: Cosmetic[] = [
  C({ id: 'velours', label: 'Velours', css: 'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--vc) 16%, transparent), transparent 62%), linear-gradient(180deg, rgba(30, 23, 20, 0.92), rgba(12, 10, 9, 0.96))' }),
  C({ id: 'nuit', label: 'Nuit étoilée', css: 'radial-gradient(1.5px 1.5px at 12% 22%, #fff9, transparent), radial-gradient(1px 1px at 68% 14%, #fff8, transparent), radial-gradient(1.5px 1.5px at 84% 62%, #fff7, transparent), radial-gradient(1px 1px at 34% 78%, #fff6, transparent), radial-gradient(ellipse at 50% 120%, color-mix(in srgb, var(--vc) 30%, transparent), transparent 60%), linear-gradient(180deg, #0b1020, #05070e)' }),
  C({ id: 'feutre', label: 'Feutrine', css: 'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--vc) 20%, #12382a), #071a12 75%)' }),
  C({ id: 'papier', label: 'Papier kraft', css: 'radial-gradient(ellipse at 30% 0%, #ffffff14, transparent 50%), linear-gradient(180deg, #3a2a1c, #21170f)' }),
  C({ id: 'neon', label: 'Néon', tags: ['neon'], css: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--vc) 18%, transparent) 0 1px, transparent 1px 44px), repeating-linear-gradient(0deg, color-mix(in srgb, var(--vc) 14%, transparent) 0 1px, transparent 1px 44px), linear-gradient(180deg, #0d0a14, #07060b)' }),
  C({ id: 'beton', label: 'Béton', css: 'radial-gradient(ellipse at 50% 0%, #ffffff12, transparent 60%), linear-gradient(180deg, #2a2a2c, #161617)' }),
  C({ id: 'or', label: 'Écrin doré', need: 'packs-500', css: 'radial-gradient(ellipse at 50% 0%, #ffd77a33, transparent 60%), linear-gradient(180deg, #3a2a0c, #1a1206)' }),
  C({ id: 'aurore', label: 'Aurore', need: 'streak-60', css: 'radial-gradient(ellipse at 20% 0%, #6bffb833, transparent 55%), radial-gradient(ellipse at 80% 10%, #c86bff33, transparent 55%), linear-gradient(180deg, #0c1418, #06090c)' }),
  C({ id: 'prisme', label: 'Prisme', need: 'myth-25', css: 'linear-gradient(120deg, #ff6b9a1f, #ffd36b26, #6bffb826, #6bc8ff26, #c86bff26), linear-gradient(180deg, #1a1420, #0d0a10)' }),
  C({ id: 'secret', label: 'Un de nous', need: 'secret-3', css: 'radial-gradient(ellipse at 50% 0%, #e8927c44, transparent 60%), linear-gradient(180deg, #2a0f0e, #120607)' }),
  // (14/11, refonte de la personnalisation) 6 décors de plus, tous à gagner dans les succès
  C({ id: 'galerie', label: 'Galerie', need: 'all-25', css: 'linear-gradient(180deg, #ebe8e1 0 82%, #c9c4b8 82% 83%, #d9d5cc 83%)' }),
  C({ id: 'arcade', label: 'Arcade', need: 'gaming-800', tags: ['retro'], css: 'repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--vc) 22%, transparent), transparent 60%), linear-gradient(180deg, #0f0620, #05030a)' }),
  C({ id: 'vestiaire', label: 'Vestiaire', need: 'sport-800', tags: ['sport'], css: 'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.5) 0 2px, transparent 2px 16.66%), linear-gradient(180deg, color-mix(in srgb, var(--vc) 34%, #20262d), color-mix(in srgb, var(--vc) 18%, #0e1114))' }),
  C({ id: 'biblio', label: 'Bibliothèque', need: 'full-5', css: 'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.16) 0 1px, transparent 1px 5px), linear-gradient(180deg, #3b2616 0 86%, #6a4526 86% 91%, #1a0f08 91%)' }),
  C({ id: 'atlas', label: 'Atlas', need: 'world-2000', tags: ['monde'], css: 'repeating-radial-gradient(circle at 16% 30%, transparent 0 11px, color-mix(in srgb, var(--vc) 22%, transparent) 11px 12px), repeating-radial-gradient(circle at 84% 82%, transparent 0 15px, color-mix(in srgb, var(--vc) 15%, transparent) 15px 16px), linear-gradient(180deg, #12161a, #0b0e11)' }),
  C({ id: 'coffre', label: 'Coffre-fort', need: 'leg-100', tags: ['ombre'], css: 'radial-gradient(circle at 12px 12px, #d5d8dc 0 3px, transparent 3.6px), radial-gradient(circle at calc(100% - 12px) 12px, #d5d8dc 0 3px, transparent 3.6px), radial-gradient(circle at 12px calc(100% - 12px), #d5d8dc 0 3px, transparent 3.6px), radial-gradient(circle at calc(100% - 12px) calc(100% - 12px), #d5d8dc 0 3px, transparent 3.6px), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 3px), linear-gradient(180deg, #5b5f66, #2c2f34)' }),
];
// i18n-data:fin

/**
 * (14/11, refonte de la personnalisation) FOND DU PROFIL — derrière tout le profil. Jamais une image importée : du
 * généré par le navigateur (dégradés, trames, motifs), teinté par la couleur du profil (`--bgc`, posée par le client).
 * Tous se gagnent dans les succès (14/11, soir). Rangé dans `users.cosmetics.background`.
 */
const bgA = (p: number) => `color-mix(in srgb, var(--bgc) ${p}%, transparent)`;
const bgM = (p: number, base = '#000000') => `color-mix(in srgb, var(--bgc) ${p}%, ${base})`;
// i18n-data:début
export const BACKGROUNDS: Cosmetic[] = [
  C({ id: 'none', label: 'Aucun', css: '' }),
  C({ id: 'trame', label: 'Trame', need: 'contract-3', tags: ['manga'], css: `radial-gradient(circle, ${bgA(40)} 1px, transparent 1.5px) 0 0/9px 9px, radial-gradient(circle, ${bgA(20)} 1.6px, transparent 2.2px) 4.5px 4.5px/9px 9px, linear-gradient(160deg, ${bgM(22)}, #050505 70%)` }),
  C({ id: 'hachures', label: 'Hachures', need: 'packs-25', css: `repeating-linear-gradient(135deg, ${bgA(22)} 0 1px, transparent 1px 7px), linear-gradient(180deg, ${bgM(14)}, #050505)` }),
  C({ id: 'grille', label: 'Grille', need: 'full-3', css: `linear-gradient(${bgA(25)} 1px, transparent 1px) 0 0/100% 96px, linear-gradient(90deg, ${bgA(25)} 1px, transparent 1px) 0 0/96px 100%, linear-gradient(${bgA(11)} 1px, transparent 1px) 0 0/100% 24px, linear-gradient(90deg, ${bgA(11)} 1px, transparent 1px) 0 0/24px 100%, #06080a` }),
  C({ id: 'fondu', label: 'Fondu', need: 'all-100', css: `linear-gradient(155deg, ${bgM(46)} 0%, ${bgM(14)} 45%, #030303 85%)` }),
  C({ id: 'grain', label: 'Grain', need: 'burn-10', css: `radial-gradient(rgba(255, 255, 255, 0.12) 0.6px, transparent 0.8px) 0 0/3px 3px, radial-gradient(rgba(255, 255, 255, 0.08) 0.6px, transparent 0.8px) 1px 2px/5px 5px, radial-gradient(rgba(0, 0, 0, 0.4) 0.7px, transparent 0.9px) 2px 1px/7px 7px, linear-gradient(180deg, ${bgM(20)}, ${bgM(8)})` }),
  C({ id: 'damier', label: 'Damier', need: 'pop-300', tags: ['retro'], css: `conic-gradient(${bgA(18)} 25%, transparent 0 50%, ${bgA(18)} 0 75%, transparent 0) 0 0/32px 32px, #070707` }),
  C({ id: 'braise', label: 'Braise', need: 'burn-50', tags: ['feu'], css: 'radial-gradient(ellipse at 50% 118%, rgba(255, 106, 26, 0.66), transparent 58%), radial-gradient(ellipse at 18% 110%, rgba(255, 178, 60, 0.34), transparent 45%), linear-gradient(180deg, #0a0403, #1a0704)' }),
  C({ id: 'nuages', label: 'Nuages', need: 'streak-3', tags: ['doux'], css: `radial-gradient(ellipse 120px 44px at 22% 30%, rgba(255, 255, 255, 0.24), transparent 70%), radial-gradient(ellipse 160px 52px at 70% 18%, rgba(255, 255, 255, 0.2), transparent 70%), radial-gradient(ellipse 140px 48px at 48% 62%, rgba(255, 255, 255, 0.17), transparent 70%), radial-gradient(ellipse 180px 60px at 88% 78%, rgba(255, 255, 255, 0.15), transparent 70%), linear-gradient(180deg, ${bgM(35, '#27406e')}, ${bgM(35, '#5a3a66')})` }),
  C({ id: 'orage', label: 'Orage', need: 'leg-25', tags: ['foudre', 'ombre'], css: 'repeating-linear-gradient(105deg, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px 14px), radial-gradient(ellipse at 30% 0%, rgba(91, 107, 130, 0.66), transparent 60%), radial-gradient(ellipse at 80% 10%, rgba(58, 68, 86, 0.66), transparent 55%), linear-gradient(180deg, #11151c, #06080b)' }),
  C({ id: 'topo', label: 'Topographie', need: 'world-300', tags: ['monde'], css: `repeating-radial-gradient(circle at 22% 28%, transparent 0 13px, ${bgA(24)} 13px 14px), repeating-radial-gradient(circle at 80% 85%, transparent 0 17px, ${bgA(17)} 17px 18px), linear-gradient(180deg, #0b0f10, #060808)` }),
  C({ id: 'synth', label: 'Synthwave', need: 'gaming-400', tags: ['neon', 'retro'], css: `linear-gradient(180deg, transparent 0 60%, var(--bgc) 60% 60.5%, transparent 60.5% 69%, ${bgA(60)} 69% 69.4%, transparent 69.4% 82%, ${bgA(47)} 82% 82.5%, transparent 82.5%), radial-gradient(circle at 50% 44%, #ffd36b 0 9%, #ff7ab8 15%, transparent 15.5%), linear-gradient(180deg, #1a0b2e 0 60%, transparent 60%), repeating-conic-gradient(from 0deg at 50% 60%, ${bgA(47)} 0 0.5deg, transparent 0.5deg 10deg), #0d0518` }),
  C({ id: 'terrain', label: 'Terrain', need: 'sport-400', tags: ['sport'], css: `linear-gradient(90deg, transparent 49.8%, rgba(255, 255, 255, 0.4) 49.8% 50.2%, transparent 50.2%), radial-gradient(circle at 50% 50%, transparent 0 17%, rgba(255, 255, 255, 0.4) 17% 17.6%, transparent 18%), repeating-linear-gradient(90deg, ${bgM(26, '#0b2a17')} 0 12.5%, ${bgM(16, '#0b2a17')} 12.5% 25%)` }),
  C({ id: 'nebuleuse', label: 'Nébuleuse', need: 'uniq-2000', tags: ['cosmos'], css: `radial-gradient(1.2px 1.2px at 14% 22%, #ffffff, transparent), radial-gradient(1px 1px at 66% 12%, rgba(255, 255, 255, 0.8), transparent), radial-gradient(1.4px 1.4px at 82% 58%, #ffffff, transparent), radial-gradient(1px 1px at 36% 76%, rgba(255, 255, 255, 0.7), transparent), radial-gradient(1px 1px at 52% 40%, rgba(255, 255, 255, 0.6), transparent), radial-gradient(ellipse at 25% 35%, ${bgA(33)}, transparent 55%), radial-gradient(ellipse at 78% 70%, rgba(91, 59, 209, 0.34), transparent 55%), radial-gradient(ellipse at 60% 20%, rgba(31, 182, 201, 0.27), transparent 50%), #05040b` }),
];
// i18n-data:fin
/** fond du profil (« Aucun » par défaut, et pour un ancien choix inconnu) */
export const backgroundOf = (id?: string) => find(BACKGROUNDS, id) ?? BACKGROUNDS[0];

/**
 * (14/11) STYLE DU TITRE — la façon d'écrire le titre porté (n'importe lequel des TITLES) : typo et traitement, dessinés
 * côté client (src/game/cosmetiques.css, `.ts-<id>`), teintés par la couleur du profil. « Usiné » d'office, les 9 autres à gagner. Rangé dans
 * `users.cosmetics.titleStyle` (absent = « Usiné », l'écriture d'avant).
 */
// i18n-data:début
export const TITLE_STYLES: Cosmetic[] = [
  C({ id: 'usine', label: 'Usiné' }),
  C({ id: 'capitales', label: 'Capitales', need: 'all-500' }),
  C({ id: 'machine', label: 'Machine à écrire', need: 'uniq-250' }),
  C({ id: 'pixel', label: 'Pixel', need: 'gaming-150', tags: ['retro'] }),
  C({ id: 'bulle', label: 'Bulle', need: 'trade-3', tags: ['doux'] }),
  C({ id: 'maillot', label: 'Maillot', need: 'sport-150', tags: ['sport'] }),
  C({ id: 'neon', label: 'Néon', need: 'contract-5', tags: ['neon'] }),
  C({ id: 'manga', label: 'Manga', need: 'pop-800', tags: ['manga'] }),
  C({ id: 'glitch', label: 'Glitch', need: 'gaming-3000', tags: ['retro'] }),
  C({ id: 'grave', label: 'Gravé', need: 'packs-1500' }),
];
// i18n-data:fin
export const titleStyleOf = (id?: string) => find(TITLE_STYLES, id) ?? TITLE_STYLES[0];

/**
 * (v2.1.13) ANIMATION DE PROFIL — un effet léger par-dessus la bannière du profil (src/game/cosmetiques.css,
 * `.pfx-<id>`, coupé en « mouvements réduits »). « Aucune » d'office ; les autres viennent du calendrier de l'Avent.
 * Rangé dans `users.cosmetics.pfx` (absent = aucune).
 */
// i18n-data:début
export const PROFILE_FX: Cosmetic[] = [
  C({ id: 'none', label: 'Aucune' }),
  C({ id: 'neige', label: 'Chute de neige', advent: 10 }),
  C({ id: 'aurore', label: 'Aurore boréale', advent: 22 }),
];
// i18n-data:fin
export const profileFxOf = (id?: string) => find(PROFILE_FX, id) ?? PROFILE_FX[0];

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
export type CosmeticKind = 'Bannière' | 'Cadre' | 'Titre' | 'Badge' | 'Couleur' | 'Vitrine' | 'Ouverture' | 'Fond' | 'Style'; // i18n-ok (genres : identifiants)
export function cosmeticsOf(achievementId: string): Array<{ kind: CosmeticKind; c: Cosmetic }> {
  const out: Array<{ kind: CosmeticKind; c: Cosmetic }> = [];
  for (const [kind, list] of [['Bannière', BANNERS], ['Cadre', FRAMES], ['Titre', TITLES], ['Badge', BADGES], ['Couleur', ACCENTS], ['Vitrine', VITRINES], ['Ouverture', OPENINGS], ['Fond', BACKGROUNDS], ['Style', TITLE_STYLES]] as const) for (const c of list) if (c.need === achievementId) out.push({ kind, c }); // i18n-ok (genres : identifiants)
  return out;
}

/** Statistiques d'un joueur à partir de sa collection et de ses compteurs (même calcul serveur / client / démo). */
export function statsFrom(
  collection: Array<{ cardId: string; rarity: string; count: number }>,
  extra: { packsOpened: number; tradesDone: number; contractsSigned: number; streak: number; burned?: number; wasTop?: number; seasonPodiums?: number; seasonWins?: number; season0Top?: number; season0Player?: number; advent?: number[] },
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
  /** (14/11) fond du profil (BACKGROUNDS) et style d'écriture du titre (TITLE_STYLES) */
  background?: string;
  titleStyle?: string;
  /** (v2.1.13) animation de profil (PROFILE_FX) */
  pfx?: string;
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
  // (14/11) fond et style de titre : le choix par défaut (« Aucun », « Usiné ») n'est pas rangé
  const background = ok(BACKGROUNDS, choice.background);
  const titleStyle = ok(TITLE_STYLES, choice.titleStyle);
  const pfx = ok(PROFILE_FX, choice.pfx);
  const pick = (list: Cosmetic[], legacy: Cosmetic[], v?: string) => {
    const a = (v ?? '').toLowerCase();
    return CUSTOM_ACCENT.test(a) ? a : ok(list, v) ?? ok(legacy, v);
  };
  return { banner: pick(BANNERS, LEGACY_BANNERS, choice.banner), frame: pick(FRAMES, LEGACY_FRAMES, choice.frame), title: ok(TITLES, choice.title), badges, ...(accent ? { accent } : {}), ...(vitrine ? { vitrine } : {}), ...(vitrineColor ? { vitrineColor } : {}), ...(background && background !== BACKGROUNDS[0].id ? { background } : {}), ...(titleStyle && titleStyle !== TITLE_STYLES[0].id ? { titleStyle } : {}), ...(pfx && pfx !== PROFILE_FX[0].id ? { pfx } : {}) };
}

/**
 * (v2.1.40) cosmétique d'un succès retiré (contrats) que le joueur n'a pas : plus jamais proposé (Atelier). Celui
 * qui l'a le garde.
 */
export function cosmeticGone(c: Cosmetic, stats: PlayerStats, now: number): boolean {
  const a = c.need ? ach(c.need) : undefined;
  return !!a && achievementRetired(a, now) && !c.unlock(stats);
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

/**
 * (14/11) ACCORD — le cadre et le fond partagent une matière : le profil gagne un petit plus (src/game/cosmeticArt.ts).
 * `full` : le style du titre ou la vitrine est de la même matière (l'entrée de la vitrine s'anime aussi). Calculé à
 * l'affichage sur ce qui est porté : rien à ranger, rien à demander au serveur.
 */
export function accordOf(c: CosmeticChoice): { matter: Matter; full: boolean } | null {
  const bg = backgroundOf(c.background).tags ?? [];
  const matter = (frameOf(c.frame).tags ?? []).find((m) => bg.includes(m));
  if (!matter) return null;
  const has = (x?: Cosmetic) => !!x?.tags?.includes(matter);
  return { matter, full: has(titleStyleOf(c.titleStyle)) || has(c.vitrine ? vitrineOf(c.vitrine) : undefined) };
}
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
  if (!PROFILE_MEDIA_TYPES.includes(type ?? '')) return fe('cosmetics.1');
  if (size > max) return fe('cosmetics.2', { p0: fmtMo(size), p1: max >= 1024 * 1024 ? fmtMo(max) : `${Math.round(max / 1024)} Ko` });
  return '';
}

/** (v2.1.13) cosmétique de Noël donné par une case de l'Avent (src/core/avent.ts, `AdventReward.cos`) */
export function adventCosmetic(kind: 'frame' | 'banner' | 'pfx' | 'opening', id: string): Cosmetic | undefined {
  return find(kind === 'frame' ? FRAMES : kind === 'banner' ? BANNERS : kind === 'pfx' ? PROFILE_FX : OPENINGS, id);
}
