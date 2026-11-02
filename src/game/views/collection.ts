import { collectionSig, type GameBackend, type PlayerCard } from '../backend';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { ALL_THEMES, BEBOU_PACK, BEBOU_THEME, catalogEntry, inSubthemeScope, scopeLabel, subthemeById, subthemeViews, themeById, type CatalogEntry, type ThemeInfo } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { SEEN_KEY, cardTile, esc, fmtN, fmtPct, fold, fr, h, loadSeen, plural, popLayer, pushLayer, starsHtml, toast } from '../ui';
import { preloadOwned, preloadThumbs } from '../preload';

/**
 * Collection : un onglet par thème (Gaming, Pop Culture, Sport, World), des pastilles de sous-thème
 * (Pokémon, MCU…), la progression de la sélection (cartes possédées / total, par étoile), filtres
 * (possédées, manquantes, doublons, étoiles, recherche) et une grille de miniatures WebP chargées paresseusement.
 * Toucher une carte possédée l'ouvre en grand dans la visionneuse 3D.
 * Le thème secret n'apparaît que si on possède au moins un Bébou ; sinon, huit « ? ».
 */
export interface CollectionView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

type Filter = 'all' | 'owned' | 'missing' | 'dups' | 'fresh';
const STAR_ORDER: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export function createCollectionView(backend: GameBackend, shell: Shell, getViewer: () => Promise<ViewerScene>): CollectionView {
  const el = h('section', 'view collection');
  let theme: ThemeInfo = ALL_THEMES[0];
  /** sous-thème sélectionné (null = tout le thème) */
  let subId: string | null = null;
  let filter: Filter = 'all';
  let star: RarityId | null = null;
  let query = '';
  let open = false;
  /** prochaine barre de progression : remplissage animé (arrivée sur la page) */
  let growBars = false;
  /**
   * Cartes vues lors de la dernière visite de la collection (navigateur) : les nouvelles depuis portent une pastille
   * dorée jusqu'à ce qu'on quitte la page. Première visite : rien n'est marqué (sinon tout serait « nouveau »).
   */
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
      <div class="subs"></div>
      <div class="progress"></div>
    </div>
    <div class="filters">
      <div class="seg">
        <button data-f="all">Toutes</button><button data-f="owned">Possédées</button><button data-f="missing">Manquantes</button><button data-f="dups">Doublons</button><button data-f="fresh" class="f-fresh" hidden>Nouvelles</button>
      </div>
      <div class="starf"></div>
      <input class="search" type="search" placeholder="Rechercher…" enterkeyhint="search" autocomplete="off" spellcheck="false" aria-label="Rechercher une carte (nom ou numéro)" />
    </div>
    <div class="grid"></div>
    <div class="empty" hidden></div>
    <button class="to-top" aria-label="Revenir en haut" title="Revenir en haut" hidden>↑</button>
    <div class="viewer-ui" hidden><button class="close" aria-label="Fermer">✕</button>
      <button class="nav prev" aria-label="Carte précédente">‹</button><button class="nav next" aria-label="Carte suivante">›</button>
      <div class="v-info"></div><div class="v-pos"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
  const tabs = el.querySelector<HTMLElement>('.tabs')!;
  const subs = el.querySelector<HTMLElement>('.subs')!;
  const progress = el.querySelector<HTMLElement>('.progress')!;
  const grid = el.querySelector<HTMLElement>('.grid')!;
  const empty = el.querySelector<HTMLElement>('.empty')!;
  const starf = el.querySelector<HTMLElement>('.starf')!;
  const search = el.querySelector<HTMLInputElement>('.search')!;
  const viewerUi = el.querySelector<HTMLElement>('.viewer-ui')!;
  const vInfo = el.querySelector<HTMLElement>('.v-info')!;

  el.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) =>
    b.addEventListener('click', () => {
      const f = b.dataset.f as Filter;
      // « Nouvelles » : un clic les montre et les marque vues ; dès qu'on passe à un autre filtre, l'onglet et les
      // pastilles dorées disparaissent
      if (f === 'fresh') saveSeen();
      else if (filter === 'fresh') fresh.clear();
      filter = f;
      render();
    }),
  );
  for (const r of STAR_ORDER) {
    const b = h('button', 'chip', String(rarity(r).rank + 1) + '★');
    b.title = rarity(r).label;
    b.style.setProperty('--rc', rarity(r).hex);
    b.addEventListener('click', () => {
      star = star === r ? null : r;
      render();
    });
    b.dataset.r = r;
    starf.append(b);
  }
  // Échap dans la recherche : efface (puis quitte le champ) ; « / » n'importe où dans la collection : chercher
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (search.value) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
    } else search.blur();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== '/' || !el.isConnected || open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    e.preventDefault();
    search.focus();
    search.select();
  });
  // longue grille : la barre de filtres reste en haut (ordinateur) et un bouton ramène en haut
  const filtersEl = el.querySelector<HTMLElement>('.filters')!;
  const headEl = el.querySelector<HTMLElement>('.coll-head')!;
  const toTopBtn = el.querySelector<HTMLButtonElement>('.to-top')!;
  toTopBtn.addEventListener('click', () => el.scrollTo({ top: 0, behavior: 'smooth' }));
  let scrollRaf = 0;
  el.addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      const y = el.scrollTop;
      toTopBtn.hidden = y < 1400;
      // collée dès que l'en-tête (onglets, progression) est passé sous la barre du haut
      filtersEl.classList.toggle('stuck', y > headEl.offsetTop + headEl.offsetHeight - 48);
    });
  }, { passive: true });

  let qTimer = 0;
  search.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = window.setTimeout(() => {
      query = fold(search.value.trim());
      render();
    }, 120);
  });

  /** id → ligne de collection (une carte a une seule rareté : celle de son thème). */
  function owned(): Map<string, PlayerCard> {
    const m = new Map<string, PlayerCard>();
    for (const c of backend.state.collection) {
      const prev = m.get(c.cardId);
      if (prev) m.set(c.cardId, { ...prev, count: prev.count + c.count });
      else m.set(c.cardId, c);
    }
    return m;
  }

  /** noms sans accents (recherche), calculés une fois */
  const foldCache = new Map<string, string>();
  const folded = (e: CatalogEntry) => {
    let f = foldCache.get(e.id);
    if (f === undefined) foldCache.set(e.id, (f = fold(e.name)));
    return f;
  };
  /** rendu de la grille par paquets : un nouveau rendu annule le précédent */
  let gridToken = 0;
  /** ajoute la suite de la grille si on approche du bas (appelé au défilement) */
  let growMore = () => {};
  const sentinel = h('div', 'grid-more');
  el.addEventListener('scroll', () => growMore(), { passive: true });
  /** sélection affichée (pour ne faire le fondu qu'au changement de sélection) */
  let lastKey = '';
  /** changement d'onglet ou de sous-thème : on repart du haut de la grille */
  const toTop = () => el.scrollTo({ top: 0 });

  function visibleThemes(mine: Map<string, PlayerCard>): ThemeInfo[] {
    const hasBebou = BEBOU_THEME.cards.some((c) => mine.has(c.id));
    return ALL_THEMES.filter((t) => !t.secret || hasBebou);
  }

  function renderTabs(mine: Map<string, PlayerCard>) {
    tabs.innerHTML = '';
    for (const t of visibleThemes(mine)) {
      const n = t.cards.filter((c) => mine.has(c.id)).length;
      const b = h('button', `tab${t === theme ? ' on' : ''}${t.secret ? ' secret' : ''}${t.cards.length ? '' : ' soon'}`, `${esc(t.label)} <span>${t.cards.length ? `${fmtN(n)}/${fmtN(t.cards.length)}` : 'bientôt'}</span>`);
      b.addEventListener('click', () => {
        if (theme === t && subId === null) return;
        theme = t;
        subId = null;
        star = null;
        render();
        toTop();
      });
      tabs.append(b);
    }
  }

  /** Cartes de la sélection (thème entier ou un sous-thème). */
  // subId : un sous-thème, ou un groupe (« group:jeux-video » = les 177 familles Jeux vidéo ensemble)
  const scope = () => (subId ? theme.cards.filter((c) => inSubthemeScope(subId!, c.subthemeId)) : theme.cards);

  function renderSubs(mine: Map<string, PlayerCard>) {
    subs.innerHTML = '';
    subs.hidden = !!theme.secret;
    if (theme.secret) return;
    const all = h('button', `chip sub${subId === null ? ' on' : ''}`, `Tout ${esc(theme.label)}`);
    all.addEventListener('click', () => ((subId = null), (star = null), render(), toTop()));
    subs.append(all);
    for (const v of subthemeViews(theme)) {
      const n = v.cards.filter((c) => mine.has(c.id)).length;
      // groupe : actif aussi quand une de ses familles est choisie
      const on = subId === v.id || (v.group && !!subId && v.subs.some((st) => st.id === subId));
      const b = h('button', `chip sub${on ? ' on' : ''}${v.cards.length ? '' : ' soon'}`, v.cards.length ? `${esc(v.label)} <em>${fmtN(n)}/${fmtN(v.cards.length)}</em>` : `${esc(v.label)} <em>bientôt</em>`);
      b.disabled = !v.cards.length;
      b.addEventListener('click', () => ((subId = v.id), (star = null), render(), toTop()));
      subs.append(b);
      // groupe choisi (Jeux vidéo) : une liste déroulante pour descendre dans une de ses familles
      if (on && v.group) {
        const sel = h('select', 'fam-select') as HTMLSelectElement;
        sel.setAttribute('aria-label', `Famille ${v.label}`);
        sel.innerHTML =
          `<option value="${esc(v.id)}">Toutes (${v.subs.length} ${esc(v.subs[0]?.group?.unit ?? 'sous-thèmes')})</option>` +
          [...v.subs]
            .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
            .map((st) => `<option value="${esc(st.id)}"${st.id === subId ? ' selected' : ''}>${esc(st.label)} · ${fmtN(st.cards.filter((c) => mine.has(c.id)).length)}/${fmtN(st.cards.length)}</option>`)
            .join('');
        sel.addEventListener('change', () => ((subId = sel.value), (star = null), render(), toTop()));
        subs.append(sel);
      }
    }
  }

  function renderProgress(mine: Map<string, PlayerCard>) {
    const cards = scope();
    const label = subId ? scopeLabel(subId) : theme.label;
    const total = cards.length;
    const have = cards.filter((c) => mine.has(c.id)).length;
    const dups = cards.reduce((a, c) => a + Math.max(0, (mine.get(c.id)?.count ?? 0) - 1), 0);
    const pct = total ? (have / total) * 100 : 0;
    const per = theme.secret
      ? ''
      : STAR_ORDER.map((r) => {
          const cs = cards.filter((c) => c.rarity === r);
          const n = cs.filter((c) => mine.has(c.id)).length;
          // étoile complète : le compteur passe en or, avec une coche
          const full = cs.length > 0 && n === cs.length;
          return `<div class="ps${full ? ' done' : ''}" style="--rc:${rarity(r).hex}" title="${rarity(r).label}${full ? ' · toutes trouvées !' : ''}"><b>${rarity(r).rank + 1}★</b><span class="bar"><i data-w="${cs.length ? (n / cs.length) * 100 : 0}"></i></span><em>${fmtN(n)}/${fmtN(cs.length)}${full ? ' ✓' : ''}</em></div>`;
        }).join('');
    progress.innerHTML = `
      <div class="p-main"><div class="p-pct${total && have === total ? ' full' : ''}">${fmtPct(pct).replace(/\u00a0%$/, '')}<small>\u00a0%</small></div>
        <div class="p-txt"><b>${fmtN(have)}</b> / ${fmtN(total)} cartes ${esc(label)}<br><span>${mine.size === 0 ? 'ta collection est vide\u00a0: <a class="p-link" href="#/">ouvre ton premier booster</a>' : dups ? `${plural(dups, 'doublon')} · <a class="p-link" href="#/contrats">à brûler en contrat</a> ou à échanger` : total && have === total ? 'sélection complète\u00a0!' : 'pas encore de doublon'}</span></div></div>
      <div class="p-bar"><i data-w="${pct}"></i></div>
      <div class="p-stars">${per}</div>`;
    // à l'arrivée sur la page, les barres se remplissent ; ensuite (filtres, onglets) elles sont posées directement
    const bars = [...progress.querySelectorAll<HTMLElement>('[data-w]')];
    const put = () => bars.forEach((b) => (b.style.width = `${b.dataset.w}%`));
    if (growBars) {
      growBars = false;
      bars.forEach((b) => (b.style.width = '0%'));
      requestAnimationFrame(() => requestAnimationFrame(put));
      // le pourcentage monte en même temps que les barres
      const big = progress.querySelector<HTMLElement>('.p-pct');
      const txt = big?.firstChild;
      if (txt && pct > 0) {
        const t0 = performance.now();
        const tick = (now: number) => {
          const k = Math.min(1, (now - t0) / 800);
          const e = 1 - Math.pow(1 - k, 3);
          txt.textContent = fmtPct(pct * e).replace(/\u00a0%$/, '');
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

  function matches(e: CatalogEntry, mine: Map<string, PlayerCard>): boolean {
    const have = mine.get(e.id);
    if (filter === 'owned' && !have) return false;
    if (filter === 'missing' && have) return false;
    if (filter === 'dups' && (!have || have.count < 2)) return false;
    if (filter === 'fresh' && !fresh.has(e.id)) return false;
    if (star && e.rarity !== star) return false;
    if (query) {
      // un Bébou non possédé ne se trouve pas par son nom
      if (e.rarity === 'secret' && !have) return false;
      if (!folded(e).includes(query) && String(e.num) !== query.replace(/^0+/, '')) return false;
    }
    return true;
  }

  function render() {
    const mine = owned();
    if (!visibleThemes(mine).includes(theme)) theme = ALL_THEMES[0];
    renderTabs(mine);
    renderSubs(mine);
    // téléphone (onglets sur une ligne qui défile) : l'onglet choisi reste visible
    for (const row of [tabs, subs]) {
      const on = row.querySelector<HTMLElement>('.on');
      if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.clientWidth) / 2;
    }
    renderProgress(mine);
    // filtre « Nouvelles » : seulement s'il y a des cartes obtenues depuis la dernière visite (avec leur nombre)
    const fb = el.querySelector<HTMLButtonElement>('.f-fresh')!;
    fb.hidden = fresh.size === 0;
    fb.textContent = `Nouvelles (${fmtN(fresh.size)})`;
    if (filter === 'fresh' && !fresh.size) filter = 'all';
    el.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.f === filter));
    starf.hidden = !!theme.secret;
    starf.querySelectorAll<HTMLElement>('.chip').forEach((b) => b.classList.toggle('on', b.dataset.r === star));
    const list = scope().filter((e) => matches(e, mine));
    // nouvelle sélection (onglet, filtre, étoile, recherche) : la grille arrive en fondu court ; une simple mise à jour
    // de la collection (carte reçue…) ne fait pas bouger la grille
    const key = `${theme.id}|${subId}|${filter}|${star}|${query}`;
    if (key !== lastKey) {
      if (lastKey) {
        grid.classList.remove('swap');
        void grid.offsetWidth;
        grid.classList.add('swap');
        // on avait défilé loin dans l'ancienne liste (filtre changé depuis la barre collée) : retour au début de la grille
        const gridTop = grid.offsetTop - 150;
        if (el.scrollTop > gridTop + 40) el.scrollTo({ top: Math.max(0, gridTop) });
      }
      lastKey = key;
    }
    const tiles = (from: number, to: number) => {
      const frag = document.createDocumentFragment();
      for (let i = from; i < Math.min(to, list.length); i++) {
        const e = list[i];
        const have = mine.get(e.id);
        frag.append(cardTile(e.id, e.rarity, { owned: !!have, count: have?.count, fresh: fresh.has(e.id) }));
      }
      return frag;
    };
    // les ~100 premières tout de suite (l'écran est plein), le reste par paquets, image après image : un changement
    // de filtre sur 2 020 cartes ne fige plus la page
    const token = ++gridToken;
    const FIRST = 72, CHUNK = 72;
    grid.replaceChildren(tiles(0, FIRST));
    let next = FIRST;
    // la suite n'est ajoutée qu'en approchant du bas de la grille (un paquet par image) : à l'arrivée, la page ne
    // construit que ce qui se voit, au lieu de 2 000 tuiles d'un coup (c'est ce qui figeait la collection)
    sentinel.remove();
    growMore = () => {
      if (token !== gridToken || next >= list.length || !sentinel.isConnected) return;
      // assez près du bas (moins d'un écran et demi) : un paquet de plus, puis on revérifie à l'image suivante
      if (sentinel.getBoundingClientRect().top - el.getBoundingClientRect().bottom > el.clientHeight * 1.5) return;
      grid.append(tiles(next, next + CHUNK));
      next += CHUNK;
      if (next < list.length) {
        grid.append(sentinel);
        requestAnimationFrame(() => growMore());
      } else sentinel.remove();
    };
    if (next < list.length) {
      grid.append(sentinel);
      requestAnimationFrame(() => growMore());
    }
    const n = list.length;
    shownList = list;
    empty.hidden = n > 0;
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
                ? 'Pas de nouvelle carte dans cette sélection : regarde dans les autres onglets.'
              : 'Aucune carte ne correspond.');
  }

  /** cartes possédées de la grille affichée, dans l'ordre (pour passer de l'une à l'autre dans la visionneuse) */
  let browse: Array<{ id: string; r: RarityId }> = [];
  /** cartes de la grille affichée (même celles pas encore ajoutées au DOM) */
  let shownList: CatalogEntry[] = [];
  let at = -1;

  grid.addEventListener('click', (ev) => {
    // carte pas encore trouvée : on dit dans quel(s) booster(s) la chercher
    const miss = (ev.target as HTMLElement).closest<HTMLElement>('.tile.missing');
    if (miss) {
      const e = catalogEntry(miss.dataset.card ?? '');
      if (!e) return;
      if (e.rarity === 'secret') return toast(`Carte secrète : elle ne se cache que dans le ${BEBOU_PACK.label}.`, 'info');
      const t = themeById(e.themeId);
      return toast(`${e.name} (${rarity(e.rarity).rank + 1}★) : pas encore trouvée · dans le ${t ? `${t.label} Pack` : 'booster de son thème'} et le ${BEBOU_PACK.label}`, 'info');
    }
    const t = (ev.target as HTMLElement).closest<HTMLElement>('.tile.owned');
    if (!t) return;
    shell.requestGyro(); // iPhone : en première ligne du clic
    const mine = owned();
    browse = shownList.filter((e) => mine.has(e.id)).map((e) => ({ id: e.id, r: e.rarity as RarityId }));
    void openCard(browse.findIndex((b) => b.id === t.dataset.card && b.r === t.dataset.rarity));
  });

  async function openCard(i: number, dir: 0 | 1 | -1 = 0) {
    const b = browse[i];
    if (!b) return;
    at = i;
    const e = catalogEntry(b.id);
    const have = owned().get(b.id);
    const st = e ? subthemeById(e.subthemeId) : null;
    if (!open) {
      document.body.classList.add('card-open');
      pushLayer(closeViewer); // « retour » du téléphone = fermer la carte
      requestAnimationFrame(() => viewerUi.querySelector<HTMLElement>('.close')?.focus({ preventScroll: true }));
    }
    open = true;
    el.classList.add('viewing');
    viewerUi.hidden = false;
    vInfo.className = `v-info r-${b.r}${dir ? ' swap' : ''}`;
    vInfo.style.setProperty('--ra', rarity(b.r).accentHex);
    vInfo.innerHTML = `<div class="ci-name">${esc(e?.name ?? b.id)}</div><div class="ci-meta">${starsHtml(b.r)} <span class="ci-r" style="color:${rarity(b.r).accentHex}">${rarity(b.r).label}</span></div>
      <div class="ci-sub">${st ? `${esc(st.label)} ${String(e!.num).padStart(3, '0')}/${st.cards.length} · ` : ''}${have ? `${plural(have.count, 'exemplaire')} (${have.count > 1 ? 'meilleur : ' : ''}n°${fmtN(have.bestMintNumber)}\u00a0imprimé)` : ''}</div>`;
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= browse.length - 1;
    // à la souris, on rappelle le clavier pour feuilleter
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
    shell.show(null);
    shell.setDimmed(true);
    // on retrouve dans la grille la carte qu'on regardait en dernier
    const b = browse[at];
    const tile = b && grid.querySelector<HTMLElement>(`.tile.owned[data-card="${CSS.escape(b.id)}"][data-rarity="${b.r}"]`);
    tile?.scrollIntoView({ block: 'nearest' });
    // clavier : on reprend là où on était
    if (tile && document.activeElement?.closest('.viewer-ui')) tile.focus({ preventScroll: true });
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
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // onglet fermé pendant qu'on regarde la collection : ce qu'on a vu est vu
  window.addEventListener('pagehide', () => el.isConnected && saveSeen());
  let sig = '';
  backend.onChange((st) => {
    const now = collectionSig(st);
    if (now === sig) return;
    sig = now;
    if (el.isConnected && !open) render();
  });

  return {
    el,
    enter(sub) {
      if (sub && sub !== 'nouvelles') {
        const st = subthemeById(sub);
        theme = ALL_THEMES.find((t) => t.id === (st?.themeId ?? sub)) ?? theme;
        subId = st && st.themeId !== 'bebous' ? st.id : null;
      }
      shell.show(null);
      shell.setDimmed(true);
      const mine = owned();
      const seen = loadSeen();
      fresh = seen ? new Set([...mine.keys()].filter((id) => !seen.has(id))) : new Set();
      if (!seen) saveSeen();
      // « Ma collection » depuis le récap d'ouverture (#/collection/nouvelles) : directement les cartes du tirage
      if (sub === 'nouvelles' && fresh.size) {
        saveSeen(); // montrées = vues (l'onglet disparaît dès qu'on change de filtre)
        const first = catalogEntry([...fresh][0]);
        theme = ALL_THEMES.find((t) => t.id === first?.themeId) ?? theme;
        subId = null;
        star = null;
        query = '';
        search.value = '';
        filter = 'fresh';
        history.replaceState(null, '', '#/collection');
      }
      preloadOwned(mine.keys());
      // le début de la sélection en tâche de fond (le reste se charge en défilant : pas 2 000 images d'un coup sur la 4G)
      preloadThumbs(scope().slice(0, 150));
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
