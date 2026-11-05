import './fonts.css';
// repli pour les signes absents de Bold Frame (★ ✓ ← …) et l'ancien gabarit : IBM Plex Mono reste chargée
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

/**
 * POLICES DU JEU (retours 05/11) — la seule source : le CSS (variables --display / --title / --mono, posées par
 * `applyFontVars`) ET les cartes peintes sur toile (src/core/art) lisent ces chaînes. Changer de police = changer ce
 * fichier et fonts.css ; `FONT_VERSION` entre dans la clé du cache des cartes peintes (src/game/cardImages.ts) : les
 * anciennes cartes sont repeintes toutes seules.
 */
export const FONT_VERSION = 'bf1';
/** gros titres seulement (logo, titres de page, moments forts) */
export const FONT_DISPLAY = '"Matcha World", "Bold Frame", "IBM Plex Mono", system-ui, sans-serif';
/** titres, noms, texte courant (graisse 400 / 600 / 700 = les 3 Bold Frame) */
export const FONT_TEXT = '"Bold Frame", "IBM Plex Mono", system-ui, sans-serif';
/** libellés en capitales espacées, chiffres, boutons */
export const FONT_LABEL = '"Bold Frame", "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

/** Pose les variables CSS (le CSS garde un repli identique en dur). */
export function applyFontVars(root: HTMLElement = document.documentElement) {
  root.style.setProperty('--display', FONT_DISPLAY);
  root.style.setProperty('--title', FONT_TEXT);
  root.style.setProperty('--mono', FONT_LABEL);
}
