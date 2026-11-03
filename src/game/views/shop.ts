import { collectionSig, liveRegen, type GameBackend, type PackCard, type SealedPack } from '../backend';
import { fmtCountdown } from '../../core/packRegen';
import type { Shell } from '../shell';
import { openStyleOf, type OpeningScene } from '../scenes/opening';
import type { ViewerScene } from '../scenes/viewer';
import type { PackRequest } from '../../core/packRoll';
import { BEBOU_PACK, THEMES, catalogEntry, numberingSize, subthemeById, themeById } from '../../core/sets/themes';
import { cardById } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { cardTile, errMsg, esc, fmtN, h, popLayer, pushLayer, starsHtml, toast } from '../ui';
import { createPackSheet, shopPacks } from './packSheet';
import { preloadArt } from '../preload';
import { isTouch } from '../../core/renderer';
import { haptics } from '../../core/haptics';
import { createBigPulls } from './bigPulls';

/** Indications adaptées à l'appareil : « Touche » au doigt, « Clique » à la souris. */
const TOUCH = isTouch();
const HINT = {
  hold: TOUCH ? 'Maintiens pour ouvrir' : 'Maintiens le clic (ou Espace) pour ouvrir',
  tear: TOUCH ? 'Glisse vers la droite pour déchirer' : 'Glisse vers la droite (ou clique) pour déchirer',
  tap: TOUCH ? 'Touche pour ouvrir' : 'Clique pour ouvrir',
  reveal: TOUCH ? 'Touche pour révéler' : 'Clique pour révéler',
  next: TOUCH ? 'Touche pour la suivante' : 'Clique pour la suivante',
  last: 'Dernière carte…',
};

/** Seuil de « Passer jusqu'aux 4★ » : rang 3 = Épique (★★★★), puis Légendaire, Mythique, Secrète. */
const HI_RANK = 3;
/** indication affichée tant que le booster est fermé (dépend de sa mise en scène : brûler, déchirer, toucher) */
let sealedHint = HINT.hold;

/**
 * Boutique + ouverture. Accueil (retours live n°1) — ordinateur, 3 colonnes : à gauche la liste verticale compacte des
 * packs (BIENTÔT pour ceux pas encore sortis), au centre le GROS booster 3D interactif (inclinaison à la souris, glisser
 * pour changer), à droite le fil vertical des gros tirages qui défile tout seul. Téléphone : le fil en haut, le booster
 * au centre, la rangée des pochettes en bas. Toucher une pochette la met au centre ET ouvre sa FICHE (packSheet.ts : chances, pity, cartes, envies, Ouvrir) ; l'ouverture
 * se joue ensuite dans la même scène 3D, sans chargement.
 */
export interface ShopView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
  /** vrai pendant une ouverture (la navigation est alors bloquée) */
  busy(): boolean;
}

const keyOf = (p: SealedPack) => (p.packKind === 'bebou' ? 'bebou' : themeById(p.themeId ?? '')?.id ?? 'gaming');

export function createShopView(backend: GameBackend, shell: Shell, opening: OpeningScene, go: (route: string) => void, getViewer: () => Promise<ViewerScene>): ShopView {
  const el = h('section', 'view shop');
  const list = shopPacks();
  let selected = (() => {
    try {
      return localStorage.getItem('bebou.booster') ?? 'bebou';
    } catch {
      return 'bebou';
    }
  })();
  if (!list.some((b) => b.key === selected)) selected = 'bebou';
  let mode: 'pick' | 'opening' | 'summary' = 'pick';
  let pack: SealedPack | null = null;
  /**
   * Ouverture en série : boosters déjà ouverts (et crédités) + celui en cours. Chaque booster n'est crédité côté
   * serveur qu'une fois montré (pas d'annonce avant que le joueur ait vu sa carte) ; « Tout passer » tire et crédite
   * le reste d'un coup.
   */
  let batch: { req: PackRequest; total: number; done: SealedPack[]; current: SealedPack | null; hi: boolean; all: boolean; skipping: boolean } | null = null;
  let secretExp: { replay?(): void } | null = null;

  el.innerHTML = `
    <div class="shop-home">
      <div class="shop-left">
        <div class="shop-title"><span class="kicker">BOUTIQUE</span><h2>Choisis ton booster</h2><p class="shop-hint"></p></div>
        <div class="packs-row" role="listbox" aria-label="Boosters"></div>
      </div>
      <div class="sealed-banner home-banner" hidden><span></span><button class="btn-primary">Ouvrir</button></div>
      <div class="shop-right"></div>
    </div>
    <div class="hud" hidden>
      <div class="hud-count"></div>
      <!-- bas de l'écran : fiche de la carte, indication, boutons — empilés, ils ne peuvent plus se chevaucher -->
      <div class="hud-bottom">
        <div class="card-info" hidden></div>
        <div class="hud-hint"><span class="ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" pathLength="100"/><circle class="p" cx="18" cy="18" r="15.5" pathLength="100"/></svg></span><span class="txt"></span></div>
        <div class="hud-skip"><button class="skip-hi" title="Les cartes de moins de 4 étoiles défilent toutes seules">⏭ 4★ et +</button><button class="skip-reveal" title="Les cartes se retournent toutes seules (une 6★ garde son plein écran)">Tout révéler</button><button class="skip-all" title="Créditer sans regarder">Tout passer</button></div>
      </div>
      <div class="mythic-veil" hidden><div class="mv-kicker">✺ MYTHIQUE ✺</div><div class="mv-stars">★★★★★★</div><div class="mv-name"></div><div class="mv-hint"></div></div>
    </div>
    <div class="sum-bg" hidden><div class="sum-rays"></div><div class="sum-parts"></div></div>
    <div class="fan-badges" hidden></div>
    <div class="summary" hidden></div>
    <div class="secret-continue" hidden><button class="btn-primary">Continuer</button></div>
    <div class="viewer-ui shop-viewer" hidden><button class="close" aria-label="Fermer">✕</button><div class="v-info"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
  const rowEl = el.querySelector<HTMLElement>('.packs-row')!;
  const hintEl = el.querySelector<HTMLElement>('.shop-hint')!;
  const banner = el.querySelector<HTMLElement>('.home-banner')!;
  const hud = el.querySelector<HTMLElement>('.hud')!;
  const hint = el.querySelector<HTMLElement>('.hud-hint')!;
  const hintTxt = hint.querySelector<HTMLElement>('.txt')!;
  const ring = hint.querySelector<SVGCircleElement>('circle.p')!;
  const count = el.querySelector<HTMLElement>('.hud-count')!;
  const info = el.querySelector<HTMLElement>('.card-info')!;
  const summary = el.querySelector<HTMLElement>('.summary')!;
  const secretContinue = el.querySelector<HTMLElement>('.secret-continue')!;
  // gros tirages de tout le groupe, en haut de l'accueil ; une carte touchée s'ouvre dans la visionneuse
  const big = createBigPulls(backend, (card) => void viewCard(card));
  el.querySelector('.shop-right')!.append(big.el);
  const leftCol = el.querySelector<HTMLElement>('.shop-left')!;
  const rightCol = el.querySelector<HTMLElement>('.shop-right')!;
  const skipEl = el.querySelector<HTMLElement>('.hud-skip')!;
  const skipHi = skipEl.querySelector<HTMLButtonElement>('.skip-hi')!;
  const skipReveal = skipEl.querySelector<HTMLButtonElement>('.skip-reveal')!;
  const skipAll = skipEl.querySelector<HTMLButtonElement>('.skip-all')!;
  const mythicVeil = el.querySelector<HTMLElement>('.mythic-veil')!;
  const sumBg = el.querySelector<HTMLElement>('.sum-bg')!;
  const fanBadges = el.querySelector<HTMLElement>('.fan-badges')!;
  hintEl.textContent = TOUCH ? 'Touche une pochette pour voir ce qu’elle contient' : 'Clique sur un pack pour voir ce qu’il contient · ↑ ↓ pour changer';

  // ── fiche du booster (overlay)
  // visuels des pochettes (face du vrai booster, rendue par la scène) : capturés une fois, dès qu'ils existent
  const thumbs = new Map<string, string>();
  const sheet = createPackSheet(backend, shell, list, {
    thumb: (k, size) => thumbs.get(k) ?? opening.packThumb(k, size),
    onSelect: (k) => select(k, { scroll: true }),
    viewCard: (c) => void viewCard(c),
    async onOpen(p, total) {
      if (mode !== 'pick') return;
      const got = await backend.preparePack(p.req);
      pack = got;
      batch = { req: p.req, total, done: [], current: got, hi: batch?.hi ?? false, all: false, skipping: false };
      sheet.close();
      start(got);
    },
  });
  el.append(sheet.el);

  // ── les 5 pochettes
  for (const b of list) {
    const btn = h('button', `sleeve${b.soon ? ' soon' : ''}${b.key === 'bebou' ? ' special' : ''}`, `
      <span class="sl-art" style="--acc:${b.accent}"><span class="sl-ph"></span>${b.soon ? '<span class="sl-seal">BIENTÔT</span>' : ''}</span>
      <span class="sl-name">${esc(b.name)}</span>
      <span class="sl-desc">${esc(b.desc)}</span>
      <span class="sl-prog"><i></i></span>`);
    btn.dataset.key = b.key;
    btn.setAttribute('role', 'option');
    btn.addEventListener('click', () => {
      haptics.pulse(6);
      sheet.open(b.key);
    });
    rowEl.append(btn);
  }
  const sleeveOf = (k: string) => rowEl.querySelector<HTMLElement>(`.sleeve[data-key="${k}"]`);
  function paintSleeves() {
    for (const b of list) {
      const art = sleeveOf(b.key)?.querySelector<HTMLElement>('.sl-art');
      if (!art || art.querySelector('img')) continue;
      const src = opening.packThumb(b.key, 360);
      if (!src) continue;
      thumbs.set(b.key, src);
      const img = h('img');
      img.src = src;
      img.alt = '';
      img.decoding = 'async';
      art.querySelector('.sl-ph')?.replaceWith(img);
    }
  }

  function select(k: string, o: { dir?: 1 | -1; scroll?: boolean } = {}) {
    if (mode !== 'pick') return;
    // sens de rotation du booster : vers la droite si on avance dans la liste, vers la gauche si on recule
    const from = list.findIndex((b) => b.key === selected);
    const to = list.findIndex((b) => b.key === k);
    const dir = o.dir ?? (to >= from ? 1 : -1);
    selected = k;
    try {
      localStorage.setItem('bebou.booster', k);
    } catch {
      /* ignore */
    }
    rowEl.querySelectorAll<HTMLElement>('.sleeve').forEach((b) => {
      b.classList.toggle('on', b.dataset.key === k);
      b.setAttribute('aria-selected', String(b.dataset.key === k));
    });
    // téléphone : la pochette choisie revient au centre du carrousel
    if (o.scroll !== false) sleeveOf(k)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    opening.setBooster(k, true, dir);
    opening.setBoosterSoon(!!list.find((b) => b.key === k)?.soon);
    syncState();
  }

  // téléphone : faire défiler le carrousel au doigt choisit la pochette qui s'arrête au centre
  let scrollT = 0;
  const pickCentered = () => {
    if (mode !== 'pick' || rowEl.scrollWidth <= rowEl.clientWidth + 4 || backend.state.sealed) return;
    const r = rowEl.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    let best: HTMLElement | null = null;
    let bd = Infinity;
    for (const b of rowEl.querySelectorAll<HTMLElement>('.sleeve')) {
      const br = b.getBoundingClientRect();
      const d = Math.abs(br.left + br.width / 2 - mid);
      if (d < bd) (bd = d), (best = b);
    }
    const k = best?.dataset.key;
    if (k && k !== selected) select(k, { scroll: false });
  };
  rowEl.addEventListener('scroll', () => {
    clearTimeout(scrollT);
    scrollT = window.setTimeout(pickCentered, 140);
  }, { passive: true });

  // ── état (booster scellé pas encore ouvert : bandeau + bouton direct)
  function syncState() {
    const s = backend.state;
    if (mode !== 'pick') return;
    if (s.sealed) {
      const t = themeById(s.sealed.themeId ?? '');
      const name = s.sealed.packKind === 'bebou' ? BEBOU_PACK.label : t ? `${t.label} Pack` : 'booster';
      banner.hidden = false;
      banner.querySelector('span')!.textContent = `Tu as un ${name} déjà tiré, pas encore ouvert.`;
      if (keyOf(s.sealed) !== selected) select(keyOf(s.sealed));
    } else banner.hidden = true;
    sheet.sync();
  }
  backend.onChange(syncState);
  banner.querySelector('button')!.addEventListener('click', async () => {
    shell.requestGyro();
    const sp = backend.state.sealed;
    if (!sp || mode !== 'pick') return;
    const p = list.find((b) => b.key === keyOf(sp)) ?? list[2];
    try {
      const got = await backend.preparePack(p.req);
      pack = got;
      batch = { req: p.req, total: 1, done: [], current: got, hi: false, all: false, skipping: false };
      start(got);
    } catch (e) {
      toast(errMsg(e), 'err');
    }
  });
  // sous chaque pochette, un filet : la part de ses cartes déjà dans ta collection
  let progSig = '';
  backend.onChange((st) => {
    const sig = collectionSig(st);
    if (sig === progSig) return;
    progSig = sig;
    const mine = new Set(st.collection.map((c) => c.cardId));
    for (const b of list) {
      const btn = sleeveOf(b.key);
      if (!btn || !b.cards.length) continue;
      const have = b.cards.reduce((a, c) => a + (mine.has(c.id) ? 1 : 0), 0);
      btn.style.setProperty('--pct', `${(have / b.cards.length) * 100}%`);
      btn.classList.add('has-prog');
      btn.title = `${fmtN(have)} / ${fmtN(b.cards.length)} cartes déjà dans ta collection`;
    }
  });

  // glisser le doigt sur le booster en 3D : vers la gauche = booster suivant, vers la droite = précédent
  opening.onBoosterSwipe = (dir) => {
    if (mode !== 'pick' || !el.isConnected || backend.state.sealed || sheet.isOpen()) return;
    const i = list.findIndex((b) => b.key === selected);
    const d = (dir > 0 ? -1 : 1) as 1 | -1;
    select(list[(i + d + list.length) % list.length].key, { dir: d });
  };
  // toucher le booster en 3D = sa fiche
  opening.onBoosterTap = () => {
    if (mode === 'pick' && el.isConnected && !sheet.isOpen()) sheet.open(selected);
  };
  // clavier, au récap : Entrée = « Encore un »
  window.addEventListener('keydown', (e) => {
    if (mode !== 'summary' || viewing || !el.isConnected || e.repeat || e.key !== 'Enter') return;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    summary.querySelector<HTMLButtonElement>('.again')?.click();
  });
  // clavier : ← → pour passer d'une pochette à l'autre, Entrée = sa fiche
  window.addEventListener('keydown', (e) => {
    if (mode !== 'pick' || !el.isConnected || e.altKey || e.ctrlKey || e.metaKey || sheet.isOpen()) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    if (e.key === 'Enter' && !/^(BUTTON|A)$/.test((e.target as HTMLElement)?.tagName ?? '')) return sheet.open(selected);
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d || backend.state.sealed) return;
    e.preventDefault();
    const i = list.findIndex((b) => b.key === selected);
    select(list[(i + d + list.length) % list.length].key, { dir: d as 1 | -1 });
  });

  // ── passer : jusqu'aux 4★ et + (bascule, garde son état d'un booster à l'autre de la série) / tout
  function applyAuto() {
    const hi = !!batch?.hi;
    const all = !!batch?.all;
    skipHi.classList.toggle('on', hi && !all);
    skipHi.setAttribute('aria-pressed', String(hi && !all));
    skipReveal.classList.toggle('on', all);
    skipReveal.disabled = all;
    // série : à partir du 2e booster l'emballage se brûle tout seul ; « 4★ et + » / « Tout révéler » : dès le premier
    const burn = hi || all || (!!batch && batch.done.length > 0);
    // « Tout révéler » : tout défile tout seul SAUF une mythique (rang 5) ou une secrète (6), qui gardent leur plein écran
    opening.setAuto({ burn, minRank: all ? 5 : hi ? HI_RANK : 0, reveal: all });
    if (opening.phase === 'sealed') hintTxt.textContent = burn ? 'Ouverture…' : sealedHint;
  }
  skipHi.addEventListener('click', () => {
    if (!batch || mode !== 'opening') return;
    batch.hi = !batch.hi;
    haptics.pulse(8);
    applyAuto();
  });
  skipReveal.addEventListener('click', () => {
    if (!batch || mode !== 'opening' || batch.all) return;
    batch.all = true;
    haptics.pulse(8);
    applyAuto();
    // emballage déjà ouvert et carte en attente : on enchaîne tout de suite
    if (opening.phase === 'opened' || opening.phase === 'shown') opening.advance();
  });
  skipAll.addEventListener('click', () => void skipEverything());

  /** « Tout passer » : crédite le booster en cours, tire + crédite le reste de la série, puis le récap. */
  async function skipEverything() {
    if (!batch || batch.skipping || mode !== 'opening') return;
    batch.skipping = true;
    skipAll.disabled = skipHi.disabled = true;
    opening.setAuto({ burn: false, minRank: 0, reveal: false });
    hint.hidden = false;
    hint.classList.remove('hold');
    info.classList.remove('in');
    try {
      if (batch.current) {
        await backend.revealPack(batch.current.id);
        batch.done.push(batch.current);
        batch.current = null;
      }
      while (batch.done.length < batch.total) {
        hintTxt.textContent = `Ouverture… ${batch.done.length + 1} / ${batch.total}`;
        const p = await backend.preparePack(batch.req);
        await backend.revealPack(p.id);
        batch.done.push(p);
      }
    } catch (e) {
      toast(errMsg(e), 'err');
    }
    if (secretExp) {
      shell.show('opening');
      shell.unmount('secret');
      secretExp = null;
    }
    secretContinue.hidden = true;
    opening.reset();
    showSummary();
  }

  /**
   * Vitrine : le booster 3D se centre dans l'espace libre entre les colonnes (ordinateur : liste des packs à gauche,
   * gros tirages à droite — ou la fiche du pack quand elle est ouverte) ; pendant l'ouverture, au récap et sur
   * téléphone : centre de l'écran.
   */
  function placeFocus() {
    let px = 0;
    const W = window.innerWidth;
    if (mode === 'pick' && W > 860) {
      const l = leftCol.getBoundingClientRect().right;
      const r = sheet.isOpen() ? W - 12 - Math.min(460, W * 0.42) : rightCol.getBoundingClientRect().left || W;
      px = Math.round((Math.max(0, l) + r) / 2 - W / 2);
    }
    opening.setFocusOffset(px, 0);
    el.style.setProperty('--focus-x', `${px}px`);
  }
  window.addEventListener('resize', placeFocus);
  new MutationObserver(placeFocus).observe(sheet.el, { attributes: true, attributeFilter: ['class', 'hidden'] });

  function setMode(m: typeof mode) {
    mode = m;
    el.dataset.mode = m;
    big.setVisible(m === 'pick');
    placeFocus();
    hud.hidden = m !== 'opening';
    summary.hidden = m !== 'summary';
    document.body.classList.toggle('opening', m === 'opening');
  }

  function start(p: SealedPack) {
    // le bouton « Ouvrir » (désormais caché) ne doit pas garder le focus : sinon « maintenir Espace » l'activerait au
    // lieu de brûler l'emballage
    (document.activeElement as HTMLElement | null)?.blur?.();
    setMode('opening');
    info.hidden = true;
    setCount('');
    hint.hidden = false;
    hint.classList.add('hold');
    const st = openStyleOf(p);
    sealedHint = st === 'tear' ? HINT.tear : st === 'fan' ? HINT.tap : HINT.hold;
    hintTxt.textContent = sealedHint;
    ring.style.strokeDashoffset = '100';
    let shown = 0; // index (ordre de révélation) de la dernière carte retournée
    const series = batch && batch.total > 1 ? `BOOSTER ${batch.done.length + 1}/${batch.total} · ` : '';
    skipEl.hidden = false;
    skipAll.disabled = skipHi.disabled = false;
    if (batch) batch.all = false;
    mythicVeil.hidden = true;
    applyAuto();
    // série (2e booster et suivants) ou « 4★ et + » : l'emballage brûle tout seul
    if (batch && (batch.hi || batch.done.length > 0)) hintTxt.textContent = 'Ouverture…';
    if (series) setCount(series.replace(/ · $/, ''));
    void preloadArt(p.cards.map((c) => c.cardId)); // en parallèle de la scène : images prêtes au plus tôt
    const secret = p.cards.find((c) => rarity(c.rarity).secret);
    if (secret) void prepareSecret(secret);
    opening.open(p, {
      onHold(v) {
        ring.style.strokeDashoffset = String(100 - v * 100);
      },
      onOpened() {
        hint.classList.remove('hold');
        hintTxt.textContent = HINT.reveal;
        setCount(`${series}1 / ${p.cards.length}`);
      },
      onCard(i, card, total) {
        setCount(`${series}${i + 1} / ${total}`);
        shown = i;
        // mythique : la séquence plein écran (mythic-veil) tient lieu de fiche et d'indication
        if (rarity(card.rarity).rank === 5) return;
        hint.hidden = i < total - 1 ? false : true;
        hintTxt.textContent = i < total - 1 ? HINT.next : '';
        showInfo(card);
      },
      onNext() {
        // la carte montrée file dans la rangée : son panneau s'efface, la suivante attend face cachée
        info.classList.remove('in');
        mythicVeil.hidden = true;
        skipEl.hidden = false;
        hintTxt.textContent = HINT.reveal;
        setCount(`${series}${Math.min(p.cards.length, shown + 2)} / ${p.cards.length}`);
      },
      onMythic(card) {
        // 6★ PLEIN ÉCRAN : tout s'efface, pause dramatique, puis la carte, ses étoiles une à une
        info.hidden = true;
        info.classList.remove('in');
        hint.hidden = true;
        skipEl.hidden = true;
        mythicVeil.hidden = false;
        mythicVeil.classList.remove('shown');
        mythicVeil.querySelector<HTMLElement>('.mv-name')!.textContent = card.cardName;
        mythicVeil.querySelector<HTMLElement>('.mv-hint')!.textContent = '';
      },
      onMythicShown(_card, last) {
        mythicVeil.classList.add('shown');
        mythicVeil.querySelector<HTMLElement>('.mv-hint')!.textContent = last ? (TOUCH ? 'Touche pour continuer' : 'Clique pour continuer') : HINT.next;
      },
      onLast() {
        info.classList.remove('in');
        hint.hidden = false;
        hintTxt.textContent = HINT.last;
        setCount(`${series}${p.cards.length} / ${p.cards.length}`);
      },
      onSecret() {
        hud.hidden = true;
        // la séquence « Un de nous » ne se passe pas : on coupe le défilement pour la suite de la série
        if (batch) batch.hi = false;
        opening.setAuto({ burn: false, minRank: 0, reveal: false });
        void runSecret();
      },
      onDone() {
        mythicVeil.hidden = true;
        void done(p);
      },
      onPick(card) {
        void viewCard(card);
      },
    });
  }

  /** « 2 / 5 » : petit rebond du compteur quand il change */
  function setCount(t: string) {
    if (count.textContent === t) return;
    count.textContent = t;
    if (!t) return;
    count.classList.remove('tick');
    void count.offsetWidth;
    count.classList.add('tick');
  }

  function showInfo(card: PackCard) {
    const rr = rarity(card.rarity);
    const e = catalogEntry(card.cardId);
    const theme = e ? themeById(e.themeId) : null;
    const subt = e ? subthemeById(e.subthemeId) : null;
    info.hidden = false;
    info.style.setProperty('--rc', rr.hex);
    info.style.setProperty('--ra', rr.accentHex);
    info.className = `card-info r-${card.rarity}`;
    // exemplaires déjà possédés (la collection n'est créditée qu'à la fin de l'ouverture)
    const had = backend.state.collection.find((c) => c.cardId === card.cardId && c.rarity === card.rarity)?.count ?? 0;
    info.innerHTML = `
      ${card.isNew ? '<span class="new">NOUVELLE\u00a0!</span>' : `<span class="dup">${had ? `déjà ${had}× dans ta collection` : 'en double dans ce booster'}</span>`}
      <div class="ci-name">${esc(card.cardName)}</div>
      <div class="ci-meta">${starsHtml(card.rarity)} <span class="ci-r">${rr.label}</span></div>
      <div class="ci-sub">${subt ? esc(subt.label) : ''}${theme && !theme.secret ? ` · ${esc(theme.label)}` : ''} · n°${fmtN(card.mintNumber)}\u00a0imprimé</div>`;
    void info.offsetWidth;
    info.classList.add('in');
  }

  /** Scène secrète (039) montée en fond dès que le pack est tiré : shaders compilés avant même la déchirure. */
  async function prepareSecret(card: PackCard) {
    const mod = await import('../../experiments/039-bebou-secret/index');
    const exp = mod.default({
      card: cardById(card.cardId),
      fromStack: true,
      autoStart: false,
      onRevealed: () => {
        secretContinue.hidden = false;
      },
    });
    secretExp = exp;
    await shell.mount('secret', exp, 'secret');
  }

  async function runSecret() {
    // la scène est normalement prête depuis longtemps ; sinon on attend qu'elle le soit
    for (let i = 0; i < 200 && !(secretExp && shell.has('secret')); i++) await new Promise((r) => setTimeout(r, 50));
    shell.show('secret');
    secretExp?.replay?.();
  }

  secretContinue.querySelector('button')!.addEventListener('click', () => {
    secretContinue.hidden = true;
    shell.show('opening');
    shell.unmount('secret');
    secretExp = null;
    opening.finishAfterSecret();
  });

  async function done(p: SealedPack) {
    if (batch?.skipping) return;
    try {
      await backend.revealPack(p.id);
    } catch (e) {
      toast(`Cartes pas encore enregistrées : ${errMsg(e)} — elles le seront à la prochaine ouverture.`, 'err');
    }
    if (batch) {
      batch.done.push(p);
      batch.current = null;
      // série : booster suivant, sans repasser par la boutique (l'éventail reste un instant, puis le booster revient)
      if (batch.done.length < batch.total) {
        const b = batch;
        let next: SealedPack;
        try {
          next = await backend.preparePack(b.req);
        } catch (e) {
          toast(errMsg(e), 'err');
          return showSummary();
        }
        if (batch !== b || b.skipping) return;
        b.current = next;
        pack = next;
        await new Promise((r) => setTimeout(r, b.hi ? 350 : 900));
        if (batch !== b || b.skipping) return;
        opening.reset();
        await new Promise((r) => setTimeout(r, 650));
        if (batch !== b || b.skipping) return;
        start(next);
        return;
      }
    }
    showSummary();
  }

  /** Compteur de collection du booster : « World : 143/924 » (thème), « Collection : 1 234/13 888 » (Bebou Pack). */
  function collectionCounter(req: PackRequest): { label: string; have: number; total: number } {
    const mine = new Set(backend.state.collection.map((c) => c.cardId));
    const t = req.kind === 'theme' ? themeById(req.themeId ?? '') : undefined;
    const cards = t ? t.cards : THEMES.flatMap((x) => x.cards);
    return { label: t ? t.label : 'Collection', have: cards.reduce((a, c) => a + (mine.has(c.id) ? 1 : 0), 0), total: cards.length };
  }

  /** Fond du récap selon le meilleur drop : lueur radiale de la couleur de la rareté, rayons et particules aux couleurs du pack. */
  function paintSummaryBg(best: PackCard, req: PackRequest) {
    const rr = rarity(best.rarity);
    const accent = req.kind === 'bebou' ? BEBOU_PACK.style.accent : themeById(req.themeId ?? '')?.style.accent ?? rr.hex;
    sumBg.className = `sum-bg r-${best.rarity}`;
    sumBg.style.setProperty('--rc', rr.secret ? '#e8927c' : rr.hex);
    sumBg.style.setProperty('--ra', rr.accentHex);
    sumBg.style.setProperty('--pa', accent);
    // intensité croissante avec la rareté (commune : presque rien)
    sumBg.style.setProperty('--k', String([0.08, 0.16, 0.3, 0.5, 0.75, 1, 1][Math.min(6, rr.rank)]));
    const parts = sumBg.querySelector<HTMLElement>('.sum-parts')!;
    parts.replaceChildren();
    const n = rr.rank >= 4 ? 22 : rr.rank >= 2 ? 12 : 0;
    for (let i = 0; i < n; i++) {
      const sp = h('i');
      sp.style.setProperty('--x', `${(Math.random() * 100).toFixed(1)}%`);
      sp.style.setProperty('--d', `${(4 + Math.random() * 6).toFixed(2)}s`);
      sp.style.setProperty('--dl', `${(-Math.random() * 8).toFixed(2)}s`);
      sp.style.setProperty('--s', `${(2 + Math.random() * 4).toFixed(1)}px`);
      parts.append(sp);
    }
    sumBg.hidden = false;
  }

  /** Badges NOUVELLE / DOUBLON ×n posés sur les cartes de l'éventail 3D (suivent les cartes à chaque image). */
  let badgeRaf = 0;
  function showFanBadges(cards: PackCard[]) {
    cancelAnimationFrame(badgeRaf);
    fanBadges.replaceChildren();
    fanBadges.hidden = false;
    const byKey = new Map<string, HTMLElement>();
    const counts = new Map<string, number>();
    for (const c of backend.state.collection) counts.set(`${c.cardId}:${c.rarity}`, (counts.get(`${c.cardId}:${c.rarity}`) ?? 0) + c.count);
    for (const c of cards) {
      const k = `${c.cardId}:${c.rarity}:${c.mintNumber}`;
      const n = counts.get(`${c.cardId}:${c.rarity}`) ?? 0;
      const b = h('span', `fb ${c.isNew ? 'fb-new' : 'fb-dup'}`, c.isNew ? 'NOUVELLE' : `DOUBLON${n > 1 ? ` ×${n}` : ''}`);
      b.style.opacity = '0';
      fanBadges.append(b);
      byKey.set(k, b);
    }
    const tick = () => {
      if (fanBadges.hidden) return;
      const rects = opening.fanRects();
      if (rects) {
        for (const r of rects) {
          const b = byKey.get(`${r.card.cardId}:${r.card.rarity}:${r.card.mintNumber}`);
          if (!b) continue;
          b.style.transform = `translate(${Math.round(r.x + r.w / 2)}px, ${Math.round(r.y + 6)}px) translateX(-50%)`;
          b.style.opacity = '1';
        }
      }
      badgeRaf = requestAnimationFrame(tick);
    };
    badgeRaf = requestAnimationFrame(tick);
  }
  function hideFanBadges() {
    cancelAnimationFrame(badgeRaf);
    fanBadges.hidden = true;
  }

  /** Récapitulatif : ligne résumé compacte (nouvelles · doublons · meilleure carte · compteur) + 3 boutons ; les cartes restent dans l'éventail 3D. */
  function showSummary() {
    const packs = batch?.done.length ? batch.done : pack ? [pack] : [];
    const multi = packs.length > 1;
    const all = packs.flatMap((x) => x.cards);
    const req: PackRequest = batch?.req ?? (pack?.packKind === 'bebou' ? { kind: 'bebou' } : { kind: 'theme', themeId: pack?.themeId });
    skipEl.hidden = true;
    mythicVeil.hidden = true;
    setMode('summary');
    const u = backend.state.user;
    const rank = (c: PackCard) => rarity(c.rarity).rank;
    const sorted = all.map((c, i) => ({ c, i })).sort((a, b) => rank(b.c) - rank(a.c) || a.i - b.i).map((x) => x.c);
    const best = sorted[0];
    const fresh = all.filter((c) => c.isNew).length;
    const dups = all.length - fresh;
    const hiN = all.filter((c) => rank(c) >= HI_RANK).length;
    const cc = collectionCounter(req);
    const br = best ? rarity(best.rarity) : null;
    summary.classList.toggle('multi', multi);
    const again = u ? Math.min(liveRegen(u).balance, packs.length) : 0;
    summary.innerHTML = `
      <div class="sum-line">
        ${multi ? `<span class="sum-k"><b>${packs.length}</b> boosters${hiN ? ` · <b>${hiN}</b> 4★ et +` : ''}</span>` : ''}
        <span class="sum-k${fresh ? ' hi' : ''}"><b>${fresh}</b> nouvelle${fresh > 1 ? 's' : ''}</span>
        <span class="sum-k"><b>${dups}</b> doublon${dups > 1 ? 's' : ''}</span>
        ${best && br ? `<span class="sum-best r-${best.rarity}" style="--rc:${br.hex};--ra:${br.accentHex}">meilleure ${starsHtml(best.rarity)} <b>${esc(best.cardName)}</b></span>` : ''}
        <span class="sum-coll" title="${esc(cc.label)} : cartes uniques dans ta collection">${esc(cc.label)} : <b>${fmtN(cc.have)}</b>/${fmtN(cc.total)}</span>
      </div>
      ${multi ? '<div class="sum-cards"></div>' : ''}
      <div class="sum-actions">
        ${u && liveRegen(u).balance > 0 ? `<button class="btn-primary again" data-n="${again}">${again > 1 ? `Encore ×${again}` : 'Encore un'} (${liveRegen(u).balance})</button>` : u ? `<span class="muted next-pack">prochain booster dans ${fmtCountdown((liveRegen(u).nextAt ?? Date.now()) - Date.now())}</span>` : ''}
        <button class="btn-ghost coll">${fresh ? 'Voir mes nouvelles' : dups === all.length ? 'Contrats' : 'Ma collection'}</button>
        <button class="btn-ghost back">Boutique</button>
      </div>`;
    if (best) paintSummaryBg(best, req);
    if (multi) {
      const cards = summary.querySelector<HTMLElement>('.sum-cards')!;
      for (const [k, c] of sorted.entries()) {
        const tile = cardTile(c.cardId, c.rarity, { mini: true, label: c.isNew ? 'NOUVELLE' : undefined });
        tile.style.setProperty('--i', String(k)); // arrivée en cascade
        tile.addEventListener('click', () => void viewCard(c));
        cards.append(tile);
      }
      hideFanBadges();
    } else showFanBadges(all);
    summary.querySelector('.again')?.addEventListener('click', async (e) => {
      shell.requestGyro();
      const n = Number((e.currentTarget as HTMLElement).dataset.n) || 1;
      const p = list.find((b) => b.key === (req.kind === 'bebou' ? 'bebou' : themeById(req.themeId ?? '')?.id)) ?? list[2];
      const hi = batch?.hi ?? false;
      back();
      await new Promise((r) => setTimeout(r, 650));
      if (mode !== 'pick') return;
      try {
        const got = await backend.preparePack(p.req);
        pack = got;
        batch = { req: p.req, total: Math.max(1, n), done: [], current: got, hi, all: false, skipping: false };
        start(got);
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
    // « Voir mes nouvelles » : directement les nouvelles cartes de ce tirage (filtre « Nouvelles ») ; que des doublons : les contrats
    summary.querySelector('.coll')!.addEventListener('click', () => (back(), go(fresh ? 'collection/nouvelles' : dups === all.length ? 'contrats' : 'collection')));
    summary.querySelector('.back')!.addEventListener('click', back);
  }

  // ── carte en grand (éventail final ou miniature du récap) dans la visionneuse 3D
  const viewerUi = el.querySelector<HTMLElement>('.shop-viewer')!;
  let viewing = false;
  let viewedAt = 0;
  let viewerRef: ViewerScene | null = null;
  // zoom overlay : un toucher à côté de la carte la referme (comme la croix et Échap) — pas celui qui vient de l'ouvrir
  shell.input.onTap((x, y) => {
    if (!viewing || !viewerRef || performance.now() - viewedAt < 450 || !el.isConnected) return;
    if (!viewerRef.hits(x, y)) closeViewer();
  });
  async function viewCard(card: PackCard) {
    shell.requestGyro();
    if (!viewing) pushLayer(closeViewer); // « retour » du téléphone = fermer la carte, pas quitter la boutique
    viewing = true;
    viewedAt = performance.now();
    const rr = rarity(card.rarity);
    const e = catalogEntry(card.cardId);
    const st = e ? subthemeById(e.subthemeId) : null;
    const vi = viewerUi.querySelector<HTMLElement>('.v-info')!;
    vi.className = `v-info r-${card.rarity}`;
    vi.style.setProperty('--ra', rr.accentHex);
    vi.innerHTML = `${card.isNew ? '<div class="ci-new">NOUVELLE</div>' : ''}<div class="ci-name">${esc(card.cardName)}</div><div class="ci-meta">${starsHtml(card.rarity)} <span class="ci-r" style="color:${rr.accentHex}">${rr.label}</span></div><div class="ci-sub">${st && e && !rr.secret ? `${esc(st.label)} ${String(e.num).padStart(3, '0')}/${numberingSize(st)} · ` : ''}n°${fmtN(card.mintNumber)}\u00a0imprimé</div>`;
    viewerUi.hidden = false;
    summary.hidden = true;
    fanBadges.hidden = true;
    sumBg.classList.add('veiled');
    big.setVisible(false);
    document.body.classList.add('card-open');
    const viewer = await getViewer();
    viewerRef = viewer;
    if (!viewing) return;
    shell.show('viewer');
    void viewer.show(card.cardId, card.rarity);
  }
  /** Retour à l'éventail, intact (la scène d'ouverture n'a pas bougé pendant le zoom). */
  function closeViewer() {
    if (!viewing) return;
    popLayer();
    viewing = false;
    viewerUi.hidden = true;
    document.body.classList.remove('card-open');
    summary.hidden = mode !== 'summary';
    sumBg.classList.remove('veiled');
    if (mode === 'summary' && !summary.classList.contains('multi')) fanBadges.hidden = false;
    big.setVisible(mode === 'pick');
    shell.show('opening');
  }
  viewerUi.querySelector('.close')!.addEventListener('click', closeViewer);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closeViewer());

  function back() {
    closeViewer();
    hideFanBadges();
    sumBg.hidden = true;
    mythicVeil.hidden = true;
    pack = null;
    batch = null;
    opening.setAuto({ burn: false, minRank: 0, reveal: false });
    opening.reset();
    setMode('pick');
    syncState();
  }

  setMode('pick');
  return {
    el,
    enter(sub) {
      paintSleeves();
      shell.setDimmed(false);
      shell.show('opening');
      requestAnimationFrame(placeFocus);
      select(selected, { scroll: false });
      // téléphone (carrousel) : la pochette choisie au centre, sans animation
      requestAnimationFrame(() => sleeveOf(selected)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' as ScrollBehavior }));
      syncState();
      // lien direct vers une fiche (missions « Go », #/boutique/bebou)
      if (sub && list.some((b) => b.key === sub)) sheet.open(sub);
    },
    leave() {
      sheet.close();
      if (mode === 'summary') back();
    },
    busy: () => mode === 'opening',
  };
}
