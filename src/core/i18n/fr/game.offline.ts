/** Textes de src/game/offline.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'off.demo': 'Hors connexion : disponible sur le site du jeu (pas en démo locale).',
  'off.title': 'Hors connexion',
  'off.intro': 'Le jeu s’ouvre déjà sans réseau. Pour voir aussi tes cartes partout (métro, avion) :',
  'off.game': 'Jeu installé',
  'off.art': 'Illustrations de ta collection',
  'off.allHere': 'Tout est sur l’appareil ✓',
  'off.dlAll': 'Tout télécharger · environ {size}',
  'off.what': 'Miniatures de toute ta collection, cartes 4★ et plus en pleine définition, Merveilles en 3D, sons et effets. De préférence en Wi-Fi.',
  'off.aria': 'Téléchargement hors connexion',
  'off.stop': 'Arrêter',
  'off.noSpace': 'Plus de place sur l’appareil : téléchargement arrêté.',
  'off.netCut': 'Réseau coupé : reprends plus tard, rien n’est perdu.',
  'off.done': 'Tout est sur l’appareil : tes cartes s’affichent même sans réseau.',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
