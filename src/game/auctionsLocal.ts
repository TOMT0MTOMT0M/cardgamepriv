import { fe } from '../core/errors';
import { fm } from '../core/msgs';
import { MARKET_MAX_OPEN, marketSuggested } from '../core/market';
import { AUCTION_DAYS, auctionEndsAt, auctionMax, auctionMinStart, auctionNextMin, auctionProblem } from '../core/auctions';
import type { RarityId } from '../core/rarity';
import type { AuctionBoard, AuctionItem } from './backend';

/**
 * (V3) ENCHÈRES du mode démo — mêmes règles que convex/auctions.ts (src/core/auctions.ts). Les robots mettent quelques
 * doublons aux enchères et enchérissent : sur les tiennes (quelques secondes après la mise aux enchères), et contre toi
 * (parfois, tant que l'offre reste raisonnable : au plus 2× la valeur de la carte). La clôture se fait à la lecture
 * (pas de tâche programmée en démo). Branché par localBackend.ts.
 */
export type DemoAuction = AuctionItem & { bidderId?: string };
interface Card {
  cardId: string;
  rarity: RarityId;
  count: number;
  bestMintNumber: number;
}
export interface DemoAuctionDeps {
  /** la liste sauvegardée (créée au besoin) */
  list(): DemoAuction[];
  seq(): number;
  bots(): Array<{ id: string; name: string; inv: Record<string, Card> }>;
  meName(): string;
  /** exemplaires libres de cette carte chez moi */
  free(cardId: string, rarity: RarityId): number;
  /** meilleur n° d'impression chez moi */
  mint(cardId: string, rarity: RarityId): number;
  take(owner: string, cardId: string, rarity: RarityId): void;
  give(owner: string, cardId: string, rarity: RarityId, mint: number): void;
  /** pièces : négatif = payé (lève une erreur s'il en manque) */
  coins(amount: number, label: ReturnType<typeof fm>): void;
  /** ventes à prix fixe ouvertes chez moi */
  marketOpen(): number;
  sync(): void;
  cardName(cardId: string): string;
}

const BOT_DELAY = () => 6000 + Math.random() * 10000;

export function demoAuctions(d: DemoAuctionDeps) {
  const A = () => {
    const l = d.list();
    if (!l.length) seedBots(l);
    return l;
  };
  let seeded = false;
  function seedBots(l: DemoAuction[]) {
    if (seeded) return;
    seeded = true;
    const now = Date.now();
    for (const bot of d.bots()) {
      const dup = Object.values(bot.inv).filter((c) => c.count >= 2 && c.rarity !== 'secret').sort(() => Math.random() - 0.5)[0];
      if (!dup) continue;
      d.take(bot.id, dup.cardId, dup.rarity);
      const start = auctionMinStart(dup.rarity);
      l.push({ id: `au${d.seq()}`, sellerId: bot.id, sellerName: bot.name, cardId: dup.cardId, rarity: dup.rarity, mintNumber: dup.bestMintNumber, startPrice: start, bids: 0, lead: false, status: 'open', createdAt: now, endsAt: auctionEndsAt(now, AUCTION_DAYS[Math.floor(Math.random() * AUCTION_DAYS.length)]) });
    }
  }
  const lbl = (k: 'c.auctionBid' | 'c.auctionRefund' | 'c.auctionSell', a: DemoAuction) => fm(k, { card: d.cardName(a.cardId), cardId: a.cardId });

  /** clôt les échues (rejouable : statut relu) */
  function closeDue(now = Date.now()) {
    let changed = false;
    for (const a of A()) {
      if (a.status !== 'open' || a.endsAt > now) continue;
      changed = true;
      a.resolvedAt = now;
      if (a.bidderId && a.bid) {
        a.status = 'sold';
        if (a.sellerId === 'me') d.coins(a.bid, lbl('c.auctionSell', a));
        d.give(a.bidderId, a.cardId, a.rarity, a.mintNumber);
      } else {
        a.status = 'unsold';
        d.give(a.sellerId, a.cardId, a.rarity, a.mintNumber);
      }
    }
    return changed;
  }
  const openMine = () => A().filter((a) => a.sellerId === 'me' && a.status === 'open').length;

  /** un robot surenchérit (si l'offre reste ≤ 2× la valeur de la carte) */
  function botBid(id: string, chance: number) {
    setTimeout(() => {
      const a = A().find((x) => x.id === id && x.status === 'open' && x.endsAt > Date.now());
      if (!a || Math.random() > chance) return;
      const amount = auctionNextMin(a);
      if (amount > Math.max(auctionMinStart(a.rarity), 2 * marketSuggested(a.rarity)) || amount > auctionMax(a.rarity)) return;
      const bots = d.bots().filter((b) => b.id !== a.sellerId && b.id !== a.bidderId);
      const bot = bots[Math.floor(Math.random() * bots.length)];
      if (!bot) return;
      if (a.bidderId === 'me' && a.bid) d.coins(a.bid, lbl('c.auctionRefund', a));
      Object.assign(a, { bid: amount, bidderId: bot.id, bidderName: bot.name, bids: a.bids + 1 });
      d.sync();
      // et parfois une autre (contre un robot)
      if (a.sellerId === 'me') botBid(id, 0.3);
    }, BOT_DELAY());
  }

  return {
    openMine,
    board(): AuctionBoard {
      closeDue();
      const week = Date.now() - 7 * 86400_000;
      const v = (a: DemoAuction): AuctionItem => ({ ...a, lead: a.bidderId === 'me' });
      const all = A();
      return {
        open: all.filter((a) => a.status === 'open').sort((a, b) => a.endsAt - b.endsAt).map(v),
        recent: all
          .filter((a) => (a.status === 'sold' || a.status === 'unsold') && (a.resolvedAt ?? 0) >= week && (a.sellerId === 'me' || (a.status === 'sold' && a.bidderId === 'me')))
          .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
          .map(v),
      };
    },
    create(cardId: string, rarity: RarityId, startPrice: number, days: number) {
      const problem = auctionProblem(rarity, startPrice, days);
      if (problem) throw new Error(problem);
      if (d.marketOpen() + openMine() >= MARKET_MAX_OPEN) throw new Error(fe('market.2', { p0: MARKET_MAX_OPEN }));
      if (d.free(cardId, rarity) < 1) throw new Error(fe('econLib.6', { p0: d.cardName(cardId) }));
      const mint = d.mint(cardId, rarity);
      d.take('me', cardId, rarity);
      const now = Date.now();
      const id = `au${d.seq()}`;
      A().push({ id, sellerId: 'me', sellerName: d.meName(), cardId, rarity, mintNumber: mint, startPrice, bids: 0, lead: false, status: 'open', createdAt: now, endsAt: auctionEndsAt(now, days) });
      d.sync();
      botBid(id, 0.7);
    },
    bid(id: string, amount: number) {
      closeDue();
      const a = A().find((x) => x.id === id);
      if (!a) throw new Error(fe('auctions.3'));
      if (a.status !== 'open' || a.endsAt <= Date.now()) throw new Error(fe('auctions.4'));
      if (a.sellerId === 'me') throw new Error(fe('auctions.5'));
      if (a.bidderId === 'me') throw new Error(fe('auctions.8'));
      const min = auctionNextMin(a);
      if (!Number.isInteger(amount) || amount < min) throw new Error(fe('auctions.6', { p0: min }));
      if (amount > auctionMax(a.rarity)) throw new Error(fe('auctions.7', { p0: auctionMax(a.rarity) }));
      d.coins(-amount, lbl('c.auctionBid', a));
      Object.assign(a, { bid: amount, bidderId: 'me', bidderName: d.meName(), bids: a.bids + 1 });
      d.sync();
      botBid(id, 0.5);
    },
    cancel(id: string) {
      const a = A().find((x) => x.id === id && x.sellerId === 'me');
      if (!a) throw new Error(fe('auctions.3'));
      if (a.status !== 'open') throw new Error(fe('auctions.4'));
      if (a.bidderId) throw new Error(fe('auctions.9'));
      a.status = 'cancelled';
      a.resolvedAt = Date.now();
      d.give('me', a.cardId, a.rarity, a.mintNumber);
      d.sync();
    },
  };
}
