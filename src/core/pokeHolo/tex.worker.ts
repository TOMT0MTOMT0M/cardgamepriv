/**
 * WORKER DES TEXTURES POKÉBOX (audit 12/11, S06) : calcule les pixels hors du fil principal et les renvoie transférés
 * (pas de copie). Un seul message, puis le fil principal ferme le worker.
 */
import { pokeTexData } from './texData';

const ctx = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: (() => void) | null };
ctx.onmessage = () => {
  const d = pokeTexData();
  ctx.postMessage(d, Object.values(d).map((x) => x.data.buffer));
};
