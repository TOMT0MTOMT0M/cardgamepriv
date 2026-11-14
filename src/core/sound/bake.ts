/**
 * Lance la cuisson de la banque de sons. Normalement dans un Worker (0 ms sur le fil principal) ; si le Worker ne
 * démarre pas (très vieux navigateur), cuisson sur le fil principal, un son à la fois entre deux images.
 * `each` reçoit chaque son prêt ; tant qu'un son n'est pas arrivé, le moteur joue son ancienne version synthétisée.
 */
import type { Clip } from './dsp';
import type { BookName } from './books';

type Each = (id: string, clips: Clip[]) => void;

/** `book` : la banque principale (démarrage) ou, à la demande, celle des scènes 6★ / la nappe des menus */
export function bakeBank(each: Each, book: BookName = 'main'): void {
  let got = 0;
  const onMain = () => {
    void Promise.all([import('./bank'), import('./books')]).then(([{ renderSound }, { BOOKS }]) => {
      const recipes = BOOKS[book];
      const ids = Object.keys(recipes);
      const step = () => {
        const id = ids.shift();
        if (!id) return;
        each(id, renderSound(id, recipes));
        setTimeout(step, 30);
      };
      step();
    });
  };
  try {
    const w = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id?: string; clips?: Clip[]; done?: boolean }>) => {
      if (e.data.id && e.data.clips) {
        got++;
        each(e.data.id, e.data.clips);
      }
      if (e.data.done) w.terminate();
    };
    w.onerror = () => {
      w.terminate();
      if (!got) onMain();
    };
    w.postMessage({ book });
  } catch {
    onMain();
  }
}
