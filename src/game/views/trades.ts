import { t as tr } from '../../core/i18n';
import '../../core/i18n/fr/game.views.trades'; // (textes de ce module, version anglaise)
import { cardKey, lockedCards, type Friend, type GameBackend, type MarketHistoryItem, type PlayerCard, type TradeHistoryItem, type TradeItem, type TradeView } from '../backend';
import { coinsHtml } from './wallet';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { ALL_THEMES, catalogEntry } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { busyButton, cardTile, errMsg, esc, h, popLayer, pushLayer, starsHtml, thumbUrl, toast, imageReportButton } from '../ui';
import { preloadThumbs } from '../preload';
import { haptics } from '../../core/haptics';
import { ABUSE, cardsValue, fmtCoins } from '../../core/economy';
import { confirmTap } from './safety';
import { createBoard } from './board';
import { createMarket } from './market';
import { installAuctions } from './auctions';
import { cardQuery, searchCatalog } from '../../core/cardSearch';
import { createForYou, pickCardSheet } from './forYou';
import { invalidatePanel, showCardPanel } from './cardPanel';
import { proposable } from '../../core/deals';
import { DUR, EASING } from '../../core/motion';
import { createTradeBalance, type BalSide } from './tradeBalance';
import { wishSales } from '../wishSales';
import '../echanges.css';

/**
 * (REFONTE 11/11 — « fouillis, compliqué, fastidieux » → une seule page, trois zones ; échanges serveur : convex/deals.ts)
 *  - POUR TOI (views/forYou.ts) : les échanges prêts (mes envies × les doublons proposables de tous), un toucher.
 *  - CHERCHER : une recherche dans tout le catalogue (toucher = « chez les joueurs » : qui l'a, la vend, la veut) ET le
 *    marché fondu dessous (mêmes filtres) ; « Vendre une carte » reste là.
 *  - EN COURS : reçus (Accepter / Choisir autre chose / Refuser pour une demande en un toucher ; Accepter /
 *    Contre-proposer / Refuser sinon) et envoyés (Changer / Annuler), annonces du tableau d'offres encore ouvertes
 *    (retiré de l'interface : elles vont à leur terme), historique ; le composeur manuel derrière « Composer moi-même ».
 * Le composeur (ci-dessous, inchangé) :
 * ÉCHANGES de cartes entre nous (n'importe quelle carte, doublon ou non) — refonte retours du 3 nov.
 *  - En cours : propositions reçues (accepter / refuser / CONTRE-PROPOSER) et envoyées (annuler) ; historique dessous.
 *  - Nouvel échange : on choisit un ami ; le jeu croise les deux collections. En haut, les MATCHS PARFAITS (ses doublons
 *    qui te manquent ↔ tes doublons qui lui manquent, même étoile) : un clic remplit la proposition.
 *  - Deux onglets « Je demande / Je donne », chacun avec recherche, étoiles, pack et un filtre doublons
 *    (« mes doublons uniquement » par défaut côté Je donne ; « ses doublons » côté Je demande).
 *  - Badges d'envies croisés : « tu la cherches » (ma liste) · « il la cherche » (la sienne).
 *  - Toucher une carte = zoom (visionneuse 3D, comme partout) avec un bouton pour l'ajouter ; le « + » du coin l'ajoute direct.
 *  - Proposition : jauge d'équilibre (tu donnes ★ contre ★), avertissement si très déséquilibré, sans blocage.
 *  - Verrouillage : une carte déjà engagée dans un échange en attente n'est pas reproposable (🔒).
 */
export interface TradesView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

type Side = 'get' | 'give';
const RANK: Record<RarityId, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
const STARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
/** valeur d'un côté : la même table que la forge, les mises et l'anti-abus (1★ 5 … 6★ 1 000), plus des « puissances de 2,2 » (UX4-13) */
const value = (l: TradeItem[]) => cardsValue(l);
/** Équilibre d'un échange vu de MON côté (ce que je donne, ce que je reçois) — composeur ET échanges reçus. */
function fairness(give: TradeItem[], get: TradeItem[]): { cls: '' | 'ok' | 'info' | 'warn'; txt: string } {
  const vg = value(give), vr = value(get);
  if (!give.length && !get.length) return { cls: '', txt: '' };
  if (vr === 0) return { cls: 'ok', txt: tr('tr.fair.gift') };
  if (vg === 0) return { cls: 'info', txt: tr('tr.fair.nothing') };
  if (vg >= vr * 0.8 && vg <= vr * 1.25) return { cls: 'ok', txt: tr('tr.fair.ok') };
  // (seuils de l'alerte anti-abus : 3 contre 1 en valeur)
  if (vg * ABUSE.tradeRatio < vr) return { cls: 'warn', txt: tr('tr.fair.tooGood') };
  if (vg > vr * ABUSE.tradeRatio) return { cls: 'warn', txt: tr('tr.fair.tooBad') };
  if (vg < vr) return { cls: 'info', txt: tr('tr.fair.bitMore') };
  return { cls: 'info', txt: tr('tr.fair.bitLess') };
}
/** « tu donnes 4★+5★ (≈ 400) contre 2★ (≈ 15) » */
const gaugeTxt = (give: TradeItem[], get: TradeItem[]) => `${tr('tr.youGive')} <b>${esc(starsSummary(give))}</b> (≈ ${fmtCoins(value(give))}) ${tr('tr.against')} <b>${esc(starsSummary(get))}</b> (≈ ${fmtCoins(value(get))})`;
/** mini-jauge (part de chaque côté en valeur) + son texte — échanges reçus et tableau ; le composeur a le fléau (tradeBalance.ts) */
function gaugeHtml(give: TradeItem[], get: TradeItem[], cls: string) {
  const vg = value(give), vr = value(get);
  const tot = vg + vr || 1;
  return `<div class="gauge ${cls}"><div class="gauge-bar"><i class="g-give" style="width:${((vg / tot) * 100).toFixed(1)}%"></i><i class="g-get" style="width:${((vr / tot) * 100).toFixed(1)}%"></i></div><div class="gauge-txt">${gaugeTxt(give, get)}</div></div>`;
}
const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return tr('time.agoMin', { n: Math.max(1, Math.floor(s / 60)) });
  if (s < 86400) return tr('time.agoH', { n: Math.floor(s / 3600) });
  const d = Math.round(s / 86400);
  return d === 1 ? 'hier' : tr('time.agoD', { n: d });
};
/** « 4★+5★ » : résumé des étoiles d'un côté */
const starsSummary = (l: TradeItem[]) => {
  const parts: string[] = [];
  for (const it of [...l].sort((a, b) => RANK[b.rarity] - RANK[a.rarity])) for (let i = 0; i < it.count; i++) parts.push(it.rarity === 'secret' ? '✷' : `${RANK[it.rarity] + 1}★`);
  return parts.length > 5 ? `${parts.slice(0, 5).join('+')}+${parts.length - 5}` : parts.join('+') || 'rien';
};

export function createTradesView(backend: GameBackend, shell: Shell, getViewer: () => Promise<ViewerScene>): TradesView {
  const el = h('section', 'view trades');
  let friend: Friend | null = null;
  let theirs: PlayerCard[] = [];
  let theirWish = new Set<string>();
  let give: TradeItem[] = [];
  let get: TradeItem[] = [];
  let loading = 0;
  let lastAdded = '';
  let side: Side = 'get';
  let giveHinted = false;
  let lastHinted = false;
  /** contre-proposition en cours (échange reçu qu'on modifie) */
  let countering: TradeView | null = null;
  const phone = () => matchMedia('(max-width: 860px)').matches;
  /** filtres par côté */
  const flt: Record<Side, { q: string; star: RarityId | null; pack: string; dups: boolean; onlyMissing: boolean }> = {
    get: { q: '', star: null, pack: '', dups: false, onlyMissing: true },
    give: { q: '', star: null, pack: '', dups: true, onlyMissing: true },
  };

  el.innerHTML = `
    <header class="ex-head">
      <span class="kicker">${tr('tr.title')}</span>
      <div class="ex-tabs" role="tablist" aria-label="${tr('tr.title')}">
        <button role="tab" data-z="acheter" class="on" aria-selected="true">${tr('tr.buyTab')}<b class="badge ex-b-acheter" hidden></b></button>
        <button role="tab" data-z="vendre" aria-selected="false">${tr('tr.sellTab')}</button>
        <button role="tab" data-z="echanges" aria-selected="false">${tr('tr.tradesTab')}<b class="badge ex-b-echanges" hidden></b></button>
        <button role="tab" data-z="activite" aria-selected="false">${tr('tr.activityTab')}</button>
      </div>
    </header>
    <div class="ex-zone ex-acheter" data-z="acheter"></div>
    <div class="ex-zone ex-vendre" data-z="vendre" hidden></div>
    <div class="ex-zone ex-echanges" data-z="echanges" hidden>
      <div class="ex-cours"><div class="pending"></div></div>
      <div class="ex-pour"></div>
      <div class="ex-compose-cta"><button class="btn-ghost ex-compose">${tr('tr.compose')}</button></div>
    </div>
    <div class="ex-zone ex-hist" data-z="activite" hidden>
      <div class="starf hx-filters" role="group" aria-label="${tr('tr.h.filterA')}"></div>
      <ol class="history" aria-live="polite"></ol>
    </div>
    <div class="tr-col left">
      <button class="linkish ex-back">${tr('tr.back')}</button>
      <h3>${tr('tr.with')}</h3><div class="friends"></div>
    </div>
    <div class="tr-col compose">
      <div class="placeholder">${tr('tr.pickFriend')}</div>
      <div class="work" hidden>
        <div class="work-head"><button class="tr-back" aria-label="${tr('tr.backFriends')}">‹</button><h3 class="fname"></h3><span class="counter-tag" hidden>contre-proposition</span></div>
        <div class="matches" hidden><h4>Matchs parfaits <small>${tr('tr.crossD')}</small></h4><div class="match-list"></div></div>
        <div class="tr-side" role="tablist">
          <button role="tab" data-s="get" class="on" aria-selected="true"><b>Je demande</b><span>${tr('tr.theirCards')} <i class="n-get">0</i></span><em class="p-get"></em></button>
          <button role="tab" data-s="give" aria-selected="false"><b>Je donne</b><span>${tr('tr.myCards')} <i class="n-give">0</i></span><em class="p-give"></em></button>
        </div>
        <div class="tr-filters">
          <input class="search tr-search" type="search" placeholder="${tr('tr.searchCard')}" autocomplete="off" spellcheck="false" aria-label="${tr('tr.searchCardA')}">
          <select class="tr-pack" aria-label="Pack"><option value="">${tr('tr.allPacks')}</option>${ALL_THEMES.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select> <!-- i18n-ok -->
          <div class="starf tr-stars">${STARS.map((r) => `<button class="chip" data-r="${r}" style="--rc:${rarity(r).hex}" title="${rarity(r).label}">${RANK[r] + 1}★</button>`).join('')}</div>
          <label class="tr-tog"><input type="checkbox" class="tr-dups"><span class="tr-dups-l"></span></label>
          <label class="tr-tog"><input type="checkbox" class="tr-missing"><span class="tr-missing-l"></span></label>
        </div>
        <div class="picks" data-side="get">
          <div class="pk pk-get"><h4 class="t-get"></h4><div class="grid mini g-get"></div></div>
          <div class="pk pk-give"><h4 class="t-give"></h4><div class="grid mini g-give"></div></div>
        </div>
      </div>
    </div>
    <div class="tr-col tray" hidden>
      <div class="tray-body">
        <h3 class="tray-t">${tr('tr.proposal')}</h3>
        <div class="tray-sec"><h4>${tr('tr.youGet')}</h4><div class="tray-list l-get"></div></div>
        <div class="tray-sec"><h4>${tr('tr.youGiveC')}</h4><div class="tray-list l-give"></div></div>
        <div class="tr-bal"></div>
        <div class="fair"></div>
        <input class="note" maxlength="140" placeholder="Un petit mot ? (optionnel)">
      </div>
      <div class="tray-bar">
        <button class="tray-toggle" aria-expanded="false" aria-label="${tr('tr.detailA')}"><span class="tb-bal"></span><span class="tb-sum"></span><span class="tb-chev" aria-hidden="true">▴</span></button>
        <button class="btn-primary send" disabled>${tr('tr.propose')}</button>
        <button class="btn-ghost counter-cancel" hidden>${tr('tr.cancelCounter')}</button>
      </div>
    </div>
    <div class="viewer-ui" hidden><button class="close" aria-label="${tr('common.close')}">✕</button><div class="v-info"></div><div class="v-actions"></div><div class="v-hint">${tr('shop.spinHint')}</div></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const pendingEl = q('.pending');
  const friendsEl = q('.friends');
  const historyEl = q('.history');
  const placeholder = q('.placeholder');
  const work = q('.work');
  const tray = q('.tray');
  const gGet = q('.g-get');
  const gGive = q('.g-give');
  const lGet = q('.l-get');
  const lGive = q('.l-give');
  const fair = q('.fair');
  // (V3, lot 09 · S5) le fléau d'équité, créé une fois : grande balance dans le volet, petite dans sa barre
  const bal = createTradeBalance(shell.sfx);
  q('.tray .tr-bal').replaceWith(bal.el);
  q('.tray-toggle .tb-bal').replaceWith(bal.mini);
  const sendBtn = q<HTMLButtonElement>('.send');
  const counterCancel = q<HTMLButtonElement>('.counter-cancel');
  const note = q<HTMLInputElement>('.note');
  const search = q<HTMLInputElement>('.tr-search');
  const packSel = q<HTMLSelectElement>('.tr-pack');
  const starBtns = [...el.querySelectorAll<HTMLButtonElement>('.tr-stars .chip')];
  const dupsTog = q<HTMLInputElement>('.tr-dups');
  const missingTog = q<HTMLInputElement>('.tr-missing');
  const picks = q('.picks');
  const sideBtns = el.querySelectorAll<HTMLButtonElement>('.tr-side button');
  const traySum = q('.tb-sum');
  const trayToggle = q<HTMLButtonElement>('.tray-toggle');
  const matchesEl = q('.matches');
  const matchList = q('.match-list');
  const viewerUi = q('.viewer-ui');

  // ── (V3, marché « façon Kyara ») LA PAGE : Acheter · Vendre · Échanges · Mon activité, + le composeur manuel
  // ÉCHANGES : en cours (reçus / envoyés), les échanges tout faits (« Pour toi »), puis le tableau d'offres
  const forYou = createForYou(backend, { chime: () => shell.sfx.chime(3, 0.08), search: () => setZone('acheter') });
  q('.ex-pour').append(forYou.el);
  const board = createBoard(backend, { fairness, gaugeHtml, ago, chime: () => shell.sfx.chime(3, 0.08) });
  q('.ex-pour').append(board.el);
  // ACHETER : le marché (views/market.ts) ; une recherche y montre aussi les cartes du catalogue (« chez les joueurs »)
  const findRes = h('div', 'ex-results');
  findRes.setAttribute('aria-live', 'polite');
  installAuctions(backend, { chime: () => shell.sfx.chime(3, 0.08) }); // (V3) enchères : views/auctions.ts
  const market = createMarket(backend, { chime: () => shell.sfx.chime(3, 0.08), onQuery: (v) => renderFind(v) });
  market.el.querySelector('.mk-aside')!.append(findRes);
  q('.ex-acheter').append(market.el);
  // VENDRE : ma collection en grille ; une carte → prix fixe, enchère ou échange (tableau d'offres, dans Échanges)
  const sellMk = createMarket(backend, {
    chime: () => shell.sfx.chime(3, 0.08),
    mode: 'sell',
    onListed: () => {
      try {
        sessionStorage.setItem('bebou.boardTab', 'mine');
      } catch {
        /* rien */
      }
      board.leave();
      if (zone === 'echanges') board.enter();
    },
  });
  q('.ex-vendre').append(sellMk.el);

  type Zone = 'acheter' | 'vendre' | 'echanges' | 'activite' | 'compose';
  let zone: Zone = 'acheter';
  const tabBtns = [...el.querySelectorAll<HTMLButtonElement>('.ex-tabs button')];
  function setZone(z: Zone) {
    if (zone === 'compose' && z !== 'compose' && friend) {
      if (!askLeave()) return;
      leaveFriend();
    }
    zone = z;
    el.dataset.z = z;
    tabBtns.forEach((b) => {
      const on = b.dataset.z === z;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    el.querySelectorAll<HTMLElement>('.ex-zone').forEach((x) => (x.hidden = x.dataset.z !== z));
    // abonnements seulement pour l'onglet à l'écran
    if (z === 'acheter') market.enter();
    else market.leave();
    if (z === 'vendre') sellMk.enter();
    else sellMk.leave();
    if (z === 'echanges') {
      board.enter();
      forYou.enter();
      renderPending();
    } else board.leave();
    syncTabBadges();
    if (z === 'activite') {
      renderHistory();
      void loadHistory();
    }
    if (z === 'compose') renderFriends();
    try {
      if (z !== 'compose') sessionStorage.setItem('bebou.exZone', z);
    } catch {
      /* rien */
    }
    el.scrollTo({ top: 0 });
  }
  tabBtns.forEach((x) => x.addEventListener('click', () => setZone(x.dataset.z as Zone)));
  q('.ex-compose').addEventListener('click', () => setZone('compose'));
  q('.ex-back').addEventListener('click', () => setZone('echanges'));
  function syncTabBadges() {
    // Échanges : reçus + échanges tout faits + offres reçues sur mes annonces / contre-offres
    const ne = backend.state.trades.incoming.length + forYou.count() + board.attention();
    const be = q('.ex-b-echanges');
    be.hidden = !ne;
    be.textContent = String(ne);
    // (C bis) Acheter : cartes voulues mises en vente depuis la dernière visite
    if (zone === 'acheter' && el.isConnected && wishSales.unseen()) wishSales.visit();
    const na = wishSales.unseen();
    const ba = q('.ex-b-acheter');
    ba.hidden = !na;
    ba.textContent = String(na);
  }
  backend.onChange(() => el.isConnected && syncTabBadges());
  wishSales.onChange(() => el.isConnected && syncTabBadges());
  const vInfo = q('.v-info');
  const vActions = q('.v-actions');

  // ── onglets « Je demande / Je donne »
  function setSide(sd: Side, scroll = true) {
    side = sd;
    picks.dataset.side = sd;
    sideBtns.forEach((b) => {
      const on = b.dataset.s === sd;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    syncFilterUi();
    if (scroll && phone()) {
      const top = q('.tr-side').offsetTop - 8;
      if (el.scrollTop > top) el.scrollTo({ top });
    }
    requestAnimationFrame(() => growMore());
  }
  sideBtns.forEach((b) => b.addEventListener('click', () => setSide(b.dataset.s as Side)));
  /** la barre de filtres reflète le côté affiché */
  function syncFilterUi() {
    const f = flt[side];
    search.value = f.q;
    packSel.value = f.pack;
    starBtns.forEach((b) => b.classList.toggle('on', b.dataset.r === f.star));
    dupsTog.checked = f.dups;
    missingTog.checked = f.onlyMissing;
    q('.tr-dups-l').textContent = side === 'give' ? tr('tr.myDupsOnly') : tr('tr.theirDups');
    q('.tr-missing-l').textContent = side === 'give' ? tr('tr.theyMiss') : tr('tr.iMiss');
  }
  let searchT = 0;
  search.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = window.setTimeout(() => ((flt[side].q = search.value.trim()), renderPicks(side)), 160);
  });
  packSel.addEventListener('change', () => ((flt[side].pack = packSel.value), renderPicks(side)));
  starBtns.forEach((b) =>
    b.addEventListener('click', () => {
      const r = b.dataset.r as RarityId;
      flt[side].star = flt[side].star === r ? null : r;
      syncFilterUi();
      renderPicks(side);
    }),
  );
  dupsTog.addEventListener('change', () => ((flt[side].dups = dupsTog.checked), renderPicks(side)));
  missingTog.addEventListener('change', () => ((flt[side].onlyMissing = missingTog.checked), renderPicks(side)));

  // ── volet de la proposition (téléphone)
  const setTrayOpen = (open: boolean) => {
    tray.classList.toggle('open', open);
    trayToggle.setAttribute('aria-expanded', String(open));
  };
  trayToggle.addEventListener('click', () => setTrayOpen(!tray.classList.contains('open')));
  /** une proposition est en cours de composition (ou une contre-proposition) : on prévient avant de la perdre (UX4-14) */
  const hasWork = () => !!countering || give.length > 0 || get.length > 0;
  let backArmedAt = 0;
  const askLeave = () => {
    if (!hasWork() || Date.now() - backArmedAt < 3000) return true;
    backArmedAt = Date.now();
    toast(countering ? tr('tr.counterCancelQ') : tr('tr.proposalCancelQ'), 'info');
    return false;
  };
  q('.tr-back').addEventListener('click', () => askLeave() && leaveFriend());
  /**
   * Téléphone : le composeur est une COUCHE (UX1-04) — « retour » ramène à la liste d'amis au lieu de quitter les
   * Échanges. Proposition en cours : le premier « retour » prévient (et remet la couche), le second abandonne.
   */
  function composerBack() {
    // seulement le geste « retour » : quand toutes les couches se ferment (changement de page, lien touché), la
    // proposition est gardée pour quand on revient (comme avant)
    if ((window.event as Event | undefined)?.type !== 'popstate' || !location.hash.startsWith('#/echanges')) return;
    // (remise APRÈS le traitement du retour : pendant, la pile la refermerait aussitôt)
    if (!askLeave()) return void setTimeout(() => friend && pushLayer(composerBack), 0);
    leaveFriend();
  }
  function leaveFriend() {
    popLayer(composerBack);
    backArmedAt = 0;
    friend = null;
    countering = null;
    loading++;
    el.classList.remove('composing');
    work.hidden = true;
    tray.hidden = true;
    placeholder.hidden = false;
    setTrayOpen(false);
    renderFriends();
    renderPending();
    el.scrollTo({ top: 0 });
  }

  // ── clavier virtuel (UX5-18) : iOS ne réduit pas la fenêtre de mise en page ; le volet fixé en bas (et son champ
  // « Un petit mot ? ») remonte au-dessus du clavier tant que le champ a le focus
  const vv = window.visualViewport;
  const liftTray = () => {
    if (!vv || !phone()) return;
    tray.style.bottom = `${Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop))}px`;
  };
  note.addEventListener('focus', () => {
    vv?.addEventListener('resize', liftTray);
    vv?.addEventListener('scroll', liftTray);
    liftTray();
  });
  note.addEventListener('blur', () => {
    vv?.removeEventListener('resize', liftTray);
    vv?.removeEventListener('scroll', liftTray);
    tray.style.bottom = '';
  });

  // ── grilles construites au fil du défilement
  const FIRST = 60, CHUNK = 60;
  const lists: Record<Side, PlayerCard[]> = { get: [], give: [] };
  const shown: Record<Side, number> = { get: 0, give: 0 };
  const gridOf = (sd: Side) => (sd === 'get' ? gGet : gGive);
  const mine = () => {
    const m = new Map<string, PlayerCard>();
    for (const c of backend.state.collection) m.set(cardKey(c), c);
    return m;
  };
  const name = (id: string) => catalogEntry(id)?.name ?? id;
  /** exemplaires que je peux encore engager (moins ceux déjà dans un échange en attente) */
  const freeCount = (c: PlayerCard) => Math.max(0, c.count - (lockedCards(backend.state).get(cardKey(c)) ?? 0));

  function tileFor(c: PlayerCard, sd: Side) {
    const free = sd === 'give' ? freeCount(c) : c.count;
    const tile = cardTile(c.cardId, c.rarity, { mini: true, count: c.count });
    const wishMine = backend.state.wishlist.includes(c.cardId);
    const wishTheirs = theirWish.has(c.cardId);
    if (sd === 'get' && wishMine) tile.insertAdjacentHTML('beforeend', '<span class="wb mine" title="' + tr('tr.inYourWishes') + '">' + tr('tr.youWant') + '</span>');
    if (sd === 'give' && wishTheirs) tile.insertAdjacentHTML('beforeend', `<span class="wb theirs" title="${tr('tr.inTheirWishes')}">${tr('tr.theyWant', { name: friend?.name.split(' ')[0] ?? tr('tr.they') })}</span>`);
    if (sd === 'give' && free < c.count) tile.insertAdjacentHTML('beforeend', `<span class="tr-lock" title="${tr('tr.lockTitle', { n: c.count - free })}">🔒</span>`);
    tile.classList.toggle('locked', sd === 'give' && free <= 0);
    // ton seul exemplaire : visible sur la tuile (en bas, ne recouvre ni « ×N » ni les envies)
    if (sd === 'give' && c.count === 1) tile.insertAdjacentHTML('beforeend', '<span class="wb last">dernier</span>');
    // « + » du coin : ajout direct ; le reste de la tuile ouvre le zoom
    const plus = h('button', 'tr-plus', '+');
    plus.title = sd === 'get' ? tr('tr.ask', { name: name(c.cardId) }) : tr('tr.offerCard', { name: name(c.cardId), only: c.count === 1 ? tr('tr.onlyCopy') : '' });
    plus.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sd === 'give' && free <= 0) return toast(tr('tr.busy'), 'info');
      add(sd, c, free, tile);
    });
    plus.setAttribute('aria-label', plus.title);
    tile.append(plus);
    tile.addEventListener('click', () => void zoom(c, sd, free));
    return tile;
  }
  function appendTiles(sd: Side, n: number) {
    const list = lists[sd], from = shown[sd], to = Math.min(list.length, from + n);
    if (to <= from) return;
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) frag.append(tileFor(list[i], sd));
    gridOf(sd).append(frag);
    shown[sd] = to;
    preloadThumbs(list.slice(from, to).map((c) => catalogEntry(c.cardId)), true);
    markPicks();
  }
  function growMore() {
    if (work.hidden || shown[side] >= lists[side].length) return;
    const g = gridOf(side);
    if (g.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom > el.clientHeight * 1.5) return;
    appendTiles(side, CHUNK);
    requestAnimationFrame(() => growMore());
  }
  el.addEventListener('scroll', () => growMore(), { passive: true });

  // ── échanges en cours + historique
  function itemsHtml(items: TradeItem[], lasts: TradeItem[] = []) {
    return items.length
      ? items
          .map((it) => {
            const e = catalogEntry(it.cardId);
            const img = e && it.rarity !== 'secret' ? `<img alt="" loading="lazy" src="${thumbUrl(e)}">` : '';
            return `<span class="it"${img ? ` data-zoom="${esc(`${it.cardId}|${it.rarity}`)}"` : ''} style="--rc:${rarity(it.rarity).hex}">${img}${it.count > 1 ? `${it.count}× ` : ''}${esc(name(it.cardId))} <i>${rarity(it.rarity).rank + 1}★</i>${lasts.includes(it) ? ' <b class="last">' + tr('tr.lastCopyItem') + '</b>' : ''}</span>`;
          })
          .join('')
      : '<span class="it none">' + tr('tr.nothing') + '</span>';
  }
  /** Échange reçu en cours de confirmation / en cours d'envoi / dernière erreur — survivent aux redessins. */
  let confirmingTrade: string | null = null;
  const busyTrades = new Set<string>();
  const tradeErr = new Map<string, string>();
  /**
   * (V3, lot 09 · moment signature S5) SCEAU FRAPPÉ : l'échange se conclut quand le second joueur accepte (le premier a
   * déjà « tourné sa clé » en proposant). L'échange reçu que je viens d'accepter garde sa ligne le temps d'un sceau
   * frappé à froid à la place des boutons (descente courte, coup sourd, zéro flash), puis la ligne se replie.
   * `at` : sa place dans la liste au moment de l'accord (le serveur l'a peut-être déjà retiré des échanges en attente).
   */
  const sealing = new Map<string, { t: TradeView; at: number; stamped: boolean }>();
  function stampSeal(id: string) {
    const sl = sealing.get(id);
    if (!sl || sl.stamped) return;
    sl.stamped = true;
    if (confirmingTrade === id) confirmingTrade = null;
    renderPending();
    const seal = pendingEl.querySelector<HTMLElement>(`[data-tid="${CSS.escape(id)}"] .t-seal`);
    const strike = () => {
      shell.sfx.crack(0.42);
      shell.sfx.thump(0.55, 44, 0, 'reward');
      haptics.pulse([14, 30, 18]);
    };
    // la presse descend sur le médaillon (EASING.entree), le coup tombe à l'impact
    if (seal) void seal.animate([{ transform: 'translateY(-14px) scale(1.16)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: DUR.standard(), easing: EASING.entree }).finished.then(strike, strike);
    else strike();
    window.setTimeout(() => {
      const row = pendingEl.querySelector<HTMLElement>(`[data-tid="${CSS.escape(id)}"]`);
      const end = () => (sealing.delete(id), el.isConnected && renderPending());
      if (!row || !row.getClientRects().length) return end();
      const hh = row.getBoundingClientRect().height;
      row.style.overflow = 'hidden';
      void row.animate([{ height: `${hh}px`, opacity: 1 }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' }], { duration: DUR.emphatique(), easing: EASING.sortie, fill: 'forwards' }).finished.then(end, end);
    }, DUR.ceremonie);
  }
  function renderPending() {
    const { outgoing } = backend.state.trades;
    const incoming = [...backend.state.trades.incoming];
    if (confirmingTrade && !incoming.some((t) => t.id === confirmingTrade)) confirmingTrade = null;
    // l'échange que je viens d'accepter reste à sa place le temps du sceau
    for (const [id, sl] of sealing) if (!incoming.some((t) => t.id === id)) incoming.splice(Math.min(sl.at, incoming.length), 0, sl.t);
    pendingEl.innerHTML = '';
    if (!incoming.length && !outgoing.length) pendingEl.innerHTML = `<div class="muted ex-none">${tr('tr.noPending')}</div>`;
    const owned = mine();
    const row = (t: TradeView, dir: 'in' | 'out') => {
      const r = h('div', `trade ${dir}${countering?.id === t.id ? ' countering' : ''}`);
      r.dataset.tid = t.id;
      const tag = t.counterOf ? '<span class="ctr-tag">contre-proposition</span>' : '';
      const when = `<span class="when">${ago(t.createdAt)}</span>`;
      if (dir === 'in') {
        // vu de mon côté : je donne ce qu'il demande, je reçois ce qu'il offre — même jauge que dans le composeur (UX4-03)
        const f = fairness(t.requested, t.offered);
        const lasts = t.requested.filter((it) => {
          const have = owned.get(cardKey(it))?.count ?? 0;
          return have > 0 && have <= it.count;
        });
        const sl = sealing.get(t.id);
        const acts = sl?.stamped
          ? `<div class="act t-sealed"><span class="t-seal" role="status"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29"/><circle class="in" cx="32" cy="32" r="23"/><path d="M21.5 33 l7.5 7.5 l14.5 -16"/></svg><span class="t-seal-t"><b>${tr('tr.sealed')}</b><small>${tr('tr.sealedBy', { name: esc(t.fromName) })}</small></span></span></div>`
          : t.quick
          ? `<div class="act"><button class="linkish t-decline">${tr('tr.refuse')}</button><button class="btn-ghost t-pick">${tr('tr.pickOther')}</button><button class="btn-primary t-accept">${tr('tr.accept')}</button></div>`
          : `<div class="act"><button class="linkish t-decline">${tr('tr.refuse')}</button><button class="btn-ghost ctr">Contre-proposer</button><button class="btn-primary t-accept">${tr('tr.accept')}</button></div>`;
        r.innerHTML = `<div class="who"><b>${esc(t.fromName)}</b> ${t.quick ? tr('tr.asksYou') : tr('tr.offersYou')} ${tag} ${when}</div><div class="its">${itemsHtml(t.offered)}</div><div class="who">${tr('tr.against')}</div><div class="its">${itemsHtml(t.requested, lasts)}</div>${t.note ? `<div class="tnote">« ${esc(t.note)} »</div>` : ''}${gaugeHtml(t.requested, t.offered, f.cls === 'warn' ? 'warn' : f.cls === 'ok' ? 'ok' : '')}${f.txt ? `<div class="fair ${f.cls}">${esc(f.txt)}</div>` : ''}${lasts.length ? `<div class="fair warn">${tr('tr.lastCopy', { names: lasts.map((it) => esc(name(it.cardId))).join(', ') })}</div>` : ''}${tradeErr.get(t.id) ? `<div class="fair warn t-err" role="alert">${esc(tradeErr.get(t.id)!)}</div>` : ''}${confirmingTrade === t.id && !sl?.stamped ? `<div class="act t-confirm"><span class="cf-q">${tr('tr.confirmQ')}</span><button class="btn-ghost cf-no">${tr('pf.cancel')}</button><button class="btn-primary cf-ok">${tr('tr.yesTrade')}</button></div>` : acts}`;
      } else r.innerHTML = `<div class="who">${tr('tr.toWho', { name: esc(t.toName) })} ${tr('tr.toGive', { tag, when })}</div><div class="its">${itemsHtml(t.offered)}</div><div class="who">${tr('tr.against')}</div><div class="its">${itemsHtml(t.requested)}</div><div class="act"><span class="muted">${tr('tr.waiting')}</span>${t.quick ? '<button class="btn-ghost t-swap">' + tr('tr.change') + '</button>' : ''}<button class="btn-ghost cancel">${tr('pf.cancel')}</button></div>`;
      const act = async (fn: () => Promise<void>, ok: string, btn?: HTMLElement | null) => {
        if (r.dataset.busy || busyTrades.has(t.id)) return; // (anti double-toucher : les boutons sont aussi désactivés)
        r.dataset.busy = '1';
        busyTrades.add(t.id);
        tradeErr.delete(t.id);
        r.querySelector('.t-err')?.remove();
        r.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
        try {
          // bouton « en cours… » + message si le serveur tarde (au lieu d'un bouton figé sans rien dire — retours 08/11)
          await (btn ? busyButton(btn, fn()) : fn());
          if (confirmingTrade === t.id) confirmingTrade = null;
          toast(ok, 'ok');
          void loadHistory();
        } catch (e) {
          const m = errMsg(e);
          console.warn('[échange]', e);
          toast(m, 'err');
          // l'erreur reste aussi écrite DANS l'échange (un toast se rate vite)
          tradeErr.set(t.id, m);
          confirmingTrade = null;
          if (r.isConnected) renderPending();
        } finally {
          busyTrades.delete(t.id);
          delete r.dataset.busy;
          if (r.isConnected) r.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = false));
        }
      };
      // (retours 08/11 — « j'appuie sur accepter il ne se passe rien ») : plus de « second toucher » sur le même bouton
      // (armement de 3 s, perdu au moindre redessin ou au double-toucher trop rapide) — Accepter ouvre une vraie
      // confirmation dans l'échange, qui reste affichée jusqu'à « Oui, échanger » ou « Annuler ».
      // (v1.0.9, retours 09/11 — « Accepter ne marche pas tant qu'on n'appuie pas sur un fin bouton blanc au milieu ») :
      // l'écouteur était posé sur le PREMIER « .ok » de l'échange — la jauge d'équilibre (`gauge ok`) quand l'échange est
      // juste, pas le bouton. Classes propres aux boutons : `.t-accept` / `.t-decline`.
      r.querySelector<HTMLElement>('.act .t-accept')?.addEventListener('click', () => {
        confirmingTrade = t.id;
        tradeErr.delete(t.id);
        renderPending();
        pendingEl.querySelector<HTMLElement>(`[data-tid="${CSS.escape(t.id)}"] .cf-ok`)?.focus();
      });
      r.querySelector<HTMLElement>('.cf-no')?.addEventListener('click', () => {
        confirmingTrade = null;
        renderPending();
      });
      r.querySelector<HTMLElement>('.cf-ok')?.addEventListener('click', (e) => {
        if (busyTrades.has(t.id)) return;
        // (S5) accord du second joueur : la ligne est retenue pour le sceau, frappé seulement si le serveur confirme
        sealing.set(t.id, { t, at: Math.max(0, backend.state.trades.incoming.findIndex((x) => x.id === t.id)), stamped: false });
        void act(async () => {
          try {
            await backend.respondTrade(t.id, true);
          } catch (err) {
            sealing.delete(t.id);
            throw err;
          }
          stampSeal(t.id);
        }, tr('tr.done'), e.currentTarget as HTMLElement);
      });
      r.querySelector<HTMLElement>('.act .t-decline')?.addEventListener('click', (e) => {
        if (!confirmTap(e.currentTarget as HTMLElement, tr('tr.refuseQ'), 4000, `tr-no-${t.id}`)) return;
        void act(() => backend.respondTrade(t.id, false), tr('tr.refused'));
      });
      r.querySelector('.cancel')?.addEventListener('click', () => act(() => backend.cancelTrade(t.id), tr('tr.cancelled')));
      r.querySelector('.ctr')?.addEventListener('click', () => void startCounter(t));
      // (refonte 11/11) demande en un toucher reçue : « Choisir autre chose » parmi ses doublons proposables de même
      // étoile (convex/deals.ts) — l'échange est conclu au toucher de la carte choisie
      r.querySelector('.t-pick')?.addEventListener('click', () => {
        const it = t.offered[0];
        const star = it.rarity === 'secret' ? 'Bébou' : `${RANK[it.rarity] + 1}★`; // i18n-ok
        pickCardSheet({
          title: tr('tr.pickOther'),
          sub: tr('tr.swapHelp', { star, from: t.fromName, card: name(it.cardId) }),
          load: async () =>
            (await backend.tradePickOptions(t.id)).map((o) => ({ cardId: o.cardId, rarity: o.rarity, on: o.cardId === it.cardId, tag: o.cardId === it.cardId ? tr('tr.proposed') : o.lacking ? 'te manque' : tr('tr.haveIt') })),
          empty: tr('tr.noOtherDup', { from: t.fromName, star }),
          // (v2.0.8, retour de Hugo) tout choisir : n'importe quelle carte de l'autre joueur, par étoile — hors de ses
          // doublons proposés, ce n'est plus un échange immédiat mais une contre-proposition qu'il valide
          all: {
            star: it.rarity,
            askTag: tr('tr.askTag', { from: t.fromName }),
            load: async () => {
              const mine = new Set(backend.state.collection.filter((c) => c.count > 0).map((c) => c.cardId));
              return (await backend.friendCollection(t.fromId))
                .filter((c) => c.count > 0 && c.rarity !== 'secret')
                .map((c) => ({ cardId: c.cardId, rarity: c.rarity, tag: mine.has(c.cardId) ? tr('tr.haveIt') : 'te manque' })); // i18n-ok
            },
            onAsk: async (c) => {
              try {
                await backend.counterTrade(t.id, t.requested, [{ cardId: c.cardId, rarity: c.rarity, count: 1 }]);
                shell.sfx.chime(3, 0.08);
                toast(tr('tr.askSent', { from: t.fromName, card: name(c.cardId) }), 'ok');
                void loadHistory();
                return true;
              } catch (e) {
                toast(errMsg(e), 'err');
                return false;
              }
            },
          },
          onPick: async (c) => {
            try {
              const res = await backend.acceptTradePick(t.id, c.cardId);
              shell.sfx.chime(3, 0.08);
              haptics.pulse([10, 40, 18]);
              invalidatePanel();
              toast(res.changed ? tr('tr.doneOne', { card: name(c.cardId) }) : tr('tr.done'), 'ok');
              void loadHistory();
              return true;
            } catch (e) {
              toast(errMsg(e), 'err');
              return false;
            }
          },
        });
      });
      // demande envoyée : changer ce que je donne (même étoile, une carte libre à moi), tant qu'il n'a pas répondu
      r.querySelector('.t-swap')?.addEventListener('click', () => {
        const it = t.offered[0];
        const star = it.rarity === 'secret' ? 'Bébou' : `${RANK[it.rarity] + 1}★`; // i18n-ok
        pickCardSheet({
          title: tr('tr.whatYouGive'),
          sub: tr('tr.swapMine', { star, card: name(it.cardId) }),
          load: async () => {
            const st = backend.state;
            const locked = lockedCards(st);
            const guard = { protected: st.tradeProtected, wishlist: st.wishlist };
            return st.collection
              .filter((c) => c.rarity === it.rarity && catalogEntry(c.cardId))
              .map((c) => {
                const back = cardKey(c) === cardKey(it) ? 1 : 0;
                const lk = (locked.get(cardKey(c)) ?? 0) - back;
                return { c, free: c.count - lk, dup: proposable(c, lk, guard) > 0 };
              })
              .filter((x) => x.free >= 1)
              .sort((a, b) => Number(b.dup) - Number(a.dup) || b.c.count - a.c.count)
              .slice(0, 36)
              .map(({ c, dup }) => ({ cardId: c.cardId, rarity: c.rarity, on: c.cardId === it.cardId, tag: c.cardId === it.cardId ? tr('tr.proposed') : dup ? `doublon ×${c.count}` : tr('tr.onlyCopyW') }));
          },
          empty: tr('tr.noOtherFree', { star }),
          onPick: async (c) => {
            if (c.cardId === it.cardId) return true;
            try {
              await backend.swapTradeGive(t.id, c.cardId);
              toast(tr('tr.nowOffering', { card: name(c.cardId) }), 'ok');
              return true;
            } catch (e) {
              toast(errMsg(e), 'err');
              return false;
            }
          },
        });
      });
      if (sealing.get(t.id)?.stamped) r.classList.add('sealed');
      // (accord envoyé, réponse du serveur pas encore là) : rien à toucher en attendant
      else if (sealing.has(t.id)) r.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
      pendingEl.append(r);
    };
    incoming.forEach((t) => row(t, 'in'));
    outgoing.forEach((t) => row(t, 'out'));
  }
  // (17/11, Hugo) HISTORIQUE : onglet à part (avant : un lien replié sous « En cours »), échanges + ventes + achats du
  // Marché sur une seule liste datée, filtrable ; chaque ligne dit qui, quoi, combien et quand.
  type HistFilter = 'all' | 'trades' | 'sales' | 'buys';
  type HistRow = { at: number; kind: 'trade'; t: TradeHistoryItem } | { at: number; kind: 'sale' | 'buy'; m: MarketHistoryItem };
  let histFilter: HistFilter = 'all';
  let history: HistRow[] = [];
  let histLoaded = false;
  async function loadHistory() {
    const me = backend.state.user?.id ?? 'me';
    const [trades, market] = await Promise.all([backend.tradeHistory().catch(() => []), backend.marketHistory().catch(() => [])]);
    history = [
      ...trades.map((t): HistRow => ({ at: t.resolvedAt, kind: 'trade', t })),
      ...market.map((m): HistRow => ({ at: m.resolvedAt ?? m.createdAt, kind: m.sellerId === me ? 'sale' : 'buy', m })),
    ].sort((a, b) => b.at - a.at);
    histLoaded = true;
    renderHistory();
  }
  const histOf = (f: HistFilter) => history.filter((r) => f === 'all' || (f === 'trades' ? r.kind === 'trade' : f === 'sales' ? r.kind === 'sale' : r.kind === 'buy'));
  function renderHistory() {
    const filters = q('.hx-filters');
    const F: Array<[HistFilter, string]> = [['all', tr('tr.h.all')], ['trades', tr('tr.h.trades')], ['sales', tr('tr.h.sales')], ['buys', tr('tr.h.buys')]];
    filters.innerHTML = F.map(([f, l]) => `<button class="chip${histFilter === f ? ' on' : ''}" data-hf="${f}" aria-pressed="${histFilter === f}">${l} <small>${histLoaded ? histOf(f).length : '…'}</small></button>`).join('');
    const rows = histOf(histFilter);
    if (!histLoaded) {
      historyEl.innerHTML = `<li class="muted">${tr('common.loading')}</li>`;
      return;
    }
    // ventes / achats : le total du filtre, en tête
    const sum = histFilter === 'sales' || histFilter === 'buys' ? rows.reduce((a, r) => a + (r.kind === 'trade' ? 0 : r.m.price), 0) : 0;
    historyEl.innerHTML = rows.length ? (sum ? `<li class="hx-sum">${tr(histFilter === 'sales' ? 'tr.h.sumSales' : 'tr.h.sumBuys', { n: rows.length })} ${coinsHtml(sum)}</li>` : '') : `<li class="muted">${tr('tr.noHistoryAll')}</li>`;
    const me = backend.state.user?.id;
    const LABEL: Record<TradeHistoryItem['status'], string> = { accepted: tr('tr.st.accepted'), declined: tr('tr.st.refused'), cancelled: tr('tr.st.cancelled'), countered: tr('tr.st.countered') };
    const when = (at: number) => `<time class="when" datetime="${new Date(at).toISOString()}" title="${new Date(at).toLocaleString()}">${ago(at)}</time>`;
    for (const row of rows) {
      const r = h('li', '');
      if (row.kind === 'trade') {
        const t = row.t;
        const out = t.fromId === me;
        r.className = `trade hist ${t.status}`;
        r.innerHTML = `<div class="who"><span class="hx-k">${tr('tr.h.trade')}</span> <b>${esc(out ? t.toName : t.fromName)}</b> · <span class="st">${LABEL[t.status]}</span> ${when(row.at)}</div>
        <div class="hist-row"><span class="hl">${out ? tr('tr.youGave') : tr('tr.theyGave')}</span><div class="its">${itemsHtml(t.offered)}</div></div>
        <div class="hist-row"><span class="hl">${tr('tr.h.against')}</span><div class="its">${itemsHtml(t.requested)}</div></div>`;
      } else {
        const m = row.m;
        const sale = row.kind === 'sale';
        r.className = `trade hist hx-mk ${sale ? 'hx-sale' : 'hx-buy'}`;
        r.innerHTML = `<div class="who"><span class="hx-k">${sale ? tr('tr.h.sale') : tr('tr.h.buy')}</span> <b>${esc(sale ? m.buyerName : m.sellerName)}</b> ${when(row.at)}<span class="hx-price">${sale ? '+' : '−'}${coinsHtml(m.price)}</span></div>
        <div class="hist-row"><span class="hl">${sale ? tr('tr.h.soldCard') : tr('tr.h.boughtCard')}</span><div class="its">${itemsHtml([{ cardId: m.cardId, rarity: m.rarity, count: 1 }])}</div></div>`;
      }
      historyEl.append(r);
    }
  }
  q('.hx-filters').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-hf]');
    if (!b) return;
    histFilter = b.dataset.hf as HistFilter;
    renderHistory();
  });

  function renderFriends() {
    const fs = backend.state.friends;
    friendsEl.innerHTML = fs.length ? '' : `<div class="muted">${backend.state.mode === 'online' ? tr('tr.nobodyYet') : tr('tr.noFriend')}</div>`;
    for (const f of fs) {
      const b = h('button', `friend${friend?.id === f.id ? ' on' : ''}`, `<span class="dot${f.online ? ' on' : ''}"></span><span class="fn">${esc(f.name)}</span>${f.status ? `<span class="fs">${esc(f.status)}</span>` : ''}`);
      b.addEventListener('click', () => void pick(f));
      friendsEl.append(b);
    }
  }

  // ── ACHETER : une recherche montre aussi les cartes du CATALOGUE qui correspondent (en vente ou non), en petite
  // rangée de cartes (toucher = « chez les joueurs » : qui l'a, la vend, la veut — views/cardPanel.ts)
  let pendingGet: string | null = null;
  function renderFind(v: string) {
    if (!v) return void findRes.replaceChildren();
    const have = new Map(backend.state.collection.map((c) => [c.cardId, c.count]));
    const res = searchCatalog(v, { limit: 24, includeSecret: (id) => have.has(id) });
    if (!res.length) return void (findRes.innerHTML = `<div class="muted ex-none">${tr('tr.noCardMatch', { q: esc(v) })}</div>`);
    const row = h('div', 'ex-cat');
    row.append(
      ...res.map((e) => {
        const t = cardTile(e.id, e.rarity, { owned: have.has(e.id), mini: true });
        t.addEventListener('click', () => showCardPanel(backend, e.id));
        return t;
      }),
    );
    findRes.replaceChildren(h('h3', 'ex-h', tr('tr.cards')), row);
  }

  // ── composer
  async function pick(f: Friend, keep = false) {
    const changed = friend?.id !== f.id;
    friend = f;
    if (!keep) {
      give = [];
      get = [];
      note.value = '';
      countering = null;
    }
    if (zone !== 'compose') setZone('compose');
    renderFriends();
    placeholder.hidden = true;
    work.hidden = false;
    tray.hidden = false;
    el.classList.add('composing');
    if (phone()) pushLayer(composerBack);
    setTrayOpen(false);
    if (changed && !keep) setSide('get', false);
    if (phone()) el.scrollTo({ top: 0 });
    q('.fname').textContent = f.name;
    syncCounterUi();
    gGet.innerHTML = gGive.innerHTML = '<div class="tile mini skel"></div>'.repeat(5);
    // « Proposer en échange » depuis la fiche d'une carte (collection) : elle est déjà dans « Je donne »
    const pre = sessionStorage.getItem('bebou.tradeGive');
    if (pre && !keep) {
      sessionStorage.removeItem('bebou.tradeGive');
      const [cardId, r] = pre.split(':');
      const c = backend.state.collection.find((x) => x.cardId === cardId && x.rarity === r);
      if (c && freeCount(c) > 0) {
        give.push({ cardId: c.cardId, rarity: c.rarity, count: 1 });
        maxOf.set(`give:${cardKey(c)}`, freeCount(c));
        setSide('give', false);
      }
    }
    // (v1.0.9) « Chercher un propriétaire » → « Échanger » : sa carte est déjà dans « Je demande »
    const preGet = keep ? null : (pendingGet ?? sessionStorage.getItem('bebou.tradeGet'));
    pendingGet = null;
    sessionStorage.removeItem('bebou.tradeGet');
    const my = ++loading;
    try {
      const [coll, wish] = await Promise.all([backend.friendCollection(f.id), backend.friendWishlist(f.id).catch(() => [] as string[])]);
      theirs = coll.filter((c) => catalogEntry(c.cardId));
      theirWish = new Set(wish);
    } catch (e) {
      toast(errMsg(e), 'err');
      theirs = [];
      theirWish = new Set();
    }
    if (my !== loading) return;
    if (preGet) {
      const [cid, rr] = preGet.split(':');
      const c = theirs.find((x) => x.cardId === cid && x.rarity === rr);
      if (c) {
        if (!get.some((x) => cardKey(x) === cardKey(c))) get.push({ cardId: c.cardId, rarity: c.rarity, count: 1 });
        maxOf.set(`get:${cardKey(c)}`, c.count);
        setSide('give', false);
        toast(tr('tr.inProposal', { card: name(c.cardId) }), 'info');
      } else toast(tr('tr.noLonger', { name: f.name, card: name(cid) }), 'info');
    }
    renderMatches();
    renderPicks('get');
    renderPicks('give');
    renderTray();
  }

  /** Contre-proposer : on reprend l'échange reçu dans le composeur (inversé : je donne ce qu'il demandait, je demande ce qu'il offrait). */
  async function startCounter(t: TradeView) {
    const f = backend.state.friends.find((x) => x.id === t.fromId);
    if (!f) return toast(tr('tr.friendNotFound'), 'err');
    countering = t;
    give = t.requested.map((it) => ({ ...it }));
    get = t.offered.map((it) => ({ ...it }));
    note.value = '';
    for (const it of give) {
      const c = backend.state.collection.find((x) => cardKey(x) === cardKey(it));
      maxOf.set(`give:${cardKey(it)}`, c ? freeCount(c) : it.count);
    }
    await pick(f, true);
    for (const it of get) maxOf.set(`get:${cardKey(it)}`, theirs.find((x) => cardKey(x) === cardKey(it))?.count ?? it.count);
    renderTray();
    // téléphone : le volet ne s'ouvre pas tout seul (il cachait la grille) — un rebond suffit à le montrer
    if (phone()) {
      tray.classList.remove('bump');
      void tray.offsetWidth;
      tray.classList.add('bump');
    } else setTrayOpen(true);
    toast(tr('tr.counterHelp'), 'info');
  }
  function syncCounterUi() {
    const on = !!countering;
    q('.counter-tag').hidden = !on;
    counterCancel.hidden = !on;
    q('.tray-t').textContent = on ? tr('tr.counterTo', { name: countering!.fromName }) : tr('tr.proposal');
    sendBtn.textContent = on ? tr('tr.resend') : tr('tr.propose');
  }
  counterCancel.addEventListener('click', (e) => {
    if (!confirmTap(e.currentTarget as HTMLElement, tr('tr.dropCounterQ'))) return;
    countering = null;
    give = [];
    get = [];
    syncCounterUi();
    renderTray();
    renderPending();
  });

  /** Matchs parfaits : ses doublons qui me manquent ↔ mes doublons qui lui manquent, même étoile, prêts en 1 clic. */
  function renderMatches() {
    const m = mine();
    const t = new Map(theirs.map((c) => [cardKey(c), c]));
    const hisDups = theirs.filter((c) => c.count >= 2 && !m.has(cardKey(c)) && c.rarity !== 'secret');
    const myDups = [...m.values()].filter((c) => freeCount(c) >= 2 && !t.has(cardKey(c)) && c.rarity !== 'secret');
    const pairs: Array<{ get: PlayerCard; give: PlayerCard }> = [];
    for (const r of [...STARS].reverse()) {
      const a = hisDups.filter((c) => c.rarity === r);
      const b = myDups.filter((c) => c.rarity === r);
      // en priorité ce que chacun cherche (envies)
      a.sort((x, y) => Number(backend.state.wishlist.includes(y.cardId)) - Number(backend.state.wishlist.includes(x.cardId)));
      b.sort((x, y) => Number(theirWish.has(y.cardId)) - Number(theirWish.has(x.cardId)));
      for (let i = 0; i < Math.min(a.length, b.length) && pairs.length < 6; i++) pairs.push({ get: a[i], give: b[i] });
    }
    matchesEl.hidden = !pairs.length;
    matchList.replaceChildren();
    for (const p of pairs) {
      const row = h('button', 'match');
      const eg = catalogEntry(p.get.cardId)!, ev = catalogEntry(p.give.cardId)!;
      row.innerHTML = `<span class="m-card" style="--rc:${rarity(p.get.rarity).hex}"><img alt="" loading="lazy" src="${thumbUrl(eg)}"><b>${esc(eg.name)}</b><i>${starsHtml(p.get.rarity)}</i>${backend.state.wishlist.includes(eg.id) ? '<em>' + tr('tr.youWant') + '</em>' : ''}</span>
        <span class="m-arrow">⇄</span>
        <span class="m-card" style="--rc:${rarity(p.give.rarity).hex}"><img alt="" loading="lazy" src="${thumbUrl(ev)}"><b>${esc(ev.name)}</b><i>${starsHtml(p.give.rarity)}</i>${theirWish.has(ev.id) ? '<em>' + tr('tr.heWants') + '</em>' : ''}</span>
        <span class="m-go">${tr('tr.offer')}</span>`;
      row.title = tr('tr.bothDup', { get: eg.name, give: ev.name });
      row.addEventListener('click', () => {
        get = [{ cardId: p.get.cardId, rarity: p.get.rarity, count: 1 }];
        give = [{ cardId: p.give.cardId, rarity: p.give.rarity, count: 1 }];
        maxOf.set(`get:${cardKey(p.get)}`, p.get.count);
        maxOf.set(`give:${cardKey(p.give)}`, freeCount(p.give));
        haptics.pulse(8);
        shell.sfx.chime(2, 0.06);
        renderTray();
        setTrayOpen(true);
        if (!phone()) tray.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      matchList.append(row);
    }
  }

  function renderPicks(sd: Side) {
    const m = mine();
    const t = new Map(theirs.map((c) => [cardKey(c), c]));
    const f = flt[sd];
    // (v1.0.9) recherche partagée (core/cardSearch.ts) : plusieurs mots, univers, pack, artiste, n°, « 6★ » ; les plus
    // pertinentes d'abord pendant une recherche
    const cq = cardQuery(f.q);
    const rel = (c: PlayerCard) => (f.q ? cq.score(catalogEntry(c.cardId)!) : 0);
    const sort = (a: PlayerCard, b: PlayerCard) => rel(a) - rel(b) || RANK[b.rarity] - RANK[a.rarity] || (catalogEntry(a.cardId)?.num ?? 0) - (catalogEntry(b.cardId)?.num ?? 0);
    const match = (c: PlayerCard) => {
      const e = catalogEntry(c.cardId);
      if (!e) return false;
      if (f.star && c.rarity !== f.star) return false;
      if (f.pack && e.themeId !== f.pack) return false;
      if (f.q && !cq.test(e)) return false;
      return true;
    };
    // une recherche passe outre les deux filtres (on cherche UNE carte précise, UX4-11)
    const dupsOn = f.dups && !f.q, missOn = f.onlyMissing && !f.q;
    const list =
      sd === 'get'
        ? theirs.filter((c) => (!missOn || !m.has(cardKey(c))) && (!dupsOn || c.count >= 2) && match(c)).sort(sort)
        : [...m.values()].filter((c) => (!missOn || !t.has(cardKey(c))) && (!dupsOn || c.count >= 2) && match(c)).sort((a, b) => Number(freeCount(b) > 0) - Number(freeCount(a) > 0) || sort(a, b));
    const fname = friend?.name ?? tr('tr.yourFriend');
    // le titre dit TOUS les filtres actifs, avec « tout afficher » toujours là
    const titleOf = () => {
      const base = sd === 'get' ? `${dupsOn ? tr('tr.theirDupsC') : tr('tr.cardsOf', { name: fname })}${missOn ? tr('tr.youMiss') : ''}` : `${dupsOn ? tr('tr.yourDups') : tr('tr.yourCards')}${missOn ? tr('tr.theyMissS') : ''}`;
      return `${esc(base)} <small>${tr('tr.tapHint', { what: sd === 'get' ? tr('tr.toAsk') : tr('tr.toGive2') })}</small>${f.q && (f.dups || f.onlyMissing) ? ' <small class="tr-ign">' + tr('tr.filtersIgnored') + '</small>' : ''}${!f.q && (f.dups || f.onlyMissing) ? ' <button class="linkish tr-all">' + tr('tr.showAll') + '</button>' : ''}`;
    };
    const tEl = q(sd === 'get' ? '.t-get' : '.t-give');
    tEl.innerHTML = titleOf();
    tEl.querySelector('.tr-all')?.addEventListener('click', () => {
      f.onlyMissing = false;
      f.dups = false;
      syncFilterUi();
      renderPicks(sd);
    });
    q(sd === 'get' ? '.n-get' : '.n-give').textContent = String(list.length);
    const grid = gridOf(sd);
    lists[sd] = list;
    shown[sd] = 0;
    grid.innerHTML = '';
    if (!list.length) {
      grid.innerHTML = `<div class="muted">${f.q || f.star || f.pack ? tr('tr.noMatchFilters') : sd === 'get' ? tr('tr.nothingNew') : tr('tr.nothingMissing')}${missOn || dupsOn ? ' <button class="linkish see-all">' + tr('tr.seeAll') + '</button>' : ''}</div>`;
      grid.querySelector('.see-all')?.addEventListener('click', () => {
        f.onlyMissing = false;
        f.dups = false;
        syncFilterUi();
        renderPicks(sd);
      });
      return;
    }
    appendTiles(sd, FIRST);
    requestAnimationFrame(() => growMore());
  }

  /** exemplaires disponibles par carte choisie (pour le « + » de la proposition) */
  const maxOf = new Map<string, number>();
  function add(sd: Side, c: PlayerCard, max: number, from?: HTMLElement) {
    const list = sd === 'get' ? get : give;
    const k = cardKey(c);
    const it = list.find((x) => cardKey(x) === k);
    maxOf.set(`${sd}:${k}`, max);
    if (it) {
      list.splice(list.indexOf(it), 1);
      shell.sfx.tick(0.9, 0.04);
      renderTray();
      return;
    } else {
      if (list.length >= 12) return toast(tr('tr.max12'), 'info');
      list.push({ cardId: c.cardId, rarity: c.rarity, count: 1 });
      if (sd === 'give' && c.count === 1 && !lastHinted) {
        lastHinted = true;
        toast(tr('tr.onlyOne', { card: name(c.cardId) }), 'info');
      }
    }
    lastAdded = `${sd}:${k}`;
    shell.sfx.tick(1.4, 0.05);
    // (V3, lot 09) la carte VOLE de la grille jusqu'à son plateau de la balance ; le fléau bascule à son arrivée
    // (avant : un rebond du volet par reflow forcé, `void tray.offsetWidth`)
    const tier = Math.min(5, RANK[c.rarity]);
    const flew = !!from && flyToPan(from, sd, tier);
    renderTray(flew ? undefined : { side: sd, tier });
    if (!flew) landSound(sd, tier);
    lastAdded = '';
    if (sd === 'get' && !give.length && !giveHinted) {
      giveHinted = true;
      const b = q('.tr-side [data-s="give"]');
      b.classList.remove('hint');
      void b.offsetWidth;
      b.classList.add('hint');
    }
  }

  /**
   * (V3, lot 09) LIGNES DE LA PROPOSITION GARDÉES d'un rendu à l'autre (clé = la carte) : ajouter, retirer ou changer
   * un exemplaire ne met à jour que la ligne concernée (avant : `box.innerHTML = ''` puis toutes les lignes et leurs
   * vignettes recréées). Une ligne qui part s'efface ; celle qui arrive garde son entrée `.new`.
   */
  const trayRows: Record<Side, Map<string, HTMLElement>> = { get: new Map(), give: new Map() };
  const boxOf = (sd: Side) => (sd === 'get' ? lGet : lGive);
  const listOf = (sd: Side) => (sd === 'get' ? get : give);
  function leaveRow(r: HTMLElement) {
    r.dataset.leaving = '1';
    const a = r.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(12px)' }], { duration: DUR.rapide(), easing: EASING.sortie, fill: 'forwards' });
    void a.finished.then(() => r.remove(), () => r.remove());
  }
  function fillTray(sd: Side, list: TradeItem[], owned: Map<string, PlayerCard>, orig: { give: TradeItem[]; get: TradeItem[] } | null) {
    const box = boxOf(sd);
    const rows = trayRows[sd];
    let hint = box.querySelector<HTMLElement>(':scope > .ti-hint');
    if (!hint) box.prepend((hint = h('div', 'muted ti-hint', sd === 'get' ? tr('tr.hintAsk') : tr('tr.hintGive'))));
    hint.hidden = list.length > 0;
    const want: HTMLElement[] = [];
    for (const it of list) {
      const k = cardKey(it);
      const have = sd === 'give' ? (owned.get(k)?.count ?? 0) : 0;
      const last = sd === 'give' && have > 0 && it.count >= have;
      const was = orig ? (orig[sd].find((x) => cardKey(x) === k)?.count ?? 0) : 0;
      const diff = orig ? (was === 0 ? 'added' : was !== it.count ? 'changed' : '') : '';
      const more = (maxOf.get(`${sd}:${k}`) ?? 1) > it.count;
      let r = rows.get(k);
      if (!r) {
        const e = catalogEntry(it.cardId);
        r = h('div', 'ti', `<span class="sw" style="background:${rarity(it.rarity).hex}"></span>${e ? `<img class="tth" alt="" data-zoom="${esc(`${it.cardId}|${it.rarity}`)}" src="${thumbUrl(e)}">` : ''}<span class="tn"></span><span class="tc"></span><button class="plus" aria-label="${tr('tr.oneMore')}">+</button><button class="minus" aria-label="${tr('tr.removeCard')}">✕</button>`); // i18n-ok
        r.dataset.k = k;
        rows.set(k, r);
        if (lastAdded === `${sd}:${k}`) {
          r.classList.add('new');
          // (déplacée plus tard dans la liste, la ligne rejouerait son entrée)
          r.addEventListener('animationend', () => r!.classList.remove('new'), { once: true });
        }
      }
      const sig = `${it.count}|${last ? 1 : 0}|${diff}|${was}|${more ? 1 : 0}`;
      if (r.dataset.sig !== sig) {
        r.dataset.sig = sig;
        r.classList.toggle('last', last);
        r.classList.toggle('added', diff === 'added');
        r.classList.toggle('changed', diff === 'changed');
        r.querySelector('.tn')!.innerHTML = `${esc(name(it.cardId))}${last ? ' <i class="ti-last">' + tr('tr.yourLast') + '</i>' : ''}${diff === 'added' ? ' <i class="ti-diff">' + tr('tr.added') + '</i>' : diff === 'changed' ? ` <i class="ti-diff">${tr('tr.before', { n: was })}</i>` : ''}`;
        r.querySelector('.tc')!.textContent = `×${it.count}`;
        r.querySelector<HTMLElement>('.plus')!.hidden = !more;
      }
      want.push(r);
    }
    // ce qui était dans la proposition d'origine et n'y est plus : barré
    if (orig)
      for (const it of orig[sd]) {
        if (list.some((x) => cardKey(x) === cardKey(it))) continue;
        const k = `x:${cardKey(it)}`;
        let r = rows.get(k);
        if (!r) {
          r = h('div', 'ti removed', `<span class="sw" style="background:${rarity(it.rarity).hex}"></span><span></span><span class="tn">${esc(name(it.cardId))} <i class="ti-diff">${tr('tr.removed')}</i></span><span class="tc">×${it.count}</span>`);
          r.dataset.k = k;
          rows.set(k, r);
        }
        want.push(r);
      }
    const keep = new Set(want);
    for (const [k, r] of rows) if (!keep.has(r)) (rows.delete(k), leaveRow(r));
    // dans l'ordre, en ne déplaçant que les lignes mal placées
    let at: ChildNode | null = hint.nextSibling;
    for (const r of want) {
      while (at && (at as HTMLElement).dataset?.leaving) at = at.nextSibling;
      if (r === at) at = at.nextSibling;
      else box.insertBefore(r, at);
    }
  }
  for (const sd of ['get', 'give'] as const)
    boxOf(sd).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      const r = b?.closest<HTMLElement>('.ti');
      if (!b || !r || r.dataset.leaving) return;
      const list = listOf(sd);
      const it = list.find((x) => cardKey(x) === r.dataset.k);
      if (!it) return;
      if (b.classList.contains('minus')) {
        it.count--;
        if (it.count <= 0) list.splice(list.indexOf(it), 1);
        renderTray();
      } else if (b.classList.contains('plus')) {
        it.count++;
        renderTray({ side: sd, tier: Math.min(5, RANK[it.rarity]) });
        landSound(sd, Math.min(5, RANK[it.rarity]));
      }
    });

  /** cartes en vol vers la balance : tant qu'il en reste, le fléau attend leur arrivée pour basculer */
  let flying = 0;
  const tiersOf = (l: TradeItem[]) => l.flatMap((it) => Array<number>(it.count).fill(Math.min(5, RANK[it.rarity])));
  function syncBalance(kick?: { side: BalSide; tier: number }) {
    if (flying > 0 && !kick) return;
    const f = fairness(give, get);
    bal.set({ vg: value(give), vr: value(get), give: tiersOf(give), get: tiersOf(get), balanced: f.cls === 'ok' && give.length > 0 && get.length > 0 }, kick);
  }
  /** la carte se pose sur son plateau : coup feutré, à gauche (je donne) ou à droite (je reçois), plus plein pour une grosse étoile */
  const landSound = (sd: Side, tier: number) => shell.sfx.thump(0.2 + tier * 0.03, 52, sd === 'give' ? -0.35 : 0.35, 'feedback');
  /**
   * Vol d'une carte de la grille de sélection jusqu'à son plateau (grande balance si le volet est ouvert, sinon la
   * petite de la barre) : une copie de la tuile, transform seul, en arc léger. Faux si rien à l'écran (on pose direct).
   */
  function flyToPan(tile: HTMLElement, sd: Side, tier: number): boolean {
    const target = bal.pan(sd);
    if (!target || !tile.isConnected) return false;
    const a = tile.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!a.width || !b.width || a.bottom < 0 || a.top > innerHeight) return false;
    const g = tile.cloneNode(true) as HTMLElement;
    g.querySelectorAll('.tr-plus, .wb, .badge, .tr-lock, .count').forEach((x) => x.remove());
    g.classList.remove('picked');
    g.classList.add('tr-fly');
    g.removeAttribute('tabindex');
    g.removeAttribute('role');
    g.setAttribute('aria-hidden', 'true');
    g.style.left = `${a.left}px`;
    g.style.top = `${a.top}px`;
    g.style.width = `${a.width}px`;
    g.style.height = `${a.height}px`;
    el.append(g);
    const tx = b.left + b.width / 2 - (a.left + a.width / 2);
    const ty = b.top - 5 - (a.top + a.height / 2);
    const sc = Math.max(0.06, 9 / a.width);
    flying++;
    const an = g.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${(tx * 0.5).toFixed(1)}px, ${(ty * 0.5 - 40).toFixed(1)}px) scale(${((1 + sc) / 2).toFixed(3)})`, opacity: 1, offset: 0.5 },
        { transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${sc.toFixed(3)})`, opacity: 0.25 },
      ],
      { duration: DUR.emphatique(), easing: EASING.standard },
    );
    const done = () => {
      g.remove();
      flying = Math.max(0, flying - 1);
      syncBalance({ side: sd, tier });
      landSound(sd, tier);
    };
    void an.finished.then(done, done);
    return true;
  }

  function renderTray(kick?: { side: BalSide; tier: number }) {
    const owned = mine();
    /** contre-proposition : la proposition d'origine (vue de mon côté), pour marquer ce qui change (UX4-14) */
    const orig = countering ? { give: countering.requested, get: countering.offered } : null;
    fillTray('get', get, owned, orig);
    fillTray('give', give, owned, orig);
    markPicks();
    const f = fairness(give, get);
    // dernier exemplaire donné : dit en clair (UX4-12), pas seulement dans une infobulle
    const lasts = give.filter((it) => {
      const have = owned.get(cardKey(it))?.count ?? 0;
      return have > 0 && it.count >= have;
    });
    fair.className = `fair ${f.cls}`;
    fair.innerHTML = `${esc(f.txt)}${lasts.length ? `<span class="fair warn last-w">${tr('tr.lastWarn', { names: lasts.map((it) => esc(name(it.cardId))).join(', ') })}</span>` : ''}`;
    // (V3, lot 09 · S5) le fléau persistant (avant : `gauge.outerHTML = gaugeHtml(…)`, l'élément recréé à chaque carte)
    bal.text(give.length || get.length ? gaugeTxt(give, get) : '');
    bal.el.classList.toggle('warn', f.cls === 'warn');
    syncBalance(kick);
    const unchanged = !!orig && sameItems(orig.give, give) && sameItems(orig.get, get);
    sendBtn.disabled = sending || !friend || (!give.length && !get.length) || unchanged;
    if (countering) sendBtn.textContent = unchanged ? tr('tr.noChange') : tr('tr.resend');
    const n = (l: TradeItem[]) => l.reduce((a, it) => a + it.count, 0);
    const ng = n(get), nd = n(give);
    traySum.innerHTML = !ng && !nd ? '<span class="muted">' + tr('tr.trayHint') + '</span>' : `${tr('tr.trayGot', { n: ng })} · ${tr('tr.trayGave', { n: nd })}${f.txt ? ` <span class="fair ${f.cls}">· ${esc(f.txt.replace(/\.$/, ''))}</span>` : ''}${lasts.length ? ` <span class="fair warn">· ${tr('tr.lastCopyW')}</span>` : ''}`;
    q('.p-get').textContent = ng ? `${ng} choisie${ng > 1 ? 's' : ''}` : '';
    q('.p-give').textContent = nd ? `${nd} choisie${nd > 1 ? 's' : ''}` : '';
  }
  const sameItems = (a: TradeItem[], b: TradeItem[]) => a.length === b.length && a.every((x) => b.some((y) => cardKey(y) === cardKey(x) && y.count === x.count));

  function markPicks() {
    for (const [grid, list] of [[gGet, get], [gGive, give]] as const) {
      for (const t of grid.querySelectorAll<HTMLElement>('.tile')) {
        const it = list.find((x) => x.cardId === t.dataset.card && x.rarity === t.dataset.rarity);
        t.classList.toggle('picked', !!it);
        let b = t.querySelector<HTMLElement>('.badge');
        if (it && !b) t.append((b = h('span', 'badge')));
        if (b) {
          if (!it) b.remove();
          else if (b.textContent !== `×${it.count}`) b.textContent = `×${it.count}`;
        }
      }
    }
  }

  /** envoi en cours : renderTray (un « + » touché pendant l'attente) ne réactive pas le bouton (UX4-01) */
  let sending = false;
  sendBtn.addEventListener('click', async () => {
    if (!friend || sending) return;
    sending = true;
    sendBtn.disabled = true;
    try {
      if (countering) {
        await busyButton(sendBtn, backend.counterTrade(countering.id, give, get, note.value.trim() || undefined));
        toast(tr('tr.counterSent', { name: friend.name }), 'ok');
      } else {
        await busyButton(sendBtn, backend.proposeTrade(friend.id, give, get, note.value.trim() || undefined));
        toast(tr('tr.sent', { name: friend.name }), 'ok');
      }
      countering = null;
      give = [];
      get = [];
      note.value = '';
      setTrayOpen(false);
      syncCounterUi();
      renderTray();
      renderPicks('give'); // les cartes engagées passent en 🔒
      void loadHistory();
    } catch (e) {
      toast(errMsg(e), 'err');
    } finally {
      sending = false;
      renderTray();
    }
  });

  // ── zoom (visionneuse 3D) d'une carte des grilles, avec le bouton pour l'ajouter
  let open = false;
  async function zoom(c: PlayerCard, sd: Side, free: number) {
    shell.requestGyro();
    const e = catalogEntry(c.cardId);
    const rr = rarity(c.rarity);
    if (!open) {
      pushLayer(closeViewer);
      document.body.classList.add('card-open');
    }
    open = true;
    el.classList.add('viewing');
    viewerUi.hidden = false;
    vInfo.className = `v-info r-${c.rarity}`;
    vInfo.style.setProperty('--ra', rr.accentHex);
    vInfo.innerHTML = `<div class="ci-name">${esc(e?.name ?? c.cardId)}</div><div class="ci-meta">${starsHtml(c.rarity)} <span class="ci-r" style="color:${rr.accentHex}">${rr.label}</span></div><div class="ci-sub">${sd === 'get' ? tr('tr.theyHave', { name: esc(friend?.name ?? ''), n: c.count }) : tr('tr.youHaveN', { n: c.count, busy: free < c.count ? tr('tr.engaged', { n: c.count - free }) : '' })}${sd === 'get' && backend.state.wishlist.includes(c.cardId) ? tr('tr.youWantDot') : ''}${sd === 'give' && theirWish.has(c.cardId) ? tr('tr.heWantsDot') : ''}</div>`;
    const inList = (sd === 'get' ? get : give).some((x) => cardKey(x) === cardKey(c));
    vActions.innerHTML = `<button class="va va-add${inList ? ' on' : ''}">${inList ? tr('tr.inOfferRemove') : sd === 'get' ? tr('tr.askThis') : tr('tr.giveThis')}</button>`;
    vActions.append(imageReportButton(backend, c.cardId, 'echanges/carte'));
    vActions.querySelector('.va-add')!.addEventListener('click', () => {
      if (sd === 'give' && free <= 0) return toast(tr('tr.busy2'), 'info');
      add(sd, c, free);
      closeViewer();
    });
    const viewer = await getViewer();
    if (!open) return;
    shell.setDimmed(false);
    shell.show('viewer');
    void viewer.show(c.cardId, c.rarity);
  }
  function closeViewer() {
    if (!open) return;
    popLayer(closeViewer);
    open = false;
    document.body.classList.remove('card-open');
    el.classList.remove('viewing');
    viewerUi.hidden = true;
    shell.show(null);
    shell.setDimmed(true);
  }
  viewerUi.querySelector('.close')!.addEventListener('click', closeViewer);
  /**
   * (retours live 6, B6) TOUTE carte de la page Échanges s'ouvre en grand au toucher, comme dans la collection :
   * annonces et offres du tableau, échanges en attente, cartes de la proposition (`data-zoom="id|rareté"`). Les
   * vignettes du choix des cartes gardent leur fiche avec « + Demander / + Donner » (zoom ci-dessus).
   */
  async function zoomPlain(cardId: string, r: RarityId) {
    shell.requestGyro();
    const e = catalogEntry(cardId);
    const rr = rarity(r);
    if (!open) {
      pushLayer(closeViewer);
      document.body.classList.add('card-open');
    }
    open = true;
    el.classList.add('viewing');
    viewerUi.hidden = false;
    vInfo.className = `v-info r-${r}`;
    vInfo.style.setProperty('--ra', rr.accentHex);
    const have = mine().get(cardKey({ cardId, rarity: r }))?.count ?? 0;
    vInfo.innerHTML = `<div class="ci-name">${esc(e?.name ?? cardId)}</div><div class="ci-meta">${starsHtml(r)} <span class="ci-r" style="color:${rr.accentHex}">${rr.label}</span></div><div class="ci-sub">${have ? tr('tr.youHave', { n: have }) : tr('tr.notYet')}</div>`;
    vActions.innerHTML = '';
    const viewer = await getViewer();
    if (!open) return;
    shell.setDimmed(false);
    shell.show('viewer');
    void viewer.show(cardId, r);
  }
  el.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const z = t.closest<HTMLElement>('[data-zoom]');
    if (!z || !el.contains(z) || t.closest('button')) return;
    const [id, r] = z.dataset.zoom!.split('|') as [string, RarityId];
    if (!catalogEntry(id)) return;
    ev.stopPropagation();
    ev.preventDefault();
    void zoomPlain(id, r);
  }, true); // (capture : avant l'ouverture de l'annonce — toucher la CARTE la montre en grand, le reste de l'annonce l'ouvre)
  window.addEventListener('keydown', (e) => e.key === 'Escape' && open && closeViewer());

  let pendSig = '';
  let friendSig = '';
  backend.onChange((st) => {
    if (!el.isConnected) return;
    const ps = [...st.trades.incoming, ...st.trades.outgoing].map((t) => t.id).join(',');
    if (ps !== pendSig) {
      pendSig = ps;
      renderPending();
      if (friend && !open) renderPicks('give');
      // la proposition qu'on contre-proposait n'est plus en attente : on abandonne
      if (countering && !st.trades.incoming.some((t) => t.id === countering!.id)) {
        countering = null;
        syncCounterUi();
      }
    }
    const fsig = st.friends.map((f) => `${f.id}:${f.online ? 1 : 0}:${f.status ?? ''}`).join('|');
    if (fsig !== friendSig) ((friendSig = fsig), renderFriends());
  });

  return {
    el,
    enter(sub?: string) {
      shell.show(null);
      shell.setDimmed(true);
      syncTabBadges();
      pendSig = friendSig = '';
      // composeur manuel : « Composer moi-même », bouton « Proposer un échange » d'un profil, « Demander » sans doublon
      // à proposer (views/cardPanel.ts), carte à donner, proposition en cours
      const want = sessionStorage.getItem('bebou.tradeWith');
      sessionStorage.removeItem('bebou.tradeWith');
      sessionStorage.removeItem('bebou.boardGive'); // (ancien « Proposer sur le tableau » : le tableau est retiré)
      const toCompose = sub === 'composer' || sub === 'ami' || !!want || !!sessionStorage.getItem('bebou.tradeGive') || !!friend;
      let last: string | null = null;
      try {
        last = sessionStorage.getItem('bebou.exZone');
      } catch {
        /* rien */
      }
      // (V3) anciens liens gardés : chercher → Acheter, pour / tableau / cours → Échanges, historique → Mon activité
      const SUB: Record<string, Zone> = { acheter: 'acheter', chercher: 'acheter', vendre: 'vendre', echanges: 'echanges', pour: 'echanges', tableau: 'echanges', cours: 'echanges', activite: 'activite', historique: 'activite' };
      const z: Zone = toCompose
        ? 'compose'
        : sub && SUB[sub]
          ? SUB[sub]
          : backend.state.trades.incoming.length > 0
            ? 'echanges'
            : last === 'acheter' || last === 'vendre' || last === 'echanges' || last === 'activite'
              ? last
              : 'acheter';
      setZone(z);
      if (z !== 'compose') return;
      const wanted = want ? backend.state.friends.find((f) => f.id === want) : undefined;
      if (wanted) void pick(wanted);
      else if (friend) void pick(backend.state.friends.find((f) => f.id === friend!.id) ?? friend, true);
      else if (sessionStorage.getItem('bebou.tradeGive')) toast(tr('tr.pickPlayer'), 'info');
    },
    leave() {
      if (open) closeViewer();
      setTrayOpen(false);
      board.leave();
      market.leave();
      sellMk.leave();
    },
  };
}
