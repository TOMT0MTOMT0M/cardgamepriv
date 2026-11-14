import { fe } from '../src/core/errors';
import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireUser } from './auth';
import { catalogCard } from './cardsCatalog';

/**
 * SUGGESTIONS (onglet du jeu, 04/11) — les joueurs nous écrivent au lieu de nous le dire à l'oral :
 *  - `bug` : description (+ capture d'écran) ;
 *  - `design` : une carte à refaire (mauvaise photo…) + le lien (ou le fichier) d'une image proposée à la place ;
 *  - `ajout` : une carte / une série à ajouter (anime, joueur, jeu…) ;
 *  - `autre` : texte libre.
 * Côté modération (users.isModerator — Hugo et Tom — ou users.isAdmin) : la file, filtrable par statut ; statuts nouvelle / vue / acceptée / refusée / traitée.
 */
const kindV = v.union(v.literal('bug'), v.literal('design'), v.literal('ajout'), v.literal('autre'));
const statusV = v.union(v.literal('nouvelle'), v.literal('vue'), v.literal('acceptee'), v.literal('refusee'), v.literal('traitee'));
/** 20 suggestions par joueur et par jour : assez pour tout dire, pas assez pour inonder la file */
const PER_DAY = 20;
const IMG_MAX = 6 * 1024 * 1024;

export const generateUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    await requireUser(ctx, sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

export const submit = mutation({
  args: {
    sessionToken: v.string(),
    kind: kindV,
    text: v.string(),
    cardId: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    screenshot: v.optional(v.id('_storage')),
    category: v.optional(v.string()),
    meta: v.optional(v.object({ page: v.optional(v.string()), ua: v.optional(v.string()) })),
  },
  handler: async (ctx, a) => {
    const user = await requireUser(ctx, a.sessionToken);
    const drop = async (msg: string): Promise<never> => {
      if (a.screenshot && (await ctx.db.system.get(a.screenshot))) await ctx.storage.delete(a.screenshot);
      throw new ConvexError(msg);
    };
    const text = a.text.trim().slice(0, 3000);
    if (!text && !(a.kind === 'design' && (a.imageUrl || a.screenshot))) await drop('Écris quelques mots : qu’est-ce qui ne va pas, ou que proposes-tu ?');
    const since = Date.now() - 86_400_000;
    const today = await ctx.db.query('suggestions').withIndex('by_user', (q) => q.eq('userId', user._id).gt('createdAt', since)).collect();
    if (today.length >= PER_DAY) await drop('Tu as déjà envoyé 20 suggestions aujourd’hui : merci ! Reviens demain.');
    let imageUrl = a.imageUrl?.trim().slice(0, 1000) || undefined;
    if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl)) await drop('Le lien de l’image doit commencer par http:// ou https://.');
    if (a.kind === 'design' && a.cardId && !catalogCard(a.cardId)) await drop('Carte inconnue.');
    if (a.screenshot) {
      const meta = await ctx.db.system.get(a.screenshot);
      if (!meta) throw new ConvexError(fe('suggestions.1'));
      if (!/^image\//.test(meta.contentType ?? '') || meta.size > IMG_MAX) await drop('Image refusée : une capture (PNG, JPG, WebP, GIF) de 6 Mo au plus.');
    }
    const now = Date.now();
    await ctx.db.insert('suggestions', {
      userId: user._id,
      kind: a.kind,
      text,
      cardId: a.kind === 'design' ? a.cardId : undefined,
      imageUrl: a.kind === 'design' || a.kind === 'ajout' ? imageUrl : undefined,
      screenshot: a.screenshot,
      category: a.kind === 'ajout' ? a.category?.trim().slice(0, 40) || undefined : undefined,
      status: 'nouvelle',
      meta: a.meta ? { page: a.meta.page?.slice(0, 200), ua: a.meta.ua?.slice(0, 300) } : undefined,
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

async function view(ctx: { storage: { getUrl(id: Id<'_storage'>): Promise<string | null> } }, s: Doc<'suggestions'>, author?: string) {
  return {
    id: s._id as string,
    kind: s.kind,
    text: s.text,
    cardId: s.cardId,
    imageUrl: s.imageUrl,
    screenshotUrl: s.screenshot ? ((await ctx.storage.getUrl(s.screenshot)) ?? undefined) : undefined,
    category: s.category,
    status: s.status,
    adminNote: s.adminNote,
    page: s.meta?.page,
    ua: s.meta?.ua,
    author,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** Mes suggestions (les 40 dernières) et leur statut. */
export const mine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await requireUser(ctx, sessionToken);
    const rows = await ctx.db.query('suggestions').withIndex('by_user', (q) => q.eq('userId', user._id)).order('desc').take(40);
    return await Promise.all(rows.map((r) => view(ctx, r)));
  },
});

/** File admin : toutes les suggestions d'un statut (ou toutes), les plus récentes d'abord. */
export const adminList = query({
  args: { sessionToken: v.string(), status: v.optional(statusV) },
  handler: async (ctx, { sessionToken, status }) => {
    const user = await requireUser(ctx, sessionToken);
    if (!canModerate(user)) throw new ConvexError(fe('suggestions.2'));
    const rows = status
      ? await ctx.db.query('suggestions').withIndex('by_status', (q) => q.eq('status', status)).order('desc').take(200)
      : await ctx.db.query('suggestions').order('desc').take(200);
    const names = new Map<string, string>();
    for (const r of rows) if (!names.has(r.userId)) names.set(r.userId, (await ctx.db.get(r.userId))?.displayName ?? '?');
    const counts = { nouvelle: 0, vue: 0, acceptee: 0, refusee: 0, traitee: 0 };
    for (const st of Object.keys(counts) as Array<keyof typeof counts>)
      counts[st] = (await ctx.db.query('suggestions').withIndex('by_status', (q) => q.eq('status', st)).take(500)).length;
    return { items: await Promise.all(rows.map((r) => view(ctx, r, names.get(r.userId)))), counts };
  },
});

export const setStatus = mutation({
  args: { sessionToken: v.string(), id: v.id('suggestions'), status: statusV, adminNote: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, id, status, adminNote }) => {
    const user = await requireUser(ctx, sessionToken);
    if (!canModerate(user)) throw new ConvexError(fe('suggestions.3'));
    const s = await ctx.db.get(id);
    if (!s) throw new ConvexError(fe('suggestions.4'));
    await ctx.db.patch(id, { status, updatedAt: Date.now(), ...(adminNote !== undefined ? { adminNote: adminNote.trim().slice(0, 500) || undefined } : {}) });
  },
});

/** (retours 06/11) modérateurs des suggestions : Hugo et Tom (users.isModerator), et les admins */
export const canModerate = (u: { isAdmin?: boolean; isModerator?: boolean }) => !!u.isAdmin || !!u.isModerator;
