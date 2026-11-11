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
const GOALS: Array<{ key: string; kind: DefiKind; target?: RarityId; title: string; sub: string }> = [
  { key: 'first5', kind: 'first', target: 'legendary', title: 'Premier à 5★', sub: 'la première 5★ ou mieux' },
  { key: 'first6', kind: 'first', target: 'mythic', title: 'Premier à 6★', sub: 'la première 6★' },
  { key: 'new', kind: 'new', title: 'Nouvelles cartes', sub: 'le plus de cartes jamais eues' },
  { key: 'stars', kind: 'stars', title: 'Étoiles', sub: 'le plus d’étoiles tirées' },
];

const ava = (name: string, url?: string) => (url ? `<img class="gm-ava" src="${esc(url)}" alt="">` : `<span class="gm-ava">${esc(name.slice(0, 1))}</span>`);
const goalOf = (c: { kind: DefiKind; target?: RarityId }) => defiKind(c.kind).goal(c.target);
const scoreTxt = (c: DefiView, n: number) => defiKind(c.kind).unit(n);

export function defisPage({ body, backend, unsubs, sfx }: JeuxPageCtx) {
  body.innerHTML = `<div class="gm-cols wide df-cols"><div class="gm-panel df-new"></div><div class="gm-panel df-live"><div class="gm-ph"><b>En jeu</b><span class="muted">à répondre et en cours</span></div><div class="df-list df-open"></div></div></div>
    <div class="gm-panel"><div class="gm-ph"><b>Terminés</b></div><div class="df-list df-done"></div></div>
    <div class="gm-rules muted">Un objectif, une durée, une mise facultative (la même pour tous, mise de côté dès qu'on s'inscrit). Les invités ont ${DEFI_ACCEPT_MS / 3600_000} h pour accepter ; le défi démarre quand tout le monde a répondu, ou quand tu le lances. Seuls comptent les boosters <b>ouverts après le départ</b>. À la fin, le meilleur score rafle toutes les mises ; <b>égalité en tête ou personne : tout est rendu</b>. « Premier à » se gagne dès la carte tirée.</div>`;
  const form = body.querySelector<HTMLElement>('.df-new')!;
  const draft = { goal: 'stars', durationMs: DEFI_DURATIONS[1].ms, stake: 100, invited: new Set<string>() };
  const coins = () => backend.eco.snapshot?.coins ?? 0;
  const friends = () => backend.state.social.friends;

  const drawForm = () => {
    const g = GOALS.find((x) => x.key === draft.goal)!;
    const fr = friends();
    for (const id of [...draft.invited]) if (!fr.some((f) => f.userId === id)) draft.invited.delete(id);
    const n = draft.invited.size;
    const pot = draft.stake * (n + 1);
    const short = draft.stake > coins();
    form.innerHTML = `<div class="gm-ph"><b>Lancer un défi</b><span class="muted">à 1–${DEFI_MAX_FRIENDS} amis</span></div>
      <div class="df-step"><span class="df-l">Objectif</span><div class="df-goals" role="radiogroup" aria-label="Objectif">${GOALS.map((x) => `<button role="radio" aria-checked="${x.key === draft.goal}" class="df-goal${x.key === draft.goal ? ' on' : ''}" data-g="${x.key}"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></button>`).join('')}</div></div>
      <div class="df-step"><span class="df-l">Durée</span><div class="df-chips">${DEFI_DURATIONS.map((d) => `<button class="gm-pack-b gm-rc${d.ms === draft.durationMs ? ' on' : ''}" data-d="${d.ms}">${esc(d.label)}</button>`).join('')}</div></div>
      <div class="df-step"><span class="df-l">Mise</span><div class="df-chips">${DEFI_STAKES.map((s) => `<button class="gm-pack-b gm-rc${s === draft.stake ? ' on' : ''}" data-s="${s}">${s ? fmtCoins(s) : 'Honneur'}</button>`).join('')}</div></div>
      <div class="df-step"><span class="df-l">Amis</span>${fr.length ? `<div class="df-friends">${fr.map((f) => `<button class="df-fr${draft.invited.has(f.userId) ? ' on' : ''}" data-f="${esc(f.userId)}" aria-pressed="${draft.invited.has(f.userId)}">${ava(f.name, f.avatarUrl)}<span>${esc(f.name)}</span></button>`).join('')}</div>` : '<div class="muted">Pas encore d’amis : ajoute-en depuis <a href="#/amis">la page Amis</a>.</div>'}</div>
      <dl class="gm-riskg df-sum"><div><dt>Objectif</dt><dd>${esc(goalOf(g))}</dd></div><div><dt>Mise</dt><dd>${draft.stake ? coinsHtml(draft.stake) : 'pour l’honneur'}</dd></div><div class="plus"><dt>Victoire</dt><dd>${draft.stake ? `jusqu’à ${COIN_ICON}${fmtCoins(pot)}` : 'la gloire'}</dd></div><div><dt>Égalité</dt><dd>tout est rendu</dd></div></dl>
      ${short ? `<div class="gm-warn">Il te manque ${fmtCoins(draft.stake - coins())} pièces pour cette mise.</div>` : ''}
      <button class="btn-primary df-go"${!n || short ? ' disabled' : ''}>${n ? `Défier ${plural(n, 'ami')}` : 'Choisis au moins un ami'}</button>`;
    form.querySelectorAll<HTMLElement>('[data-g]').forEach((b) => b.addEventListener('click', () => ((draft.goal = b.dataset.g!), drawForm())));
    form.querySelectorAll<HTMLElement>('[data-d]').forEach((b) => b.addEventListener('click', () => ((draft.durationMs = Number(b.dataset.d)), drawForm())));
    form.querySelectorAll<HTMLElement>('[data-s]').forEach((b) => b.addEventListener('click', () => ((draft.stake = Number(b.dataset.s)), drawForm())));
    form.querySelectorAll<HTMLElement>('[data-f]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.f!;
        if (draft.invited.has(id)) draft.invited.delete(id);
        else if (draft.invited.size >= DEFI_MAX_FRIENDS) return void toast(`${DEFI_MAX_FRIENDS} amis au plus.`, 'info');
        else draft.invited.add(id);
        drawForm();
      }),
    );
    form.querySelector<HTMLElement>('.df-go')!.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      if (draft.stake && !confirmTap(btn, `Confirmer ? −${fmtCoins(draft.stake)} pièces mises de côté`)) return;
      const d: DefiDraft = { kind: g.kind, ...(g.target ? { target: g.target } : {}), durationMs: draft.durationMs, stake: draft.stake, invited: [...draft.invited] };
      void guarded('defi-create', btn, async () => {
        try {
          await busyButton(btn, backend.eco.createDefi(d));
          sfx('chime');
          toast(`Défi lancé ! ${plural(d.invited.length, 'ami invité', 'amis invités')}.`, 'ok');
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
      c.status === 'pending' ? `<span class="df-st wait">en attente</span><span class="df-cd" data-cd="${c.acceptBy}" data-cdl="réponses">…</span>`
      : c.status === 'live' ? `<span class="df-st live"><i class="gm-dot"></i>en cours</span><span class="df-cd" data-cd="${c.endsAt}" data-cdl="fin">…</span>`
      : c.status === 'cancelled' ? '<span class="df-st">annulé</span>'
      : `<span class="df-st">${c.outcome === 'win' ? (c.winnerId === me ? '<b class="plus">gagné</b>' : 'terminé') : c.outcome === 'tie' ? 'égalité · rendu' : 'personne · rendu'}</span>`;
    const rows = c.players
      .filter((p) => c.status === 'pending' || p.state === 'in')
      .map((p) => {
        const w = c.status === 'done' && c.winnerId === p.userId;
        const right = c.status === 'pending' ? (p.state === 'in' ? 'inscrit' : p.state === 'out' ? 'refuse' : 'invité') : esc(scoreTxt(c, p.score));
        const bar = c.status === 'pending' || c.kind === 'first' ? '' : `<i class="df-bar" style="--k:${(p.score / best).toFixed(3)}"></i>`;
        return `<div class="df-p${w ? ' df-win' : ''}${p.userId === me ? ' df-me' : ''}${p.state === 'out' ? ' df-out' : ''}">${ava(p.name, p.avatarUrl)}<span class="df-pn">${esc(p.userId === me ? 'Toi' : p.name)}</span>${bar}<span class="df-ps">${right}</span></div>`;
      })
      .join('');
    const acts: string[] = [];
    if (c.status === 'pending' && mine?.state === 'invited') acts.push(`<button class="btn-primary sm" data-a="yes">Accepter${c.stake ? ` · ${COIN_ICON}${fmtCoins(c.stake)}` : ''}</button>`, '<button class="btn-ghost sm" data-a="no">Refuser</button>');
    if (c.status === 'pending' && isCreator) acts.push(`<button class="btn-primary sm" data-a="start"${inn.length < 2 ? ' disabled' : ''}>Lancer maintenant</button>`, '<button class="btn-ghost sm danger" data-a="cancel">Annuler</button>');
    if (c.status === 'live' && backend.eco.demoDefiEnd) acts.push('<button class="btn-ghost sm" data-a="end">Terminer (démo)</button>');
    const el = h('article', `df-card s-${c.status}`);
    el.innerHTML = `<header><span class="df-goal-t">${esc(goalOf(c))}</span><span class="df-meta">${status}</span></header>
      <div class="df-tags"><span class="gm-tag">${esc(DEFI_DURATIONS.find((d) => d.ms === c.durationMs)?.label ?? '')}</span>${c.stake ? `<span class="gm-tag">mise ${fmtCoins(c.stake)}</span><span class="gm-tag">pot ${fmtCoins(pot)}</span>` : '<span class="gm-tag">pour l’honneur</span>'}${isCreator ? '' : `<span class="gm-tag">de ${esc(c.players[0]?.name ?? '?')}</span>`}</div>
      <div class="df-ps-list">${rows}</div>${acts.length ? `<div class="df-acts">${acts.join('')}</div>` : ''}`;
    const act = (k: string, run: () => Promise<void>, ok: string) =>
      el.querySelector<HTMLElement>(`[data-a="${k}"]`)?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        if (k === 'yes' && c.stake && !confirmTap(btn, `Confirmer ? −${fmtCoins(c.stake)} pièces`)) return;
        if (k === 'cancel' && !confirmTap(btn, 'Annuler le défi ?')) return;
        void guarded(`defi-${k}-${c.id}`, btn, async () => {
          try {
            await busyButton(btn, run());
            if (ok) toast(ok, 'ok');
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
    act('yes', () => backend.eco.respondDefi(c.id, true), 'Défi accepté : bonne chance !');
    act('no', () => backend.eco.respondDefi(c.id, false), '');
    act('start', () => backend.eco.startDefi(c.id), 'C’est parti !');
    act('cancel', () => backend.eco.cancelDefi(c.id), 'Défi annulé, les mises sont rendues.');
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
      if (!l) return void (openBox.innerHTML = '<div class="muted">Connecte-toi pour jouer.</div>');
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
      if (!open.length) openBox.innerHTML = '<div class="muted">Aucun défi en jeu. Lance le premier !</div>';
      doneBox.replaceChildren(...done.slice(0, 12).map(card));
      if (!done.length) doneBox.innerHTML = '<div class="muted">Pas encore de défi terminé.</div>';
      tick();
    }),
  );
  const timer = window.setInterval(tick, 20_000);
  unsubs.push(() => clearInterval(timer));
}
