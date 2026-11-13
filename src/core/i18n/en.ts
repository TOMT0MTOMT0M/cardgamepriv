/** Game texts in English — loaded only when the game runs in English (src/game/lang.ts). Keys: see fr.ts. */
import type { Dict } from '../i18n';

export const en: Dict = {
  // ───── language (header switch) ─────
  'lang.label': 'Language',
  'lang.aria': 'Language: English. Switch to French',
  'lang.title': 'Game language: English (tap to switch to French)',
  'lang.later': 'The language will change once this opening is over.',
  'lang.failed': 'Couldn’t change the language (network?). Try again in a moment.',

  // ───── browser tab titles ─────
  'title.shop': 'Bébou — shop',
  'title.collection': 'Bébou — collection',
  'title.contrats': 'Bébou — contracts',
  'title.echanges': 'Bébou — trades',
  'title.amis': 'Bébou — friends',
  'title.profil': 'Bébou — profile',
  'title.jeux': 'Bébou — games',
  'title.classement': 'Bébou — leaderboard',
  'title.succes': 'Bébou — achievements',
  'title.suggestions': 'Bébou — suggestions',
  'title.maj': 'Bébou — updates',
  'title.tuto': 'Bébou — tutorial',
};
