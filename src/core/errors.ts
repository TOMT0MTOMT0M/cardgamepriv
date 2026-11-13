/**
 * (version anglaise, lot 4) Erreurs à CODE. `fe('code', { p0 })` renvoie le texte français (i18n/errFr.ts) suivi du
 * repère `⟦code{"p0":…}⟧` : le serveur et les tests gardent le même texte ; le client enlève le repère (`errParse`) et,
 * en anglais, affiche la traduction (i18n/en/errors.ts, par `tData('err.<code>')`).
 */
import { ERR_FR, type ErrCode } from './i18n/errFr';
import { tData } from './i18n';

export type ErrParams = Record<string, string | number>;
const fill = (tpl: string, p?: ErrParams) => (p ? tpl.replace(/\{(\w+)\}/g, (a, k: string) => (k in p ? String(p[k]) : a)) : tpl);
const TAG = /\s*⟦([\w.-]+)(\{.*\})?⟧\s*$/s;

/** Texte d'erreur (français) + repère du code. */
export function fe(code: ErrCode, p?: ErrParams): string {
  return `${fill(ERR_FR[code], p)} ⟦${code}${p ? JSON.stringify(p) : ''}⟧`;
}

/** Message d'erreur → texte dans la langue du moment (le repère retiré ; sans repère : tel quel). */
export function errText(msg: string): string {
  const m = TAG.exec(msg);
  if (!m) return msg;
  const fr = msg.slice(0, m.index);
  let p: ErrParams | undefined;
  try {
    p = m[2] ? (JSON.parse(m[2]) as ErrParams) : undefined;
  } catch {
    p = undefined;
  }
  const en = tData(`err.${m[1]}`, '');
  return en ? fill(en, p) : fr;
}
