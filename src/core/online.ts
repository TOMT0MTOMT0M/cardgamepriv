/**
 * (V3, coût Convex, piste 10 de docs/chantiers/convex-pistes.md) PRÉSENCE MOINS BAVARDE — fenêtres partagées par le
 * serveur (convex/users.ts, presence.ts, deals.ts, trades.ts, profiles.ts) et le client (src/game/backend.ts, client.ts).
 *
 * Chaque écriture de la carte de présence relance la liste du club chez tous ceux qui l'ont ouverte. AVANT : « vu à »
 * écrit au plus toutes les 4 min, et à chaque booster (deux fois) ; « en ligne » = vu depuis moins de 6 min.
 * MAINTENANT : « vu à » écrit au plus toutes les 10 min (un booster ne la réécrit que si son statut change), et
 * « actif » = vu depuis moins de 12 min. Le battement de cœur (110 s) reste sous l'écart 12 − 10 = 2 min : un joueur
 * présent ne paraît jamais parti.
 */
export const SEEN_EVERY_MS = 10 * 60 * 1000;
export const ONLINE_MS = 12 * 60 * 1000;
