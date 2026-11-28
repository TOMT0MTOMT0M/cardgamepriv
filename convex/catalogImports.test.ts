// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, type Metafile } from 'esbuild';
import { describe, expect, test } from 'vitest';

/**
 * (audit perf V3 n°10) QUI CHARGE LE CATALOGUE DE CARTES CÔTÉ SERVEUR ?
 *
 * Convex groupe chaque module avec esbuild et l'évalue à chaque exécution d'une de ses fonctions. Un module qui atteint
 * `src/core/sets/themes.ts` (même par un import lointain : auth → launch → games → themes) évalue les 4 Mo du catalogue :
 * ≥ 149 ms par exécution sur le staging, contre ≤ 53 ms sans. Ce test regroupe les modules comme Convex (même esbuild,
 * celui de la bibliothèque `convex`, mêmes règles de fichiers) et vérifie :
 *  1. les modules de LIGHT (aucune carte lue) n'évaluent aucun fichier de `src/core/sets/` qui touche au catalogue ;
 *  2. aucun module n'a le catalogue À MOITIÉ : qui atteint le noyau (`themesCore.ts` : `catalogEntry`, `THEMES`…) atteint
 *     aussi l'installation des gros sets (`themes.ts` → `catalogBig.ts`). Sinon `catalogEntry()` rendrait `undefined` et
 *     les tirages ne verraient que Pokémon / Valorant / LoL / CS : des résultats faux sans erreur ;
 *  3. les modules qui tirent ou lisent des cartes (boosters, jeux, échanges…) chargent bien le catalogue complet.
 * Un module de LIGHT qui a besoin d'une carte : le retirer de LIGHT (en le disant), pas contourner le test.
 */

const dir = fileURLToPath(new URL('.', import.meta.url));

/** Modules SANS carte : ils ne doivent jamais charger le catalogue (avant ce lot : 42 modules sur 54 le chargeaient). */
const LIGHT = [
  'abo', 'accounts', 'auth', 'cardRarity', 'crons', 'discordBot', 'discordRoles', 'feed', 'friends', 'http', 'i18nServer',
  'invRev', 'inventory', 'labFeedback', 'launch', 'launchGate', 'liveUser', 'presence', 'push', 'pushSend', 'pwAuth',
  'referrals', 'seasons', 'wishes',
];
/** Modules qui tirent ou lisent des cartes : catalogue complet obligatoire. */
const NEEDS_CATALOG = ['cardsCatalog', 'packs', 'games', 'economy', 'trades', 'binders', 'listings', 'market', 'deals', 'chat', 'events', 'profiles', 'rankInc', 'session', 'users', 'migrations', 'contracts', 'presse'];

const SETS = 'src/core/sets/';
const CORE = `${SETS}themesCore.ts`;
const INSTALL = `${SETS}themes.ts`;
// (catalogBig.ts ne fait que réexporter : 0 octet dans le résultat ; on regarde le plus gros des 4 sets)
const BIG = `${SETS}popculture.ts`;

/** Mêmes règles que `convex/bundler` (entryPoints) : `.ts` du dossier, hors `_generated`, `schema.ts`, noms à plusieurs points. */
const entries = readdirSync(dir)
  .filter((f) => /\.(ts|js)$/.test(f) && f !== 'schema.ts' && !f.startsWith('.') && (f.match(/\./g) ?? []).length === 1)
  .filter((f) => /^\s{0,100}(import|export)/m.test(readFileSync(`${dir}${f}`, 'utf8')));

type Graph = Map<string, Map<string, number>>; // module → fichier source → octets dans le résultat
let graph: Promise<Graph> | null = null;
function bundleGraph(): Promise<Graph> {
  graph ??= (async () => {
    const res = await build({
      absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
      entryPoints: entries.map((f) => `convex/${f}`),
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: 'browser',
      outdir: '.cache/catalog-imports',
      write: false,
      metafile: true,
      logLevel: 'silent',
      external: ['convex', 'convex/*', 'node:*', 'web-push', 'crypto'],
    });
    const outs: Metafile['outputs'] = res.metafile.outputs;
    const reach = (o: string, seen: Set<string>) => {
      if (seen.has(o)) return;
      seen.add(o);
      for (const i of outs[o].imports) if (outs[i.path]) reach(i.path, seen);
    };
    const g: Graph = new Map();
    for (const [o, meta] of Object.entries(outs)) {
      if (!meta.entryPoint) continue;
      const seen = new Set<string>();
      reach(o, seen);
      const files = new Map<string, number>();
      for (const c of seen) for (const [p, v] of Object.entries(outs[c].inputs)) if (v.bytesInOutput > 0) files.set(p, (files.get(p) ?? 0) + v.bytesInOutput);
      g.set(meta.entryPoint.replace(/^convex\//, '').replace(/\.ts$/, ''), files);
    }
    return g;
  })();
  return graph;
}

/** Chemin d'imports (sources) d'un module vers un fichier : pour dire D'OÙ vient le catalogue quand le test échoue. */
async function chain(mod: string, target: string): Promise<string> {
  const res = await build({ absWorkingDir: fileURLToPath(new URL('..', import.meta.url)), entryPoints: [`convex/${mod}.ts`], bundle: true, write: false, metafile: true, logLevel: 'silent', format: 'esm', platform: 'browser', outdir: '.cache/catalog-imports-1', external: ['convex', 'convex/*', 'node:*', 'web-push', 'crypto'] });
  const ins = res.metafile.inputs;
  const prev = new Map<string, string>();
  const queue = [`convex/${mod}.ts`];
  while (queue.length) {
    const p = queue.shift()!;
    if (p === target) break;
    for (const i of ins[p]?.imports ?? []) if (!prev.has(i.path) && ins[i.path]) (prev.set(i.path, p), queue.push(i.path));
  }
  const path = [target];
  while (prev.has(path[0])) path.unshift(prev.get(path[0])!);
  return path.join(' → ');
}

describe('catalogue de cartes côté serveur (audit perf V3 n°10)', () => {
  test('les modules sans carte ne chargent pas le catalogue', { timeout: 60_000 }, async () => {
    const g = await bundleGraph();
    const bad: string[] = [];
    for (const m of LIGHT) {
      const files = g.get(m);
      expect(files, `module ${m} introuvable`).toBeDefined();
      const hit = [CORE, INSTALL, BIG].find((f) => files!.has(f));
      if (hit) bad.push(`${m} : ${await chain(m, hit)}`);
    }
    expect(bad).toEqual([]);
  });

  test('aucun module n’a le catalogue à moitié (noyau sans les gros sets)', { timeout: 60_000 }, async () => {
    const g = await bundleGraph();
    const half = [...g].filter(([, files]) => files.has(CORE) && !(files.has(INSTALL) && files.has(BIG))).map(([m]) => m);
    expect(half).toEqual([]);
  });

  test('les modules qui lisent ou tirent des cartes ont le catalogue complet', { timeout: 60_000 }, async () => {
    const g = await bundleGraph();
    const missing = NEEDS_CATALOG.filter((m) => {
      const files = g.get(m);
      return !files || !files.has(INSTALL) || (files.get(BIG) ?? 0) < 1_000_000;
    });
    expect(missing).toEqual([]);
  });

  test('bilan : modules Convex qui évaluent le catalogue', { timeout: 60_000 }, async () => {
    const g = await bundleGraph();
    const heavy = [...g].filter(([, files]) => files.has(INSTALL)).map(([m]) => m);
    // (28/11) 31 sur 56 ; avant ce lot : 42 sur 53. À faire baisser, jamais monter sans raison
    expect(heavy.length).toBeLessThanOrEqual(31);
  });
});
