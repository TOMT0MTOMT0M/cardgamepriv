/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { fr } from '../src/core/i18n/fr';
import { en } from '../src/core/i18n/en';
import { compare, format, installLang, langFromDevice, t as tr } from '../src/core/i18n';

const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.d.ts']);

describe('version anglaise : règle de langue et dictionnaires', () => {
  test('langue de l’appareil : fr, fr-FR, fr-BE, fr-CH (sans casse) → français ; le reste → anglais', () => {
    for (const x of ['fr', 'FR', 'fr-FR', 'fr-fr', 'fr-BE', 'fr-CH', 'Fr-Ch', 'fr_FR']) expect(langFromDevice(x)).toBe('fr');
    for (const x of ['fr-CA', 'fr-LU', 'en', 'en-US', 'en-GB', 'de-DE', 'es', '', null, undefined]) expect(langFromDevice(x)).toBe('en');
  });
  test('toutes les clés françaises existent en anglais (et rien de plus), aucune vide', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    for (const [k, v] of Object.entries(en)) {
      const parts = typeof v === 'string' ? [v] : Object.values(v);
      for (const p of parts) expect(p.trim(), k).not.toBe('');
    }
  });
  test('mêmes paramètres {x} dans les deux langues', () => {
    const vars = (m: unknown) => [...new Set(JSON.stringify(m).match(/\{\w+\}/g) ?? [])].sort();
    for (const k of Object.keys(fr) as (keyof typeof fr)[]) expect(vars(en[k]), k).toEqual(vars(fr[k]));
  });
  test('paramètres et pluriels (Intl.PluralRules)', () => {
    const d = { ...fr, 'x.n': { one: '{n} carte', other: '{n} cartes' } } as never;
    expect(format(d, 'fr', 'x.n' as never, { n: 0 })).toBe('0 carte');
    expect(format(d, 'fr', 'x.n' as never, { n: 1 })).toBe('1 carte');
    expect(format(d, 'fr', 'x.n' as never, { n: 2 })).toBe('2 cartes');
    expect(format(d, 'en', 'x.n' as never, { n: 1 })).toBe('1 carte');
    expect(format(d, 'en', 'x.n' as never, { n: 0 })).toBe('0 cartes');
    installLang('en', en);
    expect(tr('title.shop')).toBe('Bébou — shop');
    installLang('fr', fr);
    expect(tr('title.shop')).toBe('Bébou — boutique');
    expect(['é', 'e', 'f'].sort(compare)).toEqual(['e', 'é', 'f']);
  });
});

describe('version anglaise : langue du compte (users.lang)', () => {
  test('setLang écrit la langue effective et le choix manuel, sans réécrire si rien ne change', async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: '1', username: 'tom', displayName: 'tom', packBalance: 1, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 1 });
      await ctx.db.insert('sessions', { userId, token: 'tok', createdAt: 1, expiresAt: Date.now() + 86_400_000 });
      return userId;
    });
    const read = () => t.run((ctx) => ctx.db.get(id));
    await t.mutation(api.users.setLang, { sessionToken: 'tok', lang: 'fr', manual: false });
    expect((await read())?.lang).toBeUndefined(); // (français sans choix : rien à écrire)
    await t.mutation(api.users.setLang, { sessionToken: 'tok', lang: 'en', manual: false });
    expect(await read()).toMatchObject({ lang: 'en', langSet: false });
    await t.mutation(api.users.setLang, { sessionToken: 'tok', lang: 'en', manual: true });
    expect(await read()).toMatchObject({ lang: 'en', langSet: true });
    const at = (await read())!._creationTime;
    await t.mutation(api.users.setLang, { sessionToken: 'tok', lang: 'en', manual: false }); // (même langue : le choix reste)
    expect(await read()).toMatchObject({ lang: 'en', langSet: true, _creationTime: at });
    const me = await t.query(api.users.me, { sessionToken: 'tok' });
    expect(me).toMatchObject({ lang: 'en', langSet: true });
  });
});
