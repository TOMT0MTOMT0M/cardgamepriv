/**
 * SAISONS MENSUELLES DU CLASSEMENT (11/11, sondage : 3 voix) — données pures, partagées serveur (convex/seasons.ts),
 * client (src/game/views/leaderboard.ts) et démo.
 *
 * Une saison = un mois, heure de Paris (clé « 2026-11 »). Score de la saison : les CARTES DIFFÉRENTES gagnées depuis
 * son début (départage : boosters ouverts pendant la saison, puis le pseudo). Le classement roi (complétion totale)
 * ne bouge pas : la saison donne à tout le monde une course à recommencer chaque mois.
 *
 * Fin du mois : le classement est figé, les récompenses tombent (SEASON_PACKS), le podium rejoint l'historique.
 * Cosmétiques : finir dans les 3 premiers → succès « Sur le podium » (cadre « Podium de saison ») ; premier → succès
 * « Champion de saison » (titre) — src/core/economy.ts et src/core/cosmetics.ts.
 */
import { lang, locale } from './i18n';

/** boosters donnés selon le rang final : 1er, 2e, 3e ; puis 4e – 10e ; puis tout joueur qui a gagné au moins une carte */
export const SEASON_PACKS = [10, 6, 4] as const;
export const SEASON_TOP10_PACKS = 2;
export const SEASON_PLAYED_PACKS = 1;

/** boosters d'un rang final (1 = premier ; 0 = pas classé, aucune carte gagnée) */
export function seasonBoosters(rank: number): number {
  if (rank < 1) return 0;
  if (rank <= SEASON_PACKS.length) return SEASON_PACKS[rank - 1];
  if (rank <= 10) return SEASON_TOP10_PACKS;
  return SEASON_PLAYED_PACKS;
}

let monthFmt: Intl.DateTimeFormat | undefined;
/** Saison (mois de Paris) d'un instant : « 2026-11 ». */
export function seasonKey(now: number): string {
  try {
    monthFmt ??= new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' });
    const parts = monthFmt.formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    if (y && m) return `${y}-${m}`;
  } catch {
    /* pas de fuseaux : repli ci-dessous */
  }
  return new Date(now + 3600_000).toISOString().slice(0, 7);
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']; // i18n-ok (anglais : Intl)
/** « novembre 2026 » */
export function seasonLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  // (version anglaise) « November 2026 »
  if (lang() !== 'fr' && m >= 1 && m <= 12) return new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
  return MONTHS[(m || 1) - 1] ? `${MONTHS[m - 1]} ${y}` : key;
}
/** « de novembre » / « d’octobre » (élision devant une voyelle) */
export function seasonOf(key: string): string {
  if (lang() !== 'fr') return seasonLabel(key);
  const l = seasonLabel(key).split(' ')[0];
  return /^[aeiouyéè]/i.test(l) ? `d’${l}` : `de ${l}`;
}

/** Fin de la saison en cours (changement de mois à Paris, à la minute près : pour le compte à rebours). */
export function seasonEndAt(now: number): number {
  const key = seasonKey(now);
  let lo = now;
  let hi = now + 32 * 86400_000;
  while (hi - lo > 30_000) {
    const mid = (lo + hi) / 2;
    if (seasonKey(mid) === key) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** point de départ d'un joueur dans la saison */
export interface SeasonBase {
  userId: string;
  uniques: number;
  packs: number;
}
export interface SeasonPlayer {
  userId: string;
  name: string;
  avatarUrl?: string;
  /** cartes différentes et boosters ouverts, maintenant */
  uniques: number;
  packsOpened: number;
}
export interface SeasonStanding {
  userId: string;
  name: string;
  avatarUrl?: string;
  /** cartes différentes gagnées pendant la saison */
  gained: number;
  /** boosters ouverts pendant la saison */
  packs: number;
  /** 1 = premier ; 0 = pas classé (aucune carte gagnée) */
  rank: number;
}

/**
 * Classement de la saison : seuls les joueurs qui ont un point de départ (arrivés en cours de saison : ajoutés par le
 * cron horaire). Les cartes perdues (échanges, forge) ne font pas descendre sous zéro.
 */
export function seasonStandings(players: SeasonPlayer[], bases: SeasonBase[]): SeasonStanding[] {
  const at = new Map(bases.map((b) => [b.userId, b]));
  const out: SeasonStanding[] = [];
  for (const p of players) {
    const b = at.get(p.userId);
    if (!b) continue;
    out.push({ userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, gained: Math.max(0, p.uniques - b.uniques), packs: Math.max(0, p.packsOpened - b.packs), rank: 0 });
  }
  out.sort((x, y) => y.gained - x.gained || y.packs - x.packs || x.name.localeCompare(y.name, locale()));
  let r = 0;
  for (const s of out) if (s.gained > 0) s.rank = ++r;
  return out;
}

/** Résultat final d'un joueur (saison figée) */
export interface SeasonResult {
  userId: string;
  name: string;
  avatarUrl?: string;
  rank: number;
  gained: number;
  packs: number;
  /** boosters reçus */
  boosters: number;
}

/** Ce que l'onglet « Saison » du classement affiche. */
export interface SeasonBoard {
  /** saison en cours (absente : pas encore ouverte, le cron horaire s'en charge) */
  current: { key: string; startAt: number; bases: SeasonBase[] } | null;
  /** saisons passées, la plus récente d'abord (12 au plus) */
  past: Array<{ key: string; closedAt: number; results: SeasonResult[] }>;
}
