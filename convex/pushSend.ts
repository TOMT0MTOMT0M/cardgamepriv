'use node';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import webpush from 'web-push';

/**
 * ENVOI WEB PUSH (runtime Node, bibliothèque web-push). Clés VAPID dans les variables du déploiement :
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…) — posées par lanceurs\activer-notifications.cmd.
 * Un appareil qui répond 404 / 410 est retiré tout de suite ; un autre échec compte (3 = retiré).
 */
export const send = internalAction({
  args: {
    subs: v.array(v.object({ endpoint: v.string(), keys: v.object({ p256dh: v.string(), auth: v.string() }) })),
    payload: v.object({ kind: v.string(), title: v.string(), body: v.string(), url: v.string(), tag: v.optional(v.string()) }),
  },
  handler: async (ctx, { subs, payload }) => {
    const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return { sent: 0 };
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:gamersardechois@gmail.com', pub, priv);
    const body = JSON.stringify(payload);
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 6 * 3600, urgency: payload.kind === 'news' ? 'normal' : 'high' });
        sent++;
        await ctx.runMutation(internal.push.markOk, { endpoint: s.endpoint });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode ?? 0;
        await ctx.runMutation(internal.push.dropSub, { endpoint: s.endpoint, hard: code === 404 || code === 410 });
        console.warn('[push] échec', code, s.endpoint.slice(0, 40));
      }
    }
    return { sent };
  },
});
