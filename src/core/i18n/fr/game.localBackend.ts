/** Textes de src/game/localBackend.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'lb.boardNote': 'Tableau d’offres',
  'lb.noteOk': 'ça te va ?',
  'lb.noteUp': 'je peux monter un peu',
  'lb.noteQuick': 'échange rapide ?',
  'lb.noteDupes': 'doublons à échanger',
  'lb.noteBinder': 'je complète mon classeur',
  'lb.noteOffers': 'faites vos offres !',
  'lb.bio1': 'Je collectionne les brillantes ✨',
  'lb.bio2': 'Toujours partant pour un échange',
  'lb.thisCard': 'cette carte',
  'lb.demoSize': ' (démo ; 2 Mo en ligne)',
  'lb.meDemo': 'Toi (démo)',
  'lb.whatOffered': 'proposées',
  'lb.counterNote': 'je te donne seulement ça pour ton offre',
  'lb.whatGiven': 'données',
  'lb.whatAsked': 'demandées',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
