/**
 * ÉVÉNEMENTS LIMITÉS (V2, 11/11 — 1er vote du sondage des joueurs) : chaque arrivée de nouvelles cartes sort comme un
 * « booster du moment », ouvrable seulement entre son début et sa fin. Logique pure, partagée par le serveur
 * (convex/events.ts, convex/packs.ts), le mode démo (localBackend.ts), la boutique et le dashboard admin.
 *
 * Contenu d'un événement = des sous-thèmes (ou groupes `group:<id>`, comme les missions) et/ou une liste de cartes.
 * Le tirage reste celui des autres boosters (packRoll.ts : mêmes poids par étoile, pity, god pack) sur ce pool.
 * Décisions (11/11) : pas de carte secrète dans un booster du moment (les Bébous restent au Bebou Pack) ; les cartes
 * de l'événement restent aussi dans les boosters normaux (pas d'exclusivité) ; un seul événement à la fois.
 */
import { ALL_THEMES, catalogEntry, catalogInstalled, inSubthemeScope, scopeLabel, type CatalogEntry } from './sets/themes';

export interface EventContent {
  /** sous-thèmes (`pokemon-gen1`…) ou groupes (`group:valorant`) */
  subthemes?: string[];
  /** cartes une à une */
  cards?: string[];
}

/** Un événement tel que le jeu le voit (requête `events:current`, démo). */
export interface PackEvent extends EventContent {
  id: string;
  name: string;
  /** phrase courte sous le nom (fiche, bandeau) */
  blurb?: string;
  startAt: number;
  endAt: number;
  /** couleur du sachet et des filets (#rrggbb) */
  accent: string;
}

/** Clé du booster du moment dans la boutique et la scène d'ouverture (un seul à la fois). */
export const EVENT_KEY = 'event';

/** Limites (dashboard + serveur) */
export const EVENT_LIMITS = { name: 28, blurb: 90, subthemes: 40, cards: 400, maxDays: 60 } as const;

/**
 * Teintes proposées dans le dashboard (sachets alu teintés comme les 5 autres). Le serveur accepte n'importe quel
 * #rrggbb ; celles-ci restent loin des couleurs de rareté (gris, vert, bleu, rouge, doré) pour ne pas les brouiller.
 */
export const EVENT_ACCENTS: Array<[string, string]> = [
  ['#c2410c', 'Cuivre'],
  ['#be185d', 'Framboise'],
  ['#7c3aed', 'Violet'],
  ['#0f766e', 'Pétrole'],
  ['#4d7c0f', 'Olive'],
  ['#525252', 'Graphite'],
];

export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

/** En cours à `now` ? (début inclus, fin exclue) */
export const eventLive = (e: Pick<PackEvent, 'startAt' | 'endAt'>, now = Date.now()) => e.startAt <= now && now < e.endAt;

/** L'événement en cours (le premier s'il y en avait plusieurs) */
export function liveEvent<T extends Pick<PackEvent, 'startAt' | 'endAt'>>(list: readonly T[] | undefined | null, now = Date.now()): T | null {
  return (list ?? []).filter((e) => eventLive(e, now)).sort((a, b) => a.startAt - b.startAt)[0] ?? null;
}

/** Signature du contenu (clé de cache du pool de tirage) */
export const contentSig = (c: EventContent) => `${[...(c.subthemes ?? [])].sort().join(',')}|${[...(c.cards ?? [])].sort().join(',')}`;

const poolCache = new Map<string, CatalogEntry[]>();

/**
 * Cartes d'un événement (ordre du catalogue, sans doublon) : jamais de secrète ni de carte du thème secret (Bébous).
 * Ids inconnus ignorés (carte retirée du catalogue depuis).
 */
export function eventCards(c: EventContent): CatalogEntry[] {
  const key = contentSig(c);
  const hit = poolCache.get(key);
  if (hit) return hit;
  const out: CatalogEntry[] = [];
  const seen = new Set<string>();
  const scopes = c.subthemes ?? [];
  if (scopes.length)
    for (const t of ALL_THEMES) {
      if (t.secret) continue;
      // par sous-thème (quelques centaines), pas par carte (37 000) : le serveur le calcule à froid
      for (const st of t.subthemes) {
        if (!scopes.some((s) => inSubthemeScope(s, st.id))) continue;
        for (const e of st.cards)
          if (e.rarity !== 'secret' && !seen.has(e.id)) {
            seen.add(e.id);
            out.push(e);
          }
      }
    }
  for (const id of c.cards ?? []) {
    const e = catalogEntry(id);
    if (!e || e.rarity === 'secret' || e.themeId === 'bebous' || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  // (client : le catalogue complet arrive pendant le démarrage — on ne fige pas un pool calculé trop tôt)
  if (catalogInstalled()) poolCache.set(key, out);
  return out;
}

/** « Valorant · Pokémon · 12 cartes à part » (dashboard, fiche) */
export function contentLabel(c: EventContent): string {
  const parts = (c.subthemes ?? []).map((s) => scopeLabel(s));
  const n = c.cards?.length ?? 0;
  if (n) parts.push(`${n} carte${n > 1 ? 's' : ''} à part`);
  return parts.join(' · ');
}

/** Contrôle d'un événement avant enregistrement : message d'erreur en français, ou null. */
export function checkEvent(e: { name: string; startAt: number; endAt: number; accent: string; blurb?: string } & EventContent): string | null {
  const name = e.name.trim();
  if (name.length < 2) return 'Donne un nom à l’événement (2 lettres au moins).';
  if (name.length > EVENT_LIMITS.name) return `Nom trop long (${EVENT_LIMITS.name} caractères au plus : il est moulé sur le sachet).`;
  if ((e.blurb ?? '').length > EVENT_LIMITS.blurb) return `Phrase trop longue (${EVENT_LIMITS.blurb} caractères au plus).`;
  if (!Number.isFinite(e.startAt) || !Number.isFinite(e.endAt)) return 'Dates invalides.';
  if (e.endAt <= e.startAt) return 'La fin doit venir après le début.';
  if (e.endAt - e.startAt > EVENT_LIMITS.maxDays * 86_400_000) return `${EVENT_LIMITS.maxDays} jours au plus.`;
  if (!isHex(e.accent)) return 'Couleur invalide (#rrggbb).';
  if ((e.subthemes?.length ?? 0) > EVENT_LIMITS.subthemes) return `${EVENT_LIMITS.subthemes} sous-thèmes au plus.`;
  if ((e.cards?.length ?? 0) > EVENT_LIMITS.cards) return `${EVENT_LIMITS.cards} cartes à part au plus (sinon, choisis un sous-thème).`;
  if (!eventCards(e).length) return 'Le booster serait vide : choisis au moins un sous-thème ou une carte.';
  return null;
}

/** Temps restant, court : « 2 j 4 h », « 3 h 12 min », « 12 min », « 40 s » */
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h ? `${d} j ${h} h` : `${d} j`;
  if (h > 0) return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

/**
 * Mode démo et localBackend : un événement d'exemple, toujours en cours (commencé il y a 2 h, encore 2 j 6 h),
 * sur les armes Valorant (catalogue de base : présent même avant les gros sets).
 */
export function demoEvent(now = Date.now()): PackEvent {
  const h = 3_600_000;
  const start = Math.floor(now / h) * h - 2 * h;
  return { id: 'demo-valorant', name: 'Valorant', blurb: 'Les armes et leurs skins, quelques jours seulement', startAt: start, endAt: start + 56 * h, accent: '#be185d', subthemes: ['group:valorant'] };
}
