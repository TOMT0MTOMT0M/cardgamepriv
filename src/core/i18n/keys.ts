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
import type { fr as p_game_views_friends } from './fr/game.views.friends';
import type { fr as p_game_chat } from './fr/game.chat';
import type { fr as p_game_views_profile } from './fr/game.views.profile';
import type { fr as p_game_views_collection } from './fr/game.views.collection';
import type { fr as p_game_views_trades } from './fr/game.views.trades';
import type { fr as p_game_views_cardPanel } from './fr/game.views.cardPanel';
import type { fr as p_game_views_contracts } from './fr/game.views.contracts';
import type { fr as p_game_views_succes } from './fr/game.views.succes';
import type { fr as p_game_views_guide } from './fr/game.views.guide';
import type { fr as p_game_views_suggestions } from './fr/game.views.suggestions';
import type { fr as p_game_views_games } from './fr/game.views.games';
import type { fr as p_game_views_board } from './fr/game.views.board';
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
  typeof p_game_views_friends &
  typeof p_game_chat &
  typeof p_game_views_profile &
  typeof p_game_views_collection &
  typeof p_game_views_trades &
  typeof p_game_views_cardPanel &
  typeof p_game_views_contracts &
  typeof p_game_views_succes &
  typeof p_game_views_guide &
  typeof p_game_views_suggestions &
  typeof p_game_views_games &
  typeof p_game_views_board &
  // <parts>
  Record<never, never>;
