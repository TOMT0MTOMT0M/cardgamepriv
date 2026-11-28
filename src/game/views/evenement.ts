import '../../core/i18n/fr/game.views.evenement'; // (textes de ce module, version anglaise)
import '../avent.css';
import { t as tr, type MsgKey } from '../../core/i18n';
import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import {
  ADVENT_DAYS,
  ADVENT_LAST_DAY,
  ADVENT_LAYOUT,
  ADVENT_REWARDS,
  adventDay,
  adventPhase,
  adventReward,
  adventStartAt,
  doorOpenable,
  doorState,
  type AdventReward,
  type DoorState,
} from '../../core/avent';
import { adventCosmetic } from '../../core/cosmetics';
import { fmtCoins } from '../../core/economy';
import { fmtLeft, liveEvent, type PackEvent } from '../../core/events';
import { DUR, STAGGER } from '../../core/motion';
import { icon, type IconName } from '../cosmeticArt';
import { busyButton, errMsg, esc, h, toast } from '../ui';
import { COIN_ICON } from './wallet';
import { createAventMusic } from '../aventMusic';

/**
 * ONGLET ÉVÉNEMENT (#/evenement, 20/11) : ce qui est temporaire, au même endroit.
 *  1. le CALENDRIER DE L'AVENT (src/core/avent.ts) : un vrai calendrier en relief — 24 volets d'acier brossé montés
 *     sur charnière (CSS 3D), qui s'inclinent sous le doigt / la souris ; un volet ouvert pivote sur sa tranche gauche
 *     et laisse voir la niche éclairée et son cadeau. La case du jour laisse filtrer la lumière ; la 24 est à part,
 *     plus grande : le God Pack ;
 *  2. le BOOSTER DU MOMENT (src/core/events.ts), quand il y en a un : un raccourci vers la boutique.
 * Mode test (équipe, démo) : une réglette simule le jour de décembre, « Tout refermer » remet les 24 cases.
 * Aucune requête en plus : les cases ouvertes arrivent avec l'économie (`EcoSnapshot.advent`).
 */
export interface EvenementView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

const PACK = '<svg viewBox="0 0 16 20" width="15" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M3 4h10v12H3z" fill="currentColor" fill-opacity=".16" stroke-width="1.2"/><path d="M3 4l1.25-2L5.5 4l1.25-2L8 4l1.25-2L10.5 4l1.25-2L13 4M3 16l1.25 2L5.5 16l1.25 2L8 16l1.25 2 1.25-2 1.25 2L13 16" stroke-width="1.1"/></svg>';
const GOD = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2l2.2 6.9L21 11l-6.8 2.1L12 20l-2.2-6.9L3 11l6.8-2.1z" fill="currentColor"/><circle cx="19" cy="5" r="1.3" fill="currentColor"/><circle cx="5.5" cy="18" r="1" fill="currentColor"/></svg>';

export function createEvenementView(backend: GameBackend, shell: Shell): EvenementView {
  const el = h('section', 'view evenement');
  el.style.setProperty('--av-open', `${DUR.dramatique}ms`);
  el.style.setProperty('--av-stg', `${STAGGER.serre}ms`);
  el.innerHTML = `
    <div class="sc-wrap evt-wrap">
      <header class="sc-head evt-head"><div><span class="kicker">${tr('evt.kicker')}</span><h1>${tr('evt.title')}</h1></div></header>
      <a class="evt-pack" href="#/" hidden></a>
      <section class="av" aria-label="${tr('av.title')}">
        <canvas class="av-snow" aria-hidden="true"></canvas>
        <div class="av-top"><div><b class="av-t">${tr('av.title')}</b><span class="av-sub">${tr('av.sub')}</span></div><div class="av-tr"><button class="av-mus" type="button" aria-pressed="false"></button><div class="av-status"></div></div></div>
        <a class="av-godbar" href="#/" hidden></a>
        <div class="av-stage"><div class="av-board"><div class="av-grid"><i class="av-tree" aria-hidden="true"></i></div></div></div>
        <div class="av-rail" aria-label="${tr('av.rail')}"></div>
        <div class="av-dbg" hidden></div>
      </section>
      <p class="evt-none muted" hidden>${tr('evt.none')}</p>
    </div>`;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const grid = q('.av-grid');
  const stage = q('.av-stage');
  const board = q('.av-board');
  const statusEl = q('.av-status');
  const railEl = q('.av-rail');
  const dbgEl = q('.av-dbg');
  const godBar = q<HTMLAnchorElement>('.av-godbar');
  const packEl = q<HTMLAnchorElement>('.evt-pack');

  /** jour simulé par le mode test (null : la vraie date) */
  let debugDay: number | null = null;
  /** cases en cours d'ouverture (appel parti) et cases dont l'ouverture vient d'être jouée ici */
  const pending = new Set<number>();
  const doors = new Map<number, HTMLButtonElement>();
  let events: PackEvent[] = [];

  const opened = () => backend.eco.snapshot?.advent?.opened ?? [];
  const canDebug = () => backend.state.mode !== 'online' || !!backend.eco.snapshot?.isAdmin;
  const today = () => debugDay ?? adventDay(Date.now());
  const sfx = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* son indisponible */
    }
  };

  // (v2.1.13) une case peut donner boosters ET pièces (21), ou un ou deux cosmétiques de Noël (3, 6, 10…, 23)
  const COS_ICON: Record<string, IconName> = { frame: 'frame', banner: 'banner', pfx: 'banner', opening: 'pen' };
  const cosOf = (r: AdventReward) => (r.cos ?? []).map((x) => ({ kind: x.kind, c: adventCosmetic(x.kind, x.id) })).filter((x) => !!x.c);
  const rewardHtml = (r: AdventReward) => {
    if (r.god) return `<i class="av-ico god">${GOD}</i><em>${tr('av.god')}</em>`;
    const parts: string[] = [];
    for (const x of cosOf(r)) parts.push(`<i class="av-ico cos">${icon(COS_ICON[x.kind] ?? 'badge', 18)}</i><em class="av-cos">${esc(x.c!.label)}</em>`);
    if (r.packs) parts.push(`<i class="av-ico">${PACK}</i><em>× ${r.packs}</em>`);
    if (r.coins) parts.push(`<i class="av-ico">${COIN_ICON}</i><em>${fmtCoins(r.coins)}</em>`);
    return parts.length > 1 ? `<span class="av-duo">${parts.map((p) => `<span>${p}</span>`).join('')}</span>` : parts.join('');
  };
  const rewardText = (r: AdventReward) => {
    if (r.god) return tr('av.god');
    const parts = cosOf(r).map((x) => `${tr(`av.k.${x.kind}` as MsgKey)} « ${x.c!.label} »`); // i18n-ok (guillemets)
    if (r.packs) parts.push(tr('av.packs', { n: r.packs }));
    if (r.coins) parts.push(tr('av.coins', { n: fmtCoins(r.coins) }));
    return parts.join(' · ');
  };

  /**
   * (23/11, retours Tom) EN FORME DE SAPIN : l'étoile (la 24, le God Pack) au sommet, six étages de 1 à 6 cases
   * (les 21 premières du tirage mélangé), et le tronc (2 cases). Grille de 12 colonnes, une case en prend 2 : chaque
   * étage est centré à la demi-case près. Les volets alternent rouge, or et crème, comme des boules sur le sapin.
   */
  const TIERS = [1, 2, 3, 4, 5, 6];
  const slots: Array<{ row: number; col: number; kind: 'star' | 'tree' | 'trunk' }> = [{ row: 1, col: 5, kind: 'star' }];
  TIERS.forEach((k, r) => {
    for (let j = 0; j < k; j++) slots.push({ row: r + 2, col: 7 - k + 2 * j, kind: 'tree' });
  });
  slots.push({ row: TIERS.length + 2, col: 5, kind: 'trunk' }, { row: TIERS.length + 2, col: 7, kind: 'trunk' });
  const order = [ADVENT_DAYS, ...ADVENT_LAYOUT];
  const BALLS = ['red', 'gold', 'cream'];
  order.forEach((day, i) => {
    const at = slots[i];
    const d = h('button', `av-door av-${at.kind === 'tree' ? 'branch' : at.kind}${day === ADVENT_DAYS ? ' av-24' : ''}${at.kind === 'tree' ? ` b-${BALLS[(i + at.row) % BALLS.length]}` : ''}`);
    d.type = 'button';
    d.dataset.d = String(day);
    d.style.gridRow = String(at.row);
    d.style.gridColumn = `${at.col} / span ${at.kind === 'star' ? 4 : 2}`;
    // cascade d'arrivée : du sommet vers le tronc
    d.style.setProperty('--i', String(i));
    d.innerHTML = `<span class="av-niche">${rewardHtml(adventReward(day))}</span><span class="av-leaf"><span class="av-front"><b>${day}</b><i class="av-knob" aria-hidden="true"></i></span><span class="av-back" aria-hidden="true"></span></span>`;
    d.addEventListener('click', () => void tap(day, d));
    doors.set(day, d);
    grid.append(d);
  });

  function paintDoor(day: number) {
    const d = doors.get(day)!;
    const s: DoorState = doorState(day, today(), opened());
    const shown = pending.has(day) ? 'opening' : s;
    if (d.dataset.s !== shown) d.dataset.s = shown;
    const label = `${tr('av.doorA', { n: day })} · ${tr(`av.s.${s}` as MsgKey, { n: day })}`;
    if (d.getAttribute('aria-label') !== label) d.setAttribute('aria-label', label);
  }

  function paint() {
    const t = today();
    const phase = adventPhase(t);
    const done = opened().length;
    for (const day of doors.keys()) paintDoor(day);
    const count = `<b>${tr('av.count', { n: done })}</b>`;
    if (phase === 'before') statusEl.innerHTML = `<span>${tr('av.in')}</span><b class="av-cd">${fmtLeft(adventStartAt() - Date.now())}</b>`;
    else if (phase === 'over') statusEl.innerHTML = `<span>${tr('av.over')}</span>${count}`;
    else statusEl.innerHTML = `<span>${t <= ADVENT_DAYS ? tr('av.day', { n: t }) : tr('av.catchUp')}</span>${count}`;
    el.querySelector('.av')!.setAttribute('data-phase', phase);
    // (v2.1.13) cosmétiques de Noël : chacun donné par SA case, allumé une fois la case ouverte
    const got = opened();
    railEl.innerHTML = `<i class="av-rail-bar"><i style="--p:${(done / ADVENT_DAYS).toFixed(4)}"></i></i>${ADVENT_REWARDS.flatMap((r, i) =>
      cosOf(r).map((x) => {
        const n = i + 1;
        return `<span class="av-step${got.includes(n) ? ' on' : ''}" style="--at:${(n / ADVENT_DAYS).toFixed(4)}" title="${esc(`${tr(`av.k.${x.kind}` as MsgKey)} « ${x.c!.label} » · ${tr('av.railN', { n })}`)}"><i>${icon(COS_ICON[x.kind] ?? 'badge', 14)}</i><b>${n}</b><em>${esc(x.c!.label)}</em></span>`; // i18n-ok (guillemets)
      }),
    ).join('')}`;
    const gods = backend.eco.snapshot?.advent?.godPacks ?? 0;
    godBar.hidden = gods === 0;
    if (gods) godBar.innerHTML = `<i class="av-ico god">${GOD}</i><span><b>${tr('av.godWait', { n: gods })}</b><small>${tr('av.godD')}</small></span><em>${tr('av.godGo')} →</em>`;
    paintDebug();
    paintPack();
  }

  function paintPack() {
    const ev = liveEvent(events);
    packEl.hidden = !ev;
    if (ev) {
      packEl.style.setProperty('--ev', ev.accent);
      packEl.innerHTML = `<i class="ev-dot" aria-hidden="true"></i><span class="ev-txt"><span class="ev-k">${tr('evt.pack')}</span><b class="ev-n">${esc(ev.name)}</b></span><span class="ev-left"><small>${tr('evt.packLeft', { left: fmtLeft(ev.endAt - Date.now()) })}</small><b>${tr('evt.packGo')} →</b></span>`;
    }
    q('.evt-none').hidden = !!ev || adventPhase(today()) !== 'over' || canDebug();
  }

  function paintDebug() {
    dbgEl.hidden = !canDebug();
    if (dbgEl.hidden) return;
    const v = debugDay ?? adventDay(Date.now());
    if (!dbgEl.firstChild) {
      dbgEl.innerHTML = `<b>${tr('av.dbg')}</b><label><span>${tr('av.dbgDay')}</span><input type="range" min="0" max="${ADVENT_LAST_DAY + 1}" step="1"><output></output></label>
        <button class="btn-ghost sm" data-a="real">${tr('av.dbgReal')}</button><button class="btn-ghost sm" data-a="all">${tr('av.dbgAll')}</button><button class="btn-ghost sm" data-a="reset">${tr('av.dbgReset')}</button>`;
      const range = dbgEl.querySelector('input')!;
      range.addEventListener('input', () => {
        debugDay = Number(range.value);
        paint();
      });
      dbgEl.querySelector('[data-a="real"]')!.addEventListener('click', () => {
        debugDay = null;
        paint();
      });
      dbgEl.querySelector<HTMLElement>('[data-a="reset"]')!.addEventListener('click', async (e) => {
        try {
          await busyButton(e.currentTarget as HTMLElement, backend.eco.resetAdvent());
          toast(tr('av.dbgDone'), 'ok');
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      });
      // (test des 24 animations d'affilée : chaque case s'ouvre à son tour, au jour 24 simulé)
      dbgEl.querySelector<HTMLElement>('[data-a="all"]')!.addEventListener('click', async () => {
        debugDay = Math.max(ADVENT_DAYS, debugDay ?? 0) > ADVENT_LAST_DAY ? ADVENT_DAYS : Math.max(ADVENT_DAYS, debugDay ?? 0);
        paint();
        for (let day = 1; day <= ADVENT_DAYS; day++) {
          if (!el.isConnected) return;
          if (opened().includes(day)) continue;
          await tap(day, doors.get(day)!, true);
          await new Promise((r) => setTimeout(r, DUR.standard()));
        }
      });
    }
    dbgEl.querySelector('input')!.value = String(v);
    dbgEl.querySelector('output')!.textContent = v <= 0 ? '< 1' : v > ADVENT_LAST_DAY ? '> 31' : String(v);
    dbgEl.classList.toggle('sim', debugDay !== null);
  }

  /** Le cadeau qui s'élève de la niche et le bandeau du bas (la case 24 mène à la boutique). */
  function celebrate(day: number, d: HTMLElement, r: AdventReward) {
    const fly = h('span', `av-fly${r.god ? ' god' : ''}`, rewardText(r));
    d.append(fly);
    setTimeout(() => fly.remove(), DUR.ceremonie);
    sfx(() => {
      shell.sfx.thump(r.god ? 0.6 : 0.3);
      if (r.god) (shell.sfx.shimmer(5, 2.2, 0.11), shell.sfx.chime(6, 0.13));
      else if (r.coins) [0, 1, 2].forEach((k) => shell.sfx.coin(k, 0.08, 0.12 + k * 0.07));
      else shell.sfx.chime(Math.min(5, 2 + (r.packs ?? 1)), 0.09);
    });
    if (r.god) d.classList.add('burst');
    toast(`${tr('av.doorA', { n: day })} · ${rewardText(r)}`, 'ok');
    for (const x of cosOf(r)) toast(tr('av.cosGot', { kind: tr(`av.k.${x.kind}` as MsgKey), name: x.c!.label }), 'info');
  }

  async function tap(day: number, d: HTMLButtonElement, quiet = false) {
    if (pending.has(day)) return;
    const s = doorState(day, today(), opened());
    if (s === 'opened') return;
    if (!doorOpenable(s)) {
      // volet verrouillé : il résiste (petit coup sec), avec la raison
      d.classList.remove('nope');
      void d.offsetWidth;
      d.classList.add('nope');
      sfx(() => shell.sfx.tick(0.7, 0.06));
      if (!quiet) toast(s === 'closed' ? tr('av.missed') : adventPhase(today()) === 'before' ? tr('av.soon') : tr('av.wait', { n: day }), 'info');
      return;
    }
    if (backend.state.mode === 'online' && !backend.state.user) return void toast(tr('evt.login'), 'info');
    // le volet s'entrouvre tout de suite (le loquet saute) ; il s'ouvre en grand quand le serveur a répondu
    pending.add(day);
    paintDoor(day);
    sfx(() => shell.sfx.tick(1.5, 0.07));
    try {
      const res = await backend.eco.openAdvent(day, debugDay ?? undefined);
      pending.delete(day);
      // (l'économie arrive par son abonnement : on n'attend pas pour ouvrir le volet)
      d.dataset.s = 'opened';
      celebrate(day, d, res.reward);
    } catch (e) {
      pending.delete(day);
      paintDoor(day);
      toast(errMsg(e), 'err');
    }
  }

  // ── relief : le calendrier s'incline vers le pointeur (une écriture par image, rien quand il ne bouge pas)
  let tiltRaf = 0;
  let tx = 0, ty = 0;
  const applyTilt = () => {
    tiltRaf = 0;
    board.style.setProperty('--rx', `${(-ty * 7).toFixed(2)}deg`);
    board.style.setProperty('--ry', `${(tx * 9).toFixed(2)}deg`);
    board.style.setProperty('--lx', `${(50 + tx * 40).toFixed(1)}%`);
    board.style.setProperty('--ly', `${(50 + ty * 40).toFixed(1)}%`);
  };
  const setTilt = (x: number, y: number) => {
    tx = Math.max(-1, Math.min(1, x));
    ty = Math.max(-1, Math.min(1, y));
    tiltRaf ||= requestAnimationFrame(applyTilt);
  };
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    board.classList.add('live');
    setTilt(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  });
  const rest = () => {
    board.classList.remove('live');
    setTilt(0, 0);
  };
  stage.addEventListener('pointerleave', rest);
  stage.addEventListener('pointercancel', rest);

  // ── neige : une quarantaine de flocons sur un canevas 2D, seulement tant que la page est affichée
  const snow = q<HTMLCanvasElement>('.av-snow');
  let snowRaf = 0;
  let snowRo: ResizeObserver | null = null;
  function startSnow() {
    const ctx = snow.getContext('2d');
    if (!ctx || snowRaf) return;
    const box = snow.parentElement!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    let W = 0, H = 0;
    const size = () => {
      W = box.clientWidth;
      H = box.clientHeight;
      snow.width = Math.round(W * dpr);
      snow.height = Math.round(H * dpr);
    };
    size();
    const flakes = Array.from({ length: 42 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.7, v: 0.012 + Math.random() * 0.03, w: Math.random() * Math.PI * 2, a: 0.18 + Math.random() * 0.5 }));
    let last = performance.now();
    const draw = (dt: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      for (const f of flakes) {
        f.y += f.v * dt * (0.6 + f.r * 0.5);
        f.w += dt * (0.4 + f.r * 0.3);
        if (f.y > 1.03) (f.y = -0.03), (f.x = Math.random());
        ctx.globalAlpha = f.a;
        ctx.beginPath();
        ctx.arc((f.x + Math.sin(f.w) * 0.012) * W, f.y * H, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    // (audit perf n°12) la taille du panneau est suivie par un ResizeObserver : plus de lecture de `clientWidth` / `clientHeight`
    // à chaque image (mise en page ou recalcul de style forcé dans le rAF, 337 lectures forcées pour 3,5 s au téléphone)
    snowRo?.disconnect();
    snowRo = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (!el.isConnected || (box.clientWidth === W && box.clientHeight === H)) return;
      size();
      draw(0); // (redimensionner vide la toile : on la redessine tout de suite, pas une image plus tard)
    });
    snowRo?.observe(box);
    const frame = (now: number) => {
      if (!el.isConnected) return void (snowRaf = 0);
      snowRaf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      draw(dt);
    };
    snowRaf = requestAnimationFrame(frame);
  }

  // ── (23/11) petite musique de Noël tant que l'onglet est affiché ; un bouton la coupe (retenu sur l'appareil)
  const MUS_KEY = 'av-music';
  const music = createAventMusic(shell.sfx);
  const musBtn = q<HTMLButtonElement>('.av-mus');
  const musOn = () => {
    try {
      return localStorage.getItem(MUS_KEY) !== '0';
    } catch {
      return true;
    }
  };
  const paintMus = () => {
    const on = musOn();
    musBtn.setAttribute('aria-pressed', String(on));
    musBtn.classList.toggle('on', on);
    musBtn.innerHTML = `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M6 12.2V3.4l7-1.6v8.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="4.4" cy="12.3" r="1.9" fill="currentColor"/><circle cx="11.4" cy="10.6" r="1.9" fill="currentColor"/>${on ? '' : '<path d="M2 2l12 12" stroke="currentColor" stroke-width="1.4"/>'}</svg><span>${tr(on ? 'av.musOn' : 'av.musOff')}</span>`;
    musBtn.setAttribute('aria-label', tr('av.musA'));
  };
  musBtn.addEventListener('click', () => {
    const on = !musOn();
    try {
      localStorage.setItem(MUS_KEY, on ? '1' : '0');
    } catch {
      /* stockage indisponible : réglage de la visite */
    }
    if (on) music.start();
    else music.stop();
    paintMus();
  });

  backend.eco.onChange(() => el.isConnected && paint());
  backend.watchEvents?.((list) => {
    events = list;
    if (el.isConnected) paintPack();
  });
  // compte à rebours et changement de jour (minuit à Paris) : une fois par minute suffit
  let timer = 0;

  return {
    el,
    enter() {
      shell.show(null);
      shell.setDimmed(true);
      el.scrollTop = 0;
      paint();
      // les volets se posent en cascade à l'arrivée
      grid.classList.remove('in');
      void grid.offsetWidth;
      grid.classList.add('in');
      startSnow();
      paintMus();
      if (musOn()) music.start();
      clearInterval(timer);
      timer = window.setInterval(() => el.isConnected && paint(), 60_000);
    },
    leave() {
      music.stop();
      clearInterval(timer);
      cancelAnimationFrame(snowRaf);
      snowRaf = 0;
      snowRo?.disconnect();
      snowRo = null;
    },
  };
}
