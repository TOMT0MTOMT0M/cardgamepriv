import { t } from '../core/i18n';
import '../core/i18n/fr/game.chatLocal'; // (textes de ce module, version anglaise)
import { fe } from '../core/errors';
import { CHAT_GENERAL, CHAT_PAGE, CHAT_REACTS, chatSnippet, cleanChatText, dmKey, dmPeer, type ChatApi, type ChatHead, type ChatInbox, type ChatMsg } from '../core/chat';

/**
 * CHAT du mode DÉMO : tout dans ce navigateur, les « amis » sont les robots de la démo (ils répondent une phrase
 * au bout de quelques secondes). Même interface que le serveur (convex/chat.ts) : le jeu ne voit pas la différence.
 */
const LS = 'bebou.demo.chat.v1';
const ME = 'me';
interface Conv {
  n: number;
  seen: number;
  msgs: ChatMsg[];
}
interface Saved {
  convs: Record<string, Conv>;
  muted: string[];
  seq: number;
}
const BOT_LINES = () => ['GG !', t('cl.l1'), t('cl.l2'), t('cl.l3'), t('cl.l4'), t('cl.l5'), t('cl.l6'), t('cl.l7')];

export function createLocalChat(bots: () => Array<{ id: string; name: string }>, hasCard: (cardId: string, rarity: string) => number | null): ChatApi {
  let save: Saved;
  try {
    save = JSON.parse(localStorage.getItem(LS) ?? 'null') ?? { convs: {}, muted: [], seq: 1 };
  } catch {
    save = { convs: {}, muted: [], seq: 1 };
  }
  const inboxSubs = new Set<(i: ChatInbox | null) => void>();
  const tailSubs = new Set<{ conv: string; after: number; cb: (r: { msgs: ChatMsg[]; more: boolean } | null) => void }>();
  const conv = (key: string) => (save.convs[key] ??= { n: 0, seen: 0, msgs: [] });
  const flush = () => {
    try {
      for (const c of Object.values(save.convs)) if (c.msgs.length > 200) c.msgs.splice(0, c.msgs.length - 200);
      localStorage.setItem(LS, JSON.stringify(save));
    } catch {
      /* stockage plein : la démo continue en mémoire */
    }
  };

  function post(key: string, from: { id: string; name: string }, text: string, extra: Partial<ChatMsg> = {}, at = Date.now()): ChatMsg {
    const c = conv(key);
    const last = c.msgs.at(-1);
    const when = Math.max(at, (last?.at ?? 0) + 1);
    const m: ChatMsg = { id: `d${save.seq++}`, n: ++c.n, userId: from.id, name: from.name, text, at: when, touchedAt: when, ...extra };
    c.msgs.push(m);
    if (from.id === ME) c.seen = c.n;
    return m;
  }
  // premier lancement : le chat général a déjà un peu de vie
  if (!save.convs[CHAT_GENERAL]) {
    const b = bots();
    const t0 = Date.now() - 42 * 60 * 1000;
    if (b[0]) post(CHAT_GENERAL, b[0], t('cl.welcome'), {}, t0);
    if (b[1]) post(CHAT_GENERAL, b[1], t('cl.ask'), {}, t0 + 9 * 60 * 1000);
    if (b[2]) post(CHAT_GENERAL, b[2], t('cl.reply'), { reacts: b[0] ? [{ k: 'LOL', by: [b[0].id] }] : undefined }, t0 + 11 * 60 * 1000);
    flush();
  }

  const head = (key: string): ChatHead => {
    const c = conv(key);
    const last = c.msgs.at(-1);
    return { key, peerId: dmPeer(key, ME) ?? undefined, n: c.n, lastAt: last?.at ?? 0, lastUserId: last?.userId, lastName: last?.name, lastText: last ? (last.deleted ? '' : chatSnippet(last.text || t('cl.card'))) : undefined, seenN: c.seen, peerSeenN: dmPeer(key, ME) ? c.n : undefined };
  };
  const inbox = (): ChatInbox => ({
    me: ME,
    general: { ...head(CHAT_GENERAL), mention: false },
    dms: Object.keys(save.convs)
      .filter((k) => k !== CHAT_GENERAL && save.convs[k].n > 0)
      .map(head)
      .sort((a, b) => b.lastAt - a.lastAt),
    muted: save.muted,
    staff: true,
  });
  function emit(key?: string) {
    flush();
    const i = inbox();
    inboxSubs.forEach((f) => f(i));
    for (const s of tailSubs) if (!key || s.conv === key) s.cb({ msgs: conv(s.conv).msgs.filter((m) => m.touchedAt > s.after).map((m) => ({ ...m })), more: false });
  }
  const find = (id: string) => {
    for (const [key, c] of Object.entries(save.convs)) {
      const m = c.msgs.find((x) => x.id === id);
      if (m) return { key, m };
    }
    return null;
  };
  function botReply(key: string) {
    const b = bots();
    const peer = dmPeer(key, ME);
    const who = peer ? b.find((x) => x.id === peer) : b[Math.floor(Math.random() * b.length)];
    if (!who) return;
    setTimeout(() => {
      const lines = BOT_LINES();
      post(key, who, lines[Math.floor(Math.random() * lines.length)]);
      emit(key);
    }, 1400 + Math.random() * 2600);
  }

  return {
    watchInbox(cb) {
      inboxSubs.add(cb);
      queueMicrotask(() => inboxSubs.has(cb) && cb(inbox()));
      return () => inboxSubs.delete(cb);
    },
    async page(key, before) {
      const all = conv(key).msgs.filter((m) => before === undefined || m.at < before);
      return { msgs: all.slice(-CHAT_PAGE).map((m) => ({ ...m })), done: all.length <= CHAT_PAGE };
    },
    watchTail(key, after, cb) {
      const s = { conv: key, after, cb };
      tailSubs.add(s);
      queueMicrotask(() => tailSubs.has(s) && cb({ msgs: conv(key).msgs.filter((m) => m.touchedAt > after).map((m) => ({ ...m })), more: false }));
      return () => tailSubs.delete(s);
    },
    async send(key, o) {
      const text = cleanChatText(o.text);
      if (!text && !o.card) throw new Error(fe('chat.11'));
      if (key !== CHAT_GENERAL && key !== dmKey(ME, dmPeer(key, ME) ?? '')) throw new Error(fe('chat.8'));
      let card: ChatMsg['card'];
      if (o.card) {
        const mint = hasCard(o.card.cardId, o.card.rarity);
        if (mint === null) throw new Error('Tu n’as pas cette carte.');
        card = { ...o.card, mintNumber: mint };
      }
      const src = o.replyTo ? find(o.replyTo)?.m : undefined;
      const m = post(key, { id: ME, name: t('chat.me') }, text, { card, clientId: o.clientId, reply: src ? { id: src.id, name: src.name, text: chatSnippet(src.text || t('cl.aCard'), 80) } : undefined });
      emit(key);
      botReply(key);
      return { id: m.id, n: m.n, at: m.at };
    },
    async react(id, k) {
      const hit = find(id);
      if (!hit || !(CHAT_REACTS as readonly string[]).includes(k)) return;
      const rs = (hit.m.reacts ?? []).map((r) => ({ k: r.k, by: [...r.by] }));
      const cur = rs.find((r) => r.k === k);
      if (cur?.by.includes(ME)) cur.by = cur.by.filter((u) => u !== ME);
      else if (cur) cur.by.push(ME);
      else rs.push({ k, by: [ME] });
      hit.m.reacts = rs.filter((r) => r.by.length);
      hit.m.touchedAt = Math.max(Date.now(), hit.m.touchedAt + 1);
      emit(hit.key);
    },
    async remove(id) {
      const hit = find(id);
      if (!hit) return;
      Object.assign(hit.m, { deleted: true, text: '', card: undefined, reply: undefined, reacts: undefined, touchedAt: Math.max(Date.now(), hit.m.touchedAt + 1) });
      emit(hit.key);
    },
    async markRead(key, n) {
      const c = conv(key);
      const upTo = Math.min(n, c.n);
      if (upTo <= c.seen) return;
      c.seen = upTo;
      emit('');
    },
    async mute(key, on) {
      save.muted = on ? [...new Set([...save.muted, key])] : save.muted.filter((k) => k !== key);
      emit('');
    },
  };
}
