import { locale } from '../../core/i18n';
import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import { ACHIEVEMENTS, ACHIEVEMENT_LADDERS, ACHIEVEMENT_TIERS, achievementDone, achievementPacks, achievementReward, fmtCoins, ladderLevel, type Achievement, type AchievementLadder, type AchievementStats } from '../../core/economy';
import type { FriendAch } from '../eco';
import { cosmeticsOf } from '../../core/cosmetics';
import { COIN_ICON } from './wallet';
import { busyButton, errMsg, esc, h, plural, toast } from '../ui';
import { guarded, isPending } from './safety';

/**
 * SUCCÈS (#/succes, onglet de la navigation — retours live n°1) : les 36 succès de l'espace Jeux (src/core/economy.ts),
 * avec leur progression, leur prime en pièces (paliers 50 / 150 / 500 / 2 000) et les COSMÉTIQUES qu'ils débloquent
 * (bannières, cadres, titres, badges du profil : tout se débloque via les succès, rien ne s'achète).
 * Retours live 02 (§8, §9) : SUCCÈS À PALIERS — une carte par mécanique (« Ouvrir des boosters » : 10 → 100 → 500 →
 * 2 000), chaque palier avec sa récompense mixte (pièces + boosters, cosmétiques aux gros seuils) — et la bascule
 * « AMIS » : pour chaque mécanique, qui est le premier / le plus avancé parmi mes amis.
 * + les PRIMES DE COMPLÉTION (retours live 02 : sorties de l'espace Jeux, ce n'est pas un jeu) — #/succes/primes y mène
 * (#/jeux/primes redirige ici) ; elles restent aussi encaissables depuis le portefeuille.
 */
export interface SuccesView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

type Filter = 'all' | 'ready' | 'got' | 'todo';

export function createSuccesView(backend: GameBackend, shell: Shell): SuccesView {
  const el = h('section', 'view succes');
  el.innerHTML = `
    <div class="sc-wrap">
      <header class="sc-head">
        <div><span class="kicker">SUCCÈS</span><h1>Tes succès</h1>
        <p class="muted">Chaque palier donne UNE récompense : des pièces (et des boosters), ou un titre, un badge, un cadre, une vitrine pour ton profil, ou une animation d’ouverture des boosters. Rien ne s’achète : tout se gagne en jouant.</p></div>
        <div class="sc-score"></div>
      </header>
      <div class="sc-bar">
        <div class="seg sc-who" aria-label="Voir"><button data-w="me" class="on" aria-pressed="true">Moi</button><button data-w="friends" aria-pressed="false">Amis</button></div>
        <div class="seg sc-filters" aria-label="Filtrer les succès"><button data-f="all" class="on" aria-pressed="true">Tous</button><button data-f="ready" aria-pressed="false">À encaisser</button><button data-f="got" aria-pressed="false">Obtenus</button><button data-f="todo" aria-pressed="false">En cours</button></div>
        <button class="btn-primary sc-claim" hidden></button>
      </div>
      <div class="sc-recap" role="status" hidden></div>
      <section class="sc-primes" id="primes" aria-label="Primes de complétion"></section>
      <div class="sc-grid"></div>
    </div>`;
  const score = el.querySelector<HTMLElement>('.sc-score')!;
  const grid = el.querySelector<HTMLElement>('.sc-grid')!;
  const claimBtn = el.querySelector<HTMLButtonElement>('.sc-claim')!;
  const recap = el.querySelector<HTMLElement>('.sc-recap')!;
  const primesEl = el.querySelector<HTMLElement>('.sc-primes')!;
  let filter: Filter = 'all';
  /** bascule Moi / Amis (retours live 02, §9) */
  let who: 'me' | 'friends' = 'me';
  let friends: FriendAch[] | null = null;
  let friendsAt = 0;
  el.querySelectorAll<HTMLButtonElement>('.sc-who button').forEach((b) =>
    b.addEventListener('click', () => {
      who = b.dataset.w as 'me' | 'friends';
      el.querySelectorAll<HTMLButtonElement>('.sc-who button').forEach((x) => (x.classList.toggle('on', x === b), x.setAttribute('aria-pressed', String(x === b))));
      if (who === 'friends') void loadFriends();
      render();
    }),
  );
  async function loadFriends() {
    if (friends && Date.now() - friendsAt < 30_000) return;
    try {
      friends = await backend.eco.friendsAchievements();
      friendsAt = Date.now();
    } catch (e) {
      friends = [];
      toast(errMsg(e), 'err');
    }
    if (el.isConnected) render();
  }

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
      toast(r.coins || r.packs ? `Succès : +${fmtCoins(r.coins)} pièces${r.packs ? ` et ${plural(r.packs, 'booster')}` : ''} !` : 'Succès encaissés !', 'ok');
      const all = ACHIEVEMENTS.filter((a) => before.has(a.id)).flatMap((a) => cosmeticsOf(a.id));
      // (11/11) une animation d'ouverture débloquée se choisit dans la fiche d'un booster, pas sur le profil
      const opens = all.filter((c) => c.kind === 'Ouverture');
      const cos = all.filter((c) => c.kind !== 'Ouverture');
      if (opens.length) toast(`Animation d’ouverture débloquée : ${opens.map((c) => `« ${c.c.label} »`).join(', ')}. Choisis-la dans la fiche d’un booster.`, 'ok');
      recap.hidden = false;
      recap.innerHTML = `<b>${r.coins ? `+${fmtCoins(r.coins)} ${COIN_ICON}` : ''}${r.packs ? `${r.coins ? ' · ' : ''}+${plural(r.packs, 'booster')}` : ''}</b>${cos.length ? `<span>Débloqué pour ton profil : ${cos.map((c) => `${c.kind === 'Badge' ? `${c.c.glyph ?? '●'} ` : ''}${c.kind} « ${esc(c.c.label)} »`).join(', ')}</span><a class="btn-primary sc-equip" href="#/profil">Équiper →</a>` : '<span>Pièces ajoutées à ta bourse.</span>'}<button class="sc-recap-x" aria-label="Fermer">✕</button>`;
      recap.querySelector('.sc-equip')?.addEventListener('click', () => sessionStorage.setItem('bebou.openCosm', '1'));
      recap.querySelector('.sc-recap-x')!.addEventListener('click', () => (recap.hidden = true));
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  });

  /**
   * (retours live 6, C10) UNE récompense par palier, en une puce sur une ligne : les pièces (+ boosters) OU le
   * cosmétique (titre, badge, cadre, vitrine) — plus le pavé bannière + cadre + titre + badge + couleur + vitrine.
   */
  const KIND_CLS: Record<string, string> = { Bannière: 'banner', Cadre: 'frame', Titre: 'title', Couleur: 'frame', Vitrine: 'banner', Badge: 'badge', Ouverture: 'open' };
  const rewardHtml = (a: Achievement, ok = false) => {
    if (a.cos) {
      const r = cosmeticsOf(a.id)[0];
      if (!r) return '';
      const sw = r.kind === 'Cadre' || r.kind === 'Vitrine' || r.kind === 'Bannière' ? ` style="--sw:${r.c.css}"` : '';
      const ico = r.kind === 'Badge' ? r.c.glyph ?? '●' : r.kind === 'Titre' ? '«' : '<i></i>';
      return `<span class="sc-cos${ok ? ' ok' : ''} k-${KIND_CLS[r.kind]}${r.c.anim ? ' anim' : ''}"${sw} title="${esc(`${r.kind} « ${r.c.label} »`)}">${ico} ${r.kind === 'Titre' ? '' : `${r.kind} · `}${esc(r.c.label)}${r.kind === 'Titre' ? ' »' : ''}</span>`;
    }
    const packs = achievementPacks(a);
    return `<span class="sc-coins">${COIN_ICON}${fmtCoins(achievementReward(a))}${packs ? ` <span class="sc-pk">+${plural(packs, 'booster')}</span>` : ''}</span>`;
  };

  /** Une mécanique = un succès à paliers : niveau atteint, prochain seuil, et la liste des paliers avec leur récompense. */
  function ladderCard(l: AchievementLadder, st: AchievementStats, claimed: Set<string>, claimable: Set<string>): HTMLElement {
    const cur = st[l.stat] ?? 0;
    const lvl = ladderLevel(l, st);
    const next = l.steps[lvl];
    const prevT = lvl ? l.steps[lvl - 1].target : 0;
    const ready = l.steps.some((a) => claimable.has(a.id));
    const all = lvl === l.steps.length;
    const c = h('div', `sc-c sc-ladder${all ? ' got' : ready ? ' ready' : ''}`);
    const pct = next ? Math.min(1, (cur - prevT) / Math.max(1, next.target - prevT)) : 1;
    c.innerHTML = `
      <div class="sc-top"><span class="sc-tier">Palier ${lvl}/${l.steps.length}</span>${next ? rewardHtml(next) : '<span class="sc-n">tous les paliers ✓</span>'}</div>
      <b class="sc-name">${all ? '✓ ' : ''}${esc(l.label)}</b>
      <span class="sc-how">${next ? `Prochain : ${esc(next.label)} — ${esc(next.how)}` : `Dernier palier : ${esc(l.steps[l.steps.length - 1].label)}`}</span>
      <i class="sc-pb"><i style="width:${(pct * 100).toFixed(1)}%"></i></i>
      <em class="sc-n">${ready ? 'palier atteint · prime à encaisser' : next ? `${fmtCoins(Math.min(cur, next.target))} / ${fmtCoins(next.target)}` : `${fmtCoins(cur)}`}</em>
      <ol class="sc-steps">${l.steps
        // (retours 05/11) paliers révélés UN PAR UN : ceux atteints + le prochain ; les suivants restent cachés
        // (seuil, nom et récompenses compris) jusqu'à ce que le précédent soit atteint
        .slice(0, lvl + 1)
        .map((a) => {
          const got = claimed.has(a.id);
          const rd = claimable.has(a.id);
          return `<li class="${got ? 'got' : rd ? 'ready' : achievementDone(a, st) ? 'ready' : ''}"><span class="sc-st-t">${got ? '✓' : rd ? '★' : '○'} ${fmtCoins(a.target)}</span><span class="sc-st-l">${esc(a.label)}</span>${rewardHtml(a, got || rd)}</li>`;
        })
        .join('')}${l.steps.length > lvl + 1 ? `<li class="sc-hidden"><span class="sc-st-t">🔒</span><span class="sc-st-l">${l.steps.length - lvl - 1 > 1 ? `${l.steps.length - lvl - 1} paliers à découvrir` : '1 palier à découvrir'}</span><span class="sc-st-h">se dévoile au palier précédent</span></li>` : ''}</ol>`;
    return c;
  }

  /** Bascule « Amis » : par mécanique, le classement de mes amis (et moi), le plus avancé en tête. */
  function friendsCard(l: AchievementLadder, list: FriendAch[]): HTMLElement {
    const rows = [...list].sort((a, b) => (b.stats[l.stat] ?? 0) - (a.stats[l.stat] ?? 0) || a.name.localeCompare(b.name, locale()));
    const c = h('div', 'sc-c sc-ladder sc-fr');
    const top = rows[0];
    c.innerHTML = `<div class="sc-top"><span class="sc-tier">${l.steps.length} paliers</span>${top && (top.stats[l.stat] ?? 0) > 0 ? `<span class="sc-lead">👑 ${esc(top.me ? 'Toi' : top.name)}</span>` : ''}</div>
      <b class="sc-name">${esc(l.label)}</b>
      <ol class="sc-frl">${rows
        .map((f, i) => {
          const v = f.stats[l.stat] ?? 0;
          const lv = ladderLevel(l, f.stats);
          return `<li class="${f.me ? 'me' : ''}"><span class="sc-fr-i">${i + 1}</span><span class="sc-fr-n">${esc(f.me ? 'Toi' : f.name)}</span><span class="sc-fr-l">palier ${lv}/${l.steps.length}</span><b>${fmtCoins(v)}</b></li>`;
        })
        .join('')}</ol>`;
    return c;
  }

  /** Primes de complétion : 5 pièces × cartes de chaque ensemble bouclé (album, groupe d'albums, thème). */
  function renderPrimes() {
    const s = backend.eco.snapshot;
    primesEl.hidden = !s;
    if (!s) return;
    const total = s.completions.reduce((a, c) => a + c.reward, 0);
    const done = s.econ.completions.length;
    primesEl.classList.toggle('ready', s.completions.length > 0);
    primesEl.innerHTML = `<div class="sc-pr-h"><b>Primes de complétion</b><span class="muted">5 pièces × cartes de chaque album, groupe ou thème bouclé${done ? ` · ${plural(done, 'prime déjà encaissée', 'primes déjà encaissées')}` : ''}</span>${s.completions.length ? `<button class="btn-primary sc-pr-claim"${isPending('claim') ? ' disabled' : ''}>Encaisser · +${fmtCoins(total)} ${COIN_ICON}</button>` : ''}</div>
      ${s.completions.length ? `<div class="sc-pr-list">${s.completions.map((c) => `<span class="sc-pr">${esc(c.label)} · ${c.size} cartes · <b>+${fmtCoins(c.reward)}</b></span>`).join('')}</div>` : '<div class="muted sc-pr-none">Rien à encaisser pour l’instant : boucle un album dans ta <a href="#/collection/albums">collection</a> (famille de 30 cartes = 150 pièces).</div>'}`;
    primesEl.querySelector<HTMLElement>('.sc-pr-claim')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      void guarded('claim', btn, async () => {
        try {
          const r = await busyButton(btn, backend.eco.claimCompletions());
          shell.sfx.chime(6, 0.12);
          toast(`Complétion : +${fmtCoins(r.coins)} pièces (${r.sets.map((x) => x.label).join(', ')})`, 'ok');
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      }, { keepOnSuccess: true });
    });
  }

  function render() {
    renderPrimes();
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
    const packsN = pending.reduce((n, a) => n + achievementPacks(a), 0);
    score.innerHTML = `<div class="sc-big"><b>${done}</b><span>/ ${ACHIEVEMENTS.length}</span></div><div class="muted">paliers de succès débloqués</div><i class="sc-pb big"><i style="width:${((done / ACHIEVEMENTS.length) * 100).toFixed(1)}%"></i></i>`;
    claimBtn.hidden = !pending.length;
    claimBtn.innerHTML = `Encaisser ${plural(pending.length, 'palier', 'paliers')}${total ? ` · +${fmtCoins(total)} ${COIN_ICON}` : ''}${packsN ? ` + ${plural(packsN, 'booster')}` : ''}`;
    if (who === 'friends') {
      if (!friends) {
        grid.innerHTML = '<div class="muted">Chargement des succès de tes amis…</div>';
        return;
      }
      if (friends.length <= 1) {
        grid.innerHTML = '<div class="muted">Ajoute des amis (onglet <a href="#/amis">Amis</a>) pour comparer vos succès.</div>';
        return;
      }
      grid.replaceChildren(...ACHIEVEMENT_LADDERS.map((l) => friendsCard(l, friends!)));
      return;
    }
    const st = s.achievements.stats;
    const list = ACHIEVEMENT_LADDERS.filter((l) => {
      const ready = l.steps.some((a) => claimable.has(a.id));
      const all = l.steps.every((a) => claimed.has(a.id));
      const some = l.steps.some((a) => claimed.has(a.id));
      return filter === 'all' || (filter === 'got' && some) || (filter === 'ready' && ready) || (filter === 'todo' && !all);
    });
    // à encaisser d'abord, puis en cours (les plus avancés vers le prochain palier), puis terminés
    const rank = (l: AchievementLadder) => (l.steps.some((a) => claimable.has(a.id)) ? 0 : l.steps.every((a) => claimed.has(a.id)) ? 2 : 1);
    const prog = (l: AchievementLadder) => {
      const nx = l.steps[ladderLevel(l, st)];
      return nx ? Math.min(1, (st[l.stat] ?? 0) / nx.target) : 1;
    };
    list.sort((a, b) => rank(a) - rank(b) || prog(b) - prog(a));
    grid.replaceChildren(...list.map((l) => ladderCard(l, st, claimed, claimable)));
    if (!list.length) grid.innerHTML = `<div class="muted">${filter === 'ready' ? 'Rien à encaisser pour l’instant.' : filter === 'got' ? 'Pas encore de succès obtenu : ouvre des boosters !' : 'Tout est fait. Chapeau.'}</div>`;
  }
  backend.eco.onChange(() => el.isConnected && render());
  backend.onChange(() => el.isConnected && !backend.eco.snapshot && render());

  return {
    el,
    enter(sub?: string) {
      shell.show(null);
      shell.setDimmed(true);
      el.scrollTo({ top: 0 });
      render();
      // #/succes/primes (ancien #/jeux/primes) : droit aux primes de complétion
      if (sub === 'primes') requestAnimationFrame(() => primesEl.scrollIntoView({ block: 'start' }));
    },
    leave() {},
  };
}

/** Paliers (pour la légende). */
export const SUCCESS_TIERS = ACHIEVEMENT_TIERS;
