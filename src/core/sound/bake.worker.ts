/**
 * WORKER DE CUISSON DES SONS : fabrique une banque (bank.ts, ou à la demande celle des scènes 6★ / la nappe des menus)
 * hors du fil principal et renvoie chaque son dès qu'il est prêt (les tampons sont transférés, pas copiés). Aucun
 * réseau, aucun fichier. Le livre demandé arrive par le premier message (`{ book }`), défaut : la banque principale.
 */
import { renderBank } from './bank';
import { BOOKS, type BookName } from './books';

const ctx = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void; onmessage: ((e: MessageEvent<{ book?: BookName }>) => void) | null };
ctx.onmessage = (e) => {
  ctx.onmessage = null;
  try {
    renderBank((id, clips) => ctx.postMessage({ id, clips }, clips.flatMap((c) => c.ch.map((x) => x.buffer))), BOOKS[e.data?.book ?? 'main']);
    ctx.postMessage({ done: true });
  } catch (err) {
    ctx.postMessage({ done: true, error: String(err) });
  }
};
