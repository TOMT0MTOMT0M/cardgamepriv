/** Textes de src/game/views/login.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'lg.join': 'Rejoindre le club',
  'lg.discord': 'Continuer avec Discord',
  'lg.orName': 'ou avec un pseudo',
  'lg.create': 'Créer un compte',
  'lg.have': 'J’ai déjà un compte',
  'lg.name': 'Pseudo',
  'lg.showPw': 'Afficher le mot de passe',
  'lg.see': 'voir',
  'lg.clubCode': 'Code du club',
  'lg.min6': '6 caractères minimum',
  'lg.createMine': 'Créer mon compte',
  'lg.noEmail': 'Aucun e-mail demandé. Garde bien ton mot de passe : en cas d’oubli, Tom ou Hugo peuvent le remettre à zéro.',
  'lg.forgot': 'Mot de passe oublié ? Demande à Tom ou Hugo de le remettre à zéro.',
  'lg.nameMin': 'Pseudo : 3 caractères minimum.',
  'lg.pwMin': 'Mot de passe : 6 caractères minimum.',
  'lg.welcome': 'Bienvenue dans le club, {n} : 15 boosters t’attendent, et la recharge va 2× plus vite pendant 24 h 🎁',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
