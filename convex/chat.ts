import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getUserByToken, getUserIdByToken, requireUser } from './auth';
import { isNightParis, notify } from './push';
import { rarityValidator } from './cardsCatalog';
import { catalogEntry } from '../src/core/sets/themes';
import {
  CHAT_BURST_MAX,
  CHAT_BURST_WINDOW_MS,
  CHAT_GENERAL,
  CHAT_DM_PUSH_EVERY_MS,
  CHAT_MENTIONS_MAX,
  CHAT_MIN_GAP_MS,
  CHAT_PAGE,
  CHAT_REACTS,
  CHAT_TAIL_MAX,
  CHAT_WAKE_EVERY_MS,
  CHAT_WAKE_SILENCE_MS,
  chatSnippet,
  cleanChatText,
  dmKey,
  dmPeers,
} from '../src/core/chat';

/**
 * CHAT (V2, 10/11) — le chat général (tout le monde) + les privés à deux. Pensé pour coûter presque rien :
 *
 *  - `inbox` (pastille, liste) ne lit QUE des en-têtes : 1 ligne par conversation (`chatConvs`) + ma ligne de lecture
 *    (`chatReads`). Les non-lus sont une soustraction (n de la conversation − n lu) : aucun message relu.
 *  - `tail` (le fil ouvert) ne lit que ce qui a changé depuis T (index `by_conv_touched`) : à chaque nouveau message,
 *    chaque lecteur relit 1 ligne, pas la fenêtre entière. Réactions et suppressions avancent `touchedAt` : elles
 *    arrivent par le même abonnement.
 *  - `page` (historique) est une lecture ponctuelle, à la demande.
 *  - Rien n'est écrit sur `users` (chaque écriture y relance toutes les requêtes du joueur et du club).
 *  - Pas d'indicateur « écrit… » : une écriture par frappe pour tout le monde, c'est le poste le plus cher d'un chat.
 *
 * Notifications push (type `chat`) : privé et mention → tout de suite, une seule tant que ce n'est pas lu (ou 3 min) ;
 * Général → une notification « le chat général se réveille » après 20 min de silence, 45 min au plus tôt après la précédente.
 */

const cardArg = v.object({ cardId: v.string(), rarity: rarityValidator });
type Ctx = QueryCtx | MutationCtx;

const headOf = (ctx: Ctx, key: string) =>
  ctx.db
    .query('chatConvs')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
const readsOf = (ctx: Ctx, userId: Id<'users'>) =>
  ctx.db
    .query('chatReads')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();

/** Ai-je le droit de lire / écrire dans cette conversation ? */
function allowed(me: Id<'users'>, conv: string): boolean {
  if (conv === CHAT_GENERAL) return true;
  const p = dmPeers(conv);
  return !!p && (p[0] === me || p[1] === me);
}

const view = (m: Doc<'chatMessages'>) => ({
  id: m._id as string,
  n: m.n,
  userId: m.userId as string,
  name: m.name,
  text: m.deletedAt ? '' : m.text,
  at: m.createdAt,
  touchedAt: m.touchedAt,
  card: m.deletedAt ? undefined : m.card,
  reply: m.deletedAt ? undefined : (m.reply as { id: string; name: string; text: string } | undefined),
  reacts: m.deletedAt ? undefined : (m.reacts as Array<{ k: string; by: string[] }> | undefined),
  deleted: m.deletedAt ? true : undefined,
  clientId: m.clientId,
});

/** Mes conversations et mes non-lus. `null` sans session. */
export const inbox = query({
  // (audit 12/11, S04 / E1-03) `lean` (client V2) : id seul, la requête ne repart plus à chaque écriture du document
  // joueur ; `staff` vaut alors `false` ici et le client le prend dans `users.me`. Sans `lean` (client V1) : inchangé.
  args: { sessionToken: v.optional(v.string()), lean: v.optional(v.boolean()) },
  handler: async (ctx, { sessionToken, lean }) => {
    let me: { _id: Id<'users'>; isAdmin?: boolean; isModerator?: boolean } | null;
    if (lean) {
      const meId = await getUserIdByToken(ctx, sessionToken);
      me = meId ? { _id: meId } : null;
    } else me = await getUserByToken(ctx, sessionToken);
    if (!me) return null;
    const [general, reads, asA, asB] = await Promise.all([
      headOf(ctx, CHAT_GENERAL),
      readsOf(ctx, me._id),
      ctx.db.query('chatConvs').withIndex('by_a', (q) => q.eq('a', me._id)).collect(),
      ctx.db.query('chatConvs').withIndex('by_b', (q) => q.eq('b', me._id)).collect(),
    ]);
    const generalSeen = reads?.generalN ?? 0;
    const dms = [...asA, ...asB]
      .filter((c) => c.n > 0)
      .map((c) => {
        const iAmA = c.a === me._id;
        return {
          key: c.key,
          peerId: (iAmA ? c.b : c.a) as string,
          n: c.n,
          lastAt: c.lastAt,
          lastUserId: c.lastUserId as string | undefined,
          lastName: c.lastName,
          lastText: c.lastText,
          seenN: (iAmA ? c.seenA : c.seenB) ?? 0,
          peerSeenN: (iAmA ? c.seenB : c.seenA) ?? 0,
        };
      })
      .sort((x, y) => y.lastAt - x.lastAt);
    return {
      me: me._id as string,
      general: {
        key: CHAT_GENERAL,
        n: general?.n ?? 0,
        lastAt: general?.lastAt ?? 0,
        lastUserId: general?.lastUserId as string | undefined,
        lastName: general?.lastName,
        lastText: general?.lastText,
        seenN: generalSeen,
        mention: (reads?.mentionN ?? 0) > generalSeen,
      },
      dms,
      muted: reads?.muted ?? [],
      staff: !!(me.isAdmin || me.isModerator),
    };
  },
});

/** Une page d'historique (lecture ponctuelle), du plus ancien au plus récent. */
export const page = query({
  args: { sessionToken: v.string(), conv: v.string(), before: v.optional(v.number()) },
  handler: async (ctx, { sessionToken, conv, before }) => {
    const me = await requireUser(ctx, sessionToken);
    if (!allowed(me._id, conv)) throw new ConvexError('Conversation introuvable.');
    const rows = await ctx.db
      .query('chatMessages')
      .withIndex('by_conv_created', (q) => (before === undefined ? q.eq('conv', conv) : q.eq('conv', conv).lt('createdAt', before)))
      .order('desc')
      .take(CHAT_PAGE + 1);
    return { msgs: rows.slice(0, CHAT_PAGE).reverse().map(view), done: rows.length <= CHAT_PAGE };
  },
});

/** Ce qui a changé dans une conversation depuis `after` (nouveaux messages, réactions, suppressions). */
export const tail = query({
  args: { sessionToken: v.optional(v.string()), conv: v.string(), after: v.number() },
  handler: async (ctx, { sessionToken, conv, after }) => {
    // (audit 12/11, S04) id seul : la requête ne lit plus le document joueur, donc ne repart plus à chacune de ses écritures
    const meId = await getUserIdByToken(ctx, sessionToken);
    const me = meId ? { _id: meId } : null;
    if (!me || !allowed(me._id, conv)) return null;
    const rows = await ctx.db
      .query('chatMessages')
      .withIndex('by_conv_touched', (q) => q.eq('conv', conv).gt('touchedAt', after))
      .take(CHAT_TAIL_MAX + 1);
    return { msgs: rows.slice(0, CHAT_TAIL_MAX).map(view), more: rows.length > CHAT_TAIL_MAX };
  },
});

/** Ma ligne de lecture, créée au besoin. */
async function myReads(ctx: MutationCtx, userId: Id<'users'>): Promise<Doc<'chatReads'>> {
  const r = await readsOf(ctx, userId);
  if (r) return r;
  const id = await ctx.db.insert('chatReads', { userId, generalN: 0 });
  return (await ctx.db.get(id))!;
}

export const send = mutation({
  args: {
    sessionToken: v.string(),
    conv: v.string(),
    text: v.string(),
    card: v.optional(cardArg),
    replyTo: v.optional(v.id('chatMessages')),
    mentions: v.optional(v.array(v.id('users'))),
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const me = await requireUser(ctx, a.sessionToken);
    if (me.bannedAt) throw new ConvexError('Compte suspendu.');
    if (!allowed(me._id, a.conv)) throw new ConvexError('Conversation introuvable.');
    const text = cleanChatText(a.text);
    if (!text && !a.card) throw new ConvexError('Message vide.');

    // anti-rafale (sur ma ligne de lecture : rien n'est écrit sur `users`)
    const reads = await myReads(ctx, me._id);
    let now = Date.now();
    if (reads.sentAt && now - reads.sentAt < CHAT_MIN_GAP_MS) throw new ConvexError('Doucement : un message à la fois.');
    const fresh = now - (reads.burstStart ?? 0) > CHAT_BURST_WINDOW_MS;
    const burstStart = fresh ? now : reads.burstStart!;
    const burstCount = fresh ? 0 : (reads.burstCount ?? 0);
    if (burstCount >= CHAT_BURST_MAX) throw new ConvexError(`Tu écris trop vite : reprends dans ${Math.max(1, Math.ceil((burstStart + CHAT_BURST_WINDOW_MS - now) / 1000))} s.`);

    // la conversation (créée au premier message)
    const isGeneral = a.conv === CHAT_GENERAL;
    let peer: Doc<'users'> | null = null;
    let head = await headOf(ctx, a.conv);
    if (!isGeneral) {
      const [pa, pb] = dmPeers(a.conv)!;
      const peerId = (pa === me._id ? pb : pa) as Id<'users'>;
      const normal = ctx.db.normalizeId('users', peerId);
      peer = normal ? await ctx.db.get(normal) : null;
      if (!peer || peer.bannedAt || peer._id === me._id) throw new ConvexError('Joueur introuvable.');
      if (dmKey(me._id, peer._id) !== a.conv) throw new ConvexError('Conversation introuvable.');
    }
    if (!head) {
      const p = isGeneral ? null : dmPeers(a.conv)!;
      const id = await ctx.db.insert('chatConvs', { key: a.conv, n: 0, lastAt: 0, ...(p ? { a: p[0] as Id<'users'>, b: p[1] as Id<'users'> } : {}) });
      head = (await ctx.db.get(id))!;
    }
    // l'heure d'un message suit toujours celle du précédent : l'ordre par date = l'ordre par numéro
    now = Math.max(now, head.lastAt + 1);
    const n = head.n + 1;

    // carte montrée : une carte que je possède, avec mon meilleur numéro d'impression
    let card: Doc<'chatMessages'>['card'];
    if (a.card) {
      const e = catalogEntry(a.card.cardId);
      if (!e) throw new ConvexError('Carte inconnue.');
      const inv = await ctx.db
        .query('inventory')
        .withIndex('by_user_card_rarity', (q) => q.eq('userId', me._id).eq('cardId', a.card!.cardId).eq('rarity', a.card!.rarity))
        .unique();
      if (!inv || inv.count < 1) throw new ConvexError(`Tu n’as pas ${e.name}.`);
      card = { cardId: a.card.cardId, rarity: a.card.rarity, mintNumber: inv.bestMintNumber };
    }

    // réponse : un extrait du message d'origine (même conversation)
    let reply: { id: Id<'chatMessages'>; name: string; text: string } | undefined;
    if (a.replyTo) {
      const src = await ctx.db.get(a.replyTo);
      if (src && src.conv === a.conv && !src.deletedAt) reply = { id: src._id, name: src.name, text: chatSnippet(src.text || (src.card ? (catalogEntry(src.card.cardId)?.name ?? 'une carte') : ''), 80) };
    }

    // mentions (chat général seulement) : des joueurs qui existent, sans moi, sans doublon
    const mentions: Id<'users'>[] = [];
    if (isGeneral)
      for (const id of [...new Set(a.mentions ?? [])].slice(0, CHAT_MENTIONS_MAX)) {
        if (id === me._id) continue;
        const u = await ctx.db.get(id);
        if (u && !u.bannedAt) mentions.push(id);
      }

    const id = await ctx.db.insert('chatMessages', {
      conv: a.conv,
      n,
      userId: me._id,
      name: me.displayName,
      text,
      createdAt: now,
      touchedAt: now,
      ...(card ? { card } : {}),
      ...(reply ? { reply } : {}),
      ...(mentions.length ? { mentions } : {}),
      ...(a.clientId ? { clientId: a.clientId.slice(0, 40) } : {}),
    });

    const cardName = card ? (catalogEntry(card.cardId)?.name ?? 'une carte') : '';
    const preview = chatSnippet(text || `Carte : ${cardName}`);
    const iAmA = !isGeneral && head.a === me._id;
    const silentFor = now - head.lastAt;
    const wake = isGeneral && head.n > 0 && silentFor > CHAT_WAKE_SILENCE_MS && now - (head.wakeAt ?? 0) > CHAT_WAKE_EVERY_MS;
    const firstGeneral = isGeneral && head.n === 0;
    // privé : une notification, puis plus rien tant que l'autre n'a pas lu (ou 3 min ; toute la nuit : une seule)
    let pushPeer = false;
    if (peer) {
      const peerSeenAt = (iAmA ? head.seenAtB : head.seenAtA) ?? 0;
      const lastPush = (iAmA ? head.pushAtB : head.pushAtA) ?? 0;
      const readSincePush = peerSeenAt >= lastPush;
      const reading = now - peerSeenAt < 60_000; // il est dans la conversation : il le voit déjà
      const every = isNightParis(now) ? 10 * 60 * 60 * 1000 : CHAT_DM_PUSH_EVERY_MS;
      pushPeer = !reading && (lastPush === 0 || readSincePush || now - lastPush > every);
    }
    await ctx.db.patch(head._id, {
      n,
      lastAt: now,
      lastUserId: me._id,
      lastName: me.displayName,
      lastText: preview,
      // j'ai lu ce que j'envoie
      ...(isGeneral ? {} : iAmA ? { seenA: n, seenAtA: now } : { seenB: n, seenAtB: now }),
      ...(pushPeer ? (iAmA ? { pushAtB: now } : { pushAtA: now }) : {}),
      ...(wake || firstGeneral ? { wakeAt: now } : {}),
    });
    await ctx.db.patch(reads._id, { sentAt: now, burstStart, burstCount: burstCount + 1, ...(isGeneral ? { generalN: n, generalAt: now } : {}) });

    // mentions : repère pour la pastille + notification
    for (const uid of mentions) {
      const r = await myReads(ctx, uid);
      await ctx.db.patch(r._id, { mentionN: n });
      if (!(r.muted ?? []).includes(CHAT_GENERAL))
        await notify(ctx, uid, { kind: 'chat', title: `${me.displayName} t’a mentionné`, body: preview, url: `#/chat/${CHAT_GENERAL}`, tag: 'chat-mention' }, { at: now });
    }
    if (peer && pushPeer) {
      const r = await readsOf(ctx, peer._id);
      if (!(r?.muted ?? []).includes(a.conv)) await notify(ctx, peer._id, { kind: 'chat', title: me.displayName, body: preview, url: `#/chat/${a.conv}`, tag: `chat-${me._id}` }, { at: now });
    }
    if (wake) await ctx.scheduler.runAfter(0, internal.chat.generalWake, { fromId: me._id, name: me.displayName, body: preview, skip: mentions });
    return { id: id as string, n, at: now };
  },
});

/** « Le chat général se réveille » : une notification à ceux qui sont abonnés, pas en sourdine, pas déjà prévenus par une mention. */
export const generalWake = internalMutation({
  args: { fromId: v.id('users'), name: v.string(), body: v.string(), skip: v.array(v.id('users')) },
  handler: async (ctx, { fromId, name, body, skip }) => {
    const now = Date.now();
    if (isNightParis(now)) return { players: 0 };
    const users = new Set<Id<'users'>>();
    for (const s of await ctx.db.query('pushSubs').collect()) users.add(s.userId);
    let players = 0;
    for (const uid of users) {
      if (uid === fromId || skip.includes(uid)) continue;
      const r = await readsOf(ctx, uid);
      if ((r?.muted ?? []).includes(CHAT_GENERAL)) continue;
      if (r?.generalAt && now - r.generalAt < 60_000) continue; // en train de lire le chat général
      await notify(ctx, uid, { kind: 'chat', title: `Général · ${name}`, body, url: `#/chat/${CHAT_GENERAL}`, tag: 'chat-general' }, { at: now });
      players++;
    }
    return { players };
  },
});

/** Poser / retirer une réaction (un tampon parmi CHAT_REACTS). */
export const react = mutation({
  args: { sessionToken: v.string(), id: v.id('chatMessages'), k: v.string() },
  handler: async (ctx, { sessionToken, id, k }) => {
    const me = await requireUser(ctx, sessionToken);
    if (!(CHAT_REACTS as readonly string[]).includes(k)) throw new ConvexError('Réaction inconnue.');
    const m = await ctx.db.get(id);
    if (!m || m.deletedAt || !allowed(me._id, m.conv)) throw new ConvexError('Message introuvable.');
    const reacts = (m.reacts ?? []).map((r) => ({ k: r.k, by: [...r.by] }));
    const cur = reacts.find((r) => r.k === k);
    if (cur?.by.includes(me._id)) cur.by = cur.by.filter((u) => u !== me._id);
    else if (cur) cur.by.push(me._id);
    else reacts.push({ k, by: [me._id] });
    const next = reacts.filter((r) => r.by.length);
    await ctx.db.patch(id, { reacts: next.length ? next : undefined, touchedAt: Math.max(Date.now(), m.touchedAt + 1) });
    return { ok: true };
  },
});

/** Supprimer un message : le sien, ou n'importe lequel pour l'équipe. Le texte est effacé pour de bon. */
export const remove = mutation({
  args: { sessionToken: v.string(), id: v.id('chatMessages') },
  handler: async (ctx, { sessionToken, id }) => {
    const me = await requireUser(ctx, sessionToken);
    const m = await ctx.db.get(id);
    if (!m || !allowed(me._id, m.conv)) throw new ConvexError('Message introuvable.');
    if (m.deletedAt) return { ok: true };
    if (m.userId !== me._id && !(me.isAdmin || me.isModerator)) throw new ConvexError('Tu ne peux supprimer que tes messages.');
    const now = Date.now();
    await ctx.db.patch(id, { deletedAt: now, text: '', card: undefined, reply: undefined, reacts: undefined, mentions: undefined, touchedAt: Math.max(now, m.touchedAt + 1) });
    const head = await headOf(ctx, m.conv);
    if (head && head.n === m.n) await ctx.db.patch(head._id, { lastText: '' });
    return { ok: true };
  },
});

/** J'ai lu jusqu'au message n° `n`. Aucune écriture si rien ne change. */
export const markRead = mutation({
  args: { sessionToken: v.string(), conv: v.string(), n: v.number() },
  handler: async (ctx, { sessionToken, conv, n }) => {
    const me = await requireUser(ctx, sessionToken);
    if (!allowed(me._id, conv)) throw new ConvexError('Conversation introuvable.');
    const head = await headOf(ctx, conv);
    if (!head) return { ok: true };
    const upTo = Math.max(0, Math.min(Math.floor(n), head.n));
    const now = Date.now();
    if (conv === CHAT_GENERAL) {
      const r = await readsOf(ctx, me._id);
      if (!r) await ctx.db.insert('chatReads', { userId: me._id, generalN: upTo, generalAt: now });
      else if (upTo > r.generalN) await ctx.db.patch(r._id, { generalN: upTo, generalAt: now });
      return { ok: true };
    }
    const iAmA = head.a === me._id;
    if (upTo > ((iAmA ? head.seenA : head.seenB) ?? 0)) await ctx.db.patch(head._id, iAmA ? { seenA: upTo, seenAtA: now } : { seenB: upTo, seenAtB: now });
    return { ok: true };
  },
});

/** Sourdine d'une conversation : plus de notification ni de pastille pour elle. */
export const mute = mutation({
  args: { sessionToken: v.string(), conv: v.string(), on: v.boolean() },
  handler: async (ctx, { sessionToken, conv, on }) => {
    const me = await requireUser(ctx, sessionToken);
    if (!allowed(me._id, conv)) throw new ConvexError('Conversation introuvable.');
    const r = await myReads(ctx, me._id);
    const cur = r.muted ?? [];
    const next = on ? [...new Set([...cur, conv])].slice(-40) : cur.filter((c) => c !== conv);
    if (next.length !== cur.length) await ctx.db.patch(r._id, { muted: next });
    return { ok: true };
  },
});
