import { t } from '../../core/i18n';
import '../../core/i18n/fr/game.views.guide'; // (textes de ce module, version anglaise)
import type { GameBackend } from '../backend';
import { closeLayers, closePanels, esc, h, navigate } from '../ui';
import { REFERRAL } from '../../core/referral';

/**
 * VISITE GUIDÉE AUTOMATIQUE (ouverture 07/11) — à la première visite d'un compte, un curseur (flèche à l'ordinateur,
 * doigt au téléphone) fait seul et vite le tour du jeu : réserve, boosters, collection, échanges, jeux, amis, missions.
 * UNE SEULE FOIS par compte (marquée côté serveur dès qu'elle démarre — `users.markGuideSeen`) ; « Passer » à tout
 * moment. `?guide` dans l'adresse la rejoue sans rien marquer (tests, démo) ; `admin:resetGuide` la rend à un joueur.
 * (13/11) TOUR DES NOUVEAUTÉS V2 — même mécanique, pour les joueurs d'avant la V2 (visite guidée déjà vue) : joué
 * d'office une seule fois par compte (`users.markV2TourSeen`), sans « Passer », et il finit sur la page des mises à
 * jour (il remplace l'annonce, announce.ts). `?tourv2` le rejoue sans rien marquer ; `admin:resetV2Tour` le rend.
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
  { label: t('gd.express'), text: t('gd.hello', { name }) },
  { target: ['.me .packs'], label: t('gd.reserve'), text: t('gd.reserveD') },
  { target: ['.packs-row', '.open-btn'], label: t('gd.boosters'), text: t('gd.boostersD') },
  { nav: 'collection', label: t('gd.coll'), text: t('gd.collD') },
  { nav: 'echanges', label: t('gd.trades'), text: t('gd.tradesD') },
  { nav: 'jeux', label: t('gd.games'), text: t('gd.gamesD') },
  { nav: 'amis', label: t('gd.friends'), text: t('gd.friendsD', { n: REFERRAL.packs, m: REFERRAL.packs }) },
  { nav: '', target: ['.me .msn-btn', '.me .st-btn'], label: t('gd.daily'), text: t('gd.dailyD') },
  { target: ['.open-btn', '.packs-row'], label: t('gd.yours'), text: t('gd.yoursD'), end: true },
];

/** (13/11) nouveautés et gros changements de la V2 (updates.data.ts, « 14 nov. — Version 2 ») */
const V2_STEPS = (name: string): Step[] => [
  { label: t('gd.v2'), text: t('gd.v2D', { name }) },
  { nav: '', target: ['.ev-band'], label: t('gd.event'), text: t('gd.eventD') },
  { target: ['.chat-launch'], label: t('gd.chat'), text: t('gd.chatD') },
  { nav: 'echanges', target: ['button[role="tab"][data-z="pour"]'], label: t('gd.simple'), text: t('gd.simpleD') },
  { target: ['button[role="tab"][data-z="cherche"]'], label: t('gd.market'), text: t('gd.marketD') },
  { nav: 'collection', label: t('gd.new'), text: t('gd.newD') },
  { label: t('gd.six'), text: t('gd.sixD') },
  { nav: 'classement', target: ['.lb-boards [data-b="season"]'], label: t('gd.seasons'), text: t('gd.seasonsD') },
  { nav: 'profil', target: ['.nf-box'], label: t('gd.notifs'), text: t('gd.notifsD') },
  { nav: 'maj', label: t('gd.all'), text: t('gd.allD'), end: true },
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
    setTimeout(() => void run(STEPS(firstName(s.user?.name)), { skippable: true, go: t('gd.go'), label: t('gd.tour') }), 900);
  };
  backend.onChange(check);
  check();
}

/**
 * (13/11) Tour des nouveautés V2, d'office, une fois : comptes qui ont déjà eu la visite guidée (joueurs d'avant la V2)
 * et pas encore ce tour. Un compte tout neuf a la visite guidée à la place (le serveur marque alors les deux).
 */
export function armV2Tour(backend: GameBackend) {
  const forced = new URLSearchParams(location.search).has('tourv2');
  let started = false;
  let timer = 0;
  const check = () => {
    if (started) return;
    const s = backend.state;
    if (!forced && !(s.mode === 'online' && s.user && s.user.guideSeen && !s.user.v2TourSeen)) return;
    if (document.querySelector('.lc, .lg-veil, .gd') || document.body.classList.contains('opening')) {
      clearTimeout(timer);
      timer = window.setTimeout(check, 1000);
      return;
    }
    started = true;
    if (!forced) void backend.markV2TourSeen?.();
    setTimeout(() => void run(V2_STEPS(firstName(s.user?.name)), { skippable: false, go: t('gd.done'), label: t('gd.v2Tour') }), 900);
  };
  backend.onChange(check);
  check();
}

const firstName = (name?: string) => (name ?? '').replace(/^Bébou\s+/i, '').split(/\s+/)[0] || 'toi';

async function run(steps: Step[], opts: { skippable: boolean; go: string; label: string }) {
  closePanels();
  closeLayers();
  if (location.hash.replace(/^#\/?/, '') !== '') navigate('#/');
  const root = h('div', 'gd');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', opts.label);
  root.innerHTML = `<i class="gd-spot off"></i>
    <div class="gd-tip" aria-live="polite"><small class="gd-l"></small><p class="gd-t"></p><div class="gd-dots"></div><button class="btn-primary gd-go" hidden>${esc(opts.go)}</button></div>
    ${opts.skippable ? '<button class="gd-skip" type="button">' + t('gd.skip') + '</button>' : ''}
    <i class="gd-cur ${coarse() ? 'finger' : 'arrow'}">${coarse() ? '' : ARROW}</i>`;
  document.body.append(root);
  const spot = root.querySelector<HTMLElement>('.gd-spot')!;
  const tip = root.querySelector<HTMLElement>('.gd-tip')!;
  const cur = root.querySelector<HTMLElement>('.gd-cur')!;
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
  // (13/11) tour V2 : pas d'Échap, pas de « Passer » — seul le dernier écran se ferme (bouton ou toucher)
  const onKey = (e: KeyboardEvent) => opts.skippable && e.key === 'Escape' && stop();
  const onDown = (e: PointerEvent) => !tip.contains(e.target as Node) && stop();
  window.addEventListener('keydown', onKey);
  root.querySelector('.gd-skip')?.addEventListener('click', () => {
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
    // 2. élément montré (ou bulle seule) ; (13/11) présent mais hors de l'écran (fiche plus bas) : on y fait défiler
    const off = (st.target ?? []).map((q) => document.querySelector<HTMLElement>(q)).find((e) => e && !visible(e));
    if (off && !(st.target ?? []).some((q) => visible(document.querySelector(q)))) {
      off.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await sleep(450);
      if (!alive) break;
    }
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
