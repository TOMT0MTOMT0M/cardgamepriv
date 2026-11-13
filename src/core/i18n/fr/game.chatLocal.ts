/** Textes de src/game/chatLocal.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'cl.l1': 'Pas mal du tout.',
  'cl.l2': 'Tu l’échanges contre quoi ?',
  'cl.l3': 'J’ouvre mes boosters et je te dis.',
  'cl.l4': 'Elle est où cette 6★ ?',
  'cl.l5': 'On fait un Pack Battle ?',
  'cl.l7': 'Bien vu.',
  'cl.l6': 'Je garde mes doublons pour la forge.',
  'cl.welcome': 'Bienvenue dans le chat général. Ici on montre ses cartes et on négocie.',
  'cl.ask': 'Quelqu’un a des doublons Pokémon 4★ ?',
  'cl.reply': 'Moi, mais je veux une 5★ en face.',
  'cl.card': 'Carte',
  'cl.aCard': 'une carte',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
