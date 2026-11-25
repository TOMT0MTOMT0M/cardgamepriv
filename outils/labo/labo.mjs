// LABO Fable — Bébou cartes (26/11/2026).
// Un chat Claude (Fable) qui travaille dans un dossier d'expériences à part (.wt-labo, branche git « labo »)
// et qui est payé UNIQUEMENT par les crédits API mensuels : clé CLAUDE_LABO_API_KEY de .env.local,
// jamais par l'abonnement. Plafond mensuel (95 $ par défaut) et plafond par message (5 $).
import { query } from '@anthropic-ai/claude-agent-sdk';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, '..', '..');
const labo = path.join(racine, '.wt-labo');
const fichierDepenses = path.join(ici, '.depenses.json');
const PLAFOND_MOIS = Number(process.env.LABO_PLAFOND_USD || 95);
const PLAFOND_MESSAGE = 5;
const MODELE = process.env.LABO_MODEL || 'claude-fable-5-2';

function stop(msg) { console.log(`\n${msg}\n`); process.exit(1); }

// 1. La clé API des crédits (jamais affichée).
function lireCle() {
  const f = path.join(racine, '.env.local');
  if (!existsSync(f)) return null;
  for (const ligne of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^\s*CLAUDE_LABO_API_KEY\s*=\s*"?([^"#\s]+)"?/);
    if (m) return m[1];
  }
  return null;
}
const cle = lireCle();
if (!cle) stop('Pas de CLAUDE_LABO_API_KEY dans .env.local.\nCrée une clé sur https://platform.claude.com (organisation liée à ton forfait Max), puis ajoute la ligne CLAUDE_LABO_API_KEY=... dans .env.local.');

// 2. Le dossier d'expériences (créé au premier lancement, sur la branche « labo » partie de v2).
function sh(cmd, cwd = racine) { return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
if (!existsSync(labo)) {
  console.log('Premier lancement : création du dossier .wt-labo (branche labo)…');
  let brancheExiste = false;
  try { sh('git rev-parse --verify --quiet labo'); brancheExiste = true; } catch {}
  sh(brancheExiste ? 'git worktree add .wt-labo labo' : 'git worktree add -b labo .wt-labo v2');
  if (existsSync(path.join(racine, 'node_modules')) && process.platform === 'win32') {
    try { execSync(`cmd /c mklink /J "${path.join(labo, 'node_modules')}" "${path.join(racine, 'node_modules')}"`, { stdio: 'ignore' }); } catch {}
  }
}

// 3. Le budget du mois (estimation côté client, la facture réelle est sur la Console).
const mois = new Date().toISOString().slice(0, 7);
let depenses = { mois, usd: 0 };
try { const d = JSON.parse(readFileSync(fichierDepenses, 'utf8')); if (d.mois === mois) depenses = d; } catch {}
const sauver = () => writeFileSync(fichierDepenses, JSON.stringify(depenses, null, 2));
const reste = () => Math.max(0, PLAFOND_MOIS - depenses.usd);

const REGLES = `Tu es dans le LABO d'expériences de Bébou cartes : dossier .wt-labo, branche git « labo », séparée du jeu.
But : chercher et prototyper de nouvelles animations d'ouverture de boosters et de scènes 6★ (three.js WebGPU + TSL), à montrer à Tom et Hugo.
Règles :
- Réponds en français, court, résultat d'abord.
- Travaille uniquement dans ce dossier. Commite sur la branche « labo » seulement ; tu peux la pousser (git push -u origin labo). Jamais master ni v2.
- Aucune mise en ligne, aucun lanceur, aucune commande Convex ni Cloudflare. Pour voir un prototype : npm run dev puis le labo du site, ou ?demo (hors-ligne).
- Respecte la DA de CLAUDE.md (jetons de motion.ts, rien d'animé SUR la carte, pas d'AI slop) sauf si Tom demande d'explorer autre chose.
- Chaque message coûte de vrais crédits : lis seulement les fichiers nécessaires, pas d'exploration large, pas de sous-agents.`;

const INTERDITS = [
  'Bash(git push origin master*)', 'Bash(git push origin v2*)', 'Bash(git push --force*)', 'Bash(git push -f*)',
  'Bash(git worktree prune*)', 'Bash(*mettre-en-ligne*)', 'Bash(*METTRE-EN-LIGNE*)', 'Bash(*publier-patch*)',
  'Bash(*NE-PAS-LANCER*)', 'Bash(npx convex*)', 'Bash(npm run convex*)', 'Bash(npm run cf:deploy*)', 'Bash(npx wrangler*)',
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`\nLABO Fable · modèle ${MODELE} · payé par les crédits API uniquement`);
console.log(`Budget du mois : ${depenses.usd.toFixed(2)} / ${PLAFOND_MOIS} $ · « /budget » · « /fin » pour quitter\n`);

let session;
while (true) {
  const demande = (await rl.question('toi › ')).trim();
  if (!demande) continue;
  if (demande === '/fin' || demande === '/exit') break;
  if (demande === '/budget') { console.log(`${depenses.usd.toFixed(2)} $ dépensés en ${mois} · reste ${reste().toFixed(2)} $`); continue; }
  if (reste() < 0.5) { console.log(`Plafond du mois atteint (${PLAFOND_MOIS} $). Le labo reprendra le mois prochain.`); continue; }

  try {
    for await (const m of query({
      prompt: demande,
      options: {
        model: MODELE,
        cwd: labo,
        env: { ...process.env, ANTHROPIC_API_KEY: cle, CLAUDE_CODE_OAUTH_TOKEN: undefined },
        resume: session,
        settingSources: ['project'],
        permissionMode: 'acceptEdits',
        disallowedTools: INTERDITS,
        maxBudgetUsd: Math.min(PLAFOND_MESSAGE, reste()),
        systemPrompt: { type: 'preset', preset: 'claude_code', append: REGLES },
        canUseTool: async (outil, entree) => {
          const resume = JSON.stringify(entree).slice(0, 160);
          const ok = (await rl.question(`  ? autoriser ${outil} ${resume} (o/n) `)).trim().toLowerCase().startsWith('o');
          return ok ? { behavior: 'allow', updatedInput: entree } : { behavior: 'deny', message: 'Refusé par Tom.' };
        },
      },
    })) {
      if (m.type === 'system' && m.subtype === 'init') {
        session = m.session_id;
        if (m.apiKeySource === 'none') stop('Aucune clé API utilisée : arrêt pour ne pas toucher à ton abonnement.');
      } else if (m.type === 'assistant') {
        for (const bloc of m.message?.content ?? []) {
          if (bloc.type === 'text' && bloc.text.trim()) console.log(`\nFable › ${bloc.text.trim()}`);
          else if (bloc.type === 'tool_use') console.log(`  · ${bloc.name}`);
        }
      } else if (m.type === 'result') {
        session = m.session_id ?? session;
        depenses.usd += m.total_cost_usd ?? 0;
        sauver();
        if (m.subtype === 'error_max_budget_usd') console.log(`  (arrêté : plafond de ${PLAFOND_MESSAGE} $ par message atteint)`);
        console.log(`\n  [${(m.total_cost_usd ?? 0).toFixed(2)} $ ce message · ${depenses.usd.toFixed(2)} / ${PLAFOND_MOIS} $ ce mois]\n`);
      }
    }
  } catch (e) {
    console.log(`\nErreur : ${e?.message ?? e}\n`);
  }
}
rl.close();
