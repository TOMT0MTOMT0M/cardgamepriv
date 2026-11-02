import { net, type NetState } from '../core/net/client';
import type { Id } from '../../convex/_generated/dataModel';
import { BIG_PULL_RARITIES, type BigPull, type GameBackend, type GameState, type SealedPack, type TradeView } from './backend';
import type { PackRequest } from '../core/packRoll';

/** Le vrai serveur : Convex (temps réel) + Discord, via le client partagé avec le labo (core/net/client.ts). */
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
  };

  const toSealed = (p: NonNullable<NetState['sealedPack']>): SealedPack => ({
    id: p._id,
    packKind: p.packKind ?? 'bebou',
    themeId: p.themeId,
    maxRarity: p.maxRarity,
    cards: p.cards.map((c) => ({ cardId: c.cardId, cardName: c.cardName, rarity: c.rarity, mintNumber: c.mintNumber, isNew: c.isNew, themeId: c.themeId })),
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
  });

  net.onChange((n) => {
    state.ready = n.connected;
    state.authError = n.authError;
    state.user = n.user
      ? {
          id: n.user._id,
          name: n.user.displayName,
          avatarUrl: n.user.avatarUrl,
          packBalance: n.user.packBalance,
          packStored: n.user.packStored ?? n.user.packBalance,
          packRegenAt: n.user.packRegenAt ?? Date.now(),
          totalPacksOpened: n.user.totalPacksOpened,
        }
      : null;
    state.collection = n.collection.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count, bestMintNumber: c.bestMintNumber }));
    state.friends = n.friends
      .filter((f) => f._id !== n.user?._id)
      .map((f) => ({ id: f._id, name: f.displayName, avatarUrl: f.avatarUrl, online: f.online, status: f.statusText, packsOpened: f.totalPacksOpened }));
    state.feed = n.feed.map((f) => ({ id: f._id, kind: f.kind, message: f.message, rarity: f.rarity, createdAt: f.createdAt }));
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
    state.sealed = n.sealedPack ? toSealed(n.sealedPack) : null;
    state.trades = { incoming: n.trades.incoming.map(toTrade), outgoing: n.trades.outgoing.map(toTrade) };
    state.missions = n.missions;
    listeners.forEach((fn) => fn(state));
  });

  return {
    state,
    onChange(fn) {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
    login: () => net.loginWithDiscord(),
    logout: () => net.logout(),
    async preparePack(req: PackRequest) {
      const p = await net.preparePack({ packKind: req.kind, themeId: req.themeId });
      return {
        id: p.packId,
        packKind: p.packKind,
        themeId: p.themeId,
        maxRarity: p.maxRarity,
        cards: p.cards.map((c) => ({ cardId: c.cardId, cardName: c.cardName, rarity: c.rarity, mintNumber: c.mintNumber, isNew: c.isNew, themeId: c.themeId })),
      };
    },
    async revealPack(id) {
      await net.revealPack(id as Id<'packOpens'>);
    },
    async friendCollection(friendId) {
      const rows = await net.userCollection(friendId as Id<'users'>);
      return rows.map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: c.count, bestMintNumber: c.bestMintNumber }));
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
    async claimMission(id) {
      return (await net.claimMission(id)).reward;
    },
    async claimMissionBonus() {
      return (await net.claimMissionBonus()).reward;
    },
    async rerollMission(id) {
      await net.rerollMission(id);
    },
    async profile(userId) {
      const p = await net.profile(userId as Id<'users'>);
      return p ? { ...p, id: p.id } : null;
    },
    async setShowcase(cards) {
      await net.setShowcase(cards);
    },
    async setBio(bio) {
      await net.setBio(bio);
    },
    async signContract(rarity, items) {
      return await net.signContract(rarity, items);
    },
  };
}

/** Vrai si le serveur Convex est configuré (`VITE_CONVEX_URL` dans .env.local). */
export const onlineConfigured = () => net.state.configured;
