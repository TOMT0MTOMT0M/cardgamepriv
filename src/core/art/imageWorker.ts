/**
 * WORKER DES ILLUSTRATIONS (collection : peinture des cartes sans bloquer le fil principal).
 *  - `process` : décode l'image (createImageBitmap), la dessine, la détoure, la recadre et en tire la palette — EXACTEMENT
 *    les calculs de `processImage` (images.ts, repli sur le fil principal), partagés via `imageProc.ts` ;
 *  - `encode` : encode une carte peinte (ImageBitmap d'une toile) en WebP, hors du fil principal ;
 *  - `probe` (au démarrage) : le navigateur sait-il tout ce qu'il faut ici ? (Safari : OffscreenCanvas 2D, WebP…)
 * Toute impossibilité est signalée (`ok: false` / `fallback: true`) : l'appelant refait alors le travail comme avant.
 */
import { analyzePixels, type Analysis } from './imageProc';

export type ImageJob =
  | { id: number; kind: 'probe' }
  | { id: number; kind: 'process'; blob: Blob; maxSide: number; allowKey: boolean }
  | { id: number; kind: 'encode'; bitmap: ImageBitmap; type: string; quality: number };

export interface ProcessDone extends Analysis {
  /** illustration détourée et recadrée (cw × ch), transférée */
  bitmap: ImageBitmap;
  nw: number;
  nh: number;
}

type Reply = { id: number; ok: boolean } & Record<string, unknown>;
const ctx = self as unknown as { onmessage: ((e: MessageEvent<ImageJob>) => void) | null; postMessage(m: unknown, t?: Transferable[]): void };

async function probe() {
  let webp = false;
  try {
    const oc = new OffscreenCanvas(2, 2);
    const g = oc.getContext('2d');
    if (!g || typeof createImageBitmap !== 'function') return { ok: false };
    g.fillRect(0, 0, 1, 1);
    // ne pas se contenter de la présence de l'API : décoder vraiment un blob et lire des pixels
    const bm = await createImageBitmap(await oc.convertToBlob({ type: 'image/png' }));
    bm.close();
    oc.getContext('2d')!.getImageData(0, 0, 1, 1);
    webp = (await oc.convertToBlob({ type: 'image/webp', quality: 0.86 })).type === 'image/webp';
  } catch {
    return { ok: false };
  }
  return { ok: true, webp };
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  // même orientation EXIF que <img> (« from-image »)
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(blob);
  }
}

async function process(job: Extract<ImageJob, { kind: 'process' }>): Promise<{ r: Record<string, unknown>; t: Transferable[] } | null> {
  const bmp = await decode(job.blob);
  const nw = bmp.width, nh = bmp.height;
  // plus grand que le plafond : le redimensionnement (lissage « high ») est laissé au fil principal, comme avant
  if (!nw || !nh || Math.max(nw, nh) > job.maxSide) {
    bmp.close();
    return null;
  }
  const src = new OffscreenCanvas(nw, nh);
  const g = src.getContext('2d', { willReadFrequently: true });
  if (!g) {
    bmp.close();
    return null;
  }
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const id = g.getImageData(0, 0, nw, nh);
  const a = analyzePixels(id.data, nw, nh, job.allowKey);
  if (a.keyed) g.putImageData(id, 0, 0);
  const out = new OffscreenCanvas(a.cw, a.ch);
  const og = out.getContext('2d');
  if (!og) return null;
  og.drawImage(src, a.x0, a.y0, a.cw, a.ch, 0, 0, a.cw, a.ch);
  const bitmap = out.transferToImageBitmap();
  return { r: { ...a, bitmap, nw, nh }, t: [bitmap] };
}

async function encode(job: Extract<ImageJob, { kind: 'encode' }>): Promise<Blob | null> {
  const { bitmap } = job;
  try {
    const oc = new OffscreenCanvas(bitmap.width, bitmap.height);
    const bg = oc.getContext('bitmaprenderer');
    if (!bg) return null;
    bg.transferFromImageBitmap(bitmap);
    const blob = await oc.convertToBlob({ type: job.type, quality: job.quality });
    return blob.type === job.type ? blob : null;
  } finally {
    bitmap.close?.();
  }
}

ctx.onmessage = async (e) => {
  const job = e.data;
  const reply = (r: Omit<Reply, 'id'>, t: Transferable[] = []) => ctx.postMessage({ id: job.id, ...r }, t);
  try {
    if (job.kind === 'probe') reply(await probe());
    else if (job.kind === 'process') {
      const p = await process(job);
      if (p) reply({ ok: true, ...p.r }, p.t);
      else reply({ ok: false });
    } else if (job.kind === 'encode') {
      const blob = await encode(job);
      reply({ ok: !!blob, blob });
    }
  } catch (err) {
    reply({ ok: false, error: String((err as Error)?.message ?? err) });
  }
};
