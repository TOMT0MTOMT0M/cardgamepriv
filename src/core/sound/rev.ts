import type { BookName } from './books';

/**
 * RÉVISION DE LA BANQUE DE SONS (audit perf 28/11, n°7) : les sons cuits sont rangés d'un lancement à l'autre
 * (core/calcCache.ts) sous cette clé. À MONTER dès qu'une recette (bank.ts, books.ts, openBank, padBank, mythicBank,
 * dsp.ts, ids.ts, scale.ts) change — sinon le téléphone garderait l'ancien son. `npm run test:sound` le vérifie : il
 * compare l'empreinte de chaque livre à `SOUND_PRINT` et dit quoi faire quand elle ne correspond plus.
 */
export const SOUND_REV = 'son-v1';

/** somme des |échantillons| de chaque livre (arrondie à l'entier) : change dès qu'une recette change, pas au dernier bit près */
export const SOUND_PRINT: Record<BookName, number> = { main: 48583, mythic: 63352, pad: 20263, ouvertures: 6045 };
