/**
 * PARRAINAGE (retours live 02, §10) — règles partagées serveur (convex/referrals.ts) / client.
 *  - le filleul reçoit `packs` boosters en arrivant par le lien ;
 *  - le parrain reçoit `packs` boosters quand le filleul a ouvert ses `packsToPay` premiers boosters ;
 *  - seul un compte neuf peut devenir filleul (moins de `newAccountMs`).
 */
export const REFERRAL = {
  packs: 10,
  packsToPay: 10,
  newAccountMs: 3 * 24 * 3600_000,
} as const;

/** Lien d'invitation au site. */
export const referralLink = (origin: string, code: string) => `${origin}/jeu/?ref=${encodeURIComponent(code)}`; // i18n-ok
