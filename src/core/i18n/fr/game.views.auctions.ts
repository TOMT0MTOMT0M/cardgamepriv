/** Textes de src/game/views/auctions.ts (V3, enchères au marché) : chargés avec lui, enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  // fiche d'une enchère
  'au.top': 'en tête : {name}',
  'au.bids': { one: '{n} offre', other: '{n} offres' },
  'au.noBid': 'Pas encore d’offre',
  'au.lead': 'En tête',
  'au.bidN': 'Offrir {n}',
  'au.bidSure': 'Offrir {n} ?',
  'au.bidA': 'Montant de ton offre',
  'au.less': 'Moins',
  'au.more': 'Plus',
  'au.minNext': 'Au moins {n} · plafond {max}',
  'au.capped': 'Plafond atteint : plus de surenchère possible.',
  'au.held': 'Tes pièces restent bloquées tant que tu es en tête ; rendues tout de suite si quelqu’un surenchérit.',
  'au.short': 'Il te manque {n} pièces.',
  'au.bidOk': 'Offre posée sur {name} : {n} pièces bloquées.',
  'au.withdraw': 'Retirer',
  'au.withdrawQ': 'Retirer ?',
  'au.back': '{name} est de retour dans ta collection.',
  'au.locked': 'Offre reçue : l’enchère ne se retire plus.',
  // coin de la tuile : la fin
  'au.cTonight': 'ce soir 21 h',
  'au.cTomorrow': 'demain 21 h',
  'au.cDay': '{day} 21 h',
  'au.cIn': '{t}',
  'au.cDone': 'Terminée',
  // mise aux enchères (feuille Vendre)
  'au.startA': 'Mise à prix',
  'au.startHint': 'Au moins {min} (valeur de Forge) · plafond {max}',
  'au.dur': 'Durée',
  'au.durA': 'Durée de l’enchère',
  'au.endsOn': 'Clôture : {when} à 21 h (heure de Paris).',
  'au.go': 'Mettre aux enchères',
  'au.leaves': 'La carte quitte ta collection. Sans offre, elle revient à la clôture ; dès la première offre, l’enchère ne se retire plus.',
  'au.listed': '{name} est aux enchères à partir de {price} pièces.',
  'au.whenTomorrow': 'demain',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
