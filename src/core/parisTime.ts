/**
 * JOUR ET HEURE DE PARIS — fonctions pures, AUCUN import (audit perf V3 n°10).
 *
 * Avant, ici : `missionDay` dans missions.ts et `parisHour` dans games.ts, deux modules qui importent le catalogue
 * (`sets/themes`). Côté serveur Convex, un module qui ne voulait que la date (notifications, push) embarquait donc les
 * 4 Mo du catalogue et payait ≈ 0,15-0,2 s de chargement à chaque exécution. Les deux fichiers les réexportent : les
 * imports existants ne changent pas. Même code, même sortie.
 */

/**
 * Formateur du jour de Paris, créé une seule fois (perf, PROFIL B5 : en créer un à chaque appel coûtait ~0,1 ms ×
 * des milliers d'appels — 920 ms par ouverture au téléphone ; `nextMissionReset` en fait une dizaine par appel).
 * Même sortie. Création impossible (pas d'Intl / de fuseaux) : l'erreur se reproduit à chaque appel → même repli qu'avant.
 */
let dayFmt: Intl.DateTimeFormat | undefined;

/** Jour « de Paris » : 2026-11-02. */
export function missionDay(now: number): string {
  try {
    dayFmt ??= new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
    return dayFmt.format(now);
  } catch {
    return new Date(now + 3600_000).toISOString().slice(0, 10);
  }
}

/** Formateur de l'heure de Paris, créé une seule fois (perf : `nextRouletteDraw` l'appelle minute par minute). */
let hourFmt: Intl.DateTimeFormat | undefined;

/** Heure (0..23) à Paris. */
export function parisHour(now: number): number {
  try {
    // (« 01 h » en français : on lit la partie « heure » seule)
    hourFmt ??= new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' });
    const h = hourFmt.formatToParts(now).find((p) => p.type === 'hour')?.value;
    const n = Number(h);
    if (Number.isFinite(n)) return n % 24;
    throw new Error('heure introuvable');
  } catch {
    return (new Date(now).getUTCHours() + 1) % 24;
  }
}
