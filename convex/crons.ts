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

export default crons;
