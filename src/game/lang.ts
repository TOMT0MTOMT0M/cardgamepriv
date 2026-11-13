/**
 * Langue du jeu côté joueur (version anglaise, lot 1).
 *
 * Ordre de décision :
 *  1. `?lang=en` / `?lang=fr` dans l'adresse (pour tester : la page seulement, rien n'est enregistré) ;
 *  2. le choix manuel : sur l'appareil (localStorage `bebou.lang`), sinon celui du compte (`users.lang` + `langSet`,
 *     appliqué à l'arrivée du joueur : `adoptAccountLang`) ;
 *  3. la langue de l'appareil (`navigator.languages[0]`, sinon `navigator.language`) : fr / fr-FR / fr-BE / fr-CH →
 *     français ; tout le reste → anglais (src/core/i18n.ts, FR_DEVICE_LANGS).
 * Le dictionnaire anglais n'est téléchargé qu'en anglais (import() à part) : en français, rien ne change au chargement.
 * La langue EFFECTIVE part au serveur à la connexion et à chaque changement (push et messages privés Discord).
 */
import { LANG_STORAGE_KEY, installData, installLang, isLang, lang, langFromDevice, t, type Dict, type Lang } from '../core/i18n';

export { lang, t };

const fromUrl = (): Lang | null => {
  try {
    const q = new URLSearchParams(location.search).get('lang')?.toLowerCase();
    return isLang(q) ? q : null;
  } catch {
    return null;
  }
};
const fromStorage = (): Lang | null => {
  try {
    const s = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(s) ? s : null;
  } catch {
    return null;
  }
};
const fromDevice = (): Lang => {
  try {
    return langFromDevice(navigator.languages?.[0] ?? navigator.language);
  } catch {
    return 'fr';
  }
};

const forced = fromUrl();
/** Choix manuel enregistré (appareil) : il part au compte (`langSet`). */
let manualPick = fromStorage() !== null;
/** Le compte n'écrase pas la langue si elle est choisie ici (ou forcée par l'adresse). */
let picked = forced !== null || manualPick;
const listeners = new Set<(l: Lang) => void>();

let enP: Promise<Dict | null> | null = null;
const loadDict = (l: Lang): Promise<Dict | null> => (l === 'fr' ? Promise.resolve(null) : (enP ??= import('../core/i18n/en').then((m) => (installData({ ...m.enData, ...Object.fromEntries(Object.entries(m.enErrors).map(([k, v]) => [`err.${k}`, v])) }), m.en), (e: unknown) => ((enP = null), Promise.reject(e)))));

function applyDoc(l: Lang) {
  document.documentElement.lang = l;
}

/** Premier réglage (main.ts l'attend avant de dessiner) : en français, aucun téléchargement. */
export async function initLang(): Promise<void> {
  const want = forced ?? fromStorage() ?? fromDevice();
  if (want === 'en') {
    try {
      installLang('en', await loadDict('en'));
    } catch (e) {
      console.warn('[jeu] dictionnaire anglais indisponible, le jeu reste en français', e);
    }
  }
  applyDoc(lang());
}

/** Être prévenu d'un changement de langue (après installation du dictionnaire). */
export function onLang(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Changer de langue. `manual` : choix du joueur (enregistré sur l'appareil). Renvoie false si l'anglais n'a pas pu arriver. */
export async function setLang(l: Lang, manual = true): Promise<boolean> {
  if (manual) {
    picked = manualPick = true;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
      /* stockage refusé : le choix vaut pour la session (et le compte) */
    }
  }
  if (l === lang()) return true;
  let d: Dict | null;
  try {
    d = await loadDict(l);
  } catch (e) {
    console.warn('[jeu] changement de langue impossible', e);
    return false;
  }
  installLang(l, d);
  applyDoc(l);
  for (const fn of listeners) fn(l);
  return true;
}

/** Langue choisie sur le compte (autre appareil) : appliquée si rien n'a été choisi ici. */
export function adoptAccountLang(accLang: unknown, accSet: unknown): void {
  if (picked || accSet !== true || !isLang(accLang) || accLang === lang()) return;
  picked = true;
  void setLang(accLang, true);
}

/** Le choix vient-il du joueur (pour le compte : `langSet`) ? `?lang=` ne compte pas (test). */
export const langPicked = () => manualPick;
