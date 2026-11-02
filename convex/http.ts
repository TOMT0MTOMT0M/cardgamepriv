import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';

const http = httpRouter();

/** Ajoute `#hash` à l'URL de retour, qu'elle désigne la racine du site ou une page (`/jeu/`). */
function withHash(returnTo: string, hash: string): string {
  try {
    const u = new URL(returnTo);
    u.hash = hash;
    return u.toString();
  } catch {
    return `${returnTo.replace(/\/$/, '')}/#${hash}`;
  }
}

function isAllowedReturnOrigin(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (/^192\.168\.\d+\.\d+$/.test(u.hostname) || /^10\.\d+\.\d+\.\d+$/.test(u.hostname)) return true;
    if (u.hostname.endsWith('.pages.dev')) return true;
    const configured = process.env.FRONTEND_URL;
    if (configured && u.origin === new URL(configured).origin) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Step 1: Redirect user to Discord OAuth2 authorization screen.
 * URL: https://<your-deployment>.convex.site/auth/discord?returnTo=http://localhost:5173
 */
http.route({
  path: '/auth/discord',
  method: 'GET',
  handler: httpAction(async (_ctx, request) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) {
      return new Response(
        'Missing DISCORD_CLIENT_ID environment variable in Convex. Run: npx convex env set DISCORD_CLIENT_ID <id>',
        { status: 500 },
      );
    }

    const reqUrl = new URL(request.url);
    const requestedReturnTo = reqUrl.searchParams.get('returnTo') ?? process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const returnTo = isAllowedReturnOrigin(requestedReturnTo)
      ? requestedReturnTo
      : (process.env.FRONTEND_URL ?? 'http://localhost:5173');

    const callbackUrl = `${reqUrl.origin}/auth/discord/callback`;
    const needGuildCheck = Boolean((process.env.DISCORD_GUILD_ID ?? '').trim());
    const scope = needGuildCheck ? 'identify guilds' : 'identify';

    const statePayload = btoa(JSON.stringify({ returnTo, ts: Date.now() }));
    const authorizeUrl = new URL('https://discord.com/oauth2/authorize');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', scope);
    authorizeUrl.searchParams.set('prompt', 'none');
    authorizeUrl.searchParams.set('state', statePayload);

    return Response.redirect(authorizeUrl.toString(), 302);
  }),
});

/**
 * Step 2: Discord OAuth2 Callback -> Exchange code, verify friend membership, issue session token.
 * Redirect URI to register in Discord Developer Portal:
 *   https://<your-deployment>.convex.site/auth/discord/callback
 */
http.route({
  path: '/auth/discord/callback',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const reqUrl = new URL(request.url);
    const code = reqUrl.searchParams.get('code');
    const stateRaw = reqUrl.searchParams.get('state');

    let returnTo = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    if (stateRaw) {
      try {
        const parsed = JSON.parse(atob(stateRaw)) as { returnTo?: string };
        if (parsed.returnTo && isAllowedReturnOrigin(parsed.returnTo)) {
          returnTo = parsed.returnTo;
        }
      } catch {
        /* ignore malformed state */
      }
    }

    if (!code) {
      return Response.redirect(withHash(returnTo, `auth_error=missing_code`), 302);
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return new Response('Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET in Convex env.', { status: 500 });
    }

    const callbackUrl = `${reqUrl.origin}/auth/discord/callback`;

    // 1. Exchange authorization code for access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[discord-auth] token exchange failed:', errText);
      return Response.redirect(withHash(returnTo, `auth_error=token_exchange_failed`), 302);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    // 2. Fetch Discord user identity
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      return Response.redirect(withHash(returnTo, `auth_error=user_fetch_failed`), 302);
    }

    const discordUser = (await userRes.json()) as {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };

    // 3. Optional: Verify user belongs to your private Discord server (DISCORD_GUILD_ID)
    const requiredGuildId = (process.env.DISCORD_GUILD_ID ?? '').trim();
    if (requiredGuildId) {
      const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!guildsRes.ok) {
        return Response.redirect(withHash(returnTo, `auth_error=guild_check_failed`), 302);
      }
      const guilds = (await guildsRes.json()) as Array<{ id: string }>;
      if (!guilds.some((g) => g.id === requiredGuildId)) {
        return Response.redirect(withHash(returnTo, `auth_error=not_in_discord_server`), 302);
      }
    }

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
      : undefined;

    try {
      const { token } = await ctx.runMutation(internal.auth.upsertDiscordUser, {
        discordId: discordUser.id,
        username: discordUser.username,
        displayName: discordUser.global_name || discordUser.username,
        avatarUrl,
      });

      return Response.redirect(withHash(returnTo, `auth_token=${encodeURIComponent(token)}`), 302);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unauthorized';
      return Response.redirect(withHash(returnTo, `auth_error=${encodeURIComponent(msg)}`), 302);
    }
  }),
});

/**
 * Export des retours du labo, pour Tom / Claude : GET /lab/feedback?key=<FEEDBACK_READ_KEY>
 * (clé dans l'environnement Convex, posée par deployer.cmd depuis le fichier local .feedback-key).
 * Réponse : les retours bruts par testeur + un regroupement par expérience (votes, notes).
 */
http.route({
  path: '/lab/feedback',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.FEEDBACK_READ_KEY;
    if (!expected) return new Response('FEEDBACK_READ_KEY non configurée', { status: 503 });
    const key = new URL(request.url).searchParams.get('key') ?? '';
    if (key !== expected) return new Response('clé invalide', { status: 401 });
    const rows = await ctx.runQuery(internal.labFeedback.all, {});
    const byExp = new Map<string, { id: string; title: string; category: string; up: string[]; down: string[]; notes: Array<{ tester: string; vote: number; note: string; at: string | null | undefined }> }>();
    for (const r of rows) {
      const who = r.discordName && r.discordName !== r.tester ? `${r.tester} (${r.discordName})` : r.tester;
      for (const e of r.entries) {
        const x = byExp.get(e.id) ?? { id: e.id, title: e.title, category: e.category, up: [], down: [], notes: [] };
        if (e.vote > 0) x.up.push(who);
        if (e.vote < 0) x.down.push(who);
        if (e.note.trim()) x.notes.push({ tester: who, vote: e.vote, note: e.note, at: e.updatedAt });
        byExp.set(e.id, x);
      }
    }
    const experiments = [...byExp.values()].sort((a, b) => a.id.localeCompare(b.id));
    const body = {
      exportedAt: new Date().toISOString(),
      testers: rows.map((r) => ({
        tester: r.tester,
        discordName: r.discordName,
        updatedAt: new Date(r.updatedAt).toISOString(),
        sends: r.sends,
        meta: r.meta,
        entries: r.entries,
      })),
      experiments,
    };
    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }),
});

export default http;
