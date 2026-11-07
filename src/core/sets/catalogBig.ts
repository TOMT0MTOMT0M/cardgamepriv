/**
 * Les 4 GROS sets du catalogue (Jeux vidéo, Pop Culture, Sport, World) — ~90 % des cartes, ~700 Ko compressés.
 * Données pures. Lus UNIQUEMENT par `installCatalog()` (themesCore.ts) : le jeu les télécharge par `import()` pendant le
 * démarrage de la 3D (main.ts) ; serveur, tests, scripts et labo les installent d'office (catalogFull.ts).
 */
export { JV, JV_FAMILIES, JV_INFO } from './jeuxvideo';
export { MONDE, MONDE_GROUPS, MONDE_SUBS } from './monde';
export { SPORT, SPORT_GROUPS, SPORT_SIZE, SPORT_SUBS } from './sport';
export { POP, POP_GROUPS, POP_SIZE, POP_SUBS } from './popculture';
export { POP_ARTISTS } from './popArtists';
