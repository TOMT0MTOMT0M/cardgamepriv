import REV from './artRev.json';

/**
 * (retours live 6, B2) ADRESSES VERSIONNÉES des illustrations : `art/x.png?v=<époque>[.<révision>]`.
 *
 * Cause racine des miniatures ≠ vue détail (et du « placeholder conservé » du lot 4, des « cartes de répartition » du
 * lot 3) : une image corrigée garde le MÊME nom ; le site la sert « public, max-age=604800, stale-while-revalidate »
 * (functions/art) et le cache de Cloudflare la garde aussi. Le navigateur d'un joueur qui avait déjà vu l'ancienne
 * miniature continuait donc à peindre l'ancienne image (la vue détail, chargée plus tard, avait la bonne).
 *
 * Une adresse versionnée est servie « immutable » (functions/art) : une nouvelle version = une nouvelle adresse.
 *  - ART_EPOCH : à monter pour tout faire recharger d'un coup (fait le 07/11 : toutes les miniatures repartent) ;
 *  - artRev.json : révision par fichier (clé = chemin sous art/), montée AUTOMATIQUEMENT à la mise en ligne pour chaque
 *    image déjà dans R2 dont le contenu a changé (scripts/art-rev.mjs, lancé avant le build).
 */
export const ART_EPOCH = 2;
const revs = REV as Record<string, number>;

/** `art/monde/x.jpg` → `art/monde/x.jpg?v=2` (ou `?v=2.3` si l'image a été remplacée 3 fois depuis) */
export function artV(path: string): string {
  const r = revs[path.replace(/^\/?art\//, '')];
  return `${path}?v=${ART_EPOCH}${r ? `.${r}` : ''}`;
}
