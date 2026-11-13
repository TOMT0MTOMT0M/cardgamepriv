import { t as tr } from '../../core/i18n';
import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import { STREAK_CYCLE, STREAK_REWARD, streakClaimable, streakDay, touchStreak } from '../../core/streak';
import { PITY_LIMIT, pityLeft } from '../../core/pity';
import { CLOSE_X, busyButton, errMsg, fmtN, h, keepFocus, loginPrompt, panelHidden, panelShown, plural, toast } from '../ui';
import { fmtCoins } from '../../core/economy';
import { calendarHtml } from './wallet';

/**
 * ICÔNES DE STATUT de l'en-tête (à côté de la réserve et des missions).
 * Retours live 02 (§11) : la FLAMME ouvre le panneau « CONNEXION », qui regroupe la série de 7 jours ET le calendrier
 * mensuel (30 jours, avant dans le portefeuille) ; le pity n'est plus une icône à toucher mais un compteur « X/200 »
 * affiché en permanence dans l'en-tête (le panneau pity reste joignable par le code, plus par l'en-tête).
 * Avant :
 *  - SÉRIE DE CONNEXION : flamme + « 3/7 » ; chaque jour de visite avance la série, le 7e jour une récompense en
 *    boosters est à réclamer (pastille + flamme qui bat). Panneau : les 7 jours, où on en est, le bouton Réclamer.
 *  - PITY 6★ : « 142 » boosters avant un 6★ garanti. Panneau : la jauge et l'explication (200 boosters secs max).
 */
export const STREAK_ICON = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path class="fl" d="M12 3c.6 3.2 3.4 4.6 4.6 7.4 1.1 2.6.4 6-2.2 8.2a5.9 5.9 0 0 1-8.6-.6C3.6 15.3 4.3 11.6 7 9.4c-.2 1.6.4 2.7 1.5 3.4C8.2 9.6 9.6 6 12 3z" fill="currentColor" fill-opacity=".16"/><path d="M12 20a2.6 2.6 0 0 1-2.4-3.6c.4-1 1.3-1.7 2.4-2.9 1.1 1.2 2 1.9 2.4 2.9A2.6 2.6 0 0 1 12 20z" fill="currentColor" fill-opacity=".4"/></svg>`;
export const PITY_ICON = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 2.8l2.3 5.3 5.7.6-4.3 3.9 1.3 5.7L12 15.4l-5 2.9 1.3-5.7L4 8.7l5.7-.6z" fill="currentColor" fill-opacity=".14"/><path d="M12 2.8v12.6M4 8.7l16 0M7 18.3l10-9.6M17 18.3 7 8.7" stroke-opacity=".35"/></svg>`;

export function createStatus(backend: GameBackend, shell: Shell) {
  const pop = h('div', 'status-pop');
  pop.setAttribute('role', 'dialog');
  pop.id = 'pop-status';
  pop.inert = true; // fermé : ni focus ni lecteur d'écran
  const veil = h('div', 'um-veil');
  document.body.append(veil, pop);
  let on: 'streak' | 'pity' | null = null;

  /** série telle qu'elle sera comptée aujourd'hui (le serveur l'enregistre au premier battement) */
  const streakNow = () => {
    const s = backend.state.user?.streak;
    return touchStreak(s, Date.now()) ?? s;
  };

  function renderStreak() {
    const u = backend.state.user;
    const s = streakNow();
    pop.setAttribute('aria-label', tr('hdr.streakTitle'));
    if (!u || !s) {
      pop.innerHTML = `<div class="msn-head"><b>${tr('hdr.streak')}</b>${CLOSE_X}</div>${loginPrompt(backend, tr('st.hint'))}`;
      return;
    }
    const eco = backend.eco.snapshot;
    const day = streakDay(s);
    const claimable = streakClaimable(s);
    const dots = Array.from({ length: STREAK_CYCLE }, (_, i) => `<span class="st-d${i < day ? ' on' : ''}${i === day - 1 ? ' now' : ''}${i === STREAK_CYCLE - 1 ? ' gift' : ''}"><i>${i + 1}</i></span>`).join('');
    pop.innerHTML = `<div class="msn-head"><b>${tr('hdr.streak')}</b><span>${tr('st.inARow', { days: plural(s.count, 'jour') })}</span>${CLOSE_X}</div>
      <div class="w-sec"><div class="w-h"><b>${tr('st.streak7')}</b><span>${tr('st.weekly', { n: STREAK_REWARD })}</span></div>
      <div class="st-days">${dots}</div>
      <div class="st-txt">${claimable ? `<b>${tr('st.day7')}</b> ${tr('st.waiting')}` : day === STREAK_CYCLE ? tr('st.claimedCont') : `Jour <b>${day}</b> ${tr('st.outOf', { n: STREAK_CYCLE })}`}</div>
      ${claimable ? `<div class="msn-bonus ready"><span>+${STREAK_REWARD} boosters</span><button class="btn-primary st-claim">${tr('msn.claim')}</button></div>` : ''}</div>
      ${eco ? calendarHtml(eco) : ''}
      <div class="msn-foot">${tr('st.reset')}</div>`;
    pop.querySelector<HTMLButtonElement>('.w-cal')?.addEventListener('click', async (e) => {
      try {
        const r = await busyButton(e.currentTarget as HTMLElement, backend.eco.claimCalendar());
        shell.sfx.chime(4, 0.09);
        toast(tr('st.calToast', { day: r.day, coins: fmtCoins(r.coins), extra: r.packs > 1 ? tr('st.calPerfect', { n: r.packs }) : r.packs ? tr('st.calOne') : '' }), 'ok');
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
    pop.querySelector<HTMLButtonElement>('.st-claim')?.addEventListener('click', async (e) => {
      try {
        const n = await busyButton(e.currentTarget as HTMLElement, backend.claimStreak());
        shell.sfx.chime(4, 0.1);
        toast(tr('st.streakToast', { packs: plural(n, 'booster') }), 'ok');
        renderStreak();
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
  }

  function renderPity() {
    const u = backend.state.user;
    pop.setAttribute('aria-label', 'Pity 6★');
    if (!u) {
      pop.innerHTML = `<div class="msn-head"><b>Pity 6★</b>${CLOSE_X}</div>${loginPrompt(backend, tr('st.loginPity'))}`;
      return;
    }
    const left = pityLeft(u.pityCount);
    const pct = ((PITY_LIMIT - 1 - left) / (PITY_LIMIT - 1)) * 100;
    pop.innerHTML = `<div class="msn-head"><b>Pity 6★</b><span>${tr('st.pityCount', { n: u.pityCount, nf: fmtN(u.pityCount) })}</span>${CLOSE_X}</div>
      <div class="msn-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="st-txt">${left === 0 ? '<b>' + tr('st.pityNext') + '</b>' : tr('st.pityLeft', { n: left, nf: fmtN(left) })}</div>
      <div class="msn-foot">${tr('st.pityRule', { n: PITY_LIMIT, m: PITY_LIMIT })}</div>`;
  }

  const render = () => on && keepFocus(pop, on === 'streak' ? renderStreak : renderPity);
  const close = () => on && toggle(on, false);
  function toggle(which: 'streak' | 'pity', force?: boolean) {
    const open = force ?? on !== which;
    const was = on;
    on = open ? which : null;
    pop.classList.toggle('on', open);
    veil.classList.toggle('on', open);
    if (open) {
      pop.dataset.which = which;
      (which === 'streak' ? renderStreak : renderPity)();
      panelShown(pop, close); // « retour » le ferme, un seul panneau à la fois
      // série → pity : même panneau, même couche ; le focus repasse sur le ✕
      if (was) pop.querySelector<HTMLElement>('.pop-x')?.focus({ preventScroll: true });
    } else if (was) panelHidden(pop, close);
  }
  pop.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('.pop-x')) close();
    else if (t.closest('.login-cta')) backend.login();
  });
  veil.addEventListener('click', (e) => (e.preventDefault(), e.stopPropagation(), close()));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && on && toggle(on, false));
  backend.onChange(() => render());
  backend.eco.onChange(() => render());

  return {
    toggle,
    /** « 3/7 » · récompense à réclamer */
    streak: () => {
      const s = streakNow();
      const cal = backend.eco.snapshot?.calendar;
      return { day: streakDay(s), claimable: streakClaimable(s), calendar: !!cal && !cal.claimed };
    },
    /** boosters d'affilée sans 6★ (le compteur « X/200 » de l'en-tête) */
    pityCount: () => backend.state.user?.pityCount ?? 0,
    pityLeft: () => (backend.state.user ? pityLeft(backend.state.user.pityCount) : PITY_LIMIT - 1),
  };
}
