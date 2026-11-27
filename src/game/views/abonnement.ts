import '../../core/i18n/fr/game.views.abonnement'; // (textes de ce module, version anglaise)
import '../abonnement.css';
import { fmtDate, t as tr, type MsgKey } from '../../core/i18n';
import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import type { AboPage, AboPoll } from '../ecoExtras';
import { BEBOU_CARD, SUB_EXTRA_PACKS, SUB_PRICE_EUR, bebouMediaProblem, subActive, subDaysLeft, subEndingSoon } from '../../core/abo';
import { EVENT_CAP, SUB_EXTRA_EVENT_PACKS, fmtLeft } from '../../core/events';
import { PACK_CAP } from '../../core/packRegen';
import { busyButton, errMsg, esc, h, toast } from '../ui';

/**
 * ABONNEMENT (#/abonnement, 20/11 — règles : src/core/abo.ts) : 5 € par mois pour soutenir le jeu.
 * Une page, peu de texte : le prix et l'état, les 3 avantages en tuiles, « où va l'argent », puis comment payer
 * (Wero vers l'équipe, « J'ai payé », activation à la main). Sous la ligne « Abonnés » : la carte Bebou à proposer et
 * le vote du mois — visibles par tous, utilisables par les abonnés.
 * L'état (actif jusqu'à…, demande en attente) vient de l'économie (`EcoSnapshot.sub`) ; le reste est lu à la demande
 * (`aboPage`) à l'entrée et après chaque action.
 */
export interface AbonnementView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

const I = (d: string) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const ICO = {
  packs: I('M6 6h12v12H6zM6 6l1.5-2L9 6l1.5-2L12 6l1.5-2L15 6l1.5-2L18 6M12 9.5v5M9.5 12h5'),
  card: I('M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5zM12 8.2l1.1 2.3 2.5.3-1.9 1.7.5 2.5-2.2-1.3-2.2 1.3.5-2.5-1.9-1.7 2.5-.3z'),
  vote: I('M5 11h14v9H5zM8 11V7l4-3 4 3v4M9.5 15.5l1.8 1.8 3.4-3.6'),
  server: I('M4 5h16v5H4zM4 14h16v5H4zM7.5 7.5h.01M7.5 16.5h.01M11 7.5h6M11 16.5h6'),
  code: I('M9 8l-4 4 4 4M15 8l4 4-4 4M13.2 6l-2.4 12'),
  lock: I('M7 11h10v8H7zM9 11V8a3 3 0 0 1 6 0v3'),
};

export function createAbonnementView(backend: GameBackend, shell: Shell): AbonnementView {
  const el = h('section', 'view abonnement');
  el.innerHTML = `
    <div class="sc-wrap ab-wrap">
      <header class="sc-head"><div><span class="kicker">${tr('ab.kicker')}</span><h1>${tr('ab.title')}</h1></div></header>
      <section class="ab-hero"></section>
      <div class="ab-perks">
        <div class="ab-perk">${ICO.packs}<b>${tr('ab.p1', { n: SUB_EXTRA_PACKS })}</b><span>${tr('ab.p1d', { a: PACK_CAP, b: PACK_CAP + SUB_EXTRA_PACKS })}</span></div>
        <div class="ab-perk">${ICO.packs}<b>${tr('ab.p5', { n: SUB_EXTRA_EVENT_PACKS })}</b><span>${tr('ab.p5d', { a: EVENT_CAP, b: EVENT_CAP + SUB_EXTRA_EVENT_PACKS })}</span></div>
        <div class="ab-perk">${ICO.card}<b>${tr('ab.p2')}</b><span>${tr('ab.p2d')}</span></div>
        <div class="ab-perk">${ICO.vote}<b>${tr('ab.p3')}</b><span>${tr('ab.p3d')}</span></div>
        <div class="ab-perk">${ICO.vote}<b>${tr('ab.p4')}</b><span>${tr('ab.p4d')}</span></div>
      </div>
      <section class="ab-where">
        <b class="ab-h">${tr('ab.where', { n: SUB_PRICE_EUR })}</b>
        <div class="ab-where-row"><i>${ICO.server}</i><span><b>${tr('ab.w1')}</b><small>${tr('ab.w1d')}</small></span></div>
        <div class="ab-where-row"><i>${ICO.code}</i><span><b>${tr('ab.w2')}</b><small>${tr('ab.w2d')}</small></span></div>
        <p class="ab-fair">${tr('ab.fair')}</p>
      </section>
      <section class="ab-pay"></section>
      <div class="ab-sep"><span>${ICO.lock}${tr('ab.subs')}</span></div>
      <div class="ab-two">
        <section class="ab-panel ab-card"></section>
        <section class="ab-panel ab-vote"></section>
      </div>
      <button class="btn-ghost sm ab-demo" hidden>${tr('ab.demo')}</button>
    </div>`;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const heroEl = q('.ab-hero');
  const payEl = q('.ab-pay');
  const cardEl = q('.ab-card');
  const voteEl = q('.ab-vote');
  const demoBtn = q<HTMLButtonElement>('.ab-demo');

  let page: AboPage | null = null;
  /** image choisie pour la carte (pas encore envoyée) ; `null` : retirer celle en place ; undefined : ne rien changer */
  let pick: Blob | null | undefined;
  let pickUrl = '';
  let draft: { title: string; idea: string } | null = null;

  const sub = () => backend.eco.snapshot?.sub ?? { until: 0, askedAt: 0 };
  const active = () => subActive({ subUntil: sub().until });
  const logged = () => backend.state.mode !== 'online' || !!backend.state.user;
  const sfx = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* son indisponible */
    }
  };

  async function load() {
    try {
      page = await backend.eco.aboPage();
    } catch (e) {
      toast(errMsg(e), 'err');
    }
    if (el.isConnected) paint();
  }

  function paintHero() {
    const s = sub();
    const on = active();
    const soon = subEndingSoon(s.until);
    const days = subDaysLeft(s.until);
    heroEl.className = `ab-hero${on ? ' on' : ''}${soon ? ' soon' : ''}`;
    heroEl.innerHTML = `<div class="ab-price"><b>${page?.priceEur ?? SUB_PRICE_EUR}</b><span>€</span><em>${tr('ab.perMonth')}</em></div>
      <div class="ab-state">
        <span class="ab-pill">${on ? (soon ? tr('ab.st.soon') : tr('ab.st.on')) : tr('ab.st.off')}</span>
        ${on ? `<span class="ab-until">${tr('ab.st.until', { date: fmtDate(s.until, { day: 'numeric', month: 'long' }) })} · <b>${tr('ab.st.days', { n: days })}</b></span>` : ''}
        ${s.askedAt ? `<span class="ab-asked">${tr('ab.st.asked')}</span>` : ''}
      </div>`;
  }

  function paintPay() {
    const s = sub();
    const on = active();
    // abonné pour plus de 5 jours : rien à payer, le bloc disparaît
    payEl.hidden = on && !subEndingSoon(s.until);
    if (payEl.hidden) return;
    if (!logged()) return void (payEl.innerHTML = `<p class="muted">${tr('ab.login')}</p>`);
    const to = page?.weroTo;
    payEl.innerHTML = `<b class="ab-h">${on ? tr('ab.renew') : tr('ab.pay')}</b>
      <ol class="ab-steps">
        <li><i>1</i><span><b>${tr('ab.s1', { n: page?.priceEur ?? SUB_PRICE_EUR })}</b>${to ? `<small>${tr('ab.s1to')} <strong class="ab-to">${esc(to)}</strong> · ${tr('ab.s1msg')}</small>` : `<small>${tr('ab.s1none')}</small>`}</span>${to ? `<button class="btn-ghost sm ab-copy">${tr('ab.copy')}</button>` : ''}</li>
        <li><i>2</i><span><b>${tr('ab.s2')}</b>${s.askedAt ? `<small>${tr('ab.paidDone')}</small>` : ''}</span>${s.askedAt ? '' : `<button class="btn-primary ab-paid"${to ? '' : ' disabled'}>${tr('ab.paid')}</button>`}</li>
        <li><i>3</i><span><b>${tr('ab.s3')}</b></span></li>
      </ol>`;
    payEl.querySelector('.ab-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(to ?? '');
        toast(tr('ab.copied'), 'ok');
      } catch {
        /* presse-papiers refusé : le destinataire reste lisible à l'écran */
      }
    });
    payEl.querySelector<HTMLElement>('.ab-paid')?.addEventListener('click', async (e) => {
      try {
        await busyButton(e.currentTarget as HTMLElement, backend.eco.aboAsk());
        sfx(() => shell.sfx.chime(3, 0.08));
        toast(tr('ab.paidDone'), 'ok');
      } catch (err) {
        toast(errMsg(err), 'err');
      }
      paint();
    });
  }

  function paintCard() {
    const on = active();
    const c = page?.card ?? null;
    const done = c?.status === 'done';
    const title = draft?.title ?? c?.title ?? '';
    const idea = draft?.idea ?? c?.idea ?? '';
    const img = pick === null ? '' : pickUrl || c?.mediaUrl || '';
    cardEl.classList.toggle('locked', !on);
    cardEl.innerHTML = `<div class="ab-ph"><b>${ICO.card}${tr('ab.card')}</b>${c ? `<span class="ab-chip s-${c.status}">${tr(`ab.cs.${c.status}` as MsgKey)}</span>` : ''}</div>
      <div class="ab-cardform">
        <label class="ab-art${img ? ' has' : ''}">${img ? `<img src="${esc(img)}" alt="">` : `<span>${ICO.card}</span>`}<input type="file" accept="${BEBOU_CARD.mediaTypes.join(',')}" hidden${on && !done ? '' : ' disabled'}><em>${img ? tr('ab.cardImgChange') : tr('ab.cardImg')}</em></label>
        <div class="ab-fields">
          <input class="ab-in ab-title" maxlength="${BEBOU_CARD.title}" placeholder="${tr('ab.cardName')}" value="${esc(title)}"${on && !done ? '' : ' disabled'}>
          <textarea class="ab-in ab-idea" maxlength="${BEBOU_CARD.idea}" rows="4" placeholder="${tr('ab.cardIdea')}"${on && !done ? '' : ' disabled'}>${esc(idea)}</textarea>
          <div class="ab-acts">${img && on && !done ? `<button class="btn-ghost sm ab-drop">${tr('ab.cardImgDrop')}</button>` : ''}<button class="btn-primary ab-send"${on && !done ? '' : ' disabled'}>${tr('ab.cardSend')}</button></div>
        </div>
      </div>`;
    const tIn = cardEl.querySelector<HTMLInputElement>('.ab-title')!;
    const iIn = cardEl.querySelector<HTMLTextAreaElement>('.ab-idea')!;
    const keep = () => (draft = { title: tIn.value, idea: iIn.value });
    tIn.addEventListener('input', keep);
    iIn.addEventListener('input', keep);
    cardEl.querySelector<HTMLInputElement>('input[type=file]')!.addEventListener('change', (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const bad = bebouMediaProblem(f.size, f.type);
      if (bad) return void toast(bad, 'err');
      if (pickUrl) URL.revokeObjectURL(pickUrl);
      pick = f;
      pickUrl = URL.createObjectURL(f);
      keep();
      paintCard();
    });
    cardEl.querySelector('.ab-drop')?.addEventListener('click', () => {
      if (pickUrl) URL.revokeObjectURL(pickUrl);
      pickUrl = '';
      pick = null;
      keep();
      paintCard();
    });
    cardEl.querySelector<HTMLElement>('.ab-send')!.addEventListener('click', async (e) => {
      try {
        await busyButton(e.currentTarget as HTMLElement, backend.eco.aboSubmitCard(tIn.value, iIn.value, pick === undefined ? 'keep' : pick), { timeoutMs: 60_000 });
        sfx(() => shell.sfx.chime(4, 0.09));
        toast(tr('ab.cardSent'), 'ok');
        draft = null;
        pick = undefined;
        await load();
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
  }

  function paintVote() {
    const on = active();
    const p = page?.poll ?? null;
    voteEl.classList.toggle('locked', !on);
    if (!p) return void (voteEl.innerHTML = `<div class="ab-ph"><b>${ICO.vote}${tr('ab.vote')}</b></div><p class="muted ab-none">${tr('ab.voteNone')}</p>`);
    const max = Math.max(1, ...Object.values(p.counts ?? {}));
    voteEl.innerHTML = `<div class="ab-ph"><b>${ICO.vote}${tr('ab.vote')}</b><span class="ab-chip">${p.open ? tr('ab.voteEnds', { left: fmtLeft(p.closesAt - Date.now()) }) : tr('ab.voteOver')}</span></div>
      <b class="ab-q">${esc(p.title)}</b>
      <div class="ab-opts">${p.options
        .map((o) => {
          const n = p.counts?.[o.id];
          return `<button class="ab-opt${p.mine === o.id ? ' mine' : ''}${n !== undefined && n === max && n > 0 ? ' top' : ''}" data-o="${esc(o.id)}"${on && p.open ? '' : ' disabled'}><i style="--p:${n !== undefined && p.total ? (n / p.total).toFixed(4) : 0}"></i><span>${esc(o.label)}</span>${n !== undefined ? `<em>${n}</em>` : ''}</button>`;
        })
        .join('')}</div>
      ${p.counts ? `<small class="ab-total">${tr('ab.voteN', { n: p.total })}</small>` : ''}`;
    voteEl.querySelectorAll<HTMLButtonElement>('.ab-opt').forEach((b) =>
      b.addEventListener('click', async () => {
        if (b.dataset.o === p.mine) return;
        try {
          const next: AboPoll = await busyButton(b, backend.eco.aboVote(p.id, b.dataset.o!));
          if (page) page = { ...page, poll: next };
          sfx(() => shell.sfx.tick(1.4, 0.06));
          toast(tr('ab.voted'), 'ok');
        } catch (err) {
          toast(errMsg(err), 'err');
        }
        paintVote();
      }),
    );
  }

  function paint() {
    paintHero();
    paintPay();
    paintCard();
    paintVote();
    demoBtn.hidden = !backend.eco.aboDemoToggle;
  }
  demoBtn.addEventListener('click', async () => {
    await busyButton(demoBtn, backend.eco.aboDemoToggle!());
    paint();
  });

  // l'état d'abonnement change (activation par l'équipe pendant qu'on regarde la page) : on repeint, sans relire la page
  let lastSig = '';
  backend.eco.onChange(() => {
    if (!el.isConnected) return;
    const s = sub();
    const sig = `${s.until}|${s.askedAt}`;
    if (sig === lastSig) return;
    lastSig = sig;
    paintHero();
    paintPay();
    cardEl.classList.toggle('locked', !active());
    if (!draft) paintCard();
    paintVote();
  });

  return {
    el,
    enter() {
      shell.show(null);
      shell.setDimmed(true);
      el.scrollTo({ top: 0 });
      paint();
      void load();
    },
    leave() {},
  };
}
