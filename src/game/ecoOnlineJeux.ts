import { net } from '../core/net/client';
import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { DefiView, JeuxBackend, PresseRunView } from './ecoJeux';
import type { PackChoice } from '../core/games';

/** (V2, 11/11) Défis entre amis + La Presse, en ligne. */
export function onlineJeux(): JeuxBackend {
  const defi = (c: Doc<'challenges'>): DefiView => {
    const { _id, _creationTime, ...rest } = c;
    void _creationTime;
    return { ...rest, id: _id } as DefiView;
  };
  const run = (r: { _id: string } & Omit<PresseRunView, 'id'>): PresseRunView => {
    const { _id, ...rest } = r;
    return { ...rest, id: _id, album: rest.album as PackChoice };
  };
  return {
    watchDefis: (cb) => net.watch(api.challenges.mine, {}, (l) => cb(l ? { me: l.me, list: l.list.map(defi) } : null)),
    createDefi: async (d) =>
      await net.call(api.challenges.create, { kind: d.kind, ...(d.kind === 'first' ? { target: d.target } : {}), durationMs: d.durationMs, stake: d.stake, invitedIds: d.invited as Id<'users'>[] }),
    respondDefi: async (id, accept) => void (await net.call(api.challenges.respond, { challengeId: id as Id<'challenges'>, accept })),
    startDefi: async (id) => void (await net.call(api.challenges.start, { challengeId: id as Id<'challenges'> })),
    cancelDefi: async (id) => void (await net.call(api.challenges.cancel, { challengeId: id as Id<'challenges'> })),
    watchPresse: (cb) =>
      net.watch(api.presse.current, {}, (s) => cb(s ? { run: s.run ? run(s.run) : null, today: s.today, past: s.past.map(({ _id, ...p }) => ({ ...p, id: _id })) } : null)),
    presseStart: async (bet, album) => run(await net.call(api.presse.start, { bet, album })),
    presseStrike: async (id) => run(await net.call(api.presse.strike, { runId: id as Id<'presseRuns'> })),
    presseCash: async (id) => run(await net.call(api.presse.cashOut, { runId: id as Id<'presseRuns'> })),
  };
}
