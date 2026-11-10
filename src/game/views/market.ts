import { cardKey, lockedCards, type GameBackend, type MarketBoard, type MarketItem } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { fmtCoins } from '../../core/economy';
import { MARKET_MAX_OPEN, marketMax, marketSuggested } from '../../core/market';
import { busyButton, cardTile, errMsg, esc, h, popLayer, pushLayer, starsHtml, toast } from '../ui';
import { COIN_ICON } from './wallet';
import { confirmTap } from './safety';
import { haptics } from '../../core/haptics';

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
}

type Sort = 'new' | 'cheap' | 'dear';
const STARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const fold = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nameOf = (id: string) => catalogEntry(id)?.name ?? id;
const coin = (n: number) => `<span class="mk-c">${COIN_ICON}<b>${fmtCoins(n)}</b></span>`;

export function createMarket(backend: GameBackend, o: { chime(): void }): MarketView {
  const el = h('section', 'mk');
  el.innerHTML = `
    <div class="mk-head">
      <div class="mk-intro"><span class="kicker">Marché</span><p class="muted">Des cartes à prix fixe, en pièces. Pas d’enchères : le premier qui achète l’a.</p></div>
      <div class="mk-acts"><span class="mk-wallet" title="Tes pièces"></span><button class="btn-primary mk-sell-btn">Vendre une carte</button></div>
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
        <div class="mk-sh-top"><h3 class="mk-h">Vendre une carte</h3><button class="mk-x" aria-label="Fermer">✕</button></div>
        <div class="mk-pick">
          <div class="mk-tools"><input class="search mk-pq" type="search" placeholder="Chercher dans ta collection…" autocomplete="off" spellcheck="false" aria-label="Chercher une de tes cartes"><label class="tr-tog"><input type="checkbox" class="mk-dups" checked><span>doublons seulement</span></label></div>
          <div class="mk-grid mini mk-g-pick"></div>
        </div>
        <div class="mk-price" hidden>
          <div class="mk-chosen"></div>
          <div class="mk-pform">
            <label class="mk-pl">Prix <span class="mk-hint"></span></label>
            <div class="mk-prow"><button class="btn-ghost mk-step" data-d="-1" aria-label="Moins cher">−</button><input class="mk-pin" type="number" inputmode="numeric" min="1" step="1" aria-label="Prix en pièces"><button class="btn-ghost mk-step" data-d="1" aria-label="Plus cher">+</button></div>
            <div class="mk-cmp"></div>
            <div class="mk-pbtns"><button class="btn-ghost mk-back">‹ Une autre carte</button><button class="btn-primary mk-go">Mettre en vente</button></div>
            <p class="muted mk-note">La carte quitte ta collection tant qu’elle est en vente. Tu peux la retirer quand tu veux : elle revient.</p>
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
    q('.mk-mine').hidden = !mine.length && !board.sold.length && !board.bought.length;
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
    gOpen.replaceChildren(...list.map(item));
    const empty = q('.mk-empty');
    empty.hidden = list.length > 0;
    empty.textContent = board.open.some((m) => !isMine(m)) ? 'Aucune carte ne correspond.' : 'Rien en vente pour l’instant. Lance-toi : « Vendre une carte ».';
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
  q('.mk-back').addEventListener('click', () => {
    chosen = null;
    q('.mk-price').hidden = true;
    q('.mk-pick').hidden = false;
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
  q('.mk-sell-btn').addEventListener('click', openSheet);
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
  };
}
