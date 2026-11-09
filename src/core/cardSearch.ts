import { ALL_THEMES, cardFamily, subthemeById, themeById, type CatalogEntry } from './sets/themesCore';

/**
 * RECHERCHE DE CARTES (v1.0.9, retours 09/11 — « faciliter les échanges ») : une seule règle pour la collection, le
 * composeur d'échange et la recherche « Chercher un propriétaire ».
 *  - insensible aux accents, à la casse, aux apostrophes et à la ponctuation (« pere noel » trouve « Père Noël ») ;
 *  - PLUSIEURS MOTS, dans n'importe quel ordre : chacun doit se trouver quelque part (« pikachu pokemon »,
 *    « messi foot », « mbappe 6 ») ;
 *  - cherche dans le nom, l'univers (sous-thème et sa famille : « pokemon », « mangas »), le pack, l'artiste (musique)
 *    et le type (Monde) ;
 *  - un nombre seul = le numéro de la carte (« 25 », « 025 ») ; « 6★ », « 6* » ou « 6 etoiles » = les étoiles ;
 *  - classement : nom qui COMMENCE par la recherche, puis nom qui la contient, puis mots dans le nom, puis le reste.
 */

/** minuscules, sans accents ni ponctuation, espaces simples */
export const searchFold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´\-_.,:;!?/\\()[\]{}"«»&+·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STAR_RANK: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6, secret: 7 };

const hayCache = new Map<string, { name: string; rest: string }>();
function hay(e: CatalogEntry) {
  let h = hayCache.get(e.id);
  if (!h) {
    const st = subthemeById(e.subthemeId);
    const th = themeById(e.themeId);
    h = {
      name: searchFold(e.name),
      rest: searchFold([st?.label ?? '', st?.group?.label ?? '', st?.group?.id ?? '', st?.code ?? '', th?.label ?? '', th?.booster ?? '', e.artist ?? '', e.label ?? ''].join(' ')),
    };
    hayCache.set(e.id, h);
  }
  return h;
}

/** « Pokémon · Kanto », « Naruto · Mangas & anime » : où se range la carte (affichage des résultats) */
export function cardWhere(e: CatalogEntry): string {
  const f = cardFamily(e.id);
  return f ? [f.family, f.sub].filter(Boolean).join(' · ') : (subthemeById(e.subthemeId)?.label ?? '');
}

export interface CardQuery {
  /** recherche vide (tout passe) */
  empty: boolean;
  /** la carte correspond-elle ? */
  test(e: CatalogEntry): boolean;
  /** pertinence (plus petit = mieux) — seulement pour une carte qui passe `test` */
  score(e: CatalogEntry): number;
}

export function cardQuery(raw: string): CardQuery {
  let q = searchFold(raw);
  // étoiles : « 6★ », « 6 * », « 6 etoiles »
  let stars = 0;
  q = q
    .replace(/(^|\s)([1-6])\s*(★|\*|etoiles?)(?=\s|$)/g, (_, a: string, n: string) => ((stars = Number(n)), a))
    .replace(/★/g, ' ')
    .trim();
  // élisions (« l'Oréal », « d'Amérique ») : une lettre seule ne compte pas s'il y a d'autres mots
  let words = q ? q.split(' ') : [];
  if (words.some((w) => w.length > 1)) words = words.filter((w) => w.length > 1 || /\d/.test(w));
  q = words.join(' ');
  const num = words.length === 1 && /^\d+$/.test(words[0]) ? Number(words[0]) : null;
  const empty = !words.length && !stars;
  const test = (e: CatalogEntry) => {
    if (stars && STAR_RANK[e.rarity] !== stars) return false;
    if (num !== null) return e.num === num || hay(e).name.includes(words[0]);
    const h = hay(e);
    return words.every((w) => h.name.includes(w) || h.rest.includes(w) || (/^\d+$/.test(w) && e.num === Number(w)));
  };
  const score = (e: CatalogEntry) => {
    if (!words.length) return 0;
    if (num !== null) return e.num === num ? 0 : 3;
    const n = hay(e).name;
    if (n.startsWith(q)) return n === q ? 0 : 1;
    if (n.includes(q)) return 2;
    const inName = words.filter((w) => n.includes(w)).length;
    return inName === words.length ? 3 : 6 - Math.min(2, inName);
  };
  return { empty, test, score };
}

/**
 * Toutes les cartes du catalogue qui correspondent, les plus pertinentes d'abord (puis étoiles décroissantes).
 * `includeSecret` : les cartes secrètes ne sortent que si on les possède (même règle que la collection).
 */
export function searchCatalog(raw: string, opts: { limit?: number; includeSecret?: (id: string) => boolean } = {}): CatalogEntry[] {
  const cq = cardQuery(raw);
  if (cq.empty) return [];
  const out: Array<{ e: CatalogEntry; s: number }> = [];
  for (const t of ALL_THEMES)
    for (const e of t.cards) {
      if (e.rarity === 'secret' && !opts.includeSecret?.(e.id)) continue;
      if (cq.test(e)) out.push({ e, s: cq.score(e) });
    }
  out.sort((a, b) => a.s - b.s || STAR_RANK[b.e.rarity] - STAR_RANK[a.e.rarity] || a.e.name.length - b.e.name.length);
  return out.slice(0, opts.limit ?? 40).map((x) => x.e);
}
