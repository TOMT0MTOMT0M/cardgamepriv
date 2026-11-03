import { net } from '../core/net/client';
import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { DuelView, EcoBackend, EcoSnapshot, RoyaleView, RouletteView } from './eco';
import type { WeeklyState } from '../core/weekly';

/** Économie + jeux en ligne (serveur Convex, temps réel). */
export function createOnlineEco(): EcoBackend {
  const listeners = new Set<(s: EcoSnapshot | null) => void>();
  let snapshot: EcoSnapshot | null = null;
  let started = false;

  const start = () => {
    if (started || !net.state.configured) return;
    started = true;
    net.watch(api.economy.state, {}, (s) => {
      snapshot = s ? { ...s, weekly: s.weekly as WeeklyState & { resetAt: number } } : null;
      listeners.forEach((fn) => fn(snapshot));
    });
  };

  const duel = (d: Doc<'duels'>): DuelView => ({
    id: d._id,
    creatorId: d.creatorId,
    invitedId: d.invitedId,
    status: d.status,
    sides: d.sides,
    result: d.result,
    createdAt: d.createdAt,
    resolvedAt: d.resolvedAt,
  });
  const royale = (r: Doc<'royales'>): RoyaleView => ({ id: r._id, creatorId: r.creatorId, status: r.status, players: r.players, result: r.result, createdAt: r.createdAt, resolvedAt: r.resolvedAt });

  return {
    get snapshot() {
      return snapshot;
    },
    onChange(fn) {
      start();
      listeners.add(fn);
      fn(snapshot);
      return () => listeners.delete(fn);
    },
    claimCalendar: () => net.call(api.economy.claimCalendar, {}),
    claimWeekly: async (id) => (await net.call(api.economy.claimWeekly, { missionId: id })).reward,
    burn: (items) => net.call(api.economy.burn, { items }),
    claimCompletions: () => net.call(api.economy.claimCompletions, {}),
    claimAchievements: () => net.call(api.economy.claimAchievements, {}),
    friendsAchievements: async () => (await net.ask(api.economy.friendsAchievements, {})) ?? [],
    coinHistory: async () => (await net.ask(api.economy.history, { limit: 60 })).map((t) => ({ id: t._id, amount: t.amount, reason: t.reason, label: t.label, createdAt: t.createdAt })),
    watchLobby: (cb) => net.watch(api.games.lobby, {}, (l) => cb(l ? { duels: l.duels.map(duel), royales: l.royales.map(royale), me: l.me } : null)),
    watchDuel: (id, cb) => net.watch(api.games.duel, { duelId: id as Id<'duels'> }, (d) => cb(d ? duel(d) : null), false),
    watchRoyale: (id, cb) => net.watch(api.games.royale, { royaleId: id as Id<'royales'> }, (r) => cb(r ? royale(r) : null), false),
    watchRoulette: (cb) =>
      net.watch(api.games.roulette, {}, (r) =>
        cb({
          round: r.round ? { ...r.round, id: r.round._id } : null,
          nextDrawAt: r.nextDrawAt,
          me: r.me,
          past: r.past.map((p) => ({ ...p, id: p._id })),
        } as RouletteView),
      ),
    gameHistory: async () => {
      const h = await net.ask(api.games.history, {});
      return { duels: h.duels.map(duel), royales: h.royales.map(royale) };
    },
    createDuel: async (packs, stake, invitedId) => await net.call(api.games.createDuel, { packs, stake, ...(invitedId ? { invitedId: invitedId as Id<'users'> } : {}) }),
    setDuelSide: async (id, packs, stake) => void (await net.call(api.games.setDuelSide, { duelId: id as Id<'duels'>, packs, stake })),
    leaveDuel: async (id) => void (await net.call(api.games.leaveDuel, { duelId: id as Id<'duels'> })),
    readyDuel: (id) => net.call(api.games.readyDuel, { duelId: id as Id<'duels'> }),
    createRoyale: async (pack) => await net.call(api.games.createRoyale, { pack }),
    joinRoyale: async (id, pack) => void (await net.call(api.games.joinRoyale, { royaleId: id as Id<'royales'>, pack })),
    leaveRoyale: async (id) => void (await net.call(api.games.leaveRoyale, { royaleId: id as Id<'royales'> })),
    startRoyale: async (id) => void (await net.call(api.games.startRoyale, { royaleId: id as Id<'royales'> })),
    placeBet: async (numbers, stake) => void (await net.call(api.games.placeBet, { numbers, stake })),
    alerts: () => net.ask(api.abuse.alerts, {}),
    review: async (key, verdict, note) => void (await net.call(api.abuse.review, { key, verdict, ...(note ? { note } : {}) })),
  };
}
