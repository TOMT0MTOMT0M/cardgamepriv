/**
 * WORKER DU BRUIT RÉPÉTABLE (audit 12/11, S06 / E2-01) : calcule les pixels hors du fil principal et les renvoie
 * transférés. Un seul message, puis le fil principal ferme le worker.
 */
import { noisePixels } from './noiseData';

const ctx = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: (() => void) | null };
ctx.onmessage = () => {
  const d = noisePixels();
  ctx.postMessage(d, [d.buffer]);
};
