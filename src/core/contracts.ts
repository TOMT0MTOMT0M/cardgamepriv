/**
 * CONTRATS (façon CS:GO) — logique pure partagée par le serveur Convex (convex/contracts.ts) et le mode démo.
 *
 * Règle (décision du groupe, 2 nov.) : on brûle des DOUBLONS d'une même étoile contre UNE carte de l'étoile au-dessus.
 *  - prix : 10 cartes pour chaque étoile, de 1★ à 5★ (retours Hugo 10/11 ; avant 10 / 20 / 50) — pas de contrat 6★ ;
 *  - uniquement des doublons : on ne brûle jamais son dernier exemplaire d'une carte (la collection ne recule pas) ;
 *  - comme dans CS:GO, la carte reçue vient des sous-thèmes des cartes brûlées, au prorata (7 Pokémon + 3 Valorant →
 *    70 % Pokémon, 30 % Valorant) ;
 *  - bonus collection : si le sous-thème tiré a encore des cartes de cette étoile que tu n'as pas, tu reçois forcément
 *    une NOUVELLE carte (les doublons servent à compléter la collection) ;
 *  - jamais de Bébou (elles restent réservées au Bebou Pack).
 */
import { fe } from './errors';
import { STAR_RARITIES, type StarRarityId } from './dropRates';
import { SUBTHEMES, catalogEntry, type CatalogEntry } from './sets/themes';

/** Nombre de cartes à brûler, selon leur étoile. */
export const CONTRACT_COST: Partial<Record<StarRarityId, number>> = {
  common: 10,
  uncommon: 10,
  rare: 10,
  epic: 10,
  legendary: 10,
};

export interface ContractItem {
  cardId: string;
  count: number;
}

/** Étoile reçue pour un contrat d'étoile `r` (null : pas de contrat possible). */
export function contractTarget(r: string): StarRarityId | null {
  const i = STAR_RARITIES.indexOf(r as StarRarityId);
  return i >= 0 && i < STAR_RARITIES.length - 1 && CONTRACT_COST[r as StarRarityId] ? STAR_RARITIES[i + 1] : null;
}

/** Message d'erreur si le contrat est invalide (null s'il est bon). `spare(cardId)` = doublons disponibles. */
export function contractProblem(rarity: string, items: ContractItem[], spare: (cardId: string) => number): string | null {
  const cost = CONTRACT_COST[rarity as StarRarityId];
  if (!cost || !contractTarget(rarity)) return fe('contracts.1');
  const seen = new Set<string>();
  let total = 0;
  for (const it of items) {
    if (!Number.isInteger(it.count) || it.count < 1) return fe('contracts.2');
    if (seen.has(it.cardId)) return fe('contracts.3');
    seen.add(it.cardId);
    const e = catalogEntry(it.cardId);
    if (!e || e.rarity !== rarity) return fe('contracts.4');
    if (spare(it.cardId) < it.count) return fe('contracts.5', { p0: e.name });
    total += it.count;
  }
  if (total !== cost) return fe('contracts.6', { p0: cost, p1: total });
  return null;
}

/** Chances par sous-thème (au prorata des cartes brûlées), seulement ceux qui ont des cartes de l'étoile visée. */
export function contractOdds(rarity: string, items: ContractItem[]): Array<{ subthemeId: string; label: string; p: number }> {
  const target = contractTarget(rarity);
  if (!target) return [];
  const w = new Map<string, number>();
  for (const it of items) {
    const e = catalogEntry(it.cardId);
    if (!e) continue;
    const st = SUBTHEMES.find((s) => s.id === e.subthemeId);
    if (!st?.cards.some((c) => c.rarity === target)) continue;
    w.set(e.subthemeId, (w.get(e.subthemeId) ?? 0) + it.count);
  }
  const sum = [...w.values()].reduce((a, b) => a + b, 0);
  return [...w.entries()].map(([id, n]) => ({ subthemeId: id, label: SUBTHEMES.find((s) => s.id === id)!.label, p: sum ? n / sum : 0 })).sort((a, b) => b.p - a.p);
}

/** Tire la carte reçue. `owned(cardId)` : le joueur la possède-t-il déjà (n'importe quelle rareté) ? */
export function rollContract(rarity: string, items: ContractItem[], owned: (cardId: string) => boolean, rand: () => number = Math.random): CatalogEntry {
  const target = contractTarget(rarity);
  const odds = contractOdds(rarity, items);
  if (!target || !odds.length) throw new Error('Contrat impossible.');
  let x = rand();
  let sub = odds[odds.length - 1].subthemeId;
  for (const o of odds) {
    if ((x -= o.p) < 0) {
      sub = o.subthemeId;
      break;
    }
  }
  const pool = SUBTHEMES.find((s) => s.id === sub)!.cards.filter((c) => c.rarity === target);
  const fresh = pool.filter((c) => !owned(c.id));
  const list = fresh.length ? fresh : pool;
  return list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
}

/** Remplit automatiquement un contrat avec les doublons les plus nombreux d'abord. */
export function autoFill(rarity: string, dups: Array<{ cardId: string; spare: number }>): ContractItem[] {
  let need = CONTRACT_COST[rarity as StarRarityId] ?? 0;
  const out: ContractItem[] = [];
  for (const d of [...dups].sort((a, b) => b.spare - a.spare)) {
    if (need <= 0) break;
    const n = Math.min(d.spare, need);
    if (n > 0) out.push({ cardId: d.cardId, count: n });
    need -= n;
  }
  return out;
}
