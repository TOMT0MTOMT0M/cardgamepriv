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
import { fe } from './errors';
import { lang, t } from './i18n';
import type { RarityId } from './rarity';
import { CARD_STARS } from './economy';
import { msgRef, str } from './msgRefs';

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
const targetLabel = (r?: RarityId) => (r === 'mythic' ? t('dk.t6') : t('dk.t5'));

// (version anglaise) libellés lus à l'affichage (getters) : la langue peut changer après le chargement
export const DEFI_KINDS: DefiKindInfo[] = [
  { id: 'first', get label() { return t('dk.first'); }, goal: (tg) => t('dk.firstGoal', { what: targetLabel(tg) }), unit: (n) => (n ? t('dk.pulled') : '—') },
  { id: 'new', get label() { return t('dk.new'); }, goal: () => t('dk.newGoal'), unit: (n) => t('dk.newUnit', { n }) },
  { id: 'stars', get label() { return t('dk.stars'); }, goal: () => t('dk.starsGoal'), unit: (n) => `${n}★` },
];
export const defiKind = (k: DefiKind) => DEFI_KINDS.find((x) => x.id === k) ?? DEFI_KINDS[0];

export const HOUR = 3600_000;
export const DEFI_DURATIONS: Array<{ ms: number; label: string }> = [
  { ms: HOUR, label: '1 h' },
  { ms: 24 * HOUR, label: '24 h' },
  { ms: 72 * HOUR, get label() { return t('dk.3days'); } },
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
  if (!DEFI_KINDS.some((k) => k.id === d.kind)) return fe('defis.8');
  if (d.kind === 'first' && !DEFI_TARGETS.includes(d.target as RarityId)) return fe('defis.1');
  if (!DEFI_DURATIONS.some((x) => x.ms === d.durationMs)) return fe('defis.2');
  if (!Number.isInteger(d.stake) || d.stake < 0 || d.stake > DEFI_MAX_STAKE) return fe('defis.3', { p0: DEFI_MAX_STAKE });
  const ids = new Set(d.invited);
  if (ids.size !== d.invited.length) return fe('defis.4');
  if (ids.has(me)) return fe('defis.5');
  if (!ids.size) return fe('defis.6');
  if (ids.size > DEFI_MAX_FRIENDS) return fe('defis.7', { p0: DEFI_MAX_FRIENDS });
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

// (version anglaise, lot 4) but d'un défi des messages stockés, relu dans la langue active
const goalRef = (p: Record<string, unknown>) => { const k = str(p.defiKind); return k ? defiKind(k as DefiKind).goal((str(p.defiTarget) as RarityId | undefined)) : undefined; };
msgRef('goal', goalRef);
msgRef('goalLc', (p) => goalRef(p)?.toLocaleLowerCase(lang() === 'fr' ? 'fr-FR' : 'en-GB'));
