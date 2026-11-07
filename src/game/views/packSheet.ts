import { collectionSig, liveRegen, type GameBackend, type PackCard } from '../backend';
import { PACK_CAP, PACK_REGEN_MS, fmtCountdown } from '../../core/packRegen';
import type { Shell } from '../shell';
import type { PackRequest } from '../../core/packRoll';
import { BEBOU_PACK, BEBOU_SECRETS_LOCKED, BEBOU_THEME, THEMES, bebouOddsLabel, catalogEntry, subthemeViews, themeById, themeOpen, type CatalogEntry, type SubthemeView } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { STAR_RARITIES, packOdds, slotShare } from '../../core/dropRates';
import { cardPackChance } from '../../core/packRoll';
import { PITY_LIMIT, pityLeft } from '../../core/pity';
import { busyButton, cardTile, errMsg, esc, fmtN, fmtPct, fold, h, plural, popLayer, pushLayer, starsHtml, toast } from '../ui';
import { haptics } from '../../core/haptics';
import { fmtCoins } from '../../core/economy';
import { COIN_ICON } from './wallet';

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
  /**
   * (07/11, retours de Tom) ORDINATEUR : la fiche est posée en permanence dans la colonne de droite (à la place de la
   * liste des boosters), en panneau « fluide » qui se forme comme une matière élastique ; `show(key)` la fait se
   * déformer puis se reformer sur un autre booster. Ce n'est pas une couche : `isOpen()` reste faux (la roue tourne).
   */
  dock(on: boolean): void;
  show(key: string): void;
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
  // (retours live 02) le Bebou Pack en PREMIER : en haut de la liste verticale (ordinateur), premier du carrousel
  // (téléphone, où il reste sélectionné par défaut)
  return [
    {
      key: 'bebou',
      req: { kind: 'bebou' },
      name: BEBOU_PACK.label,
      tagline: BEBOU_PACK.booster,
      desc: 'Toutes les cartes + les Bébous',
      accent: BEBOU_PACK.style.accent,
      cards: [...THEMES.flatMap((t) => t.cards), ...BEBOU_THEME.cards],
    },
    theme('gaming', 'Jeux vidéo'),
    theme('pop', 'Mangas, films, séries, musique'),
    theme('sport', 'Tous les sports'),
    theme('monde', 'La vie, tout simplement'),
  ];
}

const QTYS = [1, 5, 10] as const;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
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
    <svg class="ps-fx-defs" width="0" height="0" aria-hidden="true" focusable="false"><filter id="ps-liquid" x="-25%" y="-8%" width="150%" height="116%" color-interpolation-filters="sRGB"><feTurbulence class="psl-noise" type="fractalNoise" baseFrequency="0.0035 0.045" numOctaves="2" seed="3" result="n"/><feDisplacementMap class="psl-disp" in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G" result="d"/><feOffset class="psl-r" in="d" dx="0" dy="0" result="r"/><feColorMatrix in="r" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rr"/><feColorMatrix in="d" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb"/><feBlend in="rr" in2="gb" mode="screen"/></filter></svg>
    <div class="ps-backdrop"></div>
    <aside class="pack-sheet" role="dialog" aria-modal="true" aria-label="Fiche du booster">
      <button class="ps-close" aria-label="Fermer">✕</button>
      <div class="ps-scroll">
        <div class="ps-head"><div class="ps-thumb"></div><div class="ps-titles"><span class="kicker">BOOSTER</span><h2 class="ps-name"></h2><p class="ps-desc"></p></div></div>
        <div class="ps-facts"></div>
        <div class="ps-block ps-odds"><div class="ps-bt">Chances par carte <small>· les vrais taux du tirage · la chance de chaque carte est écrite sous elle dans « Cartes du booster »</small></div><div class="ps-bars"></div><div class="ps-per-pack"></div></div>
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
        <div class="ps-buy" hidden><span class="ps-buy-l">Acheter</span><button class="btn-ghost sm" data-buy="1"></button><button class="btn-ghost sm" data-buy="5"></button><span class="ps-buy-s"></span></div>
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
  const buyEl = q('.ps-buy');
  // (retours 05/11) acheter des boosters avec des pièces : ils rejoignent la réserve
  buyEl.querySelectorAll<HTMLButtonElement>('button[data-buy]').forEach((b) =>
    b.addEventListener('click', async () => {
      const n = Number(b.dataset.buy);
      try {
        await busyButton(b, backend.eco.buyPacks(n));
        haptics.pulse(10);
        shell.sfx.chime(2, 0.06);
        toast(`+${n} booster${n > 1 ? 's' : ''} dans ta réserve`, 'ok');
      } catch (e) {
        toast(errMsg(e), 'err');
      }
      sync();
    }),
  );
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
  /** posée dans la colonne de droite (ordinateur) : vivante sans être une couche ouverte */
  let docked = false;
  const alive = () => opened || docked;
  // (après la déclaration : le serveur rappelle l'abonné tout de suite, « opened » n'existait pas encore → page blanche)
  backend.eco.onChange(() => alive() && sync());
  let cardsOpen = false;
  /** booster déjà tiré (d'un autre type que la fiche affichée) : c'est lui que « Ouvrir » ouvre */
  let sealedTarget: SheetPack | null = null;

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
    // (audit UX2-17) le joueur raisonne en boosters : « 6★ : 1 booster sur 40 » (chance d'au moins une carte de ce rang ou mieux)
    const odds = packOdds();
    const one = (r: string) => {
      const p = odds[r as keyof typeof odds];
      const n = p > 0 ? 1 / p : Infinity;
      return n < 1.05 ? 'presque toujours' : `1 sur ${n < 10 ? n.toFixed(1).replace('.', ',').replace(',0', '') : fmtN(n)}`;
    };
    const lab: Array<[string, string]> = [['epic', '4★ et +'], ['legendary', '5★ et +'], ['mythic', '6★']];
    el.querySelector<HTMLElement>('.ps-per-pack')!.innerHTML = `<b>Par booster</b> · ${lab.filter(([r]) => r in odds).map(([r, l]) => `${l}\u00a0: <b>${one(r)}</b>`).join(' · ')}`;
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
    if (!current || !alive()) return;
    const s = backend.state;
    const u = s.user;
    const needLogin = s.mode === 'online' && !u;
    const sealedKey = s.sealed ? (s.sealed.packKind === 'bebou' ? 'bebou' : themeById(s.sealed.themeId ?? '')?.id) : null;
    const sealedOther = !!s.sealed && sealedKey !== current.key;
    sealedTarget = sealedOther ? packs.find((x) => x.key === sealedKey) ?? null : null;
    if (current.soon) {
      openBtn.textContent = 'BIENTÔT';
      openBtn.disabled = true;
      openSub.textContent = 'Ses cartes arrivent bientôt · en attendant, le Bebou Pack contient tout';
    } else if (needLogin) {
      openBtn.textContent = 'SE CONNECTER';
      openBtn.disabled = false;
      openSub.textContent = 'Connexion avec Discord · accès réservé au groupe';
    } else if (sealedOther) {
      // (audit UX2-09) un autre booster est déjà tiré : on propose de l'ouvrir lui, au lieu d'un bouton grisé sans issue
      openBtn.textContent = sealedTarget ? `OUVRIR MON ${sealedTarget.name.toUpperCase()}` : 'OUVRIR';
      openBtn.disabled = !sealedTarget;
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
    const eco = backend.eco.snapshot;
    buyEl.hidden = !u || !eco || !!current.soon || !!s.sealed;
    if (eco && !buyEl.hidden) {
      const { price, left } = eco.packShop;
      for (const b of buyEl.querySelectorAll<HTMLButtonElement>('button[data-buy]')) {
        const n = Number(b.dataset.buy);
        if (!b.dataset.busy) b.innerHTML = `+${n} · ${COIN_ICON}${fmtCoins(n * price)}`;
        b.disabled = n > left || eco.coins < n * price;
      }
      buyEl.querySelector('.ps-buy-s')!.textContent = left ? `${left} achat${left > 1 ? 's' : ''} possible${left > 1 ? 's' : ''} aujourd’hui · solde ${fmtCoins(eco.coins)}` : 'limite du jour atteinte · reviens demain';
    }
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
      banner.textContent = `Tu as un ${s.sealed.packKind === 'bebou' ? BEBOU_PACK.label : t ? `${t.label} Pack` : 'booster'} déjà tiré, pas encore ouvert : ouvre-le d’abord (bouton ci-dessous).`;
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
    // (vignette encore en cours d'encodage, asynchrone : on la pose dès qu'elle est là)
    if (!src) {
      let tries = 0;
      const retry = () => {
        if (current !== p || !alive() || thumbEl.querySelector('img')) return;
        const s2 = o.thumb(p.key, 360);
        if (s2) thumbEl.innerHTML = `<img src="${s2}" alt="">`;
        else if (++tries < 8) setTimeout(retry, 250);
      };
      setTimeout(retry, 120);
    }
    // (ordinateur, panneau fluide) le nom se forme lettre à lettre (style.css, .ps-docked .ps-name i)
    if (docked) {
      nameEl.setAttribute('aria-label', p.name);
      nameEl.innerHTML = [...p.name].map((c, i) => `<i aria-hidden="true" style="--i:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</i>`).join('');
    } else {
      nameEl.removeAttribute('aria-label');
      nameEl.textContent = p.name;
    }
    descEl.textContent = p.desc;
    const t = p.key !== 'bebou' ? themeById(p.key) : null;
    const live = t ? subthemeViews(t).filter((v) => v.cards.length).length : THEMES.filter(themeOpen).length;
    factsEl.innerHTML = `<span><b>5</b> cartes par booster</span><span>${starsHtml('rare')} <b>minimum garantie</b></span><span><b>${fmtN(p.cards.length)}</b> cartes${p.soon ? ' en préparation' : t ? ` · ${live} sous-thème${live > 1 ? 's' : ''}` : ' · les 4 thèmes'}</span>`;
    if (p.key === 'bebou') {
      secretEl.hidden = false;
      secretEl.innerHTML = BEBOU_SECRETS_LOCKED ? `<div class="ps-bt">Cartes secrètes</div><div class="ps-secret-l"><span class="stars secret">✷</span> <b>Les Bébous sont verrouillées pour l’instant</b> <small>· elles ne tombent d’aucun booster, leur retour sera annoncé</small></div>` : `<div class="ps-bt">Cartes secrètes</div><div class="ps-secret-l"><span class="stars secret">✷</span> <b>1 chance sur ${esc(bebouOddsLabel().replace(/^1 sur /, ''))}</b> par booster de tirer une des <b>8 Bébous</b> <small>· 1 / nombre de cartes du jeu : plus il y a de cartes, plus c’est rare</small></div>`;
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
  /**
   * (audit PERF2-03) La grille ne construit plus jamais des dizaines de milliers de tuiles : chaque section se peint par
   * pages de SECTION_PAGE (« Voir N de plus »), seules les premières sections sont dépliées d'office (budget de
   * AUTO_OPEN tuiles, recherche et filtres compris), la recherche demande 2 lettres, et un seul écouteur délégué sur
   * la liste remplace les écouteurs par tuile (cœur, carte possédée, dépliage, « voir plus »).
   */
  const SECTION_PAGE = 60;
  const AUTO_OPEN = 120;
  /** contexte du dernier rendu (les écouteurs délégués en ont besoin) */
  let rOwned = new Map<string, number>();
  let rWish = new Set<string>();
  const secLists = new WeakMap<HTMLElement, CatalogEntry[]>();
  function tileFor(c: CatalogEntry, owned: Map<string, number>, wish: Set<string>): HTMLElement {
    const n = owned.get(c.id) ?? 0;
    const t = cardTile(c.id, c.rarity, { owned: n > 0, count: n });
    // (retours 06/11) la vraie chance de CETTE carte dans ce booster
    if (current && c.rarity !== 'secret') {
      const p = cardPackChance(current.req, c.rarity);
      if (p > 0) t.append(h('span', 'pc-odds', `1 / ${fmtN(Math.round(1 / p))}`));
    }
    if (n <= 0 && c.rarity !== 'secret') {
      const b = h('button', `wish-btn${wish.has(c.id) ? ' on' : ''}`, '♥');
      b.title = wish.has(c.id) ? 'Retirer de mes envies' : 'Ajouter à mes envies';
      b.setAttribute('aria-pressed', String(wish.has(c.id)));
      t.append(b);
    }
    return t;
  }
  /** peint la page suivante d'une section (ou la première) et met à jour son bouton « voir plus » */
  function paintSection(sec: HTMLElement) {
    const list = secLists.get(sec);
    const grid = sec.querySelector<HTMLElement>('.pc-grid');
    if (!list || !grid) return;
    const start = grid.childElementCount;
    const frag = document.createDocumentFragment();
    for (const c of list.slice(start, start + SECTION_PAGE)) frag.append(tileFor(c, rOwned, rWish));
    grid.append(frag);
    const left = list.length - grid.childElementCount;
    let more = sec.querySelector<HTMLButtonElement>('.pc-more');
    if (left > 0) {
      if (!more) sec.append((more = h('button', 'pc-more')));
      more.textContent = `Voir ${fmtN(Math.min(SECTION_PAGE, left))} de plus · ${fmtN(left)} restante${left > 1 ? 's' : ''}`;
    } else more?.remove();
  }
  pcList.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const more = t.closest<HTMLElement>('.pc-more');
    if (more) {
      const sec = more.closest<HTMLElement>('.pc-sec');
      if (sec) paintSection(sec);
      return;
    }
    const wb = t.closest<HTMLButtonElement>('.wish-btn');
    if (wb) {
      e.stopPropagation();
      const id = wb.closest<HTMLElement>('.tile')?.dataset.card;
      if (!id) return;
      haptics.pulse(8);
      wb.classList.toggle('on');
      wb.setAttribute('aria-pressed', String(wb.classList.contains('on')));
      void backend.toggleWish(id).catch((err) => (wb.classList.toggle('on'), toast(errMsg(err), 'err')));
      return;
    }
    const tile = t.closest<HTMLElement>('.tile.owned');
    const id = tile?.dataset.card;
    const c = id ? catalogEntry(id) : null;
    if (c) o.viewCard({ cardId: c.id, cardName: c.name, rarity: c.rarity, mintNumber: backend.state.collection.find((x) => x.cardId === c.id)?.bestMintNumber ?? 0, isNew: false });
  });
  // dépliage d'une section : 'toggle' ne remonte pas, on l'écoute en capture
  pcList.addEventListener('toggle', (e) => {
    const sec = e.target as HTMLDetailsElement;
    if (sec.classList?.contains('pc-sec') && sec.open && !sec.querySelector('.pc-grid')?.childElementCount) paintSection(sec);
  }, true);
  function renderCards(keep = false) {
    if (!current) return;
    const owned = ownedCount();
    const ownedSet = new Set(owned.keys());
    const wish = new Set(backend.state.wishlist);
    rOwned = owned;
    rWish = wish;
    // recherche : 2 lettres au moins (« a » dépliait 16 747 cartes)
    const raw = fold(search.trim());
    const needle = raw.length >= 2 ? raw : '';
    // re-rendu « vivant » (collection changée) : on garde les sections ouvertes et la position de défilement
    const wasOpen = keep ? new Set([...pcList.querySelectorAll<HTMLDetailsElement>('.pc-sec[open]')].map((d) => d.dataset.id ?? '')) : null;
    const scroll = pcList.scrollTop;
    pcList.replaceChildren();
    let shown = 0;
    let budget = AUTO_OPEN;
    let capped = 0;
    const narrow = !!needle || filter !== 'all';
    for (const v of sectionsOf(current)) {
      const list = v.cards.filter((c) => matches(c, ownedSet, wish, needle));
      if (!list.length) continue;
      const have = v.cards.reduce((a, c) => a + (owned.has(c.id) ? 1 : 0), 0);
      const sec = h('details', 'pc-sec');
      sec.dataset.id = v.id;
      secLists.set(sec, list);
      // recherche ou filtre : dépliées dans la limite du budget ; sinon les petites sections seulement
      const want = wasOpen ? wasOpen.has(v.id) : narrow || v.cards.length <= 40;
      sec.open = want && (!!wasOpen || budget > 0);
      if (want && !sec.open) capped += list.length;
      if (sec.open) budget -= Math.min(list.length, SECTION_PAGE);
      sec.innerHTML = `<summary><span class="pc-sl">${esc(v.label)}</span><span class="pc-sn">${fmtN(have)} / ${fmtN(v.cards.length)}</span><span class="pc-sp"><i style="width:${((have / v.cards.length) * 100).toFixed(1)}%"></i></span><span class="pc-sc">${narrow ? plural(list.length, 'carte') : ''}</span></summary><div class="pc-grid"></div>`;
      pcList.append(sec);
      if (sec.open) paintSection(sec);
      shown += list.length;
    }
    if (!shown) pcList.append(h('div', 'pc-empty', filter === 'wish' ? 'Aucune envie dans ce booster pour l’instant.' : filter === 'missing' ? 'Tu as toutes les cartes de cette sélection !' : 'Aucune carte ne correspond.'));
    else if (narrow && capped) pcList.prepend(h('div', 'pc-cap', `${plural(shown, 'résultat')} · les premières sections sont dépliées, touche une section pour voir la suite${needle ? ' (ou affine la recherche)' : ''}`));
    if (keep) pcList.scrollTop = scroll;
    q('.pc-sub').textContent = `${fmtN(current.cards.length)} cartes · ${fmtN(current.cards.filter((c) => owned.has(c.id)).length)} possédées`;
  }
  function showCards(f: typeof filter = 'all') {
    if (!current) return;
    filter = f;
    pcFilters.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.f === f));
    q('.pc-name').textContent = current.name;
    cardsLayer.hidden = false;
    // (audit UX1-24) la grille est une couche à part dans la pile (lot A) : « retour » et Échap la ferment, elle seule
    if (!cardsOpen) {
      pushLayer(hideCards);
      requestAnimationFrame(() => q<HTMLButtonElement>('.pc-back').focus({ preventScroll: true }));
    }
    cardsOpen = true;
    renderCards();
    pcList.scrollTop = 0;
  }
  function hideCards() {
    if (!cardsOpen) return;
    const inside = cardsLayer.contains(document.activeElement);
    cardsLayer.hidden = true;
    cardsOpen = false;
    popLayer(hideCards);
    if (inside && opened) cardsBtn.focus({ preventScroll: true });
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
  let liveColl = '';
  backend.onChange((s) => {
    if (!alive()) return;
    const cs = collectionSig(s);
    const sig = `${cs}|${s.wishlist.join(',')}`;
    if (sig === liveSig) return;
    liveSig = sig;
    rWish = new Set(s.wishlist);
    sync();
    // (un cœur touché est déjà basculé dans la grille : seule une collection changée la re-dessine)
    if (cardsOpen && (cs !== liveColl || filter === 'wish')) renderCards(true);
    liveColl = cs;
  });
  window.addEventListener('bebou:packs', sync);
  // minuteur « EN RECHARGE » : seulement fiche ouverte, onglet visible, réserve vide (audit PERF2-16)
  setInterval(() => !document.hidden && alive() && backend.state.user && !backend.state.sealed && liveRegen(backend.state.user).balance <= 0 && sync(), 1000);

  // ── ouvrir / fermer
  let openedAt = 0;
  function open(key: string) {
    const p = packs.find((x) => x.key === key);
    if (!p) return;
    // panneau posé (ordinateur) : « ouvrir la fiche » = la montrer sur ce booster
    if (docked) {
      show(key);
      o.onSelect(key);
      return;
    }
    if (!opened) {
      openedAt = performance.now();
      pushLayer(close);
      el.hidden = false;
      opened = true;
      document.body.classList.add('sheet-open');
      // (audit UX5-07) le focus entre dans la fiche, et reviendra à l'élément d'origine (pochette…) à la fermeture
      const a = document.activeElement as HTMLElement | null;
      returnFocus = a && a !== document.body ? a : null;
      requestAnimationFrame(() => {
        el.classList.add('in');
        q<HTMLButtonElement>('.ps-close').focus({ preventScroll: true });
      });
    }
    fill(p);
    q('.ps-scroll').scrollTop = 0;
    o.onSelect(key);
  }
  function close() {
    if (!opened) return;
    if (cardsOpen) hideCards();
    popLayer(close);
    opened = false;
    document.body.classList.remove('sheet-open');
    el.classList.remove('in');
    setTimeout(() => !opened && (el.hidden = true), 320);
    if (returnFocus?.isConnected && el.contains(document.activeElement)) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  let returnFocus: HTMLElement | null = null;
  // (audit UX5-07) Tab reste dans la couche du dessus (grille des cartes, sinon fiche) tant qu'elle est ouverte
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !opened) return;
    const box = cardsOpen ? cardsLayer : sheet;
    const f = [...box.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"], a[href]')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
  });
  q('.ps-close').addEventListener('click', close);
  // (retours live 02, bug 4) le clic qui vient d'ouvrir la fiche (toucher du booster 3D) ne la referme pas aussitôt
  q('.ps-backdrop').addEventListener('click', () => performance.now() - openedAt > 400 && close());
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
    const p = sealedTarget ?? current;
    const n = sealedTarget ? 1 : effQty();
    openBtn.disabled = true;
    try {
      await busyButton(openBtn, o.onOpen(p, n));
    } catch (e) {
      toast(errMsg(e), 'err');
      sync();
    }
  });

  // ── panneau posé (ordinateur) : matière fluide qui se forme, se déforme et se reforme (CSS + filtre SVG « goo »)
  let morphT = 0;
  let morphKey: string | null = null;
  function restart(cls: string) {
    sheet.classList.remove(cls);
    void sheet.offsetWidth;
    sheet.classList.add(cls);
  }
  /**
   * Le texte se LIQUÉFIE (07/11, retours de Tom : « futuriste, que du texte, pas de cadre ») : filtre SVG posé sur le
   * contenu le temps de la transition seulement — bruit étiré à l'horizontale + déplacement (le texte coule comme une
   * matière, façon symbiote) et un léger décalage du rouge (aberration). Au repos : aucun filtre, rien ne coûte.
   */
  const disp = el.querySelector<SVGFEDisplacementMapElement>('.psl-disp')!;
  const noise = el.querySelector<SVGFETurbulenceElement>('.psl-noise')!;
  const shiftR = el.querySelector<SVGFEOffsetElement>('.psl-r')!;
  let liqRaf = 0;
  function liquid(from: number, to: number, ms: number, elastic: boolean, done?: () => void) {
    cancelAnimationFrame(liqRaf);
    sheet.classList.add('ps-liquid');
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / ms);
      // ressort amorti (le texte dépasse un peu son état net puis se pose) ou montée douce
      const e = elastic ? 1 - Math.exp(-6 * u) * Math.cos(u * Math.PI * 2.6) : u * u * (3 - 2 * u);
      const v = from + (to - from) * e;
      disp.setAttribute('scale', v.toFixed(2));
      shiftR.setAttribute('dx', (v * 0.09).toFixed(2));
      if (u < 1) liqRaf = requestAnimationFrame(step);
      else {
        liqRaf = 0;
        if (to === 0) sheet.classList.remove('ps-liquid');
        done?.();
      }
    };
    liqRaf = requestAnimationFrame(step);
  }
  function show(key: string) {
    const p = packs.find((x) => x.key === key);
    if (!p) return;
    if (!docked) {
      // fiche fermée : on retient seulement le booster (le panneau se formera directement dessus)
      if (opened) {
        if (current?.key !== key) fill(p);
      } else current = p;
      return;
    }
    if (current?.key === key && !morphKey) return;
    if (!current || REDUCED.matches) {
      fill(p);
      return;
    }
    // déjà en train de se déformer : on change seulement la cible (la roue a filé sur plusieurs boosters)
    morphKey = key;
    if (morphT) return;
    sheet.classList.remove('ps-form');
    restart('ps-melt');
    noise.setAttribute('seed', String(1 + Math.floor(Math.random() * 90)));
    liquid(0, 46, 190, false);
    morphT = window.setTimeout(() => {
      morphT = 0;
      const k = morphKey;
      morphKey = null;
      const np = packs.find((x) => x.key === k);
      if (np) fill(np);
      q('.ps-scroll').scrollTop = 0;
      sheet.classList.remove('ps-melt');
      restart('ps-form');
      liquid(46, 0, 720, true);
    }, 190);
  }
  function dock(on: boolean) {
    if (on === docked) return;
    if (on) {
      if (opened) close();
      docked = true;
      el.classList.add('ps-docked');
      el.hidden = false;
      fill(current ?? packs[0]);
      requestAnimationFrame(() => {
        el.classList.add('in');
        restart('ps-form');
        if (!REDUCED.matches) liquid(60, 0, 900, true);
      });
    } else {
      docked = false;
      clearTimeout(morphT);
      morphT = 0;
      morphKey = null;
      if (cardsOpen) hideCards();
      el.classList.remove('in');
      sheet.classList.remove('ps-melt', 'ps-form');
      if (!REDUCED.matches) liquid(0, 50, 260, false);
      // la matière se retire (transition CSS), puis le panneau sort de l'arbre affiché
      setTimeout(() => {
        if (docked || opened) return;
        el.hidden = true;
        el.classList.remove('ps-docked');
        cancelAnimationFrame(liqRaf);
        sheet.classList.remove('ps-liquid');
        if (current) fill(current); // (nom remis en texte simple pour la fiche du téléphone)
      }, 420);
    }
  }

  return { el, open, close, isOpen: () => opened || cardsOpen, sync, dock, show };
}
