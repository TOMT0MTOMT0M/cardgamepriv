import { fmtDate, t as tr } from '../../core/i18n';
import '../../core/i18n/fr/game.views.auctions'; // (textes de ce module, version anglaise)
import './auctions.css';
import type { AuctionBoard, AuctionItem, GameBackend } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { fmtCoins } from '../../core/economy';
import { AUCTION_DAYS, auctionCapped, auctionEndsAt, auctionMax, auctionMinStart, auctionNextMin, parisDay } from '../../core/auctions';
import { marketSuggested } from '../../core/market';
import { busyButton, cardTile, errMsg, esc, h, starsHtml, toast } from '../ui';
import { COIN_ICON } from './wallet';
import { confirmTap } from './safety';
import { haptics } from '../../core/haptics';
import { showCardPanel } from './cardPanel';
import { DUR, EASING } from '../../core/motion';

/**
 * (V3) ENCHÈRES AU MARCHÉ — interface (règles : src/core/auctions.ts ; serveur : convex/auctions.ts ; démo :
 * src/game/auctionsLocal.ts). Deux briques, branchées par la vue du Marché :
 *  - `createAuctions` : la grille des enchères (pastille « Enchères » côté Acheter), et « Mes enchères » côté Vendre.
 *    Une tuile = la carte (toucher : sa fiche), l'offre en tête ou la mise à prix, le nombre d'offres, la fin
 *    (« ce soir 21 h », « demain 21 h »…), et un réglage − montant + avec « Offrir N » (deux touchers : « Offrir N ? »).
 *    Abonnement au serveur seulement entre `enter()` et `leave()`.
 *  - `auctionSellForm` : le formulaire « Enchère » de la feuille « Vendre » (mise à prix ≥ valeur de Forge, durée
 *    24 / 48 / 72 h, date de clôture affichée).
 * Couleur = information : seule la mention « En tête » / « Dépassé » est marquée.
 */
export interface AuctionsView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
  /** recherche commune (nom, étoile) */
  setFilter(q: string, star: RarityId | null): void;
  /** enchères des autres affichées */
  shown(): number;
}

const nameOf = (id: string) => catalogEntry(id)?.name ?? id;
const coin = (n: number) => `<span class="mk-c">${COIN_ICON}<b>${fmtCoins(n)}</b></span>`;
const fold = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** rafraîchit les « fin dans … » (ms) */
const TICK = 60_000;

/** « Fin ce soir 21 h » · « Fin demain 21 h » · « Fin sam. 29 21 h » · « Fin dans 42 min » */
export function endsLabel(endsAt: number, now = Date.now()): string {
  const left = endsAt - now;
  if (left <= 0) return tr('au.closing');
  if (left < 3600_000) return tr('au.endsIn', { t: `${Math.max(1, Math.ceil(left / 60_000))} min` });
  const dd = parisDay(endsAt) - parisDay(now);
  if (dd <= 0) return tr('au.endsTonight');
  if (dd === 1) return tr('au.endsTomorrow');
  return tr('au.endsDay', { day: fmtDate(endsAt, { weekday: 'short', day: 'numeric', timeZone: 'Europe/Paris' }) });
}
/** pas du réglage − / + : un dixième de la valeur de la carte (au moins 1) */
const stepOf = (r: RarityId) => Math.max(1, Math.round(marketSuggested(r) / 10));

export function createAuctions(backend: GameBackend, o: { chime(): void; mode?: 'buy' | 'sell' }): AuctionsView {
  const mode = o.mode ?? 'buy';
  const el = h('section', `au au-${mode}`);
  el.innerHTML = `
    <div class="au-mine" hidden><h3 class="mk-h">${tr('au.mine')} <small class="au-mine-n"></small></h3><div class="mk-grid au-g-mine"></div><ul class="mk-rl au-recent"></ul></div>
    <div class="mk-grid au-g-open"></div>
    <div class="mk-empty muted au-empty" hidden></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  let board: AuctionBoard = { open: [], recent: [] };
  let unwatch: (() => void) | null = null;
  let tick = 0;
  let needle = '';
  let star: RarityId | null = null;
  let shownN = 0;
  const meId = () => backend.state.user?.id ?? 'me';
  const isMine = (a: AuctionItem) => a.sellerId === meId() || a.sellerId === 'me';
  /** montant choisi par enchère (gardé d'un rendu à l'autre) */
  const amounts = new Map<string, number>();
  /** une tuile par enchère, recréée seulement si ce qu'elle montre change (le « Sûr ? » armé survit aux mises à jour) */
  const nodes = new Map<string, { sig: string; el: HTMLElement }>();

  function itemFor(a: AuctionItem): HTMLElement {
    const sig = `${a.bid ?? ''}|${a.bids}|${a.lead ? 1 : 0}|${isMine(a) ? 1 : 0}|${endsLabel(a.endsAt)}|${a.status}`;
    const had = nodes.get(a.id);
    if (had && had.sig === sig) return had.el;
    const w = item(a);
    if (had) had.el.replaceWith(w);
    nodes.set(a.id, { sig, el: w });
    return w;
  }

  function item(a: AuctionItem): HTMLElement {
    const w = h('div', `mk-item au-item r-${a.rarity}`);
    w.style.setProperty('--rc', rarity(a.rarity).hex);
    const t = cardTile(a.cardId, a.rarity);
    t.setAttribute('role', 'button');
    t.tabIndex = 0;
    t.setAttribute('aria-label', tr('au.seeCard', { name: nameOf(a.cardId) }));
    t.addEventListener('click', () => showCardPanel(backend, a.cardId));
    w.append(t);
    const mine = isMine(a);
    const price = a.bid ?? a.startPrice;
    // « En tête » quand c'est moi ; « Dépassé » quand j'ai été en tête… le serveur ne dit que `lead` : la mention
    // « Dépassé » se pose seulement dans cette session, quand une tuile où j'étais en tête ne l'est plus
    const state = a.lead ? `<span class="au-st lead">${tr('au.lead')}</span>` : outbid.has(a.id) ? `<span class="au-st out">${tr('au.outbid')}</span>` : '';
    const who = mine ? tr('au.byMe') : tr('au.by', { name: `<a class="mk-who" href="#/profil/${encodeURIComponent(a.sellerId)}">${esc(a.sellerName)}</a>` });
    const meta = h(
      'div',
      'mk-meta',
      `<div class="mk-pr">${coin(price)}${state}</div>
       <div class="mk-sub au-k">${a.bid === undefined ? tr('au.start') : tr('au.bids', { n: a.bids })}${a.bidderName && a.bid !== undefined && !a.lead ? ` · ${esc(a.bidderName)}` : ''}</div>
       <div class="mk-sub">${starsHtml(a.rarity)} · n°${a.mintNumber} · ${who}</div>
       <div class="mk-sub au-end">${endsLabel(a.endsAt)}</div>`,
    );
    meta.querySelector('.mk-who')?.addEventListener('click', (e) => e.stopPropagation());
    w.append(meta);
    if (mine) {
      if (a.bid === undefined) {
        const b = h('button', 'btn-ghost mk-cancel', tr('au.withdraw'));
        b.addEventListener('click', () => void cancel(a, b));
        w.append(b);
      } else w.append(h('div', 'mk-sub au-note', tr('au.locked')));
      return w;
    }
    if (a.lead || a.endsAt <= Date.now()) return w;
    if (auctionCapped(a)) {
      w.append(h('div', 'mk-sub au-note', tr('au.capped')));
      return w;
    }
    // réglage du montant : au moins l'offre minimale, au plus le plafond
    const min = auctionNextMin(a);
    const max = auctionMax(a.rarity);
    const cur = () => Math.min(max, Math.max(min, amounts.get(a.id) ?? min));
    const row = h(
      'div',
      'au-bidrow',
      `<button class="btn-ghost mk-step" data-d="-1" aria-label="${tr('au.less')}">−</button><output class="au-amt" aria-label="${tr('au.bidA')}">${fmtCoins(cur())}</output><button class="btn-ghost mk-step" data-d="1" aria-label="${tr('au.more')}">+</button>`,
    );
    const go = h('button', 'btn-primary mk-buy au-go', tr('au.bidN', { n: fmtCoins(cur()) })) as HTMLButtonElement;
    row.querySelectorAll<HTMLButtonElement>('.mk-step').forEach((s) =>
      s.addEventListener('click', () => {
        amounts.set(a.id, Math.min(max, Math.max(min, cur() + Number(s.dataset.d) * stepOf(a.rarity))));
        row.querySelector('.au-amt')!.textContent = fmtCoins(cur());
        go.textContent = tr('au.bidN', { n: fmtCoins(cur()) });
        delete go.dataset.armedAt;
      }),
    );
    go.addEventListener('click', () => void bid(a, cur(), go));
    w.append(row, h('div', 'mk-sub au-hint', tr('au.minNext', { n: fmtCoins(min), max: fmtCoins(max) })), go);
    return w;
  }

  /** enchères où j'étais en tête au rendu précédent (pour la mention « Dépassé ») */
  const leading = new Set<string>();
  const outbid = new Set<string>();

  let recentH = '';
  function render() {
    if (!el.isConnected) return;
    for (const a of board.open) {
      if (a.lead) leading.add(a.id);
      else if (leading.delete(a.id)) {
        outbid.add(a.id);
        nodes.delete(a.id); // la tuile se redessine avec « Dépassé »
      }
    }
    const ids = new Set(board.open.map((a) => a.id));
    for (const id of nodes.keys()) if (!ids.has(id)) (nodes.delete(id), amounts.delete(id));
    // mes enchères (côté Vendre) : ouvertes + résultats de la semaine
    const mine = board.open.filter(isMine);
    q('.au-mine').hidden = mode !== 'sell' || (!mine.length && !board.recent.length);
    q('.au-mine-n').textContent = mine.length ? String(mine.length) : '';
    q('.au-g-mine').replaceChildren(...mine.map(itemFor));
    const rh = board.recent
      .slice(0, 6)
      .map((a) => {
        const won = a.status === 'sold' && !isMine(a);
        const k = won ? 'au.recentWon' : a.status === 'sold' ? 'au.recentSold' : 'au.recentUnsold';
        const sum = a.status === 'sold' && a.bid ? `<span>${won ? '−' : '+'}${coin(a.bid)}</span>` : '';
        return `<li class="${a.status === 'sold' && !won ? 'in' : 'out'}"><b>${tr(k)}</b> ${esc(nameOf(a.cardId))} ${starsHtml(a.rarity)} ${sum}</li>`;
      })
      .join('');
    if (rh !== recentH) q('.au-recent').innerHTML = recentH = rh;
    // les enchères des autres (côté Acheter) : la plus proche de la fin d'abord (ordre du serveur)
    const list = mode === 'buy' ? board.open.filter((a) => !isMine(a) && (!star || a.rarity === star) && (!needle || fold(nameOf(a.cardId)).includes(needle))) : [];
    shownN = list.length;
    const g = q('.au-g-open');
    const want = list.map(itemFor);
    const fresh = want.filter((x) => x.parentElement !== g);
    g.replaceChildren(...want);
    if (g.getClientRects().length)
      fresh.forEach((x) => x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.standard(), easing: EASING.entree }));
    const empty = q('.au-empty');
    empty.hidden = mode !== 'buy' || list.length > 0;
    empty.textContent = board.open.some((a) => !isMine(a)) ? tr('au.noMatch') : tr('au.empty');
  }

  async function bid(a: AuctionItem, amount: number, b: HTMLButtonElement) {
    const coins = backend.eco.snapshot?.coins ?? 0;
    if (coins < amount) return toast(tr('au.short', { n: fmtCoins(amount - coins) }), 'err');
    if (!confirmTap(b, tr('au.bidSure', { n: fmtCoins(amount) }))) return;
    try {
      await busyButton(b, backend.auctionBid(a.id, amount));
      outbid.delete(a.id);
      amounts.delete(a.id);
      haptics.pulse([10, 40, 18]);
      o.chime();
      toast(tr('au.bidOk', { name: nameOf(a.cardId), n: fmtCoins(amount) }), 'ok');
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  }
  async function cancel(a: AuctionItem, b: HTMLButtonElement) {
    if (!confirmTap(b, tr('au.withdrawQ'))) return;
    try {
      await busyButton(b, backend.auctionCancel(a.id));
      toast(tr('au.back', { name: nameOf(a.cardId) }), 'ok');
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  }

  return {
    el,
    enter() {
      unwatch ??= backend.watchAuctions((b) => {
        board = b;
        render();
      });
      clearInterval(tick);
      tick = window.setInterval(render, TICK);
      render();
    },
    leave() {
      unwatch?.();
      unwatch = null;
      clearInterval(tick);
    },
    setFilter(text: string, s: RarityId | null) {
      needle = fold(text.trim());
      star = s;
      render();
    },
    shown: () => shownN,
  };
}

/**
 * Formulaire « Enchère » de la feuille « Vendre » pour la carte choisie : mise à prix (≥ valeur de Forge), durée,
 * date de clôture, bouton. `onDone` après la mise aux enchères (fermer la feuille), `onBack` : choisir une autre carte.
 */
export function auctionSellForm(backend: GameBackend, chosen: { cardId: string; rarity: RarityId }, o: { onDone(): void; onBack?(): void; backLabel?: string }): HTMLElement {
  const r = chosen.rarity;
  const min = auctionMinStart(r);
  const max = auctionMax(r);
  let days: number = AUCTION_DAYS[1];
  const f = h('div', 'au-sellf');
  f.innerHTML = `
    <label class="mk-pl">${tr('au.startA')} <span class="mk-hint">${tr('au.startHint', { min: coin(min), max: fmtCoins(max) })}</span></label>
    <div class="mk-prow"><button class="btn-ghost mk-step" data-d="-1" aria-label="${tr('au.less')}">−</button><input class="mk-pin au-pin" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${min}" aria-label="${tr('au.startA')}"><button class="btn-ghost mk-step" data-d="1" aria-label="${tr('au.more')}">+</button></div>
    <div class="mk-pl">${tr('au.dur')}</div>
    <div class="seg mk-dur au-dur" role="radiogroup" aria-label="${tr('au.durA')}">${AUCTION_DAYS.map((d) => `<button role="radio" data-d="${d}" class="${d === days ? 'on' : ''}" aria-checked="${d === days}">${d * 24} h</button>`).join('')}</div>
    <p class="muted mk-note au-when"></p>
    <div class="mk-pbtns">${o.onBack ? `<button class="btn-ghost au-back">${esc(o.backLabel ?? '')}</button>` : ''}<button class="btn-primary au-sgo">${tr('au.go')}</button></div>
    <p class="muted mk-note">${tr('au.leaves')}</p>`;
  const pin = f.querySelector<HTMLInputElement>('.au-pin')!;
  const go = f.querySelector<HTMLButtonElement>('.au-sgo')!;
  const val = () => Math.round(Number(pin.value) || 0);
  function sync() {
    go.disabled = !(val() >= min && val() <= max);
    const end = auctionEndsAt(Date.now(), days);
    const when = parisDay(end) - parisDay(Date.now()) === 1 ? tr('au.whenTomorrow') : tr('au.whenDay', { day: fmtDate(end, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) });
    f.querySelector('.au-when')!.textContent = tr('au.endsOn', { when });
  }
  pin.addEventListener('input', sync);
  f.querySelectorAll<HTMLButtonElement>('.mk-step').forEach((b) =>
    b.addEventListener('click', () => {
      pin.value = String(Math.min(max, Math.max(min, (val() || min) + Number(b.dataset.d) * stepOf(r))));
      sync();
    }),
  );
  f.querySelectorAll<HTMLButtonElement>('.au-dur [data-d]').forEach((b) =>
    b.addEventListener('click', () => {
      days = Number(b.dataset.d);
      f.querySelectorAll<HTMLButtonElement>('.au-dur [data-d]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      sync();
    }),
  );
  f.querySelector('.au-back')?.addEventListener('click', () => o.onBack?.());
  go.addEventListener('click', async () => {
    const price = val();
    try {
      await busyButton(go, backend.auctionCreate(chosen.cardId, r, price, days));
      toast(tr('au.listed', { name: nameOf(chosen.cardId), price: fmtCoins(price) }), 'ok');
      o.onDone();
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  });
  sync();
  return f;
}
