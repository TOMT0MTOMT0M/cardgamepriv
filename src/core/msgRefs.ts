import { lang as curLang, type Lang } from './i18n';

/**
 * (version anglaise, lot 4) Rendu des messages stockés (voir i18n/msgFr.ts), sans les modèles français : le client n'en
 * a besoin qu'en anglais, ils arrivent avec le pack anglais (`installMsgs`). src/core/msgs.ts (serveur, démo) s'en sert.
 * Les références (`{card}`, `{rarity}`…) : chaque module qui porte le libellé s'inscrit (`msgRef`), sans rien charger.
 */
export type MsgVal = string | number | string[];
export type MsgParams = Record<string, MsgVal>;
export type MsgTpl = string | { one: string; other: string };
export type MsgTable = Record<string, MsgTpl>;

export const refs: Record<string, (p: MsgParams) => string | undefined> = {};
export const msgRef = (name: string, fn: (p: MsgParams) => string | undefined) => void (refs[name] = fn);
export const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Modèles anglais (en/msgs.ts) + lecture des statuts français, posés par le pack anglais quand il se charge. */
export const msgTables: { en: MsgTable | null; parseStatus: ((s: string) => { key: string; params: MsgParams } | null) | null } = { en: null, parseStatus: null };
export const installMsgs = (t: MsgTable | null, parseStatus: (s: string) => { key: string; params: MsgParams } | null) => {
  msgTables.en = t;
  msgTables.parseStatus = parseStatus;
};

// (les numéros — exemplaire, roulette, jour — ne prennent pas de séparateur de milliers)
const RAW = new Set(['mint', 'number', 'day', 'odds']);
const groupFr = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const listFmt = new Map<Lang, Intl.ListFormat>();
function val(k: string, v: MsgVal, l: Lang): string {
  if (Array.isArray(v)) {
    let f = listFmt.get(l);
    if (!f) listFmt.set(l, (f = new Intl.ListFormat(l === 'fr' ? 'fr-FR' : 'en-GB', { type: 'conjunction' })));
    return f.format(v);
  }
  if (typeof v === 'number' && !RAW.has(k)) return l === 'fr' ? groupFr(v) : Math.round(v).toLocaleString('en-GB');
  return String(v);
}
const plurals = new Map<Lang, Intl.PluralRules>();

/** Remplit un modèle (pluriel sur `n`). `useRefs` : relit les références dans la langue active. */
export function fillMsg(tpl: MsgTpl, params: MsgParams, l: Lang, useRefs: boolean): string {
  let s: string;
  if (typeof tpl === 'string') s = tpl;
  else {
    let p = plurals.get(l);
    if (!p) plurals.set(l, (p = new Intl.PluralRules(l === 'fr' ? 'fr-FR' : 'en-GB')));
    s = p.select(Number(params.n ?? 0)) === 'one' ? tpl.one : tpl.other;
  }
  return s.replace(/\{(\w+)\}/g, (all, k: string) => {
    const r = useRefs ? refs[k]?.(params) : undefined;
    return r ?? (k in params ? val(k, params[k]!, l) : all);
  });
}

/** Texte à afficher : le message stocké en français, réécrit dans la langue active quand on a son code. */
export function msgText(key: string | undefined, params: MsgParams | undefined, stored: string): string {
  if (!key || curLang() === 'fr') return stored;
  const tpl = msgTables.en?.[key];
  return tpl ? fillMsg(tpl, params ?? {}, curLang(), true) : stored;
}

/** Statut d'un ami (`users.statusText`, stocké en français sans code) dans la langue active. */
export function statusText(s: string): string {
  if (curLang() === 'fr') return s;
  const m = msgTables.parseStatus?.(s);
  return (m && msgText(m.key, m.params, s)) || s;
}
