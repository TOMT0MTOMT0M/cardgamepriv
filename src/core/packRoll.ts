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
import { BEBOU_SECRET_CHANCE, BEBOU_THEME, THEMES, WORLD_SECRET_CHANCE, themeById, themeOpen, type CatalogEntry, type CatalogRarity } from './sets/themes';

export interface RolledSlot {
  card: CatalogEntry;
  rarity: CatalogRarity;
}

export interface PackRequest {
  kind: PackKind;
  /** requis pour `kind: 'theme'` */
  themeId?: string;
}

const poolCache = new Map<string, Map<StarRarityId, CatalogEntry[]>>();

function poolFor(req: PackRequest): Map<StarRarityId, CatalogEntry[]> {
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
  if (req.kind === 'bebou') return THEMES.some(themeOpen);
  const t = themeById(req.themeId ?? '');
  return !!t && !t.secret && themeOpen(t);
}

function pick<T>(list: T[], rand: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/** Tire les cartes d'un booster. `rand` : RNG [0,1) (crypto côté serveur). */
export function rollPack(req: PackRequest, rand: () => number = Math.random): RolledSlot[] {
  if (!isValidPackRequest(req)) throw new Error('Ce booster n’est pas encore disponible.');
  const pool = poolFor(req);
  const theme = req.kind === 'theme' ? themeById(req.themeId ?? '') : undefined;
  const themeSecrets = theme ? theme.cards.filter((c) => c.rarity === 'secret') : [];

  const secretChance = req.kind === 'bebou'
    ? BEBOU_SECRET_CHANCE
    : (themeSecrets.length > 0 ? (theme!.id === 'monde' ? WORLD_SECRET_CHANCE : 1 / theme!.cards.length) : 0);

  const plan = planPack(req.kind, secretChance, rand);
  const out: RolledSlot[] = [];
  for (let slot = 0; slot < plan.size; slot++) {
    if (slot === plan.bebouSlot) {
      const secretCard = req.kind === 'bebou'
        ? pick(BEBOU_THEME.cards, rand)
        : pick(themeSecrets, rand);
      out.push({ card: secretCard, rarity: 'secret' });
      continue;
    }
    const weights = slot === plan.size - 1 ? GUARANTEED_WEIGHTS : SLOT_WEIGHTS;
    let star = rollStar(weights, rand);
    // thème sans carte de cette étoile (petit thème) : on descend, puis on remonte, jusqu'à trouver
    if (!pool.get(star)?.length) {
      const order: StarRarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
      const i = order.indexOf(star);
      star = [...order.slice(0, i).reverse(), ...order.slice(i + 1)].find((r) => pool.get(r)?.length) ?? star;
    }
    out.push({ card: pick(pool.get(star)!, rand), rarity: star });
  }
  return out;
}
