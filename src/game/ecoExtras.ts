import type { AdventReward } from '../core/avent';

/**
 * (v2.1.13) Calendrier de l'Avent : la partie de l'interface économie (eco.ts) propre à ce chantier.
 * En ligne : ecoOnlineExtras.ts (convex/avent.ts) · démo : ecoLocalExtras.ts.
 * Les cases ouvertes arrivent avec l'économie (`EcoSnapshot.advent`) : pas d'abonnement en plus.
 */
export interface AdventOpenResult {
  day: number;
  reward: AdventReward;
  opened: number[];
}

export interface ExtrasBackend {
  /** ouvre une case du calendrier ; `debugDay` (équipe / démo) simule le jour de décembre */
  openAdvent(day: number, debugDay?: number): Promise<AdventOpenResult>;
  /** mode test (équipe / démo) : referme toutes mes cases */
  resetAdvent(): Promise<void>;
}
