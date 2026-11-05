import type { MusicPreview } from './musicPreviews.data';
import type { Shell } from './shell';
import type { ViewerScene } from './scenes/viewer';

/**
 * EXTRAIT MUSICAL des cartes Musique 6★ (retours 05/11) : quand une 6★ du bloc Musique (artiste, chanson, album) est
 * révélée à l'ouverture ou regardée dans la visionneuse, son aperçu officiel de 30 s (iTunes, lu depuis Apple) monte en
 * fondu, avec une petite étiquette « ♪ titre — artiste » et un bouton pour couper. Il s'arrête en fondu à la carte
 * suivante, à la fermeture, ou au bout des 30 s. Rien à précharger : la table (≈ 200 cartes) arrive à la 1re 6★.
 * Muet si le volume du jeu est à 0 ; suit le volume général.
 */
let table: Promise<Record<string, MusicPreview>> | null = null;
const load = () => (table ??= import('./musicPreviews.data').then((m) => m.MUSIC_PREVIEWS).catch(() => ({}) as Record<string, MusicPreview>));

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

function showChip(p: MusicPreview) {
  chip?.remove();
  chip = document.createElement('div');
  chip.className = 'mp-chip';
  chip.setAttribute('role', 'status');
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  chip.innerHTML = `<span class="mp-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="mp-t"><b>${esc(p.track)}</b> — ${esc(p.artist)}<small>extrait · Apple Music</small></span><button class="mp-x" aria-label="Couper l’extrait">✕</button>`;
  chip.querySelector('.mp-x')!.addEventListener('click', (e) => {
    e.stopPropagation();
    stopMusicPreview();
  });
  document.body.append(chip);
  requestAnimationFrame(() => chip?.classList.add('in'));
}

/** La carte a-t-elle un extrait ? (6★ du bloc Musique trouvée sur iTunes) */
export async function hasMusicPreview(cardId: string, rarity: string): Promise<boolean> {
  if (rarity !== 'mythic') return false;
  return !!(await load())[cardId];
}

/** Lance l'extrait de la carte (rien si ce n'est pas une 6★ musique, ou si c'est déjà elle). `volume` : 0..1 du jeu. */
export async function playMusicPreview(cardId: string, rarity: string, volume = 1, by: 'opening' | 'viewer' = 'opening'): Promise<void> {
  if (rarity !== 'mythic' || volume <= 0) return;
  owner = by;
  if (current === cardId && audio && !audio.paused) return;
  const my = ++token;
  const p = (await load())[cardId];
  if (!p || my !== token) return;
  stopMusicPreview(0.2);
  current = cardId;
  const a = new Audio(p.url);
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
  showChip(p);
  fade(a, 0.6 * Math.min(1, volume), 1400);
}

/** Coupe l'extrait en fondu (`fadeS` secondes). */
export function stopMusicPreview(fadeS = 0.6): void {
  token++;
  current = '';
  const a = audio;
  audio = null;
  const c = chip;
  chip = null;
  if (c) {
    c.classList.remove('in');
    setTimeout(() => c.remove(), 400);
  }
  if (!a) return;
  if (fadeS <= 0) {
    a.pause();
    return;
  }
  fade(a, 0, fadeS * 1000, () => a.pause());
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
