/**
 * JOURNAL DE PERFORMANCE (07/11) : quelques jalons du chargement (durées en ms) et les tâches longues du thread
 * principal (> 50 ms), gardés en mémoire pour le rapport de chargement envoyé une fois par appareil (game/diag.ts) —
 * la mesure « sur vrai téléphone » demandée par l'audit du 06/11 (§8 ter : la peinture de la carte des plis).
 * Aucune donnée personnelle ; rien n'est envoyé d'ici.
 */
export interface PerfMark {
  name: string;
  /** instant (ms depuis le début de la navigation) */
  at: number;
  /** durée (ms), 0 pour un simple jalon */
  ms: number;
}
const marks: PerfMark[] = [];
const longTasks: Array<{ at: number; ms: number }> = [];

export function perfMark(name: string, ms = 0, at = performance.now()): void {
  if (marks.length < 40) marks.push({ name, at: Math.round(at), ms: Math.round(ms) });
}
export function perfMarks(): readonly PerfMark[] {
  return marks;
}
export function perfLongTasks(): ReadonlyArray<{ at: number; ms: number }> {
  return longTasks;
}

try {
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (longTasks.length < 200) longTasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) });
    }).observe({ type: 'longtask', buffered: true });
  }
} catch {
  /* navigateur sans tâches longues (Safari) : le rapport n'en aura pas */
}
