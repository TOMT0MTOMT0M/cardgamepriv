import type { RarityId } from '../core/rarity';
import type { DefiDraft, DefiKind } from '../core/defis';
import type { PackChoice } from '../core/games';

/**
 * (V2, 11/11) Défis entre amis + La Presse : la partie de l'interface économie (eco.ts) propre à ce chantier.
 * En ligne : ecoOnlineJeux.ts (convex/challenges.ts, convex/presse.ts) · démo : ecoLocalJeux.ts.
 */

export interface DefiPlayerView {
  userId: string;
  name: string;
  avatarUrl?: string;
  state: 'invited' | 'in' | 'out';
  score: number;
  at?: number;
}

export interface DefiView {
  id: string;
  creatorId: string;
  kind: DefiKind;
  target?: RarityId;
  durationMs: number;
  stake: number;
  status: 'pending' | 'live' | 'done' | 'cancelled';
  players: DefiPlayerView[];
  createdAt: number;
  acceptBy: number;
  startedAt?: number;
  endsAt?: number;
  resolvedAt?: number;
  winnerId?: string;
  outcome?: 'win' | 'tie' | 'nobody' | 'alone';
}

export interface PresseCard {
  cardId: string;
  cardName: string;
  rarity: RarityId;
}

export interface PresseRunView {
  id: string;
  bet: number;
  album: PackChoice;
  cards: PresseCard[];
  shown: number;
  status: 'live' | 'cashed' | 'cracked';
  /** valeur de la pièce (avant la fêlure si elle s'est fendue) */
  value: number;
  payout?: number;
  createdAt: number;
}

export interface PresseState {
  run: PresseRunView | null;
  /** parties lancées aujourd'hui */
  today: number;
  past: Array<{ id: string; bet: number; shown: number; status: 'cashed' | 'cracked' | 'live'; payout: number; createdAt: number }>;
}

export interface JeuxBackend {
  watchDefis(cb: (l: { me: string; list: DefiView[] } | null) => void): () => void;
  createDefi(d: DefiDraft): Promise<string>;
  respondDefi(id: string, accept: boolean): Promise<void>;
  startDefi(id: string): Promise<void>;
  cancelDefi(id: string): Promise<void>;
  watchPresse(cb: (s: PresseState | null) => void): () => void;
  presseStart(bet: number, album: PackChoice): Promise<PresseRunView>;
  presseStrike(id: string): Promise<PresseRunView>;
  presseCash(id: string): Promise<PresseRunView>;
  /** démo seulement : termine le défi tout de suite (les robots marquent au hasard) */
  demoDefiEnd?(id: string): Promise<void>;
}
