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
import { perfLongTasks, perfMarks, perfSlowFrames, type SlowFrame } from '../core/perfLog';
import { hasTransientAttachment } from '../core/post';
import { tileFormats } from './cardImages';

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
      gpuMemLine(shell),
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
    last = watching ? now : 0;
    // (V2 fluidité, lot 3) hors scène surveillée, plus de rappel à chaque image : un coup d'œil dix fois par seconde
    if (watching) requestAnimationFrame(tick);
    else setTimeout(() => tick(performance.now()), 100);
  };
  requestAnimationFrame(tick);
}

/**
 * RAPPORT DE CHARGEMENT (07/11, audit perf 06/11 §11.3) : la première mesure « sur vrai téléphone » — temps jusqu'à
 * la boutique, peinture (ou relecture) de la carte des plis des sachets, tâches longues du thread principal, appareil.
 * Envoyé UNE fois par appareil et par version du rapport (sinon avec `?diag` dans l'adresse), 6 s après la boutique,
 * dans les retours du labo (entrée « Chargement », une ligne par appareil). Aucune donnée personnelle.
 */
const LOAD_REPORT_V = 'charge-2'; // (07/11) v2 : jalons du démarrage, images lentes avec leurs scripts, rapport d'usage
/** au-delà de cette durée après la boutique, le rapport d'USAGE part (images lentes pendant qu'on joue) */
const USAGE_REPORT_MS = 150_000;

/** (audit 12/11) mémoire GPU déclarée par le moteur (textures, cibles de rendu, tampons) : ce que three a alloué, pas ce que la puce consomme vraiment */
export function gpuMemLine(shell: Shell): string {
  const m = (shell.renderer.info as unknown as { memory?: Record<string, number> }).memory;
  if (!m) return 'mémoire GPU : inconnue';
  const mo = (b = 0) => (b / 1048576).toFixed(1);
  // (décision 2) lissage : ×4 seulement avec les attachements transitoires (src/core/post.ts)
  const stray = (window as unknown as { __strayFrames?: () => number }).__strayFrames?.() ?? 0;
  return `programmes GPU ${m.programs ?? "?"} · cibles de rendu ${m.renderTargets ?? "?"} · images parties dans une cible de passe ${stray} · mémoire GPU déclarée ${mo(m.total)} Mo (textures ${m.textures ?? 0} = ${mo(m.texturesSize)} Mo) · attachement transitoire ${hasTransientAttachment() ? 'oui' : 'non'} (téléphone en WebGPU : lissage ${hasTransientAttachment() ? '×4' : '×1'})`;
}

const frameLine = (f: SlowFrame) => `${(f.at / 1000).toFixed(1)}s ${f.ms} ms${f.layout > 20 ? ` (style+mise en page ${f.layout})` : ''} ${f.view} ← ${f.scripts.join(' | ') || 'scripts inconnus'}`;
export function reportLoad(shell: Shell) {
  try {
    const forced = new URLSearchParams(location.search).has('diag');
    if (!forced && localStorage.getItem('bebou.diag.charge') === LOAD_REPORT_V) return;
  } catch {
    return;
  }
  setTimeout(() => {
    try {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const be = (shell.renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
      const marks = perfMarks();
      const shop = marks.find((m) => m.name === 'boutique')?.at ?? 0;
      const lt = perfLongTasks();
      const before = lt.filter((t) => t.at < shop);
      const sum = (a: ReadonlyArray<{ ms: number }>) => a.reduce((x, t) => x + t.ms, 0);
      const top = [...lt].sort((a, b) => b.ms - a.ms).slice(0, 8).map((t) => `${(t.at / 1000).toFixed(1)}s ${t.ms} ms`);
      const n = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; downlink?: number } };
      const note = [
        `boutique à ${(shop / 1000).toFixed(2)} s · DOM prêt ${nav ? (nav.domContentLoadedEventEnd / 1000).toFixed(2) : '?'} s · 1er octet ${nav ? Math.round(nav.responseStart) : '?'} ms · transfert ${nav ? (nav.transferSize / 1024).toFixed(0) : '?'} Ko (page)`,
        `jalons : ${marks.map((m) => `${m.name} ${m.ms ? `${m.ms} ms` : `@${(m.at / 1000).toFixed(2)}s`}`).join(' · ') || 'aucun'}`,
        `tâches longues : ${lt.length} (${sum(lt)} ms), avant la boutique ${before.length} (${sum(before)} ms) · pires : ${top.join(', ') || 'aucune / non mesurées'}`,
        `${be} · ${shell.quality} · ${window.innerWidth}×${window.innerHeight} @${devicePixelRatio} · ${n.hardwareConcurrency ?? '?'} cœurs · ${n.deviceMemory ?? '?'} Go · ${n.connection?.effectiveType ?? '?'} ${n.connection?.downlink ?? ''}`,
        `cache des cartes : ${typeof caches === 'undefined' ? 'indisponible' : 'ok'} · ${document.visibilityState}`,
        // (v2) les images les plus lentes jusqu'ici, avec ce qui les a occupées (Chrome / Android : API LoAF)
        ...[...perfSlowFrames()].sort((a, b) => b.ms - a.ms).slice(0, 6).map(frameLine),
      ].join('\n').slice(0, 1990);
      void net
        .pushLabFeedback({
          clientId: `diag-charge-${(localStorage.getItem('bebou.device') ?? 'x').slice(0, 30)}`,
          tester: 'diag',
          entries: [{ id: 'diag-charge', title: 'Chargement', category: 'D', vote: 0, note, updatedAt: new Date().toISOString() }],
          meta: { backend: be, userAgent: navigator.userAgent, quality: shell.quality, dpr: devicePixelRatio },
        })
        .then(() => localStorage.setItem('bebou.diag.charge', LOAD_REPORT_V))
        .catch(() => {});
      console.info('[chargement]\n' + note);
      // (v2) RAPPORT D'USAGE : 2 min 30 de jeu plus tard, les images lentes APRÈS la boutique (roue, ouvertures,
      // collection…), chacune avec la page affichée et ses scripts — ce qui ralentit pendant qu'on joue
      setTimeout(async () => {
        try {
          let storageLine = 'stockage : inconnu';
          try {
            const e = await navigator.storage?.estimate?.();
            if (e) storageLine = `stockage utilisé ${((e.usage ?? 0) / 1048576).toFixed(0)} Mo sur ${((e.quota ?? 0) / 1048576).toFixed(0)} Mo permis`;
          } catch {
            /* pas d'estimation sur ce navigateur */
          }
          const after = perfSlowFrames().filter((f) => f.at > shop);
          const byView = new Map<string, number>();
          for (const f of after) byView.set(f.view, (byView.get(f.view) ?? 0) + 1);
          const lt2 = perfLongTasks().filter((t) => t.at > shop);
          const usage = [
            `usage ${((performance.now() - shop) / 1000).toFixed(0)} s après la boutique · tâches longues ${lt2.length} (${sum(lt2)} ms) · images > 80 ms : ${after.length} (${[...byView].map(([v, n]) => `${v} ${n}`).join(', ') || '—'})`,
            `${be} · ${shell.quality} · ${window.innerWidth}×${window.innerHeight} @${devicePixelRatio}`,
            // (audit 12/11) décision 3 : format des tuiles ; décision 9 : stockage utilisé ; S02 : mémoire GPU
            `tuiles peintes : ${tileFormats()}`,
            storageLine,
            gpuMemLine(shell),
            ...[...after].sort((a, b) => b.ms - a.ms).slice(0, 10).map(frameLine),
          ].join('\n').slice(0, 1990);
          void net
            .pushLabFeedback({
              clientId: `diag-usage-${(localStorage.getItem('bebou.device') ?? 'x').slice(0, 30)}`,
              tester: 'diag',
              entries: [{ id: 'diag-usage', title: 'Usage', category: 'D', vote: 0, note: usage, updatedAt: new Date().toISOString() }],
              meta: { backend: be, userAgent: navigator.userAgent, quality: shell.quality, dpr: devicePixelRatio },
            })
            .catch(() => {});
          console.info('[usage]\n' + usage);
        } catch {
          /* rapport facultatif */
        }
      }, USAGE_REPORT_MS);
    } catch {
      /* rapport facultatif */
    }
  }, 6000);
}
