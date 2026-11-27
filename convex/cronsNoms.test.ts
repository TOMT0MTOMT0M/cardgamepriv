import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

/**
 * (27/11) Convex refuse au déploiement un nom de tâche programmée qui n'est pas en ASCII (« Invalid cron identifier …
 * use ASCII letters ») — convex-test ne le voit pas : « rappels série » a bloqué la mise en ligne du lien V3.
 */
test('noms des tâches programmées en ASCII (sinon le déploiement Convex échoue)', () => {
  const src = readFileSync(new URL('./crons.ts', import.meta.url), 'utf8');
  const names = [...src.matchAll(/crons\.\w+\(\s*'([^']*)'/g)].map((m) => m[1]);
  expect(names.length).toBeGreaterThan(5);
  expect(names.filter((n) => /[^\x20-\x7E]/.test(n))).toEqual([]);
});
