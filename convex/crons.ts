import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

/**
 * Tâches planifiées.
 *  - Roulette à cartes : deux tirages par jour, 10 h et 20 h (heure de Paris — retours live 02). On vérifie toutes les
 *    5 minutes (Convex planifie en UTC, l'heure d'été est gérée par `rouletteTick`, qui tire dès que l'heure est passée
 *    et ouvre le tirage suivant).
 */
const crons = cronJobs();

crons.interval('roulette : tirages 10 h et 20 h', { minutes: 5 }, internal.games.rouletteTick, {});
// tableau d'offres (retours live 02) : annonces arrivées à 24 / 48 h → expirées, offres closes (la lecture filtre déjà)
crons.interval('annonces : expiration', { minutes: 15 }, internal.listings.expireTick, {});

// (v1.0.11) classement : lignes recalculées joueur par joueur (actifs toutes les 5 min, tout le monde toutes les 6 h) ;
// le premier est marqué « Numéro un » (retours live 6, C15). Avant : une seule requête qui lisait toutes les
// collections, au-delà de la limite de Convex.
// (26/11, coût Convex) toutes les 10 min (avant : 5) : la ligne d'un joueur qui ouvre le classement est recalculée
// tout de suite (refreshMyRank), celles des autres ont au plus 10 min de retard ; les lignes se calculent par
// différence (convex/rankInc.ts)
crons.interval('classement : lignes et numero un', { minutes: 10 }, internal.profiles.refreshRanks, {});
// (11/11, chantier ouvertures-saisons) saisons mensuelles : ouvre la saison, ajoute les nouveaux joueurs, et au changement
// de mois (Paris) fige le classement, donne les récompenses et ouvre la suivante (idempotent — convex/seasons.ts)
crons.interval('saisons : fin du mois', { hours: 1 }, internal.seasons.tick, {});
// (26/11, coût Convex) rétention : boosters ouverts et fil d'activité de plus de 30 jours retirés, par petits lots
// (convex/migrations.ts, purgeOld — aussi relancée à chaque mise en ligne)
crons.daily('retention : boosters ouverts de plus de 2 jours, fil de plus de 30 jours', { hourUTC: 4, minuteUTC: 30 }, internal.migrations.purgeOld, {});

export default crons;
