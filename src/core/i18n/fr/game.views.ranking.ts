/** Textes de src/game/views/ranking.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'rk.kicker': 'CLASSEMENT',
  'rk.sub': 'Complétion de la collection (le classement roi), 6★ & secrets, boosters ouverts, échanges conclus, série de connexion.',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
