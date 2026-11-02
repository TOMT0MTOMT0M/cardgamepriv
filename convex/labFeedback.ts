import { v, ConvexError } from 'convex/values';
import { internalQuery, mutation } from './_generated/server';
import { getUserByToken } from './auth';

/**
 * Retours des testeurs du LABO (👍 / 👎 + notes par expérience), envoyés depuis le panneau de retours.
 * Une ligne par navigateur (`clientId`) : renvoyer met à jour la même ligne (pas de doublons).
 * Lecture : GET <site Convex>/lab/feedback?key=<FEEDBACK_READ_KEY> (convex/http.ts) — jamais exposée au client.
 */
const entryValidator = v.object({
  id: v.string(),
  title: v.string(),
  category: v.string(),
  vote: v.number(),
  note: v.string(),
  updatedAt: v.optional(v.union(v.string(), v.null())),
});

export const submit = mutation({
  args: {
    clientId: v.string(),
    tester: v.string(),
    sessionToken: v.optional(v.string()),
    entries: v.array(entryValidator),
    meta: v.object({
      backend: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      quality: v.optional(v.string()),
      dpr: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { clientId, tester, sessionToken, entries, meta }) => {
    if (clientId.length < 8 || clientId.length > 64) throw new ConvexError('Identifiant invalide.');
    if (entries.length > 200) throw new ConvexError('Trop de retours.');
    // on ne garde que ce qui a du contenu, notes bornées
    const kept = entries
      .filter((e) => e.vote !== 0 || e.note.trim())
      .map((e) => ({
        ...e,
        id: e.id.slice(0, 60),
        title: e.title.slice(0, 120),
        category: e.category.slice(0, 4),
        vote: Math.sign(e.vote),
        note: e.note.slice(0, 2000),
      }));
    const user = await getUserByToken(ctx, sessionToken);
    const now = Date.now();
    const row = {
      clientId,
      tester: tester.trim().slice(0, 40) || 'anonyme',
      discordName: user?.displayName,
      entries: kept,
      meta: { ...meta, userAgent: meta.userAgent?.slice(0, 300) },
      updatedAt: now,
    };
    const prev = await ctx.db
      .query('labFeedback')
      .withIndex('by_clientId', (q) => q.eq('clientId', clientId))
      .unique();
    if (prev) await ctx.db.patch(prev._id, { ...row, sends: prev.sends + 1 });
    else await ctx.db.insert('labFeedback', { ...row, sends: 1, createdAt: now });
    return { ok: true, kept: kept.length, updatedAt: now };
  },
});

/** Tout, pour l'export protégé (http.ts). */
export const all = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query('labFeedback').withIndex('by_updatedAt').order('desc').collect(),
});
