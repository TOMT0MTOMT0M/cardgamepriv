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
crons.interval('classement : lignes et numero un', { minutes: 5 }, internal.profiles.refreshRanks, {});
// (11/11, chantier ouvertures-saisons) saisons mensuelles : ouvre la saison, ajoute les nouveaux joueurs, et au changement
// de mois (Paris) fige le classement, donne les récompenses et ouvre la suivante (idempotent — convex/seasons.ts)
crons.interval('saisons : fin du mois', { hours: 1 }, internal.seasons.tick, {});

export default crons;
