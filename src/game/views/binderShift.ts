import { DUR, EASING } from '../../core/motion';

/**
 * (V3, lot 08) CLASSEURS — LES VOISINES S'ÉCARTENT SOUS LE DOIGT. Pendant un glisser (collection.ts, `sortable`), les
 * tuiles prennent tout de suite la place qu'elles auront après le lâcher : celles entre la place de départ et la place
 * visée glissent d'un cran (FLIP : les places sont mesurées UNE fois au début, puis seules des `transform` bougent) et la
 * tuile attrapée (estompée) marque le trou où elle tombera.
 *
 * La place visée se lit sur ces mesures (centre le plus proche du doigt), plus sous le doigt dans le DOM : une tuile qui
 * vient de glisser sous le doigt ne fait pas changer la cible (pas d'aller-retour), et plus de `elementFromPoint` à
 * chaque mouvement. Hors de la grille : -1 (tout revient, lâcher = rien ne change), comme avant.
 */
export function binderShift(g: HTMLElement) {
  let tiles: HTMLElement[] = [];
  /** centres et coins des places, dans le repère de la grille (le défilement ne les change pas) */
  let pos: Array<{ x: number; y: number; cx: number; cy: number }> = [];
  let from = -1;
  let at = -1;
  /** place qu'aura la tuile n° k si on lâche à la place `at` (même calcul que le splice de `sortable`) */
  const place = (k: number) => {
    if (at < 0) return k;
    if (k === from) return at;
    if (from < at) return k > from && k <= at ? k - 1 : k;
    return k >= at && k < from ? k + 1 : k;
  };
  return {
    begin(i: number) {
      tiles = [...g.querySelectorAll<HTMLElement>(':scope > .tile')].sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i));
      const gr = g.getBoundingClientRect();
      pos = tiles.map((t) => {
        const r = t.getBoundingClientRect();
        return { x: r.left - gr.left, y: r.top - gr.top, cx: r.left - gr.left + r.width / 2, cy: r.top - gr.top + r.height / 2 };
      });
      const tr = `transform ${DUR.standard()}ms ${EASING.standard}`;
      for (const t of tiles) t.style.transition = tr;
      from = i;
      at = -1;
    },
    /** Place visée sous le point (coordonnées écran), -1 hors de la grille. */
    pick(x: number, y: number): number {
      if (!pos.length) return -1;
      const gr = g.getBoundingClientRect();
      const px = x - gr.left;
      const py = y - gr.top;
      if (px < -12 || py < -12 || px > gr.width + 12 || py > gr.height + 12) return -1;
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < pos.length; k++) {
        const d = (pos[k].cx - px) ** 2 + (pos[k].cy - py) ** 2;
        if (d < bd) (bd = d), (best = k);
      }
      return best;
    },
    /** Écarte les voisines pour une arrivée à la place `i` (-1 : chacune revient à sa place). */
    to(i: number) {
      if (i === at) return;
      at = i;
      tiles.forEach((t, k) => {
        const p = place(k);
        const dx = pos[p].x - pos[k].x;
        const dy = pos[p].y - pos[k].y;
        t.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
      });
    },
    /** Glisser annulé ou refusé : tout revient en place (la grille réussie, elle, est redessinée par la vue). */
    reset() {
      this.to(-1);
      const done = tiles;
      window.setTimeout(() => done.forEach((t) => (t.style.transition = '')), DUR.standard());
      tiles = [];
      pos = [];
    },
  };
}
