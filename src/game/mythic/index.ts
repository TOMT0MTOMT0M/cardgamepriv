/**
 * ANIMATIONS DES 6★ PAR FAMILLE (doc « animations 6★ par famille », 07/11 — « pour toutes », 08/11).
 *
 * Toutes les 6★ (hors Pokémon : rencontre sauvage ; Yu-Gi-Oh : invocation ; secrètes : leurs séquences) ont la même
 * structure en 4 temps :
 *  1. ANNONCE (déjà là) : la tranche arc-en-ciel dans la pile ;
 *  2. INDICES (≈ 1,5 s) : 2 ou 3 infos qui claquent plein écran, façon walkout — thème → famille → détail ;
 *  3. SCÈNE DE LA FAMILLE (≈ 2,5 s) : le décor propre au groupe (scenes/*.ts, une par famille) ;
 *  4. LA CARTE : le retournement habituel de la 6★ (anticipation, impact, étoiles), inchangé.
 * Version COURTE (≈ 1,5 s) dès que la scène de cette famille a déjà été vue sur l'appareil ; « Effets réduits » :
 * indices seuls. Toujours passable d'un toucher. Rejouable depuis toutes les visionneuses (bouton « Rejouer »).
 *
 * Ce module-ci est LÉGER (importé d'office par la boutique et la visionneuse) : le moteur (runtime.ts, CSS) et chaque
 * scène ne sont téléchargés qu'à la première 6★ de leur famille.
 */
import { isEclipseCard } from '../eclipse';
import { SUBTHEMES, catalogEntry, fmtCount, subthemeById, themeById, type SubTheme } from '../../core/sets/themes';
import { fxReduced } from '../../core/fxPref';
import type { Shell } from '../shell';
import { duelMonster } from '../scenes/duelMonsters';
import type { MythicCard, SceneFn } from './kit';
import type { CardTarget } from './runtime';

/** une scène peut exposer `preload` : ses images sont demandées pendant que le joueur ouvre le booster */
type Loader = () => Promise<{ default: SceneFn; preload?: (card: MythicCard) => void }>;

/** famille (id de groupe, ou sous-thème sans groupe) → scène */
const SCENES: Record<string, Loader> = {
  // Gaming
  'jeux-video': () => import('./scenes/cartouche'),
  lol: () => import('./scenes/splash'),
  cs: () => import('./scenes/caisse'),
  valorant: () => import('./scenes/inspection'),
  // Pop Culture
  anime: () => import('./scenes/manga'),
  musique: () => import('./scenes/vinyle'),
  series: () => import('./scenes/tele'),
  films: () => import('./scenes/cinema'),
  dessins: () => import('./scenes/celluloids'),
  stars: () => import('./scenes/tapisRouge'),
  youtubeurs: () => import('./scenes/direct'),
  // Sport
  foot: () => import('./scenes/tunnel'),
  collectifs: () => import('./scenes/buzzer'),
  olympiques: () => import('./scenes/photoFinish'),
  combat: () => import('./scenes/ring'),
  raquettes: () => import('./scenes/arbitrage'),
  glisse: () => import('./scenes/chrono'),
  meca: () => import('./scenes/feux'),
  precision: () => import('./scenes/precision'),
  esport: () => import('./scenes/dernierCoup'),
  coulisses: () => import('./scenes/vestiaire'),
  // World
  animaux: () => import('./scenes/piegePhoto'),
  lieux: () => import('./scenes/globe'),
  nourriture: () => import('./scenes/nourriture'),
  voitures: () => import('./scenes/bache'),
  ardeche: () => import('./scenes/topo'),
};

/** les familles qui ont une scène, dans l'ordre du catalogue (labo 045) */
export const MYTHIC_FAMILIES = Object.keys(SCENES);
/** chargeur de la scène d'une famille (labo 045) */
export const mythicScene = (fam: string): Loader | undefined => SCENES[fam];

/** Famille d'une 6★ qui a sa scène (null : pas une 6★, ou elle a déjà sa propre séquence). */
export function mythicFamily(cardId: string, rarity: string): string | null {
  if (rarity !== 'mythic' || cardId.startsWith('pkm-') || duelMonster(cardId)) return null;
  // (11/11, Tom) Berserk 6★ : l'Éclipse (game/eclipse.ts, scenes/opening.ts) REMPLACE la case de manga des animés
  if (isEclipseCard({ cardId, rarity })) return null;
  const e = catalogEntry(cardId);
  if (!e) return null;
  const st = subthemeById(e.subthemeId);
  const fam = st?.group?.id ?? e.subthemeId;
  return SCENES[fam] ? fam : null;
}

/** « Football — Premier League » → « Premier League » ; « Couteaux ★ » → « Couteaux » */
const tidy = (s: string) => s.replace(/^[^—]+—\s*/, '').replace(/\s*★\s*$/, '').trim();

export function mythicCard(cardId: string): MythicCard | null {
  const e = catalogEntry(cardId);
  if (!e) return null;
  const st = subthemeById(e.subthemeId);
  return {
    id: cardId,
    theme: e.themeId,
    family: st?.group?.id ?? e.subthemeId,
    subId: e.subthemeId,
    sub: tidy(st?.label ?? ''),
    year: e.year || undefined,
    label: e.label,
  };
}

/** nombre de 6★ par sous-thème (un 3e indice qui ne laisse qu'une ou deux cartes possibles = spoil : on le cache) */
let mythCount: Map<string, number> | null = null;
function mythicsIn(subId: string): number {
  if (!mythCount) {
    mythCount = new Map();
    for (const st of SUBTHEMES) mythCount.set(st.id, st.cards.reduce((a, c) => a + (c.rarity === 'mythic' ? 1 : 0), 0));
  }
  return mythCount.get(subId) ?? 0;
}
const familySize = (st: SubTheme | undefined) => (st?.group ? SUBTHEMES.filter((s) => s.group?.id === st.group!.id) : st ? [st] : []).reduce((a, s) => a + mythicsIn(s.id), 0);

/**
 * INDICES façon walkout, tirés des données (jamais le nom de la carte) : thème → famille → détail.
 *  - Jeux vidéo : GAMING → ZELDA → 1991 ;  Football : SPORT → FOOTBALL → PREMIER LEAGUE ;
 *  - Mangas : POP CULTURE → MANGAS & ANIME → JUJUTSU KAISEN (seulement si la série a ≥ 3 cartes 6★ — sinon le nom de
 *    la série donnerait la carte : on affiche « 1 PARMI 251 » à la place) ;  Animaux : WORLD → ANIMAUX → MAMMIFÈRES.
 */
export function mythicClues(cardId: string): string[] {
  const e = catalogEntry(cardId);
  if (!e) return [];
  const st = subthemeById(e.subthemeId);
  const theme = themeById(e.themeId)?.label ?? '';
  const out = [theme];
  const fam = st?.group?.label ?? st?.label ?? '';
  if (fam) out.push(fam);
  const sub = tidy(st?.label ?? '');
  const safe = mythicsIn(e.subthemeId) >= 3;
  const generic = /^(musique|youtube|chansons|albums)/i.test(sub) || sub.toLowerCase() === fam.toLowerCase();
  const n = familySize(st);
  let third = '';
  if (e.year) third = String(e.year);
  else if (st?.group && sub && safe && !generic) third = sub;
  else if (n > 1) third = `1 parmi ${fmtCount(n)}`;
  // Jeux vidéo : GAMING → ZELDA → 1991 (la famille « Jeux vidéo » laisse sa place à la série… si elle ne spoile pas)
  if (e.year && st?.group?.id === 'jeux-video') out[1] = safe ? sub : 'Jeux vidéo';
  if (third) out.push(third);
  const seen = new Set<string>();
  // (10/11) casse naturelle : le moteur met chaque indice dans la casse de SA police (runtime.ts playClues)
  return out.filter((s) => s && !seen.has(s.toLowerCase()) && (seen.add(s.toLowerCase()), true));
}

// ───────────────────────────────────────────── « déjà vue » (par famille, mémorisé sur l'appareil)
const SEEN_KEY = 'bebou.mythSeen';
let seenFam: Set<string> | null = null;
function seenSet(): Set<string> {
  if (seenFam) return seenFam;
  try {
    seenFam = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    seenFam = new Set();
  }
  return seenFam;
}
export const familySeen = (fam: string) => seenSet().has(fam);
function markFamilySeen(fam: string) {
  const s = seenSet();
  if (s.has(fam)) return;
  s.add(fam);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  } catch {
    /* stockage indisponible : vaut pour la session */
  }
}

// ───────────────────────────────────────────── lecture
export interface PreludeHandle {
  /** résolu quand la carte doit prendre le relais (fin, toucher pour passer, ou abandon) */
  done: Promise<void>;
  /** résolu un peu avant : la carte doit être LÀ sous le calque, qui commence à se fondre (visionneuse) */
  handoff: Promise<void>;
  /** coupe tout de suite (Tout passer, retour boutique) */
  abort(): void;
}

let current: PreludeHandle | null = null;

/** dernière lecture par carte : la visionneuse ne rejoue pas la scène d'une carte qu'on vient de voir (ouverture → récap) */
const played = new Map<string, number>();
export const mythicJustPlayed = (cardId: string, within = 60_000) => performance.now() - (played.get(cardId) ?? -Infinity) < within;

/** Précharge le moteur et la scène d'une 6★ (pendant que le joueur ouvre le booster). */
export function prepareMythic(cardId: string, rarity: string): void {
  const fam = mythicFamily(cardId, rarity);
  if (!fam) return;
  void import('./runtime').catch(() => undefined);
  void SCENES[fam]()
    .then((m) => {
      const card = mythicCard(cardId);
      if (card) m.preload?.(card);
    })
    .catch(() => undefined);
}

/**
 * Joue indices + scène de la famille. `mode` : 'opening' (la carte attend face cachée derrière, le rendu 3D est mis
 * en pause pendant la scène) ou 'viewer' (visionneuse). `quick` : force la version courte (Tout révéler) ; `full` :
 * version complète quoi qu'il arrive (bouton Rejouer) ; `auto` : ouverture d'une 6★ dans une visionneuse — on sait
 * déjà quelle carte c'est, donc pas de suspense : la famille seule en indice, puis la scène à vitesse normale ;
 * `target` : place de la vraie carte 3D, où la doublure se pose avant de s'effacer.
 */
export function playMythicPrelude(
  shell: Shell,
  cardId: string,
  rarity: string,
  mode: 'opening' | 'viewer',
  o: { quick?: boolean; full?: boolean; auto?: boolean; target?: () => CardTarget | null } = {},
): PreludeHandle {
  current?.abort();
  const fam = mythicFamily(cardId, rarity);
  const card = mythicCard(cardId);
  let aborted = false;
  let inner: PreludeHandle | null = null;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  let handed!: () => void;
  const handoff = new Promise<void>((r) => (handed = r));
  const h: PreludeHandle = {
    done,
    handoff,
    abort() {
      aborted = true;
      inner?.abort();
      handed();
      resolve();
    },
  };
  current = h;
  if (!fam || !card) {
    handed();
    resolve();
    return h;
  }
  const reduced = fxReduced();
  const short = !o.full && !o.auto && (!!o.quick || familySeen(fam));
  markFamilySeen(fam);
  played.set(cardId, performance.now());
  prepareMythic(cardId, rarity); // (visionneuse : pas d'ouverture avant — les images de la scène partent maintenant)
  void (async () => {
    try {
      // (la pile de couches du jeu est déjà chargée : import() instantané, et pas de dépendance circulaire avec ui.ts)
      const [rt, ui] = await Promise.all([import('./runtime'), import('../ui')]);
      if (aborted) return;
      const all = mythicClues(cardId);
      const clues = o.auto ? all.slice(1, 2).concat(all.length > 1 ? [] : all) : all;
      inner = rt.runPrelude({ host: shell, card, clues, mode, short, reduced, scene: SCENES[fam], layers: { push: ui.pushLayer, pop: ui.popLayer }, target: o.target });
      void inner.handoff.then(handed);
      await inner.done;
    } catch (e) {
      console.error('[jeu] scène 6★', e);
    } finally {
      if (current === h) current = null;
      handed();
      resolve();
    }
  })();
  return h;
}

/** une scène 6★ est-elle en cours ? */
export const mythicPlaying = () => !!current;
export function abortMythic(): void {
  current?.abort();
}

// ───────────────────────────────────────────── bouton « Rejouer » des visionneuses (ui.ts imageReportButton)
let replayShell: Shell | null = null;
/** Branché une fois (main.ts) : les visionneuses proposent « Rejouer » sur les 6★ qui ont une scène. */
export function enableMythicReplay(shell: Shell) {
  replayShell = shell;
}
export function canReplayMythic(cardId: string): boolean {
  return !!replayShell && !!mythicFamily(cardId, catalogEntry(cardId)?.rarity ?? '');
}
/** posé par mythicEncounter.ts : « Rejouer » passe par la visionneuse (la carte refait son retournement à la fin) */
let replayer: ((cardId: string) => void) | null = null;
export function setMythicReplayer(fn: (cardId: string) => void) {
  replayer = fn;
}
export function replayMythic(cardId: string): void {
  if (replayer) return replayer(cardId);
  if (replayShell) playMythicPrelude(replayShell, cardId, 'mythic', 'viewer', { full: true });
}
