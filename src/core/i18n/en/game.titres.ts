/** English texts of src/game/uniqueTitle.ts (keys: ../fr/game.titres.ts). */
import type { PartOf } from '../../i18n';
import type { fr } from '../fr/game.titres';

export const en: PartOf<typeof fr> = {
  'ut.tip': 'Unique title · first to complete {set}',
  'ut.kicker': 'Unique title',
  'ut.wonFirst': 'First in the club',
  'ut.wonSet': '{set} · {n}/{n}',
  'ut.wonForever': 'Yours alone. Forever.',
  'ut.wonClose': 'Continue',
  'ut.sec': 'Unique titles',
  'ut.secD': 'One player per title: the first to reach 100%.',
  'ut.free': 'Free',
  'ut.mine': 'Yours',
  'ut.taken': 'Taken',
  'ut.by': 'Held by {name}',
  'ut.since': 'since {date}',
  'ut.beFirst': 'Be the first',
  'ut.claim': 'Claim',
  'ut.lost': '{name} was faster: “{title}” is taken.',
  'ut.progressA': '{have} cards out of {total}',
};
