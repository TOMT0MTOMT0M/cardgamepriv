import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { REFERRAL, referralLink } from '../src/core/referral';
import { ensureCode } from './referrals';
import { maxPlayers } from './auth';

/**
 * BOT DISCORD — MP DE BIENVENUE (ouverture 07/11) : à la PREMIÈRE connexion Discord d'un nouveau joueur (auth.ts),
 * le bot lui écrit en privé avec SON lien de parrainage et ce qu'il y gagne, pour qu'il invite ses potes proches.
 * Une seule fois par compte (`welcomeDmAt`) ; les comptes pseudo (sans Discord) ne le reçoivent pas.
 *
 * Réglages (une fois) :
 *   npx convex env set DISCORD_BOT_TOKEN <jeton du bot>           (sans jeton : rien n'est envoyé, rien n'est marqué)
 *   npx convex env set PUBLIC_SITE_URL https://cardgamepriv.pages.dev   (facultatif, c'est la valeur par défaut)
 * Le bot doit être sur le serveur Discord des potes : Discord n'autorise un MP que si le bot et le joueur partagent un
 * serveur (et que le joueur accepte les MP des membres de ce serveur).
 * Aperçu sur soi :  npx convex run discordBot:testDm '{"name":"tom"}'
 */
const API = 'https://discord.com/api/v10';
const userLang = (u: { lang?: string }): 'fr' | 'en' => (u.lang === 'en' ? 'en' : 'fr');
type Dm = { discordId: string; name: string; code: string; lang: 'fr' | 'en' };

export const prepareDm = internalMutation({
  args: { userId: v.optional(v.id('users')), name: v.optional(v.string()), force: v.optional(v.boolean()) },
  handler: async (ctx, { userId, name, force }): Promise<Dm | null> => {
    let u = userId ? await ctx.db.get(userId) : null;
    if (!u && name) {
      const q = name.trim().toLowerCase();
      u = (await ctx.db.query('users').collect()).find((x) => x.username.toLowerCase() === q || x.displayName.toLowerCase() === q) ?? null;
    }
    if (!u || u.discordId.startsWith('pw:') || !/^\d{5,25}$/.test(u.discordId)) return null;
    if (u.welcomeDmAt && !force) return null;
    if (!force) await ctx.db.patch(u._id, { welcomeDmAt: Date.now() });
    const code = await ensureCode(ctx, u);
    return { discordId: u.discordId, name: u.displayName, code, lang: userLang(u) };
  },
});

function message(name: string, link: string, lang: 'fr' | 'en' = 'fr') {
  const cap = maxPlayers();
  // (version anglaise, lot 4) le MP part dans la langue du joueur (users.lang, posée par le jeu à la connexion)
  if (lang === 'en')
    return {
      content: [
        `🎴 **Welcome to the Bébou club, ${name}!**`,
        '',
        `Your personal invite link 👇`,
        link,
        '',
        `Send it to your close friends:`,
        `• **they** get **${REFERRAL.packs} free boosters** as soon as they sign up`,
        `• **you** earn **${REFERRAL.packs} boosters** for every friend who opens their first ${REFERRAL.packsToPay} boosters`,
        '',
        `The club is limited to ${cap} players: spots go fast. You can find your link anytime in the **Friends** tab.`,
      ].join('\n'),
      components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Open the game', url: link }] }],
      allowed_mentions: { parse: [] },
    };
  return {
    content: [
      `🎴 **Bienvenue dans le club Bébou, ${name} !**`,
      '',
      `Ton lien d'invitation perso 👇`,
      link,
      '',
      `Envoie-le à tes potes proches :`,
      `• **eux** reçoivent **${REFERRAL.packs} boosters offerts** dès leur inscription`,
      `• **toi**, tu gagnes **${REFERRAL.packs} boosters** pour chaque pote qui ouvre ses ${REFERRAL.packsToPay} premiers boosters`,
      '',
      `Le club est limité à ${cap} joueurs : les places partent vite. Tu retrouves ton lien à tout moment dans l'onglet **Amis**.`,
    ].join('\n'),
    components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Ouvrir le jeu', url: link }] }],
    allowed_mentions: { parse: [] },
  };
}

async function send(token: string, discordId: string, body: unknown): Promise<string> {
  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' };
  const ch = await fetch(`${API}/users/@me/channels`, { method: 'POST', headers, body: JSON.stringify({ recipient_id: discordId }) });
  if (!ch.ok) return `ouverture du MP refusée (${ch.status}) ${(await ch.text()).slice(0, 200)}`;
  const { id } = (await ch.json()) as { id: string };
  const res = await fetch(`${API}/channels/${id}/messages`, { method: 'POST', headers, body: JSON.stringify(body) });
  // 50007 : le joueur n'accepte pas les MP (ou ne partage aucun serveur avec le bot)
  if (!res.ok) return `envoi refusé (${res.status}) ${(await res.text()).slice(0, 200)}`;
  return 'envoyé';
}

const siteOrigin = () => (process.env.PUBLIC_SITE_URL ?? 'https://cardgamepriv.pages.dev').trim().replace(/\/+$/, '');

export const welcomeDm = internalAction({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }): Promise<string> => {
    const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
    if (!token) return 'pas de DISCORD_BOT_TOKEN : MP non envoyé';
    const t: Dm | null = await ctx.runMutation(internal.discordBot.prepareDm, { userId });
    if (!t) return 'rien à envoyer (déjà fait, ou compte sans Discord)';
    const r = await send(token, t.discordId, message(t.name, referralLink(siteOrigin(), t.code), t.lang));
    console.log(`[bot] MP de bienvenue → ${t.name} : ${r}`);
    return r;
  },
});

/**
 * (26/11) PRÉVENIR L'ÉQUIPE — après chaque mise en ligne prod, `lanceurs/mettre-en-ligne-prod.cmd` (par
 * `scripts/prevenir-equipe.mjs`) fait écrire le bot en MP aux admins (Tom, Hugo), sauf à celui qui publie : `sauf` = nom
 * de session Windows du PC, comparé au début du pseudo (« Tom » → TOM). Inconnu : tous les admins reçoivent le message.
 * Rien à installer sur le PC : le jeton du bot est dans l'environnement Convex (DISCORD_BOT_TOKEN).
 *   npx convex run discordBot:prevenirEquipe '{"texte":"essai","sauf":"Tom"}'
 */
type Staff = { discordId: string; name: string; username: string };

export const staffIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Staff[]> =>
    (await ctx.db.query('users').collect())
      .filter((u) => u.isAdmin && /^\d{5,25}$/.test(u.discordId))
      .map((u) => ({ discordId: u.discordId, name: u.displayName, username: u.username })),
});

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** les admins à prévenir : tous sauf celui qui publie (reconnu par le début de son pseudo), sinon tous */
export function staffTargets(staff: Staff[], sauf?: string): Staff[] {
  const n = fold(sauf ?? '');
  if (n.length < 3) return staff;
  const rest = staff.filter((s) => !fold(s.name).startsWith(n) && !fold(s.username).startsWith(n));
  return rest.length && rest.length < staff.length ? rest : staff;
}

export const prevenirEquipe = internalAction({
  args: { texte: v.string(), sauf: v.optional(v.string()) },
  handler: async (ctx, { texte, sauf }): Promise<string[]> => {
    const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
    if (!token) return ['pas de DISCORD_BOT_TOKEN : personne prévenu'];
    const staff: Staff[] = await ctx.runQuery(internal.discordBot.staffIds, {});
    const out: string[] = [];
    for (const s of staffTargets(staff, sauf)) out.push(`${s.name} : ${await send(token, s.discordId, { content: texte.slice(0, 1900), allowed_mentions: { parse: [] } })}`);
    console.log(`[bot] équipe prévenue → ${out.join(' · ') || 'aucun admin'}`);
    return out.length ? out : ['aucun admin avec un compte Discord'];
  },
});

export const testDm = internalAction({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<string> => {
    const token = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
    if (!token) return 'pose d’abord DISCORD_BOT_TOKEN (npx convex env set DISCORD_BOT_TOKEN …)';
    const t: Dm | null = await ctx.runMutation(internal.discordBot.prepareDm, { name, force: true });
    if (!t) return `aucun compte Discord pour « ${name} »`;
    return await send(token, t.discordId, message(t.name, referralLink(siteOrigin(), t.code), t.lang));
  },
});
