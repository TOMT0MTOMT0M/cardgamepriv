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
  validPackChoice,
  type GameCard,
  type PackChoice,
  type Stake,
} from '../core/games';
import type { CoinTx, DuelView, EcoBackend, EcoSnapshot, LobbyView, PotCard, RoyaleView, RouletteView } from './eco';

/**
 * Économie + espace Jeux du MODE DÉMO : tout dans ce navigateur, avec les amis robots comme adversaires
 * (ils rejoignent les duels avec une mise équivalente, remplissent les Battle Royales, misent à la roulette).
 * Un bouton « Tirer maintenant » lance la roulette sans attendre 10 h / 20 h.
 */

export interface LocalEcoSave {
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
  feed(message: string): void;
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

  function coins(amount: number, reason: string, label: string, earned = false) {
    const s = d();
    amount = Math.round(amount);
    if (s.coins + amount < 0) throw new Error(`Pas assez de pièces (il t’en manque ${-(s.coins + amount)}).`);
    s.coins += amount;
    if (earned && amount > 0) s.econ.earned += amount;
    if (amount) {
      s.tx.unshift({ id: id('tx'), amount, reason, label, createdAt: Date.now() });
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
    if (!Number.isInteger(stake.coins) || stake.coins < 0) throw new Error('Montant invalide.');
    if (stake.coins > d().coins) throw new Error('Tu n’as pas assez de pièces pour cette mise.');
    for (const c of stake.cards) if (host.owned(c.cardId, c.rarity).free < c.count) throw new Error('Une carte de la mise n’est plus disponible.');
  }
  function takeStake(stake: Stake): PotCard[] {
    if (stake.coins) coins(-stake.coins, 'game', 'Mise');
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
    if (host.packsAvailable() < mine.packs.length) throw new Error(`Il te faut ${mine.packs.length} boosters en réserve.`);
    host.debitPacks(mine.packs.length);
    const escrow = du.sides.map((s) => (s.userId === ME ? { coins: s.stake.coins, cards: takeStake(s.stake) } : { coins: s.stake.coins, cards: [] as PotCard[] }));
    const packs = du.sides.map((s) => s.packs.map((p) => {
      const cards = host.roll(p, s.userId);
      if (s.userId === ME) coins(rollPackCoins(p.kind, Math.random), 'pack', `Ouverture — ${packChoiceLabel(p)} (jeu)`, true);
      return cards;
    }));
    const { stars, winner } = duelWinner(packs);
    if (winner === null) {
      du.sides.forEach((s, k) => {
        giveAll(s.userId, [...packs[k].flat(), ...escrow[k].cards]);
        if (s.userId === ME && escrow[k].coins) coins(escrow[k].coins, 'duel', 'Side pot rendu (égalité parfaite)');
      });
    } else {
      const w = du.sides[winner];
      giveAll(w.userId, [...packs.flat(2), ...escrow[0].cards, ...escrow[1].cards]);
      if (w.userId === ME && escrow[0].coins + escrow[1].coins) coins(escrow[0].coins + escrow[1].coins, 'duel', `Side pot gagné — Pack Battle contre ${du.sides[1 - winner].name}`, true);
    }
    const won = winner !== null && du.sides[winner].userId === ME;
    const s = d();
    s.econ.gamesPlayed++;
    if (won) s.econ.gamesWon++;
    weekly({ type: 'game', won });
    host.feed(winner === null ? `Pack Battle : égalité parfaite (${stars[0]}★ partout)` : `${du.sides[winner].name} remporte un Pack Battle (${stars[winner]}★ contre ${stars[1 - winner]}★)`);
    Object.assign(du, { status: 'done', result: { packs, stars, ...(winner === null ? {} : { winner }) }, resolvedAt: Date.now() });
  }

  // ───────────────────── battle royale
  function resolveRoyale(r: RoyaleView) {
    const meIdx = r.players.findIndex((p) => p.userId === ME);
    if (meIdx >= 0) {
      if (host.packsAvailable() < 1) throw new Error('Il te faut un booster en réserve.');
      host.debitPacks(1);
    }
    const packs = r.players.map((p) => {
      const c = host.roll(p.pack, p.userId);
      if (p.userId === ME) coins(rollPackCoins(p.pack.kind, Math.random), 'pack', `Ouverture — ${packChoiceLabel(p.pack)} (jeu)`, true);
      return c;
    });
    const res = royaleResult(packs, Math.random);
    r.players.forEach((p, i) => giveAll(p.userId, res.awarded[i]));
    const won = res.winners.includes(meIdx);
    if (meIdx >= 0) {
      d().econ.gamesPlayed++;
      if (won) d().econ.gamesWon++;
      weekly({ type: 'game', won });
    }
    host.feed(`Battle Royale à ${r.players.length} : ${res.winners.map((i) => r.players[i].name).join(' et ')} (${Math.max(...res.stars)}★)`);
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
        coins(r.pot.coins, 'roulette', `Roulette — pot (n° ${number})`, true);
        d().econ.rouletteWins++;
      }
      host.feed(`🎡 Le ${number} sort à la roulette : ${bet.name} remporte tout le pot !`);
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

  const backend: EcoBackend = {
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
        if (snap.calendar.claimed) throw new Error('Cadeau du jour déjà pris : reviens demain.');
        coins(snap.calendar.reward.coins, 'calendar', `Calendrier — jour ${snap.calendar.day}`, true);
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
        coins(r.reward, 'weekly', 'Mission de la semaine', true);
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
        coins(total, 'burn', `Brûlage de ${n} doublon${n > 1 ? 's' : ''}`, true);
        weekly({ type: 'burn', count: n });
        return { coins: total, count: n };
      }),
    claimCompletions: () =>
      act(() => {
        const sets = claimableCompletions(new Set(host.ownedIds()), d().econ.completions);
        if (!sets.length) throw new Error('Aucune prime de complétion en attente.');
        const total = sets.reduce((a, x) => a + x.reward, 0);
        d().econ.completions.push(...sets.map((x) => x.id));
        coins(total, 'completion', sets.length === 1 ? `Complétion — ${sets[0].label}` : `Complétion — ${sets.length} ensembles`, true);
        return { coins: total, sets: sets.map((x) => ({ id: x.id, label: x.label, reward: x.reward })) };
      }),
    claimAchievements: () =>
      act(() => {
        const list = claimableAchievements(achievementStats(host.stats(), d().econ), d().econ.achievements);
        if (!list.length) throw new Error('Aucun succès à réclamer.');
        const total = list.reduce((a, x) => a + achievementReward(x), 0);
        const packs = list.reduce((a, x) => a + achievementPacks(x), 0);
        d().econ.achievements.push(...list.map((a) => a.id));
        coins(total, 'achievement', list.length === 1 ? `Succès — ${list[0].label}` : `${list.length} succès`, true);
        if (packs) host.grantPacks(packs);
        return { coins: total, packs, ids: list.map((a) => a.id) };
      }),
    coinHistory: async () => structuredClone(d().tx),
    // démo : les robots ont des compteurs inventés (stables), pour voir la comparaison entre amis
    friendsAchievements: async () => {
      const me = achievementStats(host.stats(), d().econ);
      const bot = (seed: number) => Object.fromEntries(Object.entries(me).map(([k, v], i) => [k, Math.max(0, Math.round((v + 3) * (0.4 + ((seed * 7 + i * 13) % 17) / 10)))])) as unknown as typeof me;
      return [{ userId: ME, name: 'Toi', me: true, stats: me }, ...host.bots().map((b, i) => ({ userId: b.id, name: b.name, me: false, stats: bot(i + 1) }))];
    },

    watchLobby: (cb) => watch<LobbyView>(() => ({ duels: d().duels.filter((x) => x.status === 'open'), royales: d().royales.filter((x) => x.status === 'open'), me: ME }), cb),
    watchDuel: (did, cb) => watch(() => d().duels.find((x) => x.id === did) ?? null, cb),
    watchRoyale: (rid, cb) => watch(() => d().royales.find((x) => x.id === rid) ?? null, cb),
    watchRoulette: (cb) => watch(roulette, cb),
    gameHistory: async () => structuredClone({ duels: d().duels.filter((x) => x.status === 'done').reverse().slice(0, 25), royales: d().royales.filter((x) => x.status === 'done').reverse().slice(0, 25) }),

    createDuel: (packs, stake, invitedId) =>
      act(() => {
        const p = duelProblem({ packs, stake }, null);
        if (p && !p.startsWith('En attente')) throw new Error(p);
        checkStake(stake);
        if (host.packsAvailable() < packs.length) throw new Error(`Tu n’as pas ${packs.length} boosters en réserve.`);
        const du: DuelView = { id: id('du'), creatorId: ME, ...(invitedId ? { invitedId } : {}), status: 'open', sides: [{ userId: ME, name: 'Toi', packs, stake, ready: false }], createdAt: Date.now() };
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
        if (!du || du.status !== 'open') throw new Error('Ce duel n’est plus ouvert.');
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
        if (!du || du.status !== 'open') throw new Error('Ce duel n’est plus ouvert.');
        const p = duelProblem({ packs: du.sides[0].packs, stake: du.sides[0].stake }, du.sides[1] ? { packs: du.sides[1].packs, stake: du.sides[1].stake } : null);
        if (p) throw new Error(p);
        du.sides.find((s) => s.userId === ME)!.ready = true;
        if (!du.sides.every((s) => s.ready)) return { locked: false };
        resolveDuel(du);
        return { locked: true };
      }),
    createRoyale: (pack) =>
      act(() => {
        if (!validPackChoice(pack)) throw new Error('Booster inconnu.');
        if (host.packsAvailable() < 1) throw new Error('Il te faut un booster en réserve.');
        const r: RoyaleView = { id: id('ro'), creatorId: ME, status: 'open', players: [{ userId: ME, name: 'Toi', pack }], createdAt: Date.now() };
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
        if (!r || r.status !== 'open') throw new Error('Cette Battle Royale n’est plus ouverte.');
        if (r.players.length < ROYALE_MIN) throw new Error(`Il faut au moins ${ROYALE_MIN} joueurs.`);
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
        r.bets.push({ userId: ME, name: 'Toi', numbers: [...numbers].sort((x, y) => x - y), coins: stake.coins, cards });
        d().econ.gamesPlayed++;
        weekly({ type: 'game', won: false });
        potOf(r);
      }),
    alerts: async () => [
      {
        key: 'demo',
        kind: 'flow',
        title: 'Exemple (démo) : Malo (robot) → Léa (robot) : flux net de 6 200 en 30 jours',
        detail: 'En ligne, les alertes sont calculées sur les vrais flux (duels, royales, roulette, échanges). Aucun blocage automatique.',
        value: 6200,
        users: ['Malo (robot)', 'Léa (robot)'],
      },
    ],
    review: async () => {},
    demoDraw: () => act(() => draw()),
  };

  /** Crochets du mode démo : pièces des boosters, missions (jour + semaine). */
  const hooks = {
    onPack(kind: 'bebou' | 'theme', label: string, cards: Array<{ rarity: string; isNew: boolean }>) {
      coins(rollPackCoins(kind, Math.random), 'pack', `Ouverture — ${label}`, true);
      weekly({ type: 'pack', cards });
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
    onMission(m: Mission) {
      const c = dailyMissionCoins(m);
      coins(c, 'mission', 'Mission du jour', true);
      emit();
      return c;
    },
  };
  return { backend, hooks };
}
