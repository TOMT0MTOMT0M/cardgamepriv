/**
 * AGENT CLAUDE — outils communs : clé, budget du mois, lots (API Batch, −50 %), rapports.
 * Voir docs/AGENT-CLAUDE.md. Rien ici n'écrit dans le jeu, Convex ou R2 : l'agent ne fait que LIRE et produire des rapports.
 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ROOT = process.cwd();
/** rapports et registres PARTAGÉS (versionnés : Tom et Hugo voient les mêmes dépenses et les mêmes résultats) */
export const OUT = join(ROOT, 'docs', 'rapports-agent');
export const today = () => new Date().toISOString().slice(0, 10);
export const month = () => new Date().toISOString().slice(0, 7);

// ---------------------------------------------------------------------------------------------------------------
// Clé : `AGENT_CLAUDE_KEY` dans .env.local. JAMAIS `ANTHROPIC_API_KEY` en variable Windows (Claude Code facturerait
// alors les sessions sur l'API au lieu de l'abonnement, cf. docs/GUIDE-CLAUDE.md). La clé n'est jamais affichée.
// ---------------------------------------------------------------------------------------------------------------
function readEnvLocal(): Record<string, string> {
  const f = join(ROOT, '.env.local');
  if (!existsSync(f)) return {};
  return Object.fromEntries(
    readFileSync(f, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^\s*[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
  );
}
const ENV = readEnvLocal();
export const envVar = (k: string) => process.env[k] || ENV[k] || '';

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (client) return client;
  const apiKey = envVar('AGENT_CLAUDE_KEY');
  if (!apiKey) fail('Clé absente : ajoute la ligne AGENT_CLAUDE_KEY=sk-ant-... dans .env.local (racine du projet).');
  client = new Anthropic({ apiKey, maxRetries: 4 });
  return client;
}

export function fail(msg: string): never {
  console.error('\nECHEC : ' + msg);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------
// Prix ($ / million de tokens, tarif de l'API au 26/11/2026). Batch = moitié prix.
// ---------------------------------------------------------------------------------------------------------------
export const MODELS = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
} as const;
export type ModelId = (typeof MODELS)[keyof typeof MODELS];
const PRICE: Record<ModelId, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
};
export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}
export function costOf(model: ModelId, u: UsageLike, batch: boolean): number {
  const p = PRICE[model];
  const c =
    ((u.input_tokens ?? 0) * p.in +
      (u.output_tokens ?? 0) * p.out +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1e6;
  return batch ? c / 2 : c;
}
export const estimate = (model: ModelId, inTok: number, outTok: number, batch: boolean) => costOf(model, { input_tokens: inTok, output_tokens: outTok }, batch);
export const usd = (n: number) => `${n.toFixed(n < 1 ? 3 : 2)} $`;

// ---------------------------------------------------------------------------------------------------------------
// Registre des dépenses (docs/rapports-agent/depenses.json) : plafond mensuel `AGENT_BUDGET_MOIS` (défaut 90 $,
// marge sous les 100 $ de Tom). Mettre AUSSI la limite de dépense à 100 $ dans la console Anthropic (garde-fou réel).
// ---------------------------------------------------------------------------------------------------------------
interface Spend { date: string; tache: string; modele: string; cout: number; estime?: true; lot?: string; note?: string }
const SPEND_FILE = join(OUT, 'depenses.json');
export function readJson<T>(f: string, def: T): T {
  try {
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : def;
  } catch {
    return def;
  }
}
export function writeJson(f: string, data: unknown, pretty = true) {
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify(data, null, pretty ? 1 : 0) + '\n');
}
export const spends = () => readJson<Spend[]>(SPEND_FILE, []);
export const monthBudget = () => Number(envVar('AGENT_BUDGET_MOIS')) || 90;
export const spentThisMonth = () => spends().filter((s) => s.date.startsWith(month())).reduce((a, s) => a + s.cout, 0);
export function recordSpend(s: Omit<Spend, 'date'>) {
  const all = spends();
  if (s.lot) {
    // un lot est d'abord inscrit à son estimation, puis remplacé par le coût réel à la récupération
    const i = all.findIndex((x) => x.lot === s.lot);
    if (i >= 0) all.splice(i, 1);
  }
  all.push({ date: new Date().toISOString(), ...s, cout: Math.round(s.cout * 10000) / 10000 });
  writeJson(SPEND_FILE, all);
}
/** refuse si la dépense estimée ferait passer le mois au-dessus du plafond */
export function checkBudget(estimated: number, taskCap: number, label: string) {
  const spent = spentThisMonth();
  const cap = monthBudget();
  console.log(`\n${label} : estimation ${usd(estimated)} (plafond de la tâche ${usd(taskCap)}) · dépensé ce mois ${usd(spent)} / ${usd(cap)}`);
  if (estimated > taskCap) fail(`estimation au-dessus du plafond de la tâche. Réduis avec --max N, ou relève le plafond avec --plafond ${Math.ceil(estimated)}.`);
  if (spent + estimated > cap) fail(`le budget du mois serait dépassé (${usd(spent + estimated)} > ${usd(cap)}).`);
}

// ---------------------------------------------------------------------------------------------------------------
// Lots (API Batch) : envoyés par paquets ≤ 150 Mo, suivis dans docs/rapports-agent/lots.json, récupérés par `suivre`
// (sur n'importe quel PC : la correspondance requête → cartes est dans docs/rapports-agent/lots/<id>.json).
// ---------------------------------------------------------------------------------------------------------------
export interface BatchRec { id: string; tache: string; modele: ModelId; cree: string; estime: number; statut: 'en_cours' | 'recupere' | 'annule'; requetes: number }
const BATCH_FILE = join(OUT, 'lots.json');
export const batches = () => readJson<BatchRec[]>(BATCH_FILE, []);
export function saveBatch(b: BatchRec) {
  const all = batches().filter((x) => x.id !== b.id);
  all.push(b);
  writeJson(BATCH_FILE, all);
}
/** une tâche dont un lot n'est pas encore récupéré renverrait les mêmes cartes : on attend `suivre` */
export function noOpenBatch(tache: string) {
  const open = batches().filter((b) => b.tache === tache && b.statut === 'en_cours');
  if (open.length) fail(`un lot « ${tache} » est encore en cours (${open.map((b) => b.id).join(', ')}) : lance d'abord npm run agent -- suivre.`);
}
export const batchMapFile =(id: string) => join(OUT, 'lots', `${id}.json`);

export type BatchRequest = Anthropic.Messages.BatchCreateParams.Request;
const MAX_BATCH_BYTES = 150 * 1024 * 1024;

/** envoie les requêtes en un ou plusieurs lots ; `meta[custom_id]` = ce qu'il faut pour relire la réponse */
export async function submitBatches(tache: string, model: ModelId, reqs: BatchRequest[], meta: Record<string, unknown>, estimated: number) {
  const groups: BatchRequest[][] = [];
  let cur: BatchRequest[] = [];
  let bytes = 0;
  for (const r of reqs) {
    const sz = JSON.stringify(r).length;
    if (cur.length && (bytes + sz > MAX_BATCH_BYTES || cur.length >= 50_000)) {
      groups.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(r);
    bytes += sz;
  }
  if (cur.length) groups.push(cur);
  for (const g of groups) {
    const b = await claude().messages.batches.create({ requests: g });
    const part = (estimated * g.length) / reqs.length;
    const m: Record<string, unknown> = {};
    for (const r of g) m[r.custom_id] = meta[r.custom_id];
    writeJson(batchMapFile(b.id), m, false);
    saveBatch({ id: b.id, tache, modele: model, cree: new Date().toISOString(), estime: part, statut: 'en_cours', requetes: g.length });
    recordSpend({ tache, modele: model, cout: part, estime: true, lot: b.id, note: `${g.length} requêtes (estimation)` });
    console.log(`  lot envoyé : ${b.id} (${g.length} requêtes)`);
  }
  console.log(`\nRésultats : la plupart des lots finissent en moins d'une heure (24 h max). Récupère-les avec : npm run agent -- suivre`);
}

/** texte de la réponse (sans les blocs de réflexion) */
export function textOf(content: Anthropic.Messages.ContentBlock[]): string {
  return content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}
export function parseJsonLoose<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    const m = /\{[\s\S]*\}/.exec(s);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// CSV pour Excel français : séparateur « ; », BOM UTF-8 (accents corrects à l'ouverture par double-clic)
// ---------------------------------------------------------------------------------------------------------------
export function writeCsv(file: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n');
}

/** options de la ligne de commande : --go, --max 200, --plafond 10 */
export function opts(argv: string[]) {
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    go: argv.includes('--go'),
    tout: argv.includes('--tout'),
    max: Number(get('--max')) || Infinity,
    plafond: Number(get('--plafond')) || 0,
  };
}
export type Opts = ReturnType<typeof opts>;
