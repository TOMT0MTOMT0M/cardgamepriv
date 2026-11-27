import '../../core/i18n/fr/game.views.collection'; // (textes de ce module, version anglaise)
import { WISH_FAMS_MAX, famCards, famKeyValid } from '../../core/wishFams';
import { lang, locale, t as tr } from '../../core/i18n';
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
import { DUR, EASING, SPRING, STAGGER } from '../../core/motion';
import { Spring } from '../../core/ease';
import { createForge, forgeCount } from './forge';
import { binderShift } from './binderShift';
import { GAMES_OPEN } from '../../core/games';
import { createRiffle, ndcToRect } from '../riffle';
import { dropFlight, liftCard, returnCard } from '../sharedFlight';
import { paintedCard } from '../cardImages';
import { contractsRetired } from '../../core/economy';

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
/**
 * (15/11, demande de Tom) AFFICHAGE DE LA GRILLE, au choix du joueur, retenu sur l'appareil : sur ordinateur, des
 * rangées × colonnes qui remplissent l'espace sous la barre (2×6, 4×8, 6×10 : les cartes se dimensionnent pour que ces
 * rangées tiennent entières, style.css) ; sur téléphone, de plus en plus serré (2, 3, 4 cartes par rangée sur un téléphone).
 * Le défilement garde ses crans d'une rangée. Une page compte au moins 60 cartes et toujours des rangées ENTIÈRES (voir
 * `perPage`) : 60 = 5 écrans de 2×6 ou 1 écran de 6×10, 64 = 2 écrans de 4×8.
 */
type Dens = '2x6' | '4x8' | '6x10';
const DENS: ReadonlyArray<{ id: Dens; rows: number; cols: number; key: 'coll.dens.l' | 'coll.dens.m' | 'coll.dens.s' }> = [
  { id: '2x6', rows: 2, cols: 6, key: 'coll.dens.l' },
  { id: '4x8', rows: 4, cols: 8, key: 'coll.dens.m' },
  { id: '6x10', rows: 6, cols: 10, key: 'coll.dens.s' },
];
const DENS_KEY = 'bebou.coll.dens';
const densIcon = (n: number) => {
  const s = 14 / n;
  let r = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) r += `<rect x="${1 + x * s + 0.6}" y="${1 + y * s + 0.6}" width="${s - 1.2}" height="${s - 1.2}" rx="${n > 3 ? 0.4 : 0.8}"/>`;
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">${r}</svg>`;
};
/** (QOL 7) en-tête du tiroir de filtres (téléphone seulement : masqué ailleurs par le CSS) */
const drawerHead = () => `<div class="f-dr-head"><b>${tr('coll.filters')}</b><button type="button" class="f-dr-x" aria-label="${tr('common.close')}">✕</button></div>`;
const densSeg = () =>
  `<div class="seg cb-dens" role="group" aria-label="${tr('coll.dens')}">${DENS.map((d, i) => `<button data-d="${d.id}" aria-label="${tr(d.key)}" title="${tr('coll.densT', { r: d.rows, c: d.cols })}">${densIcon(i + 2)}<span>${d.rows}×${d.cols}</span></button>`).join('')}</div>`;
/** plafonds des classeurs : les mêmes que le serveur (convex/binders.ts : BINDER_MAX, BINDER_CARDS_MAX, cleanName) */
const BINDER_MAX = 30;
const BINDER_CARDS_MAX = 500;
const BINDER_NAME_MAX = 32;
const PREFS = 'bebou.coll.v2';
/** libellés des filtres (bandeau « Filtres actifs » et états vides composés, audit UX3-02) */
const FILTER_LABEL = (): Record<Filter, string> => ({ all: tr('coll.f.all'), owned: tr('coll.f.owned'), missing: tr('coll.f.missing'), dups: tr('coll.f.dups'), fresh: tr('coll.f.new') });
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

const fmtDate = (t: number) => new Date(t).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
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
  /** (v2.0.7) vue Cartes : seulement mes doublons */
  let cDups = false;
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
  /** cartes par page, recalculée à chaque rendu de la grille (`perPage`) */
  let per = PAGE;
  let dens: Dens = '2x6';
  try {
    const d = localStorage.getItem(DENS_KEY);
    if (DENS.some((x) => x.id === d)) dens = d as Dens;
  } catch {
    /* stockage bloqué : 2×6 */
  }
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

  // (patch v2.1.30, QOL 3) albums récents (les 5 derniers ouverts) et épinglés (★ sur la pochette) : gardés dans ce
  // navigateur seulement (rien dans Convex)
  const RECENT_KEY = 'bebou.coll.recents.v1';
  const PINS_KEY = 'bebou.coll.pins.v1';
  const RECENT_MAX = 5;
  const PINS_MAX = 12;
  /** (QOL 4) rangée « Presque finis » : jusqu'à 3 cartes manquantes, 8 albums au plus */
  const ALMOST_MAX = 3;
  const ALMOST_ROW = 8;
  const readIds = (k: string): string[] => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(k) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, PINS_MAX) : [];
    } catch {
      return [];
    }
  };
  const writeIds = (k: string, ids: string[]) => {
    try {
      localStorage.setItem(k, JSON.stringify(ids));
    } catch {
      /* stockage plein ou bloqué : gardé pour cette visite seulement */
    }
  };
  let recents = readIds(RECENT_KEY);
  let pins = readIds(PINS_KEY);
  const noteRecent = (id: string) => {
    if (recents[0] === id) return;
    recents = [id, ...recents.filter((x) => x !== id)].slice(0, RECENT_MAX);
    writeIds(RECENT_KEY, recents);
  };
  const togglePin = (id: string) => {
    const on = pins.includes(id);
    if (!on && pins.length >= PINS_MAX) return void toast(tr('coll.pinsMax', { n: PINS_MAX }), 'info');
    pins = on ? pins.filter((x) => x !== id) : [id, ...pins];
    writeIds(PINS_KEY, pins);
    haptics.pulse(8);
    shell.sfx.tick(on ? 0.9 : 1.3, 0.05);
    albumKey = '';
    render();
  };

  el.innerHTML = `
    <div class="coll-head">
      <div class="coll-switch"><div class="seg coll-views" role="tablist" aria-label="${tr('coll.viewAria')}"><button role="tab" data-v="cards">${tr('coll.cards')}</button><button role="tab" data-v="albums">${tr('coll.albums')}</button><button role="tab" data-v="binders">${tr('coll.binders')}</button><button role="tab" data-v="forge">${tr('coll.forge')}</button><button role="tab" data-v="contrats">${tr('coll.contracts')}</button></div></div>
      <div class="tabs"></div>
      <div class="crumb" hidden><button class="crumb-back">‹ Albums</button><span class="crumb-sep" aria-hidden="true" hidden>›</span><button class="crumb-mid" hidden></button><span class="crumb-sep crumb-sep2" aria-hidden="true" hidden>›</span><span class="crumb-name"></span><button class="va crumb-wish" hidden></button></div>
      <div class="progress"></div>
    </div>
    <div class="albums" hidden>
      <div class="al-bar">
        <input class="search al-search" type="search" placeholder="${tr('coll.searchAlbum')}" autocomplete="off" spellcheck="false" aria-label="${tr('coll.searchAlbumA')}">
        <div class="seg al-sort" aria-label="${tr('coll.albumSort')}"><button data-s="progress">${tr('coll.inProgress')}</button><button data-s="completion">${tr('coll.completion')}</button><button data-s="group">${tr('coll.byGroup')}</button><button data-s="alpha">A → Z</button></div>
        <span class="al-count"></span>
      </div>
      <div class="al-grid"></div>
    </div>
    <button class="f-open" type="button" aria-expanded="false" aria-haspopup="dialog" hidden></button>
    <div class="f-scrim" hidden></div>
    <div class="filters" hidden>
      ${drawerHead()}
      <div class="seg">
        <button data-f="all">${tr('coll.f.all')}</button><button data-f="owned">${tr('coll.f.owned')}</button><button data-f="missing">${tr('coll.f.missing')}</button><button data-f="dups">${tr('coll.f.dups')}</button><button data-f="fresh" class="f-fresh" hidden>${tr('coll.f.new')}</button>
      </div>
      <div class="starf"></div>
      <div class="seg sortf" aria-label="${tr('coll.sort')}"><button data-s="num">N°</button><button data-s="stars">${tr('coll.stars')}</button><button data-s="recent">${tr('coll.recent')}</button></div>
      ${densSeg()}
      <input class="search" type="search" placeholder="${tr('coll.searchPh')}" enterkeyhint="search" autocomplete="off" spellcheck="false" aria-label="${tr('coll.searchA')}" />
    </div>
    <div class="cards-bar" hidden>
      ${drawerHead()}
      <div class="seg cb-theme" aria-label="${tr('coll.theme')}"></div>
      <div class="starf cb-stars"></div>
      <button class="chip cb-dups" aria-pressed="false" title="${tr('coll.dupsT')}">${tr('coll.dups')}</button>
      <div class="seg cb-sort" aria-label="${tr('coll.sort')}"><button data-s="rarity">${tr('coll.rarity')}</button><button data-s="date">Date</button><button data-s="alpha">A → Z</button><button data-s="album">${tr('coll.byAlbum')}</button></div>
      ${densSeg()}
      <input class="search cb-search" type="search" placeholder="${tr('coll.searchAllPh')}" autocomplete="off" spellcheck="false" aria-label="${tr('coll.searchAllA')}">
    </div>
    <div class="f-active" role="status" hidden></div>
    <div class="binders-view" hidden></div>
    <div class="forge-host" hidden></div>
    <div class="grid"></div>
    <div class="pager" hidden></div>
    <div class="empty" hidden></div>
    <button class="to-top" aria-label="${tr('coll.backTop')}" title="${tr('coll.backTop')}" hidden>↑</button>
    <div class="viewer-ui" hidden><button class="close" aria-label="${tr('common.close')}">✕</button>
      <button class="nav prev" aria-label="${tr('coll.prev')}">‹</button><button class="nav next" aria-label="${tr('coll.next')}">›</button>
      <div class="v-info"></div><div class="v-actions"></div><div class="v-pos"></div><div class="v-hint">${tr('shop.spinHint')}</div>
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

  // ── (QOL 7) téléphone : les barres de filtres (vue Cartes et grille d'un album) deviennent un tiroir qui monte du bas.
  // Ce sont les MÊMES éléments (le CSS les pose en bas d'écran) : aucune logique dupliquée.
  const phoneMq = matchMedia('(max-width: 600px)');
  const fOpenBtn = q<HTMLButtonElement>('.f-open');
  const fScrim = q('.f-scrim');
  const drawerBars = [filtersEl, q('.cards-bar')];
  const activeBar = () => drawerBars.find((b) => !b.hidden) ?? null;
  let drawerOpen = false;
  const drawerKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeDrawer();
    }
  };
  function closeDrawer(restoreFocus = true) {
    if (!drawerOpen) return;
    drawerOpen = false;
    popLayer(closeDrawer);
    el.classList.remove('f-drawer-open');
    fScrim.hidden = true;
    fOpenBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', drawerKey, true);
    if (restoreFocus && fOpenBtn.offsetParent) fOpenBtn.focus({ preventScroll: true });
  }
  function openDrawer() {
    if (drawerOpen || !phoneMq.matches || !activeBar()) return;
    drawerOpen = true;
    el.classList.add('f-drawer-open');
    fScrim.hidden = false;
    fOpenBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', drawerKey, true);
    pushLayer(closeDrawer);
    requestAnimationFrame(() => activeBar()?.querySelector<HTMLElement>('.f-dr-x')?.focus({ preventScroll: true }));
  }
  fOpenBtn.addEventListener('click', () => (drawerOpen ? closeDrawer() : openDrawer()));
  fScrim.addEventListener('click', () => closeDrawer());
  for (const b of drawerBars) b.querySelector('.f-dr-x')!.addEventListener('click', () => closeDrawer());
  /** role="dialog" seulement quand la barre est un tiroir (téléphone) ; fermé si on repasse en large */
  const syncDrawerMode = () => {
    for (const b of drawerBars) {
      if (phoneMq.matches) {
        b.setAttribute('role', 'dialog');
        b.setAttribute('aria-modal', 'true');
        b.setAttribute('aria-label', tr('coll.filters'));
      } else {
        b.removeAttribute('role');
        b.removeAttribute('aria-modal');
        b.removeAttribute('aria-label');
      }
    }
    if (!phoneMq.matches) closeDrawer(false);
  };
  phoneMq.addEventListener('change', syncDrawerMode);
  syncDrawerMode();
  /** nombre de filtres actifs de la vue affichée (le tri et la densité n'en sont pas) */
  const activeFilterCount = () => {
    if (mode === 'cards') return [cStar, cTheme, cQuery.trim(), cDups].filter(Boolean).length;
    return [filter !== 'all', star, query.trim()].filter(Boolean).length;
  };
  function syncFilterButton() {
    const has = !!activeBar();
    fOpenBtn.hidden = !has;
    if (!has) return closeDrawer(false);
    const n = activeFilterCount();
    fOpenBtn.textContent = n ? `${tr('coll.filters')} (${n})` : tr('coll.filters');
    fOpenBtn.classList.toggle('has', n > 0);
  }

  // ── filtres / tris
  el.querySelectorAll<HTMLButtonElement>('.filters .seg:not(.sortf, .cb-dens) button').forEach((b) =>
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
    b.setAttribute('aria-label', tr('coll.starsOf', { n: rarity(r).rank + 1, label: rarity(r).label }));
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
  /**
   * (v2.0.7, retour de Tom) MOLETTE = UNE RANGÉE : sur la grille des cartes, un cran de molette fait défiler exactement
   * d'une rangée (carte + écart), d'un mouvement — plus de défilement libre « corrigé » ensuite par le cran. Pavé
   * tactile (petits mouvements continus), Ctrl + molette et visionneuse ouverte : comportement normal.
   */
  /** (v2.1) envies affichées sur les tuiles : mes cartes voulues + les cartes qui me manquent dans mes familles voulues */
  const wishSet = (): Set<string> => {
    const s = new Set(backend.state.wishlist);
    if (backend.state.wishFams.length) {
      const mine = owned();
      for (const k of backend.state.wishFams) for (const c of famCards(k)) if (!mine.has(c.id)) s.add(c.id);
    }
    return s;
  };
  let famKey: string | null = null;
  q('.crumb-wish').addEventListener('click', async () => {
    if (!famKey) return;
    const wasOn = backend.state.wishFams.includes(famKey);
    try {
      await backend.toggleWishFam(famKey);
      shell.sfx.tick(wasOn ? 0.9 : 1.3, 0.05);
      toast(wasOn ? tr('coll.famWantOff') : tr('coll.famWantOn'), 'ok');
      render();
    } catch (err) {
      toast(errMsg(err), 'err');
    }
  });
  // ── (V3, lot 06 + S1) ÉCHAPPEMENT DE LA MOLETTE ─────────────────────────────────────────────────────────────────────
  /*
   * Toujours UN cran = UNE rangée (décision de Tom), mais plus de verrou de 450 ms ni de `scrollTo` « smooth » du
   * navigateur (durée imposée, cible perdue si on retournait la molette pendant le glissement) : la position suit un
   * ressort amorti court (SPRING.net, ζ ≈ 0,9) qu'on pilote nous-mêmes. Chaque cran ajoute une rangée à la CIBLE, tout de
   * suite, même en plein mouvement : 10 crans rapides = 10 rangées, d'un seul jet. Toucher, clavier, barre de défilement
   * ou un autre défilement reprennent la main à tout instant. Pendant le glissement, l'aimantation CSS (scroll-snap) est
   * suspendue (elle recalerait chaque image) ; à l'arrêt, on est pile sur un cran : elle revient sans rien bouger.
   * Butée : un tic par rangée posée (sons existants, débit limité par Sfx.tick), puis un fin reflet rasant passe une fois
   * sur la rangée arrivée sous la barre.
   */
  const esc0 = { spring: new Spring(0, SPRING.net.stiffness, SPRING.net.damping), raf: 0, last: 0, wrote: -1, row0: 0, rowH: 0, k: 0, dir: 0 };
  /** géométrie des crans (lue au cran, la mise en page est alors propre) ; null = pas une grille de tuiles */
  const notchGeom = (): { row0: number; rowH: number; max: number } | null => {
    const first = grid.firstElementChild as HTMLElement | null;
    if (grid.hidden || !first?.classList.contains('tile')) return null;
    const pad = parseFloat(getComputedStyle(el).scrollPaddingTop) || 0;
    // pas d'une rangée = écart entre le haut de deux rangées (la rangée peut être plus haute que la carte)
    let rowH = first.offsetHeight + (parseFloat(getComputedStyle(grid).rowGap) || 0);
    for (let i = 1; i < Math.min(grid.children.length, 12); i++) {
      const d = (grid.children[i] as HTMLElement).offsetTop - first.offsetTop;
      if (d > 4) {
        rowH = d;
        break;
      }
    }
    if (rowH < 40) return null;
    return { row0: Math.max(0, grid.offsetTop - pad), rowH, max: el.scrollHeight - el.clientHeight };
  };
  /** rang du cran d'une position : -1 = le haut de la page, 0 = 1re rangée calée sous la barre… */
  const notchOf = (y: number) => (y < esc0.row0 - 2 ? -1 : Math.round((y - esc0.row0) / esc0.rowH));
  const notchY = (k: number, max: number) => Math.max(0, Math.min(max, k < 0 ? 0 : esc0.row0 + k * esc0.rowH));
  function escStop() {
    if (esc0.raf) cancelAnimationFrame(esc0.raf);
    esc0.raf = 0;
    el.style.removeProperty('scroll-snap-type');
  }
  /** le reflet rasant : une fois, de gauche à droite, sur les cartes posées contre la ligne du cran */
  function rowSheen() {
    const line = el.getBoundingClientRect().top + (parseFloat(getComputedStyle(el).scrollPaddingTop) || 0);
    let col = 0;
    for (const t of grid.querySelectorAll<HTMLElement>(':scope > .tile')) {
      const top = t.getBoundingClientRect().top;
      if (top > line + 3) break;
      if (top < line - 3) continue;
      t.querySelector(':scope > .row-sheen')?.remove();
      const s = h('i', 'row-sheen');
      s.setAttribute('aria-hidden', 'true');
      t.append(s);
      const a = s.animate([{ transform: 'translateX(-60%)' }, { transform: 'translateX(60%)' }], { duration: DUR.standard(), delay: Math.min(STAGGER.max, col++ * STAGGER.serre), easing: EASING.standard, fill: 'both' });
      a.onfinish = a.oncancel = () => s.remove();
    }
  }
  function escFrame(now: number) {
    esc0.raf = 0;
    // quelqu'un d'autre a fait défiler (doigt, barre, clavier, « ↑ », visionneuse…) : il a la main
    if (Math.abs(el.scrollTop - esc0.wrote) > 2 || grid.hidden || el.classList.contains('viewing') || !el.isConnected) return escStop();
    const s = esc0.spring;
    s.update(Math.min(0.064, Math.max(0.001, (now - esc0.last) / 1000)));
    esc0.last = now;
    const max = el.scrollHeight - el.clientHeight;
    s.target = Math.min(s.target, max);
    const done = Math.abs(s.value - s.target) < 0.5 && Math.abs(s.velocity) < 20;
    const y = done ? s.target : Math.max(0, Math.min(max, s.value));
    el.scrollTop = y;
    esc0.wrote = el.scrollTop;
    // un tic quand une rangée se pose (sens du mouvement), la dernière à l'arrivée
    const f = (y - esc0.row0) / esc0.rowH;
    const seat = y < esc0.row0 - 2 ? -1 : esc0.dir > 0 ? Math.floor(f + 0.02) : Math.ceil(f - 0.02);
    if (seat !== esc0.k && (seat - esc0.k) * esc0.dir > 0) {
      esc0.k = seat;
      shell.sfx.tick(esc0.dir > 0 ? 1.08 : 0.94, 0.05);
    }
    if (!done) {
      esc0.raf = requestAnimationFrame(escFrame);
      return;
    }
    escStop();
    rowSheen();
  }
  el.addEventListener('wheel', (e) => {
    // pavé tactile (petits deltas continus), Ctrl + molette, défilement horizontal : comportement normal
    const lines = e.deltaMode !== 0; // (Firefox : crans comptés en lignes)
    if (e.ctrlKey || el.classList.contains('viewing') || (!lines && Math.abs(e.deltaY) < 40) || !e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return escStop();
    if ((e.target as HTMLElement).closest?.('.binder-pick, .viewer-ui')) return;
    const g = notchGeom();
    if (!g) return escStop();
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    const s = esc0.spring;
    const moving = esc0.raf !== 0;
    esc0.row0 = g.row0;
    esc0.rowH = g.rowH;
    // la cible avance d'un cran depuis la cible en cours (enchaînement), sinon depuis la position calée
    const k = notchOf(moving ? s.target : el.scrollTop) + dir;
    const to = notchY(k, g.max);
    if (!moving) {
      if (Math.abs(to - el.scrollTop) < 1) return;
      s.set(el.scrollTop);
      esc0.k = notchOf(el.scrollTop);
      esc0.wrote = el.scrollTop;
      esc0.last = performance.now();
      el.style.setProperty('scroll-snap-type', 'none');
      esc0.raf = requestAnimationFrame(escFrame);
    } else if (dir !== esc0.dir) {
      // demi-tour en plein glissement : les tics repartent de la rangée qu'on vient de quitter
      const f = (s.value - esc0.row0) / esc0.rowH;
      esc0.k = s.value < esc0.row0 - 2 ? -1 : dir > 0 ? Math.floor(f + 0.02) : Math.ceil(f - 0.02);
    }
    esc0.dir = dir;
    s.target = to;
  }, { passive: false });
  // le doigt, la souris (barre de défilement) ou le clavier reprennent la main tout de suite
  for (const ev of ['pointerdown', 'touchstart', 'keydown'] as const) el.addEventListener(ev, () => esc0.raf && escStop(), { passive: true });
  // (QOL 6) fil d'Ariane d'un album ouvert : thème › [famille] › album ; chaque morceau sauf le dernier est un bouton
  let trail = false;
  const midBtn = q<HTMLButtonElement>('.crumb-mid');
  const sepEls = [...el.querySelectorAll<HTMLElement>('.crumb-sep')];
  midBtn.addEventListener('click', () => {
    const g = subId ? subthemeById(subId)?.group : undefined;
    if (!g) return;
    famId = g.id;
    goAlbums();
  });
  q('.crumb-back').addEventListener('click', () => {
    if (mode === 'binder') return goBinders();
    if (trail) {
      famId = null; // premier morceau : les familles du thème
      return goAlbums();
    }
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
  // (v2.0.6, retour de Tom) hauteur de la barre collée (1 ou 2 lignes selon la largeur) : la grille s'y cale — deux
  // rangées entières sous la barre, et le défilement s'arrête au cran d'une rangée (style.css, --bar-h)
  if (typeof ResizeObserver !== 'undefined') {
    // téléphone : les barres sont un tiroir hors flux, la barre « collée » est le bouton Filtres
    const syncBar = () => el.style.setProperty('--bar-h', `${(phoneMq.matches ? fOpenBtn.offsetHeight + 8 : Math.max(cardsBar.offsetHeight, filtersEl.offsetHeight)) || 60}px`);
    const ro = new ResizeObserver(syncBar);
    ro.observe(cardsBar);
    ro.observe(filtersEl);
    ro.observe(fOpenBtn);
    phoneMq.addEventListener('change', syncBar);
  }
  // ── (15/11) affichage de la grille : 2×6, 4×8, 6×10 (voir DENS)
  /** colonnes de la grille telle qu'affichée (ordinateur : celles du choix ; téléphone : selon la largeur) */
  const gridCols = () => {
    if (flipCols !== null && !grid.hidden) return flipCols; // (V3, lot 06) lues en tête de rendu
    if (grid.hidden) return matchMedia('(min-width: 861px)').matches ? DENS.find((d) => d.id === dens)!.cols : 2;
    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
  };
  /** au moins 60 cartes, en rangées entières : la dernière rangée d'une page n'est jamais à moitié vide */
  const perPage = () => {
    const n = gridCols();
    return Math.ceil(PAGE / n) * n;
  };
  const syncDens = () => {
    el.dataset.dens = dens;
    el.querySelectorAll<HTMLButtonElement>('.cb-dens button').forEach((b) => setOn(b, b.dataset.d === dens));
  };
  /** rang (dans la liste entière) de la première carte calée sous la barre ; null = la grille n'est pas encore atteinte */
  const firstShown = (): number | null => {
    const pad = parseFloat(getComputedStyle(el).scrollPaddingTop) || 0;
    const top = el.getBoundingClientRect().top + pad;
    const tiles = [...grid.querySelectorAll<HTMLElement>('.tile')].slice(0, per);
    if (!tiles.length || tiles[0].getBoundingClientRect().top >= top - 4) return null;
    const i = tiles.findIndex((t) => t.getBoundingClientRect().bottom > top + 4);
    return i < 0 ? null : page * per + i;
  };
  const setDens = (d: Dens) => {
    if (d === dens) return;
    const at = firstShown();
    dens = d;
    try {
      localStorage.setItem(DENS_KEY, d);
    } catch {
      /* stockage bloqué : le choix vaut pour cette visite */
    }
    syncDens(); // les colonnes changent ici (CSS) : la taille de page se lit juste après
    shell.sfx.tick(1.2, 0.04);
    if (at !== null) page = Math.floor(at / perPage());
    flipSkip = true; // (V3, lot 06) la grille se recale juste après (scrollIntoView) : le fondu, pas de FLIP
    render();
    // la carte qui était en haut reste à l'écran : sa rangée se cale sous la barre, au cran ; sur ordinateur, sans dépasser
    // le dernier écran plein de la page (6×10 : la page entière tient, on la montre en entier)
    if (at === null) return;
    const tiles = [...grid.querySelectorAll<HTMLElement>('.tile')].slice(0, per);
    const i = at - page * per;
    let target = tiles[i];
    if (target && !grid.classList.contains('by-album')) {
      const cols = gridCols();
      let row = Math.floor(i / cols);
      if (matchMedia('(min-width: 861px)').matches) row = Math.min(row, Math.max(0, Math.ceil(tiles.length / cols) - DENS.find((x) => x.id === dens)!.rows));
      target = tiles[row * cols] ?? target;
    }
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  el.querySelectorAll<HTMLButtonElement>('.cb-dens button').forEach((b) => b.addEventListener('click', () => setDens(b.dataset.d as Dens)));
  syncDens();
  {
    // rotation du téléphone, fenêtre redimensionnée : le nombre de colonnes change → des pages en rangées entières
    let t = 0;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        if (grid.hidden || !el.isConnected || perPage() === per) return;
        page = Math.floor((page * per) / perPage());
        render();
      }, 200);
    });
  }
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
    for (const [id, label] of [['', tr('coll.all')], ...ALL_THEMES.filter((t) => t.cards.length).map((t) => [t.id, t.label])] as Array<[string, string]>) {
      const b = h('button', '', esc(label));
      b.dataset.th = id;
      b.addEventListener('click', () => ((cTheme = id), (page = 0), render()));
      tb.append(b);
    }
    const sb = q('.cb-stars');
    for (const r of [...STAR_ORDER, 'secret'] as RarityId[]) {
      const b = h('button', 'chip', r === 'secret' ? '✷' : `${rarity(r).rank + 1}★`);
      b.title = rarity(r).label;
      b.setAttribute('aria-label', r === 'secret' ? tr('coll.secrets') : tr('coll.starsOf', { n: rarity(r).rank + 1, label: rarity(r).label }));
      b.style.setProperty('--rc', rarity(r).hex);
      b.style.setProperty('--rt', rcText(r));
      b.dataset.r = r;
      b.addEventListener('click', () => ((cStar = cStar === r ? null : r), (page = 0), render()));
      sb.append(b);
    }
    el.querySelectorAll<HTMLButtonElement>('.cb-sort button').forEach((b) => b.addEventListener('click', () => ((cSort = b.dataset.s as CardSort), (page = 0), render())));
    q('.cb-dups').addEventListener('click', () => ((cDups = !cDups), (page = 0), render()));
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
  /** (patch v2.1.30, QOL 1-2) ouvre un album de n'importe quel thème (recherche, visionneuse, intertitre, récents) */
  function openAlbum(id: string) {
    const st = subthemeById(id);
    if (!st || !st.cards.length) return;
    const t = ALL_THEMES.find((x) => x.id === st.themeId);
    if (t) theme = t;
    famId = st.group?.id ?? null;
    star = null;
    shell.sfx.tick(1.2, 0.04);
    goGrid(id);
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

  /** (V3, lot 06) comptes de la collection (onglets, progression), refaits seulement quand la collection change */
  const counts = new Map<string, unknown>();
  let countsFor: readonly PlayerCard[] | null = null;
  function countMemo<T>(key: string, f: () => T): T {
    if (countsFor !== backend.state.collection) {
      counts.clear();
      countsFor = backend.state.collection;
    }
    if (counts.has(key)) return counts.get(key) as T;
    const v = f();
    counts.set(key, v);
    return v;
  }
  function renderTabs(mine: Map<string, PlayerCard>) {
    tabs.innerHTML = '';
    for (const t of ALL_THEMES) {
      // (audit 12/11, A4-03) compté sans tableau intermédiaire (≈ 37 000 cartes par rendu)
      // (V3, lot 06) … et une seule fois par état de la collection : un tri ou un filtre ne le refait plus
      const n = countMemo(`tab|${t.id}|${t.cards.length}`, () => {
        let k = 0;
        for (const c of t.cards) if (mine.has(c.id)) k++;
        return k;
      });
      const on = (mode === 'albums' || mode === 'grid') && t === theme;
      const b = h('button', `tab${on ? ' on' : ''}${t.secret ? ' secret' : ''}${t.cards.length ? '' : ' soon'}`, `${esc(t.label)} <span>${t.cards.length ? `${fmtN(n)}/${fmtN(t.cards.length)}` : tr('common.soon')}</span>`);
      b.addEventListener('click', () => {
        theme = t;
        star = null;
        famId = null;
        alSearch.value = '';
        albumQuery = '';
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
      if (b.dataset.v === 'binders') b.innerHTML = tr('coll.bindersTab', { x: backend.state.binders.length ? ` <em>${fmtN(backend.state.binders.length)}</em>` : '' });
      // compteur de doublons brûlables (1 exemplaire gardé, secrètes et exemplaires engagés exclus)
      if (b.dataset.v === 'forge') {
        b.hidden = !forgeOpen();
        b.innerHTML = tr('coll.forgeTab', { x: nForge ? ` <em>${fmtN(nForge)}</em>` : '' });
        b.setAttribute('aria-label', nForge ? tr('coll.forgeAria', { n: nForge, nf: fmtN(nForge) }) : 'Forge'); // i18n-ok
      }
      // (v2.1.40) contrats retirés le 01/12 0 h (Paris) : plus d'onglet
      if (b.dataset.v === 'contrats') b.hidden = contractsRetired(Date.now());
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
    const st = !inCards && subId ? subthemeById(subId) : null;
    const label = inCards ? (ct ? ct.label : tr('coll.inTotal')) : st ? st.label : theme.label;
    // (audit 12/11, A4-03) UN passage sur les cartes (jusqu'à 37 000) au lieu de 14 : possédées, doublons, et par étoile
    // (V3, lot 06) mémorisé par état de la collection et par périmètre (la taille des sets suit leur chargement) : un tri
    // ou un filtre de la grille ne repasse plus sur les 37 000 cartes
    const scopeKey = inCards ? `c|${ct ? `${ct.id}|${ct.cards.length}` : ALL_THEMES.map((t) => (t.secret ? 0 : t.cards.length)).join(',')}` : `t|${theme.id}|${theme.cards.length}|${subId ?? ''}`;
    const { total, have, dups, starTot, starHave } = countMemo(`prog|${scopeKey}`, () => {
      const cards = inCards ? (ct ? ct.cards : ALL_THEMES.filter((t) => !t.secret).flatMap((t) => t.cards)) : scope();
      let have = 0, dups = 0;
      const starTot = new Map<string, number>(), starHave = new Map<string, number>();
      for (const c of cards) {
        const m = mine.get(c.id);
        starTot.set(c.rarity, (starTot.get(c.rarity) ?? 0) + 1);
        if (!m) continue;
        have++;
        dups += Math.max(0, (m.count ?? 0) - 1);
        starHave.set(c.rarity, (starHave.get(c.rarity) ?? 0) + 1);
      }
      return { total: cards.length, have, dups, starTot, starHave };
    });
    const pct = total ? (have / total) * 100 : 0;
    const per = (inCards ? ct?.secret : theme.secret)
      ? ''
      : STAR_ORDER.map((r) => {
          const cs = { length: starTot.get(r) ?? 0 };
          const n = starHave.get(r) ?? 0;
          const full = cs.length > 0 && n === cs.length;
          return `<div class="ps${full ? ' done' : ''}" style="--rc:${rarity(r).hex};--rt:${rcText(r)}" title="${rarity(r).label}${full ? tr('coll.allFound') : ''}"><b>${rarity(r).rank + 1}★</b><span class="bar"><i data-w="${cs.length ? (n / cs.length) * 100 : 0}"></i></span><em>${fmtN(n)}/${fmtN(cs.length)}${full ? ' ✓' : ''}</em></div>`;
        }).join('');
    const albumsN = inCards || subId ? 0 : theme.subthemes.filter((s) => s.cards.length).length;
    progress.innerHTML = `
      <div class="p-main"><div class="p-pct${total && have === total ? ' full' : ''}">${fmtPct(pct).replace(/\s?%$/, '')}<small>${lang() === 'fr' ? ' %' : '%'}</small></div>
        <div class="p-txt"><b>${fmtN(have)}</b> ${tr('coll.uniqueOf', { total: fmtN(total), label: esc(label), albums: albumsN ? ` · ${plural(albumsN, 'album')}` : '' })}<br><span>${mine.size === 0 && signedOut() ? (backend.state.ready ? tr('coll.notLogged') : tr('coll.connecting')) : mine.size === 0 ? '' + tr('coll.empty') + ' <a class="p-link" href="#/">' + tr('coll.openFirst') + '</a>' : dups ? `${plural(dups, 'doublon')} · <a class="p-link" href="#/contrats">${tr('coll.burn')}</a> ${tr('coll.orTrade')}` : total && have === total ? tr('coll.complete') : tr('coll.noDup')}</span></div></div>
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
          txt.textContent = fmtPct(pct * e).replace(/\s?%$/, '');
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
  const pinHtml = (s: SubTheme) => {
    const on = pins.includes(s.id);
    return `<span class="al-star${on ? ' on' : ''}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${tr(on ? 'coll.unpinA' : 'coll.pinA', { name: esc(s.label) })}" title="${tr(on ? 'coll.unpinAlbum' : 'coll.pinAlbum')}">${on ? '★' : '☆'}</span>`;
  };
  function albumTile(s: SubTheme, mine: Map<string, PlayerCard>, showGrp: boolean, miss = 0): HTMLElement {
    const st = albumStat(s, mine);
    const soon = !s.cards.length;
    const cover = soon ? null : albumCover(s, mine);
    const a = h('button', `album${soon ? ' soon' : ''}${st.total && st.have === st.total ? ' full' : ''}`);
    a.dataset.sub = s.id;
    a.style.setProperty('--h', String(hueOf(s.id)));
    a.innerHTML = `
        <span class="al-cover">${cover ? `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(cover.entry)}">` : `<span class="al-ph">${esc((s.code || s.label).slice(0, 3).toUpperCase())}</span>`}${cover?.manual ? `<span class="al-pin" title="${tr('coll.coverMine')}">📌</span>` : ''}${soon ? '<span class="al-soon">' + tr('common.soonCaps') + '</span>' : ''}</span>
        <span class="al-name">${esc(s.label)}</span>
        ${s.group && showGrp ? `<span class="al-grp">${esc(s.group.label)}</span>` : ''}
        <span class="al-n">${soon ? tr('coll.inPrep') : `${fmtN(st.have)} / ${fmtN(st.total)}`}${miss ? ` <b class="al-miss" title="${tr('coll.missN', { n: miss })}">−${miss}</b>` : ''}</span>
        <span class="al-bar"><i style="width:${Math.max(0, st.pct) * 100}%"></i></span>${soon ? '' : pinHtml(s)}`;
    a.disabled = soon;
    a.title = soon ? tr('coll.soonOf', { label: s.label }) : tr('coll.albumOf', { label: s.label, have: fmtN(st.have), total: fmtN(st.total) });
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
    const tg = e.target as HTMLElement;
    const pin = tg.closest<HTMLElement>('.al-star');
    if (pin) {
      e.stopPropagation();
      const id = pin.closest<HTMLElement>('.album')?.dataset.sub;
      if (id) togglePin(id);
      return;
    }
    // recherche : cartes trouvées, « voir les N cartes », « + N albums »
    if (tg.closest('.tile')) return clickTile(e, 'search');
    const allC = tg.closest<HTMLElement>('.al-allcards');
    if (allC) return seeAllCards(allC.dataset.th ?? '');
    const moreA = tg.closest<HTMLElement>('.al-moreal');
    if (moreA) return void moreA.dispatchEvent(new CustomEvent('more'));
    const a = tg.closest<HTMLButtonElement>('.album');
    if (!a || a.disabled) return;
    if (a.dataset.fam) {
      famId = a.dataset.fam;
      shell.sfx.tick(1.2, 0.04);
      render();
      toTop();
    } else if (a.dataset.sub) openAlbum(a.dataset.sub);
  });
  alGrid.addEventListener('keydown', (e) => {
    const pin = (e.target as HTMLElement).closest<HTMLElement>('.al-star');
    if (!pin || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    const id = pin.closest<HTMLElement>('.album')?.dataset.sub;
    if (id) togglePin(id);
  });
  /** « Voir les N cartes » d'un thème : la vue Cartes, filtrée sur ce thème et la même recherche */
  function seeAllCards(th: string) {
    const inp = q<HTMLInputElement>('.cb-search');
    inp.value = alSearch.value.trim();
    cQuery = fold(inp.value);
    cTheme = th;
    cStar = null;
    cDups = false;
    goCards();
  }

  // (patch v2.1.30, QOL 1) RECHERCHE UNIQUE : albums des 5 thèmes (nom, famille, ou une carte dedans) + noms de cartes,
  // groupés par thème. Index des noms repliés fait une fois (≈ 40 000 cartes), puis un seul passage par frappe.
  const SEARCH_ALBUMS = 8;
  const SEARCH_CARDS = 12;
  let nameIdx: Array<{ e: CatalogEntry; n: string }> | null = null;
  const buildIdx = () =>
    (nameIdx ??= ALL_THEMES.filter((t) => !t.secret)
      .flatMap((t) => t.cards)
      .filter((e) => e.rarity !== 'secret')
      .map((e) => ({ e, n: fold(e.name) })));
  let collator: Intl.Collator | null = null;
  let collatorLang = '';
  const coll = () => (collatorLang === locale() && collator ? collator : ((collatorLang = locale()), (collator = new Intl.Collator(collatorLang))));
  const subFold = new Map<string, string>();
  const foldSub = (s: SubTheme) => {
    let v = subFold.get(s.id);
    if (v === undefined) subFold.set(s.id, (v = `${fold(s.label)}\n${s.group ? fold(s.group.label) : ''}`));
    return v;
  };
  let searchShown: CatalogEntry[] = [];
  let searchGen = 0;
  function renderSearch(mine: Map<string, PlayerCard>) {
    const gen = ++searchGen;
    const qq = albumQuery;
    const cardsOn = qq.length >= 2 || /^\d+$/.test(qq);
    const inSub = new Map<string, number>();
    const cardsBy = new Map<string, CatalogEntry[]>();
    if (cardsOn) {
      for (const { e, n } of buildIdx()) {
        if (!n.includes(qq)) continue;
        inSub.set(e.subthemeId, (inSub.get(e.subthemeId) ?? 0) + 1);
        let l = cardsBy.get(e.themeId);
        if (!l) cardsBy.set(e.themeId, (l = []));
        l.push(e);
      }
    }
    // tri de chaque thème (rapide) ; les tuiles arrivent ensuite thème par thème, une image chacun, pour que la saisie
    // au téléphone ne bloque pas (création des tuiles ≈ 6 ms par thème au processeur ×4)
    const found: Array<{ t: ThemeInfo; subs: SubTheme[]; cards: CatalogEntry[] }> = [];
    let nAlb = 0;
    let nCards = 0;
    for (const t of ALL_THEMES) {
      if (t.secret) continue;
      const subs = t.subthemes.filter((s) => s.cards.length && (foldSub(s).includes(qq) || inSub.has(s.id)));
      const cards = cardsBy.get(t.id) ?? [];
      if (!subs.length && !cards.length) continue;
      nAlb += subs.length;
      nCards += cards.length;
      // albums : nom trouvé d'abord, puis ceux qui contiennent le plus de cartes trouvées (la progression n'est calculée
      // que pour les 8 affichés)
      const byName = (s: SubTheme) => (foldSub(s).includes(qq) ? 0 : 1);
      subs.sort((a, b) => byName(a) - byName(b) || (inSub.get(b.id) ?? 0) - (inSub.get(a.id) ?? 0) || coll().compare(a.label, b.label));
      // cartes : les miennes d'abord, les plus rares devant, puis A → Z
      cards.sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || RANK[b.rarity] - RANK[a.rarity] || coll().compare(a.name, b.name));
      found.push({ t, subs, cards });
    }
    q('.al-count').textContent = [plural(nAlb, 'album'), cardsOn ? plural(nCards, 'carte') : ''].filter(Boolean).join(' · ');
    albumIo?.disconnect();
    alGrid.replaceChildren();
    alGrid.classList.remove('grouped');
    alGrid.classList.add('searching');
    searchShown = [];
    if (!found.length) {
      alGrid.append(h('div', 'empty', tr('coll.noSearchMatch', { q: esc(alSearch.value.trim()) })));
      return;
    }
    const wish = wishSet();
    const section = ({ t, subs, cards }: (typeof found)[number]) => {
      const sec = h('section', 'al-ths');
      sec.append(h('h3', 'al-th', `<b>${esc(t.label)}</b><span>${[subs.length ? plural(subs.length, 'album') : '', cards.length ? plural(cards.length, 'carte') : ''].filter(Boolean).join(' · ')}</span>`));
      if (subs.length) {
        const box = h('div', 'al-grid al-inner');
        for (const s of subs.slice(0, SEARCH_ALBUMS)) box.append(albumTile(s, mine, true));
        sec.append(box);
        if (subs.length > SEARCH_ALBUMS) {
          const more = h('button', 'btn-ghost al-moreal', tr('coll.moreAlbums', { n: fmtN(subs.length - SEARCH_ALBUMS) }));
          more.addEventListener('more', () => {
            more.remove();
            fillAlbums(box, subs.slice(SEARCH_ALBUMS), mine, true);
          });
          sec.append(more);
        }
      }
      if (cards.length) {
        const g = h('div', 'grid al-cards');
        const shown = cards.slice(0, SEARCH_CARDS);
        for (const e of shown) g.append(tileFor(e, mine, wish));
        searchShown.push(...shown);
        sec.append(g);
        preloadThumbs(shown.filter((e) => mine.has(e.id)), true);
        if (cards.length > SEARCH_CARDS) {
          const all = h('button', 'btn-ghost al-allcards', tr('coll.allCards', { n: fmtN(cards.length) }));
          all.dataset.th = t.id;
          sec.append(all);
        }
      }
      alGrid.append(sec);
    };
    section(found[0]);
    let k = 1;
    const next = () => {
      if (gen !== searchGen || !alGrid.isConnected || k >= found.length) return;
      section(found[k++]);
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }
  /** (patch v2.1.30, QOL 3) épinglés puis récents, en tête de la vue Albums (niveau des familles) */
  function quickRow(mine: Map<string, PlayerCard>): DocumentFragment {
    const frag = document.createDocumentFragment();
    const ok = (id: string) => {
      const s = subthemeById(id);
      return s && s.cards.length && !s.themeId.startsWith('bebous') ? s : null;
    };
    const pinned = pins.map(ok).filter((s): s is SubTheme => !!s);
    const recent = recents.filter((id) => !pins.includes(id)).map(ok).filter((s): s is SubTheme => !!s);
    // (QOL 4) « presque finis » : 1 à 3 cartes manquantes, tous thèmes, les plus proches d'abord (calculé sur l'état déjà en mémoire)
    const almost = SUBTHEMES.flatMap((s) => {
      if (!ok(s.id) || themeById(s.themeId)?.secret) return [];
      const st = albumStat(s, mine);
      const missing = st.total - st.have;
      return st.have > 0 && missing >= 1 && missing <= ALMOST_MAX ? [{ s, missing }] : [];
    })
      .sort((a, b) => a.missing - b.missing || a.s.label.localeCompare(b.s.label, locale()))
      .slice(0, ALMOST_ROW)
      .map((x) => x.s);
    for (const [label, list] of [[tr('coll.pinnedAlbums'), pinned], [tr('coll.recentAlbums'), recent], [tr('coll.almostDone'), almost]] as const) {
      if (!list.length) continue;
      const sec = h('section', 'al-quick');
      sec.append(h('h3', 'al-th', `<b>${label}</b>`));
      const row = h('div', 'al-row');
      // (v2.1.34, report) « −N » sur les pochettes de la rangée « Presque finis » seulement
      for (const s of list) row.append(albumTile(s, mine, true, list === almost ? albumStat(s, mine).total - albumStat(s, mine).have : 0));
      sec.append(row);
      frag.append(sec);
    }
    return frag;
  }
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
    a.title = tr('coll.viewOf', { label: v.label, live, unit, have: fmtN(have), total: fmtN(total) });
    return a;
  }
  function renderAlbums(mine: Map<string, PlayerCard>) {
    el.querySelectorAll<HTMLButtonElement>('.al-sort button').forEach((b) => setOn(b, b.dataset.s === albumSort));
    const sig = collectionSig(backend.state);
    const cSig = JSON.stringify(backend.state.covers);
    if (sig !== albumMemoSig) ((albumMemoSig = sig), statMemo.clear(), coverMemo.clear());
    if (cSig !== coverMemoSig) ((coverMemoSig = cSig), coverMemo.clear());
    const opened = openGroups.get(theme.id);
    const key = `${theme.id}|${famId ?? '*'}|${albumSort}|${albumQuery}|${sig}|${cSig}|${opened ? [...opened].join(',') : '-'}|${pins.join(',')}|${recents.join(',')}|${albumQuery ? backend.state.wishlist.length : ''}`;
    // rien n'a changé (une envie, un retour de la visionneuse…) : on garde la mosaïque telle quelle
    if (key === albumKey && alGrid.childElementCount) return;
    albumKey = key;
    // (retours 05/11) sans recherche ni famille ouverte : le niveau des FAMILLES (les sous-thèmes sans groupe restent
    // des albums à part entière, mêlés aux familles)
    // (patch v2.1.30) « Par groupe » servait à chercher dans un thème : la recherche couvre maintenant les 5 thèmes
    el.querySelector<HTMLElement>('.al-sort [data-s="group"]')!.hidden = true;
    q('.al-sort').hidden = !!albumQuery;
    alGrid.classList.remove('searching');
    if (albumQuery) return renderSearch(mine);
    if (!nameIdx) (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300)))(() => void buildIdx());
    if (!famId) {
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
      const sorted = albumSort === 'alpha' || albumSort === 'group' ? [...views].sort((a, b) => a.label.localeCompare(b.label, locale()))
        : albumSort === 'completion' ? [...views].sort((a, b) => stv(b).pct - stv(a).pct || stv(b).have - stv(a).have)
        : [...views].sort((a, b) => stage(a) - stage(b) || stv(b).have - stv(a).have || 0);
      q('.al-count').textContent = plural(views.length, 'famille');
      albumIo?.disconnect();
      alGrid.replaceChildren();
      alGrid.classList.remove('grouped');
      const frag = document.createDocumentFragment();
      const quick = quickRow(mine);
      if (quick.childNodes.length) {
        alGrid.classList.add('searching');
        const box = h('div', 'al-grid al-inner');
        for (const v of sorted) box.append(v.group ? familyTile(v, mine) : albumTile(v.subs[0], mine, false));
        frag.append(quick, h('h3', 'al-th', `<b>${esc(theme.label)}</b><span>${plural(views.length, 'famille')}</span>`), box);
      } else for (const v of sorted) frag.append(v.group ? familyTile(v, mine) : albumTile(v.subs[0], mine, false));
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
    if (albumSort === 'progress') subs = [...subs].sort((a, b) => stage(a) - stage(b) || (stage(a) === 0 ? st(b).have - st(a).have || st(b).pct - st(a).pct : stage(a) === 1 ? st(b).total - st(a).total : 0) || a.label.localeCompare(b.label, locale()));
    else if (albumSort === 'completion') subs = [...subs].sort((a, b) => st(b).pct - st(a).pct || st(b).have - st(a).have || a.label.localeCompare(b.label, locale()));
    else if (albumSort === 'alpha') subs = [...subs].sort((a, b) => a.label.localeCompare(b.label, locale()));
    else subs = [...subs].sort((a, b) => grpLabel(a).localeCompare(grpLabel(b), locale()) || a.label.localeCompare(b.label, locale()));
    q('.al-count').textContent = `${plural(subs.filter((s) => s.cards.length).length, 'album')}`;
    albumIo?.disconnect();
    alGrid.replaceChildren();
    alGrid.classList.toggle('grouped', albumSort === 'group');
    if (!subs.length) {
      alGrid.append(h('div', 'empty', albumQuery ? tr('coll.noAlbumMatch', { q: esc(alSearch.value.trim()) }) : tr('coll.noAlbum')));
      return;
    }
    // le nom du groupe sur chaque pochette n'aide que s'il y a plusieurs groupes à l'écran
    const showGrp = albumSort !== 'group' && new Set(subs.map(grpLabel)).size > 2;
    if (albumSort !== 'group') return fillAlbums(alGrid, subs, mine, showGrp);
    // « Par groupe » : un bloc repliable par groupe, construit à l'ouverture
    const groups = new Map<string, SubTheme[]>();
    for (const s of subs) {
      const g = grpLabel(s) || tr('coll.subthemes');
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
      d.innerHTML = `<summary><b>${esc(g)}</b><span>${tr('coll.started', { nf: fmtN(started), albums: plural(list.length, 'album'), n: started, have: fmtN(have), total: fmtN(total), pct: fmtPct(total ? (have / total) * 100 : 0) })}</span></summary>`;
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
      b.title = wish.has(e.id) ? tr('coll.unwish') : tr('coll.wish');
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
  // ── (V3, lot 06) TUILES RECYCLÉES + FLIP ──────────────────────────────────────────────────────────────────────────
  /*
   * Changer de tri, d'étoile, de thème ou de filtre refaisait les 60 tuiles : nouvelles images, vraie carte reposée
   * après décodage (l'aperçu clignotait une ou deux images), et un `offsetWidth` forcé pour rejouer le fondu de la
   * grille. Maintenant une carte déjà affichée GARDE sa tuile (même état : exemplaires, nouvelle, envie, langue) ; les
   * tuiles visibles glissent de leur ancienne place à la nouvelle (FLIP), les nouvelles venues apparaissent en fondu. Un
   * changement de page (rien en commun à l'écran) garde le fondu de la grille d'avant, sans mise en page forcée.
   */
  /** tuiles du dernier rendu, par carte (`id|rareté`) avec leur état ; `poolNext` : celles du rendu en cours */
  let pool = new Map<string, { t: HTMLElement; sig: string }>();
  let poolNext = new Map<string, { t: HTMLElement; sig: string }>();
  /** positions à l'écran AVANT le rendu (lues en tête de `render`, la mise en page est alors propre) */
  let flipFirst: Map<Element, DOMRect> | null = null;
  const flipAnims = new Set<Animation>();
  const gridTiles = () => grid.querySelectorAll<HTMLElement>(':scope > .tile, :scope > .cards-alb > .tile');
  let flipSkip = false;
  function flipCapture() {
    flipFirst = null;
    const skip = flipSkip;
    flipSkip = false;
    if (skip || grid.hidden || !(mode === 'cards' || mode === 'grid')) return;
    flipCols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
    const m = new Map<Element, DOMRect>();
    const vh = innerHeight;
    for (const t of gridTiles()) {
      const r = t.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) m.set(t, r);
    }
    // un FLIP encore en cours : sa position du moment est la bonne origine, puis on le lâche
    for (const a of flipAnims) a.cancel();
    flipAnims.clear();
    flipFirst = m;
    // clavier : la tuile qui a le focus le garde si elle reste dans la grille (replaceChildren le lui ôterait)
    const f = document.activeElement;
    flipFocus = f instanceof HTMLElement && f.classList.contains('tile') && grid.contains(f) ? f : null;
  }
  let flipFocus: HTMLElement | null = null;
  /** tuile d'une carte : celle du rendu précédent si rien n'a changé pour elle, sinon une neuve */
  function takeTile(key: string, sig: string, make: () => HTMLElement): HTMLElement {
    const p = pool.get(key);
    const t = p && p.sig === sig && !poolNext.has(key) ? p.t : make();
    if (!poolNext.has(key)) poolNext.set(key, { t, sig });
    return t;
  }
  const tileSig = (e: CatalogEntry, mine: Map<string, PlayerCard>, wish: Set<string> | null) => {
    const have = mine.get(e.id);
    return `${lang()}|${have ? have.count : '-'}|${fresh.has(e.id) ? 1 : 0}|${wish?.has(e.id) ? 1 : 0}`;
  };
  /** la grille vient d'être refaite (null = pas de grille dans ce rendu) ; true = autre contenu qu'avant */
  let flipChanged: boolean | null = null;
  /** colonnes lues en tête de rendu (mise en page propre) : plus de style recalculé de force au milieu du rendu */
  let flipCols: number | null = null;
  /**
   * En fin de `render` (tout le DOM du rendu est posé : une seule mise en page) : les tuiles visibles glissent de leur
   * ancienne place, les nouvelles entrent en fondu.
   */
  function flipPlay() {
    const first = flipFirst, changed = flipChanged;
    flipFirst = null;
    flipChanged = null;
    flipCols = null;
    const focus = flipFocus;
    flipFocus = null;
    if (changed === null) return;
    pool = poolNext;
    poolNext = new Map();
    if (focus?.isConnected && document.activeElement !== focus && grid.contains(focus)) focus.focus({ preventScroll: true });
    if (!changed) return;
    const vh = innerHeight;
    const enter: HTMLElement[] = [];
    let kept = 0;
    if (first?.size) {
      for (const t of gridTiles()) {
        const f = first.get(t);
        const r = t.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= vh) continue;
        if (!f) {
          enter.push(t);
          continue;
        }
        kept++;
        const dx = f.left - r.left, dy = f.top - r.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        const a = t.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: DUR.standard(), easing: EASING.standard });
        flipAnims.add(a);
        a.onfinish = a.oncancel = () => flipAnims.delete(a);
      }
    }
    // rien en commun à l'écran (autre page, autre album) : le fondu de la grille d'avant (style.css, grid-in)
    if (!kept) {
      grid.animate([{ opacity: 0.25, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: DUR.emphatique(), easing: EASING.entree });
      return;
    }
    for (const t of enter) t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.standard(), easing: EASING.entree });
  }

  let shownList: CatalogEntry[] = [];
  let lastKey = '';
  function renderGrid(mine: Map<string, PlayerCard>) {
    grid.classList.remove('by-album');
    const fb = q<HTMLButtonElement>('.f-fresh');
    fb.hidden = fresh.size === 0;
    fb.textContent = tr('coll.newN', { n: fmtN(fresh.size) });
    if (filter === 'fresh' && !fresh.size) filter = 'all';
    el.querySelectorAll<HTMLButtonElement>('.filters .seg:not(.sortf, .cb-dens) button').forEach((b) => setOn(b, b.dataset.f === filter));
    el.querySelectorAll<HTMLButtonElement>('.sortf button').forEach((b) => setOn(b, b.dataset.s === sort));
    starf.hidden = !!theme.secret;
    starf.querySelectorAll<HTMLElement>('.chip').forEach((b) => setOn(b, b.dataset.r === star));
    const list = sortList(scope().filter((e) => matches(e, mine)), mine);
    const key = `${theme.id}|${subId}|${filter}|${star}|${sort}|${query}|${page}|${dens}`;
    // (V3, lot 06) contenu changé : FLIP des tuiles gardées (flipPlay) au lieu du fondu rejoué par mise en page forcée
    const changed = key !== lastKey && !!lastKey;
    lastKey = key;
    per = perPage();
    const pages = Math.max(1, Math.ceil(list.length / per));
    if (page >= pages) page = pages - 1;
    const wish = wishSet();
    const frag = document.createDocumentFragment();
    for (const e of list.slice(page * per, (page + 1) * per)) frag.append(takeTile(`${e.id}|${e.rarity}`, tileSig(e, mine, wish), () => tileFor(e, mine, wish)));
    grid.replaceChildren(frag);
    flipChanged = changed;
    shownList = list;
    preloadThumbs(list.slice(page * per, (page + 1) * per), true); // la page affichée passe devant (PERF2-04)
    renderPager(pages, list.length);
    const active = activeFilters();
    renderActive(active);
    empty.hidden = list.length > 0;
    // état vide JUSTE quand plusieurs filtres se cumulent (« Manquantes + 5★ » ≠ « tu les as toutes »), audit UX3-02
    const alone = active.length === 1;
    empty.innerHTML = fr(!theme.cards.length
      ? tr('coll.themeSoon', { list: esc(theme.subthemes.map((s) => s.label).join(', ')) })
      : alone && filter === 'dups'
        ? tr('coll.noDupHere')
        : alone && filter === 'owned'
          ? tr('coll.nothingOpen')
          : alone && filter === 'missing'
            ? tr('coll.allOwned')
            : alone && filter === 'fresh'
              ? tr('coll.noNew')
              : active.length
                ? tr('coll.noneFor', { what: esc(active.join(' + ')) })
                : tr('coll.noneHere')) + (active.length && theme.cards.length ? ' <button class="btn-ghost f-reset">' + tr('coll.resetFilters') + '</button>' : '');
  }
  /** filtres actifs (différents du défaut) de la vue courante, en clair : « Manquantes », « 5★ », « « pika » » */
  function activeFilters(): string[] {
    const starL = (r: RarityId | null) => (r ? (r === 'secret' ? tr('coll.secretF') : `${rarity(r).rank + 1}★`) : '');
    if (mode === 'cards') {
      const v = q<HTMLInputElement>('.cb-search').value.trim();
      return [cTheme && (ALL_THEMES.find((t) => t.id === cTheme)?.label ?? ''), starL(cStar), cQuery && `« ${v} »`].filter((x): x is string => !!x);
    }
    return [filter !== 'all' ? FILTER_LABEL()[filter] : '', starL(star), query ? `« ${search.value.trim()} »` : ''].filter((x) => !!x);
  }
  /** bandeau « Filtres actifs : … · Réinitialiser » (les filtres de la grille sont mémorisés d'une visite à l'autre) */
  function renderActive(active: string[]) {
    fActive.hidden = !active.length;
    if (active.length) fActive.innerHTML = `<span>Filtres actifs : <b>${esc(active.join(' · '))}</b></span><button class="f-reset">${tr('coll.reset')}</button>`;
  }
  /** remet les filtres de la vue courante à zéro (les tris, eux, restent) */
  function resetFilters() {
    if (mode === 'cards') {
      cTheme = '';
      cStar = null;
      cQuery = '';
      cDups = false;
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
    out.sort((a, b) => (THEME_ORDER.get(a.themeId) ?? 9) - (THEME_ORDER.get(b.themeId) ?? 9) || subLabel(a).localeCompare(subLabel(b), locale()) || a.num - b.num);
    return { list: out, more };
  }
  /** (patch v2.1.30, QOL 2) l'intertitre d'album de la vue Cartes ouvre l'album */
  function subHead(hd: HTMLElement, e: CatalogEntry): HTMLElement {
    const st = subthemeById(e.subthemeId);
    if (!st || !st.cards.length || e.themeId.startsWith('bebous')) return hd;
    hd.dataset.sub = st.id;
    hd.classList.add('to-album');
    hd.setAttribute('role', 'link');
    hd.tabIndex = 0;
    hd.title = tr('coll.openAlbum', { name: st.label });
    return hd;
  }
  /** VUE CARTES (défaut, retours live n°1) : toutes mes cartes, les plus rares en haut ; tri, étoile, thème, recherche. */
  function renderCards(mine: Map<string, PlayerCard>) {
    q('.cb-theme').querySelectorAll<HTMLButtonElement>('button').forEach((b) => setOn(b, b.dataset.th === cTheme));
    q('.cb-stars').querySelectorAll<HTMLElement>('.chip').forEach((b) => setOn(b, b.dataset.r === cStar));
    el.querySelectorAll<HTMLButtonElement>('.cb-sort button').forEach((b) => setOn(b, b.dataset.s === cSort));
    q('.cb-dups').classList.toggle('on', cDups);
    q('.cb-dups').setAttribute('aria-pressed', String(cDups));
    let list: CatalogEntry[] = [];
    for (const id of mine.keys()) {
      const e = catalogEntry(id);
      if (!e) continue;
      if (cTheme && e.themeId !== cTheme) continue;
      if (cStar && e.rarity !== cStar) continue;
      if (cQuery && !cardHit(e)) continue;
      if (cDups && (mine.get(id)?.count ?? 0) < 2) continue;
      list.push(e);
    }
    const date = (e: CatalogEntry) => mine.get(e.id)?.firstPulledAt ?? 0;
    const subLabel = (e: CatalogEntry) => subthemeById(e.subthemeId)?.label ?? '';
    if (cSort === 'rarity') list.sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || date(b) - date(a) || a.name.localeCompare(b.name, locale()));
    else if (cSort === 'date') list.sort((a, b) => date(b) - date(a) || RANK[b.rarity] - RANK[a.rarity]);
    else if (cSort === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name, locale()));
    else list.sort((a, b) => (THEME_ORDER.get(a.themeId) ?? 9) - (THEME_ORDER.get(b.themeId) ?? 9) || subLabel(a).localeCompare(subLabel(b), locale()) || a.num - b.num);
    const key = `cards|${cTheme}|${cStar}|${cSort}|${cQuery}|${cDups}|${page}|${dens}`;
    // (V3, lot 06) contenu changé : FLIP des tuiles gardées (flipPlay) au lieu du fondu rejoué par mise en page forcée
    const changed = key !== lastKey && !!lastKey;
    lastKey = key;
    per = perPage();
    const pages = Math.max(1, Math.ceil(list.length / per));
    if (page >= pages) page = pages - 1;
    const frag = document.createDocumentFragment();
    const tile = (e: CatalogEntry) => takeTile(`${e.id}|${e.rarity}`, tileSig(e, mine, null), () => cardTile(e.id, e.rarity, { owned: true, count: mine.get(e.id)!.count, fresh: fresh.has(e.id) }));
    const slice = list.slice(page * per, (page + 1) * per);
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
        blk.append(subHead(h('h4', 'cards-sub', `<span>${esc(subLabel(e0))}</span><small>${esc(themeById(e0.themeId)?.label ?? '')} · ${n}</small>`), e0));
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
      const wish = wishSet();
      frag.append(h('h4', 'cards-sub cards-cat', `${tr('coll.inCatalog')}<small>${cat.more ? tr('coll.firstOf', { n: fmtN(CATALOG_CAP), total: fmtN(CATALOG_CAP + cat.more) }) : plural(cat.list.length, 'carte')}</small>`));
      let lastCat = '';
      for (const e of cat.list) {
        if (e.subthemeId !== lastCat) {
          lastCat = e.subthemeId;
          frag.append(subHead(h('h4', 'cards-sub cards-cat-sub', `${esc(subLabel(e))}<small>${esc(themeById(e.themeId)?.label ?? '')}</small>`), e));
        }
        frag.append(takeTile(`${e.id}|${e.rarity}`, tileSig(e, mine, wish), () => tileFor(e, mine, wish)));
      }
    }
    grid.replaceChildren(frag);
    flipChanged = changed;
    shownList = list;
    preloadThumbs(list.slice(page * per, (page + 1) * per), true); // la page affichée passe devant (PERF2-04)
    renderPager(pages, list.length);
    const active = activeFilters();
    renderActive(active);
    empty.hidden = list.length > 0 || !!cat?.list.length;
    // en ligne, pas encore connecté au serveur ou pas de joueur : ce n'est pas une collection vide (UX1-15)
    if (mine.size === 0 && signedOut()) {
      empty.hidden = false;
      empty.innerHTML = loginPrompt(backend, tr('coll.login'));
      return;
    }
    empty.innerHTML = fr(mine.size === 0 ? tr('coll.emptyOpen') : active.length ? tr('coll.noneMine', { what: esc(active.join(' + ')) }) : tr('coll.noMatch')) + (mine.size && active.length ? ' <button class="btn-ghost f-reset">' + tr('coll.resetFilters') + '</button>' : '');
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
    const info = h('button', 'pg-info', tr('coll.range', { a: fmtN(page * per + 1), b: fmtN(Math.min(total, (page + 1) * per)), total: fmtN(total) }));
    info.title = tr('coll.goPage');
    info.setAttribute('aria-label', tr('coll.pageOf', { p: page + 1, n: pages }));
    info.addEventListener('click', () => {
      const f = h('form', 'pg-go', `<label>${tr('coll.page')} <input type="number" inputmode="numeric" min="1" max="${pages}" value="${page + 1}" aria-label="${tr('coll.pageNo')}"> / ${fmtN(pages)}</label><button class="pg">OK</button>`);
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
    const head = h('div', 'bd-head', `<div><span class="kicker">${tr('coll.kBinders')} · ${fmtN(list.length)}/${BINDER_MAX}</span><h2>${tr('coll.yourBinders')}</h2><p class="muted">${tr('coll.bindersHelp', { max: BINDER_CARDS_MAX })}</p></div><button class="btn-primary bd-new"${full ? tr('coll.bindersFullAttr', { n: BINDER_MAX }) : ''}>${tr('coll.newBinder')}</button>`);
    if (full) head.querySelector('.muted')!.insertAdjacentHTML('beforeend', ` <b class="bd-limit">${tr('coll.bindersFull', { n: BINDER_MAX })}</b>`);
    head.querySelector('.bd-new')!.addEventListener('click', (e) => void newBinder(undefined, e.currentTarget as HTMLElement));
    bindersView.append(head);
    if (!list.length) {
      bindersView.append(h('div', 'empty', tr('coll.noBinder')));
      return;
    }
    const g = h('div', 'bd-grid');
    for (const b of list) {
      const cover = binderCover(b, mine);
      const c = h('button', `bd-card${b.pinned ? ' pinned' : ''}`);
      c.innerHTML = `<span class="bd-cover">${cover ? `<img loading="lazy" decoding="async" alt="" src="${thumbUrl(cover)}">` : '<span class="al-ph">✦</span>'}${b.pinned ? '<span class="bd-pin" title="' + tr('coll.pinnedTitle') + '">' + tr('coll.pinProfile') + '</span>' : ''}</span><span class="bd-name">${esc(b.name)}</span><span class="bd-n">${plural(b.cards.length, 'carte')}</span>`;
      c.addEventListener('click', () => goBinder(b.id));
      g.append(c);
    }
    bindersView.append(g);
  }
  /**
   * Petit champ de nom en ligne (à la place de `prompt()`, qui coupe l'ambiance sur iOS et cache la limite : audit UX3-15).
   * Posé juste après `anchor` ; résout le nom (nettoyé, ≤ 32 caractères) ou null (Annuler, Échap).
   */
  function askName(anchor: HTMLElement, initial = '', placeholder = tr('coll.binderEg')): Promise<string | null> {
    anchor.parentElement?.querySelector(':scope > .bd-name-f')?.remove();
    return new Promise((res) => {
      const f = h('form', 'bd-name-f', `<input maxlength="${BINDER_NAME_MAX}" enterkeyhint="done" autocomplete="off" spellcheck="false" aria-label="${tr('coll.binderName')}" placeholder="${esc(placeholder)}"><span class="bd-name-n" aria-hidden="true"></span><button class="btn-primary">OK</button><button type="button" class="btn-ghost bd-name-x">${tr('pf.cancel')}</button>`);
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
      toast(tr('coll.bindersFull', { n: BINDER_MAX }), 'info');
      return null;
    }
    const name = anchor ? await askName(anchor) : prompt(tr('coll.binderPrompt'))?.trim().slice(0, BINDER_NAME_MAX);
    if (!name) return null;
    try {
      const id = await backend.createBinder(name, cards);
      shell.sfx.tick(1.2, 0.05);
      toast(tr('coll.binderMade', { name }), 'ok');
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
    head.innerHTML = `<div><span class="kicker">${tr('coll.kBinder')}${b.pinned ? tr('coll.pinnedCaps') : ''}</span><h2 class="bd-title">${esc(b.name)}<button class="bd-rename" title="${tr('coll.rename')}" aria-label="${tr('coll.rename')}">✎</button></h2><p class="muted">${tr('coll.binderCount', { n: fmtN(b.cards.length), max: BINDER_CARDS_MAX, cover: b.coverCardId ? tr('coll.coverIs', { name: esc(catalogEntry(b.coverCardId)?.name ?? '') }) : tr('coll.autoCover') })}</p></div>
      <div class="bd-actions"><button class="btn-ghost bd-pinb" aria-pressed="${b.pinned}">${b.pinned ? tr('coll.unpin') : tr('coll.pin')}</button><button class="btn-ghost bd-edit">${binderEdit ? tr('coll.done') : tr('coll.reorder')}</button><button class="btn-ghost danger bd-del">${tr('coll.delete')}</button></div>`;
    head.querySelector('.bd-rename')!.addEventListener('click', async () => {
      const name = await askName(head.querySelector<HTMLElement>('.bd-title')!, b.name, tr('coll.newName'));
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
        toast(b.pinned ? tr('coll.unpinned') : tr('coll.pinned'), 'ok');
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
        del.textContent = tr('coll.deleteSure');
        armed = window.setTimeout(() => {
          armed = 0;
          del.textContent = tr('coll.delete');
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
      bindersView.append(h('div', 'empty', tr('coll.binderEmpty')));
      return;
    }
    if (binderEdit) bindersView.append(h('div', 'bd-hint', matchMedia('(pointer: coarse)').matches ? tr('coll.dragTouch') : tr('coll.dragMouse')));
    const g = h('div', `grid bd-cards${binderEdit ? ' editing' : ''}`);
    b.cards.forEach((c, i) => {
      const have = mine.get(c.cardId);
      const t = cardTile(c.cardId, c.rarity, { owned: !!have, count: have?.count });
      t.dataset.i = String(i);
      if (binderEdit) {
        const tools = h('span', 'bd-tools', `<span class="bd-grip" title="${tr('coll.dragA')}" aria-hidden="true">⠿</span><button class="bd-cov${b.coverCardId === c.cardId ? ' on' : ''}" title="${b.coverCardId === c.cardId ? tr('coll.coverOff') : tr('coll.coverMake')}" aria-label="${b.coverCardId === c.cardId ? tr('coll.coverStop') : tr('coll.coverMake')}" aria-pressed="${b.coverCardId === c.cardId}">📌</button><button class="bd-rm" title="${tr('coll.removeFromBinder')}" aria-label="${tr('coll.removeFromBinder')}">✕</button>`);
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
    const shift = binderShift(g); // (V3, lot 08) les voisines s'écartent pendant le glisser
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
      shift.begin(drag.from);
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
    // (audit 12/11, S17 / A9-09) vitesse au TEMPS (4 à 18 px par image à 60 Hz) : à 120 / 144 Hz le classeur filait 2 à 2,4 fois plus vite
    let edgeAt = 0;
    const edge = (now: number = performance.now()) => {
      edgeRaf = 0;
      if (!drag || !last) return void (edgeAt = 0);
      const zone = 80;
      const dy = last.y < zone ? -1 : last.y > innerHeight - zone ? 1 : 0;
      if (!dy) return void (edgeAt = 0);
      const k = dy < 0 ? (zone - last.y) / zone : (last.y - (innerHeight - zone)) / zone;
      const frames = edgeAt ? Math.min(3, Math.max(0, (now - edgeAt) / (1000 / 60))) : 1;
      edgeAt = now;
      el.scrollBy(0, dy * Math.ceil((4 + 14 * Math.min(1, k)) * frames));
      hover(last.x, last.y);
      edgeRaf = requestAnimationFrame(edge);
    };
    const hover = (x: number, y: number) => {
      if (!drag) return;
      const i = shift.pick(x, y);
      if (i !== over) {
        over = i;
        shift.to(i);
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
      try {
        g.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const to = over;
      over = -1;
      if (e.type === 'pointercancel' || to < 0 || to === d.from) return shift.reset();
      const cards = [...b.cards];
      const [it] = cards.splice(d.from, 1);
      cards.splice(to, 0, it);
      try {
        await backend.setBinderCards(b.id, cards);
        shell.sfx.tick(1.1, 0.04);
      } catch (err) {
        shift.reset();
        toast(errMsg(err), 'err');
      }
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  }

  function render() {
    flipCapture(); // (V3, lot 06) positions des tuiles avant tout changement du DOM
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
    syncFilterButton();
    bindersView.hidden = !inBinders;
    forgeHost.hidden = mode !== 'forge';
    if (inGrid && subId && !theme.secret) noteRecent(subId);
    const famLabel = famId ? SUBTHEMES.find((s) => s.group?.id === famId)?.group?.label ?? '' : '';
    trail = false;
    midBtn.hidden = true;
    for (const s of sepEls) s.hidden = true;
    crumb.hidden = !((inGrid && !theme.secret) || mode === 'binder' || (inAlbums && !!famId && !albumQuery));
    if (inAlbums && famId) {
      q('.crumb-back').textContent = `‹ ${theme.label}`;
      q('.crumb-name').textContent = famLabel;
    } else if (inGrid && !theme.secret) {
      // (retours 05/11) un album d'une famille revient à sa famille (« ‹ Pokémon »), sinon aux familles du thème
      const g = subId ? subthemeById(subId)?.group : undefined;
      if (g) famId = g.id;
      // (QOL 6) fil d'Ariane cliquable « thème › famille › album » (sans famille : « thème › album »)
      trail = !!subId && !albumQuery;
      if (trail) {
        q('.crumb-back').textContent = theme.label;
        midBtn.textContent = g?.label ?? '';
        midBtn.hidden = !g;
        sepEls[0].hidden = false;
        sepEls[1].hidden = !g;
      } else q('.crumb-back').textContent = albumQuery ? `‹ ${tr('coll.backSearch')}` : g ? `‹ ${g.label}` : `‹ Albums ${theme.label}`;
      q('.crumb-name').textContent = subId ? (subthemeById(subId)?.label ?? '') : tr('coll.allOf', { label: theme.label });
    } else if (mode === 'binder') {
      q('.crumb-back').textContent = '‹ Classeurs';
      // le nom est déjà le grand titre du classeur : pas de doublon dans le fil d'Ariane (audit UX3-15)
      q('.crumb-name').textContent = '';
    }
    // (v2.1) « Je veux l'album » / « Je veux la famille » : une seule envie pour toutes les cartes qui manquent
    famKey = inAlbums && famId && !albumQuery ? `g:${famId}` : inGrid && subId && !theme.secret ? `s:${subId}` : null;
    const wb = q<HTMLButtonElement>('.crumb-wish');
    wb.hidden = !famKey || !backend.state.user || !famKeyValid(famKey);
    if (!wb.hidden && famKey) {
      const on = backend.state.wishFams.includes(famKey);
      const grp = famKey.startsWith('g:');
      wb.classList.toggle('on', on);
      wb.setAttribute('aria-pressed', String(on));
      wb.innerHTML = `♥ <span>${on ? tr(grp ? 'coll.famWanted' : 'coll.albumWanted') : tr(grp ? 'coll.famWant' : 'coll.albumWant')}</span>`;
      wb.title = tr('coll.famWantT', { n: WISH_FAMS_MAX });
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
    flipPlay(); // (V3, lot 06)
  }

  // ── carte focus (visionneuse 3D) + actions
  let browse: Array<{ id: string; r: RarityId }> = [];
  let at = -1;
  const clickTile = (ev: Event, from: 'grid' | 'binder' | 'search') => {
    const sh = (ev.target as HTMLElement).closest<HTMLElement>('.cards-sub[data-sub]');
    if (sh) return openAlbum(sh.dataset.sub!);
    const miss = (ev.target as HTMLElement).closest<HTMLElement>('.tile.missing');
    if (miss) {
      if ((ev.target as HTMLElement).closest('.wish-btn')) return;
      const e = catalogEntry(miss.dataset.card ?? '');
      if (!e) return;
      if (e.rarity === 'secret') return toast(tr('coll.secretOnly', { pack: BEBOU_PACK.label }), 'info');
      const t = themeById(e.themeId);
      // (v1.0.9) carte manquante : qui l'a ? (la fiche dit aussi où elle tombe)
      return showCardPanel(backend, e.id, tr('coll.notFoundIn', { a: t ? `${t.label} Pack` : tr('coll.themePack'), b: BEBOU_PACK.label })); // i18n-ok
    }
    const t = (ev.target as HTMLElement).closest<HTMLElement>('.tile.owned');
    if (!t || (ev.target as HTMLElement).closest('button')) return;
    if (from === 'binder' && binderEdit) return;
    shell.requestGyro();
    const mine = owned();
    if (from === 'search') browse = searchShown.filter((e) => mine.has(e.id)).map((e) => ({ id: e.id, r: e.rarity as RarityId }));
    else if (from === 'grid') browse = shownList.filter((e) => mine.has(e.id)).map((e) => ({ id: e.id, r: e.rarity as RarityId }));
    else {
      const b = backend.state.binders.find((x) => x.id === binderId);
      browse = (b?.cards ?? []).filter((c) => mine.has(c.cardId)).map((c) => ({ id: c.cardId, r: c.rarity }));
    }
    void openCard(browse.findIndex((b) => b.id === t.dataset.card && b.r === t.dataset.rarity));
  };
  grid.addEventListener('click', (ev) => clickTile(ev, 'grid'));
  grid.addEventListener('keydown', (ev) => {
    const sh = (ev.target as HTMLElement).closest<HTMLElement>('.cards-sub[data-sub]');
    if (!sh || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    openAlbum(sh.dataset.sub!);
  });
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
      <button class="va va-binder${inBinders ? ' on' : ''}" title="${tr('coll.toBinder')}" aria-label="${tr('coll.toBinderX', { x: inBinders ? tr('coll.alreadyIn', { n: inBinders }) : '' })}">▤ <span>${inBinders ? `Classeur ×${inBinders}` : '+ Classeur'}</span></button>
      ${st && !e?.themeId.startsWith('bebous') ? `<button class="va va-cover${isCover ? ' on' : ''}" title="${isCover ? tr('coll.coverStop') : tr('coll.albumCoverMake', { name: esc(st.label) })}" aria-label="${isCover ? tr('coll.albumCoverOff', { name: esc(st.label) }) : tr('coll.albumCoverMake', { name: esc(st.label) })}" aria-pressed="${isCover}">📌 <span>${isCover ? 'Couverture ✓' : tr('coll.cover')}</span></button>` : ''}
      ${st && st.cards.length && !e?.themeId.startsWith('bebous') && !(mode === 'grid' && subId === st.id) ? `<button class="va va-album" title="${tr('coll.openAlbum', { name: esc(st.label) })}">▦ <span>${tr('coll.seeAlbum')}</span></button>` : ''}
      ${have?.firstPulledAt ? `<span class="va-date">${tr('coll.gotOn', { date: fmtDate(have.firstPulledAt) })}</span>` : ''}`;
    // (07/11) signalement d'image en un geste (ui.ts imageReportButton) — avant la date d'obtention
    const vaDate = vActions.querySelector('.va-date');
    if (vaDate) vaDate.before(imageReportButton(backend, b.id, 'collection/carte'));
    else vActions.append(imageReportButton(backend, b.id, 'collection/carte'));
    vActions.prepend(panelStrip(backend, b.id, b.r), ...gestureButtons(backend, b.id, b.r, 'va', () => renderActions(b)));
    vActions.querySelector('.va-binder')!.addEventListener('click', () => showBinderPick(b));
    vActions.querySelector('.va-album')?.addEventListener('click', () => {
      if (!st) return;
      closeViewer();
      openAlbum(st.id);
    });
    vActions.querySelector('.va-cover')?.addEventListener('click', async () => {
      if (!st) return;
      try {
        await backend.setSubthemeCover(st.id, isCover ? undefined : b.id);
        toast(isCover ? tr('coll.albumCoverAuto', { name: st.label }) : tr('coll.albumCoverIs', { card: e?.name ?? '', name: st.label }), 'ok');
        renderActions(b);
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
  }
  function showBinderPick(b: { id: string; r: RarityId }) {
    const list = backend.state.binders;
    binderPick.hidden = false;
    binderPick.innerHTML = `<div class="bp-h"><b>${tr('coll.putIn')}</b><button class="bp-x" aria-label="${tr('common.close')}">✕</button></div>
      ${list
        .map((x) => {
          const inIt = x.cards.some((c) => c.cardId === b.id && c.rarity === b.r);
          const full = !inIt && x.cards.length >= BINDER_CARDS_MAX;
          return `<label class="bp-row${full ? ' full' : ''}"${full ? tr('coll.binderFullAttr', { n: BINDER_CARDS_MAX }) : ''}><input type="checkbox" data-id="${esc(x.id)}" ${inIt ? 'checked' : ''}${full ? ' disabled' : ''}><span>${esc(x.name)}</span><em>${full ? tr('coll.fullDot') : ''}${fmtN(x.cards.length)}/${BINDER_CARDS_MAX}</em></label>`;
        })
        .join('')}
      <button class="btn-ghost bp-new"${list.length >= BINDER_MAX ? tr('coll.bindersMaxAttr', { n: BINDER_MAX }) : ''}>${list.length >= BINDER_MAX ? tr('coll.bindersMax', { n: BINDER_MAX }) : tr('coll.newBinderWith')}</button>`;
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
      <div class="ci-sub">${st ? `${esc(st.label)} ${String(e!.num).padStart(3, '0')}/${numberingSize(st)} · ` : ''}${have ? tr('coll.copies', { copies: plural(have.count, 'exemplaire'), best: have.count > 1 ? tr('coll.best') : '', n: fmtN(have.bestMintNumber) }) : ''}</div>`;
    renderActions(b);
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= browse.length - 1;
    hintEl.textContent = matchMedia('(hover: hover)').matches
      ? tr('coll.viewerMouse', { x: browse.length > 1 ? tr('coll.flip') : '' })
      : browse.length > 1 ? tr('coll.viewerTouchRiffle') : tr('coll.viewerTouch');
    navPos.textContent = browse.length > 1 ? `${fmtN(i + 1)} / ${fmtN(browse.length)}` : '';
    const viewer = await getViewer();
    viewerRef = viewer;
    if (!open || at !== i) return;
    shell.setDimmed(false);
    shell.show('viewer');
    riffle.sync(true); // (V3 S4) la tranche de la pile, contre la carte
    // (V2 fluidité, lot 6) ouverture depuis la grille : la carte de la tuile grandit jusqu'à la place de la carte 3D
    // et tient l'écran pendant que celle-ci se prépare (illustration, calques, textures) — plus d'écran noir
    // (V3, lot 02 — game/sharedFlight.ts) la carte 3D attend l'arrivée de la tuile et prend sa place à l'identique (de
    // face, même taille, même endroit : plus de tour d'entrée de dos sous l'image) ; à la fermeture, elle y revient
    const lift = first ? liftCard(tileOf(b), viewer, shell.renderer.domElement) : undefined;
    // (retours 06/11) pas de son quand on ouvre une carte de la collection
    // (V3 S4) rendu : l'effeuillage garde sa pile à l'écran jusqu'à ce que la carte 3D arrive
    const shown = viewer.show(b.id, b.r, dir ? { dir, quiet: true } : { quiet: true, ghost: lift?.landed }).finally(() => lift?.settle());
    void shown.then(() => open && at === i && riffle.sync(true), () => undefined); // (carte posée : la tranche se recale)
    return shown;
  }
  /** la tuile d'une carte dans la grille affichée (null : pas sur cette page, filtrée…) */
  const tileOf = (b: { id: string; r: RarityId } | undefined) =>
    b ? el.querySelector<HTMLElement>(`.tile.owned[data-card="${CSS.escape(b.id)}"][data-rarity="${b.r}"]`) : null;
  const step = (d: 1 | -1) => {
    if (!open || !browse[at + d]) return;
    void openCard(at + d, d);
  };
  function closeViewer() {
    if (!open) return;
    // (lot 02) où est la carte 3D, lu AVANT de quitter la visionneuse (sur téléphone, la quitter libère la carte)
    const from = viewerRef?.cardRect() ?? null;
    popLayer();
    open = false;
    document.body.classList.remove('card-open');
    el.classList.remove('viewing');
    viewerUi.hidden = true;
    binderPick.hidden = true;
    riffle.sync(false);
    shell.show(null);
    shell.setDimmed(true);
    const b = browse[at];
    const tile = tileOf(b);
    tile?.scrollIntoView({ block: 'nearest' });
    if (tile && document.activeElement?.closest('.viewer-ui')) tile.focus({ preventScroll: true });
    // (V2 fluidité, lot 2) la grille n'est refaite que si quelque chose a changé pendant la visionneuse (envies,
    // classeurs, pochettes) : sinon les 60 tuiles restent en place — plus de clignotement au retour
    if (viewerDirty) {
      viewerDirty = false;
      render();
    }
    // (lot 02) la carte revient se poser sur sa tuile (celle de la carte montrée : ‹ › et l'effeuillage ont pu en changer) ;
    // tuile absente de la grille affichée : elle file vers « Collection » dans l'en-tête
    if (b) returnCard({ tile: tileOf(b), fallback: document.querySelector<HTMLElement>('nav a[data-r="collection"]'), from, canvas: shell.renderer.domElement, src: paintedCard(b.id, b.r) });
  }
  viewerUi.querySelector('.close')!.addEventListener('click', closeViewer);
  const prevBtn = viewerUi.querySelector<HTMLButtonElement>('.nav.prev')!;
  const nextBtn = viewerUi.querySelector<HTMLButtonElement>('.nav.next')!;
  const navPos = viewerUi.querySelector<HTMLElement>('.v-pos')!;
  const hintEl = viewerUi.querySelector<HTMLElement>('.v-hint')!;
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  /*
   * (V3, lot S4) EFFEUILLER AU POUCE (game/riffle.ts) : glisser le pouce sur la tranche de la pile, contre le bord droit
   * de la carte, fait défiler les cartes du classeur / de la grille une à une (5★ / 6★ plus dures à passer) ; on relâche
   * sur celle qu'on veut. Un toucher simple sur la tranche = un toucher à côté de la carte (ferme, comme avant).
   */
  const riffle = createRiffle({
    host: viewerUi,
    items: () => browse,
    at: () => at,
    rect: () => {
      const to = viewerRef?.restRect();
      const host = shell.renderer.domElement.getBoundingClientRect();
      if (!to || !host.width) return null;
      // (lot 02) `restRect` suit désormais le relèvement de la carte au repos (`REST_LIFT`) : plus de recalage ici
      return ndcToRect(to, host);
    },
    sfx: shell.sfx,
    tap: () => {
      if (!open || performance.now() - openedAt < 450) return;
      if (!binderPick.hidden) binderPick.hidden = true;
      else closeViewer();
    },
    pick: (i, d) => openCard(i, d),
    onIndex: (i) => (navPos.textContent = `${fmtN(i + 1)} / ${fmtN(browse.length)}`),
  });
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
    const now = `${collectionSig(st)}|${st.wishlist.length}|${st.wishFams.join(',')}|${JSON.stringify(st.binders)}|${JSON.stringify(st.covers)}|${JSON.stringify([...lockedCards(st)])}|${st.ready}`;
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
        toast(tr('coll.noNewSince'), 'info');
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
      if (open) {
        closeViewer();
        dropFlight(); // (on quitte la page : pas de retour vers une grille qui s'en va)
      }
      saveSeen();
      fresh.clear();
      if (filter === 'fresh') filter = 'all';
    },
  };
}
