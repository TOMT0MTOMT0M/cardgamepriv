/** Textes de src/game/views/owners.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'own.title': 'Chercher un propriétaire',
  'own.youHave': 'Tu en as {n}',
  'own.notYet': 'Pas encore dans ta collection',
  'own.nobody': 'Personne d’autre ne l’a pour l’instant.{wish}',
  'own.wishHint': ' ♥ Ajoute-la à tes envies : tes amis la verront.',
  'own.busy': 'déjà engagée ailleurs',
  'own.only': 'son seul exemplaire',
  'own.trade': 'Échanger',
  'own.online': 'en ligne',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
