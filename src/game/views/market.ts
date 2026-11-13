import { BOARD_HOURS, cardKey, lockedCards, type GameBackend, type MarketBoard, type MarketItem } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { fmtCoins } from '../../core/economy';
import { MARKET_MAX_OPEN, marketMax, marketSuggested } from '../../core/market';
import { busyButton, cardTile, errMsg, esc, h, popLayer, pushLayer, starsHtml, toast } from '../ui';
import { COIN_ICON } from './wallet';
import { confirmTap } from './safety';
import { haptics } from '../../core/haptics';
import { loadPanel, showCardPanel } from './cardPanel';

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
        ? '<div class="mk-intro"><span class="kicker">Vendre · Échanger</span><p class="muted">Choisis une de tes cartes : vends-la à prix fixe en pièces, ou propose-la à l’échange (les autres te font leurs offres).</p></div>'
        : '<div class="mk-intro"><span class="kicker">Au marché</span><p class="muted">Des cartes à prix fixe, en pièces. Pas d’enchères : le premier qui achète l’a.</p></div>'}
      <div class="mk-acts"><span class="mk-wallet" title="Tes pièces"></span>${mode === 'sell' ? '<button class="btn-primary mk-sell-btn">Choisir une carte</button>' : ''}</div>
    </div>
    <div class="mk-mine" hidden><h3 class="mk-h">Mes cartes en vente <small class="mk-mine-n"></small></h3><div class="mk-grid mk-g-mine"></div><div class="mk-recent"></div></div>
    <div class="mk-tools">
      <input class="search mk-q" type="search" placeholder="Chercher une carte en vente…" autocomplete="off" spellcheck="false" aria-label="Chercher une carte en vente">
      <div class="mk-stars" role="group" aria-label="Étoiles">${STARS.map((r) => `<button class="chip" data-r="${r}" style="--rc:${rarity(r).hex}" title="${rarity(r).label}">${rarity(r).rank + 1}★</button>`).join('')}</div>
      <select class="mk-sort" aria-label="Trier"><option value="new">Les plus récentes</option><option value="cheap">Prix croissant</option><option value="dear">Prix décroissant</option></select>
    </div>
    <div class="mk-grid mk-g-open"></div>
    <div class="mk-empty muted" hidden></div>
    <div class="mk-sheet" hidden role="dialog" aria-label="Vendre une carte">
      <div class="mk-sheet-b">
        <div class="mk-sh-top"><h3 class="mk-h">Vendre ou échanger une carte</h3><button class="mk-x" aria-label="Fermer">✕</button></div>
        <div class="mk-pick">
          <div class="mk-tools"><input class="search mk-pq" type="search" placeholder="Chercher dans ta collection…" autocomplete="off" spellcheck="false" aria-label="Chercher une de tes cartes"><label class="tr-tog"><input type="checkbox" class="mk-dups" checked><span>doublons seulement</span></label></div>
          <div class="mk-grid mini mk-g-pick"></div>
        </div>
        <div class="mk-price" hidden>
          <div class="mk-chosen"></div>
          <div class="mk-pform">
            <div class="seg mk-how" role="radiogroup" aria-label="Que faire de cette carte"><button role="radio" data-how="sell" class="on" aria-checked="true">Vendre</button><button role="radio" data-how="trade" aria-checked="false">Échanger</button></div>
            <div class="mk-sellf">
            <label class="mk-pl">Prix <span class="mk-hint"></span></label>
            <div class="mk-prow"><button class="btn-ghost mk-step" data-d="-1" aria-label="Moins cher">−</button><input class="mk-pin" type="number" inputmode="numeric" min="1" step="1" aria-label="Prix en pièces"><button class="btn-ghost mk-step" data-d="1" aria-label="Plus cher">+</button></div>
            <div class="mk-cmp"></div>
            <div class="mk-pbtns"><button class="btn-ghost mk-back">‹ Une autre carte</button><button class="btn-primary mk-go">Mettre en vente</button></div>
            <p class="muted mk-note">La carte quitte ta collection tant qu’elle est en vente. Tu peux la retirer quand tu veux : elle revient.</p>
            </div>
            <div class="mk-tradef" hidden>
              <p class="mk-tnote">Elle part au tableau des échanges : les autres joueurs te proposent leurs cartes, tu acceptes celle qui te plaît (ou rien).</p>
              <div class="mk-pl">Durée</div>
              <div class="seg mk-dur" role="radiogroup" aria-label="Durée de l’annonce">${BOARD_HOURS.map((x, i) => `<button role="radio" data-h="${x}" class="${i === BOARD_HOURS.length - 1 ? 'on' : ''}" aria-checked="${i === BOARD_HOURS.length - 1}">${x} h</button>`).join('')}</div>
              <div class="mk-pbtns"><button class="btn-ghost mk-back2">‹ Une autre carte</button><button class="btn-primary mk-trade-go">Proposer à l’échange</button></div>
              <p class="muted mk-note">Elle reste dans ta collection, verrouillée 🔒 tant que l’annonce est ouverte. Tes annonces et les offres reçues sont juste en dessous.</p>
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

  /** étiquette prix / valeur : vert = sous la valeur, rouge = bien au-dessus */
  function cmpHtml(r: RarityId, price: number) {
    const v = marketSuggested(r);
    if (!v) return '';
    const d = Math.round(((price - v) / v) * 100);
    if (Math.abs(d) < 5) return '<span class="mk-tag fair">au prix</span>';
    return `<span class="mk-tag ${d < 0 ? 'low' : d > 60 ? 'high' : 'up'}">${d > 0 ? '+' : '−'}${Math.abs(d)} %</span>`;
  }

  function item(m: MarketItem): HTMLElement {
    const w = h('div', `mk-item r-${m.rarity}`);
    w.style.setProperty('--rc', rarity(m.rarity).hex);
    const t = cardTile(m.cardId, m.rarity);
    // (13/11, retours Hugo) toute la carte se touche : sa fiche (qui l'a, prix moyen, qui la veut)
    t.setAttribute('role', 'button');
    t.tabIndex = 0;
    t.setAttribute('aria-label', `${nameOf(m.cardId)} : voir la fiche`);
    t.addEventListener('click', () => showCardPanel(backend, m.cardId));
    w.append(t);
    const meta = h('div', 'mk-meta', `<div class="mk-pr">${coin(m.price)}${cmpHtml(m.rarity, m.price)}</div><div class="mk-sub">${starsHtml(m.rarity)} · n°${m.mintNumber} · ${isMine(m) ? 'toi' : `par ${esc(m.sellerName)}`}</div>`);
    w.append(meta);
    const b = h('button', isMine(m) ? 'btn-ghost mk-cancel' : 'btn-primary mk-buy', isMine(m) ? 'Retirer' : `Acheter`);
    b.addEventListener('click', () => void (isMine(m) ? cancel(m, b) : buy(m, b)));
    w.append(b);
    return w;
  }

  function render() {
    if (!el.isConnected) return;
    const coins = backend.eco.snapshot?.coins ?? 0;
    q('.mk-wallet').innerHTML = coin(coins);
    // mes ventes
    const mine = board.open.filter(isMine);
    q('.mk-mine').hidden = mode !== 'sell' || (!mine.length && !board.sold.length && !board.bought.length);
    q('.mk-mine-n').textContent = mine.length ? `${mine.length}/${MARKET_MAX_OPEN}` : '';
    gMine.replaceChildren(...mine.map(item));
    const recent = [...board.sold.map((m) => ({ m, sold: true })), ...board.bought.map((m) => ({ m, sold: false }))].sort((a, b) => (b.m.resolvedAt ?? 0) - (a.m.resolvedAt ?? 0)).slice(0, 6);
    q('.mk-recent').innerHTML = recent.length
      ? `<ul class="mk-rl">${recent.map(({ m, sold }) => `<li class="${sold ? 'in' : 'out'}"><b>${sold ? 'Vendue' : 'Achetée'}</b> ${esc(nameOf(m.cardId))} ${starsHtml(m.rarity)} <span>${sold ? '+' : '−'}${coin(m.price)}</span></li>`).join('')}</ul>`
      : '';
    // en vente
    const needle = fold(q<HTMLInputElement>('.mk-q').value.trim());
    const list = board.open
      .filter((m) => !isMine(m) && (!star || m.rarity === star) && (!needle || fold(nameOf(m.cardId)).includes(needle)))
      .sort((a, b) => (sort === 'cheap' ? a.price - b.price : sort === 'dear' ? b.price - a.price : b.createdAt - a.createdAt));
    shownN = list.length;
    gOpen.replaceChildren(...list.map(item));
    const empty = q('.mk-empty');
    empty.hidden = list.length > 0;
    empty.textContent = board.open.some((m) => !isMine(m)) ? 'Aucune carte ne correspond.' : 'Rien en vente pour l’instant. Lance-toi : onglet « Vendre · Échanger ».';
  }

  async function buy(m: MarketItem, b: HTMLButtonElement) {
    const coins = backend.eco.snapshot?.coins ?? 0;
    if (coins < m.price) return toast(`Il te manque ${fmtCoins(m.price - coins)} pièces.`, 'err');
    if (!confirmTap(b, `Sûr ? ${fmtCoins(m.price)}`)) return;
    try {
      await busyButton(b, backend.marketBuy(m.id, m.price));
      haptics.pulse([10, 40, 18]);
      o.chime();
      toast(`${nameOf(m.cardId)} est dans ta collection !`, 'ok');
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  }
  async function cancel(m: MarketItem, b: HTMLButtonElement) {
    if (!confirmTap(b, 'Retirer ?')) return;
    try {
      await busyButton(b, backend.marketCancel(m.id));
      toast(`${nameOf(m.cardId)} est revenue dans ta collection.`, 'ok');
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  }

  // ── filtres
  q('.mk-q').addEventListener('input', render);
  q('.mk-sort').addEventListener('change', (e) => ((sort = (e.target as HTMLSelectElement).value as Sort), render()));
  el.querySelectorAll<HTMLButtonElement>('.mk-stars .chip').forEach((b) =>
    b.addEventListener('click', () => {
      star = star === b.dataset.r ? null : (b.dataset.r as RarityId);
      el.querySelectorAll<HTMLButtonElement>('.mk-stars .chip').forEach((x) => x.classList.toggle('on', x.dataset.r === star));
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
    if (!mine.length) g.append(h('div', 'muted', dups ? 'Pas de doublon libre. Décoche « doublons seulement » pour vendre une carte unique.' : 'Aucune carte libre ne correspond.'));
  }
  function choose(cardId: string, r: RarityId) {
    chosen = { cardId, rarity: r };
    q('.mk-pick').hidden = true;
    q('.mk-price').hidden = false;
    q('.mk-chosen').replaceChildren(cardTile(cardId, r));
    pin.max = String(marketMax(r));
    pin.value = String(marketSuggested(r));
    q('.mk-hint').innerHTML = `valeur de la carte : ${coin(marketSuggested(r))} · max ${fmtCoins(marketMax(r))}`;
    // (13/11, retours Hugo) prix de référence : la moyenne des ventes de la carte, quand elle s'est déjà vendue
    void loadPanel(backend, cardId)
      .then((p) => {
        if (!p.sold || chosen?.cardId !== cardId) return;
        q('.mk-hint').innerHTML += ` · vendue en moyenne ${coin(p.sold.avg)} (${p.sold.n} vente${p.sold.n > 1 ? 's' : ''})`;
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
    if (backend.state.mode === 'online' && !backend.state.user) return toast('Connecte-toi pour proposer une carte.', 'info');
    try {
      await busyButton(q('.mk-trade-go'), backend.createListing([{ cardId: chosen.cardId, rarity: chosen.rarity, count: 1 }], [], undefined, hours));
      toast(`${nameOf(chosen.cardId)} est proposée à l’échange pour ${hours} h.`, 'ok');
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
      toast(`${nameOf(chosen.cardId)} est en vente à ${fmtCoins(price)} pièces.`, 'ok');
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
  backend.onChange(() => el.isConnected && !sheet.hidden && !chosen && renderPick());

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
