import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import type { EcoSnapshot } from '../eco';
import { ACHIEVEMENTS, CALENDAR_DAYS, CALENDAR_DOUBLE, CALENDAR_MONTH_TOTAL, achievementReward, calendarReward, fmtCoins } from '../../core/economy';
import { GAMES_OPEN } from '../../core/games';
import { busyButton, errMsg, esc, h, toast } from '../ui';
import '../games.css';

/**
 * PORTEFEUILLE : pastille de pièces dans l'en-tête (+N qui s'envole à chaque gain) et son panneau — calendrier de
 * connexion (30 jours), primes de complétion et succès à encaisser, derniers mouvements.
 */
export const COIN_ICON = `<svg class="coin-ico" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="url(#cg)" stroke="#7a5212" stroke-width="1.1"/><circle cx="10" cy="10" r="5.4" fill="none" stroke="#fff3c4" stroke-opacity=".55" stroke-width=".9"/><path d="M10 6.6v6.8M8 8.2c0-.9.9-1.5 2-1.5s2 .5 2 1.3c0 1.9-4 1-4 2.9 0 .8.9 1.4 2 1.4s2-.6 2-1.5" fill="none" stroke="#5a3a08" stroke-width="1.15" stroke-linecap="round"/><defs><radialGradient id="cg" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffe7a1"/><stop offset=".55" stop-color="#f2c46d"/><stop offset="1" stop-color="#b47a1e"/></radialGradient></defs></svg>`;
export const coinsHtml = (n: number, cls = '') => `<span class="coins-v ${cls}">${COIN_ICON}<b>${fmtCoins(n)}</b></span>`;

export function createWallet(backend: GameBackend, shell: Shell) {
  const pop = h('div', 'missions-pop wallet-pop');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Portefeuille');
  const veil = h('div', 'um-veil');
  document.body.append(veil, pop);
  let on = false;
  let hist: Awaited<ReturnType<GameBackend['eco']['coinHistory']>> | null = null;

  function calendarHtml(s: EcoSnapshot) {
    const c = s.calendar;
    let cells = '';
    for (let d = 1; d <= CALENDAR_DAYS; d++) {
      const r = calendarReward(d);
      const st = d < c.day ? 'past' : d === c.day ? (c.claimed ? 'today taken' : 'today') : 'next';
      cells += `<i class="cal-d ${st}${CALENDAR_DOUBLE.includes(d) ? ' x2' : ''}${d === CALENDAR_DAYS ? ' big' : ''}" title="Jour ${d} : ${fmtCoins(r.coins)} pièces${r.packs ? ' + 1 booster' : ''}${CALENDAR_DOUBLE.includes(d) ? ' (×2)' : ''}">${d === CALENDAR_DAYS ? '★' : d}</i>`;
    }
    return `<div class="w-sec"><div class="w-h"><b>Calendrier · jour ${c.day}/${CALENDAR_DAYS}</b><span>mois parfait ≈ ${fmtCoins(CALENDAR_MONTH_TOTAL)} + 1 booster</span></div>
      <div class="cal">${cells}</div>
      ${c.claimed ? `<div class="muted">Cadeau du jour pris ✓ — demain : ${fmtCoins(calendarReward(Math.min(CALENDAR_DAYS, c.day + 1)).coins)} pièces. Un jour manqué = retour au jour 1.</div>` : `<button class="btn-primary w-cal">Prendre le cadeau · +${fmtCoins(c.reward.coins)}${c.reward.packs ? ' + 1 booster' : ''}</button>`}</div>`;
  }

  function render() {
    if (!on) return;
    const s = backend.eco.snapshot;
    if (!s) {
      pop.innerHTML = '<div class="msn-head"><b>Portefeuille</b></div><div class="muted">Connecte-toi pour gagner des pièces.</div>';
      return;
    }
    const compTotal = s.completions.reduce((a, c) => a + c.reward, 0);
    const ach = s.achievements.claimable.map((id) => ACHIEVEMENTS.find((a) => a.id === id)!).filter(Boolean);
    const achTotal = ach.reduce((a, x) => a + achievementReward(x), 0);
    // GAMES pas encore ouvert (retours live n°1) : pas de liens vers l'espace Jeux, sauf pour les admins
    const games = GAMES_OPEN || s.isAdmin;
    pop.innerHTML = `<div class="msn-head"><b>Portefeuille</b>${games ? '<a href="#/jeux" class="w-link">Espace Jeux →</a>' : ''}</div>
      <div class="w-bal">${coinsHtml(s.coins, 'big')}<span class="muted">pièces 100 % virtuelles · jamais échangeables contre des cartes</span></div>
      ${calendarHtml(s)}
      <div class="w-sec"><div class="w-h"><b>À encaisser</b></div>
        <div class="w-row"><span>Complétion${s.completions.length ? ` · ${esc(s.completions.slice(0, 2).map((c) => c.label).join(', '))}${s.completions.length > 2 ? '…' : ''}` : ' : 5 pièces × cartes de chaque album bouclé'}</span>${s.completions.length ? `<button class="btn-primary w-comp">+${fmtCoins(compTotal)}</button>` : '<span class="muted">rien</span>'}</div>
        <div class="w-row"><span>Succès${ach.length ? ` · ${esc(ach.slice(0, 2).map((a) => a.label).join(', '))}${ach.length > 2 ? '…' : ''}` : ` : ${s.econ.achievements.length}/${ACHIEVEMENTS.length} obtenus`}</span>${ach.length ? `<button class="btn-primary w-ach">+${fmtCoins(achTotal)}</button>` : '<a class="w-link" href="#/succes">voir</a>'}</div>
        ${games ? '<div class="w-row"><span>Doublons à brûler</span><a class="w-link" href="#/jeux/forge">la forge →</a></div>' : ''}
      </div>
      <div class="w-sec"><div class="w-h"><b>Derniers mouvements</b>${games ? '<a class="w-link" href="#/jeux/historique">tout</a>' : ''}</div><div class="w-hist">${
        hist ? (hist.length ? hist.slice(0, 7).map((t) => `<div class="w-tx"><span>${esc(t.label)}</span><b class="${t.amount > 0 ? 'plus' : 'minus'}">${t.amount > 0 ? '+' : '−'}${fmtCoins(Math.abs(t.amount))}</b></div>`).join('') : '<div class="muted">Aucun mouvement pour l’instant.</div>') : '<div class="muted">…</div>'
      }</div></div>`;
    pop.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggle(false)));
    const bind = (sel: string, fn: () => Promise<string>) => {
      const b = pop.querySelector<HTMLButtonElement>(sel);
      b?.addEventListener('click', async () => {
        try {
          const msg = await busyButton(b, fn());
          shell.sfx.chime(4, 0.09);
          toast(msg, 'ok');
          void loadHist();
        } catch (e) {
          toast(errMsg(e), 'err');
        }
      });
    };
    bind('.w-cal', async () => {
      const r = await backend.eco.claimCalendar();
      return `Jour ${r.day} : +${fmtCoins(r.coins)} pièces${r.packs ? ' et 1 booster offert' : ''} !`;
    });
    bind('.w-comp', async () => {
      const r = await backend.eco.claimCompletions();
      return `Complétion : +${fmtCoins(r.coins)} pièces (${r.sets.map((x) => x.label).join(', ')})`;
    });
    bind('.w-ach', async () => {
      const r = await backend.eco.claimAchievements();
      return `Succès : +${fmtCoins(r.coins)} pièces !`;
    });
  }

  async function loadHist() {
    try {
      hist = await backend.eco.coinHistory();
    } catch {
      hist = [];
    }
    render();
  }

  function toggle(force?: boolean) {
    on = force ?? !on;
    pop.classList.toggle('on', on);
    veil.classList.toggle('on', on);
    if (on) {
      render();
      void loadHist();
    }
  }
  veil.addEventListener('click', (e) => (e.preventDefault(), e.stopPropagation(), toggle(false)));
  window.addEventListener('keydown', (e) => e.key === 'Escape' && on && toggle(false));
  backend.eco.onChange(() => render());

  /** pastille : quelque chose à prendre (calendrier, primes, succès) */
  const ready = () => {
    const s = backend.eco.snapshot;
    return s ? Number(!s.calendar.claimed) + s.completions.length + s.achievements.claimable.length : 0;
  };
  return { toggle, ready };
}
