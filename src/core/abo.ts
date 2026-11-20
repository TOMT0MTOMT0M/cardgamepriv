/**
 * ABONNEMENT (20/11) — 5 € par mois pour soutenir le jeu (hébergement, serveurs, développement). Logique pure, AUCUN
 * import lourd : partagée par le serveur (convex/abo.ts), le mode démo, la page #/abonnement et le dashboard admin.
 *
 * Décisions (07/11, 10/11, 20/11) : paiement par Wero entre particuliers, activation À LA MAIN par l'équipe (aucun
 * prestataire de paiement, aucun coût en plus) ; un mois à la fois, rappel 5 jours avant la fin.
 * Avantages : +5 boosters de réserve maximale (20 au lieu de 15), une carte « Bebou » personnalisée ajoutée au jeu à la
 * mise à jour suivante (l'abonné propose son idée / son visuel), et le vote du mois (prochaines collections / cartes).
 * Aucun avantage sur les tirages : mêmes taux pour tout le monde.
 */
import { PACK_CAP } from './packRegen';

export const SUB_PRICE_EUR = 5;
/** boosters de réserve en plus pour un abonné */
export const SUB_EXTRA_PACKS = 5;
/** durée d'un mois d'abonnement */
export const SUB_MONTH_MS = 30 * 86_400_000;
/** rappel avant la fin */
export const SUB_REMIND_MS = 5 * 86_400_000;
/** mois activables d'un coup par l'équipe */
export const SUB_MAX_MONTHS = 12;

export const subActive = (u: { subUntil?: number } | null | undefined, now = Date.now()) => (u?.subUntil ?? 0) > now;
/** Réserve maximale d'un joueur à `now` (15, ou 20 pour un abonné). */
export const packCapOf = (u: { subUntil?: number } | null | undefined, now = Date.now()) => PACK_CAP + (subActive(u, now) ? SUB_EXTRA_PACKS : 0);
/** Nouvelle fin après `months` mois de plus : à la suite de l'abonnement en cours, sinon à partir de maintenant. */
export const subExtend = (until: number | undefined, now: number, months = 1) => Math.max(until ?? 0, now) + months * SUB_MONTH_MS;
/** Jours restants (arrondis au-dessus ; 0 : terminé). */
export const subDaysLeft = (until: number | undefined, now = Date.now()) => Math.max(0, Math.ceil(((until ?? 0) - now) / 86_400_000));
/** Bientôt fini (≤ 5 jours) : l'interface le signale. */
export const subEndingSoon = (until: number | undefined, now = Date.now()) => subActive({ subUntil: until }, now) && (until ?? 0) - now <= SUB_REMIND_MS;

// ───────────────────────────── carte « Bebou » de l'abonné
export const BEBOU_CARD = { title: 28, idea: 400, mediaMax: 4 * 1024 * 1024, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] } as const;
export type BebouCardStatus = 'new' | 'ok' | 'done';
/** Problème d'une proposition (texte français, ou null). */
export function bebouCardProblem(title: string, idea: string): string | null {
  const t = title.trim();
  if (t.length < 2) return 'Donne un nom à ta carte (2 lettres au moins).'; // i18n-ok
  if (t.length > BEBOU_CARD.title) return `Nom trop long (${BEBOU_CARD.title} caractères au plus).`; // i18n-ok
  if (idea.trim().length > BEBOU_CARD.idea) return `Idée trop longue (${BEBOU_CARD.idea} caractères au plus).`; // i18n-ok
  return null;
}
export function bebouMediaProblem(size: number, type: string | undefined): string | null {
  if (!type || !(BEBOU_CARD.mediaTypes as readonly string[]).includes(type)) return 'Image PNG, JPG ou WebP seulement.'; // i18n-ok
  if (size > BEBOU_CARD.mediaMax) return 'Image trop lourde (4 Mo au plus).'; // i18n-ok
  return null;
}

// ───────────────────────────── vote du mois
export const POLL = { title: 90, option: 44, minOptions: 2, maxOptions: 6, maxDays: 45 } as const;
export interface PollOption {
  id: string;
  label: string;
}
export function pollProblem(title: string, options: string[], closesAt: number, now: number): string | null {
  if (title.trim().length < 4) return 'Écris la question du vote.'; // i18n-ok
  if (title.trim().length > POLL.title) return `Question trop longue (${POLL.title} caractères au plus).`; // i18n-ok
  const opts = options.map((o) => o.trim()).filter(Boolean);
  if (opts.length < POLL.minOptions) return 'Il faut au moins 2 choix.'; // i18n-ok
  if (opts.length > POLL.maxOptions) return `${POLL.maxOptions} choix au plus.`; // i18n-ok
  if (opts.some((o) => o.length > POLL.option)) return `Un choix est trop long (${POLL.option} caractères au plus).`; // i18n-ok
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return 'Deux choix sont identiques.'; // i18n-ok
  if (!Number.isFinite(closesAt) || closesAt <= now) return 'La fin du vote doit être dans le futur.'; // i18n-ok
  if (closesAt - now > POLL.maxDays * 86_400_000) return `${POLL.maxDays} jours au plus.`; // i18n-ok
  return null;
}
export const pollOpen = (p: { closesAt: number; closed?: boolean }, now = Date.now()) => !p.closed && now < p.closesAt;
