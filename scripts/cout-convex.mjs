// (26/11, coût Convex) MESURE DE LA DATABASE I/O PAR FONCTION, en lecture seule — à lancer chaque semaine et avant /
// après chaque lot qui touche convex/. Règle (skill officiel Convex « convex-cost ») : coût = données lues par appel ×
// nombre d'appels. Source : les journaux de fonctions de la prod (`npx convex logs --jsonl`, champ `usageStats` de
// chaque exécution : octets lus / écrits, documents lus). `npx convex insights` ne montre que les conflits OCC.
//   node scripts/cout-convex.mjs                 → 30 min d'échantillon (un relevé de 1 000 exécutions toutes les 6 min)
//   node scripts/cout-convex.mjs --minutes=90    → plus long (plus juste : le soir et la nuit sont plus calmes)
//   node scripts/cout-convex.mjs --fichier=x.jsonl → analyse un relevé déjà fait, sans rien relire
// Sortie : tableau par fonction + extrapolation par jour, dans le terminal et dans .claude-tmp/cout-convex-<date>.txt
// (relevé brut à côté, .jsonl). La prod = déploiement Convex « dev » (.env.local) : rien à préciser.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = fileURLToPath(new URL('../node_modules/convex/bin/main.js', import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const MINUTES = Number(arg('minutes', '30'));
const FICHIER = arg('fichier', '');
const SEUIL_KO = Number(arg('seuil', '50'));
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const OUT = new URL(`../.claude-tmp/`, import.meta.url);
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const convex = (args, timeout) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: ROOT, timeout, maxBuffer: 256 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** exécutions terminées, sans doublon (les relevés successifs se recouvrent) */
const runs = new Map();
const take = (text) => {
  for (const l of text.split('\n')) {
    if (!l.startsWith('{')) continue;
    try {
      const e = JSON.parse(l);
      if (e.kind === 'Completion' && e.usageStats) runs.set(e.executionId, e);
    } catch {
      /* ligne coupée */
    }
  }
};

let raw = '';
if (FICHIER) {
  raw = readFileSync(FICHIER, 'utf8');
  take(raw);
} else {
  if (!existsSync(CLI)) throw new Error(`CLI Convex introuvable (${CLI}) : npm install ?`);
  const rounds = Math.max(1, Math.round(MINUTES / 6));
  for (let i = 0; i < rounds; i++) {
    // `logs` regarde en continu après l'historique : arrêté au bout de 25 s
    const r = convex(['logs', '--history', '1000', '--jsonl', '--success'], 25_000);
    raw += r.stdout ?? '';
    take(r.stdout ?? '');
    console.log(`relevé ${i + 1}/${rounds} : ${runs.size} exécutions`);
    if (i < rounds - 1) await sleep(6 * 60_000);
  }
  writeFileSync(new URL(`cout-convex-${stamp}.jsonl`, OUT), raw);
}

const all = [...runs.values()].sort((a, b) => a.timestamp - b.timestamp);
if (!all.length) {
  console.log('Aucune exécution lue (connexion Convex ? `npx convex login`).');
  process.exit(0);
}
const span = Math.max(60, all.at(-1).timestamp - all[0].timestamp);
const by = new Map();
for (const e of all) {
  const u = e.usageStats;
  const k = `${e.udfType?.[0] ?? '?'} ${e.identifier}`;
  const a = by.get(k) ?? { n: 0, cached: 0, read: 0, write: 0, docs: 0, max: 0 };
  a.n++;
  if (e.cachedResult) a.cached++;
  a.read += u.databaseIoReadBytes ?? u.databaseReadBytes ?? 0;
  a.write += u.databaseIoWriteBytes ?? u.databaseWriteBytes ?? 0;
  a.docs += u.databaseReadDocuments ?? 0;
  a.max = Math.max(a.max, u.databaseIoReadBytes ?? 0);
  by.set(k, a);
}
const tot = [...by.values()].reduce((s, a) => s + a.read + a.write, 0);
const mo = (b) => (b / 1e6).toFixed(2).padStart(7);
const lines = [
  `Database I/O par fonction — ${all.length} exécutions sur ${(span / 60).toFixed(0)} min (${new Date(all[0].timestamp * 1000).toISOString().slice(0, 16)} UTC)`,
  `Total ${mo(tot)} Mo → ${((tot / 1e9) * (86400 / span)).toFixed(2)} GB/jour à ce rythme (≈ ${((tot / 1e9) * (86400 / span) * 30).toFixed(1)} GB/mois ; Starter : 1 GB inclus, 0,22 $/GB)`,
  '',
  'type fonction                                 appels  cache   lu Mo  écrit Mo  moy Ko/appel  max Ko   part',
];
for (const [k, a] of [...by.entries()].sort((x, y) => y[1].read + y[1].write - (x[1].read + x[1].write)).slice(0, 25)) {
  const avg = a.read / Math.max(1, a.n - a.cached) / 1000;
  lines.push(`${k.padEnd(44)} ${String(a.n).padStart(6)} ${String(a.cached).padStart(6)} ${mo(a.read)} ${mo(a.write)}   ${avg.toFixed(1).padStart(10)} ${(a.max / 1000).toFixed(0).padStart(7)} ${((100 * (a.read + a.write)) / tot).toFixed(1).padStart(5)} %${avg > SEUIL_KO ? '  ← lourd' : ''}`);
}
const usage = FICHIER ? null : convex(['deployment', 'usage', '--json'], 60_000);
try {
  const m = JSON.parse(usage?.stdout ?? '').metrics;
  lines.push('', `Compteur Convex : Database I/O jour ${m.databaseIoGb.usage.current_day.toFixed(3)} GB · mois ${m.databaseIoGb.usage.current_month.toFixed(2)} GB · appels mois ${Math.round(m.functionCalls?.usage?.current_month ?? 0)} · egress mois ${(m.dataEgressGb?.usage?.current_month ?? 0).toFixed(2)} GB`);
} catch {
  /* pas de compteur (analyse d'un fichier) */
}
lines.push('', 'Lire : « moy Ko/appel » × « appels ». Une requête qui relit une collection entière (≥ 1 000 lignes ≈ 330 Ko) ou une', 'migration relancée à chaque mise en ligne sont les suspects habituels. Règles : .claude/rules/convex.md.');
const report = lines.join('\n');
console.log(`\n${report}`);
if (!FICHIER) writeFileSync(new URL(`cout-convex-${stamp}.txt`, OUT), report);
