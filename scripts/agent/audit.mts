/**
 * AGENT CLAUDE — audits (Convex, perf) : Opus lit le repo avec 3 outils en LECTURE SEULE (lister, lire, chercher),
 * puis rend un rapport Markdown. Il ne modifie aucun fichier, ne lance aucune commande. Plafond en $ par audit.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { MODELS, ROOT, claude, costOf, recordSpend, usd } from './lib.mts';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.cache', 'archives', 'sauvegardes', 'imports', 'logs', '_generated', '.git', '.wt-master', 'public', 'feedback', 'historique-claude-ai', 'rapports-agent']);
const SECRET = /(^|[\\/])(\.env[^\\/]*|\.discord-bot-token|\.feedback-key|.*\.pem|.*\.key)$/i;
const TEXT_EXT = /\.(ts|mts|cts|js|mjs|cjs|json|md|css|html|py|cmd|toml|yaml|yml|txt)$/i;

function safePath(p: string): string {
  const abs = resolve(ROOT, p || '.');
  if (!(abs === ROOT || abs.startsWith(ROOT + sep))) throw new Error('chemin hors du projet');
  const rel = relative(ROOT, abs);
  if (SECRET.test(rel)) throw new Error('fichier secret : lecture interdite');
  if (rel.split(sep).some((d) => SKIP_DIRS.has(d))) throw new Error('dossier ignoré (généré, archives, dépendances ou images)');
  return abs;
}

function lister(p: string): string {
  const abs = safePath(p);
  return readdirSync(abs, { withFileTypes: true })
    .filter((d) => !SKIP_DIRS.has(d.name) && !SECRET.test(d.name))
    .map((d) => (d.isDirectory() ? `${d.name}/` : `${d.name} (${Math.round(statSync(join(abs, d.name)).size / 1024)} Ko)`))
    .join('\n');
}

function lire(p: string, debut = 1, fin = 0): string {
  const abs = safePath(p);
  const size = statSync(abs).size;
  if (size > 400_000 && !fin) return `Fichier trop gros (${Math.round(size / 1024)} Ko, souvent un catalogue généré) : utilise chercher, ou lire avec debut/fin.`;
  const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
  const a = Math.max(1, debut);
  const b = Math.min(lines.length, fin > 0 ? fin : a + 499);
  const body = lines.slice(a - 1, b).map((l, i) => `${a + i}\t${l.length > 400 ? l.slice(0, 400) + '…' : l}`).join('\n');
  return `${relative(ROOT, abs)} — lignes ${a}-${b} sur ${lines.length}\n${body}`;
}

function chercher(motif: string, dossier = '.', ext = ''): string {
  const re = new RegExp(motif);
  const extRe = ext ? new RegExp(`\\.(${ext.replace(/[^a-z0-9|]/gi, '')})$`, 'i') : TEXT_EXT;
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (out.length >= 120) return;
      if (SKIP_DIRS.has(e.name) || SECRET.test(e.name)) continue;
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (extRe.test(e.name) && statSync(f).size < 2_000_000) {
        const lines = readFileSync(f, 'utf8').split(/\r?\n/);
        for (let i = 0; i < lines.length && out.length < 120; i++) if (re.test(lines[i])) out.push(`${relative(ROOT, f)}:${i + 1}: ${lines[i].trim().slice(0, 240)}`);
      }
    }
  };
  walk(safePath(dossier));
  return out.length ? out.join('\n') + (out.length >= 120 ? '\n… (120 résultats max : affine le motif)' : '') : 'Aucun résultat.';
}

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'lister',
    description: "Liste un dossier du projet (sous-dossiers et fichiers avec leur taille). Dossiers générés, dépendances, images et secrets exclus.",
    input_schema: { type: 'object', properties: { chemin: { type: 'string', description: 'chemin relatif à la racine, ex. "convex"' } }, required: ['chemin'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'lire',
    description: 'Lit un fichier texte du projet, avec numéros de ligne (500 lignes par appel par défaut ; utilise debut/fin pour la suite).',
    input_schema: {
      type: 'object',
      properties: { chemin: { type: 'string' }, debut: { type: 'integer', description: '1re ligne (défaut 1)' }, fin: { type: 'integer', description: 'dernière ligne (0 = debut+499)' } },
      required: ['chemin', 'debut', 'fin'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'chercher',
    description: 'Cherche une expression régulière (JavaScript) dans les fichiers texte du projet. Renvoie fichier:ligne: texte (120 résultats max).',
    input_schema: {
      type: 'object',
      properties: { motif: { type: 'string' }, dossier: { type: 'string', description: 'dossier de départ, ex. "src/game" (défaut ".")' }, ext: { type: 'string', description: 'extensions, ex. "ts|mts" ("" = fichiers texte)' } },
      required: ['motif', 'dossier', 'ext'],
      additionalProperties: false,
    },
    strict: true,
  },
];

function runTool(name: string, input: Record<string, unknown>): string {
  try {
    if (name === 'lister') return lister(String(input.chemin ?? '.'));
    if (name === 'lire') return lire(String(input.chemin ?? ''), Number(input.debut) || 1, Number(input.fin) || 0);
    if (name === 'chercher') return chercher(String(input.motif ?? ''), String(input.dossier || '.'), String(input.ext ?? ''));
    return `Outil inconnu : ${name}`;
  } catch (e) {
    return `Erreur : ${(e as Error).message}`;
  }
}

/** boucle d'audit : renvoie le rapport Markdown final ; s'arrête proprement au plafond */
export async function runAudit(tache: string, system: string, firstMessage: string, cap: number): Promise<{ report: string; cost: number }> {
  const model = MODELS.opus;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: firstMessage }];
  let cost = 0;
  let closing = false;
  for (let turn = 1; turn <= 80; turn++) {
    const stream = claude().beta.messages.stream({
      model,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      output_config: { effort: 'high' },
      system,
      tools: TOOLS,
      tool_choice: closing ? { type: 'none' } : { type: 'auto' },
      messages,
    });
    const msg = await stream.finalMessage();
    const c = costOf(model, msg.usage, false);
    cost += c;
    const calls = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    process.stdout.write(`  tour ${turn} : ${calls.map((t) => t.name).join(', ') || 'rédaction'} · ${usd(cost)}\n`);
    messages.push({ role: 'assistant', content: msg.content });
    if (msg.stop_reason === 'refusal') {
      recordSpend({ tache, modele: model, cout: cost, note: 'refus du modèle' });
      return { report: `# Audit interrompu\n\nLe modèle a refusé de continuer (${msg.stop_details?.category ?? 'sans catégorie'}).`, cost };
    }
    if (msg.stop_reason !== 'tool_use' || !calls.length) {
      recordSpend({ tache, modele: model, cout: cost, note: `${turn} tours` });
      const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { report: text, cost };
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = calls.map((t) => ({
      type: 'tool_result',
      tool_use_id: t.id,
      content: runTool(t.name, (t.input ?? {}) as Record<string, unknown>),
    }));
    // plafond : à 80 % on demande le rapport final (sans outils) pour ne jamais perdre ce qui a été lu
    if (!closing && cost >= cap * 0.8) {
      closing = true;
      messages.push({ role: 'user', content: [...results, { type: 'text', text: 'Budget de cet audit presque épuisé : écris MAINTENANT ton rapport final complet, sans appeler d’outil.' }] });
    } else messages.push({ role: 'user', content: results });
  }
  recordSpend({ tache, modele: model, cout: cost, note: '80 tours atteints' });
  return { report: '# Audit interrompu\n\n80 tours atteints sans rapport final.', cost };
}
