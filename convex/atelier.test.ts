/**
 * (14/11, refonte de la personnalisation) fonds, cadres dessinés, styles de titre, vitrines, accords — données pures de
 * src/core/cosmetics.ts : le serveur ne garde que du débloqué, aucun ancien choix n'est perdu, les accords se calculent
 * sur ce qui est porté.
 */
import { describe, expect, test } from 'vitest';
import { ACHIEVEMENTS } from '../src/core/economy';
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

  test('les 22 éléments à gagner : un palier chacun, jamais un palier qui donnait déjà un cosmétique', () => {
    const fresh = [...BACKGROUNDS, ...DRAWN_FRAMES, ...TITLE_STYLES, ...VITRINES.slice(10)].filter((c) => c.need);
    expect(fresh).toHaveLength(22);
    expect(new Set(fresh.map((c) => c.need)).size).toBe(22);
    for (const c of fresh) {
      const a = ACHIEVEMENTS.find((x) => x.id === c.need);
      expect(a, c.id).toBeTruthy();
      expect(a!.cos, `${c.id} → ${c.need}`).toBeUndefined();
      expect(cosmeticsOf(c.need!)).toHaveLength(1);
    }
  });

  test('le serveur garde le libre, écarte le verrouillé, ne range pas les choix par défaut', () => {
    const kept = cleanCosmetics({ background: 'trame', titleStyle: 'machine', frame: 'n-crans', vitrine: 'galerie' }, zero);
    expect(kept.background).toBe('trame');
    expect(kept.titleStyle).toBe('machine');
    expect(kept.frame).toBe('n-crans');
    expect(kept.vitrine).toBe('galerie');
    const locked = cleanCosmetics({ background: 'braise', titleStyle: 'neon', frame: 'n-orbite', vitrine: 'coffre' }, zero);
    expect(locked.background).toBeUndefined();
    expect(locked.titleStyle).toBeUndefined();
    expect(locked.frame).toBeUndefined();
    expect(locked.vitrine).toBeUndefined();
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
