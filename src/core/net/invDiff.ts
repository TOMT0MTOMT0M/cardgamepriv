/**
 * (V2 fluidité) COPIE LOCALE DE LA COLLECTION, tenue PAR DIFFÉRENCE (convex/invRev.ts, `inventory.mineSince`).
 * Lue en entier une fois, puis seules les lignes écrites ou supprimées depuis arrivent. Une ligne porte toujours son état
 * complet (et sa révision) : la recevoir deux fois est sans effet. Pur (aucune API du navigateur) : testé côté serveur.
 */
export interface InvRow {
  cardId: string;
  rarity: string;
  count: number;
  bestMintNumber: number;
  firstPulledAt: number;
  rev: number;
}
export interface InvGone {
  cardId: string;
  rarity: string;
  rev: number;
}

/**
 * Marge (ms) retirée de la dernière révision vue pour suivre la suite : une mutation partie un peu AVANT une autre déjà
 * vue peut se valider APRÈS elle (son horloge est celle de son départ). Une mutation Convex dure < 1 s.
 */
export const INV_MARGIN_MS = 30_000;
/** (v2.1.31) lignes hors de la marge à partir desquelles on repart d'une révision récente (avant : 60 lignes en tout) */
export const INV_REBASE_ROWS = 10;
/** au-delà de ce nombre de lignes dans une réponse, on repart toujours d'une révision récente (serveur : 300 au plus) */
export const INV_REBASE_MAX = 60;

/**
 * (v2.1.31, coût Convex, piste 5) Repartir d'une révision plus récente (`next`) ? L'abonnement relit, à chaque changement,
 * TOUTES les lignes depuis sa révision de départ (avant : 36 en moyenne par booster, pour 5 cartes nouvelles). Le
 * relancer depuis `next` relit tout de suite les lignes encore dans la marge (`keep`) et épargne ensuite, à chaque
 * changement, celles d'avant (`drop`) : on relance dès que `drop` atteint INV_REBASE_ROWS et au moins `keep` (un ×10
 * tout juste ouvert n'est pas relu pour rien), et toujours au-delà de INV_REBASE_MAX lignes.
 */
export function shouldRebase(d: { rows: Array<{ rev: number }>; gone: Array<{ rev: number }> }, next: number): boolean {
  let drop = 0;
  let keep = 0;
  for (const r of [...d.rows, ...d.gone]) {
    if ((r.rev || 0) < next) drop++;
    else keep++;
  }
  return drop > 0 && ((drop >= INV_REBASE_ROWS && drop >= keep) || drop + keep > INV_REBASE_MAX);
}

const key = (c: { cardId: string; rarity: string }) => `${c.cardId}|${c.rarity}`;

export class InvMirror {
  private rows = new Map<string, InvRow>();
  /** révision de la dernière suppression vue par ligne (une ligne recréée ensuite a une révision plus récente) */
  private gone = new Map<string, number>();
  private maxRev = 0;
  /** tableau publié : le même tant que rien ne change (les vues mémorisent par identité de tableau) */
  private list: Array<Omit<InvRow, 'rev'>> = [];
  loaded = false;

  /** lecture complète (`inventory.collectionFull`) */
  reset(rows: InvRow[]) {
    this.rows = new Map(rows.map((r) => [key(r), r]));
    this.gone.clear();
    this.maxRev = rows.reduce((m, r) => Math.max(m, r.rev || 0), 0);
    this.loaded = true;
    this.publish();
  }

  /** applique une réponse de `mineSince` ; vrai si la collection a changé (nouveau tableau dans `cards`) */
  apply(d: { rows: InvRow[]; gone: InvGone[] }): boolean {
    let changed = false;
    for (const g of d.gone) {
      const k = key(g);
      this.maxRev = Math.max(this.maxRev, g.rev);
      if ((this.gone.get(k) ?? -Infinity) >= g.rev) continue;
      this.gone.set(k, g.rev);
      const cur = this.rows.get(k);
      // supprimée APRÈS la dernière écriture connue (ou ligne d'avant le suivi, sans révision)
      if (cur && (cur.rev || 0) <= g.rev) {
        this.rows.delete(k);
        changed = true;
      }
    }
    for (const r of d.rows) {
      const k = key(r);
      this.maxRev = Math.max(this.maxRev, r.rev || 0);
      if ((this.gone.get(k) ?? -Infinity) > (r.rev || 0)) continue; // déjà supprimée depuis
      const cur = this.rows.get(k);
      if (cur && (cur.rev || 0) > (r.rev || 0)) continue; // plus ancienne que la copie
      if (cur && cur.count === r.count && cur.bestMintNumber === r.bestMintNumber && cur.firstPulledAt === r.firstPulledAt) {
        cur.rev = Math.max(cur.rev || 0, r.rev || 0);
        continue;
      }
      this.rows.set(k, r);
      changed = true;
    }
    if (changed) this.publish();
    return changed;
  }

  /** lignes complètes (avec leur révision), pour la copie gardée sur l'appareil — à rendre à `reset` */
  dump(): InvRow[] {
    return [...this.rows.values()];
  }

  /** révision à partir de laquelle suivre les changements */
  since(): number {
    return this.maxRev - INV_MARGIN_MS;
  }

  get cards() {
    return this.list;
  }

  private publish() {
    this.list = [...this.rows.values()].map((r) => ({ cardId: r.cardId, rarity: r.rarity, count: r.count, bestMintNumber: r.bestMintNumber, firstPulledAt: r.firstPulledAt }));
  }
}
