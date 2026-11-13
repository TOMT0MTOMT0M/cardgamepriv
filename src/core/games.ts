/**
 * ESPACE JEUX (V1) — règles pures partagées par le serveur Convex (convex/games.ts), le mode démo et l'interface.
 *
 *  1. 1v1 PACK BATTLE : chacun mise N boosters (+ un side pot facultatif en pièces et/ou cartes, de valeur égale à ±5 %).
 *     Les deux valident → verrouillage ferme, ouverture simultanée. Plus haut total d'étoiles → remporte TOUT (toutes les
 *     cartes tirées par les deux + les side pots). Égalité parfaite → PUSH : chacun récupère ses cartes et sa mise.
 *  2. PACK BATTLE ROYALE : 3 à 8 joueurs, le même nombre de boosters chacun (1 à ROYALE_MAX_PACKS, fixé à la création). Le plus haut total remporte toutes les cartes ; ex æquo en
 *     tête → les cartes sont distribuées au hasard entre eux.
 *  3. ROULETTE À CARTES : 36 numéros, 1 à 3 numéros par tirage, mises en pièces ou en cartes 4★-6★ (grille fixe),
 *     tirages à 10 h et 20 h (retours live 02).
 *     1 tirage par jour : le joueur dont le numéro sort remporte tout le pot ; sinon tout reste pour le tirage suivant.
 *     Le site ajoute chaque jour une carte 5★ ou 6★ au pot.
 *
 * Les jeux ne font que REDISTRIBUER (aucun puits de pièces en V1) et ne vendent jamais de cartes contre des pièces.
 */
import { tData } from './i18n';
import { fe } from './errors';
import type { RarityId } from './rarity';
import { THEMES, catalogEntry, themeOpen, BEBOU_PACK, type CatalogEntry } from './sets/themes';
import { starsOf, stakeValue, type StakeItem } from './economy';
import { missionDay } from './missions';

/** Un booster misé : le bébou pack ou celui d'un thème ouvert. */
export interface PackChoice {
  kind: 'bebou' | 'theme';
  themeId?: string;
}

export const packChoiceLabel = (p: PackChoice) => (p.kind === 'bebou' ? BEBOU_PACK.label : `${THEMES.find((t) => t.id === p.themeId)?.label ?? '?'} Pack`); // i18n-ok
export const validPackChoice = (p: PackChoice) => p.kind === 'bebou' || (p.kind === 'theme' && THEMES.some((t) => t.id === p.themeId && themeOpen(t)));
/** Les boosters qu'on peut miser (ordre d'affichage). */
export const packChoices = (): PackChoice[] => [{ kind: 'bebou' }, ...THEMES.filter(themeOpen).map((t): PackChoice => ({ kind: 'theme', themeId: t.id }))];

/** Une carte tirée dans un jeu (même forme qu'un booster normal). */
export interface GameCard {
  cardId: string;
  cardName: string;
  rarity: RarityId;
  mintNumber: number;
  foilSeed: number;
}

/** Side pot : pièces et/ou cartes. */
export interface Stake {
  coins: number;
  cards: StakeItem[];
}
export const emptyStake = (): Stake => ({ coins: 0, cards: [] });

// ───────────────────────────────────────────── 1v1 Pack Battle

export const DUEL_MAX_PACKS = 10;
/** tolérance d'équivalence des side pots */
export const POT_TOLERANCE = 0.05;

/** Les deux side pots ont-ils la même valeur à ±5 % ? (deux pots vides : oui) */
export function potsBalanced(a: Stake, b: Stake): boolean {
  const va = stakeValue(a);
  const vb = stakeValue(b);
  if (va === 0 && vb === 0) return true;
  return Math.abs(va - vb) <= POT_TOLERANCE * Math.max(va, vb);
}

/** Message d'erreur si un duel ne peut pas se lancer (null : il peut). */
export function duelProblem(a: { packs: PackChoice[]; stake: Stake }, b: { packs: PackChoice[]; stake: Stake } | null): string | null {
  if (!a.packs.length || a.packs.length > DUEL_MAX_PACKS) return fe('games.30', { p0: DUEL_MAX_PACKS });
  if (!a.packs.every(validPackChoice)) return fe('games.45');
  if (!b) return fe('games.31');
  if (b.packs.length !== a.packs.length) return fe('games.32', { p0: a.packs.length });
  if (!b.packs.every(validPackChoice)) return fe('games.46');
  if (!potsBalanced(a.stake, b.stake)) {
    return fe('games.33', { p0: stakeValue(a.stake), p1: stakeValue(b.stake) });
  }
  return null;
}

/** Résultat d'un duel : index du gagnant (0 / 1), ou null = PUSH (égalité parfaite). */
export function duelWinner(packs: GameCard[][][]): { stars: number[]; winner: 0 | 1 | null } {
  const stars = packs.map((side) => starsOf(side.flat()));
  return { stars, winner: stars[0] === stars[1] ? null : stars[0] > stars[1] ? 0 : 1 };
}

// ───────────────────────────────────────────── Pack Battle Royale

export const ROYALE_MIN = 3;
export const ROYALE_MAX = 8;
/**
 * (08/11) Battle Royale multi-boosters : le créateur fixe le nombre de boosters (identique pour TOUS) ; chacun ouvre les
 * siens, le total d'étoiles de toutes ses cartes départage. 5 au plus (8 joueurs × 5 = 40 boosters ouverts d'un coup).
 * Parties créées avant : `packCount` absent = 1.
 */
export const ROYALE_MAX_PACKS = 5;
export const royalePackCount = (r: { packCount?: number }) => Math.max(1, Math.min(ROYALE_MAX_PACKS, Math.floor(r.packCount ?? 1)));

/**
 * Résultat d'une Battle Royale : totaux, gagnant(s), et à qui revient chaque carte.
 * Ex æquo en tête : les cartes du pot sont distribuées au hasard entre eux (cas quasi impossible, mais tranché).
 */
export function royaleResult(packs: GameCard[][], rand: () => number): { stars: number[]; winners: number[]; awarded: GameCard[][] } {
  const stars = packs.map((p) => starsOf(p));
  const best = Math.max(...stars);
  const winners = stars.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  const awarded: GameCard[][] = packs.map(() => []);
  const pot = packs.flat();
  if (winners.length === 1) awarded[winners[0]] = pot;
  else {
    // mélange, puis tour de table : chaque ex æquo reçoit le même nombre de cartes (±1), au hasard
    const order = pot.map((c) => ({ c, k: rand() })).sort((x, y) => x.k - y.k).map((x) => x.c);
    const seats = winners.map((w) => ({ w, k: rand() })).sort((x, y) => x.k - y.k).map((x) => x.w);
    order.forEach((c, i) => awarded[seats[i % seats.length]].push(c));
  }
  return { stars, winners, awarded };
}

// ───────────────────────────────────────────── Roulette à cartes
/*
 * Retours live 02 (§7) — REPARAMÉTRAGE COMPLET (remplace la roue de 100 numéros) :
 *  - 36 numéros (1 à 36), on ne parie que sur des numéros ;
 *  - chaque joueur mise 1, 2 ou 3 numéros par tirage (une mise par tirage, 3 numéros au plus) ;
 *  - mises : cartes 4★ / 5★ / 6★ OU pièces, UNIQUEMENT (1★ à 3★ : refusées), selon la grille :
 *      1 numéro  = 10 cartes 4★ · ou 300 pièces
 *      2 numéros = 1 carte 5★   · ou 600 pièces
 *      3 numéros = 2 cartes 5★  · ou 1 carte 6★ · ou 900 pièces
 *  - 2 tirages par jour, 10 h et 20 h (heure de Paris) ;
 *  - pot commun (mises + report) conservé tant que personne ne gagne ; le site ajoute 1 carte 5★/6★ à CHAQUE tirage ;
 *  - le numéro exact sorti remporte tout le pot.
 */
export const ROULETTE_NUMBERS = 36;
/** numéros au plus par joueur et par tirage */
export const MAX_NUMBERS = 3;
/** heures des tirages (heure de Paris) */
export const ROULETTE_HOURS = [10, 20] as const;

export type RoulettePrice = { kind: 'coins'; coins: number } | { kind: 'cards'; rarity: RarityId; count: number };
/** Grille tarifaire : 1, 2 ou 3 numéros → les façons de payer (une seule par mise). */
export const ROULETTE_PRICES: Record<1 | 2 | 3, RoulettePrice[]> = {
  1: [{ kind: 'cards', rarity: 'epic', count: 10 }, { kind: 'coins', coins: 300 }],
  2: [{ kind: 'cards', rarity: 'legendary', count: 1 }, { kind: 'coins', coins: 600 }],
  3: [{ kind: 'cards', rarity: 'legendary', count: 2 }, { kind: 'cards', rarity: 'mythic', count: 1 }, { kind: 'coins', coins: 900 }],
};
/** raretés acceptées en mise */
export const ROULETTE_CARD_RARITIES: RarityId[] = ['epic', 'legendary', 'mythic'];
const STARS_TXT: Record<string, string> = { epic: '4★', legendary: '5★', mythic: '6★' };
export const priceLabel = (p: RoulettePrice) => (p.kind === 'coins' ? tData('rou.coins', '{n} pièces').replace('{n}', String(p.coins)) : tData(p.count > 1 ? 'rou.cards' : 'rou.card', p.count > 1 ? '{n} cartes {s}' : '{n} carte {s}').replace('{n}', String(p.count)).replace('{s}', STARS_TXT[p.rarity])); // i18n-ok

/** La façon de payer qui correspond exactement à une mise (null : la mise ne colle à aucune ligne de la grille). */
export function matchPrice(n: number, stake: Stake): RoulettePrice | null {
  const opts = ROULETTE_PRICES[n as 1 | 2 | 3];
  if (!opts) return null;
  const cardsN = stake.cards.reduce((a, c) => a + c.count, 0);
  for (const p of opts) {
    if (p.kind === 'coins' && stake.coins === p.coins && cardsN === 0) return p;
    if (p.kind === 'cards' && stake.coins === 0 && cardsN === p.count && stake.cards.every((c) => c.rarity === p.rarity)) return p;
  }
  return null;
}

/** Problème d'un pari (null : valable). `taken` = numéros déjà pris par les autres joueurs ; `already` : j'ai déjà misé. */
export function betProblem(numbers: number[], stake: Stake, taken: Set<number>, already: number): string | null {
  if (already) return fe('games.34');
  if (!numbers.length) return fe('games.35');
  if (numbers.length > MAX_NUMBERS) return fe('games.36', { p0: MAX_NUMBERS });
  const seen = new Set<number>();
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > ROULETTE_NUMBERS) return fe('games.37', { p0: ROULETTE_NUMBERS });
    if (seen.has(n)) return fe('games.38');
    if (taken.has(n)) return fe('games.39', { p0: n });
    seen.add(n);
  }
  if (stake.coins < 0 || !Number.isInteger(stake.coins)) return fe('games.48');
  if (stake.cards.some((c) => !ROULETTE_CARD_RARITIES.includes(c.rarity as RarityId))) return fe('games.40');
  if (!matchPrice(numbers.length, stake)) {
    const opts = ROULETTE_PRICES[numbers.length as 1 | 2 | 3].map(priceLabel).join(' ou ');
    return fe('games.49', { p0: numbers.length, p1: numbers.length > 1 ? 's' : '', p2: opts });
  }
  return null;
}

/** Formateur de l'heure de Paris, créé une seule fois (perf : `nextRouletteDraw` l'appelle minute par minute). */
let hourFmt: Intl.DateTimeFormat | undefined;

/** Heure (0..23) à Paris. */
export function parisHour(now: number): number {
  try {
    // (« 01 h » en français : on lit la partie « heure » seule)
    hourFmt ??= new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' });
    const h = hourFmt.formatToParts(now).find((p) => p.type === 'hour')?.value;
    const n = Number(h);
    if (Number.isFinite(n)) return n % 24;
    throw new Error('heure introuvable');
  } catch {
    return (new Date(now).getUTCHours() + 1) % 24;
  }
}

/** Prochain tirage (instant, 10 h ou 20 h à Paris), recherché à la minute près. */
export function nextRouletteDraw(now: number): number {
  let t = Math.ceil((now + 1) / 60_000) * 60_000;
  for (let i = 0; i < 26 * 60; i++, t += 60_000) {
    const h = parisHour(t);
    if ((ROULETTE_HOURS as readonly number[]).includes(h) && parisHour(t - 60_000) !== h) return t;
  }
  return now + 12 * 3600_000;
}

/** Étiquette d'un tirage : « 2026-11-04 · 10 h ». */
export function rouletteSlot(drawAt: number): string {
  return `${missionDay(drawAt)} · ${parisHour(drawAt)} h`;
}

/** Numéro gagnant (1..36). */
export const drawNumber = (rand: () => number) => 1 + Math.floor(rand() * ROULETTE_NUMBERS);

let HOUSE_POOL: CatalogEntry[] | null = null;
/** Carte offerte par le site chaque jour : une 5★ ou 6★ au hasard parmi tout le catalogue (hors Bébous). */
export function houseCard(rand: () => number): CatalogEntry {
  HOUSE_POOL ??= THEMES.flatMap((t) => t.cards).filter((c) => c.rarity === 'legendary' || c.rarity === 'mythic');
  return HOUSE_POOL[Math.floor(rand() * HOUSE_POOL.length)];
}

/** Probabilité que le pot tombe au prochain tirage (numéros couverts / 36). */
export const potOdds = (covered: number) => covered / ROULETTE_NUMBERS;

/** Nom d'une carte du catalogue (repli : son id). */
export const cardName = (id: string) => catalogEntry(id)?.name ?? id;

/**
 * Espace Jeux ouvert à tous ? (retours live n°1 : l'onglet GAMES reste une page « bientôt » pour l'instant ; seuls les
 * admins — et la démo hors-ligne — y ont déjà accès). Passer à true le jour de l'ouverture.
 */
export const GAMES_OPEN = true;
