import '../core/i18n/fr/game.chat'; // (textes de ce module, version anglaise)
import { locale, t as tr } from '../core/i18n';
import './chat.css';
import type { BigPull, GameBackend } from './backend';
import { CHAT_GENERAL, CHAT_MENTIONS_MAX, CHAT_REACTS, CHAT_TEXT_MAX, chatSnippet, cleanChatText, dmKey, dmPeer, type ChatMsg } from '../core/chat';
import { createChatStore, type ChatEvent } from './chatStore';
import { cardTile, esc, fold, h, popLayer, pushLayer, starsHtml, thumbUrl, toast } from './ui';
import { catalogEntry } from '../core/sets/themes';
import { rarity, type RarityId } from '../core/rarity';
import { realCardUrl } from './cardImages';
import { haptics } from '../core/haptics';

/**
 * CHAT (V2, 10/11) — toujours là, en bas à droite : un lanceur (onglet usiné sur ordinateur, touche carrée au
 * téléphone) et un panneau qui se déploie depuis ce coin. Même direction que l'espace Jeux (« usinage », casino.css) :
 * noir, filets au pixel, repères d'angle, étiquettes en capitales espacées, aucun émoji (les réactions sont des
 * tampons gravés : GG, +1, ♥, LOL, RIP, ?!), blanc plein = actif. Couleur = information (rareté d'une carte, d'un drop).
 *
 *  - Général (tout le monde) · Privés (à deux, avec n'importe quel joueur) · mentions @pseudo · réponses · réactions ·
 *    montrer une carte de sa collection · « Vu » en privé · sourdine. (v2.0.1 : plus de drops dans le fil général)
 *  - Ordinateur : panneau flottant 392 px, reste ouvert d'une page à l'autre. Téléphone : plein écran (le bouton
 *    « retour » le ferme), le champ de saisie suit le clavier.
 *  - Caché pendant une ouverture de booster, une carte en grand, les scènes 6★ : rien ne passe devant ces moments.
 *
 * État, cache local et économie de requêtes : chatStore.ts. Serveur : convex/chat.ts.
 */
export interface ChatWidget {
  /** ouvre le panneau (sur une conversation : « general » ou la clé d'un privé) */
  open(conv?: string): void;
  close(): void;
}

const RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}'"»])/g;
const GROUP_MS = 5 * 60 * 1000;
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hhmm = (t: number) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
function dayLabel(t: number): string {
  const today = dayKey(Date.now());
  if (dayKey(t) === today) return tr('chat.today');
  if (dayKey(t) === dayKey(Date.now() - 86400000)) return tr('chat.yesterday');
  const d = new Date(t);
  return `${d.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '')} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function ago(t: number): string {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return tr('time.justNow');
  if (m < 60) return `${m} min`;
  if (dayKey(t) === dayKey(Date.now())) return hhmm(t);
  if (m < 60 * 24 * 6) return dayLabel(t);
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const ICON = '<svg class="chat-ico" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M3.5 4.5h13v9h-7l-3.5 3v-3h-2.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="miter"/><path d="M6.5 8h7M6.5 10.5h4.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

export function createChat(backend: GameBackend, o: { sound?: (k: 'in' | 'out' | 'open') => void } = {}): ChatWidget | null {
  const api = backend.chat;
  if (!api) return null;
  const meOf = () => (backend.state.user ? { id: backend.state.user.id, name: backend.state.user.name } : null);
  const store = createChatStore(api, meOf);
  const phone = matchMedia('(max-width: 640px)');
  const touch = matchMedia('(hover: none)');

  let isOpen = false;
  let view: 'general' | 'dms' | 'dm' = 'general';
  let dmCur: string | null = null;
  let replyTo: ChatMsg | null = null;
  let attached: { cardId: string; rarity: string; mintNumber?: number } | null = null;
  /** message dont les actions sont dépliées (au doigt) */
  let selId: string | null = null;
  let newBelow = 0;
  let layered = false;
  const drafts = new Map<string, string>();
  const curKey = () => (view === 'general' ? CHAT_GENERAL : view === 'dm' ? dmCur : null);

  // ───────────────────────────── structure
  const root = h('div', 'chat');
  root.hidden = true;
  const launch = h('button', 'chat-launch');
  launch.type = 'button';
  launch.setAttribute('aria-controls', 'chat-panel');
  launch.setAttribute('aria-expanded', 'false');
  launch.innerHTML = `${ICON}<span class="chat-l-k">Chat</span><span class="chat-l-live" aria-live="polite"><span></span></span><b class="badge chat-n" hidden></b>`; // i18n-ok
  const liveEl = launch.querySelector<HTMLElement>('.chat-l-live > span')!;
  const badgeEl = launch.querySelector<HTMLElement>('.chat-n')!;

  const panel = h('section', 'chat-panel');
  panel.id = 'chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat'); // i18n-ok
  panel.inert = true;
  panel.innerHTML = `
    <header class="chat-head">
      <div class="chat-kick"></div>
      <div class="chat-title"><button class="chat-back" type="button" aria-label="${tr('chat.backDms')}" data-t-aria="chat.backDms" hidden>←</button><b></b></div>
      <div class="chat-sub"></div>
      <div class="chat-tools"><button class="chat-mute" type="button" aria-pressed="false"></button><button class="chat-x" type="button" aria-label="${tr('chat.close')}" data-t-aria="chat.close">✕</button></div>
      <div class="seg chat-tabs" data-seg-key="chat-tabs" role="tablist"><button type="button" data-tab="general" role="tab" data-t="chat.general">${tr('chat.general')}<b class="badge" hidden></b></button><button type="button" data-tab="dms" role="tab" data-t="chat.dms">${tr('chat.dms')}<b class="badge" hidden></b></button></div>
    </header>
    <div class="chat-body">
      <div class="chat-thread" role="log" aria-label="Messages" tabindex="-1"></div> <!-- i18n-ok -->
      <div class="chat-list" hidden></div>
      <button class="chat-jump" type="button" hidden></button>
      <div class="chat-picker" hidden></div>
      <div class="chat-zoom" hidden></div>
    </div>
    <footer class="chat-compose">
      <div class="chat-ac" role="listbox" hidden></div>
      <div class="chat-ctx" hidden></div>
      <div class="chat-row">
        <button class="chat-add" type="button" title="${tr('chat.showCardTitle')}" data-t-title="chat.showCardTitle" aria-label="${tr('chat.showCard')}" data-t-aria="chat.showCard">+</button>
        <textarea class="chat-in" rows="1" maxlength="${CHAT_TEXT_MAX}" enterkeyhint="send" autocomplete="off" aria-label="Message"></textarea> <!-- i18n-ok -->
        <span class="chat-cnt" hidden></span>
        <button class="chat-send" type="button" aria-label="${tr('chat.send')}" data-t-aria="chat.send" disabled><i>→</i></button>
      </div>
    </footer>`;
  root.append(launch, panel);
  document.body.append(root);
  document.body.classList.add('chat-on');

  const q = <T extends HTMLElement = HTMLElement>(s: string) => panel.querySelector<T>(s)!;
  const kickEl = q('.chat-kick');
  const titleEl = q('.chat-title > b');
  const backBtn = q<HTMLButtonElement>('.chat-back');
  const subEl = q('.chat-sub');
  const muteBtn = q<HTMLButtonElement>('.chat-mute');
  const tabsEl = q('.chat-tabs');
  const thread = q('.chat-thread');
  const listEl = q('.chat-list');
  const jumpBtn = q<HTMLButtonElement>('.chat-jump');
  const picker = q('.chat-picker');
  const zoom = q('.chat-zoom');
  const compose = q('.chat-compose');
  const acEl = q('.chat-ac');
  const ctxEl = q('.chat-ctx');
  const input = q<HTMLTextAreaElement>('.chat-in');
  const cntEl = q('.chat-cnt');
  const sendBtn = q<HTMLButtonElement>('.chat-send');

  // ───────────────────────────── joueurs (présence, avatars : déjà dans le jeu, aucune requête de plus)
  interface P {
    id: string;
    name: string;
    avatarUrl?: string;
    online: boolean;
  }
  let playersMemo: { src: unknown; me: unknown; map: Map<string, P> } | null = null;
  function players(): Map<string, P> {
    const s = backend.state;
    if (playersMemo && playersMemo.src === s.friends && playersMemo.me === s.user) return playersMemo.map;
    const map = new Map<string, P>();
    for (const f of s.friends) map.set(f.id, { id: f.id, name: f.name, avatarUrl: f.avatarUrl, online: f.online });
    if (s.user) map.set(s.user.id, { id: s.user.id, name: s.user.name, avatarUrl: s.user.avatarUrl, online: true });
    playersMemo = { src: s.friends, me: s.user, map };
    atMemo = null;
    return map;
  }
  const nameOf = (id: string | undefined, fallback = tr('chat.player')) => (id && players().get(id)?.name) || fallback;
  const onlineCount = () => [...players().values()].filter((p) => p.online).length;
  function ava(id: string, name: string, dot = false): string {
    const p = players().get(id);
    const on = dot && p?.online ? '<i class="chat-on-dot" title="' + tr('chat.onlineW') + '"></i>' : ''; // i18n-ok
    return p?.avatarUrl
      ? `<span class="cm-ava"><img src="${esc(p.avatarUrl)}" alt="" loading="lazy" decoding="async">${on}</span>`
      : `<span class="cm-ava">${esc((name.trim()[0] ?? '?').toUpperCase())}${on}</span>`;
  }

  // ───────────────────────────── texte : liens, mentions
  let atMemo: { re: RegExp | null } | null = null;
  function atRe(): RegExp | null {
    if (atMemo) return atMemo.re;
    const names = [...players().values()].map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
    atMemo = { re: names.length ? new RegExp(`@(${names.map((n) => escRe(esc(n))).join('|')})(?![\\p{L}\\p{N}_])`, 'giu') : null };
    return atMemo.re;
  }
  function fmt(text: string): { html: string; atMe: boolean } {
    const re = atRe();
    // (le texte est déjà échappé : on compare avec mon pseudo échappé lui aussi)
    const mine = backend.state.user ? fold(esc(backend.state.user.name)) : null;
    let atMe = false;
    const html = esc(text)
      .split(URL_RE)
      .map((part, i) => {
        if (i % 2) return `<a href="${part}" target="_blank" rel="noopener noreferrer nofollow">${part}</a>`;
        if (!re) return part;
        return part.replace(re, (m0, n: string) => {
          const me = fold(n) === mine;
          atMe ||= me;
          return `<b class="cm-at${me ? ' me' : ''}">${m0}</b>`;
        });
      })
      .join('');
    return { html, atMe };
  }
  /** joueurs cités dans le texte (@Pseudo en entier) */
  function mentionsIn(text: string): string[] {
    const meId = backend.state.user?.id;
    const out: string[] = [];
    const low = text.toLocaleLowerCase(locale());
    for (const p of [...players().values()].sort((a, b) => b.name.length - a.name.length)) {
      if (p.id === meId || !p.name) continue;
      const i = low.indexOf(`@${p.name.toLocaleLowerCase(locale())}`);
      if (i < 0) continue;
      const next = text[i + 1 + p.name.length];
      if (next && /[\p{L}\p{N}_]/u.test(next)) continue;
      out.push(p.id);
      if (out.length >= CHAT_MENTIONS_MAX) break;
    }
    return out;
  }

  // ───────────────────────────── lanceur
  let tickTimer = 0;
  let tickKey: string | null = null;
  function renderLaunch() {
    const u = store.unreadTotal();
    const txt = u.n > 99 ? '99+' : String(u.n);
    const show = u.n > 0 && !isOpen;
    if (badgeEl.textContent !== txt) badgeEl.textContent = txt;
    if (badgeEl.hidden === show) badgeEl.hidden = !show;
    launch.classList.toggle('has-unread', u.n > 0);
    launch.classList.toggle('at', u.mention);
    launch.setAttribute('aria-label', u.n ? tr('chat.unread', { n: u.n }) : tr('chat.open'));
    if (!tickKey) {
      const n = onlineCount();
      const t = tr('chat.nOnline', { n: String(n).padStart(2, '0') });
      if (liveEl.textContent !== t) liveEl.textContent = t;
    }
  }
  /** aperçu d'un message arrivé panneau fermé : 6 s dans le lanceur, un toucher ouvre la bonne conversation */
  function tick(e: Extract<ChatEvent, { type: 'incoming' }>) {
    clearTimeout(tickTimer);
    tickKey = e.key;
    const who = e.key === CHAT_GENERAL ? e.name : tr('chat.privateOf', { name: e.name });
    liveEl.innerHTML = `<b>${esc(who)}</b> ${esc(chatSnippet(e.text || '…', 60))}`;
    launch.classList.remove('tick');
    void launch.offsetWidth;
    launch.classList.add('tick');
    tickTimer = window.setTimeout(() => {
      tickKey = null;
      launch.classList.remove('tick');
      liveEl.textContent = '';
      renderLaunch();
    }, 6000);
  }

  // ───────────────────────────── en-tête du panneau
  function renderHead() {
    const key = curKey();
    const inbox = store.inbox;
    const peerId = view === 'dm' && dmCur ? dmPeer(dmCur, backend.state.user?.id ?? '') : null;
    const peer = peerId ? players().get(peerId) : null;
    kickEl.innerHTML = view === 'general' ? 'Chat <i>/</i> ' + tr('chat.kGeneral') + '' : 'Chat <i>/</i> ' + tr('chat.kDms') + ''; // i18n-ok (« Chat » pareil en anglais)
    titleEl.textContent = view === 'general' ? tr('chat.general') : view === 'dms' ? tr('chat.dms') : (peer?.name ?? nameOf(peerId ?? undefined));
    backBtn.hidden = view !== 'dm';
    const n = onlineCount();
    subEl.textContent = view === 'general' ? tr('chat.onlineCount', { on: String(n).padStart(2, '0'), n: players().size }) : view === 'dms' ? tr('chat.dmSub') : peer?.online ? tr('chat.dmOn') : tr('chat.dmOff');
    subEl.classList.toggle('live', view === 'dm' && !!peer?.online);
    const muted = !!key && !!inbox?.muted.includes(key);
    muteBtn.hidden = !key;
    muteBtn.textContent = muted ? tr('chat.mutedBtn') : tr('chat.notifsBtn');
    muteBtn.classList.toggle('on', !muted);
    muteBtn.setAttribute('aria-pressed', String(!muted));
    muteBtn.title = muted ? tr('chat.muted') : tr('chat.unmuted');
    tabsEl.querySelectorAll<HTMLElement>('button').forEach((b) => {
      const on = b.dataset.tab === (view === 'general' ? 'general' : 'dms');
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      const bd = b.querySelector<HTMLElement>('.badge')!;
      let c = 0;
      if (inbox) {
        if (b.dataset.tab === 'general') c = inbox.muted.includes(CHAT_GENERAL) || view === 'general' ? 0 : Math.max(0, inbox.general.n - inbox.general.seenN);
        else for (const d of inbox.dms) if (!inbox.muted.includes(d.key) && d.key !== key) c += Math.max(0, d.n - d.seenN);
      }
      const t = c > 99 ? '99+' : String(c);
      if (bd.textContent !== t) bd.textContent = t;
      if (bd.hidden === c > 0) bd.hidden = !(c > 0);
    });
    input.placeholder = view === 'general' ? tr('chat.phAll') : peer ? tr('chat.phOne', { name: peer.name }) : 'Message…';
    compose.hidden = view === 'dms';
  }

  // ───────────────────────────── liste des privés
  function renderList() {
    const inbox = store.inbox;
    const meId = backend.state.user?.id ?? '';
    const withDm = new Set<string>();
    let html = '';
    const rows = inbox?.dms ?? [];
    if (rows.length) html += '<div class="cl-k">Conversations</div>'; // i18n-ok
    for (const d of rows) {
      const pid = d.peerId ?? dmPeer(d.key, meId) ?? '';
      withDm.add(pid);
      const name = nameOf(pid, d.lastUserId !== meId ? (d.lastName ?? tr('chat.player')) : tr('chat.player'));
      const un = inbox!.muted.includes(d.key) ? 0 : Math.max(0, d.n - d.seenN);
      const last = d.lastText === '' ? tr('chat.deleted') : (d.lastText ?? '');
      html += `<button type="button" class="cl-row${un ? ' unread' : ''}" data-key="${esc(d.key)}">${ava(pid, name, true)}<span class="cl-m"><b>${esc(name)}</b><em>${d.lastUserId === meId ? '<i>' + tr('chat.you') + '</i> ' : ''}${esc(last)}</em></span><span class="cl-r"><time>${esc(ago(d.lastAt))}</time>${un ? `<b class="badge">${un > 99 ? '99+' : un}</b>` : inbox!.muted.includes(d.key) ? '<small>sourdine</small>' : ''}</span></button>`;
    }
    const others = [...players().values()].filter((p) => p.id !== meId && !withDm.has(p.id)).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, locale()));
    if (others.length) html += `<div class="cl-k">${rows.length ? tr('chat.others') : tr('chat.writeTo')}</div>`;
    for (const p of others)
      html += `<button type="button" class="cl-row new" data-peer="${esc(p.id)}">${ava(p.id, p.name, true)}<span class="cl-m"><b>${esc(p.name)}</b><em>${p.online ? tr('chat.onlineW') : 'hors ligne'}</em></span><span class="cl-r"><i class="cl-go">→</i></span></button>`;
    if (!html) html = '<div class="chat-empty"><b>' + tr('chat.nobody') + '</b><span>' + tr('chat.nobodyD') + '</span></div>';
    listEl.innerHTML = html;
  }

  // ───────────────────────────── fil
  interface Row {
    key: string;
    sig: string;
    make: () => HTMLElement;
  }
  const rowEls = new Map<string, HTMLElement>();
  const atBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 72;
  const toBottom = () => {
    thread.scrollTop = thread.scrollHeight;
    newBelow = 0;
    syncJump();
  };
  function syncJump() {
    const show = !atBottom();
    jumpBtn.hidden = !show;
    jumpBtn.innerHTML = newBelow ? `<i>↓</i> ${tr('chat.newBelow', { n: newBelow })}` : '<i>↓</i>';
    jumpBtn.classList.toggle('new', newBelow > 0);
  }

  function msgEl(m: ChatMsg, f: { cont: boolean; mine: boolean; seen: boolean; sel: boolean; staff: boolean }): HTMLElement {
    const el = h('div', `cm${f.mine ? ' mine' : ''}${f.cont ? ' cont' : ''}${m.pending ? ' pending' : ''}${m.failed ? ' failed' : ''}${m.deleted ? ' deleted' : ''}${f.sel ? ' sel' : ''}`);
    el.dataset.id = m.id;
    const name = nameOf(m.userId, m.name);
    const t = m.deleted ? { html: '', atMe: false } : fmt(m.text);
    if (t.atMe && !f.mine) el.classList.add('at-me');
    const meId = backend.state.user?.id ?? '';
    const head = f.cont ? '' : `<div class="cm-h"><b>${esc(f.mine ? tr('chat.me') : name)}</b><time datetime="${new Date(m.at).toISOString()}">${hhmm(m.at)}</time></div>`;
    const reply = m.reply ? `<div class="cm-reply"><b>${esc(m.reply.name)}</b> ${esc(m.reply.text)}</div>` : '';
    const body = m.deleted ? '<div class="cm-t gone">' + tr('chat.deleted') + '</div>' : m.text ? `<div class="cm-t">${t.html}</div>` : '';
    const rs = (m.reacts ?? []).filter((r) => r.by.length);
    const reacts = rs.length
      ? `<div class="cm-rs">${rs.map((r) => `<button type="button" class="cm-r${r.by.includes(meId) ? ' me' : ''}" data-k="${esc(r.k)}" title="${esc(r.by.map((u) => nameOf(u)).join(', '))}">${esc(r.k)}<i>${r.by.length}</i></button>`).join('')}</div>`
      : '';
    const state = m.failed
      ? `<div class="cm-st err">${tr('chat.notSent')} <button type="button" class="cm-retry" data-a="retry">${tr('chat.retry')}</button><button type="button" class="cm-retry" data-a="discard">${tr('chat.remove')}</button></div>`
      : m.pending
        ? '<div class="cm-st">envoi…</div>'
        : f.seen
          ? '<div class="cm-st">vu</div>'
          : '';
    const canAct = !m.deleted && !m.pending && !m.failed;
    const acts = canAct
      ? `<div class="cm-acts" role="group" aria-label="${tr('chat.reactTitle')}">${CHAT_REACTS.map((k) => `<button type="button" data-a="react" data-k="${esc(k)}">${esc(k)}</button>`).join('')}<button type="button" data-a="reply" title="${tr('chat.reply')}">↩</button>${f.mine || f.staff ? `<button type="button" data-a="del" title="${tr('chat.delete')}">✕</button>` : ''}</div>`
      : '';
    el.innerHTML = `${f.mine || f.cont ? '' : ava(m.userId, name)}<div class="cm-main">${head}${reply}${body}<div class="cm-card"></div>${reacts}${state}</div>${acts}`;
    const cardHost = el.querySelector<HTMLElement>('.cm-card')!;
    if (m.card && !m.deleted && catalogEntry(m.card.cardId)) {
      const tile = cardTile(m.card.cardId, m.card.rarity as RarityId, { mini: true });
      tile.dataset.zoom = `${m.card.cardId}|${m.card.rarity}|${m.card.mintNumber ?? ''}|${f.mine ? tr('chat.me') : name}`;
      cardHost.append(tile);
    } else cardHost.remove();
    return el;
  }
  function dropEl(p: BigPull): HTMLElement {
    const rr = rarity(p.rarity);
    const el = h('button', `cdrop r-${p.rarity}`);
    (el as HTMLButtonElement).type = 'button';
    el.style.setProperty('--rc', rr.hex);
    el.dataset.zoom = `${p.cardId}|${p.rarity}|${p.mintNumber ?? ''}|${p.mine ? tr('chat.me') : p.userName}`;
    el.innerHTML = `<span class="cdrop-k">Drop</span><span class="cdrop-m"><b>${esc(p.mine ? tr('chat.me') : p.userName)}</b>${starsHtml(p.rarity)}<em>${esc(p.cardName)}</em></span><time>${hhmm(p.createdAt)}</time>`; // i18n-ok
    return el;
  }

  function renderThread(reason: 'conv' | 'switch' | 'older' = 'conv') {
    const key = curKey();
    if (!key) return;
    const c = store.conv(key);
    const meId = backend.state.user?.id ?? '';
    const staff = !!(store.inbox?.staff || backend.state.user?.staff);
    const head = store.head(key);
    const stick = reason === 'switch' || atBottom();
    const prevH = thread.scrollHeight;
    const prevTop = thread.scrollTop;

    type Item = { at: number; m?: ChatMsg; p?: BigPull };
    const items: Item[] = c.msgs.map((m) => ({ at: m.at, m }));
    // (v2.0.1) plus de drops 6★ / secrètes dans le chat général : ils restent dans « Gros tirages ». dropEl ne sert plus.
    // « vu » : sous mon dernier message, en privé, si l'autre a lu jusque-là
    let seenId = '';
    if (view === 'dm' && head?.peerSeenN) {
      const lastMine = [...c.msgs].reverse().find((m) => m.userId === meId && !m.pending && !m.failed);
      const lastAny = c.msgs.at(-1);
      if (lastMine && lastMine === lastAny && head.peerSeenN >= lastMine.n) seenId = lastMine.id;
    }

    const rows: Row[] = [];
    if (c.loaded && !c.done && c.msgs.length) rows.push({ key: 'older', sig: c.loading ? 'l' : 'i', make: () => h('button', 'chat-older', c.loading ? tr('chat.loading') : tr('chat.older')) });
    if (c.loaded && c.done && c.msgs.length)
      rows.push({ key: 'start', sig: view, make: () => h('div', 'chat-start', view === 'general' ? tr('chat.startGeneral') : tr('chat.startConv')) });
    let prev: Item | null = null;
    for (const it of items) {
      if (!prev || dayKey(prev.at) !== dayKey(it.at)) {
        const label = dayLabel(it.at);
        rows.push({ key: `day:${dayKey(it.at)}`, sig: label, make: () => h('div', 'cd', `<span>${esc(label)}</span>`) });
        prev = null;
      }
      if (it.p) {
        const p = it.p;
        rows.push({ key: `drop:${p.id}`, sig: p.userName, make: () => dropEl(p) });
      } else {
        const m = it.m!;
        const mine = m.userId === meId;
        const cont = !!prev?.m && prev.m.userId === m.userId && m.at - prev.m.at < GROUP_MS && !m.reply && !prev.m.deleted === !m.deleted;
        const seen = m.id === seenId;
        const sel = selId === m.id;
        const author = players().get(m.userId);
        rows.push({
          key: `m:${m.clientId ?? m.id}`,
          sig: [m.id, m.touchedAt, m.pending ? 1 : 0, m.failed ? 1 : 0, cont ? 1 : 0, seen ? 1 : 0, sel ? 1 : 0, staff ? 1 : 0, author?.name ?? '', author?.avatarUrl ?? '', (m.reacts ?? []).map((r) => `${r.k}${r.by.length}${r.by.includes(meId) ? '*' : ''}`).join(''), m.deleted ? 1 : 0].join('|'),
          make: () => msgEl(m, { cont, mine, seen, sel, staff }),
        });
      }
      prev = it;
    }
    if (!c.loaded) rows.push({ key: 'wait', sig: c.error ?? 'w', make: () => h('div', 'chat-empty', c.error ? `<b>Chat indisponible</b><span>${esc(c.error)}</span>` : '<span class="chat-wait">' + tr('chat.loading') + '</span>') });
    else if (!items.length)
      rows.push({
        key: 'empty',
        sig: view,
        make: () => h('div', 'chat-empty', view === 'general' ? '<b>' + tr('chat.quiet') + '</b><span>' + tr('chat.quietD') + '</span>' : '<b>' + tr('chat.newConv') + '</b><span>' + tr('chat.newConvD') + '</span>'),
      });

    // réconciliation : on ne refait que les lignes qui ont changé (les cartes déjà peintes ne clignotent pas)
    let cursor = thread.firstElementChild;
    const live = new Set<string>();
    for (const r of rows) {
      live.add(r.key);
      let el = rowEls.get(r.key);
      if (el && el.dataset.sig !== r.sig) {
        if (el === cursor) cursor = el.nextElementSibling;
        el.remove();
        el = undefined;
      }
      if (!el) {
        el = r.make();
        el.dataset.key = r.key;
        el.dataset.sig = r.sig;
        rowEls.set(r.key, el);
      }
      if (el === cursor) cursor = cursor.nextElementSibling;
      else thread.insertBefore(el, cursor);
    }
    for (const [k, el] of rowEls)
      if (!live.has(k)) {
        el.remove();
        rowEls.delete(k);
      }

    if (reason === 'older') thread.scrollTop = prevTop + (thread.scrollHeight - prevH);
    else if (stick) toBottom();
    syncJump();
    if (stick) store.markRead(key);
  }

  // ───────────────────────────── saisie
  function grow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 116)}px`;
  }
  function syncSend() {
    const len = input.value.trim().length;
    sendBtn.disabled = !len && !attached;
    const near = input.value.length > CHAT_TEXT_MAX - 100;
    cntEl.hidden = !near;
    if (near) cntEl.textContent = String(CHAT_TEXT_MAX - input.value.length);
  }
  function renderCtx() {
    let html = '';
    if (replyTo) html += `<div class="chat-chip"><span class="k">${tr('chat.replyTo')}</span><span class="t"><b>${esc(nameOf(replyTo.userId, replyTo.name))}</b> ${esc(chatSnippet(replyTo.text || tr('chat.aCard'), 70))}</span><button type="button" data-x="reply" aria-label="${tr('chat.cancelReply')}">✕</button></div>`;
    if (attached) {
      const e = catalogEntry(attached.cardId);
      const rr = rarity(attached.rarity as RarityId);
      html += `<div class="chat-chip card" style="--rc:${rr.hex}">${e ? `<img src="${esc(thumbUrl(e))}" alt="">` : ''}<span class="k">${tr('chat.card')}</span><span class="t"><b>${esc(e?.name ?? attached.cardId)}</b> ${starsHtml(attached.rarity as RarityId)}</span><button type="button" data-x="card" aria-label="${tr('chat.removeCard')}">✕</button></div>`;
    }
    ctxEl.innerHTML = html;
    ctxEl.hidden = !html;
    syncSend();
  }
  function send() {
    const key = curKey();
    if (!key || !backend.state.user) return;
    const text = cleanChatText(input.value);
    if (!text && !attached) return;
    store.send(key, { text, card: attached ?? undefined, replyTo: replyTo ?? undefined, mentions: key === CHAT_GENERAL ? mentionsIn(text) : undefined });
    input.value = '';
    drafts.delete(key);
    replyTo = null;
    attached = null;
    selId = null;
    closeAc();
    renderCtx();
    grow();
    o.sound?.('out');
    haptics.pulse(8);
    requestAnimationFrame(toBottom);
  }

  // mentions : @ + début du pseudo → liste au-dessus du champ
  let acItems: P[] = [];
  let acIdx = 0;
  let acFrom = -1;
  function closeAc() {
    acItems = [];
    acFrom = -1;
    acEl.hidden = true;
  }
  function syncAc() {
    if (view !== 'general') return closeAc();
    const pos = input.selectionStart ?? input.value.length;
    const m = /(^|\s)@([^\s@]{0,24})$/u.exec(input.value.slice(0, pos));
    if (!m) return closeAc();
    const qy = fold(m[2]);
    const meId = backend.state.user?.id;
    acItems = [...players().values()]
      .filter((p) => p.id !== meId && fold(p.name).includes(qy))
      .sort((a, b) => Number(fold(b.name).startsWith(qy)) - Number(fold(a.name).startsWith(qy)) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, locale()))
      .slice(0, 5);
    if (!acItems.length) return closeAc();
    acFrom = pos - m[2].length - 1;
    acIdx = Math.min(acIdx, acItems.length - 1);
    acEl.innerHTML = acItems.map((p, i) => `<button type="button" role="option" aria-selected="${i === acIdx}" class="${i === acIdx ? 'on' : ''}" data-i="${i}">${ava(p.id, p.name, true)}<b>${esc(p.name)}</b></button>`).join('');
    acEl.hidden = false;
  }
  function pickAc(i: number) {
    const p = acItems[i];
    if (!p || acFrom < 0) return;
    const pos = input.selectionStart ?? input.value.length;
    const before = input.value.slice(0, acFrom);
    const ins = `@${p.name} `;
    input.value = before + ins + input.value.slice(pos);
    const at = before.length + ins.length;
    input.setSelectionRange(at, at);
    closeAc();
    grow();
    syncSend();
    input.focus();
  }

  // ───────────────────────────── montrer une carte
  let pickQ = '';
  function openPicker() {
    pickQ = '';
    picker.innerHTML = `<div class="cp-h"><b>${tr('chat.showCard')}</b><button type="button" class="cp-x" aria-label="${tr('chat.closeX')}">✕</button></div><input type="search" class="cp-q" placeholder="${tr('chat.searchColl')}" aria-label="${tr('chat.searchCard')}"><div class="cp-grid"></div>`;
    picker.hidden = false;
    drawPicker();
    if (!touch.matches) picker.querySelector<HTMLInputElement>('.cp-q')!.focus();
  }
  function closePicker() {
    picker.hidden = true;
    picker.innerHTML = '';
  }
  function drawPicker() {
    const grid = picker.querySelector<HTMLElement>('.cp-grid');
    if (!grid) return;
    const qy = fold(pickQ.trim());
    const rows = backend.state.collection
      .filter((c) => c.count > 0)
      .map((c) => ({ c, e: catalogEntry(c.cardId) }))
      .filter((x) => x.e && (!qy || fold(x.e.name).includes(qy)))
      .sort((a, b) => (RANK[b.c.rarity] ?? 0) - (RANK[a.c.rarity] ?? 0) || (b.c.firstPulledAt ?? 0) - (a.c.firstPulledAt ?? 0))
      .slice(0, 48);
    grid.replaceChildren(
      ...(rows.length
        ? rows.map(({ c }) => {
            const t = cardTile(c.cardId, c.rarity, { mini: true });
            t.dataset.pick = `${c.cardId}|${c.rarity}|${c.bestMintNumber}`;
            // (v2.0.6) cellule à hauteur garantie : les tuiles s'empilaient les unes sur les autres (on n'en voyait qu'une bande)
            const cell = h('div', 'cp-cell');
            cell.append(t);
            return cell;
          })
        : [h('div', 'chat-empty', qy ? '<span>' + tr('chat.noCard') + '</span>' : '<b>' + tr('chat.emptyColl') + '</b><span>' + tr('chat.openFirst') + '</span>')]),
    );
  }
  function openZoom(spec: string) {
    const [cardId, r, mint, owner] = spec.split('|');
    const e = catalogEntry(cardId);
    if (!e) return;
    const rr = rarity(r as RarityId);
    zoom.style.setProperty('--rc', rr.hex);
    zoom.innerHTML = `<button type="button" class="cz-x" aria-label="${tr('chat.closeX')}">✕</button><div class="cz-card"><img alt="${esc(e.name)}" src="${esc(thumbUrl(e))}"></div><div class="cz-i"><b>${esc(e.name)}</b><span>${starsHtml(r as RarityId)}${mint ? ` · n°${esc(mint)}` : ''}</span><em>${owner ? tr('chat.cardOf', { name: esc(owner) }) : ''}</em></div>`;
    zoom.hidden = false;
    // la vraie carte (même gabarit que la 3D) dès qu'elle est peinte ; en attendant, l'illustration
    void realCardUrl(cardId, r).then((url) => {
      const img = zoom.querySelector<HTMLImageElement>('.cz-card img');
      if (url && img && !zoom.hidden) {
        img.src = url;
        img.classList.add('real');
      }
    });
  }
  const closeZoom = () => {
    zoom.hidden = true;
    zoom.innerHTML = '';
  };

  // ───────────────────────────── navigation dans le panneau
  function show(next: 'general' | 'dms' | 'dm', key?: string) {
    const was = curKey();
    if (was) drafts.set(was, input.value);
    view = next;
    if (next === 'dm') dmCur = key ?? dmCur;
    selId = null;
    replyTo = null;
    attached = null;
    newBelow = 0;
    closeAc();
    closePicker();
    closeZoom();
    const cur = curKey();
    thread.hidden = !cur;
    listEl.hidden = !!cur;
    // un autre fil : les lignes de l'ancien s'en vont
    for (const el of rowEls.values()) el.remove();
    rowEls.clear();
    input.value = cur ? (drafts.get(cur) ?? '') : '';
    renderCtx();
    grow();
    renderHead();
    if (isOpen) store.follow(cur);
    if (cur) renderThread('switch');
    else {
      renderList();
      jumpBtn.hidden = true;
    }
    try {
      sessionStorage.setItem('bebou.chat.view', JSON.stringify({ view, dm: dmCur }));
    } catch {
      /* ignore */
    }
  }

  // ───────────────────────────── ouverture / fermeture
  /** téléphone : le panneau suit la hauteur réellement visible (clavier ouvert) */
  function syncViewport() {
    const vv = window.visualViewport;
    if (!isOpen || !phone.matches || !vv) {
      panel.style.removeProperty('height');
      panel.style.removeProperty('top');
      return;
    }
    panel.style.height = `${Math.round(vv.height)}px`;
    panel.style.top = `${Math.round(vv.offsetTop)}px`;
    if (document.activeElement === input) requestAnimationFrame(() => atBottom() || (newBelow === 0 && toBottom()));
  }
  window.visualViewport?.addEventListener('resize', syncViewport);
  window.visualViewport?.addEventListener('scroll', syncViewport);

  function open(conv?: string) {
    if (!backend.state.user) return;
    // (fluidité, lot 5) le chat affiche qui est en ligne : liste du club suivie en direct tant qu'il est ouvert
    backend.watchMembers?.(true, 'chat');
    if (conv) {
      if (conv === CHAT_GENERAL) view = 'general';
      else if (dmPeer(conv, backend.state.user.id)) {
        view = 'dm';
        dmCur = conv;
      }
    }
    const first = !isOpen;
    isOpen = true;
    root.classList.add('open');
    panel.inert = false;
    launch.setAttribute('aria-expanded', 'true');
    clearTimeout(tickTimer);
    tickKey = null;
    launch.classList.remove('tick');
    if (phone.matches && !layered) {
      layered = true;
      document.body.classList.add('chat-full');
      pushLayer(close);
    }
    show(view, dmCur ?? undefined);
    syncViewport();
    renderLaunch();
    if (first) {
      o.sound?.('open');
      try {
        sessionStorage.setItem('bebou.chat.open', '1');
      } catch {
        /* ignore */
      }
    }
    // au doigt, pas de focus d'office : le clavier ne doit pas surgir à l'ouverture
    if (!touch.matches) requestAnimationFrame(() => (curKey() ? input : listEl.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true }));
  }
  function close() {
    if (!isOpen) return;
    backend.watchMembers?.(false, 'chat');
    const key = curKey();
    if (key) drafts.set(key, input.value);
    isOpen = false;
    root.classList.remove('open');
    panel.inert = true;
    launch.setAttribute('aria-expanded', 'false');
    store.follow(null);
    closePicker();
    closeZoom();
    if (layered) {
      layered = false;
      document.body.classList.remove('chat-full');
      popLayer(close);
    }
    syncViewport();
    renderLaunch();
    try {
      sessionStorage.removeItem('bebou.chat.open');
    } catch {
      /* ignore */
    }
    if (panel.contains(document.activeElement)) launch.focus({ preventScroll: true });
  }

  // ───────────────────────────── gestes
  launch.addEventListener('click', () => {
    haptics.pulse(6);
    open(tickKey ?? undefined);
  });
  q('.chat-x').addEventListener('click', close);
  backBtn.addEventListener('click', () => show('dms'));
  tabsEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!b) return;
    if (b.dataset.tab === 'general') show('general');
    else if (view === 'general') show('dms');
    else if (view === 'dm') show('dms');
  });
  muteBtn.addEventListener('click', () => {
    const key = curKey();
    if (!key) return;
    const muted = !!store.inbox?.muted.includes(key);
    store.mute(key, !muted);
    toast(!muted ? tr('chat.mutedToast') : tr('chat.unmutedToast'), 'info');
  });
  listEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.cl-row');
    const meId = backend.state.user?.id;
    if (!b || !meId) return;
    show('dm', b.dataset.key ?? dmKey(meId, b.dataset.peer!));
    if (!touch.matches) input.focus({ preventScroll: true });
  });
  thread.addEventListener('scroll', () => {
    const bottom = atBottom();
    if (bottom) {
      newBelow = 0;
      const key = curKey();
      if (key) store.markRead(key);
    }
    syncJump();
  }, { passive: true });
  jumpBtn.addEventListener('click', () => {
    toBottom();
    const key = curKey();
    if (key) store.markRead(key);
  });
  thread.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const key = curKey();
    if (!key || t.closest('a')) return;
    if (t.closest('.chat-older')) return void store.older(key).then(() => renderThread('older'));
    const z = t.closest<HTMLElement>('[data-zoom]');
    if (z) return openZoom(z.dataset.zoom!);
    const row = t.closest<HTMLElement>('.cm');
    if (!row) return;
    const m = store.conv(key).msgs.find((x) => x.id === row.dataset.id);
    if (!m) return;
    const r = t.closest<HTMLElement>('.cm-r');
    if (r) {
      haptics.pulse(6);
      return store.react(key, m, r.dataset.k!);
    }
    const a = t.closest<HTMLElement>('[data-a]');
    if (a) {
      const act = a.dataset.a;
      if (act === 'react') {
        haptics.pulse(6);
        selId = null;
        store.react(key, m, a.dataset.k!);
      } else if (act === 'reply') {
        replyTo = m;
        selId = null;
        renderCtx();
        renderThread();
        input.focus({ preventScroll: true });
      } else if (act === 'del') {
        // deux touchers : le premier arme le bouton (pas de fenêtre de confirmation)
        if (!a.classList.contains('armed')) {
          a.classList.add('armed');
          a.textContent = tr('chat.deleteQ');
          setTimeout(() => a.isConnected && (a.classList.remove('armed'), (a.textContent = '✕')), 2600);
          return;
        }
        selId = null;
        store.remove(key, m);
      } else if (act === 'retry' && m.clientId) store.retry(key, m.clientId);
      else if (act === 'discard' && m.clientId) store.discard(key, m.clientId);
      return;
    }
    // au doigt : un toucher sur le message déplie ses actions (à la souris, elles apparaissent au survol)
    if (touch.matches && !m.pending && !m.failed && !m.deleted) {
      selId = selId === m.id ? null : m.id;
      renderThread();
    }
  });
  input.addEventListener('input', () => {
    grow();
    syncSend();
    syncAc();
  });
  input.addEventListener('keydown', (e) => {
    if (!acEl.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        acIdx = (acIdx + (e.key === 'ArrowDown' ? 1 : acItems.length - 1)) % acItems.length;
        return syncAc();
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        return pickAc(acIdx);
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        return closeAc();
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  acEl.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (!b) return;
    e.preventDefault(); // le champ garde le focus
    pickAc(Number(b.dataset.i));
  });
  sendBtn.addEventListener('click', () => {
    send();
    if (!touch.matches) input.focus({ preventScroll: true });
  });
  ctxEl.addEventListener('click', (e) => {
    const x = (e.target as HTMLElement).closest<HTMLElement>('[data-x]');
    if (!x) return;
    if (x.dataset.x === 'reply') replyTo = null;
    else attached = null;
    renderCtx();
  });
  q('.chat-add').addEventListener('click', () => (picker.hidden ? openPicker() : closePicker()));
  picker.addEventListener('input', (e) => {
    if (!(e.target as HTMLElement).matches('.cp-q')) return;
    pickQ = (e.target as HTMLInputElement).value;
    drawPicker();
  });
  picker.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.cp-x')) return closePicker();
    const tile = t.closest<HTMLElement>('[data-pick]');
    if (!tile) return;
    const [cardId, r, mint] = tile.dataset.pick!.split('|');
    attached = { cardId, rarity: r, mintNumber: Number(mint) || undefined };
    closePicker();
    renderCtx();
    haptics.pulse(6);
    if (!touch.matches) input.focus({ preventScroll: true });
  });
  zoom.addEventListener('click', closeZoom);
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (!zoom.hidden) return closeZoom();
    if (!picker.hidden) return closePicker();
    if (replyTo || attached) {
      replyTo = null;
      attached = null;
      return renderCtx();
    }
    close();
  });
  // ordinateur ↔ téléphone (fenêtre redimensionnée, tablette tournée) : le panneau change de forme sans se fermer
  phone.addEventListener('change', () => {
    if (!isOpen) return;
    if (phone.matches && !layered) {
      layered = true;
      document.body.classList.add('chat-full');
      pushLayer(close);
    } else if (!phone.matches && layered) {
      layered = false;
      document.body.classList.remove('chat-full');
      popLayer(close);
    }
    syncViewport();
  });
  document.addEventListener('visibilitychange', () => {
    const key = curKey();
    if (!document.hidden && isOpen && key && atBottom()) store.markRead(key);
  });

  // ───────────────────────────── branchements
  store.on((e) => {
    if (e.type === 'error') return toast(e.message, 'err');
    if (e.type === 'incoming') {
      const here = isOpen && e.key === curKey();
      if (here) {
        if (!atBottom()) {
          newBelow++;
          syncJump();
        }
        if (!document.hidden) o.sound?.('in');
        return;
      }
      if (isOpen) {
        // panneau ouvert sur une autre conversation : la pastille de l'onglet suffit, avec un son discret
        if (!document.hidden) o.sound?.('in');
        return;
      }
      tick(e);
      return;
    }
    if (e.type === 'inbox') {
      renderLaunch();
      if (!isOpen) return;
      renderHead();
      if (view === 'dms') renderList();
      else {
        const key = curKey()!;
        if (view === 'dm') renderThread(); // « vu »
        if (atBottom()) store.markRead(key);
      }
      return;
    }
    if (isOpen && e.key === curKey()) renderThread();
  });

  let userId: string | null = null;
  let presenceSig = '';
  let pullsSrc: unknown = null;
  backend.onChange((s) => {
    const id = s.user?.id ?? null;
    if (id !== userId) {
      userId = id;
      close();
      drafts.clear();
      dmCur = null;
      view = 'general';
      store.reset();
      root.hidden = !id;
      if (id) {
        // ordinateur : le panneau retrouve son état après un rechargement
        try {
          const v = JSON.parse(sessionStorage.getItem('bebou.chat.view') ?? 'null') as { view?: string; dm?: string | null } | null;
          if (v?.dm && dmPeer(v.dm, id)) dmCur = v.dm;
          if (v?.view === 'dms' || (v?.view === 'dm' && dmCur)) view = v.view as 'dms' | 'dm';
          if (!phone.matches && sessionStorage.getItem('bebou.chat.open') === '1') open();
        } catch {
          /* ignore */
        }
      }
    }
    const sig = [...players().values()].map((p) => `${p.id}${p.online ? 1 : 0}${p.name}${p.avatarUrl ?? ''}`).join('|');
    if (sig !== presenceSig) {
      presenceSig = sig;
      renderLaunch();
      if (isOpen) {
        renderHead();
        if (view === 'dms') renderList();
      }
    }
    // un drop 6★ vient de tomber : il apparaît dans le fil général
    if (s.bigPulls !== pullsSrc) {
      pullsSrc = s.bigPulls;
      if (isOpen && view === 'general') renderThread();
    }
  });
  renderLaunch();

  return { open, close };
}
