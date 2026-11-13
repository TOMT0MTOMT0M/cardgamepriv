/** Textes de src/game/views/picker.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'pick.title': 'Choisis tes cartes',
  'pick.search': 'Chercher une carte…',
  'pick.ok': 'Valider',
  'pick.bet': 'misée',
  'pick.noMatch': 'Aucune carte ne correspond.',
  'pick.noDup': 'Aucun doublon libre.',
  'pick.none': 'Aucune carte disponible.',
  'pick.help': 'Touche une carte pour l’ajouter ; touche-la ici pour la retirer.',
  'pick.removeOne': 'Retirer un exemplaire',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
