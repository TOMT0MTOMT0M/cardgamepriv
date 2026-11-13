import { deviceId, net, type NetState } from '../core/net/client';
import type { Id } from '../../convex/_generated/dataModel';
import { BIG_PULL_RARITIES, EMPTY_MARKET, type BigPull, type GameBackend, type GameState, type SealedPack, type TradeHistoryItem, type TradeView } from './backend';
import type { PackRequest } from '../core/packRoll';
import { createOnlineEco } from './ecoOnline';
import type { Social } from './backend';
import type { BoardState, ListingOfferView, ListingView } from './backend';
import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';
import type { ChatInbox, ChatMsg } from '../core/chat';
import type { PackEvent } from '../core/events';

/** demande de booster → arguments du serveur (booster du moment : l'id de l'événement suffit, le serveur relit le reste) */
const packArgs = (req: PackRequest) => (req.event ? { packKind: 'theme' as const, eventId: req.event.id as Id<'packEvents'> } : { packKind: req.kind, themeId: req.themeId });

/** Le vrai serveur : Convex (temps réel) + Discord ou pseudo, via le client partagé avec le labo (core/net/client.ts). */
/**
 * (V2, 08/11) drops 6★ / secrètes : cartes des boosters scellés gardées jusqu'au crédit, puis la carte peinte de face
 * part sur Discord (dropShot.ts). Booster scellé avant un rechargement : pas en mémoire → le serveur poste l'illustration.
 */
const sealedCards = new Map<string, Array<{ cardId: string; rarity: string; mintNumber: number }>>();
function keepSealed(id: string, cards: Array<{ cardId: string; rarity: string; mintNumber: number }>) {
  const big = cards.filter((c) => c.rarity === 'mythic' || c.rarity === 'secret');
  if (big.length) sealedCards.set(id, big);
}
function shootRevealed(ids: string[]) {
  const cards = ids.flatMap((id) => {
    const c = sealedCards.get(id) ?? [];
    sealedCards.delete(id);
    return c;
  });
  if (!cards.length) return;
  void import('./dropShot').then((m) => m.sendDropShots(cards, (cardId, mint, img) => net.sendDropShot(cardId, mint, img)));
}

export function createOnlineBackend(): GameBackend {
  const listeners = new Set<(s: GameState) => void>();
  const state: GameState = {
    mode: 'online',
    ready: false,
    user: null,
    authError: null,
    collection: [],
    friends: [],
    feed: [],
    bigPulls: [],
    sealed: null,
    trades: { incoming: [], outgoing: [] },
    missions: null,
    wishlist: [],
    tradeProtected: [],
    binders: [],
    covers: {},
    // AMIS (lot A2) : relu à chaque accès (mémorisé par réponse du serveur) — les battements de cœur des amis mettent
    // `lastSeenAt` à jour sans réveiller tout le jeu (client.ts), la page Amis le relit toutes les 30 s
    get social(): Social {
      return socialOf(net.state.social, net.state.connected);
    },
    board: { mine: [], offers: [] },
  };

  const toSealed = (p: NonNullable<NetState['sealedPack']>): SealedPack => ({
    id: p._id,
    packKind: p.packKind ?? 'bebou',
    themeId: p.themeId,
    maxRarity: p.maxRarity,
    cards: p.cards.map((c) => ({ cardId: c.cardId, cardName: c.cardName, rarity: c.rarity, mintNumber: c.mintNumber, isNew: c.isNew, themeId: c.themeId })),
    ...(p.eventId ? { eventId: p.eventId, eventName: p.eventName } : {}),
  });
  const toTrade = (t: NetState['trades']['incoming'][number]): TradeView => ({
    id: t._id,
    fromId: t.fromUserId,
    toId: t.toUserId,
    fromName: t.fromName,
    toName: t.toName,
    offered: t.offered,
    requested: t.requested,
    note: t.note,
    createdAt: t.createdAt,
    counterOf: t.counterOf,
    quick: t.quick,
  });

  /**
   * Chaque partie de l'état n'est refaite que si sa source a changé (Convex remplace le tableau d'un abonnement quand
   * il change) : un changement de fil ou d'échanges ne recopie plus toute la collection, et `state.collection` garde
   * la même référence → `collectionSig` (mémorisé par tableau, backend.ts) n'est pas recalculé (audit PERF2-08).
   */
  let src: Partial<Record<'user' | 'collection' | 'binders' | 'friends' | 'feed' | 'bigPulls' | 'sealed' | 'trades', unknown>> = {};
  const changed = (k: keyof typeof src, v: unknown) => (src[k] === v ? false : ((src[k] = v), true));
  net.onChange((n) => {
    // `ready` : le serveur a répondu au moins une fois (avant : « connexion… », pas « Connexion Discord »)
    state.ready = n.connected;
    state.authError = n.authError;
    state.launch = n.launch;
    const userChanged = changed('user', n.user);
    if (userChanged) {
      state.user = n.user
        ? {
            id: n.user._id,
            name: n.user.displayName,
            avatarUrl: n.user.avatarUrl,
            packBalance: n.user.packBalance,
            packStored: n.user.packStored ?? n.user.packBalance,
            packRegenAt: n.user.packRegenAt ?? Date.now(),
            boostUntil: n.user.boostUntil,
            totalPacksOpened: n.user.totalPacksOpened,
            pityCount: n.user.pityCount ?? 0,
            streak: n.user.streak ?? undefined,
            staff: !!n.user.staff,
            guideSeen: !!n.user.guideSeen,
            v2TourSeen: !!n.user.v2TourSeen,
            tester: !!n.user.tester,
            gamesNoticeAt: n.user.gamesNoticeAt,
            referralNoticeAt: n.user.referralNoticeAt,
            openingStyle: n.user.openingStyle === 'burn' || n.user.openingStyle === 'fan' ? n.user.openingStyle : undefined,
          }
        : null;
      state.wishlist = n.user?.wishlist ?? [];
      state.tradeProtected = n.user?.tradeProtected ?? [];
      state.covers = n.user?.covers ?? {};
    }
    if (changed('collection', n.collection))
      state.collection = n.collection.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count, bestMintNumber: c.bestMintNumber, firstPulledAt: c.firstPulledAt }));
    if (changed('binders', n.binders))
      state.binders = (n.binders ?? []).map((b) => ({ id: b._id, name: b.name, cards: b.cards, coverCardId: b.coverCardId, pinned: b.pinned, createdAt: b.createdAt }));
    // (les amis dépendent aussi de l'utilisateur : on se retire de la liste)
    if (changed('friends', n.friends) || userChanged)
      state.friends = n.friends
        .filter((f) => f._id !== n.user?._id)
        .map((f) => ({ id: f._id, name: f.displayName, avatarUrl: f.avatarUrl, online: f.online, status: f.statusText, packsOpened: f.totalPacksOpened }));
    const feedChanged = changed('feed', n.feed);
    if (feedChanged) state.feed = n.feed.map((f) => ({ id: f._id, kind: f.kind, message: f.message, rarity: f.rarity, createdAt: f.createdAt }));
    if (changed('bigPulls', n.bigPulls) || (n.bigPulls === null && feedChanged) || userChanged) {
      const rows = n.bigPulls ?? n.feed.filter((f) => f.cardId && f.rarity && BIG_PULL_RARITIES.includes(f.rarity));
      state.bigPulls = rows.map(
        (f): BigPull => ({
          id: f._id,
          userId: f.userId,
          userName: f.displayName,
          avatarUrl: f.avatarUrl,
          cardId: f.cardId!,
          cardName: f.cardName ?? '',
          rarity: f.rarity!,
          mintNumber: f.mintNumber,
          createdAt: f.createdAt,
          mine: !!n.user && f.userId === n.user._id,
        }),
      );
    }
    if (changed('sealed', n.sealedPack)) state.sealed = n.sealedPack ? toSealed(n.sealedPack) : null;
    if (changed('trades', n.trades)) state.trades = { incoming: n.trades.incoming.map(toTrade), outgoing: n.trades.outgoing.map(toTrade) };
    // tableau d'offres (lot T) : refait seulement quand la réponse du serveur change
    if (n.board !== boardSrc) state.board = boardOf((boardSrc = n.board));
    state.missions = n.missions;
    listeners.forEach((fn) => fn(state));
  });

  return {
    state,
    eco: createOnlineEco(),
    onChange(fn) {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
    // (ouverture 07/11) fenêtre de connexion : Discord OU pseudo + mot de passe (views/login.ts)
    login: () => void import('./views/login').then((m) => m.openLogin()),
    markGuideSeen: () => net.markGuideSeen(),
    markV2TourSeen: () => net.markV2TourSeen(),
    logout: () => net.logout(),
    async preparePack(req: PackRequest) {
      const p = await net.preparePack(packArgs(req));
      keepSealed(p.packId, p.cards);
      return {
        id: p.packId,
        packKind: p.packKind,
        themeId: p.themeId,
        maxRarity: p.maxRarity,
        cards: p.cards.map((c) => ({ cardId: c.cardId, cardName: c.cardName, rarity: c.rarity, mintNumber: c.mintNumber, isNew: c.isNew, themeId: c.themeId })),
        ...(p.god ? { god: true } : {}),
        ...(p.eventId ? { eventId: p.eventId, eventName: p.eventName } : {}),
      };
    },
    // (11/11) booster du moment : abonnement léger (quelques lignes, relancé seulement quand un événement change)
    watchEvents: (cb) => net.watch(api.events.current, {}, (rows) => cb((rows ?? []) as PackEvent[]), false, () => cb([])),
    async revealPack(id) {
      await net.revealPack(id as Id<'packOpens'>);
      shootRevealed([id]);
    },
    async preparePacks(req, count) {
      const packs = await net.preparePacks(packArgs(req), count);
      for (const p of packs) keepSealed(p._id, p.cards);
      return packs.map((p) => ({
        id: p._id,
        packKind: p.packKind ?? 'bebou',
        themeId: p.themeId,
        maxRarity: p.maxRarity,
        cards: p.cards.map((c) => ({ cardId: c.cardId, cardName: c.cardName, rarity: c.rarity, mintNumber: c.mintNumber, isNew: c.isNew, themeId: c.themeId })),
        ...(p.god ? { god: true } : {}),
        ...(p.eventId ? { eventId: p.eventId as string, eventName: p.eventName } : {}),
      }));
    },
    async revealPacks(ids) {
      const done = await net.revealPacks(ids as Id<'packOpens'>[]);
      shootRevealed(done);
      return done;
    },
    async friendCollection(friendId) {
      const rows = await net.userCollection(friendId as Id<'users'>);
      return rows.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count, bestMintNumber: c.bestMintNumber }));
    },
    async cardOwners(cardId) {
      const rows = await net.cardOwners(cardId);
      return rows.map((o) => ({ id: o.userId, name: o.name, avatarUrl: o.avatarUrl, online: o.online, rarity: o.rarity, count: o.count, free: o.free }));
    },
    async proposeTrade(toId, offered, requested, note) {
      await net.proposeTrade(toId as Id<'users'>, offered, requested, note);
    },
    async respondTrade(id, accept) {
      await net.respondTrade(id as Id<'trades'>, accept);
    },
    async cancelTrade(id) {
      await net.cancelTrade(id as Id<'trades'>);
    },
    async counterTrade(id, offered, requested, note) {
      await net.counterTrade(id as Id<'trades'>, offered, requested, note);
    },
    async tradeHistory() {
      const rows = await net.tradeHistory(30);
      return rows.filter((t) => t.status !== 'pending').map((t): TradeHistoryItem => ({ ...toTrade(t), status: t.status as TradeHistoryItem['status'], resolvedAt: t.resolvedAt ?? t.createdAt }));
    },
    async friendWishlist(friendId) {
      return await net.wishlistOf(friendId as Id<'users'>);
    },
    // refonte des échanges (11/11, convex/deals.ts)
    async cardPanel(cardId) {
      return await net.ask(api.deals.cardPanel, { cardId });
    },
    async forYou() {
      // (audit 12/11, décision 10) mes lignes en double, déjà connues ici : le serveur ne relit plus toute ma collection
      const give = net.state.collection
        .filter((c) => c.count > 1)
        .sort((x, y) => y.count - x.count)
        .slice(0, 600)
        .map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count }));
      return await net.ask(api.deals.forYou, { give });
    },
    async quickTrade(toId, get, give) {
      const r = await net.call(api.deals.quick, { toUserId: toId as Id<'users'>, get, give });
      return { get: r.get, give: r.give };
    },
    async swapTradeGive(tradeId, cardId) {
      await net.call(api.deals.swapGive, { tradeId: tradeId as Id<'trades'>, cardId });
    },
    async tradePickOptions(tradeId) {
      return (await net.ask(api.deals.pickOptions, { tradeId: tradeId as Id<'trades'> })).options;
    },
    async acceptTradePick(tradeId, cardId) {
      const r = await net.call(api.deals.acceptPick, { tradeId: tradeId as Id<'trades'>, cardId });
      return { changed: r.changed };
    },
    async setTradeProtect(cardId, on) {
      // réponse immédiate (la souscription `me` confirme juste après)
      state.tradeProtected = await net.call(api.deals.setProtect, { cardId, on });
      listeners.forEach((fn) => fn(state));
    },
    async claimMission(id) {
      return (await net.claimMission(id)).reward;
    },
    async claimMissionBonus() {
      return (await net.claimMissionBonus()).reward;
    },
    async rerollMission(id) {
      await net.rerollMission(id);
    },
    // (audit 12/11, S07 / A4-02) profil d'un ami : le profil et sa collection en une seule lecture serveur
    async friendProfile(userId) {
      const r = await net.profile(userId as Id<'users'>, true);
      if (!r) return { profile: null, cards: [] };
      const { collection, ...p } = r;
      return { profile: { ...p, id: p.id, pinnedBinder: p.pinnedBinder ? { ...p.pinnedBinder, id: p.pinnedBinder.id } : null, pinnedBinders: p.pinnedBinders?.map((b) => ({ ...b, id: b.id as string })) }, cards: collection ?? [] };
    },
    async profile(userId) {
      const p = await net.profile(userId as Id<'users'>);
      return p ? { ...p, id: p.id, pinnedBinder: p.pinnedBinder ? { ...p.pinnedBinder, id: p.pinnedBinder.id } : null, pinnedBinders: p.pinnedBinders?.map((b) => ({ ...b, id: b.id as string })) } : null;
    },
    async setShowcase(cards) {
      await net.setShowcase(cards);
    },
    async setBio(bio) {
      await net.setBio(bio);
    },
    async setCosmetics(choice) {
      return await net.setCosmetics(choice);
    },
    async setOpening(style) {
      await net.setOpening(style);
    },
    async setProfileMedia(kind, file) {
      return await net.setProfileMedia(kind, file);
    },
    push: {
      status: (endpoint) => net.pushStatus(endpoint),
      publicKey: () => net.pushPublicKey(),
      subscribe: (sub) => net.pushSubscribe(sub),
      unsubscribe: (endpoint) => net.pushUnsubscribe(endpoint),
      setPrefs: (prefs) => net.pushSetPrefs(prefs),
      test: () => net.pushTest(),
    },
    // chat (V2, 10/11 — convex/chat.ts). Serveur pas encore redéployé → erreur → « pas connecté » (lanceur sans pastille)
    chat: {
      // (audit 12/11, S04) `lean` : la requête ne lit plus le document joueur ; `staff` vient de users.me
      watchInbox: (cb) => net.watch(api.chat.inbox, { lean: true }, (v) => cb(v ? ({ ...v, staff: !!net.state.user?.staff } as ChatInbox) : null), true, () => cb(null)),
      page: async (conv, before) => (await net.ask(api.chat.page, { conv, before })) as { msgs: ChatMsg[]; done: boolean },
      watchTail: (conv, after, cb) => net.watch(api.chat.tail, { conv, after }, (v) => cb((v as { msgs: ChatMsg[]; more: boolean } | null) ?? null), true, () => cb(null)),
      send: async (conv, o) =>
        await net.call(api.chat.send, {
          conv,
          text: o.text,
          card: o.card as { cardId: string; rarity: Doc<'inventory'>['rarity'] } | undefined,
          replyTo: o.replyTo as Id<'chatMessages'> | undefined,
          mentions: o.mentions as Id<'users'>[] | undefined,
          clientId: o.clientId,
        }),
      react: async (id, k) => void (await net.call(api.chat.react, { id: id as Id<'chatMessages'>, k })),
      remove: async (id) => void (await net.call(api.chat.remove, { id: id as Id<'chatMessages'> })),
      markRead: async (conv, n) => void (await net.call(api.chat.markRead, { conv, n })),
      mute: async (conv, on) => void (await net.call(api.chat.mute, { conv, on })),
    },
    async submitSuggestion(o, file) {
      await net.submitSuggestion(o, file);
    },
    async mySuggestions() {
      return await net.mySuggestions();
    },
    async adminSuggestions(status) {
      return await net.adminSuggestions(status);
    },
    async setSuggestionStatus(id, status, note) {
      await net.setSuggestionStatus(id, status, note);
    },
    async surveyAnswered(id) {
      return await net.surveyAnswered(id);
    },
    async submitSurvey(id, answer) {
      await net.submitSurvey(id, answer);
    },
    async surveyResults(id) {
      return await net.surveyResults(id);
    },
    async leaderboard(onFresh) {
      const view = (rows: Awaited<ReturnType<typeof net.leaderboardRows>>) => rows.map((r) => ({ ...r, id: r.id as string }));
      return view(await net.leaderboard(onFresh && ((rows) => onFresh(view(rows)))));
    },
    async seasonBoard() {
      return await net.seasonBoard();
    },
    async activity(userId) {
      return (await net.activity(userId as Id<'users'>)).map((a) => ({ id: a._id, kind: a.kind, message: a.message, cardId: a.cardId, cardName: a.cardName, rarity: a.rarity, mintNumber: a.mintNumber, createdAt: a.createdAt }));
    },
    async signContract(rarity, items) {
      return await net.signContract(rarity, items);
    },
    async toggleWish(cardId) {
      // réponse immédiate (la souscription `me` confirme juste après)
      state.wishlist = await net.toggleWish(cardId);
      listeners.forEach((fn) => fn(state));
    },
    async claimStreak() {
      return (await net.claimStreak()).reward;
    },
    async setSubthemeCover(subthemeId, cardId) {
      state.covers = await net.setSubthemeCover(subthemeId, cardId);
      listeners.forEach((fn) => fn(state));
    },
    async createBinder(name, cards) {
      return await net.createBinder(name, cards);
    },
    async renameBinder(id, name) {
      await net.renameBinder(id as Id<'binders'>, name);
    },
    async deleteBinder(id) {
      await net.deleteBinder(id as Id<'binders'>);
    },
    async setBinderCards(id, cards) {
      await net.setBinderCards(id as Id<'binders'>, cards);
    },
    async toggleBinderCard(id, card) {
      return (await net.toggleBinderCard(id as Id<'binders'>, card)).added;
    },
    async setBinderCover(id, cardId) {
      await net.setBinderCover(id as Id<'binders'>, cardId);
    },
    async pinBinder(id, on) {
      await net.pinBinder(id as Id<'binders'>, on);
    },
    // amis (lot A2)
    async referral() {
      return await net.call(api.referrals.mine, {});
    },
    async referralClick(code) {
      const device = deviceId();
      if (device) await net.publicCall(api.referrals.click, { code, device });
    },
    async referralClaim(code) {
      return await net.call(api.referrals.claim, { code, device: deviceId() });
    },
    async requestFriend(to) {
      return await net.requestFriend({ userId: to.userId as Id<'users'> | undefined, name: to.name });
    },
    async acceptFriend(id) {
      await net.friendAction('accept', id as Id<'friendships'>);
    },
    async declineFriend(id) {
      await net.friendAction('decline', id as Id<'friendships'>);
    },
    async cancelFriend(id) {
      await net.friendAction('cancel', id as Id<'friendships'>);
    },
    async removeFriend(id) {
      await net.friendAction('remove', id as Id<'friendships'>);
    },
    // tableau d'offres (lot T, convex/listings.ts)
    watchMembers: (on, who) => net.watchMembers(on, who),
    watchBoard: (cb) => net.watch(api.listings.open, {}, (rows) => cb((rows ?? []).map((l) => listingOf(l))), true, () => cb([])),
    watchMarket: (cb) =>
      net.watch(
        api.market.board,
        {},
        (b) => {
          const conv = (l: NonNullable<typeof b>['open']) => l.map((m) => ({ ...m, id: m.id as string, sellerId: m.sellerId as string, buyerId: m.buyerId as string | undefined }));
          cb(b ? { open: conv(b.open), sold: conv(b.sold), bought: conv(b.bought) } : EMPTY_MARKET);
        },
        true,
        () => cb(EMPTY_MARKET),
      ),
    async marketSell(cardId, rarity, price) {
      await net.call(api.market.sell, { cardId, rarity, price });
    },
    async marketCancel(id) {
      await net.call(api.market.cancel, { id: id as Id<'market'> });
    },
    async marketBuy(id, price) {
      await net.call(api.market.buy, { id: id as Id<'market'>, price });
    },
    async createListing(items, wanted, note, hours) {
      await net.call(api.listings.create, { items, wanted, note, hours });
    },
    async cancelListing(id) {
      await net.call(api.listings.cancel, { listingId: id as Id<'listings'> });
    },
    async makeOffer(listingId, offered, note) {
      await net.call(api.listings.offer, { listingId: listingId as Id<'listings'>, offered, note });
    },
    async withdrawOffer(id) {
      await net.call(api.listings.withdrawOffer, { offerId: id as Id<'listingOffers'> });
    },
    async acceptOffer(id) {
      await net.call(api.listings.accept, { offerId: id as Id<'listingOffers'> });
    },
    async declineOffer(id) {
      await net.call(api.listings.decline, { offerId: id as Id<'listingOffers'> });
    },
    async counterOffer(id, give, want, note) {
      await net.call(api.listings.counter, { offerId: id as Id<'listingOffers'>, give, want, note });
    },
    async respondCounter(id, accept) {
      await net.call(api.listings.respondCounter, { offerId: id as Id<'listingOffers'>, accept });
    },
  };
}

/** Tableau d'offres (lot T) : documents du serveur → vues du jeu. */
let boardSrc: NetState['board'] | undefined;
type OfferDoc = Doc<'listingOffers'> & { fromName: string };
const offerOf = (o: OfferDoc): ListingOfferView => ({
  id: o._id,
  listingId: o.listingId,
  fromId: o.fromUserId,
  fromName: o.fromName,
  offered: o.offered,
  note: o.note,
  status: o.status,
  counter: o.counter,
  createdAt: o.createdAt,
  resolvedAt: o.resolvedAt,
});
function listingOf(l: Doc<'listings'> & { userName: string; avatarUrl?: string; offerCount?: number; offers?: OfferDoc[]; myOffer?: Doc<'listingOffers'> | null }): ListingView {
  return {
    id: l._id,
    userId: l.userId,
    userName: l.userName,
    avatarUrl: l.avatarUrl,
    items: l.items,
    wanted: l.wanted ?? [],
    note: l.note,
    status: l.status,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    resolvedAt: l.resolvedAt,
    offerCount: l.offerCount ?? (l.offers ?? []).filter((o) => o.status === 'pending' || o.status === 'countered').length,
    offers: l.offers?.map(offerOf),
    myOffer: l.myOffer ? offerOf({ ...l.myOffer, fromName: '' }) : null,
  };
}
function boardOf(b: NetState['board']): BoardState {
  return {
    mine: b.listings.map((l) => listingOf(l)),
    offers: b.offers.map((o) => ({ ...offerOf(o), listing: o.listing ? listingOf(o.listing) : null })),
  };
}

/** Amis (lot A2) : réponse du serveur → GameState.social, mémorisé par réponse (même tableau tant qu'elle ne change pas). */
let socialSrc: NetState['social'] | undefined;
let socialMemo: Social = { ready: false, friends: [], incoming: [], outgoing: [] };
function socialOf(s: NetState['social'], connected: boolean): Social {
  if (!s) {
    // pas connecté (aucun abonnement) : « prêt » dès que le serveur répond, avec des listes vides
    const ready = connected && !net.loggedIn;
    if (socialSrc === null && socialMemo.ready === ready) return socialMemo;
    socialSrc = null;
    return (socialMemo = { ready, friends: [], incoming: [], outgoing: [] });
  }
  if (s === socialSrc) return socialMemo;
  socialSrc = s;
  const req = (r: (typeof s.incoming)[number]) => ({ id: r.friendshipId, userId: r.userId, name: r.name, avatarUrl: r.avatarUrl, createdAt: r.createdAt });
  return (socialMemo = {
    ready: true,
    incoming: s.incoming.map(req),
    outgoing: s.outgoing.map(req),
    friends: s.friends.map((f) => ({ id: f.friendshipId, userId: f.userId, name: f.name, avatarUrl: f.avatarUrl, since: f.since, lastSeenAt: f.lastSeenAt, status: f.statusText, packsOpened: f.packsOpened, lastActivity: f.lastActivity })),
  });
}

/** Vrai si le serveur Convex est configuré (`VITE_CONVEX_URL` dans .env.local). */
export const onlineConfigured = () => net.state.configured;
/** Serveur injoignable (pas de réponse depuis ~8 s) : à distinguer d'un joueur déconnecté (bandeau de l'en-tête). */
export const serverDown = () => net.state.serverDown;
