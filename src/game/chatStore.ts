import { CHAT_GENERAL, CHAT_TAIL_OVERLAP_MS, chatSnippet, type ChatApi, type ChatHead, type ChatInbox, type ChatMsg } from '../core/chat';

/**
 * CHAT côté jeu — l'état (conversations, messages) et tout ce qui le rend rapide et pas cher :
 *
 *  - CACHE LOCAL : les 40 derniers messages de chaque conversation ouverte restent dans ce navigateur. À l'ouverture,
 *    le fil s'affiche tout de suite, sans requête ; le serveur n'envoie que ce qui a changé depuis (abonnement
 *    « depuis T », convex/chat.ts `tail`). Une conversation jamais ouverte charge une page (30 messages), une fois.
 *  - ENVOI OPTIMISTE : le message apparaît à la frappe d'Entrée ; il est remplacé par le vrai quand le serveur répond.
 *  - UN SEUL fil suivi à la fois (celui qui est à l'écran) ; panneau fermé : seulement la pastille (`inbox`).
 *  - ONGLET CACHÉ : au bout de 45 s, plus aucun abonnement (les notifications push prennent le relais) ; tout repart
 *    au retour.
 *  - « Lu » : une écriture par lecture réelle (panneau ouvert, onglet visible, bas du fil), jamais par message.
 */
const KEEP = 40;
/** au-delà, le fil suivi repart de plus près (chaque relecture reste de quelques lignes) */
const ROLL_AT = 24;
const HIDDEN_PAUSE_MS = 45_000;

export interface ConvState {
  msgs: ChatMsg[];
  /** première page (ou cache) arrivée */
  loaded: boolean;
  loading: boolean;
  /** plus rien avant le premier message affiché */
  done: boolean;
  error?: string;
}
export type ChatEvent =
  | { type: 'inbox' }
  | { type: 'conv'; key: string }
  /** message d'un autre, arrivé en direct (son, aperçu) */
  | { type: 'incoming'; key: string; name: string; text: string; userId?: string }
  | { type: 'error'; message: string };

export interface ChatStore {
  readonly inbox: ChatInbox | null;
  head(key: string): ChatHead | null;
  unread(key: string): number;
  /** total des non-lus hors sourdine, et s'il y a une mention */
  unreadTotal(): { n: number; mention: boolean };
  conv(key: string): ConvState;
  /** le fil à l'écran (null : panneau fermé) */
  follow(key: string | null): void;
  older(key: string): Promise<void>;
  send(key: string, o: { text: string; card?: { cardId: string; rarity: string; mintNumber?: number }; replyTo?: ChatMsg; mentions?: string[] }): void;
  retry(key: string, clientId: string): void;
  discard(key: string, clientId: string): void;
  react(key: string, m: ChatMsg, k: string): void;
  remove(key: string, m: ChatMsg): void;
  markRead(key: string): void;
  mute(key: string, on: boolean): void;
  on(fn: (e: ChatEvent) => void): () => void;
  /** déconnexion / changement de compte */
  reset(): void;
}

const errText = (e: unknown) => {
  const m = String((e as { data?: string; message?: string })?.data ?? (e as Error)?.message ?? e);
  if (/ConvexError:/.test(m)) return m.replace(/^[\s\S]*ConvexError:\s*/, '').replace(/\s*at [\s\S]*$/, '').trim();
  if (/\[CONVEX |Server Error|Request ID/.test(m)) return 'Le serveur a refusé le message, réessaie.';
  return m;
};

export function createChatStore(api: ChatApi, me: () => { id: string; name: string } | null): ChatStore {
  const subs = new Set<(e: ChatEvent) => void>();
  const emit = (e: ChatEvent) => subs.forEach((f) => f(e));
  const convs = new Map<string, ConvState>();
  /** messages en cours d'envoi : de quoi les renvoyer */
  const outbox = new Map<string, { key: string; text: string; card?: { cardId: string; rarity: string }; replyTo?: string; mentions?: string[] }>();
  let inbox: ChatInbox | null = null;
  /** premier état reçu depuis le dernier abonnement : pas d'aperçu pour ce qui était déjà là */
  let primed = false;
  let unInbox: (() => void) | null = null;
  let followed: string | null = null;
  let unTail: (() => void) | null = null;
  let tailAfter = 0;
  let paused = false;
  let pauseTimer = 0;
  /** dernier « lu » demandé par conversation (pas deux écritures pour le même numéro) */
  const marked = new Map<string, number>();

  // ── cache local
  const lsKey = (key: string) => `bebou.chat.${me()?.id ?? '?'}.${key}`;
  const saveTimers = new Map<string, number>();
  function persist(key: string) {
    if (saveTimers.has(key)) return;
    saveTimers.set(
      key,
      window.setTimeout(() => {
        saveTimers.delete(key);
        const c = convs.get(key);
        if (!c?.loaded || !me()) return;
        try {
          const keep = c.msgs.filter((m) => !m.pending && !m.failed).slice(-KEEP);
          localStorage.setItem(lsKey(key), JSON.stringify({ v: 1, msgs: keep, done: c.done && keep.length === c.msgs.length }));
        } catch {
          /* stockage plein ou indisponible : le chat marche sans cache */
        }
      }, 600),
    );
  }
  function recall(key: string): { msgs: ChatMsg[]; done: boolean } | null {
    try {
      const v = JSON.parse(localStorage.getItem(lsKey(key)) ?? 'null') as { v: number; msgs: ChatMsg[]; done?: boolean } | null;
      return v?.v === 1 && Array.isArray(v.msgs) && v.msgs.length ? { msgs: v.msgs, done: !!v.done } : null;
    } catch {
      return null;
    }
  }

  const conv = (key: string): ConvState => {
    let c = convs.get(key);
    if (!c) convs.set(key, (c = { msgs: [], loaded: false, loading: false, done: false }));
    return c;
  };
  const maxTouched = (c: ConvState) => c.msgs.reduce((t, m) => (m.pending || m.failed ? t : Math.max(t, m.touchedAt)), 0);
  const head = (key: string): ChatHead | null => (!inbox ? null : key === CHAT_GENERAL ? inbox.general : (inbox.dms.find((d) => d.key === key) ?? null));
  const unread = (key: string) => {
    const h = head(key);
    return h ? Math.max(0, h.n - h.seenN) : 0;
  };

  /** Fusionne des messages venus du serveur ; renvoie ceux des autres qu'on n'avait pas. */
  function merge(key: string, list: ChatMsg[], live: boolean): ChatMsg[] {
    const c = conv(key);
    const mine = me()?.id;
    const fresh: ChatMsg[] = [];
    const oldest = c.msgs.find((m) => !m.pending && !m.failed)?.at ?? 0;
    const newest = c.msgs.reduce((t, m) => (m.pending || m.failed ? t : Math.max(t, m.at)), 0);
    let changed = false;
    for (const m of list) {
      const byClient = m.clientId ? c.msgs.findIndex((x) => x.clientId === m.clientId && (x.pending || x.failed || x.id === m.id)) : -1;
      const i = byClient >= 0 ? byClient : c.msgs.findIndex((x) => x.id === m.id);
      if (i >= 0) {
        const cur = c.msgs[i];
        if (cur.pending || cur.failed || m.touchedAt >= cur.touchedAt) {
          c.msgs[i] = m;
          if (m.clientId) outbox.delete(m.clientId);
          changed = true;
        }
        continue;
      }
      // plus ancien que ce qui est affiché (réaction sur un vieux message pas chargé) : rien à faire
      if (c.msgs.length && m.at < oldest && !c.done) continue;
      c.msgs.push(m);
      changed = true;
      if (live && m.at > newest && m.userId !== mine && !m.deleted) fresh.push(m);
    }
    if (changed) {
      c.msgs.sort((a, b) => a.at - b.at || a.n - b.n);
      persist(key);
    }
    return fresh;
  }

  // ── le fil suivi
  function startTail(key: string, after: number) {
    unTail?.();
    tailAfter = after;
    let first = true;
    unTail = api.watchTail(key, after, (r) => {
      if (followed !== key || !r) return;
      if (r.more) return void reload(key); // trop de retard : on repart d'une page fraîche
      const live = !first;
      first = false;
      const fresh = merge(key, r.msgs, live);
      emit({ type: 'conv', key });
      for (const m of fresh) emit({ type: 'incoming', key, name: m.name, text: m.text || 'Carte', userId: m.userId });
      // le fil suivi grossit : on repart de plus près (la prochaine relecture ne porte que sur quelques lignes)
      if (r.msgs.length >= ROLL_AT) {
        const t = maxTouched(conv(key)) - CHAT_TAIL_OVERLAP_MS;
        if (t > tailAfter) startTail(key, t);
      }
    });
  }
  async function reload(key: string) {
    const c = conv(key);
    unTail?.();
    unTail = null;
    c.loading = true;
    c.error = undefined;
    emit({ type: 'conv', key });
    try {
      const p = await api.page(key);
      const sending = c.msgs.filter((m) => m.pending || m.failed);
      c.msgs = [...p.msgs, ...sending];
      c.done = p.done;
      c.loaded = true;
      persist(key);
    } catch (e) {
      c.error = errText(e);
    }
    c.loading = false;
    emit({ type: 'conv', key });
    if (followed === key && !paused && c.loaded) startTail(key, Math.max(0, maxTouched(c) - CHAT_TAIL_OVERLAP_MS));
  }
  function resumeTail() {
    const key = followed;
    if (!key || paused) return;
    const c = conv(key);
    if (!c.loaded) {
      const hit = recall(key);
      if (hit) {
        c.msgs = hit.msgs;
        c.done = hit.done;
        c.loaded = true;
        emit({ type: 'conv', key });
      }
    }
    if (c.loaded) startTail(key, Math.max(0, maxTouched(c) - CHAT_TAIL_OVERLAP_MS));
    else if (!c.loading) void reload(key);
  }

  // ── la pastille
  function startInbox() {
    if (unInbox || paused) return;
    primed = false;
    unInbox = api.watchInbox((raw) => {
      const prev = inbox;
      // copie (on y note « lu » tout de suite) ; un « lu » déjà demandé ne recule pas si le serveur répond en retard
      const own = (h: ChatHead): ChatHead => ({ ...h, seenN: Math.min(h.n, Math.max(h.seenN, marked.get(h.key) ?? 0)) });
      const next: ChatInbox | null = raw ? { ...raw, general: own(raw.general), dms: raw.dms.map(own), muted: [...raw.muted] } : null;
      if (next && next.general.seenN >= next.general.n) next.general.mention = false;
      inbox = next;
      if (next && prev && primed && next.me === prev.me) {
        const was = new Map([prev.general, ...prev.dms].map((h) => [h.key, h.n]));
        for (const h of [next.general, ...next.dms]) {
          if (h.n <= (was.get(h.key) ?? 0) || h.lastUserId === next.me || next.muted.includes(h.key)) continue;
          // le fil à l'écran annonce lui-même ses messages (son) : ici, seulement les autres conversations
          if (h.key !== followed) emit({ type: 'incoming', key: h.key, name: h.lastName ?? '', text: h.lastText ?? '', userId: h.lastUserId });
        }
      }
      if (next) primed = true;
      emit({ type: 'inbox' });
    });
  }
  function stopAll() {
    unInbox?.();
    unInbox = null;
    unTail?.();
    unTail = null;
  }
  document.addEventListener('visibilitychange', () => {
    clearTimeout(pauseTimer);
    if (document.hidden) {
      pauseTimer = window.setTimeout(() => {
        paused = true;
        stopAll();
      }, HIDDEN_PAUSE_MS);
      return;
    }
    if (!paused) return;
    paused = false;
    if (me()) startInbox();
    resumeTail();
  });

  function deliver(clientId: string) {
    const o = outbox.get(clientId);
    if (!o) return;
    api.send(o.key, { text: o.text, card: o.card, replyTo: o.replyTo, mentions: o.mentions, clientId }).then(
      (r) => {
        const c = conv(o.key);
        const m = c.msgs.find((x) => x.clientId === clientId);
        outbox.delete(clientId);
        if (m && (m.pending || m.failed)) {
          Object.assign(m, { id: r.id, n: r.n, at: r.at, touchedAt: r.at, pending: false, failed: false });
          c.msgs.sort((a, b) => a.at - b.at || a.n - b.n);
          persist(o.key);
          emit({ type: 'conv', key: o.key });
        }
      },
      (e: unknown) => {
        const m = conv(o.key).msgs.find((x) => x.clientId === clientId);
        if (m) Object.assign(m, { pending: false, failed: true });
        emit({ type: 'conv', key: o.key });
        emit({ type: 'error', message: errText(e) });
      },
    );
  }

  const store: ChatStore = {
    get inbox() {
      return inbox;
    },
    head,
    unread,
    unreadTotal() {
      if (!inbox) return { n: 0, mention: false };
      let n = 0;
      for (const h of [inbox.general, ...inbox.dms]) if (!inbox.muted.includes(h.key)) n += Math.max(0, h.n - h.seenN);
      return { n, mention: !!inbox.general.mention && !inbox.muted.includes(CHAT_GENERAL) };
    },
    conv,
    follow(key) {
      if (key === followed) return;
      unTail?.();
      unTail = null;
      followed = key;
      if (me() && !unInbox && !paused) startInbox();
      resumeTail();
    },
    async older(key) {
      const c = conv(key);
      const first = c.msgs.find((m) => !m.pending && !m.failed);
      if (c.done || c.loading || !first) return;
      c.loading = true;
      emit({ type: 'conv', key });
      try {
        const p = await api.page(key, first.at);
        const have = new Set(c.msgs.map((m) => m.id));
        c.msgs = [...p.msgs.filter((m) => !have.has(m.id)), ...c.msgs];
        c.done = p.done;
      } catch (e) {
        emit({ type: 'error', message: errText(e) });
      }
      c.loading = false;
      emit({ type: 'conv', key });
    },
    send(key, o) {
      const u = me();
      if (!u) return;
      const c = conv(key);
      const clientId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      const last = c.msgs.at(-1);
      const at = Math.max(Date.now(), (last?.at ?? 0) + 1);
      c.msgs.push({
        id: `local:${clientId}`,
        n: (last?.n ?? 0) + 1,
        userId: u.id,
        name: u.name,
        text: o.text,
        at,
        touchedAt: 0,
        card: o.card,
        reply: o.replyTo ? { id: o.replyTo.id, name: o.replyTo.name, text: chatSnippet(o.replyTo.text || 'une carte', 80) } : undefined,
        clientId,
        pending: true,
      });
      c.loaded = true;
      outbox.set(clientId, { key, text: o.text, card: o.card ? { cardId: o.card.cardId, rarity: o.card.rarity } : undefined, replyTo: o.replyTo && !o.replyTo.pending ? o.replyTo.id : undefined, mentions: o.mentions });
      emit({ type: 'conv', key });
      deliver(clientId);
    },
    retry(key, clientId) {
      const m = conv(key).msgs.find((x) => x.clientId === clientId);
      if (!m?.failed || !outbox.has(clientId)) return;
      Object.assign(m, { pending: true, failed: false });
      emit({ type: 'conv', key });
      deliver(clientId);
    },
    discard(key, clientId) {
      const c = conv(key);
      c.msgs = c.msgs.filter((x) => !(x.clientId === clientId && x.failed));
      outbox.delete(clientId);
      emit({ type: 'conv', key });
    },
    react(key, m, k) {
      const u = me();
      if (!u || m.pending || m.failed || m.deleted) return;
      // tout de suite à l'écran ; le serveur confirme par le fil suivi
      const rs = (m.reacts ?? []).map((r) => ({ k: r.k, by: [...r.by] }));
      const cur = rs.find((r) => r.k === k);
      if (cur?.by.includes(u.id)) cur.by = cur.by.filter((x) => x !== u.id);
      else if (cur) cur.by.push(u.id);
      else rs.push({ k, by: [u.id] });
      m.reacts = rs.filter((r) => r.by.length);
      emit({ type: 'conv', key });
      api.react(m.id, k).catch((e: unknown) => emit({ type: 'error', message: errText(e) }));
    },
    remove(key, m) {
      if (m.pending || m.failed) return;
      api.remove(m.id).then(
        () => {
          Object.assign(m, { deleted: true, text: '', card: undefined, reply: undefined, reacts: undefined });
          persist(key);
          emit({ type: 'conv', key });
        },
        (e: unknown) => emit({ type: 'error', message: errText(e) }),
      );
    },
    markRead(key) {
      const h = head(key);
      if (!h || h.n <= h.seenN || document.hidden) return;
      if ((marked.get(key) ?? 0) >= h.n) return;
      marked.set(key, h.n);
      const n = h.n;
      // la pastille s'éteint tout de suite ; le serveur suit
      h.seenN = n;
      if (key === CHAT_GENERAL) h.mention = false;
      emit({ type: 'inbox' });
      api.markRead(key, n).catch(() => marked.delete(key));
    },
    mute(key, on) {
      if (inbox) inbox.muted = on ? [...new Set([...inbox.muted, key])] : inbox.muted.filter((k) => k !== key);
      emit({ type: 'inbox' });
      api.mute(key, on).catch((e: unknown) => emit({ type: 'error', message: errText(e) }));
    },
    on(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    reset() {
      stopAll();
      convs.clear();
      outbox.clear();
      marked.clear();
      inbox = null;
      followed = null;
      if (me() && !paused) startInbox();
      emit({ type: 'inbox' });
    },
  };
  return store;
}
