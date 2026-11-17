import './comparateur.css';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

/**
 * COMPARATEUR LIVE / V3 (17/11) — https://v2.cardgamepriv.pages.dev/miroir/ — équipe seulement.
 * Deux copies de démo du jeu (sans serveur), superposées à la même taille : la live dessous, la V3 dessus, découpée
 * par la barre verticale (à gauche de la barre : la live, à droite : la V3). On la place où on veut, sans cran.
 * Chaque geste dans une copie est rejoué dans l'autre (src/miroir/sonde.js) : mêmes écrans, mêmes tirages, mêmes
 * défilements. Le son vient du côté où se trouve la souris. Les deux copies repartent du même état à chaque ouverture
 * (celui de la live). Copies construites par scripts/miroir/build.mjs (lanceurs/mettre-en-ligne-v2.cmd).
 */
type Side = 'live' | 'v3';
interface Msg {
  k: string;
  seq?: number;
  [key: string]: unknown;
}
interface Sonde {
  side: Side;
  ready: boolean;
  replay(m: Msg): void;
  setAudible(on: boolean): void;
}

const root = document.getElementById('mr')!;
const POS_KEY = 'miroir.cmp.x';
const SESSION_KEY = 'cardlab.session_token';

async function isStaff(): Promise<boolean> {
  const url = (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim();
  const token = localStorage.getItem(SESSION_KEY);
  if (!url || !token) return false;
  try {
    const me = await new ConvexHttpClient(url).query(api.users.me, { sessionToken: token });
    return !!me?.staff;
  } catch {
    return false;
  }
}

/** les deux copies repartent du même état : celui de la live (stockage local et de session) */
function syncStorage(s: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) keys.push(s.key(i)!);
  for (const k of keys) if (k.startsWith('miroir.v3.')) s.removeItem(k);
  for (const k of keys) if (k.startsWith('miroir.live.')) s.setItem(`miroir.v3.${k.slice('miroir.live.'.length)}`, s.getItem(k)!);
}

function start() {
  try {
    syncStorage(localStorage);
    syncStorage(sessionStorage);
  } catch {
    /* stockage bloqué */
  }
  const frames = {} as Record<Side, HTMLIFrameElement>;
  for (const side of ['live', 'v3'] as const) {
    const f = document.createElement('iframe');
    f.className = `mr-f mr-${side}`;
    f.title = side === 'live' ? 'Version en ligne' : 'V3';
    f.allow = 'autoplay; fullscreen; clipboard-read; clipboard-write; gyroscope; accelerometer';
    frames[side] = f;
  }
  const bar = document.createElement('div');
  bar.className = 'mr-bar';
  bar.setAttribute('role', 'separator');
  bar.setAttribute('aria-orientation', 'vertical');
  bar.setAttribute('aria-label', 'Live ⟷ V3');
  bar.innerHTML = `<div class="mr-grip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="mr-tag l">LIVE</span><span class="mr-tag r">V3</span></div>`;
  const wait = document.createElement('div');
  wait.className = 'mr-wait';
  wait.textContent = 'chargement des deux versions…';
  root.append(frames.live, frames.v3, bar, wait);

  // ---- la barre : libre, de 0 à 100 %
  let ratio = 0.5;
  try {
    const r = Number(localStorage.getItem(POS_KEY));
    if (r >= 0 && r <= 1 && localStorage.getItem(POS_KEY) !== null) ratio = r;
  } catch {
    /* */
  }
  const place = () => root.style.setProperty('--x', `${(ratio * root.clientWidth).toFixed(1)}px`);
  place();
  addEventListener('resize', place);
  bar.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('drag');
    root.classList.add('drag');
    const move = (ev: PointerEvent) => {
      ratio = Math.min(1, Math.max(0, ev.clientX / root.clientWidth));
      place();
    };
    const up = () => {
      bar.classList.remove('drag');
      root.classList.remove('drag');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      try {
        localStorage.setItem(POS_KEY, String(ratio));
      } catch {
        /* */
      }
    };
    move(e);
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });

  // ---- relais des gestes
  const sonde = (s: Side) => (frames[s].contentWindow as (Window & { __sonde?: Sonde }) | null)?.__sonde;
  const other = (s: Side): Side => (s === 'live' ? 'v3' : 'live');
  const ready = { live: false, v3: false };
  let leader: Side = 'live';
  let seq = 0;
  const audio = () => {
    sonde('live')?.setAudible(leader === 'live');
    sonde('v3')?.setAudible(leader === 'v3');
  };
  const both = () => ready.live && ready.v3;
  const open = () => {
    wait.classList.add('off');
    audio();
  };
  (window as unknown as { __miroir: unknown }).__miroir = {
    relay(side: Side, m: Msg): number {
      if (m.k === 'r') {
        ready[side] = true;
        if (both()) open();
        return 0;
      }
      if (!both()) return 0;
      const o = sonde(other(side));
      // conséquences (défilement, adresse) : seulement celles du côté qui reçoit les vrais gestes
      if (m.k === 's' || m.k === 'h') {
        if (side === leader) o?.replay(m);
        return 0;
      }
      if (side !== leader) {
        leader = side;
        audio();
      }
      m.seq = ++seq;
      o?.replay(m);
      return m.seq;
    },
  };
  // si l'une des copies se recharge (« Réparer », mise à jour…), tout repart ensemble du même état
  for (const side of ['live', 'v3'] as const) {
    let loads = 0;
    frames[side].addEventListener('load', () => {
      if (++loads > 1) location.reload();
    });
  }
  // filet : au bout de 40 s on laisse la main, même si une copie n'a pas signalé la fin de son chargement
  setTimeout(() => {
    if (!both()) {
      ready.live = ready.v3 = true;
      open();
    }
  }, 40_000);
  // les réglages de l'adresse passent aux deux copies (`?lang=en`, `?backend=webgl`, `?god`, `?force=…` de la démo…)
  const q = new URLSearchParams(location.search);
  q.delete('demo');
  const qs = `?demo${q.size ? `&${q}` : ''}`;
  frames.live.src = `./live/jeu/${qs}`;
  frames.v3.src = `./v3/jeu/${qs}`;
}

function gate() {
  root.innerHTML = `<div class="mr-gate"><p>Comparateur réservé à l’équipe.<br>Connecte-toi d’abord sur <a href="../jeu/">le jeu V3</a>, puis reviens ici.</p></div>`;
}

void isStaff().then((ok) => (ok ? start() : gate()));
