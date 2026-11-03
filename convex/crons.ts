import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

/**
 * Tâches planifiées.
 *  - Roulette à cartes : un tirage par jour à 21 h (heure de Paris). On vérifie toutes les 10 minutes (Convex planifie
 *    en UTC, l'heure d'été est gérée par `rouletteTick`, qui tire dès que 21 h est passé et ouvre le tirage suivant).
 */
const crons = cronJobs();

crons.interval('roulette : tirage quotidien', { minutes: 10 }, internal.games.rouletteTick, {});

export default crons;
