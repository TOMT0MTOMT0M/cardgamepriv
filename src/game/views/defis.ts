import { t } from '../../core/i18n';
import '../../core/i18n/fr/game.views.defis'; // (textes de ce module, version anglaise)
import type { GameBackend } from '../backend';
import type { DefiView } from '../ecoJeux';
import { DEFI_ACCEPT_MS, DEFI_DURATIONS, DEFI_MAX_FRIENDS, DEFI_STAKES, defiKind, type DefiDraft, type DefiKind } from '../../core/defis';
import { fmtCoins } from '../../core/economy';
import type { RarityId } from '../../core/rarity';
import { busyButton, errMsg, esc, fmtDelay, h, plural, toast } from '../ui';
import { confirmTap, guarded } from './safety';
import { COIN_ICON, coinsHtml } from './wallet';
import '../defis.css';

/**
 * (V2, 11/11) DÉFIS ENTRE AMIS — #/jeux/defis. Règles : src/core/defis.ts · serveur : convex/challenges.ts.
 * Haut : lancer un défi (objectif, durée, mise, amis). Dessous : à répondre / en cours (scores en direct), puis terminés.
 */

export interface JeuxPageCtx {
  body: HTMLElement;
  backend: GameBackend;
  unsubs: Array<() => void>;
  sfx: (k: 'tick' | 'chime' | 'big') => void;
}

/** objectifs proposés (le « premier à » existe en 5★ et en 6★) */
const GOALS = (): Array<{ key: string; kind: DefiKind; target?: RarityId; title: string; sub: string }> => [
  { key: 'first5', kind: 'first', target: 'legendary', title: t('df.g.first5'), sub: t('df.g.first5d') },
  { key: 'first6', kind: 'first', target: 'mythic', title: t('df.g.first6'), sub: t('df.g.first6d') },
  { key: 'new', kind: 'new', title: t('df.g.new'), sub: t('df.g.newd') },
  { key: 'stars', kind: 'stars', title: t('df.g.stars'), sub: t('df.g.starsd') },
];

const ava = (name: string, url?: string) => (url ? `<img class="gm-ava" src="${esc(url)}" alt="">` : `<span class="gm-ava">${esc(name.slice(0, 1))}</span>`);
const goalOf = (c: { kind: DefiKind; target?: RarityId }) => defiKind(c.kind).goal(c.target);
const scoreTxt = (c: DefiView, n: number) => defiKind(c.kind).unit(n);

export function defisPage({ body, backend, unsubs, sfx }: JeuxPageCtx) {
  body.innerHTML = `<div class="gm-cols wide df-cols"><div class="gm-panel df-new"></div><div class="gm-panel df-live"><div class="gm-ph"><b>${t('df.inPlay')}</b><span class="muted">${t('df.inPlayD')}</span></div><div class="df-list df-open"></div></div></div>
    <div class="gm-panel"><div class="gm-ph"><b>${t('df.done')}</b></div><div class="df-list df-done"></div></div>
    <div class="gm-rules muted">${t('df.rules', { h: DEFI_ACCEPT_MS / 3600_000 })}</div>`;
  const form = body.querySelector<HTMLElement>('.df-new')!;
  const draft = { goal: 'stars', durationMs: DEFI_DURATIONS[1].ms, stake: 100, invited: new Set<string>() };
  const coins = () => backend.eco.snapshot?.coins ?? 0;
  const friends = () => backend.state.social.friends;

  const drawForm = () => {
    const g = GOALS().find((x) => x.key === draft.goal)!;
    const fr = friends();
    for (const id of [...draft.invited]) if (!fr.some((f) => f.userId === id)) draft.invited.delete(id);
    const n = draft.invited.size;
    const pot = draft.stake * (n + 1);
    const short = draft.stake > coins();
    form.innerHTML = `<div class="gm-ph"><b>${t('df.launch')}</b><span class="muted">${t('df.toFriends', { n: DEFI_MAX_FRIENDS })}</span></div>
      <div class="df-step"><span class="df-l">${t('df.goal')}</span><div class="df-goals" role="radiogroup" aria-label="${t('df.goal')}">${GOALS().map((x) => `<button role="radio" aria-checked="${x.key === draft.goal}" class="df-goal${x.key === draft.goal ? ' on' : ''}" data-g="${x.key}"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></button>`).join('')}</div></div>
      <div class="df-step"><span class="df-l">${t('df.duration')}</span><div class="df-chips">${DEFI_DURATIONS.map((d) => `<button class="gm-pack-b gm-rc${d.ms === draft.durationMs ? ' on' : ''}" data-d="${d.ms}">${esc(d.label)}</button>`).join('')}</div></div>
      <div class="df-step"><span class="df-l">${t('df.bet')}</span><div class="df-chips">${DEFI_STAKES.map((s) => `<button class="gm-pack-b gm-rc${s === draft.stake ? ' on' : ''}" data-s="${s}">${s ? fmtCoins(s) : t('df.honor')}</button>`).join('')}</div></div>
      <div class="df-step"><span class="df-l">${t('df.friends')}</span>${fr.length ? `<div class="df-friends">${fr.map((f) => `<button class="df-fr${draft.invited.has(f.userId) ? ' on' : ''}" data-f="${esc(f.userId)}" aria-pressed="${draft.invited.has(f.userId)}">${ava(f.name, f.avatarUrl)}<span>${esc(f.name)}</span></button>`).join('')}</div>` : '<div class="muted">' + t('df.noFriends') + ' <a href="#/amis">' + t('df.friendsPage') + '</a>.</div>'}</div>
      <dl class="gm-riskg df-sum"><div><dt>${t('df.goal')}</dt><dd>${esc(goalOf(g))}</dd></div><div><dt>${t('df.bet')}</dt><dd>${draft.stake ? coinsHtml(draft.stake) : t('df.forHonor')}</dd></div><div class="plus"><dt>${t('df.win')}</dt><dd>${draft.stake ? t('df.upTo', { icon: COIN_ICON, pot: fmtCoins(pot) }) : t('df.glory')}</dd></div><div><dt>${t('df.tie')}</dt><dd>${t('df.allBack')}</dd></div></dl>
      ${short ? `<div class="gm-warn">${t('df.short', { n: fmtCoins(draft.stake - coins()) })}</div>` : ''}
      <button class="btn-primary df-go"${!n || short ? ' disabled' : ''}>${n ? t('df.challenge', { friends: plural(n, 'ami') }) : t('df.pickOne')}</button>`;
    form.querySelectorAll<HTMLElement>('[data-g]').forEach((b) => b.addEventListener('click', () => ((draft.goal = b.dataset.g!), drawForm())));
    form.querySelectorAll<HTMLElement>('[data-d]').forEach((b) => b.addEventListener('click', () => ((draft.durationMs = Number(b.dataset.d)), drawForm())));
    form.querySelectorAll<HTMLElement>('[data-s]').forEach((b) => b.addEventListener('click', () => ((draft.stake = Number(b.dataset.s)), drawForm())));
    form.querySelectorAll<HTMLElement>('[data-f]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.f!;
        if (draft.invited.has(id)) draft.invited.delete(id);
        else if (draft.invited.size >= DEFI_MAX_FRIENDS) return void toast(t('df.maxFriends', { n: DEFI_MAX_FRIENDS }), 'info');
        else draft.invited.add(id);
        drawForm();
      }),
    );
    form.querySelector<HTMLElement>('.df-go')!.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      if (draft.stake && !confirmTap(btn, t('df.confirmBet', { n: fmtCoins(draft.stake) }))) return;
      const d: DefiDraft = { kind: g.kind, ...(g.target ? { target: g.target } : {}), durationMs: draft.durationMs, stake: draft.stake, invited: [...draft.invited] };
      void guarded('defi-create', btn, async () => {
        try {
          await busyButton(btn, backend.eco.createDefi(d));
          sfx('chime');
          toast(t('df.launched', { who: plural(d.invited.length, 'ami invité', 'amis invités') }), 'ok'); // i18n-ok
          draft.invited.clear();
          drawForm();
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      });
    });
  };
  drawForm();
  // amis ou solde changés : le formulaire suit (sans redessiner pour rien à chaque mise à jour de l'état)
  const formKey = () => `${friends().map((f) => f.userId).join(',')}|${draft.stake > coins()}`;
  let lastKey = formKey();
  const refresh = () => {
    const k = formKey();
    if (k === lastKey || !form.isConnected) return;
    lastKey = k;
    drawForm();
  };
  unsubs.push(backend.onChange(refresh), backend.eco.onChange(refresh));

  // ───────── liste
  const openBox = body.querySelector<HTMLElement>('.df-open')!;
  const doneBox = body.querySelector<HTMLElement>('.df-done')!;
  let me = '';
  const card = (c: DefiView) => {
    const mine = c.players.find((p) => p.userId === me);
    const isCreator = c.creatorId === me;
    const inn = c.players.filter((p) => p.state === 'in');
    const best = Math.max(1, ...inn.map((p) => p.score));
    const pot = c.stake * inn.length;
    const status =
      c.status === 'pending' ? `<span class="df-st wait">${t('df.st.pending')}</span><span class="df-cd" data-cd="${c.acceptBy}" data-cdl="${t('df.cdReplies')}">…</span>`
      : c.status === 'live' ? `<span class="df-st live"><i class="gm-dot"></i>${t('df.st.live')}</span><span class="df-cd" data-cd="${c.endsAt}" data-cdl="${t('df.cdEnd')}">…</span>`
      : c.status === 'cancelled' ? '<span class="df-st">' + t('df.st.cancelled') + '</span>'
      : `<span class="df-st">${c.outcome === 'win' ? (c.winnerId === me ? '<b class="plus">' + t('df.st.won') + '</b>' : t('df.st.over')) : c.outcome === 'tie' ? t('df.st.tie') : t('df.nobodyBack')}</span>`;
    const rows = c.players
      .filter((p) => c.status === 'pending' || p.state === 'in')
      .map((p) => {
        const w = c.status === 'done' && c.winnerId === p.userId;
        const right = c.status === 'pending' ? (p.state === 'in' ? 'inscrit' : p.state === 'out' ? 'refuse' : t('df.invited')) : esc(scoreTxt(c, p.score));
        const bar = c.status === 'pending' || c.kind === 'first' ? '' : `<i class="df-bar" style="--k:${(p.score / best).toFixed(3)}"></i>`;
        return `<div class="df-p${w ? ' df-win' : ''}${p.userId === me ? ' df-me' : ''}${p.state === 'out' ? ' df-out' : ''}">${ava(p.name, p.avatarUrl)}<span class="df-pn">${esc(p.userId === me ? t('chat.me') : p.name)}</span>${bar}<span class="df-ps">${right}</span></div>`;
      })
      .join('');
    const acts: string[] = [];
    if (c.status === 'pending' && mine?.state === 'invited') acts.push(`<button class="btn-primary sm" data-a="yes">${t('df.accept', { x: c.stake ? ` · ${COIN_ICON}${fmtCoins(c.stake)}` : '' })}</button>`, '<button class="btn-ghost sm" data-a="no">' + t('df.refuse') + '</button>');
    if (c.status === 'pending' && isCreator) acts.push(`<button class="btn-primary sm" data-a="start"${inn.length < 2 ? ' disabled' : ''}>Lancer maintenant</button>`, '<button class="btn-ghost sm danger" data-a="cancel">' + t('df.cancel') + '</button>');
    if (c.status === 'live' && backend.eco.demoDefiEnd) acts.push('<button class="btn-ghost sm" data-a="end">' + t('df.endDemo') + '</button>');
    const el = h('article', `df-card s-${c.status}`);
    el.innerHTML = `<header><span class="df-goal-t">${esc(goalOf(c))}</span><span class="df-meta">${status}</span></header>
      <div class="df-tags"><span class="gm-tag">${esc(DEFI_DURATIONS.find((d) => d.ms === c.durationMs)?.label ?? '')}</span>${c.stake ? `<span class="gm-tag">${t('df.betN', { n: fmtCoins(c.stake) })}</span><span class="gm-tag">pot ${fmtCoins(pot)}</span>` : '<span class="gm-tag">' + t('df.forHonor') + '</span>'}${isCreator ? '' : `<span class="gm-tag">de ${esc(c.players[0]?.name ?? '?')}</span>`}</div>
      <div class="df-ps-list">${rows}</div>${acts.length ? `<div class="df-acts">${acts.join('')}</div>` : ''}`;
    const act = (k: string, run: () => Promise<void>, ok: string) =>
      el.querySelector<HTMLElement>(`[data-a="${k}"]`)?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        if (k === 'yes' && c.stake && !confirmTap(btn, t('df.confirmN', { n: fmtCoins(c.stake) }))) return;
        if (k === 'cancel' && !confirmTap(btn, t('df.cancelQ'))) return;
        void guarded(`defi-${k}-${c.id}`, btn, async () => {
          try {
            await busyButton(btn, run());
            if (ok) toast(ok, 'ok');
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
    act('yes', () => backend.eco.respondDefi(c.id, true), t('df.accepted'));
    act('no', () => backend.eco.respondDefi(c.id, false), '');
    act('start', () => backend.eco.startDefi(c.id), t('df.go'));
    act('cancel', () => backend.eco.cancelDefi(c.id), t('df.cancelled'));
    act('end', () => backend.eco.demoDefiEnd!(c.id), '');
    return el;
  };
  const tick = () => {
    for (const e of body.querySelectorAll<HTMLElement>('[data-cd]')) {
      const left = Number(e.dataset.cd) - Date.now();
      e.textContent = left > 0 ? `${e.dataset.cdl} dans ${fmtDelay(left)}` : 'tranche…';
    }
  };
  const seen = new Map<string, string>();
  unsubs.push(
    backend.eco.watchDefis((l) => {
      if (!l) return void (openBox.innerHTML = '<div class="muted">' + t('df.login') + '</div>');
      me = l.me;
      const open = l.list.filter((c) => c.status === 'pending' || c.status === 'live');
      const done = l.list.filter((c) => c.status === 'done' || c.status === 'cancelled');
      // un défi qui vient de se terminer sous mes yeux : petit son
      for (const c of l.list) {
        const was = seen.get(c.id);
        if (was && was !== c.status && c.status === 'done') sfx(c.winnerId === me ? 'big' : 'chime');
        seen.set(c.id, c.status);
      }
      openBox.replaceChildren(...open.map(card));
      if (!open.length) openBox.innerHTML = '<div class="muted">' + t('df.none') + '</div>';
      doneBox.replaceChildren(...done.slice(0, 12).map(card));
      if (!done.length) doneBox.innerHTML = '<div class="muted">' + t('df.noneDone') + '</div>';
      tick();
    }),
  );
  const timer = window.setInterval(tick, 20_000);
  unsubs.push(() => clearInterval(timer));
}
