import '../core/i18n/fr/game.offline'; // (textes de ce module, version anglaise)
import { t } from '../core/i18n';
import { rarity } from '../core/rarity';
import { catalogEntry, hasArt, isWonderId } from '../core/sets/themes';
import type { GameBackend, PlayerCard } from './backend';
import { artUrl, errMsg, fmtDec, fmtN, h, thumbUrl, toast } from './ui';
import { bundleStatus, downloadBundle } from './bundle';

/**
 * GROS CACHE, suite (V2, docs/IDEES-V2.md §1 ter) — ce que `bundle.ts` (le jeu installé) ne range pas : les
 * ILLUSTRATIONS des cartes, servies depuis R2 (`/art/…?v=`, adresses versionnées donc immuables).
 *
 *  1. Petit à petit, tout seul : les miniatures des cartes POSSÉDÉES, les plus récentes d’abord (300 au plus), dans le
 *     cache des illustrations du service worker (`bebou-art-v1`, plafonné et élagué par public/sw.js). Seulement onglet
 *     visible, hors ouverture, quand le fil principal respire, jamais en économie de données / 2G, 4 à la fois.
 *     Ce sont des images que la collection affiche de toute façon : demandées une fois au lieu de plusieurs.
 *  2. « Tout télécharger » (Profil › Compte, fiche « Hors connexion ») : le jeu entier (palier 3 compris : Merveilles en 3D),
 *     les miniatures de TOUTE la collection et les illustrations pleine définition des cartes 4★ et plus, dans un cache à
 *     part jamais élagué (`bebou-garde-v1`, servi d'abord par le service worker). Barre de progression, « Arrêter ».
 *     Une carte remplacée a une nouvelle adresse : l'ancienne copie est retirée au téléchargement suivant.
 *
 * Coût : rien côté Convex ; côté R2, chaque image n'est demandée qu'une fois par appareil.
 */
const ART = 'bebou-art-v1'; // (même nom que public/sw.js)
const KEEP = 'bebou-garde-v1'; // (même nom que public/sw.js)
const AUTO_MAX = 300; // (≈ 4 Mo une seule fois par appareil — l’audit PERF2-04 refuse de tout charger à chaque session)
/** tailles moyennes pour l'estimation affichée (miniature WebP ~15 Ko, illustration pleine ~180 Ko) */
const THUMB_KB = 15;
const FULL_KB = 180;

const usable = () => !import.meta.env.DEV && 'caches' in window && 'serviceWorker' in navigator;
const slowNet = () => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c?.saveData || /2g/.test(c?.effectiveType ?? '');
};
const idle = () => new Promise<void>((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(), { timeout: 3000 }) : setTimeout(r, 300)));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const abs = (u: string) => new URL(u, location.href).href;

/** adresses des illustrations de la collection : miniatures de tout, pleine définition des 4★ et plus */
function artOf(cards: readonly PlayerCard[], full: boolean): string[] {
  const out = new Set<string>();
  for (const c of cards) {
    const e = catalogEntry(c.cardId);
    if (!e || (!hasArt(e) && !isWonderId(e.id))) continue;
    out.add(abs(thumbUrl(e)));
    if (full && hasArt(e) && rarity(c.rarity).rank >= 3) out.add(abs(artUrl(e)));
  }
  return [...out];
}

async function inAny(caches2: Cache[], url: string) {
  for (const c of caches2) if (await c.match(url)) return true;
  return false;
}

async function store(cache: Cache, url: string): Promise<number> {
  const r = await fetch(url);
  if (!r.ok || r.status !== 200 || /text\/html/.test(r.headers.get('content-type') ?? '')) return 0;
  const n = Number(r.headers.get('content-length') ?? 0);
  await cache.put(url, r);
  return n;
}

let autoStarted = false;
/** 1. Miniatures des cartes possédées, en fond. `busy` : une ouverture est en cours → on patiente. */
export function prefetchCollectionArt(backend: GameBackend, busy: () => boolean = () => false): void {
  if (autoStarted || !usable() || slowNet()) return;
  autoStarted = true;
  void (async () => {
    const cards = [...backend.state.collection].sort((a, b) => (b.firstPulledAt ?? 0) - (a.firstPulledAt ?? 0)).slice(0, AUTO_MAX);
    const urls = artOf(cards, false);
    const [art, keep] = await Promise.all([caches.open(ART), caches.open(KEEP)]);
    for (let i = 0; i < urls.length; ) {
      while (busy() || document.visibilityState === 'hidden') await wait(1500);
      await idle();
      const batch = urls.slice(i, i + 4);
      i += 4;
      await Promise.all(
        batch.map(async (u) => {
          if (await inAny([keep, art], u)) return;
          try {
            await store(art, u);
          } catch (e) {
            if ((e as Error)?.name === 'QuotaExceededError') i = urls.length;
          }
        }),
      );
    }
  })().catch(() => undefined);
}

/** 2. Fiche « Hors connexion » (Profil › Compte). */
export function offlinePanel(backend: GameBackend): HTMLElement {
  const box = h('div', 'nf-box off-box');
  if (!usable()) {
    box.innerHTML = '<span class="muted">' + t('off.demo') + '</span>';
    return box;
  }
  let running = false;
  let stopAsked = false;
  // (version anglaise) « 12,5 Mo » / « 12.5 MB »
  const mo = (b: number) => t('unit.mb', { n: fmtDec(Math.max(0, b) / 1e6 >= 10 ? Math.round(b / 1e6) : Math.round(b / 1e5) / 10) });

  async function measure() {
    const urls = artOf(backend.state.collection, true);
    const [art, keep] = await Promise.all([caches.open(ART), caches.open(KEEP)]);
    let have = 0;
    const missing: string[] = [];
    for (const u of urls) (await inAny([keep, art], u)) ? have++ : missing.push(u);
    const game = await bundleStatus();
    const est = missing.reduce((n, u) => n + (/\/thumbs\/|cartes3d/.test(u) ? THUMB_KB : FULL_KB) * 1000, 0) + (game ? game.total - game.have : 0);
    return { urls, have, missing, game, est };
  }

  async function render() {
    if (running) return;
    box.innerHTML = '<div class="nf-row"><b class="off-t">' + t('off.title') + '</b><span class="muted">calcul…</span></div>';
    const m = await measure();
    const done = !m.missing.length && (!m.game || m.game.have >= m.game.total);
    box.innerHTML = `
      <div class="nf-row"><b class="off-t">${t('off.title')}</b><span class="muted">${t('off.intro')}</span></div>
      <div class="off-l"><span>${t('off.game')}</span><b>${m.game ? `${mo(m.game.have)} / ${mo(m.game.total)}` : '—'}</b></div>
      <div class="off-l"><span>${t('off.art')}</span><b>${fmtN(m.have)} / ${fmtN(m.urls.length)}</b></div>
      <div class="nf-row">${done ? '<span class="off-ok">' + t('off.allHere') + '</span>' : `<button class="btn-primary off-go">${t('off.dlAll', { size: mo(m.est) })}</button>`}
        <span class="muted">${t('off.what')}</span></div>`;
    box.querySelector<HTMLButtonElement>('.off-go')?.addEventListener('click', (ev) => void run(ev.currentTarget as HTMLButtonElement, m));
  }

  async function run(btn: HTMLButtonElement, m: Awaited<ReturnType<typeof measure>>) {
    running = true;
    stopAsked = false;
    void navigator.storage?.persist?.().catch(() => undefined);
    const total = Math.max(1, m.est);
    let got = 0;
    const row = btn.parentElement!;
    row.innerHTML = `<div class="off-bar" role="progressbar" aria-label="${t('off.aria')}" aria-valuemin="0" aria-valuemax="100"><i></i></div><button class="btn-ghost off-stop">${t('off.stop')}</button><span class="muted off-p"></span>`;
    const bar = row.querySelector<HTMLElement>('.off-bar')!;
    const fill = bar.querySelector<HTMLElement>('i')!;
    const label = row.querySelector<HTMLElement>('.off-p')!;
    const tick = (bytes: number) => {
      got += bytes;
      const k = Math.min(1, got / total);
      fill.style.transform = `scaleX(${k.toFixed(3)})`;
      bar.setAttribute('aria-valuenow', String(Math.round(k * 100)));
      label.textContent = `${mo(got)} / environ ${mo(total)}`;
    };
    tick(0);
    row.querySelector<HTMLButtonElement>('.off-stop')!.addEventListener('click', () => (stopAsked = true));
    try {
      // le jeu (Merveilles 3D comprises) puis les illustrations
      await downloadBundle(tick, () => stopAsked);
      const keep = await caches.open(KEEP);
      // ménage : une illustration remplacée (nouvelle adresse) ou une carte qui n'est plus à moi
      const want = new Set(m.urls);
      for (const r of await keep.keys()) if (!want.has(r.url)) void keep.delete(r);
      const queue = [...m.missing];
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          for (let u = queue.shift(); u && !stopAsked; u = queue.shift()) {
            try {
              const n = await store(keep, u);
              tick(n || (/\/thumbs\/|cartes3d/.test(u) ? THUMB_KB : FULL_KB) * 1000);
            } catch (e) {
              if ((e as Error)?.name === 'QuotaExceededError') {
                stopAsked = true;
                toast(t('off.noSpace'), 'err');
              } else if (!navigator.onLine) {
                stopAsked = true;
                toast(t('off.netCut'), 'info');
              }
            }
          }
        }),
      );
      if (!stopAsked) toast(t('off.done'), 'ok');
    } catch (e) {
      toast(errMsg(e), 'err');
    }
    running = false;
    void render();
  }

  void render();
  return box;
}
