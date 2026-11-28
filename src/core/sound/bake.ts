/**
 * Lance la cuisson de la banque de sons. Normalement dans un Worker (0 ms sur le fil principal) ; si le Worker ne
 * démarre pas (très vieux navigateur), cuisson sur le fil principal, un son à la fois entre deux images.
 * `each` reçoit chaque son prêt ; tant qu'un son n'est pas arrivé, le moteur joue son ancienne version synthétisée.
 *
 * (audit perf 28/11, n°7) La cuisson est déterministe : son résultat est rangé d'un lancement à l'autre (calcCache.ts,
 * clé `SOUND_REV`) ; aux lancements suivants les sons sont relus, sans worker (0,5-0,8 s de CPU de worker au téléphone,
 * à chaque lancement, même son coupé).
 */
import type { Clip } from './dsp';
import type { BookName } from './books';
import { calcGet, calcPut } from '../calcCache';
import { SOUND_REV } from './rev';

type Each = (id: string, clips: Clip[]) => void;

/** un livre = morceaux : [JSON des sons (id, fréquence, canaux × longueur)] puis les canaux, dans l'ordre */
export function toParts(done: Map<string, Clip[]>): ArrayBufferView[] {
  const meta: { id: string; clips: { sr: number; n: number[] }[] }[] = [];
  const data: ArrayBufferView[] = [];
  for (const [id, clips] of done) {
    meta.push({ id, clips: clips.map((c) => ({ sr: c.sr, n: c.ch.map((x) => x.length) })) });
    for (const c of clips) for (const x of c.ch) data.push(x);
  }
  return [new TextEncoder().encode(JSON.stringify(meta)), ...data];
}
export function fromParts(parts: Uint8Array[]): [string, Clip[]][] | null {
  try {
    const meta = JSON.parse(new TextDecoder().decode(parts[0])) as { id: string; clips: { sr: number; n: number[] }[] }[];
    let k = 1;
    const out: [string, Clip[]][] = [];
    for (const m of meta) {
      const clips: Clip[] = m.clips.map((c) => ({
        sr: c.sr,
        ch: c.n.map((len) => {
          const p = parts[k++];
          if (!p || p.byteLength !== len * 4) throw new Error('entrée du cache incohérente');
          return new Float32Array(p.buffer, p.byteOffset, len);
        }),
      }));
      out.push([m.id, clips]);
    }
    return k === parts.length ? out : null;
  } catch {
    return null;
  }
}

/** `book` : la banque principale (démarrage) ou, à la demande, celle des scènes 6★ / la nappe des menus */
export function bakeBank(each: Each, book: BookName = 'main'): void {
  // tout ce qui est cuit ici (worker ou fil principal) : rangé une fois le livre complet
  const done = new Map<string, Clip[]>();
  let complete = false;
  const keep = () => {
    if (complete && done.size) calcPut('son', SOUND_REV, book, toParts(done), 0, false); // (flottants de son : gzip ne gagne que 7 %)
  };
  void calcGet('son', SOUND_REV, book).then((hit) => {
    const sounds = hit && fromParts(hit);
    if (sounds?.length) {
      // (par petits paquets : chaque son devient un AudioBuffer sur le fil principal, quelques ms à la fois)
      const next = () => {
        for (const [id, clips] of sounds.splice(0, 6)) each(id, clips);
        if (sounds.length) setTimeout(next, 0);
      };
      next();
      return;
    }
    cook();
  });
  function cook() {
    let got = 0;
    const onMain = () => {
      void Promise.all([import('./bank'), import('./books')]).then(([{ renderSound }, { BOOKS }]) => {
        const recipes = BOOKS[book];
        const ids = Object.keys(recipes);
        const step = () => {
          const id = ids.shift();
          if (!id) {
            complete = true;
            return keep();
          }
          const clips = renderSound(id, recipes);
          done.set(id, clips);
          each(id, clips);
          setTimeout(step, 30);
        };
        step();
      });
    };
    try {
      const w = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id?: string; clips?: Clip[]; done?: boolean; error?: string }>) => {
        if (e.data.id && e.data.clips) {
          got++;
          // (les canaux reçus sont à nous : `each` les copie dans un AudioBuffer, ils restent intacts)
          done.set(e.data.id, e.data.clips);
          each(e.data.id, e.data.clips);
        }
        if (e.data.done) {
          w.terminate();
          complete = !e.data.error;
          keep();
        }
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
}
