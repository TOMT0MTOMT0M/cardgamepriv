import { collectionSig, type Binder, type GameBackend, type PlayerCard } from '../backend';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { ALL_THEMES, BEBOU_PACK, SUBTHEMES, catalogEntry, numberingSize, subthemeById, themeById, type CatalogEntry, type SubTheme, type ThemeInfo } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { SEEN_KEY, cardTile, errMsg, esc, fmtN, fmtPct, fold, fr, h, loadSeen, plural, popLayer, pushLayer, starsHtml, thumbUrl, toast } from '../ui';
import { preloadOwned, preloadThumbs } from '../preload';
import { haptics } from '../../core/haptics';

/**
 * COLLECTION (refonte, retours du 3 nov.)
 *  - Onglets du haut : les 4 thèmes + Les Bébous + Classeurs.
 *  - Un thème s'ouvre sur sa vue ALBUMS : mosaïque de pochettes de sous-thèmes (visuel + nom + barre de progression),
 *    recherche, tri (complétion / groupe / alphabétique) — ça tient 400+ sous-thèmes. Pochette hybride : la carte
 *    épinglée à la main (« Définir comme pochette »), sinon la meilleure carte possédée, sinon l'icône du sous-thème.
 *  - Un album s'ouvre sur sa GRILLE : pagination classique (60 cartes/page), tri (récentes / étoiles / numéro),
 *    filtres persistants (possédées, manquantes, doublons, étoile, recherche), « + Envie » sur les manquantes.
 *  - En-tête : complétion (uniques, %, doublons) du thème ou de l'album.
 *  - Carte focus (visionneuse 3D) : + Envie, + Classeur, Proposer en échange, Définir comme pochette, date d'obtention.
 *  - CLASSEURS perso : nommés librement, une carte dans plusieurs, couverture, ordre manuel (glisser-déposer),
 *    un classeur épinglé sur le profil.
 */
export interface CollectionView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

type Filter = 'all' | 'owned' | 'missing' | 'dups' | 'fresh';
type Sort = 'num' | 'stars' | 'recent';
type AlbumSort = 'completion' | 'group' | 'alpha';
type Mode = 'albums' | 'grid' | 'binders' | 'binder';
const STAR_ORDER: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
const PAGE = 60;
const PREFS = 'bebou.coll.v2';

const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
/** teinte stable par sous-thème (barres de progression « colorées par sous-thème ») */
function hueOf(id: string): number {
  let hsh = 0;
  for (let i = 0; i < id.length; i++) hsh = (Math.imul(hsh, 31) + id.charCodeAt(i)) | 0;
  return Math.abs(hsh) % 360;
}

export function createCollectionView(backend: GameBackend, shell: Shell, getViewer: () => Promise<ViewerScene>): CollectionView {
  const el = h('section', 'view collection');
  let theme: ThemeInfo = ALL_THEMES[0];
  let mode: Mode = 'albums';
  /** album (sous-thème) ouvert */
  let subId: string | null = null;
  /** classeur ouvert */
  let binderId: string | null = null;
  let binderEdit = false;
  let filter: Filter = 'all';
  let star: RarityId | null = null;
  let sort: Sort = 'num';
  let albumSort: AlbumSort = 'completion';
  let query = '';
  let albumQuery = '';
  let page = 0;
  let open = false;
  let growBars = false;
  // préférences persistantes (filtres, tris)
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<{ filter: Filter; star: RarityId | null; sort: Sort; albumSort: AlbumSort }>;
    if (p.filter && p.filter !== 'fresh') filter = p.filter;
    if (p.star && STAR_ORDER.includes(p.star)) star = p.star;
    if (p.sort) sort = p.sort;
    if (p.albumSort) albumSort = p.albumSort;
  } catch {
    /* ignore */
  }
  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ filter: filter === 'fresh' ? 'all' : filter, star, sort, albumSort }));
    } catch {
      /* ignore */
    }
  };
  /** cartes nouvelles depuis la dernière visite (pastille dorée) */
  let fresh = new Set<string>();
  const saveSeen = () => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...owned().keys()]));
    } catch {
      /* stockage plein ou bloqué */
    }
  };

  el.innerHTML = `
    <div class="coll-head">
      <div class="tabs"></div>
      <div class="crumb" hidden><button class="crumb-back">‹ Albums</button><span class="crumb-name"></span></div>
      <div class="progress"></div>
    </div>
    <div class="albums" hidden>
      <div class="al-bar">
        <input class="search al-search" type="search" placeholder="Chercher un album…" autocomplete="off" spellcheck="false" aria-label="Chercher un album">
        <div class="seg al-sort"><button data-s="completion">Complétion</button><button data-s="group">Par groupe</button><button data-s="alpha">A → Z</button></div>
        <span class="al-count"></span>
      </div>
      <div class="al-grid"></div>
    </div>
    <div class="filters" hidden>
      <div class="seg">
        <button data-f="all">Toutes</button><button data-f="owned">Possédées</button><button data-f="missing">Manquantes</button><button data-f="dups">Doublons</button><button data-f="fresh" class="f-fresh" hidden>Nouvelles</button>
      </div>
      <div class="starf"></div>
      <div class="seg sortf" aria-label="Tri"><button data-s="num">N°</button><button data-s="stars">Étoiles</button><button data-s="recent">Récentes</button></div>
      <input class="search" type="search" placeholder="Rechercher…" enterkeyhint="search" autocomplete="off" spellcheck="false" aria-label="Rechercher une carte (nom ou numéro)" />
    </div>
    <div class="binders-view" hidden></div>
    <div class="grid"></div>
    <div class="pager" hidden></div>
    <div class="empty" hidden></div>
    <button class="to-top" aria-label="Revenir en haut" title="Revenir en haut" hidden>↑</button>
    <div class="viewer-ui" hidden><button class="close" aria-label="Fermer">✕</button>
      <button class="nav prev" aria-label="Carte précédente">‹</button><button class="nav next" aria-label="Carte suivante">›</button>
      <div class="v-info"></div><div class="v-actions"></div><div class="v-pos"></div><div class="v-hint">glisse pour la faire tourner</div>
      <div class="binder-pick" hidden></div></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const tabs = q('.tabs');
  const crumb = q('.crumb');
  const progress = q('.progress');
  const albums = q('.albums');
  const alGrid = q('.al-grid');
  const alSearch = q<HTMLInputElement>('.al-search');
  const filtersEl = q('.filters');
  const grid = q('.grid');
  const pager = q('.pager');
  const empty = q('.empty');
  const starf = q('.starf');
  const search = q<HTMLInputElement>('.search');
  const bindersView = q('.binders-view');
  const viewerUi = q('.viewer-ui');
  const vInfo = q('.v-info');
  const vActions = q('.v-actions');
  const binderPick = q('.binder-pick');
  const headEl = q('.coll-head');
  const toTopBtn = q<HTMLButtonElement>('.to-top');

  // ── filtres / tris
  el.querySelectorAll<HTMLButtonElement>('.filters .seg:not(.sortf) button').forEach((b) =>
    b.addEventListener('click', () => {
      const f = b.dataset.f as Filter;
      if (f === 'fresh') saveSeen();
      else if (filter === 'fresh') fresh.clear();
      filter = f;
      page = 0;
      savePrefs();
      render();
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('.sortf button').forEach((b) =>
    b.addEventListener('click', () => {
      sort = b.dataset.s as Sort;
      page = 0;
      savePrefs();
      render();
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('.al-sort button').forEach((b) =>
    b.addEventListener('click', () => {
      albumSort = b.dataset.s as AlbumSort;
      savePrefs();
      render();
    }),
  );
  for (const r of STAR_ORDER) {
    const b = h('button', 'chip', String(rarity(r).rank + 1) + '★');
    b.title = rarity(r).label;
    b.style.setProperty('--rc', rarity(r).hex);
    b.addEventListener('click', () => {
      star = star === r ? null : r;
      page = 0;
      savePrefs();
      render();
    });
    b.dataset.r = r;
    starf.append(b);
  }
  for (const inp of [search, alSearch]) {
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (inp.value) {
        inp.value = '';
        inp.dispatchEvent(new Event('input'));
      } else inp.blur();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key !== '/' || !el.isConnected || open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    e.preventDefault();
    const inp = mode === 'albums' ? alSearch : search;
    inp.focus();
    inp.select();
  });
  let qTimer = 0;
  search.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = window.setTimeout(() => {
      query = fold(search.value.trim());
      page = 0;
      render();
    }, 120);
  });
  alSearch.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = window.setTimeout(() => {
      albumQuery = fold(alSearch.value.trim());
      render();
    }, 120);
  });
  toTopBtn.addEventListener('click', () => el.scrollTo({ top: 0, behavior: 'smooth' }));
  let scrollRaf = 0;
  el.addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const y = el.scrollTop;
      toTopBtn.hidden = y < 1400;
      filtersEl.classList.toggle('stuck', y > headEl.offsetTop + headEl.offsetHeight - 48);
    });
  }, { passive: true });
  q('.crumb-back').addEventListener('click', () => {
    if (mode === 'binder') return goBinders();
    goAlbums();
  });

  // ── données
  /** id → ligne de collection (une carte a une seule rareté : celle de son thème) */
  function owned(): Map<string, PlayerCard> {
    const m = new Map<string, PlayerCard>();
    for (const c of backend.state.collection) {
      const prev = m.get(c.cardId);
      if (prev) m.set(c.cardId, { ...prev, count: prev.count + c.count, firstPulledAt: Math.min(prev.firstPulledAt ?? Infinity, c.firstPulledAt ?? Infinity) });
      else m.set(c.cardId, c);
    }
    return m;
  }
  const foldCache = new Map<string, string>();
  const folded = (e: CatalogEntry) => {
    let f = foldCache.get(e.id);
    if (f === undefined) foldCache.set(e.id, (f = fold(e.name)));
    return f;
  };
  const scope = (): CatalogEntry[] => (subId ? theme.cards.filter((c) => c.subthemeId === subId) : theme.cards);
  const toTop = () => el.scrollTo({ top: 0 });

  /** Pochette hybride d'un sous-thème : épinglée à la main, sinon la meilleure carte possédée, sinon rien (icône). */
  function coverOf(st: SubTheme, mine: Map<string, PlayerCard>): { entry: CatalogEntry; manual: boolean } | null {
    const pin = backend.state.covers[st.id];
    if (pin) {
      const e = catalogEntry(pin);
      if (e && mine.has(e.id)) return { entry: e, manual: true };
    }
    let best: CatalogEntry | null = null;
    for (const c of st.cards) {
      if (!mine.has(c.id)) continue;
      if (!best || RANK[c.rarity] > RANK[best.rarity] || (RANK[c.rarity] === RANK[best.rarity] && c.num < best.num)) best = c;
    }
    return best ? { entry: best, manual: false } : null;
  }

  // ── navigation
  function goAlbums() {
    mode = 'albums';
    subId = null;
    render();
    toTop();
  }
  function goGrid(id: string) {
    mode = 'grid';
    subId = id;
    page = 0;
    render();
    toTop();
  }
  function goBinders() {
    mode = 'binders';
    binderId = null;
    binderEdit = false;
    render();
    toTop();
  }
  function goBinder(id: string) {
    mode = 'binder';
    binderId = id;
    binderEdit = false;
    render();
    toTop();
  }

  function renderTabs(mine: Map<string, PlayerCard>) {
    tabs.innerHTML = '';
    for (const t of ALL_THEMES) {
      const n = t.cards.filter((c) => mine.has(c.id)).length;
      const on = (mode === 'albums' || mode === 'grid') && t === theme;
      const b = h('button', `tab${on ? ' on' : ''}${t.secret ? ' secret' : ''}${t.cards.length ? '' : ' soon'}`, `${esc(t.label)} <span>${t.cards.length ? `${fmtN(n)}/${fmtN(t.cards.length)}` : 'bientôt'}</span>`);
      b.addEventListener('click', () => {
        theme = t;
        star = null;
        // les Bébous : 8 cartes, pas d'albums → directement la grille
        if (t.secret) {
          mode = 'grid';
          subId = null;
          page = 0;
          render();
          toTop();
        } else goAlbums();
      });
      tabs.append(b);
    }
    const nb = backend.state.binders.length;
    const bb = h('button', `tab binders-tab${mode === 'binders' || mode === 'binder' ? ' on' : ''}`, `Classeurs <span>${nb ? fmtN(nb) : '+'}</span>`);
    bb.addEventListener('click', goBinders);
    tabs.append(bb);
  }

  function renderProgress(mine: Map<string, PlayerCard>) {
    if (mode === 'binders' || mode === 'binder') {
      progress.hidden = true;
      return;
    }
    progress.hidden = false;
    const cards = scope();
    const st = subId ? subthemeById(subId) : null;
    const label = st ? st.label : theme.label;
    const total = cards.length;
    const have = cards.filter((c) => mine.has(c.id)).length;
    const dups = cards.reduce((a, c) => a + Math.max(0, (mine.get(c.id)?.count ?? 0) - 1), 0);
    const pct = total ? (have / total) * 100 : 0;
    const per = theme.secret
      ? ''
      : STAR_ORDER.map((r) => {
          const cs = cards.filter((c) => c.rarity === r);
          const n = cs.filter((c) => mine.has(c.id)).length;
          const full = cs.length > 0 && n === cs.length;
          return `<div class="ps${full ? ' done' : ''}" style="--rc:${rarity(r).hex}" title="${rarity(r).label}${full ? ' · toutes trouvées !' : ''}"><b>${rarity(r).rank + 1}★</b><span class="bar"><i data-w="${cs.length ? (n / cs.length) * 100 : 0}"></i></span><em>${fmtN(n)}/${fmtN(cs.length)}${full ? ' ✓' : ''}</em></div>`;
        }).join('');
    const albumsN = subId ? 0 : theme.subthemes.filter((s) => s.cards.length).length;
    progress.innerHTML = `
      <div class="p-main"><div class="p-pct${total && have === total ? ' full' : ''}">${fmtPct(pct).replace(/ %$/, '')}<small> %</small></div>
        <div class="p-txt"><b>${fmtN(have)}</b> / ${fmtN(total)} cartes uniques ${esc(label)}${albumsN ? ` · ${plural(albumsN, 'album')}` : ''}<br><span>${mine.size === 0 ? 'ta collection est vide : <a class="p-link" href="#/">ouvre ton premier booster</a>' : dups ? `${plural(dups, 'doublon')} · <a class="p-link" href="#/contrats">à brûler en contrat</a> ou à échanger` : total && have === total ? 'sélection complète !' : 'pas encore de doublon'}</span></div></div>
      <div class="p-bar"><i data-w="${pct}"></i></div>
      <div class="p-stars">${per}</div>`;
    const bars = [...progress.querySelectorAll<HTMLElement>('[data-w]')];
    const put = () => bars.forEach((b) => (b.style.width = `${b.dataset.w}%`));
    if (growBars) {
      growBars = false;
      bars.forEach((b) => (b.style.width = '0%'));
      requestAnimationFrame(() => requestAnimationFrame(put));
      const big = progress.querySelector<HTMLElement>('.p-pct');
      const txt = big?.firstChild;
      if (txt && pct > 0) {
        const t0 = performance.now();
        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / 800);
          const e = 1 - Math.pow(1 - k, 3);
          txt.textContent = fmtPct(pct * e).replace(/ %$/, '');
          if (k < 1 && txt.isConnected) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    } else {
      bars.forEach((b) => (b.style.transition = 'none'));
      put();
      requestAnimationFrame(() => bars.forEach((b) => (b.style.transition = '')));
    }
  }

  // ── vue ALBUMS
  function renderAlbums(mine: Map<string, PlayerCard>) {
    el.querySelectorAll<HTMLButtonElement>('.al-sort button').forEach((b) => b.classList.toggle('on', b.dataset.s === albumSort));
    let subs = theme.subthemes.filter((s) => !albumQuery || fold(s.label).includes(albumQuery) || (s.group && fold(s.group.label).includes(albumQuery)));
    const stat = (s: SubTheme) => {
      const have = s.cards.filter((c) => mine.has(c.id)).length;
      return { have, total: s.cards.length, pct: s.cards.length ? have / s.cards.length : -1 };
    };
    const stats = new Map(subs.map((s) => [s.id, stat(s)]));
    const grpLabel = (s: SubTheme) => s.group?.label ?? '';
    if (albumSort === 'completion') subs = [...subs].sort((a, b) => stats.get(b.id)!.pct - stats.get(a.id)!.pct || stats.get(b.id)!.have - stats.get(a.id)!.have || a.label.localeCompare(b.label, 'fr'));
    else if (albumSort === 'alpha') subs = [...subs].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    else subs = [...subs].sort((a, b) => grpLabel(a).localeCompare(grpLabel(b), 'fr') || a.label.localeCompare(b.label, 'fr'));
    q('.al-count').textContent = `${plural(subs.filter((s) => s.cards.length).length, 'album')}`;
    alGrid.replaceChildren();
    let lastGroup: string | null = null;
    const frag = document.createDocumentFragment();
    for (const s of subs) {
      if (albumSort === 'group') {
        const g = grpLabel(s) || 'Sous-thèmes';
        if (g !== lastGroup) {
          lastGroup = g;
          frag.append(h('h4', 'al-group', esc(g)));
        }
      }
      const st = stats.get(s.id)!;
      const soon = !s.cards.length;
      const cover = soon ? null : coverOf(s, mine);
      const a = h('button', `album${soon ? ' soon' : ''}${st.total && st.have === st.total ? ' full' : ''}`);
      a.style.setProperty('--h', String(hueOf(s.id)));
      a.innerHTML = `
        <span class="al-cover">${cover ? `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(cover.entry)}">` : `<span class="al-ph">${esc((s.code || s.label).slice(0, 3).toUpperCase())}</span>`}${cover?.manual ? '<span class="al-pin" title="Pochette choisie par toi">📌</span>' : ''}${soon ? '<span class="al-soon">BIENTÔT</span>' : ''}</span>
        <span class="al-name">${esc(s.label)}</span>
        ${s.group && albumSort !== 'group' ? `<span class="al-grp">${esc(s.group.label)}</span>` : ''}
        <span class="al-n">${soon ? 'en préparation' : `${fmtN(st.have)} / ${fmtN(st.total)}`}</span>
        <span class="al-bar"><i style="width:${Math.max(0, st.pct) * 100}%"></i></span>`;
      a.disabled = soon;
      a.title = soon ? `${s.label} · bientôt` : `${s.label} · ${fmtN(st.have)} / ${fmtN(st.total)} cartes`;
      if (!soon) a.addEventListener('click', () => goGrid(s.id));
      frag.append(a);
    }
    alGrid.append(frag);
    if (!subs.length) alGrid.append(h('div', 'empty', albumQuery ? `Aucun album ne correspond à « ${esc(alSearch.value.trim())} ».` : 'Aucun album.'));
  }

  // ── GRILLE
  function matches(e: CatalogEntry, mine: Map<string, PlayerCard>): boolean {
    const have = mine.get(e.id);
    if (filter === 'owned' && !have) return false;
    if (filter === 'missing' && have) return false;
    if (filter === 'dups' && (!have || have.count < 2)) return false;
    if (filter === 'fresh' && !fresh.has(e.id)) return false;
    if (star && e.rarity !== star) return false;
    if (query) {
      if (e.rarity === 'secret' && !have) return false;
      if (!folded(e).includes(query) && String(e.num) !== query.replace(/^0+/, '')) return false;
    }
    return true;
  }
  function sortList(list: CatalogEntry[], mine: Map<string, PlayerCard>): CatalogEntry[] {
    if (sort === 'num') return list;
    const out = [...list];
    if (sort === 'stars') out.sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || a.num - b.num);
    else out.sort((a, b) => (mine.get(b.id)?.firstPulledAt ?? -1) - (mine.get(a.id)?.firstPulledAt ?? -1) || a.num - b.num);
    return out;
  }
  /** tuile d'une carte de la grille (manquante : « + Envie ») */
  function tileFor(e: CatalogEntry, mine: Map<string, PlayerCard>, wish: Set<string>): HTMLElement {
    const have = mine.get(e.id);
    const t = cardTile(e.id, e.rarity, { owned: !!have, count: have?.count, fresh: fresh.has(e.id) });
    if (!have && e.rarity !== 'secret') {
      const b = h('button', `wish-btn${wish.has(e.id) ? ' on' : ''}`, '♥');
      b.title = wish.has(e.id) ? 'Retirer de mes envies' : 'Ajouter à mes envies';
      b.setAttribute('aria-pressed', String(wish.has(e.id)));
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        haptics.pulse(8);
        b.classList.toggle('on');
        void backend.toggleWish(e.id).catch((err) => (b.classList.toggle('on'), toast(errMsg(err), 'err')));
      });
      t.append(b);
    }
    return t;
  }
  let shownList: CatalogEntry[] = [];
  let lastKey = '';
  function renderGrid(mine: Map<string, PlayerCard>) {
    const fb = q<HTMLButtonElement>('.f-fresh');
    fb.hidden = fresh.size === 0;
    fb.textContent = `Nouvelles (${fmtN(fresh.size)})`;
    if (filter === 'fresh' && !fresh.size) filter = 'all';
    el.querySelectorAll<HTMLButtonElement>('.filters .seg:not(.sortf) button').forEach((b) => b.classList.toggle('on', b.dataset.f === filter));
    el.querySelectorAll<HTMLButtonElement>('.sortf button').forEach((b) => b.classList.toggle('on', b.dataset.s === sort));
    starf.hidden = !!theme.secret;
    starf.querySelectorAll<HTMLElement>('.chip').forEach((b) => b.classList.toggle('on', b.dataset.r === star));
    const list = sortList(scope().filter((e) => matches(e, mine)), mine);
    const key = `${theme.id}|${subId}|${filter}|${star}|${sort}|${query}|${page}`;
    if (key !== lastKey) {
      if (lastKey) {
        grid.classList.remove('swap');
        void grid.offsetWidth;
        grid.classList.add('swap');
      }
      lastKey = key;
    }
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (page >= pages) page = pages - 1;
    const wish = new Set(backend.state.wishlist);
    const frag = document.createDocumentFragment();
    for (const e of list.slice(page * PAGE, (page + 1) * PAGE)) frag.append(tileFor(e, mine, wish));
    grid.replaceChildren(frag);
    shownList = list;
    preloadThumbs(list.slice(page * PAGE, (page + 1) * PAGE));
    renderPager(pages, list.length);
    empty.hidden = list.length > 0;
    empty.innerHTML = fr(!theme.cards.length
      ? `Ce thème arrive bientôt : ${esc(theme.subthemes.map((s) => s.label).join(', '))}.`
      : query
        ? `Aucune carte ne correspond à « ${esc(search.value.trim())} ».`
        : filter === 'dups'
          ? 'Pas encore de doublon ici : ils arrivent vite en ouvrant des boosters.'
          : filter === 'owned'
            ? 'Aucune carte ici pour l’instant. <a href="#/">Ouvre un booster</a> !'
            : filter === 'missing'
              ? 'Tu les as toutes. Chapeau.'
              : filter === 'fresh'
                ? 'Pas de nouvelle carte dans cette sélection : regarde dans les autres albums.'
                : 'Aucune carte ne correspond.');
  }
  function renderPager(pages: number, total: number) {
    pager.hidden = pages <= 1;
    if (pages <= 1) return;
    const btn = (label: string, p: number, cls = '') => {
      const b = h('button', `pg${cls}${p === page ? ' on' : ''}`, label);
      b.disabled = p < 0 || p >= pages;
      b.addEventListener('click', () => {
        page = p;
        render();
        grid.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      return b;
    };
    pager.replaceChildren();
    pager.append(btn('‹', page - 1, ' pg-arrow'));
    // fenêtre de pages autour de la page courante (1 … 4 5 6 … 20)
    const show = new Set<number>([0, pages - 1, page - 1, page, page + 1]);
    let last = -1;
    for (let p = 0; p < pages; p++) {
      if (!show.has(p)) continue;
      if (last >= 0 && p - last > 1) pager.append(h('span', 'pg-dots', '…'));
      pager.append(btn(String(p + 1), p));
      last = p;
    }
    pager.append(btn('›', page + 1, ' pg-arrow'));
    pager.append(h('span', 'pg-info', `${fmtN(page * PAGE + 1)}–${fmtN(Math.min(total, (page + 1) * PAGE))} sur ${fmtN(total)}`));
  }

  // ── CLASSEURS
  const binderCover = (b: Binder, mine: Map<string, PlayerCard>): CatalogEntry | undefined => {
    const id = b.coverCardId && mine.has(b.coverCardId) ? b.coverCardId : b.cards.find((c) => mine.has(c.cardId))?.cardId;
    return id ? catalogEntry(id) : undefined;
  };
  function renderBinders(mine: Map<string, PlayerCard>) {
    bindersView.replaceChildren();
    const list = backend.state.binders;
    const head = h('div', 'bd-head', `<div><span class="kicker">CLASSEURS PERSO</span><h2>Tes classeurs</h2><p class="muted">Range tes cartes comme tu veux : une carte peut être dans plusieurs classeurs. Le classeur épinglé s’affiche sur ton profil.</p></div><button class="btn-primary bd-new">+ Nouveau classeur</button>`);
    head.querySelector('.bd-new')!.addEventListener('click', () => void newBinder());
    bindersView.append(head);
    if (!list.length) {
      bindersView.append(h('div', 'empty', 'Pas encore de classeur. Crée-en un, puis ajoute des cartes depuis leur fiche (« + Classeur »).'));
      return;
    }
    const g = h('div', 'bd-grid');
    for (const b of list) {
      const cover = binderCover(b, mine);
      const c = h('button', `bd-card${b.pinned ? ' pinned' : ''}`);
      c.innerHTML = `<span class="bd-cover">${cover ? `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(cover)}">` : '<span class="al-ph">✦</span>'}${b.pinned ? '<span class="bd-pin" title="Épinglé sur ton profil">★ profil</span>' : ''}</span><span class="bd-name">${esc(b.name)}</span><span class="bd-n">${plural(b.cards.length, 'carte')}</span>`;
      c.addEventListener('click', () => goBinder(b.id));
      g.append(c);
    }
    bindersView.append(g);
  }
  async function newBinder(cards?: Array<{ cardId: string; rarity: RarityId }>): Promise<string | null> {
    const name = prompt('Nom du classeur (ex. « Rois », « Shinies ») :')?.trim();
    if (!name) return null;
    try {
      const id = await backend.createBinder(name, cards);
      shell.sfx.tick(1.2, 0.05);
      toast(`Classeur « ${name} » créé`, 'ok');
      return id;
    } catch (e) {
      toast(errMsg(e), 'err');
      return null;
    }
  }
  function renderBinder(mine: Map<string, PlayerCard>) {
    const b = backend.state.binders.find((x) => x.id === binderId);
    bindersView.replaceChildren();
    if (!b) return goBinders();
    const head = h('div', 'bd-head bd-one');
    head.innerHTML = `<div><span class="kicker">CLASSEUR${b.pinned ? ' · ÉPINGLÉ SUR TON PROFIL' : ''}</span><h2 class="bd-title">${esc(b.name)}<button class="bd-rename" title="Renommer" aria-label="Renommer">✎</button></h2><p class="muted">${plural(b.cards.length, 'carte')}${b.coverCardId ? ` · couverture : ${esc(catalogEntry(b.coverCardId)?.name ?? '')}` : ' · couverture automatique (la première carte)'}</p></div>
      <div class="bd-actions"><button class="btn-ghost bd-pinb">${b.pinned ? '★ Désépingler' : '☆ Épingler sur le profil'}</button><button class="btn-ghost bd-edit">${binderEdit ? 'Terminer' : 'Réorganiser'}</button><button class="btn-ghost danger bd-del">Supprimer</button></div>`;
    head.querySelector('.bd-rename')!.addEventListener('click', async () => {
      const name = prompt('Nouveau nom :', b.name)?.trim();
      if (!name || name === b.name) return;
      try {
        await backend.renameBinder(b.id, name);
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
    head.querySelector('.bd-pinb')!.addEventListener('click', async () => {
      try {
        await backend.pinBinder(b.id, !b.pinned);
        toast(b.pinned ? 'Classeur retiré du profil' : 'Classeur épinglé sur ton profil', 'ok');
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
    head.querySelector('.bd-edit')!.addEventListener('click', () => {
      binderEdit = !binderEdit;
      render();
    });
    head.querySelector('.bd-del')!.addEventListener('click', async () => {
      if (!confirm(`Supprimer le classeur « ${b.name} » ? Les cartes restent dans ta collection.`)) return;
      try {
        await backend.deleteBinder(b.id);
        goBinders();
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
    bindersView.append(head);
    if (!b.cards.length) {
      bindersView.append(h('div', 'empty', 'Classeur vide : ouvre une carte de ta collection et touche « + Classeur ».'));
      return;
    }
    if (binderEdit) bindersView.append(h('div', 'bd-hint', 'Glisse les cartes pour les réordonner · ✕ retire du classeur · ⌂ en fait la couverture'));
    const g = h('div', `grid bd-cards${binderEdit ? ' editing' : ''}`);
    b.cards.forEach((c, i) => {
      const have = mine.get(c.cardId);
      const t = cardTile(c.cardId, c.rarity, { owned: !!have, count: have?.count });
      t.dataset.i = String(i);
      if (binderEdit) {
        const tools = h('span', 'bd-tools', `<button class="bd-cov${b.coverCardId === c.cardId ? ' on' : ''}" title="Couverture du classeur">⌂</button><button class="bd-rm" title="Retirer du classeur">✕</button>`);
        tools.querySelector('.bd-cov')!.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          try {
            await backend.setBinderCover(b.id, b.coverCardId === c.cardId ? undefined : c.cardId);
          } catch (e) {
            toast(errMsg(e), 'err');
          }
        });
        tools.querySelector('.bd-rm')!.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          try {
            await backend.toggleBinderCard(b.id, c);
          } catch (e) {
            toast(errMsg(e), 'err');
          }
        });
        t.append(tools);
      }
      g.append(t);
    });
    bindersView.append(g);
    if (binderEdit) sortable(g, b);
  }
  /** glisser-déposer (souris et doigt) : la carte attrapée suit le pointeur, les autres s'écartent, on relâche = nouvel ordre. */
  function sortable(g: HTMLElement, b: Binder) {
    let drag: { el: HTMLElement; from: number; ghost: HTMLElement; ox: number; oy: number } | null = null;
    let over = -1;
    g.addEventListener('pointerdown', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('.tile');
      if (!t || (e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      const r = t.getBoundingClientRect();
      const ghost = t.cloneNode(true) as HTMLElement;
      ghost.className += ' bd-ghost';
      ghost.style.width = `${r.width}px`;
      ghost.style.height = `${r.height}px`;
      document.body.append(ghost);
      drag = { el: t, from: Number(t.dataset.i), ghost, ox: e.clientX - r.left, oy: e.clientY - r.top };
      t.classList.add('bd-dragging');
      g.setPointerCapture(e.pointerId);
      move(e);
      haptics.pulse(8);
    });
    const move = (e: PointerEvent) => {
      if (!drag) return;
      drag.ghost.style.transform = `translate(${e.clientX - drag.ox}px, ${e.clientY - drag.oy}px)`;
      drag.ghost.hidden = true;
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.bd-cards .tile');
      drag.ghost.hidden = false;
      const i = under ? Number(under.dataset.i) : -1;
      if (i !== over) {
        over = i;
        g.querySelectorAll<HTMLElement>('.tile').forEach((x) => x.classList.toggle('bd-over', Number(x.dataset.i) === i && i !== drag!.from));
      }
    };
    g.addEventListener('pointermove', move);
    const end = async (e: PointerEvent) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      d.ghost.remove();
      d.el.classList.remove('bd-dragging');
      g.querySelectorAll('.bd-over').forEach((x) => x.classList.remove('bd-over'));
      try {
        g.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (over < 0 || over === d.from) return;
      const cards = [...b.cards];
      const [it] = cards.splice(d.from, 1);
      cards.splice(over, 0, it);
      over = -1;
      try {
        await backend.setBinderCards(b.id, cards);
        shell.sfx.tick(1.1, 0.04);
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  }

  function render() {
    const mine = owned();
    renderTabs(mine);
    const inAlbums = mode === 'albums';
    const inGrid = mode === 'grid';
    const inBinders = mode === 'binders' || mode === 'binder';
    albums.hidden = !inAlbums;
    filtersEl.hidden = !inGrid;
    grid.hidden = !inGrid;
    pager.hidden = !inGrid;
    empty.hidden = true;
    bindersView.hidden = !inBinders;
    crumb.hidden = !((inGrid && !theme.secret) || mode === 'binder');
    if (inGrid && !theme.secret) {
      q('.crumb-back').textContent = `‹ Albums ${theme.label}`;
      q('.crumb-name').textContent = subId ? (subthemeById(subId)?.label ?? '') : `Tout ${theme.label}`;
    } else if (mode === 'binder') {
      q('.crumb-back').textContent = '‹ Classeurs';
      q('.crumb-name').textContent = backend.state.binders.find((x) => x.id === binderId)?.name ?? '';
    }
    for (const row of [tabs]) {
      const on = row.querySelector<HTMLElement>('.on');
      if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.clientWidth) / 2;
    }
    renderProgress(mine);
    if (inAlbums) renderAlbums(mine);
    else if (inGrid) renderGrid(mine);
    else if (mode === 'binders') renderBinders(mine);
    else renderBinder(mine);
  }

  // ── carte focus (visionneuse 3D) + actions
  let browse: Array<{ id: string; r: RarityId }> = [];
  let at = -1;
  const clickTile = (ev: Event, from: 'grid' | 'binder') => {
    const miss = (ev.target as HTMLElement).closest<HTMLElement>('.tile.missing');
    if (miss) {
      if ((ev.target as HTMLElement).closest('.wish-btn')) return;
      const e = catalogEntry(miss.dataset.card ?? '');
      if (!e) return;
      if (e.rarity === 'secret') return toast(`Carte secrète : elle ne se cache que dans le ${BEBOU_PACK.label}.`, 'info');
      const t = themeById(e.themeId);
      return toast(`${e.name} (${rarity(e.rarity).rank + 1}★) : pas encore trouvée · dans le ${t ? `${t.label} Pack` : 'booster de son thème'} et le ${BEBOU_PACK.label} · ♥ pour la suivre`, 'info');
    }
    const t = (ev.target as HTMLElement).closest<HTMLElement>('.tile.owned');
    if (!t || (ev.target as HTMLElement).closest('button')) return;
    if (from === 'binder' && binderEdit) return;
    shell.requestGyro();
    const mine = owned();
    if (from === 'grid') browse = shownList.filter((e) => mine.has(e.id)).map((e) => ({ id: e.id, r: e.rarity as RarityId }));
    else {
      const b = backend.state.binders.find((x) => x.id === binderId);
      browse = (b?.cards ?? []).filter((c) => mine.has(c.cardId)).map((c) => ({ id: c.cardId, r: c.rarity }));
    }
    void openCard(browse.findIndex((b) => b.id === t.dataset.card && b.r === t.dataset.rarity));
  };
  grid.addEventListener('click', (ev) => clickTile(ev, 'grid'));
  bindersView.addEventListener('click', (ev) => clickTile(ev, 'binder'));

  function renderActions(b: { id: string; r: RarityId }) {
    const e = catalogEntry(b.id);
    const have = owned().get(b.id);
    const wish = backend.state.wishlist.includes(b.id);
    const st = e ? subthemeById(e.subthemeId) : null;
    const isCover = !!st && backend.state.covers[st.id] === b.id;
    const inBinders = backend.state.binders.filter((x) => x.cards.some((c) => c.cardId === b.id && c.rarity === b.r)).length;
    vActions.innerHTML = `
      <button class="va va-wish${wish ? ' on' : ''}" title="${wish ? 'Retirer de mes envies' : 'Je veux cette carte (envies)'}">♥ <span>${wish ? 'Envie ✓' : 'Envie'}</span></button>
      <button class="va va-binder${inBinders ? ' on' : ''}" title="Ranger dans un classeur">▤ <span>${inBinders ? `Classeur ×${inBinders}` : '+ Classeur'}</span></button>
      <button class="va va-trade" title="Proposer cette carte dans un échange">⇄ <span>Échanger</span></button>
      ${st && !e?.themeId.startsWith('bebous') ? `<button class="va va-cover${isCover ? ' on' : ''}" title="${isCover ? 'Ne plus utiliser comme pochette' : `En faire la pochette de l’album ${esc(st.label)}`}">⌂ <span>${isCover ? 'Pochette ✓' : 'Pochette'}</span></button>` : ''}
      ${have?.firstPulledAt ? `<span class="va-date">obtenue le ${fmtDate(have.firstPulledAt)}</span>` : ''}`;
    vActions.querySelector('.va-wish')!.addEventListener('click', async () => {
      haptics.pulse(8);
      try {
        await backend.toggleWish(b.id);
        renderActions(b);
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
    vActions.querySelector('.va-binder')!.addEventListener('click', () => showBinderPick(b));
    vActions.querySelector('.va-trade')!.addEventListener('click', () => {
      sessionStorage.setItem('bebou.tradeGive', `${b.id}:${b.r}`);
      closeViewer();
      location.hash = '#/echanges';
      toast('Choisis un ami : la carte sera dans ta proposition', 'info');
    });
    vActions.querySelector('.va-cover')?.addEventListener('click', async () => {
      if (!st) return;
      try {
        await backend.setSubthemeCover(st.id, isCover ? undefined : b.id);
        toast(isCover ? `Pochette ${st.label} : automatique` : `${e?.name} est la pochette de l’album ${st.label}`, 'ok');
        renderActions(b);
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
  }
  function showBinderPick(b: { id: string; r: RarityId }) {
    const list = backend.state.binders;
    binderPick.hidden = false;
    binderPick.innerHTML = `<div class="bp-h"><b>Ranger dans…</b><button class="bp-x" aria-label="Fermer">✕</button></div>
      ${list.map((x) => `<label class="bp-row"><input type="checkbox" data-id="${esc(x.id)}" ${x.cards.some((c) => c.cardId === b.id && c.rarity === b.r) ? 'checked' : ''}><span>${esc(x.name)}</span><em>${x.cards.length}</em></label>`).join('')}
      <button class="btn-ghost bp-new">+ Nouveau classeur avec cette carte</button>`;
    binderPick.querySelector('.bp-x')!.addEventListener('click', () => (binderPick.hidden = true));
    binderPick.querySelectorAll<HTMLInputElement>('input').forEach((inp) =>
      inp.addEventListener('change', async () => {
        try {
          const added = await backend.toggleBinderCard(inp.dataset.id!, { cardId: b.id, rarity: b.r });
          shell.sfx.tick(added ? 1.3 : 0.9, 0.05);
          renderActions(b);
        } catch (err) {
          inp.checked = !inp.checked;
          toast(errMsg(err), 'err');
        }
      }),
    );
    binderPick.querySelector('.bp-new')!.addEventListener('click', async () => {
      const id = await newBinder([{ cardId: b.id, rarity: b.r }]);
      if (id) {
        renderActions(b);
        showBinderPick(b);
      }
    });
  }

  async function openCard(i: number, dir: 0 | 1 | -1 = 0) {
    const b = browse[i];
    if (!b) return;
    at = i;
    const e = catalogEntry(b.id);
    const have = owned().get(b.id);
    const st = e ? subthemeById(e.subthemeId) : null;
    if (!open) {
      document.body.classList.add('card-open');
      pushLayer(closeViewer);
      requestAnimationFrame(() => viewerUi.querySelector<HTMLElement>('.close')?.focus({ preventScroll: true }));
    }
    open = true;
    el.classList.add('viewing');
    viewerUi.hidden = false;
    binderPick.hidden = true;
    vInfo.className = `v-info r-${b.r}${dir ? ' swap' : ''}`;
    vInfo.style.setProperty('--ra', rarity(b.r).accentHex);
    vInfo.innerHTML = `<div class="ci-name">${esc(e?.name ?? b.id)}</div><div class="ci-meta">${starsHtml(b.r)} <span class="ci-r" style="color:${rarity(b.r).accentHex}">${rarity(b.r).label}</span></div>
      <div class="ci-sub">${st ? `${esc(st.label)} ${String(e!.num).padStart(3, '0')}/${numberingSize(st)} · ` : ''}${have ? `${plural(have.count, 'exemplaire')} (${have.count > 1 ? 'meilleur : ' : ''}n°${fmtN(have.bestMintNumber)} imprimé)` : ''}</div>`;
    renderActions(b);
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= browse.length - 1;
    hintEl.textContent = matchMedia('(hover: hover)').matches
      ? `glisse pour tourner · molette pour zoomer${browse.length > 1 ? ' · ← → pour feuilleter' : ''}`
      : 'glisse pour tourner · touche deux fois pour zoomer';
    navPos.textContent = browse.length > 1 ? `${fmtN(i + 1)} / ${fmtN(browse.length)}` : '';
    const viewer = await getViewer();
    if (!open || at !== i) return;
    shell.setDimmed(false);
    shell.show('viewer');
    void viewer.show(b.id, b.r, dir ? { dir } : undefined);
  }
  const step = (d: 1 | -1) => {
    if (!open || !browse[at + d]) return;
    shell.sfx.tick(1.3, 0.04);
    void openCard(at + d, d);
  };
  function closeViewer() {
    if (!open) return;
    popLayer();
    open = false;
    document.body.classList.remove('card-open');
    el.classList.remove('viewing');
    viewerUi.hidden = true;
    binderPick.hidden = true;
    shell.show(null);
    shell.setDimmed(true);
    const b = browse[at];
    const tile = b && el.querySelector<HTMLElement>(`.tile.owned[data-card="${CSS.escape(b.id)}"][data-rarity="${b.r}"]`);
    tile?.scrollIntoView({ block: 'nearest' });
    if (tile && document.activeElement?.closest('.viewer-ui')) tile.focus({ preventScroll: true });
    render(); // envies / classeurs / pochettes ont pu changer
  }
  viewerUi.querySelector('.close')!.addEventListener('click', closeViewer);
  const prevBtn = viewerUi.querySelector<HTMLButtonElement>('.nav.prev')!;
  const nextBtn = viewerUi.querySelector<HTMLButtonElement>('.nav.next')!;
  const navPos = viewerUi.querySelector<HTMLElement>('.v-pos')!;
  const hintEl = viewerUi.querySelector<HTMLElement>('.v-hint')!;
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      if (!binderPick.hidden) binderPick.hidden = true;
      else closeViewer();
    } else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  window.addEventListener('pagehide', () => el.isConnected && saveSeen());
  let sig = '';
  backend.onChange((st) => {
    const now = `${collectionSig(st)}|${st.wishlist.length}|${JSON.stringify(st.binders)}|${JSON.stringify(st.covers)}`;
    if (now === sig) return;
    sig = now;
    if (el.isConnected && !open) render();
    else if (el.isConnected && open && browse[at]) renderActions(browse[at]);
  });

  return {
    el,
    enter(sub) {
      shell.show(null);
      shell.setDimmed(true);
      const mine = owned();
      const seen = loadSeen();
      fresh = seen ? new Set([...mine.keys()].filter((id) => !seen.has(id))) : new Set();
      if (!seen) saveSeen();
      if (sub === 'classeurs') goBinders();
      else if (sub && sub !== 'nouvelles') {
        // lien direct : un sous-thème (#/collection/pkm-kanto), un groupe (#/collection/pokemon → ses albums) ou un thème (#/collection/monde)
        const st = subthemeById(sub);
        const grp = !st ? SUBTHEMES.find((x) => x.group?.id === sub.replace(/^group:/, '')) : undefined;
        const t = ALL_THEMES.find((x) => x.id === (st?.themeId ?? grp?.themeId ?? sub));
        if (t) theme = t;
        if (st && st.themeId !== 'bebous') {
          mode = 'grid';
          subId = st.id;
          page = 0;
        } else if (grp) {
          mode = 'albums';
          subId = null;
          alSearch.value = grp.group!.label;
          albumQuery = fold(grp.group!.label);
        } else if (t) {
          mode = t.secret ? 'grid' : 'albums';
          subId = null;
        }
      } else if (sub === 'nouvelles' && fresh.size) {
        // « Voir mes nouvelles » depuis le récap : la grille du sous-thème de la première, filtre « Nouvelles »
        saveSeen();
        const first = catalogEntry([...fresh][0]);
        theme = ALL_THEMES.find((t) => t.id === first?.themeId) ?? theme;
        mode = 'grid';
        subId = first && !theme.secret ? first.subthemeId : null;
        // nouvelles réparties sur plusieurs albums : tout le thème
        if (subId && [...fresh].some((id) => catalogEntry(id)?.subthemeId !== subId && catalogEntry(id)?.themeId === theme.id)) subId = null;
        star = null;
        query = '';
        search.value = '';
        filter = 'fresh';
        page = 0;
        history.replaceState(null, '', '#/collection');
      }
      preloadOwned(mine.keys());
      growBars = true;
      render();
    },
    leave() {
      if (open) closeViewer();
      saveSeen();
      fresh.clear();
      if (filter === 'fresh') filter = 'all';
    },
  };
}
