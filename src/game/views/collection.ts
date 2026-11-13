import { collectionSig, lockedCards, type Binder, type GameBackend, type PlayerCard } from '../backend';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { ALL_THEMES, BEBOU_PACK, SUBTHEMES, catalogEntry, numberingSize, subthemeById, subthemeViews, themeById, type CatalogEntry, type SubTheme, type SubthemeView, type ThemeInfo } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { SEEN_KEY, cardTile, errMsg, esc, fmtN, fmtPct, fold, fr, h, imageReportButton, loadSeen, loginPrompt, plural, popLayer, pushLayer, starsHtml, thumbUrl, toast } from '../ui';
import { gestureButtons, panelStrip, showCardPanel } from './cardPanel';
import { cardQuery, type CardQuery } from '../../core/cardSearch';
import { preloadOwned, preloadThumbs } from '../preload';
import { haptics } from '../../core/haptics';
import { reducedMotion, DUR, EASING } from '../../core/motion';
import { createForge, forgeCount } from './forge';
import { GAMES_OPEN } from '../../core/games';

/**
 * COLLECTION (refonte, retours du 3 nov. + retours live n°1)
 *  - Bascule en haut : CARTES (vue par défaut : toutes mes cartes, les plus rares en haut ; tri rareté / date /
 *    A→Z / par album, filtres étoile + thème + recherche) · ALBUMS · CLASSEURS.
 *  - Vue Albums : onglets des 4 thèmes + Les Bébous.
 *  - Un thème s'ouvre sur sa vue ALBUMS : mosaïque de pochettes de sous-thèmes (visuel + nom + barre de progression),
 *    recherche, tri (complétion / groupe / alphabétique) — ça tient 400+ sous-thèmes. Pochette hybride : la carte
 *    épinglée à la main (« Définir comme pochette »), sinon la meilleure carte possédée, sinon l'icône du sous-thème.
 *  - Un album s'ouvre sur sa GRILLE : pagination classique (60 cartes/page), tri (récentes / étoiles / numéro),
 *    filtres persistants (possédées, manquantes, doublons, étoile, recherche), « + Envie » sur les manquantes.
 *  - En-tête : complétion (uniques, %, doublons) du thème ou de l'album.
 *  - Carte focus (visionneuse 3D) : + Envie, + Classeur, Proposer en échange, Définir comme pochette, date d'obtention.
 *  - CLASSEURS perso : nommés librement, une carte dans plusieurs, couverture, ordre manuel (glisser-déposer),
 *    un classeur épinglé sur le profil.
 *  - FORGE (retours live 02 : sortie de l'espace Jeux) : onglet à côté de « Classeurs », avec le nombre de doublons
 *    brûlables ; #/collection/forge (views/forge.ts).
 */
export interface CollectionView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

type Filter = 'all' | 'owned' | 'missing' | 'dups' | 'fresh';
type Sort = 'num' | 'stars' | 'recent';
/** « En cours » (défaut, audit UX3-04) : les albums commencés d'abord, puis complets, puis à 0 % */
type AlbumSort = 'progress' | 'completion' | 'group' | 'alpha';
type Mode = 'cards' | 'albums' | 'grid' | 'binders' | 'binder' | 'forge';
/** vue Cartes : tri (retours live n°1) */
type CardSort = 'rarity' | 'date' | 'alpha' | 'album';
const STAR_ORDER: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
const PAGE = 60;
/** plafonds des classeurs : les mêmes que le serveur (convex/binders.ts : BINDER_MAX, BINDER_CARDS_MAX, cleanName) */
const BINDER_MAX = 30;
const BINDER_CARDS_MAX = 500;
const BINDER_NAME_MAX = 32;
const PREFS = 'bebou.coll.v2';
/** libellés des filtres (bandeau « Filtres actifs » et états vides composés, audit UX3-02) */
const FILTER_LABEL: Record<Filter, string> = { all: 'Toutes', owned: 'Possédées', missing: 'Manquantes', dups: 'Doublons', fresh: 'Nouvelles' };
/** pose l'état « actif » d'un bouton de filtre / segment : visuel (.on) + lecteur d'écran (aria-pressed), audit UX5-16 */
/**
 * Couleur de TEXTE d'une rareté (puces, progression) : Rare et Épique sont trop sombres en texte sur fond sombre
 * (3,2:1 pour Épique) → une variante plus claire ≥ 4,5:1, sans toucher la teinte des cartes 3D (audit UX5-09).
 */
const RC_TEXT: Partial<Record<RarityId, string>> = { rare: '#6f9be0', epic: '#e0607a' };
const rcText = (r: RarityId) => RC_TEXT[r] ?? rarity(r).hex;
const setOn = (b: HTMLElement, on: boolean) => {
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
};

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
  let mode: Mode = 'cards';
  /** vue Cartes (toutes mes cartes) : tri, filtres étoile / thème / recherche */
  let cSort: CardSort = 'rarity';
  let cStar: RarityId | null = null;
  let cTheme = '';
  let cQuery = '';
  /** album (sous-thème) ouvert */
  let subId: string | null = null;
  /**
   * (retours 05/11) FAMILLE ouverte (id de groupe : « pokemon », « jeux-video », « anime »…) : la vue Albums d'un thème
   * montre d'abord ses familles (Pokémon, Valorant, Jeux vidéo…), une famille ses sous-familles (les 9 régions), un
   * album ses cartes. null = niveau des familles.
   */
  let famId: string | null = null;
  /** classeur ouvert */
  let binderId: string | null = null;
  let binderEdit = false;
  let filter: Filter = 'all';
  let star: RarityId | null = null;
  let sort: Sort = 'num';
  let albumSort: AlbumSort = 'progress';
  let query = '';
  let albumQuery = '';
  let page = 0;
  let open = false;
  let growBars = false;
  // préférences persistantes (filtres, tris)
  try {
    // (`albumSort2` : l'ancien `albumSort` valait presque toujours « completion », enregistré par défaut ; on repart sur « En cours »)
    const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<{ filter: Filter; star: RarityId | null; sort: Sort; albumSort2: AlbumSort }>;
    if (p.filter && p.filter !== 'fresh') filter = p.filter;
    if (p.star && STAR_ORDER.includes(p.star)) star = p.star;
    if (p.sort) sort = p.sort;
    if (p.albumSort2 && ['progress', 'completion', 'group', 'alpha'].includes(p.albumSort2)) albumSort = p.albumSort2;
  } catch {
    /* ignore */
  }
  const savePrefs = () => {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ filter: filter === 'fresh' ? 'all' : filter, star, sort, albumSort2: albumSort }));
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
      <div class="coll-switch"><div class="seg coll-views" role="tablist" aria-label="Vue de la collection"><button role="tab" data-v="cards">Cartes</button><button role="tab" data-v="albums">Albums</button><button role="tab" data-v="binders">Classeurs</button><button role="tab" data-v="forge">Forge</button><button role="tab" data-v="contrats">Contrats</button></div></div>
      <div class="tabs"></div>
      <div class="crumb" hidden><button class="crumb-back">‹ Albums</button><span class="crumb-name"></span></div>
      <div class="progress"></div>
    </div>
    <div class="albums" hidden>
      <div class="al-bar">
        <input class="search al-search" type="search" placeholder="Chercher un album…" autocomplete="off" spellcheck="false" aria-label="Chercher un album">
        <div class="seg al-sort" aria-label="Tri des albums"><button data-s="progress">En cours</button><button data-s="completion">Complétion</button><button data-s="group">Par groupe</button><button data-s="alpha">A → Z</button></div>
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
      <input class="search" type="search" placeholder="Nom ou n° (ex. 25)" enterkeyhint="search" autocomplete="off" spellcheck="false" aria-label="Rechercher une carte (nom ou numéro)" />
    </div>
    <div class="cards-bar" hidden>
      <div class="seg cb-theme" aria-label="Thème"></div>
      <div class="starf cb-stars"></div>
      <div class="seg cb-sort" aria-label="Tri"><button data-s="rarity">Rareté</button><button data-s="date">Date</button><button data-s="alpha">A → Z</button><button data-s="album">Par album</button></div>
      <input class="search cb-search" type="search" placeholder="Nom, album ou n° (toutes les cartes)" autocomplete="off" spellcheck="false" aria-label="Rechercher une carte (nom, album ou numéro), possédée ou non">
    </div>
    <div class="f-active" role="status" hidden></div>
    <div class="binders-view" hidden></div>
    <div class="forge-host" hidden></div>
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
  // la recherche de la GRILLE (le premier `.search` du DOM est celui des albums : audit UX3-01)
  const search = q<HTMLInputElement>('.filters .search');
  const bindersView = q('.binders-view');
  const forgeHost = q('.forge-host');
  const forge = createForge(backend, shell);
  forgeHost.append(forge.el);
  const viewerUi = q('.viewer-ui');
  const vInfo = q('.v-info');
  const vActions = q('.v-actions');
  const binderPick = q('.binder-pick');
  const headEl = q('.coll-head');
  const toTopBtn = q<HTMLButtonElement>('.to-top');
  const fActive = q('.f-active');

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
    b.setAttribute('aria-label', `${rarity(r).rank + 1} étoiles (${rarity(r).label})`);
    b.style.setProperty('--rc', rarity(r).hex);
    b.style.setProperty('--rt', rcText(r));
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
    if (e.key !== '/' || !el.isConnected || open || mode === 'forge' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    e.preventDefault();
    const inp = mode === 'albums' ? alSearch : mode === 'cards' ? q<HTMLInputElement>('.cb-search') : search;
    inp.focus();
    inp.select();
  });
  // un minuteur par champ (partagé, les deux écouteurs s'annulaient l'un l'autre)
  let qTimer = 0;
  let aTimer = 0;
  search.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = window.setTimeout(() => {
      query = fold(search.value.trim());
      page = 0;
      render();
    }, 120);
  });
  alSearch.addEventListener('input', () => {
    clearTimeout(aTimer);
    aTimer = window.setTimeout(() => {
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
    // niveau d'une famille → les familles du thème ; un album → sa famille (famId déjà posé) ou les familles
    if (mode === 'albums') famId = null;
    else if (!(subId && subthemeById(subId)?.group)) famId = null;
    goAlbums();
  });

  /**
   * Segments qui débordent (thèmes de la vue Cartes à 360 px…) : l'élément actif est centré et un fondu au bord droit
   * dit qu'on peut faire défiler (audit UX3-12).
   */
  const segRows = [...el.querySelectorAll<HTMLElement>('.seg:not(.coll-views)')];
  const markOvf = (row: HTMLElement) => row.classList.toggle('ovf', row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
  function fitRows() {
    for (const row of segRows) {
      if (!row.offsetParent) continue; // masqué
      const on = row.querySelector<HTMLElement>('.on');
      if (on && row.scrollWidth > row.clientWidth) {
        const r = row.getBoundingClientRect(), o = on.getBoundingClientRect();
        row.scrollLeft += o.left - r.left - (r.width - o.width) / 2;
      }
      markOvf(row);
    }
  }
  for (const row of segRows) row.addEventListener('scroll', () => markOvf(row), { passive: true });

  // ── bascule Cartes / Albums / Classeurs + barre de la vue Cartes
  const cardsBar = q('.cards-bar');
  el.querySelectorAll<HTMLButtonElement>('.coll-views button').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.v!;
      if (v === 'cards') goCards();
      else if (v === 'albums') {
        if (theme.secret) theme = ALL_THEMES[0];
        goAlbums();
      } else if (v === 'forge') goForge();
      // (retours live 6, C8) les Contrats : leur page, sous l'onglet Collection
      else if (v === 'contrats') return void (location.hash = '#/collection/contrats');
      else goBinders();
      shell.sfx.tick(1.2, 0.04);
    }),
  );
  {
    const tb = q('.cb-theme');
    for (const [id, label] of [['', 'Tout'], ...ALL_THEMES.filter((t) => t.cards.length).map((t) => [t.id, t.label])] as Array<[string, string]>) {
      const b = h('button', '', esc(label));
      b.dataset.t = id;
      b.addEventListener('click', () => ((cTheme = id), (page = 0), render()));
      tb.append(b);
    }
    const sb = q('.cb-stars');
    for (const r of [...STAR_ORDER, 'secret'] as RarityId[]) {
      const b = h('button', 'chip', r === 'secret' ? '✷' : `${rarity(r).rank + 1}★`);
      b.title = rarity(r).label;
      b.setAttribute('aria-label', r === 'secret' ? 'Secrètes (Bébous)' : `${rarity(r).rank + 1} étoiles (${rarity(r).label})`);
      b.style.setProperty('--rc', rarity(r).hex);
      b.style.setProperty('--rt', rcText(r));
      b.dataset.r = r;
      b.addEventListener('click', () => ((cStar = cStar === r ? null : r), (page = 0), render()));
      sb.append(b);
    }
    el.querySelectorAll<HTMLButtonElement>('.cb-sort button').forEach((b) => b.addEventListener('click', () => ((cSort = b.dataset.s as CardSort), (page = 0), render())));
    const inp = q<HTMLInputElement>('.cb-search');
    let t = 0;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      t = window.setTimeout(() => ((cQuery = fold(inp.value.trim())), (page = 0), render()), 120);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (inp.value) ((inp.value = ''), inp.dispatchEvent(new Event('input')));
      else inp.blur();
    });
  }
  const THEME_ORDER = new Map(ALL_THEMES.map((t, i) => [t.id, i]));

  /** en ligne sans session prête (connexion en cours, ou pas connecté) : on n'affiche pas « collection vide » */
  const signedOut = () => backend.state.mode === 'online' && (!backend.state.ready || !backend.state.user);
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.login-cta')) backend.login();
  });
  // ── données
  /** id → ligne de collection (une carte a une seule rareté : celle de son thème) */
  // (audit 12/11, S10 / A4-09) refaite seulement quand la collection change (nouveau tableau) : elle était reconstruite
  // à chaque rendu, clic de tuile et ouverture de carte
  let ownedFor: readonly PlayerCard[] | null = null;
  let ownedMap = new Map<string, PlayerCard>();
  function owned(): Map<string, PlayerCard> {
    if (ownedFor === backend.state.collection) return ownedMap;
    const m = new Map<string, PlayerCard>();
    ownedFor = backend.state.collection;
    ownedMap = m;
    for (const c of backend.state.collection) {
      const prev = m.get(c.cardId);
      if (prev) m.set(c.cardId, { ...prev, count: prev.count + c.count, firstPulledAt: Math.min(prev.firstPulledAt ?? Infinity, c.firstPulledAt ?? Infinity) });
      else m.set(c.cardId, c);
    }
    return m;
  }
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
  function goCards() {
    mode = 'cards';
    subId = null;
    page = 0;
    render();
    toTop();
  }
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
  /** la forge suit l'ouverture de l'espace Jeux (GAMES_OPEN) : admins (et démo) seulement d'ici là, comme avant */
  const forgeOpen = () => GAMES_OPEN || !!backend.eco.snapshot?.isAdmin;
  function goForge() {
    if (!forgeOpen()) return goCards();
    mode = 'forge';
    subId = null;
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
        famId = null;
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
    tabs.hidden = !(mode === 'albums' || mode === 'grid');
    const v = mode === 'cards' ? 'cards' : mode === 'forge' ? 'forge' : mode === 'binders' || mode === 'binder' ? 'binders' : 'albums';
    const nForge = forgeCount(backend.state);
    el.querySelectorAll<HTMLButtonElement>('.coll-views button').forEach((b) => {
      b.classList.toggle('on', b.dataset.v === v);
      b.setAttribute('aria-selected', String(b.dataset.v === v));
      if (b.dataset.v === 'binders') b.innerHTML = `Classeurs${backend.state.binders.length ? ` <em>${fmtN(backend.state.binders.length)}</em>` : ''}`;
      // compteur de doublons brûlables (1 exemplaire gardé, secrètes et exemplaires engagés exclus)
      if (b.dataset.v === 'forge') {
        b.hidden = !forgeOpen();
        b.innerHTML = `Forge${nForge ? ` <em>${fmtN(nForge)}</em>` : ''}`;
        b.setAttribute('aria-label', nForge ? `Forge : ${fmtN(nForge)} doublon${nForge > 1 ? 's' : ''} brûlable${nForge > 1 ? 's' : ''}` : 'Forge');
      }
    });
  }

  function renderProgress(mine: Map<string, PlayerCard>) {
    if (mode === 'binders' || mode === 'binder' || mode === 'forge') {
      progress.hidden = true;
      return;
    }
    progress.hidden = false;
    const inCards = mode === 'cards';
    const ct = inCards && cTheme ? ALL_THEMES.find((t) => t.id === cTheme) : null;
    const cards = inCards ? (ct ? ct.cards : ALL_THEMES.filter((t) => !t.secret).flatMap((t) => t.cards)) : scope();
    const st = !inCards && subId ? subthemeById(subId) : null;
    const label = inCards ? (ct ? ct.label : 'au total') : st ? st.label : theme.label;
    const total = cards.length;
    const have = cards.filter((c) => mine.has(c.id)).length;
    const dups = cards.reduce((a, c) => a + Math.max(0, (mine.get(c.id)?.count ?? 0) - 1), 0);
    const pct = total ? (have / total) * 100 : 0;
    const per = (inCards ? ct?.secret : theme.secret)
      ? ''
      : STAR_ORDER.map((r) => {
          const cs = cards.filter((c) => c.rarity === r);
          const n = cs.filter((c) => mine.has(c.id)).length;
          const full = cs.length > 0 && n === cs.length;
          return `<div class="ps${full ? ' done' : ''}" style="--rc:${rarity(r).hex};--rt:${rcText(r)}" title="${rarity(r).label}${full ? ' · toutes trouvées !' : ''}"><b>${rarity(r).rank + 1}★</b><span class="bar"><i data-w="${cs.length ? (n / cs.length) * 100 : 0}"></i></span><em>${fmtN(n)}/${fmtN(cs.length)}${full ? ' ✓' : ''}</em></div>`;
        }).join('');
    const albumsN = inCards || subId ? 0 : theme.subthemes.filter((s) => s.cards.length).length;
    progress.innerHTML = `
      <div class="p-main"><div class="p-pct${total && have === total ? ' full' : ''}">${fmtPct(pct).replace(/ %$/, '')}<small> %</small></div>
        <div class="p-txt"><b>${fmtN(have)}</b> / ${fmtN(total)} cartes uniques ${esc(label)}${albumsN ? ` · ${plural(albumsN, 'album')}` : ''}<br><span>${mine.size === 0 && signedOut() ? (backend.state.ready ? 'pas connecté' : 'connexion au serveur…') : mine.size === 0 ? 'ta collection est vide : <a class="p-link" href="#/">ouvre ton premier booster</a>' : dups ? `${plural(dups, 'doublon')} · <a class="p-link" href="#/contrats">à brûler en contrat</a> ou à échanger` : total && have === total ? 'sélection complète !' : 'pas encore de doublon'}</span></div></div>
      <div class="p-bar"><i data-w="${pct}"></i></div>
      <div class="p-stars">${per}</div>`;
    const bars = [...progress.querySelectorAll<HTMLElement>('[data-w]')];
    // la largeur est posée d'un coup ; l'entrée (scaleX composité, `bar-in` dans style.css) ne rejoue qu'à l'arrivée
    bars.forEach((b) => {
      b.style.width = `${b.dataset.w}%`;
      if (!growBars) b.style.animation = 'none';
    });
    if (growBars) {
      growBars = false;
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
    }
  }

  // ── vue ALBUMS
  // Rendu par lots (48 pochettes, la suite au défilement), un seul écouteur délégué, stats et pochettes mémorisées par
  // état de la collection, et pas de reconstruction si rien n'a changé (audit PERF2-09 / UX3-19). En « Par groupe »,
  // chaque groupe est repliable et n'est construit qu'à l'ouverture.
  const ALBUM_BATCH = 48;
  let albumKey = '';
  let albumMemoSig = '';
  let coverMemoSig = '';
  const statMemo = new Map<string, { have: number; total: number; pct: number }>();
  const coverMemo = new Map<string, { entry: CatalogEntry; manual: boolean } | null>();
  /** groupes ouverts (mode « Par groupe »), par thème ; null = pas encore choisi (le 1er groupe commencé s'ouvre) */
  const openGroups = new Map<string, Set<string>>();
  let albumIo: IntersectionObserver | null = null;
  const albumStat = (s: SubTheme, mine: Map<string, PlayerCard>) => {
    let st = statMemo.get(s.id);
    if (!st) {
      let have = 0;
      for (const c of s.cards) if (mine.has(c.id)) have++;
      statMemo.set(s.id, (st = { have, total: s.cards.length, pct: s.cards.length ? have / s.cards.length : -1 }));
    }
    return st;
  };
  const albumCover = (s: SubTheme, mine: Map<string, PlayerCard>) => {
    if (!coverMemo.has(s.id)) coverMemo.set(s.id, coverOf(s, mine));
    return coverMemo.get(s.id)!;
  };
  function albumTile(s: SubTheme, mine: Map<string, PlayerCard>, showGrp: boolean): HTMLElement {
    const st = albumStat(s, mine);
    const soon = !s.cards.length;
    const cover = soon ? null : albumCover(s, mine);
    const a = h('button', `album${soon ? ' soon' : ''}${st.total && st.have === st.total ? ' full' : ''}`);
    a.dataset.sub = s.id;
    a.style.setProperty('--h', String(hueOf(s.id)));
    a.innerHTML = `
        <span class="al-cover">${cover ? `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(cover.entry)}">` : `<span class="al-ph">${esc((s.code || s.label).slice(0, 3).toUpperCase())}</span>`}${cover?.manual ? '<span class="al-pin" title="Couverture choisie par toi">📌</span>' : ''}${soon ? '<span class="al-soon">BIENTÔT</span>' : ''}</span>
        <span class="al-name">${esc(s.label)}</span>
        ${s.group && showGrp ? `<span class="al-grp">${esc(s.group.label)}</span>` : ''}
        <span class="al-n">${soon ? 'en préparation' : `${fmtN(st.have)} / ${fmtN(st.total)}`}</span>
        <span class="al-bar"><i style="width:${Math.max(0, st.pct) * 100}%"></i></span>`;
    a.disabled = soon;
    a.title = soon ? `${s.label} · bientôt` : `${s.label} · ${fmtN(st.have)} / ${fmtN(st.total)} cartes`;
    return a;
  }
  /** remplit `box` avec `list`, par lots : les suivants arrivent quand la sentinelle approche de l'écran */
  function fillAlbums(box: HTMLElement, list: SubTheme[], mine: Map<string, PlayerCard>, showGrp: boolean) {
    let n = 0;
    const more = () => {
      box.querySelector(':scope > .al-more')?.remove();
      const frag = document.createDocumentFragment();
      for (const s of list.slice(n, n + ALBUM_BATCH)) frag.append(albumTile(s, mine, showGrp));
      n += ALBUM_BATCH;
      box.append(frag);
      if (n < list.length) {
        const sentinel = h('div', 'al-more');
        (sentinel as HTMLElement & { _more?: () => void })._more = more;
        box.append(sentinel);
        albumIo ??= new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              albumIo!.unobserve(en.target);
              (en.target as HTMLElement & { _more?: () => void })._more?.();
            }
          },
          { root: el, rootMargin: '900px 0px' },
        );
        albumIo.observe(sentinel);
      }
    };
    more();
  }
  alGrid.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLButtonElement>('.album');
    if (!a || a.disabled) return;
    if (a.dataset.fam) {
      famId = a.dataset.fam;
      shell.sfx.tick(1.2, 0.04);
      render();
      toTop();
    } else if (a.dataset.sub) goGrid(a.dataset.sub);
  });
  /** Tuile d'une FAMILLE (groupe d'albums) : la meilleure carte de la famille, ses sous-familles, sa progression. */
  function familyTile(v: SubthemeView, mine: Map<string, PlayerCard>): HTMLElement {
    let have = 0, total = 0;
    let cover: { entry: CatalogEntry; manual: boolean } | null = null;
    for (const s of v.subs) {
      const st = albumStat(s, mine);
      have += st.have;
      total += st.total;
      const c = albumCover(s, mine);
      if (c && (!cover || (c.manual && !cover.manual) || (c.manual === cover.manual && RANK[c.entry.rarity] > RANK[cover.entry.rarity]))) cover = c;
    }
    const gid = v.id.slice(6);
    const unit = v.subs[0]?.group?.unit ?? 'albums';
    const live = v.subs.filter((s) => s.cards.length).length;
    const a = h('button', `album fam${total && have === total ? ' full' : ''}`);
    a.dataset.fam = gid;
    a.style.setProperty('--h', String(hueOf(gid)));
    a.innerHTML = `
        <span class="al-cover">${cover ? `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(cover.entry)}">` : `<span class="al-ph">${esc(v.label.slice(0, 3).toUpperCase())}</span>`}<span class="al-fam-n">${fmtN(live)} ${esc(unit)}</span></span>
        <span class="al-name">${esc(v.label)}</span>
        <span class="al-n">${fmtN(have)} / ${fmtN(total)}<em class="al-fam-u"> · ${fmtN(live)} ${esc(unit)}</em></span>
        <span class="al-bar"><i style="width:${total ? (have / total) * 100 : 0}%"></i></span>`;
    a.title = `${v.label} · ${live} ${unit} · ${fmtN(have)} / ${fmtN(total)} cartes`;
    return a;
  }
  function renderAlbums(mine: Map<string, PlayerCard>) {
    el.querySelectorAll<HTMLButtonElement>('.al-sort button').forEach((b) => setOn(b, b.dataset.s === albumSort));
    const sig = collectionSig(backend.state);
    const cSig = JSON.stringify(backend.state.covers);
    if (sig !== albumMemoSig) ((albumMemoSig = sig), statMemo.clear(), coverMemo.clear());
    if (cSig !== coverMemoSig) ((coverMemoSig = cSig), coverMemo.clear());
    const opened = openGroups.get(theme.id);
    const key = `${theme.id}|${famId ?? '*'}|${albumSort}|${albumQuery}|${sig}|${cSig}|${opened ? [...opened].join(',') : '-'}`;
    // rien n'a changé (une envie, un retour de la visionneuse…) : on garde la mosaïque telle quelle
    if (key === albumKey && alGrid.childElementCount) return;
    albumKey = key;
    // (retours 05/11) sans recherche ni famille ouverte : le niveau des FAMILLES (les sous-thèmes sans groupe restent
    // des albums à part entière, mêlés aux familles)
    el.querySelector<HTMLElement>('.al-sort [data-s="group"]')!.hidden = !albumQuery;
    if (!albumQuery && !famId) {
      const views = subthemeViews(theme).filter((v) => v.cards.length || !v.group);
      const stv = (v: SubthemeView) => {
        let have = 0, total = 0;
        for (const s of v.subs) {
          const x = albumStat(s, mine);
          have += x.have;
          total += x.total;
        }
        return { have, total, pct: total ? have / total : -1 };
      };
      const stage = (v: SubthemeView) => {
        const x = stv(v);
        return !x.total ? 3 : x.have === 0 ? 2 : x.have === x.total ? 1 : 0;
      };
      const sorted = albumSort === 'alpha' || albumSort === 'group' ? [...views].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
        : albumSort === 'completion' ? [...views].sort((a, b) => stv(b).pct - stv(a).pct || stv(b).have - stv(a).have)
        : [...views].sort((a, b) => stage(a) - stage(b) || stv(b).have - stv(a).have || 0);
      q('.al-count').textContent = plural(views.length, 'famille');
      albumIo?.disconnect();
      alGrid.replaceChildren();
      alGrid.classList.remove('grouped');
      const frag = document.createDocumentFragment();
      for (const v of sorted) frag.append(v.group ? familyTile(v, mine) : albumTile(v.subs[0], mine, false));
      alGrid.append(frag);
      return;
    }
    let subs = theme.subthemes.filter((s) => (albumQuery ? true : s.group?.id === famId) && (!albumQuery || fold(s.label).includes(albumQuery) || (s.group && fold(s.group.label).includes(albumQuery))));
    const st = (s: SubTheme) => albumStat(s, mine);
    const grpLabel = (s: SubTheme) => s.group?.label ?? '';
    // « En cours » : commencés (le plus de cartes d'abord), puis complets (les gros d'abord), puis à 0 %, puis « bientôt »
    const stage = (s: SubTheme) => {
      const x = st(s);
      return !x.total ? 3 : x.have === 0 ? 2 : x.have === x.total ? 1 : 0;
    };
    if (albumSort === 'progress') subs = [...subs].sort((a, b) => stage(a) - stage(b) || (stage(a) === 0 ? st(b).have - st(a).have || st(b).pct - st(a).pct : stage(a) === 1 ? st(b).total - st(a).total : 0) || a.label.localeCompare(b.label, 'fr'));
    else if (albumSort === 'completion') subs = [...subs].sort((a, b) => st(b).pct - st(a).pct || st(b).have - st(a).have || a.label.localeCompare(b.label, 'fr'));
    else if (albumSort === 'alpha') subs = [...subs].sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    else subs = [...subs].sort((a, b) => grpLabel(a).localeCompare(grpLabel(b), 'fr') || a.label.localeCompare(b.label, 'fr'));
    q('.al-count').textContent = `${plural(subs.filter((s) => s.cards.length).length, 'album')}`;
    albumIo?.disconnect();
    alGrid.replaceChildren();
    alGrid.classList.toggle('grouped', albumSort === 'group');
    if (!subs.length) {
      alGrid.append(h('div', 'empty', albumQuery ? `Aucun album ne correspond à « ${esc(alSearch.value.trim())} ».` : 'Aucun album.'));
      return;
    }
    // le nom du groupe sur chaque pochette n'aide que s'il y a plusieurs groupes à l'écran
    const showGrp = albumSort !== 'group' && new Set(subs.map(grpLabel)).size > 2;
    if (albumSort !== 'group') return fillAlbums(alGrid, subs, mine, showGrp);
    // « Par groupe » : un bloc repliable par groupe, construit à l'ouverture
    const groups = new Map<string, SubTheme[]>();
    for (const s of subs) {
      const g = grpLabel(s) || 'Sous-thèmes';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(s);
    }
    let openSet = opened;
    if (!openSet) {
      const first = [...groups].find(([, l]) => l.some((s) => st(s).have > 0))?.[0] ?? [...groups.keys()][0];
      openSet = new Set(groups.size <= 2 ? groups.keys() : [first]);
      openGroups.set(theme.id, openSet);
      albumKey = `${theme.id}|${albumSort}|${albumQuery}|${sig}|${cSig}|${[...openSet].join(',')}`;
    }
    for (const [g, list] of groups) {
      const have = list.reduce((n, s) => n + st(s).have, 0);
      const total = list.reduce((n, s) => n + st(s).total, 0);
      const started = list.filter((s) => st(s).have > 0).length;
      const d = document.createElement('details');
      d.className = 'al-sec';
      // une recherche ouvre tous les groupes trouvés
      d.open = !!albumQuery || openSet.has(g);
      d.innerHTML = `<summary><b>${esc(g)}</b><span>${fmtN(started)}/${plural(list.length, 'album')} commencé${started > 1 ? 's' : ''} · ${fmtN(have)}/${fmtN(total)} cartes · ${fmtPct(total ? (have / total) * 100 : 0)}</span></summary>`;
      const inner = h('div', 'al-grid al-inner');
      d.append(inner);
      const build = () => {
        if (!inner.childElementCount) fillAlbums(inner, list, mine, false);
      };
      if (d.open) build();
      d.addEventListener('toggle', () => {
        if (d.open) (openSet!.add(g), build());
        else openSet!.delete(g);
        albumKey = `${theme.id}|${albumSort}|${albumQuery}|${sig}|${cSig}|${[...openSet!].join(',')}`;
      });
      alGrid.append(d);
    }
  }

  // ── GRILLE
  let cqKey: string | null = null;
  let cq: CardQuery = cardQuery('');
  const queryOf = (s: string) => (cqKey === s ? cq : ((cqKey = s), (cq = cardQuery(s))));
  function matches(e: CatalogEntry, mine: Map<string, PlayerCard>): boolean {
    const have = mine.get(e.id);
    if (filter === 'owned' && !have) return false;
    if (filter === 'missing' && have) return false;
    if (filter === 'dups' && (!have || have.count < 2)) return false;
    if (filter === 'fresh' && !fresh.has(e.id)) return false;
    if (star && e.rarity !== star) return false;
    if (query) {
      if (e.rarity === 'secret' && !have) return false;
      if (!queryOf(query).test(e)) return false;
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
    grid.classList.remove('by-album');
    const fb = q<HTMLButtonElement>('.f-fresh');
    fb.hidden = fresh.size === 0;
    fb.textContent = `Nouvelles (${fmtN(fresh.size)})`;
    if (filter === 'fresh' && !fresh.size) filter = 'all';
    el.querySelectorAll<HTMLButtonElement>('.filters .seg:not(.sortf) button').forEach((b) => setOn(b, b.dataset.f === filter));
    el.querySelectorAll<HTMLButtonElement>('.sortf button').forEach((b) => setOn(b, b.dataset.s === sort));
    starf.hidden = !!theme.secret;
    starf.querySelectorAll<HTMLElement>('.chip').forEach((b) => setOn(b, b.dataset.r === star));
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
    preloadThumbs(list.slice(page * PAGE, (page + 1) * PAGE), true); // la page affichée passe devant (PERF2-04)
    renderPager(pages, list.length);
    const active = activeFilters();
    renderActive(active);
    empty.hidden = list.length > 0;
    // état vide JUSTE quand plusieurs filtres se cumulent (« Manquantes + 5★ » ≠ « tu les as toutes »), audit UX3-02
    const alone = active.length === 1;
    empty.innerHTML = fr(!theme.cards.length
      ? `Ce thème arrive bientôt : ${esc(theme.subthemes.map((s) => s.label).join(', '))}.`
      : alone && filter === 'dups'
        ? 'Pas encore de doublon ici : ils arrivent vite en ouvrant des boosters.'
        : alone && filter === 'owned'
          ? 'Aucune carte ici pour l’instant. <a href="#/">Ouvre un booster</a> !'
          : alone && filter === 'missing'
            ? 'Tu les as toutes. Chapeau.'
            : alone && filter === 'fresh'
              ? 'Pas de nouvelle carte dans cette sélection : regarde dans les autres albums.'
              : active.length
                ? `Aucune carte pour ${esc(active.join(' + '))}.`
                : 'Aucune carte ici.') + (active.length && theme.cards.length ? ' <button class="btn-ghost f-reset">Réinitialiser les filtres</button>' : '');
  }
  /** filtres actifs (différents du défaut) de la vue courante, en clair : « Manquantes », « 5★ », « « pika » » */
  function activeFilters(): string[] {
    const starL = (r: RarityId | null) => (r ? (r === 'secret' ? '✷ secrètes' : `${rarity(r).rank + 1}★`) : '');
    if (mode === 'cards') {
      const v = q<HTMLInputElement>('.cb-search').value.trim();
      return [cTheme && (ALL_THEMES.find((t) => t.id === cTheme)?.label ?? ''), starL(cStar), cQuery && `« ${v} »`].filter((x): x is string => !!x);
    }
    return [filter !== 'all' ? FILTER_LABEL[filter] : '', starL(star), query ? `« ${search.value.trim()} »` : ''].filter((x) => !!x);
  }
  /** bandeau « Filtres actifs : … · Réinitialiser » (les filtres de la grille sont mémorisés d'une visite à l'autre) */
  function renderActive(active: string[]) {
    fActive.hidden = !active.length;
    if (active.length) fActive.innerHTML = `<span>Filtres actifs : <b>${esc(active.join(' · '))}</b></span><button class="f-reset">Réinitialiser</button>`;
  }
  /** remet les filtres de la vue courante à zéro (les tris, eux, restent) */
  function resetFilters() {
    if (mode === 'cards') {
      cTheme = '';
      cStar = null;
      cQuery = '';
      q<HTMLInputElement>('.cb-search').value = '';
    } else {
      if (filter === 'fresh') fresh.clear();
      filter = 'all';
      star = null;
      query = '';
      search.value = '';
      savePrefs();
    }
    page = 0;
    shell.sfx.tick(1.1, 0.04);
    render();
  }
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.f-reset')) resetFilters();
  });
  // (v1.0.9) recherche partagée (core/cardSearch.ts) : plusieurs mots dans n'importe quel ordre, univers, pack,
  // artiste, n°, « 6★ »
  const cardHit = (e: CatalogEntry) => queryOf(cQuery).test(e);
  /** cartes du catalogue (hors Bébous secrets), pour la recherche globale des cartes pas encore trouvées */
  let catalogAll: CatalogEntry[] | null = null;
  const CATALOG_CAP = 60;
  /**
   * Recherche globale (audit UX3-03) : sous les cartes possédées, celles du catalogue qui correspondent mais qu'on n'a pas
   * encore (grisées, ♥ pour les suivre), avec le nom de leur album en intertitre, plafonnées à 60.
   */
  function catalogMatches(mine: Map<string, PlayerCard>): { list: CatalogEntry[]; more: number } {
    catalogAll ??= ALL_THEMES.filter((t) => !t.secret).flatMap((t) => t.cards).filter((e) => e.rarity !== 'secret');
    const out: CatalogEntry[] = [];
    let more = 0;
    for (const e of catalogAll) {
      if (mine.has(e.id)) continue;
      if (cTheme && e.themeId !== cTheme) continue;
      if (cStar && e.rarity !== cStar) continue;
      if (!cardHit(e)) continue;
      if (out.length < CATALOG_CAP) out.push(e);
      else more++;
    }
    const subLabel = (e: CatalogEntry) => subthemeById(e.subthemeId)?.label ?? '';
    out.sort((a, b) => (THEME_ORDER.get(a.themeId) ?? 9) - (THEME_ORDER.get(b.themeId) ?? 9) || subLabel(a).localeCompare(subLabel(b), 'fr') || a.num - b.num);
    return { list: out, more };
  }
  /** VUE CARTES (défaut, retours live n°1) : toutes mes cartes, les plus rares en haut ; tri, étoile, thème, recherche. */
  function renderCards(mine: Map<string, PlayerCard>) {
    q('.cb-theme').querySelectorAll<HTMLButtonElement>('button').forEach((b) => setOn(b, b.dataset.t === cTheme));
    q('.cb-stars').querySelectorAll<HTMLElement>('.chip').forEach((b) => setOn(b, b.dataset.r === cStar));
    el.querySelectorAll<HTMLButtonElement>('.cb-sort button').forEach((b) => setOn(b, b.dataset.s === cSort));
    let list: CatalogEntry[] = [];
    for (const id of mine.keys()) {
      const e = catalogEntry(id);
      if (!e) continue;
      if (cTheme && e.themeId !== cTheme) continue;
      if (cStar && e.rarity !== cStar) continue;
      if (cQuery && !cardHit(e)) continue;
      list.push(e);
    }
    const date = (e: CatalogEntry) => mine.get(e.id)?.firstPulledAt ?? 0;
    const subLabel = (e: CatalogEntry) => subthemeById(e.subthemeId)?.label ?? '';
    if (cSort === 'rarity') list.sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || date(b) - date(a) || a.name.localeCompare(b.name, 'fr'));
    else if (cSort === 'date') list.sort((a, b) => date(b) - date(a) || RANK[b.rarity] - RANK[a.rarity]);
    else if (cSort === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    else list.sort((a, b) => (THEME_ORDER.get(a.themeId) ?? 9) - (THEME_ORDER.get(b.themeId) ?? 9) || subLabel(a).localeCompare(subLabel(b), 'fr') || a.num - b.num);
    const key = `cards|${cTheme}|${cStar}|${cSort}|${cQuery}|${page}`;
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
    const frag = document.createDocumentFragment();
    const tile = (e: CatalogEntry) => cardTile(e.id, e.rarity, { owned: true, count: mine.get(e.id)!.count, fresh: fresh.has(e.id) });
    const slice = list.slice(page * PAGE, (page + 1) * PAGE);
    if (cSort === 'album') {
      // tri par album : un bloc par album (titre au-dessus de ses cartes) ; les petits albums se rangent côte à côte
      const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
      grid.classList.add('by-album');
      for (let i = 0; i < slice.length; ) {
        let j = i;
        while (j < slice.length && slice[j].subthemeId === slice[i].subthemeId) j++;
        const n = j - i;
        const blk = h('div', 'cards-alb');
        blk.style.setProperty('--n', String(Math.min(n, cols)));
        const e0 = slice[i];
        blk.append(h('h4', 'cards-sub', `<span>${esc(subLabel(e0))}</span><small>${esc(themeById(e0.themeId)?.label ?? '')} · ${n}</small>`));
        for (const e of slice.slice(i, j)) blk.append(tile(e));
        frag.append(blk);
        i = j;
      }
    } else {
      grid.classList.remove('by-album');
      for (const e of slice) frag.append(tile(e));
    }
    // recherche (2 lettres ou un numéro) : les cartes pas encore trouvées, sous la dernière page des miennes
    const searching = cQuery.length >= 2 || /^\d+$/.test(cQuery);
    const cat = searching && page >= pages - 1 ? catalogMatches(mine) : null;
    if (cat?.list.length) {
      const wish = new Set(backend.state.wishlist);
      frag.append(h('h4', 'cards-sub cards-cat', `Dans le catalogue · pas encore trouvées<small>${cat.more ? `${fmtN(CATALOG_CAP)} premières sur ${fmtN(CATALOG_CAP + cat.more)} · affine ta recherche` : plural(cat.list.length, 'carte')}</small>`));
      let lastCat = '';
      for (const e of cat.list) {
        if (e.subthemeId !== lastCat) {
          lastCat = e.subthemeId;
          frag.append(h('h4', 'cards-sub cards-cat-sub', `${esc(subLabel(e))}<small>${esc(themeById(e.themeId)?.label ?? '')}</small>`));
        }
        frag.append(tileFor(e, mine, wish));
      }
    }
    grid.replaceChildren(frag);
    shownList = list;
    preloadThumbs(list.slice(page * PAGE, (page + 1) * PAGE), true); // la page affichée passe devant (PERF2-04)
    renderPager(pages, list.length);
    const active = activeFilters();
    renderActive(active);
    empty.hidden = list.length > 0 || !!cat?.list.length;
    // en ligne, pas encore connecté au serveur ou pas de joueur : ce n'est pas une collection vide (UX1-15)
    if (mine.size === 0 && signedOut()) {
      empty.hidden = false;
      empty.innerHTML = loginPrompt(backend, 'Connecte-toi pour retrouver ta collection.');
      return;
    }
    empty.innerHTML = fr(mine.size === 0 ? 'Ta collection est vide : <a href="#/">ouvre ton premier booster</a> !' : active.length ? `Aucune de tes cartes pour ${esc(active.join(' + '))}.` : 'Aucune carte ne correspond aux filtres.') + (mine.size && active.length ? ' <button class="btn-ghost f-reset">Réinitialiser les filtres</button>' : '');
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
    // « 61–120 sur 6 584 » : touché, il devient un champ « aller à la page » (110 pages au pouce, audit UX3-11)
    const info = h('button', 'pg-info', `${fmtN(page * PAGE + 1)}–${fmtN(Math.min(total, (page + 1) * PAGE))} sur ${fmtN(total)}`);
    info.title = 'Aller à la page…';
    info.setAttribute('aria-label', `Page ${page + 1} sur ${pages} : aller à une autre page`);
    info.addEventListener('click', () => {
      const f = h('form', 'pg-go', `<label>Page <input type="number" inputmode="numeric" min="1" max="${pages}" value="${page + 1}" aria-label="Numéro de page"> / ${fmtN(pages)}</label><button class="pg">OK</button>`);
      const inp = f.querySelector('input')!;
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const p = Math.min(pages, Math.max(1, Math.round(Number(inp.value) || 1))) - 1;
        if (p === page) return renderPager(pages, total);
        page = p;
        render();
        grid.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
      inp.addEventListener('keydown', (e) => e.key === 'Escape' && (e.stopPropagation(), renderPager(pages, total)));
      info.replaceWith(f);
      inp.focus();
      inp.select();
    });
    pager.append(info);
  }

  // ── CLASSEURS
  const binderCover = (b: Binder, mine: Map<string, PlayerCard>): CatalogEntry | undefined => {
    const id = b.coverCardId && mine.has(b.coverCardId) ? b.coverCardId : b.cards.find((c) => mine.has(c.cardId))?.cardId;
    return id ? catalogEntry(id) : undefined;
  };
  function renderBinders(mine: Map<string, PlayerCard>) {
    bindersView.replaceChildren();
    const list = backend.state.binders;
    const full = list.length >= BINDER_MAX;
    const head = h('div', 'bd-head', `<div><span class="kicker">CLASSEURS PERSO · ${fmtN(list.length)}/${BINDER_MAX}</span><h2>Tes classeurs</h2><p class="muted">Range tes cartes comme tu veux : une carte peut être dans plusieurs classeurs (${BINDER_CARDS_MAX} cartes max. chacun). Le classeur épinglé s’affiche sur ton profil.</p></div><button class="btn-primary bd-new"${full ? ` disabled title="${BINDER_MAX} classeurs au maximum : supprimes-en un pour en créer un autre"` : ''}>+ Nouveau classeur</button>`);
    if (full) head.querySelector('.muted')!.insertAdjacentHTML('beforeend', ` <b class="bd-limit">${BINDER_MAX} classeurs au maximum : supprimes-en un pour en créer un autre.</b>`);
    head.querySelector('.bd-new')!.addEventListener('click', (e) => void newBinder(undefined, e.currentTarget as HTMLElement));
    bindersView.append(head);
    if (!list.length) {
      bindersView.append(h('div', 'empty', 'Pas encore de classeur. Crée-en un, puis ajoute des cartes depuis leur fiche (« + Classeur »).'));
      return;
    }
    const g = h('div', 'bd-grid');
    for (const b of list) {
      const cover = binderCover(b, mine);
      const c = h('button', `bd-card${b.pinned ? ' pinned' : ''}`);
      c.innerHTML = `<span class="bd-cover">${cover ? `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(cover)}">` : '<span class="al-ph">✦</span>'}${b.pinned ? '<span class="bd-pin" title="Épinglé sur ton profil">📌 profil</span>' : ''}</span><span class="bd-name">${esc(b.name)}</span><span class="bd-n">${plural(b.cards.length, 'carte')}</span>`;
      c.addEventListener('click', () => goBinder(b.id));
      g.append(c);
    }
    bindersView.append(g);
  }
  /**
   * Petit champ de nom en ligne (à la place de `prompt()`, qui coupe l'ambiance sur iOS et cache la limite : audit UX3-15).
   * Posé juste après `anchor` ; résout le nom (nettoyé, ≤ 32 caractères) ou null (Annuler, Échap).
   */
  function askName(anchor: HTMLElement, initial = '', placeholder = 'ex. « Rois », « Shinies »'): Promise<string | null> {
    anchor.parentElement?.querySelector(':scope > .bd-name-f')?.remove();
    return new Promise((res) => {
      const f = h('form', 'bd-name-f', `<input maxlength="${BINDER_NAME_MAX}" enterkeyhint="done" autocomplete="off" spellcheck="false" aria-label="Nom du classeur" placeholder="${esc(placeholder)}"><span class="bd-name-n" aria-hidden="true"></span><button class="btn-primary">OK</button><button type="button" class="btn-ghost bd-name-x">Annuler</button>`);
      const inp = f.querySelector('input')!;
      const n = f.querySelector<HTMLElement>('.bd-name-n')!;
      inp.value = initial;
      const count = () => (n.textContent = `${inp.value.length}/${BINDER_NAME_MAX}`);
      count();
      inp.addEventListener('input', count);
      let settled = false;
      const done = (v: string | null) => {
        if (settled) return;
        settled = true;
        f.remove();
        res(v);
      };
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = inp.value.replace(/\s+/g, ' ').trim().slice(0, BINDER_NAME_MAX);
        done(v || null);
      });
      f.querySelector('.bd-name-x')!.addEventListener('click', () => done(null));
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        done(null);
      });
      anchor.insertAdjacentElement('afterend', f);
      inp.focus();
      inp.select();
    });
  }
  async function newBinder(cards?: Array<{ cardId: string; rarity: RarityId }>, anchor?: HTMLElement): Promise<string | null> {
    if (backend.state.binders.length >= BINDER_MAX) {
      toast(`${BINDER_MAX} classeurs au maximum : supprimes-en un pour en créer un autre.`, 'info');
      return null;
    }
    const name = anchor ? await askName(anchor) : prompt('Nom du classeur (ex. « Rois », « Shinies ») :')?.trim().slice(0, BINDER_NAME_MAX);
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
    head.innerHTML = `<div><span class="kicker">CLASSEUR${b.pinned ? ' · ÉPINGLÉ SUR TON PROFIL' : ''}</span><h2 class="bd-title">${esc(b.name)}<button class="bd-rename" title="Renommer" aria-label="Renommer">✎</button></h2><p class="muted">${fmtN(b.cards.length)}/${BINDER_CARDS_MAX} cartes${b.coverCardId ? ` · couverture : ${esc(catalogEntry(b.coverCardId)?.name ?? '')}` : ' · couverture automatique (la première carte)'}</p></div>
      <div class="bd-actions"><button class="btn-ghost bd-pinb" aria-pressed="${b.pinned}">${b.pinned ? '📌 Retirer de mon profil' : '📌 Épingler sur mon profil'}</button><button class="btn-ghost bd-edit">${binderEdit ? 'Terminer' : 'Réorganiser'}</button><button class="btn-ghost danger bd-del">Supprimer</button></div>`;
    head.querySelector('.bd-rename')!.addEventListener('click', async () => {
      const name = await askName(head.querySelector<HTMLElement>('.bd-title')!, b.name, 'Nouveau nom');
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
    // suppression : double toucher (« Sûr ? »), désarmé seul au bout de 4 s — plus de confirm() natif
    const del = head.querySelector<HTMLButtonElement>('.bd-del')!;
    let armed = 0;
    del.addEventListener('click', async () => {
      if (!armed) {
        del.textContent = 'Sûr ? Les cartes restent dans ta collection';
        armed = window.setTimeout(() => {
          armed = 0;
          del.textContent = 'Supprimer';
        }, 4000);
        return;
      }
      clearTimeout(armed);
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
    if (binderEdit) bindersView.append(h('div', 'bd-hint', matchMedia('(pointer: coarse)').matches ? 'Appui long sur une carte (ou sa poignée ⠿) puis glisse pour la déplacer · ✕ retire du classeur · 📌 en fait la couverture' : 'Glisse les cartes pour les réordonner · ✕ retire du classeur · 📌 en fait la couverture'));
    const g = h('div', `grid bd-cards${binderEdit ? ' editing' : ''}`);
    b.cards.forEach((c, i) => {
      const have = mine.get(c.cardId);
      const t = cardTile(c.cardId, c.rarity, { owned: !!have, count: have?.count });
      t.dataset.i = String(i);
      if (binderEdit) {
        const tools = h('span', 'bd-tools', `<span class="bd-grip" title="Glisser pour déplacer" aria-hidden="true">⠿</span><button class="bd-cov${b.coverCardId === c.cardId ? ' on' : ''}" title="${b.coverCardId === c.cardId ? 'Couverture du classeur (retirer)' : 'En faire la couverture du classeur'}" aria-label="${b.coverCardId === c.cardId ? 'Ne plus utiliser comme couverture' : 'En faire la couverture du classeur'}" aria-pressed="${b.coverCardId === c.cardId}">📌</button><button class="bd-rm" title="Retirer du classeur" aria-label="Retirer du classeur">✕</button>`);
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
  /**
   * glisser-déposer (souris et doigt) : la carte attrapée suit le pointeur, les autres s'écartent, on relâche = nouvel ordre.
   * Au doigt (audit UX3-07) : la grille DÉFILE normalement ; on attrape une carte par un appui long (300 ms sans bouger)
   * ou tout de suite par sa poignée ⠿ (seule zone en `touch-action: none`). Près du haut / du bas de l'écran pendant
   * un glisser, la liste défile toute seule (déplacer une carte de la place 3 à la place 80).
   */
  function sortable(g: HTMLElement, b: Binder) {
    let drag: { el: HTMLElement; from: number; ghost: HTMLElement; ox: number; oy: number; id: number } | null = null;
    let over = -1;
    let press: { t: HTMLElement; x: number; y: number; id: number; timer: number } | null = null;
    let last: { x: number; y: number } | null = null;
    let edgeRaf = 0;
    const cancelPress = () => {
      if (!press) return;
      clearTimeout(press.timer);
      press.t.classList.remove('bd-press');
      press = null;
    };
    const start = (t: HTMLElement, e: { clientX: number; clientY: number; pointerId: number }) => {
      const r = t.getBoundingClientRect();
      const ghost = t.cloneNode(true) as HTMLElement;
      ghost.className += ' bd-ghost';
      ghost.style.width = `${r.width}px`;
      ghost.style.height = `${r.height}px`;
      document.body.append(ghost);
      drag = { el: t, from: Number(t.dataset.i), ghost, ox: e.clientX - r.left, oy: e.clientY - r.top, id: e.pointerId };
      t.classList.add('bd-dragging');
      g.classList.add('dragging');
      try {
        g.setPointerCapture(e.pointerId);
      } catch {
        /* le doigt a déjà été relâché */
      }
      move(e);
      haptics.pulse(8);
    };
    g.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      const t = target.closest<HTMLElement>('.tile');
      if (!t || drag) return;
      const grip = !!target.closest('.bd-grip');
      if (!grip && target.closest('button')) return;
      // souris, ou poignée : on attrape tout de suite
      if (e.pointerType === 'mouse' || grip) {
        e.preventDefault();
        return start(t, e);
      }
      // doigt / stylet : appui long, le défilement reste libre tant qu'il n'a pas abouti
      cancelPress();
      const p = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId };
      t.classList.add('bd-press');
      press = { t, x: e.clientX, y: e.clientY, id: e.pointerId, timer: window.setTimeout(() => {
        if (!press) return;
        const pt = press.t;
        cancelPress();
        start(pt, last ? { clientX: last.x, clientY: last.y, pointerId: p.pointerId } : p);
      }, 300) };
      last = null;
    });
    // pendant un glisser au doigt, le navigateur ne doit plus faire défiler la page (écouteur non passif)
    g.addEventListener('touchmove', (e) => drag && e.cancelable && e.preventDefault(), { passive: false });
    g.addEventListener('contextmenu', (e) => e.preventDefault());
    const edge = () => {
      edgeRaf = 0;
      if (!drag || !last) return;
      const zone = 80;
      const dy = last.y < zone ? -1 : last.y > innerHeight - zone ? 1 : 0;
      if (!dy) return;
      const k = dy < 0 ? (zone - last.y) / zone : (last.y - (innerHeight - zone)) / zone;
      el.scrollBy(0, dy * Math.ceil(4 + 14 * Math.min(1, k)));
      hover(last.x, last.y);
      edgeRaf = requestAnimationFrame(edge);
    };
    const hover = (x: number, y: number) => {
      if (!drag) return;
      drag.ghost.hidden = true;
      const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('.bd-cards .tile');
      drag.ghost.hidden = false;
      const i = under ? Number(under.dataset.i) : -1;
      if (i !== over) {
        over = i;
        g.querySelectorAll<HTMLElement>('.tile').forEach((x) => x.classList.toggle('bd-over', Number(x.dataset.i) === i && i !== drag!.from));
      }
    };
    const move = (e: { clientX: number; clientY: number; pointerId: number }) => {
      if (press && e.pointerId === press.id) {
        last = { x: e.clientX, y: e.clientY };
        // le doigt bouge avant la fin de l'appui long : c'est un défilement, pas une prise
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancelPress();
        return;
      }
      if (!drag) return;
      last = { x: e.clientX, y: e.clientY };
      drag.ghost.style.transform = `translate(${e.clientX - drag.ox}px, ${e.clientY - drag.oy}px)`;
      hover(e.clientX, e.clientY);
      if (!edgeRaf) edgeRaf = requestAnimationFrame(edge);
    };
    g.addEventListener('pointermove', move);
    const end = async (e: PointerEvent) => {
      if (press && e.pointerId === press.id) cancelPress();
      if (!drag) return;
      const d = drag;
      drag = null;
      cancelAnimationFrame(edgeRaf);
      edgeRaf = 0;
      d.ghost.remove();
      d.el.classList.remove('bd-dragging');
      g.classList.remove('dragging');
      g.querySelectorAll('.bd-over').forEach((x) => x.classList.remove('bd-over'));
      try {
        g.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const to = over;
      over = -1;
      if (e.type === 'pointercancel' || to < 0 || to === d.from) return;
      const cards = [...b.cards];
      const [it] = cards.splice(d.from, 1);
      cards.splice(to, 0, it);
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
    const inCards = mode === 'cards';
    const inAlbums = mode === 'albums';
    const inGrid = mode === 'grid';
    const inBinders = mode === 'binders' || mode === 'binder';
    albums.hidden = !inAlbums;
    filtersEl.hidden = !inGrid;
    cardsBar.hidden = !inCards;
    grid.hidden = !(inGrid || inCards);
    pager.hidden = !(inGrid || inCards);
    empty.hidden = true;
    fActive.hidden = true;
    bindersView.hidden = !inBinders;
    forgeHost.hidden = mode !== 'forge';
    const famLabel = famId ? SUBTHEMES.find((s) => s.group?.id === famId)?.group?.label ?? '' : '';
    crumb.hidden = !((inGrid && !theme.secret) || mode === 'binder' || (inAlbums && !!famId && !albumQuery));
    if (inAlbums && famId) {
      q('.crumb-back').textContent = `‹ ${theme.label}`;
      q('.crumb-name').textContent = famLabel;
    } else if (inGrid && !theme.secret) {
      // (retours 05/11) un album d'une famille revient à sa famille (« ‹ Pokémon »), sinon aux familles du thème
      const g = subId ? subthemeById(subId)?.group : undefined;
      if (g) famId = g.id;
      q('.crumb-back').textContent = g ? `‹ ${g.label}` : `‹ Albums ${theme.label}`;
      q('.crumb-name').textContent = subId ? (subthemeById(subId)?.label ?? '') : `Tout ${theme.label}`;
    } else if (mode === 'binder') {
      q('.crumb-back').textContent = '‹ Classeurs';
      // le nom est déjà le grand titre du classeur : pas de doublon dans le fil d'Ariane (audit UX3-15)
      q('.crumb-name').textContent = '';
    }
    for (const row of [tabs]) {
      const on = row.querySelector<HTMLElement>('.on');
      if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = on.offsetLeft - (row.clientWidth - on.clientWidth) / 2;
    }
    requestAnimationFrame(fitRows);
    renderProgress(mine);
    if (inCards) renderCards(mine);
    else if (inAlbums) renderAlbums(mine);
    else if (inGrid) renderGrid(mine);
    else if (mode === 'binders') renderBinders(mine);
    else if (mode === 'forge') forge.render();
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
      // (v1.0.9) carte manquante : qui l'a ? (la fiche dit aussi où elle tombe)
      return showCardPanel(backend, e.id, `Pas encore trouvée · dans le ${t ? `${t.label} Pack` : 'booster de son thème'} et le ${BEBOU_PACK.label}`);
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
    const st = e ? subthemeById(e.subthemeId) : null;
    const isCover = !!st && backend.state.covers[st.id] === b.id;
    const inBinders = backend.state.binders.filter((x) => x.cards.some((c) => c.cardId === b.id && c.rarity === b.r)).length;
    // (refonte des échanges 11/11, views/cardPanel.ts) : « chez les joueurs » en une ligne sous la carte, et DEUX gestes
    // d'échange seulement — Je la veux · Protéger (les doublons sont proposés par défaut). Plus de « Échanger »,
    // « Chercher un propriétaire » ni « Proposer sur le tableau » : la fiche (›) porte Demander / Acheter / Proposer.
    vActions.innerHTML = `
      <button class="va va-binder${inBinders ? ' on' : ''}" title="Ranger dans un classeur" aria-label="Ranger dans un classeur${inBinders ? ` (déjà dans ${inBinders})` : ''}">▤ <span>${inBinders ? `Classeur ×${inBinders}` : '+ Classeur'}</span></button>
      ${st && !e?.themeId.startsWith('bebous') ? `<button class="va va-cover${isCover ? ' on' : ''}" title="${isCover ? 'Ne plus utiliser comme couverture' : `En faire la couverture de l’album ${esc(st.label)}`}" aria-label="${isCover ? `Couverture de l’album ${esc(st.label)} : retirer` : `En faire la couverture de l’album ${esc(st.label)}`}" aria-pressed="${isCover}">📌 <span>${isCover ? 'Couverture ✓' : 'Couverture'}</span></button>` : ''}
      ${have?.firstPulledAt ? `<span class="va-date">obtenue le ${fmtDate(have.firstPulledAt)}</span>` : ''}`;
    // (07/11) signalement d'image en un geste (ui.ts imageReportButton) — avant la date d'obtention
    const vaDate = vActions.querySelector('.va-date');
    if (vaDate) vaDate.before(imageReportButton(backend, b.id, 'collection/carte'));
    else vActions.append(imageReportButton(backend, b.id, 'collection/carte'));
    vActions.prepend(panelStrip(backend, b.id, b.r), ...gestureButtons(backend, b.id, b.r, 'va', () => renderActions(b)));
    vActions.querySelector('.va-binder')!.addEventListener('click', () => showBinderPick(b));
    vActions.querySelector('.va-cover')?.addEventListener('click', async () => {
      if (!st) return;
      try {
        await backend.setSubthemeCover(st.id, isCover ? undefined : b.id);
        toast(isCover ? `Couverture de l’album ${st.label} : automatique` : `${e?.name} est la couverture de l’album ${st.label}`, 'ok');
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
      ${list
        .map((x) => {
          const inIt = x.cards.some((c) => c.cardId === b.id && c.rarity === b.r);
          const full = !inIt && x.cards.length >= BINDER_CARDS_MAX;
          return `<label class="bp-row${full ? ' full' : ''}"${full ? ` title="Classeur plein (${BINDER_CARDS_MAX} cartes)"` : ''}><input type="checkbox" data-id="${esc(x.id)}" ${inIt ? 'checked' : ''}${full ? ' disabled' : ''}><span>${esc(x.name)}</span><em>${full ? 'plein · ' : ''}${fmtN(x.cards.length)}/${BINDER_CARDS_MAX}</em></label>`;
        })
        .join('')}
      <button class="btn-ghost bp-new"${list.length >= BINDER_MAX ? ` disabled title="${BINDER_MAX} classeurs au maximum"` : ''}>${list.length >= BINDER_MAX ? `${BINDER_MAX} classeurs au maximum` : '+ Nouveau classeur avec cette carte'}</button>`;
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
    binderPick.querySelector('.bp-new')!.addEventListener('click', async (e) => {
      const id = await newBinder([{ cardId: b.id, rarity: b.r }], e.currentTarget as HTMLElement);
      if (id) {
        renderActions(b);
        showBinderPick(b);
      }
    });
  }

  // un toucher à côté de la carte la referme (comme la croix, Échap et le retour) — pas celui qui vient de l'ouvrir
  // (même règle que la boutique, audit UX3-09) ; si le choix de classeur est ouvert, ce toucher le ferme d'abord
  let viewerRef: ViewerScene | null = null;
  let openedAt = 0;
  shell.input.onTap((x, y) => {
    if (!open || !viewerRef || performance.now() - openedAt < 450 || !el.isConnected) return;
    if (viewerRef.hits(x, y)) return;
    if (!binderPick.hidden) binderPick.hidden = true;
    else closeViewer();
  });
  async function openCard(i: number, dir: 0 | 1 | -1 = 0) {
    const b = browse[i];
    if (!b) return;
    at = i;
    openedAt = performance.now();
    const e = catalogEntry(b.id);
    const have = owned().get(b.id);
    const st = e ? subthemeById(e.subthemeId) : null;
    const first = !open && !dir;
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
    const by = e?.artist;
    vInfo.innerHTML = `<div class="ci-name">${esc(e?.name ?? b.id)}</div>${by ? `<div class="ci-by">${esc(by)}</div>` : ''}<div class="ci-meta">${starsHtml(b.r)} <span class="ci-r" style="color:${rarity(b.r).accentHex}">${rarity(b.r).label}</span></div>
      <div class="ci-sub">${st ? `${esc(st.label)} ${String(e!.num).padStart(3, '0')}/${numberingSize(st)} · ` : ''}${have ? `${plural(have.count, 'exemplaire')} (${have.count > 1 ? 'meilleur : ' : ''}n°${fmtN(have.bestMintNumber)} imprimé)` : ''}</div>`;
    renderActions(b);
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= browse.length - 1;
    hintEl.textContent = matchMedia('(hover: hover)').matches
      ? `glisse pour tourner · molette pour zoomer${browse.length > 1 ? ' · ← → pour feuilleter' : ''}`
      : 'glisse pour tourner · touche deux fois pour zoomer';
    navPos.textContent = browse.length > 1 ? `${fmtN(i + 1)} / ${fmtN(browse.length)}` : '';
    const viewer = await getViewer();
    viewerRef = viewer;
    if (!open || at !== i) return;
    shell.setDimmed(false);
    shell.show('viewer');
    // (V2 fluidité, lot 6) ouverture depuis la grille : la carte de la tuile grandit jusqu'à la place de la carte 3D
    // et tient l'écran pendant que celle-ci se prépare (illustration, calques, textures) — plus d'écran noir
    const land = first ? flyGhost(b, viewer) : null;
    // (retours 06/11) pas de son quand on ouvre une carte de la collection
    void viewer.show(b.id, b.r, dir ? { dir, quiet: true } : { quiet: true }).finally(() => land?.());
  }
  /** carte « fantôme » en vol (une seule à la fois) */
  let ghost: HTMLElement | null = null;
  const dropGhost = () => {
    ghost?.remove();
    ghost = null;
  };
  function flyGhost(b: { id: string; r: RarityId }, viewer: ViewerScene): (() => void) | null {
    dropGhost();
    if (reducedMotion()) return null;
    const tile = el.querySelector<HTMLElement>(`.tile.owned.real-on[data-card="${CSS.escape(b.id)}"][data-rarity="${b.r}"]`);
    const img = tile?.querySelector<HTMLImageElement>('img.real');
    const to = viewer.restRect();
    if (!tile || !img?.complete || !img.naturalWidth || !to) return null;
    const from = tile.getBoundingClientRect();
    const host = shell.renderer.domElement.getBoundingClientRect();
    if (!from.width || !host.width) return null;
    const w = ((to.x1 - to.x0) / 2) * host.width;
    const h = ((to.y1 - to.y0) / 2) * host.height;
    const x = host.left + ((to.x0 + 1) / 2) * host.width;
    const y = host.top + ((1 - to.y1) / 2) * host.height;
    const g = document.createElement('img');
    g.className = 'card-ghost';
    g.alt = '';
    g.src = img.currentSrc || img.src;
    g.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
    document.body.append(g);
    ghost = g;
    g.animate([{ transform: 'none' }, { transform: `translate(${x - from.left}px,${y - from.top}px) scale(${w / from.width},${h / from.height})` }], { duration: DUR.emphatique(), easing: EASING.entree, fill: 'forwards' });
    // la carte 3D est là : le fantôme s'efface (elle fait son tour d'entrée à sa place)
    return () => {
      if (ghost !== g) return;
      const out = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.rapide(), easing: 'linear', fill: 'forwards' });
      out.onfinish = out.oncancel = () => ghost === g && dropGhost();
    };
  }
  const step = (d: 1 | -1) => {
    if (!open || !browse[at + d]) return;
    void openCard(at + d, d);
  };
  function closeViewer() {
    if (!open) return;
    dropGhost();
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
    // (V2 fluidité, lot 2) la grille n'est refaite que si quelque chose a changé pendant la visionneuse (envies,
    // classeurs, pochettes) : sinon les 60 tuiles restent en place — plus de clignotement au retour
    if (viewerDirty) {
      viewerDirty = false;
      render();
    }
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
  let viewerDirty = false;
  backend.onChange((st) => {
    // (+ exemplaires engagés : la forge et son compteur en dépendent)
    const now = `${collectionSig(st)}|${st.wishlist.length}|${JSON.stringify(st.binders)}|${JSON.stringify(st.covers)}|${JSON.stringify([...lockedCards(st)])}|${st.ready}`;
    if (now === sig) return;
    sig = now;
    if (el.isConnected && !open) render();
    else if (el.isConnected && open) {
      viewerDirty = true;
      if (browse[at]) renderActions(browse[at]);
    }
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
      // arrivée sans lien précis : la vue CARTES, triée par rareté (retours live n°1)
      if (!sub) {
        mode = 'cards';
        cSort = 'rarity';
        page = 0;
      }
      if (sub === 'classeurs') goBinders();
      else if (sub === 'forge' && forgeOpen()) {
        mode = 'forge';
        subId = null;
      }
      else if (sub === 'albums') {
        if (theme.secret) theme = ALL_THEMES[0];
        mode = 'albums';
        famId = null;
      }
      else if (sub && sub !== 'nouvelles') {
        // lien direct : un sous-thème (#/collection/pokemon) ou un thème (#/collection/monde)
        // … ou un GROUPE d'albums (#/collection/pokemon = Kanto, Johto… : audit UX3-10)
        const st = subthemeById(sub);
        const grp = st ? undefined : SUBTHEMES.find((s) => s.group?.id === sub);
        const t = ALL_THEMES.find((x) => x.id === (st?.themeId ?? grp?.themeId ?? sub)) ?? themeById(sub);
        if (t) theme = t;
        if (st && st.themeId !== 'bebous') {
          mode = 'grid';
          subId = st.id;
          page = 0;
        } else if (grp?.group && t && !t.secret) {
          // (retours 05/11) la FAMILLE : ses sous-familles (Kanto, Johto…)
          mode = 'albums';
          subId = null;
          famId = grp.group.id;
          alSearch.value = '';
          albumQuery = '';
        } else if (t) {
          mode = t.secret ? 'grid' : 'albums';
          subId = null;
          famId = null;
        } else {
          // lien inconnu : la vue Cartes, et une adresse propre
          mode = 'cards';
          page = 0;
          history.replaceState(history.state, '', '#/collection');
        }
      } else if (sub === 'nouvelles' && !fresh.size) {
        // « Voir mes nouvelles » alors qu'elles ont déjà été vues : on le dit, au lieu de rester sur l'ancienne vue
        mode = 'cards';
        page = 0;
        history.replaceState(history.state, '', '#/collection');
        toast('Pas de nouvelle carte depuis ta dernière visite', 'info');
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
        history.replaceState(history.state, '', '#/collection');
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
