import { collectionSig, liveRegen, type GameBackend, type PackCard, type SealedPack } from '../backend';
import { playAmbience, playMusicPreview, prefetchAmbience, prefetchMusicPreview, stopAmbience, stopMusicPreview } from '../musicPreview';
import { isEclipsePack } from '../eclipse';
import { ECLIPSE } from '../../core/motion';
import { fmtCountdown } from '../../core/packRegen';
import type { Shell } from '../shell';
import { openStyleOf, setOpeningChoice, type OpeningScene } from '../scenes/opening';
import type { WheelItem3D } from '../scenes/packWheel3d';
import type { ViewerScene } from '../scenes/viewer';
import type { PackRequest } from '../../core/packRoll';
import { BEBOU_PACK, THEMES, catalogEntry, numberingSize, subthemeById, themeById } from '../../core/sets/themes';
import { cardById } from '../../core/cardData';
import { POKEMON_151, pokemonCardId } from '../../core/sets/pokemon151';
import { POKEMON_MYTHIC_TYPE } from '../../core/sets/pokemonTypes';
import { siteUrl } from '../../core/siteRoot';
import { gbcTransition, type GbcTransition } from '../scenes/gbcTransition';
import { markWildSeen } from '../wildEncounter';
import { markDuelSeen } from '../duelEncounter';
import type { WildExperiment } from '../../experiments/041-pokemon-wild/index';
import { rarity } from '../../core/rarity';
import { busyButton, cardTile, errMsg, esc, fmtN, h, popLayer, pushLayer, starsHtml, toast, imageReportButton } from '../ui';
import { createPackSheet, shopPacks, type SheetPack } from './packSheet';
import { EVENT_KEY, contentLabel, contentSig, eventCards, fmtLeft, liveEvent, type PackEvent } from '../../core/events';
import '../evenements.css';
import { preloadArt } from '../preload';
import { isTouch } from '../../core/renderer';
import { haptics } from '../../core/haptics';
import { createBigPulls } from './bigPulls';
import { duelMonster } from '../scenes/duelMonsters';
import { abortMythic, mythicFamily, playMythicPrelude, prepareMythic } from '../mythic';
import { clearGod, playGodIntro } from '../godPack';

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
/** musique de la rencontre sauvage (fournie par Tom) : boucle de 31,35 s à partir de 20 s, après une première écoute depuis le début */
const WILD_MUSIC = siteUrl('audio/pokemon-wild-battle.mp3');
const WILD_LOOP = { loopStart: 20, loopEnd: 51.3475 };
/** carte dont la révélation est la rencontre sauvage (Pokémon 6★) */
const isWild = (c: PackCard) => c.rarity === 'mythic' && c.cardId.startsWith('pkm-');
/** « 62,4 % » (chiffres à la française) */
const fmtPct = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
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
  /** boosters suivants de la série, déjà scellés côté serveur (preparePacks) : cartes connues, préparées à l'avance */
  queue: SealedPack[];
}

const keyOfBase = (p: SealedPack) => (p.packKind === 'bebou' ? 'bebou' : themeById(p.themeId ?? '')?.id ?? 'gaming');

/** (11/11) le booster du moment dans la fiche (même tirage que les autres, pool de l'événement) */
function eventPack(e: PackEvent): SheetPack {
  return {
    key: EVENT_KEY,
    req: { kind: 'theme', event: { id: e.id, subthemes: e.subthemes, cards: e.cards } },
    name: e.name,
    tagline: 'BOOSTER DU MOMENT',
    desc: e.blurb ?? contentLabel(e),
    accent: e.accent,
    cards: eventCards(e),
    event: { endAt: e.endAt, label: contentLabel(e) },
  };
}
const EV_SEEN = 'bebou.evenement-vu';

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
  /**
   * (11/11) BOOSTER DU MOMENT : la fiche connaît les 5 boosters + celui de l'événement en cours (EN TÊTE). Il n'entre
   * ni dans la roue (téléphone) ni dans la colonne (ordinateur) : il a son bandeau en haut de la boutique, avec le
   * compte à rebours ; le toucher le montre au centre (sachet à la couleur de l'événement) et ouvre sa fiche.
   */
  const sheetList: SheetPack[] = [...list];
  const packOf = (k: string) => sheetList.find((x) => x.key === k);
  let ev: PackEvent | null = null;
  // (booster du moment tiré puis événement fini : on le range avec le Bebou Pack, le serveur le rend tel quel)
  const keyOf = (p: SealedPack) => (p.eventId ? (packOf(EVENT_KEY) ? EVENT_KEY : 'bebou') : keyOfBase(p));
  let mode: 'pick' | 'opening' | 'summary' = 'pick';
  let pack: SealedPack | null = null;
  /**
   * Ouverture en série : boosters déjà ouverts (et crédités) + celui en cours. Chaque booster n'est crédité côté
   * serveur qu'une fois montré (pas d'annonce avant que le joueur ait vu sa carte) ; « Tout passer » tire et crédite
   * le reste d'un coup.
   */
  let batch: Batch | null = null;
  let secretExp: { replay?(): void } | null = null;
  /** cinématique d'invocation (6★ Yu-Gi-Oh) préparée pour ce booster : carte concernée + scène montée */
  let duel: { cardId: string; exp: { replay?(): void } | null } | null = null;
  const newBatch = (req: PackRequest, total: number, current: SealedPack, hi: boolean, all: boolean): Batch => ({ req, total, done: [], current, hi, all, skipping: false, revealing: null, pending: null, queue: [] });
  /**
   * Départ d'une série (retours de Tom, 4 nov. : « plusieurs boosters d'un coup = temps d'attente ») : TOUS les
   * boosters scellés en un seul appel ; le suivant est préparé (cartes construites) pendant qu'on regarde le courant.
   */
  async function beginSeries(req: PackRequest, n: number, hi: boolean, all: boolean): Promise<SealedPack> {
    const sealed = n > 1 ? await backend.preparePacks(req, n) : [await backend.preparePack(req)];
    // (retours 06/11) ×5 / ×10 = UN booster de 25 / 50 cartes : les cartes de tous les boosters sont réparties de la
    // moins rare à la plus rare (la meilleure du lot à la toute fin) ; mêmes cartes, mêmes probabilités
    const packs = sealed.length > 1 ? spreadSeries(sealed) : sealed;
    const got = packs[0];
    pack = got;
    batch = newBatch(req, packs.length, got, hi, all);
    batch.queue = packs.slice(1);
    if (packs.length < n) toast(`Réserve : ${packs.length} booster${packs.length > 1 ? 's' : ''} sur ${n} ouverts.`, 'info');
    return got;
  }

  /**
   * Gros booster (×5 / ×10) : les N boosters scellés, leurs cartes mises en commun et triées (moins rare → plus rare,
   * la secrète en dernier), puis redistribuées en N morceaux montrés à la suite comme un seul booster. Chaque morceau
   * garde l'id d'un vrai booster (crédit côté serveur) : les boosters sont pris du moins bon au meilleur, pour que le
   * meilleur — celui qui annonce un gros tirage dans le fil — soit crédité en dernier, une fois sa carte montrée.
   */
  function spreadSeries(list: SealedPack[]): SealedPack[] {
    const R: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
    const best = (p: SealedPack) => Math.max(...p.cards.map((c) => R[c.rarity] ?? 0));
    const real = list.map((p, i) => ({ p, i })).sort((a, b) => best(a.p) - best(b.p) || a.i - b.i).map((x) => x.p);
    const cards = list.flatMap((p) => p.cards).map((c, i) => ({ c, i })).sort((a, b) => (R[a.c.rarity] ?? 0) - (R[b.c.rarity] ?? 0) || a.i - b.i).map((x) => x.c);
    let at = 0;
    return real.map((p) => {
      const chunk = cards.slice(at, (at += p.cards.length));
      return { ...p, cards: chunk };
    });
  }

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
      <div class="tap-hint" hidden aria-hidden="true"><i class="th-dot"></i><span class="th-t"></span></div>
      <div class="tap-ghost" hidden aria-hidden="true"><i></i></div>
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
        <div class="hud-skip"><button class="skip-hi" title="Direct à la première 4★ ou mieux — s'il n'y en a pas, tout le booster s'ouvre d'un coup">⏭ Direct 4★</button><button class="skip-reveal" title="Les cartes se retournent toutes seules (une 6★ garde son plein écran)">Tout révéler</button><button class="skip-all" title="Aller directement au récap (tout est crédité)">Tout passer</button></div>
      </div>
      <div class="mythic-veil" hidden><div class="mv-kicker">✺ MYTHIQUE ✺</div><div class="mv-stars">★★★★★★</div><div class="mv-name"></div><div class="mv-hint"></div></div>
    </div>
    <div class="sum-bg" hidden><div class="sum-rays"></div><div class="sum-parts"></div></div>
    <div class="fan-badges" hidden></div>
    <div class="summary" hidden></div>
    <div class="secret-continue" hidden><button class="btn-primary">Continuer</button></div>
    <div class="secret-continue wild-continue" hidden><button class="btn-primary">Continuer</button></div>
    <div class="viewer-ui shop-viewer" hidden><button class="close" aria-label="Fermer">✕</button><div class="v-info"></div><div class="v-actions"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
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
  const secretContinue = el.querySelector<HTMLElement>('.secret-continue:not(.wild-continue)')!;
  const wildContinue = el.querySelector<HTMLElement>('.wild-continue')!;
  // gros tirages de tout le groupe, en haut de l'accueil ; une carte touchée s'ouvre dans la visionneuse
  const big = createBigPulls(backend, (card) => void viewCard(card));
  el.querySelector('.shop-right')!.append(big.el);
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
  const tapHint = el.querySelector<HTMLElement>('.tap-hint')!;
  const tapGhost = el.querySelector<HTMLElement>('.tap-ghost')!;
  /** (11/11) bandeau du booster du moment (evenements.css) : rien du tout quand aucun événement n'est en cours */
  const band = h('button', 'ev-band', `<i class="ev-dot" aria-hidden="true"></i><span class="ev-txt"><span class="ev-k">Booster du moment</span><b class="ev-n"></b></span><span class="ev-left"><small>encore</small><b data-ev-left="0"></b></span>`);
  band.type = 'button';
  band.hidden = true;
  el.querySelector('.shop-left')!.prepend(band);
  let wantEventSheet = false;

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
    const b = packOf(selected);
    const bal = u ? liveRegen(u).balance : 0;
    cta.querySelector('.hc-t')!.textContent = b?.soon ? `Voir le ${b.name}` : bal > 0 ? `Ouvrir le ${b?.name ?? 'booster'}` : `Voir le ${b?.name ?? 'booster'}`;
    // premier booster jamais ouvert : la 2e ligne du bouton le dit (une phrase de plus ne tient pas sous le booster en 360×740)
    const first = !!u && u.totalPacksOpened === 0 && bal > 0 && !b?.soon;
    cta.querySelector('.hc-s')!.textContent = b?.soon ? 'bientôt' : first ? `ton premier booster t’attend · ${bal} en réserve` : bal > 0 ? `${bal} en réserve` : 'réserve vide · en recharge';
    cta.querySelector<HTMLElement>('.hc-tip')!.hidden = true;
    syncHint();
  }

  /**
   * TÉLÉPHONE (retours de Tom, 4 nov.) : plus de bouton « Ouvrir » sous le booster. Comme sur ordinateur (le booster se
   * soulève au survol), on montre qu'il se touche : une ligne discrète sous le booster, et toutes les ~5 s, tant que
   * personne ne touche l'écran, le booster se soulève un instant avec une onde de toucher en son centre. La fiche
   * (contenu, ×5 / ×10) s'ouvre en touchant une pochette de la roue.
   */
  let lastTouch = 0;
  window.addEventListener('pointerdown', () => (lastTouch = performance.now()), { passive: true, capture: true });
  const hintOn = () => {
    const s = backend.state;
    return WHEEL.matches && mode === 'pick' && el.isConnected && !viewing && !sheet.isOpen() && !s.sealed && !(s.mode === 'online' && !s.user);
  };
  function syncHint() {
    const on = hintOn();
    tapHint.hidden = !on;
    if (!on) return void (tapGhost.hidden = true);
    const s = backend.state;
    const b = packOf(selected);
    const bal = s.user ? liveRegen(s.user).balance : 0;
    tapHint.classList.toggle('idle', !!b?.soon || bal <= 0);
    tapHint.querySelector('.th-t')!.textContent = b?.soon ? 'bientôt disponible' : bal > 0 ? 'touche le booster pour l’ouvrir' : 'réserve vide · en recharge';
    placeHint();
  }
  function placeHint() {
    if (tapHint.hidden) return;
    const r = opening.boosterRect();
    if (!r || r.w < 20) return;
    const cx = r.x + r.w / 2;
    tapHint.style.transform = `translate3d(${cx.toFixed(0)}px, ${(r.y + r.h + 10).toFixed(0)}px, 0) translateX(-50%)`;
    tapGhost.style.transform = `translate3d(${cx.toFixed(0)}px, ${(r.y + r.h * 0.5).toFixed(0)}px, 0)`;
  }
  window.addEventListener('resize', () => requestAnimationFrame(placeHint));
  setInterval(() => {
    if (!hintOn() || document.hidden || tapHint.classList.contains('idle')) return;
    placeHint();
    if (performance.now() - lastTouch < 6000 || REDUCED.matches) return;
    // l'onde de toucher + le booster qui se soulève (le même geste que le survol sur ordinateur)
    tapGhost.hidden = false;
    tapGhost.classList.remove('go');
    void tapGhost.offsetWidth;
    tapGhost.classList.add('go');
    opening.hintPulse();
  }, 5200);
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
  const sheet = createPackSheet(backend, shell, sheetList, {
    thumb: (k, size) => thumbs.get(k) ?? opening.packThumb(k, size),
    onSelect: (k) => select(k, { scroll: true }),
    viewCard: (c) => void viewCard(c),
    async onOpen(p, total) {
      if (mode !== 'pick') return;
      const got = await beginSeries(p.req, total, batch?.hi ?? false, false);
      sheet.close();
      start(got);
    },
  });
  el.append(sheet.el);
  /**
   * (07/11, retours de Tom) ORDINATEUR : plus de liste des boosters à droite — la fiche du booster choisi y est posée en
   * permanence, en panneau fluide (packSheet.ts dock/show) ; elle se déforme et se reforme quand la roue change de
   * booster. Seulement sur la vitrine (pas pendant une ouverture, ni une carte en grand).
   */
  const DOCK = matchMedia('(min-width: 861px)');
  function syncDock() {
    const on = DOCK.matches && mode === 'pick' && el.isConnected && !viewing;
    el.classList.toggle('dock', DOCK.matches);
    sheet.show(selected);
    sheet.dock(on);
  }
  DOCK.addEventListener('change', () => syncDock());
  // crochet de test (Playwright, dev seulement) : ouvre directement un booster de la liste (`__shop.open('pop')`)
  if (import.meta.env.DEV)
    (window as unknown as { __shop: unknown }).__shop = {
      async open(key: string) {
        const p = packOf(key);
        if (!p || mode !== 'pick') return false;
        const got = await backend.preparePack(p.req);
        pack = got;
        batch = newBatch(p.req, 1, got, false, false);
        start(got);
        return true;
      },
    };

  // ── les 5 pochettes
  /**
   * TÉLÉPHONE : une ROUE 3D (retours de Tom, 4 nov. : « une scrollwheel digne des meilleurs awwwards »). Seulement les
   * visuels des boosters, posés sur un cylindre ; la pochette choisie est celle du MILIEU. Plus de défilement natif :
   * une petite physique maison, la même sur tous les téléphones —
   * - au doigt, la roue suit 1:1 avec des CRANS sentis sous le doigt (elle colle un peu à chaque pochette puis saute) ;
   * - lâchée, elle file avec l'élan du geste (projection de la vitesse), ralentit et tombe dans un cran avec un léger
   *   rebond (ressort amorti, sans à-coup : il repart exactement à la vitesse du doigt) ;
   * - attrapée pendant qu'elle tourne, elle s'arrête net ; un toucher sur le côté l'amène au milieu, un toucher au
   *   milieu ouvre la fiche ;
   * - à chaque cran : clic (vibration + tic dont la hauteur suit la vitesse), la pochette du milieu s'allume, un reflet
   *   balaie les pochettes qui tournent, la roue s'écarte un peu quand elle va vite, un cadran gradué défile dessous.
   * Sans fin : 5 pochettes, chacune placée à sa distance « modulo 5 » du milieu (aucune copie).
   * Sur ordinateur, rien ne change (liste verticale).
   */
  const WHEEL = matchMedia('(max-width: 860px)');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  for (const b of list) {
    const btn = h('button', `sleeve${b.soon ? ' soon' : ''}${b.key === 'bebou' ? ' special' : ''}`, `
      <span class="sl-art" style="--acc:${b.accent}"><span class="sl-ph"></span>${b.soon ? '<span class="sl-seal">BIENTÔT</span>' : ''}<i class="sl-shade"></i><i class="sl-shine"></i></span>
      <span class="sl-name">${esc(b.name)}</span>
      <span class="sl-desc">${esc(b.desc)}</span>
      <span class="sl-prog"><i></i></span>`);
    btn.dataset.key = b.key;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-label', b.name);
    btn.addEventListener('click', (e) => {
      // roue : les touchers sont lus par la roue elle-même (wheelUp) ; ici, le clavier (Entrée, Espace) et l'ordinateur
      if (WHEEL.matches && e.detail !== 0) return;
      haptics.pulse(6);
      sheet.open(b.key);
    });
    rowEl.append(btn);
  }
  const sleeves = [...rowEl.querySelectorAll<HTMLElement>('.sleeve')];
  const sleeveOf = (k: string) => sleeves.find((b) => b.dataset.key === k) ?? null;
  // cadran gradué sous la roue (téléphone)
  const dial = h('div', 'wheel-dial', '<i></i>');
  dial.setAttribute('aria-hidden', 'true');
  rowEl.append(dial);
  const dialStrip = dial.firstElementChild as HTMLElement;
  function paintSleeves() {
    for (const b of list) {
      const src = opening.packThumb(b.key, 360);
      if (!src) continue;
      thumbs.set(b.key, src);
      const btn = sleeveOf(b.key);
      const art = btn?.querySelector<HTMLElement>('.sl-art');
      if (!art || art.querySelector('img')) continue;
      const img = h('img');
      img.src = src;
      img.alt = '';
      img.decoding = 'async';
      art.querySelector('.sl-ph')?.replaceWith(img);
      // ombre et reflet de la roue découpés à la silhouette du booster (bords dentelés compris)
      art.style.setProperty('--src', `url("${src}")`);
    }
  }

  // vignettes encodées en tâche de fond (WebP asynchrone, PERF2-18) : posées dès qu'elles sont prêtes
  opening.onThumb = () => paintSleeves();

  function select(k: string, o: { dir?: 1 | -1; scroll?: boolean } = {}) {
    if (mode !== 'pick') return;
    if (k === EVENT_KEY) return selectEvent();
    // sens de rotation du booster : vers la droite si on avance dans la liste, vers la gauche si on recule
    const from = list.findIndex((b) => b.key === selected);
    const to = list.findIndex((b) => b.key === k);
    const dir = o.dir ?? (to >= from ? 1 : -1);
    selected = k;
    band.classList.remove('on');
    if (DOCK.matches) sheet.show(k);
    try {
      localStorage.setItem('bebou.booster', k);
    } catch {
      /* ignore */
    }
    for (const b of sleeves) {
      b.classList.toggle('on', b.dataset.key === k);
      b.setAttribute('aria-selected', String(b.dataset.key === k));
    }
    // téléphone : la roue tourne jusqu'à la pochette choisie (par le chemin le plus court)
    if (o.scroll !== false && WHEEL.matches) spinToIndex(to);
    // (audit UX2-09) booster déjà tiré d'un autre type : la scène 3D le garde (plus d'aller-retour du booster derrière la fiche)
    const sp = backend.state.sealed;
    if (sp && keyOf(sp) !== k) {
      sheet.sync();
      syncCta();
      return;
    }
    // ordinateur (07/11) : la roue verticale tourne jusqu'à la pochette ; le grand booster change quand elle y arrive
    // (onReelCommit → select sans défilement) — sinon il pivote sur lui-même comme avant
    if (o.scroll !== false && opening.reelTo(k)) {
      syncState();
      return;
    }
    opening.setBooster(k, !opening.reelActive(), dir);
    opening.setBoosterSoon(!!list.find((b) => b.key === k)?.soon);
    syncState();
  }

  /** (11/11) le booster du moment au centre (pas de cran dans la roue : aucune pochette n'est « choisie ») */
  function selectEvent() {
    if (!ev || mode !== 'pick') return;
    const from = selected;
    selected = EVENT_KEY;
    if (DOCK.matches) sheet.show(EVENT_KEY);
    for (const b of sleeves) {
      b.classList.remove('on');
      b.setAttribute('aria-selected', 'false');
    }
    band.classList.add('on');
    const sp = backend.state.sealed;
    if (sp && keyOf(sp) !== EVENT_KEY) {
      sheet.sync();
      syncCta();
      return;
    }
    if (from !== EVENT_KEY) opening.setBooster(EVENT_KEY, true, -1);
    opening.setBoosterSoon(false);
    syncState();
  }

  // ── la roue (téléphone)
  const N = list.length;
  const TAU = Math.PI * 2;
  /** distance signée la plus courte d'une pochette au milieu, dans [-N/2, N/2] */
  const near = (d: number) => d - N * Math.round(d / N);
  const mod = (x: number) => ((x % N) + N) % N;
  const indexOfKey = (k: string) => Math.max(0, list.findIndex((b) => b.key === k));
  /** position continue de la roue, en pochettes (entier = une pochette pile au milieu) ; vitesse en pochettes/s */
  let pos = indexOfKey(selected);
  let vel = 0;
  /** cible du ressort (null : roue au repos ou tenue au doigt) et pulsation du ressort (rad/s) */
  let target: number | null = null;
  let omega = 11;
  const ZETA = () => (REDUCED.matches ? 1 : 0.74);
  /** géométrie : largeur d'une pochette, écart entre deux pochettes au repos (= px de doigt par cran), rayon du cylindre */
  const STEP = (34 * Math.PI) / 180;
  const geo = { w: 0, h: 0, st: 0, gap: 0, R: 0, W: 0, left: 0, top: 0, zMul: 1 };
  /**
   * Boosters en 3D (scène de l'ouverture, packWheel3d.ts) : la roue HTML devient invisible (zone de toucher) et prend la
   * perspective de la caméra ; les profondeurs sont multipliées par P / 860 pour garder exactement le même relief
   * qu'avec la perspective de 860 px d'origine.
   */
  let view3d: { P: number; ox: number; oy: number } | null = null;
  let wheelOn = false;
  let raf = 0;
  let lastT = 0;
  let detent = Math.round(pos);
  let lastClick = 0;
  let committed: number | null = null;
  /** fiche à ouvrir quand la pochette touchée sur le côté sera arrivée au milieu */
  let sheetOnSettle: string | null = null;

  function measure() {
    const w = sleeves[0]?.offsetWidth ?? 0;
    geo.w = w;
    geo.gap = w * 1.13;
    geo.R = geo.gap / Math.sin(STEP);
    geo.W = rowEl.clientWidth;
    geo.h = sleeves[0]?.offsetHeight ?? 0;
    geo.st = sleeves[0]?.offsetTop ?? 0;
    const rr = rowEl.getBoundingClientRect();
    geo.left = rr.left;
    geo.top = rr.top;
    view3d = opening.wheelView();
    rowEl.classList.toggle('gl', !!view3d);
    if (view3d) {
      geo.zMul = view3d.P / 860;
      rowEl.style.perspective = `${view3d.P.toFixed(1)}px`;
      rowEl.style.perspectiveOrigin = `${(view3d.ox - rr.left).toFixed(1)}px ${(view3d.oy - rr.top).toFixed(1)}px`;
    } else {
      geo.zMul = 1;
      rowEl.style.perspective = rowEl.style.perspectiveOrigin = '';
    }
    // cadran : un grand trait par cran, trois petits entre deux, le milieu sur un grand trait
    if (geo.gap > 0) {
      const M = Math.ceil(geo.W / 2 / geo.gap) + 2;
      dial.style.setProperty('--px', `${geo.gap}px`);
      dialStrip.style.left = `${geo.W / 2 - M * geo.gap}px`;
      dialStrip.style.width = `${(2 * M + 1) * geo.gap}px`;
    }
  }

  /** pose les pochettes sur le cylindre pour la position `pos` (une seule écriture de style par pochette et par image) */
  function paint() {
    if (!wheelOn || geo.w < 10) return;
    const sp = Math.min(Math.abs(vel), 30);
    // vite : la roue s'écarte un peu et les pochettes s'inclinent dans le sens du mouvement
    const spread = REDUCED.matches ? 1 : 1 + Math.min(0.16, sp * 0.011);
    const lean = REDUCED.matches ? 0 : Math.max(-7, Math.min(7, -vel * 0.45));
    const items: WheelItem3D[] | null = view3d ? [] : null;
    for (let i = 0; i < N; i++) {
      const b = sleeves[i];
      const d = near(i - pos);
      const a = Math.abs(d);
      const th = Math.max(-1.5, Math.min(1.5, d * STEP * spread));
      const x = Math.sin(th) * geo.R;
      const z = (Math.cos(th) - 1) * geo.R * geo.zMul;
      const lift = -9 * Math.max(0, 1 - a) ** 2; // la pochette du milieu se soulève
      const rz = lean * Math.max(0, 1 - a * 0.5);
      const op = a <= 1.55 ? 1 : Math.max(0, 1 - (a - 1.55) / 0.75);
      b.style.transform = `translate3d(${x.toFixed(2)}px,${lift.toFixed(2)}px,${z.toFixed(2)}px) rotateY(${((th * 180) / Math.PI).toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
      b.style.opacity = op === 1 ? '1' : op.toFixed(3);
      // même pose pour le booster 3D (repère : point de fuite de la caméra, px CSS)
      if (items && view3d)
        items.push({
          key: list[i].key,
          x: geo.left + geo.W / 2 + x - view3d.ox,
          y: geo.top + geo.st + geo.h / 2 + lift - view3d.oy,
          z,
          rotY: th,
          rotZ: (rz * Math.PI) / 180,
          size: geo.w,
          dim: 1 - op * (1 - Math.min(0.5, a * 0.3)),
          glow: Math.max(0, 1 - a * 1.6),
          accent: list[i].accent,
        });
      b.style.zIndex = String(20 - Math.round(a * 4));
      b.style.setProperty('--shade', Math.min(0.78, a * 0.42).toFixed(3));
      // le reflet glisse sur la pochette à mesure qu'elle tourne (de droite à gauche quand elle passe au milieu)
      b.style.setProperty('--shine', `${(-d * 135).toFixed(1)}%`);
      // (seulement pendant que la pochette tourne : à l'arrêt, au milieu, pas de bande figée)
      b.style.setProperty('--shine-a', (Math.min(1, a * 3.2 + sp * 0.08) * Math.max(0, 1 - a * 1.05)).toFixed(3));
    }
    if (items) opening.setWheel(items);
    // cadran : défile avec la roue (motif périodique : un décalage modulo un cran suffit)
    const frac = pos - Math.floor(pos);
    dialStrip.style.transform = `translate3d(${(-frac * geo.gap).toFixed(2)}px,0,0)`;
    // crans : clic + pochette du milieu
    const r = Math.round(pos);
    if (r !== detent) {
      const moved = r - detent;
      detent = r;
      markMid();
      const now = performance.now();
      if (Math.abs(moved) <= 2 && now - lastClick > 38 && mode === 'pick' && el.isConnected) {
        lastClick = now;
        haptics.pulse(sp > 12 ? 3 : 5);
        try {
          shell.sfx.tick(1.45 + Math.min(sp, 24) * 0.03, 0.022 + Math.min(sp, 24) * 0.0008);
        } catch {
          /* son pas encore prêt */
        }
      }
    }
  }
  function markMid() {
    const m = mod(Math.round(pos));
    sleeves.forEach((b, i) => b.classList.toggle('mid', i === m));
    rowEl.style.setProperty('--wacc', list[m]?.accent ?? 'var(--rose)');
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.1, Math.max(0.001, (now - lastT) / 1000));
    lastT = now;
    if (!drag && target !== null) {
      // ressort amorti, intégré par petits pas (stable même à 30 images/s)
      const k = omega * omega;
      const c = 2 * ZETA() * omega;
      let n = Math.ceil(dt / (1 / 240));
      const hh = dt / n;
      while (n--) {
        const acc = -k * (pos - target) - c * vel;
        vel += acc * hh;
        pos += vel * hh;
      }
      // presque arrivée : le booster 3D change déjà (la roue finit sa course pendant ce temps)
      if (committed !== target && Math.abs(pos - target) < 0.14 && Math.abs(vel) < 4) commit(target);
      // arrivée : la fiche demandée par un toucher sur le côté s'ouvre dès que la pochette est presque au milieu
      if (sheetOnSettle && Math.abs(pos - target) < 0.08 && Math.abs(vel) < 1.5) {
        const k = sheetOnSettle;
        sheetOnSettle = null;
        if (list[mod(Math.round(target))]?.key === k && mode === 'pick' && !sheet.isOpen()) sheet.open(k);
      }
      if (Math.abs(pos - target) < 0.0015 && Math.abs(vel) < 0.02) {
        pos = mod(target);
        detent = Math.round(pos);
        vel = 0;
        target = null;
        commit(pos);
      }
    }
    paint();
    if (drag || target !== null) raf = requestAnimationFrame(frame);
  }
  const run = () => {
    if (raf || !wheelOn) return;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  };
  /** lance le ressort vers le cran `t` (entier), à partir de la vitesse actuelle */
  function springTo(t: number, w?: number) {
    target = t;
    committed = null;
    const D = t - pos;
    // pulsation choisie pour que le ressort reparte SANS à-coup à la vitesse du doigt (accélération initiale ~nulle),
    // bornée : une longue course glisse doucement, un petit cran claque vite
    omega = w ?? (Math.abs(D) > 0.02 && vel * D > 0 ? Math.max(6.5, Math.min(15, (2 * ZETA() * vel) / D)) : 12);
    run();
  }
  function spinToIndex(i: number) {
    if (!wheelOn || i < 0) return;
    const base = target ?? pos;
    springTo(Math.round(base + near(i - base)), 11);
  }
  function commit(t: number) {
    committed = t;
    const k = list[mod(Math.round(t))]?.key;
    if (!k || mode !== 'pick' || k === selected || backend.state.sealed) return;
    select(k, { scroll: false, dir: vel >= 0 ? 1 : -1 });
  }

  // le doigt
  /** crans sentis au doigt : la roue colle un peu à chaque pochette, puis saute à la suivante (fonction monotone) */
  const STICK = 0.3;
  const feel = (x: number) => x - (STICK / TAU) * Math.sin(TAU * x);
  const unfeel = (y: number) => {
    let x = y;
    for (let i = 0; i < 4; i++) x -= (feel(x) - y) / (1 - STICK * Math.cos(TAU * x));
    return x;
  };
  let drag: { id: number; x0: number; y0: number; raw0: number; t0: number; moved: boolean; caught: boolean; samples: Array<[number, number]> } | null = null;
  rowEl.addEventListener('pointerdown', (e) => {
    if (!wheelOn || drag || mode !== 'pick' || e.button > 0) return;
    const caught = target !== null && Math.abs(vel) > 0.6; // roue lancée : on l'attrape
    sheetOnSettle = null;
    target = null;
    vel = 0;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, raw0: unfeel(pos), t0: performance.now(), moved: false, caught, samples: [[performance.now(), pos]] };
    try {
      rowEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    rowEl.classList.add('held');
    run();
  });
  rowEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.hypot(dx, e.clientY - drag.y0) > 7) drag.moved = true;
    if (!drag.moved) return;
    const raw = drag.raw0 - dx / (geo.gap || 100);
    pos = feel(raw);
    const now = performance.now();
    drag.samples.push([now, raw]);
    while (drag.samples.length > 2 && now - drag.samples[0][0] > 90) drag.samples.shift();
    const [t0, p0] = drag.samples[0];
    vel = now - t0 > 8 ? ((raw - p0) / (now - t0)) * 1000 : vel;
  });
  const wheelUp = (e: PointerEvent, cancel: boolean) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    rowEl.classList.remove('held');
    // doigt resté immobile un moment avant de lâcher : pas d'élan
    const lastS = d.samples[d.samples.length - 1];
    if (performance.now() - lastS[0] > 70) vel = 0;
    if (!d.moved && !cancel && !d.caught && performance.now() - d.t0 < 450) {
      // un toucher : au milieu → la fiche ; sur le côté → cette pochette vient au milieu
      const hit = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.sleeve');
      const i = hit ? sleeves.indexOf(hit) : -1;
      if (i >= 0 && Math.abs(near(i - pos)) < 0.5) {
        haptics.pulse(6);
        springTo(Math.round(pos), 14);
        // la fiche s'ouvre au « click » qui suit (pas avant : il tomberait sur le bouton Ouvrir de la fiche qui monte)
        pendingOpen = list[i].key;
        clearTimeout(pendingT);
        pendingT = window.setTimeout(openPending, 400);
        return;
      }
      if (i >= 0) {
        // sur le côté : elle vient au milieu, puis sa fiche s'ouvre (le bouton « Ouvrir » n'existe plus sur téléphone)
        haptics.pulse(4);
        spinToIndex(i);
        sheetOnSettle = list[i].key;
        return;
      }
    }
    vel = Math.max(-28, Math.min(28, vel));
    // élan : où la roue s'arrêterait toute seule, arrondi au cran (au plus 2 tours)
    const proj = pos + vel * (REDUCED.matches ? 0.12 : 0.26);
    springTo(Math.round(Math.max(pos - 2 * N, Math.min(pos + 2 * N, proj))));
  };
  let pendingOpen: string | null = null;
  let pendingT = 0;
  const openPending = () => {
    clearTimeout(pendingT);
    const k = pendingOpen;
    pendingOpen = null;
    if (k && mode === 'pick' && !sheet.isOpen()) sheet.open(k);
  };
  rowEl.addEventListener('click', () => pendingOpen && openPending());
  rowEl.addEventListener('pointerup', (e) => wheelUp(e, false));
  rowEl.addEventListener('pointercancel', (e) => wheelUp(e, true));
  rowEl.addEventListener('lostpointercapture', (e) => drag && e.pointerId === drag.id && wheelUp(e, true));
  // molette / pavé tactile (fenêtre étroite sur ordinateur) : un cran par geste
  let wheelAcc = 0;
  let wheelT = 0;
  rowEl.addEventListener(
    'wheel',
    (e) => {
      if (!wheelOn || mode !== 'pick') return;
      e.preventDefault();
      wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      clearTimeout(wheelT);
      wheelT = window.setTimeout(() => (wheelAcc = 0), 160);
      if (Math.abs(wheelAcc) < 40) return;
      const s = Math.sign(wheelAcc);
      wheelAcc = 0;
      springTo(Math.round((target ?? pos) + s), 11);
    },
    { passive: false },
  );

  /** mise en page : roue (téléphone) ou liste (ordinateur) */
  const relayout = () => {
    const on = WHEEL.matches;
    if (on !== wheelOn) {
      wheelOn = on;
      rowEl.classList.toggle('wheel', on);
      if (!on) {
        opening.setWheel(null);
        cancelAnimationFrame(raf);
        raf = 0;
        drag = null;
        target = null;
        vel = 0;
        for (const b of sleeves) {
          b.style.transform = b.style.opacity = b.style.zIndex = '';
          b.classList.remove('mid');
        }
      }
    }
    if (!on) return;
    measure();
    // au repos : la pochette choisie au milieu (sans animation)
    if (!drag && target === null) {
      pos = indexOfKey(selected);
      detent = Math.round(pos);
    }
    markMid();
    paint();
  };
  new ResizeObserver(() => requestAnimationFrame(relayout)).observe(rowEl);
  // (07/11) scène encore en chargement à l'arrivée sur la boutique : dès que la roue 3D est prête, on s'y cale
  opening.onWheelReady = () => requestAnimationFrame(relayout);
  WHEEL.addEventListener('change', relayout);

  // ── (11/11) booster du moment : abonnement, bandeau, compte à rebours, annonce
  let evSig = '';
  const bootAt = performance.now();
  function setEvents(rows: PackEvent[]) {
    const next = liveEvent(rows);
    const sig = next ? `${next.id}|${next.name}|${next.accent}|${next.endAt}|${next.blurb ?? ''}|${contentSig(next)}` : '';
    if (sig === evSig) return;
    evSig = sig;
    ev = next;
    const i = sheetList.findIndex((x) => x.key === EVENT_KEY);
    if (i >= 0) sheetList.splice(i, 1);
    if (ev) sheetList.unshift(eventPack(ev));
    thumbs.delete(EVENT_KEY);
    opening.setEventBooster(ev);
    band.hidden = !ev;
    if (ev) {
      band.style.setProperty('--ev', ev.accent);
      band.querySelector('.ev-n')!.textContent = ev.name;
      band.querySelector<HTMLElement>('[data-ev-left]')!.dataset.evLeft = String(ev.endAt);
      band.setAttribute('aria-label', `Booster du moment : ${ev.name}`);
      tickEvent();
      announceEvent(ev);
      if (wantEventSheet && mode === 'pick') {
        wantEventSheet = false;
        sheet.open(EVENT_KEY);
      }
    } else if (selected === EVENT_KEY) {
      // fini pendant qu'on le regardait : retour au Bebou Pack (un booster déjà tiré reste ouvrable)
      if (sheet.isOpen()) sheet.close();
      selected = 'bebou';
      band.classList.remove('on');
      if (mode === 'pick') select('bebou', { scroll: true });
    }
    if (mode === 'pick') {
      sheet.sync();
      syncCta();
    }
  }
  /** compte à rebours (bandeau + fiche) ; à la fin, l'événement disparaît sans attendre le serveur */
  function tickEvent() {
    const now = Date.now();
    if (ev && now >= ev.endAt) return setEvents([]);
    for (const b of el.querySelectorAll<HTMLElement>('[data-ev-left]')) {
      const end = Number(b.dataset.evLeft);
      if (end > 0) b.textContent = fmtLeft(end - now);
    }
  }
  window.setInterval(() => ev && el.isConnected && !document.hidden && tickEvent(), 1000);
  /**
   * Notification dans le jeu au début d'un événement (en plus de la notification push envoyée par le serveur) : un
   * message une fois par appareil et par événement, et le bandeau marqué « nouveau » jusqu'au premier toucher.
   */
  function seenEvents(): string[] {
    try {
      return JSON.parse(localStorage.getItem(EV_SEEN) ?? '[]') as string[];
    } catch {
      return [];
    }
  }
  function announceEvent(e: PackEvent) {
    const seen = seenEvents();
    if (seen.includes(e.id)) return void band.classList.remove('new');
    band.classList.add('new');
    // sorti pendant qu'on joue : un message en plus (au chargement, le bandeau en tête de la boutique suffit)
    if (performance.now() - bootAt > 15_000) toast(`Nouveau : le booster ${e.name}, à la boutique pendant ${fmtLeft(e.endAt - Date.now())} seulement`, 'info');
    try {
      localStorage.setItem(EV_SEEN, JSON.stringify([...seen, e.id].slice(-20)));
    } catch {
      /* stockage bloqué : le message reviendra */
    }
  }
  band.addEventListener('click', () => {
    if (!ev || mode !== 'pick') return;
    haptics.pulse(6);
    band.classList.remove('new');
    if (DOCK.matches) select(EVENT_KEY);
    else sheet.open(EVENT_KEY); // (la fiche appelle onSelect → select : le booster passe au centre)
  });
  backend.watchEvents?.(setEvents);

  // ── état (booster scellé pas encore ouvert : bandeau + bouton direct)
  function syncState() {
    const s = backend.state;
    if (mode !== 'pick') return;
    if (s.sealed) {
      const t = themeById(s.sealed.themeId ?? '');
      const name = s.sealed.eventName ? `booster ${s.sealed.eventName}` : s.sealed.packKind === 'bebou' ? BEBOU_PACK.label : t ? `${t.label} Pack` : 'booster';
      banner.hidden = false;
      banner.querySelector('span')!.textContent = `Tu as un ${name} déjà tiré, pas encore ouvert.`;
      if (keyOf(s.sealed) !== selected) select(keyOf(s.sealed));
    } else banner.hidden = true;
    sheet.sync();
    syncCta();
  }
  backend.onChange(syncState);
  // (11/11) animation d'ouverture choisie (fiche booster) : suit `users.me`
  setOpeningChoice(backend.state.user?.openingStyle);
  backend.onChange((st) => setOpeningChoice(st.user?.openingStyle));
  const bannerBtn = banner.querySelector<HTMLButtonElement>('button')!;
  bannerBtn.addEventListener('click', async () => {
    shell.requestGyro();
    const sp = backend.state.sealed;
    // (audit UX2-20) double toucher pendant la latence de preparePack : un seul départ
    if (!sp || mode !== 'pick' || bannerBtn.disabled) return;
    const p = packOf(keyOf(sp)) ?? list.find((b) => b.key === 'bebou') ?? list[0];
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
      if (!b.cards.length) continue;
      const have = b.cards.reduce((a, c) => a + (mine.has(c.id) ? 1 : 0), 0);
      const btn = sleeveOf(b.key);
      if (!btn) continue;
      btn.style.setProperty('--pct', `${(have / b.cards.length) * 100}%`);
      btn.classList.add('has-prog');
      btn.title = `${fmtN(have)} / ${fmtN(b.cards.length)} cartes déjà dans ta collection`;
    }
  });

  // roue verticale (ordinateur) : l'ordre des pochettes est celui de la liste ; quand la roue s'arrête sur une autre
  // pochette, elle devient le booster choisi (le grand booster l'affiche sans pivoter : il a tourné avec la roue)
  opening.setReelKeys(list.map((b) => b.key));
  opening.reelLock = () => mode !== 'pick' || !el.isConnected || !!backend.state.sealed || sheet.isOpen() || viewing;
  opening.onReelCommit = (k) => {
    if (mode !== 'pick' || !el.isConnected || backend.state.sealed) return;
    select(k, { scroll: false });
  };
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
    const p = packOf(selected);
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
    // (retours 05/11) en série (×5, ×10), CHAQUE booster rejoue son ouverture (avant : seul le 1er, les suivants
    // brûlaient tout seuls et on avait l'impression que tout s'ouvrait d'un coup) ; « 4★ et + » / « Tout révéler » : auto
    const burn = hi || all;
    // « Tout révéler » : tout défile tout seul SAUF une mythique (rang 5) ou une secrète (6), qui gardent leur plein écran
    // (une légendaire défile à vitesse modérée, ralenti compris : voir fastSpeed dans opening.ts)
    // (retours 05/11) « Tout révéler » : une 5★ (rang 4) joue aussi sa version complète, ralenti compris
    // (retours Hugo 10/11) « 4★ et + » ne fait plus défiler : il va DIRECT à la première 4★ (ou ouvre tout s'il n'y en a pas)
    opening.setAuto({ burn, minRank: all ? 4 : hi ? HI_RANK : 0, reveal: all, jump: hi && !all });
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
    stopMusicPreview();
    stopAmbience();
    batch.skipping = true;
    abortMythic();
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
      // série préparée d'avance : le booster en cours et tous les suivants crédités en UN SEUL appel
      const rest = ok ? [...(b.current ? [b.current] : []), ...b.queue].filter((p) => !b.done.some((d) => d.id === p.id)) : [];
      if (rest.length > 1) {
        b.current = null;
        b.queue = [];
        try {
          const ids = new Set(await backend.revealPacks(rest.map((p) => p.id)));
          for (const p of rest) if (ids.has(p.id) && !b.done.some((d) => d.id === p.id)) b.done.push(p);
        } catch {
          // réseau : un par un, avec les nouvelles tentatives habituelles
          for (const p of rest) if (ok) ok = await credit(b, p);
        }
      } else if (ok && b.current) {
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
    dropDuel();
    endWild();
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
   * Vitrine : le booster 3D reste au centre de l'écran, partout (ordinateur et téléphone, fiche du pack ouverte ou
   * non, ouverture, récap).
   */
  function placeFocus() {
    // (retours de Tom, 4 nov.) le booster est TOUJOURS au centre de l'écran, sur ordinateur comme sur téléphone, fiche
    // du pack ouverte ou non (avant : il se décalait dans l'espace libre entre les colonnes)
    const px = 0;
    opening.setFocusOffset(px, 0);
    el.style.setProperty('--focus-x', `${px}px`);
  }
  window.addEventListener('resize', placeFocus);
  new MutationObserver(() => (placeFocus(), syncHint())).observe(sheet.el, { attributes: true, attributeFilter: ['class', 'hidden'] });

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
    syncDock();
  }

  function start(p: SealedPack, continued = false) {
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
    const autoOpen = !!batch && (batch.hi || batch.all);
    const coachOn = !autoOpen && !continued && !coachSeen(coachSt);
    coach.className = `coach c-${coachSt}`;
    coach.hidden = !coachOn;
    requestAnimationFrame(syncInsets);
    let shown = 0; // index (ordre de révélation) de la dernière carte retournée
    // (retours 06/11) ×5 / ×10 = un seul gros booster : le compteur court sur toutes ses cartes (« 12 / 25 »)
    const series = '';
    const off = batch && batch.total > 1 ? batch.done.reduce((a, d) => a + d.cards.length, 0) : 0;
    const all = batch && batch.total > 1 ? off + p.cards.length + batch.queue.reduce((a, d) => a + d.cards.length, 0) : p.cards.length;
    const seriesLast = !batch || batch.queue.length === 0;
    skipEl.hidden = false;
    skipAll.disabled = skipHi.disabled = false;
    disarmSkip();
    // (audit UX2-02) « Tout révéler » n'est plus remis à zéro à chaque booster : il vaut pour toute la série (comme
    // « 4★ et + ») ; seuls back() (retour boutique) et la séquence secrète le coupent
    mythicVeil.hidden = true;
    applyAuto();
    // série (2e booster et suivants) ou « 4★ et + » : l'emballage brûle tout seul
    if (batch && (batch.hi || batch.all)) hintTxt.textContent = 'Ouverture…';
    if (batch && batch.total > 1) setCount(`${off ? `${off} / ` : ''}${all} cartes`);
    if (continued) {
      // suite du gros booster : pas d'emballage à ouvrir
      coach.hidden = true;
      hint.classList.remove('hold');
      hintTxt.textContent = HINT.reveal;
    }
    void preloadArt(p.cards.map((c) => c.cardId)); // en parallèle de la scène : images prêtes au plus tôt
    // (08/11) god pack : séquence plein écran avant l'emballage (la scène se monte dessous pendant ce temps)
    if (p.god) void playGodIntro(shell);
    else clearGod();
    const secret = p.cards.find((c) => rarity(c.rarity).secret);
    if (secret) void prepareSecret(secret);
    dropDuel();
    const duelCard = p.cards.find((c) => rarity(c.rarity).rank === 5 && duelMonster(c.cardId));
    if (duelCard) void prepareDuel(duelCard);
    // 6★ des autres familles : moteur et scène téléchargés pendant la déchirure
    for (const c of p.cards) {
      prepareMythic(c.cardId, c.rarity, shell.sfx);
      prefetchMusicPreview(c.cardId, c.rarity);
    }
    // ambiance « Éclipse » (Berserk 5★ / 6★ — game/eclipse.ts) : la scène 3D s'en charge (opening.open) ; ici, sa musique
    // — demandée d'avance, lancée quand le sachet est descellé (onOpened), coupée au booster suivant s'il n'en est pas
    const eclipse = isEclipsePack(p.cards);
    if (eclipse) prefetchAmbience('eclipse');
    else stopAmbience(ECLIPSE.coucher);
    // Pokémon 6★ : musique décodée et scène montée (carte, décor) pendant que le joueur ouvre le booster
    // (plusieurs Pokémon 6★ dans le même booster : chacun aura sa rencontre ; la 1re est préparée maintenant, les
    // suivantes à la fin de la précédente — ou, au pire, pendant le noir de leur propre transition)
    wildQueue = p.cards.filter(isWild);
    if (wildQueue.length) {
      void shell.sfx.loadMusic(WILD_MUSIC);
      prepareWild(wildQueue[0]);
    } else dropWild();
    opening.open(p, {
      onHold(v) {
        ring.style.strokeDashoffset = String(100 - v * 100);
      },
      onOpened() {
        if (eclipse) void playAmbience('eclipse', shell.sfx.volume, ECLIPSE.lever);
        // série : le booster suivant se prépare (cartes construites) pendant qu'on regarde celui-ci
        if (batch?.queue[0]) opening.preload(batch.queue[0]);
        if (coachOn) coachDone(coachSt);
        else coach.hidden = true;
        hint.classList.remove('hold');
        hintTxt.textContent = HINT.reveal;
        setCount(`${series}${off + 1} / ${all}`);
      },
      onCard(i, card, total) {
        setCount(`${series}${off + i + 1} / ${batch && batch.total > 1 ? all : total}`);
        shown = i;
        // mythique : la séquence plein écran (mythic-veil) tient lieu de fiche et d'indication ; le titre « MYTHIQUE »
        // n'arrive qu'après l'impact (réf. motion §7.2 : titre à +1,2 s)
        if (rarity(card.rarity).rank === 5) {
          mythicVeil.classList.add('hit');
          return;
        }
        hint.hidden = i < total - 1 ? false : true;
        hintTxt.textContent = i < total - 1 ? HINT.next : '';
        showInfo(card);
      },
      onJump(to, total) {
        // « Direct 4★ » : les petites cartes sont rangées d'un coup, la belle carte attend face cachée
        shown = to - 1;
        info.classList.remove('in');
        mythicVeil.hidden = true;
        hint.hidden = false;
        hintTxt.textContent = HINT.reveal;
        setCount(`${series}${off + to + 1} / ${batch && batch.total > 1 ? all : total}`);
      },
      onNext() {
        stopMusicPreview();
        // la carte montrée file dans la rangée : son panneau s'efface, la suivante attend face cachée
        info.classList.remove('in');
        mythicVeil.hidden = true;
        skipEl.hidden = false;
        hintTxt.textContent = HINT.reveal;
        setCount(`${series}${off + Math.min(p.cards.length, shown + 2)} / ${all}`);
      },
      onMythic(card) {
        // 6★ PLEIN ÉCRAN : tout s'efface, pause dramatique, puis la carte, ses étoiles une à une
        info.hidden = true;
        info.classList.remove('in');
        hint.hidden = true;
        skipEl.hidden = true;
        mythicVeil.hidden = false;
        mythicVeil.classList.remove('shown', 'hit');
        mythicVeil.querySelector<HTMLElement>('.mv-name')!.textContent = card.cardName;
        mythicVeil.querySelector<HTMLElement>('.mv-hint')!.textContent = '';
      },
      onMythicShown(card, last) {
        // 6★ du bloc Musique : son extrait de 30 s (retours 05/11)
        void playMusicPreview(card.cardId, card.rarity, shell.sfx.volume, 'opening', mythicVeil);
        mythicVeil.classList.add('shown');
        mythicVeil.querySelector<HTMLElement>('.mv-hint')!.textContent = last ? (TOUCH ? 'Touche pour continuer' : 'Clique pour continuer') : HINT.next;
      },
      onLast() {
        info.classList.remove('in');
        hint.hidden = false;
        hintTxt.textContent = HINT.last;
        setCount(`${series}${off + p.cards.length} / ${all}`);
      },
      onPokemon(card) {
        void runWild(card);
      },
      onSecret() {
        hud.hidden = true;
        // la séquence « Un de nous » ne se passe pas : on coupe le défilement pour la suite de la série
        if (batch) batch.hi = batch.all = false;
        opening.setAuto({ burn: false, minRank: 0, reveal: false });
        void runSecret();
      },
      onCinematic(card) {
        // (08/11) toutes les autres 6★ : indices + scène de leur famille (game/mythic), puis la révélation habituelle
        if (mythicFamily(card.cardId, card.rarity)) {
          hud.hidden = true;
          info.hidden = true;
          info.classList.remove('in');
          mythicVeil.hidden = true;
          // (10/11) `target` : la doublure 2D de la scène finit à la taille et à la place exactes de la carte 3D
          const run = playMythicPrelude(shell, card.cardId, card.rarity, 'opening', {
            quick: !!batch?.all,
            target: () => {
              const r = opening.revealRect();
              return r && r.w > 8 ? { cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w } : null;
            },
          });
          void run.done.then(() => {
            if (mode !== 'opening' || batch?.skipping) return;
            hud.hidden = false;
            opening.resumeReveal();
          });
          return true;
        }
        // la scène d'invocation n'est pas prête (téléphone lent) : séquence mythique habituelle, rien n'attend
        if (!duel || duel.cardId !== card.cardId || !duel.exp || !shell.has('duel')) return false;
        hud.hidden = true;
        info.hidden = true;
        info.classList.remove('in');
        mythicVeil.hidden = true;
        document.body.classList.add('duel-on');
        markDuelSeen(card.cardId); // le récap qui suit ne la rejoue pas dans la visionneuse
        shell.show('duel');
        duel.exp.replay?.();
        return true;
      },
      onDone() {
        stopMusicPreview();
        mythicVeil.hidden = true;
        void done(p);
      },
      onPick(card) {
        void viewCard(card);
      },
    }, { continued, seriesLast });
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

  // ─────────────────────────────────────────── Pokémon 6★ : « rencontre sauvage » (041)
  let wildOn = false;
  let wildTr: GbcTransition | null = null;
  /** Pokémon 6★ du booster en cours pas encore rencontrés */
  let wildQueue: PackCard[] = [];
  /** scène montée à l'avance pour le Pokémon 6★ du booster en cours (carte, décor, matériaux) */
  let wildPrep: { cardId: string; exp: Promise<WildExperiment | null> } | null = null;
  function prepareWild(card: PackCard) {
    if (wildPrep?.cardId === card.cardId) return;
    dropWild();
    const me: { cardId: string; exp: Promise<WildExperiment | null> } = { cardId: card.cardId, exp: Promise.resolve(null) };
    me.exp = (async () => {
      try {
        const mod = await import('../../experiments/041-pokemon-wild/index');
        if (wildPrep !== me) return null;
        const dex = POKEMON_151.find((e) => pokemonCardId(e) === card.cardId)?.dex ?? 0;
        const exp = mod.default({ card: cardById(card.cardId), type: POKEMON_MYTHIC_TYPE[dex] ?? 'plante', onRevealed: () => (wildContinue.hidden = !wildOn) });
        await shell.mount('wild', exp, 'mythic');
        // booster abandonné pendant le montage : on démonte
        if (wildPrep !== me) {
          if (!wildOn) shell.unmount('wild');
          return null;
        }
        return exp;
      } catch (e) {
        console.error('[jeu] rencontre sauvage (préparation)', e);
        return null;
      }
    })();
    wildPrep = me;
  }
  /** la scène préparée ne servira pas (autre booster, retour boutique) */
  function dropWild() {
    if (wildOn || !wildPrep) return;
    wildPrep = null;
    if (shell.has('wild')) shell.unmount('wild');
  }
  /**
   * Transition de combat Game Boy Color (par-dessus l'ouverture, dès le toucher) + musique dès le premier clignotement.
   * La scène 041 est déjà montée (préparée à l'ouverture du booster) ; au noir complet seulement, elle passe en
   * éclairage Forward+ et compile — ce changement global ne se voit donc jamais et ne fige pas la transition.
   */
  async function runWild(card: PackCard) {
    if (wildOn) return;
    wildOn = true;
    markWildSeen(card.cardId); // le récap qui suit ne la rejoue pas dans la visionneuse
    const qi = wildQueue.findIndex((c) => c.cardId === card.cardId);
    if (qi >= 0) wildQueue.splice(qi, 1);
    hud.hidden = true;
    info.classList.remove('in');
    const tr = (wildTr = gbcTransition());
    void shell.sfx.playMusic(WILD_MUSIC, { ...WILD_LOOP, vol: 0.55, fade: 0.04 });
    haptics.pulse([30, 60, 30, 60, 30]);
    try {
      if (wildPrep?.cardId !== card.cardId) prepareWild(card);
      const [exp] = await Promise.all([wildPrep!.exp, tr.covered]);
      if (!wildOn) return;
      if (!exp) throw new Error('scène indisponible');
      await exp.activate();
      if (!wildOn) return;
      shell.show('wild');
      exp.replay?.();
      void tr.reveal();
    } catch (e) {
      console.error('[jeu] rencontre sauvage', e);
      endWild();
      opening.resumeAfterScene();
    }
  }
  /** fin de la rencontre (Continuer, Tout passer, erreur) : musique en fondu, retour à l'ouverture */
  function endWild() {
    if (!wildOn) return;
    wildOn = false;
    wildPrep = null;
    wildContinue.hidden = true;
    wildTr?.destroy();
    wildTr = null;
    shell.sfx.stopMusic(0.8);
    if (shell.has('wild')) {
      shell.show('opening');
      shell.unmount('wild');
    }
    hud.hidden = false;
  }
  wildContinue.querySelector('button')!.addEventListener('click', () => {
    endWild();
    opening.resumeAfterScene();
    // un autre Pokémon 6★ attend dans ce booster : sa scène se prépare pendant que le joueur regarde la suite
    if (wildQueue.length) prepareWild(wildQueue[0]);
  });

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

  /** Cinématique d'invocation (6★ Yu-Gi-Oh) montée en fond dès que le pack est tiré, comme la scène secrète. */
  async function prepareDuel(card: PackCard) {
    const monster = duelMonster(card.cardId)!;
    const d = (duel = { cardId: card.cardId, exp: null as { replay?(): void } | null });
    try {
      const mod = await import('../scenes/duelSummon');
      if (duel !== d) return;
      const exp = mod.default({
        card: cardById(card.cardId),
        monster,
        onDone: () => {
          if (duel !== d) return;
          shell.show('opening');
          dropDuel();
          hud.hidden = mode !== 'opening';
          opening.resumeAfterCinematic();
        },
      });
      await shell.mount('duel', exp, 'mythic');
      if (duel !== d) return shell.unmount('duel');
      d.exp = exp;
    } catch (e) {
      console.warn('[jeu] invocation indisponible', e);
      if (duel === d) dropDuel();
    }
  }

  function dropDuel() {
    document.body.classList.remove('duel-on');
    if (!duel) return;
    duel = null;
    if (shell.active() === 'duel') shell.show('opening');
    shell.unmount('duel');
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
        // série : le suivant est déjà scellé (et ses cartes préparées) → aucun appel réseau ici
        next = b.queue.shift() ?? (await backend.preparePack(b.req));
      } catch (e) {
        toast(errMsg(e), 'err');
        return showSummary();
      }
      if (batch !== b || b.skipping) return;
      // garde : jamais rejouer un booster déjà montré et compté
      if (b.done.some((d) => d.id === next.id)) return showSummary();
      b.current = next;
      pack = next;
      // (retours 06/11) gros booster ×5 / ×10 : la suite des cartes arrive tout de suite, sans nouvel emballage
      await new Promise((r) => setTimeout(r, 60));
      if (batch !== b || b.skipping) return;
      start(next, true);
      return;
    }
    showSummary();
  }
  const openingReq = (p: SealedPack): PackRequest => (p.eventId ? packOf(EVENT_KEY)?.req ?? { kind: 'bebou' } : p.packKind === 'bebou' ? { kind: 'bebou' } : { kind: 'theme', themeId: p.themeId });

  /** Compteur de collection du booster : « World : 143/924 » (thème), « Collection : 1 234/13 888 » (Bebou Pack). */
  function collectionCounter(req: PackRequest): { label: string; have: number; total: number } {
    const mine = new Set(backend.state.collection.map((c) => c.cardId));
    if (req.event) {
      const ec = eventCards(req.event);
      return { label: ev?.name ?? 'Booster du moment', have: ec.reduce((a, c) => a + (mine.has(c.id) ? 1 : 0), 0), total: ec.length };
    }
    const t = req.kind === 'theme' ? themeById(req.themeId ?? '') : undefined;
    const cards = t ? t.cards : THEMES.flatMap((x) => x.cards);
    return { label: t ? t.label : 'Collection', have: cards.reduce((a, c) => a + (mine.has(c.id) ? 1 : 0), 0), total: cards.length };
  }

  /** Fond du récap selon le meilleur drop : lueur radiale de la couleur de la rareté, rayons et particules aux couleurs du pack. */
  function paintSummaryBg(best: PackCard, req: PackRequest) {
    const rr = rarity(best.rarity);
    const accent = req.event ? packOf(EVENT_KEY)?.accent ?? rr.hex : req.kind === 'bebou' ? BEBOU_PACK.style.accent : themeById(req.themeId ?? '')?.style.accent ?? rr.hex;
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
      ${cc.total > 0 ? `<div class="sum-prog" aria-hidden="true" style="--from:${((Math.max(0, cc.have - fresh) / cc.total) * 100).toFixed(2)}%;--to:${((cc.have / cc.total) * 100).toFixed(2)}%"><i></i><span>${fmtPct(Math.max(0, cc.have - fresh) / cc.total)}${fresh ? ` → <b>${fmtPct(cc.have / cc.total)}</b>` : ''}</span></div>` : ''}
      ${grid ? '<div class="sum-cards"></div>' : ''}
      <div class="sum-actions">
        ${pend ? '<button class="btn-primary retry">Réessayer l’enregistrement</button>' : u && bal > 0 ? `<button class="btn-primary again" data-n="${again}">${again > 1 ? `Encore ×${again}` : 'Encore un'}<small>${bal} en réserve</small></button>` : u ? `<span class="muted next-pack">prochain booster dans ${fmtCountdown((liveRegen(u).nextAt ?? Date.now()) - Date.now())}</span>` : ''}
        <button class="btn-ghost coll">${fresh ? 'Mes nouvelles' : dups === all.length ? 'Contrats' : 'Ma collection'}</button>
        <button class="btn-ghost back">Boutique</button>
      </div>`;
    if (best) paintSummaryBg(best, req);
    // règle pic-fin (réf. motion §1.6 / §7.4) : la barre d'album progresse sous les yeux du joueur (600 ms), avec un tic
    const prog = summary.querySelector<HTMLElement>('.sum-prog');
    if (prog) requestAnimationFrame(() => requestAnimationFrame(() => { prog.classList.add("go"); if (fresh) window.setTimeout(() => shell.sfx.tick(1.4, 0.05), 350); }));
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
      // (booster du moment terminé entre-temps : « Encore un » repart sur le Bebou Pack)
      const p = (req.event ? packOf(EVENT_KEY) : list.find((b) => b.key === (req.kind === 'bebou' ? 'bebou' : themeById(req.themeId ?? '')?.id))) ?? list.find((b) => b.key === 'bebou') ?? list[0];
      const hi = batch?.hi ?? false;
      const all = batch?.all ?? false; // (audit UX2-02) « Tout révéler » suit, comme « 4★ et + »
      back();
      try {
        // la série se scelle PENDANT le retour du booster à la vitrine (avant : 650 ms d'attente, puis l'appel réseau)
        const [got] = await Promise.all([beginSeries(p.req, Math.max(1, n), hi, all), new Promise((r) => setTimeout(r, 320))]);
        if (mode !== 'pick') return;
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
    vi.innerHTML = `${card.isNew ? '<div class="ci-new">NOUVELLE</div>' : ''}<div class="ci-name">${esc(card.cardName)}</div>${e?.artist ? `<div class="ci-by">${esc(e.artist)}</div>` : ''}<div class="ci-meta">${starsHtml(card.rarity)} <span class="ci-r" style="color:${rr.accentHex}">${rr.label}</span></div><div class="ci-sub">${st && e && !rr.secret ? `${esc(st.label)} ${String(e.num).padStart(3, '0')}/${numberingSize(st)} · ` : ''}n°${fmtN(card.mintNumber)}\u00a0imprimé</div>`;
    viewerUi.querySelector('.v-actions')!.replaceChildren(imageReportButton(backend, card.cardId, 'ouverture/zoom'));
    viewerUi.hidden = false;
    summary.hidden = true;
    fanBadges.hidden = true;
    sumBg.classList.add('veiled');
    big.setVisible(false);
    el.classList.add('viewing');
    syncDock();
    document.body.classList.add('card-open');
    syncHint();
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
    el.classList.remove('viewing');
    syncDock();
    document.body.classList.remove('card-open');
    summary.hidden = mode !== 'summary';
    sumBg.classList.remove('veiled');
    if (mode === 'summary' && !summary.classList.contains('multi')) fanBadges.hidden = false;
    big.setVisible(mode === 'pick');
    shell.show('opening');
    syncHint();
  }
  viewerUi.querySelector('.close')!.addEventListener('click', closeViewer);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && closeViewer());

  function back() {
    clearGod();
    closeViewer();
    hideFanBadges();
    sumBg.hidden = true;
    mythicVeil.hidden = true;
    pack = null;
    batch = null;
    stopAmbience(ECLIPSE.coucher);
    opening.setAuto({ burn: false, minRank: 0, reveal: false });
    opening.reset();
    endWild();
    dropWild();
    dropDuel();
    abortMythic();
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
      // téléphone (roue) : la pochette choisie au milieu, sans animation
      requestAnimationFrame(relayout);
      syncState();
      requestAnimationFrame(syncDock);
      // lien direct vers une fiche (missions « Go », #/boutique/bebou)
      if (sub && sheetList.some((b) => b.key === sub)) sheet.open(sub);
      // (lien de la notification de début : l'événement peut arriver juste après la boutique)
      else if (sub === EVENT_KEY) wantEventSheet = true;
    },
    leave() {
      stopMusicPreview(0.3);
      stopAmbience(0.3);
      sheet.close();
      sheet.dock(false);
      if (mode === 'summary') back();
    },
    busy: () => mode === 'opening',
  };
}
