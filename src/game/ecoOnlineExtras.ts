import { net } from '../core/net/client';
import { api } from '../../convex/_generated/api';
import type { ExtrasBackend } from './ecoExtras';

/** (20/11) Titres uniques + calendrier de l'Avent, en ligne. */
export function onlineExtras(): ExtrasBackend {
  return {
    watchTitles: (cb) => net.watch(api.titres.holders, {}, (l) => cb(l ?? []), false),
    claimTitles: async (titleId) => (await net.call(api.titres.claim, titleId ? { titleId } : {})).won,
    openAdvent: async (day, debugDay) => await net.call(api.avent.open, { day, ...(debugDay !== undefined ? { debugDay } : {}) }),
    resetAdvent: async () => void (await net.call(api.avent.debugReset, {})),
  };
}
