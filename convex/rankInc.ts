/**
 * (26/11, coût Convex) STATISTIQUES DE COLLECTION TENUES PAR DIFFÉRENCE pour le classement (convex/profiles.ts).
 *
 * AVANT : dès qu'un joueur ouvrait un booster, le cron du classement relisait sa collection ENTIÈRE (jusqu'à 17 700
 * lignes, 5,9 Mo lus pour un seul joueur), et le filet de 24 h relisait les 33 collections chaque jour : ≈ 37 % de la
 * Database I/O de la prod (mesure du 26/11, journaux de fonctions).
 * MAINTENANT : on garde, par joueur (table `rankInc`), les compteurs dont dépendent les statistiques (`statsFrom`) et
 * l'instant du calcul ; la fois suivante, on ne relit que les lignes écrites ou supprimées depuis (index `by_user_rev`
 * d'`inventory` et d'`invGone`, posés par convex/invRev.ts) et, pour une carte apparue ou disparue, ses autres lignes
 * (une petite lecture d'index). Relecture complète : pas encore de compteurs, catalogue changé, trop de changements
 * d'un coup (migration), trace de suppression sans date de naissance, ou une fois par semaine (filet).
 *
 * Seule la PRÉSENCE d'une ligne (carte, étoile) compte pour les statistiques (pas le nombre d'exemplaires). Pour savoir
 * si une ligne relue était déjà là au calcul précédent (instant T, lecture S) :
 *  - `win` : les lignes présentes à S écrites depuis T − MARGE (une mutation partie avant T peut se valider après S :
 *    son `rev`, l'horloge de son départ, est alors ≥ T − MARGE, et on la relit de toute façon) ;
 *  - une ligne relue, hors `win` et née avant T − MARGE/2, était là (et écrite avant T − MARGE) ; née après, non ;
 *  - une suppression relue, absente de `gw` (traces déjà vues à S) : faite après S ; la ligne était là si elle est née
 *    avant T − MARGE/2 (`invGone.born`).
 * Hypothèses (tenues par le code serveur) : une seule ligne par (joueur, carte, étoile) ; jamais de carte ni d'étoile
 * changée sur place (resyncRarities supprime et recrée) ; toute écriture pose `rev`, toute suppression passe par
 * `dropInv` ; une mutation dure bien moins que MARGE.
 */
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { catalogEntry, SUBTHEMES } from '../src/core/sets/themes';
import { CATALOG_CARDS } from './cardsCatalog';

/** même marge que le suivi par différence du client (src/core/net/invDiff.ts) */
export const INC_MARGIN_MS = 30_000;
/** au-delà de ce nombre de lignes (ou de traces) changées depuis le dernier calcul : relecture complète */
export const INC_CAP = 600;
/** filet : relecture complète au moins une fois par semaine */
export const INC_FULL_EVERY_MS = 7 * 24 * 3600_000;
const INC_V = 1;

export interface RankInc {
  v: number;
  /** signature du catalogue (cartes, thèmes, sous-thèmes) : changée → relecture complète */
  cat: string;
  /** instant du calcul (horloge de la requête) */
  at: number;
  /** instant de la dernière relecture complète */
  full: number;
  /** clés `carte|étoile` des lignes présentes écrites depuis `at − INC_MARGIN_MS` */
  win: string[];
  /** ids des traces de suppression (`invGone`) déjà vues depuis `at − INC_MARGIN_MS` */
  gw: string[];
  uniques: number;
  mythics: number;
  legendaries: number;
  secrets: number;
  /** cartes différentes (hors secrètes) par thème */
  th: Record<string, number>;
  /** cartes différentes (hors secrètes) par sous-thème, dans l'ordre de SUBTHEMES */
  sub: number[];
}

/** partie « collection » des statistiques (src/core/cosmetics.ts, statsFrom) */
export interface CollStats {
  uniques: number;
  mythics: number;
  legendaries: number;
  secrets: number;
  fullSubthemes: number;
  worldUniques: number;
  gamingUniques: number;
  popUniques: number;
  sportUniques: number;
}

const key = (c: { cardId: string; rarity: string }) => `${c.cardId}|${c.rarity}`;

const fnv = (parts: Iterable<string>): string => {
  let h = 0x811c9dc5;
  let n = 0;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 0x01000193) >>> 0;
    h = Math.imul(h ^ 0x7c, 0x01000193) >>> 0;
    n++;
  }
  return `${n}-${h.toString(36)}`;
};

// index du catalogue, calculés au premier usage (jamais au chargement du module)
let subIdx: Map<string, number[]> | null = null;
let subSize: number[] | null = null;
let catSig: string | null = null;
function index() {
  if (subIdx && subSize) return { subIdx, subSize };
  const idx = new Map<string, number[]>();
  const size: number[] = [];
  SUBTHEMES.forEach((st, i) => {
    const ids = new Set(st.cards.map((c) => c.id));
    size.push(ids.size);
    for (const id of ids) {
      const l = idx.get(id);
      if (l) l.push(i);
      else idx.set(id, [i]);
    }
  });
  subIdx = idx;
  subSize = size;
  return { subIdx, subSize };
}
export function incCatalogSig(): string {
  return (catSig ??= fnv([
    `v${INC_V}`,
    ...SUBTHEMES.map((st) => `${st.id}:${st.cards.map((c) => c.id).join(',')}`),
    ...CATALOG_CARDS.map((c) => `${c.id}:${catalogEntry(c.id)?.themeId ?? ''}`),
  ]));
}

/** compteurs d'UNE carte à partir des étoiles possédées (ajout = +1, retrait = −1) */
function apply(inc: Pick<RankInc, 'uniques' | 'mythics' | 'legendaries' | 'secrets' | 'th' | 'sub'>, cardId: string, rs: Set<string>, sign: 1 | -1) {
  const e = catalogEntry(cardId);
  if (!e || !rs.size) return;
  if ([...rs].some((r) => r !== 'secret')) {
    inc.uniques += sign;
    inc.th[e.themeId] = (inc.th[e.themeId] ?? 0) + sign;
    for (const i of index().subIdx.get(cardId) ?? []) inc.sub[i] = (inc.sub[i] ?? 0) + sign;
  }
  if (rs.has('mythic')) inc.mythics += sign;
  if (rs.has('legendary')) inc.legendaries += sign;
  if (rs.has('secret')) inc.secrets += sign;
}

/** Compteurs complets à partir de la collection entière (`gone` : traces de suppression récentes du joueur). */
export function incFromRows(rows: Array<Pick<Doc<'inventory'>, 'cardId' | 'rarity' | 'rev' | '_creationTime'>>, gone: Array<Pick<Doc<'invGone'>, '_id' | 'rev'>>, now: number): RankInc | null {
  const lo = now - INC_MARGIN_MS;
  // (tableau plein : Convex refuse `undefined` dans un tableau)
  const inc: RankInc = { v: INC_V, cat: incCatalogSig(), at: now, full: now, win: [], gw: [], uniques: 0, mythics: 0, legendaries: 0, secrets: 0, th: {}, sub: new Array<number>(index().subSize.length).fill(0) };
  const byCard = new Map<string, Set<string>>();
  for (const r of rows) {
    let s = byCard.get(r.cardId);
    if (!s) byCard.set(r.cardId, (s = new Set()));
    s.add(r.rarity);
    // (ligne sans `rev` : d'avant le suivi par différence — sa date de création en tient lieu, par prudence)
    if ((r.rev ?? r._creationTime) >= lo) inc.win.push(key(r));
  }
  for (const [cardId, rs] of byCard) apply(inc, cardId, rs, 1);
  inc.gw = gone.filter((g) => g.rev >= lo).map((g) => g._id as string);
  // fenêtre trop chargée (une migration vient de passer) : pas de compteurs, la prochaine fois relira tout
  if (inc.win.length > INC_CAP || inc.gw.length > INC_CAP) return null;
  return inc;
}

/** Statistiques « collection » rendues par les compteurs — mêmes valeurs que `statsFrom` sur la collection. */
export function collStats(inc: RankInc): CollStats {
  const { subSize: size } = index();
  let fullSubthemes = 0;
  for (let i = 0; i < size.length; i++) if (size[i] > 0 && (inc.sub[i] ?? 0) === size[i]) fullSubthemes++;
  return {
    uniques: inc.uniques,
    mythics: inc.mythics,
    legendaries: inc.legendaries,
    secrets: inc.secrets,
    fullSubthemes,
    worldUniques: inc.th.monde ?? 0,
    gamingUniques: inc.th.gaming ?? 0,
    popUniques: inc.th.pop ?? 0,
    sportUniques: inc.th.sport ?? 0,
  };
}

/** les compteurs gardés sont-ils encore utilisables ? */
export function incUsable(prev: unknown, now: number): prev is RankInc {
  const p = prev as RankInc | null | undefined;
  return !!p && p.v === INC_V && p.cat === incCatalogSig() && p.at <= now && now - p.full < INC_FULL_EVERY_MS && Array.isArray(p.win) && Array.isArray(p.gw) && Array.isArray(p.sub);
}

/**
 * Compteurs mis à jour par différence depuis `prev`, ou null si une relecture complète est nécessaire.
 * Lit : les lignes et traces écrites depuis `prev.at − MARGE`, et les autres lignes des cartes apparues / disparues.
 */
export async function incDelta(ctx: QueryCtx | MutationCtx, userId: Id<'users'>, prev: RankInc, now: number): Promise<RankInc | null> {
  const lo = prev.at - INC_MARGIN_MS;
  const born = prev.at - INC_MARGIN_MS / 2;
  const [rows, gone] = await Promise.all([
    ctx.db.query('inventory').withIndex('by_user_rev', (q) => q.eq('userId', userId).gte('rev', lo)).take(INC_CAP + 1),
    ctx.db.query('invGone').withIndex('by_user_rev', (q) => q.eq('userId', userId).gte('rev', lo)).take(INC_CAP + 1),
  ]);
  if (rows.length > INC_CAP || gone.length > INC_CAP) return null;
  const win = new Set(prev.win);
  const gw = new Set(prev.gw);
  /** présence au calcul précédent des clés relues (ligne présente maintenant, ou supprimée depuis) */
  const before = new Map<string, boolean>();
  const present = new Map<string, boolean>();
  for (const r of rows) {
    const k = key(r);
    present.set(k, true);
    if (win.has(k) || r._creationTime < born) before.set(k, true);
    else if (!before.has(k)) before.set(k, false);
  }
  for (const g of gone) {
    const k = key(g);
    if (!present.has(k)) present.set(k, false);
    if (win.has(k)) {
      before.set(k, true);
      continue;
    }
    if (gw.has(g._id as string)) {
      if (!before.has(k)) before.set(k, false);
      continue;
    }
    // suppression faite après le calcul précédent : la ligne était-elle déjà là ?
    if (g.born === undefined) return null; // (trace d'avant le 26/11) : on ne sait pas, relecture complète
    if (g.born < born) before.set(k, true);
    else if (!before.has(k)) before.set(k, false);
  }
  // cartes dont une ligne est apparue ou a disparu : les autres étoiles de la carte (inchangées) comptent aussi
  const moved = new Set<string>();
  for (const [k, b] of before) if (b !== present.get(k)) moved.add(k.slice(0, k.lastIndexOf('|')));
  const inc: RankInc = { ...prev, at: now, th: { ...prev.th }, sub: [...prev.sub], win: [], gw: [] };
  for (const cardId of moved) {
    const cur = await ctx.db.query('inventory').withIndex('by_user_card_rarity', (q) => q.eq('userId', userId).eq('cardId', cardId)).take(16);
    const after = new Set(cur.map((r) => r.rarity as string));
    const was = new Set<string>();
    for (const r of after) if (!before.has(`${cardId}|${r}`)) was.add(r); // ligne inchangée : là avant comme maintenant
    for (const [k, b] of before) if (b && k.slice(0, k.lastIndexOf('|')) === cardId) was.add(k.slice(k.lastIndexOf('|') + 1));
    apply(inc, cardId, was, -1);
    apply(inc, cardId, after, 1);
  }
  const lo2 = now - INC_MARGIN_MS;
  inc.win = rows.filter((r) => (r.rev ?? -Infinity) >= lo2).map(key);
  inc.gw = gone.filter((g) => g.rev >= lo2).map((g) => g._id as string);
  return inc;
}

/** compteurs gardés d'un joueur */
export async function incOf(ctx: QueryCtx | MutationCtx, userId: Id<'users'>): Promise<Doc<'rankInc'> | null> {
  return await ctx.db.query('rankInc').withIndex('by_user', (q) => q.eq('userId', userId)).first();
}

/** enregistre les compteurs (le plus récent gagne : un calcul plus ancien n'écrase pas un plus récent) */
export async function saveInc(ctx: MutationCtx, userId: Id<'users'>, inc: RankInc | null | undefined) {
  if (!inc) return;
  const old = await incOf(ctx, userId);
  if (old && old.at >= inc.at) return;
  if (old) await ctx.db.replace(old._id, { userId, inc, at: inc.at });
  else await ctx.db.insert('rankInc', { userId, inc, at: inc.at });
}
