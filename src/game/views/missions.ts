import { t as tr } from '../../core/i18n';
import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import { MISSION_BONUS, missionLabel, missionsReady, type Mission } from '../../core/missions';
import { SUBTHEMES, subthemeById } from '../../core/sets/themes';
import { CLOSE_X, busyButton, errMsg, esc, fmtDelay, h, keepFocus, loginPrompt, panelHidden, panelShown, plural, toast } from '../ui';
import { dailyMissionCoins, weeklyLabel, weeklyReady, type WeeklyMission } from '../../core/weekly';
import { fmtCoins } from '../../core/economy';
import { COIN_ICON } from './wallet';

/**
 * MISSIONS DU JOUR : bouton dans l'en-tête (pastille = missions à réclamer) qui ouvre un panneau.
 * 3 missions tirées chaque jour à minuit, chacune rapporte des boosters ; les 3 réclamées → bonus.
 * Une fois par jour, on peut changer une mission. Un petit message prévient quand une mission est terminée.
 */
export const MISSION_ICON = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><path d="M17.6 6.4 21 3M18.4 3.4 21 3l-.4 2.6"/></svg>`;

/** Où aller pour avancer cette mission (bouton « Go ») : boutique (bonne fiche), contrats, échanges. */
function missionLink(m: Mission): { href: string; label: string } {
  switch (m.kind) {
    case 'openPack':
      return { href: `#/boutique/${m.param ?? 'bebou'}`, label: 'Go' };
    case 'subtheme': {
      const id = (m.param ?? '').replace(/^group:/, '');
      const st = subthemeById(id) ?? SUBTHEMES.find((x) => x.group?.id === id);
      return { href: `#/boutique/${st?.themeId ?? 'bebou'}`, label: 'Go' };
    }
    case 'contract':
    case 'dups':
      return { href: '#/contrats', label: 'Go' };
    case 'trade':
      return { href: '#/echanges', label: 'Go' };
    default:
      return { href: '#/boutique/bebou', label: 'Go' };
  }
}

export function createMissions(backend: GameBackend, shell: Shell) {
  const pop = h('div', 'missions-pop');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', tr('hdr.missions'));
  pop.id = 'pop-missions';
  pop.inert = true; // fermé : ni focus ni lecteur d'écran
  const veil = h('div', 'um-veil');
  document.body.append(veil, pop);
  let on = false;

  function row(m: Mission, rerolled: boolean) {
    const done = m.progress >= m.target;
    const r = h('div', `msn${done ? ' done' : ''}${m.claimed ? ' claimed' : ''}${!done && m.progress <= 0 ? ' todo' : ''}`);
    r.innerHTML = `<div class="msn-top"><span class="msn-t">${esc(missionLabel(m))}</span><span class="msn-rw" title="${tr('msn.reward')}">+${m.reward}<svg viewBox="0 0 16 20" width="10" height="12" aria-hidden="true"><path d="M3 4h10v12H3z" fill="currentColor"/></svg><span class="msn-coins">+${dailyMissionCoins(m)}${COIN_ICON}</span></span></div>
      <div class="msn-bar"><i style="width:${((m.progress / m.target) * 100).toFixed(1)}%"></i></div>
      <div class="msn-bot"><span class="msn-p">${m.claimed ? tr('msn.claimed') : `${m.progress} / ${m.target}`}</span>
      ${!m.claimed && done ? `<button class="btn-primary msn-claim">${tr('msn.claim')}</button>` : ''}
      ${!m.claimed && !done ? `<span class="msn-acts">${!rerolled ? `<button class="msn-re" title="${tr('msn.rerollTitle')}">${tr('msn.reroll')}</button>` : ''}<a class="msn-go" href="${missionLink(m).href}" title="${tr('msn.goTitle')}">${missionLink(m).label} →</a></span>` : ''}</div>`;
    const claim = r.querySelector<HTMLButtonElement>('.msn-claim');
    claim?.addEventListener('click', async () => {
      try {
        const n = await busyButton(claim, backend.claimMission(m.id));
        shell.sfx.chime(3, 0.08);
        toast(tr('msn.claimedToast', { packs: plural(n, 'booster'), coins: dailyMissionCoins(m) }), 'ok');
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
    r.querySelector('.msn-go')?.addEventListener('click', () => toggle(false));
    const re = r.querySelector<HTMLButtonElement>('.msn-re');
    re?.addEventListener('click', async () => {
      try {
        await busyButton(re, backend.rerollMission(m.id));
        shell.sfx.tick(1.2, 0.05);
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
    return r;
  }

  function render() {
    if (on) keepFocus(pop, draw);
  }
  function draw() {
    const s = backend.state.missions;
    if (!on) return;
    pop.innerHTML = '';
    if (!s) {
      pop.innerHTML = `<div class="msn-head"><b>${tr('hdr.missions')}</b>${CLOSE_X()}</div>${loginPrompt(backend, tr('msn.login'))}`;
      return;
    }
    const allClaimed = s.list.every((m) => m.claimed);
    pop.insertAdjacentHTML('beforeend', `<div class="msn-head"><b>${tr('hdr.missions')}</b><span>${tr('msn.newIn', { time: fmtDelay(s.resetAt - Date.now()) })}</span>${CLOSE_X()}</div>`);
    for (const m of s.list) pop.append(row(m, s.rerolled));
    const bonus = h('div', `msn-bonus${allClaimed ? ' ready' : ''}${s.bonusClaimed ? ' claimed' : ''}`);
    bonus.innerHTML = s.bonusClaimed
      ? tr('msn.bonusDone')
      : allClaimed
        ? `<span>${tr('msn.allDone')}</span><button class="btn-primary msn-bonus-b">${tr('msn.bonusBtn', { n: MISSION_BONUS })}</button>`
        : `<span>${tr('msn.bonusHint', { n: MISSION_BONUS })}</span>`;
    bonus.querySelector<HTMLButtonElement>('.msn-bonus-b')?.addEventListener('click', async (e) => {
      try {
        const n = await busyButton(e.currentTarget as HTMLElement, backend.claimMissionBonus());
        shell.sfx.chime(4, 0.1);
        toast(tr('msn.bonusToast', { packs: plural(n, 'booster') }), 'ok');
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
    pop.append(bonus);
    if (!s.rerolled && !allClaimed) pop.insertAdjacentHTML('beforeend', '<div class="msn-foot">' + tr('msn.rerollFoot') + '</div>');
    // missions de la semaine (spec économie) : ~200 pièces chacune
    const w = backend.eco.snapshot?.weekly;
    if (w) {
      pop.insertAdjacentHTML('beforeend', `<div class="msn-head msn-week"><b>${tr('msn.week')}</b><span>${tr('msn.newIn', { time: fmtDelay(w.resetAt - Date.now()) })}</span></div>`);
      for (const m of w.list) pop.append(weekRow(m));
    }
  }

  function weekRow(m: WeeklyMission) {
    const done = m.progress >= m.target;
    const r = h('div', `msn${done ? ' done' : ''}${m.claimed ? ' claimed' : ''}${!done && m.progress <= 0 ? ' todo' : ''}`);
    r.innerHTML = `<div class="msn-top"><span class="msn-t">${esc(weeklyLabel(m))}</span><span class="msn-rw" title="${tr('msn.reward')}"><span class="msn-coins">+${fmtCoins(m.reward)}${COIN_ICON}</span></span></div>
      <div class="msn-bar"><i style="width:${((m.progress / m.target) * 100).toFixed(1)}%"></i></div>
      <div class="msn-bot"><span class="msn-p">${m.claimed ? tr('msn.claimed') : `${m.progress} / ${m.target}`}</span>${!m.claimed && done ? '<button class="btn-primary msn-claim">' + tr('msn.claim') + '</button>' : ''}</div>`;
    const b = r.querySelector<HTMLButtonElement>('.msn-claim');
    b?.addEventListener('click', async () => {
      try {
        const n = await busyButton(b, backend.eco.claimWeekly(m.id));
        shell.sfx.chime(4, 0.09);
        toast(tr('msn.weekToast', { coins: fmtCoins(n) }), 'ok');
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
    return r;
  }

  const close = () => toggle(false);
  function toggle(force?: boolean) {
    const next = force ?? !on;
    if (next === on) return;
    on = next;
    pop.classList.toggle('on', on);
    veil.classList.toggle('on', on);
    if (on) {
      render();
      panelShown(pop, close); // « retour » le ferme, un seul panneau à la fois, focus dedans
    } else panelHidden(pop, close);
  }
  // ✕ (refait à chaque rendu : un seul écouteur sur le panneau)
  pop.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('.pop-x')) toggle(false);
    else if (t.closest('.login-cta')) backend.login();
  });
  veil.addEventListener('click', (e) => (e.preventDefault(), e.stopPropagation(), toggle(false)));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && on && toggle(false));

  // mission terminée : on prévient (une fois par mission)
  const told = new Set<string>();
  let primed = false;
  let lastSig = '';
  backend.onChange((st) => {
    const s = st.missions;
    const sig = s ? JSON.stringify([s.day, s.rerolled, s.bonusClaimed, s.list.map((m) => [m.id, m.progress, m.claimed])]) : `none:${st.ready}`;
    if (sig === lastSig) return;
    lastSig = sig;
    if (s) {
      for (const m of s.list) {
        if (m.progress >= m.target && !m.claimed && !told.has(m.id)) {
          told.add(m.id);
          if (primed) toast(tr('msn.doneToast', { label: missionLabel(m), packs: plural(m.reward, 'booster') }), 'ok');
        }
      }
      primed = true;
    }
    render();
  });

  /** nombre à afficher sur le bouton */
  const ready = () => missionsReady(backend.state.missions) + weeklyReady(backend.eco.snapshot?.weekly);
  backend.eco.onChange(() => render());
  return { toggle, ready };
}
