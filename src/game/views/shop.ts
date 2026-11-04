import { collectionSig, liveRegen, type GameBackend, type PackCard, type SealedPack } from '../backend';
import { fmtCountdown } from '../../core/packRegen';
import type { Shell } from '../shell';
import { openStyleOf, type OpeningScene } from '../scenes/opening';
import type { ViewerScene } from '../scenes/viewer';
import type { PackRequest } from '../../core/packRoll';
import { BEBOU_PACK, THEMES, catalogEntry, numberingSize, subthemeById, themeById } from '../../core/sets/themes';
import { cardById } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { busyButton, cardTile, errMsg, esc, fmtN, h, popLayer, pushLayer, starsHtml, toast } from '../ui';
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

/**
 * Ouverture en série : boosters déjà ouverts ET crédités (`done`) + celui en cours. `revealing` : crédit en cours
 * (« Tout passer » l'attend au lieu de re-tirer le même booster scellé) ; `pending` : booster montré mais pas crédité
 * (réseau) — il reste scellé côté serveur, la série s'arrête là.
 */
interface Batch {
  req: PackRequest;
  total: number;
  done: SealedPack[];
  current: SealedPack | null;
  hi: boolean;
  all: boolean;
  skipping: boolean;
  revealing: Promise<boolean> | null;
  pending: { pack: SealedPack; err: unknown } | null;
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
  let batch: Batch | null = null;
  let secretExp: { replay?(): void } | null = null;
  const newBatch = (req: PackRequest, total: number, current: SealedPack, hi: boolean, all: boolean): Batch => ({ req, total, done: [], current, hi, all, skipping: false, revealing: null, pending: null });

  /**
   * Crédite un booster montré (audit UX2-05) : `revealPack` réessayé (0,5 / 1,5 / 4 s, ou dès le retour du réseau), le
   * serveur étant idempotent (un booster déjà révélé est simplement renvoyé). Succès : le booster rejoint `b.done` (une
   * seule fois, même si deux appels se croisent). Échec définitif : il reste SCELLÉ côté serveur (on le retrouvera tel
   * quel à la boutique) → `b.pending`, la série s'arrête, et surtout il n'est jamais compté dans le récap.
   */
  function credit(b: Batch, p: SealedPack): Promise<boolean> {
    if (b.done.some((d) => d.id === p.id)) return Promise.resolve(true);
    const run = (async () => {
      const waits = [500, 1500, 4000];
      for (let i = 0; ; i++) {
        try {
          await backend.revealPack(p.id);
          if (!b.done.some((d) => d.id === p.id)) b.done.push(p);
          if (b.pending?.pack.id === p.id) b.pending = null;
          return true;
        } catch (e) {
          if (i >= waits.length) {
            b.pending = { pack: p, err: e };
            return false;
          }
          if (i === 0 && mode === 'opening') {
            hint.hidden = false;
            hintTxt.textContent = 'Enregistrement des cartes…';
          }
          await new Promise<void>((r) => {
            const done = () => (clearTimeout(t), window.removeEventListener('online', done), r());
            const t = window.setTimeout(done, waits[i]);
            window.addEventListener('online', done);
          });
        }
      }
    })();
    b.revealing = run;
    void run.finally(() => b.revealing === run && (b.revealing = null));
    return run;
  }
  /** Message exact quand un booster n'a pas pu être crédité (il n'est PAS perdu : il reste scellé, à rouvrir). */
  const pendingMsg = (e: unknown) =>
    `${typeof navigator !== 'undefined' && navigator.onLine === false ? 'Pas de réseau' : `Enregistrement impossible (${errMsg(e)})`} : ce booster n’est pas encore crédité. Tu le retrouveras tel quel à la boutique (bouton Ouvrir).`;

  el.innerHTML = `
    <div class="shop-home">
      <div class="shop-left">
        <div class="shop-title"><span class="kicker">BOUTIQUE</span><h2>Choisis ton booster</h2><p class="shop-hint"></p></div>
        <div class="packs-row" role="listbox" aria-label="Boosters"></div>
      </div>
      <div class="sealed-banner home-banner" hidden><span></span><button class="btn-primary">Ouvrir</button></div>
      <div class="home-cta" hidden><button class="btn-primary"><span class="hc-t">Ouvrir</span><small class="hc-s"></small></button><p class="hc-tip"></p></div>
      <div class="shop-right"></div>
    </div>
    <div class="hud" hidden>
      <div class="hud-count"></div>
      <div class="coach" hidden aria-hidden="true"><i></i></div>
      <!-- bas de l'écran : fiche de la carte, indication, boutons — empilés, ils ne peuvent plus se chevaucher -->
      <div class="hud-bottom">
        <div class="card-info" hidden></div>
        <div class="hud-hint"><span class="ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" pathLength="100"/><circle class="p" cx="18" cy="18" r="15.5" pathLength="100"/></svg></span><span class="txt"></span></div>
        <div class="hud-skip"><button class="skip-hi" title="Les cartes de moins de 4 étoiles défilent toutes seules">⏭ 4★ et +</button><button class="skip-reveal" title="Les cartes se retournent toutes seules (une 6★ garde son plein écran)">Tout révéler</button><button class="skip-all" title="Aller directement au récap (tout est crédité)">Tout passer</button></div>
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
  const hudBottom = el.querySelector<HTMLElement>('.hud-bottom')!;
  const coach = el.querySelector<HTMLElement>('.coach')!;
  const cta = el.querySelector<HTMLElement>('.home-cta')!;
  const ctaBtn = cta.querySelector<HTMLButtonElement>('button')!;

  /**
   * (audit UX2-06) Zone libre pour la carte montrée : hauteur de l'en-tête + compteur en haut, et du panneau du bas
   * (fiche de la carte, indication, boutons). Paysage (panneau sur le côté, CSS lot B) : rien en bas.
   */
  let infoH = 116;
  function syncInsets() {
    if (mode !== 'opening') return;
    const W = window.innerWidth, H = window.innerHeight;
    const hb = hudBottom.getBoundingClientRect();
    const side = hb.width > 0 && hb.left > W * 0.4;
    const top = Math.max(count.getBoundingClientRect().bottom, 60) + 8;
    const bottom = side ? 0 : H - hb.top + (info.hidden ? infoH + 12 : 0);
    opening.setInsets(top, bottom);
  }
  window.addEventListener('resize', () => requestAnimationFrame(syncInsets));

  /**
   * (audit UX1-13) Accueil téléphone : un vrai bouton « Ouvrir » sous le booster (il ouvre la fiche du booster choisi),
   * et tant qu'aucun booster n'a jamais été ouvert, une phrase qui dit quoi faire.
   */
  function syncCta() {
    const s = backend.state;
    const u = s.user;
    const show = mode === 'pick' && !s.sealed && !(s.mode === 'online' && !u);
    cta.hidden = !show;
    if (!show) return;
    const b = list.find((x) => x.key === selected);
    const bal = u ? liveRegen(u).balance : 0;
    cta.querySelector('.hc-t')!.textContent = b?.soon ? `Voir le ${b.name}` : bal > 0 ? `Ouvrir le ${b?.name ?? 'booster'}` : `Voir le ${b?.name ?? 'booster'}`;
    // premier booster jamais ouvert : la 2e ligne du bouton le dit (une phrase de plus ne tient pas sous le booster en 360×740)
    const first = !!u && u.totalPacksOpened === 0 && bal > 0 && !b?.soon;
    cta.querySelector('.hc-s')!.textContent = b?.soon ? 'bientôt' : first ? `ton premier booster t’attend · ${bal} en réserve` : bal > 0 ? `${bal} en réserve` : 'réserve vide · en recharge';
    cta.querySelector<HTMLElement>('.hc-tip')!.hidden = true;
  }
  ctaBtn.addEventListener('click', () => {
    haptics.pulse(6);
    if (mode === 'pick' && !sheet.isOpen()) sheet.open(selected);
  });

  /**
   * (audit UX2-08) Aide au premier usage du geste d'ouverture, une fois par mise en scène (maintenir / glisser /
   * toucher) : un doigt fantôme montre le geste au-dessus du booster, et disparaît au premier contact. Mémorisée.
   */
  const coachKey = (st: string) => `bebou.coach.${st}`;
  function coachSeen(st: string): boolean {
    try {
      return localStorage.getItem(coachKey(st)) === '1';
    } catch {
      return true; // stockage indisponible : on ne harcèle pas à chaque booster
    }
  }
  function coachDone(st: string) {
    coach.hidden = true;
    try {
      localStorage.setItem(coachKey(st), '1');
    } catch {
      /* ignore */
    }
  }
  const hideCoach = () => (coach.hidden = true);
  window.addEventListener('pointerdown', hideCoach, { passive: true });

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
      batch = newBatch(p.req, total, got, batch?.hi ?? false, false);
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

  // vignettes encodées en tâche de fond (WebP asynchrone, PERF2-18) : posées dès qu'elles sont prêtes
  opening.onThumb = () => paintSleeves();

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
    // téléphone : la pochette choisie revient en tête du carrousel (rangée calée à gauche, retours de Tom du 4 nov.)
    if (o.scroll !== false) sleeveOf(k)?.scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'smooth' });
    // (audit UX2-09) booster déjà tiré d'un autre type : la scène 3D le garde (plus d'aller-retour du booster derrière la fiche)
    const sp = backend.state.sealed;
    if (sp && keyOf(sp) !== k) {
      sheet.sync();
      syncCta();
      return;
    }
    opening.setBooster(k, true, dir);
    opening.setBoosterSoon(!!list.find((b) => b.key === k)?.soon);
    syncState();
  }

  // téléphone : faire défiler le carrousel au doigt choisit la pochette qui s'arrête au centre
  let scrollT = 0;
  const pickCentered = () => {
    if (mode !== 'pick' || rowEl.scrollWidth <= rowEl.clientWidth + 4 || backend.state.sealed) return;
    // (rangée calée à gauche : la pochette choisie est celle qui s'arrête contre le bord, là où s'aimante le défilement)
    const r = rowEl.getBoundingClientRect();
    const edge = r.left + (parseFloat(getComputedStyle(rowEl).scrollPaddingLeft) || 0);
    let best: HTMLElement | null = null;
    let bd = Infinity;
    for (const b of rowEl.querySelectorAll<HTMLElement>('.sleeve')) {
      const br = b.getBoundingClientRect();
      const d = Math.abs(br.left - edge);
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
    syncCta();
  }
  backend.onChange(syncState);
  const bannerBtn = banner.querySelector<HTMLButtonElement>('button')!;
  bannerBtn.addEventListener('click', async () => {
    shell.requestGyro();
    const sp = backend.state.sealed;
    // (audit UX2-20) double toucher pendant la latence de preparePack : un seul départ
    if (!sp || mode !== 'pick' || bannerBtn.disabled) return;
    const p = list.find((b) => b.key === keyOf(sp)) ?? list.find((b) => b.key === 'bebou') ?? list[0];
    bannerBtn.disabled = true;
    try {
      const got = await busyButton(bannerBtn, backend.preparePack(p.req));
      if (mode !== 'pick') return;
      pack = got;
      batch = newBatch(p.req, 1, got, false, false);
      start(got);
    } catch (e) {
      toast(errMsg(e), 'err');
    } finally {
      bannerBtn.disabled = false;
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
  // toucher le booster en 3D (retours live 02, bug 4) = l'écran de pré-ouverture (« glisse pour déchirer… ») : on ouvre
  // UN booster du pack choisi, comme « Ouvrir ×1 ». Pack pas encore sorti, réserve vide, pas connecté : sa fiche.
  let tapBusy = false;
  opening.onBoosterTap = async () => {
    if (mode !== 'pick' || !el.isConnected || sheet.isOpen() || tapBusy) return;
    const p = list.find((b) => b.key === selected);
    const s = backend.state;
    const bal = s.user ? liveRegen(s.user).balance : 0;
    if (!p || p.soon || s.sealed || bal <= 0) return void setTimeout(() => mode === 'pick' && !sheet.isOpen() && sheet.open(selected), 0);
    tapBusy = true;
    haptics.pulse(8);
    try {
      const got = await backend.preparePack(p.req);
      if (mode !== 'pick') return;
      pack = got;
      batch = newBatch(p.req, 1, got, batch?.hi ?? false, false);
      start(got);
    } catch (err) {
      toast(errMsg(err), 'err');
    } finally {
      tapBusy = false;
    }
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
    skipReveal.setAttribute('aria-pressed', String(all));
    // (audit UX2-02) une fois actif, le bouton reste cliquable pour couper la révélation auto (au lieu d'être grisé)
    skipReveal.textContent = all ? 'Révélation auto ✓' : 'Tout révéler';
    // série : à partir du 2e booster l'emballage se brûle tout seul ; « 4★ et + » / « Tout révéler » : dès le premier
    const burn = hi || all || (!!batch && batch.done.length > 0);
    // « Tout révéler » : tout défile tout seul SAUF une mythique (rang 5) ou une secrète (6), qui gardent leur plein écran
    // (une légendaire défile à vitesse modérée, ralenti compris : voir fastSpeed dans opening.ts)
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
    if (!batch || mode !== 'opening') return;
    batch.all = !batch.all;
    haptics.pulse(8);
    applyAuto();
    // emballage déjà ouvert et carte en attente : on enchaîne tout de suite
    if (batch.all && (opening.phase === 'opened' || opening.phase === 'shown')) opening.advance();
  });
  /**
   * « Tout passer » (retours live 02) : un seul toucher, direct au récap (la confirmation « Sûr ? » de l'audit UX2-11 est
   * retirée : la spec le demande, et rien n'est perdu — tout est crédité et montré au récap). Il reste séparé de
   * « Tout révéler » (voir le CSS du lot B).
   */
  const disarmSkip = () => {
    skipAll.classList.remove('armed');
    skipAll.textContent = 'Tout passer';
  };
  skipAll.addEventListener('click', () => {
    if (!batch || batch.skipping || mode !== 'opening') return;
    disarmSkip();
    void skipEverything();
  });

  /**
   * « Tout passer » : (retours live 02) on saute DIRECTEMENT au récap — l'ouverture en cours s'arrête tout de suite
   * (plus de cartes qui finissent de défiler derrière) ; le récap affiche « Enregistrement… n / N » le temps de créditer
   * le booster en cours et de tirer + créditer le reste de la série, puis les cartes (miniatures).
   */
  async function skipEverything() {
    if (!batch || batch.skipping || mode !== 'opening') return;
    batch.skipping = true;
    skipAll.disabled = skipHi.disabled = true;
    opening.setAuto({ burn: false, minRank: 0, reveal: false });
    info.classList.remove('in');
    const b = batch;
    opening.reset();
    skipEl.hidden = true;
    mythicVeil.hidden = true;
    hideFanBadges();
    sumBg.hidden = true;
    setMode('summary');
    summary.classList.remove('multi', 'pending');
    summary.innerHTML = `<div class="sum-line sum-wait" role="status"><span class="sum-k">Enregistrement des cartes… <b class="sw-n">${Math.min(b.total, b.done.length + 1)}</b> / ${b.total}</span></div>`;
    const waitN = summary.querySelector<HTMLElement>('.sw-n');
    syncSummaryInset();
    try {
      // (audit UX2-05) un crédit déjà en route (fin du booster montré) est ATTENDU : sinon preparePack renverrait le même
      // booster encore scellé, crédité et compté deux fois. Tout échec arrête la série, rien n'est compté en trop.
      let ok = b.revealing ? await b.revealing : true;
      if (ok && b.current) {
        const cur = b.current;
        b.current = null;
        ok = await credit(b, cur);
      }
      while (ok && b.done.length < b.total) {
        if (waitN) waitN.textContent = String(b.done.length + 1);
        const p = await backend.preparePack(b.req);
        // garde : le serveur rend un booster déjà compté (scellé non crédité) → on s'arrête
        if (b.done.some((d) => d.id === p.id)) break;
        ok = await credit(b, p);
      }
    } catch (e) {
      toast(errMsg(e), 'err');
    }
    if (b.pending) toast(pendingMsg(b.pending.err), 'err');
    if (secretExp) {
      shell.show('opening');
      shell.unmount('secret');
      secretExp = null;
    }
    secretContinue.hidden = true;
    showSummary();
  }

  /** (retours live 02) hauteur réelle du récap → l'éventail 3D final se pose au-dessus, jamais dessous. */
  function syncSummaryInset() {
    requestAnimationFrame(() => {
      if (mode !== 'summary' || summary.hidden) return opening.setSummaryInset(0);
      const bottom = parseFloat(getComputedStyle(summary).bottom) || 0;
      opening.setSummaryInset(summary.offsetHeight + bottom);
    });
  }
  window.addEventListener('resize', () => mode === 'summary' && syncSummaryInset());

  /**
   * Vitrine : le booster 3D se centre dans l'espace libre entre les colonnes (ordinateur : liste des packs à gauche,
   * gros tirages à droite — ou la fiche du pack quand elle est ouverte) ; pendant l'ouverture, au récap et sur
   * téléphone : centre de l'écran.
   */
  function placeFocus() {
    let px = 0;
    const W = window.innerWidth;
    if (mode === 'pick' && W > 860) {
      // (retours live 02) ordinateur : gros tirages à GAUCHE, liste des packs à DROITE (CSS lot G) ; la fiche du pack
      // s'ouvre côté gauche (par-dessus les gros tirages), la liste reste visible et cliquable
      const a = rightCol.getBoundingClientRect(), b = leftCol.getBoundingClientRect();
      const [lc, rc] = a.left <= b.left ? [a, b] : [b, a];
      let l = lc.width ? lc.right : 0;
      const r = rc.width ? rc.left : W;
      if (sheet.isOpen()) l = Math.max(l, 12 + Math.min(460, W * 0.42));
      px = Math.round((Math.max(0, l) + r) / 2 - W / 2);
    } else if (mode === 'pick' && !big.el.hidden && matchMedia('(max-width: 860px) and (orientation: portrait)').matches) {
      // téléphone (retours 03/11 soir) : la colonne des gros tirages est à gauche → le booster glisse un peu à droite
      const r = big.el.getBoundingClientRect().right;
      if (r > 0 && r < W / 2) px = Math.round(r * 0.42);
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
    if (m !== 'pick') cta.hidden = true;
    else syncCta();
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
    // aide au premier geste (UX2-08) : seulement en ouverture manuelle, tant que ce geste n'a jamais réussi
    const coachSt = st === 'burn' ? 'hold' : st;
    const autoOpen = !!batch && (batch.hi || batch.all || batch.done.length > 0);
    const coachOn = !autoOpen && !coachSeen(coachSt);
    coach.className = `coach c-${coachSt}`;
    coach.hidden = !coachOn;
    requestAnimationFrame(syncInsets);
    let shown = 0; // index (ordre de révélation) de la dernière carte retournée
    const series = batch && batch.total > 1 ? `BOOSTER ${batch.done.length + 1}/${batch.total} · ` : '';
    skipEl.hidden = false;
    skipAll.disabled = skipHi.disabled = false;
    disarmSkip();
    // (audit UX2-02) « Tout révéler » n'est plus remis à zéro à chaque booster : il vaut pour toute la série (comme
    // « 4★ et + ») ; seuls back() (retour boutique) et la séquence secrète le coupent
    mythicVeil.hidden = true;
    applyAuto();
    // série (2e booster et suivants) ou « 4★ et + » : l'emballage brûle tout seul
    if (batch && (batch.hi || batch.all || batch.done.length > 0)) hintTxt.textContent = 'Ouverture…';
    if (series) setCount(series.replace(/ · $/, ''));
    void preloadArt(p.cards.map((c) => c.cardId)); // en parallèle de la scène : images prêtes au plus tôt
    const secret = p.cards.find((c) => rarity(c.rarity).secret);
    if (secret) void prepareSecret(secret);
    opening.open(p, {
      onHold(v) {
        ring.style.strokeDashoffset = String(100 - v * 100);
      },
      onOpened() {
        if (coachOn) coachDone(coachSt);
        else coach.hidden = true;
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
        if (batch) batch.hi = batch.all = false;
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
    // hauteur réelle du panneau : la carte suivante se placera au-dessus (UX2-06)
    requestAnimationFrame(() => {
      if (!info.hidden && info.offsetHeight) infoH = info.offsetHeight;
      syncInsets();
    });
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
    const b = batch ?? (batch = newBatch(openingReq(p), 1, p, false, false));
    if (b.skipping) return;
    if (b.current?.id === p.id) b.current = null;
    const ok = await credit(b, p);
    if (batch !== b || b.skipping) return; // « Tout passer » a pris la main (il attend ce crédit et fait le récap)
    if (!ok) {
      // (audit UX2-05) message exact, série arrêtée : le récap ne compte que ce qui est vraiment crédité
      toast(pendingMsg(b.pending?.err), 'err');
      return showSummary();
    }
    // série : booster suivant, sans repasser par la boutique (l'éventail reste un instant, puis le booster revient)
    if (b.done.length < b.total) {
      let next: SealedPack;
      try {
        next = await backend.preparePack(b.req);
      } catch (e) {
        toast(errMsg(e), 'err');
        return showSummary();
      }
      if (batch !== b || b.skipping) return;
      // garde : jamais rejouer un booster déjà montré et compté
      if (b.done.some((d) => d.id === next.id)) return showSummary();
      b.current = next;
      pack = next;
      // (audit UX2-04) mode auto (« Tout révéler » / « 4★ et + ») : temps morts réduits ; manuel : rythme d'origine
      const fast = b.hi || b.all;
      await new Promise((r) => setTimeout(r, fast ? 250 : 900));
      if (batch !== b || b.skipping) return;
      opening.reset();
      // (en auto, l'entrée du booster de vitrine chevauche l'ouverture suivante : open() reprend la pose en cours)
      await new Promise((r) => setTimeout(r, fast ? 120 : 650));
      if (batch !== b || b.skipping) return;
      start(next);
      return;
    }
    showSummary();
  }
  const openingReq = (p: SealedPack): PackRequest => (p.packKind === 'bebou' ? { kind: 'bebou' } : { kind: 'theme', themeId: p.themeId });

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
    // intensité croissante avec la rareté (commune : presque rien) — (retours live 02) réduite d'environ moitié : le
    // halo ne doit pas noyer l'éventail ni les couleurs des cartes
    sumBg.style.setProperty('--k', String([0.04, 0.08, 0.15, 0.24, 0.36, 0.48, 0.48][Math.min(6, rr.rank)]));
    const parts = sumBg.querySelector<HTMLElement>('.sum-parts')!;
    parts.replaceChildren();
    const n = rr.rank >= 4 ? 12 : rr.rank >= 2 ? 6 : 0;
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
          // (audit UX2-18) à cheval sur le bord BAS de la carte : le haut (numéro, étoiles) reste visible
          b.style.transform = `translate(${Math.round(r.x + r.w / 2)}px, ${Math.round(r.y + r.h - 10)}px) translateX(-50%)`;
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
    // (audit UX2-05) seuls les boosters vraiment crédités comptent ; un booster montré mais pas crédité (réseau) est
    // signalé à part, avec « Réessayer » à la place de « Encore un » (qui rouvrirait le même booster scellé)
    const pend = batch?.pending?.pack ?? null;
    const credited = batch ? batch.done : pack ? [pack] : [];
    const packs = credited.length ? credited : pend ? [pend] : [];
    const multi = packs.length > 1;
    // (audit UX2-03) « Tout passer » sur un ×1 : l'éventail 3D n'existe plus (reset) → la grille de miniatures le remplace
    const grid = multi || (opening.phase !== 'done' && packs.length > 0);
    const all = packs.flatMap((x) => x.cards);
    const req: PackRequest = batch?.req ?? (pack ? openingReq(pack) : { kind: 'bebou' });
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
    summary.classList.toggle('multi', grid);
    summary.classList.toggle('pending', !!pend);
    const again = u ? Math.min(liveRegen(u).balance, packs.length) : 0;
    const bal = u ? liveRegen(u).balance : 0;
    summary.innerHTML = `
      ${pend ? `<div class="sum-warn" role="alert">${credited.length ? `Le booster ${credited.length + 1}/${batch?.total ?? 1} n’est pas encore crédité` : 'Ce booster n’est pas encore crédité'} : il reste tel quel à la boutique (bouton Ouvrir), rien n’est perdu.</div>` : ''}
      <div class="sum-line">
        ${multi ? `<span class="sum-k"><b>${packs.length}</b> boosters${hiN ? ` · <b>${hiN}</b> 4★ et +` : ''}</span>` : ''}
        <span class="sum-k${fresh ? ' hi' : ''}"><b>${fresh}</b> nouvelle${fresh > 1 ? 's' : ''}</span>
        <span class="sum-k"><b>${dups}</b> doublon${dups > 1 ? 's' : ''}</span>
        ${best && br ? `<span class="sum-best r-${best.rarity}" style="--rc:${br.hex};--ra:${br.accentHex}">meilleure ${starsHtml(best.rarity)} <i class="sum-rl">${br.secret ? 'secrète' : `${br.rank + 1}★`}</i> <b>${esc(best.cardName)}</b></span>` : ''}
        <span class="sum-coll" title="${esc(cc.label)} : cartes uniques dans ta collection">${esc(cc.label)} : <b>${fmtN(cc.have)}</b>/${fmtN(cc.total)}</span>
      </div>
      ${grid ? '<div class="sum-cards"></div>' : ''}
      <div class="sum-actions">
        ${pend ? '<button class="btn-primary retry">Réessayer l’enregistrement</button>' : u && bal > 0 ? `<button class="btn-primary again" data-n="${again}">${again > 1 ? `Encore ×${again}` : 'Encore un'}<small>${bal} en réserve</small></button>` : u ? `<span class="muted next-pack">prochain booster dans ${fmtCountdown((liveRegen(u).nextAt ?? Date.now()) - Date.now())}</span>` : ''}
        <button class="btn-ghost coll">${fresh ? 'Mes nouvelles' : dups === all.length ? 'Contrats' : 'Ma collection'}</button>
        <button class="btn-ghost back">Boutique</button>
      </div>`;
    if (best) paintSummaryBg(best, req);
    syncSummaryInset();
    const retry = summary.querySelector<HTMLButtonElement>('.retry');
    retry?.addEventListener('click', async () => {
      const b = batch;
      if (!b?.pending || retry.disabled) return;
      retry.disabled = true;
      const ok = await busyButton(retry, credit(b, b.pending.pack));
      if (batch !== b || mode !== 'summary') return;
      if (ok) toast('Booster crédité.', 'ok');
      else toast(pendingMsg(b.pending?.err), 'err');
      showSummary();
    });
    if (grid) {
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
      const btn = e.currentTarget as HTMLButtonElement;
      if (btn.disabled) return;
      btn.disabled = true; // double toucher : un seul départ
      shell.requestGyro();
      const n = Number(btn.dataset.n) || 1;
      const p = list.find((b) => b.key === (req.kind === 'bebou' ? 'bebou' : themeById(req.themeId ?? '')?.id)) ?? list.find((b) => b.key === 'bebou') ?? list[0];
      const hi = batch?.hi ?? false;
      const all = batch?.all ?? false; // (audit UX2-02) « Tout révéler » suit, comme « 4★ et + »
      back();
      await new Promise((r) => setTimeout(r, 650));
      if (mode !== 'pick') return;
      try {
        const got = await backend.preparePack(p.req);
        if (mode !== 'pick') return;
        pack = got;
        batch = newBatch(p.req, Math.max(1, n), got, hi, all);
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
    popLayer(closeViewer);
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
      // téléphone (carrousel) : la pochette choisie en tête de rangée, sans animation
      requestAnimationFrame(() => sleeveOf(selected)?.scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'instant' as ScrollBehavior }));
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
