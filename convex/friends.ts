import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getUserIdByToken, requireUser } from './auth';
import { notify } from './push';
import { presenceOf } from './presence';

/**
 * AMIS (retours live 02, point 8) — un vrai lien d'amitié, À PART de `users.friends` (qui reste la liste de TOUS les
 * joueurs : vue Échanges, duels, profil « Les autres »). Les échanges et le tableau d'offres restent ouverts à tous.
 *
 * Table `friendships` : une ligne par paire (demandeur → destinataire), `pending` puis `accepted`. Un refus garde la
 * ligne en `declined` (anti-relance : le demandeur ne peut pas renvoyer avant DECLINE_COOLDOWN_MS) ; annuler une
 * demande envoyée ou retirer un ami supprime la ligne.
 */

/** demandes envoyées en attente, au plus (anti-abus ; le club compte 20 joueurs) */
export const MAX_PENDING_OUT = 15;
/** après un refus, délai avant que le même demandeur puisse relancer */
export const DECLINE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PSEUDO_MAX = 64;

/** pseudo comparé « exact » : casse, accents et espaces de bord ignorés */
export const foldName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** La ligne qui lie deux joueurs (dans un sens ou dans l'autre), s'il y en a une. */
async function linkBetween(ctx: QueryCtx | MutationCtx, a: Id<'users'>, b: Id<'users'>): Promise<Doc<'friendships'> | null> {
  const ab = await ctx.db
    .query('friendships')
    .withIndex('by_pair', (q) => q.eq('requesterId', a).eq('addresseeId', b))
    .first();
  if (ab) return ab;
  return await ctx.db
    .query('friendships')
    .withIndex('by_pair', (q) => q.eq('requesterId', b).eq('addresseeId', a))
    .first();
}

/** Le joueur visé : par id, ou par pseudo exact (pseudo Discord d'abord — unique —, puis nom affiché). */
async function findTarget(ctx: MutationCtx, userId: Id<'users'> | undefined, name: string | undefined): Promise<Doc<'users'>> {
  if (userId) {
    const u = await ctx.db.get(userId);
    if (!u) throw new ConvexError('Joueur introuvable.');
    return u;
  }
  const want = foldName((name ?? '').slice(0, PSEUDO_MAX));
  if (!want) throw new ConvexError('Écris le pseudo exact de ton ami.');
  const users = (await ctx.db.query('users').collect()).filter((u) => !u.bannedAt);
  const byUsername = users.filter((u) => foldName(u.username) === want);
  if (byUsername.length === 1) return byUsername[0];
  const byName = users.filter((u) => foldName(u.displayName) === want);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw new ConvexError(`Plusieurs joueurs s’appellent « ${name!.trim()} » : passe par son profil (classement, gros tirages).`);
  throw new ConvexError(`Personne ne s’appelle « ${name!.trim()} » ici. Vérifie le pseudo (en entier).`);
}

/**
 * Demande quelqu'un en ami (par id ou par pseudo exact). S'il m'avait déjà demandé, c'est accepté d'un coup.
 * Renvoie le statut obtenu et le nom de la personne.
 */
export const request = mutation({
  args: { sessionToken: v.string(), userId: v.optional(v.id('users')), name: v.optional(v.string()) },
  handler: async (ctx, { sessionToken, userId, name }) => {
    const me = await requireUser(ctx, sessionToken);
    const target = await findTarget(ctx, userId, name);
    if (target._id === me._id) throw new ConvexError('C’est toi ! Choisis quelqu’un d’autre.');
    const now = Date.now();
    const link = await linkBetween(ctx, me._id, target._id);
    if (link?.status === 'accepted') throw new ConvexError(`${target.displayName} est déjà ton ami.`);
    if (link?.status === 'pending') {
      if (link.requesterId === me._id) throw new ConvexError(`Demande déjà envoyée à ${target.displayName}.`);
      // il m'avait demandé : on devient amis
      await ctx.db.patch(link._id, { status: 'accepted', respondedAt: now });
      await notify(ctx, target._id, { kind: 'friend', title: `${me.displayName} a accepté ta demande d’ami`, body: 'Vous pouvez échanger des cartes.', url: '#/amis' });
      return { status: 'accepted' as const, name: target.displayName };
    }
    if (link?.status === 'declined' && link.requesterId === me._id && now - (link.respondedAt ?? link.createdAt) < DECLINE_COOLDOWN_MS)
      throw new ConvexError(`${target.displayName} a décliné ta demande il y a peu : réessaie demain.`);
    const pendingOut = await ctx.db
      .query('friendships')
      .withIndex('by_requester', (q) => q.eq('requesterId', me._id).eq('status', 'pending'))
      .collect();
    if (pendingOut.length >= MAX_PENDING_OUT) throw new ConvexError(`${MAX_PENDING_OUT} demandes en attente au maximum : attends des réponses (ou annules-en).`);
    if (link) await ctx.db.patch(link._id, { requesterId: me._id, addresseeId: target._id, status: 'pending', createdAt: now, respondedAt: undefined });
    else await ctx.db.insert('friendships', { requesterId: me._id, addresseeId: target._id, status: 'pending', createdAt: now });
    await notify(ctx, target._id, { kind: 'friend', title: `${me.displayName} te demande en ami`, body: 'Accepte dans Amis pour échanger des cartes.', url: '#/amis' });
    return { status: 'pending' as const, name: target.displayName };
  },
});

async function mineLink(ctx: MutationCtx, sessionToken: string, friendshipId: Id<'friendships'>) {
  const me = await requireUser(ctx, sessionToken);
  const link = await ctx.db.get(friendshipId);
  if (!link || (link.requesterId !== me._id && link.addresseeId !== me._id)) throw new ConvexError('Demande introuvable (déjà traitée ?).');
  return { me, link };
}

/** Accepter une demande reçue. */
export const accept = mutation({
  args: { sessionToken: v.string(), friendshipId: v.id('friendships') },
  handler: async (ctx, { sessionToken, friendshipId }) => {
    const { me, link } = await mineLink(ctx, sessionToken, friendshipId);
    if (link.status !== 'pending' || link.addresseeId !== me._id) throw new ConvexError('Demande introuvable (déjà traitée ?).');
    await ctx.db.patch(link._id, { status: 'accepted', respondedAt: Date.now() });
    await notify(ctx, link.requesterId, { kind: 'friend', title: `${me.displayName} a accepté ta demande d’ami`, body: 'Vous pouvez échanger des cartes.', url: '#/amis' });
    return { ok: true };
  },
});

/** Refuser une demande reçue (le demandeur ne peut pas relancer avant 24 h). */
export const decline = mutation({
  args: { sessionToken: v.string(), friendshipId: v.id('friendships') },
  handler: async (ctx, { sessionToken, friendshipId }) => {
    const { me, link } = await mineLink(ctx, sessionToken, friendshipId);
    if (link.status !== 'pending' || link.addresseeId !== me._id) throw new ConvexError('Demande introuvable (déjà traitée ?).');
    await ctx.db.patch(link._id, { status: 'declined', respondedAt: Date.now() });
    return { ok: true };
  },
});

/** Annuler une demande envoyée. */
export const cancel = mutation({
  args: { sessionToken: v.string(), friendshipId: v.id('friendships') },
  handler: async (ctx, { sessionToken, friendshipId }) => {
    const { me, link } = await mineLink(ctx, sessionToken, friendshipId);
    if (link.status !== 'pending' || link.requesterId !== me._id) throw new ConvexError('Demande introuvable (déjà traitée ?).');
    await ctx.db.delete(link._id);
    return { ok: true };
  },
});

/** Retirer un ami (l'un ou l'autre peut le faire). */
export const remove = mutation({
  args: { sessionToken: v.string(), friendshipId: v.id('friendships') },
  handler: async (ctx, { sessionToken, friendshipId }) => {
    const { link } = await mineLink(ctx, sessionToken, friendshipId);
    if (link.status !== 'accepted') throw new ConvexError('Vous n’êtes pas (ou plus) amis.');
    await ctx.db.delete(link._id);
    return { ok: true };
  },
});

/**
 * Mes amis (avec `lastSeenAt` — le client en tire « en ligne » / « vu il y a… » —, leur dernière activité du fil) et
 * mes demandes reçues / envoyées en attente. `null` sans session.
 */
export const mine = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    // (audit 12/11, S04) id seul : la requête ne lit plus le document joueur, donc ne repart plus à chacune de ses écritures
    const meId = await getUserIdByToken(ctx, sessionToken);
    const me = meId ? { _id: meId } : null;
    if (!me) return null;
    const [outAll, inAll] = await Promise.all([
      ctx.db.query('friendships').withIndex('by_requester', (q) => q.eq('requesterId', me._id)).collect(),
      ctx.db.query('friendships').withIndex('by_addressee', (q) => q.eq('addresseeId', me._id)).collect(),
    ]);
    type Pub = { _id: Id<'users'>; displayName: string; username: string; avatarUrl?: string; lastSeenAt: number; statusText?: string; totalPacksOpened: number };
    // (audit 12/11, décision 8) la carte publique de l'ami (convex/presence.ts), pas son document : « mes amis » ne
    // repart plus à chacune de ses écritures privées. Sans carte (avant la migration) : son document, comme avant.
    const pub = async (id: Id<'users'>): Promise<Pub | null> => {
      const p = await presenceOf(ctx, id);
      return p ? { ...p, _id: p.userId } : await ctx.db.get(id);
    };
    const person = (u: Pub) => ({ userId: u._id, name: u.displayName, username: u.username, avatarUrl: u.avatarUrl });
    type Req = ReturnType<typeof person> & { friendshipId: Id<'friendships'>; createdAt: number };
    const friends = [];
    const incoming: Req[] = [];
    const outgoing: Req[] = [];
    for (const f of [...outAll, ...inAll]) {
      if (f.status === 'declined') continue;
      const otherId = f.requesterId === me._id ? f.addresseeId : f.requesterId;
      const u = await pub(otherId);
      if (!u) continue;
      if (f.status === 'pending') {
        (f.requesterId === me._id ? outgoing : incoming).push({ friendshipId: f._id, ...person(u), createdAt: f.createdAt });
        continue;
      }
      const last = await ctx.db
        .query('activityFeed')
        .withIndex('by_userId', (q) => q.eq('userId', u._id))
        .order('desc')
        .first();
      friends.push({
        friendshipId: f._id,
        ...person(u),
        since: f.respondedAt ?? f.createdAt,
        lastSeenAt: u.lastSeenAt,
        statusText: u.statusText,
        packsOpened: u.totalPacksOpened,
        lastActivity: last ? { kind: last.kind, message: last.message, createdAt: last.createdAt } : null,
      });
    }
    friends.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    incoming.sort((a, b) => b.createdAt - a.createdAt);
    outgoing.sort((a, b) => b.createdAt - a.createdAt);
    return { friends, incoming, outgoing };
  },
});
