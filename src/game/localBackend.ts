import { rollPack, type PackRequest } from '../core/packRoll';
import { rng } from '../core/ease';
import { applyRegen, fmtCountdown } from '../core/packRegen';
import { contractProblem, contractTarget, rollContract } from '../core/contracts';
import { catalogEntry, BEBOU_PACK, themeById } from '../core/sets/themes';
import { rarity as rarityOf, type RarityId } from '../core/rarity';
import { applyMissionEvent, claimMission, claimMissionBonus, currentMissions, nextMissionReset, rerollMission, type MissionEvent, type MissionsState } from '../core/missions';
import { pityAfter, pityForces } from '../core/pity';
import { STREAK_REWARD, claimStreak as claimStreakState, streakDay, touchStreak, type StreakState } from '../core/streak';
import { bestCard, cleanCosmetics, statsFrom, type CosmeticChoice } from '../core/cosmetics';
import { THEMES as GAME_THEMES } from '../core/sets/themes';
import { BIG_PULL_RARITIES, cardKey, lockedCards, type BigPull, type Binder, type Friend, type GameBackend, type GameState, type PlayerCard, type SealedPack, type TradeHistoryItem, type TradeItem, type TradeView } from './backend';

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
  packBalance: number;
  lastDaily: number;
  /** départ du minuteur de recharge (absent sur les anciennes sauvegardes) */
  regenAt?: number;
  opened: number;
  inv: Inv;
  mints: Record<string, number>;
  sealed: SealedPack | null;
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
  /** fil d'activité perso (gros drops, échanges, contrats) */
  activity?: Array<{ id: string; kind: string; message: string; cardId?: string; cardName?: string; rarity?: RarityId; mintNumber?: number; createdAt: number }>;
}

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
  let forceSecret = new URLSearchParams(location.search).has('secret');
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
  };

  function persist() {
    try {
      localStorage.setItem(LS, JSON.stringify(save));
    } catch {
      /* stockage plein ou bloqué : la démo continue en mémoire */
    }
  }

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
    persist();
    listeners.forEach((fn) => fn(state));
  }

  const feed = (kind: string, message: string, rarity?: RarityId, card?: { id: string; name: string; mint?: number }) => {
    save.feed.unshift({ id: `f${save.seq++}`, kind, message, rarity, createdAt: Date.now() });
    save.feed.length = Math.min(save.feed.length, 30);
    (save.activity ??= []).unshift({ id: `a${save.seq++}`, kind, message, rarity, cardId: card?.id, cardName: card?.name, mintNumber: card?.mint, createdAt: Date.now() });
    save.activity.length = Math.min(save.activity.length, 60);
  };
  const myStats = () => statsFrom(Object.values(save.inv), { packsOpened: save.opened, tradesDone: save.trades_done ?? 0, contractsSigned: save.contracts_done ?? 0, streak: save.streak?.count ?? 0 });
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

  return {
    state,
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
      sync();
    },
    async preparePack(req: PackRequest) {
      await delay(120); // latence réseau simulée
      if (save.sealed) return save.sealed;
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
      const cards = rollPack(req, rand).map(({ card, rarity }) => {
        const k = cardKey({ cardId: card.id, rarity });
        const mint = (save.mints[k] = (save.mints[k] ?? 0) + 1);
        const isNew = !save.inv[k] && !seen.has(k);
        seen.add(k);
        return { cardId: card.id, cardName: card.name, rarity: rarity as RarityId, mintNumber: mint, isNew, themeId: card.themeId };
      });
      const maxRarity = cards.reduce<RarityId>((m, c) => (RANK[c.rarity] > RANK[m] ? c.rarity : m), 'common');
      save.pity = pityAfter(save.pity ?? 0, cards.map((c) => c.rarity));
      save.sealed = { id: `p${save.seq++}`, packKind: req.kind, themeId: req.themeId, maxRarity, cards };
      sync();
      return save.sealed;
    },
    async revealPack(id) {
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
      save.sealed = null;
      bump({ type: 'pack', packKey: p.packKind === 'theme' && p.themeId ? p.themeId : 'bebou', cards: p.cards });
      maybeBotOffer();
      sync();
    },
    async friendCollection(friendId) {
      await delay(80);
      return Object.values(save.bots.find((b) => b.id === friendId)?.inv ?? {});
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
        const value = (l: TradeItem[]) => l.reduce((a, it) => a + it.count * Math.pow(2.2, RANK[it.rarity]), 0);
        const fair = value(offered) >= value(requested) * 0.8;
        cur.resolvedAt = Date.now();
        if (fair && offered.every((it) => (save.inv[cardKey(it)]?.count ?? 0) >= it.count) && requested.every((it) => (bot.inv[cardKey(it)]?.count ?? 0) >= it.count)) {
          cur.status = 'accepted';
          offered.forEach((it) => (remove(save.inv, it), add(bot.inv, it.cardId, it.rarity, it.count)));
          requested.forEach((it) => (remove(bot.inv, it), add(save.inv, it.cardId, it.rarity, it.count)));
          save.trades_done = (save.trades_done ?? 0) + 1;
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
        const value = (l: TradeItem[]) => l.reduce((a, it) => a + it.count * Math.pow(2.2, RANK[it.rarity]), 0);
        const fair = value(offered) >= value(requested) * 0.8;
        cur.resolvedAt = Date.now();
        if (fair && offered.every((it) => (save.inv[cardKey(it)]?.count ?? 0) >= it.count) && requested.every((it) => (bot.inv[cardKey(it)]?.count ?? 0) >= it.count)) {
          cur.status = 'accepted';
          offered.forEach((it) => (remove(save.inv, it), add(bot.inv, it.cardId, it.rarity, it.count)));
          requested.forEach((it) => (remove(bot.inv, it), add(save.inv, it.cardId, it.rarity, it.count)));
          save.trades_done = (save.trades_done ?? 0) + 1;
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
        return { id: 'me', name: 'Toi', bio: save.bio, showcase: save.showcase ?? [], packsOpened: save.opened, pinnedBinder: (save.binders ?? []).find((b) => b.pinned) ?? null, cosmetics: cleanCosmetics(save.cosmetics ?? {}, st), stats: st, streakDay: streakDay(save.streak), bestDrop: top ? { cardId: top.cardId, rarity: top.rarity, mintNumber: top.bestMintNumber } : null, themes: themesOf(save.inv) };
      }
      const i = save.bots.findIndex((b) => b.id === userId);
      if (i < 0) return null;
      const b = save.bots[i];
      const st = botStats(b, i);
      const top = bestCard(Object.values(b.inv));
      const cos: CosmeticChoice[] = [{ banner: 'night', frame: 'bronze', title: 'opener', badges: ['first', 'trade'] }, { banner: 'forest', frame: 'none', title: 'rookie', badges: ['first'] }, { banner: 'plum', frame: 'none', badges: [] }];
      return { id: userId, name: b.name, bio: ['Je collectionne les brillantes ✨', 'Toujours partant pour un échange', ''][i] || undefined, showcase: [], packsOpened: 30 + i * 12, cosmetics: cleanCosmetics(cos[i] ?? {}, st), stats: st, streakDay: ((st.streak - 1) % 7) + 1, bestDrop: top ? { cardId: top.cardId, rarity: top.rarity, mintNumber: top.bestMintNumber } : null, themes: themesOf(b.inv) };
    },
    async setShowcase(cards) {
      if (cards.length > 6) throw new Error('6 cartes au maximum dans la vitrine.');
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
    async leaderboard() {
      const row = (id: string, name: string, st: ReturnType<typeof myStats>, cosmetics: CosmeticChoice) => ({ id, name, cosmetics: cleanCosmetics(cosmetics, st), uniques: st.uniques, total: st.total, pct: st.total ? (st.uniques / st.total) * 100 : 0, mythics: st.mythics, secrets: st.secrets, packsOpened: st.packsOpened, tradesDone: st.tradesDone, streak: st.streak });
      return [row('me', 'Toi', myStats(), save.cosmetics ?? {}), ...save.bots.map((b, i) => row(b.id, b.name, botStats(b, i), {}))];
    },
    async activity(userId) {
      if (userId === 'me') return (save.activity ?? []).slice(0, 40);
      const b = save.bots.find((x) => x.id === userId);
      if (!b) return [];
      // les robots : leurs gros tirages de la vitrine
      return (save.bigPulls ?? []).filter((p) => p.userId === userId).map((p) => ({ id: p.id, kind: p.rarity === 'secret' ? 'secret_pull' : p.rarity === 'mythic' ? 'mythic_pull' : 'pull', message: `${p.userName} a obtenu ${p.cardName} [${rarityOf(p.rarity).label} #${p.mintNumber ?? 1}] !`, cardId: p.cardId, cardName: p.cardName, rarity: p.rarity, mintNumber: p.mintNumber, createdAt: p.createdAt }));
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
      const n = name.replace(/\s+/g, ' ').trim().slice(0, 32);
      if (!n) throw new Error('Donne un nom à ton classeur.');
      const b: Binder = { id: `b${save.seq++}`, name: n, cards: cards ?? [], pinned: false, createdAt: Date.now() };
      (save.binders ??= []).push(b);
      sync();
      return b.id;
    },
    async renameBinder(id, name) {
      const b = (save.binders ?? []).find((x) => x.id === id);
      if (!b) throw new Error('Classeur introuvable.');
      b.name = name.replace(/\s+/g, ' ').trim().slice(0, 32) || b.name;
      sync();
    },
    async deleteBinder(id) {
      save.binders = (save.binders ?? []).filter((x) => x.id !== id);
      sync();
    },
    async setBinderCards(id, cards) {
      const b = (save.binders ?? []).find((x) => x.id === id);
      if (!b) throw new Error('Classeur introuvable.');
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
    async signContract(rarity, items) {
      await delay(150);
      const target = contractTarget(rarity) as RarityId | null;
      const problem = contractProblem(rarity, items, (id) => Math.max(0, (save.inv[cardKey({ cardId: id, rarity })]?.count ?? 0) - 1));
      if (!target || problem) throw new Error(problem ?? 'Contrat invalide.');
      for (const it of items) remove(save.inv, { cardId: it.cardId, rarity, count: it.count });
      const ownedIds = new Set(Object.values(save.inv).map((c) => c.cardId));
      const card = rollContract(rarity, items, (id) => ownedIds.has(id));
      const k = cardKey({ cardId: card.id, rarity: target });
      const mint = (save.mints[k] = (save.mints[k] ?? 0) + 1);
      add(save.inv, card.id, target, 1, mint);
      bump({ type: 'contract' });
      save.contracts_done = (save.contracts_done ?? 0) + 1;
      feed('contract', `Contrat signé : ${card.name} [${rarityOf(target).label} #${mint}] !`, target, { id: card.id, name: card.name, mint });
      sync();
      return { cardId: card.id, cardName: card.name, rarity: target, mintNumber: mint, isNew: !ownedIds.has(card.id) };
    },
  };
}

/** Nom affiché d'un booster (pour les messages). */
export const boosterLabel = (req: PackRequest) => (req.kind === 'bebou' ? BEBOU_PACK.booster : themeById(req.themeId ?? '')?.booster ?? '?');
