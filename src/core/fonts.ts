import './fonts.css';
// libellés, chiffres, boutons : Inter, sous-ensemble latin seulement — les accents français y sont (audit 06/11 —
// Bold Frame en capitales est illisible sous 14 px : R → A, X → H)
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
// repli pour les signes absents de Bold Frame (★ ✓ ← …) et l'ancien gabarit : IBM Plex Mono reste chargée
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

/**
 * POLICES DU JEU (retours 05/11, audit 06/11) — la seule source : le CSS (variables --display / --title / --mono, posées
 * par `applyFontVars`) ET les cartes peintes sur toile (src/core/art) lisent ces chaînes. Changer de police = changer ce
 * fichier et fonts.css ; `FONT_VERSION` entre dans la clé du cache des cartes peintes (src/game/cardImages.ts) : les
 * anciennes cartes sont repeintes toutes seules.
 *  - Atsuka Montreal (V2, remplace Matcha World) : gros titres ; Bold Frame : titres, noms, texte courant EN CASSE MIXTE (ses capitales R et X se
 *    confondent avec A et H en petit) ; Inter : tout ce qui informe en petit — libellés, capitales espacées, chiffres
 *    (tabulaires), boutons.
 */
// (retours live 04) 'in2' : étoiles 6★ arc-en-ciel et étoiles remontées (Suisse paysage) → cartes repeintes
// (V2, 08/11) inchangé au passage Matcha World → Atsuka Montreal : aucune carte peinte n'utilise FONT_DISPLAY
export const FONT_VERSION = 'in2';
/** gros titres seulement (logo, titres de page, moments forts) */
/** (11/11) plus d'Atsuka Montreal : les gros titres sont en Bold Frame grasse (graisse 800 dans le CSS) */
export const FONT_DISPLAY = '"Bold Frame", "Inter", system-ui, sans-serif';
/** (retours Hugo 10/11) nom moulé des sachets : la police ronde d'origine (« elle était mieux, tout rond ») */
export const FONT_PACK = '"Matcha World", "Bold Frame", "Inter", system-ui, sans-serif';
/** titres, noms, texte courant en casse mixte (graisse 400 / 600 / 700 = les 3 Bold Frame) */
export const FONT_TEXT = '"Bold Frame", "Inter", system-ui, sans-serif';
/** libellés en capitales, chiffres, boutons, petits corps */
export const FONT_LABEL = '"Inter", "IBM Plex Mono", system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * (V2, 08/11) Casse des gros titres PEINTS SUR TOILE en Atsuka Montreal : capitale (à volutes) en première lettre, le
 * reste en minuscules (= petites capitales sans volute). En HTML la police le fait seule ; sur toile le navigateur met
 * en forme mot par mot et chaque mot en capitales reprendrait une volute.
 */
export function displayCase(text: string): string {
  const t = text.toLocaleLowerCase('fr');
  return t.charAt(0).toLocaleUpperCase('fr') + t.slice(1);
}

/** Pose les variables CSS (le CSS garde un repli identique en dur). */
export function applyFontVars(root: HTMLElement = document.documentElement) {
  root.style.setProperty('--display', FONT_DISPLAY);
  root.style.setProperty('--title', FONT_TEXT);
  root.style.setProperty('--mono', FONT_LABEL);
}
