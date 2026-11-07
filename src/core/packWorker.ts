/**
 * WORKER DES SACHETS (07/11, mesure sur vrais téléphones) : les deux calculs qui gelaient l'écran 1 à 1,4 s par booster
 * sur un Android 4 Go — la carte des plis (hauteur + normales, packCrease.ts) et le nom moulé (relief + mélange aux
 * normales, packLabel.ts) — tournent ICI, hors du thread principal. Mêmes fonctions qu'avant : mêmes nombres.
 * La rastérisation du texte (police du jeu) reste sur le thread principal (quelques ms) : on reçoit sa couverture.
 */
import { CRH, CRW, PH, PW, creaseMapData } from './packCrease';
import { moldFront, reliefFromCoverage, type ReliefMap } from './packLabel';

export type PackJob =
  | { id: number; kind: 'crease'; ch: number; seed: number }
  | {
      id: number;
      kind: 'mold';
      creaseN: Uint8ClampedArray;
      x0: number;
      y0: number;
      px: number;
      /** relief déjà connu (cache) ou couverture du texte à calculer */
      relief?: ReliefMap;
      cov?: Uint8ClampedArray;
      covW?: number;
      covH?: number;
    };

const ctx = self as unknown as { onmessage: ((e: MessageEvent<PackJob>) => void) | null; postMessage(m: unknown, t?: Transferable[]): void };
ctx.onmessage = (e) => {
  const job = e.data;
  try {
    if (job.kind === 'crease') {
      const d = creaseMapData(job.ch, job.seed);
      ctx.postMessage({ id: job.id, ok: true, h: d.h, n: d.n }, [d.h.buffer, d.n.buffer]);
      return;
    }
    const computed = !job.relief;
    const relief = job.relief ?? reliefFromCoverage(job.cov!, job.covW!, job.covH!, job.px);
    const f = moldFront(job.creaseN, CRW, CRH, PW, PH, relief, job.x0, job.y0);
    const t: Transferable[] = [f.normal.buffer, f.ao.buffer, f.shade.buffer];
    const rel = computed ? { ...relief, h: relief.h } : undefined;
    if (rel) t.push(rel.h.buffer);
    ctx.postMessage({ id: job.id, ok: true, normal: f.normal, ao: f.ao, shade: f.shade, relief: rel }, t);
  } catch (err) {
    ctx.postMessage({ id: job.id, ok: false, error: String(err) });
  }
};
