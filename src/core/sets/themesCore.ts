import { PURGE_08_11, RERATE_08_11 } from './curation';
import { artV } from '../artRev';
/**
 * Registre des THÈMES — données pures, sans three.js : partagé par le client (boutique, collection, échanges) et par
 * convex/ (catalogue du serveur). Une seule source de vérité pour « quelles cartes existent, dans quel booster ».
 * (Importer `./themes` : ce fichier-ci est le noyau sans les 4 gros sets — voir installCatalog() plus bas.)
 *
 * Organisation (décision du groupe, 1er nov.) :
 *  - 4 THÈMES = 4 boosters : Gaming Pack · Pop Culture Pack · Sport Pack · World Pack (noms officiels, 2 nov.) ;
 *  - chaque thème regroupe des SOUS-THÈMES (Pokémon, MCU, foot…). Une carte a donc 2 tags : son thème + son sous-thème ;
 *  - les étoiles 1★→6★ sont réparties PAR SOUS-THÈME (le côté données trie chaque sous-thème séparément) ;
 *  - 5e pack spécial, le Bebou Pack = le pack de base : TOUTES les cartes des 4 thèmes, et le SEUL endroit où tombent les
 *    8 cartes secrètes Bébous. Chance PAR PACK = 1 / nombre total de cartes du jeu (règle du 2 nov. : 10 000 cartes →
 *    1 sur 10 000), recalculée toute seule à chaque ajout de cartes (`BEBOU_SECRET_CHANCE`, tirage à part dans packRules.ts) ;
 *  - une seule édition par sous-thème : pour ajouter des cartes on les ajoute au sous-thème existant (ids stables !).
 *
 * Ajouter un sous-thème (ex. Champions LoL dans GAMING) :
 *  1. `src/core/sets/<sous-thème>.ts` au même format que pokemon151.ts (zéro import, `[num, slug, nom, rareté]`) ;
 *  2. ses illustrations dans `public/art/<sous-thème>/`, puis `npm run thumbs` (miniatures WebP) ;
 *  3. remplir `cards` (et `artDir`, `code`) de son entrée dans `SUBTHEMES` ci-dessous. Le booster du thème, le bébou
 *     pack, la collection, les échanges et le serveur suivent seuls.
 */
import { POKEMON_151, POKEMON_151_INFO, POKEMON_GENS, pokemonCardId, pokemonFile, pokemonGen } from './pokemon151';
import { BEBOUS, BEBOUS_INFO, KCDQ, KCDQ_INFO, bebouCardId, bebouFile, kcdqCardId } from './bebous';
import { VALORANT, VALORANT_CLASSES, VALORANT_INFO, valorantCardId, valorantClass, valorantFile } from './valorant';
import { LOL, LOL_INFO, lolCardId, lolFile } from './lol';
import { LOL_LINES, lolLine } from './lolLines';
import { CS, CS_CLASSES, CS_INFO, csCardId, csClass, csFile } from './cs';
// (types seulement : les données des 4 gros sets arrivent par installCatalog(), voir plus bas)
import type * as BigSets from './catalogBig';

export type CatalogRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'secret';
export type ThemeId = 'gaming' | 'pop' | 'sport' | 'monde' | 'bebous';

export interface CatalogEntry {
  /** identifiant stable (inventaire, mints, échanges) — ne JAMAIS le changer une fois des cartes tombées */
  id: string;
  /** thème (1 des 4, ou 'bebous') */
  themeId: ThemeId;
  /** sous-thème (pokemon, lol, mcu, foot…) */
  subthemeId: string;
  /** numéro dans le sous-thème (1..taille) */
  num: number;
  /** nom affiché (FR quand il existe) */
  name: string;
  rarity: CatalogRarity;
  /** fichier d'illustration, relatif à `SubTheme.artDir` ('' = pas d'illustration : design typographique) */
  file: string;
  /** Jeux vidéo : jaquette, personnage ou objet (cadrage de l'illustration, design de secours) */
  kind?: 'cover' | 'character' | 'object';
  /** Jeux vidéo : année de sortie (0 / absent = inconnue) */
  year?: number;
  /** Jeux vidéo / Monde V2 : 'c' image pleine (cadrée bord à bord) · 'i' artwork détouré · '' aucune */
  art?: '' | 'c' | 'i';
  /** dossier de l'illustration s'il diffère de celui du sous-thème (cartes de la V1 du World Pack) */
  dir?: string;
  /** Monde V2 : type affiché sur le design typographique (« Mammifère », « Capitale / Métropole »…) */
  label?: string;
  /**
   * Album / Chanson (Pop Culture) : l'artiste principal, imprimé sous le titre. GÉNÉRÉ : scripts/build-music-artists.py
   * → popArtists.ts (iTunes en priorité, recoupé avec Wikidata et MusicBrainz ; corrections à la main prioritaires).
   */
  artist?: string;
}

export interface SubTheme {
  id: string;
  label: string;
  themeId: ThemeId;
  /** code court (ligne de collection « PKM · 025/1025 ») */
  code: string;
  /** dossier des illustrations (relatif à la racine du site, sans / initial) */
  artDir: string;
  /** cartes — vide tant que les données du sous-thème ne sont pas arrivées (« bientôt ») */
  cards: CatalogEntry[];
  /**
   * Regroupement d'affichage : les 177 familles « Jeux vidéo » sont chacune un vrai sous-thème (contrats, filtres,
   * code de carte), mais la boutique, la mention du booster, les onglets de collection et les missions les montrent
   * comme UN ensemble (« Jeux vidéo · 177 familles »).
   */
  group?: { id: string; label: string; unit?: string };
  /**
   * Dénominateur du numéro affiché (« 152/1025 ») quand les numéros sont ceux du groupe entier (Pokémon : n° de Pokédex ;
   * Valorant, CS) et non propres au sous-thème. Absent : nombre de cartes du sous-thème.
   */
  size?: number;
}

export interface BoosterStyle {
  ground: string;
  ground2: string;
  ink: string;
  foil: string;
  accent: string;
}

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  /** nom imprimé sur le booster */
  booster: string;
  style: BoosterStyle;
  subthemes: SubTheme[];
  /** toutes les cartes du thème (sous-thèmes à la suite) */
  cards: CatalogEntry[];
  /** thème secret (Bébous) : hors boutique, uniquement dans le bébou pack */
  secret?: true;
}

const sub = (themeId: ThemeId, id: string, label: string, code = '', artDir = '', cards: CatalogEntry[] = []): SubTheme => ({ id, label, themeId, code, artDir, cards });

/**
 * Range les entrées par clé en UNE passe (ordre d'origine conservé dans chaque paquet). Avant (audit PERF2-14) : un
 * `filter` de tout le catalogue par sous-thème, ≈ 1 million d'itérations au démarrage (177 familles × 3 396 jeux…).
 */
function groupBy<T>(entries: readonly T[], key: (e: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const e of entries) {
    const k = key(e);
    const list = out.get(k);
    if (list) list.push(e);
    else out.set(k, [e]);
  }
  return out;
}

// ───────────────────────────────────────────── sous-thèmes (ceux sans cartes s'affichent « bientôt »)
/**
 * Découpe un gros sous-thème en sous-thèmes d'affichage (correctif du 3 nov., même traitement que le World Pack) :
 * Pokémon par génération, Valorant et CS par classe d'arme, LoL par lane / ligne de skins. Chacun est un vrai sous-thème (contrats, filtres, libellé
 * imprimé en grand sur la carte) ; le groupe reprend l'ancien id (« pokemon », « cs »…) : liens et missions d'avant
 * continuent de marcher. Ids de carte, étoiles, numéros et illustrations : inchangés.
 */
function split<T>(
  group: { id: string; label: string; unit: string },
  info: { code: string; artDir: string },
  parts: ReadonlyArray<{ id: string; label: string }>,
  entries: T[],
  partOf: (e: T) => { id: string },
  entry: (e: T, subthemeId: string) => Omit<CatalogEntry, 'themeId' | 'subthemeId'>,
): SubTheme[] {
  const byPart = groupBy(entries, (e) => partOf(e).id);
  return parts
    .map((p) => ({
      ...sub('gaming', p.id, p.label, info.code, info.artDir, (byPart.get(p.id) ?? []).map((e) => ({ ...entry(e, p.id), themeId: 'gaming' as const, subthemeId: p.id }))),
      group,
      size: entries.length,
    }))
    .filter((s) => s.cards.length);
}

const pokemon = split(
  { id: 'pokemon', label: 'Pokémon', unit: 'régions' }, POKEMON_151_INFO, POKEMON_GENS, POKEMON_151, pokemonGen,
  (e) => ({ id: pokemonCardId(e), num: e.dex, name: e.name, rarity: e.rarity, file: pokemonFile(e) }),
);

const valorant = split(
  { id: 'valorant', label: 'Valorant', unit: 'catégories' }, VALORANT_INFO, VALORANT_CLASSES, VALORANT, valorantClass,
  (e) => ({ id: valorantCardId(e), num: e.num, name: e.name, rarity: e.rarity, file: valorantFile(e) }),
);

// LoL : la lane pour les 173 champions, la ligne de skins (Star Guardian, K/DA…) pour les skins (lolLines.ts, généré)
const lol = split(
  { id: 'lol', label: LOL_INFO.label, unit: 'lanes & lignes' }, LOL_INFO, LOL_LINES, LOL, lolLine,
  (e) => ({ id: lolCardId(e), num: e.num, name: e.name, rarity: e.rarity, file: lolFile(e) }),
);

const cs = split(
  { id: 'cs', label: CS_INFO.label, unit: 'catégories' }, CS_INFO, CS_CLASSES, CS, csClass,
  (e) => ({ id: csCardId(e), num: e.num, name: e.name, rarity: e.rarity, file: csFile(e) }),
);

/**
 * Les 4 GROS sets (Jeux vidéo, Pop Culture, Sport, World : ~90 % des 37 088 cartes, ~700 Ko compressés) : leurs
 * sous-thèmes sont construits ici, à l'installation (installCatalog). Même code et même ordre qu'avant, seulement déplacé.
 *
 * (perf, fluidité 2 — coût du catalogue au démarrage) UN seul passage sur les ~37 000 lignes brutes : chaque carte est
 * créée une fois, directement dans la liste de son sous-thème, et la curation (cartes purgées, raretés renotées) est
 * appliquée au passage. Avant : un `groupBy` (table intermédiaire), un `map` + spread par carte, puis un `filter` de
 * tout le catalogue dans applyCuration. Mêmes objets (mêmes clés, même ordre de clés), mêmes listes, même ordre.
 */
type Curation = { purge: ReadonlySet<string>; rerate: ReadonlyMap<string, CatalogRarity> };

/** Une liste vide par sous-thème (clé = id) : les cartes y sont rangées en un passage. Ids de sous-thèmes uniques. */
function emptyLists(subs: ReadonlyArray<{ id: string }>): Map<string, CatalogEntry[]> {
  const out = new Map<string, CatalogEntry[]>();
  for (const s of subs) out.set(s.id, []);
  return out;
}

function bigSubthemes(B: typeof BigSets, cur: Curation): SubTheme[] {
  const { purge, rerate } = cur;
  // (une `Map` plutôt qu'un objet : chercher une clé dans un objet exige d'« internaliser » la chaîne, ~12 ms perdues sur
  // 37 000 ids ; la `Map` réutilise le hachage déjà calculé par `purge.has`. Mesuré dans Node : installCatalog 50 → 28 ms)
  const artists = new Map(Object.entries(B.POP_ARTISTS));

  /** Jeux vidéo : 1 famille (Mario, Tekken, Palworld…) = 1 sous-thème (décision du 2 nov.), regroupées à l'affichage. */
  const JV_GROUP = { id: 'jeux-video', label: B.JV_INFO.label, unit: 'familles' };
  const jvLists = emptyLists(B.JV_FAMILIES);
  let key: string | undefined;
  let list: CatalogEntry[] | undefined;
  for (const e of B.JV) {
    const id = e.id;
    if (purge.has(id)) continue;
    // (les cartes d'un même sous-thème se suivent : on ne cherche dans la table que quand la clé change)
    if (e.family !== key) list = jvLists.get((key = e.family));
    if (list) list.push({ id, themeId: 'gaming', subthemeId: e.family, num: e.num, name: e.name, rarity: rerate.get(id) || e.rarity, file: e.file, kind: e.kind, year: e.year, art: e.art });
  }
  const jeuxVideo: SubTheme[] = B.JV_FAMILIES.map((f) => ({
    id: f.id, label: f.label, themeId: 'gaming', code: f.code, artDir: B.JV_INFO.artDir, cards: jvLists.get(f.id)!, group: JV_GROUP,
  }));

  // ── WORLD PACK V2 (5 236 cartes) : 34 sous-thèmes ; les 924 cartes de la V1 gardent leur id et leur illustration.
  // Affichage : 14 Merveilles · Ardèche · et 4 groupes (Lieux & pays, Animaux, Nourriture, Voitures) qui reprennent les ids
  // des anciens sous-thèmes (« lieux »…) : liens et missions d'avant continuent de marcher.
  const mondeLists = emptyLists(B.MONDE_SUBS);
  key = undefined;
  list = undefined;
  for (const e of B.MONDE) {
    const id = e.id;
    if (purge.has(id)) continue;
    if (e.sub !== key) list = mondeLists.get((key = e.sub));
    if (list) list.push({ id, themeId: 'monde', subthemeId: e.sub, num: e.num, name: e.name, rarity: rerate.get(id) || e.rarity, file: e.file, dir: e.dir, art: e.art, label: e.label });
  }
  const monde: SubTheme[] = B.MONDE_SUBS.map((s) =>
    s.group
      ? { id: s.id, label: s.label, themeId: 'monde', code: s.code, artDir: 'art/monde', cards: mondeLists.get(s.id)!, group: { id: s.group, label: B.MONDE_GROUPS[s.group] } }
      : { id: s.id, label: s.label, themeId: 'monde', code: s.code, artDir: 'art/monde', cards: mondeLists.get(s.id)! },
  );

  // ── SPORT PACK (7 708 cartes, SPEC-THEME-SPORT v5.1) : 114 sous-thèmes (« Football — Premier League », « Esport — LoL »…,
  // imprimés en grand sur la carte), regroupés à l'affichage en 10 (Football, Esport, Sports collectifs…). Le groupe « esport »
  // reprend l'id de l'ancien sous-thème vide. Numéro = n° de l'Excel, sur 7 708 (« 0123/7708 »). GÉNÉRÉ : scripts/make-sport.py.
  const sportLists = emptyLists(B.SPORT_SUBS);
  key = undefined;
  list = undefined;
  for (const e of B.SPORT) {
    const id = e.id;
    if (purge.has(id)) continue;
    if (e.sub !== key) list = sportLists.get((key = e.sub));
    if (list) list.push({ id, themeId: 'sport', subthemeId: e.sub, num: e.num, name: e.name, rarity: rerate.get(id) || e.rarity, file: e.file, art: e.art, label: e.label });
  }
  const sport: SubTheme[] = B.SPORT_SUBS.map((s) => ({
    id: s.id, label: s.label, themeId: 'sport', code: s.code, artDir: 'art/sport', cards: sportLists.get(s.id)!, group: { id: s.group, label: B.SPORT_GROUPS[s.group] }, size: B.SPORT_SIZE,
  }));

  // ── POP CULTURE PACK (n° 1 → 17 477 avec le patch Berserk, SPEC-THEME-POP-CULTURE v5) : 856 sous-thèmes (franchises, œuvres ou pools :
  // « Naruto », « Star Wars », « Caméra Café », « Musique FR »…, imprimés en grand sur la carte), regroupés à l'affichage en
  // 7 blocs (Mangas & anime, Films, Séries TV, Dessins animés, Musique, Acteurs & actrices, YouTube). Les groupes reprennent
  // les ids des anciens sous-thèmes vides (films, series, anime, musique, youtubeurs ; « Marvel MCU » garde « marvel »).
  // Yu-Gi-Oh est une licence d'anime du bloc Mangas & anime (l'ancien sous-thème vide du Gaming est retiré).
  // Numéro = n° de l'Excel, sur 17 471. GÉNÉRÉ : scripts/make-pop.py.
  const popLists = emptyLists(B.POP_SUBS);
  key = undefined;
  list = undefined;
  for (const e of B.POP) {
    const id = e.id;
    if (purge.has(id)) continue;
    if (e.sub !== key) list = popLists.get((key = e.sub));
    if (!list) continue;
    const artist = artists.get(id);
    // (deux littéraux plutôt qu'un spread : même clés dans le même ordre, `artist` en dernier et seulement s'il existe)
    list.push(
      artist
        ? { id, themeId: 'pop', subthemeId: e.sub, num: e.num, name: e.name, rarity: rerate.get(id) || e.rarity, file: e.file, art: e.art, label: e.label, artist }
        : { id, themeId: 'pop', subthemeId: e.sub, num: e.num, name: e.name, rarity: rerate.get(id) || e.rarity, file: e.file, art: e.art, label: e.label },
    );
  }
  const popCulture: SubTheme[] = B.POP_SUBS.map((s) => ({
    id: s.id, label: s.label, themeId: 'pop', code: s.code, artDir: 'art/pop', cards: popLists.get(s.id)!, group: { id: s.group, label: B.POP_GROUPS[s.group] }, size: B.POP_SIZE,
  }));
  return [...jeuxVideo, ...popCulture, ...sport, ...monde];
}

/**
 * Tous les sous-thèmes, dans l'ordre d'affichage : GAMING (Pokémon, Valorant, LoL, CS, puis les familles Jeux vidéo),
 * POP CULTURE, SPORT (sport + esport, un seul booster), WORLD (id « monde » conservé : identifiant stable).
 * Avant installCatalog() : seulement Pokémon, Valorant, LoL et CS ; l'installation ajoute les autres à la suite
 * (même tableau, même ordre qu'avant).
 */
export const SUBTHEMES: SubTheme[] = [...pokemon, ...valorant, ...lol, ...cs];

const bebousSub = sub(
  'bebous', 'bebous', 'Les Bébous', 'BÉB', BEBOUS_INFO.artDir,
  BEBOUS.map((e) => ({ id: bebouCardId(e), themeId: 'bebous', subthemeId: 'bebous', num: e.num, name: e.nickname, rarity: 'secret', file: bebouFile(e) })),
);

// KCDQ : cartes spéciales « à la Bébou » (secrètes, bébou pack uniquement), leur propre album
const kcdqSub = sub(
  'bebous', KCDQ_INFO.id, 'KCDQ', KCDQ_INFO.code, KCDQ_INFO.artDir,
  KCDQ.map((e) => ({ id: kcdqCardId(e), themeId: 'bebous', subthemeId: KCDQ_INFO.id, num: e.num, name: e.name, rarity: 'secret', file: e.file })),
);

function theme(id: ThemeId, label: string, booster: string, style: BoosterStyle, subs: SubTheme[], secret?: true): ThemeInfo {
  return { id, label, booster, style, subthemes: subs, cards: subs.flatMap((s) => s.cards), ...(secret ? { secret } : {}) };
}
// (purge du 04/11 : un sous-thème dont toutes les cartes ont été supprimées disparaît des boosters, albums et filtres)
const subsOf = (id: ThemeId) => SUBTHEMES.filter((s) => s.themeId === id && s.cards.length > 0);

/** Les 4 thèmes = les 4 boosters thématiques de la boutique, dans l'ordre d'affichage. */
export const THEMES: ThemeInfo[] = [
  theme('gaming', 'Gaming', 'GAMING PACK', { ground: '#120f17', ground2: '#3b1630', ink: '#f6ecff', foil: '#c9a3ff', accent: '#e8432f' }, subsOf('gaming')),
  theme('pop', 'Pop Culture', 'POP CULTURE PACK', { ground: '#16100c', ground2: '#5a2a12', ink: '#fff1df', foil: '#f2c46d', accent: '#ff7a3d' }, subsOf('pop')),
  theme('sport', 'Sport', 'SPORT PACK', { ground: '#0c1412', ground2: '#123f2f', ink: '#e9fff4', foil: '#9fe0b8', accent: '#3fbf7f' }, subsOf('sport')),
  theme('monde', 'World', 'WORLD PACK', { ground: '#0c1118', ground2: '#16314a', ink: '#eaf4ff', foil: '#a9c7e8', accent: '#4c9be0' }, subsOf('monde')),
];

/** Le thème secret (les 8 Bébous + les cartes KCDQ) : hors boutique, uniquement dans le bébou pack. */
export const BEBOU_THEME: ThemeInfo = theme('bebous', 'Les Bébous', 'LES BÉBOUS', { ground: '#120607', ground2: '#3d1714', ink: '#ffe4d8', foil: '#e8927c', accent: '#f2c46d' }, [bebousSub, kcdqSub], true);

/** Tous les thèmes, Bébous compris (collection, recherche par id). */
export const ALL_THEMES: ThemeInfo[] = [...THEMES, BEBOU_THEME];

/**
 * Nombre total de cartes du jeu (les 4 thèmes + les 8 Bébous). Grandit tout seul quand un sous-thème reçoit ses cartes.
 */
export let GAME_CARD_COUNT = ALL_THEMES.reduce((a, t) => a + t.cards.length, 0);

/**
 * Chance qu'un Bebou Pack contienne une carte Bébou : 1 / nombre total de cartes du jeu (règle du groupe, 2 nov.).
 * Exemple : 2 028 cartes → 1 sur 2 028 ; 10 000 cartes → 1 sur 10 000. Recalculée à chaque build, rien à régler.
 */
/**
 * (retours 05/11) cartes Bébous / KCDQ VERROUILLÉES pour l'instant : elles ne tombent plus d'aucun booster (chance 0),
 * l'album reste visible. Remettre à `false` pour les rouvrir — rien d'autre à changer (serveur et démo suivent).
 */
export const BEBOU_SECRETS_LOCKED = true;
const bebouSecretChance = () => (BEBOU_SECRETS_LOCKED ? 0 : GAME_CARD_COUNT > 0 ? 1 / GAME_CARD_COUNT : 0);
export let BEBOU_SECRET_CHANCE = bebouSecretChance();

/**
 * Chance qu'un World Pack contienne une Merveille du Monde secrète (les 14 merveilles du monde en 3D diorama).
 * 1 sur le nombre de cartes du thème Monde.
 */
const worldSecretChance = () => 1 / Math.max(1, THEMES.find((t) => t.id === 'monde')?.cards.length ?? 924);
export let WORLD_SECRET_CHANCE = worldSecretChance();

/**
 * Mention de booster en segments « A · B · C » : les espaces DANS un segment sont insécables, la ligne ne se coupe
 * qu'entre deux segments (« LES 4 THÈMES · / 1 CHANCE SUR 2 028 », jamais « … · 1 / CHANCE SUR … »).
 */
export const taglineOf = (parts: string[]) => parts.map((p) => p.replace(/ /g, '\u00a0')).join(' · ');

/** 2028 → « 2 028 » (sans Intl : le même code tourne côté serveur Convex). */
export const fmtCount = (n: number, sep = '\u00a0') => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);

/** « 1 sur 2 028 ». */
export const bebouOddsLabel = () => `1 sur ${fmtCount(GAME_CARD_COUNT)}`;

const bebouTagline = () => taglineOf(['LES 4 THÈMES', BEBOU_SECRETS_LOCKED ? 'BÉBOUS BIENTÔT' : `1 CHANCE SUR ${fmtCount(GAME_CARD_COUNT, ' ')}`]);

/** Le Bebou Pack : le pack de base, toutes les cartes des 4 thèmes + la chance de Bébou. */
export const BEBOU_PACK = {
  id: 'bebou',
  label: 'Bebou Pack',
  booster: 'BEBOU PACK',
  tagline: bebouTagline(),
  style: { ground: '#140d0c', ground2: '#2e1a24', ink: '#ffeede', foil: '#e8927c', accent: '#f2c46d' } as BoosterStyle,
} as const;

const BY_ID = new Map<string, CatalogEntry>();
const THEME_BY_ID = new Map<string, ThemeInfo>(ALL_THEMES.map((t) => [t.id, t]));
const SUB_BY_ID = new Map<string, SubTheme>();
function indexCatalog() {
  BY_ID.clear();
  for (const t of ALL_THEMES) for (const c of t.cards) BY_ID.set(c.id, c);
  SUB_BY_ID.clear();
  // (07/11) KCDQ indexé aussi : sans lui, posséder « Enzo » faisait planter artPath/thumbPath → collection et profil vides
  for (const s of [...SUBTHEMES, bebousSub, kcdqSub]) SUB_BY_ID.set(s.id, s);
}
indexCatalog();
/** Anciens identifiants de booster (avant les 4 thèmes) encore présents dans des packs déjà tirés. */
const LEGACY_THEME: Record<string, ThemeId> = { pokemon: 'gaming' };

export function catalogEntry(id: string): CatalogEntry | undefined {
  return BY_ID.get(id);
}

export function themeById(id: string): ThemeInfo | undefined {
  return THEME_BY_ID.get(id) ?? THEME_BY_ID.get(LEGACY_THEME[id] ?? '');
}

export function subthemeById(id: string): SubTheme | undefined {
  return SUB_BY_ID.get(id);
}

/** Un thème a-t-il des cartes ? (sinon son booster est affiché « bientôt » et ne peut pas être ouvert) */
export const themeOpen = (t: ThemeInfo) => t.cards.length > 0;

/** Nombre total de cartes des 4 thèmes (hors Bébous). */
export let PUBLIC_CARD_COUNT = THEMES.reduce((a, t) => a + t.cards.length, 0);

let installed = false;

/** Le catalogue complet est-il installé ? (toujours vrai côté serveur, tests et scripts : `themes.ts` l'installe d'office) */
export const catalogInstalled = () => installed;

/**
 * CHARGEMENT DU CATALOGUE EN DEUX TEMPS (perf, lot chargement 1) — ce module (« noyau ») ne contient que Pokémon,
 * Valorant, LoL, CS et les Bébous ; les 4 gros sets (`catalogBig.ts` : Jeux vidéo, Pop Culture, Sport, World, ~700 Ko
 * compressés) sont ajoutés par cette fonction :
 *  - serveur Convex, tests, scripts : `themes.ts` (= ce noyau + installation immédiate) — rien ne change pour eux ;
 *  - jeu : le build client lit ce noyau (alias, vite.config.ts) et main.ts télécharge `catalogBig` par `import()`
 *    PENDANT le démarrage de la 3D, puis l'installe AVANT de créer le backend et la boutique — tout ce qui lit le
 *    catalogue vient après : l'API reste synchrone (`catalogEntry()`…) et voit les mêmes valeurs qu'avant ;
 *  - labo : installé d'office au démarrage (src/main.ts).
 * Mêmes objets, même ordre que l'ancien calcul en un temps : les tableaux exportés (SUBTHEMES, THEMES[i].subthemes,
 * THEMES[i].cards) sont complétés SUR PLACE, les compteurs (`let`) recalculés. Sans effet si déjà installé.
 */
/**
 * (08/11) Curation (src/core/sets/curation.ts) : cartes purgées retirées des sous-thèmes (les numéros des autres cartes
 * ne bougent pas), raretés renotées. Une seule fois, avant l'indexation. Ici : les sous-thèmes du NOYAU (Pokémon, Valorant,
 * LoL, CS) ; les 4 gros sets sont curés au passage par bigSubthemes() (un seul passage sur leurs lignes).
 */
function applyCuration(purge: ReadonlySet<string>, rerate: ReadonlyMap<string, CatalogRarity>) {
  for (const s of SUBTHEMES) {
    const before = s.cards.length;
    const kept = s.cards.filter((c) => !purge.has(c.id));
    for (const c of kept) {
      const r = rerate.get(c.id);
      if (r) c.rarity = r;
    }
    if (kept.length !== before) {
      s.cards.length = 0;
      s.cards.push(...kept);
    }
  }
}

/** Options d'installCatalog. */
export interface InstallOptions {
  /**
   * Garder les tableaux bruts des 4 gros sets (`JV`, `MONDE`, `SPORT`, `POP` de catalogBig, ~37 000 objets « lignes » que
   * seule l'installation lit) : vrai pour le serveur Convex, les tests et les scripts (`themes.ts`), qui peuvent les importer
   * eux-mêmes. Faux par défaut (jeu, labo) : ils sont vidés une fois le catalogue construit — les objets intermédiaires
   * (~3 Mo de tas) deviennent récupérables au lieu de rester accrochés à l'espace de noms du module pour toute la session.
   */
  keepRaw?: boolean;
}

export function installCatalog(big: typeof BigSets, opts: InstallOptions = {}): void {
  if (installed) return;
  installed = true;
  const purge = new Set(PURGE_08_11);
  const rerate = new Map(Object.entries(RERATE_08_11));
  applyCuration(purge, rerate);
  for (const s of bigSubthemes(big, { purge, rerate })) SUBTHEMES.push(s);
  for (const t of THEMES) {
    const subs = subsOf(t.id);
    t.subthemes.length = 0;
    t.cards.length = 0;
    for (const s of subs) {
      t.subthemes.push(s);
      for (const c of s.cards) t.cards.push(c);
    }
  }
  indexCatalog();
  GAME_CARD_COUNT = ALL_THEMES.reduce((a, t) => a + t.cards.length, 0);
  PUBLIC_CARD_COUNT = THEMES.reduce((a, t) => a + t.cards.length, 0);
  BEBOU_SECRET_CHANCE = bebouSecretChance();
  WORLD_SECRET_CHANCE = worldSecretChance();
  (BEBOU_PACK as { tagline: string }).tagline = bebouTagline();
  VIEWS = new WeakMap(); // (vues de sous-thèmes calculées avant : à refaire)
  if (!opts.keepRaw) releaseRaw(big);
}

/** Vide les tableaux « lignes » des 4 gros sets (voir InstallOptions.keepRaw) : leurs objets ne sont plus lus nulle part. */
function releaseRaw(big: typeof BigSets): void {
  for (const raw of [big.JV, big.MONDE, big.SPORT, big.POP] as unknown[][]) raw.length = 0;
}

/** Un sous-thème tel qu'affiché : seul, ou un groupe (« Jeux vidéo ») qui réunit plusieurs sous-thèmes. */
export interface SubthemeView {
  /** id du sous-thème, ou `group:<id>` pour un groupe */
  id: string;
  label: string;
  subs: SubTheme[];
  cards: CatalogEntry[];
  group: boolean;
}

let VIEWS = new WeakMap<ThemeInfo, SubthemeView[]>();

/**
 * Sous-thèmes d'un thème pour l'affichage (ordre conservé) : ceux d'un même groupe n'en font qu'un. Calculé une fois
 * par thème (les catalogues ne changent pas en cours de route) ; chaque appel reçoit sa propre liste (copie).
 */
export function subthemeViews(t: ThemeInfo): SubthemeView[] {
  let views = VIEWS.get(t);
  if (!views) VIEWS.set(t, (views = buildViews(t)));
  return views.slice();
}

function buildViews(t: ThemeInfo): SubthemeView[] {
  const out: SubthemeView[] = [];
  const groups = new Map<string, SubthemeView>();
  for (const s of t.subthemes) {
    if (!s.group) {
      out.push({ id: s.id, label: s.label, subs: [s], cards: s.cards, group: false });
      continue;
    }
    let g = groups.get(s.group.id);
    if (!g) {
      g = { id: `group:${s.group.id}`, label: s.group.label, subs: [], cards: [], group: true };
      groups.set(s.group.id, g);
      out.push(g);
    }
    g.subs.push(s);
    for (const c of s.cards) g.cards.push(c); // (avant : `concat` à chaque famille → quadratique sur les 177 familles JV)
  }
  return out;
}

/** Une carte (par son sous-thème) appartient-elle à une sélection : un sous-thème, ou un groupe (`group:<id>`) ? */
export function inSubthemeScope(scope: string, subthemeId: string): boolean {
  if (scope === subthemeId) return true;
  const g = subthemeById(subthemeId)?.group?.id;
  // (« lieux », « animaux »… : anciens sous-thèmes du World Pack devenus des groupes — missions et liens d'avant)
  return !!g && (scope === `group:${g}` || scope === g);
}

/**
 * FAMILLE / SOUS-FAMILLE d'une carte (retours 05/11, 06/11) : `family` = imprimé en grand au-dessus du nom, `sub` =
 * imprimé en bas à la place du numéro (déjà en haut à droite). Pokémon / LoL / Valorant / CS : le groupe en grand ;
 * les autres : le sous-thème en grand (« Naruto »), le groupe en bas (« Mangas & anime »). Sous-thème sans groupe (Merveilles,
 * Ardèche, Bébous…) : il est sa propre famille, pas de sous-famille.
 */
export function cardFamily(id: string): { family: string; sub?: string } | null {
  const e = BY_ID.get(id);
  const st = e ? SUB_BY_ID.get(e.subthemeId) : undefined;
  if (!st) return null;
  if (!st.group) return { family: st.label };
  // (retours 06/11) seuls Pokémon, LoL, Valorant et CS gardent la famille en grand (« POKÉMON » / « JOHTO ») ; partout
  // ailleurs (mangas, films, animaux, jeux vidéo…) c'est l'inverse : « NARUTO » en grand, « MANGAS & ANIME » en bas
  return FAMILY_FIRST.has(st.group.id) ? { family: st.group.label, sub: st.label } : { family: st.label, sub: st.group.label };
}
const FAMILY_FIRST = new Set(['pokemon', 'lol', 'valorant', 'cs']);

/** Libellé d'une sélection (sous-thème ou groupe). */
export function scopeLabel(scope: string): string {
  const g = scope.startsWith('group:') ? scope.slice(6) : scope;
  return subthemeById(scope)?.label ?? SUBTHEMES.find((s) => s.group?.id === g)?.group?.label ?? '';
}

/** Mention du bas du booster : nombre de cartes et sous-thèmes disponibles, ou « bientôt ». */
export function themeTagline(t: ThemeInfo): string {
  const live = subthemeViews(t).filter((s) => s.cards.length);
  if (!live.length) return taglineOf([`${t.subthemes.length} SOUS-THÈMES`, 'EN PRÉPARATION']);
  return taglineOf([`${fmtCount(t.cards.length, ' ')} CARTES`, ...live.map((s) => s.label.toUpperCase())]);
}

/** Dénominateur du numéro d'une carte de ce sous-thème (« 025/151 », « 152/1025 »). */
export const numberingSize = (st: SubTheme) => st.size ?? st.cards.length;

/** La carte a-t-elle une illustration ? (sinon : design typographique, cf. art/jvTitle.ts) */
export const hasArt = (e: CatalogEntry) => e.file !== '';

/** Illustration pleine définition (chemin relatif à la racine du site). */
/** dossier des illustrations d'une carte — (07/11) jamais d'exception : une carte au sous-thème inconnu ne doit pas
 *  faire tomber toute la collection (repli sur le dossier des Bébous, image manquante = silhouette) */
const artDirOf = (e: CatalogEntry) => e.dir ?? subthemeById(e.subthemeId)?.artDir ?? BEBOUS_INFO.artDir;
export function artPath(e: CatalogEntry): string {
  return artV(`${artDirOf(e)}/${e.file}`);
}

/**
 * (retours live 04) Merveilles (`mrv-…`) : miniature = CAPTURE STATIQUE de leur design 3D (cadre + diorama, outil
 * outils/capture-merveilles.html), à la place de la photo du vrai lieu. La vue détail garde la 3D interactive.
 */
export const isWonderId = (id: string) => id.startsWith('mrv-');
export const wonderCapturePath = (id: string) => artV(`art/merveilles/cartes3d/${id.replace(/^mrv-/, '')}.webp`);

/** Miniature WebP (grilles de collection, échanges) — générée par scripts/make-thumbs.mjs. */
export function thumbPath(e: CatalogEntry): string {
  return artV(`${artDirOf(e)}/thumbs/${e.file.replace(/\.(png|jpe?g)$/i, '.webp')}`);
}
