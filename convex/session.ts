import { v } from 'convex/values';
import { query } from './_generated/server';
import { getUserByToken } from './auth';
import { meView } from './users';
import { ecoView } from './economy';
import { missionsView } from './missions';

/**
 * (audit 12/11, E1-08) LE JOUEUR, SON ÉCONOMIE ET SES MISSIONS EN UNE REQUÊTE. Le client V2 tenait trois abonnements
 * (`users.me`, `economy.state`, `missions.mine`) qui lisent tous le même document joueur : chaque écriture sur ce
 * document (booster, pièces, mission, battement de cœur) en ré-exécutait trois. Celle-ci le lit une fois et renvoie
 * les trois réponses, à l'identique. Les trois requêtes restent pour le client V1 et pour le repli du client V2.
 */
export const get = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, { sessionToken }) => {
    const user = await getUserByToken(ctx, sessionToken);
    if (!user) return null;
    const now = Date.now();
    return { me: meView(user, now), eco: await ecoView(ctx, user, now), missions: missionsView(user, now) };
  },
});
