/**
 * RENCONTRE SAUVAGE hors ouverture (demande de Tom, 4 nov.) : un Pokémon 6★ ouvert dans la visionneuse — collection,
 * gros tirages, échanges, contrats, profil, récap — rejoue sa rencontre : transition Game Boy Color, musique en boucle,
 * scène 041 de son type (chargée pendant le noir), puis « Continuer » et la visionneuse habituelle.
 *
 * Branché une seule fois sur la visionneuse (main.ts, `withWildEncounter`) : toutes les pages en profitent sans rien
 * changer chez elles. Ne se rejoue pas quand on fait défiler les cartes (flèches / glisser) ni pour une carte dont la
 * rencontre vient d'être vue (moins d'une minute : l'ouverture du booster puis le récap).
 */
import { t } from '../core/i18n';
import type { Shell } from './shell';
import type { ViewerScene } from './scenes/viewer';
import type { RarityId } from '../core/rarity';
import { cardById } from '../core/cardData';
import { POKEMON_151, pokemonCardId } from '../core/sets/pokemon151';
import { POKEMON_MYTHIC_TYPE } from '../core/sets/pokemonTypes';
import { siteUrl } from '../core/siteRoot';
import { haptics } from '../core/haptics';
import { gbcTransition } from './scenes/gbcTransition';
import { popLayer, pushLayer } from './ui';

export const WILD_MUSIC = siteUrl('audio/pokemon-wild-battle.mp3');
/** boucle de 31,35 s à partir de 20 s, après une première écoute depuis le début */
export const WILD_LOOP = { loopStart: 20, loopEnd: 51.3475 };
/** carte dont la révélation est la rencontre sauvage (Pokémon 6★) */
export const isWildCard = (cardId: string, rarity: RarityId) => rarity === 'mythic' && cardId.startsWith('pkm-');

const seen = new Map<string, number>();
/** la rencontre de cette carte vient d'être jouée (ouverture) : la visionneuse ne la rejoue pas tout de suite */
export function markWildSeen(cardId: string) {
  seen.set(cardId, performance.now());
}

const KEY = 'wild-view';

/** Joue la rencontre, puis rend la main à la scène `back` ; résolu quand le joueur continue. */
export async function playWildEncounter(shell: Shell, cardId: string, back: string): Promise<void> {
  markWildSeen(cardId);
  document.body.classList.add('wild-on');
  const tr = gbcTransition();
  void shell.sfx.playMusic(WILD_MUSIC, { ...WILD_LOOP, vol: 0.55, fade: 0.04 });
  haptics.pulse([30, 60, 30, 60, 30]);
  let done!: () => void;
  const finished = new Promise<void>((r) => (done = r));
  const btn = document.createElement('div');
  btn.className = 'wild-view-continue';
  btn.hidden = true;
  btn.innerHTML = '<button class="btn-primary">' + t('wild.continue') + '</button>';
  btn.style.cssText = 'position:fixed;left:0;right:0;bottom:calc(40px + env(safe-area-inset-bottom));display:flex;justify-content:center;z-index:60;';
  document.body.append(btn);
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    popLayer(end);
    window.removeEventListener('keydown', onKey, true);
    tr.destroy();
    btn.remove();
    shell.sfx.stopMusic(0.8);
    if (shell.has(KEY)) {
      shell.show(back);
      shell.unmount(KEY);
    }
    document.body.classList.remove('wild-on');
    done();
  };
  // Échap / « retour » du téléphone : on quitte la rencontre (et seulement elle : la visionneuse reste ouverte)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    end();
  };
  window.addEventListener('keydown', onKey, true);
  pushLayer(end);
  btn.querySelector('button')!.addEventListener('click', end);
  try {
    const mod = await import('../experiments/041-pokemon-wild/index');
    const dex = POKEMON_151.find((e) => pokemonCardId(e) === cardId)?.dex ?? 0;
    const exp = mod.default({ card: cardById(cardId), type: POKEMON_MYTHIC_TYPE[dex] ?? 'plante', onRevealed: () => (btn.hidden = over) });
    // chargée PENDANT le noir (carte, décor, compilation) : la transition ne fige jamais
    await tr.covered;
    if (over) return finished;
    await shell.mount(KEY, exp, 'mythic');
    if (over) {
      shell.unmount(KEY);
      return finished;
    }
    await exp.activate();
    if (over) return finished;
    shell.show(KEY);
    exp.replay?.();
    void tr.reveal();
  } catch (e) {
    console.error('[jeu] rencontre sauvage (visionneuse)', e);
    end();
  }
  return finished;
}

/**
 * Visionneuse avec rencontre : `show()` d'un Pokémon 6★ (ouverture directe, pas un défilement) joue d'abord la
 * rencontre, puis la carte s'affiche normalement dans la visionneuse.
 */
export function withWildEncounter(shell: Shell, viewer: ViewerScene): ViewerScene {
  const show = viewer.show.bind(viewer);
  const hits = viewer.hits.bind(viewer);
  let running = false;
  // pendant la rencontre, un toucher n'est jamais « à côté de la carte » : les pages ne referment pas la visionneuse
  viewer.hits = (x, y) => running || hits(x, y);
  viewer.show = async (cardId, rarityId, opts) => {
    const recent = performance.now() - (seen.get(cardId) ?? -Infinity) < 60_000;
    if (!opts?.dir && !running && !recent && isWildCard(cardId, rarityId)) {
      running = true;
      // la carte se prépare dans la visionneuse pendant la rencontre : elle est prête au retour
      const ready = show(cardId, rarityId, opts);
      try {
        await playWildEncounter(shell, cardId, 'viewer');
      } finally {
        running = false;
      }
      return ready;
    }
    return show(cardId, rarityId, opts);
  };
  return viewer;
}
