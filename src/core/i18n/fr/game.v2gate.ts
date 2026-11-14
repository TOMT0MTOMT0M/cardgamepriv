/** Textes de src/game/v2gate.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'v2gate.title': 'Réservé à l’équipe',
  'v2gate.body': 'Ce lien est la version de test : connecte-toi avec un compte de l’équipe.',
  'v2gate.real': 'Le jeu, c’est',
  'v2gate.login': 'Connexion équipe',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
