/**
 * INVOCATION hors ouverture (demande de Tom, 4 nov.) : une 6★ Yu-Gi-Oh ouverte dans la visionneuse — collection, gros
 * tirages, échanges, contrats, profil, récap — rejoue son invocation (scenes/duelSummon.ts), puis la visionneuse
 * habituelle. Même principe que la rencontre Pokémon (wildEncounter.ts) : branché une seule fois sur la visionneuse
 * (main.ts), pas rejoué en faisant défiler les cartes, ni pour une carte dont l'invocation vient d'être vue (ouverture
 * du booster puis récap).
 */
import type { Shell } from './shell';
import type { ViewerScene } from './scenes/viewer';
import { cardById } from '../core/cardData';
import { duelMonster } from './scenes/duelMonsters';
import { popLayer, pushLayer } from './ui';

const seen = new Map<string, number>();
/** l'invocation de cette carte vient d'être jouée (ouverture) : la visionneuse ne la rejoue pas tout de suite */
export function markDuelSeen(cardId: string) {
  seen.set(cardId, performance.now());
}

const KEY = 'duel-view';

/** Joue l'invocation, puis rend la main à la scène `back` ; résolu à la fin (ou si le joueur passe / revient). */
export async function playDuelSummon(shell: Shell, cardId: string, back: string): Promise<void> {
  const monster = duelMonster(cardId);
  if (!monster) return;
  markDuelSeen(cardId);
  document.body.classList.add('duel-on');
  // voile noir pendant le chargement (modèle, textures, compilation) : on ne voit jamais la scène se monter
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;z-index:59;background:#020305;opacity:0;transition:opacity .35s;display:flex;align-items:center;justify-content:center;font:600 12px var(--mono,"Inter",sans-serif);letter-spacing:.14em;text-transform:uppercase;color:#7fd6ff;pointer-events:none;'; // i18n-ok
  veil.textContent = 'invocation…';
  document.body.append(veil);
  requestAnimationFrame(() => (veil.style.opacity = '1'));
  let done!: () => void;
  const finished = new Promise<void>((r) => (done = r));
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    popLayer(end);
    window.removeEventListener('keydown', onKey, true);
    veil.remove();
    if (shell.has(KEY)) {
      shell.show(back);
      shell.unmount(KEY);
    }
    document.body.classList.remove('duel-on');
    done();
  };
  // Échap / « retour » du téléphone : on quitte l'invocation (et seulement elle : la visionneuse reste ouverte)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    end();
  };
  window.addEventListener('keydown', onKey, true);
  pushLayer(end);
  try {
    const mod = await import('./scenes/duelSummon');
    const exp = mod.default({ card: cardById(cardId), monster, onDone: end });
    await shell.mount(KEY, exp, 'mythic');
    if (over) {
      shell.unmount(KEY);
      return finished;
    }
    shell.show(KEY);
    exp.replay?.();
    veil.style.opacity = '0';
    window.setTimeout(() => veil.remove(), 400);
  } catch (e) {
    console.error('[jeu] invocation (visionneuse)', e);
    end();
  }
  return finished;
}

/** Visionneuse avec invocation : `show()` d'une 6★ Yu-Gi-Oh (ouverture directe, pas un défilement) la joue d'abord. */
export function withDuelSummon(shell: Shell, viewer: ViewerScene): ViewerScene {
  const show = viewer.show.bind(viewer);
  const hits = viewer.hits.bind(viewer);
  let running = false;
  // pendant l'invocation, un toucher n'est jamais « à côté de la carte » : les pages ne referment pas la visionneuse
  viewer.hits = (x, y) => running || hits(x, y);
  viewer.show = async (cardId, rarityId, opts) => {
    const recent = performance.now() - (seen.get(cardId) ?? -Infinity) < 60_000;
    if (!opts?.dir && !running && !recent && rarityId === 'mythic' && duelMonster(cardId)) {
      running = true;
      const ready = show(cardId, rarityId, opts);
      try {
        await playDuelSummon(shell, cardId, 'viewer');
      } finally {
        running = false;
      }
      return ready;
    }
    return show(cardId, rarityId, opts);
  };
  return viewer;
}
