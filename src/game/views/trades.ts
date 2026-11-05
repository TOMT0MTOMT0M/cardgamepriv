import { cardKey, lockedCards, type Friend, type GameBackend, type PlayerCard, type TradeHistoryItem, type TradeItem, type TradeView } from '../backend';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { ALL_THEMES, catalogEntry, subthemeById } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { busyButton, cardTile, errMsg, esc, fold, h, popLayer, pushLayer, starsHtml, thumbUrl, toast } from '../ui';
import { preloadThumbs } from '../preload';
import { haptics } from '../../core/haptics';
import { ABUSE, cardsValue, fmtCoins } from '../../core/economy';
import { confirmTap } from './safety';
import { createBoard } from './board';

/**
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
  if (vr === 0) return { cls: 'ok', txt: 'Cadeau : tu ne demandes rien.' };
  if (vg === 0) return { cls: 'info', txt: 'Tu ne donnes rien : à lui de voir.' };
  if (vg >= vr * 0.8 && vg <= vr * 1.25) return { cls: 'ok', txt: 'Échange équilibré.' };
  // (seuils de l'alerte anti-abus : 3 contre 1 en valeur)
  if (vg * ABUSE.tradeRatio < vr) return { cls: 'warn', txt: 'Très déséquilibré en ta faveur : il risque de refuser.' };
  if (vg > vr * ABUSE.tradeRatio) return { cls: 'warn', txt: 'Très déséquilibré : tu donnes beaucoup plus que tu ne reçois.' };
  if (vg < vr) return { cls: 'info', txt: 'Tu demandes un peu plus que tu ne donnes.' };
  return { cls: 'info', txt: 'Tu donnes un peu plus que tu ne reçois.' };
}
/** mini-jauge (part de chaque côté en valeur) + « tu donnes 4★+5★ (≈ 400) contre 2★ (≈ 15) » */
function gaugeHtml(give: TradeItem[], get: TradeItem[], cls: string) {
  const vg = value(give), vr = value(get);
  const tot = vg + vr || 1;
  return `<div class="gauge ${cls}"><div class="gauge-bar"><i class="g-give" style="width:${((vg / tot) * 100).toFixed(1)}%"></i><i class="g-get" style="width:${((vr / tot) * 100).toFixed(1)}%"></i></div><div class="gauge-txt">tu donnes <b>${esc(starsSummary(give))}</b> (≈ ${fmtCoins(vg)}) contre <b>${esc(starsSummary(get))}</b> (≈ ${fmtCoins(vr)})</div></div>`;
}
const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `il y a ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'hier' : `il y a ${d} j`;
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
    <div class="tr-tabs" role="tablist" aria-label="Échanges" hidden>
      <button role="tab" data-v="direct" class="on" aria-selected="true">Échanges directs<b class="badge tt-in" hidden></b></button>
      <button role="tab" data-v="board" aria-selected="false">Tableau d’offres<b class="badge tt-board" hidden></b></button>
    </div>
    <h2 class="tr-sec-h tr-sec-direct"><span>Échanges directs</span><small>avec tes amis · propositions reçues et envoyées</small><b class="badge tt-in2" hidden></b></h2>
    <div class="tr-col left">
      <h3>En cours</h3><div class="pending"></div>
      <h3>Échanger avec…</h3><div class="friends"></div>
      <h3 class="hist-t"><button class="linkish hist-toggle">Historique ▸</button></h3><div class="history" hidden></div>
    </div>
    <div class="tr-col compose">
      <div class="placeholder">Choisis un ami : on croise vos collections pour trouver les cartes à échanger.</div>
      <div class="work" hidden>
        <div class="work-head"><button class="tr-back" aria-label="Revenir à la liste des amis">‹</button><h3 class="fname"></h3><span class="counter-tag" hidden>contre-proposition</span></div>
        <div class="matches" hidden><h4>Matchs parfaits <small>ses doublons qui te manquent ↔ tes doublons qui lui manquent</small></h4><div class="match-list"></div></div>
        <div class="tr-side" role="tablist">
          <button role="tab" data-s="get" class="on" aria-selected="true"><b>Je demande</b><span>ses cartes · <i class="n-get">0</i></span><em class="p-get"></em></button>
          <button role="tab" data-s="give" aria-selected="false"><b>Je donne</b><span>mes cartes · <i class="n-give">0</i></span><em class="p-give"></em></button>
        </div>
        <div class="tr-filters">
          <input class="search tr-search" type="search" placeholder="Chercher une carte…" autocomplete="off" spellcheck="false" aria-label="Chercher une carte">
          <select class="tr-pack" aria-label="Pack"><option value="">Tous les packs</option>${ALL_THEMES.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select>
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
        <h3 class="tray-t">Proposition</h3>
        <div class="tray-sec"><h4>Tu reçois</h4><div class="tray-list l-get"></div></div>
        <div class="tray-sec"><h4>Tu donnes</h4><div class="tray-list l-give"></div></div>
        <div class="gauge" hidden></div>
        <div class="fair"></div>
        <input class="note" maxlength="140" placeholder="Un petit mot ? (optionnel)">
      </div>
      <div class="tray-bar">
        <button class="tray-toggle" aria-expanded="false" aria-label="Voir le détail de la proposition"><span class="tb-sum"></span><span class="tb-chev" aria-hidden="true">▴</span></button>
        <button class="btn-primary send" disabled>Proposer l’échange</button>
        <button class="btn-ghost counter-cancel" hidden>Annuler la contre-proposition</button>
      </div>
    </div>
    <div class="viewer-ui" hidden><button class="close" aria-label="Fermer">✕</button><div class="v-info"></div><div class="v-actions"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
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

  // ── TABLEAU D'OFFRES (retours live 02, lot T — views/board.ts) : 2e onglet de la page, ouvert à tous les joueurs
  const board = createBoard(backend, { fairness, gaugeHtml, ago, chime: () => shell.sfx.chime(3, 0.08) });
  // (retours 05/11) UN seul écran : le tableau d'offres en haut (grille qui défile vers la droite), les échanges
  // directs en dessous — plus d'onglets. `on-board` n'est plus utilisé : les deux sont toujours visibles.
  q('.tr-sec-direct').before(board.el);
  const tabBtns = [...el.querySelectorAll<HTMLButtonElement>('.tr-tabs button')];
  let onBoard = false;
  function setView(v: 'direct' | 'board') {
    // (retours 05/11) plus d'onglets : le tableau d'offres et les échanges directs sont sur le même écran ;
    // « aller au tableau » = remonter en haut, « échanges directs » = descendre jusqu'à leur titre
    onBoard = v === 'board';
    board.enter();
    renderPending();
    renderFriends();
    renderHistory();
    if (onBoard) el.scrollTo({ top: 0 });
  }
  tabBtns.forEach((x) => x.addEventListener('click', () => setView(x.dataset.v as 'direct' | 'board')));
  const syncTabBadges = () => {
    const bIn = q('.tt-in'), bBd = q('.tt-board');
    const ni = backend.state.trades.incoming.length, nb = board.attention();
    bIn.hidden = !ni;
    bIn.textContent = String(ni);
    bBd.hidden = !nb;
    bBd.textContent = String(nb);
    const b2 = q('.tt-in2');
    b2.hidden = !ni;
    b2.textContent = `${ni} reçue${ni > 1 ? 's' : ''}`;
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
    q('.tr-dups-l').textContent = side === 'give' ? 'mes doublons uniquement' : 'ses doublons';
    q('.tr-missing-l').textContent = side === 'give' ? 'qui lui manquent' : 'qui me manquent';
  }
  let searchT = 0;
  search.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = window.setTimeout(() => ((flt[side].q = fold(search.value.trim())), renderPicks(side)), 160);
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
    toast(countering ? 'Contre-proposition en cours : encore une fois pour l’abandonner.' : 'Proposition en cours : encore une fois pour l’abandonner.', 'info');
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
    if (sd === 'get' && wishMine) tile.insertAdjacentHTML('beforeend', '<span class="wb mine" title="Dans tes envies">♥ tu la cherches</span>');
    if (sd === 'give' && wishTheirs) tile.insertAdjacentHTML('beforeend', `<span class="wb theirs" title="Dans ses envies">♥ ${friend?.name.split(' ')[0] ?? 'il'} la cherche</span>`);
    if (sd === 'give' && free < c.count) tile.insertAdjacentHTML('beforeend', `<span class="tr-lock" title="${c.count - free} déjà engagé${c.count - free > 1 ? 's' : ''} dans un échange en attente">🔒</span>`);
    tile.classList.toggle('locked', sd === 'give' && free <= 0);
    // ton seul exemplaire : visible sur la tuile (en bas, ne recouvre ni « ×N » ni les envies)
    if (sd === 'give' && c.count === 1) tile.insertAdjacentHTML('beforeend', '<span class="wb last">dernier</span>');
    // « + » du coin : ajout direct ; le reste de la tuile ouvre le zoom
    const plus = h('button', 'tr-plus', '+');
    plus.title = sd === 'get' ? `Demander ${name(c.cardId)}` : `Proposer ${name(c.cardId)}${c.count === 1 ? ' (ton seul exemplaire)' : ''}`;
    plus.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sd === 'give' && free <= 0) return toast('Déjà engagée dans un échange en attente : attends la réponse.', 'info');
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
            return `<span class="it" style="--rc:${rarity(it.rarity).hex}">${img}${it.count > 1 ? `${it.count}× ` : ''}${esc(name(it.cardId))} <i>${rarity(it.rarity).rank + 1}★</i>${lasts.includes(it) ? ' <b class="last">dernier exemplaire</b>' : ''}</span>`;
          })
          .join('')
      : '<span class="it none">rien</span>';
  }
  function renderPending() {
    const { incoming, outgoing } = backend.state.trades;
    pendingEl.innerHTML = '';
    if (!incoming.length && !outgoing.length) pendingEl.innerHTML = `<div class="muted">Aucun échange en attente. ${backend.state.friends.length ? 'Choisis un ami ci-dessous : on te montre ce que vous pouvez échanger.' : ''}</div>`;
    const owned = mine();
    const row = (t: TradeView, dir: 'in' | 'out') => {
      const r = h('div', `trade ${dir}${countering?.id === t.id ? ' countering' : ''}`);
      const tag = t.counterOf ? '<span class="ctr-tag">contre-proposition</span>' : '';
      const when = `<span class="when">${ago(t.createdAt)}</span>`;
      if (dir === 'in') {
        // vu de mon côté : je donne ce qu'il demande, je reçois ce qu'il offre — même jauge que dans le composeur (UX4-03)
        const f = fairness(t.requested, t.offered);
        const lasts = t.requested.filter((it) => {
          const have = owned.get(cardKey(it))?.count ?? 0;
          return have > 0 && have <= it.count;
        });
        r.innerHTML = `<div class="who"><b>${esc(t.fromName)}</b> te propose ${tag} ${when}</div><div class="its">${itemsHtml(t.offered)}</div><div class="who">contre</div><div class="its">${itemsHtml(t.requested, lasts)}</div>${t.note ? `<div class="tnote">« ${esc(t.note)} »</div>` : ''}${gaugeHtml(t.requested, t.offered, f.cls === 'warn' ? 'warn' : f.cls === 'ok' ? 'ok' : '')}${f.txt ? `<div class="fair ${f.cls}">${esc(f.txt)}</div>` : ''}${lasts.length ? `<div class="fair warn">Tu donnerais ton dernier exemplaire de ${lasts.map((it) => esc(name(it.cardId))).join(', ')}.</div>` : ''}<div class="act"><button class="linkish no">Refuser</button><button class="btn-ghost ctr">Contre-proposer</button><button class="btn-primary ok">Accepter</button></div>`;
      } else r.innerHTML = `<div class="who">À <b>${esc(t.toName)}</b> · tu donnes ${tag} ${when}</div><div class="its">${itemsHtml(t.offered)}</div><div class="who">contre</div><div class="its">${itemsHtml(t.requested)}</div><div class="act"><span class="muted">en attente…</span><button class="btn-ghost cancel">Annuler</button></div>`;
      const act = async (fn: () => Promise<void>, ok: string) => {
        if (r.dataset.busy) return; // (anti double-toucher : les boutons sont aussi désactivés)
        r.dataset.busy = '1';
        r.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
        try {
          await fn();
          toast(ok, 'ok');
          void loadHistory();
        } catch (e) {
          toast(errMsg(e), 'err');
          r.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = false));
        } finally {
          delete r.dataset.busy;
        }
      };
      // irréversibles : second toucher (« Confirmer ? »), la jauge et l'avertissement sont juste au-dessus
      r.querySelector<HTMLElement>('.ok')?.addEventListener('click', (e) => {
        if (!confirmTap(e.currentTarget as HTMLElement, 'Confirmer l’échange ?')) return;
        void act(async () => (await backend.respondTrade(t.id, true), shell.sfx.chime(3, 0.08)), 'Échange conclu ! Les cartes sont dans ta collection.');
      });
      r.querySelector<HTMLElement>('.no')?.addEventListener('click', (e) => {
        if (!confirmTap(e.currentTarget as HTMLElement, 'Refuser ?')) return;
        void act(() => backend.respondTrade(t.id, false), 'Échange refusé.');
      });
      r.querySelector('.cancel')?.addEventListener('click', () => act(() => backend.cancelTrade(t.id), 'Proposition annulée.'));
      r.querySelector('.ctr')?.addEventListener('click', () => void startCounter(t));
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
    q('.hist-toggle').textContent = `Historique ${history.length ? `(${history.length}) ` : ''}${histOpen ? '▾' : '▸'}`;
    historyEl.hidden = !histOpen;
    if (!histOpen) return;
    historyEl.innerHTML = history.length ? '' : '<div class="muted">Aucun échange terminé pour l’instant.</div>';
    const me = backend.state.user?.id;
    const LABEL: Record<TradeHistoryItem['status'], string> = { accepted: 'accepté', declined: 'refusé', cancelled: 'annulé', countered: 'contre-proposé' };
    for (const t of history) {
      const out = t.fromId === me;
      const other = out ? t.toName : t.fromName;
      const r = h('div', `trade hist ${t.status}`);
      r.innerHTML = `<div class="who"><b>${esc(other)}</b> · <span class="st">${LABEL[t.status]}</span> <span class="when">${ago(t.resolvedAt)}</span></div>
        <div class="hist-row"><span class="hl">${out ? 'tu donnais' : 'il donnait'}</span><div class="its">${itemsHtml(t.offered)}</div></div>
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
    friendsEl.innerHTML = fs.length ? '' : `<div class="muted">${backend.state.mode === 'online' ? 'Personne d’autre n’est encore inscrit : invite tes potes sur le serveur Discord, ils apparaîtront ici.' : 'Pas d’ami pour l’instant.'}</div>`;
    for (const f of fs) {
      const b = h('button', `friend${friend?.id === f.id ? ' on' : ''}`, `<span class="dot${f.online ? ' on' : ''}"></span><span class="fn">${esc(f.name)}</span>${f.status ? `<span class="fs">${esc(f.status)}</span>` : ''}`);
      b.addEventListener('click', () => void pick(f));
      friendsEl.append(b);
    }
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
    renderMatches();
    renderPicks('get');
    renderPicks('give');
    renderTray();
  }

  /** Contre-proposer : on reprend l'échange reçu dans le composeur (inversé : je donne ce qu'il demandait, je demande ce qu'il offrait). */
  async function startCounter(t: TradeView) {
    const f = backend.state.friends.find((x) => x.id === t.fromId);
    if (!f) return toast('Ami introuvable.', 'err');
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
    toast('Contre-proposition : ✕ dans le volet pour retirer, + sur une carte des grilles pour ajouter, puis renvoie-la.', 'info');
  }
  function syncCounterUi() {
    const on = !!countering;
    q('.counter-tag').hidden = !on;
    counterCancel.hidden = !on;
    q('.tray-t').textContent = on ? `Contre-proposition à ${countering!.fromName}` : 'Proposition';
    sendBtn.textContent = on ? 'Renvoyer la contre-proposition' : 'Proposer l’échange';
  }
  counterCancel.addEventListener('click', (e) => {
    if (!confirmTap(e.currentTarget as HTMLElement, 'Abandonner la contre-proposition ?')) return;
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
      row.innerHTML = `<span class="m-card" style="--rc:${rarity(p.get.rarity).hex}"><img alt="" loading="lazy" src="${thumbUrl(eg)}"><b>${esc(eg.name)}</b><i>${starsHtml(p.get.rarity)}</i>${backend.state.wishlist.includes(eg.id) ? '<em>♥ tu la cherches</em>' : ''}</span>
        <span class="m-arrow">⇄</span>
        <span class="m-card" style="--rc:${rarity(p.give.rarity).hex}"><img alt="" loading="lazy" src="${thumbUrl(ev)}"><b>${esc(ev.name)}</b><i>${starsHtml(p.give.rarity)}</i>${theirWish.has(ev.id) ? '<em>♥ il la cherche</em>' : ''}</span>
        <span class="m-go">Proposer</span>`;
      row.title = `Tu reçois ${eg.name}, tu donnes ${ev.name} (vous avez chacun un doublon)`;
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
    const sort = (a: PlayerCard, b: PlayerCard) => RANK[b.rarity] - RANK[a.rarity] || (catalogEntry(a.cardId)?.num ?? 0) - (catalogEntry(b.cardId)?.num ?? 0);
    const match = (c: PlayerCard) => {
      const e = catalogEntry(c.cardId);
      if (!e) return false;
      if (f.star && c.rarity !== f.star) return false;
      if (f.pack && e.themeId !== f.pack) return false;
      if (f.q && !fold(e.name).includes(f.q) && String(e.num) !== f.q && !fold(subthemeById(e.subthemeId)?.label ?? '').includes(f.q)) return false;
      return true;
    };
    // une recherche passe outre les deux filtres (on cherche UNE carte précise, UX4-11)
    const dupsOn = f.dups && !f.q, missOn = f.onlyMissing && !f.q;
    const list =
      sd === 'get'
        ? theirs.filter((c) => (!missOn || !m.has(cardKey(c))) && (!dupsOn || c.count >= 2) && match(c)).sort(sort)
        : [...m.values()].filter((c) => (!missOn || !t.has(cardKey(c))) && (!dupsOn || c.count >= 2) && match(c)).sort((a, b) => Number(freeCount(b) > 0) - Number(freeCount(a) > 0) || sort(a, b));
    const fname = friend?.name ?? 'ton ami';
    // le titre dit TOUS les filtres actifs, avec « tout afficher » toujours là
    const titleOf = () => {
      const base = sd === 'get' ? `${dupsOn ? 'Ses doublons' : `Les cartes de ${fname}`}${missOn ? ' qui te manquent' : ''}` : `${dupsOn ? 'Tes doublons' : 'Tes cartes'}${missOn ? ' qui lui manquent' : ''}`;
      return `${esc(base)} <small>— touche pour voir, + pour ${sd === 'get' ? 'demander' : 'donner'}</small>${f.q && (f.dups || f.onlyMissing) ? ' <small class="tr-ign">(filtres ignorés pendant la recherche)</small>' : ''}${!f.q && (f.dups || f.onlyMissing) ? ' <button class="linkish tr-all">tout afficher</button>' : ''}`;
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
      grid.innerHTML = `<div class="muted">${f.q || f.star || f.pack ? 'Aucune carte ne correspond aux filtres.' : sd === 'get' ? 'Rien de nouveau chez lui pour toi.' : 'Rien qui lui manque.'}${missOn || dupsOn ? ' <button class="linkish see-all">Voir toutes les cartes</button>' : ''}</div>`;
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
      if (list.length >= 12) return toast('12 cartes différentes au maximum par côté.', 'info');
      list.push({ cardId: c.cardId, rarity: c.rarity, count: 1 });
      if (sd === 'give' && c.count === 1 && !lastHinted) {
        lastHinted = true;
        toast(`${name(c.cardId)} : c’est ton seul exemplaire. Si l’échange passe, elle sort de ta collection.`, 'info');
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
      box.innerHTML = list.length ? '' : `<div class="muted">${sd === 'get' ? 'touche + sur une de ses cartes (onglet « Je demande »)' : 'touche + sur une de tes cartes (onglet « Je donne »)'}</div>`;
      for (const it of list) {
        const e = catalogEntry(it.cardId);
        const have = sd === 'give' ? (owned.get(cardKey(it))?.count ?? 0) : 0;
        const last = sd === 'give' && have > 0 && it.count >= have;
        const was = origCount(sd, it);
        const diff = orig ? (was === 0 ? ' added' : was !== it.count ? ' changed' : '') : '';
        const r = h('div', `ti${diff}${last ? ' last' : ''}`, `<span class="sw" style="background:${rarity(it.rarity).hex}"></span>${e ? `<img class="tth" alt="" src="${thumbUrl(e)}">` : ''}<span class="tn">${esc(name(it.cardId))}${last ? ' <i class="ti-last">ton dernier</i>' : ''}${diff === ' added' ? ' <i class="ti-diff">ajoutée</i>' : diff === ' changed' ? ` <i class="ti-diff">avant ×${was}</i>` : ''}</span><span class="tc">×${it.count}</span>${(maxOf.get(`${sd}:${cardKey(it)}`) ?? 1) > it.count ? '<button class="plus" aria-label="Un exemplaire de plus">+</button>' : ''}<button class="minus" aria-label="Retirer une carte">✕</button>`);
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
      if (orig) for (const it of orig[sd]) if (!list.some((x) => cardKey(x) === cardKey(it))) box.insertAdjacentHTML('beforeend', `<div class="ti removed"><span class="sw" style="background:${rarity(it.rarity).hex}"></span><span></span><span class="tn">${esc(name(it.cardId))} <i class="ti-diff">retirée</i></span><span class="tc">×${it.count}</span></div>`);
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
    fair.innerHTML = `${esc(f.txt)}${lasts.length ? `<span class="fair warn last-w">Tu donnes ton dernier exemplaire de ${lasts.map((it) => esc(name(it.cardId))).join(', ')} : elle sortira de ta collection.</span>` : ''}`;
    gauge.hidden = !give.length && !get.length;
    if (!gauge.hidden) gauge.outerHTML = gaugeHtml(give, get, f.cls === 'warn' ? 'warn' : f.cls === 'ok' ? 'ok' : '');
    gauge = q('.tray .gauge');
    const unchanged = !!orig && sameItems(orig.give, give) && sameItems(orig.get, get);
    sendBtn.disabled = sending || !friend || (!give.length && !get.length) || unchanged;
    if (countering) sendBtn.textContent = unchanged ? 'Rien n’a changé' : 'Renvoyer la contre-proposition';
    const n = (l: TradeItem[]) => l.reduce((a, it) => a + it.count, 0);
    const ng = n(get), nd = n(give);
    traySum.innerHTML = !ng && !nd ? '<span class="muted">Touche + sur des cartes pour composer l’échange</span>' : `<b>${ng}</b> reçue${ng > 1 ? 's' : ''} · <b>${nd}</b> donnée${nd > 1 ? 's' : ''}${f.txt ? ` <span class="fair ${f.cls}">· ${esc(f.txt.replace(/\.$/, ''))}</span>` : ''}${lasts.length ? ' <span class="fair warn">· dernier exemplaire</span>' : ''}`;
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
        toast(`Contre-proposition envoyée à ${friend.name} !`, 'ok');
      } else {
        await busyButton(sendBtn, backend.proposeTrade(friend.id, give, get, note.value.trim() || undefined));
        toast(`Proposition envoyée à ${friend.name} !`, 'ok');
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
    vInfo.innerHTML = `<div class="ci-name">${esc(e?.name ?? c.cardId)}</div><div class="ci-meta">${starsHtml(c.rarity)} <span class="ci-r" style="color:${rr.accentHex}">${rr.label}</span></div><div class="ci-sub">${sd === 'get' ? `${esc(friend?.name ?? '')} en a ${c.count}` : `tu en as ${c.count}${free < c.count ? ` (${c.count - free} engagé${c.count - free > 1 ? 's' : ''})` : ''}`}${sd === 'get' && backend.state.wishlist.includes(c.cardId) ? ' · ♥ tu la cherches' : ''}${sd === 'give' && theirWish.has(c.cardId) ? ' · ♥ il la cherche' : ''}</div>`;
    const inList = (sd === 'get' ? get : give).some((x) => cardKey(x) === cardKey(c));
    vActions.innerHTML = `<button class="va va-add${inList ? ' on' : ''}">${inList ? '✓ Dans la proposition — retirer' : sd === 'get' ? '+ Demander cette carte' : '+ Donner cette carte'}</button>`;
    vActions.querySelector('.va-add')!.addEventListener('click', () => {
      if (sd === 'give' && free <= 0) return toast('Déjà engagée dans un échange en attente.', 'info');
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
      // « #/echanges/tableau » (ou « Proposer sur le tableau » depuis une carte) : l'onglet du tableau d'offres
      const toBoard = sub === 'tableau' || !!sessionStorage.getItem('bebou.boardGive');
      pendSig = friendSig = '';
      setView(toBoard ? 'board' : 'direct');
      if (toBoard) return;
      renderPending();
      renderFriends();
      renderHistory();
      void loadHistory();
      const want = sessionStorage.getItem('bebou.tradeWith');
      sessionStorage.removeItem('bebou.tradeWith');
      const wanted = want ? backend.state.friends.find((f) => f.id === want) : undefined;
      if (wanted) void pick(wanted);
      else if (friend) void pick(backend.state.friends.find((f) => f.id === friend!.id) ?? friend, true);
      else if (sessionStorage.getItem('bebou.tradeGive')) toast('Choisis un ami : la carte sera dans ta proposition', 'info');
    },
    leave() {
      if (open) closeViewer();
      setTrayOpen(false);
      board.leave();
    },
  };
}
