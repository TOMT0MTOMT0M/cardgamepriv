import { withLang, type Lang } from '../src/core/i18n';
import { en, enData, enErrors, enMsgs } from '../src/core/i18n/en';
import { renderMsg, type Msg } from '../src/core/msgs';

/**
 * (version anglaise, lot 4) Textes envoyés par le serveur dans la langue du joueur (`users.lang`, posée par le client
 * à la connexion) : notifications et MP Discord. Le salon Discord commun, l'admin et le labo restent en français.
 */
export const userLang = (u: { lang?: string } | null | undefined): Lang => (u?.lang === 'en' ? 'en' : 'fr');

let enExtra: Record<string, string> | null = null;
/** Exécute `fn` avec l'anglais installé (libellés des tables, dictionnaire) : synchrone, rien ne fuit après. */
export function inLang<T>(l: Lang, fn: () => T): T {
  if (l === 'fr') return fn();
  enExtra ??= { ...enData, ...Object.fromEntries(Object.entries(enErrors).map(([k, v]) => [`err.${k}`, v])) };
  return withLang('en', en, enExtra, fn);
}

/** Un message (texte fixe ou code + paramètres) dans la langue `l`. */
export function msgIn(l: Lang, m: string | Msg): string {
  if (typeof m === 'string' || l === 'fr') return typeof m === 'string' ? m : m.text;
  return inLang('en', () => renderMsg(m.key, m.params, 'en', enMsgs)) ?? m.text;
}
