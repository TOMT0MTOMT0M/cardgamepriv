import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireUser } from './auth';
import { canModerate } from './suggestions';
import { SURVEY_FEATURES, SURVEY_UNIVERSES, cleanSurvey, surveyFilled, type SurveyResults } from '../src/core/survey';

/**
 * SONDAGE « PROCHAINES MISES À JOUR » (v1.0.10, 10/11) : une réponse par joueur et par sondage (src/core/survey.ts).
 * Le jeu le propose à la connexion, puis toutes les heures tant qu'il n'est pas rempli (game/survey.ts). Les résultats
 * sont réservés aux modérateurs (Tom et Hugo), dans l'onglet Suggestions → File admin.
 * Table à part (`surveyAnswers`) : aucun champ ajouté ailleurs, le code d'avant le patch ne la voit pas.
 */
const answerV = v.object({
  universes: v.array(v.string()),
  features: v.array(v.string()),
  names: v.optional(v.string()),
  rating: v.optional(v.number()),
  comment: v.optional(v.string()),
});

/** Ai-je déjà répondu à ce sondage ? */
export const answered = query({
  args: { sessionToken: v.string(), surveyId: v.string() },
  handler: async (ctx, { sessionToken, surveyId }) => {
    const user = await requireUser(ctx, sessionToken);
    const row = await ctx.db.query('surveyAnswers').withIndex('by_user', (q) => q.eq('userId', user._id).eq('surveyId', surveyId)).first();
    return !!row;
  },
});

export const submit = mutation({
  args: { sessionToken: v.string(), surveyId: v.string(), answer: answerV },
  handler: async (ctx, { sessionToken, surveyId, answer }) => {
    const user = await requireUser(ctx, sessionToken);
    const id = surveyId.trim().slice(0, 40);
    if (!id) throw new ConvexError('Sondage inconnu.');
    const a = cleanSurvey(answer);
    if (!surveyFilled(a)) throw new ConvexError('Coche au moins une réponse.');
    const prev = await ctx.db.query('surveyAnswers').withIndex('by_user', (q) => q.eq('userId', user._id).eq('surveyId', id)).first();
    // déjà répondu (deux appareils, double toucher) : on garde la première réponse
    if (prev) return { ok: true, already: true };
    await ctx.db.insert('surveyAnswers', { userId: user._id, surveyId: id, ...a, createdAt: Date.now() });
    return { ok: true, already: false };
  },
});

/** Résultats (modérateurs) : comptes par réponse, notes, et les réponses écrites. */
export const results = query({
  args: { sessionToken: v.string(), surveyId: v.string() },
  handler: async (ctx, { sessionToken, surveyId }): Promise<SurveyResults> => {
    const user = await requireUser(ctx, sessionToken);
    if (!canModerate(user)) throw new ConvexError('Réservé aux modérateurs.');
    const rows = await ctx.db.query('surveyAnswers').withIndex('by_survey', (q) => q.eq('surveyId', surveyId)).order('desc').take(1000);
    const universes = Object.fromEntries(SURVEY_UNIVERSES.map((o) => [o.id, 0]));
    const features = Object.fromEntries(SURVEY_FEATURES.map((o) => [o.id, 0]));
    const ratings = [0, 0, 0, 0, 0];
    const texts: SurveyResults['texts'] = [];
    const names = new Map<string, string>();
    for (const r of rows) {
      for (const u of r.universes) if (u in universes) universes[u]++;
      for (const f of r.features) if (f in features) features[f]++;
      if (r.rating) ratings[r.rating - 1]++;
      if (r.names || r.comment) {
        if (!names.has(r.userId)) names.set(r.userId, (await ctx.db.get(r.userId))?.displayName ?? '?');
        texts.push({ author: names.get(r.userId)!, names: r.names, comment: r.comment, rating: r.rating, createdAt: r.createdAt });
      }
    }
    return { surveyId, total: rows.length, universes, features, ratings, texts };
  },
});
