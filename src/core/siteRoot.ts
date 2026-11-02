/**
 * Racine du site (avec / final), valable depuis n'importe quelle page : le labo (/) comme le jeu (/jeu/).
 * `base: './'` (vite.config) rend les URL relatives à la PAGE : depuis /jeu/, « ./art/x.png » viserait /jeu/art/x.png.
 * En build, tout le JS vit dans /assets/ → la racine est le dossier parent de ce module.
 */
export const SITE_ROOT: string = import.meta.env.DEV ? '/' : new URL(/* @vite-ignore */ '../', import.meta.url).href;

/** URL absolue d'un fichier de public/ (`art/pokemon-151/001-bulbizarre.png`). */
export const siteUrl = (path: string): string => SITE_ROOT + path.replace(/^\/+/, '');
