import type { RarityId } from '../core/rarity';
import { DEFI_ACCEPT_MS, defiGain, defiProblem, defiWinner } from '../core/defis';
import type { DefiView, JeuxBackend } from './ecoJeux';

/**
 * (V2, 11/11) Défis entre amis en MODE DÉMO : tout dans ce navigateur. Les amis robots acceptent les défis
 * au bout d'un instant ; « Terminer (démo) » tranche le défi tout de suite (les robots marquent au hasard). Mêmes règles
 * que le serveur (src/core/defis.ts).
 */

export interface LocalJeuxSave {
  defis?: DefiView[];
}

export interface LocalJeuxHost {
  save(): LocalJeuxSave & { coins: number; seq: number };
  coins(amount: number, reason: string, label: string, earned?: boolean): void;
  game(won: boolean): void;
  bots(): Array<{ id: string; name: string }>;
  feed(message: string): void;
  emit(): void;
  watch<T>(get: () => T, cb: (v: T) => void): () => void;
  act<T>(fn: () => T): Promise<T>;
}

const ME = 'me';

export function createLocalJeux(host: LocalJeuxHost) {
  const s = () => host.save();
  const defis = () => (s().defis ??= []);
  const nid = (p: string) => `${p}${s().seq++}`;
  const find = (id: string) => {
    const c = defis().find((x) => x.id === id);
    if (!c) throw new Error('Défi introuvable.');
    return c;
  };

  function goLive(c: DefiView) {
    c.players = c.players.map((p) => (p.state === 'invited' ? { ...p, state: 'out' } : p));
    if (c.players.filter((p) => p.state === 'in').length < 2) {
      if (c.stake) host.coins(c.stake, 'challenge', 'Défi — mise rendue (personne n’a accepté)');
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
    if (w !== null && c.players[w].userId === ME && pot) host.coins(pot, 'challenge', 'Défi gagné', true);
    if (w === null && me && c.stake) host.coins(c.stake, 'challenge', `Défi — mise rendue (${outcome === 'tie' ? 'égalité' : 'personne n’a marqué'})`);
    if (me) host.game(w !== null && c.players[w].userId === ME);
    Object.assign(c, { status: 'done', outcome, resolvedAt: Date.now(), ...(w !== null ? { winnerId: c.players[w].userId } : {}) });
    if (w !== null) host.feed(`${c.players[w].name} remporte un défi${pot ? ` (${pot} pièces)` : ''} !`);
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
        if (d.stake > s().coins) throw new Error(`Il te manque ${d.stake - s().coins} pièces pour cette mise.`);
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
          players: [{ userId: ME, name: 'Toi', state: 'in', score: 0 }, ...d.invited.map((id) => ({ userId: id, name: bots.get(id) ?? id, state: 'invited' as const, score: 0 }))],
          createdAt: now,
          acceptBy: now + DEFI_ACCEPT_MS,
        };
        if (d.stake) host.coins(-d.stake, 'challenge', 'Défi — mise en séquestre');
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
        if (c.status !== 'pending' || i < 0) throw new Error('Ce défi n’attend plus de réponse.');
        if (accept && c.stake) host.coins(-c.stake, 'challenge', 'Défi — mise en séquestre');
        c.players[i] = { ...c.players[i], state: accept ? 'in' : 'out' };
        if (!c.players.some((p) => p.state === 'invited')) goLive(c);
      }),
    startDefi: (id) =>
      host.act(() => {
        const c = find(id);
        if (c.status !== 'pending') throw new Error('Ce défi n’attend plus de réponse.');
        if (c.players.filter((p) => p.state === 'in').length < 2) throw new Error('Aucun ami n’a encore accepté.');
        goLive(c);
      }),
    cancelDefi: (id) =>
      host.act(() => {
        const c = find(id);
        if (c.status !== 'pending') throw new Error('Ce défi n’attend plus de réponse.');
        if (c.stake) host.coins(c.stake, 'challenge', 'Défi — mise rendue (défi annulé)');
        Object.assign(c, { status: 'cancelled', resolvedAt: Date.now() });
      }),
    demoDefiEnd: (id) =>
      host.act(() => {
        const c = find(id);
        if (c.status !== 'live') return;
        c.players = c.players.map((p) => (p.userId !== ME && p.state === 'in' ? { ...p, score: p.score + (c.kind === 'first' ? 0 : Math.floor(Math.random() * (c.kind === 'stars' ? 40 : 6))) } : p));
        resolve(c, null);
      }),

  };
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
