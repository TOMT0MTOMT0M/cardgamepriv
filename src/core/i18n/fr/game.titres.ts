/** Textes de src/game/uniqueTitle.ts (titres uniques) : chargés avec lui, enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'ut.tip': 'Titre unique · premier à compléter {set}',
  'ut.kicker': 'Titre unique',
  'ut.wonFirst': 'Premier du club',
  'ut.wonSet': '{set} · {n}/{n}',
  'ut.wonForever': 'À toi seul. Pour toujours.',
  'ut.wonClose': 'Continuer',
  'ut.sec': 'Titres uniques',
  'ut.secD': 'Un seul joueur par titre : le premier à 100 %.',
  'ut.free': 'Libre',
  'ut.mine': 'À toi',
  'ut.taken': 'Pris',
  'ut.by': 'Détenu par {name}',
  'ut.since': 'depuis le {date}',
  'ut.beFirst': 'Sois le premier',
  'ut.claim': 'Réclamer',
  'ut.lost': '{name} a été plus rapide : « {title} » est pris.',
  'ut.progressA': '{have} cartes sur {total}',
} as const;
addFr(fr);
