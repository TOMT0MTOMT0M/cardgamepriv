import { t as tr } from '../core/i18n';
import type { MusicPreview } from './musicPreviews.data';
import { catalogEntry, subthemeById } from '../core/sets/themes';
import type { Shell } from './shell';
import type { ViewerScene } from './scenes/viewer';

/**
 * EXTRAIT MUSICAL des cartes Musique 6★ (retours 05/11) — et, depuis les retours de Hugo (10/11), OPENING de l'animé
 * pour les 6★ d'animés : quand une 6★ du bloc Musique (artiste, chanson, album) est
 * révélée à l'ouverture ou regardée dans la visionneuse, son aperçu officiel de 30 s (iTunes, lu depuis Apple) monte en
 * fondu, avec une petite étiquette « ♪ titre — artiste » et un bouton pour couper. Il s'arrête en fondu à la carte
 * suivante, à la fermeture, ou au bout des 30 s. Rien à précharger : la table (≈ 200 cartes) arrive à la 1re 6★.
 * Muet si le volume du jeu est à 0 ; suit le volume général.
 */
type Tables = { cards: Record<string, MusicPreview>; anime: Record<string, MusicPreview>; ambience: Record<string, MusicPreview> };
let table: Promise<Tables> | null = null;
const load = () =>
  (table ??= import('./musicPreviews.data')
    .then((m) => ({ cards: m.MUSIC_PREVIEWS, anime: m.ANIME_OPENINGS, ambience: m.AMBIENCE_PREVIEWS }))
    .catch(() => ({ cards: {}, anime: {}, ambience: {} }) as Tables));

/**
 * (retours Hugo 10/11) Extrait d'une carte : le sien (cartes Musique), sinon — 6★ d'un ANIMÉ — l'opening de son animé,
 * en fond. Berserk (ambiance « Éclipse ») et Yu-Gi-Oh (invocation) gardent leur propre musique : absents de la table.
 */
async function previewOf(cardId: string): Promise<MusicPreview | null> {
  const t = await load();
  if (t.cards[cardId]) return t.cards[cardId];
  const e = catalogEntry(cardId);
  if (!e || subthemeById(e.subthemeId)?.group?.id !== 'anime') return null;
  return t.anime[e.subthemeId] ?? null;
}

/**
 * Morceaux trouvés seulement chez Deezer : leur adresse d'aperçu est signée et expire au bout de quelques heures —
 * on la redemande à l'API publique (JSONP : elle n'autorise pas les appels depuis un autre site), gardée 20 min.
 */
const DEEZER_TTL = 20 * 60_000;
const deezerUrls = new Map<number, { at: number; url: Promise<string | null> }>();
function deezerUrl(id: number): Promise<string | null> {
  const hit = deezerUrls.get(id);
  if (hit && Date.now() - hit.at < DEEZER_TTL) return hit.url;
  const url = new Promise<string | null>((resolve) => {
    const cb = `__dzPreview${id}_${Date.now().toString(36)}`;
    const w = window as unknown as Record<string, unknown>;
    const el = document.createElement('script');
    const end = (v: string | null) => {
      clearTimeout(timer);
      delete w[cb];
      el.remove();
      resolve(v);
    };
    const timer = setTimeout(() => end(null), 6000);
    w[cb] = (d: { preview?: string }) => end(typeof d?.preview === 'string' && d.preview ? d.preview : null);
    el.src = `https://api.deezer.com/track/${id}?output=jsonp&callback=${cb}`;
    el.onerror = () => end(null);
    document.head.append(el);
  });
  deezerUrls.set(id, { at: Date.now(), url });
  void url.then((u) => u || deezerUrls.delete(id));
  return url;
}
const urlOf = (p: MusicPreview) => (p.url ? Promise.resolve(p.url) : p.deezer ? deezerUrl(p.deezer) : Promise.resolve(null));

/** À l'ouverture d'un booster : l'adresse Deezer d'une 6★ du booster est demandée pendant la déchirure (pas d'attente à la révélation). */
export function prefetchMusicPreview(cardId: string, rarity: string): void {
  if (rarity !== 'mythic') return;
  void previewOf(cardId).then((p) => {
    if (p && !p.url && p.deezer) void deezerUrl(p.deezer);
  });
}

let audio: HTMLAudioElement | null = null;
let chip: HTMLElement | null = null;
let current = '';
let fadeRaf = 0;
let token = 0;
/** qui a lancé l'extrait : la visionneuse le coupe quand elle se ferme, pas l'ouverture de boosters */
let owner: 'opening' | 'viewer' = 'opening';

function fade(a: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  cancelAnimationFrame(fadeRaf);
  const from = a.volume;
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) fadeRaf = requestAnimationFrame(step);
    else done?.();
  };
  fadeRaf = requestAnimationFrame(step);
}

/**
 * (retours live 6, B5) le lecteur ne recouvre plus la carte : à l'ouverture il prend sa place SOUS le texte de la 6★
 * (`host` = le voile mythique, zone réservée en bas) ; dans la visionneuse, sa zone en haut à gauche (style.css).
 */
/** étiquette « ♪ titre — artiste · extrait » + bouton pour couper */
function makeChip(p: MusicPreview, onClose: () => void, host?: HTMLElement | null): HTMLElement {
  const c = document.createElement('div');
  c.className = host ? 'mp-chip mp-inline' : 'mp-chip';
  c.setAttribute('role', 'status');
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  c.innerHTML = `<span class="mp-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="mp-t"><b>${esc(p.track)}</b> — ${esc(p.artist)}<small>extrait · ${p.deezer && !p.url ? 'Deezer' : 'Apple Music'}</small></span><button class="mp-x" aria-label="${tr('mp.mute')}">✕</button>`; // i18n-ok
  c.querySelector('.mp-x')!.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose();
  });
  (host ?? document.body).append(c);
  host?.classList.add('has-mp');
  requestAnimationFrame(() => c.classList.add('in'));
  return c;
}
function showChip(p: MusicPreview, host?: HTMLElement | null) {
  chip?.remove();
  chip = makeChip(p, () => stopMusicPreview(), host);
}

/** La carte a-t-elle un extrait ? (6★ du bloc Musique trouvée sur iTunes) */
export async function hasMusicPreview(cardId: string, rarity: string): Promise<boolean> {
  if (rarity !== 'mythic') return false;
  return !!(await previewOf(cardId));
}

/** Lance l'extrait de la carte (rien si ce n'est pas une 6★ musique, ou si c'est déjà elle). `volume` : 0..1 du jeu. */
export async function playMusicPreview(cardId: string, rarity: string, volume = 1, by: 'opening' | 'viewer' = 'opening', host?: HTMLElement | null): Promise<void> {
  if (rarity !== 'mythic' || volume <= 0) return;
  owner = by;
  if (current === cardId && audio && !audio.paused) return;
  const my = ++token;
  const p = await previewOf(cardId);
  if (!p || my !== token) return;
  const src = await urlOf(p);
  if (!src || my !== token) return;
  stopMusicPreview(0.2);
  current = cardId;
  const a = new Audio(src);
  a.preload = 'auto';
  a.volume = 0;
  audio = a;
  a.addEventListener('ended', () => audio === a && stopMusicPreview(0));
  try {
    await a.play();
  } catch {
    // lecture refusée (pas de geste récent, réseau) : on n'insiste pas
    if (audio === a) stopMusicPreview(0);
    return;
  }
  if (audio !== a) return void a.pause();
  stopAmbience(0.4); // l'extrait d'une carte passe devant la musique d'ambiance
  showChip(p, host);
  fade(a, 0.6 * Math.min(1, volume), 1400);
}

// ───────────────────────────────────────────── musique d'AMBIANCE d'une ouverture (Éclipse — game/eclipse.ts)
/**
 * Contrairement à l'extrait d'une carte, elle n'est pas coupée d'une carte à l'autre : elle court en fond du sachet
 * descellé jusqu'à la fin du booster (le jeu appelle `stopAmbience`), ou jusqu'au bout de ses 30 s. Son propre lecteur,
 * sa propre étiquette (en haut à gauche). `fadeInS` : montée en fondu, calée sur l'animation qui l'accompagne.
 */
let amb: HTMLAudioElement | null = null;
let ambChip: HTMLElement | null = null;
let ambKey = '';
let ambTok = 0;
let ambRaf = 0;
function ambFade(a: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  cancelAnimationFrame(ambRaf);
  const from = a.volume;
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / Math.max(1, ms));
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) ambRaf = requestAnimationFrame(step);
    else done?.();
  };
  ambRaf = requestAnimationFrame(step);
}
export async function playAmbience(key: string, volume = 1, fadeInS = 1.4): Promise<void> {
  if (volume <= 0 || (ambKey === key && amb && !amb.paused)) return;
  const my = ++ambTok;
  const p = (await load()).ambience[key];
  if (!p || my !== ambTok) return;
  const src = await urlOf(p);
  if (!src || my !== ambTok) return;
  stopAmbience(0);
  const mine = ++ambTok;
  ambKey = key;
  const a = (amb = new Audio(src));
  a.preload = 'auto';
  a.volume = 0;
  a.addEventListener('ended', () => amb === a && stopAmbience(0));
  try {
    await a.play();
  } catch {
    // lecture refusée (pas de geste récent, réseau) : on n'insiste pas
    if (amb === a) stopAmbience(0);
    return;
  }
  if (amb !== a || mine !== ambTok) return void a.pause();
  ambChip?.remove();
  ambChip = makeChip(p, () => stopAmbience());
  ambFade(a, 0.5 * Math.min(1, volume), fadeInS * 1000);
}
/** L'adresse de la musique d'ambiance est demandée d'avance (sachet encore fermé) : pas d'attente au moment de la lancer. */
export function prefetchAmbience(key: string): void {
  void load().then((t) => {
    const p = t.ambience[key];
    if (p && !p.url && p.deezer) void deezerUrl(p.deezer);
  });
}
/** Coupe la musique d'ambiance en fondu (`fadeS` secondes). */
export function stopAmbience(fadeS = 0.6): void {
  ambTok++;
  ambKey = '';
  const a = amb;
  amb = null;
  const c = ambChip;
  ambChip = null;
  if (c) {
    c.classList.remove('in');
    setTimeout(() => c.remove(), 400);
  }
  if (!a) return;
  if (fadeS <= 0) {
    cancelAnimationFrame(ambRaf);
    a.pause();
    return;
  }
  ambFade(a, 0, fadeS * 1000, () => a.pause());
}

/** Coupe l'extrait en fondu (`fadeS` secondes). */
/** (audit 12/11, E3-09) extrait arrêté ET rendu : sans cela l'élément audio gardait son tampon jusqu'au ramasse-miettes */
function release(a: HTMLAudioElement) {
  a.pause();
  try {
    a.removeAttribute('src');
    a.load();
  } catch {
    /* rien */
  }
}

export function stopMusicPreview(fadeS = 0.6): void {
  token++;
  current = '';
  const a = audio;
  audio = null;
  const c = chip;
  chip = null;
  if (c) {
    c.parentElement?.classList.remove('has-mp');
    c.classList.remove('in');
    setTimeout(() => c.remove(), 400);
  }
  if (!a) return;
  if (fadeS <= 0) return release(a);
  fade(a, 0, fadeS * 1000, () => release(a));
}

/**
 * Visionneuse (collection, gros tirages, échanges…) : une 6★ musique ouverte lance son extrait, une autre carte le
 * coupe, et la visionneuse qui se ferme (une autre scène, ou aucune) aussi.
 */
export function withMusicPreview(shell: Shell, viewer: ViewerScene): ViewerScene {
  const show = viewer.show.bind(viewer);
  viewer.show = async (cardId, rarityId, opts) => {
    const r = show(cardId, rarityId, opts);
    if (await hasMusicPreview(cardId, rarityId)) void playMusicPreview(cardId, rarityId, shell.sfx.volume, 'viewer');
    else if (owner === 'viewer') stopMusicPreview(0.3);
    return r;
  };
  const showScene = shell.show.bind(shell);
  shell.show = (key) => {
    if (key !== 'viewer' && owner === 'viewer' && current) stopMusicPreview(0.4);
    showScene(key);
  };
  return viewer;
}
