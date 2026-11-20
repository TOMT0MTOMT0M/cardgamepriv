import type { AdventReward } from '../core/avent';
import type { UniqueTitleHolder } from '../core/uniqueTitles';

/**
 * (20/11) Titres uniques + calendrier de l'Avent : la partie de l'interface économie (eco.ts) propre à ces chantiers.
 * En ligne : ecoOnlineExtras.ts (convex/titres.ts, convex/avent.ts) · démo : ecoLocalExtras.ts.
 * Les cases ouvertes de l'Avent arrivent avec l'économie (`EcoSnapshot.advent`) : pas d'abonnement en plus.
 */
export interface AdventOpenResult {
  day: number;
  reward: AdventReward;
  opened: number[];
}

export interface ExtrasBackend {
  /** les titres uniques déjà remportés (tout le club) */
  watchTitles(cb: (list: UniqueTitleHolder[]) => void): () => void;
  /** réclame un titre (ou tous ceux que je peux avoir) ; renvoie les ids remportés */
  claimTitles(titleId?: string): Promise<string[]>;
  /** ouvre une case du calendrier ; `debugDay` (équipe / démo) simule le jour de décembre */
  openAdvent(day: number, debugDay?: number): Promise<AdventOpenResult>;
  /** mode test (équipe / démo) : referme toutes mes cases */
  resetAdvent(): Promise<void>;
}
