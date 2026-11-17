/**
 * COMPARATEUR LIVE / V3 (17/11) — construit les deux copies de démo servies par le lien V2 :
 *   dist/miroir/live/  ← la version EN LIGNE chez les joueurs (branche master, exportée telle quelle, index git à part)
 *   dist/miroir/v3/    ← la V3 en préparation (le dossier de travail, comme `mettre-en-ligne-v2.cmd`)
 * Les deux sont compilées de la même façon : même config Vite que le vrai jeu (celle de leur branche), canal « prod »
 * (ni bandeau ni écran « réservé à l'équipe »), SANS serveur (aucune adresse Convex : la démo hors-ligne), page du jeu
 * seulement, sans public/ (fx, audio, icônes… viennent du site, functions/miroir), plus deux ajouts invisibles :
 *   - la sonde (src/miroir/sonde.js) en tête de jeu/index.html : stockage cloisonné, gestes relayés, son, hasard ;
 *   - une suite de hasard à part pour chaque module de la démo qui tire au sort (boosters, robots, jeux).
 * Le comparateur lui-même (miroir/index.html) fait partie du build V3 normal.
 *
 * Usage : node scripts/miroir/build.mjs [live|v3]   (après `vite build --mode v2`, qui vide dist/)
 * Lancé par lanceurs/mettre-en-ligne-v2.cmd.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, '.cache', 'miroir');
const OUT = path.join(ROOT, 'dist', 'miroir');
const LIVE_REF = process.env.MIROIR_LIVE_REF || 'master';
/** modules de la démo qui tirent au sort : chacun sa suite, pour que les tirages ne dépendent pas de l'interface */
const RNG_MODULES = /[\\/]src[\\/](?:game[\\/](localBackend|ecoLocal|ecoLocalJeux|chatLocal)|core[\\/](packRoll|economy))\.ts$/;

const only = process.argv[2];
const vite = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href).catch(() => import('vite'));
const SONDE = fs.readFileSync(path.join(ROOT, 'src', 'miroir', 'sonde.js'), 'utf8');
if (SONDE.includes('</script')) throw new Error('sonde.js ne doit pas contenir « </script »');

// aucun serveur : les variables d'environnement l'emportent sur les fichiers .env (loadEnv de Vite)
process.env.VITE_CONVEX_URL = '';
process.env.VITE_CONVEX_SITE_URL = '';
const emptyEnv = path.join(CACHE, 'env');
fs.mkdirSync(emptyEnv, { recursive: true });

/** la version en ligne : export propre de la branche (jamais le worktree .wt-master, qui peut porter un patch en cours) */
function exportLive() {
  const dir = path.join(CACHE, 'live-src');
  fs.mkdirSync(dir, { recursive: true });
  for (const p of ['src', 'jeu', 'convex']) fs.rmSync(path.join(dir, p), { recursive: true, force: true });
  // index git À PART (GIT_INDEX_FILE) : ni l'index ni les fichiers du dossier de travail ne bougent
  const env = { ...process.env, GIT_INDEX_FILE: path.join(CACHE, 'live.index') };
  const git = (args, opts = {}) => execFileSync('git', ['-C', ROOT, ...args], { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
  git(['read-tree', LIVE_REF]);
  const files = git(['ls-files', '--', 'src', 'jeu', 'convex/_generated', 'vite.config.ts', 'tsconfig.json', 'package.json']);
  git(['checkout-index', '-f', `--prefix=${path.relative(ROOT, dir).replace(/\\/g, '/')}/`, '--stdin'], { input: files });
  // mêmes dépendances que le dossier principal (package.json identique entre les branches)
  const nm = path.join(dir, 'node_modules');
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(ROOT, 'node_modules'), nm, 'junction');
  const sha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', LIVE_REF], { encoding: 'utf8' }).trim();
  return { dir, sha };
}

function miroirPlugin(side) {
  const head = `<script>window.__MIROIR_SIDE=${JSON.stringify(side)};</script>\n    <script>\n${SONDE}\n    </script>`;
  return {
    name: 'bebou-miroir',
    enforce: 'pre',
    transform(code, id) {
      const m = RNG_MODULES.exec(id.split('?')[0]);
      if (!m) return null;
      const name = m[1] || m[2];
      return { code: `const Math = globalThis.__miroirMath ? globalThis.__miroirMath(${JSON.stringify(name)}) : globalThis.Math;\n${code}`, map: null };
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // juste après <meta charset> (qui doit rester dans les premiers octets), avant tout script du jeu
        const out = html.replace(/(<meta charset[^>]*>)/i, `$1\n    ${head}`);
        if (out === html) throw new Error('miroir : <meta charset> introuvable dans jeu/index.html');
        return out;
      },
    },
  };
}

async function buildSide(side, srcRoot, sha) {
  const outDir = path.join(OUT, side);
  const prevCwd = process.cwd();
  process.chdir(srcRoot); // (vite.config.ts lit `loadEnv(mode, '.')`)
  try {
    const loaded = await vite.loadConfigFromFile({ command: 'build', mode: 'production', isSsrBuild: false, isPreview: false }, path.join(srcRoot, 'vite.config.ts'), srcRoot);
    if (!loaded) throw new Error(`vite.config.ts introuvable (${srcRoot})`);
    const cfg = vite.mergeConfig(loaded.config, {
      root: srcRoot,
      configFile: false,
      envDir: emptyEnv,
      publicDir: false,
      cacheDir: path.join(CACHE, `vite-${side}`),
      logLevel: 'warn',
      plugins: [miroirPlugin(side)],
      build: { outDir, emptyOutDir: true },
    });
    cfg.build.rollupOptions = { ...(cfg.build.rollupOptions ?? {}), input: { jeu: path.join(srcRoot, 'jeu', 'index.html') } };
    if (cfg.build.rolldownOptions) cfg.build.rolldownOptions = { ...cfg.build.rolldownOptions, input: { jeu: path.join(srcRoot, 'jeu', 'index.html') } };
    if (sha) process.env.BEBOU_SHA = sha;
    await vite.build(cfg);
    const html = fs.readFileSync(path.join(outDir, 'jeu', 'index.html'), 'utf8');
    if (!html.includes('__MIROIR_SIDE')) throw new Error(`miroir ${side} : sonde absente du HTML`);
    if (/\.convex\.cloud/.test(fs.readdirSync(path.join(outDir, 'assets')).map((f) => (f.endsWith('.js') ? fs.readFileSync(path.join(outDir, 'assets', f), 'utf8') : '')).join(''))) {
      throw new Error(`miroir ${side} : une adresse Convex est restée dans le build`);
    }
    console.log(`miroir ${side} : OK → dist/miroir/${side}/jeu/`);
  } finally {
    process.chdir(prevCwd);
  }
}

const t0 = Date.now();
if (!only || only === 'live') {
  const { dir, sha } = exportLive();
  await buildSide('live', dir, `${LIVE_REF}-${sha}`);
}
if (!only || only === 'v3') await buildSide('v3', ROOT, process.env.BEBOU_SHA);
console.log(`comparateur construit en ${Math.round((Date.now() - t0) / 1000)} s`);
