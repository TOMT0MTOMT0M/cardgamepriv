import { t as tr } from '../../core/i18n';
import '../../core/i18n/fr/game.views.cardPanel'; // (textes de ce module, version anglaise)
import { cardKey, lockedCards, type GameBackend } from '../backend';
import { catalogEntry, type CatalogEntry } from '../../core/sets/themes';
import { cardWhere } from '../../core/cardSearch';
import { rarity, type RarityId } from '../../core/rarity';
import { guardReason, proposable, type CardPanel, type DealCard } from '../../core/deals';
import { fmtCoins } from '../../core/economy';
import { busyButton, errMsg, esc, h, navigate, popLayer, pushLayer, thumbUrl, toast } from '../ui';
import { confirmTap } from './safety';
import { haptics } from '../../core/haptics';
import { COIN_ICON } from './wallet';
import '../echanges.css';

/**
 * REFONTE DES ÉCHANGES (11/11), lot A — « CHEZ LES JOUEURS » sous chaque carte (fiche de la collection, carte manquante
 * comprise) : qui l'a (doublon ou non, en ligne), qui la vend et à quel prix, qui la veut. DEUX gestes seulement :
 * « Je la veux » (envies) et « Protéger » (mes doublons sont proposés par défaut, src/core/deals.ts). Les lignes portent
 * leur action : Demander (un toucher, contrepartie choisie par le serveur) · Acheter (marché) · Proposer.
 * Lecture serveur à la demande (convex/deals.ts `cardPanel`, ~30 documents), gardée 2 min par carte.
 */

const TTL = 120_000;
const cache = new Map<string, { at: number; p: Promise<CardPanel> }>();
export function loadPanel(backend: GameBackend, cardId: string, force = false): Promise<CardPanel> {
  const hit = cache.get(cardId);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.p;
  const p = backend.cardPanel(cardId);
  cache.set(cardId, { at: Date.now(), p });
  p.catch(() => cache.delete(cardId));
  return p;
}
export const invalidatePanel = (cardId?: string) => (cardId ? cache.delete(cardId) : cache.clear());

const starLbl = (r: RarityId) => (r === 'secret' ? 'Bébou' : `${rarity(r).rank + 1}★`); // i18n-ok
const nameOf = (id: string) => catalogEntry(id)?.name ?? id;

/** État de mes exemplaires d'une carte, vu des échanges. */
export function myTradeState(backend: GameBackend, cardId: string, r: RarityId) {
  const st = backend.state;
  const row = st.collection.find((c) => c.cardId === cardId && c.rarity === r);
  const count = row?.count ?? 0;
  const locked = lockedCards(st).get(cardKey({ cardId, rarity: r })) ?? 0;
  const why = guardReason(cardId, r, { protected: st.tradeProtected, wishlist: st.wishlist });
  const n = row ? proposable(row, locked, { protected: st.tradeProtected, wishlist: st.wishlist }) : 0;
  const isProtected = st.tradeProtected.includes(cardId);
  const line = !count
    ? ''
    : why === 'secret'
      ? tr('cp.bebouNever')
      : isProtected
        ? tr('cp.protectedNever')
        : why === 'envie'
          ? tr('cp.inWishes')
          : n > 0
            ? tr('cp.dupsOffered', { n })
            : locked
              ? tr('cp.busy')
              : tr('cp.single');
  return { count, locked, proposable: n, isProtected, secret: why === 'secret', line };
}

/** Les deux gestes (« Je la veux » · « Protéger »), en boutons `.va` de la visionneuse ou `.cp-g` de la fiche. */
export function gestureButtons(backend: GameBackend, cardId: string, r: RarityId, cls: string, onChange: () => void): HTMLElement[] {
  const wish = backend.state.wishlist.includes(cardId);
  const me = myTradeState(backend, cardId, r);
  const out: HTMLElement[] = [];
  const w = h('button', `${cls} va-wish cp-wish${wish ? ' on' : ''}`, `♥ <span>${wish ? tr('cp.wanted') : tr('cp.want')}</span>`);
  w.title = wish ? tr('cp.unwish') : tr('cp.wishTitle');
  w.setAttribute('aria-pressed', String(wish));
  w.addEventListener('click', async () => {
    haptics.pulse(8);
    try {
      await backend.toggleWish(cardId);
      onChange();
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  });
  out.push(w);
  if (me.count && !me.secret) {
    const p = h('button', `${cls} va-protect cp-protect${me.isProtected ? ' on' : ''}`, `<span class="cp-lock" aria-hidden="true"></span><span>${me.isProtected ? tr('cp.protected') : tr('cp.protect')}</span>`);
    p.title = me.isProtected ? tr('cp.unprotectTitle') : tr('cp.protectTitle');
    p.setAttribute('aria-pressed', String(me.isProtected));
    p.addEventListener('click', async () => {
      haptics.pulse(8);
      try {
        await backend.setTradeProtect(cardId, !me.isProtected);
        toast(me.isProtected ? tr('cp.unprotectedToast') : tr('cp.protectedToast'), 'ok');
        onChange();
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
    out.push(p);
  }
  return out;
}

/** Résumé en une ligne (« 3 l'ont · dès 40 · 2 la veulent »), sous la carte de la visionneuse ; un toucher ouvre la fiche. */
export function panelStrip(backend: GameBackend, cardId: string, r: RarityId): HTMLElement {
  const el = h('button', 'cp-strip', '<span class="cp-s-load">' + tr('cp.players') + '</span>');
  el.setAttribute('aria-label', tr('cp.playersTitle'));
  el.addEventListener('click', () => showCardPanel(backend, cardId));
  // (la visionneuse fait défiler les cartes : on attend 0,6 s sur la même carte avant de demander au serveur)
  const t = window.setTimeout(() => {
    if (!el.isConnected) return;
    loadPanel(backend, cardId)
      .then((p) => {
        if (!el.isConnected) return;
        const me = myTradeState(backend, cardId, r);
        const parts: string[] = [];
        const dups = p.owners.filter((o) => o.dup).length;
        parts.push(p.owners.length ? `${tr('cp.owners', { n: p.owners.length })}${dups ? ` · <em class="cp-ok">${tr('cp.asDup', { n: dups })}</em>` : ''}` : tr('cp.nobody'));
        if (p.sellers.length) parts.push(`${tr('cp.forSale')} <span class="cp-c">${COIN_ICON}<b>${fmtCoins(p.sellers[0].price)}</b></span>`);
        if (p.wanters.length) parts.push(`<em class="cp-want">${tr('cp.wanters', { n: p.wanters.length })}</em>`);
        el.innerHTML = `<span class="cp-s-txt">${parts.join('<i class="cp-sep"></i>')}</span>${me.line ? `<span class="cp-s-me">${esc(me.line)}</span>` : ''}<span class="cp-s-go" aria-hidden="true">›</span>`;
      })
      .catch(() => el.isConnected && (el.innerHTML = '<span class="cp-s-load">' + tr('cp.playersGo') + '</span>'));
  }, 600);
  el.addEventListener('pointerdown', () => clearTimeout(t), { once: true });
  return el;
}

/**
 * « Demander » : un toucher, le serveur choisit ce que je donne (un doublon proposable de même étoile qui lui manque).
 * Pas de doublon à proposer : on ouvre le composeur avec la carte déjà demandée (jamais d'impasse).
 */
export async function askFor(backend: GameBackend, to: { userId: string; name: string }, card: DealCard, btn?: HTMLElement, give?: DealCard): Promise<boolean> {
  try {
    const p = backend.quickTrade(to.userId, card, give);
    const r = await (btn ? busyButton(btn, p) : p);
    invalidatePanel(card.cardId);
    toast(tr('cp.reqSent', { to: to.name, get: nameOf(r.get.cardId), give: nameOf(r.give.cardId) }), 'ok');
    return true;
  } catch (e) {
    const m = errMsg(e);
    if (/compose/i.test(m)) {
      toast(tr('cp.openComposer', { msg: m.replace(/ : compose.*$/, '') }), 'info');
      openComposer(to.userId, card);
    } else toast(m, 'err');
    return false;
  }
}
/** « Proposer » mon doublon à quelqu'un qui le cherche : le serveur choisit ce que je reçois. */
export async function offerTo(backend: GameBackend, to: { userId: string; name: string }, card: DealCard, btn?: HTMLElement): Promise<boolean> {
  try {
    const p = backend.quickTrade(to.userId, undefined, card);
    const r = await (btn ? busyButton(btn, p) : p);
    invalidatePanel(card.cardId);
    toast(tr('cp.offered', { to: to.name, give: nameOf(r.give.cardId), get: nameOf(r.get.cardId) }), 'ok');
    return true;
  } catch (e) {
    toast(errMsg(e), 'err');
    return false;
  }
}
/** Composeur manuel (« Composer moi-même »), avec ce joueur et cette carte déjà demandée. */
export function openComposer(userId?: string, get?: DealCard) {
  try {
    if (userId) sessionStorage.setItem('bebou.tradeWith', userId);
    if (get) sessionStorage.setItem('bebou.tradeGet', `${get.cardId}:${get.rarity}`);
  } catch {
    /* stockage bloqué : le composeur s'ouvre sans rien de prérempli */
  }
  navigate('#/echanges/composer');
}

/** La fiche « Chez les joueurs » par-dessus la page (carte manquante, ou « › » sous une carte de la visionneuse). */
export function showCardPanel(backend: GameBackend, cardId: string, hint?: string) {
  const e: CatalogEntry | undefined = catalogEntry(cardId) ?? undefined;
  if (!e) return;
  const r = e.rarity as RarityId;
  const rr = rarity(r);
  const card: DealCard = { cardId, rarity: r };
  const veil = h('div', 'ow-veil cp-veil');
  veil.innerHTML = `<div class="ow cp" role="dialog" aria-modal="true" aria-labelledby="cp-t" style="--rc:${rr.hex}">
    <div class="ow-h">
      ${!rr.secret ? `<img class="ow-img" alt="" src="${thumbUrl(e)}">` : '<span class="ow-img ow-sec">?</span>'}
      <div class="ow-id">
        <span class="ow-k">${tr('cp.playersH')}</span>
        <b id="cp-t">${esc(e.name)}</b>
        <span class="ow-sub">${esc(cardWhere(e))} · <i>${starLbl(r)}</i></span>
        <span class="ow-me cp-me"></span>
      </div>
      <button class="ow-x" aria-label="${tr('common.close')}">✕</button>
    </div>
    <div class="cp-gestures"></div>
    <div class="ow-list cp-list" aria-live="polite"><div class="ow-row skel"></div><div class="ow-row skel"></div><div class="ow-row skel"></div></div>
  </div>`;
  const list = veil.querySelector<HTMLElement>('.cp-list')!;
  const gest = veil.querySelector<HTMLElement>('.cp-gestures')!;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    popLayer(close);
    document.removeEventListener('keydown', onKey);
    veil.classList.remove('on');
    veil.classList.add('out');
    setTimeout(() => veil.remove(), 260);
  };
  const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
  veil.addEventListener('click', (ev) => ev.target === veil && close());
  veil.querySelector('.ow-x')!.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(veil);
  pushLayer(close);
  requestAnimationFrame(() => veil.classList.add('on'));

  const renderHead = () => {
    const me = myTradeState(backend, cardId, r);
    veil.querySelector('.cp-me')!.textContent = hint ?? (me.count ? tr('cp.youHave', { n: me.count, line: me.line ? ` · ${me.line}` : '' }) : tr('cp.notYet'));
    gest.replaceChildren(...gestureButtons(backend, cardId, r, 'cp-g', () => ((hint = undefined), renderHead())));
  };
  renderHead();

  const row = (cls: string, who: string, sub: string, online: boolean | null, action?: HTMLElement) => {
    const w = h('div', `ow-row ${cls}`);
    w.innerHTML = `${online === null ? '<span class="dot cp-dot-none"></span>' : `<span class="dot${online ? ' on' : ''}" title="${online ? tr('cp.online') : 'hors ligne'}"></span>`}<span class="ow-who"><b>${who}</b><small>${sub}</small></span>`;
    if (action) w.append(action);
    return w;
  };
  const render = (p: CardPanel) => {
    if (closed) return;
    const me = myTradeState(backend, cardId, r);
    list.replaceChildren();
    const sec = (title: string, n: number) => list.append(h('h4', 'cp-h', `${title}${n ? ` <small>${n}</small>` : ''}`));
    // qui l'a
    sec(tr('cp.whoHas'), p.owners.length);
    if (!p.owners.length) list.append(h('p', 'ow-empty', me.count ? tr('cp.nobodyYet') : tr('cp.nobodyWish')));
    for (const o of p.owners) {
      let btn: HTMLElement | undefined;
      if (!me.count && !rr.secret) {
        btn = h('button', `${o.dup ? 'btn-primary' : 'btn-ghost'} ow-go cp-ask`, tr('cp.ask'));
        btn.title = o.dup ? tr('cp.askTitle') : tr('cp.onlyTheirs');
        btn.addEventListener('click', async () => {
          if (await askFor(backend, { userId: o.userId, name: o.name }, card, btn)) close();
        });
      }
      list.append(row(o.dup ? 'dup' : '', esc(o.name), o.dup ? `doublon · ${o.count} exemplaires` : o.count > 1 ? tr('cp.kept', { n: o.count }) : tr('cp.theirOnly'), o.online, btn));
    }
    // en vente
    if (p.sellers.length) {
      sec(tr('cp.forSaleT'), p.sellers.length);
      for (const m of p.sellers) {
        const b = h('button', 'btn-primary ow-go cp-buy', tr('cp.buy'));
        b.addEventListener('click', async () => {
          if (!confirmTap(b, tr('cp.buySure', { price: fmtCoins(m.price) }), 3500, `cp-buy-${m.id}`)) return;
          try {
            await busyButton(b, backend.marketBuy(m.id, m.price));
            invalidatePanel(cardId);
            toast(tr('cp.got', { name: e.name }), 'ok');
            close();
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
        list.append(row('cp-sell', `<span class="cp-c">${COIN_ICON}<b>${fmtCoins(m.price)}</b></span>`, `${esc(m.name)} · n°${m.mintNumber}`, null, b));
      }
    }
    // qui la veut
    if (p.wanters.length) {
      sec(tr('cp.whoWants'), p.wanters.length);
      for (const w of p.wanters) {
        let b: HTMLElement | undefined;
        if (me.proposable > 0) {
          b = h('button', 'btn-ghost ow-go cp-offer', tr('cp.offer'));
          b.title = tr('cp.offerTitle');
          b.addEventListener('click', async () => {
            if (await offerTo(backend, { userId: w.userId, name: w.name }, card, b)) close();
          });
        }
        list.append(row('cp-wants', esc(w.name), me.proposable > 0 ? tr('cp.seeksDup') : tr('cp.seeks'), w.online, b));
      }
    }
  };
  loadPanel(backend, cardId)
    .then(render)
    .catch((err) => !closed && (list.innerHTML = `<p class="ow-empty err">${esc(errMsg(err))}</p>`));
  return close;
}
