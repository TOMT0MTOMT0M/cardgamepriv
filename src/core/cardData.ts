import type { RarityId } from './rarity';
import { siteUrl } from './siteRoot';
import type { UniverseId } from './universes';
import { POKEMON_151, POKEMON_151_INFO, pokemonCardId, pokemonFile, pokemonGen } from './sets/pokemon151';
import { BEBOUS, BEBOUS_INFO, bebouCardId, bebouFile } from './sets/bebous';
import { VALORANT, VALORANT_INFO, valorantCardId, valorantClass, valorantFile } from './sets/valorant';
import { LOL, LOL_INFO, lolCardId, lolFile, lolIsChampion } from './sets/lol';
import { lolLine } from './sets/lolLines';
import { CS, CS_INFO, csCardId, csClass, csFile } from './sets/cs';
import { artPath, catalogEntry, hasArt, subthemeById } from './sets/themes';

/** `image` = illustration bitmap (champ `image`), les autres sont peints procéduralement (art/subjects.ts). */
export type SubjectKind = 'monolith' | 'moth' | 'sigil' | 'tower' | 'serpent' | 'bloom' | 'eye' | 'stag' | 'image' | 'jvtitle';

export type CardSetId = 'lab' | 'pokemon151' | 'valorant' | 'lol' | 'cs' | 'bebous';

export interface CardPalette {
  /** papier / carton du cadre */
  paper: string;
  /** encre principale (traits, texte) */
  ink: string;
  /** ciel / fond profond */
  sky: string;
  /** fond secondaire (horizon, halo) */
  haze: string;
  /** sujet */
  body: string;
  /** accent lumineux (zones émissives) */
  glow: string;
}

export interface CardData {
  id: string;
  num: number;
  name: string;
  /** catégorie (non affichée sur la carte ; gardée pour le catalogue serveur) */
  epithet: string;
  element: string;
  /** univers d'origine, affiché sur la carte */
  universe: UniverseId;
  subject: SubjectKind;
  palette: CardPalette;
  seed: number;
  /** Rareté "naturelle" de la carte (le sélecteur du shell peut la surcharger). */
  rarity: RarityId;
  /** Set d'appartenance (défaut : 'lab'). */
  set?: CardSetId;
  /** URL de l'illustration quand `subject === 'image'` (chargée/détourée par art/images.ts). */
  image?: string;
  /** Photo réelle (thème Bébous) : jamais détourée automatiquement, cadrée en portrait. */
  photo?: boolean;
  /** Échelle de l'illustration dans la fenêtre (défaut 1) : les armes Valorant, larges, sont un peu réduites. */
  fit?: number;
  /** Illustration « scène » déjà au format portrait (splash LoL) : elle remplit toute la carte, jamais détourée. */
  cover?: boolean;
  /** Nom d'univers affiché à la place de celui de `universe` : le sous-thème (« MARIO », « KANTO », « PISTOLETS »…) */
  uniName?: string;
  /** Jeux vidéo : jaquette / personnage / objet, et année (design typographique des cartes sans illustration) */
  jvKind?: string;
  /** Monde V2 : type affiché sur le design typographique (« Mammifère »…) */
  typeLabel?: string;
  year?: number;
}

/** Set de démonstration du lab : données fictives, tout est inventé et dessiné procéduralement. */
export const LAB_CARDS: CardData[] = [
  {
    id: 'veilleur-cendre', num: 7, name: 'Veilleur de Cendre', epithet: 'Gardien', element: 'Cendre', universe: 'cendre',
    subject: 'monolith', seed: 1307, rarity: 'rare',
    palette: { paper: '#e9e1cf', ink: '#2a211b', sky: '#3b2a26', haze: '#c4572f', body: '#1d1715', glow: '#ffb35c' },
  },
  {
    id: 'phalene-albatre', num: 12, name: 'Phalène d’Albâtre', epithet: 'Esprit', element: 'Lune', universe: 'lune',
    subject: 'moth', seed: 4412, rarity: 'uncommon',
    palette: { paper: '#ede7da', ink: '#262423', sky: '#1f2430', haze: '#8d93a6', body: '#e8dcc2', glow: '#f6e7b0' },
  },
  {
    id: 'sigille-marees', num: 23, name: 'Sigille des Marées', epithet: 'Rituel', element: 'Marée', universe: 'marees',
    subject: 'sigil', seed: 9023, rarity: 'epic',
    palette: { paper: '#e3e0d4', ink: '#14211f', sky: '#0f2a2a', haze: '#2f6a62', body: '#d8c79a', glow: '#f3e3a8' },
  },
  {
    id: 'tour-muette', num: 31, name: 'La Tour Muette', epithet: 'Lieu', element: 'Pierre', universe: 'monts',
    subject: 'tower', seed: 3131, rarity: 'legendary',
    palette: { paper: '#e6dfd0', ink: '#1e1d22', sky: '#2c3446', haze: '#c98f6a', body: '#26252b', glow: '#ffcf7a' },
  },
  {
    id: 'serpent-givre', num: 44, name: 'Serpent de Givre', epithet: 'Bête', element: 'Givre', universe: 'abime',
    subject: 'serpent', seed: 4404, rarity: 'epic',
    palette: { paper: '#e4e6e3', ink: '#17202a', sky: '#1b2b3a', haze: '#7ea2b8', body: '#d9e4e6', glow: '#ffffff' },
  },
  {
    id: 'floraison-noire', num: 52, name: 'Floraison Noire', epithet: 'Maléfice', element: 'Ronce', universe: 'ronces',
    subject: 'bloom', seed: 5252, rarity: 'rare',
    palette: { paper: '#ebe2d6', ink: '#1f1418', sky: '#1a1215', haze: '#6b2a36', body: '#c9465a', glow: '#ffb0a0' },
  },
  {
    id: 'oeil-du-puits', num: 66, name: 'Œil du Puits', epithet: 'Oracle', element: 'Abîme', universe: 'abime',
    subject: 'eye', seed: 6666, rarity: 'mythic',
    palette: { paper: '#e8e0cc', ink: '#191512', sky: '#100d0b', haze: '#5a4628', body: '#e2c88a', glow: '#ffd27a' },
  },
  {
    id: 'cerf-orage', num: 78, name: 'Cerf d’Orage', epithet: 'Bête', element: 'Orage', universe: 'monts',
    subject: 'stag', seed: 7878, rarity: 'legendary',
    palette: { paper: '#e7e2d6', ink: '#1a1c1f', sky: '#262a2c', haze: '#8a8f7a', body: '#d2cbb8', glow: '#fff1c2' },
  },
  {
    id: 'pierre-levee', num: 3, name: 'Pierre Levée', epithet: 'Lieu', element: 'Pierre', universe: 'monts',
    subject: 'monolith', seed: 303, rarity: 'common',
    palette: { paper: '#e6e1d6', ink: '#24221f', sky: '#55606a', haze: '#a7a99a', body: '#2e2c2a', glow: '#f0e6c8' },
  },
  {
    id: 'lierre-sourd', num: 15, name: 'Lierre Sourd', epithet: 'Plante', element: 'Ronce', universe: 'ronces',
    subject: 'bloom', seed: 1515, rarity: 'common',
    palette: { paper: '#e9e4d4', ink: '#1c2219', sky: '#243026', haze: '#5f7a54', body: '#a9c08a', glow: '#e9f2c4' },
  },
  {
    id: 'phare-noye', num: 88, name: 'Phare Noyé', epithet: 'Lieu', element: 'Marée', universe: 'marees',
    subject: 'tower', seed: 8808, rarity: 'uncommon',
    palette: { paper: '#e2e3dc', ink: '#121c22', sky: '#15303a', haze: '#3f7b80', body: '#1a2a30', glow: '#ffe7a6' },
  },
  {
    id: 'mue-de-lune', num: 99, name: 'Mue de Lune', epithet: 'Esprit', element: 'Lune', universe: 'lune',
    subject: 'moth', seed: 9999, rarity: 'mythic',
    palette: { paper: '#efe9dc', ink: '#17151a', sky: '#0e0d14', haze: '#3d3a52', body: '#f2ead8', glow: '#ffffff' },
  },
];

export const SET_CODE = 'LAB';
export const SET_SIZE = 120;

/**
 * Palette neutre de départ des cartes illustrées : la vraie palette est extraite des pixels
 * de l'illustration au chargement (art/images.ts) et remplace celle-ci à la génération.
 */
export const IMAGE_PALETTE: CardPalette = { paper: '#ebe5d6', ink: '#1f1d1a', sky: '#2b3140', haze: '#7d8494', body: '#d9d2c2', glow: '#fff1c8' };

/** Set « Pokémon 151 » : 151 cartes illustrées (public/art/pokemon-151). */
export const POKEMON_CARDS: CardData[] = POKEMON_151.map((e) => ({
  id: pokemonCardId(e),
  num: e.dex,
  name: e.name,
  epithet: 'Pokémon',
  element: '',
  universe: 'pokemon',
  uniName: pokemonGen(e).label,
  subject: 'image',
  seed: 1000 + e.dex * 97,
  rarity: e.rarity,
  palette: IMAGE_PALETTE,
  set: 'pokemon151',
  image: siteUrl(`${POKEMON_151_INFO.artDir}/${pokemonFile(e)}`),
}));

/**
 * Valorant, LoL et CS (4 222 cartes du labo, `CARD_SETS`) : construits à la première demande et plus au chargement
 * (audit PERF2-01) — le jeu ne s'en sert que pour les cartes de ces sous-thèmes réellement affichées (`cardById`).
 */
const lazy = <T>(build: () => T): (() => T) => {
  let v: T | undefined;
  return () => (v ??= build());
};

/** Sous-thème « Valorant » : 995 cartes (agents en pied, skins d'armes et couteaux), public/art/valorant. */
export const valorantCards = lazy((): CardData[] => VALORANT.map((e) => ({
  id: valorantCardId(e),
  num: e.num,
  name: e.name,
  epithet: e.kind === 'agent' ? 'Agent' : e.kind === 'knife' ? 'Couteau' : 'Skin',
  element: e.weapon,
  universe: 'valorant',
  uniName: valorantClass(e).label,
  subject: 'image',
  seed: 3000 + e.num * 89,
  rarity: e.rarity,
  palette: IMAGE_PALETTE,
  set: 'valorant',
  fit: e.kind === 'agent' ? 1 : 0.72,
  image: siteUrl(`${VALORANT_INFO.artDir}/${valorantFile(e)}`),
})));

/** Sous-thème « League of Legends » : 2 120 cartes (champions + skins), splash recadré qui remplit la carte. */
export const lolCards = lazy((): CardData[] => LOL.map((e) => ({
  id: lolCardId(e),
  num: e.num,
  name: e.name,
  epithet: lolIsChampion(e) ? 'Champion' : 'Skin',
  element: e.champion,
  universe: 'lol',
  uniName: lolLine(e).label,
  subject: 'image',
  seed: 12000 + e.num * 61,
  rarity: e.rarity,
  palette: IMAGE_PALETTE,
  set: 'lol',
  cover: true,
  image: siteUrl(`${LOL_INFO.artDir}/${lolFile(e)}`),
})));

/** Sous-thème « Skins CS » : 1 107 cartes (armes, couteaux, gants, stickers), objets détourés comme Valorant. */
export const csCards = lazy((): CardData[] => CS.map((e) => ({
  id: csCardId(e),
  num: e.num,
  name: e.name,
  epithet: e.kind === 'knife' ? 'Couteau' : e.kind === 'gloves' ? 'Gants' : e.kind === 'sticker' ? 'Sticker' : 'Skin',
  element: e.weapon,
  universe: 'cs',
  uniName: csClass(e).label,
  subject: 'image',
  seed: 16000 + e.num * 53,
  rarity: e.rarity,
  palette: IMAGE_PALETTE,
  set: 'cs',
  fit: e.kind === 'weapon' || e.kind === 'knife' ? 0.74 : 0.86,
  image: siteUrl(`${CS_INFO.artDir}/${csFile(e)}`),
})));

/** Thème SECRET « Les Bébous » : 8 cartes, une par membre (surnom + photo), toutes en rareté secrète. */
export const BEBOU_CARDS: CardData[] = BEBOUS.map((e) => ({
  id: bebouCardId(e),
  num: e.num,
  name: e.nickname,
  epithet: 'Bébou',
  element: '',
  universe: 'bebous',
  subject: 'image',
  seed: 7000 + e.num * 131,
  rarity: 'secret',
  palette: IMAGE_PALETTE,
  set: 'bebous',
  image: siteUrl(`${BEBOUS_INFO.artDir}/${bebouFile(e)}`),
  photo: true,
}));

export interface CardSet {
  id: CardSetId;
  label: string;
  /** code imprimé sur la carte (« PKM · 025/151 ») */
  code: string;
  size: number;
  cards: CardData[];
}

export const CARD_SETS: Record<CardSetId, CardSet> = {
  pokemon151: { id: 'pokemon151', label: POKEMON_151_INFO.label, code: POKEMON_151_INFO.code, size: POKEMON_151_INFO.size, cards: POKEMON_CARDS },
  // (`cards` : accesseur, construit au premier accès)
  valorant: { id: 'valorant', label: VALORANT_INFO.label, code: VALORANT_INFO.code, size: VALORANT_INFO.size, get cards() { return valorantCards(); } },
  lol: { id: 'lol', label: LOL_INFO.label, code: LOL_INFO.code, size: LOL_INFO.size, get cards() { return lolCards(); } },
  cs: { id: 'cs', label: CS_INFO.label, code: CS_INFO.code, size: CS_INFO.size, get cards() { return csCards(); } },
  lab: { id: 'lab', label: 'Lab (procédural)', code: SET_CODE, size: SET_SIZE, cards: LAB_CARDS },
  bebous: { id: 'bebous', label: BEBOUS_INFO.label, code: BEBOUS_INFO.code, size: BEBOUS_INFO.size, cards: BEBOU_CARDS },
};

export const DEFAULT_SET: CardSetId = 'pokemon151';

export function isCardSetId(s: string | null | undefined): s is CardSetId {
  return !!s && s in CARD_SETS;
}

const LS_SET = 'cardlab.set';

/** Set au démarrage : `?set=lab|pokemon151`, sinon dernier choix (localStorage), sinon `DEFAULT_SET`. */
function initialSet(): CardSetId {
  try {
    const q = new URLSearchParams(location.search).get('set');
    if (isCardSetId(q)) return q;
    const v = localStorage.getItem(LS_SET);
    if (isCardSetId(v)) return v;
  } catch {
    /* hors navigateur / stockage bloqué */
  }
  return DEFAULT_SET;
}

/**
 * Pool de cartes actif. Tableau « vivant » : `setActiveSet` remplace son contenu sur place,
 * donc toutes les expériences qui importent `CARDS` suivent le set choisi (sans toucher au shell).
 */
export const CARDS: CardData[] = [];
let activeId: CardSetId = DEFAULT_SET;

/** Change le set actif (et le mémorise si `remember`). Les expériences chargées ensuite l'utilisent. */
export function setActiveSet(id: CardSetId, remember = false) {
  activeId = id;
  CARDS.splice(0, CARDS.length, ...CARD_SETS[id].cards);
  if (remember)
    try {
      localStorage.setItem(LS_SET, id);
    } catch {
      /* ignore */
    }
}
setActiveSet(initialSet());

export function activeSet(): CardSet {
  return CARD_SETS[activeId];
}

/** Code + taille du set d'une carte (pour la ligne « PKM · 025/151 » des gabarits). */
export function setInfo(card: CardData): { code: string; size: number } {
  const s = CARD_SETS[card.set as CardSetId];
  if (s) return { code: s.code, size: s.size };
  const sub = subthemeById(card.set ?? '');
  // dénominateur du sous-thème, ou celui du groupe entier quand les n° sont globaux (Sport : « 0149 / 7708 »)
  if (sub) return { code: sub.code || 'WLD', size: sub.size ?? sub.cards.length };
  return { code: SET_CODE, size: SET_SIZE };
}

/**
 * Cartes connues par id. Les sets construits au chargement (Pokémon, lab, Bébous) y sont tout de suite ; Valorant, LoL
 * et CS y entrent à la première carte demandée de leur sous-thème (`indexSet`), puis les cartes du catalogue au fil
 * des demandes. Ordre de priorité inchangé : une carte d'un set du labo l'emporte sur sa version « catalogue ».
 */
const CARD_BY_ID = new Map<string, CardData>();
const LAZY_SETS: CardSetId[] = ['valorant', 'lol', 'cs'];
const indexed = new Set<CardSetId>();
function indexSet(id: CardSetId) {
  if (indexed.has(id)) return;
  indexed.add(id);
  for (const c of CARD_SETS[id].cards) CARD_BY_ID.set(c.id, c);
}
// (les ids ne se recoupent pas d'un set à l'autre : préfixes propres à chaque set)
for (const id of Object.keys(CARD_SETS) as CardSetId[]) if (!LAZY_SETS.includes(id)) indexSet(id);
/** Groupe du catalogue (`SubTheme.group.id`) → set du labo qui a sa propre version de la carte. */
const SET_OF_GROUP: Partial<Record<string, CardSetId>> = { valorant: 'valorant', lol: 'lol', cs: 'cs' };

const hashId = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
};

/** Recherche dans tous les sets (catalogue complet, thèmes, lab). */
export function cardById(id: string): CardData {
  const existing = CARD_BY_ID.get(id);
  if (existing) return existing;
  const e = catalogEntry(id);
  // carte d'un set du labo pas encore construit : son set (ou, id inconnu du catalogue, tous les sets restants)
  const lazySet = e ? SET_OF_GROUP[subthemeById(e.subthemeId)?.group?.id ?? ''] : undefined;
  if (lazySet || (!e && indexed.size < Object.keys(CARD_SETS).length)) {
    if (lazySet) indexSet(lazySet);
    else LAZY_SETS.forEach(indexSet);
    const found = CARD_BY_ID.get(id);
    if (found) return found;
  }
  if (e) {
    const cd: CardData = {
      id: e.id,
      num: e.num,
      name: e.name,
      epithet: subthemeById(e.subthemeId)?.label ?? '',
      element: '',
      universe: 'monde' as any,
      subject: 'image',
      seed: 10000 + e.num * 37,
      rarity: e.rarity,
      palette: IMAGE_PALETTE,
      set: e.subthemeId as any,
      image: siteUrl(artPath(e)),
      fit: 1,
    };
    if (e.art !== undefined) {
      // Jeux vidéo / Monde V2 / Sport / Pop Culture : le sous-thème tient lieu d'univers (« MARIO », « MAMMIFÈRES ») ; image pleine (jaquette,
      // photo) = bord à bord ; artwork = détouré ; rien de trouvé à la récolte = design typographique (art/jvTitle.ts)
      const fam = subthemeById(e.subthemeId)?.label ?? '';
      Object.assign(cd, { universe: e.kind ? 'jv' : e.themeId === 'sport' ? 'sport' : e.themeId === 'pop' ? 'pop' : 'monde', uniName: fam, jvKind: e.kind, typeLabel: e.label || undefined, year: e.year || undefined, seed: 20000 + hashId(e.id) });
      if (!hasArt(e)) Object.assign(cd, { subject: 'jvtitle', image: undefined });
      else if (e.art === 'c') cd.cover = true;
      else cd.fit = 0.92;
    }
    CARD_BY_ID.set(id, cd);
    return cd;
  }
  return CARDS[0];
}

/** Carte "vitrine" pour une rareté donnée (la plus représentative). */
export function cardForRarity(r: RarityId, offset = 0): CardData {
  // la rareté secrète n'existe que dans le thème Bébous (qui ne tombe que dans le « bébou pack », cf. packRules.ts)
  if (r === 'secret') return BEBOU_CARDS[offset % BEBOU_CARDS.length];
  const list = CARDS.filter((c) => c.rarity === r);
  const pool = list.length ? list : CARDS;
  return pool[offset % pool.length];
}
