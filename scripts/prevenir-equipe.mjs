// (26/11) Prévient l'équipe (Tom, Hugo) en MP par le bot Discord après une mise en ligne prod — appelé à la fin de
// lanceurs/mettre-en-ligne-prod.cmd (donc par chaque METTRE-EN-LIGNE-v2.X.Y.cmd et par publier-patch.cmd).
// Passe par Convex (discordBot:prevenirEquipe : le jeton du bot est dans l'environnement Convex) : rien à installer
// sur le PC. Celui qui publie (nom de session Windows) ne reçoit pas le message ; l'autre, si.
// Ne fait jamais échouer la mise en ligne : sortie 0 dans tous les cas, le résultat est écrit dans le journal.
//   node scripts/prevenir-equipe.mjs           → envoie
//   node scripts/prevenir-equipe.mjs --essai   → affiche le message, n'envoie rien
//   node scripts/prevenir-equipe.mjs --texte="…" → ajoute une ligne au message
// Le lanceur d'un patch peut aussi poser `set BEBOU_NOTE=...` (ce que contient la version, sans accents) : même effet.
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const git = (...a) => {
  try {
    return execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};
const extra = process.argv.find((a) => a.startsWith('--texte='))?.slice('--texte='.length) ?? process.env.BEBOU_NOTE ?? '';
const tag = git('describe', '--tags', '--abbrev=0');
const sha = git('rev-parse', '--short', 'HEAD');
const sujet = git('log', '-1', '--format=%s');
const qui = process.env.USERNAME || process.env.USER || '';
const texte = [
  `🚀 **Mise en ligne prod faite**${tag ? ` — ${tag}` : ''}${sha ? ` (${sha})` : ''}, depuis le PC de ${qui || '?'}`,
  sujet && `> ${sujet}`,
  extra,
  '👉 https://cardgamepriv.pages.dev/jeu/',
]
  .filter(Boolean)
  .join('\n');

if (process.argv.includes('--essai')) {
  console.log(texte);
  process.exit(0);
}
try {
  const cli = createRequire(import.meta.url).resolve('convex/bin/main.js');
  const r = spawnSync(process.execPath, [cli, 'run', 'discordBot:prevenirEquipe', JSON.stringify({ texte, sauf: qui })], { encoding: 'utf8' });
  console.log(`[prevenir-equipe] ${(r.stdout || '').trim()}${r.status ? ` (code ${r.status}) ${(r.stderr || '').trim().slice(-300)}` : ''}`);
} catch (e) {
  console.log(`[prevenir-equipe] non envoyé : ${e instanceof Error ? e.message : e}`);
}
process.exit(0);
