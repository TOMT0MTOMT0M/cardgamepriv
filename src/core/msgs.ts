import { lang as curLang, type Lang } from './i18n';
import { MSG_FR, type MsgCode } from './i18n/msgFr';
import { fillMsg, msgTables, type MsgParams, type MsgTable, type MsgTpl } from './msgRefs';

/**
 * (version anglaise, lot 4) Messages stockés par le serveur, réécrits dans la langue du joueur : voir i18n/msgFr.ts.
 * `fm` (serveur, démo) fabrique le texte français + le code ; `renderMsg` (notifications) le rend dans une langue
 * donnée ; `parseMsg` (migration) retrouve le code d'un ancien texte. Affichage côté client : msgRefs.ts (msgText).
 */
export type { MsgCode } from './i18n/msgFr';
export type { MsgParams, MsgTable, MsgTpl, MsgVal } from './msgRefs';
export { msgText, statusText } from './msgRefs';
export interface Msg {
  text: string;
  key: MsgCode;
  params?: MsgParams;
}

/** Rend un message dans la langue `l` (null si le modèle manque). */
export function renderMsg(key: string, params: MsgParams = {}, l: Lang = curLang(), table: MsgTable | null = msgTables.en, useRefs = true): string | null {
  const tpl = l === 'fr' ? MSG_FR[key as MsgCode] : table?.[key];
  return tpl ? fillMsg(tpl, params, l, useRefs) : null;
}

/** Message fabriqué côté serveur (ou démo) : texte français (stocké tel quel) + code et paramètres. */
export function fm(key: MsgCode, params?: MsgParams): Msg {
  return { text: renderMsg(key, params, 'fr', null, false)!, key, ...(params ? { params } : {}) };
}

/** Champs à poser sur une ligne du fil (`activityFeed`). */
export const feedMsg = (m: Msg) => ({ message: m.text, msgKey: m.key, ...(m.params ? { msgParams: m.params } : {}) });

// ───── reconnaissance des anciens textes (migration, statuts des amis) ─────
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let matchers: { key: MsgCode; re: RegExp; names: string[] }[] | null = null;
/** Retrouve le code et les paramètres d'un ancien texte français (null si aucun modèle ne colle). */
export function parseMsg(text: string, prefix: 'f.' | 'c.' | 's.'): { key: MsgCode; params: MsgParams } | null {
  if (!matchers) {
    matchers = [];
    for (const [key, tpl] of Object.entries(MSG_FR) as [MsgCode, MsgTpl][]) {
      for (const form of typeof tpl === 'string' ? [tpl] : [tpl.one, tpl.other]) {
        const names: string[] = [];
        const src = form.split(/(\{\w+\})/).map((part) => {
          const m = /^\{(\w+)\}$/.exec(part);
          if (!m) return esc(part);
          names.push(m[1]!);
          return '(.+?)';
        });
        matchers.push({ key, re: new RegExp(`^${src.join('')}$`, 's'), names });
      }
    }
    // les modèles les plus précis (le plus de texte fixe) d'abord
    const fixed = (m: { re: RegExp }) => m.re.source.replace(/\(\.\+\?\)/g, '').length;
    matchers.sort((a, b) => fixed(b) - fixed(a));
  }
  for (const m of matchers) {
    if (!m.key.startsWith(prefix)) continue;
    const r = m.re.exec(text);
    if (!r) continue;
    const params: MsgParams = {};
    m.names.forEach((n, i) => {
      const s = r[i + 1]!;
      params[n] = /^\d[\d  ]*$/.test(s) ? Number(s.replace(/[  ]/g, '')) : s;
    });
    return { key: m.key, params };
  }
  return null;
}
