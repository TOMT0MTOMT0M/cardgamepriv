import { t as tr } from '../../core/i18n';
import { onUniqueTitles, utag } from '../uniqueTitle';
import '../../core/i18n/fr/game.views.market'; // (textes de ce module, version anglaise)
import { BOARD_HOURS, cardKey, lockedCards, type GameBackend, type MarketBoard, type MarketItem } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { fmtCoins } from '../../core/economy';
import { wantsCard } from '../../core/wishFams';
import { MARKET_MAX_OPEN, marketMax, marketSuggested } from '../../core/market';
import { busyButton, cardTile, errMsg, esc, h, popLayer, pushLayer, starsHtml, toast } from '../ui';
import { COIN_ICON } from './wallet';
import { confirmTap } from './safety';
import { haptics } from '../../core/haptics';
import { loadPanel, showCardPanel } from './cardPanel';
import { DUR, EASING, STAGGER } from '../../core/motion';

/**
 * MARCHÉ (retours Hugo 10/11 : « Échanges c'est complètement fouillis… on peut rajouter un marché, bien plus simple
 * visuellement, pas d'enchères »). Premier onglet de la page Échanges.
 *  - Une grille de GRANDES cartes en vente, chacune avec son prix en pièces, le vendeur et UN bouton « Acheter »
 *    (deux touchers : « Sûr ? » puis l'achat). Recherche, étoiles, tri (récent / prix).
 *  - « Vendre une carte » : on choisit une de ses cartes libres (doublons d'abord), on règle le prix (prix conseillé =
 *    la valeur de la carte, plafond 10×), et c'est en vente. Elle quitte la collection jusqu'à la vente ou au retrait.
 *  - « Mes ventes » : mes cartes en vente (Retirer) et ce que j'ai vendu / acheté cette semaine.
 * Couleur = information : l'étiquette « −30 % » / « +80 % » compare le prix à la valeur de la carte.
 * Règles : src/core/market.ts · serveur : convex/market.ts (abonnement seulement quand l'onglet est à l'écran).
 */
export interface MarketView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
  /** (refonte 11/11) recherche commune de la zone « Chercher » de la page Échanges : nom et étoile */
  setFilter(q: string, star: RarityId | null): void;
  /** nombre de cartes en vente affichées (hors les miennes) */
  shown(): number;
}

type Sort = 'new' | 'cheap' | 'dear';
const STARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const fold = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nameOf = (id: string) => catalogEntry(id)?.name ?? id;
const coin = (n: number) => `<span class="mk-c">${COIN_ICON}<b>${fmtCoins(n)}</b></span>`;
/** (V3, lot 09) anti-rebond de la recherche du Marché (ms) : une frappe ne redessine plus la grille, la pause oui */
const TYPE_DEBOUNCE = 80;

/**
 * (13/11, retours Hugo) deux usages de la page Marché : `buy` (zone « Chercher » : les cartes en vente, à acheter) et
 * `sell` (zone « Vendre · Échanger » : mettre une carte en vente OU à l'échange, et mes ventes).
 */
export function createMarket(backend: GameBackend, o: { chime(): void; mode?: 'buy' | 'sell'; onListed?(): void }): MarketView {
  const mode = o.mode ?? 'buy';
  const el = h('section', `mk mk-${mode}`);
  el.innerHTML = `
    <div class="mk-head">
      ${mode === 'sell'
        ? `<div class="mk-intro"><span class="kicker">${tr('mk.sellK')}</span><p class="muted">${tr('mk.sellIntro')}</p></div>`
        : `<div class="mk-intro"><span class="kicker">${tr('mk.buyK')}</span><p class="muted">${tr('mk.buyIntro')}</p></div>`}
      <div class="mk-acts"><span class="mk-wallet" title="${tr('mk.coinsA')}"></span>${mode === 'sell' ? `<button class="btn-primary mk-sell-btn">${tr('mk.pick')}</button>` : ''}</div>
    </div>
    <div class="mk-mine" hidden><h3 class="mk-h">${tr('mk.mine')} <small class="mk-mine-n"></small></h3><div class="mk-grid mk-g-mine"></div><div class="mk-recent"></div></div>
    <div class="mk-tools">
      <input class="search mk-q" type="search" placeholder="${tr('mk.searchPh')}" autocomplete="off" spellcheck="false" aria-label="${tr('mk.searchA')}">
      <div class="mk-stars" role="group" aria-label="${tr('mk.stars')}">${STARS.map((r) => `<button class="chip" data-r="${r}" style="--rc:${rarity(r).hex}" title="${rarity(r).label}">${rarity(r).rank + 1}★</button>`).join('')}</div>
      <select class="mk-sort" aria-label="${tr('mk.sort')}"><option value="new">${tr('mk.newest')}</option><option value="cheap">Prix croissant</option><option value="dear">${tr('mk.priceDesc')}</option></select>
    </div>
    <div class="mk-mytools" role="group" aria-label="${tr('mk.mineA')}"><button class="chip" data-mf="missing" aria-pressed="false">${tr('mk.fMissing')}</button><button class="chip" data-mf="wish" aria-pressed="false">${tr('mk.fWish')}</button></div>
    <div class="mk-grid mk-g-open"></div>
    <div class="mk-empty muted" hidden></div>
    <div class="mk-sheet" hidden role="dialog" aria-label="${tr('mk.sell')}">
      <div class="mk-sheet-b">
        <div class="mk-sh-top"><h3 class="mk-h">${tr('mk.sellOrTrade')}</h3><button class="mk-x" aria-label="${tr('common.close')}">✕</button></div>
        <div class="mk-pick">
          <div class="mk-tools"><input class="search mk-pq" type="search" placeholder="${tr('mk.searchColl')}" autocomplete="off" spellcheck="false" aria-label="${tr('mk.searchMine')}"><label class="tr-tog"><input type="checkbox" class="mk-dups" checked><span>${tr('mk.dupsOnly')}</span></label></div>
          <div class="mk-grid mini mk-g-pick"></div>
        </div>
        <div class="mk-price" hidden>
          <div class="mk-chosen"></div>
          <div class="mk-pform">
            <div class="seg mk-how" role="radiogroup" aria-label="${tr('mk.howA')}"><button role="radio" data-how="sell" class="on" aria-checked="true">${tr('mk.howSell')}</button><button role="radio" data-how="trade" aria-checked="false">${tr('mk.howTrade')}</button></div>
            <div class="mk-sellf">
            <label class="mk-pl">${tr('mk.price')} <span class="mk-hint"></span></label>
            <div class="mk-prow"><button class="btn-ghost mk-step" data-d="-1" aria-label="${tr('mk.cheaper')}">−</button><input class="mk-pin" type="number" inputmode="numeric" min="1" step="1" aria-label="${tr('mk.priceA')}"><button class="btn-ghost mk-step" data-d="1" aria-label="${tr('mk.dearer')}">+</button></div>
            <div class="mk-cmp"></div>
            <div class="mk-pbtns"><button class="btn-ghost mk-back">${tr('mk.another')}</button><button class="btn-primary mk-go">${tr('mk.list')}</button></div>
            <p class="muted mk-note">${tr('mk.leaves')}</p>
            </div>
            <div class="mk-tradef" hidden>
              <p class="mk-tnote">${tr('mk.tradeNote')}</p>
              <div class="mk-pl">${tr('mk.dur')}</div>
              <div class="seg mk-dur" role="radiogroup" aria-label="${tr('mk.durA')}">${BOARD_HOURS.map((x, i) => `<button role="radio" data-h="${x}" class="${i === BOARD_HOURS.length - 1 ? 'on' : ''}" aria-checked="${i === BOARD_HOURS.length - 1}">${x} h</button>`).join('')}</div>
              <div class="mk-pbtns"><button class="btn-ghost mk-back2">${tr('mk.another')}</button><button class="btn-primary mk-trade-go">${tr('mk.tradeGo')}</button></div>
              <p class="muted mk-note">${tr('mk.tradeKeep')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const gOpen = q('.mk-g-open');
  const gMine = q('.mk-g-mine');
  const sheet = q('.mk-sheet');
  const pin = q<HTMLInputElement>('.mk-pin');
  let board: MarketBoard = { open: [], sold: [], bought: [] };
  let unwatch: (() => void) | null = null;
  let star: RarityId | null = null;
  let sort: Sort = 'new';
  let chosen: { cardId: string; rarity: RarityId } | null = null;
  const meId = () => backend.state.user?.id ?? 'me';
  const isMine = (m: MarketItem) => m.sellerId === meId() || m.sellerId === 'me';
  let shownN = 0;
  // (V3) « je l'ai / ♥ envie » : tout vient de l'état déjà en mémoire (collection, envies), aucun appel serveur
  let ownedIds = new Set<string>();
  let onlyMissing = false;
  let onlyWished = false;
  const wantedCard = (cardId: string) => wantsCard(backend.state.wishlist, backend.state.wishFams, cardId);

  /** étiquette prix / valeur : vert = sous la valeur, rouge = bien au-dessus */
  function cmpHtml(r: RarityId, price: number) {
    const v = marketSuggested(r);
    if (!v) return '';
    const d = Math.round(((price - v) / v) * 100);
    if (Math.abs(d) < 5) return '<span class="mk-tag fair">' + tr('mk.atPrice') + '</span>';
    return `<span class="mk-tag ${d < 0 ? 'low' : d > 60 ? 'high' : 'up'}">${d > 0 ? '+' : '−'}${Math.abs(d)} %</span>`;
  }

  /**
   * (V3, lot 09) ANNONCES RECYCLÉES : un nœud `.mk-item` par annonce, gardé d'un rendu à l'autre (clé = id + ce qui
   * s'affiche). Filtrer, trier ou recevoir une mise à jour du serveur ne recrée plus les tuiles : les vignettes ne
   * se rechargent plus (plus de fondu « img.in » à chaque lettre), et le « Sûr ? » d'un bouton Acheter armé survit.
   */
  const nodes = new Map<string, { sig: string; el: HTMLElement }>();
  function itemFor(m: MarketItem): HTMLElement {
    const sig = `${m.price}|${m.rarity}|${m.cardId}|${m.mintNumber}|${isMine(m) ? 1 : 0}|${m.sellerName}|${utag(m.sellerId, { compact: true }).length}|${ownedIds.has(m.cardId) ? 1 : 0}${wantedCard(m.cardId) ? 1 : 0}`;
    const had = nodes.get(m.id);
    if (had && had.sig === sig) return had.el;
    const w = item(m);
    w.dataset.mk = m.id;
    nodes.set(m.id, { sig, el: w });
    return w;
  }
  /**
   * Remet `grid` dans l'ordre de `want` en ne déplaçant que les nœuds mal placés (un nœud bien placé n'est pas
   * touché : pas de reflow de ses images). Les annonces VISIBLES glissent de leur ancienne place à la nouvelle (FLIP,
   * transform seul) ; celles qui arrivent apparaissent en fondu ; celles qui partent sont simplement retirées.
   */
  function syncGrid(grid: HTMLElement, want: HTMLElement[]) {
    const cur = [...grid.children] as HTMLElement[];
    if (cur.length === want.length && cur.every((x, i) => x === want[i])) return;
    // ce qui est à l'écran avant (la grille masquée ou hors écran n'anime rien)
    const vh = innerHeight;
    const live = grid.getClientRects().length > 0;
    const first = new Map<HTMLElement, DOMRect>();
    if (live) {
      for (const x of cur) {
        const r = x.getBoundingClientRect();
        if (r.top > vh + 40) break; // (grille dans l'ordre : tout le reste est plus bas)
        if (r.bottom > -40) first.set(x, r);
      }
    }
    const keep = new Set(want);
    for (const x of cur) if (!keep.has(x)) x.remove();
    // pose dans l'ordre : on ne déplace un nœud que s'il n'est pas déjà à sa place
    let at: ChildNode | null = grid.firstChild;
    for (const x of want) {
      if (x === at) at = at.nextSibling;
      else grid.insertBefore(x, at);
    }
    if (!live) return;
    const dur = DUR.emphatique();
    let n = 0;
    for (const x of want) {
      // (un glissement encore en cours fausserait la mesure : il repart de là où l'œil le voit, `first`)
      for (const an of x.getAnimations()) an.cancel();
      const r = x.getBoundingClientRect();
      if (r.top > vh + 40) break;
      if (r.bottom < -40) continue;
      const a = first.get(x);
      if (a) {
        const dx = a.left - r.left, dy = a.top - r.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        x.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: dur, easing: EASING.standard });
      } else {
        // arrivée : fondu court, en léger décalé (plafonné)
        x.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: DUR.standard(), delay: Math.min(STAGGER.max, n++ * STAGGER.serre), easing: EASING.entree, fill: 'backwards' });
      }
    }
  }

  function item(m: MarketItem): HTMLElement {
    const w = h('div', `mk-item r-${m.rarity}`);
    w.style.setProperty('--rc', rarity(m.rarity).hex);
    const t = cardTile(m.cardId, m.rarity);
    // (13/11, retours Hugo) toute la carte se touche : sa fiche (qui l'a, prix moyen, qui la veut)
    t.setAttribute('role', 'button');
    t.tabIndex = 0;
    t.setAttribute('aria-label', tr('mk.seeCard', { name: nameOf(m.cardId) }));
    t.addEventListener('click', () => showCardPanel(backend, m.cardId));
    w.append(t);
    const own = !isMine(m) && ownedIds.has(m.cardId);
    const wish = !isMine(m) && wantedCard(m.cardId);
    const marks = own || wish ? `<div class="mk-marks">${own ? `<span class="mk-mark own">${tr('mk.have')}</span>` : ''}${wish ? `<span class="mk-mark wish">${tr('mk.wish')}</span>` : ''}</div>` : '';
    const who = isMine(m) ? 'toi' : `par <a class="mk-who" href="#/profil/${encodeURIComponent(m.sellerId)}">${esc(m.sellerName)}</a>${utag(m.sellerId, { compact: true })}`; // i18n-ok
    const meta = h('div', 'mk-meta', `<div class="mk-pr">${coin(m.price)}${cmpHtml(m.rarity, m.price)}</div>${marks}<div class="mk-sub">${starsHtml(m.rarity)} · n°${m.mintNumber} · ${who}</div>`);
    meta.querySelector('.mk-who')?.addEventListener('click', (e) => e.stopPropagation());
    w.append(meta);
    const b = h('button', isMine(m) ? 'btn-ghost mk-cancel' : 'btn-primary mk-buy', isMine(m) ? tr('mk.withdraw') : tr('mk.buy'));
    b.addEventListener('click', () => void (isMine(m) ? cancel(m, b) : buy(m, b)));
    w.append(b);
    return w;
  }

  let walletN = -1;
  let recentH = '';
  function render() {
    if (!el.isConnected) return;
    const coins = backend.eco.snapshot?.coins ?? 0;
    if (coins !== walletN) q('.mk-wallet').innerHTML = coin((walletN = coins));
    // annonces disparues du tableau (vendues, retirées) : leur nœud est oublié
    const ids = new Set(board.open.map((m) => m.id));
    for (const id of nodes.keys()) if (!ids.has(id)) nodes.delete(id);
    // mes ventes
    const mine = board.open.filter(isMine);
    q('.mk-mine').hidden = mode !== 'sell' || (!mine.length && !board.sold.length && !board.bought.length);
    q('.mk-mine-n').textContent = mine.length ? `${mine.length}/${MARKET_MAX_OPEN}` : '';
    syncGrid(gMine, mine.map(itemFor));
    const recent = [...board.sold.map((m) => ({ m, sold: true })), ...board.bought.map((m) => ({ m, sold: false }))].sort((a, b) => (b.m.resolvedAt ?? 0) - (a.m.resolvedAt ?? 0)).slice(0, 6);
    const rh = recent.length
      ? `<ul class="mk-rl">${recent.map(({ m, sold }) => `<li class="${sold ? 'in' : 'out'}"><b>${sold ? tr('mk.sold') : tr('mk.bought')}</b> ${esc(nameOf(m.cardId))} ${starsHtml(m.rarity)} <span>${sold ? '+' : '−'}${coin(m.price)}</span></li>`).join('')}</ul>`
      : '';
    if (rh !== recentH) q('.mk-recent').innerHTML = recentH = rh;
    // en vente
    const needle = fold(q<HTMLInputElement>('.mk-q').value.trim());
    ownedIds = new Set(backend.state.collection.map((c) => c.cardId));
    const list = board.open
      .filter((m) => !isMine(m) && (!star || m.rarity === star) && (!needle || fold(nameOf(m.cardId)).includes(needle)) && (!onlyMissing || !ownedIds.has(m.cardId)) && (!onlyWished || wantedCard(m.cardId)))
      .sort((a, b) => (sort === 'cheap' ? a.price - b.price : sort === 'dear' ? b.price - a.price : b.createdAt - a.createdAt));
    shownN = list.length;
    syncGrid(gOpen, list.map(itemFor));
    const empty = q('.mk-empty');
    empty.hidden = list.length > 0;
    empty.textContent = board.open.some((m) => !isMine(m)) ? tr('mk.noMatch') : tr('mk.nothing');
  }

  async function buy(m: MarketItem, b: HTMLButtonElement) {
    const coins = backend.eco.snapshot?.coins ?? 0;
    if (coins < m.price) return toast(tr('mk.short', { n: fmtCoins(m.price - coins) }), 'err');
    if (!confirmTap(b, tr('mk.sure', { price: fmtCoins(m.price) }))) return;
    try {
      await busyButton(b, backend.marketBuy(m.id, m.price));
      haptics.pulse([10, 40, 18]);
      o.chime();
      toast(tr('mk.got', { name: nameOf(m.cardId) }), 'ok');
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  }
  async function cancel(m: MarketItem, b: HTMLButtonElement) {
    if (!confirmTap(b, tr('mk.withdrawQ'))) return;
    try {
      await busyButton(b, backend.marketCancel(m.id));
      toast(tr('mk.back', { name: nameOf(m.cardId) }), 'ok');
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  }

  // ── filtres
  let typeT = 0;
  q('.mk-q').addEventListener('input', () => {
    clearTimeout(typeT);
    typeT = window.setTimeout(render, TYPE_DEBOUNCE);
  });
  q('.mk-sort').addEventListener('change', (e) => ((sort = (e.target as HTMLSelectElement).value as Sort), render()));
  el.querySelectorAll<HTMLButtonElement>('.mk-stars .chip').forEach((b) =>
    b.addEventListener('click', () => {
      star = star === b.dataset.r ? null : (b.dataset.r as RarityId);
      el.querySelectorAll<HTMLButtonElement>('.mk-stars .chip').forEach((x) => x.classList.toggle('on', x.dataset.r === star));
      render();
    }),
  );

  el.querySelectorAll<HTMLButtonElement>('.mk-mytools .chip').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.mf === 'missing') onlyMissing = !onlyMissing;
      else onlyWished = !onlyWished;
      const on = b.dataset.mf === 'missing' ? onlyMissing : onlyWished;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      render();
    }),
  );

  // ── vendre : choisir une carte libre, puis son prix
  function renderPick() {
    const locked = lockedCards(backend.state);
    const dups = q<HTMLInputElement>('.mk-dups').checked;
    const needle = fold(q<HTMLInputElement>('.mk-pq').value.trim());
    const mine = backend.state.collection
      .map((c) => ({ c, free: c.count - (locked.get(cardKey(c)) ?? 0) }))
      .filter(({ c, free }) => c.rarity !== 'secret' && free > 0 && (!dups || c.count >= 2) && catalogEntry(c.cardId) && (!needle || fold(nameOf(c.cardId)).includes(needle)))
      .sort((a, b) => rarity(b.c.rarity).rank - rarity(a.c.rarity).rank || b.c.count - a.c.count)
      .slice(0, 120);
    const g = q('.mk-g-pick');
    g.replaceChildren(
      ...mine.map(({ c }) => {
        const t = cardTile(c.cardId, c.rarity, { count: c.count, mini: true });
        t.addEventListener('click', () => choose(c.cardId, c.rarity));
        return t;
      }),
    );
    if (!mine.length) g.append(h('div', 'muted', dups ? tr('mk.noDup') : tr('mk.noFree')));
  }
  function choose(cardId: string, r: RarityId) {
    chosen = { cardId, rarity: r };
    q('.mk-pick').hidden = true;
    q('.mk-price').hidden = false;
    q('.mk-chosen').replaceChildren(cardTile(cardId, r));
    pin.max = String(marketMax(r));
    pin.value = String(marketSuggested(r));
    q('.mk-hint').innerHTML = tr('mk.value', { v: coin(marketSuggested(r)), max: fmtCoins(marketMax(r)) });
    // (13/11, retours Hugo) prix de référence : la moyenne des ventes de la carte, quand elle s'est déjà vendue
    void loadPanel(backend, cardId)
      .then((p) => {
        if (!p.sold || chosen?.cardId !== cardId) return;
        q('.mk-hint').innerHTML += tr('mk.soldAvg', { avg: coin(p.sold.avg), n: p.sold.n });
      })
      .catch(() => undefined);
    setHow('sell');
    syncPrice();
  }
  function syncPrice() {
    if (!chosen) return;
    const p = Math.round(Number(pin.value) || 0);
    q('.mk-cmp').innerHTML = p > 0 ? cmpHtml(chosen.rarity, p) : '';
    q<HTMLButtonElement>('.mk-go').disabled = !(p >= 1 && p <= marketMax(chosen.rarity));
  }
  pin.addEventListener('input', syncPrice);
  el.querySelectorAll<HTMLButtonElement>('.mk-step').forEach((b) =>
    b.addEventListener('click', () => {
      if (!chosen) return;
      const v = marketSuggested(chosen.rarity);
      const stepV = Math.max(1, Math.round(v / 10));
      pin.value = String(Math.min(marketMax(chosen.rarity), Math.max(1, (Math.round(Number(pin.value)) || v) + Number(b.dataset.d) * stepV)));
      syncPrice();
    }),
  );
  const backToPick = () => {
    chosen = null;
    q('.mk-price').hidden = true;
    q('.mk-pick').hidden = false;
  };
  q('.mk-back').addEventListener('click', backToPick);
  q('.mk-back2').addEventListener('click', backToPick);
  // (13/11, retours Hugo « on peut vendre mais pas la proposer en échange ») les deux options pour la même carte
  let hours: number = BOARD_HOURS[BOARD_HOURS.length - 1];
  function setHow(how: 'sell' | 'trade') {
    el.querySelectorAll<HTMLButtonElement>('.mk-how [data-how]').forEach((b) => {
      const on = b.dataset.how === how;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    q('.mk-sellf').hidden = how !== 'sell';
    q('.mk-tradef').hidden = how !== 'trade';
  }
  el.querySelectorAll<HTMLButtonElement>('.mk-how [data-how]').forEach((b) => b.addEventListener('click', () => setHow(b.dataset.how as 'sell' | 'trade')));
  el.querySelectorAll<HTMLButtonElement>('.mk-dur [data-h]').forEach((b) =>
    b.addEventListener('click', () => {
      hours = Number(b.dataset.h);
      el.querySelectorAll<HTMLButtonElement>('.mk-dur [data-h]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
    }),
  );
  q('.mk-trade-go').addEventListener('click', async () => {
    if (!chosen) return;
    if (backend.state.mode === 'online' && !backend.state.user) return toast(tr('mk.loginTrade'), 'info');
    try {
      await busyButton(q('.mk-trade-go'), backend.createListing([{ cardId: chosen.cardId, rarity: chosen.rarity, count: 1 }], [], undefined, hours));
      toast(tr('mk.tradeListed', { name: nameOf(chosen.cardId), h: hours }), 'ok');
      closeSheet();
      o.onListed?.();
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  });
  q('.mk-go').addEventListener('click', async () => {
    if (!chosen) return;
    const price = Math.round(Number(pin.value));
    try {
      await busyButton(q('.mk-go'), backend.marketSell(chosen.cardId, chosen.rarity, price));
      toast(tr('mk.listed', { name: nameOf(chosen.cardId), price: fmtCoins(price) }), 'ok');
      closeSheet();
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  });
  q('.mk-pq').addEventListener('input', renderPick);
  q('.mk-dups').addEventListener('change', renderPick);
  function openSheet() {
    chosen = null;
    q('.mk-pick').hidden = false;
    q('.mk-price').hidden = true;
    sheet.hidden = false;
    renderPick();
    pushLayer(closeSheet);
  }
  function closeSheet() {
    sheet.hidden = true;
    popLayer(closeSheet);
  }
  el.querySelector('.mk-sell-btn')?.addEventListener('click', openSheet);
  q('.mk-x').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => e.target === sheet && closeSheet());

  backend.eco.onChange(() => el.isConnected && render());
  onUniqueTitles(() => el.isConnected && render());
  // (relecture 27/11) backend.onChange part à chaque changement d'état (pièces, présence…) : ne redessiner que si la
  // collection (ses lignes) ou les envies ont bougé — en ligne, ces tableaux sont recréés à chaque relecture du joueur
  let mineSig = '';
  backend.onChange(() => {
    if (!el.isConnected) return;
    if (!sheet.hidden && !chosen) renderPick();
    const s = backend.state;
    const sig = `${s.collection.length}|${s.wishlist.join(',')}|${s.wishFams.join(',')}`;
    if (sig === mineSig) return;
    mineSig = sig;
    render(); // collection / envies changées : marques et filtres à jour
  });

  return {
    el,
    enter() {
      unwatch ??= backend.watchMarket((b) => {
        board = b;
        render();
      });
      render();
    },
    leave() {
      unwatch?.();
      unwatch = null;
      if (!sheet.hidden) closeSheet();
    },
    setFilter(text: string, s: RarityId | null) {
      q<HTMLInputElement>('.mk-q').value = text;
      star = s;
      el.querySelectorAll<HTMLButtonElement>('.mk-stars .chip').forEach((x) => x.classList.toggle('on', x.dataset.r === star));
      render();
    },
    shown: () => shownN,
  };
}
