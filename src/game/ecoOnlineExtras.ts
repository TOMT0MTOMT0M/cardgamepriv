import { net } from '../core/net/client';
import { api } from '../../convex/_generated/api';
import type { ExtrasBackend } from './ecoExtras';

/** (v2.1.13) Calendrier de l'Avent, en ligne. */
export function onlineExtras(): ExtrasBackend {
  return {
    openAdvent: async (day, debugDay) => await net.call(api.avent.open, { day, ...(debugDay !== undefined ? { debugDay } : {}) }),
    resetAdvent: async () => void (await net.call(api.avent.debugReset, {})),
  };
}
