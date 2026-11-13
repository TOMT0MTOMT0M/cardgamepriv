/**
 * Toutes les clés de textes (types seulement, rien n'est téléchargé) : `fr.ts` + les parties `fr/*.ts` des modules
 * chargés à la demande. Tenu à jour par scripts/i18n/outil.py.
 */
import type { fr as core } from './fr';
import type { fr as p_game_v2gate } from './fr/game.v2gate';
import type { fr as p_game_chatStore } from './fr/game.chatStore';
import type { fr as p_game_offline } from './fr/game.offline';
// <imports>

export type AllFr = typeof core &
  typeof p_game_v2gate &
  typeof p_game_chatStore &
  typeof p_game_offline &
  // <parts>
  Record<never, never>;
