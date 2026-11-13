/**
 * Langues du jeu (version anglaise, lot 1) : `t(clé, paramètres)` fait maison, sans bibliothèque.
 *
 * - Dictionnaires : `i18n/fr.ts` (la source, toujours dans le paquet) et `i18n/en.ts` (chargé seulement en anglais,
 *   par `src/game/lang.ts`). `en.ts` est typé sur les clés de `fr.ts` : une clé qui manque casse le typecheck.
 * - Message : une chaîne avec des `{nom}` remplacés par les paramètres, ou un objet de pluriels
 *   `{ one: '{n} carte', other: '{n} cartes' }` choisi par `Intl.PluralRules` sur le paramètre `n`.
 * - Les paramètres ne sont PAS échappés : un pseudo inséré dans du HTML passe par `esc()` avant.
 * - Jamais de `t()` au niveau du module (évalué avant le chargement de l'anglais) : toujours dans une fonction.
 * - Sans DOM : partagé par le client, les scripts et (plus tard) le serveur ; ici la langue vaut 'fr' tant que
 *   `src/game/lang.ts` ne l'a pas changée.
 */
import { fr } from './i18n/fr';
import type { AllFr } from './i18n/keys';

export type Lang = 'fr' | 'en';
export const LANGS: readonly Lang[] = ['fr', 'en'];
/** Langues d'appareil qui donnent le jeu en français (comparées sans tenir compte des majuscules) ; tout le reste : anglais. */
export const FR_DEVICE_LANGS = ['fr', 'fr-fr', 'fr-be', 'fr-ch'] as const;
/** Clé du choix manuel sur l'appareil. */
export const LANG_STORAGE_KEY = 'bebou.lang';

export type PluralMsg = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
export type Msg = string | PluralMsg;
/** Toutes les clés : `fr.ts` (textes du premier téléchargement) + `fr/*.ts` (textes des modules chargés à la demande). */
export type MsgKey = keyof AllFr;
/** Forme d'un dictionnaire complet : exactement toutes les clés. */
export type Dict = { readonly [K in MsgKey]: Msg };
/** Forme d'une partie anglaise : exactement les clés de sa partie française. */
export type PartOf<F> = { readonly [K in keyof F]: Msg };
export type Params = Record<string, string | number>;

/** Langue d'appareil (navigator.languages[0], sinon navigator.language) → langue du jeu. */
export function langFromDevice(tag: string | null | undefined): Lang {
  const s = (tag ?? '').trim().toLowerCase().replace('_', '-');
  return (FR_DEVICE_LANGS as readonly string[]).includes(s) ? 'fr' : 'en';
}
export const isLang = (x: unknown): x is Lang => x === 'fr' || x === 'en';

let cur: Lang = 'fr';
/**
 * Français : `fr.ts` + les parties `fr/*.ts` enregistrées par leur module à son chargement (`addFr`) — les textes d'une
 * page arrivent avec elle (le premier téléchargement ne grossit pas). L'anglais arrive en un seul fichier (en.ts).
 */
const frAll: Record<string, Msg> = { ...fr };
let dict: Dict = frAll as Dict;
/** (fr/*.ts) une partie française arrive avec son module. */
export function addFr(part: Record<string, Msg>): void {
  Object.assign(frAll, part);
}
const plurals = new Map<Lang, Intl.PluralRules>();

/** Langue active. */
export const lang = (): Lang => cur;
/** Locale pour Intl (dates, nombres, tris) : l'anglais en version britannique (24 h, jour avant le mois). */
export const locale = (l: Lang = cur): string => (l === 'fr' ? 'fr-FR' : 'en-GB');

/** (src/game/lang.ts) installe la langue et son dictionnaire. */
export function installLang(l: Lang, d: Dict | null): void {
  cur = l;
  dict = l === 'fr' || !d ? (frAll as Dict) : d;
}

function plural(l: Lang): Intl.PluralRules {
  let p = plurals.get(l);
  if (!p) plurals.set(l, (p = new Intl.PluralRules(locale(l))));
  return p;
}

/** Message `key` dans un dictionnaire donné (le serveur choisira celui du joueur). */
export function format(d: Dict, l: Lang, key: MsgKey, params?: Params): string {
  const m = d[key] ?? frAll[key] ?? key;
  let s: string;
  if (typeof m === 'string') s = m;
  else {
    const n = Number(params?.n ?? 0);
    const cat = plural(l).select(n) as keyof PluralMsg;
    s = (n === 0 && m.zero) || m[cat] || m.other;
  }
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (all, k: string) => (k in params ? fmtParam(params[k]!, l) : all));
}
// (les nombres passent tels quels : celui qui veut « 1 000 » le formate avec fmtNum avant)
const fmtParam = (v: string | number, _l: Lang) => String(v);

/** Texte de l'interface dans la langue active. */
export function t(key: MsgKey, params?: Params): string {
  return format(dict, cur, key, params);
}

// ───── formats dans la langue active (dates, nombres, tris) ─────
// (l'heure de Paris reste celle de la roulette, des missions et des saisons : `timeZone: 'Europe/Paris'` là où c'est dit)
const nfCache = new Map<string, Intl.NumberFormat>();
const dfCache = new Map<string, Intl.DateTimeFormat>();
const key = (o: object) => `${cur}|${JSON.stringify(o)}`;

export function fmtNum(n: number, o: Intl.NumberFormatOptions = {}): string {
  const k = key(o);
  let f = nfCache.get(k);
  if (!f) nfCache.set(k, (f = new Intl.NumberFormat(locale(), o)));
  return f.format(n);
}
/** Pourcentage à une décimale : « 62,4 % » / « 62.4% ». `x` en fraction (0.624). */
export function fmtPct(x: number, digits = 1): string {
  const v = (Math.round(x * 100 * 10 ** digits) / 10 ** digits).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return cur === 'fr' ? `${v} %` : `${v}%`;
}
export function fmtDate(t: number | Date, o: Intl.DateTimeFormatOptions): string {
  const k = key(o);
  let f = dfCache.get(k);
  if (!f) dfCache.set(k, (f = new Intl.DateTimeFormat(locale(), o)));
  return f.format(t);
}
let coll: { l: Lang; c: Intl.Collator } | null = null;
/** Tri alphabétique dans la langue active (remplace `localeCompare(…, 'fr')`). */
export function compare(a: string, b: string): number {
  if (!coll || coll.l !== cur) coll = { l: cur, c: new Intl.Collator(locale()) }; // (mêmes options que localeCompare : même ordre qu'avant en français)
  return coll.c.compare(a, b);
}
export const lower = (s: string) => s.toLocaleLowerCase(locale());
export const upper = (s: string) => s.toLocaleUpperCase(locale());
