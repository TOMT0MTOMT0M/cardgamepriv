/**
 * SCÈNE DE FAMILLE hors ouverture (demande de Tom, 10 nov. : « jouée dans les collections et partout, comme Pokémon et
 * Yu-Gi-Oh ») : une 6★ ouverte dans la visionneuse — collection, gros tirages, échanges, contrats, profil, récap —
 * rejoue la scène de sa famille (game/mythic), puis la carte se retourne à sa place. Même principe que la rencontre
 * Pokémon (wildEncounter.ts) et l'invocation (duelEncounter.ts) : branché une seule fois sur la visionneuse (main.ts),
 * pas rejoué en faisant défiler les cartes, ni pour une carte dont la scène vient d'être vue (ouverture du booster puis
 * récap, moins d'une minute).
 *
 * Différences avec l'ouverture d'un booster : on sait déjà quelle carte c'est, donc pas d'indices à suspense — la
 * famille seule (≈ 0,9 s), puis la scène à vitesse normale. Un toucher passe. « Effets réduits » : rien, la carte
 * directement. Le bouton « Rejouer » de la visionneuse rejoue la version complète (indices compris).
 */
import type { Shell } from './shell';
import type { ViewerScene } from './scenes/viewer';
import type { RarityId } from '../core/rarity';
import { reducedMotion } from '../core/motion';
import { mythicFamily, mythicJustPlayed, mythicPlaying, playMythicPrelude, setMythicReplayer } from './mythic';
import { actorWidth } from './mythic/kit';

type ShowOpts = Parameters<ViewerScene['show']>[2];

export function withMythicPrelude(shell: Shell, viewer: ViewerScene): ViewerScene {
  const show = viewer.show.bind(viewer);
  const hits = viewer.hits.bind(viewer);
  // pendant la scène, un toucher n'est jamais « à côté de la carte » : les pages ne referment pas la visionneuse
  viewer.hits = (x, y) => mythicPlaying() || hits(x, y);

  let last: { cardId: string; rarityId: RarityId; opts: ShowOpts } | null = null;
  const play = (cardId: string, rarityId: RarityId, opts: ShowOpts, full: boolean) => {
    const run = playMythicPrelude(shell, cardId, rarityId, 'viewer', full ? { full: true } : { auto: true });
    // la carte se prépare dessous pendant la scène et attend de dos, au centre, à la taille de la doublure 2D : quand
    // le calque se fond, les deux cartes sont superposées — puis la vraie se retourne en venant à sa place
    return show(cardId, rarityId, { ...opts, dir: undefined, hold: run.handoff, fromW: actorWidth(innerWidth, innerHeight) });
  };

  viewer.show = (cardId, rarityId, opts) => {
    last = { cardId, rarityId, opts };
    if (!opts?.dir && !opts?.hold && !mythicPlaying() && !reducedMotion() && !mythicJustPlayed(cardId) && mythicFamily(cardId, rarityId)) return play(cardId, rarityId, opts, false);
    return show(cardId, rarityId, opts);
  };

  // « Rejouer » (ui.ts) : version complète, et la carte refait son retournement à la fin
  setMythicReplayer((cardId) => {
    if (mythicPlaying()) return;
    const l = last?.cardId === cardId ? last : null;
    void play(cardId, l?.rarityId ?? 'mythic', l?.opts, true);
  });
  return viewer;
}
