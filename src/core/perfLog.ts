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

/**
 * (07/11, mesure sur vrai téléphone) IMAGES LENTES avec leur COUPABLE : l'API « Long Animation Frames » (Chrome 123+,
 * Android compris) dit, pour chaque image > 50 ms, quels scripts l'ont occupée (fichier + position dans le fichier,
 * retrouvés hors ligne avec les cartes de sources du build) et combien de temps est parti en style / mise en page.
 * On garde les pires (au plus 40), avec la page affichée à ce moment (#/boutique, #/collection…).
 */
export interface SlowFrame {
  at: number;
  ms: number;
  /** temps bloquant (au-delà de 50 ms) */
  block: number;
  /** style + mise en page forcés à la fin de l'image */
  layout: number;
  view: string;
  /** scripts de l'image, le plus long d'abord : « 120 ms opening-AbC123.js:45678 (requestAnimationFrame) » */
  scripts: string[];
}
const slow: SlowFrame[] = [];
export function perfSlowFrames(): readonly SlowFrame[] {
  return slow;
}
type LoafScript = { duration: number; invoker?: string; invokerType?: string; sourceURL?: string; sourceFunctionName?: string; sourceCharPosition?: number };
type Loaf = PerformanceEntry & { blockingDuration?: number; styleAndLayoutStart?: number; renderStart?: number; scripts?: LoafScript[] };
try {
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as Loaf[]) {
        if (e.duration < 80) continue;
        const end = e.startTime + e.duration;
        const sl = e.styleAndLayoutStart ? Math.max(0, end - e.styleAndLayoutStart) : 0;
        const scripts = [...(e.scripts ?? [])]
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 3)
          .map((s) => {
            const file = (s.sourceURL ?? '').split('/').pop()?.split('?')[0] || '?';
            const fn = s.sourceFunctionName ? ` ${s.sourceFunctionName}` : '';
            return `${Math.round(s.duration)} ms ${file}:${s.sourceCharPosition ?? -1}${fn} (${s.invokerType ?? ''} ${(s.invoker ?? '').slice(0, 40)})`;
          });
        const f: SlowFrame = { at: Math.round(e.startTime), ms: Math.round(e.duration), block: Math.round(e.blockingDuration ?? 0), layout: Math.round(sl), view: (location.hash || '#/').slice(0, 24), scripts };
        // on garde les 40 pires
        if (slow.length < 40) slow.push(f);
        else {
          let k = 0;
          for (let i = 1; i < slow.length; i++) if (slow[i].ms < slow[k].ms) k = i;
          if (slow[k].ms < f.ms) slow[k] = f;
        }
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  }
} catch {
  /* Safari / Firefox : pas d'attribution, le rapport garde les tâches longues seules */
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
