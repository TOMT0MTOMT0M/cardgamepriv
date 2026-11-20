/// <reference types="vite/client" />
/**
 * (14/11, refonte de la personnalisation) fonds, cadres dessinés, styles de titre, vitrines, accords — données pures de
 * src/core/cosmetics.ts : le serveur ne garde que du débloqué, aucun ancien choix n'est perdu, les accords se calculent
 * sur ce qui est porté.
 */
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { ACHIEVEMENTS, achievementDone, achievementStats, emptyEcon } from '../src/core/economy';
import { BACKGROUNDS, DRAWN_FRAMES, FRAMES, TITLE_STYLES, VITRINES, accordOf, backgroundOf, cleanCosmetics, cosmeticsOf, frameOf, titleStyleOf, type PlayerStats } from '../src/core/cosmetics';

const zero: PlayerStats = { packsOpened: 0, uniques: 0, total: 1000, mythics: 0, legendaries: 0, secrets: 0, fullSubthemes: 0, tradesDone: 0, contractsSigned: 0, streak: 0, worldUniques: 0, gamingUniques: 0, popUniques: 0, sportUniques: 0 };

describe('personnalisation du profil — catalogue du 14/11', () => {
  test('les volumes annoncés : 13 fonds, 13 cadres dessinés, 10 styles de titre, 6 vitrines de plus', () => {
    expect(BACKGROUNDS.filter((b) => b.id !== 'none')).toHaveLength(13);
    expect(DRAWN_FRAMES).toHaveLength(13);
    expect(TITLE_STYLES).toHaveLength(10);
    expect(VITRINES).toHaveLength(16);
  });

  test('aucun identifiant en double dans une famille, les anciens cadres sont toujours là', () => {
    for (const list of [BACKGROUNDS, FRAMES, TITLE_STYLES, VITRINES]) expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
    for (const id of ['none', 'c-rose', 'a-eclairs', 'a-feu', 'a-ange', 'a-coeurs', 'a-galaxie', 'a-neon', 's-podium']) expect(FRAMES.some((f) => f.id === id), id).toBe(true);
    // un cadre d'avant le 07/11 et une couleur libre s'affichent toujours
    expect(frameOf('bronze').id).toBe('bronze');
    expect(frameOf('#12ab34').css).toBe('#12ab34');
  });

  test('toutes les nouveautés se gagnent dans les succès : 41 éléments, un palier chacun, aucun palier ne porte deux cosmétiques', () => {
    const fresh = [...BACKGROUNDS.filter((b) => b.id !== 'none'), ...DRAWN_FRAMES, ...TITLE_STYLES.filter((t) => t.id !== 'usine'), ...VITRINES.slice(10)];
    expect(fresh).toHaveLength(41);
    expect(fresh.filter((c) => !c.need)).toEqual([]);
    expect(new Set(fresh.map((c) => c.need)).size).toBe(41);
    for (const c of fresh) {
      expect(ACHIEVEMENTS.some((a) => a.id === c.need), `${c.id} → ${c.need}`).toBe(true);
      expect(cosmeticsOf(c.need!), c.need).toHaveLength(1);
    }
    // un palier « cosmétique seul » porte toujours un cosmétique (sinon il ne donnerait rien)
    for (const a of ACHIEVEMENTS) if (a.cos) expect(cosmeticsOf(a.id).length, a.id).toBeGreaterThan(0);
    // les choix par défaut restent à tout le monde
    expect(TITLE_STYLES[0].unlock(zero)).toBe(true);
    expect(BACKGROUNDS[0].unlock(zero)).toBe(true);
  });

  test('du facile au très long, sans lien avec la richesse de l’élément', () => {
    const tierOf = (id: string, list = [...BACKGROUNDS, ...DRAWN_FRAMES, ...TITLE_STYLES, ...VITRINES]) => ACHIEVEMENTS.find((a) => a.id === list.find((c) => c.id === id)!.need)!.tier;
    // beaux et faciles
    for (const id of ['braise', 'nuages', 'neon', 'n-engrenage', 'n-chat']) expect(tierOf(id), id).toBe(1);
    // sobres et longs
    for (const id of ['n-filet', 'capitales']) expect(tierOf(id), id).toBe(3);
    // riches et longs
    for (const id of ['n-orbite', 'coffre', 'grave']) expect(tierOf(id), id).toBeGreaterThanOrEqual(3);
  });

  test('49 paliers de plus (137 en tout), ids uniques, échelle « Tous les thèmes »', () => {
    expect(ACHIEVEMENTS).toHaveLength(141); // (20/11) + 4 paliers de l'Avent 2026 (noel26-…)
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(141);
    const all = achievementStats({ ...zero, worldUniques: 120, gamingUniques: 30, popUniques: 400, sportUniques: 26 }, emptyEcon());
    expect(all.allThemes).toBe(26);
    expect(achievementDone(ACHIEVEMENTS.find((a) => a.id === 'all-25')!, all)).toBe(true);
    expect(achievementDone(ACHIEVEMENTS.find((a) => a.id === 'all-100')!, all)).toBe(false);
  });

  test('le serveur écarte le verrouillé, garde le débloqué, ne range pas les choix par défaut', () => {
    const locked = cleanCosmetics({ background: 'braise', titleStyle: 'neon', frame: 'n-orbite', vitrine: 'coffre' }, zero);
    expect(locked.background).toBeUndefined();
    expect(locked.titleStyle).toBeUndefined();
    expect(locked.frame).toBeUndefined();
    expect(locked.vitrine).toBeUndefined();
    const rich: PlayerStats = { ...zero, packsOpened: 30, burned: 12, tradesDone: 3, worldUniques: 30, gamingUniques: 30, popUniques: 30, sportUniques: 30 };
    const kept = cleanCosmetics({ background: 'hachures', titleStyle: 'bulle', vitrine: 'galerie' }, rich);
    expect(kept.background).toBe('hachures');
    expect(kept.titleStyle).toBe('bulle');
    expect(kept.vitrine).toBe('galerie');
    expect(cleanCosmetics({ background: 'grain' }, rich).background).toBe('grain');
    const def = cleanCosmetics({ background: 'none', titleStyle: 'usine' }, zero);
    expect('background' in def).toBe(false);
    expect('titleStyle' in def).toBe(false);
    // un identifiant inconnu (ancienne version, faute de frappe) ne casse rien
    expect(cleanCosmetics({ background: 'inconnu' }, zero).background).toBeUndefined();
    expect(backgroundOf('inconnu').id).toBe('none');
    expect(titleStyleOf(undefined).id).toBe('usine');
  });

  test('débloqué par son palier : Braise à 50 doublons brûlés, Néon (titre) à 5 contrats', () => {
    expect(cleanCosmetics({ background: 'braise' }, { ...zero, burned: 49 }).background).toBeUndefined();
    expect(cleanCosmetics({ background: 'braise' }, { ...zero, burned: 50 }).background).toBe('braise');
    expect(cleanCosmetics({ titleStyle: 'neon' }, { ...zero, contractsSigned: 5 }).titleStyle).toBe('neon');
  });

  test('accords : cadre + fond de la même matière, complet avec le titre ou la vitrine', () => {
    expect(accordOf({})).toBeNull();
    expect(accordOf({ frame: 'a-feu' })).toBeNull();
    expect(accordOf({ frame: 'a-feu', background: 'braise' })).toEqual({ matter: 'feu', full: false });
    expect(accordOf({ frame: 'a-eclairs', background: 'orage' })?.matter).toBe('foudre');
    expect(accordOf({ frame: 'n-ronces', background: 'orage' })?.matter).toBe('ombre');
    expect(accordOf({ frame: 'n-pixel', background: 'damier', titleStyle: 'pixel' })).toEqual({ matter: 'retro', full: true });
    expect(accordOf({ frame: 'n-laurier', background: 'terrain', vitrine: 'vestiaire' })).toEqual({ matter: 'sport', full: true });
    expect(accordOf({ frame: 'n-laurier', background: 'braise' })).toBeNull();
  });
});

/** (14/11) chat et amis : cadre, titre, écriture et couleur voyagent dans la carte publique (table `presence`). */
describe('personnalisation du profil — carte publique (chat, amis)', () => {
  const modules = import.meta.glob(['./**/*.ts', './**/*.js', '!./**/*.test.ts', '!./**/*.testlib.ts', '!./**/*.d.ts']);
  test('enregistrer ses cosmétiques met à jour la carte publique ; la liste du club les sert, sans rien d’autre du profil', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('users', { discordId: 'd1', username: 'alice', displayName: 'Alice', packBalance: 15, lastDailyClaimAt: 0, totalPacksOpened: 60, lastSeenAt: Date.now(), coins: 0 });
      await ctx.db.insert('sessions', { token: 'tok', userId: id, createdAt: Date.now(), expiresAt: Date.now() + 86400000 });
      return id;
    });
    await t.mutation(internal.migrations.backfillPresence, {});
    expect((await t.query(api.users.friends, {}))[0].cos).toBeUndefined();
    // « Bébou débutant » est libre ; le cadre Engrenage demande 50 boosters (60 ouverts) ; le fond n'est pas dans la carte
    const kept = await t.mutation(api.profiles.setCosmetics, { sessionToken: 'tok', title: 'rookie', frame: 'n-engrenage', accent: 'lagon', background: 'hachures' });
    expect(kept.frame).toBe('n-engrenage');
    const club = await t.query(api.users.friends, {});
    expect(club[0].cos).toEqual({ frame: 'n-engrenage', title: 'rookie', accent: 'lagon' });
    const row = await t.run((ctx) => ctx.db.query('presence').withIndex('by_user', (q) => q.eq('userId', userId)).first());
    expect(row?.cos?.frame).toBe('n-engrenage');
    // tout retirer : la carte ne garde rien
    await t.mutation(api.profiles.setCosmetics, { sessionToken: 'tok' });
    expect((await t.query(api.users.friends, {}))[0].cos).toBeUndefined();
  });
  test('(15/11) passage d\'office par « Personnaliser » : une fois par compte, pas pour un compte tout neuf', async () => {
    const t = convexTest(schema, modules);
    // compte tout neuf : la visite guidée le marque aussi (il n'a rien à équiper)
    const { token } = await t.mutation(internal.accounts.createPw, { loginKey: 'neo', displayName: 'Neo', pwHash: 's1$a$b' });
    const me = async () => (await t.query(api.users.me, { sessionToken: token }))!;
    expect((await me()).atelierSeen).toBe(false);
    await t.mutation(api.users.markGuideSeen, { sessionToken: token });
    expect((await me()).atelierSeen).toBe(true);
    // joueur déjà là : pas encore amené, puis marqué une fois pour toutes (la date ne bouge plus)
    await t.mutation(internal.admin.resetAtelier, { name: 'neo' });
    expect((await me()).atelierSeen).toBe(false);
    await t.mutation(api.users.markAtelierSeen, { sessionToken: token });
    expect((await me()).atelierSeen).toBe(true);
    const at = async () => (await t.run((ctx) => ctx.db.query('users').collect()))[0]!.atelierSeenAt;
    const first = await at();
    await t.mutation(api.users.markAtelierSeen, { sessionToken: token });
    expect(await at()).toBe(first);
  });
});
