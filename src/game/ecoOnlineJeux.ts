import { net } from '../core/net/client';
import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import type { DefiView, JeuxBackend } from './ecoJeux';

/** (V2, 11/11) Défis entre amis, en ligne. */
export function onlineJeux(): JeuxBackend {
  const defi = (c: Doc<'challenges'>): DefiView => {
    const { _id, _creationTime, ...rest } = c;
    void _creationTime;
    return { ...rest, id: _id } as DefiView;
  };
  return {
    watchDefis: (cb) => net.watch(api.challenges.mine, {}, (l) => cb(l ? { me: l.me, list: l.list.map(defi) } : null)),
    createDefi: async (d) =>
      await net.call(api.challenges.create, { kind: d.kind, ...(d.kind === 'first' ? { target: d.target } : {}), durationMs: d.durationMs, stake: d.stake, invitedIds: d.invited as Id<'users'>[] }),
    respondDefi: async (id, accept) => void (await net.call(api.challenges.respond, { challengeId: id as Id<'challenges'>, accept })),
    startDefi: async (id) => void (await net.call(api.challenges.start, { challengeId: id as Id<'challenges'> })),
    cancelDefi: async (id) => void (await net.call(api.challenges.cancel, { challengeId: id as Id<'challenges'> })),
  };
}
