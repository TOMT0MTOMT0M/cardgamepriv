/**
 * TITRES UNIQUES (« world first », 20/11) — un titre par collection, pour UN SEUL joueur dans tout le jeu : le premier
 * qui possède 100 % des cartes de la collection le remporte pour toujours ; personne d'autre ne peut l'obtenir ensuite.
 *
 * Logique pure, partagée par le serveur (convex/titres.ts : attribution atomique), le mode démo et l'interface.
 * AJOUTER UN TITRE = une ligne dans `UNIQUE_TITLES` (id figé, ensemble de complétion de src/core/economy.ts :
 * `grp:<groupe>`, `sub:<album>` ou `theme:<thème>`) + son nom anglais dans i18n/en/data.ts (`ut.<id>`). Rien d'autre.
 */
import { tData } from './i18n';
import { completionSets, type CompletionSet } from './economy';
import { msgRef, str } from './msgRefs';

export interface UniqueTitle {
  /** identifiant figé (stocké en base) */
  id: string;
  /** ensemble à compléter à 100 % (`completionSets()`) */
  setId: string;
  /** le titre, en français (l'anglais : `ut.<id>` dans i18n/en/data.ts) */
  label: string;
  /** teinte du titre (#rrggbb) : celle de l'univers, loin des couleurs de rareté */
  tint: string;
}

export const UNIQUE_TITLES: readonly UniqueTitle[] = [
  { id: 'radiant', setId: 'grp:valorant', label: 'Radiant', tint: '#ffe9a8' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'hokage', setId: 'sub:naruto', label: 'Hokage', tint: '#ff9a4d' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'maitre-pokemon', setId: 'grp:pokemon', label: 'Maître Pokémon', tint: '#ff6b6b' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
  { id: 'challenger', setId: 'grp:lol', label: 'Challenger', tint: '#7fd4ff' }, // i18n-ok (noms des titres : l'anglais est dans i18n/en/data.ts)
];

export const uniqueTitle = (id: string) => UNIQUE_TITLES.find((t) => t.id === id);
/** Nom du titre dans la langue active. */
export const uniqueTitleLabel = (t: UniqueTitle) => tData(`ut.${t.id}`, t.label);

/** L'ensemble (cartes, nom de la collection) d'un titre ; undefined si le catalogue ne le contient pas (pas encore chargé). */
export function uniqueTitleSet(t: UniqueTitle): CompletionSet | undefined {
  return completionSets().find((s) => s.id === t.setId);
}

/** Avancement d'un joueur sur un titre. Ensemble introuvable ou vide : jamais « complet ». */
export function uniqueTitleProgress(t: UniqueTitle, ownedIds: ReadonlySet<string>): { have: number; total: number; done: boolean } {
  const set = uniqueTitleSet(t);
  const total = set?.cards.length ?? 0;
  let have = 0;
  if (set) for (const c of set.cards) if (ownedIds.has(c.id)) have++;
  return { have, total, done: total > 0 && have === total };
}

/** Titres que ce joueur peut remporter maintenant : collection complète ET titre encore libre. */
export function claimableUniqueTitles(ownedIds: ReadonlySet<string>, takenIds: ReadonlySet<string>): UniqueTitle[] {
  return UNIQUE_TITLES.filter((t) => !takenIds.has(t.id) && uniqueTitleProgress(t, ownedIds).done);
}

/** Un titre attribué, tel que le jeu le voit (requête `titres:holders`, démo). */
export interface UniqueTitleHolder {
  titleId: string;
  userId: string;
  name: string;
  at: number;
}

// (messages stockés : le nom du titre et celui de la collection, relus dans la langue active)
msgRef('utitle', (p) => { const t = uniqueTitle(str(p.titleId) ?? ''); return t ? uniqueTitleLabel(t) : undefined; });
