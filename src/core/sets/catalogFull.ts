/**
 * Catalogue COMPLET installé tout de suite (effet de bord à l'import) : serveur Convex, tests et scripts (via themes.ts),
 * labo (src/main.ts). Le jeu, lui, l'installe par `import()` (main.ts) — voir installCatalog() dans themesCore.ts.
 */
import { installCatalog } from './themesCore';
import * as big from './catalogBig';

installCatalog(big);
