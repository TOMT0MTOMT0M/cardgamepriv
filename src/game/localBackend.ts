import { rollPack, rollPackEx, type PackRequest } from '../core/packRoll';
import { SURVEY_FEATURES, SURVEY_UNIVERSES, cleanSurvey, surveyFilled, type SurveyAnswer } from '../core/survey';
import { rng } from '../core/ease';
import { applyRegen, fmtCountdown } from '../core/packRegen';
import { contractProblem, contractTarget, rollContract } from '../core/contracts';
import { catalogEntry, BEBOU_PACK, themeById } from '../core/sets/themes';
import { POKEMON_151, pokemonCardId } from '../core/sets/pokemon151';
import { rarity as rarityOf, type RarityId } from '../core/rarity';
import { applyMissionEvent, claimMission, claimMissionBonus, currentMissions, nextMissionReset, rerollMission, type MissionEvent, type MissionsState } from '../core/missions';
import { pityAfter, pityForces } from '../core/pity';
import { STREAK_REWARD, claimStreak as claimStreakState, streakDay, touchStreak, type StreakState } from '../core/streak';
import { PROFILE_MEDIA_DEMO_MAX, bestCard, cleanCosmetics, profileMediaProblem, statsFrom, type CosmeticChoice, type PlayerStats } from '../core/cosmetics';

/** démo : photo / bannière importées (data URL), une clé par sorte — hors de la sauvegarde principale (lot P, live 02) */
const DEMO_MEDIA_LS = 'bebou.demo.media';
function demoMedia(): { avatarMedia?: string; bannerMedia?: string } {
  try {
    return { avatarMedia: localStorage.getItem(`${DEMO_MEDIA_LS}.avatar`) ?? undefined, bannerMedia: localStorage.getItem(`${DEMO_MEDIA_LS}.banner`) ?? undefined };
  } catch {
    return {};
  }
}
import { ACHIEVEMENTS, achievementDone, achievementStats, cardsValue, emptyEcon, type EconState } from '../core/economy';
import { THEMES as GAME_THEMES } from '../core/sets/themes';
import { createLocalEco, type LocalEcoSave } from './ecoLocal';
import { BOARD_HOURS, BOARD_MAX_ITEMS, BOARD_MAX_OPEN, listingLive, type BoardState, type ListingOfferView, type ListingView } from './backend';
import type { SuggestionView } from './backend';
import { BIG_PULL_RARITIES, cardKey, lockedCards, type BigPull, type Binder, type Friend, type GameBackend, type GameState, type PlayerCard, type SealedPack, type TradeHistoryItem, type TradeItem, type TradeView } from './backend';

/** Plafonds des classeurs : les mêmes que le serveur (convex/binders.ts, recopiés : importer ce fichier tirerait le serveur Convex dans le jeu). */
const BINDER_MAX = 30;
const BINDER_CARDS_MAX = 500;
const BINDER_NAME_MAX = 32;
/** Amis : mêmes plafonds que le serveur (convex/friends.ts, recopiés pour la même raison) */
const DEMO_MAX_PENDING = 15;
const DEMO_DECLINE_COOLDOWN = 24 * 60 * 60 * 1000;
const foldName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Mode DÉMO (hors-ligne) : même interface que le serveur, tout est stocké dans ce navigateur (localStorage).
 * Sert quand Convex n'est pas configuré, ou avec `?demo` : jouer, tester l'ouverture, la collection et les échanges
 * sans compte. Les « amis » sont des robots clairement étiquetés, qui acceptent les échanges raisonnables.
 * `?secret` : le prochain bébou pack contient forcément un Bébou (pour tester la séquence secrète).
 * `?pity` : le prochain booster est celui de la pity (6★ sûr) · `?streak=7` : série de connexion à 7 jours (récompense à réclamer).
 */
const LS = 'bebou.demo.v1';
const RANK: Record<RarityId, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };

interface Inv {
  [key: string]: PlayerCard;
}
interface Bot {
  id: string;
  name: string;
  inv: Inv;
}
interface Saved {
  /** démo : réponses au sondage (une par sondage) */
  surveys?: Record<string, SurveyAnswer & { createdAt: number }>;
  /** démo : suggestions envoyées (onglet Suggestions) */
  suggestions?: SuggestionView[];
  packBalance: number;
  lastDaily: number;
  /** départ du minuteur de recharge (absent sur les anciennes sauvegardes) */
  regenAt?: number;
  opened: number;
  inv: Inv;
  mints: Record<string, number>;
  sealed: SealedPack | null;
  /** série : boosters scellés suivants (preparePacks) */
  queue?: SealedPack[];
  feed: GameState['feed'];
  /** gros tirages (les miens + ceux des robots) */
  bigPulls?: BigPull[];
  bots: Bot[];
  trades: Array<TradeView & { status: 'pending' | 'done' | 'accepted' | 'declined' | 'cancelled' | 'countered'; resolvedAt?: number }>;
  /** envies des robots (badges « il la cherche ») */
  botWish?: Record<string, string[]>;
  seq: number;
  missions?: MissionsState;
  showcase?: Array<{ cardId: string; rarity: RarityId }>;
  bio?: string;
  /** pity 6★ (src/core/pity.ts) */
  pity?: number;
  wishlist?: string[];
  streak?: StreakState;
  binders?: Binder[];
  covers?: Record<string, string>;
  cosmetics?: CosmeticChoice;
  trades_done?: number;
  contracts_done?: number;
  /** pièces, compteurs de l'économie, parties de l'espace Jeux (ecoLocal.ts) */
  eco?: LocalEcoSave;
  /** fil d'activité perso (gros drops, échanges, contrats) */
  activity?: Array<{ id: string; kind: string; message: string; cardId?: string; cardName?: string; rarity?: RarityId; mintNumber?: number; createdAt: number }>;
  /** AMIS (lot A2) : liens avec les robots (`from` / `to` : 'me' ou id de robot) */
  friendships?: Array<{ id: string; from: string; to: string; status: 'pending' | 'accepted' | 'declined'; createdAt: number; respondedAt?: number }>;
  /** un robot t'a déjà envoyé sa demande d'ami (une seule fois par partie de démo) */
  botAsked?: boolean;
  /** TABLEAU D'OFFRES (lot T) : annonces (les miennes + celles des robots) et offres */
  listings?: DemoListing[];
  listingOffers?: DemoOffer[];
}
type DemoListing = Omit<ListingView, 'offerCount' | 'offers' | 'myOffer'>;
type DemoOffer = ListingOfferView & { listingUserId: string };

function add(inv: Inv, cardId: string, rarity: RarityId, n: number, mint = 999) {
  const k = cardKey({ cardId, rarity });
  const row = inv[k];
  if (row) {
    row.count += n;
    row.bestMintNumber = Math.min(row.bestMintNumber, mint);
  } else inv[k] = { cardId, rarity, count: n, bestMintNumber: mint, firstPulledAt: Date.now() };
}
function remove(inv: Inv, it: TradeItem): boolean {
  const k = cardKey(it);
  const row = inv[k];
  if (!row || row.count < it.count) return false;
  row.count -= it.count;
  if (row.count <= 0) delete inv[k];
  return true;
}

function freshSave(): Saved {
  // trois amis robots, chacun avec ~30 boosters ouverts (tirage déterministe)
  const bots: Bot[] = ['Léa', 'Malo', 'Inès'].map((n, i) => {
    const r = rng(9000 + i * 77);
    const inv: Inv = {};
    for (let p = 0; p < 30; p++) for (const s of rollPack({ kind: 'bebou' }, r)) if (s.rarity !== 'secret') add(inv, s.card.id, s.rarity, 1, 50 + p);
    return { id: `bot-${i}`, name: `${n} (robot)`, inv };
  });
  return { packBalance: 12, regenAt: Date.now(), lastDaily: 0, opened: 0, inv: {}, mints: {}, sealed: null, feed: [], bots, trades: [], seq: 1 };
}

export function createLocalBackend(): GameBackend {
  let save: Saved;
  try {
    save = JSON.parse(localStorage.getItem(LS) ?? 'null') ?? freshSave();
  } catch {
    save = freshSave();
  }
  // purge du 04/11 (cartes 1-3★ sans illustration supprimées du jeu) : la démo oublie aussi les cartes disparues
  {
    const known = (k: string) => !!catalogEntry(k.slice(0, k.lastIndexOf(':')));
    const clean = (inv: Inv) => {
      for (const k of Object.keys(inv)) if (!known(k)) delete inv[k];
    };
    clean(save.inv);
    for (const b of save.bots ?? []) clean(b.inv);
  }
  let forceSecret = new URLSearchParams(location.search).has('secret');
  /** démo : `?god` → le prochain booster est un god pack (test de l'animation) */
  let forceGod = new URLSearchParams(location.search).has('god');
  // démo : `?force=pop-blue-eyes-white-dragon` → la 3e carte du prochain booster de ce thème est cette carte, en 6★ (captures)
  let forceCard = new URLSearchParams(location.search).get('force');
  /** démo, test de la rencontre sauvage : `?wild=2` → les 2 dernières cartes du prochain booster sont des Pokémon 6★ */
  let forceWild = Math.min(5, Math.max(0, Number(new URLSearchParams(location.search).get('wild')) || 0));
  if (new URLSearchParams(location.search).has('pity')) save.pity = 199;
  {
    const n = Number(new URLSearchParams(location.search).get('streak'));
    if (n > 0) save.streak = { count: n, day: '2000-01-01', rewardedAt: 0 };
  }
  // série de connexion : la visite du jour compte (jour sauté : retour à 1)
  {
    const t = touchStreak(save.streak && save.streak.day !== '2000-01-01' ? save.streak : undefined, Date.now());
    if (save.streak?.day === '2000-01-01') save.streak = { ...save.streak, day: t!.day };
    else if (t) save.streak = t;
  }
  const listeners = new Set<(s: GameState) => void>();
  const state: GameState = {
    mode: 'demo',
    ready: true,
    user: null,
    authError: null,
    collection: [],
    friends: [],
    feed: [],
    bigPulls: [],
    sealed: null,
    trades: { incoming: [], outgoing: [] },
    missions: null,
    wishlist: [],
    binders: [],
    covers: {},
    social: { ready: true, friends: [], incoming: [], outgoing: [] },
    board: { mine: [], offers: [] },
  };

  /**
   * Sauvegarde (audit PERF2-17) : plus un `JSON.stringify` de toute la partie (65 → 160 Ko) à CHAQUE action, mais une
   * écriture regroupée 400 ms après la dernière, et tout de suite quand on quitte / cache la page (`pagehide`,
   * onglet caché : iOS peut tuer un onglet en arrière-plan sans prévenir).
   */
  let dirty = false;
  let flushT = 0;
  function flush() {
    clearTimeout(flushT);
    flushT = 0;
    if (!dirty) return;
    dirty = false;
    try {
      localStorage.setItem(LS, JSON.stringify(save));
    } catch {
      /* stockage plein ou bloqué : la démo continue en mémoire */
    }
  }
  function persist() {
    dirty = true;
    if (!flushT) flushT = window.setTimeout(flush, 400);
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.hidden && flush());

  function sync() {
    const now = Date.now();
    state.user = {
      id: 'me',
      name: 'Toi',
      packBalance: applyRegen(save.packBalance, save.regenAt ?? now, now).balance,
      packStored: save.packBalance,
      packRegenAt: save.regenAt ?? now,
      totalPacksOpened: save.opened,
      pityCount: save.pity ?? 0,
      streak: save.streak,
    };
    state.wishlist = save.wishlist ?? [];
    state.binders = [...(save.binders ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt - b.createdAt);
    state.covers = save.covers ?? {};
    state.collection = Object.values(save.inv);
    state.friends = save.bots.map<Friend>((b, i) => ({ id: b.id, name: b.name, online: i !== 2, status: i === 0 ? 'Trie ses doublons' : undefined, packsOpened: 30, bot: true }));
    state.feed = save.feed.slice(0, 20);
    state.bigPulls = (save.bigPulls ?? []).slice(0, 30);
    state.sealed = save.sealed;
    const pending = save.trades.filter((t) => t.status === 'pending');
    state.trades = { incoming: pending.filter((t) => t.toId === 'me'), outgoing: pending.filter((t) => t.fromId === 'me') };
    state.missions = { ...currentMissions(save.missions, 'me', now), resetAt: nextMissionReset(now) };
    state.social = demoSocial(now);
    state.board = boardSync(now);
    persist();
    listeners.forEach((fn) => fn(state));
    boardWatchers.forEach((fn) => fn(boardOpen()));
  }

  const feed = (kind: string, message: string, rarity?: RarityId, card?: { id: string; name: string; mint?: number }) => {
    save.feed.unshift({ id: `f${save.seq++}`, kind, message, rarity, createdAt: Date.now() });
    save.feed.length = Math.min(save.feed.length, 30);
    (save.activity ??= []).unshift({ id: `a${save.seq++}`, kind, message, rarity, cardId: card?.id, cardName: card?.name, mintNumber: card?.mint, createdAt: Date.now() });
    save.activity.length = Math.min(save.activity.length, 60);
  };
  const myStats = () => statsFrom(Object.values(save.inv), { packsOpened: save.opened, tradesDone: save.trades_done ?? 0, contractsSigned: save.contracts_done ?? 0, streak: save.streak?.count ?? 0, burned: (save.eco?.econ ?? emptyEcon()).burned });
  const doneCount = (st: PlayerStats, e: EconState) => {
    const a = achievementStats(st, e);
    return ACHIEVEMENTS.reduce((n, x) => n + (achievementDone(x, a) ? 1 : 0), 0);
  };
  const myEcon = (): EconState => save.eco?.econ ?? emptyEcon();
  /**
   * AMIS du mode démo (lot A2) : Léa et Malo « en ligne », Inès vue il y a 3 h ; leur dernière activité = leur dernier
   * gros tirage. Inès t'envoie une demande ~8 s après ta première visite de la démo (une seule fois).
   */
  const demoSocial = (now: number): GameState['social'] => {
    const botOf = (id: string) => save.bots.findIndex((b) => b.id === id);
    const out: GameState['social'] = { ready: true, friends: [], incoming: [], outgoing: [] };
    for (const l of save.friendships ?? []) {
      if (l.status === 'declined') continue;
      const other = l.from === 'me' ? l.to : l.from;
      const i = botOf(other);
      if (i < 0) continue;
      const b = save.bots[i];
      if (l.status === 'pending') {
        (l.from === 'me' ? out.outgoing : out.incoming).push({ id: l.id, userId: b.id, name: b.name, createdAt: l.createdAt });
        continue;
      }
      const last = (save.bigPulls ?? []).find((p) => p.userId === b.id);
      out.friends.push({
        id: l.id, userId: b.id, name: b.name, bot: true, since: l.respondedAt ?? l.createdAt,
        lastSeenAt: i === 2 ? now - 3 * 3600_000 : now, status: i === 0 ? 'Trie ses doublons' : undefined, packsOpened: 30 + i * 12,
        lastActivity: last ? { kind: last.rarity === 'mythic' ? 'mythic_pull' : 'pull', message: `${b.name} a obtenu ${last.cardName} [${rarityOf(last.rarity).label} #${last.mintNumber ?? 1}] !`, createdAt: last.createdAt } : null,
      });
    }
    out.friends.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    out.incoming.sort((a, b) => b.createdAt - a.createdAt);
    out.outgoing.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  };
  if (!save.botAsked)
    setTimeout(() => {
      const ines = save.bots[2];
      if (save.botAsked || !ines) return;
      save.botAsked = true;
      const links = (save.friendships ??= []);
      if (!links.some((l) => l.from === ines.id || l.to === ines.id)) links.push({ id: `fr${save.seq++}`, from: ines.id, to: 'me', status: 'pending', createdAt: Date.now() });
      sync();
    }, 8000);
  const botStats = (b: Bot, i: number) => statsFrom(Object.values(b.inv), { packsOpened: 30 + i * 12, tradesDone: 3 - i, contractsSigned: i, streak: [12, 3, 0][i] ?? 0 });

  /** Un robot propose parfois un échange : un de ses doublons qui te manque contre un des tiens qui lui manque. */
  function maybeBotOffer() {
    if (state.trades.incoming.length || Math.random() > 0.45) return;
    const bot = save.bots[Math.floor(Math.random() * save.bots.length)];
    const mineDup = Object.values(save.inv).filter((c) => c.count >= 2 && c.rarity !== 'secret' && !bot.inv[cardKey(c)]);
    const theirDup = Object.values(bot.inv).filter((c) => c.count >= 2 && !save.inv[cardKey(c)] && Math.abs(RANK[c.rarity] - RANK[mineDup[0]?.rarity ?? 'common']) <= 1);
    if (!mineDup.length || !theirDup.length) return;
    const give = theirDup[Math.floor(Math.random() * theirDup.length)];
    const want = mineDup.find((c) => Math.abs(RANK[c.rarity] - RANK[give.rarity]) <= 1) ?? mineDup[0];
    save.trades.push({
      id: `t${save.seq++}`, fromId: bot.id, toId: 'me', fromName: bot.name, toName: 'Toi',
      offered: [{ cardId: give.cardId, rarity: give.rarity, count: 1 }],
      requested: [{ cardId: want.cardId, rarity: want.rarity, count: 1 }],
      note: 'doublon contre doublon ?', createdAt: Date.now(), status: 'pending',
    });
  }

  // ───────────── TABLEAU D'OFFRES du mode démo (lot T — mêmes règles que convex/listings.ts) : les robots publient des
  // annonces, font des offres sur les tiennes (2 à 12 s après), répondent aux tiennes (acceptent dès 0,8× la valeur,
  // sinon contre-offre avec moins de cartes, sinon refus) et à tes contre-offres.
  const boardWatchers = new Set<(l: ListingView[]) => void>();
  const L = () => (save.listings ??= []);
  const O = () => (save.listingOffers ??= []);
  const ACTIVE_OFFER = (o: DemoOffer) => o.status === 'pending' || o.status === 'countered';
  const invOf = (id: string) => (id === 'me' ? save.inv : save.bots.find((b) => b.id === id)?.inv);
  const userName = (id: string) => (id === 'me' ? 'Toi' : (save.bots.find((b) => b.id === id)?.name ?? '?'));
  const cardName = (id: string) => catalogEntry(id)?.name ?? id;
  const listingOfferView = (o: DemoOffer): ListingOfferView => ({ ...o });
  const viewOf = (l: DemoListing): ListingView => {
    const offers = O().filter((o) => o.listingId === l.id);
    const active = offers.filter(ACTIVE_OFFER);
    return {
      ...l,
      offerCount: active.length,
      offers: l.userId === 'me' ? (l.status === 'open' ? active : offers.filter((o) => o.status === 'accepted')).map(listingOfferView) : undefined,
      myOffer: active.find((o) => o.fromId === 'me') ?? null,
    };
  };
  /** cartes que je peux encore engager (hors l'offre `except`, qu'on remplace / conclut) */
  const myFree = (it: TradeItem, except?: DemoOffer) => (save.inv[cardKey(it)]?.count ?? 0) - (lockedCards(state).get(cardKey(it)) ?? 0) + (except?.offered.find((x) => cardKey(x) === cardKey(it))?.count ?? 0);
  const checkMine = (items: TradeItem[], except?: DemoOffer) => {
    for (const it of items) {
      if ((save.inv[cardKey(it)]?.count ?? 0) < it.count) throw new Error(`Tu ne possèdes pas assez d’exemplaires de ${cardName(it.cardId)}.`);
      if (myFree(it, except) < it.count) throw new Error(`${cardName(it.cardId)} est déjà engagée dans un échange, une annonce ou une offre en cours.`);
    }
  };
  const checkList = (items: TradeItem[], what: string, allowEmpty = false) => {
    if (!allowEmpty && !items.length) throw new Error(`Choisis au moins une carte (${what}).`);
    if (items.length > BOARD_MAX_ITEMS) throw new Error(`${BOARD_MAX_ITEMS} cartes différentes au maximum (${what}).`);
  };
  function closeOffersOf(l: DemoListing, now: number, keep?: string) {
    for (const o of O()) if (o.listingId === l.id && ACTIVE_OFFER(o) && o.id !== keep) ((o.status = 'closed'), (o.resolvedAt = now));
  }
  function boardSync(now: number): BoardState {
    for (const l of L()) if (l.status === 'open' && l.expiresAt <= now) ((l.status = 'expired'), (l.resolvedAt = now), closeOffersOf(l, now));
    // on oublie ce qui est fini depuis plus de 3 jours
    save.listings = L().filter((l) => l.status === 'open' || (l.resolvedAt ?? now) > now - 72 * 3600_000);
    save.listingOffers = O().filter((o) => ACTIVE_OFFER(o) || (o.resolvedAt ?? now) > now - 72 * 3600_000);
    const recent = now - 48 * 3600_000;
    return {
      mine: L().filter((l) => l.userId === 'me' && (l.status === 'open' || (l.resolvedAt ?? now) >= recent)).map(viewOf).sort((a, b) => b.createdAt - a.createdAt),
      offers: O()
        .filter((o) => o.fromId === 'me' && (ACTIVE_OFFER(o) || (o.resolvedAt ?? now) >= recent))
        .map((o) => ({ ...listingOfferView(o), listing: L().find((l) => l.id === o.listingId) ? viewOf(L().find((l) => l.id === o.listingId)!) : null }))
        .sort((a, b) => (b.resolvedAt ?? b.createdAt) - (a.resolvedAt ?? a.createdAt)),
    };
  }
  const boardOpen = () => {
    const now = Date.now();
    return L().filter((l) => listingLive(l, now)).sort((a, b) => b.createdAt - a.createdAt).map(viewOf);
  };
  /** l'échange lui-même : tout ou rien (vérifié avant de bouger quoi que ce soit) */
  function boardConclude(l: DemoListing, o: DemoOffer, give: TradeItem[], want: TradeItem[]) {
    const a = invOf(l.userId), b = invOf(o.fromId);
    if (!a || !b) throw new Error('Joueur introuvable.');
    for (const it of give) if ((a[cardKey(it)]?.count ?? 0) < it.count) throw new Error(`${userName(l.userId)} n’a plus ${cardName(it.cardId)}.`);
    for (const it of want) if ((b[cardKey(it)]?.count ?? 0) < it.count) throw new Error(`${userName(o.fromId)} n’a plus ${cardName(it.cardId)}.`);
    if (o.fromId === 'me') checkMine(want, o);
    const now = Date.now();
    give.forEach((it) => (remove(a, it), add(b, it.cardId, it.rarity, it.count)));
    want.forEach((it) => (remove(b, it), add(a, it.cardId, it.rarity, it.count)));
    o.status = 'accepted';
    o.resolvedAt = now;
    l.status = 'closed';
    l.resolvedAt = now;
    closeOffersOf(l, now, o.id);
    save.trades.push({ id: `t${save.seq++}`, fromId: l.userId, toId: o.fromId, fromName: userName(l.userId), toName: userName(o.fromId), offered: give, requested: want, note: 'Tableau d’offres', createdAt: o.createdAt, status: 'accepted', resolvedAt: now });
    save.trades_done = (save.trades_done ?? 0) + 1;
    eco.hooks.onTrade();
    bump({ type: 'trade' });
    const other = l.userId === 'me' ? o.fromId : l.userId;
    feed('trade', `Échange conclu avec ${userName(other)} sur le tableau d’offres !`);
  }
  /** un robot compose une offre d'environ `target` en valeur avec ses cartes (de préférence celles qui me manquent) */
  function botCards(bot: Bot, target: number): TradeItem[] {
    const pool = Object.values(bot.inv)
      .filter((c) => c.rarity !== 'secret')
      .sort((x, y) => Number(!!save.inv[cardKey(x)]) - Number(!!save.inv[cardKey(y)]) || Math.random() - 0.5);
    const out: TradeItem[] = [];
    let v = 0;
    for (const c of [...pool].sort((x, y) => cardsValue([{ rarity: y.rarity, count: 1 }]) - cardsValue([{ rarity: x.rarity, count: 1 }]))) {
      const cv = cardsValue([{ rarity: c.rarity, count: 1 }]);
      if (v + cv > target * 1.2 || out.length >= 4) continue;
      out.push({ cardId: c.cardId, rarity: c.rarity, count: 1 });
      v += cv;
      if (v >= target * 0.85) break;
    }
    return out;
  }
  function botOfferOn(l: DemoListing) {
    if (!listingLive(l)) return;
    const busy = new Set(O().filter((o) => o.listingId === l.id && ACTIVE_OFFER(o)).map((o) => o.fromId));
    const free = save.bots.filter((b) => !busy.has(b.id));
    const bot = free[Math.floor(Math.random() * free.length)];
    if (!bot) return;
    const offered = botCards(bot, cardsValue(l.items) * (0.6 + Math.random() * 0.7));
    if (!offered.length) return;
    const notes = ['ça te va ?', 'je peux monter un peu', 'échange rapide ?', undefined];
    O().push({ id: `lo${save.seq++}`, listingId: l.id, listingUserId: l.userId, fromId: bot.id, fromName: bot.name, offered, note: notes[Math.floor(Math.random() * notes.length)], status: 'pending', createdAt: Date.now() });
    sync();
  }
  function botPostListing(at = Date.now()) {
    const open = L().filter((l) => l.userId !== 'me' && listingLive(l));
    if (open.length >= 4) return;
    const bot = save.bots[Math.floor(Math.random() * save.bots.length)];
    // ses doublons d'abord (un robot a ~150 cartes pour des milliers au catalogue : peu de doublons)
    const dups = Object.values(bot.inv).filter((c) => c.rarity !== 'secret').sort((a, b) => Number(b.count >= 2) - Number(a.count >= 2) || Math.random() - 0.5);
    if (!dups.length) return;
    const items = dups.slice(0, 1 + Math.floor(Math.random() * 2)).map((c) => ({ cardId: c.cardId, rarity: c.rarity, count: 1 }));
    // il cherche des cartes que tu as en double (ou n'importe lesquelles qui lui manquent)
    const mineDups = Object.values(save.inv).filter((c) => !bot.inv[cardKey(c)] && c.rarity !== 'secret');
    const wanted = mineDups.sort((a, b) => Number(b.count >= 2) - Number(a.count >= 2) || Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3)).map((c) => ({ cardId: c.cardId, rarity: c.rarity }));
    const hours = BOARD_HOURS[Math.floor(Math.random() * BOARD_HOURS.length)];
    const notes = ['doublons à échanger', 'je complète mon classeur', 'faites vos offres !', undefined];
    L().push({ id: `ls${save.seq++}`, userId: bot.id, userName: bot.name, items, wanted, note: notes[Math.floor(Math.random() * notes.length)], status: 'open', createdAt: at, expiresAt: at + hours * 3600_000 });
  }
  if (!L().some((l) => l.userId !== 'me')) {
    const now = Date.now();
    for (let i = 0; i < 3; i++) botPostListing(now - (i * 47 + 12) * 60_000);
  }
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (Math.random() < 0.3) botPostListing();
    // de temps en temps, un robot de plus s'intéresse à une de mes annonces
    const mine = L().filter((l) => l.userId === 'me' && listingLive(l));
    if (mine.length && Math.random() < 0.25) botOfferOn(mine[Math.floor(Math.random() * mine.length)]);
    sync();
  }, 90_000);

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const bump = (ev: MissionEvent) => {
    const { state: m, changed } = applyMissionEvent(currentMissions(save.missions, 'me', Date.now()), ev);
    if (changed) save.missions = m;
  };
  const grant = (n: number) => {
    const now = Date.now();
    const r = applyRegen(save.packBalance, save.regenAt ?? now, now);
    save.packBalance = r.balance + n;
    save.regenAt = r.regenAt;
  };
  // ── gros tirages du mode démo : les robots ouvrent aussi des boosters (une belle carte de temps en temps)
  const bigPull = (who: { id: string; name: string }, card: { id: string; name: string }, r: RarityId, mint: number, at = Date.now()) => {
    (save.bigPulls ??= []).unshift({ id: `bp${save.seq++}`, userId: who.id, userName: who.name, cardId: card.id, cardName: card.name, rarity: r, mintNumber: mint, createdAt: at, mine: who.id === 'me' });
    save.bigPulls.sort((a, b) => b.createdAt - a.createdAt);
    save.bigPulls.length = Math.min(save.bigPulls.length, 40);
  };
  /** une belle carte (Légendaire ou Mythique) comme un robot pourrait la tirer */
  const botLuck = () => {
    for (let i = 0; i < 400; i++) {
      const hit = rollPack({ kind: 'bebou' }).find((c) => c.rarity === 'legendary' || c.rarity === 'mythic');
      if (hit) return hit;
    }
    return null;
  };
  if (!save.bigPulls?.length) {
    // première visite : quelques tirages des dernières heures, pour que la vitrine ne soit pas vide
    const now = Date.now();
    for (let i = 0; i < 9; i++) {
      const hit = botLuck();
      const bot = save.bots[i % save.bots.length];
      if (hit) bigPull(bot, hit.card, hit.rarity as RarityId, 2 + Math.floor(Math.random() * 40), now - (i * 17 + Math.random() * 15) * 60_000);
    }
  }
  setInterval(() => {
    if (document.visibilityState !== 'visible' || Math.random() > 0.35) return;
    const hit = botLuck();
    if (!hit) return;
    bigPull(save.bots[Math.floor(Math.random() * save.bots.length)], hit.card, hit.rarity as RarityId, 2 + Math.floor(Math.random() * 60));
    sync();
  }, 75_000);
  // changement de jour pendant que la page est ouverte : nouvelles missions
  setInterval(() => {
    if (state.missions && Date.now() >= state.missions.resetAt) sync();
  }, 30_000);
  sync();

  // ── économie + espace Jeux (démo) : pièces, calendrier, brûlage, complétions, succès, jeux contre les robots
  const eco = createLocalEco({
    data: () => save.eco,
    setData: (x) => (save.eco = x),
    owned: (cardId, r) => {
      const have = save.inv[cardKey({ cardId, rarity: r })]?.count ?? 0;
      return { have, free: Math.max(0, have - (lockedCards(state).get(cardKey({ cardId, rarity: r })) ?? 0)) };
    },
    addCard: (owner, cardId, r, n, mint) => {
      if (owner === 'me') add(save.inv, cardId, r, n, mint);
      else {
        const bot = save.bots.find((b) => b.id === owner);
        if (bot) add(bot.inv, cardId, r, n, mint);
      }
    },
    removeCard: (cardId, r, n) => remove(save.inv, { cardId, rarity: r, count: n }),
    packsAvailable: () => applyRegen(save.packBalance, save.regenAt ?? Date.now(), Date.now()).balance,
    debitPacks: (n) => {
      const now = Date.now();
      const rg = applyRegen(save.packBalance, save.regenAt ?? now, now);
      save.packBalance = rg.balance - n;
      save.regenAt = rg.regenAt;
    },
    grantPacks: (n) => grant(n),
    roll: (choice, who) => {
      const mine = who === 'me';
      const req: PackRequest = { kind: choice.kind, themeId: choice.themeId, ...(mine ? { forceMythic: pityForces(save.pity ?? 0) } : {}) };
      const cards = rollPack(req).map(({ card, rarity }) => {
        const k = cardKey({ cardId: card.id, rarity });
        const mint = (save.mints[k] = (save.mints[k] ?? 0) + 1);
        return { cardId: card.id, cardName: card.name, rarity: rarity as RarityId, mintNumber: mint, foilSeed: 1 };
      });
      if (mine) {
        save.pity = pityAfter(save.pity ?? 0, cards.map((c) => c.rarity));
        save.opened++;
      }
      return cards;
    },
    stats: myStats,
    ownedIds: () => Object.values(save.inv).map((c) => c.cardId),
    streak: () => save.streak,
    setStreak: (st) => (save.streak = st),
    bots: () => save.bots.map((b) => ({ id: b.id, name: b.name })),
    feed: (message) => feed('game', message),
    changed: () => sync(),
  });

  /** Scelle un booster (débite la réserve, tire les cartes, n° d'impression, pity) — préparation simple ou en série. */
  function rollSealed(req: PackRequest): SealedPack {
    const now = Date.now();
    const regen = applyRegen(save.packBalance, save.regenAt ?? now, now);
    if (regen.balance <= 0) throw new Error(`Plus de boosters ! Le prochain arrive dans ${fmtCountdown((regen.nextAt ?? now) - now)}.`);
    save.packBalance = regen.balance - 1;
    save.regenAt = regen.regenAt;
    let rand: () => number = Math.random;
    req = { ...req, forceMythic: pityForces(save.pity ?? 0) };
    if (forceSecret && req.kind === 'bebou') {
      forceSecret = false;
      let first = true;
      rand = () => (first ? ((first = false), 0) : Math.random());
    }
    const seen = new Set<string>();
    const rolled = rollPackEx(forceGod ? { ...req, forceGod: true } : req, rand);
    forceGod = false;
    const cards = rolled.slots.map(({ card, rarity }) => {
      const k = cardKey({ cardId: card.id, rarity });
      const mint = (save.mints[k] = (save.mints[k] ?? 0) + 1);
      const isNew = !save.inv[k] && !seen.has(k);
      seen.add(k);
      return { cardId: card.id, cardName: card.name, rarity: rarity as RarityId, mintNumber: mint, isNew, themeId: card.themeId };
    });
    if (forceWild > 0) {
      const pool = POKEMON_151.filter((e) => e.rarity === 'mythic');
      for (let k = 0; k < forceWild; k++) {
        const e = pool[Math.floor(Math.random() * pool.length)];
        const id = pokemonCardId(e);
        const ce = catalogEntry(id);
        if (!ce) continue;
        cards[cards.length - 1 - k] = { cardId: id, cardName: e.name, rarity: 'mythic', mintNumber: 1, isNew: true, themeId: ce.themeId };
      }
      forceWild = 0;
    }
    const forced = forceCard ? catalogEntry(forceCard) : null;
    if (forced && cards.length && cards.some((c) => c.themeId === forced.themeId)) {
      forceCard = null;
      cards[Math.min(2, cards.length - 1)] = { cardId: forced.id, cardName: forced.name, rarity: 'mythic', mintNumber: 1, isNew: true, themeId: forced.themeId };
    }
    const maxRarity = cards.reduce<RarityId>((m, c) => (RANK[c.rarity] > RANK[m] ? c.rarity : m), 'common');
    save.pity = pityAfter(save.pity ?? 0, cards.map((c) => c.rarity));
    return { id: `p${save.seq++}`, packKind: req.kind, themeId: req.themeId, maxRarity, cards, ...(rolled.god ? { god: true } : {}) };
  }

  return {
    state,
    eco: eco.backend,
    onChange(fn) {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
    login() {
      /* rien à faire en démo */
    },
    async logout() {
      save = freshSave();
      for (const k of ['avatar', 'banner'])
        try {
          localStorage.removeItem(`${DEMO_MEDIA_LS}.${k}`);
        } catch {
          /* stockage bloqué */
        }
      sync();
    },
    async preparePack(req: PackRequest) {
      await delay(120); // latence réseau simulée
      if (save.sealed) return save.sealed;
      save.sealed = rollSealed(req);
      sync();
      return save.sealed;
    },
    // série (retours de Tom, 4 nov.) : toute la série scellée d'un coup ; les suivants attendent dans `save.queue`
    async preparePacks(req: PackRequest, count: number) {
      await delay(120);
      const out: SealedPack[] = [];
      if (!save.sealed) save.sealed = rollSealed(req);
      out.push(save.sealed, ...(save.queue ?? []));
      save.queue ??= [];
      while (out.length < Math.max(1, Math.min(10, count))) {
        try {
          const p = rollSealed(req);
          save.queue.push(p);
          out.push(p);
        } catch (e) {
          if (!out.length) throw e;
          break;
        }
      }
      sync();
      return out.slice(0, Math.max(1, count));
    },
    async revealPacks(ids: string[]) {
      for (const id of ids) await this.revealPack(id);
      return ids;
    },
    async revealPack(id) {
      // série : le booster demandé peut attendre dans la file (« Tout passer ») → il passe devant
      const qi = save.queue?.findIndex((q) => q.id === id) ?? -1;
      if (qi >= 0 && save.sealed?.id !== id) {
        const [q] = save.queue!.splice(qi, 1);
        if (save.sealed) save.queue!.unshift(save.sealed);
        save.sealed = q;
      }
      const p = save.sealed;
      if (!p || p.id !== id) return;
      for (const c of p.cards) {
        add(save.inv, c.cardId, c.rarity, 1, c.mintNumber);
        if (BIG_PULL_RARITIES.includes(c.rarity)) bigPull({ id: 'me', name: 'Toi' }, { id: c.cardId, name: c.cardName }, c.rarity, c.mintNumber);
        if (RANK[c.rarity] >= RANK.epic) {
          feed(
            c.rarity === 'secret' ? 'secret_pull' : c.rarity === 'mythic' ? 'mythic_pull' : 'pull',
            c.rarity === 'secret' ? `✷ Tu as tiré une CARTE SECRÈTE : ${c.cardName} !` : `Tu as obtenu ${c.cardName} [${rarityOf(c.rarity).label} #${c.mintNumber}] !`,
            c.rarity,
            { id: c.cardId, name: c.cardName, mint: c.mintNumber },
          );
        }
      }
      save.opened++;
      // série : le booster scellé suivant prend la place
      save.sealed = save.queue?.shift() ?? null;
      bump({ type: 'pack', packKey: p.packKind === 'theme' && p.themeId ? p.themeId : 'bebou', cards: p.cards });
      eco.hooks.onPack(p.packKind, p.packKind === 'theme' && p.themeId ? themeById(p.themeId)?.label ?? 'booster' : BEBOU_PACK.label, p.cards);
      maybeBotOffer();
      sync();
    },
    async friendCollection(friendId) {
      await delay(80);
      return Object.values(save.bots.find((b) => b.id === friendId)?.inv ?? {});
    },
    async cardOwners(cardId) {
      await delay(80);
      return save.bots
        .flatMap((b, i) =>
          Object.values(b.inv)
            .filter((c) => c.cardId === cardId && c.count > 0)
            .map((c) => ({ id: b.id, name: b.name, online: i !== 2, rarity: c.rarity, count: c.count, free: c.count })),
        )
        .sort((a, b) => b.count - a.count);
    },
    async proposeTrade(toId, offered, requested, note) {
      const bot = save.bots.find((b) => b.id === toId);
      if (!bot) throw new Error('Joueur introuvable.');
      if (!offered.length && !requested.length) throw new Error('Échange vide.');
      const locked = lockedCards(state);
      for (const it of offered) {
        if ((save.inv[cardKey(it)]?.count ?? 0) < it.count) throw new Error(`Tu n’as pas assez de ${catalogEntry(it.cardId)?.name ?? it.cardId}.`);
        if ((save.inv[cardKey(it)]?.count ?? 0) - (locked.get(cardKey(it)) ?? 0) < it.count) throw new Error(`${catalogEntry(it.cardId)?.name ?? it.cardId} est déjà engagée dans un autre échange en attente.`);
      }
      for (const it of requested) if ((bot.inv[cardKey(it)]?.count ?? 0) < it.count) throw new Error(`${bot.name} n’a pas ${catalogEntry(it.cardId)?.name ?? it.cardId}.`);
      const t = { id: `t${save.seq++}`, fromId: 'me', toId, fromName: 'Toi', toName: bot.name, offered, requested, note, createdAt: Date.now(), status: 'pending' as const };
      save.trades.push(t);
      bump({ type: 'trade' });
      sync();
      // le robot répond au bout de 2 s : il accepte si l'échange est à peu près équilibré en étoiles
      setTimeout(() => {
        const cur = save.trades.find((x) => x.id === t.id);
        if (!cur || cur.status !== 'pending') return;
        const value = (l: TradeItem[]) => cardsValue(l); // même table que la jauge des échanges (1★ 5 … 6★ 1 000)
        const fair = value(offered) >= value(requested) * 0.8;
        cur.resolvedAt = Date.now();
        if (fair && offered.every((it) => (save.inv[cardKey(it)]?.count ?? 0) >= it.count) && requested.every((it) => (bot.inv[cardKey(it)]?.count ?? 0) >= it.count)) {
          cur.status = 'accepted';
          offered.forEach((it) => (remove(save.inv, it), add(bot.inv, it.cardId, it.rarity, it.count)));
          requested.forEach((it) => (remove(bot.inv, it), add(save.inv, it.cardId, it.rarity, it.count)));
          save.trades_done = (save.trades_done ?? 0) + 1;
          eco.hooks.onTrade();
          feed('trade', `${bot.name} a accepté ton échange !`);
        } else {
          cur.status = 'declined';
          feed('trade', `${bot.name} a refusé ton échange (pas assez équilibré).`);
        }
        sync();
      }, 2000);
    },
    async respondTrade(id, accept) {
      const t = save.trades.find((x) => x.id === id && x.status === 'pending');
      if (!t) throw new Error('Échange introuvable ou déjà traité.');
      const bot = save.bots.find((b) => b.id === t.fromId)!;
      if (accept) {
        if (!t.requested.every((it) => (save.inv[cardKey(it)]?.count ?? 0) >= it.count)) throw new Error('Tu n’as plus les cartes demandées.');
        if (!t.offered.every((it) => (bot.inv[cardKey(it)]?.count ?? 0) >= it.count)) throw new Error(`${bot.name} n’a plus les cartes proposées.`);
        t.offered.forEach((it) => (remove(bot.inv, it), add(save.inv, it.cardId, it.rarity, it.count)));
        t.requested.forEach((it) => (remove(save.inv, it), add(bot.inv, it.cardId, it.rarity, it.count)));
        save.trades_done = (save.trades_done ?? 0) + 1;
          eco.hooks.onTrade();
        feed('trade', `Échange conclu avec ${bot.name} !`);
        bump({ type: 'trade' });
      }
      t.status = accept ? 'accepted' : 'declined';
      t.resolvedAt = Date.now();
      sync();
    },
    async cancelTrade(id) {
      const t = save.trades.find((x) => x.id === id && x.status === 'pending' && x.fromId === 'me');
      if (t) ((t.status = 'cancelled'), (t.resolvedAt = Date.now()));
      sync();
    },
    async counterTrade(id, offered, requested, note) {
      const t = save.trades.find((x) => x.id === id && x.status === 'pending' && x.toId === 'me');
      if (!t) throw new Error('Échange introuvable ou déjà traité.');
      const bot = save.bots.find((b) => b.id === t.fromId)!;
      if (!offered.length && !requested.length) throw new Error('Échange vide.');
      const locked = lockedCards(state);
      for (const it of offered) if ((save.inv[cardKey(it)]?.count ?? 0) - (locked.get(cardKey(it)) ?? 0) < it.count) throw new Error(`Tu n’as pas (ou plus) ${catalogEntry(it.cardId)?.name ?? it.cardId} de libre.`);
      for (const it of requested) if ((bot.inv[cardKey(it)]?.count ?? 0) < it.count) throw new Error(`${bot.name} n’a pas ${catalogEntry(it.cardId)?.name ?? it.cardId}.`);
      t.status = 'countered';
      t.resolvedAt = Date.now();
      const nt = { id: `t${save.seq++}`, fromId: 'me', toId: bot.id, fromName: 'Toi', toName: bot.name, offered, requested, note, createdAt: Date.now(), status: 'pending' as const, counterOf: t.id };
      save.trades.push(nt);
      bump({ type: 'trade' });
      sync();
      // le robot répond à la contre-proposition comme à une proposition
      setTimeout(() => {
        const cur = save.trades.find((x) => x.id === nt.id);
        if (!cur || cur.status !== 'pending') return;
        const value = (l: TradeItem[]) => cardsValue(l); // même table que la jauge des échanges (1★ 5 … 6★ 1 000)
        const fair = value(offered) >= value(requested) * 0.8;
        cur.resolvedAt = Date.now();
        if (fair && offered.every((it) => (save.inv[cardKey(it)]?.count ?? 0) >= it.count) && requested.every((it) => (bot.inv[cardKey(it)]?.count ?? 0) >= it.count)) {
          cur.status = 'accepted';
          offered.forEach((it) => (remove(save.inv, it), add(bot.inv, it.cardId, it.rarity, it.count)));
          requested.forEach((it) => (remove(bot.inv, it), add(save.inv, it.cardId, it.rarity, it.count)));
          save.trades_done = (save.trades_done ?? 0) + 1;
          eco.hooks.onTrade();
          feed('trade', `${bot.name} a accepté ta contre-proposition !`);
        } else {
          cur.status = 'declined';
          feed('trade', `${bot.name} a refusé ta contre-proposition.`);
        }
        sync();
      }, 2500);
    },
    async tradeHistory() {
      return save.trades
        .filter((t) => t.status !== 'pending' && t.status !== 'done')
        .map((t): TradeHistoryItem => ({ ...t, status: t.status as TradeHistoryItem['status'], resolvedAt: t.resolvedAt ?? t.createdAt }))
        .sort((a, b) => b.resolvedAt - a.resolvedAt)
        .slice(0, 30);
    },
    async friendWishlist(friendId) {
      // un robot « cherche » quelques-unes de mes cartes qu'il n'a pas (stable d'une visite à l'autre)
      const bot = save.bots.find((b) => b.id === friendId);
      if (!bot) return [];
      save.botWish ??= {};
      if (!save.botWish[friendId]) {
        const r = rng(4242 + friendId.length * 7 + Number(friendId.slice(-1)));
        save.botWish[friendId] = Object.values(save.inv).filter((c) => !bot.inv[cardKey(c)] && r() < 0.35).slice(0, 12).map((c) => c.cardId);
        persist();
      }
      return save.botWish[friendId];
    },
    async claimMission(id) {
      const r = claimMission(currentMissions(save.missions, 'me', Date.now()), id);
      if (typeof r === 'string') throw new Error(r);
      save.missions = r.state;
      grant(r.reward);
      eco.hooks.onMission(r.state.list.find((m) => m.id === id)!);
      sync();
      return r.reward;
    },
    async claimMissionBonus() {
      const r = claimMissionBonus(currentMissions(save.missions, 'me', Date.now()));
      if (typeof r === 'string') throw new Error(r);
      save.missions = r.state;
      grant(r.reward);
      sync();
      return r.reward;
    },
    async rerollMission(id) {
      const r = rerollMission(currentMissions(save.missions, 'me', Date.now()), id, 'me');
      if (typeof r === 'string') throw new Error(r);
      save.missions = r;
      sync();
    },
    async profile(userId) {
      await delay(60);
      const themesOf = (inv: Inv) => {
        const ids = new Set(Object.values(inv).map((c) => c.cardId));
        return GAME_THEMES.map((t) => ({ id: t.id, have: t.cards.reduce((a, c) => a + (ids.has(c.id) ? 1 : 0), 0), total: t.cards.length }));
      };
      if (userId === 'me') {
        const st = myStats();
        const top = bestCard(Object.values(save.inv));
        return { id: 'me', name: 'Toi', ...demoMedia(), bio: save.bio, showcase: save.showcase ?? [], packsOpened: save.opened, pinnedBinder: (save.binders ?? []).find((b) => b.pinned) ?? null, cosmetics: cleanCosmetics(save.cosmetics ?? {}, st), stats: st, streakDay: streakDay(save.streak), bestDrop: top ? { cardId: top.cardId, rarity: top.rarity, mintNumber: top.bestMintNumber } : null, themes: themesOf(save.inv), achievements: { done: doneCount(st, myEcon()), total: ACHIEVEMENTS.length } };
      }
      const i = save.bots.findIndex((b) => b.id === userId);
      if (i < 0) return null;
      const b = save.bots[i];
      const st = botStats(b, i);
      const top = bestCard(Object.values(b.inv));
      const cos: CosmeticChoice[] = [{ banner: 'night', frame: 'bronze', title: 'opener', badges: ['first', 'trade'] }, { banner: 'forest', frame: 'none', title: 'rookie', badges: ['first'] }, { banner: 'plum', frame: 'none', badges: [] }];
      return { id: userId, name: b.name, bio: ['Je collectionne les brillantes ✨', 'Toujours partant pour un échange', ''][i] || undefined, showcase: [], packsOpened: 30 + i * 12, cosmetics: cleanCosmetics(cos[i] ?? {}, st), stats: st, streakDay: ((st.streak - 1) % 7) + 1, bestDrop: top ? { cardId: top.cardId, rarity: top.rarity, mintNumber: top.bestMintNumber } : null, themes: themesOf(b.inv), achievements: { done: doneCount(st, emptyEcon()), total: ACHIEVEMENTS.length } };
    },
    async setShowcase(cards) {
      if (cards.length > 12) throw new Error('12 cartes au maximum dans la vitrine.');
      for (const c of cards) if (!save.inv[cardKey(c)]) throw new Error(`Tu n’as pas ${catalogEntry(c.cardId)?.name ?? 'cette carte'}.`);
      save.showcase = cards;
      sync();
    },
    async setBio(bio) {
      save.bio = bio.replace(/\s+/g, ' ').trim().slice(0, 80) || undefined;
      sync();
    },
    async setCosmetics(choice) {
      save.cosmetics = cleanCosmetics(choice, myStats());
      sync();
      return save.cosmetics;
    },
    // photo / bannière importées (retours live 02) : data URL dans une clé à part du localStorage (pas dans la sauvegarde
    // écrite à chaque action), limite plus basse qu'en ligne ; stockage plein ou bloqué → refus clair
    async setProfileMedia(kind, file) {
      const key = `${DEMO_MEDIA_LS}.${kind}`;
      if (!file) {
        try {
          localStorage.removeItem(key);
        } catch {
          /* stockage bloqué */
        }
        return undefined;
      }
      const bad = profileMediaProblem(file.size, file.type, PROFILE_MEDIA_DEMO_MAX);
      if (bad) throw new Error(`${bad}${file.size > PROFILE_MEDIA_DEMO_MAX ? ' (démo ; 2 Mo en ligne)' : ''}`);
      const url = await new Promise<string>((ok, ko) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => ko(new Error('Lecture du fichier impossible.'));
        r.readAsDataURL(file);
      });
      try {
        localStorage.setItem(key, url);
      } catch {
        throw new Error('Plus de place dans ce navigateur pour ce fichier (démo) : essaie une image plus légère.');
      }
      return url;
    },
    async leaderboard() {
      const row = (id: string, name: string, st: ReturnType<typeof myStats>, cosmetics: CosmeticChoice) => ({ id, name, cosmetics: cleanCosmetics(cosmetics, st), uniques: st.uniques, total: st.total, pct: st.total ? (st.uniques / st.total) * 100 : 0, mythics: st.mythics, secrets: st.secrets, packsOpened: st.packsOpened, tradesDone: st.tradesDone, streak: st.streak, achievements: doneCount(st, id === 'me' ? myEcon() : emptyEcon()) });
      return [row('me', 'Toi', myStats(), save.cosmetics ?? {}), ...save.bots.map((b, i) => row(b.id, b.name, botStats(b, i), {}))];
    },
    async activity(userId) {
      if (userId === 'me') return (save.activity ?? []).slice(0, 40);
      const b = save.bots.find((x) => x.id === userId);
      if (!b) return [];
      // les robots : leurs gros tirages de la vitrine
      return (save.bigPulls ?? []).filter((p) => p.userId === userId).map((p) => ({ id: p.id, kind: p.rarity === 'secret' ? 'secret_pull' : p.rarity === 'mythic' ? 'mythic_pull' : 'pull', message: `${p.userName} a obtenu ${p.cardName} [${rarityOf(p.rarity).label} #${p.mintNumber ?? 1}] !`, cardId: p.cardId, cardName: p.cardName, rarity: p.rarity, mintNumber: p.mintNumber, createdAt: p.createdAt }));
    },
    // démo : les suggestions restent dans ce navigateur (le joueur de démo est aussi l'admin)
    async submitSuggestion(o, file) {
      const now = Date.now();
      (save.suggestions ??= []).unshift({
        id: `s${now}`, kind: o.kind, text: o.text.trim(), cardId: o.cardId, imageUrl: o.imageUrl, category: o.category, page: o.page,
        screenshotUrl: file ? URL.createObjectURL(file) : undefined, status: 'nouvelle', author: 'Toi (démo)', createdAt: now, updatedAt: now,
      });
      persist();
    },
    async mySuggestions() {
      return [...(save.suggestions ?? [])];
    },
    async adminSuggestions(status) {
      const all = save.suggestions ?? [];
      const counts = { nouvelle: 0, vue: 0, acceptee: 0, refusee: 0, traitee: 0 };
      for (const x of all) counts[x.status]++;
      return { items: all.filter((x) => !status || x.status === status), counts };
    },
    async setSuggestionStatus(id, status, note) {
      const x = save.suggestions?.find((y) => y.id === id);
      if (x) Object.assign(x, { status, updatedAt: Date.now(), ...(note !== undefined ? { adminNote: note || undefined } : {}) });
      persist();
    },
    // démo : le sondage reste dans ce navigateur (le joueur de démo voit aussi les résultats)
    async surveyAnswered(id) {
      return !!save.surveys?.[id];
    },
    async submitSurvey(id, answer) {
      const a = cleanSurvey(answer);
      if (!surveyFilled(a)) throw new Error('Coche au moins une réponse.');
      (save.surveys ??= {})[id] ??= { ...a, createdAt: Date.now() };
      persist();
    },
    async surveyResults(id) {
      const a = save.surveys?.[id];
      const universes = Object.fromEntries(SURVEY_UNIVERSES.map((o) => [o.id, a?.universes.includes(o.id) ? 1 : 0]));
      const features = Object.fromEntries(SURVEY_FEATURES.map((o) => [o.id, a?.features.includes(o.id) ? 1 : 0]));
      const ratings = [1, 2, 3, 4, 5].map((n) => (a?.rating === n ? 1 : 0));
      return { surveyId: id, total: a ? 1 : 0, universes, features, ratings, texts: a && (a.names || a.comment) ? [{ author: 'Toi (démo)', names: a.names, comment: a.comment, rating: a.rating, createdAt: a.createdAt }] : [] };
    },
    async toggleWish(cardId) {
      const list = save.wishlist ?? [];
      save.wishlist = list.includes(cardId) ? list.filter((id) => id !== cardId) : [...list, cardId];
      sync();
    },
    async claimStreak() {
      const r = claimStreakState(save.streak);
      if (typeof r === 'string') throw new Error(r);
      save.streak = r;
      grant(STREAK_REWARD);
      sync();
      return STREAK_REWARD;
    },
    async setSubthemeCover(subthemeId, cardId) {
      const covers = { ...(save.covers ?? {}) };
      if (cardId) {
        const e = catalogEntry(cardId);
        if (!e || !save.inv[cardKey({ cardId, rarity: e.rarity as RarityId })]) throw new Error(`Tu n’as pas ${e?.name ?? 'cette carte'}.`);
        covers[subthemeId] = cardId;
      } else delete covers[subthemeId];
      save.covers = covers;
      sync();
    },
    async createBinder(name, cards) {
      const n = name.replace(/\s+/g, ' ').trim().slice(0, BINDER_NAME_MAX);
      if (!n) throw new Error('Donne un nom à ton classeur.');
      if ((save.binders ?? []).length >= BINDER_MAX) throw new Error(`${BINDER_MAX} classeurs au maximum.`);
      if ((cards ?? []).length > BINDER_CARDS_MAX) throw new Error(`${BINDER_CARDS_MAX} cartes au maximum par classeur.`);
      const b: Binder = { id: `b${save.seq++}`, name: n, cards: cards ?? [], pinned: false, createdAt: Date.now() };
      (save.binders ??= []).push(b);
      sync();
      return b.id;
    },
    async renameBinder(id, name) {
      const b = (save.binders ?? []).find((x) => x.id === id);
      if (!b) throw new Error('Classeur introuvable.');
      b.name = name.replace(/\s+/g, ' ').trim().slice(0, BINDER_NAME_MAX) || b.name;
      sync();
    },
    async deleteBinder(id) {
      save.binders = (save.binders ?? []).filter((x) => x.id !== id);
      sync();
    },
    async setBinderCards(id, cards) {
      const b = (save.binders ?? []).find((x) => x.id === id);
      if (!b) throw new Error('Classeur introuvable.');
      if (cards.length > BINDER_CARDS_MAX) throw new Error(`${BINDER_CARDS_MAX} cartes au maximum par classeur.`);
      for (const c of cards) if (!save.inv[cardKey(c)]) throw new Error(`Tu n’as pas ${catalogEntry(c.cardId)?.name ?? 'cette carte'}.`);
      b.cards = cards;
      if (b.coverCardId && !cards.some((c) => c.cardId === b.coverCardId)) b.coverCardId = undefined;
      sync();
    },
    async toggleBinderCard(id, card) {
      const b = (save.binders ?? []).find((x) => x.id === id);
      if (!b) throw new Error('Classeur introuvable.');
      const k = cardKey(card);
      const has = b.cards.some((c) => cardKey(c) === k);
      if (has) b.cards = b.cards.filter((c) => cardKey(c) !== k);
      else {
        if (!save.inv[k]) throw new Error(`Tu n’as pas ${catalogEntry(card.cardId)?.name ?? 'cette carte'}.`);
        if (b.cards.length >= BINDER_CARDS_MAX) throw new Error(`${BINDER_CARDS_MAX} cartes au maximum par classeur.`);
        b.cards = [...b.cards, card];
      }
      if (b.coverCardId && !b.cards.some((c) => c.cardId === b.coverCardId)) b.coverCardId = undefined;
      sync();
      return !has;
    },
    async setBinderCover(id, cardId) {
      const b = (save.binders ?? []).find((x) => x.id === id);
      if (!b) throw new Error('Classeur introuvable.');
      b.coverCardId = cardId;
      sync();
    },
    async pinBinder(id, on) {
      for (const b of save.binders ?? []) b.pinned = b.id === id ? on : false;
      sync();
    },
    // ── amis (lot A2) : mêmes règles que le serveur (convex/friends.ts) ; les robots acceptent au bout de ~3 s
    // parrainage (démo) : un lien de démonstration, deux filleuls robots
    async referral() {
      await delay(80);
      const bots = save.bots.slice(0, 2);
      return { code: 'demo1234', clicks: 5, referrals: bots.map((b, i) => ({ userId: b.id, name: b.name, packsOpened: i ? 4 : 12, paid: !i, at: Date.now() - (i + 1) * 86_400_000 })) };
    },
    async referralClick() {},
    async referralClaim() {
      return { status: 'invalid' as const };
    },
    async requestFriend(to) {
      await delay(120);
      let bot: Bot | undefined;
      if (to.userId) {
        if (to.userId === 'me') throw new Error('C’est toi ! Choisis quelqu’un d’autre.');
        bot = save.bots.find((b) => b.id === to.userId);
        if (!bot) throw new Error('Joueur introuvable.');
      } else {
        const want = foldName(to.name ?? '');
        if (!want) throw new Error('Écris le pseudo exact de ton ami.');
        if (want === 'toi') throw new Error('C’est toi ! Choisis quelqu’un d’autre.');
        // « Léa » ou « Léa (robot) »
        bot = save.bots.find((b) => foldName(b.name) === want || foldName(b.name.replace(/\s*\(robot\)$/, '')) === want);
        if (!bot) throw new Error(`Personne ne s’appelle « ${(to.name ?? '').trim()} » ici. En démo : Léa, Malo ou Inès.`);
      }
      const now = Date.now();
      const links = (save.friendships ??= []);
      const link = links.find((l) => (l.from === 'me' && l.to === bot!.id) || (l.from === bot!.id && l.to === 'me'));
      if (link?.status === 'accepted') throw new Error(`${bot.name} est déjà ton ami.`);
      if (link?.status === 'pending') {
        if (link.from === 'me') throw new Error(`Demande déjà envoyée à ${bot.name}.`);
        link.status = 'accepted';
        link.respondedAt = now;
        sync();
        return { status: 'accepted', name: bot.name };
      }
      if (link?.status === 'declined' && link.from === 'me' && now - (link.respondedAt ?? link.createdAt) < DEMO_DECLINE_COOLDOWN) throw new Error(`${bot.name} a décliné ta demande il y a peu : réessaie demain.`);
      if (links.filter((l) => l.from === 'me' && l.status === 'pending').length >= DEMO_MAX_PENDING) throw new Error(`${DEMO_MAX_PENDING} demandes en attente au maximum : attends des réponses (ou annules-en).`);
      const id = link?.id ?? `fr${save.seq++}`;
      if (link) Object.assign(link, { from: 'me', to: bot.id, status: 'pending', createdAt: now, respondedAt: undefined });
      else links.push({ id, from: 'me', to: bot.id, status: 'pending', createdAt: now });
      sync();
      // le robot accepte au bout de ~3 s
      setTimeout(() => {
        const cur = (save.friendships ?? []).find((l) => l.id === id);
        if (!cur || cur.status !== 'pending' || cur.from !== 'me') return;
        cur.status = 'accepted';
        cur.respondedAt = Date.now();
        sync(); // (main.ts annonce « X a accepté ta demande d'ami »)
      }, 3000);
      return { status: 'pending', name: bot.name };
    },
    async acceptFriend(id) {
      const l = (save.friendships ?? []).find((x) => x.id === id && x.status === 'pending' && x.to === 'me');
      if (!l) throw new Error('Demande introuvable (déjà traitée ?).');
      l.status = 'accepted';
      l.respondedAt = Date.now();
      sync();
    },
    async declineFriend(id) {
      const l = (save.friendships ?? []).find((x) => x.id === id && x.status === 'pending' && x.to === 'me');
      if (!l) throw new Error('Demande introuvable (déjà traitée ?).');
      l.status = 'declined';
      l.respondedAt = Date.now();
      sync();
    },
    async cancelFriend(id) {
      const l = (save.friendships ?? []).find((x) => x.id === id && x.status === 'pending' && x.from === 'me');
      if (!l) throw new Error('Demande introuvable (déjà traitée ?).');
      save.friendships = (save.friendships ?? []).filter((x) => x !== l);
      sync();
    },
    async removeFriend(id) {
      const l = (save.friendships ?? []).find((x) => x.id === id && x.status === 'accepted');
      if (!l) throw new Error('Vous n’êtes pas (ou plus) amis.');
      save.friendships = (save.friendships ?? []).filter((x) => x !== l);
      sync();
    },
    // ── tableau d'offres (lot T) : mêmes règles que convex/listings.ts
    watchBoard(cb) {
      boardWatchers.add(cb);
      cb(boardOpen());
      return () => boardWatchers.delete(cb);
    },
    async createListing(items, wanted, note, hours) {
      await delay(120);
      if (!(BOARD_HOURS as readonly number[]).includes(hours)) throw new Error('Durée invalide (24 ou 48 h).');
      checkList(items, 'proposées');
      if (L().filter((l) => l.userId === 'me' && listingLive(l)).length >= BOARD_MAX_OPEN) throw new Error(`${BOARD_MAX_OPEN} annonces ouvertes au maximum : retires-en une d’abord.`);
      checkMine(items);
      const now = Date.now();
      const l: DemoListing = { id: `ls${save.seq++}`, userId: 'me', userName: 'Toi', items, wanted, note: note?.trim().slice(0, 140) || undefined, status: 'open', createdAt: now, expiresAt: now + hours * 3600_000 };
      L().push(l);
      sync();
      // les robots s'y intéressent (pas tous, pas tout de suite)
      setTimeout(() => botOfferOn(l), 2500 + Math.random() * 3000);
      if (Math.random() < 0.6) setTimeout(() => botOfferOn(l), 9000 + Math.random() * 5000);
    },
    async cancelListing(id) {
      const l = L().find((x) => x.id === id && x.userId === 'me' && x.status === 'open');
      if (!l) throw new Error('Annonce introuvable ou déjà terminée.');
      l.status = 'cancelled';
      l.resolvedAt = Date.now();
      closeOffersOf(l, l.resolvedAt);
      sync();
    },
    async makeOffer(listingId, offered, note) {
      await delay(120);
      const l = L().find((x) => x.id === listingId);
      if (!l || !listingLive(l)) throw new Error(l?.status === 'open' ? 'Cette annonce a expiré.' : 'Annonce introuvable ou déjà terminée.');
      if (l.userId === 'me') throw new Error('C’est ton annonce : tu ne peux pas y faire d’offre.');
      checkList(offered, 'offertes');
      const prev = O().find((o) => o.listingId === l.id && o.fromId === 'me' && ACTIVE_OFFER(o));
      checkMine(offered, prev);
      const now = Date.now();
      if (prev) ((prev.status = 'withdrawn'), (prev.resolvedAt = now));
      const o: DemoOffer = { id: `lo${save.seq++}`, listingId: l.id, listingUserId: l.userId, fromId: 'me', fromName: 'Toi', offered, note: note?.trim().slice(0, 140) || undefined, status: 'pending', createdAt: now };
      O().push(o);
      sync();
      // le robot répond : accepte dès 0,8× la valeur, sinon contre-offre (moins de cartes de son annonce), sinon refus
      setTimeout(() => {
        if (o.status !== 'pending' || !listingLive(l)) return;
        const mine = cardsValue(offered), theirs = cardsValue(l.items);
        try {
          if (mine >= theirs * 0.8) {
            boardConclude(l, o, l.items, offered);
            feed('trade', `${l.userName} a accepté ton offre !`);
          } else {
            const give: TradeItem[] = [];
            for (const it of [...l.items].sort((a, b) => cardsValue([a]) - cardsValue([b]))) if (cardsValue([...give, it]) <= mine * 1.25) give.push(it);
            if (give.length && give.length < l.items.length) {
              o.status = 'countered';
              o.counter = { give, want: offered, note: 'je te donne seulement ça pour ton offre', at: Date.now() };
            } else ((o.status = 'declined'), (o.resolvedAt = Date.now()), feed('trade', `${l.userName} a refusé ton offre (pas assez équilibrée).`));
          }
        } catch {
          ((o.status = 'declined'), (o.resolvedAt = Date.now()));
        }
        sync();
      }, 2500);
    },
    async withdrawOffer(id) {
      const o = O().find((x) => x.id === id && x.fromId === 'me' && ACTIVE_OFFER(x));
      if (!o) throw new Error('Offre introuvable ou déjà traitée.');
      ((o.status = 'withdrawn'), (o.resolvedAt = Date.now()));
      sync();
    },
    async acceptOffer(id) {
      await delay(120);
      const o = O().find((x) => x.id === id && x.listingUserId === 'me' && x.status === 'pending');
      if (!o) throw new Error('Offre introuvable ou déjà traitée.');
      const l = L().find((x) => x.id === o.listingId);
      if (!l || !listingLive(l)) throw new Error('Cette annonce a expiré.');
      boardConclude(l, o, l.items, o.offered);
      sync();
    },
    async declineOffer(id) {
      const o = O().find((x) => x.id === id && x.listingUserId === 'me' && ACTIVE_OFFER(x));
      if (!o) throw new Error('Offre introuvable ou déjà traitée.');
      ((o.status = 'declined'), (o.resolvedAt = Date.now()));
      sync();
    },
    async counterOffer(id, give, want, note) {
      await delay(120);
      const o = O().find((x) => x.id === id && x.listingUserId === 'me' && ACTIVE_OFFER(x));
      if (!o) throw new Error('Offre introuvable ou déjà traitée.');
      const l = L().find((x) => x.id === o.listingId);
      if (!l || !listingLive(l)) throw new Error('Cette annonce a expiré.');
      checkList(give, 'données');
      checkList(want, 'demandées', true);
      for (const it of give) if ((l.items.find((x) => cardKey(x) === cardKey(it))?.count ?? 0) < it.count) throw new Error(`${cardName(it.cardId)} ne fait pas partie de ton annonce : une contre-offre ne donne que des cartes de l’annonce.`);
      const inv = invOf(o.fromId) ?? {};
      for (const it of want) if ((inv[cardKey(it)]?.count ?? 0) < it.count) throw new Error(`${o.fromName} n’a pas (ou plus) ${cardName(it.cardId)}.`);
      o.status = 'countered';
      o.counter = { give, want, note: note?.trim().slice(0, 140) || undefined, at: Date.now() };
      sync();
      // le robot accepte la contre-offre si elle reste à peu près équilibrée pour lui
      setTimeout(() => {
        if (o.status !== 'countered' || !listingLive(l)) return;
        if (cardsValue(give) >= cardsValue(want) * 0.8) {
          try {
            boardConclude(l, o, give, want);
            feed('trade', `${o.fromName} a accepté ta contre-offre !`);
          } catch {
            ((o.status = 'withdrawn'), (o.resolvedAt = Date.now()));
          }
        } else ((o.status = 'withdrawn'), (o.resolvedAt = Date.now()), feed('trade', `${o.fromName} a refusé ta contre-offre.`));
        sync();
      }, 2500);
    },
    async respondCounter(id, accept) {
      await delay(120);
      const o = O().find((x) => x.id === id && x.fromId === 'me' && x.status === 'countered' && x.counter);
      if (!o) throw new Error('Contre-offre introuvable ou déjà traitée.');
      if (!accept) {
        ((o.status = 'withdrawn'), (o.resolvedAt = Date.now()));
        return sync();
      }
      const l = L().find((x) => x.id === o.listingId);
      if (!l || !listingLive(l)) throw new Error('Cette annonce a expiré.');
      boardConclude(l, o, o.counter!.give, o.counter!.want);
      sync();
    },
    async signContract(rarity, items) {
      await delay(150);
      const target = contractTarget(rarity) as RarityId | null;
      // (verrouillage, comme le serveur : une carte engagée — échange en attente, annonce, offre — ne se brûle pas)
      const locked = lockedCards(state);
      const problem = contractProblem(rarity, items, (id) => Math.max(0, (save.inv[cardKey({ cardId: id, rarity })]?.count ?? 0) - 1 - (locked.get(cardKey({ cardId: id, rarity })) ?? 0)));
      if (!target || problem) throw new Error(problem ?? 'Contrat invalide.');
      for (const it of items) remove(save.inv, { cardId: it.cardId, rarity, count: it.count });
      const ownedIds = new Set(Object.values(save.inv).map((c) => c.cardId));
      const card = rollContract(rarity, items, (id) => ownedIds.has(id));
      const k = cardKey({ cardId: card.id, rarity: target });
      const mint = (save.mints[k] = (save.mints[k] ?? 0) + 1);
      add(save.inv, card.id, target, 1, mint);
      bump({ type: 'contract' });
      eco.hooks.onContract();
      save.contracts_done = (save.contracts_done ?? 0) + 1;
      feed('contract', `Contrat signé : ${card.name} [${rarityOf(target).label} #${mint}] !`, target, { id: card.id, name: card.name, mint });
      sync();
      return { cardId: card.id, cardName: card.name, rarity: target, mintNumber: mint, isNew: !ownedIds.has(card.id) };
    },
  };
}

/** Nom affiché d'un booster (pour les messages). */
export const boosterLabel = (req: PackRequest) => (req.kind === 'bebou' ? BEBOU_PACK.booster : themeById(req.themeId ?? '')?.booster ?? '?');
