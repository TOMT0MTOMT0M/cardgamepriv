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
 * (retours 06/11) VRAIE chance qu'UNE carte précise tombe dans un booster (au moins une fois) : les mêmes poids que le
 * tirage (4 emplacements libres + 1 garanti rare ou mieux), puis 1 chance sur le nombre de cartes de son étoile dans le
 * pool du booster. Pity et Bébous mis à part (ils ne changent pas la chance d'une carte ordinaire).
 */
export function cardPackChance(req: PackRequest, rarity: string): number {
  if (rarity === 'secret' || !isValidPackRequest(req)) return 0;
  const n = poolFor(req).get(rarity as StarRarityId)?.length ?? 0;
  if (!n) return 0;
  const r = rarity as StarRarityId;
  const free = (SLOT_WEIGHTS[r] ?? 0) / 100 / n;
  const sure = (GUARANTEED_WEIGHTS[r] ?? 0) / 100 / n;
  return 1 - Math.pow(1 - free, 4) * (1 - sure);
}
