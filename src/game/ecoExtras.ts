import type { AdventReward } from '../core/avent';
import type { BebouCardStatus, PollOption } from '../core/abo';
import type { UniqueTitleHolder } from '../core/uniqueTitles';

/**
 * (20/11) Titres uniques + calendrier de l'Avent + abonnement : la partie de l'interface économie (eco.ts) propre à ces
 * chantiers. En ligne : ecoOnlineExtras.ts (convex/titres.ts, convex/avent.ts, convex/abo.ts) · démo : ecoLocalExtras.ts.
 * Les cases ouvertes de l'Avent et l'état d'abonnement arrivent avec l'économie (`EcoSnapshot.advent`, `.sub`) : pas
 * d'abonnement temps réel en plus ; la page Abonnement lit `aboPage` à la demande.
 */
export interface AdventOpenResult {
  day: number;
  reward: AdventReward;
  opened: number[];
}

export interface AboPoll {
  id: string;
  title: string;
  options: PollOption[];
  closesAt: number;
  open: boolean;
  total: number;
  /** mon choix */
  mine?: string;
  /** voix par choix : seulement après avoir voté, ou une fois le vote terminé */
  counts?: Record<string, number>;
}
export interface AboPage {
  priceEur: number;
  extraPacks: number;
  /** à qui envoyer le paiement Wero (saisi par l'équipe) ; absent : pas encore renseigné, ou joueur non connecté */
  weroTo?: string;
  card: { title: string; idea: string; status: BebouCardStatus; mediaUrl?: string; updatedAt: number } | null;
  poll: AboPoll | null;
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
  /** page Abonnement : prix, destinataire Wero, ma carte Bebou, le vote du mois */
  aboPage(): Promise<AboPage>;
  /** « j'ai payé » : prévient l'équipe, qui active le mois */
  aboAsk(): Promise<void>;
  /** ma carte Bebou ; `image` : un fichier à envoyer, `'keep'` garde celle déjà envoyée, `null` la retire */
  aboSubmitCard(title: string, idea: string, image: Blob | 'keep' | null): Promise<void>;
  aboVote(pollId: string, optionId: string): Promise<AboPoll>;
  /** démo seulement : active / arrête l'abonnement tout de suite (pour voir la page des deux côtés) */
  aboDemoToggle?(): Promise<void>;
}
