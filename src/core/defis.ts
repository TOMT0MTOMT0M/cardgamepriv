/**
 * DÉFIS ENTRE AMIS (V2, 11/11 — sondage : « paris, objectifs à plusieurs ») — règles pures, partagées par le serveur
 * (convex/challenges.ts), le mode démo et l'interface.
 *
 *  - Un joueur lance un défi à 1 à 7 amis : un OBJECTIF mesuré par le serveur, une DURÉE, une mise facultative en pièces
 *    (la même pour tous, mise en séquestre à l'inscription).
 *  - Les invités ont DEFI_ACCEPT_MS pour accepter. Le défi démarre quand tout le monde a répondu, quand le créateur le
 *    lance, ou à la fin du délai (s'il y a au moins un invité partant). Personne : annulé, mise rendue.
 *  - Seuls comptent les boosters de la boutique SCELLÉS après le départ (le client connaît les cartes d'un booster
 *    scellé : on ne peut pas lancer un défi « 5★ » avec une 5★ déjà en poche).
 *  - À la fin : un seul meilleur score (> 0) → il remporte toutes les mises. Égalité en tête ou personne : tout est rendu.
 *  - « Premier à… » se tranche dès la carte tirée.
 * Les défis ne vendent aucune carte : ils redistribuent les pièces misées.
 */
import type { RarityId } from './rarity';
import { CARD_STARS } from './economy';

export type DefiKind = 'first' | 'new' | 'stars';

export interface DefiKindInfo {
  id: DefiKind;
  /** libellé court (onglet, liste) */
  label: string;
  /** phrase d'objectif */
  goal: (target?: RarityId) => string;
  /** unité du score */
  unit: (n: number) => string;
}

export const DEFI_TARGETS: RarityId[] = ['legendary', 'mythic'];
const targetLabel = (r?: RarityId) => (r === 'mythic' ? 'une 6★' : 'une 5★ ou mieux');

export const DEFI_KINDS: DefiKindInfo[] = [
  { id: 'first', label: 'Premier à', goal: (t) => `Le premier à tirer ${targetLabel(t)} gagne`, unit: (n) => (n ? 'tirée' : '—') },
  { id: 'new', label: 'Nouvelles cartes', goal: () => 'Le plus de nouvelles cartes pour sa collection', unit: (n) => `${n} nouvelle${n > 1 ? 's' : ''}` },
  { id: 'stars', label: 'Étoiles', goal: () => 'Le plus d’étoiles tirées en boosters', unit: (n) => `${n}★` },
];
export const defiKind = (k: DefiKind) => DEFI_KINDS.find((x) => x.id === k) ?? DEFI_KINDS[0];

export const HOUR = 3600_000;
export const DEFI_DURATIONS: Array<{ ms: number; label: string }> = [
  { ms: HOUR, label: '1 h' },
  { ms: 24 * HOUR, label: '24 h' },
  { ms: 72 * HOUR, label: '3 jours' },
];
/** délai pour accepter */
export const DEFI_ACCEPT_MS = 6 * HOUR;
export const DEFI_MAX_FRIENDS = 7;
export const DEFI_MAX_STAKE = 2000;
/** défis en attente ou en cours lancés par un même joueur */
export const DEFI_MAX_OPEN = 3;
export const DEFI_STAKES = [0, 50, 100, 250, 500, 1000];

export interface DefiDraft {
  kind: DefiKind;
  target?: RarityId;
  durationMs: number;
  stake: number;
  invited: string[];
}

/** Message d'erreur si le défi ne peut pas être lancé (null : il peut). */
export function defiProblem(d: DefiDraft, me: string): string | null {
  if (!DEFI_KINDS.some((k) => k.id === d.kind)) return 'Objectif inconnu.';
  if (d.kind === 'first' && !DEFI_TARGETS.includes(d.target as RarityId)) return 'Choisis la rareté à tirer (5★ ou 6★).';
  if (!DEFI_DURATIONS.some((x) => x.ms === d.durationMs)) return 'Durée inconnue.';
  if (!Number.isInteger(d.stake) || d.stake < 0 || d.stake > DEFI_MAX_STAKE) return `Mise de 0 à ${DEFI_MAX_STAKE} pièces.`;
  const ids = new Set(d.invited);
  if (ids.size !== d.invited.length) return 'Un ami est invité deux fois.';
  if (ids.has(me)) return 'Tu ne peux pas te défier toi-même.';
  if (!ids.size) return 'Invite au moins un ami.';
  if (ids.size > DEFI_MAX_FRIENDS) return `${DEFI_MAX_FRIENDS} amis au plus.`;
  return null;
}

/** Ce qu'un booster ouvert ajoute au score (et s'il remporte un « premier à »). */
export function defiGain(kind: DefiKind, target: RarityId | undefined, cards: Array<{ rarity: RarityId | string; isNew?: boolean }>): { add: number; hit: boolean } {
  if (kind === 'new') return { add: cards.filter((c) => c.isNew).length, hit: false };
  if (kind === 'stars') return { add: cards.reduce((a, c) => a + (CARD_STARS[c.rarity as RarityId] ?? 0), 0), hit: false };
  const need = CARD_STARS[target ?? 'legendary'];
  const hit = cards.some((c) => (CARD_STARS[c.rarity as RarityId] ?? 0) >= need);
  return { add: hit ? 1 : 0, hit };
}

/** Gagnant : un seul meilleur score strictement positif ; sinon null (égalité ou personne : tout est rendu). */
export function defiWinner(scores: number[]): number | null {
  const best = Math.max(0, ...scores);
  if (best <= 0) return null;
  const top = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  return top.length === 1 ? top[0] : null;
}
