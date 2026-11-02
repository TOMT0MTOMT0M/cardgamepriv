import { collectionSig, liveRegen, type GameBackend, type PackCard } from '../backend';
import { PACK_CAP, PACK_REGEN_MS, fmtCountdown } from '../../core/packRegen';
import type { Shell } from '../shell';
import type { PackRequest } from '../../core/packRoll';
import { BEBOU_PACK, BEBOU_THEME, THEMES, bebouOddsLabel, catalogEntry, subthemeViews, themeById, themeOpen, type CatalogEntry, type SubthemeView } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { STAR_RARITIES, slotShare } from '../../core/dropRates';
import { PITY_LIMIT, pityLeft } from '../../core/pity';
import { busyButton, cardTile, errMsg, esc, fmtN, fmtPct, fold, h, plural, popLayer, pushLayer, starsHtml, toast } from '../ui';
import { haptics } from '../../core/haptics';

/**
 * FICHE BOOSTER (boutique) : s'ouvre en overlay quand on touche une pochette. Tout ce qu'il faut savoir avant d'ouvrir :
 * 5 cartes, ★★★ garantie, chances par carte (1★ → 6★, les vrais taux du tirage), pity « X avant 6★ sûr », les cartes
 * du booster (possédées en couleur, manquantes grisées), « X de tes envies », et le bouton Ouvrir (réserve / minuteur).
 * Fermeture : croix, clic hors zone, Échap, bouton « retour » du téléphone.
 */
export interface PackSheet {
  el: HTMLElement;
  open(key: string): void;
  close(): void;
  isOpen(): boolean;
  /** réserve / connexion / booster scellé : le bouton Ouvrir se met à jour */
  sync(): void;
}

export interface SheetPack {
  key: string;
  req: PackRequest;
  name: string;
  tagline: string;
  desc: string;
  accent: string;
  soon?: boolean;
  /** cartes du booster (toutes, sauf les Bébous pour les packs de thème) */
  cards: CatalogEntry[];
}

/** Les 5 boosters de la boutique, dans l'ordre d'affichage : Bebou Pack (signature) au centre. */
export function shopPacks(): SheetPack[] {
  const theme = (id: string, desc: string): SheetPack => {
    const t = themeById(id)!;
    return { key: t.id, req: { kind: 'theme', themeId: t.id }, name: `${t.label} Pack`, tagline: t.booster, desc, accent: t.style.accent, soon: !themeOpen(t), cards: t.cards };
  };
  return [
    theme('gaming', 'Jeux vidéo'),
    theme('pop', 'Musique, cinéma, internet'),
    {
      key: 'bebou',
      req: { kind: 'bebou' },
      name: BEBOU_PACK.label,
      tagline: BEBOU_PACK.booster,
      desc: 'Toutes les cartes + les Bébous',
      accent: BEBOU_PACK.style.accent,
      cards: [...THEMES.flatMap((t) => t.cards), ...BEBOU_THEME.cards],
    },
    theme('sport', 'Tous les sports'),
    theme('monde', 'La vie, tout simplement'),
  ];
}

const QTYS = [1, 5, 10] as const;
const STAR_LABEL: Record<string, string> = { common: 'Commune', uncommon: 'Peu commune', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire', mythic: 'Mythique' };

export function createPackSheet(
  backend: GameBackend,
  shell: Shell,
  packs: SheetPack[],
  o: {
    /** miniature (grande) de la face du booster */
    thumb(key: string, size: number): string | null;
    /** « Ouvrir » : tire le booster (le bouton attend), puis la boutique ferme la fiche et lance l'ouverture */
    onOpen(pack: SheetPack, qty: number): Promise<void>;
    /** la pochette choisie change (clavier, carrousel) */
    onSelect(key: string): void;
    viewCard(card: PackCard): void;
  },
): PackSheet {
  const el = h('div', 'ps-root');
  el.hidden = true;
  el.innerHTML = `
    <div class="ps-backdrop"></div>
    <aside class="pack-sheet" role="dialog" aria-modal="true" aria-label="Fiche du booster">
      <button class="ps-close" aria-label="Fermer">✕</button>
      <div class="ps-scroll">
        <div class="ps-head"><div class="ps-thumb"></div><div class="ps-titles"><span class="kicker">BOOSTER</span><h2 class="ps-name"></h2><p class="ps-desc"></p></div></div>
        <div class="ps-facts"></div>
        <div class="ps-block ps-odds"><div class="ps-bt">Chances par carte <small>· les vrais taux du tirage</small></div><div class="ps-bars"></div></div>
        <div class="ps-block ps-secret" hidden></div>
        <div class="ps-block ps-pity"></div>
        <div class="ps-block ps-wish"></div>
        <button class="ps-cards-btn"></button>
      </div>
      <div class="ps-open">
        <div class="sealed-banner" hidden></div>
        <div class="qty" role="radiogroup" aria-label="Nombre de boosters">${QTYS.map((n) => `<button data-n="${n}" role="radio">×${n}</button>`).join('')}</div>
        <button class="open-btn">OUVRIR</button>
        <div class="open-sub"></div>
      </div>
    </aside>
    <div class="pack-cards" role="dialog" aria-modal="true" aria-label="Cartes du booster" hidden>
      <header class="pc-head">
        <button class="pc-back" aria-label="Retour">←</button>
        <div class="pc-titles"><h3 class="pc-name"></h3><div class="pc-sub"></div></div>
        <input class="pc-search" type="search" placeholder="Chercher une carte…" autocomplete="off">
        <div class="pc-filters" role="radiogroup"><button data-f="all" class="on">Toutes</button><button data-f="missing">Manquantes</button><button data-f="wish">Envies</button></div>
      </header>
      <div class="pc-list"></div>
    </div>`;
  const sheet = el.querySelector<HTMLElement>('.pack-sheet')!;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const thumbEl = q('.ps-thumb');
  const nameEl = q('.ps-name');
  const descEl = q('.ps-desc');
  const factsEl = q('.ps-facts');
  const barsEl = q('.ps-bars');
  const secretEl = q('.ps-secret');
  const pityEl = q('.ps-pity');
  const wishEl = q('.ps-wish');
  const cardsBtn = q<HTMLButtonElement>('.ps-cards-btn');
  const openBtn = q<HTMLButtonElement>('.open-btn');
  const openSub = q('.open-sub');
  const banner = q('.sealed-banner');
  const qtyEl = q('.qty');
  const cardsLayer = q('.pack-cards');
  const pcList = q('.pc-list');
  const pcSearch = q<HTMLInputElement>('.pc-search');
  const pcFilters = q('.pc-filters');

  let current: SheetPack | null = null;
  let qty = (() => {
    try {
      const n = Number(localStorage.getItem('bebou.qty'));
      return (QTYS as readonly number[]).includes(n) ? n : 1;
    } catch {
      return 1;
    }
  })();
  let opened = false;
  let cardsOpen = false;

  const ownedIds = () => new Set(backend.state.collection.map((c) => c.cardId));
  const ownedCount = () => {
    const m = new Map<string, number>();
    for (const c of backend.state.collection) m.set(c.cardId, (m.get(c.cardId) ?? 0) + c.count);
    return m;
  };

  // ── barres de chance (une fois : les taux ne bougent pas)
  {
    const share = slotShare();
    const max = Math.max(...Object.values(share));
    barsEl.innerHTML = STAR_RARITIES.map((r) => {
      const rr = rarity(r as RarityId);
      return `<div class="ps-bar r-${r}" style="--rc:${rr.hex};--ra:${rr.accentHex}"><span class="ps-bl">${starsHtml(r as RarityId)}</span><span class="ps-bb"><i style="width:${((share[r] / max) * 100).toFixed(1)}%"></i></span><span class="ps-bp">${fmtPct(share[r])}</span><span class="ps-bn">${STAR_LABEL[r]}</span></div>`;
    }).join('');
  }

  /** quantité réellement ouvrable maintenant */
  function effQty(): number {
    const s = backend.state;
    if (s.sealed) return 1;
    const bal = s.user ? liveRegen(s.user).balance : 0;
    return qty > 1 && bal < qty ? ([...QTYS].reverse().find((n) => n <= Math.max(1, bal)) ?? 1) : qty;
  }
  qtyEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-n]');
    if (!b || b.disabled) return;
    qty = Number(b.dataset.n);
    try {
      localStorage.setItem('bebou.qty', String(qty));
    } catch {
      /* ignore */
    }
    haptics.pulse(6);
    sync();
  });

  function sync() {
    if (!current || !opened) return;
    const s = backend.state;
    const u = s.user;
    const needLogin = s.mode === 'online' && !u;
    const sealedOther = s.sealed && (s.sealed.packKind === 'bebou' ? 'bebou' : themeById(s.sealed.themeId ?? '')?.id) !== current.key;
    if (current.soon) {
      openBtn.textContent = 'BIENTÔT';
      openBtn.disabled = true;
      openSub.textContent = 'Ses cartes arrivent bientôt · en attendant, le Bebou Pack contient tout';
    } else if (needLogin) {
      openBtn.textContent = 'SE CONNECTER';
      openBtn.disabled = false;
      openSub.textContent = 'Connexion avec Discord · accès réservé au groupe';
    } else if (sealedOther) {
      openBtn.textContent = 'OUVRIR';
      openBtn.disabled = true;
      openSub.textContent = '';
    } else if (s.sealed) {
      openBtn.textContent = 'OUVRIR';
      openBtn.disabled = false;
      openSub.textContent = 'Booster déjà tiré, pas encore ouvert';
    } else if (u && liveRegen(u).balance <= 0) {
      const r = liveRegen(u);
      openBtn.textContent = 'EN RECHARGE';
      openBtn.disabled = true;
      openSub.textContent = `Le prochain arrive dans ${fmtCountdown((r.nextAt ?? Date.now()) - Date.now())} · 1 toutes les ${PACK_REGEN_MS / 60000} min`;
    } else {
      const n = u ? liveRegen(u).balance : 0;
      openBtn.textContent = effQty() > 1 ? `OUVRIR ×${effQty()}` : 'OUVRIR';
      openBtn.disabled = !u;
      openSub.textContent = u ? `${n} booster${n > 1 ? 's' : ''} en réserve${n <= PACK_CAP ? ` · ${PACK_CAP} max` : ''}` : '';
    }
    const bal = u ? liveRegen(u).balance : 0;
    qtyEl.hidden = !!current.soon || needLogin || !!s.sealed;
    for (const b of qtyEl.querySelectorAll<HTMLButtonElement>('button')) {
      const n = Number(b.dataset.n);
      b.disabled = n > 1 && bal < n;
      b.classList.toggle('on', n === effQty());
      b.setAttribute('aria-checked', String(n === effQty()));
    }
    if (sealedOther && s.sealed) {
      const t = themeById(s.sealed.themeId ?? '');
      banner.hidden = false;
      banner.textContent = `Tu as un ${s.sealed.packKind === 'bebou' ? BEBOU_PACK.label : t ? `${t.label} Pack` : 'booster'} déjà tiré, pas encore ouvert : ouvre-le d’abord.`;
    } else banner.hidden = true;
    // pity (compteur du joueur, tous boosters confondus)
    const left = u ? pityLeft(u.pityCount) : PITY_LIMIT - 1;
    const pct = ((PITY_LIMIT - 1 - left) / (PITY_LIMIT - 1)) * 100;
    pityEl.classList.toggle('ready', left === 0);
    pityEl.innerHTML = left === 0
      ? `<div class="ps-bt">Pity 6★</div><div class="ps-pity-l"><b>Ton prochain booster contient un 6★ sûr&nbsp;!</b></div><span class="ps-pb"><i style="width:100%"></i></span>`
      : `<div class="ps-bt">Pity 6★ <small>· ${PITY_LIMIT} boosters secs max</small></div><div class="ps-pity-l"><b>${fmtN(left)}</b> booster${left > 1 ? 's' : ''} avant un 6★ sûr</div><span class="ps-pb"><i style="width:${pct.toFixed(1)}%"></i></span>`;
    renderWish();
    renderCardsBtn();
  }

  let wishSig = '';
  function renderWish() {
    if (!current) return;
    const ids = new Set(current.cards.map((c) => c.id));
    const owned = ownedIds();
    const wish = backend.state.wishlist.filter((id) => ids.has(id) && !owned.has(id));
    const sig = wish.join(',');
    if (sig === wishSig && wishEl.innerHTML) return;
    wishSig = sig;
    const thumbs = wish.slice(0, 6).map((id) => {
      const e = catalogEntry(id);
      return e ? cardTile(id, e.rarity, { mini: true, owned: false }) : null;
    }).filter((x): x is HTMLElement => !!x);
    wishEl.innerHTML = `<div class="ps-bt">Tes envies</div><div class="ps-wish-l">${wish.length ? `<b>${plural(wish.length, 'de tes envies', 'de tes envies')}</b> dans ce booster` : 'Aucune de tes envies ici · marque des cartes avec ♥ pour les suivre'}</div><div class="ps-wish-row"></div>`;
    const row = wishEl.querySelector<HTMLElement>('.ps-wish-row')!;
    for (const t of thumbs) {
      t.addEventListener('click', () => void showCards('wish'));
      row.append(t);
    }
    if (wish.length > 6) row.append(h('button', 'ps-more', `+${wish.length - 6}`));
    row.querySelector('.ps-more')?.addEventListener('click', () => void showCards('wish'));
    wishEl.hidden = false;
  }

  let cardsSig = '';
  function renderCardsBtn() {
    if (!current) return;
    const sig = `${current.key}|${collectionSig(backend.state)}`;
    if (sig === cardsSig) return;
    cardsSig = sig;
    const owned = ownedIds();
    const have = current.cards.reduce((a, c) => a + (owned.has(c.id) ? 1 : 0), 0);
    cardsBtn.innerHTML = `<span>Voir les ${fmtN(current.cards.length)} cartes</span><small>${fmtN(have)} possédée${have > 1 ? 's' : ''} · ${fmtPct((have / Math.max(1, current.cards.length)) * 100)}</small>`;
  }

  function fill(p: SheetPack) {
    current = p;
    wishSig = cardsSig = '';
    sheet.style.setProperty('--acc', p.accent);
    sheet.dataset.pack = p.key;
    const src = o.thumb(p.key, 360);
    thumbEl.innerHTML = src ? `<img src="${src}" alt="">` : '';
    nameEl.textContent = p.name;
    descEl.textContent = p.desc;
    const t = p.key !== 'bebou' ? themeById(p.key) : null;
    const live = t ? subthemeViews(t).filter((v) => v.cards.length).length : THEMES.filter(themeOpen).length;
    factsEl.innerHTML = `<span><b>5</b> cartes par booster</span><span>${starsHtml('rare')} <b>minimum garantie</b></span><span><b>${fmtN(p.cards.length)}</b> cartes${p.soon ? ' en préparation' : t ? ` · ${live} sous-thème${live > 1 ? 's' : ''}` : ' · les 4 thèmes'}</span>`;
    if (p.key === 'bebou') {
      secretEl.hidden = false;
      secretEl.innerHTML = `<div class="ps-bt">Cartes secrètes</div><div class="ps-secret-l"><span class="stars secret">✷</span> <b>1 chance sur ${esc(bebouOddsLabel().replace(/^1 sur /, ''))}</b> par booster de tirer une des <b>8 Bébous</b> <small>· 1 / nombre de cartes du jeu : plus il y a de cartes, plus c’est rare</small></div>`;
    } else secretEl.hidden = true;
    sync();
  }

  // ── grille des cartes du booster (possédées en couleur, manquantes grisées), par sous-thème
  let filter: 'all' | 'missing' | 'wish' = 'all';
  let search = '';
  function sectionsOf(p: SheetPack): SubthemeView[] {
    if (p.key !== 'bebou') return subthemeViews(themeById(p.key)!);
    return [...THEMES.flatMap(subthemeViews), { id: 'bebous', label: 'Les Bébous · secrètes', subs: BEBOU_THEME.subthemes, cards: BEBOU_THEME.cards, group: false }];
  }
  function matches(c: CatalogEntry, owned: Set<string>, wish: Set<string>, needle: string): boolean {
    if (filter === 'missing' && owned.has(c.id)) return false;
    if (filter === 'wish' && !wish.has(c.id)) return false;
    return !needle || fold(c.name).includes(needle);
  }
  function tileFor(c: CatalogEntry, owned: Map<string, number>, wish: Set<string>): HTMLElement {
    const n = owned.get(c.id) ?? 0;
    const t = cardTile(c.id, c.rarity, { owned: n > 0, count: n });
    if (n > 0) t.addEventListener('click', () => o.viewCard({ cardId: c.id, cardName: c.name, rarity: c.rarity, mintNumber: backend.state.collection.find((x) => x.cardId === c.id)?.bestMintNumber ?? 0, isNew: false }));
    else if (c.rarity !== 'secret') {
      const b = h('button', `wish-btn${wish.has(c.id) ? ' on' : ''}`, '♥');
      b.title = wish.has(c.id) ? 'Retirer de mes envies' : 'Ajouter à mes envies';
      b.setAttribute('aria-pressed', String(wish.has(c.id)));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        haptics.pulse(8);
        b.classList.toggle('on');
        void backend.toggleWish(c.id).catch((err) => (b.classList.toggle('on'), toast(errMsg(err), 'err')));
      });
      t.append(b);
    }
    return t;
  }
  function renderCards() {
    if (!current) return;
    const owned = ownedCount();
    const ownedSet = new Set(owned.keys());
    const wish = new Set(backend.state.wishlist);
    const needle = fold(search.trim());
    pcList.replaceChildren();
    let shown = 0;
    for (const v of sectionsOf(current)) {
      const list = v.cards.filter((c) => matches(c, ownedSet, wish, needle));
      if (!list.length) continue;
      const have = v.cards.reduce((a, c) => a + (owned.has(c.id) ? 1 : 0), 0);
      const sec = h('details', 'pc-sec');
      // recherche ou filtre : tout ouvert ; sinon replié (6 000 cartes : on n'affiche que ce qu'on regarde)
      sec.open = !!needle || filter !== 'all' || v.cards.length <= 40;
      sec.innerHTML = `<summary><span class="pc-sl">${esc(v.label)}</span><span class="pc-sn">${fmtN(have)} / ${fmtN(v.cards.length)}</span><span class="pc-sp"><i style="width:${((have / v.cards.length) * 100).toFixed(1)}%"></i></span><span class="pc-sc">${needle || filter !== 'all' ? plural(list.length, 'carte') : ''}</span></summary><div class="pc-grid"></div>`;
      const grid = sec.querySelector<HTMLElement>('.pc-grid')!;
      const paint = () => {
        if (grid.childElementCount) return;
        const frag = document.createDocumentFragment();
        for (const c of list) frag.append(tileFor(c, owned, wish));
        grid.append(frag);
      };
      if (sec.open) paint();
      sec.addEventListener('toggle', () => sec.open && paint());
      pcList.append(sec);
      shown += list.length;
    }
    if (!shown) pcList.append(h('div', 'pc-empty', filter === 'wish' ? 'Aucune envie dans ce booster pour l’instant.' : filter === 'missing' ? 'Tu as toutes les cartes de cette sélection !' : 'Aucune carte ne correspond.'));
    q('.pc-sub').textContent = `${fmtN(current.cards.length)} cartes · ${fmtN(current.cards.filter((c) => owned.has(c.id)).length)} possédées`;
  }
  function showCards(f: typeof filter = 'all') {
    if (!current) return;
    filter = f;
    pcFilters.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.f === f));
    q('.pc-name').textContent = current.name;
    cardsLayer.hidden = false;
    cardsOpen = true;
    renderCards();
    pcList.scrollTop = 0;
  }
  function hideCards() {
    cardsLayer.hidden = true;
    cardsOpen = false;
    pcList.replaceChildren();
  }
  cardsBtn.addEventListener('click', () => showCards('all'));
  q('.pc-back').addEventListener('click', hideCards);
  pcFilters.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-f]');
    if (b) showCards(b.dataset.f as typeof filter);
  });
  let searchT = 0;
  pcSearch.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = window.setTimeout(() => {
      search = pcSearch.value;
      renderCards();
    }, 120);
  });
  // la collection change (ouverture, échange) pendant que la grille est ouverte : coeurs et couleurs suivent
  let liveSig = '';
  backend.onChange((s) => {
    if (!opened) return;
    const sig = `${collectionSig(s)}|${s.wishlist.join(',')}`;
    if (sig === liveSig) return;
    liveSig = sig;
    sync();
    if (cardsOpen) renderCards();
  });
  window.addEventListener('bebou:packs', sync);
  setInterval(() => opened && backend.state.user && !backend.state.sealed && liveRegen(backend.state.user).balance <= 0 && sync(), 1000);

  // ── ouvrir / fermer
  function open(key: string) {
    const p = packs.find((x) => x.key === key);
    if (!p) return;
    if (!opened) {
      pushLayer(close);
      el.hidden = false;
      opened = true;
      document.body.classList.add('sheet-open');
      requestAnimationFrame(() => el.classList.add('in'));
    }
    fill(p);
    q('.ps-scroll').scrollTop = 0;
    o.onSelect(key);
  }
  function close() {
    if (!opened) return;
    if (cardsOpen) hideCards();
    popLayer();
    opened = false;
    document.body.classList.remove('sheet-open');
    el.classList.remove('in');
    setTimeout(() => !opened && (el.hidden = true), 320);
  }
  q('.ps-close').addEventListener('click', close);
  q('.ps-backdrop').addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !opened) return;
    if (cardsOpen) hideCards();
    else close();
  });
  openBtn.addEventListener('click', async () => {
    shell.requestGyro();
    haptics.pulse(10);
    const s = backend.state;
    if (s.mode === 'online' && !s.user) return backend.login();
    if (!current || openBtn.disabled) return;
    const p = current;
    const n = effQty();
    openBtn.disabled = true;
    try {
      await busyButton(openBtn, o.onOpen(p, n));
    } catch (e) {
      toast(errMsg(e), 'err');
      sync();
    }
  });

  return { el, open, close, isOpen: () => opened, sync };
}
