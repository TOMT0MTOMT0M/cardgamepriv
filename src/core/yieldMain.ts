/**
 * Découper les tâches longues du fil principal (V2 fluidité 2).
 * `yieldToMain()` rend la main au navigateur (peinture, toucher) puis reprend : `scheduler.yield()` quand il existe
 * (la reprise passe devant les autres tâches en file), sinon un message de canal (pas de plancher de 4 ms du
 * `setTimeout` imbriqué), sinon `setTimeout(0)`. `yieldBudget(ms)` ne rend la main qu'après `ms` de travail
 * continu (≈ 50 ms : seuil des tâches longues) : à appeler dans une boucle, `await tick()`.
 * Rien ici ne change l'ordre ni le contenu du travail : seulement l'endroit où il est interrompu.
 */
type SchedulerLike = { yield?: () => Promise<void> };

let chan: MessageChannel | null = null;
let waiting: Array<() => void> = [];

export function yieldToMain(): Promise<void> {
  const sch = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (sch && typeof sch.yield === 'function') return sch.yield();
  return new Promise<void>((resolve) => {
    if (typeof MessageChannel === 'undefined') return void setTimeout(resolve, 0);
    if (!chan) {
      chan = new MessageChannel();
      chan.port1.onmessage = () => {
        const run = waiting;
        waiting = [];
        for (const f of run) f();
      };
    }
    waiting.push(resolve);
    chan.port2.postMessage(0);
  });
}

/** `const tick = yieldBudget(50); for (…) { travail(); await tick(); }` : cède la main au plus toutes les `ms` ms. */
export function yieldBudget(ms = 50): () => Promise<void> {
  let t0 = performance.now();
  return async () => {
    if (performance.now() - t0 < ms) return;
    await yieldToMain();
    t0 = performance.now();
  };
}
