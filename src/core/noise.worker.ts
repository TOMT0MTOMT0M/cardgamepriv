/**
 * WORKER DES BRUITS (répétable, brûlure du sachet) (audit 12/11, S06 / E2-01) : calcule les pixels hors du fil principal et les renvoie
 * transférés. Un seul message, puis le fil principal ferme le worker.
 */
import { burnNoiseValues, noisePixels } from './noiseData';

type Ask = 0 | { burn: [number, number, number, number] };
const ctx = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent<Ask>) => void) | null };
ctx.onmessage = (e) => {
  const d = e.data ? burnNoiseValues(...e.data.burn) : noisePixels();
  ctx.postMessage(d, [d.buffer]);
};
