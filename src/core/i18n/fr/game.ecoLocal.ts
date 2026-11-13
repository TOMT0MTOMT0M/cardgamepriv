/** Textes de src/game/ecoLocal.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'el.bet': 'Mise',
  'el.abuseTitle': 'Exemple (démo) : Malo (robot) → Léa (robot) : flux net de 6 200 en 30 jours',
  'el.abuseDetail': 'En ligne, les alertes sont calculées sur les vrais flux (duels, royales, roulette, échanges). Aucun blocage automatique.',
  'el.botMalo': 'Malo (robot)',
  'el.botLea': 'Léa (robot)',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
