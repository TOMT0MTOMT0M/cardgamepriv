import { fmtDate, t as tr } from '../../core/i18n';
import '../../core/i18n/fr/game.views.auctions'; // (textes de ce module, version anglaise)
import './auctions.css';
import type { AuctionItem, GameBackend, MarketItem } from '../backend';
import { catalogEntry } from '../../core/sets/themes';
import type { RarityId } from '../../core/rarity';
import { fmtCoins } from '../../core/economy';
import { AUCTION_DAYS, auctionCapped, auctionEndsAt, auctionMax, auctionMinStart, auctionNextMin, parisDay } from '../../core/auctions';
import { marketSuggested } from '../../core/market';
import { busyButton, errMsg, esc, h, toast } from '../ui';
import { confirmTap } from './safety';
import { haptics } from '../../core/haptics';
import { setMarketPlugin } from './market';

/**
 * (V3) ENCHÈRES AU MARCHÉ — interface (règles : src/core/auctions.ts ; serveur : convex/auctions.ts ; démo :
 * src/game/auctionsLocal.ts). Se branche sur la vue du Marché par son point d'accroche (`setMarketPlugin`,
 * views/market.ts) : les enchères ouvertes rejoignent la grille Acheter et « Mes ventes » (`kind: 'auction'`, prix =
 * offre en tête ou mise à prix), le coin de la tuile dit la fin (« ce soir 21 h », « demain 21 h »…) ou « En tête »,
 * la fiche d'une enchère porte le réglage − montant + et « Offrir N » (deux touchers), la feuille Vendre son onglet
 * « Enchère » (mise à prix ≥ valeur de Forge, durée 24 / 48 / 72 h, date de clôture).
 * Abonnement au serveur : celui de la vue du Marché (seulement quand un onglet du marché est à l'écran).
 */

const nameOf = (id: string) => catalogEntry(id)?.name ?? id;

/** fin, en court (coin de la tuile) : « ce soir 21 h » · « demain 21 h » · « sam. 29 21 h » · « 42 min » · « Terminée » */
export function endsShort(endsAt: number, now = Date.now()): string {
  const left = endsAt - now;
  if (left <= 0) return tr('au.cDone');
  if (left < 3600_000) return tr('au.cIn', { t: `${Math.max(1, Math.ceil(left / 60_000))} min` });
  const dd = parisDay(endsAt) - parisDay(now);
  if (dd <= 0) return tr('au.cTonight');
  if (dd === 1) return tr('au.cTomorrow');
  return tr('au.cDay', { day: fmtDate(endsAt, { weekday: 'short', day: 'numeric', timeZone: 'Europe/Paris' }) });
}
/** pas du réglage − / + : un dixième de la valeur de la carte (au moins 1) */
const stepOf = (r: RarityId) => Math.max(1, Math.round(marketSuggested(r) / 10));

/** Une enchère vue par la grille du Marché. */
const asMarketItem = (a: AuctionItem): MarketItem => ({
  id: a.id,
  sellerId: a.sellerId,
  sellerName: a.sellerName,
  sellerAvatar: a.sellerAvatar,
  cardId: a.cardId,
  rarity: a.rarity,
  mintNumber: a.mintNumber,
  price: a.bid ?? a.startPrice,
  status: 'open',
  createdAt: a.createdAt,
  kind: 'auction',
});

/** Branche les enchères sur la vue du Marché (une fois, au chargement de la page Marché). */
export function installAuctions(backend: GameBackend, o: { chime(): void }): void {
  /** dernières enchères connues, par id (le coin et la fiche les relisent) */
  const live = new Map<string, AuctionItem>();
  /** fiches ouvertes : redessinées quand l'enchère change (dépassé, nouvelle offre) */
  const feet = new Set<() => void>();
  const isMine = (a: AuctionItem) => a.sellerId === (backend.state.user?.id ?? 'me') || a.sellerId === 'me';
  /** montant choisi par enchère (gardé d'un rendu à l'autre de la fiche) */
  const amounts = new Map<string, number>();

  function foot(a: AuctionItem, box: HTMLElement, close: () => void) {
    box.replaceChildren();
    const info = h(
      'div',
      'auc-state',
      `${a.lead ? `<span class="auc-st lead">${tr('au.lead')}</span>` : ''}<span>${a.bid === undefined ? tr('au.noBid') : tr('au.bids', { n: a.bids })}${a.bidderName && !a.lead && a.bid !== undefined ? ` · ${tr('au.top', { name: esc(a.bidderName) })}` : ''}</span><span class="auc-end">${esc(endsShort(a.endsAt))}</span>`,
    );
    box.append(info);
    if (isMine(a)) {
      if (a.bid === undefined) {
        const b = h('button', 'btn-ghost mk-cancel', tr('au.withdraw')) as HTMLButtonElement;
        b.addEventListener('click', async () => {
          if (!confirmTap(b, tr('au.withdrawQ'))) return;
          try {
            await busyButton(b, backend.auctionCancel(a.id));
            toast(tr('au.back', { name: nameOf(a.cardId) }), 'ok');
            close();
          } catch (e) {
            toast(errMsg(e), 'err');
          }
        });
        box.append(b);
      } else box.append(h('p', 'muted mk-note', tr('au.locked')));
      return;
    }
    if (a.lead || a.endsAt <= Date.now()) {
      if (a.lead) box.append(h('p', 'muted mk-note', tr('au.held')));
      return;
    }
    if (auctionCapped(a)) {
      box.append(h('p', 'muted mk-note', tr('au.capped')));
      return;
    }
    const min = auctionNextMin(a);
    const max = auctionMax(a.rarity);
    const cur = () => Math.min(max, Math.max(min, amounts.get(a.id) ?? min));
    const row = h(
      'div',
      'auc-bidrow',
      `<button class="btn-ghost mk-step" data-d="-1" aria-label="${tr('au.less')}">−</button><output class="auc-amt" aria-label="${tr('au.bidA')}">${fmtCoins(cur())}</output><button class="btn-ghost mk-step" data-d="1" aria-label="${tr('au.more')}">+</button>`,
    );
    const go = h('button', 'btn-primary mk-buy auc-go', tr('au.bidN', { n: fmtCoins(cur()) })) as HTMLButtonElement;
    row.querySelectorAll<HTMLButtonElement>('.mk-step').forEach((s) =>
      s.addEventListener('click', () => {
        amounts.set(a.id, Math.min(max, Math.max(min, cur() + Number(s.dataset.d) * stepOf(a.rarity))));
        row.querySelector('.auc-amt')!.textContent = fmtCoins(cur());
        go.textContent = tr('au.bidN', { n: fmtCoins(cur()) });
        delete go.dataset.armedAt;
      }),
    );
    go.addEventListener('click', async () => {
      const amount = cur();
      const coins = backend.eco.snapshot?.coins ?? 0;
      if (coins < amount) return toast(tr('au.short', { n: fmtCoins(amount - coins) }), 'err');
      if (!confirmTap(go, tr('au.bidSure', { n: fmtCoins(amount) }))) return;
      try {
        await busyButton(go, backend.auctionBid(a.id, amount));
        amounts.delete(a.id);
        haptics.pulse([10, 40, 18]);
        o.chime();
        toast(tr('au.bidOk', { name: nameOf(a.cardId), n: fmtCoins(amount) }), 'ok');
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
    box.append(row, h('div', 'mk-note muted auc-hint', tr('au.minNext', { n: fmtCoins(min), max: fmtCoins(max) })), go, h('p', 'muted mk-note', tr('au.held')));
  }

  setMarketPlugin({
    watch(cb) {
      return backend.watchAuctions((b) => {
        live.clear();
        for (const a of b.open) live.set(a.id, a);
        cb(b.open.map(asMarketItem));
        for (const f of [...feet]) f();
      });
    },
    corner(m) {
      const a = live.get(m.id);
      if (!a) return '';
      return a.lead ? `${tr('au.lead')} · ${endsShort(a.endsAt)}` : endsShort(a.endsAt);
    },
    dealFoot(m, box, close) {
      // (la fiche est posée dans la page juste après cet appel : le premier dessin se fait hors page)
      let first = true;
      const redraw = () => {
        if (!first && !box.isConnected) return void feet.delete(redraw);
        first = false;
        const a = live.get(m.id);
        if (!a) {
          // enchère close ou retirée pendant que la fiche est ouverte
          box.replaceChildren(h('p', 'muted mk-note', tr('au.cDone')));
          return;
        }
        foot(a, box, close);
        // le prix de la fiche (posé par views/market.ts à l'ouverture) suit l'offre en tête
        const pr = box.parentElement?.querySelector('.mk-dpr .mk-c b');
        if (pr) pr.textContent = fmtCoins(a.bid ?? a.startPrice);
      };
      feet.add(redraw);
      redraw();
    },
    sellForm(card, box, done) {
      box.replaceChildren(auctionSellForm(backend, card, { onDone: done }));
    },
  });
}

/**
 * Formulaire « Enchère » de la feuille « Vendre » pour la carte choisie : mise à prix (≥ valeur de Forge), durée,
 * date de clôture, bouton. `onDone` après la mise aux enchères (fermer la feuille).
 */
export function auctionSellForm(backend: GameBackend, chosen: { cardId: string; rarity: RarityId }, o: { onDone(): void }): HTMLElement {
  const r = chosen.rarity;
  const min = auctionMinStart(r);
  const max = auctionMax(r);
  let days: number = AUCTION_DAYS[1];
  const f = h('div', 'auc-sellf');
  f.innerHTML = `
    <label class="mk-pl">${tr('au.startA')} <span class="mk-hint">${tr('au.startHint', { min: fmtCoins(min), max: fmtCoins(max) })}</span></label>
    <div class="mk-prow"><button class="btn-ghost mk-step" data-d="-1" aria-label="${tr('au.less')}">−</button><input class="mk-pin auc-pin" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${min}" aria-label="${tr('au.startA')}"><button class="btn-ghost mk-step" data-d="1" aria-label="${tr('au.more')}">+</button></div>
    <div class="mk-pl">${tr('au.dur')}</div>
    <div class="seg mk-dur auc-dur" role="radiogroup" aria-label="${tr('au.durA')}">${AUCTION_DAYS.map((d) => `<button role="radio" data-d="${d}" class="${d === days ? 'on' : ''}" aria-checked="${d === days}">${d * 24} h</button>`).join('')}</div>
    <p class="muted mk-note auc-when"></p>
    <div class="mk-pbtns"><button class="btn-primary auc-sgo">${tr('au.go')}</button></div>
    <p class="muted mk-note">${tr('au.leaves')}</p>`;
  const pin = f.querySelector<HTMLInputElement>('.auc-pin')!;
  const go = f.querySelector<HTMLButtonElement>('.auc-sgo')!;
  const val = () => Math.round(Number(pin.value) || 0);
  function sync() {
    go.disabled = !(val() >= min && val() <= max);
    const end = auctionEndsAt(Date.now(), days);
    const when = parisDay(end) - parisDay(Date.now()) === 1 ? tr('au.whenTomorrow') : fmtDate(end, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
    f.querySelector('.auc-when')!.textContent = tr('au.endsOn', { when });
  }
  pin.addEventListener('input', sync);
  f.querySelectorAll<HTMLButtonElement>('.mk-step').forEach((b) =>
    b.addEventListener('click', () => {
      pin.value = String(Math.min(max, Math.max(min, (val() || min) + Number(b.dataset.d) * stepOf(r))));
      sync();
    }),
  );
  f.querySelectorAll<HTMLButtonElement>('.auc-dur [data-d]').forEach((b) =>
    b.addEventListener('click', () => {
      days = Number(b.dataset.d);
      f.querySelectorAll<HTMLButtonElement>('.auc-dur [data-d]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      sync();
    }),
  );
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
