import type { GameBackend } from '../backend';
import { closeLayers, closePanels, esc, h, navigate } from '../ui';

/**
 * VISITE GUIDÉE AUTOMATIQUE (ouverture 07/11) — à la première visite d'un compte, un curseur (flèche à l'ordinateur,
 * doigt au téléphone) fait seul et vite le tour du jeu : réserve, boosters, collection, échanges, jeux, amis, missions.
 * UNE SEULE FOIS par compte (marquée côté serveur dès qu'elle démarre — `users.markGuideSeen`) ; « Passer » à tout
 * moment. `?guide` dans l'adresse la rejoue sans rien marquer (tests, démo) ; `admin:resetGuide` la rend à un joueur.
 */
type Step = {
  /** onglet à toucher d'abord (data-r de la navigation, '' = boutique) */
  nav?: string;
  /** élément montré (projecteur + curseur) : le premier visible de la liste (téléphone / ordinateur diffèrent) */
  target?: string[];
  label: string;
  text: string;
  /** dernier écran : bouton pour finir */
  end?: boolean;
};

const STEPS = (name: string): Step[] => [
  { label: 'Visite express', text: `Salut ${name} ! 30 secondes pour faire le tour, ensuite c’est à toi.` },
  { target: ['.me .packs'], label: 'Ta réserve', text: '15 boosters pour commencer. Un nouveau toutes les 5 min, et ×2 pendant tes 24 premières heures.' },
  { target: ['.packs-row', '.open-btn'], label: 'Les boosters', text: 'Choisis ton thème ici. Le Bebou Pack contient tout… et les cartes secrètes de la bande.' },
  { nav: 'collection', label: 'Ta collection', text: 'Touche une carte pour la faire tourner en 3D. Tes doublons se recyclent en contrats.' },
  { nav: 'echanges', label: 'Échanges', text: 'Propose un échange à un pote, ou poste une annonce sur le tableau d’offres.' },
  { nav: 'jeux', label: 'Jeux', text: 'Pack Battle, Battle Royale et la roulette : un pot de départ t’y attend (tirages à 10 h et 20 h).' },
  { nav: 'amis', label: 'Amis', text: 'Ton lien d’invitation est ici : 10 boosters offerts à chaque pote, et 10 pour toi.' },
  { nav: '', target: ['.me .msn-btn', '.me .st-btn'], label: 'Chaque jour', text: 'Missions, série de connexion et calendrier : des pièces et des boosters tous les jours.' },
  { target: ['.open-btn', '.packs-row'], label: 'À toi', text: 'Ouvre ton premier booster. Bonne chance pour les 6★ !', end: true },
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const coarse = () => matchMedia('(pointer: coarse)').matches;
const ARROW = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 2.5v17l4.6-4.3 3.1 7 2.9-1.3-3-6.9h6.3z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';

/** Branchée une fois le jeu affiché : démarre dès que le compte y a droit (et que rien n'est ouvert par-dessus). */
export function armGuide(backend: GameBackend) {
  const forced = new URLSearchParams(location.search).has('guide');
  let started = false;
  let timer = 0;
  const check = () => {
    if (started) return;
    const s = backend.state;
    if (!forced && !(s.mode === 'online' && s.user && !s.user.guideSeen)) return;
    // compte à rebours, fenêtre de connexion ou ouverture d'un booster en cours : on réessaie un peu plus tard
    if (document.querySelector('.lc, .lg-veil') || document.body.classList.contains('opening')) {
      clearTimeout(timer);
      timer = window.setTimeout(check, 1000);
      return;
    }
    started = true;
    if (!forced) void backend.markGuideSeen?.();
    setTimeout(() => void run(s.user?.name ?? ''), 900);
  };
  backend.onChange(check);
  check();
}

async function run(name: string) {
  closePanels();
  closeLayers();
  if (location.hash.replace(/^#\/?/, '') !== '') navigate('#/');
  const root = h('div', 'gd');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Visite guidée');
  root.innerHTML = `<i class="gd-spot off"></i>
    <div class="gd-tip" aria-live="polite"><small class="gd-l"></small><p class="gd-t"></p><div class="gd-dots"></div><button class="btn-primary gd-go" hidden>C’est parti</button></div>
    <button class="gd-skip" type="button">Passer</button>
    <i class="gd-cur ${coarse() ? 'finger' : 'arrow'}">${coarse() ? '' : ARROW}</i>`;
  document.body.append(root);
  const spot = root.querySelector<HTMLElement>('.gd-spot')!;
  const tip = root.querySelector<HTMLElement>('.gd-tip')!;
  const cur = root.querySelector<HTMLElement>('.gd-cur')!;
  const steps = STEPS(name.split(/\s+/)[0] || 'toi');
  root.querySelector('.gd-dots')!.innerHTML = steps.map(() => '<i></i>').join('');
  let alive = true;
  let finish: () => void = () => {};
  const done = new Promise<void>((r) => (finish = r));
  const stop = () => {
    if (!alive) return;
    alive = false;
    root.classList.add('out');
    setTimeout(() => root.remove(), 380);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onDown, { capture: true });
    finish();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stop();
  const onDown = (e: PointerEvent) => !tip.contains(e.target as Node) && stop();
  window.addEventListener('keydown', onKey);
  root.querySelector('.gd-skip')!.addEventListener('click', () => {
    stop();
    navigate('#/');
  });
  root.querySelector('.gd-go')!.addEventListener('click', stop);
  requestAnimationFrame(() => root.classList.add('on'));

  // le curseur part du coin bas-droit
  let cx = innerWidth - 40;
  let cy = innerHeight - 60;
  cur.style.transform = `translate(${cx}px, ${cy}px)`;
  const moveTo = async (x: number, y: number) => {
    const d = Math.hypot(x - cx, y - cy);
    const ms = Math.round(Math.min(460, 200 + d * 0.4));
    cur.style.transitionDuration = `${ms}ms`;
    cur.style.transform = `translate(${x}px, ${y}px)`;
    cx = x;
    cy = y;
    await sleep(ms);
  };
  const tap = async () => {
    cur.classList.add('tap');
    const r = h('i', 'gd-rip');
    r.style.left = `${cx}px`;
    r.style.top = `${cy}px`;
    root.append(r);
    setTimeout(() => r.remove(), 650);
    await sleep(170);
    cur.classList.remove('tap');
  };
  const visible = (el: Element | null): el is HTMLElement => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const place = (rect: DOMRect | null) => {
    const W = innerWidth;
    const H = innerHeight;
    const tw = Math.min(330, W - 24);
    tip.style.width = `${tw}px`;
    const th = tip.offsetHeight || 120;
    let x = W / 2 - tw / 2;
    let y = H * 0.55 - th / 2;
    if (rect) {
      x = Math.min(W - tw - 12, Math.max(12, rect.left + rect.width / 2 - tw / 2));
      y = rect.bottom + 18 + th < H - 12 ? rect.bottom + 18 : Math.max(12, rect.top - th - 18);
    }
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const light = (rect: DOMRect | null) => {
    spot.classList.toggle('off', !rect);
    if (!rect) return;
    const pad = 8;
    Object.assign(spot.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
  };

  for (let i = 0; i < steps.length && alive; i++) {
    const st = steps[i];
    tip.classList.remove('in');
    root.querySelectorAll('.gd-dots i').forEach((d, k) => d.classList.toggle('on', k <= i));
    // 1. onglet à toucher
    if (st.nav !== undefined) {
      const a = document.querySelector<HTMLElement>(`.topbar nav a[data-r="${st.nav}"]`);
      if (a) {
        a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        await sleep(120);
      }
      if (!alive) break;
      if (visible(a)) {
        const r = a.getBoundingClientRect();
        light(r);
        await moveTo(r.left + r.width / 2, r.top + r.height / 2);
        await tap();
      }
      navigate(st.nav ? `#/${st.nav}` : '#/');
      await sleep(450);
      if (!alive) break;
    }
    // 2. élément montré (ou bulle seule)
    const el = (st.target ?? []).map((q) => document.querySelector(q)).find(visible) ?? null;
    const rect = el ? el.getBoundingClientRect() : null;
    light(rect);
    tip.querySelector('.gd-l')!.textContent = st.label;
    tip.querySelector('.gd-t')!.innerHTML = esc(st.text);
    tip.querySelector<HTMLElement>('.gd-go')!.hidden = !st.end;
    place(rect);
    if (rect) await moveTo(rect.left + rect.width / 2, rect.top + rect.height / 2);
    else await moveTo(innerWidth / 2 + 60, innerHeight * 0.55 + 70);
    if (!alive) break;
    tip.classList.add('in');
    if (rect && i > 0) await tap();
    if (st.end) {
      // dernier écran : la page redevient touchable — toucher « Ouvrir » (ou n'importe où) termine la visite
      root.classList.add('last');
      setTimeout(() => alive && document.addEventListener('pointerdown', onDown, { capture: true }), 50);
      await Promise.race([done, sleep(12000)]);
      break;
    }
    await sleep(Math.min(2900, 900 + st.text.length * 20));
  }
  stop();
}
