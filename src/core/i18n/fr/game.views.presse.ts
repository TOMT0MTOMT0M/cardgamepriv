/** Textes de src/game/views/presse.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'pr.title': 'La Presse',
  'pr.value': 'Valeur de la pièce',
  'pr.crack': 'Fêlure à la prochaine frappe',
  'pr.last': 'Dernières pièces',
  'pr.ifNext': 'si la prochaine est encore {stars}',
  'pr.left': { one: '{n} partie restante aujourd’hui', other: '{n} parties restantes aujourd’hui' },
  'pr.cash': 'Encaisser {icon}{v}',
  'pr.cracks': 'La pièce se fend :',
  'pr.cashed': 'Pièce encaissée :',
  'pr.betW': '(mise {n})',
  'pr.album': 'Album',
  'pr.bet': 'Mise',
  'pr.star': '1★ = {n} pièces',
  'pr.short': 'Il te manque {n} pièces.',
  'pr.cool': 'La presse refroidit jusqu’à demain',
  'pr.engrave': 'Graver la bande · {bet}',
  'pr.login': 'Connecte-toi pour jouer.',
  'pr.row': 'mise {bet} · {st}',
  'pr.none': 'Pas encore de pièce.',
  'pr.rules': 'Mise {bets} pièces. La presse grave en secret {n} cartes de l\'album choisi (raretés d\'un booster) ; la première frappe est offerte. Chaque carte frappée charge la pièce de ses étoiles (<b>1★ = {star} pièces pour une mise de 100</b>). <b>Deux raretés identiques d\'affilée : la pièce se fend</b> et la mise est perdue — après une 1★, le risque est de 58 %, après une 3★ de 10 %. Encaisse quand tu veux ; à la {n}e frappe, la pièce sort seule. {daily} parties par jour. Aucune carte n\'est gagnée : la presse montre l\'album (les cartes que tu n\'as pas encore sont marquées), les pièces servent aux boosters.',
  'pr.cracked': 'fendue',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
