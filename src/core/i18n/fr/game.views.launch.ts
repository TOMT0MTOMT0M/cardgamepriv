/** Textes de src/game/views/launch.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'launch.big': 'Grosse mise à jour',
  'launch.reopen': 'Réouverture dans',
  'launch.kept': 'Ta collection est gardée',
  'launch.keptD': ': cartes, pièces, boosters, succès, rien ne se perd.',
  'launch.v2': 'La V2 arrive',
  'launch.v2D': ': chat, marché, échanges simplifiés, saisons, notifications.',
  'launch.auto': 'Le jeu se met à jour tout seul à la réouverture.',
  'launch.team': 'Accès équipe',
  'launch.reopenIn': 'Réouverture dans {label}',
  'launch.open': 'C’est ouvert',
  'launch.reopened': 'C’est rouvert : bienvenue dans la V2 🎴',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
