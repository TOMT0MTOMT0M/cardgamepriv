import type { RarityId } from '../core/rarity';
import type { DefiDraft, DefiKind } from '../core/defis';

/**
 * (V2, 11/11) Défis entre amis : la partie de l'interface économie (eco.ts) propre à ce chantier.
 * En ligne : ecoOnlineJeux.ts (convex/challenges.ts) · démo : ecoLocalJeux.ts.
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

export interface JeuxBackend {
  watchDefis(cb: (l: { me: string; list: DefiView[] } | null) => void): () => void;
  createDefi(d: DefiDraft): Promise<string>;
  respondDefi(id: string, accept: boolean): Promise<void>;
  startDefi(id: string): Promise<void>;
  cancelDefi(id: string): Promise<void>;
  /** démo seulement : termine le défi tout de suite (les robots marquent au hasard) */
  demoDefiEnd?(id: string): Promise<void>;
}
