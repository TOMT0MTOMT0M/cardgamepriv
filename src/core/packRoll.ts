/**
 * Tirage d'un booster — logique pure, sans three.js ni base de données : la MÊME fonction sert au serveur Convex
 * (convex/packs.ts) et au mode hors-ligne du jeu. Testée par scripts/test-rolls.mts.
 *
 * 1. Le plan du pack (packRules.ts) : un seul tirage par pack décide s'il contient un Bébou (1 / nb total de cartes, bébou pack seul).
 * 2. Chaque emplacement : on tire l'étoile (dropRates.ts), puis une carte du pool portant cette étoile.
 *    Pool = les cartes du thème, tous sous-thèmes confondus (booster de thème), ou des 4 thèmes (bébou pack).
 *    Les étoiles sont réparties par sous-thème côté données ; on tire l'étoile puis une carte du pool à cette étoile.
 * 3. Si le plan l'a décidé, la dernière carte devient un Bébou au hasard.
 */
import { GUARANTEED_WEIGHTS, SLOT_WEIGHTS, rollStar, type StarRarityId } from './dropRates';
import { planPack, type PackKind } from './packRules';
import { PITY_LIMIT } from './pity';
import { BEBOU_SECRET_CHANCE, BEBOU_THEME, THEMES, WORLD_SECRET_CHANCE, catalogInstalled, themeById, themeOpen, type CatalogEntry, type CatalogRarity } from './sets/themes';
import { contentSig, eventCards, type EventContent } from './events';

export interface RolledSlot {
  card: CatalogEntry;
  rarity: CatalogRarity;
}

export interface PackRequest {
  kind: PackKind;
  /** requis pour `kind: 'theme'` */
  themeId?: string;
  /** pity (src/core/pity.ts) : l'emplacement garanti devient une Mythique, sauf si une Secrète l'a déjà pris */
  forceMythic?: boolean;
  /** tests / démo (`?god`) : ce booster est un god pack */
  forceGod?: boolean;
  /**
   * (11/11) BOOSTER DU MOMENT (src/core/events.ts) : le pool = le contenu de l'événement (le serveur le relit en base,
   * jamais celui du client). `kind` vaut alors 'theme' (pièces d'un booster de thème) ; pas de carte secrète.
   */
  event?: EventContent & { id: string };
}

/**
 * GOD PACK (08/11) : 1 booster sur 1 000, n'importe lequel. Toutes ses cartes sont des 4★ ou mieux, avec au moins
 * une 5★ ET une 6★, et des chances de 5★ / 6★ bien plus fortes que d'habitude. Une Bébou / secrète tirée garde sa place.
 */
export const GOD_PACK_CHANCE = 1 / 1000;
export const GOD_WEIGHTS: Record<StarRarityId, number> = { common: 0, uncommon: 0, rare: 0, epic: 55, legendary: 30, mythic: 15 };

const poolCache = new Map<string, Map<StarRarityId, CatalogEntry[]>>();

function poolFor(req: PackRequest): Map<StarRarityId, CatalogEntry[]> {
  if (req.event) {
    const key = `ev:${contentSig(req.event)}`;
    let pool = poolCache.get(key);
    if (pool) return pool;
    pool = new Map();
    for (const c of eventCards(req.event)) {
      const list = pool.get(c.rarity as StarRarityId) ?? [];
      list.push(c);
      pool.set(c.rarity as StarRarityId, list);
    }
    if (catalogInstalled()) poolCache.set(key, pool);
    return pool;
  }
  const key = req.kind === 'bebou' ? '*bebou' : themeById(req.themeId ?? '')?.id ?? '';
  let pool = poolCache.get(key);
  if (pool) return pool;
  const themes = req.kind === 'bebou' ? THEMES : [themeById(req.themeId ?? '')].filter((t) => t && !t.secret);
  if (!themes.length) throw new Error(`Thème inconnu : ${req.themeId}`);
  pool = new Map();
  for (const t of themes) for (const c of t!.cards) {
    if (c.rarity === 'secret') continue;
    const list = pool.get(c.rarity) ?? [];
    list.push(c);
    pool.set(c.rarity, list);
  }
  poolCache.set(key, pool);
  return pool;
}

/** Vrai si la demande désigne un booster existant. */
export function isValidPackRequest(req: PackRequest): boolean {
  if (req.event) return eventCards(req.event).length > 0;
  if (req.kind === 'bebou') return THEMES.some(themeOpen);
  const t = themeById(req.themeId ?? '');
  return !!t && !t.secret && themeOpen(t);
}

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/** Tire les cartes d'un booster. `rand` : RNG [0,1) (crypto côté serveur). */
export function rollPack(req: PackRequest, rand: () => number = Math.random): RolledSlot[] {
  return rollPackEx(req, rand).slots;
}

/** Même tirage, en disant si c'est un god pack (l'ouverture a alors son animation, et le serveur le garde en mémoire). */
export function rollPackEx(req: PackRequest, rand: () => number = Math.random): { slots: RolledSlot[]; god: boolean } {
  if (!isValidPackRequest(req)) throw new Error('Ce booster n’est pas encore disponible.');
  const pool = poolFor(req);
  const theme = req.kind === 'theme' && !req.event ? themeById(req.themeId ?? '') : undefined;
  const themeSecrets = theme ? theme.cards.filter((c) => c.rarity === 'secret') : [];

  // booster du moment : jamais de secrète (le tirage du plan est quand même consommé, comme à chance nulle)
  const secretChance = req.event ? 0 : req.kind === 'bebou'
    ? BEBOU_SECRET_CHANCE
    : (themeSecrets.length > 0 ? (theme!.id === 'monde' ? WORLD_SECRET_CHANCE : 1 / theme!.cards.length) : 0);

  const plan = planPack(req.kind, secretChance, rand);
  // tiré APRÈS le plan (la démo force une Bébou en truquant le tout premier tirage)
  const god = !!req.forceGod || rand() < GOD_PACK_CHANCE;
  const out: RolledSlot[] = [];
  for (let slot = 0; slot < plan.size; slot++) {
    if (slot === plan.bebouSlot) {
      const secretCard = req.kind === 'bebou'
        ? pick(BEBOU_THEME.cards, rand)
        : pick(themeSecrets, rand);
      out.push({ card: secretCard, rarity: 'secret' });
      continue;
    }
    const last = slot === plan.size - 1;
    const weights = god ? GOD_WEIGHTS : last ? GUARANTEED_WEIGHTS : SLOT_WEIGHTS;
    let star: StarRarityId = !god && last && req.forceMythic && pool.get('mythic')?.length ? 'mythic' : rollStar(weights, rand);
    // thème sans carte de cette étoile (petit thème) : on descend, puis on remonte, jusqu'à trouver
    if (!pool.get(star)?.length) {
      const order: StarRarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
      const i = order.indexOf(star);
      star = [...order.slice(0, i).reverse(), ...order.slice(i + 1)].find((r) => pool.get(r)?.length) ?? star;
    }
    out.push({ card: pick(pool.get(star)!, rand), rarity: star });
  }
  if (god) {
    // au moins une 6★ et une 5★ : sinon l'emplacement le plus faible (jamais une secrète, jamais la seule 6★ ou la
    // seule 5★ déjà là) devient la carte qui manque
    const RANK: Record<string, number> = { epic: 4, legendary: 5, mythic: 6 };
    const only = (r: CatalogRarity) => out.filter((x) => x.rarity === r).length === 1;
    for (const want of ['mythic', 'legendary'] as const) {
      if (out.some((x) => x.rarity === want) || !pool.get(want)?.length) continue;
      const cand = out.map((x, i) => ({ x, i })).filter(({ x }) => x.rarity !== 'secret' && !((x.rarity === 'mythic' || x.rarity === 'legendary') && only(x.rarity)));
      if (!cand.length) continue;
      const low = Math.min(...cand.map(({ x }) => RANK[x.rarity] ?? 0));
      const { i } = pick(cand.filter(({ x }) => (RANK[x.rarity] ?? 0) === low), rand);
      out[i] = { card: pick(pool.get(want)!, rand), rarity: want };
    }
  }
  return { slots: out, god };
}

/**
 * (retours 06/11) VRAIE chance qu'UNE carte précise tombe dans un booster (au moins une fois). (12/11) Calculée sur les
 * vrais taux de chaque emplacement (packTrueOdds : god pack, pity 6★, secrète comprises), puis 1 chance sur le nombre
 * de cartes de son étoile dans le pool du booster.
 */
export function cardPackChance(req: PackRequest, rarity: string): number {
  if (rarity === 'secret' || !isValidPackRequest(req)) return 0;
  const n = poolFor(req).get(rarity as StarRarityId)?.length ?? 0;
  if (!n) return 0;
  const r = rarity as StarRarityId;
  let miss = 1;
  for (const s of packTrueOdds(req).slots) miss *= 1 - (s[r] ?? 0) / n;
  return 1 - miss;
}

/**
 * (12/11) VRAIS TAUX d'un booster, calculés EXACTEMENT sur le tirage ci-dessus (pas de simulation) : les poids des
 * emplacements, l'emplacement garanti, le GOD PACK (1 sur 1 000, ses 4★+ et sa correction « au moins une 5★ et une
 * 6★ »), la PITY 6★ en régime établi (part des boosters où elle force une Mythique), la carte SECRÈTE (Bébou ou
 * Merveille) qui prend la dernière place, et le repli d'étoile d'un pool incomplet. C'est ce qu'affiche la fiche booster.
 */
export interface PackTrueOdds {
  /** part de chaque étoile parmi les cartes tirées (fractions, total 1 avec `secret`) */
  share: Record<StarRarityId | 'secret', number>;
  /** chance qu'un booster contienne au moins une carte de cette étoile OU MIEUX (une secrète compte comme mieux qu'une 6★) */
  atLeast: Record<StarRarityId, number>;
  /** chance qu'un booster contienne une carte secrète */
  secret: number;
  /** chance qu'un booster soit un god pack */
  god: number;
  /** part des boosters où la pity force la 6★ (régime établi, en n'ouvrant que ce booster) */
  pity: number;
  /** probabilité, pour chaque emplacement (0..4), de chaque étoile (fractions) — sert à la chance d'une carte précise */
  slots: Array<Record<StarRarityId | 'secret', number>>;
}

const STARS: StarRarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
type Out = StarRarityId | 'secret';
const oddsCache = new Map<string, PackTrueOdds>();

export function packTrueOdds(req: PackRequest, pityLimit = PITY_LIMIT): PackTrueOdds {
  // (fusion 13/11) le booster du moment a son propre contenu : sa clé de cache aussi
  const key = req.event ? `ev:${contentSig(req.event)}:${pityLimit}` : `${req.kind}:${req.themeId ?? ''}:${pityLimit}`;
  const hit = oddsCache.get(key);
  if (hit) return hit;
  const pool = poolFor(req);
  const has = (r: StarRarityId) => !!pool.get(r)?.length;
  // repli d'étoile identique au tirage : on descend, puis on remonte
  const fall = (r: StarRarityId): StarRarityId => {
    if (has(r)) return r;
    const i = STARS.indexOf(r);
    return [...STARS.slice(0, i).reverse(), ...STARS.slice(i + 1)].find(has) ?? r;
  };
  const dist = (w: Record<StarRarityId, number>) => {
    const tot = STARS.reduce((a, r) => a + w[r], 0);
    const d = new Map<StarRarityId, number>();
    for (const r of STARS) if (w[r] > 0) d.set(fall(r), (d.get(fall(r)) ?? 0) + w[r] / tot);
    return d;
  };
  const FREE = dist(SLOT_WEIGHTS), GUAR = dist(GUARANTEED_WEIGHTS), GODW = dist(GOD_WEIGHTS);
  const FORCED = new Map<StarRarityId, number>([[has('mythic') ? 'mythic' : fall('mythic'), 1]]);
  const theme = req.kind === 'theme' ? themeById(req.themeId ?? '') : undefined;
  const themeSecrets = theme ? theme.cards.filter((c) => c.rarity === 'secret').length : 0;
  const sc = req.kind === 'bebou' ? BEBOU_SECRET_CHANCE : themeSecrets > 0 ? (theme!.id === 'monde' ? WORLD_SECRET_CHANCE : 1 / theme!.cards.length) : 0;
  const g = GOD_PACK_CHANCE;

  /** toutes les issues d'un booster (liste d'étoiles par emplacement, avec leur probabilité) pour un cas donné */
  function outcomes(god: boolean, secret: boolean, forced: boolean): Array<[Out[], number]> {
    const n = secret ? 4 : 5;
    const per: Array<Map<StarRarityId, number>> = [];
    for (let i = 0; i < n; i++) per.push(god ? GODW : i === 4 ? (forced ? FORCED : GUAR) : FREE);
    let acc: Array<[Out[], number]> = [[[], 1]];
    for (const d of per) {
      const next: Array<[Out[], number]> = [];
      for (const [o, p] of acc) for (const [r, q] of d) next.push([[...o, r], p * q]);
      acc = next;
    }
    if (secret) acc = acc.map(([o, p]) => [[...o, 'secret'], p]);
    if (!god) return acc;
    // correction du god pack (au moins une 6★ et une 5★), avec le même choix de l'emplacement remplacé
    const RANK: Record<string, number> = { epic: 4, legendary: 5, mythic: 6 };
    let cur = acc;
    for (const want of ['mythic', 'legendary'] as const) {
      if (!has(want)) continue;
      const next: Array<[Out[], number]> = [];
      for (const [o, p] of cur) {
        if (o.includes(want)) { next.push([o, p]); continue; }
        const only = (r: Out) => o.filter((x) => x === r).length === 1;
        const cand = o.map((x, i) => ({ x, i })).filter(({ x }) => x !== 'secret' && !((x === 'mythic' || x === 'legendary') && only(x)));
        if (!cand.length) { next.push([o, p]); continue; }
        const low = Math.min(...cand.map(({ x }) => RANK[x] ?? 0));
        const picks = cand.filter(({ x }) => (RANK[x] ?? 0) === low);
        for (const { i } of picks) { const o2 = o.slice(); o2[i] = want; next.push([o2, p / picks.length]); }
      }
      cur = next;
    }
    return cur;
  }
  const rankOf = (r: Out) => (r === 'secret' ? 6 : STARS.indexOf(r));
  const zero = () => Object.fromEntries([...STARS, 'secret'].map((r) => [r, 0])) as Record<Out, number>;
  function aggregate(cases: Array<[boolean, boolean, boolean, number]>) {
    const slots = [zero(), zero(), zero(), zero(), zero()];
    const best = new Array(7).fill(0);
    let dry = 0;
    for (const [god, secret, forced, w] of cases) {
      if (w <= 0) continue;
      for (const [o, p] of outcomes(god, secret, forced)) {
        o.forEach((r, i) => (slots[i][r] += w * p));
        const b = Math.max(...o.map(rankOf));
        best[b] += w * p;
        if (b < 5) dry += w * p;
      }
    }
    return { slots, best, dry };
  }
  // 1) sans pity : part des boosters « secs » (ni 6★ ni secrète) → régime établi de la pity
  const base = aggregate([[false, false, false, (1 - g) * (1 - sc)], [false, true, false, (1 - g) * sc], [true, false, false, g * (1 - sc)], [true, true, false, g * sc]]);
  const q = base.dry;
  const cycle = q >= 1 ? pityLimit : (1 - Math.pow(q, pityLimit)) / (1 - q);
  const pity = q >= 1 ? 1 / pityLimit : Math.pow(q, pityLimit - 1) / cycle;
  // 2) avec pity : un booster forcé (ni god pack ni secrète à la dernière place) prend une 6★ garantie à la place de l'emplacement garanti
  const all = aggregate([
    [false, false, false, (1 - g) * (1 - sc) * (1 - pity)], [false, false, true, (1 - g) * (1 - sc) * pity],
    [false, true, false, (1 - g) * sc], [true, false, false, g * (1 - sc)], [true, true, false, g * sc],
  ]);
  const share = zero();
  for (const s of all.slots) for (const r of [...STARS, 'secret'] as Out[]) share[r] += s[r] / 5;
  const atLeast = {} as Record<StarRarityId, number>;
  STARS.forEach((r, i) => (atLeast[r] = all.best.slice(i).reduce((a, b) => a + b, 0)));
  const out: PackTrueOdds = { share, atLeast, secret: sc, god: g, pity, slots: all.slots };
  oddsCache.set(key, out);
  return out;
}
