/**
 * ESPACE JEUX (V1) — règles pures partagées par le serveur Convex (convex/games.ts), le mode démo et l'interface.
 *
 *  1. 1v1 PACK BATTLE : chacun mise N boosters (+ un side pot facultatif en pièces et/ou cartes, de valeur égale à ±5 %).
 *     Les deux valident → verrouillage ferme, ouverture simultanée. Plus haut total d'étoiles → remporte TOUT (toutes les
 *     cartes tirées par les deux + les side pots). Égalité parfaite → PUSH : chacun récupère ses cartes et sa mise.
 *  2. PACK BATTLE ROYALE : 3 à 8 joueurs, 1 booster chacun. Le plus haut total remporte toutes les cartes ; ex æquo en
 *     tête → les cartes sont distribuées au hasard entre eux.
 *  3. ROULETTE À CARTES : roue de 100 numéros ; 1 numéro = 100 pièces de valeur (pièces et/ou cartes), 3 numéros minimum.
 *     1 tirage par jour : le joueur dont le numéro sort remporte tout le pot ; sinon tout reste pour le tirage suivant.
 *     Le site ajoute chaque jour une carte 5★ ou 6★ au pot.
 *
 * Les jeux ne font que REDISTRIBUER (aucun puits de pièces en V1) et ne vendent jamais de cartes contre des pièces.
 */
import type { RarityId } from './rarity';
import { THEMES, catalogEntry, themeOpen, BEBOU_PACK, type CatalogEntry } from './sets/themes';
import { cardsValue, starsOf, stakeValue, type StakeItem } from './economy';
import { missionDay } from './missions';

/** Un booster misé : le bébou pack ou celui d'un thème ouvert. */
export interface PackChoice {
  kind: 'bebou' | 'theme';
  themeId?: string;
}

export const packChoiceLabel = (p: PackChoice) => (p.kind === 'bebou' ? BEBOU_PACK.label : `${THEMES.find((t) => t.id === p.themeId)?.label ?? '?'} Pack`);
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
  if (!a.packs.length || a.packs.length > DUEL_MAX_PACKS) return `Mise de 1 à ${DUEL_MAX_PACKS} boosters.`;
  if (!a.packs.every(validPackChoice)) return 'Booster inconnu.';
  if (!b) return 'En attente d’un adversaire.';
  if (b.packs.length !== a.packs.length) return `Il faut miser le même nombre de boosters (${a.packs.length}).`;
  if (!b.packs.every(validPackChoice)) return 'Booster inconnu.';
  if (!potsBalanced(a.stake, b.stake)) {
    return `Les side pots doivent avoir la même valeur à ±5 % (${stakeValue(a.stake)} contre ${stakeValue(b.stake)}).`;
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

export const ROULETTE_NUMBERS = 100;
/** 1 numéro = 100 pièces de valeur */
export const NUMBER_COST = 100;
export const MIN_NUMBERS = 3;
/** heure du tirage quotidien (heure de Paris) */
export const ROULETTE_HOUR = 21;

/** Problème d'un pari (null : valable). `taken` = numéros déjà pris par les autres joueurs de ce tirage. */
export function betProblem(numbers: number[], stake: Stake, taken: Set<number>, mine: number): string | null {
  if (numbers.length + mine < MIN_NUMBERS) return `Participation minimale : ${MIN_NUMBERS} numéros (${MIN_NUMBERS * NUMBER_COST} pièces de valeur).`;
  if (!numbers.length) return 'Choisis au moins un numéro.';
  const seen = new Set<number>();
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > ROULETTE_NUMBERS) return 'Numéro invalide (1 à 100).';
    if (seen.has(n)) return 'Même numéro deux fois.';
    if (taken.has(n)) return `Le numéro ${n} est déjà pris.`;
    seen.add(n);
  }
  if (stake.coins < 0 || !Number.isInteger(stake.coins)) return 'Montant invalide.';
  const need = numbers.length * NUMBER_COST;
  const v = stakeValue(stake);
  if (v < need) return `Il faut ${need} pièces de valeur pour ${numbers.length} numéro${numbers.length > 1 ? 's' : ''} (tu en mets ${v}).`;
  return null;
}

/** Pièces à ajouter aux cartes pour couvrir `n` numéros. */
export const coinsNeeded = (n: number, cards: StakeItem[]) => Math.max(0, n * NUMBER_COST - cardsValue(cards));

/** Jour de tirage (heure de Paris) auquel appartient un instant : après 21 h, c'est le tirage du lendemain. */
export function rouletteDrawDay(now: number): string {
  const h = parisHour(now);
  return h >= ROULETTE_HOUR ? missionDay(now + 4 * 3600_000) : missionDay(now);
}

/** Heure (0..23) à Paris. */
export function parisHour(now: number): number {
  try {
    // (« 01 h » en français : on lit la partie « heure » seule)
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).find((p) => p.type === 'hour')?.value;
    const n = Number(h);
    if (Number.isFinite(n)) return n % 24;
    throw new Error('heure introuvable');
  } catch {
    return (new Date(now).getUTCHours() + 1) % 24;
  }
}

/** Prochain tirage (instant), recherché à la minute près. */
export function nextRouletteDraw(now: number): number {
  let t = Math.ceil(now / 60_000) * 60_000;
  for (let i = 0; i < 26 * 60; i++, t += 60_000) if (parisHour(t) === ROULETTE_HOUR && parisHour(t - 60_000) !== ROULETTE_HOUR) return t;
  return now + 24 * 3600_000;
}

/** Numéro gagnant (1..100). */
export const drawNumber = (rand: () => number) => 1 + Math.floor(rand() * ROULETTE_NUMBERS);

let HOUSE_POOL: CatalogEntry[] | null = null;
/** Carte offerte par le site chaque jour : une 5★ ou 6★ au hasard parmi tout le catalogue (hors Bébous). */
export function houseCard(rand: () => number): CatalogEntry {
  HOUSE_POOL ??= THEMES.flatMap((t) => t.cards).filter((c) => c.rarity === 'legendary' || c.rarity === 'mythic');
  return HOUSE_POOL[Math.floor(rand() * HOUSE_POOL.length)];
}

/** Probabilité que le pot tombe ce soir (numéros couverts / 100). */
export const potOdds = (covered: number) => covered / ROULETTE_NUMBERS;

/** Nom d'une carte du catalogue (repli : son id). */
export const cardName = (id: string) => catalogEntry(id)?.name ?? id;

/**
 * Espace Jeux ouvert à tous ? (retours live n°1 : l'onglet GAMES reste une page « bientôt » pour l'instant ; seuls les
 * admins — et la démo hors-ligne — y ont déjà accès). Passer à true le jour de l'ouverture.
 */
export const GAMES_OPEN = false;
