import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { internalAction, internalMutation, mutation, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { requireUser } from './auth';
import { artPath, catalogEntry, hasArt } from '../src/core/sets/themes';

/**
 * DROPS MYTHIQUES SUR DISCORD (V2, 08/11) : le message n'est plus une fiche (embed) mais la carte elle-même, vue de
 * face, en grand, avec seulement le nom du joueur au-dessus.
 *  1. au crédit d'un 6★ / d'une secrète (packs.ts `revealOne`), une ligne `dropShots` est créée et l'envoi de secours
 *     est programmé dans DROP_SHOT_WAIT_MS ;
 *  2. le jeu du joueur peint la carte en pleine taille (même gabarit que la carte 3D) et l'envoie (`uploadUrl` + `attach`)
 *     → message posté tout de suite avec cette image ;
 *  3. sinon (appli fermée, envoi raté) : le secours poste l'illustration brute.
 * Une seule publication par drop (`claim`), l'image est retirée du stockage une fois postée.
 */
export const DROP_SHOT_WAIT_MS = 45_000;
/** taille max de l'image envoyée par le jeu (une carte 768×1072 en PNG ≈ 1–1,5 Mo) */
export const DROP_SHOT_MAX_BYTES = 6 * 1024 * 1024;
const OK_TYPES = ['image/png', 'image/webp', 'image/jpeg'];

const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL ?? 'https://cardgamepriv.pages.dev').trim().replace(/\/+$/, '');

/** Appelé par packs.ts au crédit d'une carte 6★ ou secrète. */
export async function queueDropShot(
  ctx: MutationCtx,
  user: Doc<'users'>,
  c: { cardId: string; cardName: string; rarity: Doc<'dropShots'>['rarity']; mintNumber: number; isNew?: boolean },
) {
  const dropId = await ctx.db.insert('dropShots', {
    userId: user._id,
    displayName: user.displayName,
    cardId: c.cardId,
    cardName: c.cardName,
    rarity: c.rarity,
    mintNumber: c.mintNumber,
    isNew: c.isNew,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(DROP_SHOT_WAIT_MS, internal.dropShots.post, { dropId });
  return dropId;
}

export const uploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireUser(ctx, sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Le jeu a envoyé l'image de la carte : rattachée au drop en attente, puis message posté tout de suite. */
export const attach = mutation({
  args: { sessionToken: v.string(), cardId: v.string(), mintNumber: v.number(), storageId: v.id('_storage') },
  handler: async (ctx, { sessionToken, cardId, mintNumber, storageId }) => {
    const user = await requireUser(ctx, sessionToken);
    const meta = await ctx.db.system.get(storageId);
    if (!meta) throw new ConvexError(fe('dropShots.1'));
    const drop = await ctx.db
      .query('dropShots')
      .withIndex('by_user_card', (q) => q.eq('userId', user._id).eq('cardId', cardId).eq('mintNumber', mintNumber))
      .first();
    const bad = !drop ? 'aucun drop en attente' : drop.postedAt || drop.storageId ? 'déjà publié' : meta.size > DROP_SHOT_MAX_BYTES ? 'image trop lourde' : !OK_TYPES.includes(meta.contentType ?? '') ? 'format refusé' : null;
    if (bad || !drop) {
      await ctx.storage.delete(storageId);
      return { ok: false as const, error: bad ?? 'aucun drop en attente' };
    }
    await ctx.db.patch(drop._id, { storageId });
    await ctx.scheduler.runAfter(0, internal.dropShots.post, { dropId: drop._id });
    return { ok: true as const };
  },
});

/** Une seule publication par drop : le premier arrivé (image du jeu ou secours) la prend. */
export const claim = internalMutation({
  args: { dropId: v.id('dropShots') },
  handler: async (ctx, { dropId }) => {
    const d = await ctx.db.get(dropId);
    if (!d || d.postedAt) return null;
    await ctx.db.patch(dropId, { postedAt: Date.now() });
    return d;
  },
});

export const forgetImage = internalMutation({
  args: { dropId: v.id('dropShots'), storageId: v.id('_storage') },
  handler: async (ctx, { dropId, storageId }) => {
    await ctx.storage.delete(storageId);
    const d = await ctx.db.get(dropId);
    if (d) await ctx.db.patch(dropId, { storageId: undefined });
  },
});

/** pas de **gras** cassé ni de mention par un pseudo (« *_~`|> ») */
export const escapeMd = (s: string) => s.replace(/([\\*_~`|>#[\]()-])/g, '\\$1').replace(/@/g, '@\u200b');

export const post = internalAction({
  args: { dropId: v.id('dropShots') },
  handler: async (ctx, { dropId }): Promise<'posted' | 'skipped' | 'no-webhook' | 'failed'> => {
    const d = await ctx.runMutation(internal.dropShots.claim, { dropId });
    if (!d) return 'skipped';
    const webhookUrl = (process.env.DISCORD_WEBHOOK_URL ?? '').trim();
    try {
      if (!webhookUrl) return 'no-webhook';
      // image : la carte peinte par le jeu, sinon (secours) l'illustration brute
      let image: Blob | null = d.storageId ? await ctx.storage.get(d.storageId) : null;
      let name = 'carte.png';
      if (image) name = `carte.${image.type === 'image/webp' ? 'webp' : image.type === 'image/jpeg' ? 'jpg' : 'png'}`;
      else {
        const e = catalogEntry(d.cardId);
        if (e && hasArt(e)) {
          const path = artPath(e);
          const r = await fetch(`${PUBLIC_SITE_URL}/${path}`).catch(() => null);
          if (r?.ok) {
            image = await r.blob();
            name = `carte.${(path.split('?')[0].split('.').pop() ?? 'webp').toLowerCase()}`;
          }
        }
      }
      const payload = {
        username: 'Bébou Drop Bot 🃏',
        // (08/11) juste le nom du joueur au-dessus de la carte
        content: image ? `**${escapeMd(d.displayName)}**` : `**${escapeMd(d.displayName)}** — ${escapeMd(d.cardName)}`,
        allowed_mentions: { parse: [] as string[] },
        ...(image ? { attachments: [{ id: 0, filename: name }] } : {}),
      };
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));
      if (image) form.append('files[0]', image, name);
      const res = await fetch(webhookUrl, { method: 'POST', body: form });
      if (!res.ok) {
        console.warn('[drop discord]', res.status, await res.text().catch(() => ''));
        return 'failed';
      }
      return 'posted';
    } catch (e) {
      console.warn('[drop discord] échec :', e);
      return 'failed';
    } finally {
      if (d.storageId) await ctx.runMutation(internal.dropShots.forgetImage, { dropId, storageId: d.storageId as Id<'_storage'> });
    }
  },
});
