import { fe } from '../core/errors';
import type { RarityId } from '../core/rarity';
import { DEFI_ACCEPT_MS, defiGain, defiKind, defiProblem, defiWinner } from '../core/defis';
import { PRESSE_STRIKES, presseBetProblem, presseCracks, presseStrip, presseValue } from '../core/presse';
import { packChoiceLabel, packRef, validPackChoice } from '../core/games';
import { fm, type Msg } from '../core/msgs';
import { t as tr } from '../core/i18n';
import { missionDay } from '../core/missions';
import type { DefiView, JeuxBackend, PresseCard, PresseRunView, PresseState } from './ecoJeux';

/**
 * (V2, 11/11) Défis entre amis + La Presse en MODE DÉMO : tout dans ce navigateur. Les amis robots acceptent les défis
 * au bout d'un instant ; « Terminer (démo) » tranche le défi tout de suite (les robots marquent au hasard). Mêmes règles
 * que le serveur (src/core/defis.ts, src/core/presse.ts).
 */

export interface LocalJeuxSave {
  defis?: DefiView[];
  presse?: Array<PresseRunView & { strip: PresseCard[] }>;
}

export interface LocalJeuxHost {
  save(): LocalJeuxSave & { coins: number; seq: number };
  coins(amount: number, reason: string, label: string | Msg, earned?: boolean): void;
  game(won: boolean): void;
  bots(): Array<{ id: string; name: string }>;
  feed(message: string | Msg): void;
  emit(): void;
  watch<T>(get: () => T, cb: (v: T) => void): () => void;
  act<T>(fn: () => T): Promise<T>;
}

const ME = 'me';

export function createLocalJeux(host: LocalJeuxHost) {
  const s = () => host.save();
  const defis = () => (s().defis ??= []);
  const runs = () => (s().presse ??= []);
  const nid = (p: string) => `${p}${s().seq++}`;
  const find = (id: string) => {
    const c = defis().find((x) => x.id === id);
    if (!c) throw new Error('Défi introuvable.');
    return c;
  };

  function goLive(c: DefiView) {
    c.players = c.players.map((p) => (p.state === 'invited' ? { ...p, state: 'out' } : p));
    if (c.players.filter((p) => p.state === 'in').length < 2) {
      if (c.stake) host.coins(c.stake, 'challenge', fm('c.defiRefundNobody'));
      Object.assign(c, { status: 'cancelled', outcome: 'alone', resolvedAt: Date.now() });
      return;
    }
    const now = Date.now();
    Object.assign(c, { status: 'live', startedAt: now, endsAt: now + c.durationMs });
  }

  function resolve(c: DefiView, forced: number | null) {
    const inn = c.players.map((p, i) => ({ p, i })).filter((x) => x.p.state === 'in');
    const k = forced ?? defiWinner(inn.map((x) => x.p.score));
    const w = forced ?? (k === null ? null : inn[k].i);
    const pot = c.stake * inn.length;
    const outcome = w !== null ? 'win' : inn.some((x) => x.p.score > 0) ? 'tie' : 'nobody';
    const me = c.players.find((p) => p.userId === ME && p.state === 'in');
    if (w !== null && c.players[w].userId === ME && pot) host.coins(pot, 'challenge', fm('c.defiWon', { goal: defiKind(c.kind).goal(c.target), defiKind: c.kind, ...(c.target ? { defiTarget: c.target } : {}) }), true);
    if (w === null && me && c.stake) host.coins(c.stake, 'challenge', fm(outcome === 'tie' ? 'c.defiRefundTie' : 'c.defiRefundZero'));
    if (me) host.game(w !== null && c.players[w].userId === ME);
    Object.assign(c, { status: 'done', outcome, resolvedAt: Date.now(), ...(w !== null ? { winnerId: c.players[w].userId } : {}) });
    if (w !== null) host.feed(fm(pot ? 'f.defiWinPot' : 'f.defiWin', { name: c.players[w].name, others: inn.filter((x) => x.i !== w).map((x) => x.p.name).join(', '), goalLc: defiKind(c.kind).goal(c.target).toLowerCase(), defiKind: c.kind, ...(c.target ? { defiTarget: c.target } : {}), ...(pot ? { coins: pot } : {}) }));
  }

  /** fin des défis dont l'heure est passée (la démo n'a pas de planificateur) */
  function sweep() {
    const now = Date.now();
    for (const c of defis()) {
      if (c.status === 'pending' && now >= c.acceptBy) goLive(c);
      if (c.status === 'live' && now >= (c.endsAt ?? 0)) resolve(c, null);
    }
  }

  const backend: JeuxBackend = {
    watchDefis: (cb) =>
      host.watch(() => {
        sweep();
        return { me: ME, list: [...defis()].reverse().slice(0, 20) };
      }, cb),
    createDefi: (d) =>
      host.act(() => {
        const p = defiProblem(d, ME);
        if (p) throw new Error(p);
        if (d.stake > s().coins) throw new Error(fe('challenges.1', { p0: d.stake - s().coins }));
        const bots = new Map(host.bots().map((b) => [b.id, b.name]));
        const now = Date.now();
        const c: DefiView = {
          id: nid('defi'),
          creatorId: ME,
          kind: d.kind,
          ...(d.kind === 'first' ? { target: d.target } : {}),
          durationMs: d.durationMs,
          stake: d.stake,
          status: 'pending',
          players: [{ userId: ME, name: tr('chat.me'), state: 'in', score: 0 }, ...d.invited.map((id) => ({ userId: id, name: bots.get(id) ?? id, state: 'invited' as const, score: 0 }))],
          createdAt: now,
          acceptBy: now + DEFI_ACCEPT_MS,
        };
        if (d.stake) host.coins(-d.stake, 'challenge', fm('c.defiEscrow', { names: d.invited.map((id) => bots.get(id) ?? id).join(', ') }));
        defis().push(c);
        // les robots répondent au bout d'un instant (un sur quatre refuse)
        setTimeout(() => {
          if (c.status !== 'pending') return;
          c.players = c.players.map((pl, i) => (pl.state === 'invited' ? { ...pl, state: i % 4 === 3 ? 'out' : 'in' } : pl));
          goLive(c);
          host.emit();
        }, 1800);
        return c.id;
      }),
    respondDefi: (id, accept) =>
      host.act(() => {
        const c = find(id);
        const i = c.players.findIndex((p) => p.userId === ME && p.state === 'invited');
        if (c.status !== 'pending' || i < 0) throw new Error(fe('challenges.5'));
        if (accept && c.stake) host.coins(-c.stake, 'challenge', fm('c.defiEscrowOf', { name: c.players[0].name }));
        c.players[i] = { ...c.players[i], state: accept ? 'in' : 'out' };
        if (!c.players.some((p) => p.state === 'invited')) goLive(c);
      }),
    startDefi: (id) =>
      host.act(() => {
        const c = find(id);
        if (c.status !== 'pending') throw new Error(fe('challenges.5'));
        if (c.players.filter((p) => p.state === 'in').length < 2) throw new Error(fe('challenges.9'));
        goLive(c);
      }),
    cancelDefi: (id) =>
      host.act(() => {
        const c = find(id);
        if (c.status !== 'pending') throw new Error(fe('challenges.5'));
        if (c.stake) host.coins(c.stake, 'challenge', fm('c.defiRefundCancel'));
        Object.assign(c, { status: 'cancelled', resolvedAt: Date.now() });
      }),
    demoDefiEnd: (id) =>
      host.act(() => {
        const c = find(id);
        if (c.status !== 'live') return;
        c.players = c.players.map((p) => (p.userId !== ME && p.state === 'in' ? { ...p, score: p.score + (c.kind === 'first' ? 0 : Math.floor(Math.random() * (c.kind === 'stars' ? 40 : 6))) } : p));
        resolve(c, null);
      }),

    watchPresse: (cb) =>
      host.watch<PresseState>(() => {
        const list = runs();
        const today = missionDay(Date.now());
        const strip = ({ strip: _s, ...r }: PresseRunView & { strip: PresseCard[] }): PresseRunView => (void _s, r);
        return {
          run: list.length ? strip(list[list.length - 1]) : null,
          today: list.filter((r) => missionDay(r.createdAt) === today).length,
          past: list.slice(-9).reverse().filter((r) => r.status !== 'live').slice(0, 8).map((r) => ({ id: r.id, bet: r.bet, shown: r.shown, status: r.status, payout: r.payout ?? 0, createdAt: r.createdAt })),
        };
      }, cb),
    presseStart: (bet, album) =>
      host.act(() => {
        if (!validPackChoice(album)) throw new Error(fe('presse.5'));
        if (runs().some((r) => r.status === 'live')) throw new Error(fe('presse.1'));
        const today = missionDay(Date.now());
        const p = presseBetProblem(bet, s().coins, runs().filter((r) => missionDay(r.createdAt) === today).length);
        if (p) throw new Error(p);
        host.coins(-bet, 'presse', fm('c.presseBet', { pack: packChoiceLabel(album), ...packRef(album) }));
        const strip = presseStrip(album, Math.random);
        const r = { id: nid('presse'), bet, album, strip, cards: strip.slice(0, 1), shown: 1, status: 'live' as const, value: presseValue(bet, strip.slice(0, 1)), createdAt: Date.now() };
        runs().push(r);
        runs().splice(0, Math.max(0, runs().length - 40));
        return view(r);
      }),
    presseStrike: (id) =>
      host.act(() => {
        const r = runOf(id);
        if (r.status !== 'live') return view(r);
        const cracked = presseCracks(r.strip, r.shown);
        r.shown++;
        r.cards = r.strip.slice(0, r.shown);
        r.value = presseValue(r.bet, r.strip.slice(0, cracked ? r.shown - 1 : r.shown));
        if (cracked) close(r, 'cracked');
        else if (r.shown >= PRESSE_STRIKES) close(r, 'cashed');
        return view(r);
      }),
    presseCash: (id) =>
      host.act(() => {
        const r = runOf(id);
        if (r.status === 'live') close(r, 'cashed');
        return view(r);
      }),
  };
  const view = ({ strip: _s, ...r }: PresseRunView & { strip: PresseCard[] }): PresseRunView => (void _s, structuredClone(r));
  function runOf(id: string) {
    const r = runs().find((x) => x.id === id);
    if (!r) throw new Error(fe('presse.6'));
    return r;
  }
  function close(r: PresseRunView & { strip: PresseCard[] }, status: 'cashed' | 'cracked') {
    r.status = status;
    r.payout = status === 'cashed' ? presseValue(r.bet, r.cards) : 0;
    if (r.payout) host.coins(r.payout, 'presse', fm('c.presseWin', { n: r.shown }), r.payout > r.bet);
    host.game(r.payout > r.bet);
  }

  return {
    backend,
    /** crochet d'ouverture de booster (démo) : avance mes défis en cours */
    onPack(cards: Array<{ rarity: RarityId | string; isNew: boolean }>) {
      sweep();
      for (const c of defis()) {
        if (c.status !== 'live') continue;
        const i = c.players.findIndex((p) => p.userId === ME && p.state === 'in');
        if (i < 0) continue;
        const { add, hit } = defiGain(c.kind, c.target, cards);
        if (!add) continue;
        c.players[i] = { ...c.players[i], score: c.players[i].score + add, at: Date.now() };
        if (hit) resolve(c, i);
      }
    },
  };
}
