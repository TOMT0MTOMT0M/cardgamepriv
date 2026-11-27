import { t as tr } from '../../core/i18n';
import { onUniqueTitles, utag } from '../uniqueTitle';
import '../../core/i18n/fr/game.views.market'; // (textes de ce module, version anglaise)
import { BOARD_HOURS, cardKey, lockedCards, type GameBackend, type MarketBoard, type MarketItem } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import { cardQuery } from '../../core/cardSearch';
import { rarity, type RarityId } from '../../core/rarity';
import { fmtCoins } from '../../core/economy';
import { wantsCard } from '../../core/wishFams';
import { MARKET_MAX_OPEN, marketAdvised, marketGap, marketMax } from '../../core/market';
import { busyButton, cardTile, errMsg, esc, h, popLayer, pushLayer, starsHtml, toast } from '../ui';
import { COIN_ICON } from './wallet';
import { confirmTap } from './safety';
import { haptics } from '../../core/haptics';
import { loadPanel, showCardPanel } from './cardPanel';
import { DUR, EASING, STAGGER } from '../../core/motion';
import { wishSales } from '../wishSales';

/**
 * MARCHÉ (retours Hugo 10/11 ; V3 « façon Kyara », brief docs/chantiers/marche-kyara.md). Deux usages, deux onglets
 * de la page Marché (views/trades.ts) :
 *  - `buy` (« Acheter ») : LA CARTE EST L'ANNONCE. Grande grille de cartes entières ; sous chacune trois infos
 *    seulement : prix, écart au prix conseillé (couleur = bon / mauvais prix), vendeur. Une barre de recherche (perso
 *    ou univers), les pastilles de rareté, « Filtres » pour le reste (tri, manquantes, envies, type d'annonce).
 *    Toucher une annonce = sa fiche (grande carte, vendeur, Acheter en deux touchers, fiche de la carte).
 *  - `sell` (« Vendre ») : MA COLLECTION EN GRILLE, « plus d'exemplaires d'abord » : on voit ses doublons et on vend
 *    d'un toucher (feuille : prix fixe, enchère, échange). Mes ventes en cours au-dessus.
 * Point d'accroche des ENCHÈRES (agent `encheres`) : `setMarketPlugin` ci-dessous.
 * Règles : src/core/market.ts · serveur : convex/market.ts (abonnement seulement quand l'onglet est à l'écran).
 */
export interface MarketView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
  /** nombre d'annonces affichées (hors les miennes) */
  shown(): number;
}

/**
 * (V3) ENCHÈRES : le module des enchères se branche ici, sans toucher au reste. Tout est facultatif ; tant que rien
 * n'est branché, ni la pastille « Enchères » (Acheter) ni le choix « Enchère » (Vendre) ne s'affichent.
 */
export interface MarketPlugin {
  /** Acheter / Mes ventes : annonces en plus (`kind: 'auction'`), abonnées tant qu'un onglet du marché est à l'écran */
  watch?(cb: (items: MarketItem[]) => void): () => void;
  /** coin droit sous la carte (« 2 h 10 », « Terminée ») ; '' = rien */
  corner?(m: MarketItem): string;
  /** fiche d'une annonce `kind: 'auction'` : remplit `box` (boutons) ; `close()` ferme la fiche */
  dealFoot?(m: MarketItem, box: HTMLElement, close: () => void): void;
  /** Vendre, choix « Enchère » : formulaire pour la carte choisie ; `done()` ferme la feuille */
  sellForm?(card: { cardId: string; rarity: RarityId }, box: HTMLElement, done: () => void): void;
}
let plugin: MarketPlugin | null = null;
const pluginViews = new Set<() => void>();
export function setMarketPlugin(p: MarketPlugin | null) {
  plugin = p;
  for (const f of pluginViews) f();
}

type Sort = 'new' | 'cheap' | 'dear';
type SellSort = 'copies' | 'rarity' | 'name';
type Kind = 'all' | 'fixed' | 'auction';
const STARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const nameOf = (id: string) => catalogEntry(id)?.name ?? id;
const coin = (n: number) => `<span class="mk-c">${COIN_ICON}<b>${fmtCoins(n)}</b></span>`;
/** (V3, lot 09) anti-rebond de la recherche du Marché (ms) : une frappe ne redessine plus la grille, la pause oui */
const TYPE_DEBOUNCE = 80;
/** Vendre : cartes posées par fournée (une collection fait des milliers de cartes) */
const SELL_PAGE = 60;
const isAuction = (m: MarketItem) => m.kind === 'auction';

/** (V3) écart au prix conseillé : « +3 % », « −20 % » ; couleur = information (bon prix / cher / très cher) */
export function gapHtml(r: RarityId, price: number): string {
  const g = marketGap(r, price);
  if (!g) return '';
  return `<span class="mk-gap ${g.cls}" title="${tr('mk.gapA', { a: fmtCoins(marketAdvised(r)) })}">${g.pct > 0 ? '+' : g.pct < 0 ? '−' : ''}${Math.abs(g.pct)} %</span>`;
}

/** pastilles de rareté (« Toutes » + 6 couleurs) */
const rarityPills = () =>
  `<div class="mk-rps" role="group" aria-label="${tr('mk.stars')}"><button class="mk-rp all on" data-r="" aria-pressed="true">${tr('mk.all')}</button>${STARS.map((r) => `<button class="mk-rp r-${r}" data-r="${r}" style="--rc:${rarity(r).hex}" aria-pressed="false" title="${rarity(r).label}" aria-label="${rarity(r).label}">${rarity(r).rank + 1}</button>`).join('')}</div>`;

export function createMarket(backend: GameBackend, o: { chime(): void; mode?: 'buy' | 'sell'; onListed?(): void; onQuery?(q: string): void }): MarketView {
  const mode = o.mode ?? 'buy';
  const el = h('section', `mk mk-${mode}`);
  el.innerHTML = `
    <div class="mk-mine" hidden><h3 class="mk-h">${tr('mk.mine')} <small class="mk-mine-n"></small></h3><div class="mk-strip mk-g-mine"></div></div>
    <div class="mk-bar">
      <input class="search mk-q" type="search" placeholder="${tr('mk.searchPh')}" enterkeyhint="search" autocomplete="off" spellcheck="false" aria-label="${tr('mk.searchA')}">
      ${rarityPills()}
      ${mode === 'buy'
        ? `<button class="mk-fbtn" aria-expanded="false" aria-controls="mk-more">${tr('mk.filters')}<i class="mk-fdot" hidden></i></button>`
        : `<label class="mk-sortl">${tr('mk.sort')} <select class="mk-ssort" aria-label="${tr('mk.sort')}"><option value="copies">${tr('mk.sCopies')}</option><option value="rarity">${tr('mk.sRarity')}</option><option value="name">${tr('mk.sName')}</option></select></label>`}
    </div>
    ${mode === 'buy'
      ? `<div class="mk-more" hidden>
      <select class="mk-sort" aria-label="${tr('mk.sort')}"><option value="new">${tr('mk.newest')}</option><option value="cheap">${tr('mk.priceAsc')}</option><option value="dear">${tr('mk.priceDesc')}</option></select>
      <button class="chip mk-mf" data-mf="missing" aria-pressed="false">${tr('mk.fMissing')}</button><button class="chip mk-mf" data-mf="wish" aria-pressed="false">${tr('mk.fWish')}</button>
      <div class="seg mk-kind" role="radiogroup" aria-label="${tr('mk.kindA')}" hidden><button role="radio" data-k="all" class="on" aria-checked="true">${tr('mk.all')}</button><button role="radio" data-k="fixed" aria-checked="false">${tr('mk.kFixed')}</button><button role="radio" data-k="auction" aria-checked="false">${tr('mk.kAuction')}</button></div>
    </div>`
      : ''}
    <div class="mk-aside"></div>
    <div class="mk-count"></div>
    <div class="mk-grid ${mode === 'buy' ? 'mk-g-open' : 'mk-g-pick'}"></div>
    <button class="btn-ghost mk-morecards" hidden>${tr('mk.showMore')}</button>
    <div class="mk-empty muted" hidden></div>
    <div class="mk-sheet" hidden role="dialog">
      <div class="mk-sheet-b">
        <button class="mk-x" aria-label="${tr('common.close')}">✕</button>
        <div class="mk-deal" hidden></div>
        <div class="mk-price" hidden>
          <div class="mk-chosen"></div>
          <div class="mk-pform">
            <div class="seg mk-how" role="radiogroup" aria-label="${tr('mk.howA')}"><button role="radio" data-how="sell" class="on" aria-checked="true">${tr('mk.kFixed')}</button><button role="radio" data-how="auction" aria-checked="false" hidden>${tr('mk.kAuction1')}</button><button role="radio" data-how="trade" aria-checked="false">${tr('mk.howTrade')}</button></div>
            <div class="mk-sellf">
              <label class="mk-pl">${tr('mk.price')} <span class="mk-hint"></span></label>
              <div class="mk-prow"><button class="btn-ghost mk-step" data-d="-1" aria-label="${tr('mk.cheaper')}">−</button><input class="mk-pin" type="number" inputmode="numeric" min="1" step="1" aria-label="${tr('mk.priceA')}"><button class="btn-ghost mk-step" data-d="1" aria-label="${tr('mk.dearer')}">+</button><span class="mk-cmp"></span></div>
              <button class="btn-primary mk-go">${tr('mk.list')}</button>
              <p class="muted mk-note">${tr('mk.leaves')}</p>
            </div>
            <div class="mk-auctionf" hidden></div>
            <div class="mk-tradef" hidden>
              <div class="seg mk-dur" role="radiogroup" aria-label="${tr('mk.durA')}">${BOARD_HOURS.map((x, i) => `<button role="radio" data-h="${x}" class="${i === BOARD_HOURS.length - 1 ? 'on' : ''}" aria-checked="${i === BOARD_HOURS.length - 1}">${x} h</button>`).join('')}</div>
              <button class="btn-primary mk-trade-go">${tr('mk.tradeGo')}</button>
              <p class="muted mk-note">${tr('mk.tradeKeep')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  // la feuille est posée sur <body> quand elle s'ouvre (l'onglet qui la porte glisse à l'entrée : un parent animé
  // en `transform` décalerait une feuille `position: fixed`) : on la cherche donc aussi chez elle
  const sheet = el.querySelector<HTMLElement>('.mk-sheet')!;
  const q = <T extends HTMLElement>(s: string) => (el.querySelector<T>(s) ?? sheet.querySelector<T>(s))!;
  const grid = q('.mk-grid');
  const gMine = q('.mk-g-mine');
  const pin = q<HTMLInputElement>('.mk-pin');
  const qIn = q<HTMLInputElement>('.mk-q');
  let board: MarketBoard = { open: [], sold: [], bought: [] };
  let extra: MarketItem[] = [];
  let unwatch: (() => void) | null = null;
  let unwatchExtra: (() => void) | null = null;
  let star: RarityId | null = null;
  let sort: Sort = 'new';
  let sellSort: SellSort = 'copies';
  let kind: Kind = 'all';
  let chosen: { cardId: string; rarity: RarityId } | null = null;
  const meId = () => backend.state.user?.id ?? 'me';
  const isMine = (m: MarketItem) => m.sellerId === meId() || m.sellerId === 'me';
  let shownN = 0;
  // « je l'ai / envie » : tout vient de l'état déjà en mémoire (collection, envies), aucun appel serveur
  let ownedIds = new Set<string>();
  let onlyMissing = false;
  let onlyWished = false;
  const wantedCard = (cardId: string) => wantsCard(backend.state.wishlist, backend.state.wishFams, cardId);
  const all = () => (extra.length ? [...board.open, ...extra] : board.open);

  /**
   * (V3, lot 09) ANNONCES RECYCLÉES : un nœud `.mk-item` par annonce, gardé d'un rendu à l'autre (clé = id + ce qui
   * s'affiche). Filtrer, trier ou recevoir une mise à jour du serveur ne recrée plus les tuiles.
   */
  const nodes = new Map<string, { sig: string; el: HTMLElement }>();
  /** (C bis) visite précédente d'Acheter : les cartes voulues mises en vente depuis portent « nouveau » */
  let since = Date.now();
  const isNew = (m: MarketItem) => mode === 'buy' && !isMine(m) && m.createdAt > since && wantedCard(m.cardId) && !ownedIds.has(m.cardId);
  function itemFor(m: MarketItem): HTMLElement {
    const corner = plugin?.corner?.(m) ?? '';
    const sig = `${m.price}|${m.rarity}|${m.cardId}|${isMine(m) ? 1 : 0}|${m.sellerName}|${corner}|${ownedIds.has(m.cardId) ? 1 : 0}${wantedCard(m.cardId) ? 1 : 0}${isNew(m) ? 1 : 0}`;
    const had = nodes.get(m.id);
    if (had && had.sig === sig) return had.el;
    const w = item(m, corner);
    w.dataset.mk = m.id;
    nodes.set(m.id, { sig, el: w });
    return w;
  }
  /**
   * Remet `g` dans l'ordre de `want` en ne déplaçant que les nœuds mal placés. Les annonces VISIBLES glissent de leur
   * ancienne place à la nouvelle (FLIP, transform seul) ; celles qui arrivent apparaissent en fondu.
   */
  function syncGrid(g: HTMLElement, want: HTMLElement[]) {
    const cur = [...g.children] as HTMLElement[];
    if (cur.length === want.length && cur.every((x, i) => x === want[i])) return;
    const vh = innerHeight;
    const live = g.getClientRects().length > 0;
    const first = new Map<HTMLElement, DOMRect>();
    if (live) {
      for (const x of cur) {
        const r = x.getBoundingClientRect();
        if (r.top > vh + 40) break;
        if (r.bottom > -40) first.set(x, r);
      }
    }
    const keep = new Set(want);
    for (const x of cur) if (!keep.has(x)) x.remove();
    let at: ChildNode | null = g.firstChild;
    for (const x of want) {
      if (x === at) at = at.nextSibling;
      else g.insertBefore(x, at);
    }
    if (!live) return;
    const dur = DUR.emphatique();
    let n = 0;
    for (const x of want) {
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
        x.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: DUR.standard(), delay: Math.min(STAGGER.max, n++ * STAGGER.serre), easing: EASING.entree, fill: 'backwards' });
      }
    }
  }

  /** une annonce : la carte entière, puis prix · écart / vendeur · coin (enchère) */
  function item(m: MarketItem, corner: string): HTMLElement {
    const mine = isMine(m);
    const w = h('button', `mk-item r-${m.rarity}${mine ? ' mine' : ''}`);
    w.style.setProperty('--rc', rarity(m.rarity).hex);
    w.setAttribute('aria-label', tr('mk.dealA', { name: nameOf(m.cardId), price: fmtCoins(m.price) }));
    const t = cardTile(m.cardId, m.rarity);
    t.removeAttribute('role');
    t.tabIndex = -1;
    const own = !mine && ownedIds.has(m.cardId);
    const wish = !mine && wantedCard(m.cardId);
    if (isNew(m)) t.append(h('span', 'mk-new', tr('mk.new')));
    w.append(t);
    // « ♥ » je la veux · « ✓ » je l'ai déjà : un signe sur la ligne du vendeur, rien sur la carte
    const flag = wish ? `<span class="mk-flag wish" title="${tr('mk.wishT')}">♥</span>` : own ? `<span class="mk-flag" title="${tr('mk.haveT')}">✓</span>` : '';
    w.append(
      h(
        'span',
        'mk-meta',
        `<span class="mk-l1">${coin(m.price)}${gapHtml(m.rarity, m.price)}</span><span class="mk-l2"><span class="mk-seller">${mine ? tr('mk.you') : esc(m.sellerName)}</span>${flag || corner ? `<span class="mk-end">${flag}${corner ? esc(corner) : ''}</span>` : ''}</span>`,
      ),
    );
    w.addEventListener('click', () => openDeal(m));
    return w;
  }

  /** filtres actifs hors recherche (point sur « Filtres ») */
  const filtered = () => onlyMissing || onlyWished || sort !== 'new' || kind !== 'all';

  function render() {
    if (!el.isConnected) return;
    // annonces disparues du tableau (vendues, retirées) : leur nœud est oublié
    const list0 = all();
    const ids = new Set(list0.map((m) => m.id));
    for (const id of nodes.keys()) if (!ids.has(id)) nodes.delete(id);
    ownedIds = new Set(backend.state.collection.map((c) => c.cardId));
    // mes ventes (onglet Vendre)
    const mine = list0.filter(isMine);
    q('.mk-mine').hidden = mode !== 'sell' || !mine.length;
    // (les enchères ouvertes occupent aussi les places : convex/market.ts `openCount`)
    q('.mk-mine-n').textContent = mine.length ? `${mine.length}/${MARKET_MAX_OPEN}` : '';
    if (mode === 'sell') {
      syncGrid(gMine, mine.map(itemFor));
      return renderPick();
    }
    const cq = cardQuery(qIn.value);
    const list = list0
      .filter((m) => {
        if (isMine(m) || (star && m.rarity !== star)) return false;
        if (kind !== 'all' && (kind === 'auction') !== isAuction(m)) return false;
        if (onlyMissing && ownedIds.has(m.cardId)) return false;
        if (onlyWished && !wantedCard(m.cardId)) return false;
        if (cq.empty) return true;
        const e = catalogEntry(m.cardId);
        return !!e && cq.test(e);
      })
      .sort((a, b) => (sort === 'cheap' ? a.price - b.price : sort === 'dear' ? b.price - a.price : b.createdAt - a.createdAt));
    shownN = list.length;
    syncGrid(grid, list.map(itemFor));
    q('.mk-count').textContent = list.length ? tr('mk.count', { n: list.length }) : '';
    q('.mk-fdot').hidden = !filtered();
    const empty = q('.mk-empty');
    empty.hidden = list.length > 0;
    empty.textContent = list0.some((m) => !isMine(m)) ? tr('mk.noMatch') : tr('mk.nothing');
  }

  // ── la fiche d'une annonce : grande carte, prix, écart, vendeur, Acheter (deux touchers) / Retirer, fiche de la carte
  function openDeal(m: MarketItem) {
    chosen = null;
    const mine = isMine(m);
    const box = q('.mk-deal');
    box.innerHTML = '';
    const t = cardTile(m.cardId, m.rarity);
    t.classList.add('mk-dtile');
    const info = h(
      'div',
      'mk-dinfo',
      `<h3 class="mk-dname">${esc(nameOf(m.cardId))}</h3>
      <div class="mk-dsub">${starsHtml(m.rarity)} · n°${m.mintNumber}</div>
      <div class="mk-dpr">${coin(m.price)}${gapHtml(m.rarity, m.price)}</div>
      <div class="mk-dwho">${mine ? tr('mk.byYou') : tr('mk.by', { name: `<a class="mk-who" href="#/profil/${encodeURIComponent(m.sellerId)}">${esc(m.sellerName)}</a>${utag(m.sellerId, { compact: true })}` })}</div>`,
    );
    const foot = h('div', 'mk-dfoot');
    if (isAuction(m) && plugin?.dealFoot) plugin.dealFoot(m, foot, closeSheet);
    else {
      const b = h('button', mine ? 'btn-ghost mk-cancel' : 'btn-primary mk-buy', mine ? tr('mk.withdraw') : `${tr('mk.buy')} · ${fmtCoins(m.price)}`);
      b.addEventListener('click', () => void (mine ? cancel(m, b) : buy(m, b)));
      foot.append(b);
    }
    const card = h('button', 'btn-ghost mk-fiche', tr('mk.cardSheet'));
    card.addEventListener('click', () => {
      closeSheet();
      showCardPanel(backend, m.cardId);
    });
    foot.append(card);
    info.append(foot);
    info.querySelector('.mk-who')?.addEventListener('click', () => closeSheet());
    box.append(t, info);
    showPane('deal', tr('mk.dealA', { name: nameOf(m.cardId), price: fmtCoins(m.price) }));
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
      closeSheet();
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  }
  async function cancel(m: MarketItem, b: HTMLButtonElement) {
    if (!confirmTap(b, tr('mk.withdrawQ'))) return;
    try {
      await busyButton(b, backend.marketCancel(m.id));
      toast(tr('mk.back', { name: nameOf(m.cardId) }), 'ok');
      closeSheet();
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  }

  // ── barre : recherche, pastilles de rareté, filtres
  let typeT = 0;
  qIn.addEventListener('input', () => {
    clearTimeout(typeT);
    typeT = window.setTimeout(() => {
      if (mode === 'sell') sellN = SELL_PAGE;
      render();
      o.onQuery?.(qIn.value.trim());
    }, TYPE_DEBOUNCE);
  });
  el.querySelectorAll<HTMLButtonElement>('.mk-rp').forEach((b) =>
    b.addEventListener('click', () => {
      star = (b.dataset.r || null) as RarityId | null;
      el.querySelectorAll<HTMLButtonElement>('.mk-rp').forEach((x) => {
        const on = (x.dataset.r || null) === star;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', String(on));
      });
      if (mode === 'sell') sellN = SELL_PAGE;
      render();
    }),
  );
  el.querySelector('.mk-fbtn')?.addEventListener('click', (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const more = q('.mk-more');
    more.hidden = !more.hidden;
    b.setAttribute('aria-expanded', String(!more.hidden));
    b.classList.toggle('on', !more.hidden);
  });
  el.querySelector('.mk-sort')?.addEventListener('change', (e) => ((sort = (e.target as HTMLSelectElement).value as Sort), render()));
  el.querySelectorAll<HTMLButtonElement>('.mk-mf').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.mf === 'missing') onlyMissing = !onlyMissing;
      else onlyWished = !onlyWished;
      const on = b.dataset.mf === 'missing' ? onlyMissing : onlyWished;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      render();
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('.mk-kind [data-k]').forEach((b) =>
    b.addEventListener('click', () => {
      kind = b.dataset.k as Kind;
      el.querySelectorAll<HTMLButtonElement>('.mk-kind [data-k]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      render();
    }),
  );

  // ── VENDRE : ma collection en grille (cartes libres), « plus d'exemplaires d'abord » ; un toucher = la feuille
  let sellN = SELL_PAGE;
  const pickNodes = new Map<string, { sig: string; el: HTMLElement }>();
  function renderPick() {
    const locked = lockedCards(backend.state);
    const cq = cardQuery(qIn.value);
    const mine = backend.state.collection
      .map((c) => ({ c, free: c.count - (locked.get(cardKey(c)) ?? 0), e: catalogEntry(c.cardId) }))
      .filter(({ c, free, e }) => c.rarity !== 'secret' && free > 0 && !!e && (!star || c.rarity === star) && (cq.empty || cq.test(e)))
      .sort((a, b) =>
        sellSort === 'name'
          ? a.e!.name.localeCompare(b.e!.name)
          : sellSort === 'rarity'
            ? rarity(b.c.rarity).rank - rarity(a.c.rarity).rank || b.free - a.free
            : b.free - a.free || rarity(b.c.rarity).rank - rarity(a.c.rarity).rank || a.e!.name.localeCompare(b.e!.name),
      );
    shownN = mine.length;
    const want = mine.slice(0, sellN).map(({ c, free }) => {
      const k = cardKey(c);
      const sig = `${free}`;
      const had = pickNodes.get(k);
      if (had && had.sig === sig) return had.el;
      const t = cardTile(c.cardId, c.rarity, { count: free });
      t.addEventListener('click', () => choose(c.cardId, c.rarity));
      pickNodes.set(k, { sig, el: t });
      return t;
    });
    grid.replaceChildren(...want);
    q('.mk-morecards').hidden = mine.length <= sellN;
    q('.mk-count').textContent = mine.length ? tr('mk.countMine', { n: mine.length }) : '';
    const empty = q('.mk-empty');
    empty.hidden = mine.length > 0;
    empty.textContent = tr('mk.noFree');
  }
  q('.mk-morecards').addEventListener('click', () => {
    sellN += SELL_PAGE;
    renderPick();
  });
  el.querySelector('.mk-ssort')?.addEventListener('change', (e) => {
    sellSort = (e.target as HTMLSelectElement).value as SellSort;
    sellN = SELL_PAGE;
    renderPick();
  });

  function choose(cardId: string, r: RarityId) {
    chosen = { cardId, rarity: r };
    q('.mk-chosen').replaceChildren(cardTile(cardId, r));
    pin.max = String(marketMax(r));
    // (v2.1.41) pré-rempli au prix conseillé (1,5× la valeur de Forge)
    pin.value = String(marketAdvised(r));
    q('.mk-hint').innerHTML = tr('mk.hint', { a: fmtCoins(marketAdvised(r)), max: fmtCoins(marketMax(r)) });
    // (13/11, retours Hugo) prix de référence : la moyenne des ventes de la carte, quand elle s'est déjà vendue
    void loadPanel(backend, cardId)
      .then((p) => {
        if (!p.sold || chosen?.cardId !== cardId) return;
        q('.mk-hint').innerHTML += tr('mk.soldAvg', { avg: fmtCoins(p.sold.avg), n: p.sold.n });
      })
      .catch(() => undefined);
    const auc = q('.mk-auctionf');
    auc.replaceChildren();
    const canAuction = !!plugin?.sellForm;
    q('.mk-how [data-how="auction"]').hidden = !canAuction;
    if (canAuction) plugin!.sellForm!({ cardId, rarity: r }, auc, () => (closeSheet(), o.onListed?.()));
    setHow('sell');
    syncPrice();
    showPane('price', tr('mk.sellOrTrade'));
  }
  function syncPrice() {
    if (!chosen) return;
    const p = Math.round(Number(pin.value) || 0);
    q('.mk-cmp').innerHTML = p > 0 ? gapHtml(chosen.rarity, p) : '';
    q<HTMLButtonElement>('.mk-go').disabled = !(p >= 1 && p <= marketMax(chosen.rarity));
  }
  pin.addEventListener('input', syncPrice);
  sheet.querySelectorAll<HTMLButtonElement>('.mk-step').forEach((b) =>
    b.addEventListener('click', () => {
      if (!chosen) return;
      const a = marketAdvised(chosen.rarity);
      const stepV = Math.max(1, Math.round(a / 10));
      pin.value = String(Math.min(marketMax(chosen.rarity), Math.max(1, (Math.round(Number(pin.value)) || a) + Number(b.dataset.d) * stepV)));
      syncPrice();
    }),
  );
  // (13/11, retours Hugo « on peut vendre mais pas la proposer en échange ») prix fixe, enchère ou échange
  let hours: number = BOARD_HOURS[BOARD_HOURS.length - 1];
  function setHow(how: 'sell' | 'auction' | 'trade') {
    sheet.querySelectorAll<HTMLButtonElement>('.mk-how [data-how]').forEach((b) => {
      const on = b.dataset.how === how;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    q('.mk-sellf').hidden = how !== 'sell';
    q('.mk-auctionf').hidden = how !== 'auction';
    q('.mk-tradef').hidden = how !== 'trade';
  }
  sheet.querySelectorAll<HTMLButtonElement>('.mk-how [data-how]').forEach((b) => b.addEventListener('click', () => setHow(b.dataset.how as 'sell' | 'auction' | 'trade')));
  sheet.querySelectorAll<HTMLButtonElement>('.mk-dur [data-h]').forEach((b) =>
    b.addEventListener('click', () => {
      hours = Number(b.dataset.h);
      sheet.querySelectorAll<HTMLButtonElement>('.mk-dur [data-h]').forEach((x) => {
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

  // ── la feuille (fiche d'annonce OU mise en vente)
  function showPane(which: 'deal' | 'price', label: string) {
    q('.mk-deal').hidden = which !== 'deal';
    q('.mk-price').hidden = which !== 'price';
    sheet.setAttribute('aria-label', label);
    if (sheet.hidden) {
      document.body.append(sheet);
      sheet.hidden = false;
      pushLayer(closeSheet);
    }
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    el.append(sheet);
    chosen = null;
    popLayer(closeSheet);
  }
  q('.mk-x').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => e.target === sheet && closeSheet());

  // enchères branchées (ou débranchées) après coup : pastille « Enchères » et abonnement
  const syncPlugin = () => {
    const k = el.querySelector<HTMLElement>('.mk-kind');
    if (k) k.hidden = !plugin?.watch;
    if (unwatch && plugin?.watch && !unwatchExtra) unwatchExtra = plugin.watch((l) => ((extra = l), render()));
  };
  pluginViews.add(syncPlugin);
  syncPlugin();

  backend.eco.onChange(() => el.isConnected && mode === 'buy' && render());
  onUniqueTitles(() => el.isConnected && render());
  wishSales.onChange(() => el.isConnected && mode === 'buy' && render());
  // (relecture 27/11) backend.onChange part à chaque changement d'état (pièces, présence…) : ne redessiner que si la
  // collection (ses lignes) ou les envies ont bougé — en ligne, ces tableaux sont recréés à chaque relecture du joueur
  let mineSig = '';
  backend.onChange(() => {
    if (!el.isConnected) return;
    const s = backend.state;
    const sig = `${s.collection.length}|${s.collection.reduce((a, c) => a + c.count, 0)}|${s.wishlist.join(',')}|${s.wishFams.join(',')}`;
    if (sig === mineSig) return;
    mineSig = sig;
    render(); // collection / envies changées : marques, filtres et grille « Vendre » à jour
  });

  return {
    el,
    enter() {
      if (mode === 'buy' && !unwatch) since = wishSales.visit();
      unwatch ??= backend.watchMarket((b) => {
        board = b;
        render();
      });
      if (plugin?.watch) unwatchExtra ??= plugin.watch((l) => ((extra = l), render()));
      render();
    },
    leave() {
      unwatch?.();
      unwatch = null;
      unwatchExtra?.();
      unwatchExtra = null;
      closeSheet();
    },
    shown: () => shownN,
  };
}
