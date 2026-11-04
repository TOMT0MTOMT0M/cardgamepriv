/**
 * DIAGNOSTIC À DISTANCE des scènes 6★ (invocation Yu-Gi-Oh, rencontre Pokémon) — retour de Tom, 4 nov. : « écran noir
 * juste après l'hologramme, seulement sur téléphone », impossible à reproduire hors de son téléphone.
 *
 * Pendant une de ces scènes, on garde les erreurs (console, exceptions, erreurs WebGPU, perte du GPU) et le débit
 * d'images ; 15 s après le début (ou à la sortie), un rapport part UNE fois vers le serveur, dans la table des retours
 * du labo (`labFeedback`, entrée « diag-… ») — lu par Claude via /lab/feedback. Aucune donnée personnelle : modèle de
 * navigateur, moteur 3D, limites du GPU, résolution, erreurs.
 */
import type { Shell } from './shell';
import { net } from '../core/net/client';

const WATCH = /^(duel|duel-view|wild|wild-view)$/;
const logs: string[] = [];
const push = (s: string) => {
  logs.push(`${(performance.now() / 1000).toFixed(1)}s ${s}`.slice(0, 300));
  if (logs.length > 60) logs.shift();
};

export function installDiag(shell: Shell) {
  if (typeof window === 'undefined') return;
  for (const k of ['error', 'warn'] as const) {
    const orig = console[k].bind(console);
    console[k] = (...a: unknown[]) => {
      try {
        push(`${k}: ${a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : typeof x === 'string' ? x : JSON.stringify(x)?.slice(0, 200))).join(' ')}`);
      } catch {
        /* ignore */
      }
      orig(...a);
    };
  }
  window.addEventListener('error', (e) => push(`exception: ${e.message} @${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => push(`rejet: ${String((e.reason as Error)?.message ?? e.reason).slice(0, 200)}`));
  const dev = (shell.renderer.backend as unknown as { device?: GPUDevice }).device;
  if (dev) {
    dev.addEventListener('uncapturederror', (e) => push(`gpu: ${(e as GPUUncapturedErrorEvent).error.message.slice(0, 250)}`));
    void dev.lost.then((i) => push(`gpu PERDU: ${i.reason} ${i.message}`));
  }
  let sent = 0;
  let watching: string | null = null;
  let since = 0;
  let frames = 0;
  let worst = 0;
  let last = 0;
  const report = (why: string) => {
    if (!watching || sent >= 4) return;
    const scene = watching;
    watching = null;
    sent++;
    const secs = (performance.now() - since) / 1000;
    const be = (shell.renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    const lim = dev?.limits as unknown as Record<string, number> | undefined;
    const limits = lim ? ['maxStorageBuffersInVertexStage', 'maxStorageBuffersPerShaderStage', 'maxTextureDimension2D', 'maxColorAttachmentBytesPerSample', 'maxBufferSize'].map((k) => `${k}=${lim[k]}`).join(' ') : '';
    const note = [
      `scène ${scene} (${why}) · ${secs.toFixed(1)} s · ${frames} images (${(frames / Math.max(0.1, secs)).toFixed(0)} i/s, pire ${worst.toFixed(0)} ms)`,
      `${be} · ${window.innerWidth}×${window.innerHeight} @${devicePixelRatio} · canvas ${shell.renderer.domElement.width}×${shell.renderer.domElement.height}`,
      limits,
      ...logs.slice(-35),
    ].join('\n').slice(0, 1990);
    void net
      .pushLabFeedback({
        clientId: `diag-${scene}-${(localStorage.getItem('bebou.device') ?? 'x').slice(0, 30)}`, // une ligne par scène (sinon elles s'écrasent)
        tester: 'diag',
        entries: [{ id: `diag-${scene}`, title: `Diagnostic ${scene}`, category: 'D', vote: 0, note, updatedAt: new Date().toISOString() }],
        meta: { backend: be, userAgent: navigator.userAgent, quality: shell.quality, dpr: devicePixelRatio },
      })
      .catch(() => {});
  };
  const tick = (now: number) => {
    const a = shell.active();
    if (watching && a !== watching && !(a && WATCH.test(a))) report('sortie');
    if (!watching && a && WATCH.test(a)) {
      watching = a;
      since = now;
      frames = 0;
      worst = 0;
      push(`début ${a}`);
    }
    if (watching) {
      frames++;
      if (last) worst = Math.max(worst, now - last);
      if (now - since > 15000) report('15 s');
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
