/**
 * (son V2, 11/11) Réglages du son mémorisés sur l'appareil, tous DÉSACTIVÉS par défaut :
 *  - `bebou.pad` : nappe des menus (audio.ts `setPad`) ;
 *  - `bebou.silent` : son même en mode silencieux de l'iPhone (audio.ts `setPlayThroughSilent`).
 */
const get = (k: string) => {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
};
const set = (k: string, on: boolean) => {
  try {
    localStorage.setItem(k, on ? '1' : '0');
  } catch {
    /* stockage refusé : réglage pour la session seulement */
  }
};
export const padOn = () => get('bebou.pad');
export const setPadOn = (on: boolean) => set('bebou.pad', on);
export const silentOn = () => get('bebou.silent');
export const setSilentOn = (on: boolean) => set('bebou.silent', on);
