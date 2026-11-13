/** Textes de src/game/chatStore.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'chat.refused': 'Le serveur a refusé le message, réessaie.',
  'chat.aCard': 'une carte',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
