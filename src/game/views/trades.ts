import { t as tr } from '../../core/i18n';
import '../../core/i18n/fr/game.views.trades'; // (textes de ce module, version anglaise)
import { cardKey, lockedCards, type Friend, type GameBackend, type PlayerCard, type TradeHistoryItem, type TradeItem, type TradeView } from '../backend';
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
import { cardQuery, cardWhere, searchCatalog } from '../../core/cardSearch';
import { createForYou, pickCardSheet } from './forYou';
import { invalidatePanel, showCardPanel } from './cardPanel';
import { proposable } from '../../core/deals';
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
/** mini-jauge (part de chaque côté en valeur) + « tu donnes 4★+5★ (≈ 400) contre 2★ (≈ 15) » */
function gaugeHtml(give: TradeItem[], get: TradeItem[], cls: string) {
  const vg = value(give), vr = value(get);
  const tot = vg + vr || 1;
  return `<div class="gauge ${cls}"><div class="gauge-bar"><i class="g-give" style="width:${((vg / tot) * 100).toFixed(1)}%"></i><i class="g-get" style="width:${((vr / tot) * 100).toFixed(1)}%"></i></div><div class="gauge-txt">${tr('tr.youGive')} <b>${esc(starsSummary(give))}</b> (≈ ${fmtCoins(vg)}) contre <b>${esc(starsSummary(get))}</b> (≈ ${fmtCoins(vr)})</div></div>`;
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
        <button role="tab" data-z="pour" class="on" aria-selected="true">${tr('tr.forYou')}<b class="badge ex-b-pour" hidden></b></button>
        <button role="tab" data-z="cherche" aria-selected="false">${tr('tr.search')}</button>
        <button role="tab" data-z="cours" aria-selected="false">${tr('tr.ongoing')}<b class="badge ex-b-cours" hidden></b></button>
      </div>
    </header>
    <div class="ex-zone ex-pour" data-z="pour"><div class="ex-vendre"></div></div>
    <div class="ex-zone ex-cherche" data-z="cherche" hidden>
      <div class="ex-search">
        <input class="search ex-q" type="search" placeholder="${tr('tr.searchPh')}" enterkeyhint="search" autocomplete="off" spellcheck="false" aria-label="${tr('tr.searchA')}">
        <div class="starf ex-stars" role="group" aria-label="${tr('tr.stars')}">${STARS.map((r) => `<button class="chip" data-r="${r}" style="--rc:${rarity(r).hex}" title="${rarity(r).label}">${RANK[r] + 1}★</button>`).join('')}</div>
      </div>
      <div class="ex-results" aria-live="polite"></div>
      <h3 class="ex-h ex-h-mk">${tr('tr.market')} <small>${tr('tr.marketD')}</small></h3>
    </div>
    <div class="ex-zone ex-cours" data-z="cours" hidden>
      <div class="pending"></div>
      <div class="ex-compose-cta"><button class="btn-ghost ex-compose">${tr('tr.compose')}</button><small>${tr('tr.composeD')}</small></div>
      <h3 class="hist-t"><button class="linkish hist-toggle">Historique ▸</button></h3><div class="history" hidden></div>
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
        <div class="gauge" hidden></div>
        <div class="fair"></div>
        <input class="note" maxlength="140" placeholder="Un petit mot ? (optionnel)">
      </div>
      <div class="tray-bar">
        <button class="tray-toggle" aria-expanded="false" aria-label="${tr('tr.detailA')}"><span class="tb-sum"></span><span class="tb-chev" aria-hidden="true">▴</span></button>
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
  let gauge = q('.tray .gauge');
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

  // ── (refonte 11/11) LA PAGE : trois zones (Pour toi · Chercher · En cours) + le composeur manuel
  const forYou = createForYou(backend, { chime: () => shell.sfx.chime(3, 0.08), search: () => setZone('cherche') });
  q('.ex-pour').append(forYou.el);
  // marché fondu dans « Chercher » (views/market.ts, même recherche) — abonnement seulement quand la zone est à l'écran
  const market = createMarket(backend, { chime: () => shell.sfx.chime(3, 0.08) });
  q('.ex-cherche').append(market.el);
  // (13/11, retours Hugo) « Vendre · Échanger » : une carte → en vente (prix fixe) OU à l'échange (tableau d'offres,
  // de nouveau ouvert), mes ventes, puis le tableau (toutes les annonces, les miennes, mes offres)
  const board = createBoard(backend, { fairness, gaugeHtml, ago, chime: () => shell.sfx.chime(3, 0.08) });
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
      board.enter();
    },
  });
  // (v2.0.1) dans « Pour toi » : vendre / échanger en tête, les échanges tout faits, puis mes annonces et leurs offres
  q('.ex-vendre').append(sellMk.el);
  q('.ex-pour').append(board.el);

  type Zone = 'pour' | 'vendre' | 'cherche' | 'cours' | 'compose';
  let zone: Zone = 'pour';
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
    if (z === 'cherche') market.enter();
    else market.leave();
    // (v2.0.1, retours Hugo) vendre / échanger une carte se fait directement dans « Pour toi » (plus d'onglet à part)
    if (z === 'pour') {
      sellMk.enter();
      board.enter();
    } else {
      sellMk.leave();
      board.leave();
    }
    if (z === 'pour') forYou.enter();
    if (z === 'cours') {
      renderPending();
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
  q('.ex-back').addEventListener('click', () => setZone('cours'));
  const syncTabBadges = () => {
    const ni = backend.state.trades.incoming.length;
    const bc = q('.ex-b-cours');
    bc.hidden = !ni;
    bc.textContent = String(ni);
    // offres reçues sur mes annonces, contre-offres : sur l'onglet du tableau
    const nb = board.attention();
    const np = forYou.count() + nb;
    const bp = q('.ex-b-pour');
    bp.hidden = !np;
    bp.textContent = String(np);
  };
  backend.onChange(() => el.isConnected && syncTabBadges());
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
      add(sd, c, free);
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
  function renderPending() {
    const { incoming, outgoing } = backend.state.trades;
    if (confirmingTrade && !incoming.some((t) => t.id === confirmingTrade)) confirmingTrade = null;
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
        const acts = t.quick
          ? `<div class="act"><button class="linkish t-decline">${tr('tr.refuse')}</button><button class="btn-ghost t-pick">${tr('tr.pickOther')}</button><button class="btn-primary t-accept">${tr('tr.accept')}</button></div>`
          : `<div class="act"><button class="linkish t-decline">${tr('tr.refuse')}</button><button class="btn-ghost ctr">Contre-proposer</button><button class="btn-primary t-accept">${tr('tr.accept')}</button></div>`;
        r.innerHTML = `<div class="who"><b>${esc(t.fromName)}</b> ${t.quick ? tr('tr.asksYou') : tr('tr.offersYou')} ${tag} ${when}</div><div class="its">${itemsHtml(t.offered)}</div><div class="who">${tr('tr.against')}</div><div class="its">${itemsHtml(t.requested, lasts)}</div>${t.note ? `<div class="tnote">« ${esc(t.note)} »</div>` : ''}${gaugeHtml(t.requested, t.offered, f.cls === 'warn' ? 'warn' : f.cls === 'ok' ? 'ok' : '')}${f.txt ? `<div class="fair ${f.cls}">${esc(f.txt)}</div>` : ''}${lasts.length ? `<div class="fair warn">${tr('tr.lastCopy', { names: lasts.map((it) => esc(name(it.cardId))).join(', ') })}</div>` : ''}${tradeErr.get(t.id) ? `<div class="fair warn t-err" role="alert">${esc(tradeErr.get(t.id)!)}</div>` : ''}${confirmingTrade === t.id ? `<div class="act t-confirm"><span class="cf-q">${tr('tr.confirmQ')}</span><button class="btn-ghost cf-no">${tr('pf.cancel')}</button><button class="btn-primary cf-ok">${tr('tr.yesTrade')}</button></div>` : acts}`;
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
        void act(async () => (await backend.respondTrade(t.id, true), shell.sfx.chime(3, 0.08)), tr('tr.done'), e.currentTarget as HTMLElement);
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
      pendingEl.append(r);
    };
    incoming.forEach((t) => row(t, 'in'));
    outgoing.forEach((t) => row(t, 'out'));
  }
  let histOpen = false;
  let history: TradeHistoryItem[] = [];
  async function loadHistory() {
    try {
      history = await backend.tradeHistory();
    } catch {
      history = [];
    }
    renderHistory();
  }
  function renderHistory() {
    q('.hist-toggle').textContent = tr('tr.history', { n: history.length ? `(${history.length}) ` : '', arrow: histOpen ? '▾' : '▸' });
    historyEl.hidden = !histOpen;
    if (!histOpen) return;
    historyEl.innerHTML = history.length ? '' : '<div class="muted">' + tr('tr.noHistory') + '</div>';
    const me = backend.state.user?.id;
    const LABEL: Record<TradeHistoryItem['status'], string> = { accepted: tr('tr.st.accepted'), declined: tr('tr.st.refused'), cancelled: tr('tr.st.cancelled'), countered: tr('tr.st.countered') };
    for (const t of history) {
      const out = t.fromId === me;
      const other = out ? t.toName : t.fromName;
      const r = h('div', `trade hist ${t.status}`);
      r.innerHTML = `<div class="who"><b>${esc(other)}</b> · <span class="st">${LABEL[t.status]}</span> <span class="when">${ago(t.resolvedAt)}</span></div>
        <div class="hist-row"><span class="hl">${out ? tr('tr.youGave') : tr('tr.theyGave')}</span><div class="its">${itemsHtml(t.offered)}</div></div>
        <div class="hist-row"><span class="hl">contre</span><div class="its">${itemsHtml(t.requested)}</div></div>`;
      historyEl.append(r);
    }
  }
  q('.hist-toggle').addEventListener('click', () => {
    histOpen = !histOpen;
    renderHistory();
    if (histOpen && !history.length) void loadHistory();
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

  // ── CHERCHER (refonte 11/11) : une recherche dans TOUT le catalogue (toucher = « chez les joueurs », views/cardPanel.ts)
  // et le marché dessous, filtré pareil. Sans texte : rien que le marché (avec l'étoile choisie).
  let pendingGet: string | null = null;
  const findIn = q<HTMLInputElement>('.ex-q');
  const findRes = q('.ex-results');
  let findStar: RarityId | null = null;
  const findStars = [...el.querySelectorAll<HTMLButtonElement>('.ex-stars .chip')];
  function renderFind() {
    const v = findIn.value.trim();
    market.setFilter(v, findStar);
    q('.ex-h-mk').hidden = false;
    if (!v) return void (findRes.innerHTML = '');
    const have = new Map(backend.state.collection.map((c) => [c.cardId, c.count]));
    const res = searchCatalog(v, { limit: 40, includeSecret: (id) => have.has(id) })
      .filter((e) => !findStar || e.rarity === findStar)
      .slice(0, 12);
    if (!res.length) return void (findRes.innerHTML = `<div class="muted ex-none">${tr('tr.noCardMatch', { q: esc(v) })}</div>`);
    findRes.replaceChildren(
      h('h3', 'ex-h', `${tr('tr.cards')} <small>${tr('tr.cardsD')}</small>`),
      ...res.map((e) => {
        const r = rarity(e.rarity);
        const n = have.get(e.id) ?? 0;
        const wish = backend.state.wishlist.includes(e.id);
        const row = h('button', 'tf-row ex-row');
        row.style.setProperty('--rc', r.hex);
        row.innerHTML = `${e.rarity !== 'secret' ? `<img alt="" loading="lazy" src="${thumbUrl(e)}">` : '<span class="tf-noimg"></span>'}<span class="tf-id"><b>${esc(e.name)}</b><small>${esc(cardWhere(e))} · <i>${r.rank + 1}★</i> · <em>${n ? tr('tr.youHave', { n }) : 'manquante'}</em>${wish ? ' · <em class="ex-wish">♥ voulue</em>' : ''}</small></span><span class="ex-go" aria-hidden="true">›</span>`;
        row.addEventListener('click', () => showCardPanel(backend, e.id));
        return row;
      }),
    );
  }
  let findT = 0;
  findIn.addEventListener('input', () => {
    clearTimeout(findT);
    findT = window.setTimeout(renderFind, 140);
  });
  findStars.forEach((b) =>
    b.addEventListener('click', () => {
      findStar = findStar === b.dataset.r ? null : (b.dataset.r as RarityId);
      findStars.forEach((x) => x.classList.toggle('on', x.dataset.r === findStar));
      renderFind();
    }),
  );

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
  function add(sd: Side, c: PlayerCard, max: number) {
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
    renderTray();
    lastAdded = '';
    tray.classList.remove('bump');
    void tray.offsetWidth;
    tray.classList.add('bump');
    if (sd === 'get' && !give.length && !giveHinted) {
      giveHinted = true;
      const b = q('.tr-side [data-s="give"]');
      b.classList.remove('hint');
      void b.offsetWidth;
      b.classList.add('hint');
    }
  }

  function renderTray() {
    const owned = mine();
    /** contre-proposition : la proposition d'origine (vue de mon côté), pour marquer ce qui change (UX4-14) */
    const orig = countering ? { give: countering.requested, get: countering.offered } : null;
    const origCount = (sd: Side, it: TradeItem) => (orig ? (orig[sd].find((x) => cardKey(x) === cardKey(it))?.count ?? 0) : 0);
    const fill = (box: HTMLElement, list: TradeItem[], sd: Side) => {
      box.innerHTML = list.length ? '' : `<div class="muted">${sd === 'get' ? tr('tr.hintAsk') : tr('tr.hintGive')}</div>`;
      for (const it of list) {
        const e = catalogEntry(it.cardId);
        const have = sd === 'give' ? (owned.get(cardKey(it))?.count ?? 0) : 0;
        const last = sd === 'give' && have > 0 && it.count >= have;
        const was = origCount(sd, it);
        const diff = orig ? (was === 0 ? ' added' : was !== it.count ? ' changed' : '') : '';
        const r = h('div', `ti${diff}${last ? ' last' : ''}`, `<span class="sw" style="background:${rarity(it.rarity).hex}"></span>${e ? `<img class="tth" alt="" data-zoom="${esc(`${it.cardId}|${it.rarity}`)}" src="${thumbUrl(e)}">` : ''}<span class="tn">${esc(name(it.cardId))}${last ? ' <i class="ti-last">' + tr('tr.yourLast') + '</i>' : ''}${diff === ' added' ? ' <i class="ti-diff">' + tr('tr.added') + '</i>' : diff === ' changed' ? ` <i class="ti-diff">${tr('tr.before', { n: was })}</i>` : ''}</span><span class="tc">×${it.count}</span>${(maxOf.get(`${sd}:${cardKey(it)}`) ?? 1) > it.count ? '<button class="plus" aria-label="' + tr('tr.oneMore') + '">+</button>' : ''}<button class="minus" aria-label="${tr('tr.removeCard')}">✕</button>`); // i18n-ok
        if (lastAdded === `${sd}:${cardKey(it)}`) r.classList.add('new');
        r.querySelector('.minus')!.addEventListener('click', () => {
          it.count--;
          if (it.count <= 0) list.splice(list.indexOf(it), 1);
          renderTray();
        });
        r.querySelector('.plus')?.addEventListener('click', () => {
          it.count++;
          renderTray();
        });
        box.append(r);
      }
      // ce qui était dans la proposition d'origine et n'y est plus : barré
      if (orig) for (const it of orig[sd]) if (!list.some((x) => cardKey(x) === cardKey(it))) box.insertAdjacentHTML('beforeend', `<div class="ti removed"><span class="sw" style="background:${rarity(it.rarity).hex}"></span><span></span><span class="tn">${esc(name(it.cardId))} <i class="ti-diff">${tr('tr.removed')}</i></span><span class="tc">×${it.count}</span></div>`);
    };
    fill(lGet, get, 'get');
    fill(lGive, give, 'give');
    markPicks();
    const f = fairness(give, get);
    // dernier exemplaire donné : dit en clair (UX4-12), pas seulement dans une infobulle
    const lasts = give.filter((it) => {
      const have = owned.get(cardKey(it))?.count ?? 0;
      return have > 0 && it.count >= have;
    });
    fair.className = `fair ${f.cls}`;
    fair.innerHTML = `${esc(f.txt)}${lasts.length ? `<span class="fair warn last-w">${tr('tr.lastWarn', { names: lasts.map((it) => esc(name(it.cardId))).join(', ') })}</span>` : ''}`;
    gauge.hidden = !give.length && !get.length;
    if (!gauge.hidden) gauge.outerHTML = gaugeHtml(give, get, f.cls === 'warn' ? 'warn' : f.cls === 'ok' ? 'ok' : '');
    gauge = q('.tray .gauge');
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
          if (it) b.textContent = `×${it.count}`;
          else b.remove();
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
      const z: Zone = toCompose
        ? 'compose'
        : sub === 'tableau' || sub === 'vendre'
          ? 'pour'
          : sub === 'pour' || sub === 'chercher' || sub === 'cours'
            ? (sub === 'chercher' ? 'cherche' : sub)
            : backend.state.trades.incoming.length > 0
              ? 'cours'
              : last === 'cherche' || last === 'cours'
                ? last
                : 'pour';
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
