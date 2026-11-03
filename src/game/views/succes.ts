import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import { ACHIEVEMENTS, ACHIEVEMENT_TIERS, achievementDone, achievementReward, fmtCoins, type Achievement } from '../../core/economy';
import { cosmeticsOf } from '../../core/cosmetics';
import { COIN_ICON } from './wallet';
import { busyButton, errMsg, esc, h, plural, toast } from '../ui';

/**
 * SUCCÈS (#/succes, onglet de la navigation — retours live n°1) : les 36 succès de l'espace Jeux (src/core/economy.ts),
 * avec leur progression, leur prime en pièces (paliers 50 / 150 / 500 / 2 000) et les COSMÉTIQUES qu'ils débloquent
 * (bannières, cadres, titres, badges du profil : tout se débloque via les succès, rien ne s'achète).
 */
export interface SuccesView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
}

type Filter = 'all' | 'ready' | 'got' | 'todo';
const TIER_LABEL = ['Facile', 'Moyen', 'Difficile', 'Légendaire'];

export function createSuccesView(backend: GameBackend, shell: Shell): SuccesView {
  const el = h('section', 'view succes');
  el.innerHTML = `
    <div class="sc-wrap">
      <header class="sc-head">
        <div><span class="kicker">SUCCÈS</span><h1>Tes succès</h1>
        <p class="muted">Chaque succès rapporte des pièces et peut débloquer une bannière, un cadre, un titre ou un badge pour ton profil. Rien ne s’achète : tout se gagne en jouant.</p></div>
        <div class="sc-score"></div>
      </header>
      <div class="sc-bar">
        <div class="seg sc-filters" aria-label="Filtrer les succès"><button data-f="all" class="on" aria-pressed="true">Tous</button><button data-f="ready" aria-pressed="false">À encaisser</button><button data-f="got" aria-pressed="false">Obtenus</button><button data-f="todo" aria-pressed="false">En cours</button></div>
        <button class="btn-primary sc-claim" hidden></button>
      </div>
      <div class="sc-recap" role="status" hidden></div>
      <div class="sc-grid"></div>
    </div>`;
  const score = el.querySelector<HTMLElement>('.sc-score')!;
  const grid = el.querySelector<HTMLElement>('.sc-grid')!;
  const claimBtn = el.querySelector<HTMLButtonElement>('.sc-claim')!;
  const recap = el.querySelector<HTMLElement>('.sc-recap')!;
  let filter: Filter = 'all';

  el.querySelectorAll<HTMLButtonElement>('.sc-filters button').forEach((b) =>
    b.addEventListener('click', () => {
      filter = b.dataset.f as Filter;
      el.querySelectorAll<HTMLButtonElement>('.sc-filters button').forEach((x) => (x.classList.toggle('on', x === b), x.setAttribute('aria-pressed', String(x === b))));
      render();
    }),
  );
  claimBtn.addEventListener('click', async () => {
    // succès encaissés à l'instant : pour annoncer les cosmétiques qu'ils ont débloqués (audit UX3-18)
    const before = new Set(backend.eco.snapshot?.achievements.claimable ?? []);
    try {
      const r = await busyButton(claimBtn, backend.eco.claimAchievements());
      shell.sfx.chime(4, 0.1);
      toast(`Succès : +${fmtCoins(r.coins)} pièces !`, 'ok');
      const cos = ACHIEVEMENTS.filter((a) => before.has(a.id)).flatMap((a) => cosmeticsOf(a.id));
      recap.hidden = false;
      recap.innerHTML = `<b>+${fmtCoins(r.coins)} ${COIN_ICON}</b>${cos.length ? `<span>Débloqué pour ton profil : ${cos.map((c) => `${c.kind === 'Badge' ? `${c.c.glyph ?? '●'} ` : ''}${c.kind} « ${esc(c.c.label)} »`).join(', ')}</span><a class="btn-primary sc-equip" href="#/profil">Équiper →</a>` : '<span>Pièces ajoutées à ta bourse.</span>'}<button class="sc-recap-x" aria-label="Fermer">✕</button>`;
      recap.querySelector('.sc-equip')?.addEventListener('click', () => sessionStorage.setItem('bebou.openCosm', '1'));
      recap.querySelector('.sc-recap-x')!.addEventListener('click', () => (recap.hidden = true));
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  });

  function card(a: Achievement, cur: number, got: boolean, ready: boolean): HTMLElement {
    const c = h('div', `sc-c t${a.tier}${got ? ' got' : ready ? ' ready' : ''}`);
    const rewards = cosmeticsOf(a.id);
    const pct = Math.min(1, cur / a.target);
    c.innerHTML = `
      <div class="sc-top"><span class="sc-tier">${TIER_LABEL[a.tier - 1]}</span><span class="sc-coins">${COIN_ICON}${fmtCoins(achievementReward(a))}</span></div>
      <b class="sc-name">${got ? '✓ ' : ''}${esc(a.label)}</b>
      <span class="sc-how">${esc(a.how)}</span>
      <i class="sc-pb"><i style="width:${(pct * 100).toFixed(1)}%"></i></i>
      <em class="sc-n">${got ? 'obtenu' : ready ? `atteint · prime à encaisser${rewards.length ? ' (cosmétique déjà débloqué)' : ''}` : `${fmtCoins(Math.min(cur, a.target))} / ${fmtCoins(a.target)}`}</em>
      ${rewards.length ? `<div class="sc-rw">${rewards.map((r) => `<span class="sc-cos${got || ready ? ' ok' : ''} k-${r.kind === 'Bannière' ? 'banner' : r.kind === 'Cadre' ? 'frame' : r.kind === 'Titre' ? 'title' : 'badge'}"${r.kind === 'Bannière' || r.kind === 'Cadre' ? ` style="--sw:${r.c.css}"` : ''}>${r.kind === 'Badge' ? r.c.glyph ?? '●' : r.kind === 'Bannière' || r.kind === 'Cadre' ? '<i></i>' : '«'} ${r.kind} · ${esc(r.c.label)}${got || ready ? ' <b>✓ débloqué</b>' : ''}</span>`).join('')}</div>` : ''}`;
    return c;
  }

  function render() {
    const s = backend.eco.snapshot;
    if (!s) {
      score.innerHTML = '';
      claimBtn.hidden = true;
      grid.innerHTML = `<div class="muted">${backend.state.mode === 'online' && !backend.state.user ? 'Connecte-toi pour voir tes succès.' : 'Chargement…'}</div>`;
      return;
    }
    const claimed = new Set(s.econ.achievements);
    const claimable = new Set(s.achievements.claimable);
    const done = ACHIEVEMENTS.filter((a) => achievementDone(a, s.achievements.stats)).length;
    const pending = ACHIEVEMENTS.filter((a) => claimable.has(a.id));
    const total = pending.reduce((n, a) => n + achievementReward(a), 0);
    score.innerHTML = `<div class="sc-big"><b>${done}</b><span>/ ${ACHIEVEMENTS.length}</span></div><div class="muted">succès débloqués</div><i class="sc-pb big"><i style="width:${((done / ACHIEVEMENTS.length) * 100).toFixed(1)}%"></i></i>`;
    claimBtn.hidden = !pending.length;
    claimBtn.innerHTML = `Encaisser ${plural(pending.length, 'succès', 'succès')} · +${fmtCoins(total)} ${COIN_ICON}`;
    const list = ACHIEVEMENTS.filter((a) => {
      const got = claimed.has(a.id);
      const ready = claimable.has(a.id);
      return filter === 'all' || (filter === 'got' && got) || (filter === 'ready' && ready) || (filter === 'todo' && !got && !ready);
    });
    // à encaisser d'abord, puis en cours (les plus avancés en premier), puis obtenus
    const rank = (a: Achievement) => (claimable.has(a.id) ? 0 : claimed.has(a.id) ? 2 : 1);
    const prog = (a: Achievement) => Math.min(1, (s.achievements.stats[a.stat] ?? 0) / a.target);
    list.sort((a, b) => rank(a) - rank(b) || prog(b) - prog(a) || a.tier - b.tier);
    grid.replaceChildren(...list.map((a) => card(a, s.achievements.stats[a.stat] ?? 0, claimed.has(a.id), claimable.has(a.id))));
    if (!list.length) grid.innerHTML = `<div class="muted">${filter === 'ready' ? 'Rien à encaisser pour l’instant.' : filter === 'got' ? 'Pas encore de succès obtenu : ouvre des boosters !' : 'Tout est fait. Chapeau.'}</div>`;
  }
  backend.eco.onChange(() => el.isConnected && render());
  backend.onChange(() => el.isConnected && !backend.eco.snapshot && render());

  return {
    el,
    enter() {
      shell.show(null);
      shell.setDimmed(true);
      el.scrollTo({ top: 0 });
      render();
    },
    leave() {},
  };
}

/** Paliers (pour la légende). */
export const SUCCESS_TIERS = ACHIEVEMENT_TIERS;
