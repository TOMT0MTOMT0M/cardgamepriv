import { net } from '../core/net/client';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { fe } from '../core/errors';
import type { AboPoll, ExtrasBackend } from './ecoExtras';

/** (20/11) Titres uniques + calendrier de l'Avent + abonnement, en ligne. */
export function onlineExtras(): ExtrasBackend {
  return {
    watchTitles: (cb) => net.watch(api.titres.holders, {}, (l) => cb(l ?? []), false),
    claimTitles: async (titleId) => (await net.call(api.titres.claim, titleId ? { titleId } : {})).won,
    openAdvent: async (day, debugDay) => await net.call(api.avent.open, { day, ...(debugDay !== undefined ? { debugDay } : {}) }),
    resetAdvent: async () => void (await net.call(api.avent.debugReset, {})),
    aboPage: async () => {
      const p = await net.ask(api.abo.page, {});
      return { ...p, poll: p.poll as AboPoll | null };
    },
    aboAsk: async () => void (await net.call(api.abo.ask, {})),
    aboSubmitCard: async (title, idea, image) => {
      let storageId: Id<'_storage'> | undefined;
      if (image && image !== 'keep') {
        // même chemin que la photo de profil : adresse d'envoi, POST du fichier, puis enregistrement
        const url = await net.call(api.profiles.generateMediaUploadUrl, {});
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': image.type }, body: image });
        if (!res.ok) throw new Error(fe('abo.4'));
        storageId = ((await res.json()) as { storageId: Id<'_storage'> }).storageId;
      }
      const r = await net.call(api.abo.submitCard, { title, idea, ...(storageId ? { storageId } : {}), ...(image === 'keep' ? { keepMedia: true } : {}) });
      if (r.error) throw new Error(r.error);
    },
    aboVote: async (pollId, optionId) => (await net.call(api.abo.vote, { pollId: pollId as Id<'aboPolls'>, optionId })) as AboPoll,
  };
}
