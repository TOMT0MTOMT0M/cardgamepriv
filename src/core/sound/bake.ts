/**
 * Lance la cuisson de la banque de sons. Normalement dans un Worker (0 ms sur le fil principal) ; si le Worker ne
 * démarre pas (très vieux navigateur), cuisson sur le fil principal, un son à la fois entre deux images.
 * `each` reçoit chaque son prêt ; tant qu'un son n'est pas arrivé, le moteur joue son ancienne version synthétisée.
 */
import type { Clip } from './dsp';

type Each = (id: string, clips: Clip[]) => void;

export function bakeBank(each: Each): void {
  let got = 0;
  const onMain = () => {
    void import('./bank').then(({ SOUND_IDS, renderSound }) => {
      const ids = [...SOUND_IDS];
      const step = () => {
        const id = ids.shift();
        if (!id) return;
        each(id, renderSound(id));
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
  } catch {
    onMain();
  }
}
