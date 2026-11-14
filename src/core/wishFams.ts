/**
 * ENVIES PAR FAMILLE (v2.1, demande de Tom et Hugo) — « Je veux l'album » : UNE ligne par album (sous-thème, clé
 * `s:<id>`) ou par famille d'albums (groupe, clé `g:<id>`), quelle que soit sa taille. Elle veut dire « toutes les
 * cartes de cette famille que je n'ai pas encore » : rien n'est recopié carte par carte (Kanto = 151 cartes), et une
 * carte obtenue sort toute seule des envies (les lectures « qui la veut » écartent ceux qui l'ont déjà).
 * Partagé par le serveur (convex/users.ts, deals.ts) et le jeu (collection, « Pour toi »).
 */
import { ALL_THEMES, catalogEntry, subthemeById, type CatalogEntry } from './sets/themes';

/** familles voulues au plus par joueur (« Pour toi » reste rapide) */
export const WISH_FAMS_MAX = 10;
/** préfixe des lignes de l'index inversé (table `wishes`, champ `cardId`) */
export const FAM_ROW = 'fam:';

let groups: Map<string, CatalogEntry[]> | null = null;
function groupCards(): Map<string, CatalogEntry[]> {
  if (groups) return groups;
  groups = new Map();
  for (const t of ALL_THEMES)
    for (const c of t.cards) {
      const g = subthemeById(c.subthemeId)?.group?.id;
      if (!g || c.rarity === 'secret') continue;
      let l = groups.get(g);
      if (!l) groups.set(g, (l = []));
      l.push(c);
    }
  return groups;
}

/** Cartes d'une famille voulue (sans les secrètes) ; vide si la clé ne désigne rien. */
export function famCards(key: string): CatalogEntry[] {
  const id = key.slice(2);
  if (key.startsWith('s:')) {
    const st = subthemeById(id);
    return st && st.themeId !== 'bebous' ? st.cards.filter((c) => c.rarity !== 'secret') : [];
  }
  return key.startsWith('g:') ? groupCards().get(id) ?? [] : [];
}
export const famKeyValid = (key: string): boolean => famCards(key).length > 0;

/** Les familles dont fait partie une carte : son album, puis sa famille d'albums s'il en a une. */
export function famKeysOfCard(cardId: string): string[] {
  const e = catalogEntry(cardId);
  if (!e || e.rarity === 'secret') return [];
  const st = subthemeById(e.subthemeId);
  if (!st || st.themeId === 'bebous') return [];
  return st.group ? [`s:${st.id}`, `g:${st.group.id}`] : [`s:${st.id}`];
}

/** Ce joueur veut-il cette carte ? (envie directe, ou une de ses familles voulues — sans regarder s'il l'a déjà) */
export function wantsCard(wishlist: readonly string[] | undefined, fams: readonly string[] | undefined, cardId: string): boolean {
  if (wishlist?.includes(cardId)) return true;
  if (!fams?.length) return false;
  const keys = famKeysOfCard(cardId);
  return keys.some((k) => fams.includes(k));
}
