import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import type { RouletteView } from '../eco';
import { ROULETTE_NUMBERS } from '../../core/games';
import { fmtCoins } from '../../core/economy';
import { esc, h, navigate, popLayer, pushLayer } from '../ui';
import { haptics } from '../../core/haptics';
import { createRouletteWheel } from './rouletteWheel';
import '../casino.css';
import { t as tr } from '../../core/i18n';
import '../../core/i18n/fr/game.views.games'; // (textes de ce module, version anglaise)

/**
 * (13/11, retours Hugo) REJEU DU DERNIER TIRAGE À LA CONNEXION : « tu te connectes, ça te montre le dernier tirage (une
 * fois, pas en boucle) et ça te propose de jouer à la fin ». Un tirage (10 h, 20 h) n'est rejoué qu'une fois par
 * appareil, seulement s'il a moins de 13 h, et jamais s'il a déjà été vu sur la page Roulette. La roue tourne
 * (rouletteWheel.ts), le résultat s'affiche, puis le prochain tirage et « Miser ».
 */
const KEY = 'bebou.rouletteSeen';
const FRESH_MS = 13 * 3600_000;
const seen = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return 'x'; // stockage bloqué : pas de rejeu (sinon à chaque visite)
  }
};
export function markRouletteSeen(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* rien */
  }
}

/** heure du tirage, d'après son étiquette (« 2026-11-13 · 20 h ») */
const hourOf = (day: string) => /·\s*(\d+\s*h)/.exec(day)?.[1] ?? '';

export function startRouletteReplay(backend: GameBackend, shell: Shell, o: { route(): string; busy(): boolean }) {
  if (backend.state.mode === 'online' && !backend.state.user) return;
  let stop: (() => void) | null = null;
  let done = false;
  stop = backend.eco.watchRoulette((r) => {
    if (!r || done) return;
    done = true;
    queueMicrotask(() => stop?.());
    const p = r.past[0];
    if (!p?.result || !p.result.number || seen() === p.id) return;
    if (!p.drawnAt || Date.now() - p.drawnAt > FRESH_MS) return void markRouletteSeen(p.id);
    // on attend un moment calme (pas d'ouverture, de visionneuse ni de fenêtre) ; abandon au bout de 3 min
    let tries = 0;
    const wait = () => {
      if (o.route() === 'jeux' && location.hash.includes('roulette')) return markRouletteSeen(p.id);
      if (o.busy() || document.hidden) return void (++tries < 90 && setTimeout(wait, 2000));
      show(r, p);
    };
    wait();
  });

  function show(r: RouletteView, p: RouletteView['past'][number]) {
    markRouletteSeen(p.id);
    const res = p.result!;
    const at = hourOf(p.day);
    const mine = r.me ? p.bets.find((b) => b.userId === r.me) : undefined;
    const veil = h('div', 'rr-veil');
    veil.setAttribute('role', 'dialog');
    veil.setAttribute('aria-modal', 'true');
    veil.setAttribute('aria-label', tr('rr.aria', { at: at || tr('rr.earlier') }));
    veil.innerHTML = `<div class="rr-box">
      <button class="rr-x" aria-label="${tr('common.close')}">✕</button>
      <span class="rr-k">Roulette · ${p.bets.length ? tr('rr.players', { n: p.bets.length }) : tr('rr.nobodyBet')}</span>
      <h2 class="rr-h">${tr('rr.title', { at: esc(at || tr('rr.earlier')) })}</h2>
      <div class="rr-w"></div>
      <div class="rr-res" aria-live="polite">${mine ? `${tr('rr.yours')} <b>${mine.numbers.join(', ')}</b>` : '&nbsp;'}</div>
      <div class="rr-next" hidden></div>
      <div class="rr-acts" hidden><a class="btn-primary rr-go" href="#/jeux/roulette">${tr('rr.betNext')}</a><button class="btn-ghost rr-later">${tr('rr.later')}</button></div>
    </div>`;
    document.body.append(veil);
    const wheel = createRouletteWheel(ROULETTE_NUMBERS);
    veil.querySelector('.rr-w')!.append(wheel.el);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      popLayer(close);
      veil.remove();
    };
    pushLayer(close);
    veil.querySelector('.rr-x')!.addEventListener('click', close);
    veil.querySelector('.rr-later')!.addEventListener('click', close);
    veil.querySelector('.rr-go')!.addEventListener('click', (e) => {
      e.preventDefault();
      close();
      navigate('#/jeux/roulette');
    });
    veil.addEventListener('click', (e) => e.target === veil && close());
    let ticks = 0;
    void wheel
      .spinTo(res.number, 5200, () => {
        if (++ticks % 2 === 0) shell.sfx.tick(1.1, 0.05);
      })
      .then(() => {
        if (closed) return;
        const won = !!res.winnerId && res.winnerId === r.me;
        haptics.pulse(won ? [20, 40, 30] : 12);
        shell.sfx.chime(won ? 7 : 3, won ? 0.14 : 0.08);
        veil.querySelector('.rr-res')!.innerHTML = res.winnerName
          ? tr(won ? 'rr.youWin' : 'rr.theyWin', { n: res.number, name: esc(res.winnerName), v: fmtCoins(res.potValue) })
          : tr('rr.noWinner', { n: res.number, v: fmtCoins(res.potValue) }) + (mine ? tr('rr.close') : '');
        const next = veil.querySelector<HTMLElement>('.rr-next')!;
        if (r.round) {
          next.hidden = false;
          next.textContent = tr('rr.next', { at: hourOf(r.round.day) || tr('rr.soon'), v: fmtCoins(r.round.pot.value), who: r.round.bets.length ? tr('rr.already', { n: r.round.bets.length }) : tr('rr.nobodyYet') });
        }
        veil.querySelector<HTMLElement>('.rr-acts')!.hidden = false;
      });
  }
}
