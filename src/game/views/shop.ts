import { collectionSig, liveRegen, type GameBackend, type PackCard, type SealedPack } from '../backend';
import { PACK_CAP, PACK_REGEN_MS, fmtCountdown } from '../../core/packRegen';
import type { Shell } from '../shell';
import { openStyleOf, type OpeningScene } from '../scenes/opening';
import type { ViewerScene } from '../scenes/viewer';
import type { PackRequest } from '../../core/packRoll';
import { BEBOU_PACK, THEMES, bebouOddsLabel, catalogEntry, subthemeById, subthemeViews, themeById, themeOpen, themeTagline, type SubthemeView } from '../../core/sets/themes';
import { cardById } from '../../core/cardData';
import { rarity } from '../../core/rarity';
import { packOdds } from '../../core/dropRates';
import { busyButton, cardTile, errMsg, esc, fmtN, h, popLayer, pushLayer, starsHtml, toast } from '../ui';
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
const QTYS = [1, 5, 10] as const;

/**
 * Boutique + ouverture. La scène 3D (booster au centre) est partagée : choisir un booster le fait tourner sur lui-même,
 * « Ouvrir » tire le pack côté serveur puis l'ouverture se joue dans la même scène, sans chargement.
 */
export interface ShopView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
  /** vrai pendant une ouverture (la navigation est alors bloquée) */
  busy(): boolean;
}

interface Booster {
  key: string;
  req: PackRequest;
  name: string;
  tagline: string;
  desc: string;
  accent: string;
  /** thème sans cartes pour l'instant : visible, pas encore ouvrable */
  soon?: boolean;
}

function boosters(): Booster[] {
  // le bébou pack (pack de base, tous les thèmes) en tête, puis les 4 boosters thématiques
  const list: Booster[] = [
    {
      key: 'bebou',
      req: { kind: 'bebou' },
      name: BEBOU_PACK.label,
      tagline: BEBOU_PACK.tagline,
      desc: 'Toutes les cartes des 4 thèmes. Le seul pack où peut tomber une des 8 cartes secrètes.',
      accent: BEBOU_PACK.style.foil,
    },
  ];
  for (const t of THEMES) {
    // un groupe de sous-thèmes n'en fait qu'une ligne (« Jeux vidéo (177 familles) », « Animaux (6 sous-thèmes) »)
    const views = subthemeViews(t);
    const lbl = (v: SubthemeView) => (v.group ? `${v.label} (${v.subs.length} ${v.subs[0]?.group?.unit ?? 'sous-thèmes'})` : v.label);
    const live = views.filter((v) => v.cards.length).map(lbl);
    const soon = views.filter((v) => !v.cards.length).map(lbl);
    list.push({
      key: t.id,
      req: { kind: 'theme', themeId: t.id },
      name: `${t.label} Pack`,
      tagline: themeTagline(t),
      desc: live.length ? `${live.join(', ')}${soon.length ? ` · bientôt : ${soon.join(', ')}` : ''}` : soon.join(', '),
      accent: t.style.accent,
      soon: !themeOpen(t),
    });
  }
  return list;
}

const keyOf = (p: SealedPack) => (p.packKind === 'bebou' ? 'bebou' : themeById(p.themeId ?? '')?.id ?? THEMES[0].id);

export function createShopView(backend: GameBackend, shell: Shell, opening: OpeningScene, go: (route: string) => void, getViewer: () => Promise<ViewerScene>): ShopView {
  const el = h('section', 'view shop');
  const list = boosters();
  let selected = (() => {
    try {
      return localStorage.getItem('bebou.booster') ?? 'bebou';
    } catch {
      return 'bebou';
    }
  })();
  if (!list.some((b) => b.key === selected)) selected = list[0].key;
  let mode: 'pick' | 'opening' | 'summary' = 'pick';
  let pack: SealedPack | null = null;
  /** nombre de boosters à ouvrir d'affilée (×1, ×5, ×10), mémorisé */
  let qty = (() => {
    try {
      const n = Number(localStorage.getItem('bebou.qty'));
      return (QTYS as readonly number[]).includes(n) ? n : 1;
    } catch {
      return 1;
    }
  })();
  /**
   * Ouverture en série : boosters déjà ouverts (et crédités) + celui en cours. Chaque booster n'est crédité côté
   * serveur qu'une fois montré (pas d'annonce avant que le joueur ait vu sa carte) ; « Tout passer » tire et crédite
   * le reste d'un coup.
   */
  let batch: { req: PackRequest; total: number; done: SealedPack[]; current: SealedPack | null; hi: boolean; skipping: boolean } | null = null;
  let secretExp: { replay?(): void } | null = null;

  el.innerHTML = `
    <div class="shop-side">
      <div class="shop-title"><span class="kicker">BOUTIQUE</span><h2>Choisis ton booster</h2></div>
      <div class="boosters"></div>
      <div class="odds"></div>
    </div>
    <div class="shop-main">
      <div class="sealed-banner" hidden></div>
      <div class="qty" role="radiogroup" aria-label="Nombre de boosters">${QTYS.map((n) => `<button data-n="${n}" role="radio">×${n}</button>`).join('')}</div>
      <button class="open-btn">OUVRIR</button>
      <div class="open-sub"></div>
    </div>
    <div class="hud" hidden>
      <div class="hud-count"></div>
      <!-- bas de l'écran : fiche de la carte, indication, boutons — empilés, ils ne peuvent plus se chevaucher -->
      <div class="hud-bottom">
        <div class="card-info" hidden></div>
        <div class="hud-hint"><span class="ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" pathLength="100"/><circle class="p" cx="18" cy="18" r="15.5" pathLength="100"/></svg></span><span class="txt"></span></div>
        <div class="hud-skip"><button class="skip-hi" title="Les cartes de moins de 4 étoiles défilent toutes seules">⏭ 4★ et +</button><button class="skip-all">Tout passer</button></div>
      </div>
    </div>
    <div class="summary" hidden></div>
    <div class="secret-continue" hidden><button class="btn-primary">Continuer</button></div>
    <div class="viewer-ui shop-viewer" hidden><button class="close" aria-label="Fermer">✕</button><div class="v-info"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
  const boostersEl = el.querySelector<HTMLElement>('.boosters')!;
  const oddsEl = el.querySelector<HTMLElement>('.odds')!;
  const openBtn = el.querySelector<HTMLButtonElement>('.open-btn')!;
  const openSub = el.querySelector<HTMLElement>('.open-sub')!;
  const banner = el.querySelector<HTMLElement>('.sealed-banner')!;
  const hud = el.querySelector<HTMLElement>('.hud')!;
  const hint = el.querySelector<HTMLElement>('.hud-hint')!;
  const hintTxt = hint.querySelector<HTMLElement>('.txt')!;
  const ring = hint.querySelector<SVGCircleElement>('circle.p')!;
  const count = el.querySelector<HTMLElement>('.hud-count')!;
  const info = el.querySelector<HTMLElement>('.card-info')!;
  const summary = el.querySelector<HTMLElement>('.summary')!;
  const secretContinue = el.querySelector<HTMLElement>('.secret-continue')!;
  // gros tirages de tout le groupe (vitrine seulement) ; une carte touchée s'ouvre dans la visionneuse
  const big = createBigPulls(backend, (card) => void viewCard(card));
  el.append(big.el);
  const qtyEl = el.querySelector<HTMLElement>('.qty')!;
  const skipEl = el.querySelector<HTMLElement>('.hud-skip')!;
  const skipHi = skipEl.querySelector<HTMLButtonElement>('.skip-hi')!;
  const skipAll = skipEl.querySelector<HTMLButtonElement>('.skip-all')!;

  // ── quantité (×1 / ×5 / ×10)
  qtyEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-n]');
    if (!b || b.disabled || mode !== 'pick') return;
    qty = Number(b.dataset.n);
    try {
      localStorage.setItem('bebou.qty', String(qty));
    } catch {
      /* ignore */
    }
    haptics.pulse(6);
    syncState();
  });

  // ── choix du booster
  for (const b of list) {
    const btn = h('button', `booster${b.soon ? ' soon' : ''}${b.key === 'bebou' ? ' special' : ''}`, `<span class="dot" style="background:${b.accent}"></span><span class="bn">${esc(b.name)}</span><span class="bt"><span>${b.tagline.split(' · ').map((p) => `<span>${esc(p)}</span>`).join('')}</span></span><span class="bd">${esc(b.desc)}</span>`);
    btn.dataset.key = b.key;
    btn.addEventListener('click', () => select(b.key));
    boostersEl.append(btn);
  }
  const o = packOdds();
  oddsEl.innerHTML = `<div class="odds-t">Dans chaque booster de 5 cartes</div>
    <div>${starsHtml('rare')} garantie</div>
    <div>${starsHtml('epic')} ou mieux · 1 sur ${(1 / o.epic).toFixed(1).replace('.', ',')}</div>
    <div>${starsHtml('legendary')} ou mieux · 1 sur ${Math.round(1 / o.legendary)}</div>
    <div>${starsHtml('mythic')} · 1 sur ${Math.round(1 / o.mythic)}</div>
    <div class="odds-secret" title="Une chance sur le nombre total de cartes du jeu : elle devient plus rare à chaque nouvelle carte ajoutée.">✷ carte secrète · ${bebouOddsLabel()} · Bebou Pack seulement</div>`;

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
    boostersEl.querySelectorAll<HTMLElement>('.booster').forEach((b) => b.classList.toggle('on', b.dataset.key === k));
    // téléphone : le booster choisi revient au centre du carrousel
    if (o.scroll !== false) boostersEl.querySelector<HTMLElement>(`.booster[data-key="${k}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    opening.setBooster(k, true, dir);
    opening.setBoosterSoon(!!list.find((b) => b.key === k)?.soon);
    syncState();
  }

  // téléphone : faire défiler le carrousel au doigt choisit le booster qui s'arrête au centre (comme un vrai carrousel)
  let scrollT = 0;
  const pickCentered = () => {
    if (mode !== 'pick' || boostersEl.scrollWidth <= boostersEl.clientWidth + 4 || backend.state.sealed) return;
    const r = boostersEl.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    let best: HTMLElement | null = null;
    let bd = Infinity;
    for (const b of boostersEl.querySelectorAll<HTMLElement>('.booster')) {
      const br = b.getBoundingClientRect();
      const d = Math.abs(br.left + br.width / 2 - mid);
      if (d < bd) (bd = d), (best = b);
    }
    const k = best?.dataset.key;
    if (k && k !== selected) select(k, { scroll: false });
  };
  boostersEl.addEventListener('scroll', () => {
    clearTimeout(scrollT);
    scrollT = window.setTimeout(pickCentered, 140);
  }, { passive: true });

  /** quantité réellement ouvrable maintenant (la réserve a pu baisser depuis le choix) */
  function effQty(): number {
    const s = backend.state;
    if (s.sealed) return 1;
    const bal = s.user ? liveRegen(s.user).balance : 0;
    return qty > 1 && bal < qty ? ([...QTYS].reverse().find((n) => n <= Math.max(1, bal)) ?? 1) : qty;
  }

  // ── état (solde, booster scellé, connexion)
  function syncState() {
    const s = backend.state;
    const u = s.user;
    if (mode !== 'pick') return;
    const needLogin = s.mode === 'online' && !u;
    const soon = !s.sealed && list.find((b) => b.key === selected)?.soon;
    if (soon) {
      openBtn.textContent = 'BIENTÔT';
      openBtn.disabled = true;
      openSub.textContent = 'Ses cartes arrivent bientôt · en attendant, le Bebou Pack contient tout';
    } else if (needLogin) {
      openBtn.textContent = 'SE CONNECTER';
      openBtn.disabled = false;
      openSub.textContent = 'Connexion avec Discord · accès réservé au groupe';
    } else if (s.sealed) {
      openBtn.textContent = 'OUVRIR';
      openBtn.disabled = false;
      openSub.textContent = '';
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
    // ×5 / ×10 : seulement si la réserve suffit (un booster déjà tiré s'ouvre seul)
    const bal = u ? liveRegen(u).balance : 0;
    qtyEl.hidden = !!soon || needLogin || !!s.sealed;
    for (const b of qtyEl.querySelectorAll<HTMLButtonElement>('button')) {
      const n = Number(b.dataset.n);
      b.disabled = n > 1 && bal < n;
      b.classList.toggle('on', n === effQty());
      b.setAttribute('aria-checked', String(n === effQty()));
    }
    if (s.sealed) {
      const t = themeById(s.sealed.themeId ?? '');
      const name = s.sealed.packKind === 'bebou' ? BEBOU_PACK.label : t ? `${t.label} Pack` : 'booster';
      banner.hidden = false;
      banner.textContent = `Tu as un ${name} déjà tiré, pas encore ouvert : c’est lui qu’on ouvre.`;
      if (keyOf(s.sealed) !== selected) select(keyOf(s.sealed));
    } else banner.hidden = true;
  }
  backend.onChange(syncState);
  // sous chaque booster, un filet discret : la part de ses cartes déjà dans ta collection
  let progSig = '';
  backend.onChange((st) => {
    const sig = collectionSig(st);
    if (sig === progSig) return;
    progSig = sig;
    const mine = new Set(st.collection.map((c) => c.cardId));
    for (const b of list) {
      const btn = boostersEl.querySelector<HTMLElement>(`.booster[data-key="${b.key}"]`);
      const cards = b.key === 'bebou' ? THEMES.flatMap((t) => t.cards) : themeById(b.key)?.cards ?? [];
      if (!btn || !cards.length) continue;
      const have = cards.reduce((a, c) => a + (mine.has(c.id) ? 1 : 0), 0);
      btn.style.setProperty('--pct', `${(have / cards.length) * 100}%`);
      btn.classList.add('has-prog');
      btn.title = `${fmtN(have)} / ${fmtN(cards.length)} cartes déjà dans ta collection`;
    }
  });
  // recharge (1 booster / 5 min) : l'en-tête prévient quand un booster arrive ; compte à rebours quand la réserve est vide
  window.addEventListener('bebou:packs', syncState);
  setInterval(() => {
    const u = backend.state.user;
    if (el.isConnected && u && !backend.state.sealed && liveRegen(u).balance <= 0) syncState();
  }, 1000);

  // glisser le doigt sur le booster en 3D : vers la gauche = booster suivant, vers la droite = précédent
  opening.onBoosterSwipe = (dir) => {
    if (mode !== 'pick' || !el.isConnected || backend.state.sealed) return;
    const i = list.findIndex((b) => b.key === selected);
    const d = (dir > 0 ? -1 : 1) as 1 | -1;
    select(list[(i + d + list.length) % list.length].key, { dir: d });
  };
  // toucher le booster en 3D = « Ouvrir » (si c'est possible à cet instant)
  opening.onBoosterTap = () => {
    if (mode === 'pick' && el.isConnected && !openBtn.disabled) openBtn.click();
  };
  // clavier, au récap : Entrée = « Encore un »
  window.addEventListener('keydown', (e) => {
    if (mode !== 'summary' || viewing || !el.isConnected || e.repeat || e.key !== 'Enter') return;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    summary.querySelector<HTMLButtonElement>('.again')?.click();
  });
  // clavier : ↑ ↓ (ou ← →) pour passer d'un booster à l'autre
  window.addEventListener('keydown', (e) => {
    if (mode !== 'pick' || !el.isConnected || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d || backend.state.sealed) return;
    e.preventDefault();
    const i = list.findIndex((b) => b.key === selected);
    select(list[(i + d + list.length) % list.length].key, { dir: d as 1 | -1 });
  });

  // ── ouverture
  openBtn.addEventListener('click', async () => {
    shell.requestGyro(); // iPhone : en première ligne du clic, avant tout await
    haptics.pulse(10);
    const s = backend.state;
    if (s.mode === 'online' && !s.user) return backend.login();
    if (mode !== 'pick') return;
    openBtn.disabled = true;
    const b = list.find((x) => x.key === selected)!;
    const total = effQty();
    try {
      pack = await busyButton(openBtn, backend.preparePack(b.req));
    } catch (e) {
      toast(errMsg(e), 'err');
      syncState();
      return;
    }
    batch = { req: b.req, total, done: [], current: pack, hi: batch?.hi ?? false, skipping: false };
    start(pack);
  });

  // ── passer : jusqu'aux 4★ et + (bascule, garde son état d'un booster à l'autre de la série) / tout
  function applyAuto() {
    const hi = !!batch?.hi;
    skipHi.classList.toggle('on', hi);
    skipHi.setAttribute('aria-pressed', String(hi));
    // série : à partir du 2e booster l'emballage se brûle tout seul ; « 4★ et + » : dès le premier
    const burn = hi || (!!batch && batch.done.length > 0);
    opening.setAuto({ burn, minRank: hi ? HI_RANK : 0 });
    if (opening.phase === 'sealed') hintTxt.textContent = burn ? 'Ouverture…' : sealedHint;
  }
  skipHi.addEventListener('click', () => {
    if (!batch || mode !== 'opening') return;
    batch.hi = !batch.hi;
    haptics.pulse(8);
    applyAuto();
  });
  skipAll.addEventListener('click', () => void skipEverything());

  /** « Tout passer » : crédite le booster en cours, tire + crédite le reste de la série, puis le récap. */
  async function skipEverything() {
    if (!batch || batch.skipping || mode !== 'opening') return;
    batch.skipping = true;
    skipAll.disabled = skipHi.disabled = true;
    opening.setAuto({ burn: false, minRank: 0 });
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
   * Ordinateur : le booster (et le bouton « Ouvrir ») se centrent dans l'espace à droite du panneau de la boutique ;
   * pendant l'ouverture, au récap et sur téléphone : centre de l'écran.
   */
  const sideEl = el.querySelector<HTMLElement>('.shop-side')!;
  function placeFocus() {
    const desk = window.innerWidth > 860 && mode === 'pick';
    // centre de l'espace libre entre le panneau des boosters (à gauche) et la colonne « Gros tirages » (à droite, ≥ 1180 px)
    let px = 0;
    if (desk) {
      const l = sideEl.getBoundingClientRect().right;
      const bp = big.el.getBoundingClientRect();
      const r = !big.el.hidden && window.innerWidth >= 1180 && bp.width > 0 ? bp.left : window.innerWidth;
      px = Math.round((l + r) / 2 - window.innerWidth / 2);
    }
    opening.setFocusOffset(px);
    el.style.setProperty('--focus-x', `${px}px`);
  }
  window.addEventListener('resize', placeFocus);

  function setMode(m: typeof mode) {
    mode = m;
    el.dataset.mode = m;
    big.setVisible(m === 'pick'); // avant placeFocus : la colonne compte dans le centrage
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
        hint.hidden = i < total - 1 ? false : true;
        hintTxt.textContent = i < total - 1 ? HINT.next : '';
        setCount(`${series}${i + 1} / ${total}`);
        shown = i;
        showInfo(card);
      },
      onNext() {
        // la carte montrée file dans la rangée : son panneau s'efface, la suivante attend face cachée
        info.classList.remove('in');
        hintTxt.textContent = HINT.reveal;
        setCount(`${series}${Math.min(p.cards.length, shown + 2)} / ${p.cards.length}`);
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
        opening.setAuto({ burn: false, minRank: 0 });
        void runSecret();
      },
      onDone() {
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

  /** Récapitulatif : un booster (5 cartes, de la moins rare à la plus rare) ou une série (meilleures d'abord). */
  function showSummary() {
    const packs = batch?.done.length ? batch.done : pack ? [pack] : [];
    const multi = packs.length > 1;
    const all = packs.flatMap((x) => x.cards);
    const p = { cards: all };
    skipEl.hidden = true;
    setMode('summary');
    const u = backend.state.user;
    // même ordre que l'éventail 3D : de la moins rare à la plus rare
    const rank = (c: PackCard) => rarity(c.rarity).rank;
    const sorted = p.cards.map((c, i) => ({ c, i })).sort((a, b) => (multi ? rank(b.c) - rank(a.c) : rank(a.c) - rank(b.c)) || a.i - b.i).map((x) => x.c);
    const fresh = p.cards.filter((c) => c.isNew).length;
    const hiN = p.cards.filter((c) => rarity(c.rarity).rank >= HI_RANK).length;
    summary.classList.toggle('multi', multi);
    const again = u ? Math.min(liveRegen(u).balance, packs.length) : 0;
    summary.innerHTML = `<div class="sum-title">${multi ? `${packs.length} boosters · ${p.cards.length} cartes${hiN ? ` · <b>${hiN} carte${hiN > 1 ? 's' : ''} 4★ et +</b>` : ''}<br>` : ''}Ton tirage${fresh ? ` · <b>${fresh === p.cards.length ? 'que des nouvelles\u00a0!' : `${fresh} nouvelle${fresh > 1 ? 's' : ''}`}</b>` : ' · que des doublons, <a class="p-link to-ct" href="#/contrats">direction les contrats</a>'}</div><div class="sum-cards"></div>
      <div class="sum-actions">
        ${u && liveRegen(u).balance > 0 ? `<button class="btn-primary again" data-n="${again}">${again > 1 ? `Encore ×${again}` : 'Encore un'} (${liveRegen(u).balance})</button>` : u ? `<span class="muted next-pack">prochain booster dans ${fmtCountdown((liveRegen(u).nextAt ?? Date.now()) - Date.now())}</span>` : ''}
        <button class="btn-ghost coll">Ma collection</button>
        <button class="btn-ghost back">Boutique</button>
      </div>`;
    const cards = summary.querySelector<HTMLElement>('.sum-cards')!;
    for (const [k, c] of sorted.entries()) {
      const tile = cardTile(c.cardId, c.rarity, { mini: true, label: c.isNew ? 'NOUVELLE' : undefined });
      tile.style.setProperty('--i', String(k)); // arrivée en cascade
      tile.addEventListener('click', () => void viewCard(c));
      cards.append(tile);
    }
    summary.querySelector('.again')?.addEventListener('click', (e) => {
      const n = Number((e.currentTarget as HTMLElement).dataset.n) || 1;
      if (n !== qty) qty = n; // même quantité que la série qui vient de finir (ou ce que la réserve permet)
      back();
      setTimeout(() => openBtn.click(), 650);
    });
    // « Ma collection » : directement les nouvelles cartes de ce tirage (filtre « Nouvelles »)
    summary.querySelector('.coll')!.addEventListener('click', () => (back(), go(fresh ? 'collection/nouvelles' : 'collection')));
    summary.querySelector('.back')!.addEventListener('click', back);
  }

  // ── carte en grand (éventail final ou miniature du récap) dans la visionneuse 3D
  const viewerUi = el.querySelector<HTMLElement>('.shop-viewer')!;
  let viewing = false;
  async function viewCard(card: PackCard) {
    shell.requestGyro();
    if (!viewing) pushLayer(closeViewer); // « retour » du téléphone = fermer la carte, pas quitter la boutique
    viewing = true;
    const rr = rarity(card.rarity);
    const e = catalogEntry(card.cardId);
    const st = e ? subthemeById(e.subthemeId) : null;
    const vi = viewerUi.querySelector<HTMLElement>('.v-info')!;
    vi.className = `v-info r-${card.rarity}`;
    vi.style.setProperty('--ra', rr.accentHex);
    vi.innerHTML = `${card.isNew ? '<div class="ci-new">NOUVELLE</div>' : ''}<div class="ci-name">${esc(card.cardName)}</div><div class="ci-meta">${starsHtml(card.rarity)} <span class="ci-r" style="color:${rr.accentHex}">${rr.label}</span></div><div class="ci-sub">${st && e && !rr.secret ? `${esc(st.label)} ${String(e.num).padStart(3, '0')}/${st.cards.length} · ` : ''}n°${fmtN(card.mintNumber)}\u00a0imprimé</div>`;
    viewerUi.hidden = false;
    summary.hidden = true;
    big.setVisible(false);
    const viewer = await getViewer();
    if (!viewing) return;
    shell.show('viewer');
    void viewer.show(card.cardId, card.rarity);
  }
  function closeViewer() {
    if (!viewing) return;
    popLayer();
    viewing = false;
    viewerUi.hidden = true;
    summary.hidden = mode !== 'summary';
    big.setVisible(mode === 'pick');
    shell.show('opening');
  }
  viewerUi.querySelector('.close')!.addEventListener('click', closeViewer);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closeViewer());

  function back() {
    closeViewer();
    pack = null;
    batch = null;
    opening.setAuto({ burn: false, minRank: 0 });
    opening.reset();
    setMode('pick');
    syncState();
  }

  setMode('pick');
  return {
    el,
    enter() {
      // la pastille de couleur de chaque booster devient une miniature du vrai booster (une fois)
      for (const btn of boostersEl.querySelectorAll<HTMLElement>('.booster')) {
        const dot = btn.querySelector<HTMLElement>('.dot');
        const src = dot && opening.packThumb(btn.dataset.key!);
        if (!dot || !src) continue;
        const img = h('img', 'bthumb');
        img.src = src;
        img.alt = '';
        img.style.setProperty('--acc', dot.style.background);
        dot.replaceWith(img);
      }
      shell.setDimmed(false);
      shell.show('opening');
      requestAnimationFrame(placeFocus); // le panneau est en place (mise en page faite)
      select(selected);
      boostersEl.querySelectorAll<HTMLElement>('.booster').forEach((b) => b.classList.toggle('on', b.dataset.key === selected));
      syncState();
    },
    leave() {
      if (mode === 'summary') back();
    },
    busy: () => mode === 'opening',
  };
}
