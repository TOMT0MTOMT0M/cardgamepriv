import '../core/i18n/fr/game.ecoLocal'; // (textes de ce module, version anglaise)
import type { RarityId } from '../core/rarity';
import type { PlayerStats } from '../core/cosmetics';
import type { Mission } from '../core/missions';
import { missionDay } from '../core/missions';
import { touchStreak, type StreakState } from '../core/streak';
import {
  CARD_VALUE,
  achievementPacks,
  achievementReward,
  achievementStats,
  burnProblem,
  calendarDay,
  calendarReward,
  cardsValue,
  claimableAchievements,
  claimableCompletions,
  emptyEcon,
  PACK_PRICE,
  packBuyProblem,
  packBuysLeft,
  rollPackCoins,
  stakeValue,
  type EconState,
} from '../core/economy';
import { applyWeeklyEvent, claimWeekly, currentWeekly, dailyMissionCoins, nextWeekReset, type WeeklyEvent, type WeeklyState } from '../core/weekly';
import {
  packRef,
  ROYALE_MAX,
  ROYALE_MIN,
  betProblem,
  drawNumber,
  duelProblem,
  duelWinner,
  houseCard,
  nextRouletteDraw,
  rouletteSlot,
  ROULETTE_NUMBERS,
  packChoiceLabel,
  royaleResult,
  royalePackCount,
  validPackChoice,
  type GameCard,
  type PackChoice,
  type Stake,
} from '../core/games';
import type { CoinTx, DuelView, EcoBackend, EcoSnapshot, LobbyView, PotCard, RoyaleView, RouletteView } from './eco';
import { createLocalJeux, type LocalJeuxSave } from './ecoLocalJeux';
import { fm, type Msg } from '../core/msgs';
import { fe } from '../core/errors';
import { t as tr } from '../core/i18n';

/**
 * Économie + espace Jeux du MODE DÉMO : tout dans ce navigateur, avec les amis robots comme adversaires
 * (ils rejoignent les duels avec une mise équivalente, remplissent les Battle Royales, misent à la roulette).
 * Un bouton « Tirer maintenant » lance la roulette sans attendre 10 h / 20 h.
 */

export interface LocalEcoSave extends LocalJeuxSave {
  coins: number;
  econ: EconState;
  weekly?: WeeklyState;
  duels: DuelView[];
  royales: RoyaleView[];
  round: NonNullable<RouletteView['round']> | null;
  past: RouletteView['past'];
  tx: CoinTx[];
  seq: number;
}

export interface LocalEcoHost {
  /** l'objet persistant (créé s'il n'existe pas) */
  data(): LocalEcoSave | undefined;
  setData(d: LocalEcoSave): void;
  /** exemplaires libres d'une carte (possédés − engagés en échange) et possédés */
  owned(cardId: string, rarity: RarityId): { have: number; free: number };
  addCard(owner: string, cardId: string, rarity: RarityId, n: number, mint: number): void;
  removeCard(cardId: string, rarity: RarityId, n: number): boolean;
  packsAvailable(): number;
  debitPacks(n: number): void;
  grantPacks(n: number): void;
  /** ouvre un booster (n° d'impression, pity et compteur du joueur s'il s'agit de lui) */
  roll(choice: PackChoice, who: string): GameCard[];
  stats(): PlayerStats;
  /** ids des cartes possédées (n'importe quelle rareté) */
  ownedIds(): Iterable<string>;
  streak(): StreakState | undefined;
  setStreak(s: StreakState): void;
  bots(): Array<{ id: string; name: string }>;
  feed(message: string | Msg): void;
  changed(): void;
}

const ME = 'me';

export function createLocalEco(host: LocalEcoHost) {
  const d = (): LocalEcoSave => {
    let x = host.data();
    if (!x) {
      x = { coins: 500, econ: emptyEcon(), duels: [], royales: [], round: null, past: [], tx: [], seq: 1 };
      host.setData(x);
    }
    return x;
  };
  const listeners = new Set<(s: EcoSnapshot | null) => void>();
  const watchers = new Set<() => void>();
  const id = (p: string) => `${p}${d().seq++}`;

  function snapshot(): EcoSnapshot {
    const s = d();
    const now = Date.now();
    const stats = achievementStats(host.stats(), s.econ);
    const owned = new Set(host.ownedIds());
    const streak = touchStreak(host.streak(), now) ?? host.streak();
    const day = calendarDay(streak?.count ?? 1);
    return {
      coins: s.coins,
      econ: s.econ,
      calendar: { day, today: missionDay(now), claimed: s.econ.calendarDay === missionDay(now), reward: calendarReward(day) },
      weekly: { ...currentWeekly(s.weekly, ME, now), resetAt: nextWeekReset(now) },
      completions: claimableCompletions(owned, s.econ.completions).map((x) => ({ id: x.id, label: x.label, kind: x.kind, size: x.cards.length, reward: x.reward })),
      achievements: { stats, claimable: claimableAchievements(stats, s.econ.achievements).map((a) => a.id) },
      isAdmin: true,
      packShop: { price: PACK_PRICE, left: packBuysLeft(s.econ, missionDay(now)) },
    };
  }

  function emit() {
    host.changed();
    const snap = snapshot();
    listeners.forEach((fn) => fn(snap));
    watchers.forEach((fn) => fn());
  }

  function coins(amount: number, reason: string, label: string | Msg, earned = false) {
    const s = d();
    amount = Math.round(amount);
    if (s.coins + amount < 0) throw new Error(fe('econLib.2', { p0: -(s.coins + amount) }));
    s.coins += amount;
    if (earned && amount > 0) s.econ.earned += amount;
    if (amount) {
      s.tx.unshift({ id: id('tx'), amount, reason, createdAt: Date.now(), ...(typeof label === 'string' ? { label } : { label: label.text, labelKey: label.key, ...(label.params ? { labelParams: label.params } : {}) }) });
      s.tx.length = Math.min(s.tx.length, 80);
    }
  }
  function weekly(ev: WeeklyEvent) {
    const s = d();
    const { state, changed } = applyWeeklyEvent(currentWeekly(s.weekly, ME, Date.now()), ev);
    if (changed) s.weekly = state;
  }
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ───────────────────── mises (cartes du joueur)
  function checkStake(stake: Stake) {
    if (!Number.isInteger(stake.coins) || stake.coins < 0) throw new Error(fe('econLib.15'));
    if (stake.coins > d().coins) throw new Error('Tu n’as pas assez de pièces pour cette mise.');
    for (const c of stake.cards) if (host.owned(c.cardId, c.rarity).free < c.count) throw new Error('Une carte de la mise n’est plus disponible.');
  }
  function takeStake(stake: Stake): PotCard[] {
    if (stake.coins) coins(-stake.coins, 'game', tr('el.bet'));
    return stake.cards.map((c) => {
      if (!host.removeCard(c.cardId, c.rarity, c.count)) throw new Error('Carte indisponible.');
      return { ...c, mintNumber: 999 };
    });
  }
  const giveAll = (owner: string, cards: Array<{ cardId: string; rarity: RarityId; count?: number; mintNumber: number }>) => cards.forEach((c) => host.addCard(owner, c.cardId, c.rarity, c.count ?? 1, c.mintNumber));
  const botStake = (v: number): Stake => ({ coins: v, cards: [] });

  // ───────────────────── duels
  function resolveDuel(du: DuelView) {
    const [a, b] = du.sides;
    if (a.userId === ME) checkStake(a.stake);
    if (b.userId === ME) checkStake(b.stake);
    const mine = du.sides.find((s) => s.userId === ME)!;
    if (host.packsAvailable() < mine.packs.length) throw new Error(fe('games.17', { p0: mine.packs.length }));
    host.debitPacks(mine.packs.length);
    const escrow = du.sides.map((s) => (s.userId === ME ? { coins: s.stake.coins, cards: takeStake(s.stake) } : { coins: s.stake.coins, cards: [] as PotCard[] }));
    const packs = du.sides.map((s) => s.packs.map((p) => {
      const cards = host.roll(p, s.userId);
      if (s.userId === ME) coins(rollPackCoins(p.kind, Math.random), 'pack', fm('c.openGame', { pack: packChoiceLabel(p), ...packRef(p) }), true);
      return cards;
    }));
    const { stars, winner } = duelWinner(packs);
    if (winner === null) {
      du.sides.forEach((s, k) => {
        giveAll(s.userId, [...packs[k].flat(), ...escrow[k].cards]);
        if (s.userId === ME && escrow[k].coins) coins(escrow[k].coins, 'duel', fm('c.sidePotBack'));
      });
    } else {
      const w = du.sides[winner];
      giveAll(w.userId, [...packs.flat(2), ...escrow[0].cards, ...escrow[1].cards]);
      if (w.userId === ME && escrow[0].coins + escrow[1].coins) coins(escrow[0].coins + escrow[1].coins, 'duel', fm('c.sidePotWon', { name: du.sides[1 - winner].name }), true);
    }
    const won = winner !== null && du.sides[winner].userId === ME;
    const s = d();
    s.econ.gamesPlayed++;
    if (won) s.econ.gamesWon++;
    weekly({ type: 'game', won });
    host.feed(winner === null ? fm('f.battleTie', { name: du.sides[0].name, other: du.sides[1].name, stars: stars[0] }) : fm('f.battleWin', { name: du.sides[winner].name, other: du.sides[1 - winner].name, stars: stars[winner], stars2: stars[1 - winner], n: du.sides[0].packs.length, cards: du.sides[0].packs.length * 10 }));
    Object.assign(du, { status: 'done', result: { packs, stars, ...(winner === null ? {} : { winner }) }, resolvedAt: Date.now() });
  }

  // ───────────────────── battle royale
  function resolveRoyale(r: RoyaleView) {
    const n = royalePackCount(r);
    const meIdx = r.players.findIndex((p) => p.userId === ME);
    if (meIdx >= 0) {
      if (host.packsAvailable() < n) throw new Error(n > 1 ? fe('games.17', { p0: n }) : fe('games.18'));
      host.debitPacks(n);
    }
    const packs = r.players.map((p) =>
      Array.from({ length: n }, () => {
        const c = host.roll(p.pack, p.userId);
        if (p.userId === ME) coins(rollPackCoins(p.pack.kind, Math.random), 'pack', fm('c.openGame', { pack: packChoiceLabel(p.pack), ...packRef(p.pack) }), true);
        return c;
      }).flat(),
    );
    const res = royaleResult(packs, Math.random);
    r.players.forEach((p, i) => giveAll(p.userId, res.awarded[i]));
    const won = res.winners.includes(meIdx);
    if (meIdx >= 0) {
      d().econ.gamesPlayed++;
      if (won) d().econ.gamesWon++;
      weekly({ type: 'game', won });
    }
    host.feed(res.winners.length === 1 ? fm('f.royaleWin', { name: r.players[res.winners[0]].name, players: r.players.length, best: Math.max(...res.stars), cards: r.players.length * 10 }) : fm('f.royaleTie', { players: r.players.length, best: Math.max(...res.stars), names: res.winners.map((i) => r.players[i].name) }));
    Object.assign(r, { status: 'done', result: { packs, ...res }, resolvedAt: Date.now() });
  }

  // ───────────────────── roulette
  function newRound(carriedCoins: number, carriedCards: PotCard[]) {
    const c = houseCard(Math.random);
    const now = Date.now();
    const round: NonNullable<RouletteView['round']> = {
      id: id('rr'),
      day: rouletteSlot(nextRouletteDraw(now)),
      carriedCoins,
      carriedCards,
      houseCards: [{ cardId: c.id, cardName: c.name, rarity: c.rarity as RarityId, mintNumber: 1 + Math.floor(Math.random() * 40), foilSeed: 1 }],
      bets: [],
      pot: { coins: 0, cards: [], value: 0 },
      drawAt: nextRouletteDraw(now),
    };
    // les robots misent quelques numéros
    const taken = new Set<number>();
    for (const b of host.bots()) {
      if (Math.random() < 0.25) continue;
      const n = 1 + Math.floor(Math.random() * 3);
      const nums: number[] = [];
      while (nums.length < n) {
        const x = 1 + Math.floor(Math.random() * ROULETTE_NUMBERS);
        if (!taken.has(x)) (taken.add(x), nums.push(x));
      }
      round.bets.push({ userId: b.id, name: b.name, numbers: nums.sort((x, y) => x - y), coins: n * 300, cards: [] });
    }
    potOf(round);
    d().round = round;
  }
  function potOf(r: NonNullable<RouletteView['round']>) {
    const c = r.carriedCoins + r.bets.reduce((a, b) => a + b.coins, 0);
    const cards = [...r.carriedCards, ...r.bets.flatMap((b) => b.cards), ...r.houseCards.map((h) => ({ cardId: h.cardId, rarity: h.rarity, count: 1, mintNumber: h.mintNumber }))];
    r.pot = { coins: c, cards, value: c + cardsValue(cards) };
  }
  function round() {
    if (!d().round) newRound(0, []);
    return d().round!;
  }
  function draw(forced?: number) {
    const r = round();
    potOf(r);
    const number = forced ?? drawNumber(Math.random);
    const bet = r.bets.find((b) => b.numbers.includes(number));
    if (bet) {
      giveAll(bet.userId, r.pot.cards);
      if (bet.userId === ME) {
        coins(r.pot.coins, 'roulette', fm('c.roulettePot', { day: missionDay(Date.now()), number }), true);
        d().econ.rouletteWins++;
      }
      host.feed(fm('f.roulette', { number, name: bet.name, coins: r.pot.coins, cards: r.pot.cards.reduce((a, c) => a + c.count, 0), value: r.pot.value }));
    }
    d().past.unshift({ id: r.id, day: r.day, result: { number, potValue: r.pot.value, ...(bet ? { winnerId: bet.userId, winnerName: bet.name } : {}) }, drawnAt: Date.now(), bets: r.bets.map((b) => ({ userId: b.userId, name: b.name, numbers: b.numbers })) });
    d().past.length = Math.min(d().past.length, 10);
    newRound(bet ? 0 : r.pot.coins, bet ? [] : r.pot.cards);
  }
  // tirage automatique si la page est ouverte à 10 h / 20 h
  setInterval(() => {
    const r = d().round;
    if (r && Date.now() >= r.drawAt) {
      draw();
      emit();
    }
  }, 30_000);

  const roulette = (): RouletteView => {
    const r = round();
    potOf(r);
    return { round: r, nextDrawAt: r.drawAt, me: ME, past: d().past };
  };

  const watch = <T,>(get: () => T, cb: (v: T) => void) => {
    const fn = () => cb(structuredClone(get()));
    watchers.add(fn);
    fn();
    return () => watchers.delete(fn);
  };
  const act = async <T,>(fn: () => T): Promise<T> => {
    await delay(150);
    const r = fn();
    emit();
    return r;
  };

  // (V2, 11/11) défis entre amis + La Presse (ecoLocalJeux.ts)
  const jeux = createLocalJeux({
    save: d,
    coins,
    game(won) {
      d().econ.gamesPlayed++;
      if (won) d().econ.gamesWon++;
      weekly({ type: 'game', won });
    },
    bots: () => host.bots(),
    feed: (m) => host.feed(m),
    emit: () => emit(),
    watch,
    act,
  });

  const backend: EcoBackend = {
    ...jeux.backend,
    get snapshot() {
      return snapshot();
    },
    onChange(fn) {
      listeners.add(fn);
      fn(snapshot());
      return () => listeners.delete(fn);
    },
    claimCalendar: () =>
      act(() => {
        const snap = snapshot();
        if (snap.calendar.claimed) throw new Error(fe('economy.1'));
        coins(snap.calendar.reward.coins, 'calendar', fm('c.calendar', { day: snap.calendar.day }), true);
        d().econ.calendarDay = snap.calendar.today;
        if (snap.calendar.reward.packs) host.grantPacks(snap.calendar.reward.packs);
        return { day: snap.calendar.day, ...snap.calendar.reward };
      }),
    buyPacks: (count) =>
      act(() => {
        const today = missionDay(Date.now());
        const p = packBuyProblem(count, d().coins, d().econ, today);
        if (p) throw new Error(p);
        const bought = (d().econ.shopDay === today ? d().econ.shopBought ?? 0 : 0) + count;
        coins(-count * PACK_PRICE, 'shop', `Achat de ${count} booster${count > 1 ? 's' : ''}`);
        d().econ.shopDay = today;
        d().econ.shopBought = bought;
        host.grantPacks(count);
        return { packs: count, left: packBuysLeft(d().econ, today) };
      }),
    claimWeekly: (mid) =>
      act(() => {
        const r = claimWeekly(currentWeekly(d().weekly, ME, Date.now()), mid);
        if (typeof r === 'string') throw new Error(r);
        d().weekly = r.state;
        coins(r.reward, 'weekly', fm('c.weekly'), true);
        return r.reward;
      }),
    burn: (items) =>
      act(() => {
        const p = burnProblem(items, (it) => Math.max(0, host.owned(it.cardId, it.rarity).free - 1));
        if (p) throw new Error(p);
        let total = 0;
        let n = 0;
        for (const it of items) {
          host.removeCard(it.cardId, it.rarity, it.count);
          total += CARD_VALUE[it.rarity] * it.count;
          n += it.count;
        }
        d().econ.burned += n;
        coins(total, 'burn', fm('c.burn', { n }), true);
        weekly({ type: 'burn', count: n });
        return { coins: total, count: n };
      }),
    claimCompletions: () =>
      act(() => {
        const sets = claimableCompletions(new Set(host.ownedIds()), d().econ.completions);
        if (!sets.length) throw new Error(fe('economy.3'));
        const total = sets.reduce((a, x) => a + x.reward, 0);
        d().econ.completions.push(...sets.map((x) => x.id));
        coins(total, 'completion', sets.length === 1 ? fm('c.compl', { set: sets[0].label, setId: sets[0].id }) : fm('c.complN', { n: sets.length }), true);
        return { coins: total, sets: sets.map((x) => ({ id: x.id, label: x.label, reward: x.reward })) };
      }),
    claimAchievements: () =>
      act(() => {
        const list = claimableAchievements(achievementStats(host.stats(), d().econ), d().econ.achievements);
        if (!list.length) throw new Error(fe('economy.4'));
        const total = list.reduce((a, x) => a + achievementReward(x), 0);
        const packs = list.reduce((a, x) => a + achievementPacks(x), 0);
        d().econ.achievements.push(...list.map((a) => a.id));
        coins(total, 'achievement', list.length === 1 ? fm('c.ach', { ach: list[0].label, achId: list[0].id }) : fm('c.achN', { n: list.length }), true);
        if (packs) host.grantPacks(packs);
        return { coins: total, packs, ids: list.map((a) => a.id) };
      }),
    coinHistory: async () => structuredClone(d().tx),
    // démo : les robots ont des compteurs inventés (stables), pour voir la comparaison entre amis
    friendsAchievements: async () => {
      const me = achievementStats(host.stats(), d().econ);
      const bot = (seed: number) => Object.fromEntries(Object.entries(me).map(([k, v], i) => [k, Math.max(0, Math.round((v + 3) * (0.4 + ((seed * 7 + i * 13) % 17) / 10)))])) as unknown as typeof me;
      return [{ userId: ME, name: tr('chat.me'), me: true, stats: me }, ...host.bots().map((b, i) => ({ userId: b.id, name: b.name, me: false, stats: bot(i + 1) }))];
    },

    watchLobby: (cb) => watch<LobbyView>(() => ({ duels: d().duels.filter((x) => x.status === 'open'), royales: d().royales.filter((x) => x.status === 'open'), me: ME }), cb),
    watchDuel: (did, cb) => watch(() => d().duels.find((x) => x.id === did) ?? null, cb),
    watchRoyale: (rid, cb) => watch(() => d().royales.find((x) => x.id === rid) ?? null, cb),
    watchRoulette: (cb) => watch(roulette, cb),
    gameHistory: async () => structuredClone({ duels: d().duels.filter((x) => x.status === 'done').reverse().slice(0, 25), royales: d().royales.filter((x) => x.status === 'done').reverse().slice(0, 25) }),

    createDuel: (packs, stake, invitedId) =>
      act(() => {
        const p = duelProblem({ packs, stake }, null);
        if (p && !p.startsWith('En attente')) throw new Error(p); // i18n-ok (code d'erreur : texte français + étiquette)
        checkStake(stake);
        if (host.packsAvailable() < packs.length) throw new Error(fe('games.7', { p0: packs.length }));
        const du: DuelView = { id: id('du'), creatorId: ME, ...(invitedId ? { invitedId } : {}), status: 'open', sides: [{ userId: ME, name: tr('chat.me'), packs, stake, ready: false }], createdAt: Date.now() };
        d().duels.push(du);
        // un robot accepte le défi (même nombre de boosters, mise équivalente) puis valide
        const bots = host.bots();
        const bot = bots.find((b) => b.id === invitedId) ?? bots[Math.floor(Math.random() * bots.length)];
        setTimeout(() => {
          if (du.status !== 'open' || du.sides.length > 1) return;
          du.sides.push({ userId: bot.id, name: bot.name, packs: packs.map(() => ({ kind: 'bebou' as const })), stake: botStake(stakeValue(du.sides[0].stake)), ready: false, bot: true });
          emit();
          setTimeout(() => {
            if (du.status !== 'open' || du.sides.length < 2) return;
            du.sides[1].ready = true;
            emit();
          }, 1200);
        }, 1600);
        return du.id;
      }),
    setDuelSide: (did, packs, stake) =>
      act(() => {
        const du = d().duels.find((x) => x.id === did);
        if (!du || du.status !== 'open') throw new Error(fe('games.9'));
        checkStake(stake);
        du.sides = du.sides.map((s) => ({ ...s, ready: false }));
        const mine = du.sides.find((s) => s.userId === ME);
        if (mine) Object.assign(mine, { packs, stake });
        // le robot s'aligne de nouveau, puis revalide
        const bot = du.sides.find((s) => s.bot);
        if (bot) {
          Object.assign(bot, { packs: packs.map(() => ({ kind: 'bebou' as const })), stake: botStake(stakeValue(stake)) });
          setTimeout(() => (du.status === 'open' && ((bot.ready = true), emit())), 1000);
        }
      }),
    leaveDuel: (did) =>
      act(() => {
        const du = d().duels.find((x) => x.id === did);
        if (du && du.status === 'open') Object.assign(du, { status: 'cancelled', resolvedAt: Date.now() });
      }),
    readyDuel: (did) =>
      act(() => {
        const du = d().duels.find((x) => x.id === did);
        if (!du || du.status !== 'open') throw new Error(fe('games.9'));
        const p = duelProblem({ packs: du.sides[0].packs, stake: du.sides[0].stake }, du.sides[1] ? { packs: du.sides[1].packs, stake: du.sides[1].stake } : null);
        if (p) throw new Error(p);
        du.sides.find((s) => s.userId === ME)!.ready = true;
        if (!du.sides.every((s) => s.ready)) return { locked: false };
        resolveDuel(du);
        return { locked: true };
      }),
    createRoyale: (pack, packCount) =>
      act(() => {
        if (!validPackChoice(pack)) throw new Error(fe('games.42'));
        const n = royalePackCount({ packCount });
        if (host.packsAvailable() < n) throw new Error(n > 1 ? fe('games.17', { p0: n }) : fe('games.18'));
        const r: RoyaleView = { id: id('ro'), creatorId: ME, status: 'open', ...(n > 1 ? { packCount: n } : {}), players: [{ userId: ME, name: tr('chat.me'), pack }], createdAt: Date.now() };
        d().royales.push(r);
        host.bots().forEach((b, i) =>
          setTimeout(() => {
            if (r.status !== 'open' || r.players.length >= ROYALE_MAX) return;
            r.players.push({ userId: b.id, name: b.name, pack: i % 2 ? { kind: 'theme', themeId: 'gaming' } : { kind: 'bebou' }, bot: true });
            emit();
          }, 900 + i * 1100),
        );
        return r.id;
      }),
    joinRoyale: () => Promise.reject(new Error('En démo, crée ta propre Battle Royale : les robots la rejoignent.')),
    leaveRoyale: (rid) =>
      act(() => {
        const r = d().royales.find((x) => x.id === rid);
        if (r && r.status === 'open') Object.assign(r, { status: 'cancelled', resolvedAt: Date.now() });
      }),
    startRoyale: (rid) =>
      act(() => {
        const r = d().royales.find((x) => x.id === rid);
        if (!r || r.status !== 'open') throw new Error(fe('games.20'));
        if (r.players.length < ROYALE_MIN) throw new Error(fe('games.27', { p0: ROYALE_MIN }));
        resolveRoyale(r);
      }),
    placeBet: (numbers, stake) =>
      act(() => {
        const r = round();
        const mine = r.bets.find((b) => b.userId === ME);
        const taken = new Set(r.bets.flatMap((b) => b.numbers));
        const p = betProblem(numbers, stake, taken, mine ? 1 : 0);
        if (p) throw new Error(p);
        checkStake(stake);
        const cards = takeStake(stake);
        r.bets.push({ userId: ME, name: tr('chat.me'), numbers: [...numbers].sort((x, y) => x - y), coins: stake.coins, cards });
        d().econ.gamesPlayed++;
        weekly({ type: 'game', won: false });
        potOf(r);
      }),
    alerts: async () => [
      {
        key: 'demo',
        kind: 'flow',
        title: tr('el.abuseTitle'),
        detail: tr('el.abuseDetail'),
        value: 6200,
        users: [tr('el.botMalo'), tr('el.botLea')],
      },
    ],
    review: async () => {},
    demoDraw: () => act(() => draw()),
  };

  /** Crochets du mode démo : pièces des boosters, missions (jour + semaine). */
  const hooks = {
    onPack(kind: 'bebou' | 'theme', label: Msg, cards: Array<{ rarity: string; isNew: boolean }>) {
      coins(rollPackCoins(kind, Math.random), 'pack', label, true);
      weekly({ type: 'pack', cards });
      jeux.onPack(cards);
      emit();
    },
    onContract() {
      weekly({ type: 'contract' });
      emit();
    },
    onTrade() {
      weekly({ type: 'trade' });
      emit();
    },
    /** (retours Hugo 10/11) marché : pièces payées (négatif) ou reçues ; lève une erreur s'il en manque */
    onMarket(amount: number, label: Msg) {
      coins(amount, amount < 0 ? 'market-buy' : 'market-sell', label);
      emit();
    },
    onMission(m: Mission) {
      const c = dailyMissionCoins(m);
      coins(c, 'mission', fm('c.mission'), true);
      emit();
      return c;
    },
  };
  return { backend, hooks };
}
