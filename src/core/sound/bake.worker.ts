/**
 * WORKER DE CUISSON DES SONS : fabrique toute la banque (bank.ts) hors du fil principal, au démarrage, et renvoie
 * chaque son dès qu'il est prêt (les tampons sont transférés, pas copiés). Aucun réseau, aucun fichier.
 */
import { renderBank } from './bank';

const ctx = self as unknown as { postMessage(m: unknown, t?: Transferable[]): void };
try {
  renderBank((id, clips) => ctx.postMessage({ id, clips }, clips.flatMap((c) => c.ch.map((x) => x.buffer))));
  ctx.postMessage({ done: true });
} catch (err) {
  ctx.postMessage({ done: true, error: String(err) });
}
