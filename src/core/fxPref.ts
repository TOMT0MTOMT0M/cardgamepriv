/**
 * (audit 12/11, décision 4 de Tom) Le mode « Effets réduits » du jeu est SUPPRIMÉ : plus de réglage, plus de choix
 * mémorisé, plus de classe `fx-reduced`. Seul le réglage « réduire les animations » de l'appareil compte encore
 * (`reducedMotion`, src/core/motion.ts). Ce fichier ne garde qu'un alias pour les expériences du labo.
 */
export { reducedMotion as fxReduced } from './motion';
