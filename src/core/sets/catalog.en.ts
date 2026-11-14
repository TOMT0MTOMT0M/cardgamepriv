/**
 * CATALOGUE EN ANGLAIS (tout) — GÉNÉRÉ par scripts/make-catalogue-en.py (ne pas éditer à la main). Chargé par le jeu SEULEMENT en
 * anglais (src/core/sets/catalog.en.ts). Id de carte → nom anglais, seulement quand il diffère du nom actuel.
 */
import type { CatalogLang } from './themesCore';
import { EN as pokemon151 } from './pokemon151.en';
import { EN as lol } from './lol.en';
import { EN as valorant } from './valorant.en';
import { EN as jeuxvideo } from './jeuxvideo.en';
import { EN as monde } from './monde.en';
import { EN as popculture } from './popculture.en';
import { EN as sport } from './sport.en';
import { GROUPS, SUBS, TYPES } from './themes.en';

export const CATALOG_EN: CatalogLang = { cards: { ...pokemon151, ...lol, ...valorant, ...jeuxvideo, ...monde, ...popculture, ...sport }, subs: SUBS, groups: GROUPS, types: TYPES };
