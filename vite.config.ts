import { defineConfig, loadEnv, type Plugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:mobile` → HTTPS + LAN : WebGPU et le gyroscope exigent un contexte sécurisé sur téléphone.
// Deux pages : le labo (/) et le jeu (/jeu/).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    base: './',
    plugins: [
      ...(mode === 'https' ? [basicSsl()] : []),
      // (BEBOU_CATALOG_JSON=0 pour comparer avec les littéraux d'origine)
      ...(process.env.BEBOU_CATALOG_JSON === '0' ? [] : [catalogJson()]),
      preloadBackend(!!env.VITE_CONVEX_URL?.trim()),
      preloadFonts(),
      stylesFirst(),
      catalogCoreOnly(),
    ],
    // Catalogue en deux temps (perf, lot chargement 1) : le client lit le NOYAU du catalogue (sans les 4 gros sets) ;
    // le jeu installe les gros sets par import() pendant le démarrage de la 3D (main.ts), le labo au lancement.
    // Serveur Convex, tests et scripts n'utilisent pas cette config : ils gardent `themes.ts` (catalogue complet).
    resolve: { alias: [{ find: /^(.*\/sets)\/themes$/, replacement: '$1/themesCore' }] },
    server: { host: mode === 'https' ? true : undefined },
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 4000,
      rollupOptions: {
        input: {
          lab: 'index.html',
          jeu: 'jeu/index.html',
        },
      },
    },
  };
});

/**
 * Catalogues (audit PERF2-01) : les gros tableaux littéraux de `src/core/sets/*.ts` (21 702 cartes, ~1,7 Mo) deviennent
 * au build `JSON.parse('…')`. Le moteur JS n'a plus à analyser un énorme littéral (une chaîne se lit d'un trait, puis
 * JSON.parse est bien plus rapide que l'analyse + l'exécution du même littéral) ; mêmes valeurs, mêmes objets.
 * Build seulement : les fichiers générés (scripts/make-*.py), le serveur Convex et les tests ne voient rien.
 * Prudence : un tableau n'est converti que s'il s'évalue SEUL (aucune variable, fonction, gabarit, commentaire, regex)
 * en pures données JSON (chaînes, nombres finis, booléens, null, tableaux pleins, objets simples) ; sinon il est laissé tel quel.
 */
function catalogJson(): Plugin {
  const MIN = 8000; // (les petits tableaux ne valent pas la peine)
  return {
    name: 'bebou-catalog-json',
    apply: 'build',
    enforce: 'post', // après la transformation TypeScript : du JavaScript pur
    transform(code, id) {
      if (!/[\\/]src[\\/]core[\\/]sets[\\/][^\\/]+\.ts$/.test(id)) return null;
      let out = '';
      let last = 0;
      let n = 0;
      const re = /(?<![=!<>])=\s*\[/g;
      for (let m = re.exec(code); m; m = re.exec(code)) {
        const start = m.index + m[0].length - 1;
        const end = literalEnd(code, start);
        if (end < 0 || end - start < MIN) continue;
        let value: unknown;
        try {
          value = Function(`"use strict"; return (${code.slice(start, end)});`)();
        } catch {
          continue;
        }
        if (!jsonSafe(value)) continue;
        // chaîne entre apostrophes : le JSON (plein de ") n'a presque rien à échapper
        // lignes compactées (préfixe d'id commun, fichier déduit du slug) quand c'est sûr ; sinon telles quelles
        const packed = packRows(value);
        const json = JSON.stringify(packed ? packed.rows : value).replace(/[\\']/g, '\\$&').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        out += `${code.slice(last, start)}${packed ? `${packed.decode}(JSON.parse('${json}'))` : `JSON.parse('${json}')`}`;
        last = end;
        re.lastIndex = end;
        n++;
      }
      return n ? { code: out + code.slice(last), map: null } : null;
    },
  };
}

/**
 * Garde-fou du catalogue en deux temps : `src/core/sets/themes.ts` (catalogue complet installé d'office) ne doit jamais
 * entrer dans le build client — sinon les 4 gros sets reviendraient dans le premier téléchargement du jeu. Un import
 * qui échapperait à l'alias (chemin écrit autrement) fait échouer le build au lieu de passer inaperçu.
 */
function catalogCoreOnly(): Plugin {
  return {
    name: 'bebou-catalog-core-only',
    apply: 'build',
    buildEnd() {
      for (const id of this.getModuleIds()) {
        if (/[\\/]src[\\/]core[\\/]sets[\\/]themes\.ts$/.test(id)) this.error(`catalogue complet importé dans le build client (${id}) : importer « …/sets/themes » (alias vers themesCore)`);
      }
    },
  };
}

/**
 * Catalogues compacts (perf, lot chargement 4) : dans les gros tableaux de lignes `[…, "pop-naruto", …, "naruto.jpg", …]`,
 * l'identifiant porte un préfixe commun à toutes les lignes (« pop- ») et le fichier d'illustration est presque toujours
 * « slug + extension ». Au build, le préfixe est retiré et un fichier déductible devient `0` ; un petit décodeur refait
 * les lignes À L'IDENTIQUE au chargement (mêmes chaînes, mêmes tableaux). ~−17 % sur les sets Pop Culture et Sport.
 * Sûreté : le décodeur est exécuté ici même sur les lignes compactées et le résultat comparé (JSON) à l'original —
 * à la moindre différence, ou si une colonne n'est pas du texte partout, on garde les lignes telles quelles.
 */
function packRows(value: unknown): { rows: unknown[][]; decode: string } | null {
  if (!Array.isArray(value) || value.length < 1000) return null;
  const rows = value as unknown[][];
  const width = Array.isArray(rows[0]) ? rows[0].length : 0;
  if (!width || !rows.every((r) => Array.isArray(r) && r.length === width)) return null;
  const textCol = (i: number) => rows.every((r) => typeof r[i] === 'string');
  // colonne d'identifiant : préfixe « xxx- » commun à toutes les lignes
  let idCol = -1;
  let prefix = '';
  for (let i = 0; i < width && idCol < 0; i++) {
    if (!textCol(i)) continue;
    const m = /^[a-z]{2,6}-/.exec(rows[0][i] as string);
    if (m && rows.every((r) => (r[i] as string).startsWith(m[0]) && (r[i] as string).length > m[0].length)) [idCol, prefix] = [i, m[0]];
  }
  if (idCol < 0) return null;
  // colonne de fichier : « slug + extension » sur au moins la moitié des lignes (les autres restent écrites en entier)
  let fileCol = -1;
  let ext = '';
  for (let j = 0; j < width && fileCol < 0; j++) {
    if (j === idCol || !textCol(j)) continue;
    for (const e of ['.jpg', '.png', '.webp']) {
      const hits = rows.filter((r) => r[j] === (r[idCol] as string).slice(prefix.length) + e).length;
      if (hits >= rows.length / 2) [fileCol, ext] = [j, e];
    }
  }
  const packed = rows.map((r) => {
    const out = r.slice();
    const slug = (r[idCol] as string).slice(prefix.length);
    out[idCol] = slug;
    if (fileCol >= 0 && r[fileCol] === slug + ext) out[fileCol] = 0;
    return out;
  });
  const p = JSON.stringify(prefix);
  const decode =
    fileCol >= 0
      ? `((a)=>{for(const r of a){if(r[${fileCol}]===0)r[${fileCol}]=r[${idCol}]+${JSON.stringify(ext)};r[${idCol}]=${p}+r[${idCol}]}return a})`
      : `((a)=>{for(const r of a)r[${idCol}]=${p}+r[${idCol}];return a})`;
  // vérification : décodage réel des lignes compactées (copie) == lignes d'origine
  const back = Function(`"use strict"; return ${decode};`)()(JSON.parse(JSON.stringify(packed)));
  return JSON.stringify(back) === JSON.stringify(rows) ? { rows: packed, decode } : null;
}

/** Fin d'un littéral `[…]` qui commence à `start`, ou -1 s'il contient autre chose que des chaînes simples et des crochets. */
function literalEnd(code: string, start: number): number {
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'") {
      for (i++; i < code.length && code[i] !== c; i++) if (code[i] === '\\') i++;
      if (code[i] !== c) return -1;
      continue;
    }
    if (c === '`' || c === '/') return -1; // gabarit, commentaire, regex, division : on n'y touche pas
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return c === ']' ? i + 1 : -1;
    }
  }
  return -1;
}

/** La valeur ressort-elle identique d'un aller-retour JSON ? */
function jsonSafe(v: unknown): boolean {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v) && !Object.is(v, -0);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (!(i in v) || !jsonSafe(v[i])) return false;
    return true;
  }
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    for (const k of Object.keys(v)) if (k === '__proto__' || !jsonSafe((v as Record<string, unknown>)[k])) return false;
    return true;
  }
  return false;
}

/**
 * Jeu : le backend par défaut de ce build (en ligne si `VITE_CONVEX_URL`, sinon la démo) est chargé par `import()`
 * (main.ts, PERF2-05 : l'autre n'est jamais téléchargé) mais il sert dès le premier écran → on le précharge depuis le
 * HTML (`modulepreload`), comme les imports statiques : pas d'aller-retour réseau en plus au démarrage.
 */
function preloadBackend(online: boolean): Plugin {
  const want = online ? '/src/game/onlineBackend.ts' : '/src/game/localBackend.ts';
  return {
    name: 'bebou-preload-backend',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !/jeu[\\/]index\.html$/.test(ctx.filename)) return html;
        const chunks = Object.values(ctx.bundle).filter((c) => c.type === 'chunk');
        const root = chunks.find((c) => c.facadeModuleId?.replace(/\\/g, '/').endsWith(want));
        const prefix = /src="([^"]*?)assets\//.exec(html)?.[1];
        if (!root || prefix === undefined) return html;
        // le chunk et ses imports statiques, sauf ceux que le HTML charge déjà
        const files = new Set<string>();
        const add = (file: string) => {
          if (files.has(file) || html.includes(`${prefix}${file}"`)) return;
          files.add(file);
          const c = chunks.find((x) => x.fileName === file);
          c?.imports.forEach(add);
        };
        add(root.fileName);
        const links = [...files].map((f) => `<link rel="modulepreload" crossorigin href="${prefix}${f}">`).join('\n    ');
        return links ? html.replace('</head>', `    ${links}\n  </head>`) : html;
      },
    },
  };
}

/**
 * Jeu : les feuilles de style (bloquantes : l'écran de chargement ne peut pas se peindre sans elles) sont demandées
 * AVANT le script et la quarantaine de `modulepreload` (perf, lot chargement 5). Vite les place en dernier : sur une
 * connexion HTTP/1.1 (6 connexions) elles attendaient que des Mo de JS soient servis ; en HTTP/2 elles partent avec la
 * plus haute priorité, en tête. Même ordre entre elles (même cascade), mêmes attributs : seul le moment de la requête change.
 */
function stylesFirst(): Plugin {
  return {
    name: 'bebou-styles-first',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !/jeu[\\/]index\.html$/.test(ctx.filename)) return html;
        const links = html.match(/^[ \t]*<link rel="stylesheet"[^>]*>\n?/gm);
        const first = html.search(/^[ \t]*<(script type="module"|link rel="modulepreload")/m);
        if (!links || first < 0 || html.indexOf(links[0]) < first) return html;
        let out = html;
        for (const l of links) out = out.replace(l, '');
        return out.slice(0, first) + links.map((l) => (l.endsWith('\n') ? l : `${l}\n`)).join('') + out.slice(first);
      },
    },
  };
}

/**
 * Jeu : les polices qu'attendent le logo du chargement et `ensureFonts()` avant de peindre les boosters
 * (core/art/index.ts : Bold Frame, Matcha World, Inter) sont demandées dès le HTML (audit PERF2-10) au lieu d'attendre
 * l'analyse du CSS. Noms hachés par Vite → retrouvés dans le build ; une police introuvable (renommée par fontsource) est
 * simplement ignorée. L'italique (45 Ko) n'est pas préchargée : elle ne sert qu'aux cartes, pas au premier écran.
 */
function preloadFonts(): Plugin {
  // audit 06/11 : les polices du premier écran (logo, libellés, boosters) ; Plex Mono reste le repli des ★ ✓ des toiles
  const WANT = [/^matcha-world-[\w-]+\.woff2$/, /^bold-frame(-one|-two)?-[\w-]+\.woff2$/, /^inter-latin-(500|600)-normal-[\w-]+\.woff2$/, /^ibm-plex-mono-latin-500-normal-[\w-]+\.woff2$/];
  return {
    name: 'bebou-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !/jeu[\\/]index\.html$/.test(ctx.filename)) return html;
        const prefix = /src="([^"]*?)assets\//.exec(html)?.[1];
        if (prefix === undefined) return html;
        const files = Object.values(ctx.bundle)
          .filter((a) => a.type === 'asset' && WANT.some((re) => re.test(a.fileName.split('/').pop() ?? '')))
          .map((a) => a.fileName);
        const links = files.map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${prefix}${f}">`).join('\n    ');
        return links ? html.replace('</head>', `    ${links}\n  </head>`) : html;
      },
    },
  };
}
