import { fe } from '../core/errors';
import { ADVENT_YEAR, adventDay, adventProblem, adventReward } from '../core/avent';
import { claimableUniqueTitles, uniqueTitle, uniqueTitleProgress, uniqueTitleSet, type UniqueTitleHolder } from '../core/uniqueTitles';
import { fm, type Msg } from '../core/msgs';
import { t as tr } from '../core/i18n';
import { SUB_EXTRA_PACKS, SUB_PRICE_EUR, bebouCardProblem, bebouMediaProblem, pollOpen, subActive, subExtend, type BebouCardStatus } from '../core/abo';
import type { AboPoll, ExtrasBackend } from './ecoExtras';

/**
 * (20/11) Titres uniques + calendrier de l'Avent en MODE DÉMO : tout dans ce navigateur, mêmes règles que le serveur
 * (src/core/uniqueTitles.ts, src/core/avent.ts). La démo est toujours en « mode test » : `debugDay` y est accepté.
 */
export interface LocalExtrasSave {
  titles?: UniqueTitleHolder[];
  advent?: Record<string, number[]>;
  godPacks?: number;
  /** abonnement de démonstration (activé / arrêté par le bouton de la page) */
  subUntil?: number;
  subAskAt?: number;
  bebouCard?: { title: string; idea: string; status: BebouCardStatus; mediaUrl?: string; updatedAt: number };
  aboVote?: string;
}

export interface LocalExtrasHost {
  save(): LocalExtrasSave;
  coins(amount: number, reason: string, label: string | Msg, earned?: boolean): void;
  grantPacks(n: number): void;
  ownedIds(): Iterable<string>;
  feed(message: string | Msg): void;
  watch<T>(get: () => T, cb: (v: T) => void): () => void;
  act<T>(fn: () => T): Promise<T>;
}

const ME = 'me';
const KEY = String(ADVENT_YEAR);

export function createLocalExtras(host: LocalExtrasHost) {
  const s = () => host.save();
  const titles = () => (s().titles ??= []);
  const opened = () => s().advent?.[KEY] ?? [];

  const backend = {
    watchTitles: (cb) => host.watch(() => titles(), cb),
    claimTitles: (titleId) =>
      host.act(() => {
        const owned = new Set(host.ownedIds());
        const taken = new Set(titles().map((x) => x.titleId));
        const one = titleId === undefined ? undefined : uniqueTitle(titleId);
        if (titleId !== undefined && !one) throw new Error(fe('titres.1'));
        if (one) {
          const by = titles().find((x) => x.titleId === one.id);
          if (by && by.userId !== ME) throw new Error(fe('titres.2', { p0: by.name, p1: one.label }));
          if (by) return [];
          const pr = uniqueTitleProgress(one, owned);
          if (!pr.done) throw new Error(fe('titres.3', { p0: pr.total - pr.have, p1: pr.total - pr.have > 1 ? 's' : '', p2: one.label }));
        }
        const won = claimableUniqueTitles(owned, taken).filter((x) => !one || x.id === one.id);
        for (const x of won) {
          const name = tr('chat.me');
          titles().push({ titleId: x.id, userId: ME, name, at: Date.now() });
          host.feed(fm('f.utitle', { name, titleId: x.id, utitle: x.label, setId: x.setId, set: uniqueTitleSet(x)?.label ?? x.setId }));
        }
        return won.map((x) => x.id);
      }),
    openAdvent: (day, debugDay) =>
      host.act(() => {
        const today = debugDay ?? adventDay(Date.now());
        const problem = adventProblem(day, today, opened());
        if (problem) throw new Error(problem);
        const reward = adventReward(day);
        const next = [...opened(), day].sort((a, b) => a - b);
        s().advent = { ...(s().advent ?? {}), [KEY]: next };
        if (reward.coins) host.coins(reward.coins, 'advent', fm('c.advent', { day }), true);
        const packs = (reward.packs ?? 0) + (reward.god ? 1 : 0);
        if (packs) host.grantPacks(packs);
        if (reward.god) s().godPacks = (s().godPacks ?? 0) + 1;
        return { day, reward, opened: next };
      }),
    resetAdvent: () =>
      host.act(() => {
        const { [KEY]: _gone, ...rest } = s().advent ?? {};
        void _gone;
        s().advent = rest;
      }),
  } as ExtrasBackend;
  // vote d'exemple de la démo : toujours ouvert, encore 6 jours ; les robots ont déjà voté
  const DEMO_POLL = { id: 'demo-poll', title: tr('ab.demoPoll'), options: [{ id: 'o1', label: tr('ab.demoO1') }, { id: 'o2', label: tr('ab.demoO2') }, { id: 'o3', label: tr('ab.demoO3') }], bots: { o1: 4, o2: 2, o3: 1 } as Record<string, number> };
  const poll = (): AboPoll => {
    const mine = s().aboVote;
    const closesAt = Math.ceil(Date.now() / 86_400_000) * 86_400_000 + 6 * 86_400_000;
    const counts = Object.fromEntries(DEMO_POLL.options.map((o) => [o.id, DEMO_POLL.bots[o.id] + (mine === o.id ? 1 : 0)]));
    return { id: DEMO_POLL.id, title: DEMO_POLL.title, options: DEMO_POLL.options, closesAt, open: pollOpen({ closesAt }), total: 7 + (mine ? 1 : 0), ...(mine ? { mine, counts } : {}) };
  };
  Object.assign(backend, {
    aboPage: async () => ({ priceEur: SUB_PRICE_EUR, extraPacks: SUB_EXTRA_PACKS, weroTo: tr('ab.demoWero'), card: s().bebouCard ?? null, poll: poll() }),
    aboAsk: () =>
      host.act(() => {
        s().subAskAt = Date.now();
      }),
    aboSubmitCard: (title, idea, image) =>
      host.act(() => {
        if (!subActive(s())) throw new Error(fe('abo.1'));
        const bad = bebouCardProblem(title, idea) ?? (image && image !== 'keep' ? bebouMediaProblem(image.size, image.type) : null);
        if (bad) throw new Error(bad);
        // (démo : l'image n'est pas gardée d'une visite à l'autre, seulement montrée le temps de la session)
        const mediaUrl = image === 'keep' ? s().bebouCard?.mediaUrl : image ? URL.createObjectURL(image) : undefined;
        s().bebouCard = { title: title.trim(), idea: idea.trim(), status: 'new', updatedAt: Date.now(), ...(mediaUrl ? { mediaUrl } : {}) };
      }),
    aboVote: (_pollId, optionId) =>
      host.act(() => {
        if (!subActive(s())) throw new Error(fe('abo.1'));
        if (!DEMO_POLL.options.some((o) => o.id === optionId)) throw new Error(fe('abo.6'));
        s().aboVote = optionId;
        return poll();
      }),
    aboDemoToggle: () =>
      host.act(() => {
        s().subUntil = subActive(s()) ? Date.now() : subExtend(undefined, Date.now());
        s().subAskAt = undefined;
      }),
  } satisfies Partial<ExtrasBackend>);
  return {
    backend,
    opened,
    sub: () => ({ until: s().subUntil ?? 0, askedAt: s().subAskAt ?? 0 }),
    godPacks: () => s().godPacks ?? 0,
    /** un god pack offert attend ? Le consomme (le prochain booster ouvert en est un). */
    takeGodPack(): boolean {
      if ((s().godPacks ?? 0) <= 0) return false;
      s().godPacks = (s().godPacks ?? 0) - 1;
      return true;
    },
  };
}
