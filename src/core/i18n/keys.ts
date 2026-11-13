/**
 * Toutes les clés de textes (types seulement, rien n'est téléchargé) : `fr.ts` + les parties `fr/*.ts` des modules
 * chargés à la demande. Tenu à jour par scripts/i18n/outil.py.
 */
import type { fr as core } from './fr';
import type { fr as p_game_v2gate } from './fr/game.v2gate';
import type { fr as p_game_chatStore } from './fr/game.chatStore';
import type { fr as p_game_offline } from './fr/game.offline';
import type { fr as p_game_views_launch } from './fr/game.views.launch';
import type { fr as p_game_views_ranking } from './fr/game.views.ranking';
import type { fr as p_game_views_gridArt } from './fr/game.views.gridArt';
import type { fr as p_game_views_owners } from './fr/game.views.owners';
import type { fr as p_game_views_picker } from './fr/game.views.picker';
// <imports>

export type AllFr = typeof core &
  typeof p_game_v2gate &
  typeof p_game_chatStore &
  typeof p_game_offline &
  typeof p_game_views_launch &
  typeof p_game_views_ranking &
  typeof p_game_views_gridArt &
  typeof p_game_views_owners &
  typeof p_game_views_picker &
  // <parts>
  Record<never, never>;
