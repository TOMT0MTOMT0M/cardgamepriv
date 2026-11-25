import { ADVENT_YEAR, adventDay, adventProblem, adventReward } from '../core/avent';
import { fm, type Msg } from '../core/msgs';
import type { ExtrasBackend } from './ecoExtras';

/**
 * (v2.1.13) Calendrier de l'Avent en MODE DÉMO : tout dans ce navigateur, mêmes règles que le serveur
 * (src/core/avent.ts). La démo est toujours en « mode test » : `debugDay` y est accepté.
 */
export interface LocalExtrasSave {
  advent?: Record<string, number[]>;
  godPacks?: number;
}

export interface LocalExtrasHost {
  save(): LocalExtrasSave;
  coins(amount: number, reason: string, label: string | Msg, earned?: boolean): void;
  grantPacks(n: number): void;
  act<T>(fn: () => T): Promise<T>;
}

const KEY = String(ADVENT_YEAR);

export function createLocalExtras(host: LocalExtrasHost) {
  const s = () => host.save();
  const opened = () => s().advent?.[KEY] ?? [];

  const backend: ExtrasBackend = {
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
  };
  return {
    backend,
    opened,
    godPacks: () => s().godPacks ?? 0,
    /** un god pack offert attend ? Le consomme (le prochain booster ouvert en est un). */
    takeGodPack(): boolean {
      if ((s().godPacks ?? 0) <= 0) return false;
      s().godPacks = (s().godPacks ?? 0) - 1;
      return true;
    },
  };
}
