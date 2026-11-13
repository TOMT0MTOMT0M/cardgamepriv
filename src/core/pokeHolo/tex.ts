import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three/webgpu';
import { POKE_TEX_SIZES, pokeTexData, type PokeTexData, type PokeTexName } from './texData';

/**
 * Textures « matière » des reflets Pokébox, GÉNÉRÉES (on ne reprend pas les fichiers du site) mais calibrées sur leurs
 * statistiques (moyenne, écart-type, centiles mesurés le 07/11) :
 *  - `glitter` : étoiles à 4 branches éparses sur noir (paillettes)              — glitter.png
 *  - `iri7/8/9`: moucheté sombre à points colorés (moy. 0,25, σ 0,20)            — iri-7/8/9 (300² répétées)
 *  - `iri1/2`  : moucheté clair pastel (moy. 0,85, σ 0,07)                       — iri-1/2
 *  - `noise`   : bruit gris (moy. 0,48, σ 0,16)                                   — noise-base
 *  - `grain`   : grain fin sombre et clairsemé (moy. 0,05)                        — grain (argent mat)
 *  - `value`   : bruit blanc filtré : bruit de valeur pour le grain du « double rare »
 *  - `dank1/2` : confettis colorés épars sur noir (moy. 0,09, p99 ≈ 1)            — birthday-holo-dank (double rare)
 * Toutes en valeurs brutes (NoColorSpace) : le shader d'origine travaille en espace écran (sRGB), nous aussi.
 */
export interface PokeTextures {
  glitter: DataTexture;
  iri7: DataTexture;
  iri8: DataTexture;
  iri9: DataTexture;
  iri1: DataTexture;
  iri2: DataTexture;
  noise: DataTexture;
  grain: DataTexture;
  value: DataTexture;
  dank1: DataTexture;
  dank2: DataTexture;
  list: DataTexture[];
}

function wrap(n: number, data: Uint8Array, name: PokeTexName): DataTexture {
  const t = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  // `value` : bruit blanc lu tel quel, sans mipmaps
  t.minFilter = name === 'value' ? LinearFilter : LinearMipmapLinearFilter;
  t.generateMipmaps = name !== 'value';
  t.colorSpace = NoColorSpace;
  t.needsUpdate = true;
  return t;
}
const NAMES = Object.keys(POKE_TEX_SIZES) as PokeTexName[];
/** attente maximale du worker avant de calculer sur le fil principal */
const WORKER_PATIENCE_MS = 5000;
function pack(of: (name: PokeTexName) => DataTexture): PokeTextures {
  const t = Object.fromEntries(NAMES.map((k) => [k, of(k)])) as Record<PokeTexName, DataTexture>;
  return { ...t, list: NAMES.map((k) => t[k]) };
}

/** Textures générées tout de suite, sur le fil appelant (labo). */
export function createPokeTextures(): PokeTextures {
  const d = pokeTexData();
  return pack((k) => wrap(d[k].n, d[k].data, k));
}

/**
 * (audit 12/11, S06) Mêmes textures, PIXELS CALCULÉS DANS UN WORKER : la génération (11 textures, ≈ 1,3 million de
 * pixels passés en flottants) tournait sur le fil principal pendant le montage de la scène d'ouverture — 237 ms sur
 * PC au profil du démarrage, dans la tâche la plus longue du chargement sur téléphone. Les textures existent tout de
 * suite (noires), leurs pixels arrivent du worker moins d'une seconde après, bien avant la première carte à reflet.
 * Pas de worker, ou worker en échec : calcul sur le fil principal, comme avant.
 */
export function createPokeTexturesDeferred(): PokeTextures {
  if (typeof Worker === 'undefined') return createPokeTextures();
  const out = pack((k) => wrap(POKE_TEX_SIZES[k], new Uint8Array(POKE_TEX_SIZES[k] * POKE_TEX_SIZES[k] * 4), k));
  let filled = false;
  const fill = (d: Record<PokeTexName, PokeTexData>) => {
    if (filled) return;
    filled = true;
    for (const k of NAMES) {
      (out[k].image.data as Uint8Array).set(d[k].data);
      out[k].needsUpdate = true;
    }
  };
  let w: Worker | null = null;
  let guard = 0;
  const stop = () => {
    clearTimeout(guard);
    w?.terminate();
    w = null;
  };
  const local = () => {
    stop();
    if (!filled) fill(pokeTexData());
  };
  try {
    w = new Worker(new URL('./tex.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Record<PokeTexName, PokeTexData>>) => {
      fill(e.data);
      stop();
    };
    w.onerror = w.onmessageerror = local;
    w.postMessage(0);
    // worker muet (script qui ne finit pas de charger) : pas de textures noires, on calcule ici
    guard = window.setTimeout(local, WORKER_PATIENCE_MS);
  } catch {
    local();
  }
  return out;
}
