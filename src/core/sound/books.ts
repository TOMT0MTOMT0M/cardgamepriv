/** Les livres de recettes cuits à la demande (Worker) : banque principale, scènes 6★, nappe des menus. */
import { type Recipe, RECIPES } from './bank';
import { MYTHIC_RECIPES } from './mythicBank';
import { PAD_RECIPES } from './padBank';

export type BookName = 'main' | 'mythic' | 'pad';
export const BOOKS: Record<BookName, Record<string, Recipe>> = { main: RECIPES, mythic: MYTHIC_RECIPES, pad: PAD_RECIPES };
