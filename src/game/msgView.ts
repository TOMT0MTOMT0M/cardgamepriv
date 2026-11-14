import { msgText, type MsgParams } from '../core/msgRefs';
import type { RarityId } from '../core/rarity';

/**
 * (version anglaise, lot 4) Lignes du fil et du journal des pièces dans la langue active : le serveur stocke le texte
 * français + son code (src/core/msgs.ts). La carte et la rareté de la ligne sont relues dans la langue du joueur.
 */
export function feedText(a: { message: string; msgKey?: string; msgParams?: MsgParams; cardId?: string; rarity?: RarityId }): string {
  if (!a.msgKey) return a.message;
  return msgText(a.msgKey, { ...a.msgParams, ...(a.cardId ? { cardId: a.cardId } : {}), ...(a.rarity ? { rarityId: a.rarity } : {}) }, a.message);
}
export const txText = (t: { label: string; labelKey?: string; labelParams?: MsgParams }) => msgText(t.labelKey, t.labelParams, t.label);
