/** God pack (08/11) : 1 booster sur 1 000, toutes les cartes 4★+, au moins une 5★ et une 6★. */
import { describe, expect, test } from 'vitest';
import '../src/core/sets/catalogFull';
import { GOD_PACK_CHANCE, rollPackEx } from '../src/core/packRoll';

const rank: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6, secret: 7 };
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('god pack', () => {
  test('forcé : que des 4★+, au moins une 5★ et une 6★, pour chaque booster', () => {
    const rand = seeded(7);
    for (const req of [{ kind: 'bebou' as const }, { kind: 'theme' as const, themeId: 'gaming' }, { kind: 'theme' as const, themeId: 'pop' }, { kind: 'theme' as const, themeId: 'sport' }, { kind: 'theme' as const, themeId: 'monde' }]) {
      for (let i = 0; i < 400; i++) {
        const { slots, god } = rollPackEx({ ...req, forceGod: true }, rand);
        expect(god).toBe(true);
        expect(slots).toHaveLength(5);
        for (const s of slots) expect(rank[s.rarity]).toBeGreaterThanOrEqual(4);
        expect(slots.some((s) => s.rarity === 'mythic')).toBe(true);
        expect(slots.some((s) => s.rarity === 'legendary')).toBe(true);
      }
    }
  });
  test('fréquence ≈ 1 sur 1 000, et un booster normal n’est jamais marqué god', () => {
    const rand = seeded(42);
    let n = 0;
    const N = 200_000;
    for (let i = 0; i < N; i++) if (rollPackEx({ kind: 'bebou' }, rand).god) n++;
    expect(GOD_PACK_CHANCE).toBe(1 / 1000);
    expect(n / N).toBeGreaterThan(0.0007);
    expect(n / N).toBeLessThan(0.0013);
  });
});
