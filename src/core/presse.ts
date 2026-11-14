/**
 * LA PRESSE (V2, 11/11) — mini-jeu court contre la maison, en pièces, tiré à 100 % côté serveur (convex/presse.ts).
 *
 *  - Tu mises 50, 100 ou 250 pièces et choisis l'album : la presse grave en secret une bande de 6 cartes de cet album
 *    (raretés aux taux d'un emplacement normal de booster). La première frappe est offerte.
 *  - Chaque frappe dévoile la carte suivante : ses étoiles chargent la pièce (valeur = étoiles × PRESSE_RATE × mise).
 *  - Deux frappes de la MÊME RARETÉ d'affilée : la pièce se fend, la mise est perdue. Après une 1★, le risque est grand
 *    (58 %) ; après une 3★, il est faible (10 %). Tu peux encaisser à tout moment ; à la 6e frappe, on encaisse seul.
 *  - Avantage de la maison ≈ 7,6 % en jouant au mieux (programmation dynamique, voir convex/presse.test.ts) : un petit
 *    puits de pièces. Aucune carte n'est gagnée ni vendue : les cartes frappées ne font que montrer l'album
 *    (« manquante » quand tu ne l'as pas encore), les pièces gagnées servent aux boosters.
 */
import { fe } from './errors';
import type { RarityId } from './rarity';
import { SLOT_WEIGHTS, rollStar } from './dropRates';
import { CARD_STARS } from './economy';
import { THEMES, type CatalogEntry } from './sets/themes';
import type { PackChoice } from './games';

export const PRESSE_BETS = [50, 100, 250] as const;
export const PRESSE_STRIKES = 6;
export const PRESSE_RATE = 0.38;
/** parties par jour (heure de Paris), pour que la presse reste un à-côté */
export const PRESSE_DAILY = 20;

/** Ce que rapporte une étoile, pour une mise donnée. */
export const presseStar = (bet: number) => Math.round(bet * PRESSE_RATE);
/** Valeur de la pièce : étoiles cumulées × valeur d'une étoile. */
export const presseValue = (bet: number, cards: Array<{ rarity: RarityId | string }>) => presseStar(bet) * cards.reduce((a, c) => a + (CARD_STARS[c.rarity as RarityId] ?? 0), 0);
/** Probabilité que la prochaine frappe fende la pièce, sachant la dernière carte. */
export const presseRisk = (last: RarityId | string | undefined) => (last ? (SLOT_WEIGHTS[last as keyof typeof SLOT_WEIGHTS] ?? 0) / 100 : 0);
/** La frappe `i` (≥ 1) fend-elle la pièce ? */
export const presseCracks = (strip: Array<{ rarity: string }>, i: number) => i > 0 && strip[i].rarity === strip[i - 1].rarity;

export function presseBetProblem(bet: number, coins: number, playedToday: number): string | null {
  if (!(PRESSE_BETS as readonly number[]).includes(bet)) return fe('presse.2', { p0: PRESSE_BETS.join(', ') });
  if (bet > coins) return fe('presse.3', { p0: bet - coins });
  if (playedToday >= PRESSE_DAILY) return fe('presse.4', { p0: PRESSE_DAILY });
  return null;
}

let POOLS: Map<string, Map<RarityId, CatalogEntry[]>> | null = null;
function pools() {
  if (POOLS) return POOLS;
  POOLS = new Map();
  const add = (key: string, c: CatalogEntry) => {
    const m = POOLS!.get(key) ?? new Map<RarityId, CatalogEntry[]>();
    const r = c.rarity as RarityId;
    // (audit 12/11, A7-13) ajout en place, même ordre : la recopie du tableau à chaque carte coûtait O(n²) sur le catalogue
    const l = m.get(r);
    if (l) l.push(c);
    else m.set(r, [c]);
    POOLS!.set(key, m);
  };
  for (const t of THEMES) for (const c of t.cards) {
    add(t.id, c);
    add('*', c);
  }
  return POOLS;
}

/** Grave la bande : 6 cartes de l'album choisi (repli sur tout le catalogue si l'album n'a pas la rareté tirée). */
export function presseStrip(album: PackChoice, rand: () => number): Array<{ cardId: string; cardName: string; rarity: RarityId }> {
  const p = pools();
  const own = album.kind === 'theme' && album.themeId ? p.get(album.themeId) : undefined;
  const all = p.get('*')!;
  const out: Array<{ cardId: string; cardName: string; rarity: RarityId }> = [];
  for (let i = 0; i < PRESSE_STRIKES; i++) {
    const r = rollStar(SLOT_WEIGHTS, rand) as RarityId;
    const list = own?.get(r)?.length ? own.get(r)! : all.get(r)!;
    const c = list[Math.floor(rand() * list.length)];
    out.push({ cardId: c.id, cardName: c.name, rarity: r });
  }
  return out;
}
