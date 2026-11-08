import { v } from 'convex/values';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';

/**
 * RÔLE DISCORD « Card » (08/11) : tout joueur connecté avec Discord et présent sur le serveur des Bébous reçoit le rôle
 * « Card ». Donné à CHAQUE connexion Discord (auth.ts `upsertDiscordUser`, sans effet s'il l'a déjà), et à tous les
 * joueurs déjà inscrits d'un coup :  npx convex run discordRoles:grantCardRoleAll
 *
 * Le bot (DISCORD_BOT_TOKEN) doit avoir la permission « Gérer les rôles » et un rôle placé AU-DESSUS de « Card ».
 * Réglages facultatifs : DISCORD_GUILD_ID (sinon le serveur des Bébous), DISCORD_CARD_ROLE_ID (sinon le rôle nommé « Card »).
 * Comptes pseudo (sans Discord) : rien.
 */
const API = 'https://discord.com/api/v10';
const BEBOUS_GUILD = '875043597022531654';
export const CARD_ROLE_NAME = 'card';

/** vrai identifiant Discord (les comptes pseudo ont un identifiant interne) */
export const isDiscordSnowflake = (id: string) => /^\d{15,22}$/.test(id);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function discord(token: string, method: string, path: string): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(API + path, { method, headers: { Authorization: `Bot ${token}`, 'X-Audit-Log-Reason': encodeURIComponent('Joueur de Bébou Cartes') } });
    if (res.status !== 429 || i >= 3) return res;
    const j = (await res.json().catch(() => ({}))) as { retry_after?: number };
    await sleep(Math.ceil((j.retry_after ?? 1) * 1000) + 100);
  }
}

type Setup = { token: string; guild: string; role: string } | { error: string };
async function setup(): Promise<Setup> {
  const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  if (!token) return { error: 'DISCORD_BOT_TOKEN absent' };
  const guild = (process.env.DISCORD_GUILD_ID ?? '').trim() || BEBOUS_GUILD;
  let role = (process.env.DISCORD_CARD_ROLE_ID ?? '').trim();
  if (!role) {
    const res = await discord(token, 'GET', `/guilds/${guild}/roles`);
    if (!res.ok) return { error: `rôles du serveur illisibles (${res.status})` };
    const roles = (await res.json()) as Array<{ id: string; name: string; managed?: boolean }>;
    role = roles.find((r) => !r.managed && r.name.trim().toLowerCase() === CARD_ROLE_NAME)?.id ?? '';
    if (!role) return { error: 'rôle « Card » introuvable sur le serveur' };
  }
  return { token, guild, role };
}

/** (clés ASCII : Convex refuse les accents dans les noms de champs renvoyés) */
type Grant = 'ajoute' | 'absent' | 'refuse' | 'erreur';
async function grant(s: { token: string; guild: string; role: string }, discordId: string): Promise<Grant> {
  const res = await discord(s.token, 'PUT', `/guilds/${s.guild}/members/${discordId}/roles/${s.role}`);
  if (res.status === 204 || res.ok) return 'ajoute';
  const j = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
  if (res.status === 404 || j.code === 10007 || j.code === 10013) return 'absent';
  console.warn('[rôle Card]', discordId, res.status, j.message ?? '');
  return res.status === 403 ? 'refuse' : 'erreur';
}

/** À chaque connexion Discord. */
export const grantCardRole = internalAction({
  args: { discordId: v.string() },
  handler: async (_ctx, { discordId }): Promise<string> => {
    if (!isDiscordSnowflake(discordId)) return 'compte sans Discord';
    const s = await setup();
    if ('error' in s) {
      console.warn('[rôle Card]', s.error);
      return s.error;
    }
    return await grant(s, discordId);
  },
});

export const discordPlayers = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query('users').collect())
      .filter((u) => !u.bannedAt && isDiscordSnowflake(u.discordId))
      .map((u) => ({ discordId: u.discordId, name: u.displayName })),
});

/** Tous les joueurs Discord déjà inscrits (à lancer une fois). */
export const grantCardRoleAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const s = await setup();
    if ('error' in s) return { erreur: s.error };
    const players: Array<{ discordId: string; name: string }> = await ctx.runQuery(internal.discordRoles.discordPlayers, {});
    const bilan: Record<Grant, string[]> = { ajoute: [], absent: [], refuse: [], erreur: [] };
    for (const p of players) bilan[await grant(s, p.discordId)].push(p.name);
    if (bilan.refuse.length) console.warn('[rôle Card] refusé : le bot doit avoir « Gérer les rôles » et un rôle au-dessus de « Card »');
    const fmt = (list: string[]) => `${list.length}${list.length ? ' : ' + list.join(', ') : ''}`;
    // « absents » = joueurs qui ne sont pas sur le serveur des Bébous ; « refuses » = le bot n'a pas le droit (voir en haut)
    return { joueurs: players.length, ajoutes: fmt(bilan.ajoute), absents: fmt(bilan.absent), refuses: fmt(bilan.refuse), erreurs: fmt(bilan.erreur) };
  },
});
