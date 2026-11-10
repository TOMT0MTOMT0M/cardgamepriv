import { BOARD_HOURS, BOARD_MAX_ITEMS, BOARD_MAX_OPEN, boardAttention, cardKey, listingLive, lockedCards, type GameBackend, type ListingOfferView, type ListingView, type PlayerCard, type TradeItem } from '../backend';
import { ALL_THEMES, catalogEntry } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { cardsValue, fmtCoins } from '../../core/economy';
import { cardTile, errMsg, esc, fold, h, popLayer, pushLayer, thumbUrl, toast } from '../ui';
import { confirmTap, guarded } from './safety';
import { leave } from '../../core/morph';

/**
 * TABLEAU D'OFFRES (retours live 02, point 4) — onglet de la vue Échanges, ouvert à TOUS les joueurs.
 *  - « Toutes les annonces » : cartes proposées, cartes recherchées (« tu l'as » si je l'ai de libre), petit mot,
 *    expiration ; filtres (recherche, étoile, « qui me manquent », « ils cherchent mes cartes »).
 *  - « Publier une annonce » : mes cartes libres (VERROUILLÉES tant qu'elle est ouverte), cartes recherchées
 *    (catalogue ou mes envies), petit mot, 24 ou 48 h.
 *  - Détail d'une annonce : chez les autres, « Faire une offre » (mes cartes, jauge d'équilibre) ; chez moi, les offres
 *    reçues : Accepter (second toucher) / Refuser / Contre-offre (une partie de l'annonce contre ce que je veux chez lui).
 *  - « Mes offres » : en attente, contre-offre reçue (Accepter / Refuser), acceptées / refusées / closes.
 * Ordinateur : colonne de gauche (actions, onglets, filtres) + grille d'annonces ; le détail s'ouvre en fenêtre à deux
 * colonnes (l'annonce | les offres). Téléphone : une colonne, détail plein écran, cibles de 40 px.
 */
export interface BoardDeps {
  fairness(give: TradeItem[], get: TradeItem[]): { cls: '' | 'ok' | 'info' | 'warn'; txt: string };
  gaugeHtml(give: TradeItem[], get: TradeItem[], cls: string): string;
  ago(t: number): string;
  chime(): void;
}
export interface BoardView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
  /** à traiter (pastille de l'onglet) */
  attention(): number;
}

type Tab = 'all' | 'mine' | 'offers';
const STARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
const starLbl = (r: RarityId) => (r === 'secret' ? '✷' : `${rarity(r).rank + 1}★`);
const nameOf = (id: string) => catalogEntry(id)?.name ?? id;
const sumCount = (l: TradeItem[]) => l.reduce((a, it) => a + it.count, 0);
const gaugeCls = (c: string) => (c === 'warn' ? 'warn' : c === 'ok' ? 'ok' : '');
/** « expire dans 23 h » */
function left(t: number) {
  const s = (t - Date.now()) / 1000;
  if (s <= 0) return 'expirée';
  if (s < 3600) return `expire dans ${Math.max(1, Math.floor(s / 60))} min`;
  return `expire dans ${Math.floor(s / 3600)} h`;
}
const STATUS: Record<ListingOfferView['status'], string> = {
  pending: 'en attente',
  countered: 'contre-offre reçue',
  accepted: 'acceptée',
  declined: 'refusée',
  withdrawn: 'retirée',
  closed: 'close',
};

/** Rangée de vignettes (cartes d'une annonce / d'une offre). */
function thumbs(items: Array<{ cardId: string; rarity: RarityId; count?: number }>, o: { have?: (it: { cardId: string; rarity: RarityId }) => boolean; empty?: string } = {}) {
  if (!items.length) return `<span class="muted">${o.empty ?? 'rien'}</span>`;
  return items
    .map((it) => {
      const e = catalogEntry(it.cardId);
      const rr = rarity(it.rarity);
      const hide = rr.secret && !(o.have?.(it) ?? false);
      const img = e && !hide ? `<img alt="" loading="lazy" decoding="async" src="${thumbUrl(e)}">` : '<span class="q">?</span>';
      // (retours live 6, B6) toucher la carte = la voir en grand (trades.ts, `[data-zoom]`)
      return `<span class="ob-th"${hide || !e ? '' : ` data-zoom="${esc(`${it.cardId}|${it.rarity}`)}"`} style="--rc:${rr.hex}" title="${esc(`${hide ? 'Carte secrète' : (e?.name ?? it.cardId)} · ${rr.label}`)}"><span class="ob-im">${img}${(it.count ?? 1) > 1 ? `<b class="ob-xn">×${it.count}</b>` : ''}${o.have?.(it) ? '<i class="ob-have" title="Tu l’as">✓</i>' : ''}</span><span class="ob-tn">${esc(hide ? '???' : (e?.name ?? it.cardId))}</span><span class="ob-ts">${starLbl(it.rarity)}</span></span>`;
    })
    .join('');
}

export function createBoard(backend: GameBackend, deps: BoardDeps): BoardView {
  const el = h('section', 'ob');
  el.dataset.tab = 'all';
  let tab: Tab = 'all';
  let all: ListingView[] = [];
  let unwatch: (() => void) | null = null;
  const flt = { q: '', star: null as RarityId | null, missing: false, wanted: false };
  el.innerHTML = `
    <aside class="ob-side">
      <div class="ob-intro"><h3>Tableau d’offres</h3><p>Ouvert à tous les joueurs : publie des cartes, les autres te font leurs offres.</p></div>
      <button class="btn-primary ob-new">+ Publier une annonce</button>
      <div class="ob-seg" role="tablist" aria-label="Annonces">
        <button role="tab" data-t="all" class="on" aria-selected="true">Toutes les annonces <i class="ob-n n-all"></i></button>
        <button role="tab" data-t="mine" aria-selected="false">Mes annonces <i class="ob-n n-mine"></i><b class="ob-dot d-mine" hidden></b></button>
        <button role="tab" data-t="offers" aria-selected="false">Mes offres <i class="ob-n n-offers"></i><b class="ob-dot d-offers" hidden></b></button>
      </div>
      <div class="ob-filters">
        <input class="ob-q" type="search" placeholder="Carte ou joueur…" autocomplete="off" spellcheck="false" aria-label="Chercher une carte ou un joueur">
        <div class="ob-stars">${STARS.map((r) => `<button class="chip" data-r="${r}" style="--rc:${rarity(r).hex}" title="${rarity(r).label}">${starLbl(r)}</button>`).join('')}</div>
        <label class="ob-tog"><input type="checkbox" class="f-missing"><span>des cartes qui me manquent</span></label>
        <label class="ob-tog"><input type="checkbox" class="f-wanted"><span>ils cherchent mes cartes</span></label>
      </div>
      <p class="ob-rule muted">Les cartes d’une annonce ou d’une offre en cours sont verrouillées 🔒 : pas de contrat, de forge, de mise ni d’autre échange tant qu’elle court.</p>
    </aside>
    <div class="ob-main"><div class="ob-list" aria-live="polite"></div></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const list = q('.ob-list');
  const segBtns = [...el.querySelectorAll<HTMLButtonElement>('.ob-seg button')];
  const starBtns = [...el.querySelectorAll<HTMLButtonElement>('.ob-stars .chip')];

  // ── aides « mes cartes »
  const owned = () => new Map(backend.state.collection.map((c) => [cardKey(c), c] as const));
  const ownedIds = () => new Set(backend.state.collection.map((c) => c.cardId));
  /** exemplaires libres (hors une offre qu'on remplace) */
  const freeOf = (c: { cardId: string; rarity: RarityId }, except?: ListingOfferView | null) => {
    const have = owned().get(cardKey(c))?.count ?? 0;
    const back = except?.offered.find((x) => cardKey(x) === cardKey(c))?.count ?? 0;
    return Math.max(0, have - (lockedCards(backend.state).get(cardKey(c)) ?? 0) + back);
  };
  const myFreeRows = (except?: ListingOfferView | null) =>
    backend.state.collection.filter((c) => catalogEntry(c.cardId)).map((c) => ({ cardId: c.cardId, rarity: c.rarity, max: freeOf(c, except) })).filter((r) => r.max > 0);
  const me = () => backend.state.user?.id ?? 'me';

  // ── onglets + filtres
  function setTab(t: Tab) {
    tab = t;
    segBtns.forEach((b) => {
      const on = b.dataset.t === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    el.dataset.tab = t;
    try {
      sessionStorage.setItem('bebou.boardTab', t);
    } catch {
      /* rien */
    }
    render();
  }
  segBtns.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.t as Tab)));
  let qT = 0;
  q<HTMLInputElement>('.ob-q').addEventListener('input', (e) => {
    clearTimeout(qT);
    qT = window.setTimeout(() => ((flt.q = fold((e.target as HTMLInputElement).value.trim())), render()), 160);
  });
  starBtns.forEach((b) =>
    b.addEventListener('click', () => {
      const r = b.dataset.r as RarityId;
      flt.star = flt.star === r ? null : r;
      starBtns.forEach((x) => x.classList.toggle('on', x.dataset.r === flt.star));
      render();
    }),
  );
  q<HTMLInputElement>('.f-missing').addEventListener('change', (e) => ((flt.missing = (e.target as HTMLInputElement).checked), render()));
  q<HTMLInputElement>('.f-wanted').addEventListener('change', (e) => ((flt.wanted = (e.target as HTMLInputElement).checked), render()));
  q('.ob-new').addEventListener('click', () => openCreate());

  // ── liste
  function cardHtml(l0: ListingView) {
    const mine = l0.userId === me();
    // (ma propre annonce vue dans le tableau : la version de « mes annonces », qui porte les offres reçues)
    const l = mine ? (backend.state.board.mine.find((x) => x.id === l0.id) ?? l0) : l0;
    const ids = ownedIds();
    const live = listingLive(l);
    const mo = mine ? null : (l.myOffer ?? backend.state.board.offers.find((o) => o.listingId === l.id && (o.status === 'pending' || o.status === 'countered')) ?? null);
    const pend = mine ? (l.offers ?? []).filter((o) => o.status === 'pending').length : 0;
    const endLbl = l.status === 'closed' ? `conclue${l.offers?.[0] ? ` avec ${esc(l.offers[0].fromName)}` : ''}` : l.status === 'cancelled' ? 'retirée' : 'expirée';
    const act = !live
      ? `<span class="ob-st end">${endLbl}</span>`
      : mine
        ? `<span class="ob-cnt">${l.offerCount ? `${l.offerCount} offre${l.offerCount > 1 ? 's' : ''}` : 'aucune offre pour l’instant'}</span><span class="btn-ghost ob-go">${pend ? `<b class="ob-dot"></b>Voir ${pend > 1 ? `les ${pend} offres` : 'l’offre'}` : 'Gérer'}</span>`
        : mo
          ? `<span class="ob-st ${mo.status}">ton offre : ${STATUS[mo.status]}</span><span class="btn-ghost ob-go">${mo.status === 'countered' ? '<b class="ob-dot"></b>Répondre' : 'Voir'}</span>`
          : `<span class="ob-cnt">${l.offerCount ? `${l.offerCount} offre${l.offerCount > 1 ? 's' : ''}` : 'sois le premier'}</span><span class="btn-primary ob-go">Faire une offre</span>`;
    return `<article class="ob-card${mine ? ' mine' : ''}${live ? '' : ' ended'}" data-id="${esc(l.id)}" tabindex="0" role="button" aria-label="${esc(`Annonce de ${l.userName}`)}">
      <header><span class="ob-who"><b>${mine ? 'Ton annonce' : esc(l.userName)}</b> · ${deps.ago(l.createdAt)}</span>${live ? `<span class="ob-exp${l.expiresAt - Date.now() < 3 * 3600_000 ? ' soon' : ''}">${left(l.expiresAt)}</span>` : ''}</header>
      <div class="ob-lbl">propose <em>≈ ${fmtCoins(cardsValue(l.items))}</em></div>
      <div class="ob-ths">${thumbs(l.items, { have: mine ? undefined : (it) => ids.has(it.cardId) })}</div>
      ${l.wanted.length ? `<div class="ob-lbl">cherche</div><div class="ob-wants">${l.wanted.map((w) => `<span class="ob-w${!mine && freeOf(w) > 0 ? ' have' : ''}" style="--rc:${rarity(w.rarity).hex}">${esc(rarity(w.rarity).secret && !ids.has(w.cardId) ? '???' : nameOf(w.cardId))} <i>${starLbl(w.rarity)}</i>${!mine && freeOf(w) > 0 ? ' <b>tu l’as</b>' : ''}</span>`).join('')}</div>` : ''}
      ${l.note ? `<p class="ob-note">« ${esc(l.note)} »</p>` : ''}
      <footer>${act}</footer>
    </article>`;
  }
  function filtered(): ListingView[] {
    const ids = ownedIds();
    return all.filter((l) => {
      if (flt.star && !l.items.some((it) => it.rarity === flt.star)) return false;
      if (flt.missing && !l.items.some((it) => !ids.has(it.cardId))) return false;
      if (flt.wanted && !l.wanted.some((w) => freeOf(w) > 0)) return false;
      if (flt.q && !fold(l.userName).includes(flt.q) && ![...l.items, ...l.wanted].some((it) => fold(nameOf(it.cardId)).includes(flt.q))) return false;
      return true;
    });
  }
  function offerRowHtml(o: ListingOfferView & { listing: ListingView | null }) {
    const l = o.listing;
    const live = !!l && listingLive(l);
    const c = o.counter;
    const active = live && (o.status === 'pending' || o.status === 'countered');
    return `<article class="ob-card ob-offer${active ? '' : ' ended'}" data-id="${esc(l?.id ?? '')}" tabindex="0" role="button">
      <header><span class="ob-who">à <b>${esc(l?.userName ?? '?')}</b> · ${deps.ago(o.createdAt)}</span><span class="ob-st ${o.status}">${!live && active ? 'annonce terminée' : STATUS[o.status]}</span></header>
      <div class="ob-lbl">${o.status === 'countered' && c ? 'sa contre-offre : tu reçois' : 'tu reçois'}</div><div class="ob-ths">${thumbs(o.status === 'countered' && c ? c.give : (l?.items ?? []))}</div>
      <div class="ob-lbl">contre</div><div class="ob-ths">${thumbs(o.status === 'countered' && c ? c.want : o.offered, { empty: 'rien (cadeau)' })}</div>
      <footer>${o.status === 'countered' && live ? '<span class="btn-primary ob-go"><b class="ob-dot"></b>Répondre à la contre-offre</span>' : active ? '<span class="btn-ghost ob-go">Voir</span>' : ''}</footer>
    </article>`;
  }
  function render() {
    if (!el.isConnected) return;
    const b = backend.state.board;
    const mineLive = b.mine.filter((l) => listingLive(l));
    const offersLive = b.offers.filter((o) => (o.status === 'pending' || o.status === 'countered') && o.listing && listingLive(o.listing));
    q('.n-all').textContent = all.length ? String(all.length) : '';
    q('.n-mine').textContent = mineLive.length ? `${mineLive.length}/${BOARD_MAX_OPEN}` : '';
    q('.n-offers').textContent = offersLive.length ? String(offersLive.length) : '';
    q('.d-mine').hidden = !mineLive.some((l) => (l.offers ?? []).some((o) => o.status === 'pending'));
    q('.d-offers').hidden = !offersLive.some((o) => o.status === 'countered');
    q<HTMLButtonElement>('.ob-new').disabled = mineLive.length >= BOARD_MAX_OPEN;
    q<HTMLButtonElement>('.ob-new').title = mineLive.length >= BOARD_MAX_OPEN ? `${BOARD_MAX_OPEN} annonces ouvertes au maximum` : '';
    let html = '';
    if (tab === 'all') {
      const rows = filtered();
      html = rows.length
        ? rows.map(cardHtml).join('')
        : `<div class="ob-empty"><p>${all.length ? 'Aucune annonce ne correspond aux filtres.' : 'Aucune annonce pour l’instant.'}</p><button class="btn-primary ob-new2">Publier la première</button></div>`;
    } else if (tab === 'mine') {
      html = b.mine.length ? b.mine.map(cardHtml).join('') : '<div class="ob-empty"><p>Tu n’as pas d’annonce en cours. Propose des doublons : les autres joueurs te feront leurs offres.</p><button class="btn-primary ob-new2">Publier une annonce</button></div>';
    } else html = b.offers.length ? b.offers.map(offerRowHtml).join('') : '<div class="ob-empty"><p>Aucune offre en cours. Ouvre une annonce du tableau et fais ton offre.</p></div>';
    list.innerHTML = html;
    list.querySelector('.ob-new2')?.addEventListener('click', () => (tab === 'all' && all.length ? clearFilters() : openCreate()));
    if (tab === 'all' && all.length && !filtered().length) list.querySelector('.ob-new2')!.textContent = 'Effacer les filtres';
    if (sheetFor) refreshSheet();
  }
  function clearFilters() {
    flt.q = '';
    flt.star = null;
    flt.missing = flt.wanted = false;
    q<HTMLInputElement>('.ob-q').value = '';
    q<HTMLInputElement>('.f-missing').checked = q<HTMLInputElement>('.f-wanted').checked = false;
    starBtns.forEach((x) => x.classList.remove('on'));
    render();
  }
  const openFromCard = (e: Event) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.ob-card');
    if (c?.dataset.id) openListing(c.dataset.id);
  };
  list.addEventListener('click', openFromCard);
  list.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).classList.contains('ob-card')) {
      e.preventDefault();
      openFromCard(e);
    }
  });
  const findListing = (id: string): ListingView | null =>
    backend.state.board.mine.find((l) => l.id === id) ?? all.find((l) => l.id === id) ?? backend.state.board.offers.find((o) => o.listing?.id === id)?.listing ?? null;

  // ── fenêtres (détail, publication, choix de cartes) : couches de la pile (retour du téléphone = fermer)
  function modal(cls: string, label: string) {
    const veil = h('div', `ob-veil ${cls}-veil`);
    const box = h('div', `ob-modal ${cls}`);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', label);
    veil.append(box);
    document.body.append(veil);
    const opener = document.activeElement as HTMLElement | null;
    let done = false;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || veil !== [...document.querySelectorAll('.ob-veil')].pop()) return;
      e.stopPropagation();
      close();
    };
    const layer = () => close(true);
    const close = (fromLayer = false) => {
      if (done) return;
      done = true;
      if (!fromLayer) popLayer(layer);
      window.removeEventListener('keydown', onKey, true);
      void leave(veil).then(() => veil.remove());
      onClose?.();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    let onClose: (() => void) | undefined;
    pushLayer(layer);
    window.addEventListener('keydown', onKey, true);
    veil.addEventListener('click', (e) => e.target === veil && close());
    return { veil, box, close: () => close(), set onClose(fn: () => void) { onClose = fn; } };
  }

  // ── choisir des cartes (mes cartes libres, celles d'un autre joueur, ou le catalogue pour « recherchées »)
  interface Row { cardId: string; rarity: RarityId; max: number }
  function chooseCards(o: { title: string; hint?: string; rows: Row[]; current: TradeItem[]; catalog?: boolean; tag?: (r: Row) => string; first?: (r: Row) => boolean }): Promise<TradeItem[] | null> {
    return new Promise((resolve) => {
      const picked = new Map<string, TradeItem>(o.current.map((c) => [cardKey(c), { ...c }]));
      let qq = '';
      let rf: RarityId | '' = '';
      const m = modal('ob-pick', o.title);
      m.box.innerHTML = `<div class="ob-mh"><b>${esc(o.title)}</b><button class="ob-x" aria-label="Fermer">✕</button></div>
        ${o.hint ? `<p class="muted ob-hint">${esc(o.hint)}</p>` : ''}
        <div class="ob-pt"><input type="search" class="ob-pq" placeholder="${o.catalog ? 'Nom de la carte cherchée…' : 'Chercher une carte…'}" autocomplete="off" spellcheck="false"><div class="ob-pr"><button class="chip on" data-r="">Toutes</button>${STARS.filter((r) => o.rows.some((c) => c.rarity === r)).map((r) => `<button class="chip" data-r="${r}" style="--rc:${rarity(r).hex}">${starLbl(r)}</button>`).join('')}</div></div>
        <div class="ob-pg grid mini"></div>
        <div class="ob-psel"></div>
        <div class="ob-pf"><span class="ob-pv"></span><button class="btn-ghost ob-pclear">Vider</button><button class="btn-primary ob-pok">Valider</button></div>`;
      const grid = m.box.querySelector<HTMLElement>('.ob-pg')!;
      const sel = m.box.querySelector<HTMLElement>('.ob-psel')!;
      const rbar = m.box.querySelector<HTMLElement>('.ob-pr')!;
      rbar.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
        if (!b) return;
        rf = b.dataset.r as RarityId | '';
        rbar.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
        drawGrid();
      });
      let t = 0;
      m.box.querySelector<HTMLInputElement>('.ob-pq')!.addEventListener('input', (e) => {
        clearTimeout(t);
        t = window.setTimeout(() => ((qq = fold((e.target as HTMLInputElement).value.trim())), drawGrid()), 140);
      });
      const LIMIT = 150;
      function drawGrid() {
        grid.replaceChildren();
        if (o.catalog && qq.length < 2 && !rf) {
          // catalogue : rien avant de chercher, sauf les cartes mises en avant (mes envies)
          const firsts = o.rows.filter((r) => o.first?.(r));
          if (!firsts.length) return void (grid.innerHTML = '<div class="muted">Tape au moins 2 lettres du nom de la carte.</div>');
          grid.insertAdjacentHTML('beforeend', '<div class="muted ob-gl">Tes envies — ou tape le nom d’une autre carte</div>');
          firsts.slice(0, LIMIT).forEach((r) => grid.append(tile(r)));
          return;
        }
        const rows = o.rows
          .filter((c) => (!rf || c.rarity === rf) && (!qq || fold(nameOf(c.cardId)).includes(qq)))
          .sort((a, b) => Number(!!o.first?.(b)) - Number(!!o.first?.(a)) || rarity(b.rarity).rank - rarity(a.rarity).rank || nameOf(a.cardId).localeCompare(nameOf(b.cardId)));
        rows.slice(0, LIMIT).forEach((r) => grid.append(tile(r)));
        if (rows.length > LIMIT) grid.insertAdjacentHTML('beforeend', `<div class="muted ob-gl">… et ${rows.length - LIMIT} autres : affine la recherche.</div>`);
        if (!rows.length) grid.innerHTML = `<div class="muted">${o.rows.length ? 'Aucune carte ne correspond.' : 'Aucune carte disponible (les cartes engagées 🔒 ne comptent pas).'}</div>`;
      }
      function tile(r: Row) {
        const k = cardKey(r);
        const left = r.max - (picked.get(k)?.count ?? 0);
        const tg = o.tag?.(r) ?? '';
        const el2 = cardTile(r.cardId, r.rarity, { mini: true, count: o.catalog ? undefined : left, owned: !o.catalog || ownedIds().has(r.cardId), label: tg || undefined });
        el2.classList.toggle('gone', left <= 0);
        if (o.catalog && picked.has(k)) el2.classList.add('picked');
        el2.addEventListener('click', () => {
          if (left <= 0) return void (o.catalog && (picked.delete(k), drawGrid(), drawSel()));
          if (!picked.has(k) && picked.size >= BOARD_MAX_ITEMS) return toast(`${BOARD_MAX_ITEMS} cartes différentes au maximum.`, 'info');
          const p = picked.get(k) ?? { cardId: r.cardId, rarity: r.rarity, count: 0 };
          p.count++;
          picked.set(k, p);
          drawGrid();
          drawSel();
        });
        return el2;
      }
      function drawSel() {
        const items = [...picked.values()];
        sel.innerHTML = items.length ? '' : `<span class="muted">Touche une carte pour l’ajouter ; touche-la ici pour la retirer.</span>`;
        for (const p of items) {
          const c = cardTile(p.cardId, p.rarity, { mini: true, count: p.count, owned: !o.catalog || ownedIds().has(p.cardId) });
          c.title = 'Retirer';
          c.addEventListener('click', () => {
            p.count--;
            if (p.count <= 0) picked.delete(cardKey(p));
            drawGrid();
            drawSel();
          });
          sel.append(c);
        }
        m.box.querySelector('.ob-pv')!.textContent = o.catalog ? `${items.length} carte${items.length > 1 ? 's' : ''}` : `${sumCount(items)} carte${sumCount(items) > 1 ? 's' : ''} · ≈ ${fmtCoins(cardsValue(items))}`;
      }
      let result: TradeItem[] | null = null;
      m.onClose = () => resolve(result);
      m.box.querySelector('.ob-x')!.addEventListener('click', () => m.close());
      m.box.querySelector('.ob-pclear')!.addEventListener('click', () => (picked.clear(), drawGrid(), drawSel()));
      m.box.querySelector('.ob-pok')!.addEventListener('click', () => ((result = [...picked.values()]), m.close()));
      drawGrid();
      drawSel();
      const first = matchMedia('(pointer: coarse)').matches ? m.box.querySelector<HTMLElement>('.ob-x') : m.box.querySelector<HTMLElement>('.ob-pq');
      requestAnimationFrame(() => first?.focus({ preventScroll: true }));
    });
  }

  /** liste éditable (− / + par carte), utilisée pour l'annonce, l'offre et la contre-offre */
  function editList(box: HTMLElement, items: TradeItem[], maxOf: (it: TradeItem) => number, onChange: () => void, o: { empty: string; keepZero?: boolean } = { empty: '' }) {
    box.replaceChildren();
    if (!items.length) box.innerHTML = `<div class="muted">${o.empty}</div>`;
    for (const it of items) {
      const e = catalogEntry(it.cardId);
      const max = maxOf(it);
      const r = h('div', `ob-li${it.count === 0 ? ' zero' : ''}`, `<span class="sw" style="background:${rarity(it.rarity).hex}"></span>${e ? `<img alt="" src="${thumbUrl(e)}">` : '<span></span>'}<span class="ob-ln">${esc(nameOf(it.cardId))} <i>${starLbl(it.rarity)}</i></span><button class="ob-step minus" aria-label="Un de moins">−</button><b class="ob-lc">${it.count}</b><button class="ob-step plus" aria-label="Un de plus"${it.count >= max ? ' disabled' : ''}>+</button>`);
      r.querySelector('.minus')!.addEventListener('click', () => {
        it.count--;
        if (it.count <= 0 && !o.keepZero) items.splice(items.indexOf(it), 1);
        it.count = Math.max(0, it.count);
        onChange();
      });
      r.querySelector('.plus')!.addEventListener('click', () => {
        if (it.count < max) it.count++;
        onChange();
      });
      box.append(r);
    }
  }

  // ── publier une annonce
  function openCreate() {
    if (backend.state.mode === 'online' && !backend.state.user) return toast('Connecte-toi pour publier une annonce.', 'info');
    const m = modal('ob-create', 'Publier une annonce');
    const items: TradeItem[] = [];
    let wanted: Array<{ cardId: string; rarity: RarityId }> = [];
    let hours: number = BOARD_HOURS[0];
    // « Proposer en échange » depuis la fiche d'une carte : déjà dans l'annonce
    m.box.innerHTML = `<div class="ob-mh"><b>Publier une annonce</b><button class="ob-x" aria-label="Fermer">✕</button></div>
      <div class="ob-cols">
        <section><h4>Tes cartes proposées</h4><div class="ob-ed e-items"></div><button class="btn-ghost ob-add a-items">+ Choisir dans ma collection</button><p class="muted ob-lockw">Elles seront verrouillées 🔒 tant que l’annonce est ouverte.</p></section>
        <section><h4>Cartes recherchées <small>(optionnel)</small></h4><div class="ob-wants e-wanted"></div><div class="ob-row"><button class="btn-ghost ob-add a-wanted">+ Ajouter une carte</button><button class="linkish a-wish">♥ mes envies</button></div>
          <h4>Petit mot <small>(optionnel)</small></h4><input class="ob-note-in" maxlength="140" placeholder="ex. je complète Kanto">
          <h4>Durée</h4><div class="ob-dur" role="radiogroup" aria-label="Durée de l’annonce">${BOARD_HOURS.map((x, i) => `<button class="chip sub${i === 0 ? ' on' : ''}" role="radio" aria-checked="${i === 0}" data-h="${x}">${x} h</button>`).join('')}</div></section>
      </div>
      <div class="ob-mf"><span class="ob-sum muted"></span><button class="btn-primary ob-pub" disabled>Publier</button></div>`;
    const eItems = m.box.querySelector<HTMLElement>('.e-items')!;
    const eWanted = m.box.querySelector<HTMLElement>('.e-wanted')!;
    const pub = m.box.querySelector<HTMLButtonElement>('.ob-pub')!;
    const draw = () => {
      editList(eItems, items, (it) => freeOf(it), draw, { empty: 'Aucune carte pour l’instant.' });
      eWanted.innerHTML = wanted.length ? '' : '<span class="muted">Aucune : toutes les offres sont les bienvenues.</span>';
      for (const w of wanted) {
        const b = h('button', 'ob-w rm', `${esc(nameOf(w.cardId))} <i>${starLbl(w.rarity)}</i> <b aria-hidden="true">✕</b>`);
        b.style.setProperty('--rc', rarity(w.rarity).hex);
        b.setAttribute('aria-label', `Retirer ${nameOf(w.cardId)}`);
        b.addEventListener('click', () => ((wanted = wanted.filter((x) => x !== w)), draw()));
        eWanted.append(b);
      }
      pub.disabled = !items.length;
      m.box.querySelector('.ob-sum')!.textContent = items.length ? `${sumCount(items)} carte${sumCount(items) > 1 ? 's' : ''} · ≈ ${fmtCoins(cardsValue(items))} · ${hours} h` : 'Choisis au moins une carte.';
    };
    const pre = sessionStorage.getItem('bebou.boardGive');
    if (pre) {
      sessionStorage.removeItem('bebou.boardGive');
      const [cardId, r] = pre.split(':');
      if (freeOf({ cardId, rarity: r as RarityId }) > 0) items.push({ cardId, rarity: r as RarityId, count: 1 });
    }
    m.box.querySelector('.ob-x')!.addEventListener('click', () => m.close());
    m.box.querySelector('.a-items')!.addEventListener('click', async () => {
      const r = await chooseCards({ title: 'Cartes à proposer', hint: 'Seules tes cartes libres (pas déjà engagées) sont là. Tu peux proposer ton dernier exemplaire.', rows: myFreeRows(), current: items });
      if (r) items.splice(0, items.length, ...r);
      draw();
    });
    const catalogRows = () => ALL_THEMES.flatMap((t) => t.cards).map((c) => ({ cardId: c.id, rarity: c.rarity as RarityId, max: 1 }));
    m.box.querySelector('.a-wanted')!.addEventListener('click', async () => {
      const wish = new Set(backend.state.wishlist);
      const r = await chooseCards({ title: 'Cartes recherchées', hint: 'Indicatif : les autres verront ce que tu cherches.', rows: catalogRows(), current: wanted.map((w) => ({ ...w, count: 1 })), catalog: true, first: (x) => wish.has(x.cardId), tag: (x) => (ownedIds().has(x.cardId) ? 'tu l’as' : '') });
      if (r) wanted = r.map(({ cardId, rarity: rr }) => ({ cardId, rarity: rr }));
      draw();
    });
    m.box.querySelector('.a-wish')!.addEventListener('click', () => {
      const add = backend.state.wishlist.map((id) => catalogEntry(id)).filter((e) => e && !wanted.some((w) => w.cardId === e.id));
      if (!add.length) return toast(backend.state.wishlist.length ? 'Tes envies sont déjà toutes dedans.' : 'Aucune envie marquée (♥ sur une carte manquante).', 'info');
      wanted = [...wanted, ...add.map((e) => ({ cardId: e!.id, rarity: e!.rarity as RarityId }))].slice(0, BOARD_MAX_ITEMS);
      draw();
    });
    m.box.querySelectorAll<HTMLButtonElement>('.ob-dur button').forEach((b) =>
      b.addEventListener('click', () => {
        hours = Number(b.dataset.h);
        m.box.querySelectorAll<HTMLButtonElement>('.ob-dur button').forEach((x) => (x.classList.toggle('on', x === b), x.setAttribute('aria-checked', String(x === b))));
        draw();
      }),
    );
    pub.addEventListener('click', () =>
      void guarded('board-create', pub, async () => {
        try {
          await backend.createListing(items, wanted, m.box.querySelector<HTMLInputElement>('.ob-note-in')!.value.trim() || undefined, hours);
          deps.chime();
          toast(`Annonce publiée pour ${hours} h : tout le monde peut te faire une offre.`, 'ok');
          m.close();
          setTab('mine');
        } catch (e) {
          toast(errMsg(e), 'err');
        }
      }),
    );
    draw();
  }

  // ── détail d'une annonce
  let sheetFor: string | null = null;
  let sheetRefresh: (() => void) | null = null;
  /** composition en cours dans le détail (offre ou contre-offre) : on ne redessine pas par-dessus */
  let composing = false;
  function refreshSheet() {
    if (!composing) sheetRefresh?.();
  }
  function openListing(id: string) {
    const l0 = findListing(id);
    if (!l0) return;
    const m = modal('ob-detail', `Annonce de ${l0.userName}`);
    sheetFor = id;
    composing = false;
    m.onClose = () => {
      sheetFor = null;
      sheetRefresh = null;
      composing = false;
    };
    const draw = () => {
      const l = findListing(id);
      if (!l) return m.close();
      const mine = l.userId === me();
      const live = listingLive(l);
      const ids = ownedIds();
      m.box.innerHTML = `<div class="ob-mh"><b>${mine ? 'Ton annonce' : `Annonce de ${esc(l.userName)}`}</b><span class="ob-exp">${live ? left(l.expiresAt) : l.status === 'closed' ? 'conclue' : l.status === 'cancelled' ? 'retirée' : 'expirée'}</span><button class="ob-x" aria-label="Fermer">✕</button></div>
        <div class="ob-cols">
          <section class="ob-ann"><h4>Propose <small>≈ ${fmtCoins(cardsValue(l.items))}</small></h4><div class="ob-ths big">${thumbs(l.items, { have: mine ? undefined : (it) => ids.has(it.cardId) })}</div>
            ${l.wanted.length ? `<h4>Cherche</h4><div class="ob-wants">${l.wanted.map((w) => `<span class="ob-w${!mine && freeOf(w) > 0 ? ' have' : ''}" style="--rc:${rarity(w.rarity).hex}">${esc(nameOf(w.cardId))} <i>${starLbl(w.rarity)}</i>${!mine && freeOf(w) > 0 ? ' <b>tu l’as</b>' : ''}</span>`).join('')}</div>` : ''}
            ${l.note ? `<p class="ob-note">« ${esc(l.note)} »</p>` : ''}
            <p class="muted">publiée ${deps.ago(l.createdAt)}${mine && live ? ' · tes cartes sont verrouillées 🔒 jusqu’à la fin' : ''}</p>
            ${mine && live ? '<button class="btn-ghost danger ob-cancel">Retirer l’annonce</button>' : ''}</section>
          <section class="ob-side2"></section>
        </div>`;
      m.box.querySelector('.ob-x')!.addEventListener('click', () => m.close());
      m.box.querySelector<HTMLButtonElement>('.ob-cancel')?.addEventListener('click', (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!confirmTap(b, l.offerCount ? `Retirer ? ${l.offerCount} offre${l.offerCount > 1 ? 's' : ''} seront closes` : 'Retirer l’annonce ?')) return;
        void guarded(`board-cancel-${l.id}`, b, async () => {
          try {
            await backend.cancelListing(l.id);
            toast('Annonce retirée : tes cartes sont libres.', 'ok');
            m.close();
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
      const side = m.box.querySelector<HTMLElement>('.ob-side2')!;
      if (mine) drawOffers(side, l);
      else drawMyOffer(side, l);
    };
    sheetRefresh = draw;
    draw();
  }

  /** chez moi : les offres reçues */
  function drawOffers(side: HTMLElement, l: ListingView) {
    const live = listingLive(l);
    const offers = l.offers ?? [];
    side.innerHTML = `<h4>${live ? `Offres reçues <small>${offers.length || 'aucune pour l’instant'}</small>` : 'Résultat'}</h4>`;
    if (!offers.length) side.insertAdjacentHTML('beforeend', `<p class="muted">${live ? 'Les offres des autres joueurs arriveront ici (pastille sur l’onglet Échanges).' : l.status === 'expired' ? 'Expirée sans échange : tes cartes sont libres.' : 'Retirée : tes cartes sont libres.'}</p>`);
    for (const o of offers) {
      const f = deps.fairness(l.items, o.offered);
      const r = h('div', `ob-of ${o.status}`);
      const c = o.counter;
      r.innerHTML = `<div class="ob-who"><b>${esc(o.fromName)}</b> · ${deps.ago(o.createdAt)} <span class="ob-st ${o.status}">${STATUS[o.status] === 'contre-offre reçue' ? 'contre-offre envoyée' : STATUS[o.status]}</span></div>
        <div class="ob-lbl">te donne</div><div class="ob-ths">${thumbs(o.offered)}</div>
        ${o.note ? `<p class="ob-note">« ${esc(o.note)} »</p>` : ''}
        ${o.status === 'countered' && c ? `<div class="ob-ctr"><div class="ob-lbl">ta contre-offre : tu donnes</div><div class="ob-ths">${thumbs(c.give)}</div><div class="ob-lbl">contre</div><div class="ob-ths">${thumbs(c.want, { empty: 'rien' })}</div><p class="muted">en attente de sa réponse…</p></div>` : ''}
        ${o.status === 'pending' ? `${deps.gaugeHtml(l.items, o.offered, gaugeCls(f.cls))}${f.txt ? `<div class="fair ${f.cls}">${esc(f.txt)}</div>` : ''}` : ''}
        ${live && (o.status === 'pending' || o.status === 'countered') ? `<div class="ob-act"><button class="linkish ob-no">Refuser</button><button class="btn-ghost ob-ctrb">${o.status === 'countered' ? 'Modifier la contre-offre' : 'Contre-offre'}</button>${o.status === 'pending' ? '<button class="btn-primary ob-ok">Accepter</button>' : ''}</div>` : ''}`;
      r.querySelector<HTMLButtonElement>('.ob-ok')?.addEventListener('click', (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!confirmTap(b, 'Confirmer l’échange ?', 4000, `ob-ok-${o.id}`)) return;
        void guarded(`board-offer-${o.id}`, b, async () => {
          try {
            await backend.acceptOffer(o.id);
            deps.chime();
            toast(`Échange conclu avec ${o.fromName} ! Les cartes sont dans ta collection.`, 'ok');
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
      r.querySelector<HTMLButtonElement>('.ob-no')?.addEventListener('click', (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!confirmTap(b, 'Refuser ?', 4000, `ob-no-${o.id}`)) return;
        void guarded(`board-offer-${o.id}`, b, async () => {
          try {
            await backend.declineOffer(o.id);
            toast('Offre refusée.', 'ok');
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
      r.querySelector('.ob-ctrb')?.addEventListener('click', () => void composeCounter(side, l, o));
      side.append(r);
    }
  }

  /** contre-offre : une partie de mon annonce contre ce que je veux chez lui */
  async function composeCounter(side: HTMLElement, l: ListingView, o: ListingOfferView) {
    composing = true;
    const give: TradeItem[] = (o.counter?.give ?? l.items).map((it) => ({ ...it }));
    for (const it of l.items) if (!give.some((x) => cardKey(x) === cardKey(it))) give.push({ ...it, count: 0 });
    const want: TradeItem[] = (o.counter?.want ?? o.offered).map((it) => ({ ...it }));
    let theirs: PlayerCard[] | null = null;
    side.innerHTML = `<h4>Contre-offre à ${esc(o.fromName)}</h4>
      <div class="ob-lbl">tu donnes <small>(de ton annonce)</small></div><div class="ob-ed c-give"></div>
      <div class="ob-lbl">tu demandes <small>(ses cartes)</small></div><div class="ob-ed c-want"></div><button class="btn-ghost ob-add c-add">+ Une autre de ses cartes</button>
      <div class="c-gauge"></div>
      <input class="ob-note-in c-note" maxlength="140" placeholder="Un petit mot ? (optionnel)">
      <div class="ob-act"><button class="linkish c-back">Annuler</button><button class="btn-primary c-send">Envoyer la contre-offre</button></div>`;
    const send = side.querySelector<HTMLButtonElement>('.c-send')!;
    const max = new Map<string, number>(o.offered.map((it) => [cardKey(it), it.count]));
    const draw = () => {
      editList(side.querySelector('.c-give')!, give, (it) => l.items.find((x) => cardKey(x) === cardKey(it))?.count ?? 0, draw, { empty: '', keepZero: true });
      editList(side.querySelector('.c-want')!, want, (it) => max.get(cardKey(it)) ?? it.count, draw, { empty: 'Rien : tu lui donnes ces cartes.' });
      const g = give.filter((x) => x.count > 0);
      const f = deps.fairness(g, want);
      side.querySelector('.c-gauge')!.innerHTML = g.length || want.length ? `${deps.gaugeHtml(g, want, gaugeCls(f.cls))}${f.txt ? `<div class="fair ${f.cls}">${esc(f.txt)}</div>` : ''}` : '';
      send.disabled = !g.length;
    };
    side.querySelector('.c-back')!.addEventListener('click', () => {
      composing = false;
      refreshSheet();
    });
    side.querySelector('.c-add')!.addEventListener('click', async () => {
      try {
        theirs ??= await backend.friendCollection(o.fromId);
      } catch (e) {
        return toast(errMsg(e), 'err');
      }
      for (const c of theirs) max.set(cardKey(c), c.count);
      const r = await chooseCards({ title: `Les cartes de ${o.fromName}`, hint: 'Ce que tu lui demandes à la place (ou en plus).', rows: theirs.filter((c) => catalogEntry(c.cardId)).map((c) => ({ cardId: c.cardId, rarity: c.rarity, max: c.count })), current: want, tag: (x) => (ownedIds().has(x.cardId) ? '' : 'te manque'), first: (x) => !ownedIds().has(x.cardId) });
      if (r) want.splice(0, want.length, ...r);
      draw();
    });
    send.addEventListener('click', () =>
      void guarded(`board-offer-${o.id}`, send, async () => {
        try {
          await backend.counterOffer(o.id, give.filter((x) => x.count > 0), want, side.querySelector<HTMLInputElement>('.c-note')!.value.trim() || undefined);
          toast(`Contre-offre envoyée à ${o.fromName}.`, 'ok');
          composing = false;
          refreshSheet();
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      }),
    );
    draw();
  }

  /** chez un autre : mon offre (en attente / contre-offre reçue) ou « Faire une offre » */
  function drawMyOffer(side: HTMLElement, l: ListingView) {
    const live = listingLive(l);
    const mo = backend.state.board.offers.find((o) => o.listingId === l.id && (o.status === 'pending' || o.status === 'countered')) ?? null;
    const past = backend.state.board.offers.find((o) => o.listingId === l.id && !(o.status === 'pending' || o.status === 'countered')) ?? null;
    if (!live) {
      side.innerHTML = `<h4>Annonce terminée</h4>${past ? `<p>Ton offre : <span class="ob-st ${past.status}">${STATUS[past.status]}</span></p>` : '<p class="muted">Elle n’accepte plus d’offre.</p>'}`;
      return;
    }
    if (mo?.status === 'countered' && mo.counter) {
      const c = mo.counter;
      const f = deps.fairness(c.want, c.give);
      side.innerHTML = `<h4>Contre-offre de ${esc(l.userName)}</h4>
        <div class="ob-lbl">tu reçois</div><div class="ob-ths">${thumbs(c.give)}</div>
        <div class="ob-lbl">contre</div><div class="ob-ths">${thumbs(c.want, { empty: 'rien (cadeau)' })}</div>
        ${c.note ? `<p class="ob-note">« ${esc(c.note)} »</p>` : ''}
        ${deps.gaugeHtml(c.want, c.give, gaugeCls(f.cls))}${f.txt ? `<div class="fair ${f.cls}">${esc(f.txt)}</div>` : ''}
        <p class="muted">Ton offre d’origine : ${esc(mo.offered.map((it) => `${it.count > 1 ? `${it.count}× ` : ''}${nameOf(it.cardId)}`).join(', '))}</p>
        <div class="ob-act"><button class="linkish ob-no">Refuser</button><button class="btn-ghost re">Refaire une offre</button><button class="btn-primary ob-ok">Accepter</button></div>`;
      side.querySelector<HTMLButtonElement>('.ob-ok')!.addEventListener('click', (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!confirmTap(b, 'Confirmer l’échange ?', 4000, `bm-ok-${mo.id}`)) return;
        void guarded(`board-my-${mo.id}`, b, async () => {
          try {
            await backend.respondCounter(mo.id, true);
            deps.chime();
            toast(`Échange conclu avec ${l.userName} ! Les cartes sont dans ta collection.`, 'ok');
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
      side.querySelector<HTMLButtonElement>('.ob-no')!.addEventListener('click', (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!confirmTap(b, 'Refuser ?', 4000, `bm-no-${mo.id}`)) return;
        void guarded(`board-my-${mo.id}`, b, async () => {
          try {
            await backend.respondCounter(mo.id, false);
            toast('Contre-offre refusée : ton offre est retirée, tes cartes sont libres.', 'ok');
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
      side.querySelector('.re')!.addEventListener('click', () => composeOffer(side, l, mo));
      return;
    }
    if (mo) {
      const f = deps.fairness(mo.offered, l.items);
      side.innerHTML = `<h4>Ton offre <span class="ob-st pending">en attente</span></h4><div class="ob-ths">${thumbs(mo.offered)}</div>
        ${mo.note ? `<p class="ob-note">« ${esc(mo.note)} »</p>` : ''}${deps.gaugeHtml(mo.offered, l.items, gaugeCls(f.cls))}
        <p class="muted">${esc(l.userName)} peut l’accepter, la refuser ou te faire une contre-offre. Tes cartes sont verrouillées 🔒 en attendant.</p>
        <div class="ob-act"><button class="linkish wd">Retirer mon offre</button><button class="btn-ghost re">Modifier</button></div>`;
      side.querySelector<HTMLButtonElement>('.wd')!.addEventListener('click', (e) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!confirmTap(b, 'Retirer ?')) return;
        void guarded(`board-my-${mo.id}`, b, async () => {
          try {
            await backend.withdrawOffer(mo.id);
            toast('Offre retirée : tes cartes sont libres.', 'ok');
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
      side.querySelector('.re')!.addEventListener('click', () => composeOffer(side, l, mo));
      return;
    }
    composeOffer(side, l, null, past);
  }

  /** composer (ou refaire) mon offre */
  function composeOffer(side: HTMLElement, l: ListingView, prev: ListingOfferView | null, past?: ListingOfferView | null) {
    if (backend.state.mode === 'online' && !backend.state.user) {
      side.innerHTML = '<h4>Faire une offre</h4><p class="muted">Connecte-toi pour faire une offre.</p>';
      return;
    }
    composing = !!prev;
    const give: TradeItem[] = (prev?.offered ?? []).map((it) => ({ ...it }));
    // ses cartes recherchées que j'ai de libre : proposées d'un toucher
    const wantedMine = l.wanted.filter((w) => freeOf(w, prev) > 0);
    side.innerHTML = `<h4>${prev ? 'Modifier ton offre' : 'Faire une offre'}</h4>
      ${past ? `<p class="muted">Ta dernière offre : ${STATUS[past.status]}.</p>` : ''}
      ${wantedMine.length ? `<div class="ob-lbl">il cherche, tu as :</div><div class="ob-quick">${wantedMine.map((w) => `<button class="ob-w have" data-k="${esc(cardKey(w))}" style="--rc:${rarity(w.rarity).hex}">+ ${esc(nameOf(w.cardId))} <i>${starLbl(w.rarity)}</i></button>`).join('')}</div>` : ''}
      <div class="ob-lbl">tu donnes</div><div class="ob-ed o-give"></div>
      <button class="btn-ghost ob-add o-add">+ Choisir dans ma collection</button>
      <div class="o-gauge"></div>
      <input class="ob-note-in o-note" maxlength="140" placeholder="Un petit mot ? (optionnel)">
      <div class="ob-act">${prev ? '<button class="linkish o-back">Annuler</button>' : ''}<button class="btn-primary o-send" disabled>${prev ? 'Renvoyer mon offre' : 'Envoyer l’offre'}</button></div>`;
    const send = side.querySelector<HTMLButtonElement>('.o-send')!;
    const note = side.querySelector<HTMLInputElement>('.o-note')!;
    if (prev?.note) note.value = prev.note;
    const draw = () => {
      editList(side.querySelector('.o-give')!, give, (it) => freeOf(it, prev), draw, { empty: 'Touche « Choisir » pour composer ton offre.' });
      const f = deps.fairness(give, l.items);
      side.querySelector('.o-gauge')!.innerHTML = give.length ? `${deps.gaugeHtml(give, l.items, gaugeCls(f.cls))}${f.txt ? `<div class="fair ${f.cls}">${esc(f.txt)}</div>` : ''}` : '';
      const lasts = give.filter((it) => (owned().get(cardKey(it))?.count ?? 0) <= it.count);
      if (lasts.length) side.querySelector('.o-gauge')!.insertAdjacentHTML('beforeend', `<div class="fair warn">Tu donnerais ton dernier exemplaire de ${lasts.map((it) => esc(nameOf(it.cardId))).join(', ')}.</div>`);
      send.disabled = !give.length;
      composing = composing || give.length > 0;
    };
    side.querySelectorAll<HTMLButtonElement>('.ob-quick button').forEach((b) =>
      b.addEventListener('click', () => {
        const w = wantedMine.find((x) => cardKey(x) === b.dataset.k)!;
        if (!give.some((x) => cardKey(x) === cardKey(w))) give.push({ cardId: w.cardId, rarity: w.rarity, count: 1 });
        b.disabled = true;
        draw();
      }),
    );
    side.querySelector('.o-back')?.addEventListener('click', () => {
      composing = false;
      refreshSheet();
    });
    side.querySelector('.o-add')!.addEventListener('click', async () => {
      composing = true; // (le détail ne se redessine pas sous le choix de cartes)
      const wantedKeys = new Set(l.wanted.map(cardKey));
      const r = await chooseCards({ title: 'Ton offre', hint: `Contre ${l.items.map((it) => nameOf(it.cardId)).join(', ')}. Les cartes engagées ailleurs 🔒 ne sont pas là.`, rows: myFreeRows(prev), current: give, first: (x) => wantedKeys.has(cardKey(x)), tag: (x) => (wantedKeys.has(cardKey(x)) ? 'il la cherche' : '') });
      if (r) give.splice(0, give.length, ...r);
      composing = give.length > 0 || !!prev;
      draw();
    });
    send.addEventListener('click', () =>
      void guarded(`board-make-${l.id}`, send, async () => {
        try {
          await backend.makeOffer(l.id, give, note.value.trim() || undefined);
          toast(`Offre envoyée à ${l.userName} : tes cartes sont réservées en attendant sa réponse.`, 'ok');
          composing = false;
          refreshSheet();
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      }),
    );
    draw();
  }

  // ── temps réel : tableau (abonnement tant que la vue est ouverte) + mes annonces / offres (toasts quand on est là)
  let seen = new Map<string, string>();
  let seenReady = false;
  function notify() {
    const b = backend.state.board;
    const now = new Map<string, string>();
    for (const l of b.mine) for (const o of l.offers ?? []) now.set(`in:${o.id}`, o.status);
    for (const o of b.offers) now.set(`out:${o.id}`, o.status);
    if (seenReady && el.isConnected) {
      for (const [k, st] of now) {
        const was = seen.get(k);
        if (was === st) continue;
        if (k.startsWith('in:') && !was && st === 'pending') {
          const o = b.mine.flatMap((l) => l.offers ?? []).find((x) => `in:${x.id}` === k);
          toast(`${o?.fromName ?? 'Quelqu’un'} a fait une offre sur ton annonce.`, 'info');
        } else if (k.startsWith('out:') && was) {
          const o = b.offers.find((x) => `out:${x.id}` === k);
          const who = o?.listing?.userName ?? 'L’auteur';
          if (st === 'accepted') toast(`${who} a accepté ton offre ! Les cartes sont dans ta collection.`, 'ok');
          else if (st === 'countered') toast(`${who} te fait une contre-offre → Mes offres.`, 'info');
          else if (st === 'declined') toast(`${who} a refusé ton offre.`, 'info');
          else if (st === 'closed') toast(`L’annonce de ${who} est terminée : ton offre est close.`, 'info');
        }
      }
    }
    seen = now;
    seenReady = true;
  }
  let boardSig = '';
  backend.onChange((s) => {
    const sig = JSON.stringify([s.board.mine.map((l) => [l.id, l.status, (l.offers ?? []).map((o) => o.id + o.status)]), s.board.offers.map((o) => o.id + o.status), s.collection.length]);
    if (sig === boardSig) return;
    boardSig = sig;
    notify();
    render();
  });

  return {
    el,
    enter() {
      try {
        const t = sessionStorage.getItem('bebou.boardTab') as Tab | null;
        if (t && t !== tab && ['all', 'mine', 'offers'].includes(t)) setTab(t);
      } catch {
        /* rien */
      }
      unwatch ??= backend.watchBoard((rows) => {
        all = rows;
        render();
      });
      render();
      if (sessionStorage.getItem('bebou.boardGive')) openCreate();
    },
    leave() {
      unwatch?.();
      unwatch = null;
    },
    attention: () => boardAttention(backend.state),
  };
}
