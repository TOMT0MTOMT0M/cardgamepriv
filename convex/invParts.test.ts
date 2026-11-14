/**
 * (v2.0.5) Collection de plus de 8 192 lignes : Convex refuse un tableau de plus de 8 192 éléments — avec `parts: true`
 * la collection part en tranches (inventory.collectionFull, userCollectionSlim, profiles.profile).
 */
import { describe, expect, test } from 'vitest';
import { INV_PART, inParts } from './inventory';

describe('collection en tranches', () => {
  test('aucune tranche ne dépasse INV_PART, rien n’est perdu, l’ordre est gardé', () => {
    const rows = Array.from({ length: 8440 }, (_, i) => i);
    const { parts } = inParts(rows);
    expect(INV_PART).toBeLessThanOrEqual(8192);
    expect(parts.length).toBe(3);
    expect(parts.every((p) => p.length <= INV_PART)).toBe(true);
    expect(parts.flat()).toEqual(rows);
  });
  test('collection vide : aucune tranche', () => {
    expect(inParts([]).parts).toEqual([]);
  });
});
