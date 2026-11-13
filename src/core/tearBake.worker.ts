/**
 * WORKER DES DÉCHIRURES CUITES (audit 12/11, S06 / A1-02) : télécharge, décompresse et décode un fichier .tear hors du
 * fil principal ; les deux tableaux reviennent transférés (pas de copie). Un message par variante : { i, url }.
 */
import { fetchAndDecode } from './tearBakeDecode';

const ctx = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent<{ i: number; url: string }>) => void) | null };
ctx.onmessage = async (e) => {
  const { i, url } = e.data;
  const bake = await fetchAndDecode(url);
  ctx.postMessage({ i, bake }, bake ? [bake.rest.buffer, bake.frames.buffer] : []);
};
