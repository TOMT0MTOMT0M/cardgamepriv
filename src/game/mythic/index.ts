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
import { catalogEntry, subthemeById, themeById } from '../../core/sets/themes';
import { fxReduced } from '../../core/fxPref';
import type { Shell } from '../shell';
import { duelMonster } from '../scenes/duelMonsters';
import type { MythicCard, SceneFn } from './kit';

type Loader = () => Promise<{ default: SceneFn }>;

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
  dessins: () => import('./scenes/iris'),
  stars: () => import('./scenes/tapisRouge'),
  youtubeurs: () => import('./scenes/notification'),
  // Sport
  foot: () => import('./scenes/tunnel'),
  collectifs: () => import('./scenes/buzzer'),
  olympiques: () => import('./scenes/photoFinish'),
  combat: () => import('./scenes/ring'),
  raquettes: () => import('./scenes/arbitrage'),
  glisse: () => import('./scenes/chrono'),
  meca: () => import('./scenes/feux'),
  precision: () => import('./scenes/precision'),
  esport: () => import('./scenes/arene'),
  coulisses: () => import('./scenes/vestiaire'),
  // World
  animaux: () => import('./scenes/piegePhoto'),
  lieux: () => import('./scenes/globe'),
  nourriture: () => import('./scenes/nourriture'),
  voitures: () => import('./scenes/bache'),
  ardeche: () => import('./scenes/topo'),
};


/** Famille d'une 6★ qui a sa scène (null : pas une 6★, ou elle a déjà sa propre séquence). */
export function mythicFamily(cardId: string, rarity: string): string | null {
  if (rarity !== 'mythic' || cardId.startsWith('pkm-') || duelMonster(cardId)) return null;
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

/**
 * INDICES façon walkout, tirés des données (jamais le nom de la carte) : thème → famille → détail.
 *  - Jeux vidéo : GAMING → ZELDA → 1998 ;  Football : SPORT → FOOTBALL → PREMIER LEAGUE ;
 *  - Mangas : POP CULTURE → MANGAS & ANIME → JUJUTSU KAISEN ;  Animaux : WORLD → ANIMAUX → MAMMIFÈRES.
 */
export function mythicClues(cardId: string): string[] {
  const e = catalogEntry(cardId);
  if (!e) return [];
  const st = subthemeById(e.subthemeId);
  const theme = themeById(e.themeId)?.label ?? '';
  const out = [theme];
  if (st?.group) {
    out.push(st.group.label);
    const sub = tidy(st.label);
    // (Pokémon / LoL / CS / Valorant : la ligne, la classe d'arme… ; ailleurs : la série, le championnat, la classe)
    if (sub && !st.group.label.toLowerCase().includes(sub.toLowerCase())) out.push(sub);
  } else if (st) out.push(st.label);
  // Jeux vidéo : GAMING → ZELDA → 1991 (le « Jeux vidéo » du milieu laisse sa place à l'année)
  if (e.year) {
    if (out.length >= 3) out.splice(1, 1);
    out.push(String(e.year));
  }
  const seen = new Set<string>();
  return out.filter((s) => s && !seen.has(s.toLowerCase()) && (seen.add(s.toLowerCase()), true)).map((s) => s.toUpperCase());
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
  /** coupe tout de suite (Tout passer, retour boutique) */
  abort(): void;
}

let current: PreludeHandle | null = null;

/** Précharge le moteur et la scène d'une 6★ (pendant que le joueur ouvre le booster). */
export function prepareMythic(cardId: string, rarity: string): void {
  const fam = mythicFamily(cardId, rarity);
  if (!fam) return;
  void import('./runtime').catch(() => undefined);
  void SCENES[fam]().catch(() => undefined);
}

/**
 * Joue indices + scène de la famille. `mode` : 'opening' (la carte attend face cachée derrière, le rendu 3D est mis
 * en pause pendant la scène) ou 'viewer' (rejouer depuis une visionneuse). `quick` : force la version courte (Tout révéler).
 */
export function playMythicPrelude(shell: Shell, cardId: string, rarity: string, mode: 'opening' | 'viewer', o: { quick?: boolean; full?: boolean } = {}): PreludeHandle {
  current?.abort();
  const fam = mythicFamily(cardId, rarity);
  const card = mythicCard(cardId);
  let aborted = false;
  let inner: PreludeHandle | null = null;
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const h: PreludeHandle = {
    done,
    abort() {
      aborted = true;
      inner?.abort();
      resolve();
    },
  };
  current = h;
  if (!fam || !card) {
    resolve();
    return h;
  }
  const reduced = fxReduced();
  const short = !o.full && (!!o.quick || familySeen(fam));
  markFamilySeen(fam);
  void (async () => {
    try {
      const rt = await import('./runtime');
      if (aborted) return;
      inner = rt.runPrelude({ shell, card, clues: mythicClues(cardId), mode, short, reduced, scene: SCENES[fam] });
      await inner.done;
    } catch (e) {
      console.error('[jeu] scène 6★', e);
    } finally {
      if (current === h) current = null;
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
export function replayMythic(cardId: string): PreludeHandle | null {
  if (!replayShell) return null;
  return playMythicPrelude(replayShell, cardId, 'mythic', 'viewer', { full: true });
}
