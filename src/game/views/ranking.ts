import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import { h } from '../ui';
import { createLeaderboard } from './leaderboard';

/** CLASSEMENT (#/classement, onglet de la navigation — retours live n°1) : le classement entre nous, en page dédiée. */
export interface RankingView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
}

export function createRankingView(backend: GameBackend, shell: Shell): RankingView {
  const el = h('section', 'view ranking');
  el.innerHTML = `<div class="rk-wrap"><header class="rk-head"><span class="kicker">CLASSEMENT</span><h1>Entre nous</h1><p class="muted">Complétion de la collection (le classement roi), 6★ & secrets, boosters ouverts, échanges conclus, série de connexion.</p></header></div>`;
  const lb = createLeaderboard(backend, shell);
  el.querySelector('.rk-wrap')!.append(lb.el);
  return {
    el,
    enter() {
      shell.show(null);
      shell.setDimmed(true);
      el.scrollTo({ top: 0 });
      void lb.load();
    },
    leave() {},
  };
}
