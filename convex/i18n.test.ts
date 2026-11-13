/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { fr as frCore } from '../src/core/i18n/fr';
import { en } from '../src/core/i18n/en';
import { compare, format, installLang, langFromDevice, t as tr } from '../src/core/i18n';
import { enData } from '../src/core/i18n/en/data';
import { enErrors } from '../src/core/i18n/en/errors';
import { ERR_FR } from '../src/core/i18n/errFr';
import { MSG_FR, type MsgTpl } from '../src/core/i18n/msgFr';
import { enMsgs } from '../src/core/i18n/en/msgs';
import { fm, parseMsg, renderMsg, statusText, type MsgParams } from '../src/core/msgs';
import { msgIn } from './i18nServer';
import { catalogEntry, frNameOf, setCatalogLang, subthemeById } from '../src/core/sets/themes';
import { CATALOG_EN } from '../src/core/sets/catalog.en';
import { searchCatalog } from '../src/core/cardSearch';
import { UPDATES } from '../src/game/updates.data';
import { UPDATES_EN } from '../src/game/updates.en';
import { errText, fe } from '../src/core/errors';
import { installData } from '../src/core/i18n';
import { ACHIEVEMENTS, ACHIEVEMENT_LADDERS } from '../src/core/economy';
import { SURVEY_FEATURES, SURVEY_UNIVERSES } from '../src/core/survey';
import { RARITIES } from '../src/core/rarity';
import { WONDER_ATMOSPHERES } from '../src/core/wonderDiorama';
import { COUNTRY_NAMES } from '../src/core/art/flags';
import { ACCENTS, BADGES, BANNERS, FRAMES, OPENINGS, TITLES, VITRINES } from '../src/core/cosmetics';

// toutes les parties françaises (fr.ts + fr/*.ts des modules chargés à la demande)
const parts = import.meta.glob<{ fr: Record<string, unknown> }>('../src/core/i18n/fr/*.ts', { eager: true });
const fr = Object.assign({}, frCore, ...Object.values(parts).map((p) => p.fr)) as typeof frCore;
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
  test('tables de données : chaque succès a son anglais (libellé, consigne, échelle)', () => {
    const miss: string[] = [];
    for (const a of ACHIEVEMENTS) for (const k of [`ach.${a.id}`, `ach.${a.id}.how`]) if (!enData[k]?.trim()) miss.push(k);
    for (const l of ACHIEVEMENT_LADDERS) if (!enData[`ach.stat.${l.stat}`]?.trim()) miss.push(`ach.stat.${l.stat}`);
    for (const c of [...ACCENTS, ...BANNERS, ...FRAMES, ...TITLES, ...BADGES, ...VITRINES, ...OPENINGS]) if (!enData[`cos.${c.label}`]?.trim()) miss.push(`cos.${c.label}`);
    for (const o of OPENINGS) if (!enData[`cos.blurb.${o.id}`]) miss.push(`cos.blurb.${o.id}`);
    for (const r of RARITIES) if (!enData[`rar.${r.id}`]) miss.push(`rar.${r.id}`);
    for (const id of Object.keys(WONDER_ATMOSPHERES)) if (!enData[`wonder.${id}`]) miss.push(`wonder.${id}`);
    for (const c of Object.keys(COUNTRY_NAMES)) if (!enData[`country.${c}`]) miss.push(`country.${c}`);
    for (const [k, list] of [['u', SURVEY_UNIVERSES], ['f', SURVEY_FEATURES]] as const) for (const o of list) for (const x of [`sv.${k}.${o.id}`, `sv.${k}.${o.id}.hint`]) if (!enData[x]) miss.push(x);
    expect(miss).toEqual([]);
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

describe('version anglaise : erreurs à code (lot 4)', () => {
  test('chaque code a son anglais, avec les mêmes paramètres (ou moins)', () => {
    const vars = (m: string) => new Set(m.match(/\{\w+\}/g) ?? []);
    for (const k of Object.keys(ERR_FR) as (keyof typeof ERR_FR)[]) {
      expect(enErrors[k]?.trim(), k).toBeTruthy();
      const fr = vars(ERR_FR[k]);
      for (const v of vars(enErrors[k])) expect(fr.has(v), `${k} ${v}`).toBe(true);
    }
  });
  test('fe garde le texte français + le code ; errText le rend dans la langue', () => {
    const m = fe('market.10', { p0: 300 });
    expect(m.startsWith('Prix trop élevé : 300 pièces au maximum pour cette étoile.')).toBe(true);
    expect(m).toContain('⟦market.10{"p0":300}⟧');
    expect(errText(m)).toBe('Prix trop élevé : 300 pièces au maximum pour cette étoile.');
    installLang('en', en);
    installData(Object.fromEntries(Object.entries(enErrors).map(([k, v]) => [`err.${k}`, v])));
    expect(errText(m)).toBe('Price too high: 300 coins max for this star.');
    expect(errText('Ancien message sans code')).toBe('Ancien message sans code');
    installLang('fr', fr);
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

describe('version anglaise : messages stockés (fil, pièces, notifications — lot 4)', () => {
  const ph = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',');
  const forms = (x: MsgTpl) => (typeof x === 'string' ? [x] : [x.one, x.other]);
  test('chaque modèle a son anglais, avec les mêmes paramètres', () => {
    for (const [k, fr] of Object.entries(MSG_FR) as [keyof typeof MSG_FR, MsgTpl][]) {
      const e = enMsgs[k];
      expect(e, k).toBeTruthy();
      const p = ph(forms(fr).join(' '));
      for (const f of forms(e)) expect(ph(f), k).toBe(p.split(',').filter((x) => f.includes(`{${x}}`)).join(','));
      expect(ph(forms(e).join(' ')), k).toBe(p);
    }
  });
  test('fm garde le français mot pour mot ; msgText le rend dans la langue, refs comprises', () => {
    const m = fm('f.pull', { name: 'Léa', card: 'Pikachu', cardId: 'x', rarity: 'Mythique', rarityId: 'mythic', mint: 1234 });
    expect(m.text).toBe('Léa a obtenu Pikachu [Mythique #1234] !');
    expect(fm('c.shop', { n: 1 }).text).toBe('Achat de 1 booster');
    expect(fm('c.shop', { n: 3 }).text).toBe('Achat de 3 boosters');
    expect(fm('f.roulette', { number: 7, name: 'Tom', coins: 12000, cards: 4, value: 15500 }).text).toBe('🎡 Le 7 sort à la roulette : Tom remporte tout le pot — 12 000 pièces et 4 cartes (15 500 de valeur) !');
    installLang('en', en);
    installData({ 'rar.mythic': 'Mythic' });
    expect(renderMsg('f.pull', m.params, 'en', enMsgs)).toBe('Léa got Pikachu [Mythic #1234]!');
    expect(renderMsg('f.royaleTie', { players: 4, best: 9, names: ['A', 'B', 'C'] }, 'en', enMsgs)).toBe('4-player Battle Royale: tied at 9★ between A, B and C, the pot is split at random!');
    expect(renderMsg('c.shop', { n: 1 }, 'en', enMsgs)).toBe('Bought 1 booster');
    installLang('fr', fr);
    installData({});
  });
  test('la migration reconnaît chaque modèle (les anciennes lignes retrouvent leur code)', () => {
    const sample = (k: string): MsgParams => {
      const p: MsgParams = {};
      for (const f of forms(MSG_FR[k as keyof typeof MSG_FR])) for (const [, x] of f.matchAll(/\{(\w+)\}/g)) p[x!] = x === 'n' ? 2 : `«${x}»`;
      return p;
    };
    for (const k of Object.keys(MSG_FR)) {
      const m = fm(k as keyof typeof MSG_FR, sample(k));
      const back = parseMsg(m.text, k.slice(0, 2) as 'f.' | 'c.' | 's.');
      expect(back?.key, `${k} : ${m.text}`).toBe(k);
    }
    expect(parseMsg('Texte inconnu', 'f.')).toBeNull();
    expect(statusText('Contemple son tirage')).toBe('Contemple son tirage'); // (français : tel quel)
  });
  test('migrations:i18nMessages code les anciennes lignes, une seule fois', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { discordId: '1', username: 'tom', displayName: 'tom', packBalance: 1, lastDailyClaimAt: 0, totalPacksOpened: 0, lastSeenAt: 1 });
      const f1 = await ctx.db.insert('activityFeed', { userId, displayName: 'tom', kind: 'trade', message: 'tom et Léa ont conclu un échange !', createdAt: 1 });
      const f2 = await ctx.db.insert('activityFeed', { userId, displayName: 'tom', kind: 'game', message: 'Un texte que personne ne reconnaît', createdAt: 2 });
      const c1 = await ctx.db.insert('coinTx', { userId, amount: -300, reason: 'shop', label: 'Achat de 3 boosters', createdAt: 3 });
      const c2 = await ctx.db.insert('coinTx', { userId, amount: 1000, reason: 'calendar', label: 'Calendrier — jour 30', createdAt: 4 });
      return { f1, f2, c1, c2 };
    });
    await t.mutation(internal.migrations.i18nMessages, {});
    await t.finishAllScheduledFunctions(() => {});
    const rows = await t.run(async (ctx) => Promise.all([ctx.db.get(ids.f1), ctx.db.get(ids.f2), ctx.db.get(ids.c1), ctx.db.get(ids.c2)]));
    expect(rows[0]).toMatchObject({ msgKey: 'f.trade', msgParams: { name: 'tom', other: 'Léa' } });
    expect(rows[1]?.msgKey).toBeUndefined();
    expect(rows[2]).toMatchObject({ labelKey: 'c.shop', labelParams: { n: 3 } });
    expect(rows[3]).toMatchObject({ labelKey: 'c.calendar', labelParams: { day: 30 } });
    const again = await t.mutation(internal.migrations.i18nMessages, { part: 'coins' });
    expect(again.done).toBe(0);
  });
  test('notification dans la langue du joueur (users.lang)', () => {
    expect(msgIn('fr', fm('n.tradeOffer', { name: 'Léa' }))).toBe('Léa te propose un échange');
    expect(msgIn('en', fm('n.tradeOffer', { name: 'Léa' }))).toBe('Léa offers you a trade');
    expect(msgIn('en', fm('n.tradeOfferBody', { n: 1, m: 2 }))).toBe('1 card for 2: see Trades.');
    expect(msgIn('en', 'Texte libre')).toBe('Texte libre');
    expect(tr('title.shop' as never)).not.toBe(''); // (rien n'a fui : la langue active est restée le français)
  });
});

describe('version anglaise : catalogue (lot 5)', () => {
  test('noms anglais installés et retirés sur place ; la recherche trouve les deux langues ; ids intacts', () => {
    const e = catalogEntry('pkm-bulbizarre')!;
    expect(e.name).toBe('Bulbizarre');
    setCatalogLang(CATALOG_EN);
    expect(e.name).toBe('Bulbasaur');
    expect(frNameOf(e)).toBe('Bulbizarre');
    expect(searchCatalog('bulbasaur').some((x) => x.id === e.id)).toBe(true);
    expect(searchCatalog('bulbizarre').some((x) => x.id === e.id)).toBe(true);
    expect(subthemeById('pkm-unys')?.label).toBe('Unova');
    setCatalogLang(null);
    expect(e.name).toBe('Bulbizarre');
    expect(subthemeById('pkm-unys')?.label).toBe('Unys');
    // (chaque id anglais existe dans le catalogue)
    for (const id of Object.keys(CATALOG_EN.cards)) expect(catalogEntry(id), id).toBeTruthy();
    for (const id of Object.keys(CATALOG_EN.subs)) expect(subthemeById(id), id).toBeTruthy();
  });
});

describe('version anglaise : notes de patch (lot 7)', () => {
  test('updates.en.ts a exactement la structure de updates.data.ts', () => {
    expect(UPDATES_EN.length).toBe(UPDATES.length);
    UPDATES.forEach((m, i) => {
      const e = UPDATES_EN[i]!;
      expect(e.entries.length, m.month).toBe(m.entries.length);
      m.entries.forEach((x, j) => {
        expect(e.entries[j]!.tag).toBe(x.tag);
        expect(e.entries[j]!.points.length, x.title).toBe(x.points.length);
        x.points.forEach((p, k) => expect(e.entries[j]!.points[k]!.includes('{CARTES}'), p).toBe(p.includes('{CARTES}')));
      });
    });
  });
});
