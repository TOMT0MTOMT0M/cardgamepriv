import '../../core/i18n/fr/game.views.succes'; // (textes de ce module, version anglaise)
import { locale, t, type MsgKey, t as tr } from '../../core/i18n';
/** (version anglaise) genre de cosmétique affiché (« Cadre » → « Frame ») ; le genre lui-même reste l'identifiant français */
const kindLabel = (k: string) => t(`cos.kind.${k}` as MsgKey);
import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import { ACHIEVEMENTS, ACHIEVEMENT_LADDERS, ACHIEVEMENT_TIERS, achievementDone, achievementPacks, achievementReward, fmtCoins, ladderLevel, type Achievement, type AchievementLadder, type AchievementStats } from '../../core/economy';
import type { FriendAch } from '../eco';
import { cosmeticsOf } from '../../core/cosmetics';
import { badgeIcon } from '../cosmeticArt';
import { COIN_ICON } from './wallet';
import { DUR, EASING, reducedMotion } from '../../core/motion';
import { busyButton, errMsg, esc, h, plural, toast } from '../ui';
import { guarded, isPending } from './safety';
import { OPEN_COSM } from '../atelierOnce';
import { UNIQUE_TITLES, uniqueTitleLabel, uniqueTitleProgress, uniqueTitleSet, type UniqueTitle } from '../../core/uniqueTitles';
import { celebrateUniqueTitle, holderOf, onUniqueTitles } from '../uniqueTitle';
import { fmtDate } from '../../core/i18n';

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

/** Déplie / replie un bloc : la hauteur (avec ses marges internes) coulisse, le contenu fond ; reprend là où en est une animation en cours. */
const slides = new WeakMap<HTMLElement, Animation>();
function slide(el: HTMLElement, open: boolean): void {
  const prev = slides.get(el);
  const from = prev ? el.getBoundingClientRect().height : open ? 0 : el.getBoundingClientRect().height;
  prev?.cancel();
  if (open) el.hidden = false;
  if (reducedMotion() || !el.isConnected || (!open && el.hidden)) return void (el.hidden = !open);
  const cs = getComputedStyle(el);
  const box = (h: number, k: number) => ({ height: `${h}px`, paddingTop: `${parseFloat(cs.paddingTop) * k}px`, paddingBottom: `${parseFloat(cs.paddingBottom) * k}px`, borderTopWidth: `${parseFloat(cs.borderTopWidth) * k}px`, opacity: k });
  const H = el.getBoundingClientRect().height; // hauteur naturelle (ouverte)
  const target = open ? box(H, 1) : box(0, 0);
  const start = open ? box(from, H > 0 ? Math.min(1, from / H) : 0) : box(from, H > 0 ? Math.min(1, from / H) : 1);
  const a = el.animate([start, target], { duration: DUR.standard(), easing: open ? EASING.entree : EASING.sortie });
  el.style.overflow = 'hidden';
  slides.set(el, a);
  a.addEventListener('finish', () => {
    if (slides.get(el) !== a) return;
    slides.delete(el);
    el.style.overflow = '';
    el.hidden = !open;
  });
  a.addEventListener('cancel', () => {
    if (slides.get(el) === a) slides.delete(el);
    el.style.overflow = '';
  });
}

export function createSuccesView(backend: GameBackend, shell: Shell): SuccesView {
  const el = h('section', 'view succes');
  el.innerHTML = `
    <div class="sc-wrap">
      <header class="sc-head">
        <div><span class="kicker">${t('sc.kicker')}</span><h1>${t('sc.title')}</h1>
        <p class="muted">${t('sc.intro')}</p></div>
        <div class="sc-score"></div>
      </header>
      <div class="seg sc-tabs" role="tablist" aria-label="${t('sc.tabsA')}"><button role="tab" data-tab="normal" class="on" aria-selected="true">${t('sc.tabNormal')}</button><button role="tab" data-tab="albums" aria-selected="false">${t('sc.tabAlbums')}</button></div>
      <div class="sc-bar" data-in="normal">
        <div class="seg sc-who" aria-label="${t('sc.see')}"><button data-w="me" class="on" aria-pressed="true">${t('sc.me')}</button><button data-w="friends" aria-pressed="false">${t('nav.friends.aria')}</button></div>
        <div class="seg sc-filters" aria-label="${t('sc.filterA')}"><button data-f="all" class="on" aria-pressed="true">${t('sc.all')}</button><button data-f="ready" aria-pressed="false">${t('sc.toCollect')}</button><button data-f="got" aria-pressed="false">${t('sc.earned')}</button><button data-f="todo" aria-pressed="false">${t('sc.ongoing')}</button></div>
        <button class="btn-primary sc-claim" hidden></button>
      </div>
      <div class="sc-recap" role="status" hidden></div>
      <section class="ut-sec" data-in="albums" aria-label="${t('ut.sec')}" hidden></section>
      <section class="sc-primes" data-in="albums" id="primes" aria-label="${t('sc.primesA')}" hidden></section>
      <div class="sc-grid" data-in="normal"></div>
    </div>`;
  const score = el.querySelector<HTMLElement>('.sc-score')!;
  const grid = el.querySelector<HTMLElement>('.sc-grid')!;
  const claimBtn = el.querySelector<HTMLButtonElement>('.sc-claim')!;
  const recap = el.querySelector<HTMLElement>('.sc-recap')!;
  const primesEl = el.querySelector<HTMLElement>('.sc-primes')!;
  let filter: Filter = 'all';
  /**
   * (23/11, retours Tom) DEUX ONGLETS : « Succès » (les succès à paliers) et « Succès d'albums » (les titres uniques et
   * les primes de complétion : tout ce qui se gagne en bouclant un album). #/succes/albums (et l'ancien #/succes/primes).
   */
  let tab: 'normal' | 'albums' = 'normal';
  const primesBlock = el.querySelector<HTMLElement>('.sc-primes')!;
  function setTab(next: 'normal' | 'albums') {
    tab = next;
    el.querySelectorAll<HTMLButtonElement>('.sc-tabs button').forEach((x) => {
      const on = x.dataset.tab === tab;
      x.classList.toggle('on', on);
      x.setAttribute('aria-selected', String(on));
    });
    el.querySelectorAll<HTMLElement>('[data-in]').forEach((x) => (x.hidden = x.dataset.in !== tab || (x === primesBlock && !backend.eco.snapshot)));
    if (tab === 'albums') recap.hidden = true;
  }
  el.querySelectorAll<HTMLButtonElement>('.sc-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.tab === tab) return;
      setTab(b.dataset.tab as 'normal' | 'albums');
      history.replaceState(null, '', tab === 'albums' ? '#/succes/albums' : '#/succes');
      render();
    }),
  );
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
      toast(r.coins || r.packs ? t('sc.toast', { coins: fmtCoins(r.coins), packs: r.packs ? t('sc.andPacks', { packs: plural(r.packs, 'booster') }) : '' }) : t('sc.collected'), 'ok');
      const all = ACHIEVEMENTS.filter((a) => before.has(a.id)).flatMap((a) => cosmeticsOf(a.id));
      // (11/11) une animation d'ouverture débloquée se choisit dans la fiche d'un booster, pas sur le profil
      const opens = all.filter((c) => c.kind === 'Ouverture'); // i18n-ok
      const cos = all.filter((c) => c.kind !== 'Ouverture'); // i18n-ok
      if (opens.length) toast(t('sc.openUnlocked', { list: opens.map((c) => `« ${c.c.label} »`).join(', ') }), 'ok');
      recap.hidden = false;
      recap.innerHTML = `<b>${r.coins ? `+${fmtCoins(r.coins)} ${COIN_ICON}` : ''}${r.packs ? `${r.coins ? ' · ' : ''}+${plural(r.packs, 'booster')}` : ''}</b>${cos.length ? `<span>${t('sc.unlockedFor', { list: cos.map((c) => `${c.kind === 'Badge' ? `${badgeIcon(c.c.id)} ` : ''}${kindLabel(c.kind)} « ${esc(c.c.label)} »`).join(', ') })}</span><a class="btn-primary sc-equip" href="#/profil">${t('sc.equip')}</a>` : '<span>' + t('sc.coinsAdded') + '</span>'}<button class="sc-recap-x" aria-label="${t('common.close')}">✕</button>`; // i18n-ok
      recap.querySelector('.sc-equip')?.addEventListener('click', () => sessionStorage.setItem(OPEN_COSM, '1'));
      recap.querySelector('.sc-recap-x')!.addEventListener('click', () => (recap.hidden = true));
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  });

  /**
   * (retours live 6, C10) UNE récompense par palier, en une puce sur une ligne : les pièces (+ boosters) OU le
   * cosmétique (titre, badge, cadre, vitrine) — plus le pavé bannière + cadre + titre + badge + couleur + vitrine.
   */
  const KIND_CLS: Record<string, string> = { Bannière: 'banner', Cadre: 'frame', Titre: 'title', Couleur: 'frame', Vitrine: 'banner', Badge: 'badge', Ouverture: 'open', Fond: 'banner', Style: 'title' };
  /** puce d'un cosmétique gagné (titre, badge, cadre, vitrine, fond, écriture du titre) */
  const cosChip = (a: Achievement, ok: boolean) => {
    const r = cosmeticsOf(a.id)[0];
    if (!r) return '';
    const sw = r.kind === 'Cadre' || r.kind === 'Vitrine' || r.kind === 'Bannière' ? ` style="--sw:${r.c.css ?? 'var(--ink-2)'}"` : ''; // i18n-ok
    const ico = r.kind === 'Badge' ? badgeIcon(r.c.id) : r.kind === 'Titre' ? '«' : '<i></i>'; // i18n-ok
    return `<span class="sc-cos${ok ? ' ok' : ''} k-${KIND_CLS[r.kind]}${r.c.anim ? ' anim' : ''}"${sw} title="${esc(`${kindLabel(r.kind)} « ${r.c.label} »`)}">${ico} ${r.kind === 'Titre' ? '' : `${kindLabel(r.kind)} · `}${esc(r.c.label)}${r.kind === 'Titre' ? ' »' : ''}</span>`; // i18n-ok
  };
  const rewardHtml = (a: Achievement, ok = false) => {
    if (a.cos) return cosChip(a, ok);
    const packs = achievementPacks(a);
    // (14/11, refonte de la personnalisation) un palier « pièces » peut porter EN PLUS un fond, un cadre, une écriture ou une vitrine
    return `<span class="sc-coins">${COIN_ICON}${fmtCoins(achievementReward(a))}${packs ? ` <span class="sc-pk">+${plural(packs, 'booster')}</span>` : ''}</span>${cosChip(a, ok)}`;
  };

  /**
   * Une mécanique = un succès à paliers. (13/11, retours Hugo « trop d'écritures, impossible à lire ») une PASTILLE :
   * le nom, le palier (« 2/7 ») et la progression (« 500 / 1 000 ») ; un toucher la déplie : le prochain palier (ce
   * qu'il manque, sa récompense) et les paliers déjà atteints.
   */
  const openLadders = new Set<string>();
  function ladderCard(l: AchievementLadder, st: AchievementStats, claimed: Set<string>, claimable: Set<string>): HTMLElement {
    const cur = st[l.stat] ?? 0;
    const lvl = ladderLevel(l, st);
    const next = l.steps[lvl];
    const prevT = lvl ? l.steps[lvl - 1].target : 0;
    const ready = l.steps.some((a) => claimable.has(a.id));
    const all = lvl === l.steps.length;
    const open = openLadders.has(l.stat + l.label);
    const pct = next ? Math.min(1, (cur - prevT) / Math.max(1, next.target - prevT)) : 1;
    // (v2.0.6, demande de Tom) couleur selon l'avancement de TOUT le succès (paliers faits + palier en cours) :
    // terminé (or) · presque (vert, ≥ 75 %) · à moitié (bleu, ≥ 40 %) · début (gris) · pas commencé
    const whole = all ? 1 : (lvl + pct) / l.steps.length;
    const stage = all ? 'done' : whole >= 0.75 ? 'near' : whole >= 0.4 ? 'half' : whole > 0 ? 'start' : 'none';
    const c = h('div', `sc-c sc-ladder sc-pill st-${stage}${all ? ' got' : ready ? ' ready' : ''}${open ? ' open' : ''}`);
    const left = next ? Math.max(0, next.target - cur) : 0;
    c.innerHTML = `
      <button class="sc-pl-h" aria-expanded="${open}">
        <span class="sc-pl-top"><b class="sc-name">${esc(l.label)}</b><span class="sc-tier">${lvl}/${l.steps.length}</span></span>
        <i class="sc-pb"><i style="width:${(pct * 100).toFixed(1)}%"></i></i>
        <em class="sc-n">${ready ? t('sc.plReady') : next ? `${fmtCoins(Math.min(cur, next.target))} / ${fmtCoins(next.target)}` : t('sc.done')}</em>
      </button>
      <div class="sc-more"${open ? '' : ' hidden'}>
        ${next ? `<span class="sc-how">${t('sc.missing', { n: fmtCoins(left), label: esc(next.label), how: esc(next.how) })}</span><span class="sc-rw-l">${t('sc.reward')} ${rewardHtml(next)}</span>` : `<span class="sc-how">${t('sc.plAllDone', { label: esc(l.steps[l.steps.length - 1].label) })}</span>`}
        ${lvl ? `<ol class="sc-steps">${l.steps
          .slice(0, lvl)
          .map((a) => {
            const got = claimed.has(a.id);
            const rd = claimable.has(a.id);
            return `<li class="${got ? 'got' : 'ready'}"><span class="sc-st-t">${got ? '✓' : '★'} ${fmtCoins(a.target)}</span><span class="sc-st-l">${esc(a.label)}</span>${rewardHtml(a, got || rd)}</li>`;
          })
          .join('')}</ol>` : ''}
      </div>`;
    c.querySelector('.sc-pl-h')!.addEventListener('click', () => {
      const k = l.stat + l.label;
      const on = !openLadders.has(k);
      if (on) openLadders.add(k);
      else openLadders.delete(k);
      c.classList.toggle('open', on);
      c.querySelector('.sc-pl-h')!.setAttribute('aria-expanded', String(on));
      slide(c.querySelector<HTMLElement>('.sc-more')!, on);
    });
    return c;
  }

  /** Bascule « Amis » : par mécanique, le classement de mes amis (et moi), le plus avancé en tête. */
  function friendsCard(l: AchievementLadder, list: FriendAch[]): HTMLElement {
    const rows = [...list].sort((a, b) => (b.stats[l.stat] ?? 0) - (a.stats[l.stat] ?? 0) || a.name.localeCompare(b.name, locale()));
    const c = h('div', 'sc-c sc-ladder sc-fr');
    const top = rows[0];
    c.innerHTML = `<div class="sc-top"><span class="sc-tier">${l.steps.length} paliers</span>${top && (top.stats[l.stat] ?? 0) > 0 ? `<span class="sc-lead">👑 ${esc(top.me ? t('chat.me') : top.name)}</span>` : ''}</div>
      <b class="sc-name">${esc(l.label)}</b>
      <ol class="sc-frl">${rows
        .map((f, i) => {
          const v = f.stats[l.stat] ?? 0;
          const lv = ladderLevel(l, f.stats);
          return `<li class="${f.me ? 'me' : ''}"><span class="sc-fr-i">${i + 1}</span><span class="sc-fr-n">${esc(f.me ? t('chat.me') : f.name)}</span><span class="sc-fr-l">${tr('sc.tierLow', { n: lv, total: l.steps.length })}</span><b>${fmtCoins(v)}</b></li>`;
        })
        .join('')}</ol>`;
    return c;
  }

  /** Primes de complétion : 5 pièces × cartes de chaque ensemble bouclé (album, groupe d'albums, thème). */
  /**
   * (20/11) TITRES UNIQUES (src/core/uniqueTitles.ts) : une tuile par titre — libre, pris (par qui, depuis quand) ou à
   * moi —, avec mon avancement sur la collection. Le titre se réclame tout seul à 100 % (uniqueTitle.ts) ; le bouton
   * « Réclamer » reste là si l'envoi automatique n'a pas pu partir (hors ligne à ce moment-là).
   */
  const titlesEl = el.querySelector<HTMLElement>('.ut-sec')!;
  const CROWN = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M3.5 8.5l4.2 3.6L12 5l4.3 7.1 4.2-3.6-1.7 9.5H5.2z" fill="currentColor"/></svg>';
  function renderTitles() {
    const me = backend.state.user?.id;
    const owned = new Set(backend.state.collection.map((c) => c.cardId));
    titlesEl.innerHTML = `<div class="ut-sec-h"><b>${t('ut.sec')}</b><span>${t('ut.secD')}</span></div><div class="ut-grid"></div>`;
    const grid = titlesEl.querySelector<HTMLElement>('.ut-grid')!;
    for (const ut of UNIQUE_TITLES) {
      const set = uniqueTitleSet(ut);
      const pr = uniqueTitleProgress(ut, owned);
      const by = holderOf(ut.id);
      const mine = !!by && by.userId === me;
      const ready = !by && pr.done;
      const c = h('article', `ut-card ${by ? (mine ? 'mine' : 'taken') : 'free'}${ready ? ' ready' : ''}`);
      c.style.setProperty('--ut', ut.tint);
      c.innerHTML = `<div class="ut-top"><span>${CROWN}${esc(set?.label ?? '')}</span><span class="ut-st">${by ? (mine ? t('ut.mine') : t('ut.taken')) : t('ut.free')}</span></div>
        <b class="ut-name">${esc(uniqueTitleLabel(ut))}</b>
        <div class="ut-who">${by ? `<b>${esc(by.name)}</b><small>${t('ut.since', { date: fmtDate(by.at, { day: 'numeric', month: 'short' }) })}</small>` : ready ? `<button class="btn-primary ut-claim">${t('ut.claim')}</button>` : `<span>${t('ut.beFirst')}</span>`}</div>
        <div class="ut-pr${pr.done ? ' full' : ''}" aria-label="${t('ut.progressA', { have: pr.have, total: pr.total })}"><i style="--p:${pr.total ? (pr.have / pr.total).toFixed(4) : 0}"></i><span>${fmtCoins(pr.have)} / ${fmtCoins(pr.total)}</span></div>`;
      c.querySelector<HTMLElement>('.ut-claim')?.addEventListener('click', (e) => void claimTitle(ut, e.currentTarget as HTMLElement));
      grid.append(c);
    }
  }
  async function claimTitle(ut: UniqueTitle, btn: HTMLElement) {
    try {
      const won = await busyButton(btn, backend.eco.claimTitles(ut.id));
      if (won.includes(ut.id)) celebrateUniqueTitle(ut, () => shell.sfx.chime(5, 0.14));
    } catch (e) {
      toast(errMsg(e), 'err');
    }
    if (el.isConnected) renderTitles();
  }
  onUniqueTitles(() => el.isConnected && renderTitles());

  function renderPrimes() {
    const s = backend.eco.snapshot;
    primesEl.hidden = !s || tab !== 'albums';
    if (!s) return;
    const total = s.completions.reduce((a, c) => a + c.reward, 0);
    const done = s.econ.completions.length;
    primesEl.classList.toggle('ready', s.completions.length > 0);
    primesEl.innerHTML = `<div class="sc-pr-h"><b>${t('sc.primesA')}</b><span class="muted">${t('sc.primesD', { done: done ? ` · ${plural(done, 'prime déjà encaissée', 'primes déjà encaissées')}` : '' })}</span>${s.completions.length ? `<button class="btn-primary sc-pr-claim"${isPending('claim') ? ' disabled' : ''}>Encaisser · +${fmtCoins(total)} ${COIN_ICON}</button>` : ''}</div> <!-- i18n-ok -->
      ${s.completions.length ? `<div class="sc-pr-list">${s.completions.map((c) => `<span class="sc-pr">${t('sc.primeRow', { label: esc(c.label), n: c.size })} <b>+${fmtCoins(c.reward)}</b></span>`).join('')}</div>` : `<div class="muted sc-pr-none">${t('sc.nothingAlbum')}</div>`}`;
    primesEl.querySelector<HTMLElement>('.sc-pr-claim')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      void guarded('claim', btn, async () => {
        try {
          const r = await busyButton(btn, backend.eco.claimCompletions());
          shell.sfx.chime(6, 0.12);
          toast(t('sc.compToast', { coins: fmtCoins(r.coins), sets: r.sets.map((x) => x.label).join(', ') }), 'ok');
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      }, { keepOnSuccess: true });
    });
  }

  function render() {
    renderTitles();
    renderPrimes();
    const s = backend.eco.snapshot;
    if (!s) {
      score.innerHTML = '';
      claimBtn.hidden = true;
      grid.innerHTML = `<div class="muted">${backend.state.mode === 'online' && !backend.state.user ? t('sc.login') : t('common.loading2')}</div>`;
      return;
    }
    const claimed = new Set(s.econ.achievements);
    const claimable = new Set(s.achievements.claimable);
    const done = ACHIEVEMENTS.filter((a) => achievementDone(a, s.achievements.stats)).length;
    const pending = ACHIEVEMENTS.filter((a) => claimable.has(a.id));
    const total = pending.reduce((n, a) => n + achievementReward(a), 0);
    const packsN = pending.reduce((n, a) => n + achievementPacks(a), 0);
    score.innerHTML = `<div class="sc-big"><b>${done}</b><span>/ ${ACHIEVEMENTS.length}</span></div><div class="muted">${t('sc.unlockedTiers')}</div><i class="sc-pb big"><i style="width:${((done / ACHIEVEMENTS.length) * 100).toFixed(1)}%"></i></i>`;
    claimBtn.hidden = !pending.length;
    claimBtn.innerHTML = t('sc.claim', { tiers: plural(pending.length, 'palier', 'paliers'), coins: total ? ` · +${fmtCoins(total)} ${COIN_ICON}` : '', packs: packsN ? ` + ${plural(packsN, 'booster')}` : '' });
    if (who === 'friends') {
      if (!friends) {
        grid.innerHTML = '<div class="muted">' + t('sc.loadingFriends') + '</div>';
        return;
      }
      if (friends.length <= 1) {
        grid.innerHTML = `<div class="muted">${t('sc.addFriends')}</div>`;
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
    if (!list.length) grid.innerHTML = `<div class="muted">${filter === 'ready' ? t('sc.nothing') : filter === 'got' ? t('sc.noneYet') : t('sc.allDone')}</div>`;
  }
  backend.eco.onChange(() => el.isConnected && render());
  backend.onChange(() => el.isConnected && !backend.eco.snapshot && render());

  return {
    el,
    enter(sub?: string) {
      shell.show(null);
      shell.setDimmed(true);
      el.scrollTo({ top: 0 });
      // #/succes/albums : l'onglet des succès d'albums ; #/succes/primes (ancien #/jeux/primes) : droit aux primes
      setTab(sub === 'albums' || sub === 'primes' ? 'albums' : 'normal');
      render();
      if (sub === 'primes') requestAnimationFrame(() => primesEl.scrollIntoView({ block: 'start' }));
    },
    leave() {},
  };
}

/** Paliers (pour la légende). */
export const SUCCESS_TIERS = ACHIEVEMENT_TIERS;
