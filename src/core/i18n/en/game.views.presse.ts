/** English texts of src/game/views/presse.ts (keys: ../fr/game.views.presse.ts). */
import type { PartOf } from '../../i18n';
import type { fr } from '../fr/game.views.presse';

export const en: PartOf<typeof fr> = {
  'pr.title': 'The Press',
  'pr.value': 'Coin value',
  'pr.crack': 'Crack on the next strike',
  'pr.last': 'Latest coins',
  'pr.ifNext': 'if the next one is {stars} again',
  'pr.left': { one: '{n} game left today', other: '{n} games left today' },
  'pr.cash': 'Cash in {icon}{v}',
  'pr.cracks': 'The coin cracks:',
  'pr.cashed': 'Coin cashed in:',
  'pr.betW': '(bet {n})',
  'pr.album': 'Album',
  'pr.bet': 'Bet',
  'pr.star': '1★ = {n} coins',
  'pr.short': 'You’re {n} coins short.',
  'pr.cool': 'The press cools down until tomorrow',
  'pr.engrave': 'Engrave the strip · {bet}',
  'pr.login': 'Log in to play.',
  'pr.row': 'bet {bet} · {st}',
  'pr.none': 'No coin yet.',
  'pr.rules': 'Bet {bets} coins. The press secretly engraves {n} cards from the chosen album (booster rarities); the first strike is free. Each struck card charges the coin with its stars (<b>1★ = {star} coins for a bet of 100</b>). <b>Two identical rarities in a row: the coin cracks</b> and the bet is lost — after a 1★, the risk is 58%, after a 3★, 10%. Cash in whenever you want; on strike {n}, the coin comes out on its own. {daily} games per day. No card is won: the press shows the album (cards you don’t have yet are marked), coins go toward boosters.',
  'pr.cracked': 'cracked',
};
